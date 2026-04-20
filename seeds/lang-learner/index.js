export default async function init(p){
  const decks = {
    rust: [["fn","define function"],["mut","mutable binding"],["&","borrow"],["Result<T,E>","ok/err return"]],
    typescript: [["interface","structural type"],["as const","literal widening off"],["keyof T","keys of a type"]],
    python: [["yield","generator produce"],["__init__","ctor"],["list comprehension","[x for x in …]"]],
    go: [["chan","channel type"],["defer","run on return"],["goroutine","go fn()"]]
  };
  await p.tools.register({ name:"next", description:"next card",
    execute: async () => {
      const lang = (await p.kv.get("lang")) ?? "rust";
      const deck = decks[lang] ?? decks.rust;
      const card = deck[Math.floor(Math.random()*deck.length)];
      return { q: card[0], a: card[1] };
    }});
  await p.tools.register({ name:"grade", description:"record grade 0-3",
    execute: async ({ grade }) => { const log = (await p.kv.get("log")) ?? []; log.push({ ts:Date.now(), grade }); await p.kv.set("log", log); return { ok:true }; }});
}
