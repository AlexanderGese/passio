export default async function init(p){
  await p.tools.register({ name:"ingest", description:"stub — delegate to passio.pdf.ingest",
    execute: async ({ path, title }) => ({ delegate:"passio.pdf.ingest", path, title }) });
}
