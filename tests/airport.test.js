import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones} from './helpers.js';
const texts=n=>[...(n.type==='text'?[n.text]:[]),...(n.children||[]).flatMap(texts)];
const nodes=n=>[n,...(n.children||[]).flatMap(nodes)];
const allowed={widget:['type','children','backgroundColor','padding','gap','refreshAfter'],stack:['type','direction','alignItems','gap','children','flex','padding','backgroundColor','borderRadius','borderWidth','borderColor','width','height'],text:['type','text','font','textColor','maxLines','minScale','flex','textAlign'],image:['type','src','color','width','height'],spacer:['type','length','flex']};
const used={flowPersent:'407.44',newUnit:'GB',dynamicFlowTitle:'已用通用流量'};
const remaining={flowPersent:'158.17',newUnit:'GB',dynamicFlowTitle:'剩余通用流量'};
async function setup(flow){
 const m=mock();for(const p of phones) await capture(m,p);
 m.ctx.http.get=async u=>{m.calls.push({u,o:{}});return {status:200,json:async()=>({code:'Y',feeResource:{feePersent:'12.34',newUnit:'元'},voiceResource:{voicePersent:'56',newUnit:'分钟'},flowResource:flow})};};
 return m;
}
test('unlimited cards need no configuration and never show a percentage',async()=>{
 const m=await setup(used);
 const t=await run({...m.ctx,env:{VIEW:'all'}}),s=texts(t).join('|');
 assert.ok(s.includes('不限'));assert.ok(!s.includes('%'));
 assert.equal(texts(t).filter(x=>x==='407.44').length,3);
 assert.equal(m.calls.length,3);
 for(const card of t.children){assert.equal(card.children[1].height,2);assert.deepEqual(card.children[1].children,[]);}
});
test('a configured total produces a real fill and a real percentage',async()=>{
 const m=await setup(remaining);
 const t=await run({...m.ctx,env:{VIEW:'all',CARD2_TOTAL:'500GB'}});
 const bar=t.children[1].children[1];
 assert.equal(bar.height,4);assert.equal(bar.children.length,2);
 assert.equal(bar.children[0].flex,684);assert.equal(bar.children[1].flex,316);
 assert.ok(texts(t).includes('68%'));assert.ok(!texts(t).includes('不限'));
 // untouched cards keep the plain separator
 assert.equal(t.children[0].children[1].height,2);assert.equal(t.children[2].children[1].height,2);
});
test('used semantics compute the ratio from the used value, remaining from the gap',async()=>{
 const m=await setup(used);
 const t=await run({...m.ctx,env:{VIEW:'all',CARD1_TOTAL:'1000GB'}});
 assert.ok(texts(t).includes('41%'));
 const bar=t.children[0].children[1];assert.equal(bar.children[0].flex,407);assert.equal(bar.children[1].flex,593);
});
test('totals accept a bare number in the display unit and normalize other units',async()=>{
 for(const spec of ['500','500GB','0.5TB']){
  const m=await setup(remaining);
  const t=await run({...m.ctx,env:{VIEW:'all',CARD1_TOTAL:spec}});
  const tag=texts(t).find(x=>x.endsWith('%'));
  assert.ok(tag,'no percentage for '+spec);
  assert.equal(t.children[0].children[1].height,4);
 }
});
test('removing or breaking the total falls back to a separator, never a guess',async()=>{
 for(const spec of [undefined,'','abc','0','-5','500GB extra','1e9','1.2.3GB',{},'   ']){
  const m=await setup(remaining);
  const t=await run({...m.ctx,env:{VIEW:'all',CARD1_TOTAL:spec}});
  assert.ok(!texts(t).join('|').includes('%'),JSON.stringify(spec));
  assert.equal(t.children[0].children[1].height,2);
  assert.deepEqual(t.children[0].children[1].children,[]);
 }
});
test('remaining values render green and used values do not',async()=>{
 const m=await setup(remaining);
 const t=await run({...m.ctx,env:{VIEW:'all'}});
 const big=t.children[1].children[0].children.find(n=>n.type==='text'&&n.text==='158.17');
 assert.equal(big.textColor.dark,'#31D05A');
 const m2=await setup(used);
 const t2=await run({...m2.ctx,env:{VIEW:'all'}});
 const big2=t2.children[0].children[0].children.find(n=>n.type==='text'&&n.text==='407.44');
 assert.notEqual(big2.textColor.dark,'#31D05A');
});
test('airport layout stays within documented DSL and leaks nothing on every home size',async()=>{
 for(const family of ['systemSmall','systemMedium','systemLarge','systemExtraLarge']){
  const m=await setup(remaining);
  const t=await run({...m.ctx,widgetFamily:family,env:{VIEW:'all',CARD2_TOTAL:'500GB',SHOW_PHONE_SUFFIX:'true'}});
  for(const n of nodes(t))for(const attr of Object.keys(n))assert.ok(allowed[n.type].includes(attr),family+' unsupported '+n.type+'.'+attr);
  const s=texts(t).join('|');
  assert.ok(s.includes('卡1')&&s.includes('卡2')&&s.includes('卡3'),family+' dropped a card');
  for(const p of phones)assert.ok(!s.includes(p),family+' leaked a phone number');
 }
});
test('lock-screen summaries stay bounded and never show a fake ratio',async()=>{
 for(const family of ['accessoryInline','accessoryCircular','accessoryRectangular']){
  const m=await setup(remaining);
  const t=await run({...m.ctx,widgetFamily:family,env:{VIEW:'all',CARD1_TOTAL:'500GB'}});
  assert.ok(!texts(t).join('|').includes('%'),family);
  assert.ok(t.padding<=4);assert.ok(t.gap<=2);
 }
});
