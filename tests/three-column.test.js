import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,cardContent,cards} from './helpers.js';
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
  const rail=card.children[0],content=cardContent(card);
  const roomy=family!=='systemMedium';
  assert.equal(card.direction,'row');assert.equal(rail.width,roomy?undefined:2);
  assert.equal(roomy?card.backgroundGradient.colors[0].dark:rail.backgroundGradient.colors[1].dark,['#B66CFF','#5EA7FF','#48D7C0'][i]);
  const header=content.children[0],metrics=content.children[roomy?2:1],bottom=content.children[roomy?4:3];
  assert.equal(hasFlex(header),false,'identity must not absorb remaining card height');
  assert.equal(header.children.at(-1).text,new Date(records[i].updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'})+' · 有效缓存');
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
   assert.equal(rail.borderRadius,14);assert.equal(card.padding,2);assert.deepEqual(content.padding,[6,7,6,12]);
   assert.equal(content.children[1].height,8);assert.equal(content.children[3].height,5);assert.equal(content.children.length,5);assert.ok(content.height>70);
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
test('intentional diagnostic prefix and status-only single-card migration; flow metrics and bar remain byte-identical',()=>{
 const after=readFileSync('UnicomThreeCards.js','utf8');
 const hash=s=>createHash('sha256').update(s).digest('hex');
 for(const [a,b,want] of [['prefix',"// Egern's documented",'648cb852e5514623bc735c7359bb246750585505b2639bd0b4ba5eb37121171e'],['function flowBar','function balanceThreshold','5eb0c4fc0ccb08585230c38ee4cb9b6d8fdebc50964e7796a37401541c268c20'],['function flowMetrics','async function compactWidget','de21b19e29f61a47fb1caf405df6bedc4559e46a01e10ee65fcb125d9d652315'],['export default async function',null,'785414b25451ea67f5057e07259550d129cd258621f03cbf0ad9a9b8f2c1d14f']]){
  const chunk=a==='prefix'?after.slice(0,after.indexOf(b)):after.slice(after.indexOf(a),b?after.indexOf(b):undefined);
  assert.equal(hash(chunk),want,a);
 }
});
