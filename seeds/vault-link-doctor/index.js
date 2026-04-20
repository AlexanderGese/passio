export default async function init(p){
  await p.tools.register({ name:"scan", execute: async () => ({ stub:true, note:"iterates vault_notes.wikiLinks vs vault_notes.path" }) });
}
