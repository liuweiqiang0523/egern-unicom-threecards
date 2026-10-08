import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,cards} from './helpers.js';
const nodes=n=>[n,...(n.children||[]).flatMap(nodes)];
test('roomy cards fill leftover height without flexing header/metrics or detaching the bar',async()=>{
 for(const family of ['systemLarge','systemExtraLarge'])for(const SHOW_BRAND of ['true','false']){
  const m=mock();for(const p of phones)await capture(m,p);
  const t=await run({...m.ctx,widgetFamily:family,env:{VIEW:'all',SHOW_BRAND}});
  const holder=t.children.at(-1);assert.equal(holder.flex,1);assert.equal(holder.height,undefined);assert.equal(holder.gap,7);assert.ok(!t.children.some(n=>n.type==='spacer'));
  if(SHOW_BRAND==='true')assert.ok(nodes(t.children[0]).every(n=>!n.flex));
  for(const c of cards(t)){assert.equal(c.flex,1);assert.equal(c.height,undefined);const content=c.children[1];assert.equal(content.children[0].height,family==='systemLarge'?16.900000000000002:18.2);assert.ok(content.children[2].height>30);assert.equal(content.children[3].height,5);assert.equal(content.children[1].flex,content.children[5].flex);assert.equal(c.children[0].children[1].flex,1);assert.equal(c.children[0].children[0].height,12);}
 }
});
