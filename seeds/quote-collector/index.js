export default async function init(p){
  await p.tools.register({ name:"add", description:"save a quote {text,author,source?}",
    execute: async ({ text, author, source }) => {
      const body = "> " + text + "\n\n— " + (author ?? "?") + (source ? "\n(" + source + ")" : "");
      await p.notes.save({ title: "quote-" + (author ?? "anon").slice(0,30), body, tags:"quote" });
      return { ok:true };
    }});
}
