class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  connectedCallback(){
    const render=()=>{
      const start=new Date("2026-04-14"); const days=14;
      const diff=Math.floor((Date.now()-start.getTime())/86400000);
      const d=((diff%days)+days)%days+1;
      this.shadowRoot.innerHTML=`<style>:host{display:inline-block}.p{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}</style><span class=p>⏱ day ${d}/${days}</span>`;
    };
    render(); setInterval(render,3600000);
  }
}
customElements.define("current-sprint-day-chip",X);
