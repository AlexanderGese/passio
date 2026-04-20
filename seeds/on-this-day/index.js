export default async function init(p){
  await p.tools.register({ name:"today", execute: async () => ({ stub:true, note:"hooks into vault search for notes whose filename contains YYYY-MM-DD pattern from prior years" }) });
}
