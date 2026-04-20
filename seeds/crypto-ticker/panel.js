class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  async connectedCallback(){
    this.shadowRoot.innerHTML=`<style>:host{display:inline-block}.p{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}</style><span id="x" class="p">…</span>`;
    const el=this.shadowRoot.getElementById("x");
    try{ const r = await window.passio.invoke("price", {}); el.textContent = (r.coin[0].toUpperCase()+r.coin.slice(1,3)) + " $" + Math.round(r.usd) + " " + ((r.change ?? 0)>=0?"▲":"▼") + Math.abs(r.change ?? 0).toFixed(1) + "%"; }catch(e){ el.textContent="⚠"; }
  }
}
customElements.define("crypto-ticker-chip",X);
