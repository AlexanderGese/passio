export default async function init(p){
  await p.tools.register({ name:"draft", description:"draft a PR description",
    execute: async ({ diff }) => ({ prompt: "Write a PR description with Summary / Changes / Testing / Risk sections for this diff:\n" + String(diff).slice(0,12000) }) });
}
