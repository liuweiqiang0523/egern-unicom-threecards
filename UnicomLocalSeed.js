// Isolated, passive, local-only experiment. No renewal or outbound requests.
export const BUILD = 'LOCAL_SEED_V1';
export const KEY = 'egern.unicom.local-seed.v1.state';
const TTL = 86400000;
const FAMILIES = ['systemSmall','systemMedium','systemLarge','systemExtraLarge','accessoryCircular','accessoryRectangular','accessoryInline'];
const REASONS = ['EMPTY','SEED_PENDING','BOUND_READY','APPID_MISSING','REQUEST_BODY_UNAVAILABLE','LOGIN_REJECTED','PAYLOAD_INVALID','CANDIDATE_COLLISION','ECS_MISMATCH','BALANCE_INVALID','SEED_EXPIRED','BOUND_LOCKED','STATE_INVALID'];
const LOGIN = '/mobileService/login.htm';
const BALANCE = '/mobileserviceimportant/home/queryUserInfoSeven';
function value(x, max = 4096) { return typeof x === 'string' && x.length > 0 && x.length <= max && !/[\s\x00-\x1f\x7f;,]/.test(x); }
function header(h, name) {
  if (!h) return null;
  const a = typeof h.getAll === 'function' ? h.getAll(name) : [h.get(name)];
  return a.length === 1 && typeof a[0] === 'string' && a[0].length <= 16384 && !/[\x00-\x1f\x7f]/.test(a[0]) ? a[0] : null;
}
function endpoint(r) {
  const u = new URL(r.url);
  if (typeof r.url !== 'string' || r.url.length > 16384 || /[\x00-\x20\x7f\\]/.test(r.url) || u.origin !== 'https://m.client.10010.com' || u.username || u.password || u.hash) return null;
  if (!r.url.startsWith(`https://m.client.10010.com${u.pathname}`) || !['', '?'].includes(r.url.slice(`https://m.client.10010.com${u.pathname}`.length, `https://m.client.10010.com${u.pathname}`.length + 1))) return null;
  return u;
}
// Validate JSON grammar while retaining only allowlisted top-level scalar values.
// Unknown field values are scanned in memory, never decoded, returned or stored.
function selectedJSON(raw, allowed) {
  let i = 0; const out = Object.create(null); const seen = new Set();
  const ws = () => { while (/[\x20\t\r\n]/.test(raw[i] || '\uFFFF')) i++; };
  function str(decode) {
    const start = i;
    if (raw[i++] !== '"') throw 0;
    while (i < raw.length) {
      const c = raw[i++];
      if (c === '"') return decode ? JSON.parse(raw.slice(start,i)) : undefined;
      if (c.charCodeAt(0) < 32) throw 0;
      if (c === '\\') {
        const e = raw[i++];
        if (e === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(raw.slice(i,i+4))) throw 0; i += 4; }
        else if (!'"\\/bfnrt'.includes(e || '\uFFFF')) throw 0;
      }
    }
    throw 0;
  }
  function item(keep = false, depth = 0) {
    if (depth > 32) throw 0;
    ws(); const c = raw[i];
    if (c === '"') return str(keep);
    if (c === '{' || c === '[') {
      i++; ws(); const end = c === '{' ? '}' : ']';
      if (raw[i] === end) { i++; return; }
      for (;;) {
        if (c === '{') { str(false); ws(); if (raw[i++] !== ':') throw 0; }
        item(false,depth+1); ws();
        if (raw[i] === end) { i++; return; }
        if (raw[i++] !== ',') throw 0; ws();
      }
    }
    const m = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(i));
    if (!m) throw 0; i += m[0].length;
    return keep ? JSON.parse(m[0]) : undefined;
  }
  ws(); if (raw[i++] !== '{') throw 0; ws();
  if (raw[i] !== '}') for (;;) {
    const k = str(true); ws(); if (raw[i++] !== ':') throw 0;
    if (allowed.includes(k) && seen.has(k)) throw 0;
    seen.add(k); const v = item(allowed.includes(k));
    if (allowed.includes(k)) out[k] = v;
    ws(); if (raw[i] === '}') break;
    if (raw[i++] !== ',') throw 0; ws();
  }
  i++; ws(); if (i !== raw.length) throw 0;
  return out;
}
async function requestFields(r) {
  if (typeof r.text !== 'function' || r.body === null) return null;
  const ct = header(r.headers,'content-type')?.split(';')[0].trim().toLowerCase();
  if (!['application/json','application/x-www-form-urlencoded'].includes(ct)) throw 0;
  const raw = await r.text();
  if (typeof raw !== 'string' || raw.length > 65536) throw 0;
  if (ct === 'application/json') return selectedJSON(raw,['appId','version']);
  const out = Object.create(null);
  for (const part of raw.split('&')) {
    const n = part.indexOf('=');
    const k = decodeURIComponent((n < 0 ? part : part.slice(0,n)).replace(/\+/g,' '));
    if (!['appId','version'].includes(k)) continue; // Never decode private field values.
    if (Object.hasOwn(out,k)) throw 0;
    out[k] = decodeURIComponent((n < 0 ? '' : part.slice(n+1)).replace(/\+/g,' '));
  }
  return out;
}
function seedValid(s) {
  return s && Object.keys(s).sort().join(',') === 'appId,createdAt,ecs_token,token_online,version' && value(s.token_online) && value(s.ecs_token) && value(s.appId,512) && value(s.version,128) && Number.isSafeInteger(s.createdAt) && s.createdAt > 0;
}
function load(ctx) {
  const s = ctx.storage.getJSON(KEY);
  if (s == null) return {schema:1,status:'EMPTY',seed:null,bound:null};
  if (Object.keys(s).sort().join(',') !== 'bound,schema,seed,status' || s.schema !== 1 || !REASONS.includes(s.status) || (s.seed && !seedValid(s.seed)) || (s.bound && (!/^1[3-9]\d{9}$/.test(s.bound.phone) || Object.keys(s.bound).sort().join(',') !== 'phone,seed' || !seedValid(s.bound.seed))) || (s.seed && s.bound)) throw 0;
  return s;
}
function expire(s) {
  if (s.seed && (Date.now() - s.seed.createdAt > TTL || Date.now() < s.seed.createdAt)) { s.seed = null; s.status = 'SEED_EXPIRED'; }
}
function save(ctx,s,status) {
  // Collision is sticky until pending seed expiry; later blockers must not unlock it.
  if (s.seed && s.status === 'CANDIDATE_COLLISION') status = 'CANDIDATE_COLLISION';
  s.status = status; ctx.storage.setJSON(KEY,s);
}
function cookieEcs(r) {
  const raw = header(r.headers,'cookie'); if (!raw) return null;
  const found = [];
  for (const part of raw.split(';')) {
    const n = part.indexOf('=');
    if (n < 0) continue;
    const name = part.slice(0,n).trim();
    // Reject case variants rather than let ambiguous servers interpret them.
    if (name.toLowerCase() === 'ecs_token') {
      if (name !== 'ecs_token') return null;
      found.push(part.slice(n+1).trim());
    }
  }
  return found.length === 1 && value(found[0]) ? found[0] : null;
}
function widget(ctx) {
  let s, status = 'STATE_INVALID';
  try { s = load(ctx); expire(s); if (s.status === 'SEED_EXPIRED') save(ctx,s,s.status); status = s.status; } catch { /* No details. */ }
  const lines = [`BUILD ${BUILD}`,status,`seed ${!!s?.seed} / bound ${!!s?.bound}`,`token ${!!(s?.seed || s?.bound?.seed)?.token_online} / appId ${!!(s?.seed || s?.bound?.seed)?.appId}`, 'LOCAL ONLY / NO RENEWAL'];
  return {type:'widget',padding:8,gap:3,children:lines.map(text => ({type:'text',text,font:{size:11},maxLines:1,minScale:0.6}))};
}
export default async function(ctx) {
  if (!ctx.request && !ctx.response) {
    if (FAMILIES.includes(ctx.widgetFamily) || ctx.script?.name === 'unicom-local-seed-widget-v1') return widget(ctx);
    return;
  }
  if (!ctx.request || !ctx.response) return;
  try {
    const u = endpoint(ctx.request); if (!u) return;
    if (u.pathname === LOGIN && ctx.request.method === 'POST') {
      // Parse completely before touching state; no await between state read and atomic write.
      let fields, login;
      try {
        fields = await requestFields(ctx.request);
        if (!fields) { const s = load(ctx); expire(s); save(ctx,s,'REQUEST_BODY_UNAVAILABLE'); return; }
        const raw = await ctx.response.text();
        if (typeof raw !== 'string' || raw.length > 65536) throw 0;
        login = selectedJSON(raw,['code','token_online','ecs_token']);
      } catch { const s = load(ctx); expire(s); save(ctx,s,'PAYLOAD_INVALID'); return; }
      const s = load(ctx); expire(s);
      if (s.bound) { save(ctx,s,'BOUND_LOCKED'); return; }
      if (ctx.response.status !== 200 || ![0,'0'].includes(login.code)) { save(ctx,s,'LOGIN_REJECTED'); return; }
      if (!value(fields.appId,512)) { save(ctx,s,'APPID_MISSING'); return; }
      if (!value(fields.version,128) || !value(login.token_online) || !value(login.ecs_token)) { save(ctx,s,'PAYLOAD_INVALID'); return; }
      const seed = {token_online:login.token_online,ecs_token:login.ecs_token,appId:fields.appId,version:fields.version,createdAt:Date.now()};
      if (s.seed) { save(ctx,s,'CANDIDATE_COLLISION'); return; }
      s.seed = seed; save(ctx,s,'SEED_PENDING');
    } else if (u.pathname === BALANCE && ctx.request.method === 'GET') {
      // Deliberately do not consume either balance body or response headers.
      const s = load(ctx); expire(s);
      const phones = u.searchParams.getAll('desmobiel');
      const ecs = cookieEcs(ctx.request);
      if (s.bound) {
        save(ctx,s,phones.length === 1 && phones[0] === s.bound.phone && ecs === s.bound.seed.ecs_token ? 'BOUND_READY' : 'BOUND_LOCKED'); return;
      }
      if (phones.length !== 1 || !/^1[3-9]\d{9}$/.test(phones[0]) || !ecs) { save(ctx,s,'BALANCE_INVALID'); return; }
      if (!s.seed) { save(ctx,s,s.status); return; }
      if (s.status === 'CANDIDATE_COLLISION') return; // Ambiguous login sequence must expire before reuse.
      if (ecs !== s.seed.ecs_token) { save(ctx,s,'ECS_MISMATCH'); return; }
      s.bound = {phone:phones[0],seed:s.seed}; s.seed = null; save(ctx,s,'BOUND_READY');
    }
  } catch { /* Fail closed, pass-through, never inspect exceptions. */ }
}
