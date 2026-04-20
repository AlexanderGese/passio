class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  async connectedCallback(){
    this.shadowRoot.innerHTML=`<style>:host{display:inline-block}.p{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}</style><span id=x class=p>🔋 …</span>`;
    const el=this.shadowRoot.getElementById("x");
    if(!navigator.getBattery){ el.textContent="🔋 ?"; return; }
    try {
      const b=await navigator.getBattery();
      const render=()=>{ el.textContent=`🔋 ${Math.round(b.level*100)}% ${b.charging?"⚡":""}`; };
      render(); b.onlevelchange=render; b.onchargingchange=render;
    } catch { el.textContent="🔋 ?"; }
  }
}
customElements.define("battery-chip-chip",X);
