export default async function init(p){
  await p.tools.register({ name:"scan", description:"npm outdated in path (stub, trusted)", execute: async () => ({ stub:true }) });
}
