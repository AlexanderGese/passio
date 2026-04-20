class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  async connectedCallback(){
    this.shadowRoot.innerHTML=`<style>:host{display:inline-block}.p{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}</style><span id="x" class="p">…</span>`;
    const el=this.shadowRoot.getElementById("x");
    try{ let s; try { s = await window.passio.invoke("toggle", {}); } catch { s = {}; } el.textContent = "🍅 " + (s.active ? "on" : "start"); }catch(e){ el.textContent="⚠"; }
  }
}
customElements.define("pomodoro-chip-seed-chip",X);
