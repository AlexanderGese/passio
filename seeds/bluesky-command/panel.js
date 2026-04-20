class BS extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  connectedCallback(){
    this.shadowRoot.innerHTML=`<style>:host{display:block;font:13px/1.4 system-ui}h3{color:#ff6b9d;margin:0 0 8px}button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #3A2E4C;background:#241B30;color:#F5EAFF;cursor:pointer}textarea{font:inherit;padding:4px 6px;border-radius:4px;border:1px solid #3A2E4C;background:#1A1422;color:#F5EAFF;width:100%;min-height:70px;box-sizing:border-box}</style><h3>🌤 bluesky-command</h3><textarea id=t maxlength=300 placeholder="(max 300 chars)"></textarea><div style="margin-top:6px"><button id=go>Post</button></div><div id=o></div>`;
    this.shadowRoot.getElementById("go").addEventListener("click",async()=>{try{const r=await window.passio.invoke("post",{text:this.shadowRoot.getElementById("t").value});this.shadowRoot.getElementById("o").innerHTML=`<div style=color:#7ee787>✓ ${r.uri}</div>`;}catch(e){this.shadowRoot.getElementById("o").innerHTML=`<div style=color:#fca5a5>⚠ ${e.message}</div>`;}});
  }
}
customElements.define("bluesky-command-panel",BS);
