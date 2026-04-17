//! Scheduler ticks: proactive scan (every N minutes) and weekly review
//! (Sunday 19:00 local). Uses Tauri's async runtime so the loops run
//! inside the app executor.

use crate::sidecar::Sidecar;
use chrono::{Datelike, Local, TimeZone, Timelike, Weekday};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tauri::async_runtime::{self, Mutex};

#[derive(Clone)]
pub struct Scheduler {
    sidecar: Sidecar,
    interval_min: Arc<Mutex<u64>>,
}

impl Scheduler {
    pub fn new(sidecar: Sidecar, interval_min: u64) -> Self {
        Self {
            sidecar,
            interval_min: Arc::new(Mutex::new(interval_min.max(5))),
        }
    }

    pub fn spawn(&self) {
        // Proactive scan loop
        let sidecar = self.sidecar.clone();
        let interval_min = self.interval_min.clone();
        async_runtime::spawn(async move {
            loop {
                let mins = *interval_min.lock().await;
                tokio::time::sleep(Duration::from_secs(mins * 60)).await;
                tracing::info!("scheduler tick: proactive scan");
                match sidecar.call("passio.scan", json!({ "reason": "cron" })).await {
                    Ok(v) => tracing::debug!(result = ?v, "scan returned"),
                    Err(e) => tracing::warn!(error = %e, "scan failed"),
                }
            }
        });

        // Sunday 19:00 weekly review loop
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            loop {
                let wait = seconds_until_next_sunday_19();
                tokio::time::sleep(Duration::from_secs(wait.max(60))).await;
                tracing::info!("scheduler tick: weekly review");
                if let Err(e) = run_weekly_reviews(&sidecar).await {
                    tracing::warn!(error = %e, "weekly review failed");
                }
                tokio::time::sleep(Duration::from_secs(120)).await;
            }
        });

        // Daily morning briefing (08:00 local)
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            loop {
                let wait = seconds_until_next_local_hour(8);
                tokio::time::sleep(Duration::from_secs(wait.max(60))).await;
                tracing::info!("scheduler tick: morning briefing");
                if let Err(e) = sidecar.call("passio.morningBriefing", json!({})).await {
                    tracing::warn!(error = %e, "morning briefing failed");
                }
                tokio::time::sleep(Duration::from_secs(120)).await;
            }
        });

        // Daily recap (20:00 local)
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            loop {
                let wait = seconds_until_next_local_hour(20);
                tokio::time::sleep(Duration::from_secs(wait.max(60))).await;
                tracing::info!("scheduler tick: daily recap");
                if let Err(e) = sidecar.call("passio.dailyRecap", json!({})).await {
                    tracing::warn!(error = %e, "daily recap failed");
                }
                tokio::time::sleep(Duration::from_secs(120)).await;
            }
        });
    }

    pub async fn set_interval_minutes(&self, m: u64) {
        *self.interval_min.lock().await = m.max(5);
    }
}

fn seconds_until_next_local_hour(hour: u32) -> u64 {
    let now = Local::now();
    let today_target = Local
        .with_ymd_and_hms(now.year(), now.month(), now.day(), hour, 0, 0)
        .single();
    let target = match today_target {
        Some(t) if t > now => t,
        _ => now + chrono::Duration::days(1) - chrono::Duration::hours(now.hour() as i64)
            + chrono::Duration::hours(hour as i64),
    };
    let diff = (target - now).num_seconds().max(60);
    diff as u64
}

fn seconds_until_next_sunday_19() -> u64 {
    let now = Local::now();
    let today_target = Local
        .with_ymd_and_hms(now.year(), now.month(), now.day(), 19, 0, 0)
        .single();
    let weekday = now.weekday();
    let days_ahead: i64 = if weekday == Weekday::Sun {
        // If it's Sunday and we're before 19:00, aim for today; otherwise next Sunday.
        if let Some(t) = today_target {
            if t > now {
                0
            } else {
                7
            }
        } else {
            7
        }
    } else {
        let from_monday = (weekday.num_days_from_monday() as i64 + 7 - 6) % 7;
        (6 - (weekday.num_days_from_monday() as i64)).rem_euclid(7) + if from_monday == 0 { 0 } else { 0 }
    };
    let target = now
        .date_naive()
        .checked_add_signed(chrono::Duration::days(days_ahead))
        .and_then(|d| Local.from_local_datetime(&d.and_hms_opt(19, 0, 0)?).single())
        .unwrap_or(now + chrono::Duration::days(7));
    let diff = (target - now).num_seconds().max(60);
    diff as u64
}

async fn run_weekly_reviews(sidecar: &Sidecar) -> anyhow::Result<()> {
    let listed = sidecar
        .call("passio.goal.list", json!({ "status": "active" }))
        .await?;
    let Some(goals_array) = listed.get("goals").and_then(|v| v.as_array()) else {
        return Ok(());
    };
    for g in goals_array {
        let Some(id) = g.get("id").and_then(Value::as_i64) else {
            continue;
        };
        if let Err(e) = sidecar
            .call("passio.goal.review", json!({ "id": id, "kind": "weekly" }))
            .await
        {
            tracing::warn!(goal_id = id, error = %e, "goal review failed");
        }
    }
    Ok(())
}
