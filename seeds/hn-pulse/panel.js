class HnPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  async connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block}
        h3{margin:0 0 8px;color:#ff6b9d}
        ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
        li a{color:#F5EAFF;text-decoration:none;font-size:13px;line-height:1.3;display:block;padding:4px 6px;border-radius:4px}
        li a:hover{background:#2E2340}
        .meta{color:#9a8da8;font-size:11px}
        .refresh{font-size:11px;color:#9a8da8;cursor:pointer;background:transparent;border:0;float:right}
      </style>
      <h3>🗞 Top 5 on Hacker News <button id="r" class="refresh">refresh</button></h3>
      <ul id="list"><li class="meta">loading…</li></ul>
    `;
    const list = this.shadowRoot.getElementById("list");
    const render = async () => {
      try {
        const { items } = await window.passio.invoke("top_stories", { limit: 5 });
        list.innerHTML = items.map((s, i) => `
          <li><a href="${s.url ?? "https://news.ycombinator.com/item?id=" + s.id}" target="_blank" rel="noopener">
            <strong>${i + 1}.</strong> ${escapeHtml(s.title)}
            <div class="meta">${s.score} pts · ${escapeHtml(s.by ?? "?")}</div>
          </a></li>
        `).join("");
      } catch (e) {
        list.innerHTML = `<li class="meta">⚠ ${escapeHtml(e.message)}</li>`;
      }
    };
    this.shadowRoot.getElementById("r").addEventListener("click", render);
    await render();
  }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}
customElements.define("hn-pulse-panel", HnPanel);
