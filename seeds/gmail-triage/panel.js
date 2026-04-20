class TriagePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  async connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;font:13px/1.4 system-ui,sans-serif}
        h3{margin:0 0 8px;color:#ff6b9d}
        button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #3A2E4C;background:#241B30;color:#F5EAFF;cursor:pointer}
        button:hover{background:#2E2340}
        .actions{display:flex;gap:6px;margin-bottom:10px}
        ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto}
        li{background:#1A1422;border-radius:6px;padding:8px;font-size:12px}
        .cat{display:inline-block;border-radius:3px;padding:1px 6px;font-size:10px;text-transform:uppercase;font-weight:600;margin-right:6px}
        .action{background:rgba(239,68,68,0.2);color:#fca5a5}
        .reply{background:rgba(168,85,247,0.2);color:#d8b4fe}
        .archive{background:rgba(100,116,139,0.25);color:#cbd5e1}
        .spam{background:rgba(234,179,8,0.2);color:#fde68a}
        .from{color:#cbd5e1}
        .subj{color:#F5EAFF;margin-top:2px;font-weight:500}
        pre{white-space:pre-wrap;background:#120E1A;padding:6px;border-radius:4px;margin-top:6px;font-family:ui-monospace,monospace;font-size:11px;color:#dcd4ec}
      </style>
      <h3>✉ gmail triage</h3>
      <div class="actions">
        <button id="run">Triage now</button>
        <button id="refresh">Refresh</button>
      </div>
      <ul id="list"><li>loading…</li></ul>
    `;
    const list = this.shadowRoot.getElementById("list");
    const render = async () => {
      try {
        const { items } = await window.passio.invoke("recent", {});
        if (!items.length) {
          list.innerHTML = `<li style="color:#9a8da8">inbox empty or not yet triaged · hit <b>Triage now</b></li>`;
          return;
        }
        list.innerHTML = items
          .map(
            (i) => `<li>
              <span class="cat ${i.category}">${i.category}</span>
              <span class="from">${escape_(i.from ?? "")}</span>
              <div class="subj">${escape_(i.subject ?? "(no subject)")}</div>
              ${i.draft ? `<pre>${escape_(i.draft)}</pre>` : ""}
            </li>`,
          )
          .join("");
      } catch (e) {
        list.innerHTML = `<li style="color:#fca5a5">⚠ ${escape_(e.message)}</li>`;
      }
    };
    this.shadowRoot.getElementById("run").addEventListener("click", async () => {
      try {
        const r = await window.passio.invoke("triage", {});
        console.log("triaged", r);
      } catch (e) {
        alert(`triage failed: ${e.message}`);
      }
      await render();
    });
    this.shadowRoot.getElementById("refresh").addEventListener("click", render);
    await render();
  }
}
function escape_(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}
customElements.define("gmail-triage-panel", TriagePanel);
