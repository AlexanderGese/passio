# Quickstart — build your first Seed

## 1. Scaffold

```
cd ~/projects
bunx @passio/seed-cli init my-seed
cd my-seed
```

Produces:
```
my-seed/
├── seed.json      ← manifest
├── index.js       ← entry (default-export an init(passio) function)
├── panel.js       ← optional Web Component for the tab
└── README.md
```

## 2. Run it in dev mode

Make sure Passio is running, then:
```
passio-seed dev .
```

This tells the running sidecar to watch the folder and reload on every save. Open **Grove → Dev** in the bubble to see live logs.

## 3. Edit + iterate

`index.js`:
```js
export default async function init(passio) {
  passio.log("my-seed booted");

  await passio.tools.register({
    name: "ping",
    description: "Say hi.",
    execute: async () => ({ pong: true, at: new Date().toISOString() }),
  });

  passio.schedule({ id: "tick", every_seconds: 60 }, async () => {
    const count = ((await passio.kv.get("ticks")) ?? 0) + 1;
    await passio.kv.set("ticks", count);
    passio.log(`tick ${count}`);
  });
}
```

Add to the manifest to enable the scheduler:
```json
"contributes": {
  "tools": ["ping"],
  "scheduler": [{ "id": "tick", "every_seconds": 60 }],
  "tabs": [{ "id": "my-seed-panel", "title": "My seed", "icon": "🌱", "panel": "./panel.js" }]
}
```

## 4. Add a panel

`panel.js`:
```js
class Panel extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  connectedCallback() {
    this.shadowRoot.innerHTML = '<button id="p">ping</button><pre id="o"></pre>';
    this.shadowRoot.getElementById("p").onclick = async () => {
      const r = await window.passio.invoke("ping", {});
      this.shadowRoot.getElementById("o").textContent = JSON.stringify(r, null, 2);
    };
  }
}
customElements.define("my-seed-panel", Panel);
```

The element name must match the `id` in the manifest.

## 5. Build + publish

```
passio-seed build .
```

Produces `dist/my-seed.seed`. Commit and push your seed code to a public GitHub repo, then share the `.seed` file. On another machine:

1. Double-click the `.seed` file (Linux / Win) — Passio opens, prompts for permissions, installs.
2. Or paste the JSON into Grove → Install → `.seed` file.
3. Or from terminal:
   ```
   curl -sS https://example.com/my-seed.seed | \
     jq -c . | \
     curl -X POST http://127.0.0.1:31763/rpc \
       -H "x-passio-token: $(cat ~/.config/passio/bridge-token)" \
       -H "content-type: application/json" \
       -d "{\"method\":\"passio.seed.installDescriptor\",\"params\":$(cat)}"
   ```

## Recipes

- **Call a REST API:** declare `permissions.network: ["api.example.com"]`, then `await passio.net.fetch(url)`.
- **Store a user token:** declare `permissions.secrets: ["api_token"]`, then `passio.secrets.set("api_token", "...")` / `passio.secrets.get("api_token")`.
- **Surface a notification:** `passio.bubble.speak("hello")` → appears in the HUD speech bubble + desktop notification + (if autoSpeak is on) TTS.
- **Make a hotkey:** declare `contributes.hotkeys: [{id:"open", default:"Super+Shift+M"}]` + register a handler: `passio.hotkeys.register({id:"open", default:"Super+Shift+M", onTrigger: () => ...})`.
