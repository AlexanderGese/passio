export default async function init(p){
  await p.tools.register({ name:"match", description:"true/false: should we BCC for this recipient",
    execute: async ({ to }) => {
      const patt = ((await p.kv.get("patterns")) ?? "").split(",").map(s=>s.trim()).filter(Boolean);
      return { match: patt.some(pat => new RegExp(pat).test(to)) };
    }});
}
