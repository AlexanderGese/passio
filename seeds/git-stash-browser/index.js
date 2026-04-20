export default async function init(p){
  await p.tools.register({ name:"list", execute: async () => ({ stub:true }) });
  await p.tools.register({ name:"pop", execute: async () => ({ stub:true }) });
}
