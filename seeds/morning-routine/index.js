export default async function init(p){
  const steps = ["Drink 500ml water","Stretch 3 min","Set today's intent","Inbox zero (5 min only)"];
  await p.tools.register({ name:"start", execute: async () => { await p.kv.set("step", 0); await p.bubble.speak("Morning routine started — first step in the AM tab."); return { ok:true }; } });
}
