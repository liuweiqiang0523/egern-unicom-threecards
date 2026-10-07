import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,cards} from './helpers.js';
const nodes=n=>[n,...(n.children||[]).flatMap(nodes)];
for(const family of ['systemMedium','systemLarge','systemExtraLarge']) test('three metric columns with a single flow value and bottom bar in '+family,async()=>{
 const m=mock();for(const p of phones)await capture(m,p);
 await run({...m.ctx,env:{VIEW:'all'}});
 const records=structuredClone([1,2,3].map(i=>m.ctx.storage.getJSON('egern.unicom3.v1.slot.'+i)));
 const t=await run({...m.ctx,widgetFamily:family,env:{VIEW:'all',SHOW_PHONE_SUFFIX:'true'}});
 for(const n of nodes(t))if(n.alignItems)assert.ok(['start','end','center'].includes(n.alignItems),'documented alignment only');
 const hasFlex=n=>!!n.flex||(n.children||[]).some(hasFlex);
 assert.equal(hasFlex(t.children[0]),false);
 assert.equal(t.children[0].children[0].src,'sf-symbol:simcard.fill');
 assert.equal(t.children[0].children[1].textColor.dark,'#FFFFFF');
 cards(t).forEach((card,i)=>{
  const [rail,content]=card.children;
  assert.equal(card.direction,'row');assert.equal(rail.width,2);assert.equal(rail.children.length,0);
  assert.equal(rail.backgroundColor.dark,['#B66CFF','#5EA7FF','#48D7C0'][i]);
  const [header,metrics,space,bottom]=content.children;
  assert.equal(hasFlex(header),false,'identity must not absorb remaining card height');
  assert.equal(header.children.at(-1).text,new Date(records[i].updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}));
  assert.equal(metrics.children.length,3);assert.equal(metrics.direction,'row');
  metrics.children.forEach((col,j)=>{
   assert.equal(col.direction,'column');assert.equal(col.flex,1);assert.ok(!col.backgroundColor);
   assert.ok(nodes(col.children[0]).some(n=>n.text===records[i].data[j].title));
   assert.equal(col.children[1].children[0].text,records[i].data[j].value);
   assert.equal(col.children[1].children[1].text,records[i].data[j].unit);
  });
  assert.equal(nodes(card).filter(n=>n.text===records[i].data[2].value).length,1);
  assert.equal(space.type,'spacer');assert.equal(bottom.children.length,1);
 });
 assert.equal(m.calls.length,3);assert.deepEqual([1,2,3].map(i=>m.ctx.storage.getJSON('egern.unicom3.v1.slot.'+i)),records);
});
test('visual migration leaves capture/load/query, bar metrics and single-card path byte-identical',()=>{
 const after=readFileSync('UnicomThreeCards.js','utf8');
 const hash=s=>createHash('sha256').update(s).digest('hex');
 for(const [a,b,want] of [['prefix',"// Egern's documented",'d4dfec86d038afccc2bb7203c21d28f832dce9469bcb65db6097b0e92e4cd768'],['function flowBar','function balanceThreshold','5eb0c4fc0ccb08585230c38ee4cb9b6d8fdebc50964e7796a37401541c268c20'],['function flowMetrics','async function compactWidget','de21b19e29f61a47fb1caf405df6bedc4559e46a01e10ee65fcb125d9d652315'],['export default async function',null,'8bfe45b2a22ff098f6624b03e7bbdacfb58fa8fa97f40e7fdd5156589a274e88']]){
  const chunk=a==='prefix'?after.slice(0,after.indexOf(b)):after.slice(after.indexOf(a),b?after.indexOf(b):undefined);
  assert.equal(hash(chunk),want,a);
 }
});
