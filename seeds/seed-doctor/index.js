export default async function init(p){
  await p.tools.register({ name:"scan", execute: async () => ({ stub:true, note:"future: analyse passio.seed.logs for net/secret calls vs declared permissions" }) });
}
