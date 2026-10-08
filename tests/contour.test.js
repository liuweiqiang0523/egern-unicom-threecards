import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,cards} from './helpers.js';

test('curved accent follows inner radius, never protrudes, and keeps original text origin',async()=>{
 for(const family of ['systemLarge','systemExtraLarge']){
  const m=mock();for(const p of phones)await capture(m,p);
  const tree=await run({...m.ctx,widgetFamily:family,env:{VIEW:'all'}});
  for(const card of cards(tree)){
   const [rail,content]=card.children;
   assert.equal(rail.width+content.padding[3],13,'same original content x');
   assert.equal(rail.children[1].width,3);
   const [top,,bottom]=rail.children;
   assert.equal(top.children.length,48);assert.equal(top.height,15);
   let curved=0;
   for(let i=0;i<48;i++){
    const a=top.children[i],b=bottom.children[i],ink=a.children[0];
    assert.equal(a.width,0.25);assert.equal(a.height,15);
    if(!ink)continue;
    assert.ok(a.padding[0]+ink.height<=15+1e-9);
    assert.ok(Math.abs(b.padding[0]+ink.height+a.padding[0]-15)<1e-9,'mirror ends exactly');
    assert.deepEqual(ink.backgroundColor,b.children[0].backgroundColor);
    for(const mode of ['light','dark'])assert.match(ink.backgroundColor[mode],/^#[0-9a-f]{8}$/i);
    if(i>12&&i<36&&a.padding[0]>0&&a.padding[0]<12)curved++;
    // Rasterize every strip at 8x: no painted pixel may lie outside the inner circle.
    for(let x=i*.25+.0625;x<(i+1)*.25;x+=.125)for(let y=a.padding[0]+.0625;y<a.padding[0]+ink.height;y+=.125){
     assert.ok((x-15)**2+(y-15)**2<=225+1e-8,'corner pixel inside outline');
    }
   }
   assert.ok(curved>15,'actual curved contour, not a faded straight rail');
  }
 }
});
