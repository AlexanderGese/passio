export default async function init(p){
  await p.tools.register({ name:"list", description:"events for the coming 7 days",
    execute: async () => p.calendar.upcoming({ limit: 30, days: 7 }) });
}
