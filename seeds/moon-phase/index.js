export default async function init(p){
  function phase(){
    const d=new Date(); const y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate();
    const c=Math.floor((y-11)/19), e=Math.floor(((y%19)*11+m*2+day-c)%30);
    const idx=Math.floor(e/3.75)%8;
    const names=["new","wax-cres","1st-q","wax-gib","full","wan-gib","3rd-q","wan-cres"];
    const glyph=["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"];
    return {glyph:glyph[idx],name:names[idx]};
  }
  const refresh=async()=>{ await p.kv.set("phase",phase()); };
  await p.tools.register({name:"phase",description:"current moon phase",execute:async()=>phase()});
  p.schedule({id:"tick",every_seconds:3600},refresh);
  refresh();
}
