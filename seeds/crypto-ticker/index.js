export default async function init(p){
  async function price(){
    const coin = (await p.kv.get("coin")) ?? "bitcoin";
    const r = await p.net.fetch("https://api.coingecko.com/api/v3/simple/price?ids="+coin+"&vs_currencies=usd&include_24hr_change=true");
    const body = await r.json(); const q = body[coin] ?? {};
    const snap = { coin, usd: q.usd, change: q.usd_24h_change };
    await p.kv.set("last", snap);
    return snap;
  }
  await p.tools.register({ name: "price", description: "latest price", execute: price });
  p.schedule({id:"tick",every_seconds:60},()=>price().catch(()=>undefined));
  price().catch(()=>undefined);
}
