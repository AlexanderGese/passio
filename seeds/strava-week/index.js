export default async function init(p){
  async function week(){
    let tok=null; try{ tok=await p.secrets.get("strava_token"); } catch {} if(!tok) return { km:null };
    const after = Math.floor((Date.now() - 7*86400_000)/1000);
    const r = await p.net.fetch("https://www.strava.com/api/v3/athlete/activities?after="+after+"&per_page=50",{ init:{ headers:{ Authorization:"Bearer "+tok } } });
    const km = ((await r.json()) ?? []).reduce((s,a)=>s+(a.distance ?? 0), 0) / 1000;
    await p.kv.set("km", km); return { km: Math.round(km*10)/10 };
  }
  await p.tools.register({ name:"week", execute:week });
  p.schedule({id:"tick",every_seconds:3600},()=>week().catch(()=>undefined));
}
