//! Sidecar supervisor: spawn the Bun sidecar on demand, speak JSON-RPC on
//! stdio, idle-kill after a timeout, auto-respawn on crash (max 3x / 60s).

use crate::paths::{load_secrets, PassioPaths};
use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex as AsyncMutex};
use tokio::task::JoinHandle;

const RPC_TIMEOUT: Duration = Duration::from_secs(30);
const RESPAWN_WINDOW: Duration = Duration::from_secs(60);
const MAX_RESPAWNS: usize = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcResponse {
    pub jsonrpc: String,
    pub id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcNotification {
    pub jsonrpc: String,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

/// Event emitted by the supervisor for the Tauri app to forward to the HUD.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SidecarEvent {
    Log { level: String, message: String },
    BubbleState(Value),
    Crash { reason: String },
    SpawnFailed { reason: String },
}

pub type EventSink = Arc<dyn Fn(SidecarEvent) + Send + Sync>;

struct Inner {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    pending: HashMap<u64, oneshot::Sender<RpcResponse>>,
    next_id: u64,
    reader_handle: Option<JoinHandle<()>>,
    recent_starts: VecDeque<Instant>,
}

#[derive(Clone)]
pub struct Sidecar {
    bin_path: PathBuf,
    inner: Arc<AsyncMutex<Inner>>,
    events: EventSink,
    pending_shared: Arc<Mutex<HashMap<u64, oneshot::Sender<RpcResponse>>>>,
}

impl Sidecar {
    pub fn new(bin_path: PathBuf, events: EventSink) -> Self {
        Self {
            bin_path,
            events,
            inner: Arc::new(AsyncMutex::new(Inner {
                child: None,
                stdin: None,
                pending: HashMap::new(),
                next_id: 1,
                reader_handle: None,
                recent_starts: VecDeque::new(),
            })),
            pending_shared: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Ensure the sidecar is running; start it if cold. Returns Ok when
    /// the process is spawned and stdin is available.
    pub async fn ensure_running(&self) -> Result<()> {
        let mut guard = self.inner.lock().await;
        if guard.child.is_some() {
            return Ok(());
        }

        // Enforce respawn rate-limit
        let now = Instant::now();
        guard.recent_starts.retain(|t| now.duration_since(*t) < RESPAWN_WINDOW);
        if guard.recent_starts.len() >= MAX_RESPAWNS {
            let reason = format!("respawn limit hit ({} in 60s)", MAX_RESPAWNS);
            (self.events)(SidecarEvent::SpawnFailed { reason: reason.clone() });
            return Err(anyhow!(reason));
        }
        guard.recent_starts.push_back(now);

        if !self.bin_path.exists() {
            let reason = format!("sidecar binary not found at {}", self.bin_path.display());
            (self.events)(SidecarEvent::SpawnFailed { reason: reason.clone() });
            return Err(anyhow!(reason));
        }

        tracing::info!(path = %self.bin_path.display(), "spawning sidecar");
        let mut cmd = Command::new(&self.bin_path);
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        // If a vec0.so sits next to the sidecar binary, tell the child where
        // to load it from (bun --compile cannot embed native .so files).
        if let Some(parent) = self.bin_path.parent() {
            let vec_path = parent.join("vec0.so");
            if vec_path.exists() {
                cmd.env("PASSIO_VEC_SO", &vec_path);
            } else if std::env::var_os("PASSIO_VEC_SO").is_none() {
                tracing::warn!(
                    "vec0.so not found near sidecar binary; vector search disabled"
                );
            }
        }

        // Pass through OPENAI keys (keychain integration arrives in the
        // first-run wizard plan). Prefer PASSIO_* to avoid colliding with
        // the user's shell env for unrelated OpenAI tooling.
        for key in ["PASSIO_OPENAI_API_KEY", "OPENAI_API_KEY", "PASSIO_MODEL_STANDARD"] {
            if let Ok(val) = std::env::var(key) {
                cmd.env(key, val);
            }
        }

        // Temporary secrets.env loader — reloaded on every spawn so editing
        // the file takes effect at the next sidecar cold-start without
        // restarting the Tauri app.
        if let Ok(paths) = PassioPaths::resolve() {
            let secrets_path = paths.secrets_file();
            let secrets = load_secrets(&secrets_path);
            if !secrets.is_empty() {
                tracing::info!(path = %secrets_path.display(), count = secrets.len(), "loaded secrets.env");
            }
            for (k, v) in secrets {
                cmd.env(k, v);
            }
        }

        let mut child = cmd.spawn().context("spawn sidecar")?;

        let stdin = child.stdin.take().ok_or_else(|| anyhow!("no stdin"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow!("no stdout"))?;
        let stderr = child.stderr.take().ok_or_else(|| anyhow!("no stderr"))?;

        let events = self.events.clone();
        let pending = self.pending_shared.clone();
        let reader = tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                handle_line(&line, &pending, &events);
            }
            tracing::info!("sidecar stdout closed");
        });

        // Tee stderr into tracing so Rust logs capture Bun panics.
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                tracing::warn!(target: "sidecar", "{line}");
            }
        });

        guard.stdin = Some(stdin);
        guard.child = Some(child);
        guard.reader_handle = Some(reader);
        Ok(())
    }

    /// Send a request and await its response.
    pub async fn call(&self, method: &str, params: Value) -> Result<Value> {
        self.ensure_running().await?;
        let (tx, rx) = oneshot::channel();
        let id = {
            let mut guard = self.inner.lock().await;
            let id = guard.next_id;
            guard.next_id += 1;
            drop(guard);
            self.pending_shared.lock().insert(id, tx);
            id
        };
        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let payload = format!("{req}\n");
        {
            let mut guard = self.inner.lock().await;
            let stdin = guard.stdin.as_mut().ok_or_else(|| anyhow!("no sidecar stdin"))?;
            stdin.write_all(payload.as_bytes()).await?;
            stdin.flush().await?;
        }

        match tokio::time::timeout(RPC_TIMEOUT, rx).await {
            Ok(Ok(resp)) => {
                if let Some(err) = resp.error {
                    Err(anyhow!("rpc error {}: {}", err.code, err.message))
                } else {
                    Ok(resp.result.unwrap_or(Value::Null))
                }
            }
            Ok(Err(_)) => Err(anyhow!("rpc channel dropped")),
            Err(_) => {
                self.pending_shared.lock().remove(&id);
                Err(anyhow!("rpc timeout"))
            }
        }
    }

    /// Send a `passio.shutdown` and wait for the process to exit.
    pub async fn shutdown(&self) -> Result<()> {
        let _ = self.call("passio.shutdown", json!({})).await;
        let mut guard = self.inner.lock().await;
        if let Some(mut child) = guard.child.take() {
            let _ = child.wait().await;
        }
        guard.stdin = None;
        if let Some(h) = guard.reader_handle.take() {
            h.abort();
        }
        Ok(())
    }
}

fn handle_line(
    line: &str,
    pending: &Arc<Mutex<HashMap<u64, oneshot::Sender<RpcResponse>>>>,
    events: &EventSink,
) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }

    // Try response first
    if let Ok(resp) = serde_json::from_str::<RpcResponse>(trimmed) {
        if let Some(id) = resp.id.as_u64() {
            if let Some(tx) = pending.lock().remove(&id) {
                let _ = tx.send(resp);
                return;
            }
        }
    }

    // Else treat as a notification
    if let Ok(notif) = serde_json::from_str::<RpcNotification>(trimmed) {
        dispatch_notification(notif, events);
        return;
    }

    tracing::warn!(target: "sidecar", "unparsable line: {trimmed}");
}

fn dispatch_notification(notif: RpcNotification, events: &EventSink) {
    match notif.method.as_str() {
        "passio.log" => {
            if let Some(params) = notif.params {
                let level = params
                    .get("level")
                    .and_then(|v| v.as_str())
                    .unwrap_or("info")
                    .to_string();
                let message = params
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                tracing::info!(target: "sidecar", level=%level, "{message}");
                events(SidecarEvent::Log { level, message });
            }
        }
        "passio.bubbleState" => {
            if let Some(params) = notif.params {
                events(SidecarEvent::BubbleState(params));
            }
        }
        other => {
            tracing::debug!(target: "sidecar", "unhandled notification: {other}");
        }
    }
}
