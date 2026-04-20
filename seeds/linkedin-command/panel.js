class LinkedInPanel extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  async connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;font:13px/1.4 system-ui}
        h3{margin:0 0 8px;color:#ff6b9d}
        button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #3A2E4C;background:#241B30;color:#F5EAFF;cursor:pointer;margin-right:4px}
        button:hover{background:#2E2340}
        input,textarea{font:inherit;padding:4px 6px;border-radius:4px;border:1px solid #3A2E4C;background:#1A1422;color:#F5EAFF;width:100%;box-sizing:border-box}
        textarea{min-height:90px;resize:vertical}
        .row{display:flex;gap:6px;margin-bottom:6px}
        .card{background:#1A1422;padding:8px;border-radius:6px;margin-bottom:6px;font-size:12px}
      </style>
      <h3>in linkedin-command</h3>
      <div class="row"><button id="tc">Compose</button><button id="tap">Autopilot</button><button id="tm">Me</button></div>
      <div id="v"></div>
    `;
    const v = this.shadowRoot.getElementById("v");
    const show = (h) => { v.innerHTML = h; };
    const compose = () => {
      show(`<textarea id="t" placeholder="what's happening in your work life?"></textarea><div class="row"><button id="go">Share</button></div><div id="out"></div>`);
      v.querySelector("#go").addEventListener("click", async () => {
        try { const r = await window.passio.invoke("share_text", { text: v.querySelector("#t").value }); v.querySelector("#out").innerHTML = `<div class="card">✓ ${esc(r.urn)}</div>`; }
        catch (e) { v.querySelector("#out").innerHTML = `<div class="card" style="color:#fca5a5">⚠ ${esc(e.message)}</div>`; }
      });
    };
    const autopilot = () => {
      show(`<div class="row"><button id="run">Tick</button><button id="on">Enable</button><button id="off">Disable</button></div><div id="out"></div>`);
      v.querySelector("#run").addEventListener("click", async () => { try { v.querySelector("#out").textContent = JSON.stringify(await window.passio.invoke("autopilot_tick", {}), null, 2); } catch (e) { v.querySelector("#out").textContent = "⚠ " + e.message; } });
      v.querySelector("#on").addEventListener("click", () => window.passio.invoke("autopilot_enable", { on: true }));
      v.querySelector("#off").addEventListener("click", () => window.passio.invoke("autopilot_enable", { on: false }));
    };
    const me = async () => { show(`<div id="out">loading…</div>`); try { const r = await window.passio.invoke("me", {}); v.querySelector("#out").innerHTML = `<pre style="white-space:pre-wrap">${esc(JSON.stringify(r, null, 2))}</pre>`; } catch (e) { v.querySelector("#out").textContent = "⚠ " + e.message; } };
    this.shadowRoot.getElementById("tc").addEventListener("click", compose);
    this.shadowRoot.getElementById("tap").addEventListener("click", autopilot);
    this.shadowRoot.getElementById("tm").addEventListener("click", me);
    compose();
  }
}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
customElements.define("linkedin-command-panel", LinkedInPanel);
