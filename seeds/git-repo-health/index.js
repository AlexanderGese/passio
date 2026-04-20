export default async function init(p){
  await p.tools.register({ name:"scan", description:"summarize git state of a path",
    execute: async () => ({ stub:true, note:"Requires trusted:true + a shell wrapper. Enable in Settings then reinstall." }) });
}
