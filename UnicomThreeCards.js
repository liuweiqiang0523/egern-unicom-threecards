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
function text(value,size=11,color=COLORS.value,weight='regular') {
 return {type:'text',text:value,font:{size,weight},textColor:color,maxLines:1,minScale:0.55};
}
const spacer=()=>({type:'spacer'});
function row(children,gap=6) {return {type:'stack',direction:'row',alignItems:'center',gap,children};}
function widget(children,translucent=false) {
 return {type:'widget',backgroundColor:translucent?{light:'#FFFFFFB3',dark:'#2C2C2EB3'}:COLORS.bg,padding:[8,12,8,12],gap:6,refreshAfter:new Date(Date.now()+FRESH).toISOString(),children};
}
const CAPSULE_COLORS=[{light:'#FFF1E5',dark:'#FFB97626'},{light:'#F2EDFF',dark:'#BEA3FF26'},{light:'#EAF4FF',dark:'#86BFFF26'}];
const SLOT_COLORS=[{light:'#CA7547',dark:'#F6B485'},{light:'#8062AE',dark:'#C2ACF1'},{light:'#4584B6',dark:'#92C5ED'}];
const WARNING={background:{light:'#FDE9E7',dark:'#FF786426'},value:{light:'#B83A32',dark:'#FFB4AA'}};
function balanceThreshold(value) {
 if(!['string','number'].includes(typeof value)||!/^\d+(?:\.\d+)?$/.test(String(value).trim())) return 10;
 const n=Number(value);return Number.isFinite(n)?n:10;
}
function lowBalance(d,threshold) {return threshold>0&&d.unit==='元'&&Number(d.value)<threshold;}
function capsule(d,index,center=false,warning=false) {
 return {type:'stack',direction:'column',alignItems:'center',...(center?{}:{flex:1}),padding:[7,center?20:8,7,center?20:8],gap:3,backgroundColor:warning?WARNING.background:CAPSULE_COLORS[index],borderRadius:14,children:[text(d.title,10,{light:'#51515A',dark:'#D8D8DF'},'medium'),row([text(d.value,22,warning?WARNING.value:COLORS.value,'semibold'),text(d.unit,10,COLORS.muted)],3)]};
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
export default async function(ctx) {
 if(ctx.request) {capture(ctx);return;}
 const selection=String(ctx.env?.CARD_SLOT||'1');
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
