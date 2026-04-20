# Seed runtime API

Inside a Seed's entry file, you receive a `passio` object. Every method below enforces permissions declared in the manifest; calls to undeclared capabilities throw.

## `passio.tools.register(def)`
Register a tool the chat agent can call.
```js
await passio.tools.register({
  name: "echo",
  description: "Echo a string back.",
  input: { type: "object", properties: { text: { type: "string" } } },
  execute: async ({ text }) => ({ echoed: text }),
});
```

## `passio.hotkeys.register(def)`
Respond to a declared hotkey.
```js
await passio.hotkeys.register({
  id: "open",
  default: "Super+Shift+M",
  onTrigger: () => passio.log("hotkey fired"),
});
```

## `passio.schedule(cfg, fn)`
Run a function on an interval declared in the manifest.
```js
passio.schedule({ id: "refresh", every_seconds: 900 }, async () => {
  /* every 15 min */
});
```

## `passio.on(event, fn)`
Subscribe to host events. Only events declared in `contributes.events` fire.
```js
passio.on("chat", ({ prompt, text }) => { /* chat round-tripped */ });
passio.on("scan", (decision) => {});
passio.on("activity", (snapshot) => {});
passio.on("bubble_state", ({ state, message }) => {});
passio.on("hotkey", (name) => {});
```

## `passio.kv.{get, set, del}`
Seed-scoped persistent KV. Lives inside the seed's settings blob.
```js
const n = (await passio.kv.get("count")) ?? 0;
await passio.kv.set("count", n + 1);
await passio.kv.del("transient");
```

## `passio.net.fetch(url, init?)`
Like `fetch`, but constrained to hosts in `permissions.network`. Returns a minimal response-like object.
```js
const r = await passio.net.fetch("https://api.github.com/repos/tauri-apps/tauri");
if (r.ok) {
  const data = await r.json();
  passio.log(data.stargazers_count);
}
```

## `passio.secrets.{get, set}`
Seed-scoped secrets vault (namespaced under `seed:<name>:<key>`). Requires `permissions.secrets: [<name>, ...]`.
```js
await passio.secrets.set("api_token", "sk-...");
const token = await passio.secrets.get("api_token");
```

## `passio.bubble.speak(message)`
Surface a speech bubble in the HUD. Goes through the same pipeline as any other alert — TTS (if autoSpeak is on) + desktop notification.

## `passio.todos.add(input)` / `passio.notes.save(input)`
Write into Passio's core data stores. Notes auto-mirror to the vault when one is configured.
```js
await passio.todos.add({ text: "follow up with client", priority: 2, due_at: "2026-04-20" });
await passio.notes.save({ title: "meeting 4/19", body: "...", tags: "work,client" });
```

## `passio.log / warn / error`
Visible in the Grove → Dev log stream and the `passio.seed.logs` RPC.

## Panel side (Web Component in an iframe)

Panels run in a sandboxed iframe, separate from the worker. They can call back into the seed's tools via:
```js
const result = await window.passio.invoke("echo", { text: "hi" });
```
Everything declared with `tools.register` is callable from the panel via `window.passio.invoke(tool, args)`. Network / secrets / kv are **not** directly exposed to the panel — proxy through a tool if you need them.
