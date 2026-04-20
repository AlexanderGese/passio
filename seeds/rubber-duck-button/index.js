export default async function init(p){
  await p.tools.register({ name:"log", execute: async ({ text }) => {
    await p.notes.save({ title:"duck-"+Date.now(), body: "Explaining: " + text, tags:"duck" });
    return { ok:true };
  }});
}
