export default async function init(p){
  p.schedule({id:"hourly",every_seconds:3600},async()=>{ const d=new Date(); if(d.getHours()===22) await p.bubble.speak("Big day. Consider calling it a night."); });
}
