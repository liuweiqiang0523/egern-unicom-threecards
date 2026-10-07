import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,cards} from './helpers.js';

const RAW='https://raw.githubusercontent.com/liuweiqiang0523/egern-unicom-threecards/main/assets/unicom-icon.png';
const nodes=n=>[n,...(n.children||[]).flatMap(nodes)];
const texts=n=>[...(n.type==='text'?[n.text]:[]),...(n.children||[]).flatMap(texts)];
const images=n=>nodes(n).filter(x=>x.type==='image');
async function summary(env){const m=mock();for(const p of phones)await capture(m,p);return run({...m.ctx,env:{VIEW:'all',...env}});}

test('summary shows a 中国联通 title bar (module icon + text) at the top by default',async()=>{
 const t=await summary();
 const bar=t.children[0];
 assert.equal(bar.type,'stack');assert.equal(bar.direction,'row');
 assert.equal(bar.children[0].type,'image');assert.equal(bar.children[0].src,RAW);
 assert.ok(bar.children[0].width>0&&bar.children[0].height>0);
 assert.ok(texts(bar).includes('中国联通'));
 assert.equal(images(t).length,1); // exactly one icon, only in the title bar
 // the three cards still follow the title bar, each with its own slot square (not the icon)
 assert.equal(cards(t).length,3);
 assert.ok(cards(t).every(c=>c.children[0].children[0].type==='stack'));
 // no timestamp on the title bar itself
 assert.ok(!texts(bar).some(s=>/^\d{2}:\d{2}$/.test(s)));
});

test('a safe WIDGET_TITLE overrides the title-bar text but keeps the icon',async()=>{
 const t=await summary({WIDGET_TITLE:'我的三卡'});
 assert.ok(texts(t).includes('我的三卡'));
 assert.ok(!texts(t).includes('中国联通'));
 assert.equal(images(t).length,1);
});

test('an explicit SHOW_BRAND false/off/0 hides the whole title bar including the icon',async()=>{
 for(const v of [false,'false','off','0']){
  const t=await summary({SHOW_BRAND:v});
  assert.equal(images(t).length,0,JSON.stringify(v));
  assert.ok(!texts(t).includes('中国联通'),JSON.stringify(v));
  assert.equal(cards(t).length,3,JSON.stringify(v)); // only the three cards remain
  assert.equal(t.children.length,3,JSON.stringify(v)); // no leftover wrapper when the bar is hidden
  assert.equal(t.gap,7,JSON.stringify(v)); // cards keep their own spacing without the title bar
 }
});

test('the medium title bar is slim: small icon/text, no vertical padding and a tight card gap',async()=>{
 const t=await summary();
 const bar=t.children[0];
 assert.equal(bar.type,'stack');assert.equal(bar.direction,'row');
 // one compact line: icon and title text capped at 11pt on medium
 assert.ok(bar.children[0].width<=11&&bar.children[0].height<=11,'title icon must be <=11pt');
 const label=bar.children.find(c=>c.type==='text');
 assert.ok(label.font.size<=11,'title text must be <=11pt');
 // zero (at most 1pt) vertical padding keeps the bar from adding its own height
 assert.ok((bar.padding?.[0]??0)<=1&&(bar.padding?.[2]??0)<=1,'title bar vertical padding must be 0-1');
 // intrinsic bar height stays within the slim budget (old bar was a 15px icon + 13pt text + 9pt gap)
 const barH=Math.max(bar.children[0].height||0,label.font.size*1.25)+(bar.padding?.[0]||0)+(bar.padding?.[2]||0);
 assert.ok(barH<=16,'title bar height '+barH+' exceeds 16pt');
 // the bar sits 2-3pt above the first card, which keeps its own wider spacing
 assert.equal(t.gap,2);
 const holder=t.children[1];assert.equal(holder.type,'stack');assert.equal(holder.gap,7);
 assert.equal(cards(t).length,3);
});

test('the summary title bar is never height-flexible: no flex anywhere in its subtree',async()=>{
 // Egern makes an element height-flexible when it (or a direct child) carries flex, and the widget
 // then hands it the leftover height. A flexed title bar swallowed ~half the widget on device, so
 // the bar must stay flex-free and use a trailing spacer for left alignment instead.
 const t=await summary();
 const bar=t.children[0];
 const flexy=n=>!!n.flex||(n.children||[]).some(flexy);
 assert.ok(!flexy(bar),'the title bar subtree must contain no flex');
 assert.ok(!Object.hasOwn(bar,'flex'),'the title bar itself must not be flexible');
 assert.equal(bar.children.at(-1).type,'spacer','the title bar uses a spacer, not flex, to fill width');
 // the widget's only flexible child is the card holder, which gives the freed height to the cards
 assert.equal(t.children.length,2);
 assert.equal(t.children[1].flex,1);
 assert.ok(!Object.hasOwn(t.children[0],'flex'));
});


test('SHOW_BRAND true/on/1 or unset keeps the title bar',async()=>{
 for(const v of [undefined,true,'true','on','1']){
  const t=await summary(v===undefined?undefined:{SHOW_BRAND:v});
  assert.equal(images(t).length,1,JSON.stringify(v));
  assert.ok(texts(t).includes('中国联通'),JSON.stringify(v));
 }
});

test('the single-card path never renders the summary title bar or its icon',async()=>{
 for(const slot of ['1','2','3']){
  const m=mock();for(const p of phones)await capture(m,p);
  const w=await run({...m.ctx,env:{CARD_SLOT:slot}});
  assert.equal(images(w).length,0,slot);
  assert.ok(!texts(w).includes('中国联通'),slot); // brand stays opt-in on the single-card path
  assert.equal(w.children[0].type,'stack'); // the identity heading, not a title bar
 }
});

test('all three module YAMLs point icon at the raw PNG that exists in the repo',async()=>{
 const yaml=p=>JSON.parse(execFileSync('ruby',['-rjson','-ryaml','-e','puts JSON.generate(YAML.load_file(ARGV[0]))',p],{encoding:'utf8'}));
 for(const p of ['UnicomThreeCards.yaml','UnicomThreeCardsCompact.yaml','UnicomCapture.yaml'])assert.equal(yaml(p).icon,RAW,p);
 assert.ok(existsSync('assets/unicom-icon.png'),'icon asset must exist');
 const head=readFileSync('assets/unicom-icon.png').subarray(0,8);
 assert.deepEqual([...head],[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],'icon must be a real PNG');
});
