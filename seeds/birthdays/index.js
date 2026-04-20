export default async function init(p){
  async function today(){
    const list = ((await p.kv.get("list")) ?? "").split(/\n/).map(s=>s.trim()).filter(Boolean);
    const t = new Date().toISOString().slice(5,10);
    const hits = list.map(x=>x.split("|")).filter(([,d])=>d===t).map(([n])=>n);
    await p.kv.set("today", hits);
    return { hits };
  }
  await p.tools.register({ name:"today", description:"names with a birthday today", execute:today });
  p.schedule({id:"morning",every_seconds:3600},async()=>{
    const d=new Date(); if(d.getHours()===9 && d.getMinutes()<5){
      const { hits } = await today();
      if(hits.length) await p.bubble.speak("🎂 Birthday today: " + hits.join(", "));
    }
  });
}
