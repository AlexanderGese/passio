export default async function init(p){
  async function eta(){
    const from=(await p.kv.get("from"))??"52.52,13.40"; const to=(await p.kv.get("to"))??"52.48,13.42";
    const [la,lo]=from.split(","); const [lb,mo]=to.split(",");
    const url="https://router.project-osrm.org/route/v1/driving/"+lo+","+la+";"+mo+","+lb+"?overview=false";
    try{
      const r = await p.net.fetch(url); const b = await r.json();
      const min = Math.round((b.routes?.[0]?.duration ?? 0)/60);
      await p.kv.set("last", { min });
      return { min };
    } catch(e){ return { min: null, error: e.message }; }
  }
  await p.tools.register({ name:"eta", description:"ETA in minutes", execute:eta });
  p.schedule({id:"tick",every_seconds:900},()=>eta().catch(()=>undefined));
  eta().catch(()=>undefined);
}
