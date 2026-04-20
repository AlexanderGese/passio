class ST extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  async connectedCallback(){
    this.shadowRoot.innerHTML=`<style>:host{display:block;font:13px/1.4 system-ui}h3{color:#ff6b9d;margin:0 0 8px}button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #3A2E4C;background:#241B30;color:#F5EAFF;cursor:pointer;margin-right:4px}.card{background:#1A1422;padding:8px;border-radius:6px;margin-bottom:6px;font-size:12px}</style><h3>💳 stripe-command</h3><div><button id=c>Recent charges</button><button id=d>Disputes</button><button id=b>Balance</button></div><div id=o></div>`;
    const load=async(tool)=>{try{const r=await window.passio.invoke(tool,{});this.shadowRoot.getElementById("o").innerHTML=`<pre style="background:#1A1422;padding:8px;border-radius:6px;max-height:260px;overflow:auto;white-space:pre-wrap">${JSON.stringify(r.data ?? r,null,2).slice(0,2000)}</pre>`;}catch(e){this.shadowRoot.getElementById("o").innerHTML=`<div class=card style=color:#fca5a5>⚠ ${e.message}</div>`;}};
    this.shadowRoot.getElementById("c").addEventListener("click",()=>load("charge_list"));
    this.shadowRoot.getElementById("d").addEventListener("click",()=>load("dispute_list"));
    this.shadowRoot.getElementById("b").addEventListener("click",()=>load("balance"));
  }
}
customElements.define("stripe-command-panel",ST);
