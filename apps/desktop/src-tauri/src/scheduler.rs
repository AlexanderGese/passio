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

        // Deadline radar — every 30 min, flag milestones due in the next
        // 48h. The sidecar handler emits a bubble_state alert when a hit
        // is found, so the HUD surfaces it as a speech bubble.
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            // small initial delay so we don't fire during startup burst
            tokio::time::sleep(Duration::from_secs(60)).await;
            loop {
                tracing::debug!("scheduler tick: deadline radar");
                if let Err(e) = sidecar.call("passio.radar.check", json!({})).await {
                    tracing::debug!(error = %e, "radar check failed (usually: no key / no goals)");
                }
                tokio::time::sleep(Duration::from_secs(30 * 60)).await;
            }
        });

        // Daily todo reminder @ 09:00 local + opportunistic Todo.md sync.
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            // sync once at startup so the file reflects DB truth
            tokio::time::sleep(Duration::from_secs(30)).await;
            let _ = sidecar.call("passio.todoMd.sync", json!({})).await;
            loop {
                let wait = seconds_until_next_local_hour(9);
                tokio::time::sleep(Duration::from_secs(wait.max(60))).await;
                tracing::info!("scheduler tick: daily todo reminder");
                if let Err(e) = sidecar.call("passio.todos.topToday", json!({})).await {
                    tracing::warn!(error = %e, "todos topToday failed");
                }
                let _ = sidecar.call("passio.todoMd.sync", json!({})).await;
                tokio::time::sleep(Duration::from_secs(120)).await;
            }
        });

        // Ambient activity tracker — every 60s snapshot top procs +
        // active window and log to activity_log.
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(45)).await;
            loop {
                if let Err(e) = sidecar.call("passio.system.snapshot", json!({})).await {
                    tracing::debug!(error = %e, "system snapshot skipped");
                }
                tokio::time::sleep(Duration::from_secs(60)).await;
            }
        });

        // Initiative pulse — every 15 min, LLM decides if Passio has
        // something worth saying without being asked. Biased to silence.
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(300)).await;
            loop {
                let _ = sidecar.call("passio.initiative.pulse", json!({})).await;
                tokio::time::sleep(Duration::from_secs(15 * 60)).await;
            }
        });

        // Distraction check — every 5 min, nudge if the user has been
        // on distracting apps for 25+ consecutive minutes.
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(180)).await;
            loop {
                let _ = sidecar
                    .call("passio.system.distractionCheck", json!({}))
                    .await;
                tokio::time::sleep(Duration::from_secs(5 * 60)).await;
            }
        });

        // Passive Todo.md re-sync every 15 min — picks up markdown edits
        // made in Obsidian / Notion / any editor.
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(90)).await;
            loop {
                if let Err(e) = sidecar.call("passio.todoMd.sync", json!({})).await {
                    tracing::debug!(error = %e, "todoMd sync skipped");
                }
                tokio::time::sleep(Duration::from_secs(15 * 60)).await;
            }
        });

        // Budget check — every hour, trigger bubble alert if crossed.
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(300)).await;
            loop {
                let _ = sidecar.call("passio.cost.budget.check", json!({})).await;
                tokio::time::sleep(Duration::from_secs(3600)).await;
            }
        });

        // Nightly reflection @ 22:00 local.
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            loop {
                let wait = seconds_until_next_local_hour(22);
                tokio::time::sleep(Duration::from_secs(wait.max(60))).await;
                tracing::info!("scheduler tick: nightly reflection");
                if let Err(e) = sidecar.call("passio.reflection.run", json!({})).await {
                    tracing::warn!(error = %e, "reflection run failed");
                }
                tokio::time::sleep(Duration::from_secs(120)).await;
            }
        });

        // Sitting nudge — every 20 min, remind to stretch if >90 min straight.
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(600)).await;
            loop {
                let _ = sidecar.call("passio.system.sittingNudge", json!({})).await;
                tokio::time::sleep(Duration::from_secs(20 * 60)).await;
            }
        });

        // Unlock / morning briefing — poll every 60s for a locked→unlocked
        // transition; if it happens before 10:00, speak today's plan.
        let sidecar = self.sidecar.clone();
        async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(30)).await;
            loop {
                if let Ok(v) = sidecar.call("passio.system.unlockCheck", json!({})).await {
                    let first = v.get("firstSinceLock").and_then(|x| x.as_bool()).unwrap_or(false);
                    if first {
                        let hour = Local::now().hour();
                        if hour < 10 {
                            tracing::info!("unlock-triggered morning briefing");
                            if let Err(e) = sidecar.call("passio.morningBriefing", json!({})).await {
                                tracing::debug!(error = %e, "unlock briefing skipped");
                            }
                        }
                    }
                }
                tokio::time::sleep(Duration::from_secs(60)).await;
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
