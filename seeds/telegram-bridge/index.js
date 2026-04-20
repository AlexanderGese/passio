export default async function init(p){
  await p.tools.register({ name:"send", description:"Send a message to Telegram chat id",
    input:{ type:"object", properties:{ text:{ type:"string" } } },
    execute: async ({ text }) => {
      const bot = await p.secrets.get("bot_token"); const cid = await p.kv.get("chat_id");
      if(!bot||!cid) return { ok:false, reason:"configure bot_token + chat_id" };
      const r = await p.net.fetch("https://api.telegram.org/bot"+bot+"/sendMessage?chat_id="+cid+"&text="+encodeURIComponent(text));
      const b = await r.json();
      return { ok:b.ok===true };
    }});
}
