import test from 'node:test';
import assert from 'node:assert/strict';
import {queryDiagnostic} from '../UnicomThreeCards.js';
import {mock,capture,phones,key} from './helpers.js';

test('redirect is observable without following or exposing its target',async()=>{
 const m=mock();await capture(m);await queryDiagnostic(m.ctx,1);
 const before=m.ctx.storage.getJSON(key(phones[0]));before.updatedAt=Date.now()-7200000;m.ctx.storage.setJSON(key(phones[0]),before);
 let calls=0;
 m.ctx.http.get=async(u,o)=>{
  calls++;
  assert.equal(o.redirect,'manual');
  assert.equal(o.credentials,'omit');assert.equal(o.insecureTls,false);
  return {status:302,headers:{location:'https://private.example/login?secret=13000000001'},json:()=>{throw Error('must not consume redirect body');}};
 };
 const r=await queryDiagnostic(m.ctx,1);
 assert.equal(calls,1);assert.equal(r.reason,'HTTP');assert.equal(r.httpStatus,302);assert.equal(r.source,'fallback_cache');assert.equal(r.updatedAt,before.updatedAt);
 assert.deepEqual(m.ctx.storage.getJSON(key(phones[0])),before);
 assert.ok(!JSON.stringify(r).match(/private|secret|13000000001|location/i));
});
