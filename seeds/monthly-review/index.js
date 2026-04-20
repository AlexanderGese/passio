export default async function init(p){
  await p.tools.register({ name:"run", description:"save monthly review template",
    execute: async () => {
      const d = new Date(); const m = d.toLocaleString("en-US",{month:"long"});
      const body = ["# " + m + " review","","## highlights","","## learned","","## next month",""].join("\n");
      await p.notes.save({ title:"monthly-"+d.toISOString().slice(0,7), body, tags:"review,monthly" });
      return { ok:true };
    }});
  p.schedule({id:"mo",every_seconds:3600},async()=>{
    const d=new Date(); if(d.getDate()<=7 && d.getDay()===0 && d.getHours()===10){
      await p.bubble.speak("Monthly review day — tap Chat to run.");
    }
  });
}
