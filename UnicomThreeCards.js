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
// Official image DSL supports data:<mime>;base64. Embed the existing public brand asset
// so the actual Unicom knot is offline, not a remote URL or a substituted SIM symbol.
const ICON_SRC='data:image/png;base64,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';
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
// Summary-only neutral glass palette; single-card styling and account slots stay unchanged.
const SUMMARY_COLORS=[{light:'#8843C2',dark:'#B66CFF'},{light:'#286CC4',dark:'#5EA7FF'},{light:'#087F70',dark:'#48D7C0'}];
const SUMMARY_BG={light:'#F3F4F6',dark:'#17181B'};
const SUMMARY_INK={light:'#202329',dark:'#ECEEF2'};
const SUMMARY_MUTED={light:'#626975',dark:'#989EA9'};
const SUMMARY_TRACK={light:'#D9DDE3',dark:'#303238'};
function summaryFeeColor(d,threshold,slot) {
 if(!lowBalance(d,threshold)) return SUMMARY_COLORS[slot];
 return Number(d.value)<threshold/2?{light:'#B83A47',dark:'#FF5C68'}:{light:'#A75E32',dark:'#D99A70'};
}
const WARNING={background:{light:'#FDE9E7',dark:'#FF786426'},value:{light:'#B83A32',dark:'#FFB4AA'}};
const TRACK={light:'#E2E2E7',dark:'#5A5A5E'};
const CHIP_BG={light:'#ECECF1',dark:'#3A3A3C'};
const REMAIN={light:'#12833F',dark:'#31D05A'};
const BAR_H=4, SEP_H=2;
// Summary card block: full-width rounded wash per card so the three cards read apart on a phone.
const CARD_RADIUS=16, CARD_GAP=7, TITLE_GAP=2, CARD_PAD=[4,7,4,7];
const UNIT_MB={KB:1/1024,M:1,MB:1,G:1024,GB:1024,T:1024*1024,TB:1024*1024};
// thead/ticon: the summary's slim top title bar (text / icon), kept small so the cards get the room.
const FLOW_SIZES={systemSmall:{name:8,unit:7,title:7,value:8,label:7,tag:5,time:7,icon:6,thead:11,ticon:12,cpad:[2,6,2,6],fpad:[3,6,3,6],gap:2,fgap:1},systemMedium:{name:7,unit:6,title:5,value:7,label:5,tag:4,time:6,icon:5,thead:12,ticon:13,cpad:[1,6,1,6],fpad:[2,6,2,6],gap:2,fgap:1},systemLarge:{name:13,unit:9,title:10,value:18,label:10,tag:6,time:9,icon:7,thead:18,ticon:19,cpad:[4,9,4,9],fpad:[5,10,5,10],gap:3,fgap:2},systemExtraLarge:{name:14,unit:10,title:11,value:19,label:11,tag:7,time:10,icon:8,thead:19,ticon:20,cpad:[5,10,5,10],fpad:[6,11,6,11],gap:3,fgap:2}};
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
function slotTint(slot) {return {light:'#FFFFFF',dark:'#23262B'};}
function slotFill(slot) {const c=SUMMARY_COLORS[slot];return {type:'linear',colors:[c,c],startPoint:{x:0,y:0.5},endPoint:{x:1,y:0.5}};}
// Unlimited cards fade to the same colour at 00 alpha so the bar visibly has no end.
function slotFade(slot) {const c=SUMMARY_COLORS[slot];return {type:'linear',colors:[c,{light:c.light+'00',dark:c.dark+'00'}],startPoint:{x:0,y:0.5},endPoint:{x:1,y:0.5}};}
// Neutral summary surfaces separate cards without broad purple/blue/teal colour washes.
function slotCardBg(slot) {return {light:'#F8F9FB',dark:'#1D1F23'};}
function slotCardBorder(slot) {return {light:'#DDE1E7',dark:'#292B30'};}
// CARD_ORDER only reorders the summary view: a strict 1/2/3 permutation, else the 1,2,3 default.
function cardOrder(spec) {
 const parts=(typeof spec==='string'||typeof spec==='number')?String(spec).split(',').map(p=>p.trim()):[];
 if(parts.length!==3||!parts.every(p=>/^[123]$/.test(p))) return [0,1,2];
 const nums=parts.map(Number);
 return new Set(nums).size===3?nums.map(n=>n-1):[0,1,2];
}
// metric.unlimited -> gradient fade + ∞; metric.ratio -> real/relative fill; null -> plain separator.
function flowBar(slot,metric,s) {
 if(metric.unlimited) return row([{type:'stack',height:BAR_H,flex:1,backgroundGradient:slotFade(slot),children:[]},text('∞',s.tag,SUMMARY_MUTED,'medium')],4);
 if(metric.ratio===null) return {type:'stack',direction:'row',height:SEP_H,borderRadius:1,backgroundColor:SUMMARY_TRACK,children:[]};
 const r=Math.round(metric.ratio*1000);
 const fill={type:'stack',height:BAR_H,backgroundGradient:slotFill(slot),flex:r};
 const inner=r>=1000?[fill]:r<=0?[]:[fill,{type:'stack',height:BAR_H,flex:1000-r}];
 return {type:'stack',direction:'row',height:BAR_H,borderRadius:BAR_H/2,backgroundColor:SUMMARY_TRACK,children:inner};
}
function balanceThreshold(value) {
 if(!['string','number'].includes(typeof value)||!/^\d+(?:\.\d+)?$/.test(String(value).trim())) return 10;
 const n=Number(value);return Number.isFinite(n)?n:10;
}
function lowBalance(d,threshold) {return threshold>0&&d.unit==='元'&&Number(d.value)<threshold;}
function capsule(d,index,center=false,warning=false) {
 return {type:'stack',direction:'column',alignItems:'center',...(center?{}:{flex:1}),padding:[7,center?20:8,7,center?20:8],gap:3,backgroundColor:warning?WARNING.background:CAPSULE_COLORS[index],borderRadius:14,children:[text(d.title,10,{light:'#51515A',dark:'#D8D8DF'},'medium'),row([text(d.value,22,warning?WARNING.value:COLORS.value,'semibold'),text(d.unit,10,COLORS.muted)],3)]};
}
function chip(label,s) {return {type:'stack',direction:'row',alignItems:'center',padding:[1,6,1,6],borderRadius:6,backgroundColor:{light:'#E6E8EC',dark:'#292B30'},children:[text(label,s.tag,{light:'#626975',dark:'#C2C6CE'},'medium')]};}
// Summary resources use neutral surfaces; hue is confined to status marks and key values.
function miniCapsule(d,slot,s,valueColor=SUMMARY_INK) {
 return {type:'stack',direction:'row',alignItems:'center',flex:1,gap:3,padding:s.cpad,backgroundColor:slotTint(slot),borderRadius:10,children:[text(d.title,s.label,SUMMARY_MUTED,'medium'),text(d.value,s.value,valueColor,'semibold'),text(d.unit,s.unit,SUMMARY_MUTED)]};
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
// Three-column reference layout: identity/time, fee + voice + flow, bottom bar.
// A narrow documented stack rail marks the slot; no tinted metric capsules.
function compactCard(ctx,result,selection,family,metric) {
 const lock=family.startsWith('accessory'),small=family==='systemSmall';
 const s=FLOW_SIZES[family]||FLOW_SIZES.systemMedium;
 const slot=selection-1;
 const alias=cardName(ctx.env?.['CARD'+selection+'_NAME'],selection);
 const dot={type:'stack',width:s.icon,height:s.icon,borderRadius:2,backgroundColor:SUMMARY_COLORS[slot],children:[]};
 const time=result.updatedAt?new Date(result.updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}):'--:--';
 const idRow=row([dot,...compactIdentity(alias,lock?'':result.suffix,family,s),spacer(),{...text(time,s.time,SUMMARY_MUTED),minScale:1}],4);
 const roomy=family==='systemLarge'||family==='systemExtraLarge';
 // Reference rows are ~90pt apart at a normalized 402pt screenshot width. Fixed row heights
 // fence off recursive flex inflation; excess iOS frame height belongs below the whole panel.
 const cardHeight=family==='systemExtraLarge'?86:82;
 const block=children=>({type:'stack',direction:'row',alignItems:'start',gap:s.gap,padding:family==='systemMedium'?[0,7,0,7]:roomy?[6,8,6,8]:CARD_PAD,...(roomy?{height:cardHeight}:{flex:1}),backgroundColor:slotCardBg(slot),borderRadius:CARD_RADIUS,borderWidth:1,borderColor:slotCardBorder(slot),children:[{type:'stack',direction:'column',width:2,height:small?26:family==='systemMedium'?30:60,borderRadius:1,backgroundColor:SUMMARY_COLORS[slot],children:[]},{type:'stack',direction:'column',gap:family==='systemMedium'?1:roomy?0:s.gap,flex:1,children}]});
 if(!result.data) return lock?{type:'stack',direction:'column',gap:2,children:[idRow,text(result.status,9,COLORS.accent)]}:block([idRow,text(result.status,small?9:11,COLORS.accent)]);
 const [fee,voice,flow]=result.data;
 if(lock) return {type:'stack',direction:'column',gap:1,children:[row([dot,...compactIdentity(alias,'',family,s),text(flow.value,s.value,COLORS.value,'semibold'),text(flow.unit,s.unit,SUMMARY_MUTED)],3)]};
 const feeColor=summaryFeeColor(fee,balanceThreshold(ctx.env?.LOW_BALANCE_THRESHOLD),slot);
 const valueColor=SUMMARY_COLORS[slot];
 const column=(d,color,badge=false,index=0)=>({type:'stack',direction:'column',flex:roomy&&index===2?1.25:1,gap:s.fgap,children:[...(badge&&family==='systemMedium'?[row([text(d.title,s.label,SUMMARY_MUTED,'medium'),chip('不限量',s)],2)]:[roomy?row([{type:'image',src:'sf-symbol:'+['yensign.circle','phone.fill','cloud.fill'][index],width:10,height:10,color:SUMMARY_COLORS[slot]},text(d.title,s.label,SUMMARY_MUTED,'medium')],3):text(d.title,s.label,SUMMARY_MUTED,'medium')]),row([text(d.value,roomy&&index===2?s.value-1:s.value,color,'semibold'),text(d.unit,s.unit,SUMMARY_MUTED),...(badge&&roomy?[{...chip('不限量',s),padding:[1,2,1,2]}]:[])],2)]});
 // Small widgets keep the three identities and exact flow values, without cramming nine metrics.
 const metrics=small?row([text(flow.title,s.title,SUMMARY_MUTED),spacer(),text(flow.value,s.value,valueColor,'semibold'),text(flow.unit,s.unit,SUMMARY_MUTED)],2):row([column(fee,feeColor),...(roomy?[{type:'stack',width:1,height:30,backgroundColor:slotCardBorder(slot),children:[]}]:[]),column(voice,SUMMARY_INK,false,1),...(roomy?[{type:'stack',width:1,height:30,backgroundColor:slotCardBorder(slot),children:[]}]:[]),column(flow,valueColor,metric.unlimited,2)],5);
 const bottom={type:'stack',direction:'column',height:metric.unlimited?Math.max(BAR_H,s.tag*1.3):metric.ratio===null?SEP_H:BAR_H,children:[flowBar(slot,metric,s)]};
 if(!small){metrics.alignItems='start';metrics.height=s.label*1.2+s.value*1.2+s.fgap;}
 if(roomy){
  idRow.height=s.name*1.3;
  // Explicit gaps, not a floor-pinning spacer: title → metrics → bar keep the same rhythm.
  return block([idRow,{type:'stack',height:7,children:[]},metrics,{type:'stack',height:5,children:[]},bottom]);
 }
 return block([idRow,metrics,spacer(),bottom]);
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
 // 中国联通; an explicit SHOW_BRAND=false/off/0 hides the whole bar (including the icon). The header shows the latest actual successful query timestamp; each card retains its own time. The single-card path below keeps its own inline heading and no such bar.
 // CRITICAL: the bar carries NO flex and no flex child. Egern makes any element whose subtree has a
 // flex child height-flexible in the widget, so a flexed title used to swallow half the widget
 // height (and nesting the cards made its share even bigger). A trailing spacer keeps the title left
 // aligned without ever absorbing vertical space.
 const title=lock?'':safeTitle(ctx.env?.WIDGET_TITLE,brandHidden(ctx.env?.SHOW_BRAND)?'':'中国联通');
 const s=FLOW_SIZES[family]||FLOW_SIZES.systemMedium;
 const latestSuccess=Math.max(0,...results.filter(r=>r.data&&r.updatedAt).map(r=>r.updatedAt));
 const successfulTime=latestSuccess?new Date(latestSuccess).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}):'';
 const titleBar=title?[{type:'stack',direction:'row',alignItems:'center',gap:3,padding:[0,0,0,0],children:[{type:'image',src:ICON_SRC,color:{light:'#C82E40',dark:'#E84353'},width:s.ticon,height:s.ticon,borderRadius:3,resizeMode:'contain'},text(title,s.thead,COLORS.value,'semibold'),spacer(),...(successfulTime?[{type:'image',src:'sf-symbol:arrow.clockwise',width:s.time,height:s.time,color:SUMMARY_MUTED},text(successfulTime,s.time,SUMMARY_MUTED)]:[])]}]:[];
 const cardList=order.map(i=>compactCard(ctx,results[i],i+1,family,metrics[i]));
 // Large rows stay at reference proportions rather than stretching to fill a system widget.
 // Medium/small retain their compact budget; the header never contains flex.
 const roomy=family==='systemLarge'||family==='systemExtraLarge';
 const holder={type:'stack',direction:'column',gap:CARD_GAP,...(roomy?{height:3*(family==='systemExtraLarge'?86:82)+2*CARD_GAP}:{flex:1}),children:cardList};
 const children=roomy?[...titleBar,holder,spacer()]:titleBar.length?[titleBar[0],holder]:cardList;
 return {...widget(children,enabled(ctx.env?.TRANSLUCENT)),backgroundColor:enabled(ctx.env?.TRANSLUCENT)?{light:'#F3F4F6B3',dark:'#17181BB3'}:SUMMARY_BG,padding:lock?4:small?6:family==='systemMedium'?6:family==='systemLarge'?7:8,gap:lock?2:roomy?6:titleBar.length?TITLE_GAP:CARD_GAP};
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
