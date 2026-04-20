export default async function init(p){
  async function now(){
    let tok=null; try{ tok=await p.secrets.get("spotify_token"); } catch {} if(!tok) return { track:null };
    try { const r = await p.net.fetch("https://api.spotify.com/v1/me/player/currently-playing",{ init:{ headers:{ Authorization:"Bearer "+tok } } });
      if(r.status===204) return { track:null };
      const b = await r.json();
      return { track: b?.item ? { title:b.item.name, artist:b.item.artists?.[0]?.name, uri:b.item.uri } : null };
    } catch { return { track:null }; }
  }
  await p.tools.register({ name:"now", execute:now });
  await p.tools.register({ name:"like", execute: async () => ({ stub:true }) });
  p.schedule({id:"tick",every_seconds:30},()=>now().catch(()=>undefined));
}
