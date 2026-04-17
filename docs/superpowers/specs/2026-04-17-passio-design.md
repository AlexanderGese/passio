# Passio — Design Specification

**Date:** 2026-04-17
**Status:** v1.0 (all locks green, implementation-ready)
**Owner:** @alexander.gese07
**Target host:** Kali GNU/Linux Rolling, XFCE 4.20 / Xfwm4 (X11), Ryzen 7 8840HS, 16 GB RAM

---

## 1. Vision

Passio is a **desktop AI assistant** embodied as a floating passionfruit mascot that lives always-on-top in a small chat bubble. Four defining traits:

1. **Agentic** — observes and acts autonomously in the browser via an extension; can click, type, navigate, summarize, fill forms.
2. **Proactive** — scans on a configurable 10–15 min interval, decides whether to nudge, act, or stay quiet.
3. **Deeply remembering** — a **Context Engine** (not just "memory") spans working/episodic/semantic/procedural memory, an Obsidian vault, a local file index, a knowledge graph, and full-text + vector search over all of it.
4. **Goal-driven** — built to pursue massive multi-year objectives (college admissions, startups, fitness, skills). Goals auto-decompose into milestones with deadlines; milestones drive daily tasks; proactive loop references goals.

And crucially — **light on the laptop.** Cold-by-default sidecar, ~35 MB idle RAM, modules lazy-loaded only when needed.

---

## 2. Top-level Architecture

```
┌────────────── Passio Desktop (Tauri 2) ──────────────┐
│                                                      │
│   HUD (React, bubble) ←IPC→ Rust Core                │
│   always-resident          · global hotkeys          │
│   ~15–25 MB                · system tray + tray icon │
│                            · scheduler (cron tick)   │
│                            · keychain (API keys)     │
│                            · local WS server         │
│                            · sidecar lifecycle       │
│                            ~15 MB                    │
│                                   │                  │
│                      spawn on demand │  kill @ 90s idle │
│                                   ▼                  │
│   Bun Sidecar (spawned on demand, dies when idle)    │
│   · AI SDK agent loop      · Context Engine API      │
│   · voice pipeline         · tool router             │
│   · consolidation worker   · goals service           │
│   ~80–150 MB while active, 0 MB idle                 │
└──────────────────────────────────────────┬───────────┘
                                           │ localhost WS (authed)
                                           ▼
                        ┌──────────────────────────────┐
                        │ Browser Extension (MV3)      │
                        │ Chrome + Firefox             │
                        │ · DOM observer / action exec │
                        │ · tab + history events       │
                        │ · content script on demand   │
                        └──────────────────────────────┘
```

### Process model

| Process | Runtime | Lifetime | Role |
|---|---|---|---|
| Tauri main | Rust | always | window, hotkeys, tray, scheduler, keychain, WS server, sidecar supervisor |
| HUD renderer | Chromium webview | always | tiny bubble UI (React/TS/Tailwind/shadcn) |
| Sidecar | Bun (compiled binary) | on-demand, dies after 90s idle | AI agent, Context Engine, voice, tools |
| Browser extension | Browser MV3 | with browser | DOM bridge, actions |

### Cold-by-default resource policy

- **Idle state** (no user activity, no scheduler tick): only Rust core + HUD bubble running. Target **≤ 40 MB RAM, ≤ 0.3 % CPU**.
- **Sidecar spawn** is triggered by: scheduler tick, hotkey press, extension WS message, explicit user action.
- **Sidecar shutdown:** graceful idle timeout (default 90 s, configurable 30 s – 10 min). Settings option "keep warm" for users who prefer snappier first response.
- **Lazy module loading inside sidecar:** dynamic imports for AI SDK, Whisper, Obsidian parser, PDF reader, vector index. Nothing loaded until first use. Vector index evicts from RAM after 5 min unused.
- **Cost:** first-task latency ~300 ms on cold spawn; subsequent tasks within the same session are instant.

### Communication

- **HUD ↔ Rust:** Tauri IPC (commands + events).
- **Rust ↔ Sidecar:** stdin/stdout JSON-RPC, plus shared rotating log file.
- **Sidecar ↔ Extension:** local WebSocket `127.0.0.1:<random port>` with per-session shared secret (token written to a file only the extension reads on first install, rotated on every passio restart).
- **All external:** HTTPS to OpenAI / Anthropic via Vercel AI SDK. No other outbound traffic. Zero telemetry.

---

## 3. Context Engine (★ core subsystem)

The Context Engine replaces "memory" — it is a unified, queryable, semantically-rich knowledge substrate that merges conversational memory, activity events, facts about the user, the user's Obsidian vault, the user's local files, and a knowledge graph over all of it.

### 3.1 Tiers

| Tier | Contents | Storage | Retention |
|---|---|---|---|
| **Working** | Current conversation turns (in-memory) | RAM | per-session |
| **Episodic** | Timestamped events: scans, clicks, chats, voice turns, clipboard, screenshots, page visits | SQLite `events` + vec + FTS5 | raw 30 d, summaries forever |
| **Semantic** | Long-lived facts about the user | SQLite `facts` + vec | forever |
| **Procedural** | Learned workflows / macros | SQLite `workflows` (JSON blob) | forever |
| **Vault** | Obsidian markdown vault (user-owned `.md`) | Filesystem (watched) + indexed in SQLite vec + FTS5 | user controls |
| **File index** | `~/Documents`, `~/code`, Downloads (configurable) — metadata + embeddings for text/PDF/code files | SQLite `files` + vec + FTS5 | sliding, file deletion removes index |
| **Goals** (see §4) | Long-horizon goals, milestones, reviews | SQLite `goals`, `milestones`, `goal_reviews` | forever unless user deletes |
| **Knowledge graph** | Entities (people, projects, topics, goals, sources) + typed edges between them | SQLite `entities`, `edges` | follows source data |
| **Conversations** | All chat history | SQLite `conversations`, `messages` | forever |

### 3.2 Schema (SQLite via `bun:sqlite` + `sqlite-vec` + FTS5)

```sql
-- === Events (episodic) ===
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  kind TEXT NOT NULL,              -- scan|chat|action|voice|clipboard|screenshot|page_visit
  content TEXT NOT NULL,            -- JSON payload
  summary TEXT,
  tags TEXT,
  importance INTEGER DEFAULT 0      -- 0–5; raw events ≥3 survive 30-day cleanup
);
CREATE INDEX idx_events_ts ON events(ts);
CREATE INDEX idx_events_kind ON events(kind);
CREATE VIRTUAL TABLE event_vec USING vec0(event_id INTEGER PRIMARY KEY, embedding FLOAT[1536]);
CREATE VIRTUAL TABLE event_fts USING fts5(summary, content, tags, content=events);

-- === Facts (semantic) ===
CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  kind TEXT NOT NULL,              -- preference|identity|context|relationship|skill
  subject TEXT,
  content TEXT NOT NULL,
  source TEXT,                     -- user_told|inferred|observed|vault|file
  confidence REAL DEFAULT 1.0,
  last_confirmed TIMESTAMP
);
CREATE VIRTUAL TABLE fact_vec USING vec0(fact_id INTEGER PRIMARY KEY, embedding FLOAT[1536]);
CREATE VIRTUAL TABLE fact_fts USING fts5(content, subject, content=facts);

-- === Todos ===
CREATE TABLE todos (
  id INTEGER PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  text TEXT NOT NULL,
  done BOOLEAN DEFAULT 0,
  due_at TIMESTAMP,
  priority INTEGER DEFAULT 0,
  project TEXT,
  goal_id INTEGER REFERENCES goals(id),
  milestone_id INTEGER REFERENCES milestones(id),
  completed_at TIMESTAMP
);

-- === Notes (passio-native quick notes) ===
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  title TEXT,
  body TEXT NOT NULL,
  tags TEXT,
  vault_path TEXT                  -- set if mirrored to Obsidian
);
CREATE VIRTUAL TABLE note_vec USING vec0(note_id INTEGER PRIMARY KEY, embedding FLOAT[1536]);
CREATE VIRTUAL TABLE note_fts USING fts5(title, body, tags, content=notes);

-- === Goals & milestones (see §4) ===
CREATE TABLE goals (
  id INTEGER PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  target_date DATE,
  status TEXT DEFAULT 'active',    -- active|paused|achieved|abandoned
  priority INTEGER DEFAULT 1,
  progress REAL DEFAULT 0.0,
  motivation TEXT,
  last_reviewed TIMESTAMP
);

CREATE TABLE milestones (
  id INTEGER PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending',   -- pending|in_progress|done|missed
  sort_order INTEGER DEFAULT 0,
  completed_at TIMESTAMP
);

CREATE TABLE goal_reviews (
  id INTEGER PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES goals(id),
  ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  kind TEXT NOT NULL,              -- weekly|monthly|ad-hoc|deadline-approaching
  summary TEXT NOT NULL,
  progress_delta REAL,
  blockers TEXT,
  next_actions TEXT
);

-- === Workflows (procedural) ===
CREATE TABLE workflows (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  trigger TEXT,
  steps TEXT NOT NULL,             -- JSON array of actions
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used TIMESTAMP,
  use_count INTEGER DEFAULT 0
);

-- === Obsidian vault mirror ===
CREATE TABLE vault_notes (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,       -- relative to vault root
  title TEXT,
  body TEXT NOT NULL,
  frontmatter TEXT,                -- JSON
  tags TEXT,
  wiki_links TEXT,                 -- JSON array of [[target]] strings
  mtime TIMESTAMP,
  indexed_at TIMESTAMP
);
CREATE VIRTUAL TABLE vault_vec USING vec0(vault_id INTEGER PRIMARY KEY, embedding FLOAT[1536]);
CREATE VIRTUAL TABLE vault_fts USING fts5(title, body, tags, path, content=vault_notes);

-- === Local file index ===
CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,       -- absolute path
  ext TEXT,
  bytes INTEGER,
  mtime TIMESTAMP,
  content_hash TEXT,
  summary TEXT,                    -- LLM-written for indexed files
  indexed_at TIMESTAMP
);
CREATE VIRTUAL TABLE file_vec USING vec0(file_id INTEGER PRIMARY KEY, embedding FLOAT[1536]);
CREATE VIRTUAL TABLE file_fts USING fts5(summary, path, content=files);

-- === Knowledge graph ===
CREATE TABLE entities (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,              -- person|project|topic|goal|source|place|tool|skill
  name TEXT NOT NULL,
  canonical_id TEXT,               -- optional external id (github user, domain, etc.)
  data TEXT,                       -- JSON attributes
  UNIQUE(kind, name)
);

CREATE TABLE edges (
  id INTEGER PRIMARY KEY,
  src_id INTEGER NOT NULL REFERENCES entities(id),
  dst_id INTEGER NOT NULL REFERENCES entities(id),
  relation TEXT NOT NULL,          -- mentions|blocks|supports|derived_from|working_on|attended|...
  weight REAL DEFAULT 1.0,
  source_ref TEXT,                 -- event/fact/note id that established this edge
  ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_edges_src ON edges(src_id);
CREATE INDEX idx_edges_dst ON edges(dst_id);
CREATE INDEX idx_edges_relation ON edges(relation);

-- === Conversations ===
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  mode TEXT                        -- text|voice|proactive
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id),
  ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  role TEXT NOT NULL,              -- user|assistant|tool
  content TEXT NOT NULL,
  tool_call TEXT                   -- JSON
);

-- === Habits, journal, mood, time blocks (analytics layer) ===
CREATE TABLE habits (id INTEGER PRIMARY KEY, name TEXT UNIQUE, target_per_week INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE habit_log (id INTEGER PRIMARY KEY, habit_id INTEGER REFERENCES habits(id), ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE journal_entries (id INTEGER PRIMARY KEY, ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP, prompt TEXT, body TEXT, mood INTEGER, energy INTEGER);
CREATE TABLE time_blocks (id INTEGER PRIMARY KEY, start_at TIMESTAMP, end_at TIMESTAMP, kind TEXT, label TEXT, goal_id INTEGER REFERENCES goals(id));
CREATE TABLE activity_log (id INTEGER PRIMARY KEY, ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP, app TEXT, window_title TEXT, duration_seconds INTEGER, classification TEXT);

-- === Flashcards (SM-2) ===
CREATE TABLE cards (
  id INTEGER PRIMARY KEY, deck TEXT, front TEXT, back TEXT,
  ef REAL DEFAULT 2.5, interval_days INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0, due_at TIMESTAMP,
  source_note_id INTEGER REFERENCES notes(id)
);

-- === Settings ===
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

SQLite is opened in WAL mode, small cache (4 MB), single writer, MMAP disabled by default. Connection opened only while sidecar is alive; closed cleanly on idle shutdown.

### 3.3 Retrieval — hybrid + graph-aware

Every agent turn and every proactive scan builds a **Context Packet** capped at ~8 K tokens:

1. **Always-included:**
   - top 15 facts by recency × confidence
   - active todos (priority ≥ 1 OR due within 24 h)
   - active goals with nearest milestone
   - current daily intent, current context pack
   - last 10 messages of current conversation

2. **Query-driven (hybrid search):** run three parallel queries against the current user message / tab summary:
   - **vector search** top-5 from each of: `fact_vec`, `event_vec`, `note_vec`, `vault_vec`, `file_vec`
   - **FTS5 search** top-5 from each `*_fts` table
   - merge + rerank via reciprocal rank fusion (RRF), take top 12 overall

3. **Graph expansion:** from the top retrieval hits, walk 1 hop in the knowledge graph to surface closely related entities (e.g., retrieving a fact about "SAT prep" pulls in the connected MIT goal + linked notes + recent events).

4. **Recent episodic compression:** last 1 h of events rolled into a 200-token situational summary (produced by a tiny gpt-4o-mini call, cached 5 min).

Overflow handling: older events progressively summarized, facts sorted by relevance until budget met.

### 3.4 Consolidation

Runs opportunistically when the sidecar is alive and idle (every ~6 h of wall clock OR on graceful shutdown):
- Cluster un-summarized episodic events by theme (keyword + vector similarity, DBSCAN-style).
- For each cluster, `economy` tier LLM writes a `fact` with `source='inferred'`.
- Emit knowledge-graph edges from mentions detected in facts.
- Drop raw events older than 30 days UNLESS `importance ≥ 3` or referenced by a fact.

### 3.5 Obsidian vault integration

- Vault path configured in first-run wizard (`~/Documents/ObsidianVault` default, autodetect attempted).
- **Passio-owned area:** `<vault>/passio/` subfolder — Passio writes notes here with YAML frontmatter (source, tags, linked_goal, created).
- **User's area:** everything else — Passio **reads** indexes and **never modifies** unless the user explicitly commands (`passio, update my "physics notes" to include X`).
- **File watcher** via `chokidar` (Bun has native inotify access). Incremental re-index only changed files.
- **Full parse:**
  - YAML frontmatter → `vault_notes.frontmatter` JSON
  - `#tags` → tags column
  - `[[wiki-links]]` → `wiki_links` JSON; each link becomes a KG edge
  - Dataview fields → captured into frontmatter
- **Daily notes:** if user uses Obsidian's Daily Notes plugin, Passio detects the format and appends its daily recap under a `## Passio recap` heading (only in today's daily note, never past ones).
- **Two-way chat-to-note:** any note saved via `note_save` can mirror to `<vault>/passio/`. User can turn off mirror in settings.

### 3.6 Local file index

- Default indexed roots: `~/Documents`, `~/Downloads`, `~/code` (each toggleable in settings).
- Default extensions: `.md .txt .pdf .py .ts .tsx .js .jsx .go .rs .c .cpp .h .hpp .java .kt .swift .rb .ex .html .css .json .yaml .toml`.
- Excluded by default: `node_modules/`, `.git/`, `dist/`, `build/`, `target/`, `__pycache__/`, `.venv/`, `*.lock`.
- **PDF ingestion:** `pdf-parse` extracts text; large PDFs chunked at 2 K tokens with overlap; each chunk embedded; summary LLM-written.
- Indexing runs as a background task only while sidecar is already alive (never keeps sidecar hot just for indexing). Initial full index throttled to 50 files/spawn so it doesn't dominate cold-boot cost.

### 3.7 Knowledge graph

Built by background consolidation + explicit tooling:
- Entities extracted from facts, notes, vault, and conversations via small-model NER.
- Edges emitted from co-occurrence, wiki-links, explicit user statements (`passio, note that Alice works at OpenAI`).
- Queryable via `graph_query(entity, depth?, relation_filter?)`.
- Visualized in Settings → Graph panel (force-directed, d3-style). Clicking a node shows all facts, notes, events, and pages linked to it.

### 3.8 Explicit memory / context commands

- "remember [X]" → insert fact, importance 3
- "forget [X]" → soft-delete matching facts (audit kept)
- "what do you know about [X]" → context packet query, full panel display
- "add [Y] to my todo list" / "what's on my list" / "mark Y done"
- "save this" (current tab) → screenshot + extraction + note + KG edges
- "index this folder" → add to file index
- "show me the graph for [X]" → open graph panel zoomed to X

### 3.9 Privacy & encryption

- **All data local** at `~/.config/passio/` (XDG). DB at `db.sqlite`, screenshots at `screenshots/`, logs at `logs/`.
- **Zero telemetry.** No phone-home of any kind. Only outbound traffic: the LLM API calls you authorize.
- **User-controlled data lifecycle:** Settings → Privacy has a "Purge now" button for events, screenshots, activity_log, each independently.
- **Screenshots:** default retention 7 days, options: 0 / 1 / 7 / 30 / forever.
- **Voice audio:** never persisted — streamed to Whisper then discarded.
- **SQLCipher encryption at rest:** OFF by default (you're on FDE), toggle in Settings → Privacy. Uses OS-keychain-derived key via Tauri's keyring plugin.

---

## 4. Goals & long-horizon planning (★ core feature)

Passio is designed for multi-year ambitions (*"Get into MIT by fall 2027"*, *"Launch a SaaS in 12 months"*, *"Learn Japanese to N2 in 18 months"*). Goals are a first-class subsystem.

### 4.1 Lifecycle

1. **Creation** — voice/chat/hotkey (`Super+Shift+G`). Invokes `goal_create(title, target_date, category?, motivation?)`.
2. **Auto-decomposition** — `power` tier (gpt-5 / o3) runs category-specific prompt to propose 5–12 milestones with reverse-engineered deadlines. Example categories with prebuilt prompts:
   - **Education / admissions** (SAT, ACT, essays, ECs, recs, applications, visas)
   - **Career / job hunt** (skills, portfolio, network, interviews)
   - **Health / fitness** (progressive plan, nutrition, recovery)
   - **Creative** (chapters/features/releases)
   - **Language** (CEFR / JLPT levels)
   - **Financial** (savings rate, income targets)
   - **Entrepreneurship** (validation, MVP, users, revenue, funding)
3. **User edits** — Goals panel: reorder, edit, remove, add milestones. All non-destructive.
4. **Execution** — milestones spawn todos (weekly/daily) as due date approaches. Todos link back via `goal_id`/`milestone_id`.
5. **Reviews:**
   - **Weekly** (Sun evening default) — per-active-goal review stored in `goal_reviews`.
   - **Monthly** — cumulative overview.
   - **Deadline-approaching** — auto at T-7 days for each milestone.
6. **Progress** — weighted average of milestone completion; displayed as ring.

### 4.2 Proactive integration

- Every 10/15-min scan includes top 3 active goals + nearest milestone in the context packet.
- If user is drifting (e.g., 25+ min on social without goal-related activity), a goal-anchored nudge fires: *"Your SAT is 52 days out and you haven't prepped this week — 15 min now?"*
- Nudge frequency ramps as deadlines approach; capped at 1 nudge/hour by default, configurable.
- Morning briefing leads with today's milestone-linked tasks.

### 4.3 Goals UI

- **Goals panel** (`Super+G`): cards with progress rings + days-to-deadline; color-coded (green/yellow/red) by on-pace.
- **Timeline view:** click a goal → horizontal timeline with milestone markers, current position, overdue items in red.
- **Weekly review card** shown automatically on Sunday evening.
- **New-goal quick capture** (`Super+Shift+G`).

---

## 5. AI Model Strategy

### 5.1 Tiered routing (OpenAI-first, per user preference)

| Tier | Default model | Use case |
|---|---|---|
| `economy` | `openai/gpt-4o-mini` | 10-15 min scans, consolidation summaries, classification |
| `standard` | `openai/gpt-4.1` | Chat, quick Q, memory retrieval reasoning |
| `power` | `openai/gpt-5` (fallback `openai/o3`) | Multi-step agent, goal decomposition, research |
| `stt` | `openai/whisper-1` | Voice → text (cloud in v1, local whisper.cpp in v2) |
| `tts` | `openai/tts-1-hd` | Text → voice |
| `embed` | `openai/text-embedding-3-small` | Vector indexing |
| **Claude fallback** | `anthropic/*` equivalents via AI Gateway | One-click provider flip |

User can override any tier in Settings → Models.

### 5.2 Cost governor

- Monthly soft cap (default $20). Warns at 80 %, auto-disables `power` at 100 % until user raises cap.
- Usage log per call (tokens, est. cost).
- Dashboard: Settings → Usage, daily/monthly spend per tier.

### 5.3 Estimated cost

At 10-min interval, 16 h/day: **$5–15/month** typical use, your own API key billed directly.

---

## 6. Core Behavior Loops

### 6.1 Proactive scan (scheduler)

- Rust core cron tick every N min (default 10, range 5–60).
- Tick triggers sidecar spawn (if cold) → fetch current tab state from extension → build context packet → `economy` tier decides `{nudge | act | quiet}` based on current mode.
- Mode options:
  - `check-in` — only suggests, never acts
  - `active-assist` — may invoke tools after 3 s countdown toast
  - `summary-decide` — summarizes and asks
- Output rendered as subtle bubble state / notification — no interrupting modal unless urgent.
- After action, sidecar idle timer starts.

### 6.2 Text chat

- `Super+Space` → input overlay → stream response via `standard` tier. Full tool access. Auto-saves to `conversations`/`messages`.

### 6.3 Voice (push-to-talk)

- Hold `Super+Alt` → record → on release, Whisper STT → agent → response streams as text (bubble) AND TTS audio (via lipsync avatar crossfade).
- Output modes configurable: text / voice / both.

### 6.4 Autonomous action

- Tool call → security validation (per-domain policy, blocklist) → extension WS → execute → log to `events` with full params.
- 3 s countdown toast with Esc-cancel before every autonomous action.
- Per-domain policy: `observe_only | ask_first | full_auto`, editable in Settings.
- Shell tool (feat 43) requires per-command approval first time; subsequent approvals remembered in an allowlist (toggleable).

---

## 7. Tool Catalog

### v1 tools (≈50)

**Browser / observation:**
`get_current_tab`, `get_all_tabs`, `click`, `type`, `navigate`, `new_tab`, `close_tab`, `scroll`, `extract`, `screenshot`, `summarize_page`, `explain_selection`, `save_page` (archive page content to notes)

**Context / memory:**
`memory_remember`, `memory_forget`, `memory_search`, `memory_browse`, `graph_query`, `graph_add_edge`

**Todos / notes / intent:**
`todo_add`, `todo_list`, `todo_done`, `note_save`, `note_search`, `set_intent`, `set_dnd`

**Goals:**
`goal_create`, `goal_list`, `goal_update`, `goal_decompose`, `goal_review`, `milestone_add`, `milestone_done`, `milestone_reschedule`

**Obsidian / vault:**
`vault_search`, `vault_read_note`, `vault_write_note` (passio/ subfolder only unless confirmed), `vault_list_tags`, `daily_note_append_recap`

**Local files:**
`file_index_add_root`, `file_search`, `file_read`, `file_summarize`, `pdf_ingest`

**System / productivity:**
`clipboard_read`, `clipboard_write`, `clipboard_history`, `translate_selection`, `rewrite_selection`, `focus_start` (pomodoro), `habit_log`, `journal_prompt`, `time_block_create`

**Learning:**
`flashcards_from_note`, `flashcards_review_due`

**Shell / dev (guarded):**
`shell_run` (approval-gated), `git_commit_msg`, `git_pr_description`, `code_qa` (search indexed repos)

**Input:**
`image_from_path`, `pdf_from_path`, `dictate_long` (extended PTT mode)

### v2 tools

`email_triage` (Gmail / IMAP), `research` (multi-step web research), `form_autofill`, `workflow_record`, `workflow_run`, `calendar_next`, `rss_fetch`, `sandbox_run_code` (Vercel Sandbox), `secrets_vault_get/put`

### v3 tools

`booking_flow`, `slack_send`, `discord_send`, `telegram_send`, `linear_*`, `notion_*`, `jira_*`, `multi_device_sync`, `screen_record`, `wake_word_enable`, `location_set`

---

## 8. Feature Catalog — all 61, phased

### v1 (ship target: 6–8 weeks)

Core shell & loop:
- Floating passionfruit bubble (idle + talking avatar states)
- System tray + global hotkeys + scheduler
- Proactive scan (10/15 min configurable, 3 modes)
- Push-to-talk voice (Whisper + TTS)
- Browser extension (Chrome + Firefox) with full DOM+action surface
- Provider switch (OpenAI ↔ Claude via AI Gateway)
- Full autonomous actions with countdown cancel
- **First-run wizard** (API keys → vault → first goal → context pack)

Memory / goals / tasks:
1. Long-term facts
2. Todo list
3. Quick notes
4. Daily intent
4b. **Goals & long-horizon planning** (auto-decompose, milestones, reviews)

Browser superpowers:
5. Tab cleanup (close dupes/stale)
8. Summarize page / video / PDF

Focus:
11. Focus mode / pomodoro
12. Distraction shield
13. Daily recap
14. Morning briefing
15. DND mode

Smart everyday:
16. Clipboard intelligence
17. Screenshot + ask
18. Rubber duck mode
19. Context packs (work/study/chill/custom)
22. "What's this?" hotkey

Knowledge & content:
29. **Obsidian vault integration** (two-way, non-destructive)
30. **Knowledge graph** (build + UI)
31. **Local file index** (~/Documents, ~/code, Downloads)
32. **PDF ingestion** (drag-drop or hotkey)
34. **Save-for-later** (archive pages locally)
35. **Auto-tagging** (semantic tags on all saved content)
36. **Citation tracking**

Personal analytics:
37. **Screen-time & activity analytics**
38. **Goal velocity charts**
39. **Mood & energy tracking**
40. **Habit tracker**
41. **Journal** (prompted nightly)
42. **Time-blocking**

Input & interaction:
48. **Drag-drop image** → ask
49. **Drag-drop PDF** → summarize + index
50. **Long-form dictation**
51. **Rewrite anywhere** (`Super+Shift+R`)
52. **Live translation** (`Super+Shift+L`)

Utility:
54. **Flashcards (SM-2)** from notes
55. **Learning tracker** (progressive topic teaching)
57. **Clipboard history**
60. **Hard focus block** (blocks sites during focus)

Developer extras (you're on Kali):
43. **Shell integration** (approval-gated)
44. **Terminal error helper** (reads qterminal output)
45. **Git integration** (commit msgs, PR descriptions)
46. **Codebase Q&A**
47. **Plugin/skill system** (user-authored tools in TS)

### v2 (post-launch)

6. Email triage (Gmail)
7. Research agent
9. Form autofill
20. Workflow macros (record/replay)
21. Calendar glance
33. RSS / feeds
53. Weather + news in morning briefing
56. Encrypted secrets vault
58. Sandbox code runner (Vercel Sandbox)
61. Location awareness
- Local whisper.cpp STT (offline)
- `o3` / `gpt-5` deeper reasoning paths

### v3 (ambitious)

10. Full task automation ("book me a flight…")
23. Slack / Discord / Telegram
24. Linear / Notion / Jira
25. Multi-device sync
26. Screen recording + narrate
27. Wake word
28. Multi-agent delegation
59. Notification hub

---

## 9. Keybinds (all rebindable)

| Action | Default | |
|---|---|---|
| Toggle bubble visibility | `Super+B` | (Super+P reserved by Xfce) |
| Quick text chat | `Super+Space` | |
| Push-to-talk (hold) | `Super+Alt` | |
| Explain selection | `Super+Shift+E` | |
| Save this page | `Super+Shift+S` | |
| Add todo (quick) | `Super+T` | |
| Open Goals panel | `Super+G` | |
| New goal (quick) | `Super+Shift+G` | |
| Force scan now | `Super+Shift+N` | |
| Toggle DND | `Super+D` | |
| Cycle context pack | `Super+M` | |
| Rewrite selection | `Super+Shift+R` | |
| Translate selection | `Super+Shift+L` | |
| Journal prompt | `Super+J` | |
| Flashcard review | `Super+F` | |
| Cancel current action | `Escape` | |

Tauri `global-shortcut` plugin on X11 (Xfwm4). Conflict check on startup via `xfconf-query` — warn if any collide.

---

## 10. Browser Extension

### Manifest (MV3)

- **Chrome-only in v1** (per user preference); Firefox support deferred to v1.5+.
- Permissions: `activeTab`, `tabs`, `scripting`, `storage`, `clipboardRead`, `clipboardWrite`, `contextMenus`.
- Host permissions: `<all_urls>` with Settings-configurable **allowlist mode** (default: all permitted, user can tighten).
- Background service worker keeps WS connection to Passio; reconnects on restart.

### Distribution

- **v1:** unpacked dev load + signed XPI for Firefox AMO self-hosting.
- **v2:** submit to Chrome Web Store + Firefox AMO.

### Message protocol

`{id, type: tool_call, name, params} ⇄ {id, ok, result | error}` over JSON WS. Per-session auth token rotated on each Passio launch; extension reads token from `~/.config/passio/extension-token` (chmod 600).

### On-demand content script

- Not injected by default. Agent requests context → background worker injects content script into the active tab → runs Readability + screenshot → returns → content script exits.
- Keeps idle memory of the extension near-zero.

---

## 11. Security & Privacy

- 100 % local data.
- Zero telemetry.
- Per-domain action policy (observe_only | ask_first | full_auto) — default `ask_first`.
- Blocklist for dangerous actions (banking forms, email send buttons) user-editable.
- Shell tool per-command approval with allowlist learning. Runs under `/bin/bash` for deterministic execution; integrates with **qterminal** (user's emulator) for the terminal error helper feature (feat 44) — parses visible output via xdotool/X11 selection when user requests.
- Audit log: every tool invocation stored in `events` with full params, never deleted.
- API keys in OS keychain via Tauri keyring plugin.
- Optional SQLCipher encryption (toggle).
- Voice audio never persisted; screenshots configurable retention (default 7 d).

---

## 12. UI & Avatar

### Bubble states

| State | Visual | Trigger |
|---|---|---|
| Idle | Idle passionfruit, 60×60, 70 % opacity | default |
| Listening | Avatar + pulsing halo | PTT held |
| Thinking | Subtle rotation / soft glow | agent working |
| Talking | Talking-state avatar (CSS crossfade); v2: lipsync sprite sheet | streaming response |
| Alert | Badge + gentle bounce | nudge available |

### Windows

- Click bubble → chat panel (320×480), docked to user-selected edge.
- Double-click → full window (800×600): chat + Context Engine browser + Goals + Settings.

### Dock position

Settings → UI: top-left, top-right, bottom-left, bottom-right (default), or pinned to any edge. Remembered per-monitor.

### Tray icon

Same passionfruit avatar as tray icon. Left-click = toggle bubble; right-click = context menu (Goals, Pause proactive, DND 1h, Settings, Quit).

---

## 13. Settings UI

Sections:
1. **General** — scan interval, default mode, startup, dock position
2. **Avatar** — style, opacity, size
3. **Keybinds** — full rebind UI with conflict detection
4. **Models** — per-tier overrides, provider switch
5. **API keys** — OpenAI, Anthropic (OS keychain-stored)
6. **Context Engine** — memory browser (facts/notes/events/todos), Knowledge Graph viewer, Obsidian vault path, file index roots
7. **Goals** — goal list, timeline, weekly reviews, category templates
8. **Usage** — cost dashboard + monthly cap
9. **Permissions** — per-domain action policy, shell allowlist, extension allowlist
10. **Context packs** — create/edit modes (work/study/chill/custom)
11. **Privacy** — screenshot/event retention, SQLCipher toggle, "Purge now" buttons
12. **Plugins** — user-authored tool modules (v1 scaffold, mostly v2 UX)

---

## 14. Tech Stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri 2 (Rust) |
| HUD frontend | React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Zustand |
| Rust crates | `tauri`, `tauri-plugin-global-shortcut`, `tauri-plugin-tray`, `tauri-plugin-keyring`, `tauri-plugin-log`, `tokio` |
| Sidecar runtime | **Bun** (compiled to single binary via `bun build --compile`) |
| Sidecar stack | TypeScript, Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/gateway`), **Drizzle ORM** + `bun:sqlite`, `sqlite-vec`, `zod`, `chokidar`, `pdf-parse`, `ws` |
| Sidecar packaging | `bun build --compile` → single native binary embedded in Tauri `resources/` (zero runtime deps on user machine) |
| Monorepo | **Bun workspaces** |
| Auto-update | `tauri-plugin-updater` (GitHub Releases, opt-in check on startup) |
| License | **MIT** |
| Voice | `openai` (whisper + tts); v2 `whisper.cpp` |
| Extension | WebExtension MV3, TypeScript, Vite, `webextension-polyfill`, `@mozilla/readability` |
| Tests | `bun test`, Vitest (UI), Playwright (e2e for extension) |
| Packaging | Tauri bundler → `.deb` + `.AppImage` for Linux (v1) |
| Linux deps at runtime | `libwebkit2gtk-4.1`, `libayatana-appindicator3`, `xdotool` (optional for X11 input) |

---

## 15. Development Phasing

### v1 (6–8 weeks)

- **Week 1** — monorepo bootstrap (Bun workspaces), Tauri shell, Rust core skeleton (hotkeys, tray, scheduler, keychain, WS server, **sidecar supervisor w/ auto-respawn max 3× in 60 s**), log rotation (`~/.config/passio/logs/passio.log`, 5× 10 MB), **dev mode** (`bun dev` hot-reloads HUD + watches sidecar + auto-restart on Rust change). HUD bubble rendering the passionfruit avatar. Cold-spawn Bun sidecar proven, bundled as compiled binary in Tauri resources.
- **Week 2** — Context Engine: SQLite schema + FTS5 + sqlite-vec, embedding worker, retrieval pipeline, facts/notes/todos/intent, memory browser UI.
- **Week 3** — Goals subsystem (create/decompose/milestones/reviews/progress), Goals panel UI. Obsidian vault indexing + file watcher. Daily note recap.
- **Week 4** — Browser extension (Chrome + Firefox), WS auth, action tool set, Readability extraction, screenshot capture. "Summarize page / Explain selection / Save this" flows.
- **Week 5** — Proactive scan scheduler, 3 modes, autonomous action countdown, context packs, DND, distraction shield, daily recap, morning briefing.
- **Week 6** — Voice pipeline (PTT + Whisper + TTS + lipsync), clipboard intelligence, clipboard history, screenshot+ask, drag-drop image/PDF, rewrite/translate hotkeys, long-form dictation.
- **Week 7** — Personal analytics (screen time, mood, habits, journal, time-blocking, goal velocity), knowledge graph UI, local file index + PDF ingestion, flashcards (SM-2), learning tracker, hard focus block, shell integration (approval-gated), terminal helper, git integration, codebase Q&A.
- **Week 8** — Plugin/skill scaffold, first-run wizard polish, settings UI complete, `.deb` + AppImage packaging, conflict-checked keybinds, final QA.

### v2 (2–3 months post-v1)

Email triage, research agent, form autofill, workflow macros, calendar glance, RSS, weather+news briefing, secrets vault, sandbox code runner, location awareness, local whisper.cpp, o3/gpt-5 paths.

### v3 (ambitious)

Full task automation, messaging integrations, project tool integrations, multi-device sync, screen recording, wake word, multi-agent.

---

## 16. Repository Structure

```
passio/
├── apps/
│   ├── desktop/               # Tauri app
│   │   ├── src-tauri/         # Rust core
│   │   └── src/               # React HUD (TS)
│   └── extension/             # Chrome + Firefox MV3
│       └── src/
├── packages/
│   ├── sidecar/               # Bun sidecar (AI, Context Engine, voice, tools)
│   │   └── src/
│   │       ├── agent/
│   │       ├── context/       # retrieval, consolidation, KG
│   │       ├── goals/
│   │       ├── vault/         # Obsidian integration
│   │       ├── files/         # local file index + PDF
│   │       ├── voice/
│   │       ├── tools/         # tool implementations
│   │       └── protocol/      # JSON-RPC + WS types
│   ├── shared/                # shared TS types across desktop/extension/sidecar
│   └── ui/                    # shared shadcn components
├── docs/
│   └── superpowers/specs/
│       └── 2026-04-17-passio-design.md
├── scripts/                   # dev / build / release scripts
├── bun.lockb
├── package.json               # root
├── pnpm-workspace.yaml → REPLACED by bun workspaces
└── README.md
```

---

## 17. First-Run Wizard

Launches on first start (or from Settings → "Re-run setup"):

1. **Welcome** — short intro, what Passio does, what stays local vs goes to LLM API.
2. **API keys** — paste OpenAI key (required); Anthropic key (optional, enables provider switch); test-call confirms. Stored in OS keychain.
3. **Obsidian vault** — autodetect common paths (`~/Documents/*Vault*`, `~/Obsidian`); else manual pick; "I don't use Obsidian" → skip.
4. **Local file index roots** — suggest `~/Documents`, `~/code`, `~/Downloads`; user toggles.
5. **First goal** — capture one goal with target date; auto-decompose and show result; user can accept/edit/skip.
6. **Context pack** — pick from Work / Study / Chill or create custom; sets initial mode.
7. **Keybinds** — show defaults, offer quick-rebind; conflict check with xfconf.
8. **Browser extension** — provide install links + walk through pairing (extension reads the session token).
9. **Proactive mode** — choose 10/15-min interval, mode (check-in / active-assist / summary-decide), DND hours.
10. **Done** — bubble appears, first little wave from Passio.

Entire wizard takes < 5 minutes if you have your API key ready.

---

## 18. Open Questions

1. ~~**Wayland global hotkeys**~~ — **resolved**: Xfce 4.20 / Xfwm4 (X11). Tauri global-shortcut works natively.
2. **CWS review delays** — Chrome Web Store review can take days per update. v1 ships unpacked + Firefox AMO self-hosted; v2 submit to CWS once stable.
3. **PTT for wayland in future** — if user migrates to Hyprland/sway/GNOME Wayland, will need compositor-specific portal integration (phase 2 concern).
4. **Screenshot capture on banking / restricted pages** — some sites block `captureVisibleTab`. Fallback: decline gracefully with a user-visible message rather than OS-level screenshot (privacy win).
5. **Plugin sandboxing** — v1 plugins run in the sidecar process (no sandbox). v2 considers `vm2` or a worker isolate for untrusted plugins. For v1, users only install plugins they authored or from trusted sources.
6. **Activity tracking privacy** — app/window-title logging (feat 37) is sensitive. Off by default; enabled only after explicit opt-in in first-run wizard or Settings.

---

## 19. Success Criteria (v1 launch)

- [ ] Idle RAM ≤ 40 MB, idle CPU ≤ 0.3 %.
- [ ] Peak RAM while actively thinking ≤ 400 MB.
- [ ] Cold sidecar spawn ≤ 400 ms; warm response ≤ 100 ms.
- [ ] Full voice loop (PTT → transcript → answer + TTS) ≤ 6 s on good network.
- [ ] Memory retrieval (hybrid) returns relevant hits in ≤ 300 ms for a 10 K-fact DB.
- [ ] Monthly cost ≤ $20 for typical use (your API bill).
- [ ] Create a goal, see auto-decomposed milestones within 30 s.
- [ ] Weekly goal reviews auto-generate every Sunday.
- [ ] Obsidian vault mirror round-trips (edit in Obsidian → visible to Passio within 5 s; Passio writes to `passio/` → visible in Obsidian).
- [ ] Zero telemetry confirmed via `tcpdump` — only LLM API calls when user-initiated.
- [ ] Full keybind rebind UI functional + conflict-checked.
- [ ] First-run wizard completes in < 5 min.
- [ ] `.deb` installs clean on Kali with `apt`; `.AppImage` runs portable.

---

## 20. Out of Scope (v1 explicit non-goals)

- Mobile app
- Cloud sync / multi-device (v3)
- Team / multi-user features
- macOS / Windows packaging (code kept portable, Linux ships first)
- Browsers other than Chrome/Firefox (Safari/Edge later)
- Custom model training
- On-device LLM inference (v2 Ollama evaluation)
- Wake word (v3)
- Screen recording (v3)

---

*End of spec — v1.0 implementation-ready. All decisions locked. Proceeding to implementation plan.*
