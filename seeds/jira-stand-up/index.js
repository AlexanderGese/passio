export default async function init(p){
  await p.tools.register({ name:"check", execute: async () => ({ stub:true }) });
}
