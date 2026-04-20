export default async function init(p){
  await p.tools.register({ name:"start", execute: async () => { await p.bubble.speak("Evening routine — PM tab."); return { ok:true }; } });
}
