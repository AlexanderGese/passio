# Auto-loop guide

Auto-loop is run-until-done agentic execution. You describe a task, Passio plans sub-steps, executes each (with full tool access), then re-plans if the task isn't finished. It stops on completion, cancellation, a step cap, or a cost cap — whichever comes first.

## How to start

### From chat
1. Type your task.
2. Click the **∞** toggle next to Send (it glows when active).
3. Send. The chat gets a system message with the loop id; open **Auto** tab to watch live progress.

### From the Auto tab
1. Open the Auto tab.
2. Fill in the task, set max steps and max $, click **Run until done**.

## Safety caps

Every loop has three hard stops:
- **max steps** — default 20. A "step" = one sub-prompt execution by the chat agent.
- **max cost (USD)** — default $0.50. Aggregated from `usage_log` across every tool / LLM call in the loop.
- **max replans** — fixed at 4. Replan happens when the current plan's queue is empty and the assessor says "not yet done."

Any cap → loop ends with a status tag (`step_cap`, `cost_cap`, or `complete` / `cancelled` / `failed`).

## What the agent can do in a step

Everything the normal chat agent can do — every registered tool, including Seeds' registered tools. Specifically:
- memory: remember / forget / search
- todos: add / list / done
- notes: save (auto-mirrored to vault)
- goals: create / decompose / milestones
- browser: navigate, click, type, extract, summarize (gated by per-host policy)
- vault: search / read / write
- mail: inbox / send (if configured)
- shell: from allowlist only
- macros, research, sandbox, PDFs, flashcards, knowledge graph, automation
- any Seed tool

## Observability

Each loop writes events to the DB (plan → step_start → step_done → assess → replan → complete). The Auto tab polls every 2.5s while running and receives live `passio.autoLoop.update` notifications on every state change.

Logs include:
- Plan objects (JSON) for audit
- Full assistant text of every step (truncated at 500 chars in the header, full in content)
- Reasoning from the assessor when it votes "not done yet"
- Error messages if the loop crashes (e.g. no API key)

## Cancelling

Click **Cancel** in the Auto tab. The currently executing step finishes first, then the loop exits cleanly. Queued steps are dropped.

## Crash recovery

If the sidecar restarts while a loop is running, the loop is marked `abandoned` on boot (it won't silently resume). You can start a new loop with the same task.

## When to use it

Good fits:
- Multi-step research + writeup ("research X, save three notes, draft a summary")
- Cross-tool workflows ("find deadlines in my goals, make todos, email my teacher about the next one")
- Housekeeping passes ("clean up my inbox: archive anything older than 30 days with no action needed")
- Planning ("plan my week based on current goals + calendar")

Poor fits:
- Single-turn answers — just use chat
- Anything needing live user judgment at each step (chat is better)
- Tasks requiring strict determinism (cost/step caps introduce variability)
