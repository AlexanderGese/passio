export default async function init(p){
  await p.tools.register({ name:"open", execute: async () => ({ url: await p.kv.get("url") }) });
}
