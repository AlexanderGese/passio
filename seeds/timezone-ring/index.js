export default async function init(p){
  p.schedule({id:"tick",every_seconds:30},()=>{});
}
