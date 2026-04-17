# Passio W9 — Safety Rails (v2.0 Phase A)

**Date:** 2026-04-17
**Status:** Draft → Ready for implementation
**Spec version:** 1.0
**Depends on:** v1.0.0-alpha (tag `v1.0.0-alpha`, commit `2cb6cd2`)

---

## 1. Goal

Gate every mutating browser action behind a per-hostname policy + a user-cancellable countdown, with a universal selector blocklist that forces confirmation on dangerous actions (form submits, "Send" buttons, payment triggers) regardless of the domain's policy.

This unblocks all subsequent v2 work that performs autonomous actions — the scanner's `act` decision path, the Gmail integration (W10), the full task-automation flows (W15) — by giving the user a hard, Esc-cancellable veto.

## 2. Scope

### In

- Per-hostname policy (`observe_only` / `ask_first` / `full_auto`), default `full_auto`.
- Universal dangerous-actions blocklist (CSS-selector regex). A hit forces `ask_first` even on `full_auto` domains.
- Configurable countdown (1–10s slider, default 3s) with Esc-cancel + "Allow now" + "Always allow this site".
- Gate applied to the 6 **mutating** browser tools: `click`, `type`, `navigate`, `new_tab`, `close_tab`, `scroll`. Reads (`get_current_tab`, `get_all_tabs`, `extract`, `screenshot`) skip the gate.
- Scanner's `decision: "act"` path actually dispatches the proposed tool call through the gate (previously left unexecuted).
- Permissions section in Settings: domain list with per-row dropdown + delete, countdown slider, blocklist editor (preloaded with sensible defaults).

### Out

- Per-path policies (covered by spec but deferred for YAGNI — hostname-only in v1 of this subsystem).
- Policy sync across machines (Passio is local-only).
- Hard site-blocking (that's a separate W13 focus feature).

## 3. Design decisions (locked)

| ID | Decision |
|---|---|
| D1 | Guard only mutating browser tools. |
| D2 | Per-hostname granularity. |
| D3 | Default policy: `full_auto`. |
| D4 | Countdown is user-configurable 1–10s, default 3s. |
| D5 | Dangerous-actions blocklist ships in W9, preloaded with defaults. |
| D6 | Gate lives in the sidecar tool wrappers (approach 1). Catches scan/chat/RPC paths equally. |

## 4. Components & data flow

```
 scanner  chat LLM tool  direct RPC
    \        |              /
     \       |             /
      ▼      ▼            ▼
     ┌──────────────────────┐
     │  withGate(tool,args) │   — policy + blocklist lookup
     └──────┬───────────────┘
            │ observe_only → throw "observe_only: <domain>"
            │ full_auto & no blocklist → proceed directly
            │ ask_first / blocklist hit → ↓
            ▼
     ┌──────────────────────┐      notification      ┌─────────────────┐
     │  gate pending-map    │ ────────────────────▶ │ Rust core       │
     │  (sidecar)           │ passio.gate.request   │ • start timer   │
     │  Promise<bool>       │                       │ • emit event    │
     └──────┬───────────────┘                       └─────────┬───────┘
            │                                                 │
            │                    passio.gate.resolve          │ passio://gate
            │       (Rust → sidecar RPC call)                 ▼
            │                                          ┌─────────────────┐
            ▼                                          │ HUD countdown   │
      resolve Promise                                  │ Esc / allow /   │
                                                       │ always-allow    │
                                                       └─────────────────┘
```

## 5. Data model

### `settings` KV rows (existing table)

| key | value (JSON) |
|---|---|
| `browser_policy` | `{ "mail.google.com": "observe_only", "github.com": "full_auto" }` — hostname → policy |
| `countdown_seconds` | `3` |
| `action_blocklist` | `[{ "kind": "selector", "pattern": "button\\[type=submit\\]", "reason": "form submit" }, { "kind": "url_contains", "pattern": "/checkout", "reason": "checkout flow" }]` |

Defaults for `action_blocklist` on fresh install:
- `button[type=submit]` — form submit
- `input[type=submit]` — form submit
- `button[aria-label*="send" i]` — "send" buttons (email, chat)
- `a[href*="checkout" i]`, `a[href*="logout" i]` — checkout / logout links (applied to `navigate` URL too)
- `a[href*="unsubscribe" i]` — destructive unsubscribe flows

The blocklist supports two `kind`s: `selector` (regex-matched against the `selector` param of `click`/`type`) and `url_contains` (regex against `url` param of `navigate`/`new_tab`).

## 6. Protocol extensions

### New RPC methods (`@passio/shared/protocol`)

```
passio.policy.get            → { domains: Record<host, policy>, countdownSeconds, blocklist }
passio.policy.set            ({ host, policy }) → { ok: true }
passio.policy.delete         ({ host })           → { ok: true }
passio.policy.setCountdown   ({ seconds })        → { ok: true }
passio.blocklist.set         ({ entries })        → { ok: true }
passio.gate.resolve          ({ id, allowed, mode? })
                             — called BY Rust TO the sidecar, mode ∈ { "allow-once", "allow-always" }
```

### New sidecar-originated notification

```
passio.gate.request — { id, tool, params, domain, reason }
                      reason ∈ { "ask_first", "blocklist:<pattern>:<reason>" }
```

## 7. RpcBus bidirectionality (minor extension)

Current `RpcBus` handles sidecar-received requests. To await a verdict from Rust, the sidecar needs to send requests AND track replies.

Extension to `packages/sidecar/src/rpc.ts`:

- Add `outbound: Map<string|number, { resolve, reject, timeout }>` alongside the existing `pending` map (which handles Rust-to-sidecar requests).
- New method `bus.requestOutbound(method, params, timeoutMs)` that emits a request envelope and returns a Promise.
- In `handleLine`, if the parsed message is a `response` (has `id` and we have a matching outbound entry), resolve it instead of treating it as a stray.

This keeps the existing public API untouched; `withGate` uses `requestOutbound` internally.

## 8. Sidecar: the `withGate` wrapper

```
// packages/sidecar/src/bridge/gate.ts (NEW)

export async function withGate<T>(
  db: Db,
  bridge: BridgeServer,
  tool: "click"|"type"|"navigate"|"new_tab"|"close_tab"|"scroll",
  params: unknown,
  fetchTargetDomain: () => Promise<string>,
  doTool: () => Promise<T>,
): Promise<T> {
  const domain = await fetchTargetDomain();
  const policy = lookupPolicy(db, domain);
  if (policy === "observe_only") throw new Error(`policy observe_only blocks ${tool} on ${domain}`);

  const blocked = matchBlocklist(db, tool, params);
  const gateReason = blocked
    ? `blocklist:${blocked.pattern}:${blocked.reason}`
    : policy === "ask_first"
      ? "ask_first"
      : null;

  if (!gateReason) return doTool(); // full_auto, clean

  const allowed = await requestGate(bridge.__outboundBus__, { tool, params, domain, reason: gateReason });
  if (!allowed) throw new Error(`gate: ${tool} on ${domain} rejected`);
  return doTool();
}
```

All 6 mutating tool entries in `tools/browser.ts` wrap through this before their existing `auditCall`. `auditCall` is still written in all cases (allow/reject) — the rejection path adds `ok: false` so the audit row captures user intent.

## 9. Rust core

### Gate state

```rust
// new file: src-tauri/src/gate.rs
struct PendingGate {
  resolver: oneshot::Sender<bool>,
  timer: JoinHandle<()>,
}
static PENDING: Lazy<Mutex<HashMap<String, PendingGate>>> = ...
```

### On `passio.gate.request` notification:

1. Compute remaining deadline = `now + countdown_seconds`.
2. Emit `passio://gate` to HUD with id, tool, params, domain, reason, deadline.
3. Spawn timer that auto-resolves `allowed=true` on elapse (default, matches `full_auto` fallback intent; if user wants stricter, they should raise the policy rather than hope the toast fires).

### On HUD `gate_resolve(id, allowed, mode)`:

- Cancel timer, resolve future with `allowed`.
- If `mode === "allow-always"`, also call `passio.policy.set` with the gate's domain → `full_auto`.
- Call `sidecar.call("passio.gate.resolve", { id, allowed })` which flows to the sidecar's `bus.requestOutbound` pending.

### New IPC commands

```
gate_resolve(id, allowed, mode?) → ()
policy_list() → { domains, countdownSeconds, blocklist }
policy_set(host, policy) → ()
policy_delete(host) → ()
policy_set_countdown(seconds) → ()
blocklist_set(entries) → ()
```

## 10. HUD — Countdown toast

Rendered in the fixed HUD overlay above the nudge banner. Priority over chat panel focus. Spec:

- Full width (320px, same as expanded panel), red outline when blocklist reason, amber when `ask_first`.
- Header: `🍇 Passio wants to <tool-verb> on <domain>`
- Subheader: `<reason>` (e.g. "ask_first policy" or "blocked selector: button[type=submit]")
- Body: params pretty-printed, truncated at 120 chars.
- Progress ring: SVG circle, stroke-dashoffset driven by `remainingMs`. Animates smoothly.
- Buttons:
  - **Allow now** — Tauri `gate_resolve(id, true, "allow-once")`
  - **Always allow this site** — Tauri `gate_resolve(id, true, "allow-always")`
  - **Cancel** (or Esc) — Tauri `gate_resolve(id, false)`
- If multiple gates queue, they stack; only top one is actionable.

Auto-show: when HUD is hidden, receiving a `passio://gate` event auto-calls `show_window()` then re-docks. Restore hidden state after the toast resolves.

## 11. HUD — Permissions section (new tab segment in Settings)

Added as subsection within the existing Settings panel (no new top-level tab). Three blocks:

1. **Countdown** — slider (1–10s), live preview (`"3s: lets you Esc-cancel"`).
2. **Per-domain policy** — list; each row is `<host>  <select observe_only|ask_first|full_auto>  <trash>`; add-row input.
3. **Action blocklist** — list of `{ kind, pattern, reason }`; add-row with `kind` select + pattern input + reason input. "Restore defaults" button.

## 12. Testing

### Unit (Bun tests, sidecar)

1. `lookupPolicy` returns `full_auto` for missing hosts; stored value when present.
2. `matchBlocklist` flags form submits; returns null for harmless clicks.
3. `withGate` short-circuits to `doTool` on `full_auto` + no blocklist hit.
4. `withGate` throws on `observe_only`.
5. `withGate` awaits verdict on `ask_first`; resolves when stub verdict = true, rejects on false.
6. Gate timer auto-resolves `true` after `countdown_seconds`.
7. Blocklist hit forces gate even when host is `full_auto`.

### Integration (mock bridge)

- End-to-end: scanner returns `decision: "act"` → sidecar dispatches through gate → mock Rust verdict → browser tool called.
- Chat LLM tool call: `bus.on(CHAT)` with a stub that calls `click` → gate event → verdict → call reaches mock bridge.

### HUD smoke

- Dev-only helper command `debug_fake_gate_request` that simulates a gate request; verifies the toast renders, countdown ticks, Esc cancels, "Always allow" updates policy.

## 13. Success criteria

- [ ] All existing tests remain green (42 → 42+).
- [ ] Clicking on `mail.google.com` when its policy is `observe_only` throws `policy observe_only blocks click on mail.google.com`.
- [ ] On `ask_first`, toast renders; Esc rejects; countdown elapse allows; "always allow this site" sets policy to `full_auto`.
- [ ] `button[type=submit]` click triggers the gate even on `full_auto` domains.
- [ ] Scanner's `decision: "act"` now executes the proposed tool call through the gate (one round-trip).
- [ ] Settings → Permissions shows preloaded blocklist and reflects edits.
- [ ] Audit log in `events` contains rows for both allowed and rejected gate decisions.

## 14. Implementation order (hint for plan writer)

1. Protocol constants + RpcBus outbound requests.
2. Policy + blocklist storage helpers (pure functions, unit tested first).
3. `withGate` + integration into `browser.ts` mutating tools.
4. Sidecar → Rust `passio.gate.request` notification handler.
5. Rust IPC commands for `gate_resolve` + `policy_*` + `blocklist_set`.
6. HUD countdown toast component + store wiring.
7. Settings "Permissions" subsection.
8. Scanner `act` dispatch path — turn the proposed call into an actual `bus.call` from within scan.ts, which then hits `withGate`.
9. Tests + smoke run + commit.

## 15. Non-goals (explicit)

- No sync of policy/blocklist across machines.
- No per-user isolation — Passio already assumes single user.
- No policy for reads (reads always pass).
- No "allow once then revert" — "allow now" is allow-this-invocation-only (not remembered); "always allow" is permanent.

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Gate never resolves (HUD crashed) | Rust timer auto-resolves `allowed=true` after countdown elapses — matches `full_auto` fallback; surfaced in audit log. |
| LLM causes runaway gate flood (many auto tool calls) | Countdown serialises them — user sees each one in turn. `observe_only` on a site still blocks without prompting. |
| User blocks their own banking accidentally | Preload common patterns; "Restore defaults" button in Settings. |
| Rust→sidecar RPC round-trip introduces latency | Gate only runs when a gate is needed (ask_first / blocklist). Full_auto path is untouched. |
| Scanner's proposed tool args are malformed | Gate validates params structurally via the existing tool's zod schema before dispatch. |
