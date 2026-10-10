import test from 'node:test';
import assert from 'node:assert/strict';
import run, {KEY,BUILD} from '../UnicomLocalSeed.js';
const origin = 'https://m.client.10010.com';
const loginURL = origin+'/mobileService/login.htm';
const balanceURL = origin+'/mobileserviceimportant/home/queryUserInfoSeven?desmobiel=13800000001';
function harness() {
 const store = new Map(); const writes = [];
 const storage = {getJSON:k => {assert.equal(k,KEY);return structuredClone(store.get(k)??null);},setJSON:(k,v)=>{assert.equal(k,KEY);writes.push(structuredClone(v));store.set(k,structuredClone(v));}};
 const ctx = {storage,script:{name:'namespace/unknown'},http:new Proxy({}, {get(){throw Error('network forbidden');}}),notify(){assert.fail('notify');}};
 return {store,writes,ctx,state:()=>store.get(KEY),widget:()=>run({...ctx,widgetFamily:'systemMedium'})};
}
function login(h,opts={}) {
 const headers = new Headers({'content-type':opts.ct||'application/x-www-form-urlencoded'});
 return run({...h.ctx,request:{url:opts.url||loginURL,method:opts.method||'POST',headers,body:opts.absent?null:{},text:async()=>opts.body??'appId=synthetic-app&version=iphone_c%4011.0300&password=%ZZ&mobile=SECRET&otp=SECRET'},response:{status:opts.status??200,text:async()=>opts.response??'{"code":"0","token_online":"synthetic-token","ecs_token":"synthetic-ecs","password":"SECRET"}'}});
}
function balance(h,opts={}) {
 return run({...h.ctx,request:{url:opts.url||balanceURL,method:opts.method||'GET',headers:opts.headers||new Headers({cookie:opts.cookie??'other=SECRET; ecs_token=synthetic-ecs'}),text(){assert.fail('balance request body');}},response:{text(){assert.fail('balance response body');},get headers(){assert.fail('balance response headers');}}});
}
test('success-only local seed binds exact own ecs cookie and full number atomically',async()=>{
 const h=harness();await login(h);assert.equal(h.state().status,'SEED_PENDING');await balance(h);
 assert.deepEqual(h.state(),{schema:1,status:'BOUND_READY',seed:null,bound:{phone:'13800000001',seed:{token_online:'synthetic-token',ecs_token:'synthetic-ecs',appId:'synthetic-app',version:'iphone_c@11.0300',createdAt:h.state().bound.seed.createdAt}}});
 const w=JSON.stringify(await h.widget()); assert.ok(w.includes(BUILD));assert.ok(w.includes('BOUND_READY'));for(const secret of ['synthetic-token','synthetic-ecs','synthetic-app','13800000001','SECRET'])assert.ok(!w.includes(secret));
 assert.ok(!JSON.stringify(h.writes).includes('SECRET'));
});
test('candidate collisions cannot be cleared by mismatch or another login',async()=>{
 const h=harness(); await login(h); await login(h,{response:'{"code":0,"token_online":"another","ecs_token":"different"}'}); await balance(h,{cookie:'ecs_token=wrong'});await balance(h,{cookie:'ecs_token=x; ecs_token=y'});await login(h,{body:'version=x'});await balance(h);await login(h);await balance(h);
 assert.equal(h.state().bound,null);assert.equal(h.state().status,'CANDIDATE_COLLISION');
});

for (const [name,opts,expected] of [
 ['missing request body',{absent:true},'REQUEST_BODY_UNAVAILABLE'],
 ['appId missing',{body:'version=x'},'APPID_MISSING'],
 ['no guessed version',{body:'appId=x'},'PAYLOAD_INVALID'],
 ['duplicate form',{body:'appId=x&appId=y&version=x'},'PAYLOAD_INVALID'],
 ['encoded duplicate',{body:'appId=x&%61ppId=y&version=x'},'PAYLOAD_INVALID'],
 ['duplicate json',{ct:'application/json',body:'{"appId":"x","appId":"y","version":"x"}'},'PAYLOAD_INVALID'],
 ['nested appId is not trusted',{ct:'application/json',body:'{"nested":{"appId":"x"},"version":"x"}'},'APPID_MISSING'],
 ['unknown login code',{response:'{"code":"Y","token_online":"x","ecs_token":"x"}'},'LOGIN_REJECTED'],
 ['HTTP failure',{status:500},'LOGIN_REJECTED'],
 ['duplicate response',{response:'{"code":0,"code":0,"token_online":"x","ecs_token":"x"}'},'PAYLOAD_INVALID'],
 ['control chars',{body:'appId=x%0A&version=x'},'APPID_MISSING'],
 ['oversized appId',{body:'appId='+ 'x'.repeat(513)+'&version=x'},'APPID_MISSING'],
 ['malformed body',{ct:'application/json',body:'{"appId":"x",}'},'PAYLOAD_INVALID'],
 ['trailing response',{response:'{"code":0} trailing'},'PAYLOAD_INVALID'],
 ['token length',{response:JSON.stringify({code:0,token_online:'x'.repeat(4097),ecs_token:'x'})},'PAYLOAD_INVALID'],
 ['token control',{response:JSON.stringify({code:0,token_online:'x\n',ecs_token:'x'})},'PAYLOAD_INVALID'],
]) test(name,async()=>{const h=harness();await login(h,opts);assert.equal(h.state().status,expected);assert.equal(h.state().seed,null);assert.equal(h.state().bound,null);});
for(const url of ['http://m.client.10010.com/mobileService/login.htm','https://m.client.10010.com.evil/mobileService/login.htm','https://user@m.client.10010.com/mobileService/login.htm','https://m.client.10010.com:444/mobileService/login.htm',loginURL+'#x',origin+'/mobileService/login.htm/'])
 test('reject precise URL '+url,async()=>{const h=harness();await login(h,{url});assert.equal(h.writes.length,0);});
test('request hook and wrong method do not capture',async()=>{const h=harness();await login(h,{method:'GET'});await run({...h.ctx,request:{url:loginURL,method:'POST'}});assert.equal(h.writes.length,0);});
for(const [name,opts] of [
 ['duplicate cookies',{cookie:'ecs_token=synthetic-ecs; ecs_token=synthetic-ecs'}],
 ['case cookie ambiguity',{cookie:'ecs_token=synthetic-ecs; ECS_TOKEN=synthetic-ecs'}],
 ['combined cookie',{cookie:'ecs_token=synthetic-ecs,ecs_token=x'}],
 ['missing cookie',{cookie:'other=x'}],
 ['duplicate phone',{url:balanceURL+'&desmobiel=13800000002'}],
 ['tail not identity',{url:origin+'/mobileserviceimportant/home/queryUserInfoSeven?desmobiel=0001'}],
 ['bad phone',{url:origin+'/mobileserviceimportant/home/queryUserInfoSeven?desmobiel=12345678901'}],
 ['mismatch',{cookie:'ecs_token=different'}],
 ['multiple header lines',{headers:{getAll:()=>['ecs_token=synthetic-ecs','other=x']}}],
])test('balance rejects '+name,async()=>{const h=harness();await login(h);await balance(h,opts);assert.equal(h.state().bound,null);});
test('JSON private values skipped, allowlist response selects only exact fields',async()=>{const h=harness();await login(h,{ct:'application/json',body:'{"password":{"secret":["SECRET",null,true]},"appId":"json-app","version":"actual-version"}'});assert.equal(h.state().seed.appId,'json-app');assert.ok(!JSON.stringify(h.writes).includes('SECRET'));});
test('bound account immutable including second identity matched new seed',async()=>{const h=harness();await login(h);await balance(h);const before=structuredClone(h.state().bound);await login(h,{response:'{"code":0,"token_online":"new","ecs_token":"new"}'});await balance(h,{url:balanceURL.replace('13800000001','13800000002'),cookie:'ecs_token=new'});assert.deepEqual(h.state().bound,before);});
test('pending expiration never binds; widget deletes expired pending seed',async()=>{const h=harness();await login(h);h.store.get(KEY).seed.createdAt-=86400001;await balance(h);assert.equal(h.state().status,'SEED_EXPIRED');assert.equal(h.state().seed,null);assert.equal(h.state().bound,null);});
test('storage poisoning never renders arbitrary text or credentials',async()=>{const h=harness();h.store.set(KEY,{schema:1,status:'SECRET',seed:null,bound:null});const w=JSON.stringify(await h.widget());assert.ok(w.includes('STATE_INVALID'));assert.ok(!w.includes('SECRET'));});
test('all generic families accept unknown name and return safe DSL',async()=>{const h=harness();for(const widgetFamily of ['systemSmall','systemMedium','systemLarge','systemExtraLarge','accessoryCircular','accessoryRectangular','accessoryInline'])assert.equal((await run({...h.ctx,widgetFamily})).type,'widget');assert.equal((await run({...h.ctx,script:{name:'unicom-local-seed-widget-v1'}})).type,'widget');});
test('exception details neither logged nor stored and no traffic mutation',async()=>{const h=harness();const result=await run({...h.ctx,request:{url:loginURL,method:'POST',headers:new Headers({'content-type':'application/json'}),text:async()=>{throw Error('SECRET');}},response:{status:200}});assert.equal(result,undefined);assert.ok(!JSON.stringify(h.writes).includes('SECRET'));});
test('concurrent login parsing cannot mix fields across seeds',async()=>{const h=harness();await Promise.all([login(h),login(h,{body:'appId=other&version=other',response:'{"code":0,"token_online":"other","ecs_token":"other"}'})]);assert.equal(h.state().status,'CANDIDATE_COLLISION');assert.equal(h.state().seed.appId,'synthetic-app');await balance(h);assert.equal(h.state().bound,null);});

test('URL normalization must not admit a different literal endpoint',async()=>{const h=harness();await login(h,{url:origin+'/other/../mobileService/login.htm'});assert.equal(h.writes.length,0);});
test('bound balance for another identity reports refusal instead of ready',async()=>{const h=harness();await login(h);await balance(h);await balance(h,{url:balanceURL.replace('13800000001','13800000002')});assert.equal(h.state().status,'BOUND_LOCKED');assert.equal(h.state().bound.phone,'13800000001');});

test('source has no network/log/notify/production APIs',async()=>{const {readFileSync}=await import('node:fs');const src=readFileSync(new URL('../UnicomLocalSeed.js',import.meta.url),'utf8');assert.ok(!/ctx\.http|fetch\s*\(|console\.|ctx\.notify|egern\.unicom3|onLine\.htm|ctx\.abort|ctx\.respond/.test(src));});
test('isolated module exists with only precise response hooks and pinned shared JS',async()=>{const {existsSync,readFileSync}=await import('node:fs');const path=new URL('../UnicomLocalSeed-V1.yaml',import.meta.url);assert.ok(existsSync(path));const yaml=readFileSync(path,'utf8');assert.ok(!yaml.includes('http_request:'));assert.equal((yaml.match(/http_response:/g)||[]).length,2);const urls=[...yaml.matchAll(/script_url: (.+)/g)].map(m=>m[1]);assert.equal(urls.length,3);assert.equal(new Set(urls).size,1);assert.match(urls[0],/\/[0-9a-f]{40}\/UnicomLocalSeed\.js$/);assert.ok(yaml.includes('body_required: true'));assert.ok(yaml.includes('body_required: false'));});
