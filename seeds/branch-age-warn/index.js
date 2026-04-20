export default async function init(p){
  await p.tools.register({ name:"scan", description:"list old branches (stub, trusted)",
    execute: async () => ({ stub:true }) });
}
