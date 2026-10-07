// No carrier request, phone or cookie is read or persisted by this probe.
export default async function(ctx) {
 const key='egern.unicom3.v1.public-storage-probe';
 if(ctx.request) {
  if(/^https:\/\/example\.com\/egern-storage-probe\?write=1(?:&|$)/.test(String(ctx.request.url))) ctx.storage.setJSON(key,{marker:'public-probe',at:Date.now()});
  return;
 }
 let r;try {r=ctx.storage.getJSON(key);}catch {r=null;}
 const fresh=r?.marker==='public-probe'&&Date.now()-r.at>=0&&Date.now()-r.at<10*60*1000;
 return {type:'widget',padding:12,children:[{type:'text',text:fresh?'已读取请求脚本标记 '+new Date(r.at).toISOString():'未确认共享：请先浏览器打开探针 URL',font:{size:12},maxLines:3}]};
}
