import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,key} from './helpers.js';
const nodes=w=>[w,...(w.children||[]).flatMap(nodes)];
const content=w=>nodes(w).filter(n=>n.type==='text').map(n=>n.text).join('');
const families=['systemSmall','systemMedium','systemLarge','systemExtraLarge','accessoryInline','accessoryCircular','accessoryRectangular'];
test('per-slot aliases truncate safely and phone suffix is explicitly opt-in across sizes',async()=>{
 for(const family of families)for(const value of [true,'true','on','1',false,'false','off','0',undefined,{},'invalid']){
  const m=mock();for(const p of phones)await capture(m,p);m.ctx.widgetFamily=family;
  m.ctx.env={CARD_SLOT:'2',CARD1_NAME:'不要选错',CARD2_NAME:'工作卡',SHOW_PHONE_SUFFIX:value};
  const w=await run(m.ctx),s=content(w);assert.ok(!JSON.stringify(w).includes(phones[1]));assert.ok(!s.includes('不要选错'));
  if(family!=='accessoryCircular'){assert.ok(s.includes('工作卡'));assert.equal(s.includes('· 尾号0002'),[true,'true','on','1'].includes(value));}
 }
 const m=mock();await capture(m);
 const s=content(await run({...m.ctx,env:{CARD1_NAME:'abcdefghijklmno'}}));assert.ok(s.includes('abcdefghijkl'));assert.ok(!s.includes('abcdefghijklm'));
 for(const name of [phones[0],'cookie=hidden','https://secret.invalid','\u202ehidden',{},''])assert.match(content(await run({...m.ctx,env:{CARD1_NAME:name}})),/卡1/);
});
test('A bill uses slot-colored dot, index-colored borderless capsules and no normal status decoration',async()=>{
 const colors=[];
 for(let slot=1;slot<=3;slot++){
  const m=mock();for(const p of phones)await capture(m,p);const w=await run({...m.ctx,env:{CARD_SLOT:String(slot)}});
  const dot=w.children[0].children[0];assert.equal(dot.width,6);assert.equal(dot.height,6);assert.equal(dot.borderRadius,3);colors.push(dot.backgroundColor.light);
  const c=nodes(w).filter(n=>n.borderRadius===14);assert.deepEqual(c.map(n=>n.backgroundColor.light),['#FFF1E5','#F2EDFF','#EAF4FF']);
  for(const n of c){assert.equal(n.borderWidth,undefined);assert.ok(n.backgroundColor.dark.endsWith('26'));}
  assert.ok(!content(w).includes('已更新'));assert.equal(w.children.length,2);assert.ok(!nodes(w).some(n=>n.height===3));
 }
 assert.equal(new Set(colors).size,3);
 const m=mock();await capture(m);const normal=m.ctx.http.get;m.ctx.http.get=async(u,o)=>{const r=await normal(u,o),d=await r.json();d.feeResource.dynamicFeeTitle='已用流量';d.voiceResource.dynamicVoiceTitle='剩余话费';return {status:200,json:async()=>d};};
 const w=await run(m.ctx);assert.deepEqual(nodes(w).filter(n=>n.borderRadius===14).map(n=>n.backgroundColor.light),['#FFF1E5','#F2EDFF','#EAF4FF']);
});
test('low balance is fee-only yuan-only strict threshold and negative balance remains valid',async()=>{
 for(const [value,unit,threshold,warning] of [['9.99','元',undefined,true],['10','元',undefined,false],['-1','元',undefined,true],['9','GB',undefined,false],['9','元','0',false],['9','元','8',false],['9','元','20',true],['9','元','invalid',true],['9','元','-2',true]]){
  const m=mock();await capture(m);const normal=m.ctx.http.get;m.ctx.http.get=async(u,o)=>{const r=await normal(u,o),d=await r.json();d.feeResource.feePersent=value;d.feeResource.newUnit=unit;d.voiceResource.voicePersent='1';d.flowResource.flowPersent='1';return {status:200,json:async()=>d};};
  const w=await run({...m.ctx,env:{LOW_BALANCE_THRESHOLD:threshold}}),c=nodes(w).filter(n=>n.borderRadius===14);
  assert.equal(c[0].backgroundColor.light,warning?'#FDE9E7':'#FFF1E5');assert.equal(c[1].backgroundColor.light,'#F2EDFF');assert.equal(c[2].backgroundColor.light,'#EAF4FF');
  const number=nodes(c[0]).find(n=>n.text===value);assert.equal(number.textColor.light,warning?'#B83A32':'#1C1C1E');
 }
});
test('cache fallback preserves original success time and hourly scheduling without touching credentials',async()=>{
 const m=mock();await capture(m);await run(m.ctx);const r=m.ctx.storage.getJSON(key(phones[0])),time=Date.now()-2*3600000;
 m.ctx.storage.setJSON(key(phones[0]),{...r,updatedAt:time});const before=[...m.db];m.ctx.http.get=async()=>{throw Error('private '+phones[0]);};
 const w=await run(m.ctx);assert.match(content(w),/缓存（查询失败）/);assert.ok(content(w).includes(new Date(time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'})));assert.deepEqual([...m.db],before);
 assert.ok(Math.abs(Date.parse(w.refreshAfter)-Date.now()-3600000)<1000);
});
test('lock fee warning leaves flow and voice normal and circular focuses exact flow label',async()=>{
 for(const family of families.filter(f=>f.startsWith('accessory'))){const m=mock();await capture(m);m.ctx.widgetFamily=family;const normal=m.ctx.http.get;m.ctx.http.get=async(u,o)=>{const r=await normal(u,o),d=await r.json();d.feeResource.feePersent='-1';d.flowResource.dynamicFlowTitle='已用流量';return {status:200,json:async()=>d};};
 const w=await run(m.ctx);if(family!=='accessoryCircular')assert.ok(nodes(w).some(n=>n.text?.includes('-1元')&&n.textColor.light==='#B83A32'));else assert.ok(!content(w).includes('-1元'));assert.match(content(w),/已用流量/);
 }
});
test('small heading constrains long title alias and suffix without losing success time',async()=>{
 const m=mock();await capture(m);m.ctx.widgetFamily='systemSmall';m.ctx.env={WIDGET_TITLE:'标题'.repeat(12),CARD1_NAME:'工作联通'.repeat(5),SHOW_PHONE_SUFFIX:'true'};
 const w=await run(m.ctx),heading=w.children[0],label=heading.children[1];assert.equal(label.flex,1);assert.equal(label.maxLines,1);assert.ok(label.minScale>0);assert.equal(heading.children[2].text,'· 尾号0001');assert.equal(heading.children[2].minScale,1);assert.match(heading.children.at(-1).text,/^\d{2}:\d{2}$/);assert.ok(!JSON.stringify(w).includes(phones[0]));
});
test('normal light and dark capsule text meets contrast on opaque widget base',async()=>{
 const rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
 const lum=c=>c.map(v=>{const s=v/255;return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[0.2126,0.7152,0.0722][i],0);
 const m=mock();await capture(m);const w=await run(m.ctx);
 for(const c of nodes(w).filter(n=>n.borderRadius===14))for(const mode of ['light','dark']){
  const bg=c.backgroundColor[mode],a=bg.length===9?parseInt(bg.slice(7),16)/255:1,base=rgb(w.backgroundColor[mode]),blend=rgb(bg).map((v,i)=>v*a+base[i]*(1-a));
  for(const n of nodes(c).filter(n=>n.type==='text')){const x=lum(rgb(n.textColor[mode])),y=lum(blend);assert.ok((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)>=4.5);}
 }
});
export {nodes,content,families};
