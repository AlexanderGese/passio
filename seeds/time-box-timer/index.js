export default async function init(p){
  let t = null;
  async function start(){
    if(t) clearTimeout(t);
    await p.bubble.speak("50-min deep-work block starting.");
    t = setTimeout(async () => {
      await p.bubble.speak("Break — 10 min. Stretch, water.");
      t = setTimeout(async () => {
        await p.bubble.speak("Back to it. New 50-min block ready.");
        t = null;
      }, 10*60*1000);
    }, 50*60*1000);
  }
  async function stop(){ if(t){ clearTimeout(t); t = null; } await p.bubble.speak("Timer stopped."); }
  await p.tools.register({ name:"start", description:"begin a 50/10 cycle", execute:start });
  await p.tools.register({ name:"stop", description:"cancel current cycle", execute:stop });
}
