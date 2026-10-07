import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones} from './helpers.js';

const nodes=n=>[n,...(n.children||[]).flatMap(nodes)];
const texts=n=>[...(n.type==='text'?[n.text]:[]),...(n.children||[]).flatMap(texts)];
// Slot-tinted card wash (dark) identifies each card after CARD_ORDER rearranges the rows.
const cardDark=['#5AA9FF17','#BF5AF217','#38D6C017'];

test('every home summary card is one rounded slot-tinted block with a brighter 1px outline and card gap',async()=>{
 for(const family of ['systemSmall','systemMedium','systemLarge','systemExtraLarge']){
  const m=mock();for(const p of phones)await capture(m,p);
  const t=await run({...m.ctx,widgetFamily:family,env:{VIEW:'all'}});
  assert.equal(t.gap,9,family+' card gap');
  assert.equal(t.children.length,3,family);
  t.children.forEach((card,i)=>{
   assert.equal(card.type,'stack',family);
   assert.equal(card.borderRadius,16,family);
   assert.equal(card.borderWidth,1,family);
   assert.equal(card.backgroundColor.dark,cardDark[i],family);
   assert.equal(card.backgroundColor.light,['#2F7FE01A','#9B3FD61A','#12A5941A'][i],family);
   assert.equal(card.borderColor.dark,['#5AA9FF4D','#BF5AF24D','#38D6C04D'][i],family);
   // the dark wash must stay the specified subtle 0x14..0x1F range, not a solid fill
   const alpha=parseInt(card.backgroundColor.dark.slice(7),16);
   assert.ok(alpha>=0x14&&alpha<=0x1f,family+' alpha '+alpha);
   assert.ok(Array.isArray(card.padding),family);
  });
 }
});

test('CARD_ORDER=3,1,2 truly reorders the summary while slots and storage stay fixed',async()=>{
 const m=mock();for(const p of phones)await capture(m,p);
 const def=await run({...m.ctx,env:{VIEW:'all',CARD1_NAME:'AAA',CARD2_NAME:'BBB',CARD3_NAME:'CCC'}});
 assert.deepEqual(def.children.map(c=>c.backgroundColor.dark),cardDark,'default order 1,2,3');
 // Snapshot after the first query wrote its cache; reordering must not touch the records.
 const before=[1,2,3].map(i=>m.ctx.storage.getJSON('egern.unicom3.v1.slot.'+i));
 const rev=await run({...m.ctx,env:{VIEW:'all',CARD_ORDER:'3,1,2',CARD1_NAME:'AAA',CARD2_NAME:'BBB',CARD3_NAME:'CCC'}});
 assert.deepEqual(rev.children.map(c=>c.backgroundColor.dark),[cardDark[2],cardDark[0],cardDark[1]],'order 3,1,2');
 const s=texts(rev).join('|');
 assert.ok(s.indexOf('CCC')>=0&&s.indexOf('CCC')<s.indexOf('AAA')&&s.indexOf('AAA')<s.indexOf('BBB'),'alias text order');
 // Slots, storage keys and records are untouched by display order.
 assert.deepEqual([1,2,3].map(i=>m.ctx.storage.getJSON('egern.unicom3.v1.slot.'+i)),before);
 assert.ok(m.ctx.storage.getJSON('egern.unicom3.v1.slot.1').phone===phones[0]);
 // The single-card path ignores CARD_ORDER entirely.
 const one=await run({...m.ctx,env:{CARD_SLOT:'1',CARD_ORDER:'3,1,2'}});
 assert.equal(one.children[0].children[0].backgroundColor.light,'#2F7FE0');
 assert.ok(!texts(one).join('').includes('CCC'));
});

test('invalid or missing CARD_ORDER always falls back to 1,2,3',async()=>{
 for(const spec of ['1,1,2','4','3,2','',',,','a,b,c','1,2','1,2,3,4','7,8,9','123','1,2,2','1.5,2,3',{},'   ']){
  const m=mock();for(const p of phones)await capture(m,p);
  const t=await run({...m.ctx,env:{VIEW:'all',CARD_ORDER:spec}});
  assert.deepEqual(t.children.map(c=>c.backgroundColor.dark),cardDark,JSON.stringify(spec));
 }
 for(const [spec,order] of [['1,2,3',[0,1,2]],['2,3,1',[1,2,0]],['3,1,2',[2,0,1]],[' 3 , 1 , 2 ',[2,0,1]]]){
  const m=mock();for(const p of phones)await capture(m,p);
  const t=await run({...m.ctx,env:{VIEW:'all',CARD_ORDER:spec}});
  assert.deepEqual(t.children.map(c=>c.backgroundColor.dark),order.map(i=>cardDark[i]),JSON.stringify(spec));
 }
});

test('the summary keeps three cards and never leaks a phone number on every family',async()=>{
 for(const family of ['systemSmall','systemMedium','systemLarge','systemExtraLarge','accessoryInline','accessoryCircular','accessoryRectangular']){
  const m=mock();for(const p of phones)await capture(m,p);
  const t=await run({...m.ctx,widgetFamily:family,env:{VIEW:'all',CARD_ORDER:'3,1,2',CARD1_NAME:'AAA',SHOW_PHONE_SUFFIX:'true'}});
  const s=texts(t).join('|');
  // Inline/circular summarise by slot number; every other family keeps card1's alias.
  const numbered=family==='accessoryInline'||family==='accessoryCircular';
  assert.ok(s.includes('卡3'),family+' dropped card3');
  assert.ok(s.includes('卡2'),family+' dropped card2');
  assert.ok(s.includes(numbered?'卡1':'AAA'),family+' dropped card1');
  for(const p of phones)assert.ok(!s.includes(p),family+' leaked a phone number');
  assert.ok(!s.includes('%'),family);
 }
});

test('unlimited cards stay ∞ + 不限量 with no percentage and a low fee is still red',async()=>{
 const m=mock();for(const p of phones)await capture(m,p);
 m.ctx.http.get=async u=>{m.calls.push({u,o:{}});return {status:200,json:async()=>({code:'Y',feeResource:{feePersent:'2.10',newUnit:'元'},voiceResource:{voicePersent:'56',newUnit:'分钟'},flowResource:{flowPersent:'320.50',newUnit:'GB',dynamicFlowTitle:'已用流量'}})};};
 const t=await run({...m.ctx,env:{VIEW:'all'}});
 assert.equal(texts(t).filter(x=>x==='不限量').length,3);
 assert.equal(texts(t).filter(x=>x==='∞').length,3);
 assert.ok(!texts(t).join('|').includes('%'));
 assert.equal(nodes(t).find(n=>n.type==='text'&&n.text==='2.10').textColor.light,'#B83A32');
});
