export default async function init(p){
  await p.tools.register({ name:"toggle", execute: async () => {
    let tok=null; try{ tok = await p.secrets.get("token"); } catch {} if(!tok) return { ok:false, reason:"set slack token" };
    const text = (await p.kv.get("status")) ?? "Heads down";
    const r = await p.net.fetch("https://slack.com/api/users.profile.set",{ method:"POST",
      init:{ headers:{ "Authorization":"Bearer "+tok, "content-type":"application/json; charset=utf-8" },
      body: JSON.stringify({ profile: { status_text: text, status_emoji: ":brain:", status_expiration: Math.floor(Date.now()/1000)+30*60 } }) } });
    return { ok: r.ok };
  }});
}
