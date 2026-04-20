class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  connectedCallback(){
    const css=`:host{display:inline-flex;gap:4px}span{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}`;
    const zones=["UTC","America/New_York","Asia/Tokyo"];
    const render=()=>{
      const now=new Date();
      this.shadowRoot.innerHTML=`<style>${css}</style>`+zones.map(z=>{
        try{ return `<span>${z.split("/").pop().slice(0,3).toUpperCase()} ${now.toLocaleTimeString("en-GB",{timeZone:z,hour:"2-digit",minute:"2-digit"})}</span>`; }
        catch{ return ""; }
      }).join("");
    };
    render(); setInterval(render,30000);
  }
}
customElements.define("timezone-ring-chip",X);
