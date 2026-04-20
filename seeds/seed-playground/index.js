export default async function init(p){
  await p.tools.register({ name:"echo", description:"echo with timestamp", execute: async (args) => ({ args, at: new Date().toISOString() }) });
}
