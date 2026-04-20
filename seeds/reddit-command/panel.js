class RedditCmdPanel extends HTMLElement {
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
        input,textarea,select{font:inherit;padding:4px 6px;border-radius:4px;border:1px solid #3A2E4C;background:#1A1422;color:#F5EAFF;width:100%;box-sizing:border-box}
        textarea{min-height:60px;resize:vertical}
        .row{display:flex;gap:6px;margin-bottom:6px}
        .row>*{flex:1}
        .card{background:#1A1422;padding:8px;border-radius:6px;margin-bottom:6px;font-size:12px}
        .meta{color:#9a8da8;font-size:11px}
        .pills button{flex:none}
      </style>
      <h3>🔶 reddit-command</h3>
      <div class="pills row">
        <button id="tf">Feed</button>
        <button id="ts">Search</button>
        <button id="ti">Inbox</button>
        <button id="tc">Compose</button>
        <button id="tap">Autopilot</button>
      </div>
      <div id="view"></div>
    `;

    const view = this.shadowRoot.getElementById("view");
    const show = (html) => { view.innerHTML = html; };

    const renderFeed = async () => {
      show(`<div class="row"><input id="sub" placeholder="subreddit (blank = home)"/><select id="kind"><option>hot</option><option>new</option><option>top</option><option>rising</option></select><button id="go">Load</button></div><div id="out">loading…</div>`);
      const load = async () => {
        const sr = view.querySelector("#sub").value.trim();
        const kind = view.querySelector("#kind").value;
        try {
          const r = await window.passio.invoke("feed", { subreddit: sr, kind, limit: 15 });
          view.querySelector("#out").innerHTML = r.items
            .map((x) => `<div class="card"><strong>${esc(x.title)}</strong><div class="meta">r/${esc(x.subreddit)} · ${x.score} · ${x.num_comments} comments</div><a href="${x.url}" target="_blank" rel="noopener" style="color:#ff6b9d">open →</a></div>`)
            .join("");
        } catch (e) {
          view.querySelector("#out").textContent = "⚠ " + e.message;
        }
      };
      view.querySelector("#go").addEventListener("click", load);
      load();
    };

    const renderSearch = () => {
      show(`<div class="row"><input id="q" placeholder="query"/><input id="sr" placeholder="subreddit (optional)"/><button id="go">Search</button></div><div id="out"></div>`);
      view.querySelector("#go").addEventListener("click", async () => {
        try {
          const r = await window.passio.invoke("search", { q: view.querySelector("#q").value, subreddit: view.querySelector("#sr").value || undefined });
          view.querySelector("#out").innerHTML = r.items.map((x) => `<div class="card"><strong>${esc(x.title)}</strong><div class="meta">r/${esc(x.subreddit)} · ${x.score}</div><a href="${x.url}" target="_blank" rel="noopener" style="color:#ff6b9d">open →</a></div>`).join("");
        } catch (e) { view.querySelector("#out").textContent = "⚠ " + e.message; }
      });
    };

    const renderInbox = async () => {
      show(`<div id="out">loading…</div>`);
      try {
        const r = await window.passio.invoke("inbox", { limit: 25 });
        view.querySelector("#out").innerHTML = r.items.map((x) => `<div class="card"><strong>${esc(x.subject ?? "(reply)")}</strong> <span class="meta">by u/${esc(x.author ?? "?")}</span><div>${esc((x.body ?? "").slice(0,240))}</div></div>`).join("") || `<div class="meta">empty</div>`;
      } catch (e) { view.querySelector("#out").textContent = "⚠ " + e.message; }
    };

    const renderCompose = () => {
      show(`<div class="row"><input id="sr" placeholder="subreddit"/><input id="title" placeholder="title"/></div><textarea id="body" placeholder="body (markdown)"></textarea><div class="row"><button id="send">Submit</button></div><div id="out"></div>`);
      view.querySelector("#send").addEventListener("click", async () => {
        try {
          const r = await window.passio.invoke("submit", { subreddit: view.querySelector("#sr").value, title: view.querySelector("#title").value, body: view.querySelector("#body").value });
          view.querySelector("#out").innerHTML = `<div class="card">✓ posted · <a href="${r.url}" target="_blank" rel="noopener" style="color:#ff6b9d">${esc(r.url)}</a></div>`;
        } catch (e) { view.querySelector("#out").innerHTML = `<div class="card" style="color:#fca5a5">⚠ ${esc(e.message)}</div>`; }
      });
    };

    const renderAutopilot = async () => {
      show(`<div class="card">Configure target subs, caps, style guide in <strong>Settings</strong>. Keep dry-run on until you trust the output.</div>
        <div class="row pills"><button id="run">Run a cycle now</button><button id="on">Enable</button><button id="off">Disable</button><button id="dryon">Dry-run on</button><button id="dryoff">Dry-run off</button></div>
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
        view.querySelector("#recent").innerHTML = `<h4 style="color:#ff6b9d;margin:12px 0 4px">Recent</h4>` + (r.posts ?? []).map((p) => `<div class="card">${esc(p.kind)} · r/${esc(p.sr ?? "?")} · ${esc(p.title ?? "")}</div>`).join("");
      } catch {}
    };

    const bind = (id, fn) => this.shadowRoot.getElementById(id).addEventListener("click", fn);
    bind("tf", renderFeed);
    bind("ts", renderSearch);
    bind("ti", renderInbox);
    bind("tc", renderCompose);
    bind("tap", renderAutopilot);
    renderFeed();
  }
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}
customElements.define("reddit-command-panel", RedditCmdPanel);
