class ClipPanel extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  async connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block}
        h3{margin:0 0 6px;color:#ff6b9d}
        .add{display:flex;gap:4px;margin-bottom:6px}
        .add input{flex:1}
        ul{list-style:none;margin:0;padding:0;max-height:240px;overflow-y:auto}
        li{display:flex;gap:4px;padding:4px 6px;border-radius:4px;align-items:center;margin-bottom:2px;background:#1A1422}
        .text{flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
        .text:hover{color:#ff6b9d}
        .pin{background:transparent;border:0;color:#9a8da8;cursor:pointer;font-size:14px}
        .pin.on{color:#ffb84d}
        .meta{color:#7a6d88;font-size:10px;margin-left:4px}
      </style>
      <h3>📋 Clipboard history</h3>
      <div class="add">
        <input id="new" placeholder="capture a snippet…"/>
        <button id="add">+</button>
      </div>
      <ul id="list"></ul>
    `;
    const render = async () => {
      const { entries } = await window.passio.invoke("recent", {});
      const list = this.shadowRoot.getElementById("list");
      list.innerHTML = entries.map((e, i) => `
        <li>
          <button class="pin ${e.pinned ? "on" : ""}" data-i="${i}" title="pin">★</button>
          <span class="text" data-copy="${escapeAttr(e.text)}" title="click to copy">${escapeHtml(e.text.slice(0, 80))}</span>
          <span class="meta">${timeAgo(e.ts)}</span>
        </li>
      `).join("") || `<li><span class="meta">(empty)</span></li>`;
      list.querySelectorAll(".text").forEach((el) => {
        el.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(el.dataset.copy); }
          catch { /* sandboxed — silent */ }
        });
      });
      list.querySelectorAll(".pin").forEach((el) => {
        el.addEventListener("click", async () => {
          await window.passio.invoke("pin", { index: Number(el.dataset.i) });
          await render();
        });
      });
    };
    this.shadowRoot.getElementById("add").addEventListener("click", async () => {
      const input = this.shadowRoot.getElementById("new");
      if (input.value.trim()) {
        await window.passio.invoke("record", { text: input.value });
        input.value = "";
        await render();
      }
    });
    await render();
  }
}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
function escapeAttr(s){return escapeHtml(s).replace(/`/g,"&#96;");}
function timeAgo(ts){const m=(Date.now()-ts)/60000;if(m<1)return"now";if(m<60)return`${Math.floor(m)}m`;const h=m/60;if(h<24)return`${Math.floor(h)}h`;return`${Math.floor(h/24)}d`;}
customElements.define("clipboard-panel", ClipPanel);
