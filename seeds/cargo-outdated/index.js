export default async function init(p){
  await p.tools.register({ name:"scan", description:"cargo outdated (stub, trusted)", execute: async () => ({ stub:true }) });
}
