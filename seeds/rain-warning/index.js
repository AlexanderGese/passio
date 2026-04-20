export default async function init(p){
  async function check(){
    const lat = (await p.kv.get("lat")) ?? 52.52;
    const lon = (await p.kv.get("lon")) ?? 13.405;
    const r = await p.net.fetch("https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+"&hourly=precipitation_probability&forecast_hours=2");
    const b = await r.json();
    const arr = b?.hourly?.precipitation_probability ?? [];
    const peak = Math.max(0, ...arr.slice(0, 2));
    await p.kv.set("peak", peak);
    return { peak };
  }
  await p.tools.register({ name:"check", description:"precip probability peak 0-2h", execute:check });
  p.schedule({id:"tick",every_seconds:1800},()=>check().catch(()=>undefined));
  check().catch(()=>undefined);
}
