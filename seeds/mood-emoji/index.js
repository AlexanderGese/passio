export default async function init(p){
  await p.tools.register({ name:"cycle", execute: async () => { const opts=["🍇","🌱","✨","🎈"]; const i=((await p.kv.get("i"))??0)+1; await p.kv.set("i", i); return { emoji: opts[i%opts.length] }; } });
}
