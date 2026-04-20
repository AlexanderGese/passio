class SP extends HTMLElement { constructor(){super();this.attachShadow({mode:"open"});} async connectedCallback(){this.shadowRoot.innerHTML=`<style>:host{display:block;font:13px/1.4 system-ui}h3{color:#ff6b9d;margin:0 0 8px}button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #3A2E4C;background:#241B30;color:#F5EAFF;cursor:pointer;margin-right:4px}.card{background:#1A1422;padding:8px;border-radius:6px;margin-top:6px}</style><h3>🎵 spotify-remote</h3><button id=np>Now</button><button id=pp>▶ play</button><button id=pz>⏸ pause</button><button id=nx>⏭</button><button id=pv>⏮</button><div class=card id=o>…</div>`;
const np=async()=>{try{const r=await window.passio.invoke("now_playing",{});this.shadowRoot.getElementById("o").textContent=r?.item?`${r.item.name} — ${r.item.artists?.map(a=>a.name).join(", ")}`:"(nothing playing)";}catch(e){this.shadowRoot.getElementById("o").textContent="⚠ "+e.message;}};
this.shadowRoot.getElementById("np").addEventListener("click",np);
this.shadowRoot.getElementById("pp").addEventListener("click",()=>window.passio.invoke("play",{}).then(np).catch(()=>undefined));
this.shadowRoot.getElementById("pz").addEventListener("click",()=>window.passio.invoke("pause",{}).then(np).catch(()=>undefined));
this.shadowRoot.getElementById("nx").addEventListener("click",()=>window.passio.invoke("next",{}).then(np).catch(()=>undefined));
this.shadowRoot.getElementById("pv").addEventListener("click",()=>window.passio.invoke("prev",{}).then(np).catch(()=>undefined));
np();
}} customElements.define("spotify-remote-command-panel",SP);
