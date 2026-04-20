class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  connectedCallback(){
    const render=()=>{
      const now=new Date();
      const target=new Date(now); target.setHours(9,30,0,0);
      if(target<now) target.setDate(target.getDate()+1);
      const ms=target-now; const min=Math.round(ms/60000);
      const label=min<0?"now":min<60?(min+"m"):(Math.round(min/60)+"h");
      this.shadowRoot.innerHTML=`<style>:host{display:inline-block}.p{font:11px system-ui;color:#F5EAFF;background:#1A1422;padding:2px 6px;border-radius:4px}</style><span class=p>🕘 stand-up ${label}</span>`;
    };
    render(); setInterval(render,30000);
  }
}
customElements.define("standup-countdown-chip",X);
