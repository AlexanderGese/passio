export default async function init(p){
  await p.tools.register({ name:"log", execute: async ({ text }) => { const log=(await p.kv.get("log"))??[]; log.push({ ts:Date.now(), text }); await p.kv.set("log", log); return { ok:true }; } });
  p.schedule({id:"pm",every_seconds:3600},async()=>{ const d=new Date(); if(d.getHours()===21 && d.getMinutes()<5) await p.bubble.speak("What did you learn today? One sentence — I'll store it."); });
}
