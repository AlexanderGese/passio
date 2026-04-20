export default async function init(p){
  await p.tools.register({ name:"set", execute: async ({ text }) => { await p.kv.set("today-"+new Date().toISOString().slice(0,10), text); return { ok:true }; } });
  await p.tools.register({ name:"today", execute: async () => ({ intent: await p.kv.get("today-"+new Date().toISOString().slice(0,10)) ?? null }) });
  p.schedule({id:"am",every_seconds:3600},async()=>{ const d=new Date(); if(d.getHours()===8 && d.getMinutes()<5){ const cur=await p.kv.get("today-"+d.toISOString().slice(0,10)); if(!cur) await p.bubble.speak("What's the one thing that matters today?"); } });
}
