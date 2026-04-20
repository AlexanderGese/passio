export default async function init(p){
  await p.tools.register({ name:"start", description:"kick a 90/20 flow block", execute: async () => {
    await p.bubble.speak("90-min flow block starting. Close distractions.");
    setTimeout(async () => { await p.bubble.speak("20-min break. Stand, water, no screens."); }, 90*60*1000);
    return { ok:true };
  }});
}
