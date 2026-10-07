import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,API,key} from './helpers.js';
async function renderAll(m){return Promise.all([1,2,3].map(i=>run({...m.ctx,env:{CARD_SLOT:String(i)}})));}
test('configured phone and cookie are captured as one account record',async()=>{
 const m=mock(); assert.equal(await capture(m),undefined);
 const a=m.ctx.storage.getJSON(key(phones[0])); assert.equal(a.phone,phones[0]); assert.equal(a.cookie,'mock-session=A'); assert.equal(m.calls.length,0);
});
test('three cards query their own cookies and render private independent capsules',async()=>{
 const m=mock(); for(let i=0;i<3;i++) await capture(m,phones[i],'mock-session='+i);
 const w=await renderAll(m); assert.ok(w.every(x=>x.type==='widget')); assert.equal(m.calls.length,3);
 for(let i=0;i<3;i++){assert.equal(new URL(m.calls[i].u).searchParams.get('desmobiel'),phones[i]);assert.equal(m.calls[i].o.headers.Cookie,'mock-session='+i);assert.equal(m.calls[i].o.redirect,'error');assert.equal(m.calls[i].o.credentials,'omit');}
 const text=w.map(renderedText).join(''); for(const p of phones) {assert.ok(!text.includes(p));assert.ok(text.includes('卡'+(phones.indexOf(p)+1)));}
 assert.ok(text.includes('12.34元')); await renderAll(m);assert.equal(m.calls.length,3,'fresh cache avoids repeated queries');
});
test('expired credentials remain visibly invalid across refreshes',async()=>{
 const m=mock();await capture(m);m.ctx.http.get=async()=>({status:401});
 assert.match(JSON.stringify(await run(m.ctx)),/登录失效/);assert.match(JSON.stringify(await run(m.ctx)),/登录失效/);
});
test('cookie-only cannot overwrite a captured account, including single-card mode',async()=>{
 const m=mock();await capture(m);
 const before=[...m.db];await capture(m,'','mock-session=wrong',API+'?showType=0');assert.deepEqual([...m.db],before);
});
test('wrong host scheme path userinfo and duplicate phone cannot capture',async()=>{
 const m=mock(); const urls=['http://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven','https://m.client.10010.com.evil.invalid/mobileserviceimportant/home/queryUserInfoSeven','https://evil.invalid/?next='+API,'https://m.client.10010.com/other','https://user@m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven'];
 for(const u of urls) await capture(m,phones[0],'mock=BAD',u+'?desmobiel='+phones[0]);
 await capture(m,phones[0],'mock=BAD',API+'?desmobiel='+phones[0]+'&desmobiel='+phones[1]);assert.equal(m.db.size,0);
});
test('fourth account never displaces the configured three',async()=>{
 const m=mock();for(const p of phones) await capture(m,p,'mock='+p);const before=[...m.db];await capture(m,'13000000004','mock=FOUR');assert.deepEqual([...m.db],before);
});
test('single-card selection queries only its slot',async()=>{
 const m=mock();for(const p of phones) await capture(m,p);m.ctx.env.CARD_SLOT='2';m.ctx.widgetFamily='systemSmall';
 const w=await run(m.ctx);assert.equal(m.calls.length,1);assert.ok(m.calls[0].u.includes(phones[1]));assert.ok(!JSON.stringify(w).includes('130****0001'));
});
test('expired cache and authentication failure are isolated from healthy card',async()=>{
 const m=mock();for(const p of phones) await capture(m,p);await renderAll(m);
 for(const p of phones){const r=m.ctx.storage.getJSON(key(p));r.updatedAt=Date.now()-25*3600000;m.ctx.storage.setJSON(key(p),r);}
 const normal=m.ctx.http.get;m.ctx.http.get=async(u,o)=>{const p=new URL(u).searchParams.get('desmobiel');if(p===phones[0])throw new Error('sensitive='+o.headers.Cookie);if(p===phones[1])return {status:403};return normal(u,o);};
 const w=await renderAll(m);assert.match(JSON.stringify(w[0]),/缓存已过期/);assert.ok(!JSON.stringify(w[0]).includes('12.34'));
 assert.match(JSON.stringify(w[1]),/登录失效/);assert.match(renderedText(w[2]),/12.34元/);assert.ok(!renderedText(w[2]).includes('已更新'));assert.ok(m.ctx.storage.getJSON(key(phones[2])).updatedAt>Date.now()-60000);assert.ok(!JSON.stringify(w).includes('sensitive'));assert.equal(m.ctx.storage.getJSON(key(phones[1])).cookie,undefined);
});
test('recent cache is labelled on transport failure and secrets never enter output',async()=>{
 const m=mock();await capture(m);await run(m.ctx);const r=m.ctx.storage.getJSON(key(phones[0]));r.updatedAt=Date.now()-2*3600000;m.ctx.storage.setJSON(key(phones[0]),r);
 m.ctx.http.get=async()=>{throw new Error('mock-session=A '+phones[0]);};const w=JSON.stringify(await run(m.ctx));assert.match(w,/缓存（查询失败）/);assert.ok(!w.includes('mock-session'));assert.equal(m.notices.length,0);
});
test('credential rotation in flight cannot write old response cache',async()=>{
 const m=mock();await capture(m);const normal=m.ctx.http.get;
 m.ctx.http.get=async(u,o)=>{await capture(m,phones[0],'mock-session=NEW');return normal(u,o);};
 const w=await run(m.ctx);assert.match(JSON.stringify(w),/凭据已更新/);assert.equal(m.ctx.storage.getJSON(key(phones[0])).data,undefined);
});
test('first capture order assigns slots without any module env; repeats preserve slot',async()=>{
 const m=mock();for(const p of [phones[2],phones[0],phones[1]])await capture(m,p);
 for(const [i,p] of [phones[2],phones[0],phones[1]].entries())assert.equal(m.ctx.storage.getJSON('egern.unicom3.v1.slot.'+(i+1)).phone,p);
 await capture(m,phones[0],'mock=NEW');assert.equal(m.ctx.storage.getJSON('egern.unicom3.v1.slot.2').cookie,'mock=NEW');assert.equal(m.db.size,3);
});
test('unconfigured widget guides capture and invalid slot is rejected without HTTP',async()=>{
 const m=mock();assert.match(JSON.stringify(await run(m.ctx)),/待捕获/);
 m.ctx.env.CARD_SLOT='all';assert.match(JSON.stringify(await run(m.ctx)),/只能为/);assert.equal(m.calls.length,0);
});
test('credential refresh resets only own cache',async()=>{
 const m=mock();for(const p of phones)await capture(m,p);await renderAll(m);const other=m.db.get(key(phones[1]));await capture(m,phones[0],'mock=ROTATED');assert.equal(m.ctx.storage.getJSON(key(phones[0])).data,undefined);assert.equal(m.db.get(key(phones[1])),other);
});
function nodes(w){return [w,...(w.children||[]).flatMap(nodes)];}
const renderedText=w=>nodes(w).filter(n=>n.type==='text').map(n=>n.text).join('');
test('small widget centers fee capsule above two resource capsules',async()=>{
 const m=mock();await capture(m);m.ctx.widgetFamily='systemSmall';const w=await run(m.ctx);
 assert.equal(w.children[1].children[0].type,'spacer');assert.equal(w.children[1].children[2].type,'spacer');
 assert.equal(w.children[2].children.length,2);assert.equal(nodes(w).filter(n=>n.borderRadius===14).length,3);
 assert.match(renderedText(w),/话费12.34元语音56分钟流量7.8GB/);
});
test('legacy fresh cache upgrades without rotating or losing credentials',async()=>{
 const m=mock();await capture(m);const r=m.ctx.storage.getJSON(key(phones[0]));
 m.ctx.storage.setJSON(key(phones[0]),{...r,data:['41.20元','200分钟','384.44GB'],updatedAt:Date.now()});
 await run(m.ctx);assert.equal(m.calls.length,1);const after=m.ctx.storage.getJSON(key(phones[0]));
 assert.equal(after.cookie,r.cookie);assert.equal(after.phone,r.phone);assert.equal(after.capturedAt,r.capturedAt);assert.equal(after.dataSchema,2);
 await run(m.ctx);assert.equal(m.calls.length,1);
});
test('standard Headers and lowercase cookie capture; invalid login can be recaptured',async()=>{
 const m=mock();await run({...m.ctx,request:{url:API+'?desmobiel='+phones[0],headers:new Headers({cookie:'mock=HEADER'})}});
 assert.equal(m.ctx.storage.getJSON(key(phones[0])).cookie,'mock=HEADER');
 m.ctx.http.get=async()=>({status:403});await run(m.ctx);
 await run({...m.ctx,request:{url:API+'?desmobiel='+phones[0],headers:{cookie:'mock=RELOGIN'}}});
 assert.equal(m.ctx.storage.getJSON(key(phones[0])).invalid,undefined);assert.equal(m.ctx.storage.getJSON(key(phones[0])).cookie,'mock=RELOGIN');
});
test('API titles retain used/remaining semantics and separate value units',async()=>{
 for(const title of ['剩余通用流量','已用流量']){
  const m=mock();await capture(m);const normal=m.ctx.http.get;
  m.ctx.http.get=async(u,o)=>{const r=await normal(u,o);const d=await r.json();d.flowResource.dynamicFlowTitle=title;d.feeResource.dynamicFeeTitle='可用话费';d.voiceResource.dynamicVoiceTitle='已用语音';return {status:200,json:async()=>d};};
  await run(m.ctx);assert.deepEqual(m.ctx.storage.getJSON(key(phones[0])).data,[{title:'可用话费',value:'12.34',unit:'元'},{title:'已用语音',value:'56',unit:'分钟'},{title,value:'7.8',unit:'GB'}]);
 }
});
export {mock,capture,phones,API,key};

test('missing cookie or malformed phone/header cannot allocate a slot',async()=>{
 const m=mock();for(const p of ['', '123', '1300000000X'])await capture(m,p);
 for(const c of ['', ' ', 'bad\r\nheader'])await capture(m,phones[0],c);assert.equal(m.db.size,0);
});
test('same cookie recapture keeps cache and timestamp',async()=>{
 const m=mock();await capture(m);await run(m.ctx);const before=[...m.db];await capture(m);assert.deepEqual([...m.db],before);
});
test('negative fee is valid; negative voice and flow are rejected',async()=>{
 for(const field of ['feeResource','voiceResource','flowResource']){
  const m=mock();await capture(m);const normal=m.ctx.http.get;
  m.ctx.http.get=async(u,o)=>{const r=await normal(u,o);const data=await r.json();data[field][{feeResource:'feePersent',voiceResource:'voicePersent',flowResource:'flowPersent'}[field]]='-12.34';return {status:200,json:async()=>data};};
  const w=renderedText(await run(m.ctx));if(field==='feeResource')assert.match(w,/-12.34元/);else assert.match(w,/查询失败/);
 }
});
test('legacy records are preserved but never imported without new atomic capture',async()=>{
 const m=mock();m.ctx.storage.setJSON('egern.unicom3.v1.account.'+phones[0],{phone:phones[0],cookie:'mock=LEGACY'});
 m.ctx.storage.set('unicom_cookie','mock=OLD');m.ctx.storage.set('unicom_phone',phones[1]);
 const before=[...m.db];assert.match(JSON.stringify(await run(m.ctx)),/待捕获/);assert.equal(m.calls.length,0);
 await capture(m,phones[2]);for(const [k,v] of before)assert.equal(m.db.get(k),v);assert.equal(m.ctx.storage.getJSON('egern.unicom3.v1.slot.1').phone,phones[2]);
});
test('medium and large widgets use horizontal rounded capsules and supported DSL',async()=>{
 const allowed=new Set(['widget','stack','text','image','spacer']);
 for(const family of ['systemMedium','systemLarge','systemExtraLarge','accessoryInline','accessoryCircular','accessoryRectangular']){
  const m=mock();await capture(m);m.ctx.widgetFamily=family;const w=await run(m.ctx);
  assert.equal(w.type,'widget');assert.ok(nodes(w).every(n=>allowed.has(n.type)));
  if(family.startsWith('system')){assert.equal(w.children[1].direction,'row');assert.equal(w.children[1].children.length,3);assert.equal(nodes(w).filter(n=>n.borderRadius===14).length,3);assert.ok(nodes(w).some(n=>n.width===6&&n.height===6&&n.borderRadius===3));assert.match(renderedText(w),/\d{2}:\d{2}/);}
  else assert.ok(nodes(w).some(n=>n.text==='流量'||n.text?.includes('流量')),'lock screen retains semantic label');
 }
});
test('legacy cache fallback is neutral, labelled and never rewrites credentials',async()=>{
 const m=mock();await capture(m);const r=m.ctx.storage.getJSON(key(phones[0]));m.ctx.storage.setJSON(key(phones[0]),{...r,data:['-41.20元','200分钟','384.44GB'],updatedAt:Date.now()});
 const before=[...m.db];m.ctx.http.get=async()=>{throw Error('network');};const w=await run(m.ctx);
 assert.match(renderedText(w),/旧缓存（查询失败）/);assert.match(renderedText(w),/话费-41.20元语音200分钟流量384.44GB/);assert.ok(!renderedText(w).includes('剩余'));assert.deepEqual([...m.db],before);
});
test('unsafe or absent API titles use neutral names instead of inferred remaining',async()=>{
 for(const title of [undefined,null,{},'','x'.repeat(25),'流量\n秘密','13000000001','Cookie=SECRET']){
  const m=mock();await capture(m);const normal=m.ctx.http.get;
  m.ctx.http.get=async(u,o)=>{const r=await normal(u,o);const d=await r.json();d.flowResource.dynamicFlowTitle=title;return {status:200,json:async()=>d};};
  await run(m.ctx);assert.equal(m.ctx.storage.getJSON(key(phones[0])).data[2].title,'流量');
 }
});
test('optional translucent and title env parse false strings safely',async()=>{
 for(const value of [undefined,false,'false','off','0',true,'true','on','1']){
  const m=mock();await capture(m);m.ctx.env={TRANSLUCENT:value,WIDGET_TITLE:'我的联通'};
  const w=await run(m.ctx);assert.equal(w.backgroundColor.light,[true,'true','on','1'].includes(value)?'#FFFFFFB3':'#FFFFFF');assert.match(renderedText(w),/我的联通/);
 }
 const m=mock();m.ctx.env.WIDGET_TITLE={};assert.match(renderedText(await run(m.ctx)),/卡1/);
});
