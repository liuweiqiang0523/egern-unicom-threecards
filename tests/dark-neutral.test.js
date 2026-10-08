import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,cards} from './helpers.js';
const nodes=n=>[n,...(n.children||[]).flatMap(nodes)];
test('neutral summary surfaces, severity-only fee colors and 4pt theme bars preserve data and cache',async()=>{
 const m=mock();for(const p of phones)await capture(m,p);
 const fee=['89.30','2.10','7.20'],flow=['158.12','417.75','146.77'];
 m.ctx.http.get=async u=>{const i=phones.findIndex(p=>u.includes(p));return {status:200,json:async()=>({code:'Y',feeResource:{feePersent:fee[i],newUnit:'元',dynamicFeeTitle:'剩余话费'},voiceResource:{voicePersent:String(789+i),newUnit:'分钟'},flowResource:{flowPersent:flow[i],newUnit:'GB',dynamicFlowTitle:i?'已用通用流量':'剩余通用流量'}})};};
 const t=await run({...m.ctx,widgetFamily:'systemLarge',env:{VIEW:'all'}});
 assert.equal(t.backgroundColor.dark,'#17181B');
 assert.equal(t.children[0].children[0].color.dark,'#E84353');
 const badges=nodes(t).filter(n=>n.borderRadius===6&&n.children?.[0]?.text==='不限量');
 assert.equal(badges.length,2);
 for(const badge of badges){assert.equal(badge.backgroundColor.dark,'#292B30');assert.equal(badge.children[0].textColor.dark,'#C2C6CE');assert.equal(badge.children[0].font.size,6);}
 cards(t).forEach((c,i)=>{
  assert.equal(c.backgroundColor.dark,'#1D1F23');assert.equal(c.borderColor.dark,'#292B30');
  assert.equal(c.children.length,2);assert.equal(c.children[0].width,12);
  assert.equal(c.children[1].children[2].children.length,5);
  assert.ok(c.children[1].children[2].children.filter(n=>n.direction==='column').every(n=>!n.backgroundColor));
  const all=nodes(c);assert.equal(all.find(n=>n.text===fee[i]).textColor.dark,['#ECEEF2','#FF5C68','#D99A70'][i]);
  assert.equal(all.filter(n=>n.text===flow[i]).length,1);
  const bar=c.children[1].children[4].children[0];assert.equal(i?bar.children[0].height:bar.height,4);
 });
 const saved=structuredClone([1,2,3].map(i=>m.ctx.storage.getJSON('egern.unicom3.v1.slot.'+i)));
 await run({...m.ctx,widgetFamily:'systemLarge',env:{VIEW:'all',CARD_ORDER:'3,1,2'}});
 assert.deepEqual([1,2,3].map(i=>m.ctx.storage.getJSON('egern.unicom3.v1.slot.'+i)),saved,'a UI change cannot rewrite cache or credentials');
});
