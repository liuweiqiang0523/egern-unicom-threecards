// Real JS + fixed-frame browser regression. PLAYWRIGHT_PATH may point to a local install.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const base=resolve(new URL('..',import.meta.url).pathname);
const server=createServer(async(req,res)=>{try{const p=resolve(base,'.'+decodeURIComponent(req.url.split('?')[0]));if(!p.startsWith(base+'/'))throw Error();res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.html')?'text/html':'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1100,height:1000},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const checks=[];
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/preview/compact.html`);await page.waitForFunction(()=>window.lastDSL);
 for(const dark of [false,true])for(const [family,heights] of [['systemLarge',[330,344,380,402]],['systemExtraLarge',[354,400,440]],['systemMedium',[158]],['systemSmall',[170]],['accessoryRectangular',[76]],['accessoryCircular',[90]],['accessoryInline',[26]]]){
  await page.selectOption('#family',family);await page.locator('#dark').setChecked(dark);await page.waitForTimeout(30);
  for(const height of heights){
   await page.locator('#preview').evaluate((e,h)=>e.style.height=h+'px',height);
   const v=await page.evaluate(()=>{const root=document.querySelector('#preview').firstElementChild;const box=e=>{if(!e)return null;const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,height:b.height,width:b.width}};const cs=[...root.querySelectorAll('div')].filter(e=>e.style.borderRadius==='16px');return {root:box(root),overflow:root.scrollHeight-root.clientHeight,textOverflow:[...root.querySelectorAll('[data-type="text"]')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent),cards:cs.map(c=>{const content=c.children[1];return {card:box(c),rail:box(c.children[0]),id:box(content.children[0]),metrics:box(content.children[2]),bar:box(content.children[4]),textOutside:[...c.querySelectorAll('[data-type="text"]')].filter(e=>{const x=box(e),b=box(c);return x.top<b.top||x.bottom>b.bottom+1}).map(e=>e.textContent)}})};});
   if(family==='systemLarge'||family==='systemExtraLarge'){
    assert.equal(v.cards.length,3);assert.ok(v.overflow<=1,JSON.stringify(v));assert.deepEqual(v.textOverflow,[]);
    const h=v.cards[0].card.height;for(const c of v.cards){assert.ok(Math.abs(c.card.height-h)<.1);assert.ok(Math.abs(c.rail.height-(c.card.height-2))<.1);assert.ok(c.id.bottom<=c.metrics.top);assert.ok(Math.abs(c.bar.top-c.metrics.bottom-5)<.1);assert.deepEqual(c.textOutside,[]);}
    assert.ok(Math.abs(v.root.bottom-v.cards[2].card.bottom-(family==='systemLarge'?7:8))<.1);
    for(let i=1;i<3;i++)assert.ok(Math.abs(v.cards[i].card.top-v.cards[i-1].card.bottom-7)<.1);
   }
   checks.push({family,dark,height,overflow:v.overflow,cardHeights:v.cards.map(c=>c.card.height),textOverflow:v.textOverflow});
  }
 }
 assert.deepEqual(errors,[]);
 await page.selectOption('#family','systemLarge');
 for(const dark of [false,true]){await page.locator('#dark').setChecked(dark);await page.waitForTimeout(30);await page.locator('#preview').evaluate(e=>e.style.height='380px');await page.locator('#preview').screenshot({path:process.env.PREVIEW_OUT?`${process.env.PREVIEW_OUT}/adaptive-${dark?'dark':'light'}.png`:`preview/adaptive-${dark?'dark':'light'}.png`});}
 console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();server.close();}
