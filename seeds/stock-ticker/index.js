export default async function init(p){
  async function quote(){
    const sym = (await p.kv.get("symbol")) ?? "AAPL";
    const r = await p.net.fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+sym+"?interval=1d&range=2d");
    const body = await r.json();
    const result = body?.chart?.result?.[0];
    const close = result?.meta?.regularMarketPrice;
    const prev  = result?.meta?.chartPreviousClose;
    const pct = prev ? ((close-prev)/prev)*100 : 0;
    const snap = { symbol: sym, close, pct };
    await p.kv.set("last", snap);
    return snap;
  }
  await p.tools.register({ name: "quote", description: "current quote", execute: quote });
  p.schedule({id:"tick",every_seconds:300},()=>quote().catch(()=>undefined));
  quote().catch(()=>undefined);
}
