export default async function init(p){
  async function check(){
    let tok=null; try{ tok = await p.secrets.get("gh_token"); } catch {}
    if(!tok) return { mine:[], review:[], reason:"set secret gh_token" };
    const hdr = { "Authorization":"Bearer "+tok, "Accept":"application/vnd.github+json" };
    const [me, rr] = await Promise.all([
      p.net.fetch("https://api.github.com/search/issues?q=is:pr+author:@me+state:open",{ init:{ headers:hdr } }),
      p.net.fetch("https://api.github.com/search/issues?q=is:pr+review-requested:@me+state:open",{ init:{ headers:hdr } }),
    ]);
    const mine = ((await me.json()).items ?? []).map(x=>({title:x.title,url:x.html_url}));
    const review = ((await rr.json()).items ?? []).map(x=>({title:x.title,url:x.html_url}));
    await p.kv.set("snap", { mine, review });
    return { mine, review };
  }
  await p.tools.register({ name:"check", description:"refresh PR dashboard", execute:check });
  p.schedule({id:"tick",every_seconds:600},()=>check().catch(()=>undefined));
}
