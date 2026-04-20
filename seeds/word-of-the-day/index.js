export default async function init(p){
  async function today(){
    try { const r = await p.net.fetch("https://www.merriam-webster.com/wotd/feed/rss2"); const xml = await r.text();
      const m = xml.match(/<item>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<description>([\s\S]*?)<\/description>/);
      if(!m) return { word:null };
      const word = m[1].trim(); await p.kv.set("w", { word, ts:Date.now() }); return { word };
    } catch { return { word: null }; }
  }
  await p.tools.register({ name:"today", execute:today });
  p.schedule({id:"am",every_seconds:3600},async()=>{ const d=new Date(); if(d.getHours()===8 && d.getMinutes()<5) await today(); });
  today();
}
