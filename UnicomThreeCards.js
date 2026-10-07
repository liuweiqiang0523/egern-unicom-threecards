// New implementation informed by IBL3ND/module's single-card API contract.
const API='https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven';
const PREFIX='egern.unicom3.v1.';
const PHONE=/^1[3-9]\d{9}$/;
const accountKey=p=>PREFIX+'account.'+p;
function config(ctx) {
 const slots=[1,2,3].map(i=>String(ctx.env?.['CARD'+i+'_PHONE']||'').trim());
 const nonempty=slots.filter(Boolean);
 return {slots,valid:nonempty.every(p=>PHONE.test(p))&&new Set(nonempty).size===nonempty.length};
}
function safeJSON(ctx,key) {try {return ctx.storage.getJSON(key);} catch {return null;}}
function header(headers,name) {
 if(typeof headers?.get==='function') return headers.get(name)||'';
 const k=Object.keys(headers||{}).find(k=>k.toLowerCase()===name);
 return k ? headers[k] : '';
}
function capture(ctx,cfg) {
 if(!cfg.valid || ctx.env?.STORAGE_CONFIRMED!=='true') return;
 let u; try {u=new URL(String(ctx.request.url));} catch {return;}
 // Origin, exact path, no credentials, no ambiguous phone query.
 if(u.origin!=='https://m.client.10010.com'||u.username||u.password||u.pathname!=='/mobileserviceimportant/home/queryUserInfoSeven') return;
 const values=u.searchParams.getAll('desmobiel');
 if(values.length!==1||!PHONE.test(values[0])||!cfg.slots.includes(values[0])) return;
 const phone=values[0],raw=header(ctx.request.headers,'cookie');
 if(typeof raw!=='string'||!raw.trim()||/[\r\n]/.test(raw)||raw.length>32768) return;
 const cookie=raw.trim(),old=safeJSON(ctx,accountKey(phone));
 if(old?.phone===phone&&old.cookie===cookie) return;
 // One storage write binds credentials and phone; reset data on credential change.
 ctx.storage.setJSON(accountKey(phone),{phone,cookie,capturedAt:Date.now()});
}
const FRESH=60*60*1000, MAX_CACHE=24*60*60*1000;
const mask=p=>p.slice(0,3)+'****'+p.slice(-4);
function parse(res) {
 if(res?.code!=='Y'||!res.feeResource||!res.voiceResource||!res.flowResource) throw new Error('API');
 const fields=[['feeResource','feePersent','元'],['voiceResource','voicePersent','分钟'],['flowResource','flowPersent','MB']];
 return fields.map(([r,v,unit])=>{
  const value=res[r][v];
  if(!['string','number'].includes(typeof value)||!/^\d+(\.\d+)?$/.test(String(value))) throw new Error('DATA');
  const u=String(res[r].newUnit||unit);
  if(!['元','分钟','分','MB','GB','TB','KB','M','G'].includes(u)) throw new Error('DATA');
  return String(value)+u;
 });
}
async function load(ctx,phone) {
 if(!phone) return {status:'未配置'};
 const record=safeJSON(ctx,accountKey(phone));
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
  const current=safeJSON(ctx,accountKey(phone));
  if(current?.phone!==phone||current.cookie!==record.cookie||current.capturedAt!==record.capturedAt) return {status:'凭据已更新，请刷新'};
  const updatedAt=Date.now();
  ctx.storage.setJSON(accountKey(phone),{...current,data,updatedAt});
  return {status:'已更新',data,updatedAt};
 } catch(e) {
  // Never render exceptions: they may contain URL/cookie/phone from the HTTP runtime.
  const current=safeJSON(ctx,accountKey(phone));
  if(current?.cookie!==record.cookie||current?.capturedAt!==record.capturedAt) return {status:'凭据已更新，请刷新'};
  if(e.message==='AUTH'||e.message==='API') {
   ctx.storage.setJSON(accountKey(phone),{phone,capturedAt:record.capturedAt,invalid:true});
   return {status:'登录失效，请重新捕获'};
  }
  if(record.data&&age>=0&&age<MAX_CACHE) return {status:'缓存（查询失败）',data:record.data,updatedAt:record.updatedAt};
  return {status:record.data?'缓存已过期，请重新查询':'查询失败，请重试'};
 }
}
function text(value,size=11) {return {type:'text',text:value,font:{size},maxLines:1,minScale:0.65};}
function widget(children) {return {type:'widget',padding:10,gap:5,refreshAfter:new Date(Date.now()+FRESH).toISOString(),children};}
export default async function(ctx) {
 const cfg=config(ctx);
 if(ctx.request) {capture(ctx,cfg);return;}
 if(!cfg.valid) return widget([text('号码格式错误或重复；请检查模块 Env')]);
 if(ctx.env?.STORAGE_CONFIRMED!=='true') return widget([text('请先完成无敏感数据的 StorageProbe 共享验证')]);
 const selection=String(ctx.env?.CARD_SLOT||'1');
 if(!['all','1','2','3'].includes(selection)) return widget([text('CARD_SLOT 只能为 all / 1 / 2 / 3')]);
 if(selection==='all'&&!['systemMedium','systemLarge','systemExtraLarge'].includes(ctx.widgetFamily||'systemMedium')) return widget([text('三卡总览请选择中/大组件；小组件请选择单卡')]);
 const indexes=selection==='all'?[0,1,2]:[Number(selection)-1];
 const results=await Promise.all(indexes.map(i=>load(ctx,cfg.slots[i])));
 const large=ctx.widgetFamily==='systemLarge'||ctx.widgetFamily==='systemExtraLarge';
 return widget([text('中国联通 · '+(selection==='all'?'三卡总览':'卡'+selection),13),...indexes.map((i,j)=>{
  const result=results[j];
  const time=result.updatedAt?' '+new Date(result.updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}):'';
  return {type:'stack',direction:'column',alignItems:'start',gap:1,children:[
   text('卡'+(i+1)+' '+(cfg.slots[i]?mask(cfg.slots[i]):'未配置')+' · '+result.status+time,large?13:10),
   ...(result.data&&selection!=='all'
    ? result.data.map((v,k)=>text(['话费 ','语音 ','流量 '][k]+v,16))
    : [text(result.data?'话费 '+result.data[0]+' | 语音 '+result.data[1]+' | 流量 '+result.data[2]:'打开联通 App 切换到本卡并查询余额',large?14:11)])
  ]};
 })]);
}
