export default async function init(p){
  await p.tools.register({ name:"list", description:"lists starred notes (stub — hooks up to vault tags)",
    execute: async () => ({ stub:true }) });
}
