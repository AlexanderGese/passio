export default async function init(p){
  await p.tools.register({ name:"run", execute: async () => ({ stub:true }) });
}
