export default async function init(p){
  async function run(){
    const d=new Date().toISOString().slice(0,10);
    const body = "# Week of " + d + "\n\n## wins\n- \n\n## blockers\n- \n\n## next week\n- \n";
    await p.notes.save({ title:"weekly-goal-"+d, body, tags:"review" });
    await p.bubble.speak("Weekly recap template saved — fill in the blanks.");
  }
  await p.tools.register({ name:"run", execute:run });
  p.schedule({id:"fri",every_seconds:3600},async()=>{ const d=new Date(); if(d.getDay()===5 && d.getHours()===17 && d.getMinutes()<5) await run(); });
}
