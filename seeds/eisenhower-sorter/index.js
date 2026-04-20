export default async function init(p){
  await p.tools.register({ name:"sort", description:"classify todo text into Eisenhower quadrant",
    execute: async ({ text }) => {
      const urgent = /\b(today|asap|now|urgent|due|by eod)\b/i.test(text);
      const important = /\b(goal|key|critical|strategic|important)\b/i.test(text);
      return { quadrant: urgent && important ? "do" : !urgent && important ? "schedule" : urgent && !important ? "delegate" : "delete" };
    }});
}
