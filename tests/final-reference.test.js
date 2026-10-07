import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,cards} from './helpers.js';
test('reference header time is latest successful account time, including cached transport failure, never render time',async()=>{
 const m=mock();for(const p of phones)await capture(m,p);await run({...m.ctx,env:{VIEW:'all'}});
 const stamp=Date.now()-2*3600000;
 for(let i=1;i<=3;i++){let r=m.ctx.storage.getJSON('egern.unicom3.v1.slot.'+i);r.updatedAt=stamp-i*60000;m.ctx.storage.setJSON('egern.unicom3.v1.slot.'+i,r);}
 m.ctx.http.get=async()=>{throw Error('offline')};
 const t=await run({...m.ctx,widgetFamily:'systemLarge',env:{VIEW:'all'}});
 const fmt=t=>new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'});
 assert.equal(t.children[0].children.at(-1).text,fmt(stamp-60000));
 cards(t).forEach((c,i)=>assert.equal(c.children[1].children[0].children.at(-1).text,fmt(stamp-(i+1)*60000)+' · 缓存'));
 assert.equal(t.children[0].children.at(-2).src,'sf-symbol:arrow.clockwise');
 const empty=await run({...mock().ctx,widgetFamily:'systemLarge',env:{VIEW:'all'}});assert.equal(empty.children[0].children.at(-1).type,'spacer');
});
test('reference large cards add actual resource symbols and thin separators without changing flow calculations',async()=>{
 const m=mock();for(const p of phones)await capture(m,p);const t=await run({...m.ctx,widgetFamily:'systemLarge',env:{VIEW:'all'}});
 for(const c of cards(t)){assert.equal(c.height,82);const metrics=c.children[1].children[2];assert.deepEqual(metrics.children.filter(x=>x.type==='stack'&&x.width===1).map(x=>x.height),[30,30]);assert.deepEqual(metrics.children.filter(x=>x.direction==='column').map(x=>x.children[0].children[0].src),['sf-symbol:yensign.circle','sf-symbol:phone.fill','sf-symbol:cloud.fill']);}
 assert.match(t.children[0].children[0].src,/^data:image\/png;base64,iVBOR/);
});
