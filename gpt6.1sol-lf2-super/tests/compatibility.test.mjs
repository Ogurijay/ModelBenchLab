import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeKateDat, normalizeKatePath, inspectKateCatalog, patchKateScripts} from '../src/kate-patches.js';
import {loadPackedVersion,instantiateOfficialNode} from '../tools/headless-smoke.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets=path.join(root,'shared/assets/lf2-super');
let sources;
before(async()=> {
  const module=await instantiateOfficialNode(path.join(assets,'runtime'),{print:()=>{}});
  sources=new Map(['base/game/catalog.lua','base/ui/character_select.lua'].map(p=>['/scripts/'+p,module.FS.readFile('/scripts/'+p,{encoding:'utf8'})]));
});
const load=id=>loadPackedVersion(assets,`ver${id}`).files;
function memoryFS() {
  const files=new Map(sources);
  return {files,readFile(p) {if(!files.has(p))throw Error('ENOENT');return files.get(p)},writeFile(p,b) {files.set(p,b)}};
}
const text=bytes=>new TextDecoder().decode(bytes).replace(/#[^\r\n]*/g,'');
test('paths canonicalize Windows case and separators and reject escape paths',()=> {
  assert.equal(normalizeKatePath('sprite\\Kate\\Kate_f.bmp'),'sprite/kate/kate_f.bmp');
  for(const bad of ['../data/a.dat','data/../a.dat','C:\\a.dat','sprite/皮.bmp','data//a.dat'])assert.throws(()=>normalizeKatePath(bad));
});
test('DAT decoder rejects PE masquerading as data and truncated files',()=> {
  assert.throws(()=>decodeKateDat(new Uint8Array(100)));
  const fake=new Uint8Array(200);fake[0]=77;fake[1]=90;assert.throws(()=>decodeKateDat(fake));
});
test('shipped author package counts, paths and actual DAT capacities',()=> {
  for(const [i,expected] of [[1,[29,33,721]],[2,[31,41,803]],[3,[31,7,812]]]) {
    const files=load(i);const catalog=inspectKateCatalog(files);const paths=new Set(files.map(f=>f.path));
    assert.equal(catalog.fighters.length,expected[0]);assert.equal(catalog.stageIds.length,expected[1]);assert.equal(files.length,expected[2]);
    for(const o of [...catalog.objects,...catalog.backgrounds])assert(paths.has(o.path),o.path);
    for(const file of files) {
      assert(/^[\x20-\x7e]+$/.test(file.path));
      assert(!(file.bytes[0]===77&&file.bytes[1]===90));
      if(!file.path.endsWith('.dat'))continue;
      const data=text(decodeKateDat(file.bytes));
      for(const match of data.matchAll(/(?:head|small|shadow|music|sound|weapon_(?:hit|drop|broken)_sound|file\([^)]*\)):\s*(\S+)/g)) {
        assert(paths.has(normalizeKatePath(match[1])),`${file.path} references ${match[1]}`);
      }
      for(const match of data.matchAll(/layer:\s*(\S+\.bmp)\b/g))assert(paths.has(normalizeKatePath(match[1])),match[1]);
      assert([...data.matchAll(/file\([^)]*\):/g)].length<=10,file.path);
      for(const frame of data.matchAll(/<frame>\s*(-?\d+)[\s\S]*?<frame_end>/g)) {
        assert(+frame[1]>=0&&+frame[1]<=399,file.path);
        for(const kind of ['itr','bdy'])assert([...frame[0].matchAll(new RegExp(`\\b${kind}:`,'g'))].length<=5,file.path);
      }
      for(const stage of data.matchAll(/<stage>\s*id:\s*(\d+)([\s\S]*?)<stage_end>/g)) {
        assert(+stage[1]<=59);const phases=[...stage[2].matchAll(/<phase>([\s\S]*?)<phase_end>/g)];assert(phases.length<=100);
        for(const phase of phases)assert([...phase[1].matchAll(/\bid:\s*(-?\d+)/g)].length<=60);
      }
    }
  }
});
test('decoded source retains unusual states and actual character names',()=> {
  const files=load(3);const get=p=>text(decodeKateDat(files.find(f=>f.path===p).bytes));
  assert.match(get('data/bandit.dat'),/<frame>\s*319[\s\S]*?state:\s*3289/);
  assert.match(get('data/kateex.dat'),/name:\s*KateEX/);
  assert.match(get('data/katian.dat'),/name:\s*Katian/);
  assert.match(get('data/pkmnt.dat'),/name:\s*\?\?\?/);
});
test('Lua patches expose real records and stages while leaving every input resource unchanged',()=> {
  const virtual=memoryFS();const files=load(3);const before=files.map(f=>Buffer.from(f.bytes));
  const result=patchKateScripts(virtual,{version:3,files});
  assert.equal(result.fighterCount,31);assert.deepEqual(result.stageIds,[0,10,20,30,31,32,40]);
  assert.match(virtual.files.get('/scripts/base/game/catalog.lua'),/hidden = false/);
  const menu=virtual.files.get('/scripts/base/ui/character_select.lua');assert(!menu.includes('fighter.id < constants.record_id_ranges'));assert(!menu.includes('options.stage_level + 10'));
  assert.match(menu,/local kate_stage_ids = \{0, 10, 20, 30, 31, 32, 40\}/);
  for(let i=0;i<files.length;i++)assert.deepEqual(files[i].bytes,before[i]);
  const second=patchKateScripts(virtual,{version:1,files:load(1)});assert.equal(second.stageIds.length,33);assert.equal((virtual.files.get('/scripts/base/ui/character_select.lua').match(/local kate_stage_ids/g)||[]).length,1);
});
test('source mismatch fails before writes',()=> {
  const virtual=memoryFS();virtual.files.set('/scripts/base/ui/character_select.lua','changed upstream source');const before=new Map(virtual.files);
  assert.throws(()=>patchKateScripts(virtual,{version:3,files:load(3)}),/source mismatch/);
  assert.deepEqual(virtual.files,before);
});
