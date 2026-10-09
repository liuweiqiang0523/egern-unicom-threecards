// Passive entry evidence only. Never consume private payloads or modify traffic.
export const BUILD = 'ONLINE_CONTROL_V3';
const BASE = 'egern.unicom.online-diag.v3';
const PROBE = `${BASE}.local-probe`;
const HOOKS = new Map([
  ['unicom-online-diagnostic-request', 'online-request'],
  ['unicom-online-diagnostic-response', 'online-response'],
  ['unicom-online-diagnostic-balance-response', 'balance-response'],
]);
const BOOLS = ['requestPresent', 'responsePresent', 'urlMatch', 'writeReadbackOK'];
const CONTEXT = ['CONTEXT_OK', 'CONTEXT_INVALID'];
function empty() {
  return {schema:3, entrySeen:0, requestPresent:false, responsePresent:false,
    urlMatch:false, writeReadbackOK:false, contextStatus:'CONTEXT_INVALID'};
}
function read(ctx, key) {
  const record = empty();
  try {
    const old = ctx.storage.getJSON(key);
    if (old == null) return {status:'MISSING', record};
    if (old.schema !== 3) return {status:'INVALID', record};
    if (Number.isSafeInteger(old.entrySeen) && old.entrySeen >= 0) record.entrySeen = Math.min(old.entrySeen, 9999);
    for (const name of BOOLS) record[name] = old[name] === true;
    record.contextStatus = CONTEXT.includes(old.contextStatus) ? old.contextStatus : 'CONTEXT_INVALID';
    return {status:'READ_OK', record};
  } catch { return {status:'READ_FAILED', record}; }
}
function matches(request, kind) {
  try {
    const u = new URL(request.url);
    const path = kind === 'balance-response' ? '/mobileserviceimportant/home/queryUserInfoSeven' : '/mobileService/onLine.htm';
    return u.origin === 'https://m.client.10010.com' && !u.username && !u.password && u.pathname === path;
  } catch { return false; }
}
function widget(ctx) {
  let write = 'WRITE_FAILED', probeRead = 'READ_FAILED';
  try { ctx.storage.setJSON(PROBE, {probe:true}); write = 'WRITE_OK'; } catch { /* Fixed statuses only. */ }
  try {
    const probe = ctx.storage.getJSON(PROBE);
    probeRead = probe == null ? 'MISSING' : probe.probe === true ? 'READ_OK' : 'INVALID';
  } catch { /* No exception details. */ }
  const lines = ['联通在线 · 响应对照', `BUILD ${BUILD}`, `LOCAL ${write} ${probeRead}`, '本地自检≠hook共享证明'];
  for (const kind of HOOKS.values()) {
    const {status, record:r} = read(ctx, `${BASE}.${kind}`);
    lines.push(`${kind} ${status}`);
    if (status === 'READ_OK') lines.push(`入口 ${r.entrySeen} ${r.contextStatus}`,
      `request ${r.requestPresent} / response ${r.responsePresent}`,
      `urlMatch ${r.urlMatch} / writeReadbackOK ${r.writeReadbackOK}`);
  }
  return {type:'widget', padding:8, gap:2,
    children:lines.map(text => ({type:'text', text, font:{size:10}, maxLines:1, minScale:0.6}))};
}
export default async function (ctx) {
  // Official script name, not env or request presence, classifies entry BEFORE guards.
  const name = ctx.script?.name;
  if (name === 'unicom-online-diagnostic-widget') return widget(ctx);
  const kind = HOOKS.get(name);
  if (!kind) return;
  const key = `${BASE}.${kind}`;
  try {
    const {record} = read(ctx, key);
    record.entrySeen = Math.min(record.entrySeen + 1, 9999);
    record.requestPresent = !!ctx.request;
    record.responsePresent = !!ctx.response;
    record.urlMatch = false;
    record.writeReadbackOK = false;
    record.contextStatus = 'CONTEXT_INVALID';
    // Persist safe invocation evidence even when request URL/context is unavailable.
    ctx.storage.setJSON(key, record);
    record.urlMatch = matches(ctx.request, kind);
    record.contextStatus = record.urlMatch && record.requestPresent &&
      (kind === 'online-request' || record.responsePresent) ? 'CONTEXT_OK' : 'CONTEXT_INVALID';
    ctx.storage.setJSON(key, record);
    const check = read(ctx, key);
    record.writeReadbackOK = check.status === 'READ_OK' &&
      Object.keys(record).every(field => check.record[field] === record[field]);
    // True describes the preceding same-hook readback, not this final write or cross-hook sharing.
    ctx.storage.setJSON(key, record);
  } catch { /* Pass through; a failed final write cannot reliably be reported elsewhere. */ }
}
