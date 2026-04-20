export default async function init(p){
  async function aqi(){
    const city = (await p.kv.get("city")) ?? "here";
    let token = null; try { token = await p.secrets.get("waqi_token"); } catch {}
    if(!token){ return { aqi:null, reason:"set secret waqi_token" }; }
    const r = await p.net.fetch("https://api.waqi.info/feed/"+city+"/?token="+encodeURIComponent(token));
    const b = await r.json();
    const v = b?.data?.aqi ?? null;
    await p.kv.set("last", v);
    return { aqi: v };
  }
  await p.tools.register({ name:"aqi", description:"current AQI", execute:aqi });
  p.schedule({id:"tick",every_seconds:1800},()=>aqi().catch(()=>undefined));
  aqi().catch(()=>undefined);
}
