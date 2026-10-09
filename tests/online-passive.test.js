import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import run from '../UnicomOnlineDiagnostic.js';
const KEY = 'egern.unicom.online-diag.v2';
const PROBE = `${KEY}.local-probe`;
const endpoint = 'https://m.client.10010.com/mobileService/onLine.htm';
function fixture(initial = []) {
  const saved = new Map(initial), reads = [], writes = [];
  return { saved, reads, writes, storage: {
    getJSON(k) { reads.push(k); return saved.get(k); },
    setJSON(k,v) { writes.push(k); saved.set(k, structuredClone(v)); }
  }};
}
const text = w => w.children.map(c => c.text).join('\n');
const hook = (storage, request, response, kind = response ? 'response' : 'request') => run({storage,request,response,env:{DIAGNOSTIC_HOOK:kind}});
const deny = () => { assert.fail('private data accessed'); };
function request(method = 'POST', url = endpoint) {
  return {method,url,get headers(){return deny();},text:deny,json:deny};
}
test('v2 generic build and local selfcheck distinguish missing hook evidence', async () => {
  const f = fixture([['egern.unicom.online-diag.v1',{schema:1,requestSeen:99,requestFields:{token_online:true}}]]);
  const w = text(await run({storage:f.storage}));
  assert.match(w,/BUILD ONLINE_ENTRANCE_V2/);
  assert.match(w,/LOCAL WRITE_OK READ_OK/);
  assert.match(w,/HOOK MISSING/);
  assert.match(w,/本地自检≠hook共享证明/);
  assert.doesNotMatch(w,/请求 0|token|appId|99/);
  assert.deepEqual(f.saved.get(PROBE),{probe:true});
  assert.ok(!f.reads.includes('egern.unicom.online-diag.v1'));
});
test('module disables body loading and explicitly identifies each hook using the same URL', () => {
  const module = readFileSync(new URL('../UnicomOnlineDiagnostic.yaml', import.meta.url),'utf8');
  assert.equal((module.match(/body_required: false/g) || []).length,2);
  assert.equal((module.match(/script_url: https:\/\/raw\.githubusercontent\.com\/liuweiqiang0523\/egern-unicom-threecards\/main\/UnicomOnlineDiagnostic\.js/g) || []).length,3);
  assert.match(module,/DIAGNOSTIC_HOOK: request/);
  assert.match(module,/DIAGNOSTIC_HOOK: response/);
  assert.doesNotMatch(module,/queryUserInfoSeven|login\.htm|UnicomThreeCards\.js|schedule:|body_required: true/);
});
test('entrance counts before POST classification without reading body or header values', async () => {
  const f = fixture([['egern.unicom.online-diag.v1',{token_online:'PRIVATE'}]]);
  assert.equal(await hook(f.storage,request('GET',endpoint+'?token=PRIVATE')),undefined);
  assert.equal(await hook(f.storage,request(),{get headers(){return deny();},text:deny}),undefined);
  assert.deepEqual(f.saved.get(KEY),{schema:2,requestSeen:1,responseSeen:1,postSeen:1,otherSeen:1,
    requestPresent:true,responsePresent:true,method:'POST',readStatus:'READ_OK'});
  assert.deepEqual(f.writes,[KEY,KEY]);
  assert.deepEqual(f.saved.get('egern.unicom.online-diag.v1'),{token_online:'PRIVATE'});
  assert.doesNotMatch(JSON.stringify(f.saved.get(KEY)),/PRIVATE|token|appId|device|phone|Cookie|https/);
});
test('missing request in explicit response hook never turns into generic selfcheck or unscoped evidence', async () => {
  const f = fixture();
  assert.equal(await hook(f.storage,undefined,{},'response'),undefined);
  assert.deepEqual(f.writes,[]);
});
test('off-scope requests never read or write storage', async () => {
  for (const url of ['https://m.client.10010.com/mobileService/login.htm',
    'https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven',
    'http://m.client.10010.com/mobileService/onLine.htm',
    'https://m.client.10010.com.evil.invalid/mobileService/onLine.htm',
    'https://user@m.client.10010.com/mobileService/onLine.htm',
    'https://m.client.10010.com/mobileService/onLine.htm/extra',
    'https://m.client.10010.com:444/mobileService/onLine.htm']) {
    assert.equal(await hook({getJSON:deny,setJSON:deny},request('POST',url)),undefined);
  }
});
test('local WRITE and READ failures and missing hook records stay distinct and never echo exceptions', async () => {
  const fail = () => {throw Error('SECRET_PHONE_TOKEN');};
  assert.match(text(await run({storage:{setJSON:fail,getJSON:fail}})),/LOCAL WRITE_FAILED READ_FAILED\n.*\nHOOK READ_FAILED/);
  assert.match(text(await run({storage:{setJSON:fail,getJSON:()=>undefined}})),/LOCAL WRITE_FAILED MISSING/);
  assert.match(text(await run({storage:{setJSON(){},getJSON:()=>({probe:'SECRET'})}})),/LOCAL WRITE_OK INVALID/);
  assert.doesNotMatch(text(await run({storage:{setJSON:fail,getJSON:fail}})),/SECRET/);
});
test('hook read failures survive a successful safe write and are visible separately', async () => {
  const f = fixture();
  await hook({getJSON(){throw Error('SECRET');},setJSON:f.storage.setJSON},request());
  assert.equal(f.saved.get(KEY).readStatus,'READ_FAILED');
  assert.match(text(await run({storage:f.storage})),/HOOK READ_OK/);
  assert.match(text(await run({storage:f.storage})),/上次读取 READ_FAILED/);
  assert.equal(await hook({getJSON(){throw Error('SECRET');},setJSON(){throw Error('SECRET');}},request()),undefined);
});
test('allowlist reconstruction bounds counts and excludes arbitrary saved fields and statuses', async () => {
  const f = fixture([[KEY,{schema:2,requestSeen:Number.MAX_SAFE_INTEGER,responseSeen:-1,postSeen:'SECRET',otherSeen:Infinity,
    method:'SECRET',requestPresent:'SECRET',responsePresent:true,readStatus:'SECRET',extra:'SECRET'}]]);
  const w = text(await run({storage:f.storage}));
  assert.match(w,/请求 9999 \/ 响应 0/);
  assert.doesNotMatch(w,/SECRET/);
  await hook(f.storage,request());
  assert.deepEqual(f.saved.get(KEY),{schema:2,requestSeen:9999,responseSeen:0,postSeen:1,otherSeen:0,
    requestPresent:true,responsePresent:false,method:'POST',readStatus:'READ_OK'});
});
test('absent, corrupt, and unavailable hook records are not rendered as 0/0', async () => {
  for (const [value,status] of [[undefined,'MISSING'],[{schema:1},'INVALID']]) {
    const f = fixture(value ? [[KEY,value]] : []);
    const w = text(await run({storage:f.storage}));
    assert.match(w,new RegExp(`HOOK ${status}`)); assert.doesNotMatch(w,/请求 0|响应 0/);
  }
});
test('diagnostic has no outbound APIs, credential reads, logging, notifications, or traffic mutation', () => {
  const source = readFileSync(new URL('../UnicomOnlineDiagnostic.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/ctx\.http|\bfetch\s*\(|console\.|ctx\.notify|ctx\.respond|ctx\.abort|egern\.unicom3|\.headers|\.text\s*\(|\.json\s*\(|token_online|appId|deviceId|Cookie/);
});
