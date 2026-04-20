export default async function init(p){
  await p.tools.register({ name:"load", execute: async () => ({ stub:true }) });
}
