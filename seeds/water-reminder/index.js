export default async function init(p){
  await p.tools.register({ name:"log", description:"log a glass of water",
    execute: async () => { const c = ((await p.kv.get("today"))??0)+1; await p.kv.set("today",c); return { today:c }; }});
  p.schedule({id:"nudge",every_seconds:5400},async()=>{ await p.bubble.speak("💧 water break? A glass if you haven't had one this hour."); });
}
