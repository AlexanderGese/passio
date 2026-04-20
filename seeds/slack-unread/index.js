export default async function init(p){
  async function check(){
    let token=null; try{ token=await p.secrets.get("token"); } catch {}
    if(!token){ await p.kv.set("channels",[]); return { configured:false }; }
    const r = await p.net.fetch("https://slack.com/api/users.conversations?types=public_channel,private_channel,im&limit=100",{
      headers:{ "Authorization":"Bearer "+token }
    });
    const b = await r.json();
    const chans = (b.channels ?? []).filter(c=>c.unread_count>0).map(c=>({id:c.id,name:c.name||"dm",count:c.unread_count}));
    await p.kv.set("channels", chans);
    return { channels: chans };
  }
  await p.tools.register({ name:"check", description:"pull unread counts", execute:check });
  p.schedule({id:"tick",every_seconds:300},()=>check().catch(()=>undefined));
}
