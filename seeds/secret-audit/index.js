export default async function init(p){
  await p.tools.register({ name:"scan", execute: async () => ({ stub:true, note:"searches vault for sk_*, AKIA*, -----BEGIN patterns" }) });
}
