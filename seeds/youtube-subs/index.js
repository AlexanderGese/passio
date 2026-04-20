export default async function init(p){
  async function check(){
    const ids = ((await p.kv.get("channels")) ?? "").split(",").map(s=>s.trim()).filter(Boolean);
    const out = [];
    for(const id of ids){
      try {
        const r = await p.net.fetch("https://www.youtube.com/feeds/videos.xml?channel_id="+id);
        const xml = await r.text();
        const m = xml.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<link[^>]*href="([^"]+)"/);
        if(m) out.push({ channel:id, title:m[1], url:m[2] });
      } catch {}
    }
    await p.kv.set("items", out);
    return { items: out };
  }
  await p.tools.register({ name:"check", description:"poll for latest videos", execute:check });
  p.schedule({id:"tick",every_seconds:3600},()=>check().catch(()=>undefined));
}
