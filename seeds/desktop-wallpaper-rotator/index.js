export default async function init(p){
  await p.tools.register({ name:"next", execute: async () => ({ stub:true, note:"requires shell allowlist entry for feh/swaybg/gsettings" }) });
}
