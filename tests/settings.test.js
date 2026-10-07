import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones,API,key} from './helpers.js';
const moduleConfig=JSON.parse(execFileSync('ruby',['-ryaml','-rjson','-e','puts JSON.generate(YAML.load_file(ARGV[0]))','UnicomThreeCards.yaml'],{encoding:'utf8'}));
const families=['systemSmall','systemMedium','systemLarge','systemExtraLarge','accessoryInline','accessoryCircular','accessoryRectangular'];
const nodes=w=>[w,...(w.children||[]).flatMap(nodes)];
const content=w=>nodes(w).filter(n=>n.type==='text').map(n=>n.text).join('');
test('module exposes real native settings, no slot override or imaginary API options',()=>{
 assert.deepEqual(Object.keys(moduleConfig.env_schema).sort(),['CARD1_NAME','CARD1_TOTAL','CARD2_NAME','CARD2_TOTAL','CARD3_NAME','CARD3_TOTAL','CARD_ORDER','LOW_BALANCE_THRESHOLD','SHOW_BRAND','SHOW_PHONE_SUFFIX','TRANSLUCENT','WIDGET_TITLE']);
 assert.deepEqual(moduleConfig.env_schema.TRANSLUCENT.options,['true','false']);
 assert.equal(moduleConfig.env_schema.TRANSLUCENT.default_value,'false');
 assert.equal(moduleConfig.env_schema.WIDGET_TITLE.default_value,'');assert.deepEqual(moduleConfig.env_schema.SHOW_BRAND.options,['true','false']);assert.equal(moduleConfig.env_schema.SHOW_BRAND.default_value,'false');
 assert.deepEqual(moduleConfig.env_schema.SHOW_PHONE_SUFFIX.options,['true','false']);assert.equal(moduleConfig.env_schema.SHOW_PHONE_SUFFIX.default_value,'false');assert.equal(moduleConfig.env_schema.LOW_BALANCE_THRESHOLD.default_value,'10');
 for(const key of ['CARD1_NAME','CARD2_NAME','CARD3_NAME'])assert.equal(moduleConfig.env_schema[key].default_value,'');
 assert.ok(!moduleConfig.env?.CARD_SLOT);
 for(const s of moduleConfig.scriptings)assert.ok(!Object.values(s)[0].env?.CARD_SLOT);
 assert.deepEqual(moduleConfig.widgets.slice(0,3).map(w=>w.env.CARD_SLOT),['1','2','3']);
 const urls=moduleConfig.scriptings.map(s=>Object.values(s)[0].script_url);assert.equal(new Set(urls).size,1);
});
test('module defaults to one card named 中国联通, adds card2/3 and a summary, with no module-level slot',()=>{
 assert.equal(moduleConfig.name,'中国联通');
 // First widget must be the single card, so one-card users need no summary.
 assert.equal(moduleConfig.widgets[0].name,'中国联通');
 assert.equal(moduleConfig.widgets[0].env.CARD_SLOT,'1');
 assert.equal(moduleConfig.widgets[0].env.VIEW,undefined);
 assert.deepEqual(moduleConfig.widgets.map(w=>w.env.CARD_SLOT),[ '1','2','3',undefined]);
 assert.equal(moduleConfig.widgets.at(-1).name,'中国联通 · 三卡');
 assert.equal(moduleConfig.widgets.at(-1).env.VIEW,'all');
 assert.ok(!moduleConfig.env?.CARD_SLOT);
 assert.equal(moduleConfig.env_schema.CARD_ORDER.name,'卡片显示顺序');
 assert.equal(moduleConfig.env_schema.CARD_ORDER.default_value,'');
 assert.ok(moduleConfig.env_schema.CARD_ORDER.description.includes('3,1,2'));
});
test('capture and slot namespace remain byte-identical to deployed working version',()=>{
 // Baseline SHA-256 from deployed 85980a3; works with Actions' shallow checkout.
 const current=readFileSync('UnicomThreeCards.js','utf8');
 const captureBytes=current.slice(current.indexOf('const PREFIX='),current.indexOf('const FRESH='));
 assert.equal(createHash('sha256').update(captureBytes).digest('hex'),'fd16b1546b62ee74108c0c10af31c9a677b5647622c0e7869f68351350ad318e');
});
test('module > widget > script settings contract preserves all three slots',async()=>{
 const m=mock();for(const p of phones)await capture(m,p);
 for(const w of moduleConfig.widgets.filter(w=>w.env.CARD_SLOT)){
  // Egern merges this before invoking JS, as documented; this simulates that contract.
  const scriptEnv={WIDGET_TITLE:'脚本'},widgetEnv={...w.env,WIDGET_TITLE:'组件',TRANSLUCENT:'false'},moduleEnv={WIDGET_TITLE:'全局',TRANSLUCENT:'true'};
  const result=await run({...m.ctx,env:{...scriptEnv,...widgetEnv,...moduleEnv}});
  assert.match(content(result),new RegExp('全局 · 卡'+w.env.CARD_SLOT));assert.equal(result.backgroundColor.light,'#FFFFFFB3');
 }
 assert.equal(m.calls.length,3);
 for(let i=0;i<3;i++)assert.equal(new URL(m.calls[i].u).searchParams.get('desmobiel'),phones[i]);
 const result=await run({...m.ctx,env:{...moduleConfig.widgets[1].env,WIDGET_TITLE:'独立卡二'}});assert.match(content(result),/独立卡二 · 卡2/);
});
test('all sizes retain title semantics, supported attributes and bounded lock layout',async()=>{
 const allowed={widget:['type','children','backgroundColor','padding','gap','refreshAfter'],stack:['type','direction','alignItems','gap','children','flex','padding','backgroundColor','backgroundGradient','borderRadius','borderWidth','borderColor','width','height'],text:['type','text','font','textColor','maxLines','minScale','flex','textAlign'],image:['type','src','color','width','height'],spacer:['type','length','flex']};
 for(const family of families){const m=mock();await capture(m);m.ctx.widgetFamily=family;m.ctx.env={TRANSLUCENT:'true',WIDGET_TITLE:'我的联通'};
  const normal=m.ctx.http.get;m.ctx.http.get=async(u,o)=>{const r=await normal(u,o),d=await r.json();d.flowResource.dynamicFlowTitle='已用流量';d.flowResource.flowPersent='123456789.123';return {status:200,json:async()=>d};};
  const result=await run(m.ctx);assert.match(content(result),/已用流量/);assert.ok(!content(result).includes('剩余'));assert.equal(result.backgroundColor.light,'#FFFFFFB3');
  for(const n of nodes(result))for(const attr of Object.keys(n))assert.ok(allowed[n.type].includes(attr),family+' unsupported '+n.type+'.'+attr);
  if(family.startsWith('accessory')){assert.ok(result.padding<=4);assert.ok(result.gap<=2);}else assert.match(content(result),/我的联通/);
  for(const n of nodes(result).filter(n=>n.type==='text')){assert.ok(n.minScale>0&&n.minScale<=1);assert.ok(n.maxLines>=1);}
 }
});
test('title safety, long title adaptation and reset apply without modifying stored accounts',async()=>{
 const m=mock();await capture(m);await run(m.ctx);const before=[...m.db];
 for(const title of [undefined,'',null,{},'x'.repeat(25),'secret\nvalue','Cookie=secret','https://example.invalid','13000000001','\u202ehidden']){
  const w=await run({...m.ctx,env:{WIDGET_TITLE:title}});assert.match(content(w),/卡1/);assert.ok(!content(w).includes('中国联通'));
 }
 const title='自定义联通标题'.repeat(3);const w=await run({...m.ctx,env:{WIDGET_TITLE:title}});assert.ok(content(w).includes(title));assert.equal(w.children[0].children[1].flex,1);
 const reset=await run({...m.ctx,env:{}});assert.match(content(reset),/卡1/);assert.ok(!content(reset).includes('中国联通'));assert.equal(reset.backgroundColor.light,'#FFFFFF');assert.deepEqual([...m.db],before);
});
test('booleans including invalid values are safe on all no-data and login-error sizes',async()=>{
 for(const family of families)for(const state of ['empty','auth'])for(const value of [true,'true','on','1',false,'false','off','0',undefined,{},'invalid']){
  const m=mock();m.ctx.widgetFamily=family;m.ctx.env={TRANSLUCENT:value,WIDGET_TITLE:'我的联通'};
  if(state==='auth'){await capture(m);m.ctx.http.get=async()=>({status:401});}
  const w=await run(m.ctx);assert.match(content(w),state==='auth'?/登录失效/:/待捕获/);assert.equal(w.backgroundColor.light,[true,'true','on','1'].includes(value)?'#FFFFFFB3':'#FFFFFF');
 }
});
test('malformed successful API response cannot erase credentials',async()=>{
 const m=mock();await capture(m);const before=[...m.db];m.ctx.http.get=async()=>({status:200,json:async()=>({code:'Y',feeResource:{}})});
 assert.match(content(await run(m.ctx)),/查询失败/);assert.deepEqual([...m.db],before);
});
test('invalid widget families fall back to small without throwing',async()=>{
 for(const widgetFamily of [null,{},17,'unknown']){const m=mock();await capture(m);const w=await run({...m.ctx,widgetFamily});assert.equal(w.children[2].children.length,2);}
});
