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
const mask=p=>p.slice(0,3)+'****'+p.slice(-4);
function parse(res) {
 if(res?.code!=='Y'||!res.feeResource||!res.voiceResource||!res.flowResource) throw new Error('API');
 const fields=[['feeResource','feePersent','元'],['voiceResource','voicePersent','分钟'],['flowResource','flowPersent','MB']];
 return fields.map(([r,v,unit])=>{
  const value=res[r][v];
  if(!['string','number'].includes(typeof value)||!(r==='feeResource'?/^-?\d+(\.\d+)?$/:/^\d+(\.\d+)?$/).test(String(value))) throw new Error('DATA');
  const u=String(res[r].newUnit||unit);
  if(!['元','分钟','分','MB','GB','TB','KB','M','G'].includes(u)) throw new Error('DATA');
  return String(value)+u;
 });
}
async function load(ctx,slot) {
 const record=safeJSON(ctx,slotKey(slot));
 const phone=record?.phone;
 if(!phone) return {status:'待捕获'};
 if(record?.phone===phone&&record.invalid) return {status:'登录失效，请重新捕获'};
 if(record?.phone!==phone||!record.cookie) return {status:'待捕获'};
 const now=Date.now(),age=now-record.updatedAt;
 if(record.data && age>=0&&age<FRESH) return {status:'已更新',data:record.data,updatedAt:record.updatedAt};
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
  ctx.storage.setJSON(slotKey(slot),{...current,data,updatedAt});
  return {status:'已更新',data,updatedAt};
 } catch(e) {
  // Never render exceptions: they may contain URL/cookie/phone from the HTTP runtime.
  const current=safeJSON(ctx,slotKey(slot));
  if(current?.cookie!==record.cookie||current?.capturedAt!==record.capturedAt) return {status:'凭据已更新，请刷新'};
  if(e.message==='AUTH'||e.message==='API') {
   ctx.storage.setJSON(slotKey(slot),{phone,capturedAt:record.capturedAt,invalid:true});
   return {status:'登录失效，请重新捕获'};
  }
  if(record.data&&age>=0&&age<MAX_CACHE) return {status:'缓存（查询失败）',data:record.data,updatedAt:record.updatedAt};
  return {status:record.data?'缓存已过期，请重新查询':'查询失败，请重试'};
 }
}
function text(value,size=11) {return {type:'text',text:value,font:{size},maxLines:1,minScale:0.65};}
function widget(children) {return {type:'widget',padding:10,gap:5,refreshAfter:new Date(Date.now()+FRESH).toISOString(),children};}
export default async function(ctx) {
 if(ctx.request) {capture(ctx);return;}
 const selection=String(ctx.env?.CARD_SLOT||'1');
 if(!['1','2','3'].includes(selection)) return widget([text('CARD_SLOT 只能为 1 / 2 / 3')]);
 const slot=Number(selection),phone=safeJSON(ctx,slotKey(slot))?.phone;
 const result=await load(ctx,slot);
 const time=result.updatedAt?' '+new Date(result.updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}):'';
 return widget([text('中国联通 · 卡'+selection,13),
  {type:'stack',direction:'column',alignItems:'start',gap:1,children:[
   text((phone?mask(phone):'待捕获')+' · '+result.status+time,10),
   ...(result.data?result.data.map((v,k)=>text(['话费 ','语音 ','流量 '][k]+v,16))
    :[text('打开联通 App 切换号码并查询余额')])
  ]}
 ]);
}
