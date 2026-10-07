import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,cards} from './helpers.js';
const nodes=n=>[n,...(n.children||[]).flatMap(nodes)];
const ink={light:'#202329',dark:'#ECEEF2'},muted={light:'#626975',dark:'#989EA9'};
for(const family of ['systemMedium','systemLarge','systemExtraLarge','systemSmall']) test('consistent digits/units and soft unchanged rails in '+family,async()=>{
 const m=mock();for(const p of phones)await capture(m,p);
 const t=await run({...m.ctx,widgetFamily:family,env:{VIEW:'all',LOW_BALANCE_THRESHOLD:'0'}});
 cards(t).forEach((c,i)=>{
  const rail=c.children[0],g=rail.backgroundGradient;
  assert.equal(rail.width,2);assert.equal(rail.height,family==='systemSmall'?26:family==='systemMedium'?30:60);assert.equal(rail.borderRadius,rail.width/2);
  assert.equal(g.type,'linear');assert.deepEqual(g.startPoint,{x:0.5,y:0});assert.deepEqual(g.endPoint,{x:0.5,y:1});assert.deepEqual(g.stops,[0,0.5,1]);
  assert.equal(g.colors[1].dark,['#B66CFF','#5EA7FF','#48D7C0'][i]);
  for(const mode of ['light','dark']){assert.equal(g.colors[0][mode],g.colors[1][mode]+'26');assert.equal(g.colors[2][mode],g.colors[0][mode]);}
  const data=m.ctx.storage.getJSON('egern.unicom3.v1.slot.'+(i+1)).data;
  for(const d of family==='systemSmall'?[data[2]]:data){assert.deepEqual(nodes(c).find(n=>n.text===d.value).textColor,ink);assert.ok(nodes(c).filter(n=>n.text===d.unit).every(n=>JSON.stringify(n.textColor)===JSON.stringify(muted)));}
 });
 for(const n of nodes(t))for(const key of Object.keys(n))assert.ok(!/shadow|blur/i.test(key));
});
test('fee warning thresholds retain coral and warm semantics; units never warn',async()=>{
 for(const [fee,want] of [['-1','#FF5C68'],['4.99','#FF5C68'],['5','#D99A70'],['9.99','#D99A70'],['10','#ECEEF2']]){
  const m=mock();for(const p of phones)await capture(m,p);
  await run({...m.ctx,env:{VIEW:'all'}});
  for(let i=1;i<=3;i++){const key='egern.unicom3.v1.slot.'+i,r=m.ctx.storage.getJSON(key);r.data[0].value=fee;m.ctx.storage.setJSON(key,r);}
  const t=await run({...m.ctx,widgetFamily:'systemLarge',env:{VIEW:'all',LOW_BALANCE_THRESHOLD:'10'}});
  for(const c of cards(t)){assert.equal(c.children[1].children[2].children[0].children[1].children[0].textColor.dark,want);assert.deepEqual(c.children[1].children[2].children[0].children[1].children[1].textColor,muted);}
 }
});
