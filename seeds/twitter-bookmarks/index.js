export default async function init(p){
  await p.tools.register({ name:"latest", description:"pull last N bookmarks",
    execute: async ({ limit = 10 } = {}) => {
      const u = await p.kv.get("bridge_url"); if(!u) return { items:[], reason:"set bridge_url" };
      const r = await p.net.fetch(u); const xml = await r.text();
      const items = [...xml.matchAll(/<item>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<link>([^<]+)<\/link>/g)]
        .slice(0,limit).map(m => ({ title:m[1], url:m[2] }));
      return { items };
    }});
}
