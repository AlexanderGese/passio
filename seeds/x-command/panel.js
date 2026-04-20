class XCmdPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  async connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;font:13px/1.4 system-ui,sans-serif}
        h3{margin:0 0 8px;color:#ff6b9d}
        button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #3A2E4C;background:#241B30;color:#F5EAFF;cursor:pointer;margin-right:4px}
        button:hover{background:#2E2340}
        input,textarea{font:inherit;padding:4px 6px;border-radius:4px;border:1px solid #3A2E4C;background:#1A1422;color:#F5EAFF;width:100%;box-sizing:border-box}
        textarea{min-height:60px;resize:vertical}
        .row{display:flex;gap:6px;margin-bottom:6px}
        .card{background:#1A1422;padding:8px;border-radius:6px;margin-bottom:6px;font-size:12px}
        .meta{color:#9a8da8;font-size:11px}
      </style>
      <h3>🐦 x-command</h3>
      <div class="row">
        <button id="tt">Timeline</button>
        <button id="tm">Mentions</button>
        <button id="ts">Search</button>
        <button id="tc">Compose</button>
        <button id="tap">Autopilot</button>
      </div>
      <div id="view"></div>
    `;
    const view = this.shadowRoot.getElementById("view");
    const show = (html) => { view.innerHTML = html; };

    const renderList = async (tool) => {
      show(`<div id="out">loading…</div>`);
      try {
        const r = await window.passio.invoke(tool, { limit: 25 });
        view.querySelector("#out").innerHTML = (r.items ?? []).map((t) => `<div class="card">${esc(t.text ?? "")}<div class="meta">id ${t.id}${t.public_metrics ? ` · ♥ ${t.public_metrics.like_count} · ↻ ${t.public_metrics.retweet_count}` : ""}</div></div>`).join("") || `<div class="meta">empty</div>`;
      } catch (e) { view.querySelector("#out").textContent = "⚠ " + e.message; }
    };

    const renderSearch = () => {
      show(`<div class="row"><input id="q" placeholder="query"/><button id="go">Search</button></div><div id="out"></div>`);
      view.querySelector("#go").addEventListener("click", async () => {
        try {
          const r = await window.passio.invoke("search", { q: view.querySelector("#q").value });
          view.querySelector("#out").innerHTML = (r.items ?? []).map((t) => `<div class="card">${esc(t.text ?? "")}<div class="meta">id ${t.id}</div></div>`).join("");
        } catch (e) { view.querySelector("#out").textContent = "⚠ " + e.message; }
      });
    };

    const renderCompose = () => {
      show(`<textarea id="text" placeholder="what's on your mind (≤280 chars)" maxlength="280"></textarea><div class="row"><input id="reply" placeholder="reply to tweet id (optional)"/></div><button id="go">Tweet</button><div id="out"></div>`);
      view.querySelector("#go").addEventListener("click", async () => {
        try {
          const payload = { text: view.querySelector("#text").value };
          const r = view.querySelector("#reply").value.trim();
          if (r) payload.reply_to = r;
          const res = await window.passio.invoke("tweet", payload);
          view.querySelector("#out").innerHTML = `<div class="card">✓ posted · id ${res.id}</div>`;
        } catch (e) { view.querySelector("#out").innerHTML = `<div class="card" style="color:#fca5a5">⚠ ${esc(e.message)}</div>`; }
      });
    };

    const renderAutopilot = async () => {
      show(`<div class="card">Set topics, caps, style guide in <strong>Settings</strong>. Dry-run is on by default — keep it on until drafts look right.</div>
        <div class="row"><button id="run">Run a cycle</button><button id="on">Enable</button><button id="off">Disable</button><button id="dryon">Dry-run on</button><button id="dryoff">Dry-run off</button></div>
        <div id="out"></div><div id="recent"></div>`);
      view.querySelector("#run").addEventListener("click", async () => {
        try { const r = await window.passio.invoke("autopilot_tick", {}); view.querySelector("#out").textContent = JSON.stringify(r, null, 2); }
        catch (e) { view.querySelector("#out").textContent = "⚠ " + e.message; }
      });
      view.querySelector("#on").addEventListener("click", () => window.passio.invoke("autopilot_enable", { on: true }));
      view.querySelector("#off").addEventListener("click", () => window.passio.invoke("autopilot_enable", { on: false }));
      view.querySelector("#dryon").addEventListener("click", () => window.passio.invoke("autopilot_dry_run", { on: true }));
      view.querySelector("#dryoff").addEventListener("click", () => window.passio.invoke("autopilot_dry_run", { on: false }));
      try {
        const r = await window.passio.invoke("recent_posts", {});
        view.querySelector("#recent").innerHTML = `<h4 style="color:#ff6b9d;margin:12px 0 4px">Recent</h4>` + (r.posts ?? []).map((p) => `<div class="card">${esc(p.kind)} · ${esc(p.text ?? "")} <span class="meta">${p.id ?? ""}</span></div>`).join("");
      } catch {}
    };

    const bind = (id, fn) => this.shadowRoot.getElementById(id).addEventListener("click", fn);
    bind("tt", () => renderList("timeline"));
    bind("tm", () => renderList("mentions"));
    bind("ts", renderSearch);
    bind("tc", renderCompose);
    bind("tap", renderAutopilot);
    renderList("timeline");
  }
}
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c])); }
customElements.define("x-command-panel", XCmdPanel);
