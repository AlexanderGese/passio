export default async function init(p){
  await p.tools.register({ name:"start", description:"set/unset distracting blocks for N min",
    execute: async ({ minutes = 30 }) => { await p.kv.set("until", Date.now()+minutes*60_000); return { ok:true, until: Date.now()+minutes*60_000 }; } });
}
