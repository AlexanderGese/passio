export default async function init(p){
  async function check(){
    try {
      const r = await p.calendar.upcoming({ limit: 1, days: 1 });
      const ev = r?.events?.[0];
      if(!ev) return;
      const mins = Math.round((new Date(ev.start).getTime() - Date.now())/60000);
      await p.kv.set("next", { summary: ev.summary, mins });
    } catch {}
  }
  p.schedule({id:"tick",every_seconds:60},check);
  check();
}
