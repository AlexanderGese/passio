export default async function init(p){
  async function run(){
    try {
      const r = await p.mail.unread(50);
      const emails = r.emails ?? [];
      const bySender = {}; for(const e of emails){ bySender[e.from] = (bySender[e.from]??0)+1; }
      const top = Object.entries(bySender).sort((a,b)=>b[1]-a[1]).slice(0,5);
      const body = [
        "# Mail digest " + new Date().toISOString().slice(0,10),
        "",
        "Unread: " + emails.length,
        "",
        "Top senders:",
        ...top.map(([n,c]) => "- " + n + " — " + c),
      ].join("\n");
      await p.notes.save({ title:"mail-digest-"+Date.now(), body, tags:"mail,digest" });
    } catch {}
  }
  await p.tools.register({ name:"run", description:"generate + save a digest", execute: async () => (await run(), { ok:true }) });
  p.schedule({id:"daily",every_seconds:86400},run);
}
