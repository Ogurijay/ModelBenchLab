import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {normalizeKateFiles} from '../src/dat-compat.js';
import {decodeKateDat} from '../src/kate-patches.js';
import {loadPackedVersion} from '../tools/headless-smoke.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const assets=path.join(project,'../shared/assets/lf2-super');
const hash=b=>createHash('sha256').update(b).digest('hex');
const text=b=>Buffer.from(decodeKateDat(b)).toString('latin1');

test('runtime normalization leaves frozen original resources immutable across all versions',()=> {
  for(const version of ['ver1','ver2','ver3']) {
    const source=loadPackedVersion(assets,version).files;
    const before=source.map(f=>hash(f.bytes));
    const result=normalizeKateFiles(source);
    assert.deepEqual(source.map(f=>hash(f.bytes)),before);
    assert.equal(result.files.length,source.length);
    assert.deepEqual(result.files.map(f=>f.path),source.map(f=>f.path));
    const isolated=result.diagnostics.filter(d=>d.kind==='quarantined-unnumbered-frame');
    assert.equal(isolated.length,version==='ver1'?0:1);
    if(isolated.length) {
      assert.equal(isolated[0].path,'data/bandit.dat');
      assert.equal(isolated[0].previousFrame,319);assert.equal(isolated[0].nextFrame,351);
      assert.equal(isolated[0].unresolvedReferences.filter(r=>r.target===350).length,10);
    }
    const bandit=text(result.files.find(f=>f.path==='data/bandit.dat').bytes);
    assert(!/<frame>\s*transform/.test(bandit));
    assert.equal(/<frame>\s*350\s/.test(bandit),version==='ver1');
    assert.match(bandit,/<frame>\s*319\s+A3_shadow[\s\S]*?state:\s*3289/);
    const freeze=text(result.files.find(f=>f.path==='data/freeze.dat').bytes);
    assert.match(freeze,/<frame>\s*305--3/);
    const second=normalizeKateFiles(result.files);assert.equal(second.diagnostics.length,0);
    for(let i=0;i<result.files.length;i++)assert.equal(hash(result.files[i].bytes),hash(second.files[i].bytes));
  }
});
test('real official WASM parses adapted DAT and executes patched Lua, preventing syntax-only mock acceptance',()=> {
  const output=execFileSync(process.execPath,[path.join(project,'tools/headless-smoke.mjs'),'--version','ver3','--scenario','menu'],{encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
  assert.match(output,/OFFLINE_DAT_PARSED 119 failures=0/);
  assert.match(output,/6 Lua frame\(s\)/);
  assert.match(output,/OFFLINE_SMOKE_COMPLETE/);
});
