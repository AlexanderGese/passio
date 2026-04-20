export default async function init(p){
  const fallback = ["grey sky in the morning","rain taps on the window softly","coffee warms the cup"];
  await p.tools.register({ name:"compose", execute: async () => ({ haiku: fallback }) });
  p.schedule({id:"am",every_seconds:3600},async()=>{ const d=new Date(); if(d.getHours()===8 && d.getMinutes()<5) await p.bubble.speak(fallback.join(" / ")); });
}
