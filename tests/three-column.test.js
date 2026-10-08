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
 assert.match(t.children[0].children[0].src,/^data:image\/png;base64,/);
 assert.equal(t.children[0].children[1].textColor.dark,'#FFFFFF');
 cards(t).forEach((card,i)=>{
  const [rail,content]=card.children;
  const roomy=family!=='systemMedium';
  assert.equal(card.direction,'row');assert.equal(rail.width,roomy?3:2);
  assert.equal(roomy?rail.children[1].backgroundColor.dark:rail.backgroundGradient.colors[1].dark,['#B66CFF','#5EA7FF','#48D7C0'][i]);
  const header=content.children[0],metrics=content.children[roomy?2:1],bottom=content.children[roomy?4:3];
  assert.equal(hasFlex(header),false,'identity must not absorb remaining card height');
  assert.equal(header.children.at(-1).text,new Date(records[i].updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}));
  assert.equal(metrics.children.length,roomy?5:3);assert.equal(metrics.direction,'row');
  metrics.children.filter(col=>col.direction==='column').forEach((col,j)=>{
   assert.equal(col.direction,'column');assert.equal(col.flex,roomy&&j===2?1.25:1);assert.ok(!col.backgroundColor);
   assert.ok(nodes(col.children[0]).some(n=>n.text===records[i].data[j].title));
   assert.equal(col.children[1].children[0].text,records[i].data[j].value);
   assert.equal(col.children[1].children[1].text,records[i].data[j].unit);
  });
  assert.equal(nodes(card).filter(n=>n.text===records[i].data[2].value).length,1);
  if(roomy){
   assert.equal(card.height,undefined);assert.equal(card.flex,1);
   assert.equal(rail.height,undefined);assert.equal(card.padding,0);assert.deepEqual(content.padding,[6,8,6,10]);
   assert.equal(content.children[1].flex,1);assert.equal(content.children[1].children[0].height,7);assert.equal(content.children[3].height,5);assert.equal(content.children[5].flex,1);
   assert.ok(!content.children.some(n=>n.type==='spacer'),'no floor-pinned whitespace');
   const col=metrics.children[4];assert.ok(col.children[1].children[0].font.size>header.children[1].font.size);
   assert.ok(header.children[1].font.size>nodes(col.children[0]).find(n=>n.type==='text').font.size);
   assert.ok(nodes(col.children[0]).find(n=>n.type==='text').font.size>header.children.at(-1).font.size);
   if(nodes(col).some(n=>n.text==='不限量'))assert.equal(col.children[1].children.at(-1).children[0].text,'不限量');
  }else assert.equal(content.children[2].type,'spacer');
  assert.equal(bottom.children.length,1);
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
