import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {normalizeAssetPath,patchBootstrap,patchLaunchMenu} from '../src/engine-host.js';
import {loadPackedVersion,instantiateOfficialNode} from '../tools/headless-smoke.mjs';
import {inspectKateCatalog,decodeKateDat} from '../src/kate-patches.js';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.dirname(project);
const assets=path.join(root,'shared/assets/lf2-super');
let originalBootstrap, originalLaunch;
before(async()=> {
  const module=await instantiateOfficialNode(path.join(assets,'runtime'),{print:()=>{}});
  originalBootstrap=module.FS.readFile('/scripts/runtime/bootstrap.lua',{encoding:'utf8'});
  originalLaunch=module.FS.readFile('/scripts/base/ui/launch.lua',{encoding:'utf8'});
});

test('host normalizes real Windows asset names and rejects traversal/absolute/control paths',()=> {
  assert.equal(normalizeAssetPath('./sprite\\Kate\\KateEX_f.bmp'),'sprite/kate/kateex_f.bmp');
  for(const input of ['/data/a.dat','../data/a.dat','data/../a.dat','data//a.dat','C:\\data.dat','data/ab\n.dat','数据/a.dat'])assert.throws(()=>normalizeAssetPath(input));
});
test('bootstrap mapping covers native readers, visuals, sounds, music, snapshots and replay',()=> {
  const source=originalBootstrap;const bridge=fs.readFileSync(path.join(project,'src/kate-bridge.lua'),'utf8');
  const result=patchBootstrap(source,bridge,['data/kate.dat','sprite/kate/kate_f.bmp']);
  assert(!result.includes('__KATE_PATHS__'));
  assert.match(result,/\["data\/kate.dat"\]=true/);
  assert.match(result,/\["sprite\/kate\/kate_f.bmp"\]=true/);
  for(const type of ['resource','object_data','background_data','stage_data'])assert(result.includes(`local read_${type} = kate_read(openlf2_read_${type})`));
  assert(result.includes('fields[1], fields[2] = "sprite", kate_path(resource)'));
  assert(result.includes('"sound", kate_path(resource), tostring(volume)'));
  assert(result.includes('"music play " .. kate_path(value)'));
  assert(result.includes('screen.draw(state, context)\n    kate_snapshot(state, screen)'));
  assert(result.includes('local save_recording, take_recording = openlf2_save_recording, kate_take_recording'));
  assert(result.includes('SPDX-License-Identifier: MIT'));
  assert(!result.includes('\r\n'));
});
test('bootstrap normalizes CRLF in both the upstream source and local bridge',()=> {
  const windows = value => value.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n');
  const bridge = fs.readFileSync(path.join(project,'src/kate-bridge.lua'),'utf8');
  const result = patchBootstrap(windows(originalBootstrap), windows(bridge), []);
  assert(!result.includes('\r\n'));
  assert(result.includes('kate_snapshot(state, screen)'));
});
test('bootstrap refuses unexpected upstream source instead of leaving an unpatched reader',()=> {
  const source=originalBootstrap.replace('local read_stage_data = openlf2_read_stage_data','local read_stage_data = alternate_reader');
  assert.throws(()=>patchBootstrap(source,'local kate_paths=__KATE_PATHS__',[]),/does not match the tested bridge/);
});
test('actual WASM menu redirects native network and recorder actions to existing host panels',()=> {
  const patched=patchLaunchMenu(originalLaunch);
  assert(patched.includes('if state.page == "network" then state.page = "menu"; context.action("open_remote_play") end'));
  assert(!patched.includes('context.action("network")'));
  assert.throws(()=>patchLaunchMenu(originalLaunch.replace('context.action("network")','context.action("alternate")')),/does not match/);
  const bootstrap=patchBootstrap(originalBootstrap,fs.readFileSync(path.join(project,'src/kate-bridge.lua'),'utf8'),[]);
  assert(bootstrap.includes('open_remote_play = "remote", open_recordings = "recordings", replay = "recordings", quit = "exit"'));
  assert(bootstrap.includes('print("KATE_HOST_ACTION:" .. host_action); return end'));
});
test('official WASM Lua runtime compiles and runs both patched sources with the original data archive',async()=> {
  const logs=[];
  const module=await instantiateOfficialNode(path.join(assets,'runtime'),{print:line=>logs.push(String(line))});
  module.FS.mkdirTree('/data');
  module.FS.writeFile('/data/LF2_v2.0a.exe',fs.readFileSync(path.join(assets,'runtime/lf2-resources.bin')));
  module.FS.writeFile('/scripts/runtime/bootstrap.lua',patchBootstrap(originalBootstrap,fs.readFileSync(path.join(project,'src/kate-bridge.lua'),'utf8'),[]),{encoding:'utf8'});
  module.FS.writeFile('/scripts/base/ui/launch.lua',patchLaunchMenu(originalLaunch),{encoding:'utf8'});
  const code=await module.callMain(['--headless','--config-dir','/data','--scripts','/scripts','--no-jit','--input-trace',',,']);
  assert.equal(code,0,logs.join('\n'));
  const snapshot=JSON.parse(module.FS.readFile('/data/state.json',{encoding:'utf8'}));
  assert.equal(snapshot.screen,'launch');
  assert(logs.some(line=>line.startsWith('KATE_KEY:')));
});
test('packed author assets validate all chunk hashes and indexes without Vite imports',()=> {
  const expected=[29,31,31];const manifest=JSON.parse(fs.readFileSync(path.join(assets,'manifest.json'),'utf8'));
  for(const [index,version] of manifest.versions.entries()) {
    const loaded=loadPackedVersion(assets,version.id);const catalog=inspectKateCatalog(loaded.files);
    assert.equal(catalog.fighters.length,expected[index]);
    assert(loaded.files.length+1<=1024);
    assert.equal(new Set(loaded.files.map(f=>f.path)).size,loaded.files.length);
    for(const file of loaded.files) {
      assert.equal(file.path,normalizeAssetPath(file.path));
      assert(!(file.bytes[0]===77&&file.bytes[1]===90),`Executable slipped into assets: ${file.path}`);
      if(file.path.endsWith('.dat'))assert(decodeKateDat(file.bytes).length>0);
    }
    const paths=new Set(loaded.files.map(f=>f.path));
    for(const object of catalog.objects)assert(paths.has(object.path),object.path);
    for(const background of catalog.backgrounds)assert(paths.has(background.path),background.path);
    if(index===2)assert(paths.has('data/music1.dat')&&paths.has('bg/sys/4_ms/bg.dat'));
  }
});
test('all packed bytes match each source-author manifest hash',()=> {
  const manifest=JSON.parse(fs.readFileSync(path.join(assets,'manifest.json'),'utf8'));
  for(const [index,version] of manifest.versions.entries()) {
    const loaded=loadPackedVersion(assets,version.id);
    const hashes=new Map(version.files.map(f=>[normalizeAssetPath(f.path),f.sha256]));
    for(const file of loaded.files) {
      assert.equal(createHash('sha256').update(file.bytes).digest('hex'),hashes.get(file.path),file.path);
    }
  }
});
