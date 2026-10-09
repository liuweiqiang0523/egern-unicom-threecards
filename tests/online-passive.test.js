import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import run from '../UnicomOnlineDiagnostic.js';
const BASE = 'egern.unicom.online-diag.v3';
const names = ['unicom-online-diagnostic-request','unicom-online-diagnostic-response','unicom-online-diagnostic-balance-response'];
const paths = ['online-request','online-response','balance-response'];
const online = 'https://m.client.10010.com/mobileService/onLine.htm';
const balance = 'https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven';
const deny = () => assert.fail('private data accessed');
function fixture(initial = []) {
  const saved = new Map(initial), reads = [], writes = [];
  return {saved,reads,writes,storage:{
    getJSON(k){reads.push(k);return saved.get(k);},
    setJSON(k,v){writes.push(k);saved.set(k,structuredClone(v));}
  }};
}
const hook = (storage,i,request,response) => run({storage,script:{name:names[i]},request,response});
const generic = storage => run({storage,script:{name:'unicom-online-diagnostic-widget'}});
const text = w => w.children.map(c=>c.text).join('\n');
function req(url=online){return {url,get headers(){return deny();},get body(){return deny();},get method(){return deny();},text:deny,json:deny};}
const key = i => `${BASE}.${paths[i]}`;
test('v3 generic selfcheck distinguishes all three missing records and preserves v1/v2',async()=>{
 const f=fixture([['egern.unicom.online-diag.v1',{secret:'PRIVATE'}],['egern.unicom.online-diag.v2',{secret:'PRIVATE'}]]);
 const w=text(await generic(f.storage));
 assert.match(w,/BUILD ONLINE_CONTROL_V3_1/); assert.match(w,/LOCAL WRITE_OK READ_OK/);
 for(const p of paths) assert.ok(w.includes(`${p} MISSING`));
 assert.doesNotMatch(w,/入口 0|PRIVATE/); assert.ok(f.reads.every(k=>k.startsWith(BASE)));
});
test('generic widget families render without depending on exact script identity',async()=>{
 for(const widgetFamily of ['systemSmall','systemMedium','systemLarge','systemExtraLarge','accessoryCircular','accessoryRectangular','accessoryInline']){
  for(const name of ['module/unicom-online-diagnostic-widget','DIFFERENT',undefined]){
   const f=fixture();
   const w=await run({storage:f.storage,script:name?{name}:undefined,widgetFamily});
   assert.equal(w?.type,'widget');
   assert.match(text(w),/BUILD ONLINE_CONTROL_V3_1/);
   assert.match(text(w),/LOCAL WRITE_OK READ_OK/);
   assert.deepEqual(f.writes,[`${BASE}.local-probe`]);
   assert.doesNotMatch(JSON.stringify([...f.saved]),/module\/|DIFFERENT/);
  }
 }
});
test('script-name classification records independent safe entries before any URL/context guard',async()=>{
 const f=fixture();
 for(let i=0;i<3;i++){
  assert.equal(await hook(f.storage,i,undefined,i?{}:undefined),undefined);
  assert.deepEqual(f.saved.get(key(i)),{schema:3,entrySeen:1,requestPresent:false,responsePresent:i!==0,urlMatch:false,writeReadbackOK:true,contextStatus:'CONTEXT_INVALID'});
 }
 assert.ok(f.writes.every(k=>paths.some(p=>k===`${BASE}.${p}`)));
});
test('only the three fixed script names register hooks; missing script never registers an online hit',async()=>{
 const f=fixture();
 for(const name of [undefined,'OTHER','__proto__']){
  assert.equal(await run({storage:f.storage,script:name?{name}:undefined,env:{DIAGNOSTIC_HOOK:'request'},request:req(),response:{}}),undefined);
 }
 assert.deepEqual(f.writes,[]);assert.deepEqual(f.reads,[]);
});
test('request or response contexts never become widgets or unknown hook writes',async()=>{
 for(const name of [undefined,'OTHER','module/unicom-online-diagnostic-widget','unicom-online-diagnostic-widget']){
  for(const context of [{request:req()},{response:{}},{request:req(),response:{}}]){
   const f=fixture();
   assert.equal(await run({storage:f.storage,script:name?{name}:undefined,widgetFamily:'systemMedium',...context}),undefined);
   assert.deepEqual(f.reads,[]);assert.deepEqual(f.writes,[]);
  }
 }
});
test('unknown generic context requires a recognized widget family',async()=>{
 for(const widgetFamily of [undefined,'INVALID','__proto__']){
  const f=fixture();
  assert.equal(await run({storage:f.storage,script:{name:'OTHER'},widgetFamily}),undefined);
  assert.deepEqual(f.reads,[]);assert.deepEqual(f.writes,[]);
 }
});
test('matching endpoints are passive, bounded and never inspect secrets or modify traffic',async()=>{
 const f=fixture();
 for(let i=0;i<3;i++){
  const r=req((i===2?balance:online)+'?token=PRIVATE'); const s={get headers(){return deny();},get body(){return deny();},text:deny,json:deny};
  assert.equal(await hook(f.storage,i,r,i?s:undefined),undefined);
  assert.equal(f.saved.get(key(i)).contextStatus,'CONTEXT_OK');
  assert.equal(f.saved.get(key(i)).urlMatch,true);
 }
 await hook(f.storage,0,req());assert.equal(f.saved.get(key(0)).entrySeen,2);
 assert.doesNotMatch(JSON.stringify([...f.saved]),/PRIVATE|token|appId|device|phone|Cookie|https/);
});
test('off-scope and missing response contexts remain entry evidence but explicitly invalid',async()=>{
 for(const url of [balance,'http://m.client.10010.com/mobileService/onLine.htm','https://m.client.10010.com.evil.invalid/mobileService/onLine.htm','https://user@m.client.10010.com/mobileService/onLine.htm',online+'/extra','https://m.client.10010.com:444/mobileService/onLine.htm','INVALID']){
  const f=fixture();await hook(f.storage,1,req(url),{});
  assert.equal(f.saved.get(key(1)).entrySeen,1);assert.equal(f.saved.get(key(1)).urlMatch,false);assert.equal(f.saved.get(key(1)).contextStatus,'CONTEXT_INVALID');
 }
 const f=fixture();await hook(f.storage,2,req(balance));
 assert.equal(f.saved.get(key(2)).urlMatch,true);assert.equal(f.saved.get(key(2)).contextStatus,'CONTEXT_INVALID');
});
test('local failures, missing, invalid and hook readback failures remain safe fixed statuses',async()=>{
 const fail=()=>{throw Error('SECRET');};
 assert.match(text(await generic({setJSON:fail,getJSON:fail})),/LOCAL WRITE_FAILED READ_FAILED/);
 assert.doesNotMatch(text(await generic({setJSON:fail,getJSON:fail})),/SECRET/);
 const f=fixture();await hook({getJSON:()=>undefined,setJSON:f.storage.setJSON},0,req());
 assert.equal(f.saved.get(key(0)).writeReadbackOK,false);
 assert.equal(await hook({getJSON:fail,setJSON:fail},1,req(),{}),undefined);
 const w=text(await generic(fixture([[key(0),{schema:2}]]).storage));
 assert.ok(w.includes('online-request INVALID'));assert.ok(w.includes('online-response MISSING'));
});
test('whitelist reconstruction caps counts and excludes arbitrary stored strings',async()=>{
 const f=fixture([[key(0),{schema:3,entrySeen:Number.MAX_SAFE_INTEGER,requestPresent:'SECRET',responsePresent:true,urlMatch:true,writeReadbackOK:'SECRET',contextStatus:'SECRET',extra:'SECRET'}]]);
 const w=text(await generic(f.storage));assert.match(w,/入口 9999/);assert.doesNotMatch(w,/SECRET/);
 await hook(f.storage,0,req());assert.equal(f.saved.get(key(0)).entrySeen,9999);
 assert.deepEqual(Object.keys(f.saved.get(key(0))).sort(),['schema','entrySeen','requestPresent','responsePresent','urlMatch','writeReadbackOK','contextStatus'].sort());
});
test('module adds exactly one balance response control with no overlapping production request control',()=>{
 const m=readFileSync(new URL('../UnicomOnlineDiagnostic.yaml',import.meta.url),'utf8');
 assert.equal((m.match(/body_required: false/g)||[]).length,3);
 assert.equal((m.match(/script_url: https:\/\/raw\.githubusercontent\.com\/liuweiqiang0523\/egern-unicom-threecards\/main\/UnicomOnlineDiagnostic\.js/g)||[]).length,4);
 assert.equal((m.match(/http_request:/g)||[]).length,1);assert.equal((m.match(/http_response:/g)||[]).length,2);
 assert.match(m,/name: unicom-online-diagnostic-balance-response/);assert.match(m,/mobileserviceimportant\/home\/queryUserInfoSeven/);
 assert.doesNotMatch(m,/DIAGNOSTIC_HOOK|login\.htm|UnicomThreeCards\.js|schedule:|body_required: true/);
 for(const n of names)assert.ok(m.includes(`name: ${n}`));
});
test('cache-busted v3.1 module pins all four scripts and preserves the old module contract',()=>{
 const file=new URL('../UnicomOnlineDiagnostic-V3-1.yaml',import.meta.url);
 const parsed=JSON.parse(execFileSync('ruby',['-rjson','-ryaml','-e','puts JSON.generate(YAML.load_file(ARGV[0]))',file.pathname],{encoding:'utf8'}));
 const previous=JSON.parse(execFileSync('ruby',['-rjson','-ryaml','-e','puts JSON.generate(YAML.load_file(ARGV[0]))',new URL('../UnicomOnlineDiagnostic-V3.yaml',import.meta.url).pathname],{encoding:'utf8'}));
 const scripts=parsed.scriptings.map(entry=>Object.values(entry)[0]);
 assert.equal(scripts.length,4);
 const url='https://raw.githubusercontent.com/liuweiqiang0523/egern-unicom-threecards/1e3439b4001eb19a9663ec829466f6028e6139a7/UnicomOnlineDiagnostic.js';
 assert.ok(scripts.every(s=>s.script_url===url));
 for(const entry of [...parsed.scriptings,...previous.scriptings]) delete Object.values(entry)[0].script_url;
 delete parsed.description;delete previous.description;
 assert.deepEqual(parsed,previous);
});
test('diagnostic contains no outbound API, credentials, logs, notifications or traffic mutation',()=>{
 const s=readFileSync(new URL('../UnicomOnlineDiagnostic.js',import.meta.url),'utf8');
 assert.doesNotMatch(s,/ctx\.http|\bfetch\s*\(|console\.|ctx\.notify|ctx\.respond|ctx\.abort|egern\.unicom3|\.headers|\.body|\.text\s*\(|\.json\s*\(|token_online|appId|deviceId|Cookie/);
});
