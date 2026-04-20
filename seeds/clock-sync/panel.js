class ClockChip extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  async connectedCallback() {
    this.shadowRoot.innerHTML = `<style>:host{display:inline-block}.p{font:11px ui-monospace,monospace;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}.p.bad{background:rgba(239,68,68,0.3);color:#fca5a5}</style><span id="x" class="p">🕰 …</span>`;
    try {
      const r = await window.passio.invoke("check", {});
      const d = r.driftSeconds;
      const el = this.shadowRoot.getElementById("x");
      el.className = Math.abs(d) > 1 ? "p bad" : "p";
      el.textContent = `🕰 ${d >= 0 ? "+" : ""}${d}s`;
    } catch { /* silent */ }
  }
}
customElements.define("clock-sync-chip", ClockChip);
