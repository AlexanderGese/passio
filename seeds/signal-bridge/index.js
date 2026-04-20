export default async function init(p){
  await p.tools.register({ name:"send", description:"Send a message to your Signal number (self)",
    input:{ type:"object", properties:{ text:{ type:"string" } } },
    execute: async ({ text }) => {
      const url=(await p.kv.get("daemon_url"))??"http://127.0.0.1:8080"; const num=await p.kv.get("number");
      if(!num) return { ok:false, reason:"set your Signal number" };
      const r = await p.net.fetch(url+"/v2/send",{ method:"POST", init:{ headers:{ "content-type":"application/json" }, body: JSON.stringify({ message:text, number:num, recipients:[num] }) } });
      return { ok: r.ok };
    }});
}
