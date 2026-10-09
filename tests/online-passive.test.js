import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const url = new URL('../UnicomOnlineDiagnostic.js', import.meta.url);
test('installable module uses one isolated URL and only exact onLine request/response hooks', () => {
  const module = readFileSync(new URL('../UnicomOnlineDiagnostic.yaml', import.meta.url), 'utf8');
  assert.equal((module.match(/script_url: https:\/\/raw\.githubusercontent\.com\/liuweiqiang0523\/egern-unicom-threecards\/main\/UnicomOnlineDiagnostic\.js/g) || []).length, 3);
  assert.equal((module.match(/body_required: true/g) || []).length, 2);
  assert.equal((module.match(/max_size: 65536/g) || []).length, 2);
  assert.match(module, /http_request:/); assert.match(module, /http_response:/);
  assert.match(module, /script_name: unicom-online-diagnostic-widget/);
  assert.doesNotMatch(module, /queryUserInfoSeven|login\.htm|UnicomThreeCards\.js|schedule:|env:/);
});
test('off-scope requests never read bodies or write any storage', async () => {
  const { default: run } = await import(url);
  for (const target of ['https://m.client.10010.com/mobileService/login.htm',
    'https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven',
    'http://m.client.10010.com/mobileService/onLine.htm',
    'https://m.client.10010.com.evil.invalid/mobileService/onLine.htm',
    'https://user@m.client.10010.com/mobileService/onLine.htm',
    'https://m.client.10010.com/mobileService/onLine.htm/extra',
    'https://m.client.10010.com:444/mobileService/onLine.htm']) {
    const deny = () => { assert.fail('off-scope access'); };
    assert.equal(await run({request:{method:'POST',url:target,text:deny},storage:{getJSON:deny,setJSON:deny}}), undefined);
  }
});
test('encrypted, malformed, ambiguous or full phone identities never bind or retain values', async () => {
  const { default: run } = await import(url);
  for (const body of ['not-json-SECRET', 'null', '["SECRET"]',
    '{"mobile":"13800000001","phone":"13800000002","token_online":"SECRET"}',
    '{"mobile":"13800000001","token_online":"SECRET"}']) {
    const saved = new Map([['egern.unicom3.v1.slot.1', {phone:'13800000001',cookie:'SECRET_COOKIE'}]]);
    const writes = [];
    const storage = {getJSON:k => saved.get(k),setJSON:(k,v) => {writes.push(k); saved.set(k,v);}};
    const request = {method:'POST',url:'https://m.client.10010.com/mobileService/onLine.htm',headers:new Headers({'content-type':'application/json'}),text:async () => body};
    await run({request,storage});
    await run({request,storage,response:{text:async () => body,headers:new Headers()}});
    assert.deepEqual(writes,['egern.unicom.online-diag.v1','egern.unicom.online-diag.v1']);
    const diag = saved.get(writes[0]);
    assert.equal(diag.bound,false);
    assert.equal(diag.reason,'UNBOUND_IDENTITY');
    assert.doesNotMatch(JSON.stringify(diag), /SECRET|13800000001|13800000002/);
    assert.deepEqual(saved.get('egern.unicom3.v1.slot.1'),{phone:'13800000001',cookie:'SECRET_COOKIE'});
  }
});
test('body/storage exceptions do not alter traffic or leak details; no outbound APIs exist', async () => {
  const { default: run } = await import(url);
  const deny = () => { throw new Error('SECRET_PHONE_TOKEN'); };
  assert.equal(await run({request:{method:'POST',url:'https://m.client.10010.com/mobileService/onLine.htm',headers:new Headers(),text:deny},storage:{getJSON:deny,setJSON:deny}}),undefined);
  assert.equal((await run({storage:{getJSON:deny}})).type,'widget');
  const source = readFileSync(url,'utf8');
  assert.doesNotMatch(source, /ctx\.http|\bfetch\s*\(|console\.|ctx\.notify|ctx\.respond|ctx\.abort|egern\.unicom3|\.headers\.(set|append|delete)\(/);
});
test('response presence accumulates with request evidence and widget never echoes stored secrets', async () => {
  const { default: run } = await import(url);
  const saved = new Map();
  const storage = { getJSON:k => saved.get(k), setJSON:(k,v) => saved.set(k, structuredClone(v)) };
  const request = { method:'POST', url:'https://m.client.10010.com/mobileService/onLine.htm',
    headers:new Headers({'content-type':'application/json'}), text:async () => '{"appId":"SECRET","token_online":"SECRET"}' };
  await run({request, storage});
  await run({request, storage, response:{headers:new Headers({'set-cookie':'SECRET_COOKIE'}),
    text:async () => '{"token_online":"SECRET_ROTATED","invalidat":"SECRET_DATE","code":"0","mobile":"13800000001"}'}});
  const r = saved.values().next().value;
  assert.equal(r.requestSeen, 1);
  assert.equal(r.responseSeen, 1);
  assert.deepEqual(r.responseFields, {token_online:true, invalidat:true, code:true});
  assert.equal(r.setCookie, true);
  assert.equal(r.bound, false);
  assert.equal(r.reason, 'UNBOUND_IDENTITY');
  r.reason = 'SECRET'; r.bound = true; r.requestSeen = 'SECRET'; r.responseFields.token_online = 'SECRET';
  const widget = await run({storage});
  assert.equal(widget.type, 'widget');
  assert.doesNotMatch(JSON.stringify(widget), /SECRET|13800000001/);
  assert.match(JSON.stringify(widget), /绑定 false/);
});
test('isolated passive entry point exists and stores only a fixed safe presence record', async () => {
  assert.ok(existsSync(url), 'passive diagnostic module is missing');
  const { default: run } = await import(url);
  const saved = new Map();
  const ctx = {
    request: { method: 'POST', url: 'https://m.client.10010.com/mobileService/onLine.htm',
      headers: new Headers({'content-type':'application/x-www-form-urlencoded'}),
      text: async () => 'appId=PRIVATE_APP&token_online=PRIVATE_TOKEN&version=PRIVATE_VERSION&deviceId=PRIVATE_DEVICE&password=PRIVATE_PASSWORD&mobile=13800000001' },
    storage: { getJSON: k => saved.get(k), setJSON: (k,v) => saved.set(k, structuredClone(v)) },
    http: new Proxy({}, { get() { throw Error('network access forbidden'); } })
  };
  assert.equal(await run(ctx), undefined);
  assert.deepEqual([...saved.keys()], ['egern.unicom.online-diag.v1']);
  assert.deepEqual(saved.values().next().value, {
    schema: 1, requestSeen: 1, responseSeen: 0, bound: false, reason: 'UNBOUND_IDENTITY',
    requestFields: { appId:true, token_online:true, version:true, deviceId:true, deviceCode:false, deviceModel:false, step:false, isFirstInstall:false },
    responseFields: { token_online:false, invalidat:false, code:false }, setCookie:false
  });
  assert.doesNotMatch(JSON.stringify([...saved]), /PRIVATE|13800000001|password|mobile/);
});
