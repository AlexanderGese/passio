class N extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  async connectedCallback(){
    this.shadowRoot.innerHTML=`<style>:host{display:block;font:13px/1.4 system-ui}h3{color:#ff6b9d;margin:0 0 8px}input{font:inherit;padding:4px 6px;border-radius:4px;border:1px solid #3A2E4C;background:#1A1422;color:#F5EAFF;width:100%;box-sizing:border-box}button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #3A2E4C;background:#241B30;color:#F5EAFF;cursor:pointer;margin-top:6px}pre{background:#1A1422;padding:8px;border-radius:6px;max-height:260px;overflow:auto;white-space:pre-wrap}</style><h3>📝 notion-command</h3><input id=q placeholder="search query"/><button id=go>Search</button><pre id=o></pre>`;
    this.shadowRoot.getElementById("go").addEventListener("click",async()=>{try{const r=await window.passio.invoke("search",{query:this.shadowRoot.getElementById("q").value});this.shadowRoot.getElementById("o").textContent=JSON.stringify(r.results?.map(x=>({id:x.id,type:x.object,title:x.properties?.title?.title?.[0]?.plain_text ?? x.properties?.Name?.title?.[0]?.plain_text ?? x.id.slice(0,8)})),null,2);}catch(e){this.shadowRoot.getElementById("o").textContent="⚠ "+e.message;}});
  }
}
customElements.define("notion-command-panel",N);
