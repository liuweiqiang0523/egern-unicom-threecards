// Entrance only: never read bodies or headers, infer identities or send requests.
export const BUILD = 'ONLINE_ENTRANCE_V2';
const KEY = 'egern.unicom.online-diag.v2';
const PROBE = `${KEY}.local-probe`;
const COUNTERS = ['requestSeen', 'responseSeen', 'postSeen', 'otherSeen'];
const READ = ['READ_OK', 'MISSING', 'READ_FAILED', 'INVALID'];
function empty() {
  return {schema:2, requestSeen:0, responseSeen:0, postSeen:0, otherSeen:0,
    requestPresent:false, responsePresent:false, method:'OTHER', readStatus:'MISSING'};
}
function read(ctx) {
  const record = empty();
  try {
    const old = ctx.storage.getJSON(KEY);
    if (old == null) return {status:'MISSING', record};
    if (old.schema !== 2) return {status:'INVALID', record};
    for (const name of COUNTERS) {
      if (Number.isSafeInteger(old[name]) && old[name] >= 0) record[name] = Math.min(old[name], 9999);
    }
    record.requestPresent = old.requestPresent === true;
    record.responsePresent = old.responsePresent === true;
    record.method = old.method === 'POST' ? 'POST' : 'OTHER';
    record.readStatus = READ.includes(old.readStatus) ? old.readStatus : 'INVALID';
    return {status:'READ_OK', record};
  } catch { return {status:'READ_FAILED', record}; }
}
function matches(request) {
  try {
    const u = new URL(request.url);
    return u.origin === 'https://m.client.10010.com' && !u.username && !u.password &&
      u.pathname === '/mobileService/onLine.htm';
  } catch { return false; }
}
function widget(ctx) {
  let write = 'WRITE_FAILED', probeRead = 'READ_FAILED';
  try { ctx.storage.setJSON(PROBE, {probe:true}); write = 'WRITE_OK'; } catch { /* Fixed status only. */ }
  try {
    const probe = ctx.storage.getJSON(PROBE);
    probeRead = probe == null ? 'MISSING' : probe.probe === true ? 'READ_OK' : 'INVALID';
  } catch { /* Fixed status only. */ }
  const {status, record:r} = read(ctx);
  const lines = ['联通在线 · 入口诊断', `BUILD ${BUILD}`, `LOCAL ${write} ${probeRead}`,
    '本地自检≠hook共享证明', `HOOK ${status}`];
  if (status === 'READ_OK') lines.push(`请求 ${r.requestSeen} / 响应 ${r.responseSeen}`,
    `POST ${r.postSeen} / OTHER ${r.otherSeen}`,
    `request ${r.requestPresent} / response ${r.responsePresent}`,
    `method ${r.method} / 上次读取 ${r.readStatus}`);
  else lines.push('无可用hook记录（不等于未执行）');
  return {type:'widget', padding:8, gap:2,
    children:lines.map(text => ({type:'text', text, font:{size:10}, maxLines:1, minScale:0.6}))};
}
export default async function (ctx) {
  const kind = ctx.env?.DIAGNOSTIC_HOOK;
  const isHook = kind === 'request' || kind === 'response' || !!ctx.request || !!ctx.response;
  if (!isHook) return widget(ctx);
  // A hook without request URL cannot be attributed to the reviewed endpoint.
  if (!ctx.request || !matches(ctx.request)) return;
  try {
    const {status, record} = read(ctx);
    const counter = kind === 'response' || (!kind && ctx.response) ? 'responseSeen' : 'requestSeen';
    record[counter] = Math.min(record[counter] + 1, 9999);
    record.requestPresent = !!ctx.request;
    record.responsePresent = !!ctx.response;
    record.method = ctx.request.method === 'POST' ? 'POST' : 'OTHER';
    const methodCounter = record.method === 'POST' ? 'postSeen' : 'otherSeen';
    record[methodCounter] = Math.min(record[methodCounter] + 1, 9999);
    record.readStatus = status;
    ctx.storage.setJSON(KEY, record);
  } catch { /* No error details and no traffic modification. Write failure cannot be shared reliably. */ }
}
