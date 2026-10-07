import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import run from '../UnicomThreeCards.js';
import {mock,capture,phones} from './helpers.js';

function yaml(path) {
  return JSON.parse(execFileSync('ruby',['-rjson','-ryaml','-e','puts JSON.generate(YAML.load_file(ARGV[0]))',path],{encoding:'utf8'}));
}
test('capture-only alternative preserves the exact live capture and has no inherited widgets',()=>{
  assert.ok(existsSync('UnicomCapture.yaml'),'capture-only migration module must exist');
  const old=yaml('UnicomThreeCards.yaml'),next=yaml('UnicomCapture.yaml');
  assert.deepEqual(next.scriptings,old.scriptings.filter(x=>x.http_request));
  assert.deepEqual(next.mitm,old.mitm);
  assert.equal(next.widgets,undefined);
  assert.equal(next.env_schema,undefined);
  assert.equal(old.widgets.length,3,'existing users retain all module widgets');
});

test('main-config fragment uses the same remote JS with unique editable widget names and fixed slots',async()=>{
  assert.ok(existsSync('UnicomLocalWidgets.fragment.yaml'),'main-config fragment must exist');
  const old=yaml('UnicomThreeCards.yaml'),local=yaml('UnicomLocalWidgets.fragment.yaml');
  assert.deepEqual(Object.keys(local).sort(),['scriptings','widgets']);
  assert.deepEqual(local.scriptings,[old.scriptings.find(x=>x.generic)]);
  assert.equal(new Set(local.widgets.map(w=>w.name)).size,4);
  assert.ok(local.widgets.every(w=>!old.widgets.some(o=>o.name===w.name)));
  assert.deepEqual(local.widgets.slice(1).map(w=>w.env.CARD_SLOT),['1','2','3']);
  const m=mock();
  for(const p of phones) await capture(m,p);
  const before=[...m.db.keys()];
  for(const w of [...local.widgets].reverse()) {
    assert.equal(w.script_name,local.scriptings[0].generic.name);
    const tree=await run({...m.ctx,env:w.env});
    assert.equal(tree.type,'widget');
    assert.ok(JSON.stringify(tree).includes(w.env.VIEW==='all'?'卡1':'卡'+w.env.CARD_SLOT));
  }
  assert.deepEqual([...m.db.keys()],before,'sorting widgets does not remap storage slots');
});
