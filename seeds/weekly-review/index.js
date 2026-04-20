export default async function init(p){
  await p.tools.register({ name:"run", description:"generate weekly review note now",
    execute: async () => {
      const today = new Date().toISOString().slice(0,10);
      const body = [
        "# Weekly review " + today,
        "",
        "## what worked", "",
        "## what didn't", "",
        "## what changes next week", "",
      ].join("\n");
      await p.notes.save({ title:"weekly-review-"+today, body, tags:"review" });
      await p.bubble.speak("Weekly-review template ready in your vault.");
      return { ok:true };
    }});
  p.schedule({id:"friday",every_seconds:3600},async()=>{
    const d=new Date(); if(d.getDay()===5 && d.getHours()===17 && d.getMinutes()<5){
      await p.bubble.speak("Weekly review time — tap Chat to run.");
    }
  });
}
