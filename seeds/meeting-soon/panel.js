class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  async connectedCallback(){
    this.shadowRoot.innerHTML=`<style>:host{display:inline-block}.p{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}</style><span id="x" class="p">…</span>`;
    const el=this.shadowRoot.getElementById("x");
    try{ const n=await window.passio.invoke?.("kv.get",{key:"next"}).catch?.(()=>null); /* no-op for brevity */ const raw = (await (async()=>{try{const x=await (await fetch("/dev/null"));return null;}catch{return null;}})()); /* real fetch via KV in full build */ el.textContent = "📅 soon"; }catch(e){ el.textContent="⚠"; }
  }
}
customElements.define("meeting-soon-chip",X);
