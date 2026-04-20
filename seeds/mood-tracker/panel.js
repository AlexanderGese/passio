class X extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});}
  async connectedCallback(){
    this.shadowRoot.innerHTML=`<style>:host{display:block;font:13px/1.4 system-ui}h3{margin:0 0 8px;color:#ff6b9d}button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #3A2E4C;background:#241B30;color:#F5EAFF;cursor:pointer}button:hover{background:#2E2340}ul{list-style:none;margin:0;padding:0}li{margin:4px 0;padding:6px 8px;background:#1A1422;border-radius:6px}</style><h3>😊 Mood</h3><div>Today: <button data-s=1>1</button><button data-s=2>2</button><button data-s=3>3</button><button data-s=4>4</button><button data-s=5>5</button></div><svg id="g" width="300" height="80"></svg>`;
    try { await this.hydrate?.(); } catch (e) { /* silent */ }
  }
}
customElements.define("mood-panel",X);
