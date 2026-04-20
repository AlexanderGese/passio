import { useEffect, useState } from "react";

/**
 * Passio mobile PWA. Speaks to the desktop sidecar's HTTP bridge over
 * Tailscale/LAN. User sets the base URL + pairing token on first run
 * (persisted in localStorage). No native wrapper — this is just a PWA
 * installable to home screen.
 */

type Config = { base: string; token: string };

function loadConfig(): Config | null {
  try {
    const raw = localStorage.getItem("passio.config");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.base === "string" && typeof parsed.token === "string") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function rpc<T = unknown>(cfg: Config, method: string, params: unknown = {}): Promise<T> {
  const res = await fetch(`${cfg.base.replace(/\/$/, "")}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-passio-token": cfg.token },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? "rpc error");
  return body.result as T;
}

export function App() {
  const [cfg, setCfg] = useState<Config | null>(loadConfig());
  const [base, setBase] = useState(cfg?.base ?? "");
  const [token, setToken] = useState(cfg?.token ?? "");
  const [tab, setTab] = useState<"chat" | "todos" | "brief">("chat");

  if (!cfg) {
    return (
      <div style={{ padding: 24, maxWidth: 420, margin: "auto" }}>
        <h1 style={{ color: "#ff6b9d" }}>Passio mobile</h1>
        <p style={{ color: "#aaa", fontSize: 14 }}>
          Paste your desktop's bridge URL + token (reachable over Tailscale
          or your LAN).
        </p>
        <input
          placeholder="http://100.64.0.1:31764"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          style={{ width: "100%", padding: 10, margin: "8px 0" }}
        />
        <input
          placeholder="pairing token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ width: "100%", padding: 10, margin: "8px 0" }}
        />
        <button
          onClick={() => {
            const c = { base: base.trim(), token: token.trim() };
            localStorage.setItem("passio.config", JSON.stringify(c));
            setCfg(c);
          }}
          style={{ width: "100%", padding: 10, background: "#a855f7", color: "white", border: 0, borderRadius: 6 }}
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <nav style={{ display: "flex", borderBottom: "1px solid #333" }}>
        {(["chat", "todos", "brief"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: 12,
              background: tab === t ? "#241B30" : "transparent",
              color: tab === t ? "#ff6b9d" : "#aaa",
              border: 0,
              borderBottom: tab === t ? "2px solid #a855f7" : "none",
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "chat" && <Chat cfg={cfg} />}
        {tab === "todos" && <Todos cfg={cfg} />}
        {tab === "brief" && <Brief cfg={cfg} />}
      </div>
    </div>
  );
}

function Chat({ cfg }: { cfg: Config }) {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState<string>("");

  async function send() {
    if (!draft.trim() || busy) return;
    const user = draft.trim();
    setMessages((m) => [...m, { role: "user", text: user }]);
    setDraft("");
    setBusy(true);
    setStreaming("");
    try {
      const res = await fetch(`${cfg.base.replace(/\/$/, "")}/stream/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-passio-token": cfg.token },
        body: JSON.stringify({ prompt: user }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (data.delta) {
              acc += data.delta;
              setStreaming(acc);
            } else if (data.done) {
              const final = data.text ?? acc;
              setMessages((m) => [...m, { role: "assistant", text: final }]);
              setStreaming("");
            }
          } catch {
            /* skip malformed */
          }
        }
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "system", text: `⚠ ${(e as Error).message}` },
      ]);
      setStreaming("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              margin: "8px 0",
              background: m.role === "user" ? "#7D3AB8" : "#241B30",
              padding: "8px 12px",
              borderRadius: 12,
              textAlign: m.role === "user" ? "right" : "left",
              marginLeft: m.role === "user" ? 40 : 0,
              marginRight: m.role === "user" ? 0 : 40,
              whiteSpace: "pre-wrap",
            }}
          >
            {m.text}
          </div>
        ))}
        {streaming && (
          <div
            style={{
              margin: "8px 0",
              background: "#241B30",
              padding: "8px 12px",
              borderRadius: 12,
              marginRight: 40,
              opacity: 0.85,
              whiteSpace: "pre-wrap",
            }}
          >
            {streaming}
            <span style={{ opacity: 0.4 }}>▍</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", padding: 8, gap: 8, borderTop: "1px solid #333" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask Passio…"
          style={{ flex: 1, padding: 10, background: "#241B30", color: "white", border: 0, borderRadius: 8 }}
        />
        <button
          onClick={send}
          disabled={busy || !draft.trim()}
          style={{ padding: "10px 16px", background: "#a855f7", color: "white", border: 0, borderRadius: 8 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function Todos({ cfg }: { cfg: Config }) {
  const [todos, setTodos] = useState<Array<{ id: number; text: string; done: boolean; priority: number }>>([]);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    void refresh();
  }, []);
  async function refresh() {
    try {
      const r = await rpc<{ todos: typeof todos }>(cfg, "passio.todo.list", { filter: "open" });
      setTodos(r.todos);
    } catch {
      /* silent */
    }
  }
  async function add() {
    if (!draft.trim()) return;
    await rpc(cfg, "passio.todo.add", { text: draft.trim() });
    setDraft("");
    void refresh();
  }
  async function done(id: number) {
    await rpc(cfg, "passio.todo.done", { id });
    void refresh();
  }
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add…"
          style={{ flex: 1, padding: 10, background: "#241B30", color: "white", border: 0, borderRadius: 8 }}
        />
        <button
          onClick={add}
          style={{ padding: "10px 16px", background: "#a855f7", color: "white", border: 0, borderRadius: 8 }}
        >
          +
        </button>
      </div>
      {todos.map((t) => (
        <div
          key={t.id}
          style={{
            display: "flex",
            gap: 10,
            padding: 10,
            background: "#241B30",
            marginBottom: 6,
            borderRadius: 8,
            alignItems: "center",
          }}
        >
          <button
            onClick={() => done(t.id)}
            style={{ width: 20, height: 20, borderRadius: 4, background: t.done ? "#a855f7" : "#1A1422", border: "1px solid #a855f7" }}
          />
          <span style={{ flex: 1 }}>{t.text}</span>
          {t.priority > 0 && <span style={{ fontSize: 12, color: "#ff6b9d" }}>P{t.priority}</span>}
        </div>
      ))}
    </div>
  );
}

function Brief({ cfg }: { cfg: Config }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    rpc<{ briefing: string }>(cfg, "passio.morningBriefing")
      .then((r) => setText(r.briefing))
      .catch((e) => setText(`⚠ ${(e as Error).message}`));
  }, []);
  return (
    <div style={{ padding: 16, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
      {text ?? "Loading…"}
    </div>
  );
}
