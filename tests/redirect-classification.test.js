import test from 'node:test';
import assert from 'node:assert/strict';
import run,{queryDiagnostic} from '../UnicomThreeCards.js';
import {mock,capture,phones,key} from './helpers.js';

async function seeded(){const m=mock();await capture(m);await queryDiagnostic(m.ctx,1);const r=m.ctx.storage.getJSON(key(phones[0]));r.updatedAt=Date.now()-7200000;m.ctx.storage.setJSON(key(phones[0]),r);return m;}
test('official Headers getAll yields only a redirect enum, without changing stored credentials/cache',async()=>{
 const m=await seeded(),before=m.ctx.storage.getJSON(key(phones[0]));let calls=0;
 m.ctx.http.get=async(u,o)=>{calls++;assert.equal(o.redirect,'manual');assert.equal(o.credentials,'omit');assert.equal(o.insecureTls,false);return {status:302,headers:{getAll:n=>{assert.equal(n,'location');return ['/private-token?cookie=secret&phone=13000000001'];}},json:()=>{throw Error('redirect body forbidden');}};};
 const r=await queryDiagnostic(m.ctx,1);assert.equal(r.redirectTarget,'SAME_ORIGIN');assert.equal(r.reason,'HTTP');assert.equal(r.httpStatus,302);assert.equal(r.updatedAt,before.updatedAt);assert.deepEqual(m.ctx.storage.getJSON(key(phones[0])),before);assert.equal(calls,1);assert.ok(!JSON.stringify(r).match(/private|secret|13000000001|cookie|location/i));
 const tree=await run(m.ctx);assert.ok(JSON.stringify(tree).includes('302同站'));
});
const cases=[
 ['https://uac.10010.com/portal/homeLogin?token=secret#13000000001','AUTH_REDIRECT'],
 ['https://uac.10010.com/','AUTH_REDIRECT'],
 ['/mobileserviceimportant/home/elsewhere?token=secret','SAME_ORIGIN'],
 ['?login=secret','SAME_ORIGIN'],
 ['https://m.client.10010.com/unknown-login','SAME_ORIGIN'],
 ['https://uac.10010.com/unknown-login','OTHER_ORIGIN'],
 ['https://uac.10010.com.evil.example/portal/homeLogin','OTHER_ORIGIN'],
 ['https://secret.10010.com/login','OTHER_ORIGIN'],
 ['http://m.client.10010.com/login','OTHER_ORIGIN'],
 ['https://m.client.10010.com:444/login','OTHER_ORIGIN'],
 ['//evil.example/login?token=secret','OTHER_ORIGIN'],
 ['https://secret@uac.10010.com/portal/homeLogin','UNKNOWN'],
 ['data:text/plain,secret','UNKNOWN'],['javascript:secret','UNKNOWN'],
 ['https://[broken','UNKNOWN'],['','UNKNOWN'],[null,'UNKNOWN'],
 ['/x\r\nCookie:secret','UNKNOWN'],['/x\\secret','UNKNOWN'],
 ['https://uac.10010.com/,https://evil.example/','UNKNOWN'],
 [['/one','/two'],'UNKNOWN'],['x'.repeat(8193),'UNKNOWN']
];
for(const [location,target] of cases)test('conservative redirect classification case '+cases.findIndex(x=>x[0]===location),async()=>{
 const m=await seeded(),before=m.ctx.storage.getJSON(key(phones[0]));
 m.ctx.http.get=async()=>({status:302,headers:{LoCaTiOn:location}});
 const r=await queryDiagnostic(m.ctx,1);assert.equal(r.redirectTarget,target);assert.equal(r.reason,'HTTP');assert.deepEqual(m.ctx.storage.getJSON(key(phones[0])),before);
 assert.ok(!JSON.stringify(r).match(/secret|evil|token|13000000001|cookie|location/i));
});
test('duplicate official Location and throwing header access remain UNKNOWN HTTP, not TRANSPORT',async()=>{
 for(const headers of [{getAll:()=>['/one','/two']},{getAll:()=>{throw Error('cookie=secret');}},{get:()=>{throw Error('secret');}}]){
  const m=await seeded();m.ctx.http.get=async()=>({status:302,headers});const r=await queryDiagnostic(m.ctx,1);assert.equal(r.redirectTarget,'UNKNOWN');assert.equal(r.reason,'HTTP');
 }
});
test('native Headers get and non-redirect responses do not leak/read unexpected response fields',async()=>{
 const m=await seeded();m.ctx.http.get=async()=>({status:307,headers:new Headers({Location:'/private?token=secret'})});assert.equal((await queryDiagnostic(m.ctx,1)).redirectTarget,'SAME_ORIGIN');
 m.ctx.http.get=async()=>({status:500,get headers(){throw Error('must not read');}});assert.equal((await queryDiagnostic(m.ctx,1)).redirectTarget,undefined);
});
test('three cards retain distinct cookie-to-phone bindings during redirects',async()=>{
 const m=await seeded();await capture(m,phones[1],'mock-session=B');await capture(m,phones[2],'mock-session=C');
 const seen=[];m.ctx.http.get=async(u,o)=>{seen.push([new URL(u).searchParams.get('desmobiel'),o.headers.Cookie]);return {status:302,headers:{Location:'/same'}};};
 await Promise.all([1,2,3].map(s=>queryDiagnostic(m.ctx,s)));assert.deepEqual(seen,[[phones[0],'mock-session=A'],[phones[1],'mock-session=B'],[phones[2],'mock-session=C']]);
});
