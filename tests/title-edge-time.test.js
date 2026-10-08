import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,cardContent,cards} from './helpers.js';
const nodes=n=>[n,...(n.children||[]).flatMap(nodes)];
const fmt=t=>new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'});
test('accepted large title shrinks only brand; full-edge rail preserves content origins',async()=>{
 for(const [family,font,icon,h] of [['systemLarge',15,16,82],['systemExtraLarge',16,17,86]]){
  const m=mock();for(const p of phones)await capture(m,p);
  const t=await run({...m.ctx,widgetFamily:family,env:{VIEW:'all',SHOW_PHONE_SUFFIX:'true'}});
  assert.equal(t.children[0].children[1].font.size,font);assert.equal(t.children[0].children[0].width,icon);
  assert.ok(nodes(t.children[0]).every(n=>!n.flex));
  cards(t).forEach((c,i)=>{assert.equal(c.height,undefined);assert.equal(c.flex,1);assert.equal(c.padding,2);assert.equal(c.gap,0);assert.equal(c.children[0].borderRadius,14);assert.equal(c.children.length,1);assert.deepEqual(cardContent(c).padding,[6,7,6,12]);assert.equal(cardContent(c).children[0].children[1].font.size,family==='systemLarge'?13:14);assert.ok(nodes(c).some(n=>n.text==='· '+phones[i].slice(-4)));assert.ok(nodes(c).every(n=>!n.text?.includes('尾号')&&!n.text?.includes(phones[i])));});
 }
});
test('failed account keeps original timestamp plus cache marker; healthy account has neither marker nor rewritten time',async()=>{
 const m=mock();for(const p of phones)await capture(m,p);await run({...m.ctx,env:{VIEW:'all'}});
 const stale=Date.now()-2*3600000, fresh=Date.now()-60000;
 for(let i=1;i<=3;i++){const k='egern.unicom3.v1.slot.'+i,r=m.ctx.storage.getJSON(k);r.updatedAt=i===1?stale:fresh;m.ctx.storage.setJSON(k,r);}
 const before=structuredClone([...m.db]);m.ctx.http.get=async()=>{throw Error('private transport detail must not render');};
 const t=await run({...m.ctx,widgetFamily:'systemLarge',env:{VIEW:'all'}});
 assert.equal(cardContent(cards(t)[0]).children[0].children.at(-1).text,fmt(stale)+' · 缓存·连接失败');
 for(const c of cards(t).slice(1))assert.equal(cardContent(c).children[0].children.at(-1).text,fmt(fresh)+' · 有效缓存');
 assert.deepEqual([...m.db],before);assert.ok(!JSON.stringify(t).includes('private transport'));
});
test('summary auth failure and expired fallback remain visible and isolated',async()=>{
 const m=mock();for(const p of phones)await capture(m,p);await run({...m.ctx,env:{VIEW:'all'}});
 for(let i=1;i<=2;i++){const k='egern.unicom3.v1.slot.'+i,r=m.ctx.storage.getJSON(k);r.updatedAt=Date.now()-(i===1?2:25)*3600000;m.ctx.storage.setJSON(k,r);}
 m.ctx.http.get=async url=>{if(url.includes(phones[0]))return {status:401};throw Error('offline');};
 const t=await run({...m.ctx,widgetFamily:'systemLarge',env:{VIEW:'all'}}),s=JSON.stringify(t);
 assert.ok(s.includes('登录失效，请重新捕获'));assert.ok(s.includes('缓存已过期，请重新查询'));assert.ok(!s.includes('mock-session'));assert.ok(phones.every(p=>!s.includes(p)));
});
