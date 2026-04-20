class HelloPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;font-family:inherit}
        .box{display:flex;flex-direction:column;gap:8px}
        .row{display:flex;gap:6px}
        input{flex:1}
        .out{background:#1A1422;padding:8px;border-radius:6px;font-family:ui-monospace,monospace;font-size:12px;min-height:40px}
        h3{margin:0;color:#ff6b9d}
      </style>
      <div class="box">
        <h3>🌱 hello-seed</h3>
        <p style="margin:0;color:#aaa;font-size:12px">Type something and Passio's seed tool will echo it back.</p>
        <div class="row"><input id="t" placeholder="hello world"/><button id="go">Echo</button></div>
        <div id="out" class="out">—</div>
      </div>
    `;
    const input = this.shadowRoot.getElementById("t");
    const out = this.shadowRoot.getElementById("out");
    this.shadowRoot.getElementById("go").addEventListener("click", async () => {
      try {
        const r = await window.passio.invoke("echo", { text: input.value || "(empty)" });
        out.textContent = JSON.stringify(r, null, 2);
      } catch (e) {
        out.textContent = "⚠ " + e.message;
      }
    });
  }
}
customElements.define("hello-panel", HelloPanel);
