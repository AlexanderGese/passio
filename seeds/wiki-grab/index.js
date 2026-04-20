export default async function init(p){
  await p.tools.register({ name:"grab", description:"fetch URL and save as a note (raw HTML → the agent distills later)",
    execute: async ({ url }) => {
      const r = await p.net.fetch(url); const html = (await r.text()).slice(0,40000);
      const title = (html.match(/<title>([^<]+)/i)?.[1] ?? url).trim().slice(0,80);
      await p.notes.save({ title: "web-"+title, body: "Source: " + url + "\n\n" + html.replace(/<[^>]+>/g,"").replace(/\s+/g," ").slice(0,4000), tags:"web" });
      return { ok:true };
    }});
}
