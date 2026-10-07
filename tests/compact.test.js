import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones} from './helpers.js';
const texts=n=>[...(n.type==='text'?[n.text]:[]),...(n.children||[]).flatMap(texts)];
test('all renders three compact independent rows with exact API flow semantics',async()=>{
 const m=mock();for(const p of phones) await capture(m,p);
 m.ctx.env={VIEW:'all',CARD1_NAME:'双不限',CARD2_NAME:'副卡',CARD3_NAME:'备用'};
 const t=await run(m.ctx),s=texts(t).join('|');
 assert.equal(t.children.length,3);
 for(const name of ['双不限','副卡','备用']) assert.ok(s.includes(name));
 assert.equal(texts(t).filter(x=>x==='7.8').length,3);
 assert.equal(m.calls.length,3);
 assert.ok(!s.includes('%'));
});
test('compact module supplies one all widget, same capture and complete settings',async()=>{
 const {execFileSync}=await import('node:child_process');
 const yaml=p=>JSON.parse(execFileSync('ruby',['-rjson','-ryaml','-e','puts JSON.generate(YAML.load_file(ARGV[0]))',p],{encoding:'utf8'}));
 const old=yaml('UnicomThreeCards.yaml'),next=yaml('UnicomThreeCardsCompact.yaml'),local=yaml('UnicomLocalWidgets.fragment.yaml');
 assert.equal(next.widgets.length,1);assert.deepEqual(next.widgets[0].env,{VIEW:'all'});
 assert.deepEqual(next.scriptings,old.scriptings);assert.deepEqual(next.mitm,old.mitm);assert.deepEqual(next.env_schema,old.env_schema);
 assert.equal(local.widgets.length,4);assert.equal(local.widgets[0].env.VIEW,'all');
});
test('all isolates one auth failure and never mixes cookies',async()=>{
 const m=mock();for(let i=0;i<3;i++) await capture(m,phones[i],'mock='+i);
 let active=0,peak=0;const seen=[];
 m.ctx.http.get=async(u,o)=>{active++;peak=Math.max(peak,active);seen.push([u,o]);await new Promise(r=>setTimeout(r,5));active--;return {status:u.includes(phones[1])?401:200,json:async()=>({code:'Y',feeResource:{feePersent:'12.34'},voiceResource:{voicePersent:'56'},flowResource:{flowPersent:'123456789.1234',newUnit:'GB',dynamicFlowTitle:'已用流量'}})};};
 const tree=await run({...m.ctx,env:{CARD_SLOT:'all',SHOW_PHONE_SUFFIX:'true'}}),s=texts(tree).join('|');
 assert.equal(peak,3);assert.equal(tree.children.length,3);
 assert.ok(s.includes('登录失效'));assert.equal(texts(tree).filter(t=>t==='已用流量').length,2);assert.equal(texts(tree).filter(t=>t==='123456789.1234').length,2);
 seen.forEach(([u,o],i)=>{assert.ok(u.includes(phones[i]));assert.equal(o.headers.Cookie,'mock='+i);assert.equal(o.timeout,8000);assert.equal(o.redirect,'error');});
 for(const phone of phones) assert.ok(!JSON.stringify(tree).includes(phone));
 assert.equal(m.ctx.storage.getJSON('egern.unicom3.v1.slot.2').invalid,true);
});
test('empty all shows three pending slots without requests and invalid slot remains rejected',async()=>{
 const m=mock(),t=await run({...m.ctx,env:{VIEW:'all'}});
 assert.equal(texts(t).filter(t=>t==='待捕获').length,3);assert.equal(m.calls.length,0);
 assert.ok(texts(await run({...m.ctx,env:{CARD_SLOT:'4'}})).join('').includes('只能'));
});
for(const family of ['systemSmall','systemMedium','systemLarge','systemExtraLarge','accessoryInline','accessoryCircular','accessoryRectangular']) test('all keeps all three cards in '+family,async()=>{
 const m=mock();for(const p of phones) await capture(m,p);
 const t=await run({...m.ctx,widgetFamily:family,env:{VIEW:'all',CARD1_NAME:'双不限',SHOW_PHONE_SUFFIX:'true'}}),s=texts(t).join('|');
 assert.ok(s.includes(family==='accessoryInline'||family==='accessoryCircular'?'卡1':'双不限'));assert.ok(s.includes('卡2'));assert.ok(s.includes('卡3'));
 assert.equal(m.calls.length,3);assert.ok(!s.includes('%'));
 const walk=n=>{assert.ok(!Object.hasOwn(n,'justifyContent'));if(n.type==='text'){assert.equal(n.maxLines,1);assert.ok(n.minScale>0);}for(const c of n.children||[])walk(c);};walk(t);
});
test('all settings retain exact titles, alias and cache timestamp without rerequests',async()=>{
 const m=mock();for(const p of phones) await capture(m,p);
 await run({...m.ctx,env:{VIEW:'all'}});const records=[1,2,3].map(i=>m.ctx.storage.getJSON('egern.unicom3.v1.slot.'+i));
 const t=await run({...m.ctx,env:{VIEW:'all',TRANSLUCENT:'true',WIDGET_TITLE:'我的三卡',SHOW_BRAND:'true',CARD1_NAME:'双不限',SHOW_PHONE_SUFFIX:'true',LOW_BALANCE_THRESHOLD:'0'}});
 assert.equal(m.calls.length,3);assert.equal(t.backgroundColor.light,'#FFFFFFB3');assert.ok(texts(t).includes('我的三卡'));assert.ok(texts(t).includes('· 尾号0001'));
 assert.deepEqual([1,2,3].map(i=>m.ctx.storage.getJSON('egern.unicom3.v1.slot.'+i)),records);
});
test('medium summary is a three-row capsule card that never fakes a ratio',async()=>{
 const m=mock();for(const p of phones)await capture(m,p);
 const t=await run({...m.ctx,env:{VIEW:'all'}});
 assert.equal(t.children.length,3);
 t.children.forEach((card,i)=>{
  assert.equal(card.type,'stack');assert.equal(card.gap,2);assert.ok(!card.backgroundColor);
  const [idRow,mid,flowCap]=card.children;
  assert.equal(idRow.type,'stack');assert.equal(mid.type,'stack');assert.equal(flowCap.type,'stack');
  // row1: slot square + identity + right-aligned HH:mm, no big value on this line
  assert.equal(idRow.children[0].type,'stack');assert.ok(idRow.children[0].width>0);
  assert.equal(idRow.children.at(-1).type,'text');assert.match(idRow.children.at(-1).text,/^(\d{2}:\d{2}|--:--)$/);
  // row2: two equal capsules side by side
  assert.equal(mid.children.length,2);assert.ok(mid.children.every(c=>c.flex===1));
  // row3: one full-width flow capsule (label + value over the bar), tinted with this card's slot
  assert.equal(flowCap.children.length,2);
  assert.equal(flowCap.backgroundColor.light,['#2F7FE021','#9B3FD621','#12A59421'][i]);
  assert.equal(flowCap.children[1].children[0].backgroundGradient.type,'linear');
 });
 assert.ok(!texts(t).join('|').includes('%'));
});
export {texts};
