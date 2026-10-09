// Passive evidence only. No identity contract has been verified for onLine.htm.
// Never persist values, credentials, bodies, cookies or inferred slot bindings.
const KEY = 'egern.unicom.online-diag.v1';
const REQUEST_FIELDS = ['appId', 'token_online', 'version', 'deviceId', 'deviceCode', 'deviceModel', 'step', 'isFirstInstall'];
const RESPONSE_FIELDS = ['token_online', 'invalidat', 'code'];
const flags = names => Object.fromEntries(names.map(name => [name, false]));
function empty() {
  return { schema: 1, requestSeen: 0, responseSeen: 0, bound: false, reason: 'UNBOUND_IDENTITY',
    requestFields: flags(REQUEST_FIELDS), responseFields: flags(RESPONSE_FIELDS), setCookie: false };
}
function matches(request) {
  try {
    const u = new URL(request.url);
    return request.method === 'POST' && u.origin === 'https://m.client.10010.com' &&
      !u.username && !u.password && u.pathname === '/mobileService/onLine.htm';
  } catch { return false; }
}
async function requestFields(request) {
  const out = flags(REQUEST_FIELDS);
  const text = await request.text();
  if (typeof text !== 'string' || text.length > 65536) return out;
  const type = request.headers.get('content-type') || '';
  if (type.split(';')[0].trim().toLowerCase() === 'application/x-www-form-urlencoded') {
    const form = new URLSearchParams(text);
    for (const name of REQUEST_FIELDS) out[name] = form.getAll(name).some(v => v.length > 0);
  } else if (type.split(';')[0].trim().toLowerCase() === 'application/json') {
    const data = JSON.parse(text);
    for (const name of REQUEST_FIELDS) out[name] = data !== null && typeof data === 'object' &&
      Object.hasOwn(data, name) && data[name] !== null && data[name] !== '';
  }
  return out;
}
function safeRead(ctx) {
  const out = empty();
  try {
    const old = ctx.storage.getJSON(KEY);
    if (!old || old.schema !== 1) return out;
    for (const name of ['requestSeen', 'responseSeen']) {
      if (Number.isSafeInteger(old[name]) && old[name] >= 0) out[name] = Math.min(old[name], 9999);
    }
    for (const [group, names] of [['requestFields', REQUEST_FIELDS], ['responseFields', RESPONSE_FIELDS]]) {
      for (const name of names) out[group][name] = old[group]?.[name] === true;
    }
    out.setCookie = old.setCookie === true;
  } catch { /* Fixed default only. */ }
  return out;
}
function widget(record) {
  const count = fields => Object.values(fields).filter(v => v === true).length;
  const req = record.requestFields;
  const lines = ['联通在线 · 被动诊断',
    `请求 ${record.requestSeen} / 响应 ${record.responseSeen}`,
    `appId ${req.appId ? '有' : '无'} / token ${req.token_online ? '有' : '无'}`,
    `请求字段 ${count(req)}/8 · 响应 ${count(record.responseFields)}/3`,
    `Set-Cookie ${record.setCookie ? '有' : '无'} · 绑定 false`, 'UNBOUND_IDENTITY'];
  return { type:'widget', padding:10, gap:4,
    children:lines.map(text => ({type:'text', text, font:{size:11}, maxLines:1, minScale:0.6})) };
}
export default async function (ctx) {
  if (!ctx.request) return widget(safeRead(ctx));
  if (!matches(ctx.request)) return;
  try {
    const record = safeRead(ctx);
    if (ctx.response) {
      record.responseSeen = Math.min(record.responseSeen + 1, 9999);
      try {
        const text = await ctx.response.text();
        if (typeof text === 'string' && text.length <= 65536) {
          const data = JSON.parse(text);
          if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
            for (const name of RESPONSE_FIELDS) record.responseFields[name] ||= Object.hasOwn(data, name) &&
              data[name] !== null && data[name] !== '';
          }
        }
      } catch { /* Response field values never retained. */ }
      try { record.setCookie ||= ctx.response.headers.has('set-cookie') === true; } catch { /* No header values read. */ }
    } else {
      record.requestSeen = Math.min(record.requestSeen + 1, 9999);
      try {
        const fields = await requestFields(ctx.request);
        for (const name of REQUEST_FIELDS) record.requestFields[name] ||= fields[name];
      } catch { /* Seen event remains evidence even when parsing fails. */ }
    }
    ctx.storage.setJSON(KEY, record);
  } catch { /* Do not surface body, header or storage exception details. */ }
  // Returning nothing leaves the intercepted traffic unchanged.
}
