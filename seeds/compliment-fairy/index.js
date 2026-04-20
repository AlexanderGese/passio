export default async function init(p){
  const pool = ["You picked up something today you wouldn't have last year.","Your curiosity is an asset.","You're further along than you give yourself credit for.","The way you treat small things matters.","Your patience today will pay off."];
  await p.tools.register({ name:"give", execute: async () => ({ msg: pool[Math.floor(Math.random()*pool.length)] }) });
  p.schedule({id:"daily",every_seconds:3600},async()=>{ const k=new Date().toDateString(); const seen=(await p.kv.get("seen"))??null; if(seen===k) return; await p.kv.set("seen",k); const idx=Math.floor(Math.random()*pool.length); await p.bubble.speak(pool[idx]); });
}
