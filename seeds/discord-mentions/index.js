export default async function init(p){
  await p.tools.register({ name:"check", description:"unimplemented stub — configure token + add your server fetch", execute: async () => ({ stub:true }) });
}
