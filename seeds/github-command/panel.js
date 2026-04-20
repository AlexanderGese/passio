class GH extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  async connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>:host{display:block;font:13px/1.4 system-ui}h3{color:#ff6b9d;margin:0 0 8px}button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #3A2E4C;background:#241B30;color:#F5EAFF;cursor:pointer;margin-right:4px}input,textarea{font:inherit;padding:4px 6px;border-radius:4px;border:1px solid #3A2E4C;background:#1A1422;color:#F5EAFF;width:100%;box-sizing:border-box}textarea{min-height:60px}.card{background:#1A1422;padding:8px;border-radius:6px;margin-bottom:6px;font-size:12px}.row{display:flex;gap:6px;margin-bottom:6px}</style>
      <h3>⎋ github-command</h3>
      <div class="row"><button id="tn">Notifications</button><button id="ti">Issue</button><button id="tap">Autopilot</button></div>
      <div id="v"></div>
    `;
    const v = this.shadowRoot.getElementById("v");
    const show = (h) => { v.innerHTML = h; };
    const noti = async () => { show(`<div id="o">loading…</div>`); try { const r = await window.passio.invoke("notifications", {}); v.querySelector("#o").innerHTML = (r ?? []).slice(0,20).map(n=>`<div class="card">${esc(n.reason)} · ${esc(n.subject?.title ?? "")}</div>`).join("") || "<div class=card>empty</div>"; } catch(e){ v.querySelector("#o").textContent="⚠ "+e.message; } };
    const issue = () => {
      show(`<div class="row"><input id=owner placeholder=owner/><input id=repo placeholder=repo/></div><input id=title placeholder=title style="margin-bottom:6px"/><textarea id=body placeholder=body></textarea><div class=row><button id=go>Create</button></div><div id=o></div>`);
      v.querySelector("#go").addEventListener("click", async()=>{try{const r=await window.passio.invoke("issue_create",{owner:v.querySelector("#owner").value,repo:v.querySelector("#repo").value,title:v.querySelector("#title").value,body:v.querySelector("#body").value});v.querySelector("#o").innerHTML=`<div class=card>✓ ${esc(r.url)}</div>`;}catch(e){v.querySelector("#o").innerHTML=`<div class=card style="color:#fca5a5">⚠ ${esc(e.message)}</div>`;}});
    };
    const autopilot = () => {
      show(`<div class=row><button id=run>Tick</button><button id=on>Enable</button><button id=off>Disable</button></div><div id=o></div>`);
      v.querySelector("#run").addEventListener("click", async()=>{try{v.querySelector("#o").textContent=JSON.stringify(await window.passio.invoke("autopilot_tick",{}),null,2);}catch(e){v.querySelector("#o").textContent="⚠ "+e.message;}});
      v.querySelector("#on").addEventListener("click", ()=>window.passio.invoke("autopilot_enable",{on:true}));
      v.querySelector("#off").addEventListener("click", ()=>window.passio.invoke("autopilot_enable",{on:false}));
    };
    this.shadowRoot.getElementById("tn").addEventListener("click", noti);
    this.shadowRoot.getElementById("ti").addEventListener("click", issue);
    this.shadowRoot.getElementById("tap").addEventListener("click", autopilot);
    noti();
  }
}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));}
customElements.define("github-command-panel", GH);
