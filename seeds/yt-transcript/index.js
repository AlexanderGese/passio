export default async function init(p){
  await p.tools.register({ name:"grab", description:"save transcript for a YouTube URL",
    execute: async ({ url }) => {
      const id = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
      if(!id) return { ok:false, reason:"not a YT URL" };
      const r = await p.net.fetch("https://www.youtube.com/api/timedtext?lang=en&v="+id);
      const xml = await r.text();
      const lines = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map(m=>m[1].replace(/&amp;/g,"&").replace(/&quot;/g,"\"").trim()).join("\n");
      if(!lines) return { ok:false, reason:"no English captions" };
      await p.notes.save({ title:"yt-"+id, body:"Source: " + url + "\n\n" + lines, tags:"youtube,transcript" });
      return { ok:true };
    }});
}
