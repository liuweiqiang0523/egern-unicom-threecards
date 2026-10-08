import test from 'node:test';
import assert from 'node:assert/strict';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,cardContent,cards} from './helpers.js';
const nodes=n=>[n,...(n.children||[]).flatMap(nodes)];
test('left outline is the rounded shell itself, with concentric inner surface and no inset accent',async()=>{
 for(const family of ['systemLarge','systemExtraLarge']){
  const m=mock();for(const p of phones)await capture(m,p);
  const tree=await run({...m.ctx,widgetFamily:family,env:{VIEW:'all'}});
  for(const [i,card] of cards(tree).entries()){
   const surface=card.children[0],content=cardContent(card),g=card.backgroundGradient;
   assert.equal(card.children.length,1);assert.equal(card.borderRadius,16);assert.equal(card.padding,2);
   assert.equal(surface.borderRadius,14);assert.equal(surface.flex,1);assert.equal(surface.height,undefined);
   assert.deepEqual(surface.backgroundColor,{light:'#F8F9FB',dark:'#1D1F23'});
   assert.equal(content.backgroundColor,'#00000000');assert.equal(content.padding[3]+2,14);
   assert.equal(g.type,'linear');assert.deepEqual(g.stops,[0,0.05,0.075,1]);
   assert.deepEqual(g.startPoint,{x:0,y:0.5});assert.deepEqual(g.endPoint,{x:1,y:0.5});
   assert.equal(g.colors[0].dark,['#B66CFF','#5EA7FF','#48D7C0'][i]);
   assert.deepEqual(g.colors[0],g.colors[1]);assert.deepEqual(g.colors[2],g.colors[3]);
   assert.deepEqual(g.colors[3],{light:'#DDE1E7',dark:'#292B30'});
   assert.ok(nodes(card).every(n=>n.width!==0.25&&n.borderRadius!==1.5));
   assert.equal(nodes(card).filter(n=>n.borderRadius===16).length,1);
   assert.equal(content.children[1].height,8);assert.equal(content.children[3].height,5);
   assert.ok(!content.children.some(n=>n.flex));
  }
 }
});
