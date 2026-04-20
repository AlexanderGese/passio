export default async function init(p){
  await p.tools.register({ name:"check", description:"returns warning string if date is a Wednesday",
    execute: async ({ iso }) => {
      const d = new Date(iso); return { warn: d.getDay()===3 ? "Wednesday — protected no-meeting day." : null };
    }});
}
