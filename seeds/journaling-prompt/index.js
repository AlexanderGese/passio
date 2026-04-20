export default async function init(p){
  const prompts = ["What surprised you today?","What drained you?","Who helped you?","What would you redo?","What do you avoid?","What fed you?","What did you finish?"];
  await p.tools.register({ name:"today", execute: async () => { const idx = new Date().getDate() % prompts.length; return { prompt: prompts[idx] }; } });
  await p.tools.register({ name:"answer", execute: async ({ text }) => { const d=new Date().toISOString().slice(0,10); await p.notes.save({ title:"journal-"+d, body:"Prompt: "+(prompts[new Date().getDate()%prompts.length])+"\n\n"+text, tags:"journal" }); return { ok:true }; } });
}
