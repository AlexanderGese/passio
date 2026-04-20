export default async function init(p){
  await p.tools.register({ name:"save", description:"save a highlight {text,source}",
    execute: async ({ text, source }) => {
      const title = "highlights-" + (source?.split("/")[2] ?? "misc");
      await p.notes.save({ title, body: "- " + text + " (" + (source??"?") + ")\n", tags:"highlight" });
      return { ok:true };
    }});
}
