export default async function init(p){ await p.tools.register({ name:"lint", execute: async () => ({ stub:true }) }); }
