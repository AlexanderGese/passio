# Panels & widgets — Web Components

Panels (full tabs) and widgets (small header/corner pieces) are Web Components loaded inside a sandboxed `<iframe sandbox="allow-scripts">`. They talk back to the host via `window.parent.postMessage` → a thin `window.passio.invoke(tool, args)` bridge.

## Minimal panel

```js
class MyPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>:host{display:block;font:13px/1.4 system-ui}</style>
      <h3>Hi!</h3>
      <button id="go">ping</button>
      <pre id="out"></pre>
    `;
    this.shadowRoot.getElementById("go").onclick = async () => {
      const r = await window.passio.invoke("ping", {});
      this.shadowRoot.getElementById("out").textContent = JSON.stringify(r, null, 2);
    };
  }
}
customElements.define("my-panel", MyPanel);
```

Manifest:
```json
"contributes": {
  "tools": ["ping"],
  "tabs": [{ "id": "my-panel", "title": "Mine", "icon": "🌱", "panel": "./panel.js" }]
}
```

The `id` **must** match `customElements.define(...)` — that's how the iframe knows what to render.

## What `window.passio.invoke` can do

Invoke any tool the seed registered via `passio.tools.register`. The result is whatever the tool's `execute` returns. Errors throw.

## What the panel can't do

- Directly call `passio.net.fetch`, `passio.secrets.*`, `passio.kv.*` — those APIs live in the worker. Proxy via a tool.
- Read/write the parent DOM. The iframe is sandboxed.
- Persist scroll / input state across tab switches — the panel re-mounts. Use `passio.kv.set` in a tool if you need that.

## Styling

The iframe inherits Passio's dark palette via light CSS resets in the wrapper HTML. Your Shadow DOM is independent — style freely. Passion-adjacent colors you can reach for:
- text: `#F5EAFF`
- accent: `#ff6b9d` (passion-pulp)
- subtle bg: `#241B30`
- border: `#3A2E4C`
- positive: `#7ee787`
- warn: `#ffb84d`

## Widgets (header/corner)

Widgets are simpler panels, meant to be small and glanceable. Same rules, but keep the rendered height under 32px for the header slot and under 120×120 for the corner slot (no enforcement yet; guidance only).

## Debugging

Open DevTools in the Passio window (right-click → Inspect element). The iframe appears in the frame selector. Console errors from the panel flow to there.
