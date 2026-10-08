import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture} from './helpers.js';
const nodes=w=>[w,...(w.children||[]).flatMap(nodes)];
const texts=w=>nodes(w).filter(n=>n.type==='text');
test('dynamic used and remaining labels are medium and brighter with exact decimal units',async()=>{
 for(const label of ['已用通用流量','剩余通用流量']){
  const m=mock();await capture(m);const normal=m.ctx.http.get;m.ctx.http.get=async(u,o)=>{const r=await normal(u,o),d=await r.json();d.flowResource.dynamicFlowTitle=label;d.flowResource.flowPersent='123.4500';return {status:200,json:async()=>d};};
  const w=await run(m.ctx),t=texts(w),n=t.find(n=>n.text===label);assert.equal(n.font.weight,'medium');assert.equal(n.textColor.light,'#51515A');assert.equal(n.textColor.dark,'#D8D8DF');assert.ok(t.some(n=>n.text==='123.4500'));assert.ok(t.some(n=>n.text==='GB'));
 }
});
test('identity first heading protects separate suffix and timestamp without dropping explicit title',async()=>{
 for(const family of ['systemSmall','systemMedium','systemLarge','systemExtraLarge','accessoryInline','accessoryRectangular']){
  const m=mock();await capture(m);m.ctx.widgetFamily=family;
  const w=await run({...m.ctx,env:{CARD1_NAME:'双不限套餐长别名测试',SHOW_PHONE_SUFFIX:'true'}}),t=texts(w);
  assert.ok(!t.some(n=>n.text.includes('中国联通')));assert.ok(t.some(n=>n.text==='· 尾号0001'));assert.ok(!t.some(n=>n.text.includes('··')));
  const suffix=t.find(n=>n.text==='· 尾号0001');assert.equal(suffix.flex,undefined);assert.equal(suffix.minScale,1);
  if(!family.startsWith('accessory')){const h=w.children[0],time=h.children.at(-1);assert.match(time.text,/^\d{2}:\d{2} · 更新$/);assert.equal(time.font.size,10);assert.equal(time.minScale,0.55);assert.ok(!h.children.some(n=>n.type==='spacer'));if(family==='systemSmall')assert.ok(Array.from(h.children[1].text).length<=5);}
  const custom=await run({...m.ctx,env:{WIDGET_TITLE:'我的账单',SHOW_BRAND:'true',CARD1_NAME:'工作卡'}});assert.ok(texts(custom).some(n=>n.text.includes('我的账单')));assert.ok(!texts(custom).some(n=>n.text.includes('中国联通')));
  const branded=await run({...m.ctx,env:{SHOW_BRAND:'true',CARD1_NAME:'工作卡'}});assert.ok(texts(branded).some(n=>n.text.includes('中国联通')));
 }
});
test('inline empty state stays one row while rectangular and circular stay compact',async()=>{
 const m=mock();const w=await run({...m.ctx,widgetFamily:'accessoryInline'});assert.equal(w.children.length,1);assert.equal(w.children[0].direction,'row');assert.ok(texts(w).some(n=>n.text==='待捕获'));
});
test('home layouts use compact balanced padding and no vertical flexible blank space',async()=>{
 for(const family of ['systemSmall','systemMedium','systemLarge','systemExtraLarge'])for(const data of [true,false]){
  const m=mock();if(data)await capture(m);m.ctx.widgetFamily=family;
  const w=await run(m.ctx);assert.deepEqual(w.padding,[8,12,8,12]);assert.equal(w.gap,6);
  assert.ok(!w.children.some(n=>n.type==='spacer'));assert.ok(!w.children.some(n=>n.height!==undefined));
 }
});
