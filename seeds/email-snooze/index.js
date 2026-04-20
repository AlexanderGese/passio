export default async function init(p){
  await p.tools.register({ name:"snooze", description:"stub — label this message id with 'Snoozed/<untilISO>' so IMAP can resurface",
    execute: async ({ id, untilISO }) => ({ ok:true, stub:true, id, untilISO }) });
}
