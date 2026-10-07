import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones} from './helpers.js';
const texts=n=>[...(n.type==='text'?[n.text]:[]),...(n.children||[]).flatMap(texts)];
const nodes=n=>[n,...(n.children||[]).flatMap(nodes)];
const allowed={widget:['type','children','backgroundColor','padding','gap','refreshAfter'],stack:['type','direction','alignItems','gap','children','flex','padding','backgroundColor','backgroundGradient','borderRadius','borderWidth','borderColor','width','height'],text:['type','text','font','textColor','maxLines','minScale','flex','textAlign'],image:['type','src','color','width','height'],spacer:['type','length','flex']};
const used={flowPersent:'407.44',newUnit:'GB',dynamicFlowTitle:'已用通用流量'};
const remaining={flowPersent:'158.17',newUnit:'GB',dynamicFlowTitle:'剩余通用流量'};
const api=flow=>({code:'Y',feeResource:{feePersent:'12.34',newUnit:'元'},voiceResource:{voicePersent:'56',newUnit:'分钟'},flowResource:flow});
async function setup(flow){
 const m=mock();for(const p of phones) await capture(m,p);
 m.ctx.http.get=async u=>{m.calls.push({u,o:{}});return {status:200,json:async()=>api(flow)};};
 return m;
}
async function setupFlows(flows){
 const m=mock();for(const p of phones) await capture(m,p);
 m.ctx.http.get=async u=>{const i=phones.findIndex(p=>u.includes(p));m.calls.push({u,o:{}});return {status:200,json:async()=>api(flows[i])};};
 return m;
}
// The bar is always the last child of the flow capsule, which is the last child of the card.
const barOf=card=>card.children.at(-1).children.at(-1);
const hexRGB=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
function hsv(hex){const [r,g,b]=hexRGB(hex).map(v=>v/255);const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h=(h*60+360)%360;}return {h,d};}
function colorStrings(n){const out=[];const visit=v=>{if(typeof v==='string'){if(/^#[0-9A-Fa-f]{6,8}$/.test(v))out.push(v);}else if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')for(const x of Object.values(v))visit(x);};visit(n);return out;}
test('summary slot palette is blue/purple/cyan and no colour is yellow or orange',async()=>{
 const m=await setup(used);
 const t=await run({...m.ctx,env:{VIEW:'all'}});
 const dots=t.children.map(c=>c.children[0].children[0].backgroundColor);
 assert.deepEqual(dots.map(c=>c.dark),['#5AA9FF','#BF5AF2','#38D6C0']);
 assert.deepEqual(dots.map(c=>c.light),['#2F7FE0','#9B3FD6','#12A594']);
 assert.equal(new Set(dots.map(c=>c.dark)).size,3);
 for(const hex of colorStrings(t)){const {h,d}=hsv(hex);if(d>0.12)assert.ok(!(h>=18&&h<=72),'yellow/orange colour '+hex);}
});
test('unlimited cards need no configuration: gradient fade, ∞ and a 不限量 chip, never a percentage',async()=>{
 const m=await setup(used);
 const t=await run({...m.ctx,env:{VIEW:'all'}});
 const s=texts(t).join('|');
 assert.equal(m.calls.length,3);
 assert.equal(texts(t).filter(x=>x==='不限量').length,3);
 assert.equal(texts(t).filter(x=>x==='不限').length,0);
 assert.equal(texts(t).filter(x=>x==='∞').length,3);
 assert.equal(texts(t).filter(x=>x==='407.44').length,3);
 assert.ok(!s.includes('%'));
 for(const card of t.children){
  const cap=card.children.at(-1);
  assert.ok(texts(cap.children[0]).includes('不限量'),'chip label');
  const bar=barOf(card);
  assert.equal(bar.direction,'row');
  const track=bar.children[0];
  assert.equal(track.height,4);assert.equal(track.backgroundGradient.type,'linear');
  assert.equal(track.backgroundGradient.colors.length,2);
  assert.ok(track.backgroundGradient.colors[1].light.endsWith('00')&&track.backgroundGradient.colors[1].dark.endsWith('00'));
  assert.equal(bar.children[1].text,'∞');
 }
});
test('a configured total produces a real used/total ratio and still no percentage',async()=>{
 const m=await setup(remaining);
 const t=await run({...m.ctx,env:{VIEW:'all',CARD2_TOTAL:'500GB'}});
 const bar=barOf(t.children[1]);
 assert.equal(bar.height,4);assert.equal(bar.children.length,2);
 assert.equal(bar.children[0].flex,684);assert.equal(bar.children[1].flex,316);
 assert.equal(bar.children[0].backgroundGradient.type,'linear');
 assert.ok(!texts(t).join('|').includes('%'));
 assert.ok(!texts(t).includes('不限量'));
 // cards without a total keep a relative-length bar, never a bare empty track
 assert.equal(barOf(t.children[0]).height,4);
 assert.equal(barOf(t.children[2]).height,4);
});
test('used semantics compute the ratio from the used value',async()=>{
 const m=await setup(used);
 const t=await run({...m.ctx,env:{VIEW:'all',CARD1_TOTAL:'1000GB'}});
 const bar=barOf(t.children[0]);
 assert.equal(bar.children[0].flex,407);assert.equal(bar.children[1].flex,593);
 assert.ok(!texts(t).join('|').includes('%'));
});
test('totals accept a bare number in the display unit and normalize other units',async()=>{
 for(const [spec,flex] of [['500',684],['500GB',684],['0.5TB',691]]){
  const m=await setup(remaining);
  const t=await run({...m.ctx,env:{VIEW:'all',CARD1_TOTAL:spec}});
  const bar=barOf(t.children[0]);
  assert.equal(bar.height,4,spec);assert.equal(bar.children.length,2,spec);
  assert.equal(bar.children[0].flex,flex,spec);
 }
});
test('no total uses a relative length versus the largest same-caliber value of the three',async()=>{
 const flows=[{flowPersent:'100',newUnit:'GB',dynamicFlowTitle:'剩余通用流量'},{flowPersent:'200',newUnit:'GB',dynamicFlowTitle:'剩余通用流量'},{flowPersent:'50',newUnit:'GB',dynamicFlowTitle:'剩余通用流量'}];
 const m=await setupFlows(flows);
 const t=await run({...m.ctx,env:{VIEW:'all'}});
 const bars=t.children.map(barOf);
 assert.deepEqual(bars.map(b=>b.height),[4,4,4]);
 assert.equal(bars[0].children[0].flex,500);
 assert.equal(bars[1].children[0].flex,1000);
 assert.equal(bars[2].children[0].flex,250);
 assert.ok(!texts(t).join('|').includes('%'));
});
test('removing a configured total falls back from a real ratio to the relative length',async()=>{
 const flows=[{flowPersent:'100',newUnit:'GB',dynamicFlowTitle:'剩余通用流量'},{flowPersent:'200',newUnit:'GB',dynamicFlowTitle:'剩余通用流量'},{flowPersent:'50',newUnit:'GB',dynamicFlowTitle:'剩余通用流量'}];
 let m=await setupFlows(flows);
 let t=await run({...m.ctx,env:{VIEW:'all',CARD2_TOTAL:'500GB'}});
 assert.equal(barOf(t.children[1]).children[0].flex,600); // (500-200)/500 = 0.6
 m=await setupFlows(flows);
 t=await run({...m.ctx,env:{VIEW:'all',CARD2_TOTAL:''}});
 assert.equal(barOf(t.children[1]).children[0].flex,1000); // 200 is the max
});
test('an invalid or missing total never fakes a ratio or a 0% style',async()=>{
 for(const spec of [undefined,'','abc','0','-5','500GB extra','1e9','1.2.3GB',{},'   ']){
  const m=await setup(remaining);
  const t=await run({...m.ctx,env:{VIEW:'all',CARD1_TOTAL:spec}});
  assert.ok(!texts(t).join('|').includes('%'),JSON.stringify(spec));
  const bar=barOf(t.children[0]);
  assert.equal(bar.height,4,JSON.stringify(spec)); // relative length, never an empty 0% track
  assert.ok(bar.children[0].flex>0);
 }
});
test('remaining values render green and used values do not',async()=>{
 const m=await setup(remaining);
 const t=await run({...m.ctx,env:{VIEW:'all'}});
 const big=nodes(t).find(n=>n.type==='text'&&n.text==='158.17');
 assert.equal(big.textColor.dark,'#31D05A');
 const m2=await setup(used);
 const t2=await run({...m2.ctx,env:{VIEW:'all'}});
 const big2=nodes(t2).find(n=>n.type==='text'&&n.text==='407.44');
 assert.notEqual(big2.textColor.dark,'#31D05A');
});
test('each card shows its flow value exactly once',async()=>{
 const m=await setup(used);
 const t=await run({...m.ctx,env:{VIEW:'all'}});
 assert.equal(texts(t).filter(x=>x==='407.44').length,3);
 for(const card of t.children)assert.equal(texts(card).filter(x=>x==='407.44').length,1);
});
test('backgroundGradient is a documented linear DSL property, only used for the flow bar',async()=>{
 const m=await setup(used);
 const t=await run({...m.ctx,env:{VIEW:'all',CARD1_TOTAL:'1000GB'}});
 for(const n of nodes(t))for(const attr of Object.keys(n))assert.ok(allowed[n.type].includes(attr),'unsupported '+n.type+'.'+attr);
 for(const n of nodes(t))if(n.backgroundGradient){
  assert.equal(n.backgroundGradient.type,'linear');
  assert.equal(n.backgroundGradient.colors.length,2);
  assert.ok(n.backgroundGradient.startPoint&&n.backgroundGradient.endPoint);
 }
});
test('low fee is still emphasised in the summary capsules and normal fee is not',async()=>{
 const m=mock();for(const p of phones)await capture(m,p);
 m.ctx.http.get=async u=>{m.calls.push({u,o:{}});return {status:200,json:async()=>({code:'Y',feeResource:{feePersent:'2.10',newUnit:'元'},voiceResource:{voicePersent:'56',newUnit:'分钟'},flowResource:used})};};
 const t=await run({...m.ctx,env:{VIEW:'all'}});
 assert.equal(nodes(t).find(n=>n.type==='text'&&n.text==='2.10').textColor.light,'#B83A32');
 const m2=mock();for(const p of phones)await capture(m2,p);
 m2.ctx.http.get=async u=>{m2.calls.push({u,o:{}});return {status:200,json:async()=>({code:'Y',feeResource:{feePersent:'89.30',newUnit:'元'},voiceResource:{voicePersent:'56',newUnit:'分钟'},flowResource:used})};};
 const t2=await run({...m2.ctx,env:{VIEW:'all'}});
 assert.equal(nodes(t2).find(n=>n.type==='text'&&n.text==='89.30').textColor.light,'#1C1C1E');
});
test('summary layout stays within documented DSL and leaks nothing on every home size',async()=>{
 for(const family of ['systemSmall','systemMedium','systemLarge','systemExtraLarge']){
  const m=await setup(remaining);
  const t=await run({...m.ctx,widgetFamily:family,env:{VIEW:'all',CARD2_TOTAL:'500GB',SHOW_PHONE_SUFFIX:'true'}});
  for(const n of nodes(t))for(const attr of Object.keys(n))assert.ok(allowed[n.type].includes(attr),family+' unsupported '+n.type+'.'+attr);
  const s=texts(t).join('|');
  assert.ok(s.includes('卡1')&&s.includes('卡2')&&s.includes('卡3'),family+' dropped a card');
  for(const p of phones)assert.ok(!s.includes(p),family+' leaked a phone number');
  assert.ok(!s.includes('%'));
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
