// New implementation informed by IBL3ND/module's single-card API contract.
const API='https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven';
const PREFIX='egern.unicom3.v1.';
const PHONE=/^1[3-9]\d{9}$/;
// Each slot stores phone + cookie together. Legacy account.* records are untouched.
const slotKey=i=>PREFIX+'slot.'+i;
function slots(ctx) {return [1,2,3].map(i=>safeJSON(ctx,slotKey(i)));}
function safeJSON(ctx,key) {try {return ctx.storage.getJSON(key);} catch {return null;}}
function header(headers,name) {
 if(typeof headers?.get==='function') return headers.get(name)||'';
 const k=Object.keys(headers||{}).find(k=>k.toLowerCase()===name);
 return k ? headers[k] : '';
}
function capture(ctx) {
 let u; try {u=new URL(String(ctx.request.url));} catch {return;}
 // Origin, exact path, no credentials, no ambiguous phone query.
 if(u.origin!=='https://m.client.10010.com'||u.username||u.password||u.pathname!=='/mobileserviceimportant/home/queryUserInfoSeven') return;
 const values=u.searchParams.getAll('desmobiel');
 if(values.length!==1||!PHONE.test(values[0])) return;
 const phone=values[0],raw=header(ctx.request.headers,'cookie');
 if(typeof raw!=='string'||!raw.trim()||/[\r\n]/.test(raw)||raw.length>32768) return;
 const cookie=raw.trim(),records=slots(ctx);
 let index=records.findIndex(r=>r?.phone===phone);
 if(index<0) index=records.findIndex(r=>!r);
 if(index<0) return; // Fourth number cannot displace an existing card.
 const old=records[index];
 if(old?.phone===phone&&old.cookie===cookie) return;
 // One storage write binds credentials and phone; reset data on credential change.
 ctx.storage.setJSON(slotKey(index+1),{phone,cookie,capturedAt:Date.now()});
}
const FRESH=60*60*1000, MAX_CACHE=24*60*60*1000;
function safeTitle(value,fallback) {
 return typeof value==='string'&&value.trim()&&value.length<=24&&!/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value)&&!/(?:1[3-9]\d{9}|cookie|https?:\/\/)/i.test(value)?value:fallback;
}
function parse(res) {
 if(res?.code!=='Y') throw new Error('API');
 if(!res.feeResource||!res.voiceResource||!res.flowResource) throw new Error('DATA');
 const fields=[['feeResource','feePersent','元','dynamicFeeTitle','话费'],['voiceResource','voicePersent','分钟','dynamicVoiceTitle','语音'],['flowResource','flowPersent','MB','dynamicFlowTitle','流量']];
 return fields.map(([r,v,unit,t,fallback])=>{
  const value=res[r][v];
  if(!['string','number'].includes(typeof value)||!(r==='feeResource'?/^-?\d+(\.\d+)?$/:/^\d+(\.\d+)?$/).test(String(value))) throw new Error('DATA');
  const u=String(res[r].newUnit||unit);
  if(!['元','分钟','分','MB','GB','TB','KB','M','G'].includes(u)) throw new Error('DATA');
  return {title:safeTitle(res[r][t],fallback),value:String(value),unit:u};
 });
}
function validData(data) {
 return Array.isArray(data)&&data.length===3&&data.every((d,i)=>d&&typeof d.title==='string'&&safeTitle(d.title,'')===d.title&&typeof d.value==='string'&&(i===0?/^-?\d+(\.\d+)?$/:/^\d+(\.\d+)?$/).test(d.value)&&['元','分钟','分','MB','GB','TB','KB','M','G'].includes(d.unit));
}
function cachedData(record) {
 if(record.dataSchema===2&&validData(record.data)) return record.data;
 if(!Array.isArray(record.data)||record.data.length!==3) return null;
 const titles=['话费','语音','流量'];
 const data=record.data.map((v,i)=>{
  const m=typeof v==='string'&&v.match(/^(-?\d+(?:\.\d+)?)(元|分钟|分|MB|GB|TB|KB|M|G)$/);
  return m?{title:titles[i],value:m[1],unit:m[2]}:null;
 });
 return validData(data)?data:null;
}
async function load(ctx,slot) {
 const record=safeJSON(ctx,slotKey(slot));
 const phone=record?.phone;
 if(!phone) return {status:'待捕获'};
 if(record?.phone===phone&&record.invalid) return {status:'登录失效，请重新捕获'};
 if(record?.phone!==phone||!record.cookie) return {status:'待捕获'};
 const now=Date.now(),age=now-record.updatedAt;
 if(record.dataSchema===2 && validData(record.data) && age>=0&&age<FRESH) return {status:'已更新',data:record.data,updatedAt:record.updatedAt};
 try {
  const resp=await ctx.http.get(API+'?version=iphone_c@10.0100&desmobiel='+encodeURIComponent(phone)+'&showType=0',{
   timeout:8000,redirect:'error',credentials:'omit',insecureTls:false,
   headers:{'User-Agent':'ChinaUnicom.x CFNetwork iOS/16.3',Cookie:record.cookie}
  });
  if(!resp || resp.status!==200) throw new Error(resp?.status===401||resp?.status===403?'AUTH':'HTTP');
  const data=parse(await resp.json());
  // A capture may rotate credentials while this request is in flight.
  const current=safeJSON(ctx,slotKey(slot));
  if(current?.phone!==phone||current.cookie!==record.cookie||current.capturedAt!==record.capturedAt) return {status:'凭据已更新，请刷新'};
  const updatedAt=Date.now();
  ctx.storage.setJSON(slotKey(slot),{...current,data,dataSchema:2,updatedAt});
  return {status:'已更新',data,updatedAt};
 } catch(e) {
  // Never render exceptions: they may contain URL/cookie/phone from the HTTP runtime.
  const current=safeJSON(ctx,slotKey(slot));
  if(current?.cookie!==record.cookie||current?.capturedAt!==record.capturedAt) return {status:'凭据已更新，请刷新'};
  if(e.message==='AUTH'||e.message==='API') {
   ctx.storage.setJSON(slotKey(slot),{phone,capturedAt:record.capturedAt,invalid:true});
   return {status:'登录失效，请重新捕获'};
  }
  const cached=cachedData(record);
  if(cached&&age>=0&&age<MAX_CACHE) return {status:record.dataSchema===2?'缓存（查询失败）':'旧缓存（查询失败）',data:cached,updatedAt:record.updatedAt};
  return {status:record.data?'缓存已过期，请重新查询':'查询失败，请重试'};
 }
}
function enabled(value) {return [true,'true','on','1'].includes(value);}
// SHOW_BRAND now gates the summary top title bar. Only an explicit false/off/0 hides it; unset means show.
function brandHidden(value) {return value===false||value===0||['false','off','0'].includes(value);}
function cardName(value,selection) {
 if(typeof value!=='string') return '卡'+selection;
 const clean=value.trim();
 // Validate before truncating: a long private token must not become a safe alias.
 if(!clean||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(clean)||/(?:1[3-9]\d{9}|cookie|https?:\/\/)/i.test(clean)) return '卡'+selection;
 return Array.from(clean).slice(0,12).join('');
}
// Only a validated suffix leaves the account-loading boundary, never the phone.
async function displayResult(ctx,selection) {
 const result=await load(ctx,Number(selection));
 const phone=safeJSON(ctx,slotKey(selection))?.phone;
 return {...result,suffix:enabled(ctx.env?.SHOW_PHONE_SUFFIX)&&typeof phone==='string'&&PHONE.test(phone)?phone.slice(-4):''};
}
// Egern's documented JSON DSL; alpha colors do not request an iOS blur material.
const COLORS={bg:{light:'#FFFFFF',dark:'#2C2C2E'},value:{light:'#1C1C1E',dark:'#FFFFFF'},muted:{light:'#62626A',dark:'#C4C4CC'},accent:{light:'#E60012',dark:'#FF375F'}};
// Same PNG file as the module icon; referenced by URL so nothing is inlined into the script.
const ICON_URL='https://raw.githubusercontent.com/liuweiqiang0523/egern-unicom-threecards/main/assets/unicom-icon.png';
function text(value,size=11,color=COLORS.value,weight='regular') {
 return {type:'text',text:value,font:{size,weight},textColor:color,maxLines:1,minScale:0.55};
}
const spacer=()=>({type:'spacer'});
function row(children,gap=6) {return {type:'stack',direction:'row',alignItems:'center',gap,children};}
function widget(children,translucent=false) {
 return {type:'widget',backgroundColor:translucent?{light:'#FFFFFFB3',dark:'#2C2C2EB3'}:COLORS.bg,padding:[8,12,8,12],gap:6,refreshAfter:new Date(Date.now()+FRESH).toISOString(),children};
}
const CAPSULE_COLORS=[{light:'#FFF1E5',dark:'#FFB97626'},{light:'#F2EDFF',dark:'#BEA3FF26'},{light:'#EAF4FF',dark:'#86BFFF26'}];
// Compact-summary slot palette: blue / purple / cyan. Light mode uses a deeper shade so the ~13%
// capsule tint stays legible on white; dark mode uses the brighter hue. No yellow/orange anywhere.
const SLOT_COLORS=[{light:'#2F7FE0',dark:'#5AA9FF'},{light:'#9B3FD6',dark:'#BF5AF2'},{light:'#12A594',dark:'#38D6C0'}];
const SLOT_BRIGHT=[{light:'#5AA9FF',dark:'#8CC4FF'},{light:'#BF5AF2',dark:'#D98DFF'},{light:'#38D6C0',dark:'#6FE6D6'}];
const TINT='21';
const WARNING={background:{light:'#FDE9E7',dark:'#FF786426'},value:{light:'#B83A32',dark:'#FFB4AA'}};
const TRACK={light:'#E2E2E7',dark:'#5A5A5E'};
const CHIP_BG={light:'#ECECF1',dark:'#3A3A3C'};
const REMAIN={light:'#12833F',dark:'#31D05A'};
const BAR_H=4, SEP_H=2;
// Summary card block: full-width rounded wash per card so the three cards read apart on a phone.
const CARD_RADIUS=16, CARD_GAP=9, CARD_PAD=[4,7,4,7];
const UNIT_MB={KB:1/1024,M:1,MB:1,G:1024,GB:1024,T:1024*1024,TB:1024*1024};
const FLOW_SIZES={systemSmall:{name:10,unit:8,title:8,value:10,label:8,tag:7,time:8,icon:6,cpad:[2,6,2,6],fpad:[3,6,3,6],gap:2,fgap:1},systemMedium:{name:9,unit:8,title:8,value:10,label:8,tag:7,time:7,icon:6,cpad:[1,6,1,6],fpad:[2,6,2,6],gap:2,fgap:1},systemLarge:{name:12,unit:10,title:10,value:13,label:10,tag:9,time:9,icon:7,cpad:[4,9,4,9],fpad:[5,10,5,10],gap:3,fgap:2},systemExtraLarge:{name:13,unit:10,title:11,value:14,label:11,tag:10,time:10,icon:8,cpad:[5,10,5,10],fpad:[6,11,6,11],gap:3,fgap:2}};
// Which resource the API title describes; never inferred from the value itself.
function flowSemantic(title) {
 if(typeof title!=='string') return 'neutral';
 if(title.includes('剩余')) return 'remaining';
 if(title.includes('已用')) return 'used';
 return 'neutral';
}
// Parse an opt-in plan total. A bare number means the display unit; returns megabytes or null.
function totalMB(spec,fallbackUnit) {
 if(!['string','number'].includes(typeof spec)) return null;
 const m=String(spec).trim().toUpperCase().match(/^(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB|T|G|M|K|B)?$/);
 if(!m) return null;
 const n=Number(m[1]);
 if(!Number.isFinite(n)||n<=0) return null;
 const suffix=m[2]||'';
 const factor=suffix===''?UNIT_MB[fallbackUnit]:suffix==='B'?1/1048576:suffix==='K'||suffix==='KB'?1/1024:UNIT_MB[suffix];
 if(typeof factor!=='number'||!Number.isFinite(factor)||factor<=0) return null;
 const mb=n*factor;
 return Number.isFinite(mb)&&mb>0?mb:null;
}
// A real fill needs an explicit used/remaining label AND a parseable total; otherwise null.
function flowRatio(flow,spec) {
 const semantic=flowSemantic(flow.title);
 const factor=UNIT_MB[flow.unit];
 if(semantic==='neutral'||typeof factor!=='number') return null;
 const total=totalMB(spec,flow.unit);
 const value=Number(flow.value);
 if(!total||!Number.isFinite(value)||value<0) return null;
 const used=semantic==='remaining'?total-value*factor:value*factor;
 const ratio=used/total;
 return Number.isFinite(ratio)?Math.max(0,Math.min(1,ratio)):null;
}
function slotTint(slot) {const c=SLOT_COLORS[slot];return {light:c.light+TINT,dark:c.dark+TINT};}
function slotFill(slot) {return {type:'linear',colors:[SLOT_BRIGHT[slot],SLOT_COLORS[slot]],startPoint:{x:0,y:0.5},endPoint:{x:1,y:0.5}};}
// Unlimited cards fade to the same colour at 00 alpha so the bar visibly has no end.
function slotFade(slot) {const c=SLOT_COLORS[slot];return {type:'linear',colors:[c,{light:c.light+'00',dark:c.dark+'00'}],startPoint:{x:0,y:0.5},endPoint:{x:1,y:0.5}};}
// Big per-card block: a low-alpha slot wash over the widget base (dark ~0x17) plus a brighter 1px
// outline, so the three cards are visibly separated. Inner capsules keep slotTint.
function slotCardBg(slot) {const c=SLOT_COLORS[slot];return {light:c.light+'1A',dark:c.dark+'17'};}
function slotCardBorder(slot) {const c=SLOT_COLORS[slot];return {light:c.light+'59',dark:c.dark+'4D'};}
// CARD_ORDER only reorders the summary view: a strict 1/2/3 permutation, else the 1,2,3 default.
function cardOrder(spec) {
 const parts=(typeof spec==='string'||typeof spec==='number')?String(spec).split(',').map(p=>p.trim()):[];
 if(parts.length!==3||!parts.every(p=>/^[123]$/.test(p))) return [0,1,2];
 const nums=parts.map(Number);
 return new Set(nums).size===3?nums.map(n=>n-1):[0,1,2];
}
// metric.unlimited -> gradient fade + ∞; metric.ratio -> real/relative fill; null -> plain separator.
function flowBar(slot,metric,s) {
 if(metric.unlimited) return row([{type:'stack',height:BAR_H,flex:1,backgroundGradient:slotFade(slot),children:[]},text('∞',s.tag,COLORS.muted,'medium')],4);
 if(metric.ratio===null) return {type:'stack',direction:'row',height:SEP_H,borderRadius:1,backgroundColor:TRACK,children:[]};
 const r=Math.round(metric.ratio*1000);
 const fill={type:'stack',height:BAR_H,backgroundGradient:slotFill(slot),flex:r};
 const inner=r>=1000?[fill]:r<=0?[]:[fill,{type:'stack',height:BAR_H,flex:1000-r}];
 return {type:'stack',direction:'row',height:BAR_H,borderRadius:BAR_H/2,backgroundColor:TRACK,children:inner};
}
function balanceThreshold(value) {
 if(!['string','number'].includes(typeof value)||!/^\d+(?:\.\d+)?$/.test(String(value).trim())) return 10;
 const n=Number(value);return Number.isFinite(n)?n:10;
}
function lowBalance(d,threshold) {return threshold>0&&d.unit==='元'&&Number(d.value)<threshold;}
function capsule(d,index,center=false,warning=false) {
 return {type:'stack',direction:'column',alignItems:'center',...(center?{}:{flex:1}),padding:[7,center?20:8,7,center?20:8],gap:3,backgroundColor:warning?WARNING.background:CAPSULE_COLORS[index],borderRadius:14,children:[text(d.title,10,{light:'#51515A',dark:'#D8D8DF'},'medium'),row([text(d.value,22,warning?WARNING.value:COLORS.value,'semibold'),text(d.unit,10,COLORS.muted)],3)]};
}
function chip(label,s) {return {type:'stack',direction:'row',alignItems:'center',padding:[1,6,1,6],borderRadius:6,backgroundColor:CHIP_BG,children:[text(label,s.tag,COLORS.muted,'medium')]};}
// One resource capsule of the compact summary: slot-coloured ~13% tint, small grey label, big value.
function miniCapsule(d,slot,s,warning) {
 return {type:'stack',direction:'row',alignItems:'center',flex:1,gap:3,padding:s.cpad,backgroundColor:warning?WARNING.background:slotTint(slot),borderRadius:10,children:[text(d.title,s.label,COLORS.muted,'medium'),text(d.value,s.value,warning?WARNING.value:COLORS.value,'semibold'),text(d.unit,s.unit,COLORS.muted)]};
}
function footer(status) {
 return row([spacer(),text(status,9,COLORS.muted)]);
}
function identityTexts(title,alias,suffix,family) {
 // Reserve natural width for suffix/time; only the identity takes remaining width.
 const compact=family==='systemSmall'||family.startsWith('accessory');
 const limit=compact?(suffix?5:8):12;
 const short=Array.from(alias).slice(0,limit).join('');
 return [{...text((title?title+' · ':'')+short,12,COLORS.value,'semibold'),flex:1},...(suffix?[{...text('· 尾号'+suffix,10,COLORS.value,'medium'),minScale:1}]:[])];
}
function lockWidget(result,labels,family,translucent,threshold) {
 // Lock-screen containers must not inherit spacious home-screen padding.
 const lock=children=>({...widget(children,translucent),padding:family==='accessoryInline'?0:4,gap:2});
 const d=result.data;
 if(!d) return lock(family==='accessoryInline'?[row([...labels,text(result.status,11,COLORS.accent)],2)]:[row(labels,3),{...text(result.status,11,COLORS.accent),maxLines:2}]);
 const label=v=>v.title+' '+v.value+v.unit;
 const feeColor=lowBalance(d[0],threshold)?WARNING.value:COLORS.value;
 const status=result.status==='已更新'?'': ' · '+result.status;
 if(family==='accessoryInline') return lock([row([...labels,text(label(d[0]),11,feeColor),text(' · '+label(d[2])+status,11)],2)]);
 // Circular: only flow fits; its exact API label takes priority over a heading.
 if(family==='accessoryCircular') return lock([text(d[2].title,9),{...text(d[2].value,20,COLORS.value,'semibold'),textAlign:'center'},text(d[2].unit+status,9)]);
 return lock([row([...labels,text(label(d[0]),12,feeColor)],2),text(label(d[1]),10),text(label(d[2])+status,10)]);
}
function compactIdentity(alias,suffix,family,s) {
 const limit=family==='systemSmall'?(suffix?5:8):12;
 const parts=[{...text(Array.from(alias).slice(0,limit).join(''),s.name,COLORS.value,'semibold'),minScale:0.6}];
 if(suffix) parts.push({...text('· 尾号'+suffix,s.name-2,COLORS.value,'medium'),minScale:1});
 return parts;
}
// One summary card is wrapped in a single rounded block: a low-alpha slot wash with a brighter 1px
// outline, so the three cards read as separate blocks. Inside: (1) slot square + alias + suffix +
// HH:mm, (2) fee/voice capsules, (3) full-width flow capsule (API label + value/unit [+ 不限量]
// over the flow bar). The inner rows keep their own slot tint.
function compactCard(ctx,result,selection,family,metric) {
 const lock=family.startsWith('accessory'),small=family==='systemSmall';
 const s=FLOW_SIZES[family]||FLOW_SIZES.systemMedium;
 const slot=selection-1;
 const alias=cardName(ctx.env?.['CARD'+selection+'_NAME'],selection);
 const dot={type:'stack',width:s.icon,height:s.icon,borderRadius:2,backgroundColor:SLOT_COLORS[slot],children:[]};
 const time=result.updatedAt?new Date(result.updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}):'--:--';
 const idRow=row([dot,...compactIdentity(alias,lock?'':result.suffix,family,s),spacer(),{...text(time,s.time,COLORS.muted),minScale:1}],4);
 const block=children=>({type:'stack',direction:'column',gap:s.gap,padding:CARD_PAD,backgroundColor:slotCardBg(slot),borderRadius:CARD_RADIUS,borderWidth:1,borderColor:slotCardBorder(slot),children});
 if(!result.data) return lock?{type:'stack',direction:'column',gap:2,children:[idRow,text(result.status,9,COLORS.accent)]}:block([idRow,text(result.status,small?9:11,COLORS.accent)]);
 const [fee,voice,flow]=result.data;
 if(lock) return {type:'stack',direction:'column',gap:1,children:[row([dot,...compactIdentity(alias,'',family,s),text(flow.value,s.value,COLORS.value,'semibold'),text(flow.unit,s.unit,COLORS.muted)],3)]};
 const warning=lowBalance(fee,balanceThreshold(ctx.env?.LOW_BALANCE_THRESHOLD));
 const valueColor=flowSemantic(flow.title)==='remaining'?REMAIN:COLORS.value;
 const topRow=row([{...text(flow.title,s.title,COLORS.muted,'medium'),flex:1},text(flow.value,s.value,valueColor,'semibold'),text(flow.unit,s.unit,COLORS.muted,'medium'),...(metric.unlimited?[chip('不限量',s)]:[])],4);
 const flowCapsule={type:'stack',direction:'column',gap:s.fgap,padding:s.fpad,backgroundColor:slotTint(slot),borderRadius:12,children:[topRow,flowBar(slot,metric,s)]};
 const mid=small?[]:[row([miniCapsule(fee,slot,s,warning),miniCapsule(voice,slot,s,false)],6)];
 return block([idRow,...mid,flowCapsule]);
}
// Decide each card's bar: unlimited (no total + "已用" label) fades out; a configured total gives a
// real used/total ratio; otherwise a relative length versus the max same-caliber value of the three.
function flowMetrics(ctx,results) {
 const raw=results.map((r,i)=>{
  const flow=r.data?r.data[2]:null;
  const semantic=flow?flowSemantic(flow.title):null;
  const factor=flow?UNIT_MB[flow.unit]:null;
  const value=flow?Number(flow.value):NaN;
  const valueMB=flow&&typeof factor==='number'&&Number.isFinite(value)&&value>=0?value*factor:null;
  const spec=ctx.env?.['CARD'+(i+1)+'_TOTAL'];
  const total=flow?totalMB(spec,flow.unit):null;
  return {flow,semantic,valueMB,total,spec};
 });
 const maxByGroup={};
 for(const f of raw) if(f.valueMB!=null){const g=f.semantic||'neutral';maxByGroup[g]=Math.max(maxByGroup[g]||0,f.valueMB);}
 return raw.map(f=>{
  if(!f.flow) return {unlimited:false,ratio:null};
  if(f.semantic==='used'&&!f.total) return {unlimited:true,ratio:null};
  if(f.total&&f.semantic&&f.semantic!=='neutral'){const r=flowRatio(f.flow,f.spec);if(r!==null)return {unlimited:false,ratio:r,real:true};}
  const max=maxByGroup[f.semantic||'neutral']||0;
  if(f.valueMB!=null&&max>0) return {unlimited:false,ratio:Math.min(1,f.valueMB/max),relative:true};
  return {unlimited:false,ratio:null};
 });
}
async function compactWidget(ctx) {
 const family=typeof ctx.widgetFamily==='string'?ctx.widgetFamily:'systemMedium';
 // Each load retains its own credentials/cache/auth handling; requests run concurrently.
 const results=await Promise.all([1,2,3].map(async selection=>{
  try {return await displayResult(ctx,String(selection));} catch {return {status:'查询失败，请重试'};}
 }));
 // Display order only; slots, storage keys and the single-card path are untouched.
 const order=cardOrder(ctx.env?.CARD_ORDER);
 const lock=family.startsWith('accessory'),small=family==='systemSmall';
 if(family==='accessoryInline'||family==='accessoryCircular') {
  // These families cannot fit three full rows; never silently show only card1.
  const summary=order.map(i=>'卡'+(i+1)+' '+(results[i].data?results[i].data[2].title+' '+results[i].data[2].value+results[i].data[2].unit:results[i].status));
  return {...widget(family==='accessoryInline'?[text(summary.join(' · '),9)]:summary.map(s=>text(s,9)),enabled(ctx.env?.TRANSLUCENT)),padding:family==='accessoryInline'?0:4,gap:1};
 }
 const metrics=flowMetrics(ctx,results);
 // Summary-only top title bar: module icon + a plain text title. WIDGET_TITLE wins when safe, else
 // 中国联通; an explicit SHOW_BRAND=false/off/0 hides the whole bar (including the icon). Time stays
 // on each card, never here. The single-card path below keeps its own inline heading and no such bar.
 const title=lock?'':safeTitle(ctx.env?.WIDGET_TITLE,brandHidden(ctx.env?.SHOW_BRAND)?'':'中国联通');
 const titleBar=title?[row([{type:'image',src:ICON_URL,width:15,height:15,borderRadius:3,resizeMode:'contain'},{...text(title,13,COLORS.value,'semibold'),flex:1}],5)]:[];
 return {...widget([...titleBar,...order.map(i=>compactCard(ctx,results[i],i+1,family,metrics[i]))],enabled(ctx.env?.TRANSLUCENT)),padding:lock?4:small?6:family==='systemMedium'?5:8,gap:lock?2:CARD_GAP};
}
export default async function(ctx) {
 if(ctx.request) {capture(ctx);return;}
 const selection=String(ctx.env?.CARD_SLOT||'1');
 if(ctx.env?.VIEW==='all'||selection==='all') return compactWidget(ctx);
 if(!['1','2','3'].includes(selection)) return widget([text('CARD_SLOT 只能为 1 / 2 / 3')]);
 const result=await displayResult(ctx,selection);
 const alias=cardName(ctx.env?.['CARD'+selection+'_NAME'],selection);
 const family=['systemSmall','systemMedium','systemLarge','systemExtraLarge','accessoryInline','accessoryCircular','accessoryRectangular'].includes(ctx.widgetFamily)?ctx.widgetFamily:'systemSmall';
 const translucent=enabled(ctx.env?.TRANSLUCENT);
 const title=safeTitle(ctx.env?.WIDGET_TITLE,enabled(ctx.env?.SHOW_BRAND)?'中国联通':'');
 const labels=identityTexts(title,alias,result.suffix,family);
 if(family.startsWith('accessory')) return lockWidget(result,labels,family,translucent,balanceThreshold(ctx.env?.LOW_BALANCE_THRESHOLD));
 const time=result.updatedAt?new Date(result.updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}):'--:--';
 const heading=row([{type:'stack',width:6,height:6,borderRadius:3,backgroundColor:SLOT_COLORS[Number(selection)-1],children:[]},...labels,{...text(time,10,COLORS.muted),minScale:1}]);
 if(!result.data) return widget([heading,{...text(result.status,13,COLORS.accent,'medium'),maxLines:2},text('打开联通 App 切换号码并查询余额',10,COLORS.muted)],translucent);
 const d=result.data;
 const warning=lowBalance(d[0],balanceThreshold(ctx.env?.LOW_BALANCE_THRESHOLD));
 const content=family==='systemSmall'?[row([spacer(),capsule(d[0],0,true,warning),spacer()],0),row(d.slice(1).map((v,i)=>capsule(v,i+1)),7)]:[row(d.map((v,i)=>capsule(v,i,false,i===0&&warning)),8)];
 return widget([heading,...content,...(result.status==='已更新'?[]:[footer(result.status)])],translucent);
}
