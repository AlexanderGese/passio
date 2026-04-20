export default async function init(p){
  await p.tools.register({ name:"load", description:"event counts per day for last 12 weeks",
    execute: async () => {
      const r = await p.calendar.upcoming({ limit: 500, days: 84 }).catch(()=>({events:[]}));
      const by = {};
      for(const e of (r.events ?? [])){
        const k = (e.start ?? "").slice(0,10); by[k] = (by[k]??0)+1;
      }
      return { by };
    }});
}
