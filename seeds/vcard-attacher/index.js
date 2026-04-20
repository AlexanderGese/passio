export default async function init(p){
  await p.tools.register({ name:"append", description:"append signature to a body",
    execute: async ({ body }) => {
      const sig = (await p.kv.get("signature")) ?? "";
      if(!sig) return { body };
      return { body: body.replace(/\s+$/,"") + "\n\n" + sig };
    }});
}
