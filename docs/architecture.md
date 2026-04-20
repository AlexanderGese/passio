# Architecture overview

Passio is a monorepo of four surfaces plus shared code:

```
passio/
├── apps/
│   ├── desktop/        Tauri 2 shell (Rust core) + React HUD
│   ├── extension/      Chrome MV3 bridge
│   └── mobile/         React PWA (talks to sidecar over HTTP)
├── packages/
│   ├── shared/         Zod schemas + RpcMethods registry
│   ├── sidecar/        Bun-compiled single-binary sidecar (agent, tools, DB)
│   └── seed-cli/       passio-seed CLI
├── seeds/              Example Seeds (plugins)
└── docs/               (you are here)
```

## Runtime layers

```
  ┌──────────────────────────────┐
  │           HUD (React)         │   ← reads via Tauri IPC
  └────────────────▲──────────────┘
                   │ invoke() / listen()
  ┌────────────────┴──────────────┐
  │   Rust core (Tauri)            │   ← window, tray, hotkeys, scheduler,
  │   - sidecar.rs supervisor      │     os-keyring, gate (policy), icons
  │   - scheduler.rs cron loops    │
  │   - gate.rs per-host policy    │
  └────────────────▲──────────────┘
                   │ JSON-RPC 2.0 over stdin/stdout
  ┌────────────────┴──────────────┐
  │   Bun sidecar                  │   ← agent, tools, DB, AI SDK,
  │   - ai/ agent + sub-agents     │     Obsidian, seeds runtime,
  │   - tools/ every capability    │     HTTP /rpc bridge for mobile
  │   - db/ SQLite + vec + FTS5    │
  │   - seeds/ plugin runtime      │
  │   - bridge/ WS + HTTP          │
  └────────────────▲──────────────┘
                   │ WS (ext) / HTTP (mobile) / worker postMessage (seeds)
  ┌───────┬────────┴────────┬──────┐
  │ ext   │  mobile PWA     │ seeds│
  └───────┴─────────────────┴──────┘
```

## Key facts

- **Transport between Rust and sidecar:** newline-delimited JSON-RPC 2.0 over stdin/stdout. All RPC method names are centralized in `packages/shared/src/protocol.ts` (`RpcMethods` const).
- **Sidecar lifecycle:** supervised by the Rust core. Idle-kills after 90s; respawns on demand. `call()` retries once on `BrokenPipe`. Stdin close = clean shutdown.
- **Storage:** SQLite via `bun:sqlite` + `drizzle-orm` for typed CRUD, + `sqlite-vec` for vector search, + FTS5 for text. SQLCipher optional (key via keychain → `PASSIO_DB_CIPHER_KEY`).
- **LLM providers:** OpenAI via the Vercel AI SDK (`streamText`, `generateObject`). Models are tiered (`economy`/`standard`/`power`/`reasoning`) via env vars so each call picks its weight class. Usage is logged per call into `usage_log`.
- **Scheduler loops (Rust):** proactive scan (every N min) · weekly review (Sun 19:00) · morning briefing (08:00) · daily recap (20:00) · 30-min deadline radar · system snapshot 60s · distraction check 5min · Todo.md sync 15min · initiative pulse 15min · todo reminder 09:00 · nightly reflection 22:00 · sitting nudge 20min · unlock-triggered morning briefing.
- **Safety rails (gate):** per-host policy (observe_only / ask_first / full_auto) + per-site blocklist + countdown toast. Every agent tool call that mutates the browser goes through `withGate`.
- **Extension bridge:** WS on `127.0.0.1:31763` by default, token persisted under `~/.config/passio/bridge-token`. HTTP `/rpc` on same port for the mobile PWA, auth via `x-passio-token` header.
- **Seeds:** each enabled seed runs in a `Worker` with a capability-gated `passio` API proxied over postMessage. Manifest declares `permissions` + `contributes`. Tabs/widgets are Web Components loaded in a sandboxed iframe inside the HUD.

## Data directories

- `~/.config/passio/` — config root: `bridge-token`, `extension-pairing.json`, `secrets.env` (fallback), `seeds/<name>/` (installed seeds).
- Data dir (XDG data): SQLite DB, WAL, vector index.
- Cache dir: logs, session state.
- Vault: user-controlled path (Obsidian).

See `apps/desktop/src-tauri/src/paths.rs` for the exact resolution.
