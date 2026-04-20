export default async function init(p){
  async function today(){
    let key=null; try{ key = await p.secrets.get("lastfm_key"); } catch {}
    const u = await p.kv.get("user"); if(!key || !u) return { scrobbles:null };
    const from = Math.floor(new Date().setHours(0,0,0,0)/1000);
    const r = await p.net.fetch("https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user="+encodeURIComponent(u)+"&from="+from+"&api_key="+key+"&format=json&limit=200");
    const b = await r.json(); const n = Number(b?.recenttracks?.["@attr"]?.total ?? 0);
    await p.kv.set("n", n);
    return { scrobbles: n };
  }
  await p.tools.register({ name:"today", execute:today });
  p.schedule({id:"tick",every_seconds:300},()=>today().catch(()=>undefined));
}
