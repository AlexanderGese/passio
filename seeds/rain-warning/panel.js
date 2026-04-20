class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  async connectedCallback(){
    this.shadowRoot.innerHTML=`<style>:host{display:inline-block}.p{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}</style><span id="x" class="p">…</span>`;
    const el=this.shadowRoot.getElementById("x");
    try{ const r=await window.passio.invoke("check",{}); if(r.peak<20){ el.remove(); return; } el.textContent = "☂ " + r.peak + "%"; }catch(e){ el.textContent="⚠"; }
  }
}
customElements.define("rain-warning-chip",X);
