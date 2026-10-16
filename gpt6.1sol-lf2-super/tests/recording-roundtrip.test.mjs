import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.dirname(project);
const tool=path.join(project,'tools/headless-smoke.mjs');

test('real native recording compression, native replay decoding and world progression round-trip',()=> {
  fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
  const work=fs.mkdtempSync(path.join(root,'tmp/lf2-replay-test-'));
  const recording=path.join(work,'real-native.lfr');
  const recorded=path.join(work,'recorded-states.json');
  const replayed=path.join(work,'replayed-states.json');
  const invoke=args=>execFileSync(process.execPath,[tool,...args],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
  const saved=invoke(['--scenario','recording','--record-out',recording,'--state-out',recorded]);
  const summary=JSON.parse(saved.match(/OFFLINE_RECORDING_SAVED (.+)/)[1]);
  assert(summary.bytes>=1000);assert.equal(summary.decoded,0x630e18);assert(summary.keyLength>1000);assert(summary.elapsed>=150);
  assert(fs.statSync(recording).size===summary.bytes);
  const replay=invoke(['--scenario','replay','--replay-file',recording,'--state-out',replayed,'--compare-states',recorded]);
  const matched=JSON.parse(replay.match(/OFFLINE_REPLAY_MATCH (.+)/)[1]);
  assert(matched.checkpoints>=20);assert(matched.throughFrame>=300);
  const original=new Map(JSON.parse(fs.readFileSync(recorded,'utf8')).map(s=>[s.frame,s]));
  const states=JSON.parse(fs.readFileSync(replayed,'utf8'));
  for(const state of states)if(original.has(state.frame))assert.deepEqual(state,original.get(state.frame));
  assert(!replay.includes('replay_error'));assert.match(replay,/OFFLINE_SMOKE_COMPLETE/);
  // Small generated recordings/state evidence remains in ignored tmp, never test fixtures.
});
