export default async function init(p){
  await p.tools.register({ name:"add", description:"{ term, def }",
    execute: async ({ term, def }) => {
      const g = (await p.kv.get("g")) ?? {}; g[term.toLowerCase()] = def; await p.kv.set("g", g); return { ok:true, size:Object.keys(g).length };
    }});
  await p.tools.register({ name:"list", execute: async () => ({ terms: await p.kv.get("g") ?? {} }) });
}
