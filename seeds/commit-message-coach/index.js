export default async function init(p){
  await p.tools.register({ name:"draft", description:"draft a conventional-commit message from a diff",
    execute: async ({ diff }) => {
      const prompt = "Given this git diff, write ONE conventional-commit message line (type(scope?): subject). Diff:\n" + String(diff).slice(0,6000);
      // Passio exposes notes; we use .notes.save to stash the prompt for the agent to pick up — simplest bridge for a seed.
      return { prompt }; // user pastes into chat for actual drafting
    }});
}
