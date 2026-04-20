export default async function init(p){
  await p.tools.register({ name: "toggle", description: "toggle pomodoro",
    execute: async () => {
      const state = (await p.kv.get("state")) ?? { active:false, startedAt:null };
      const next = state.active ? { active:false, startedAt:null } : { active:true, startedAt: Date.now() };
      await p.kv.set("state", next);
      return next;
    }});
}
