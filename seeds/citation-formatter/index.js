export default async function init(p){
  await p.tools.register({ name:"format", description:"{ doi, style: 'apa'|'mla'|'bibtex' }",
    execute: async ({ doi, style = "apa" }) => {
      const r = await p.net.fetch("https://api.crossref.org/works/"+encodeURIComponent(doi)+"/transform/text/x-"+style);
      return { citation: await r.text() };
    }});
}
