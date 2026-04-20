class S extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  async connectedCallback(){
    this.shadowRoot.innerHTML=`<style>:host{display:block;font:13px/1.4 system-ui}h3{color:#ff6b9d;margin:0 0 8px}button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #3A2E4C;background:#241B30;color:#F5EAFF;cursor:pointer}.card{background:#1A1422;padding:8px;border-radius:6px;margin-bottom:6px;font-size:12px}</style><h3>🛍 shopify-command</h3><button id=go>Load recent orders</button><div id=o></div>`;
    this.shadowRoot.getElementById("go").addEventListener("click",async()=>{try{const r=await window.passio.invoke("orders",{status:"open",limit:25});this.shadowRoot.getElementById("o").innerHTML=(r.orders ?? []).map(x=>`<div class="card">${x.name} · $${x.total_price} · ${x.customer?.email ?? ""}</div>`).join("") || "<div class=card>none</div>";}catch(e){this.shadowRoot.getElementById("o").innerHTML=`<div class=card style=color:#fca5a5>⚠ ${e.message}</div>`;}});
  }
}
customElements.define("shopify-command-panel",S);
