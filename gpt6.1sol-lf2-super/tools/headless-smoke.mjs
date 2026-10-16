// Pure Node + official WASM offline smoke. No browser, DOM, installer execution or network.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {gunzipSync,inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {patchKateScripts,inspectKateCatalog} from '../src/kate-patches.js';
import {patchBootstrap, normalizeAssetPath} from '../src/engine-host.js';
import {normalizeKateFiles} from '../src/dat-compat.js';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.dirname(project);
const runtime=path.join(root,'shared/assets/lf2-super/runtime');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const args=process.argv.slice(2);
const value=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const version=value('--version','ver3');
const move=value('--move',null);
const moveSpecs={fa:{target:251,keys:['f','','r','','c']},fj:{target:248,keys:['f','','r','','b']},dj:{target:250,keys:['f','','d','','b']},uj:{target:254,keys:['f','','u','','b']},ja:{target:240,keys:['f','','b','','c']}};
if(move&&!moveSpecs[move])throw Error('Move must be fa/fj/dj/uj/ja');
const scenario=value('--scenario',move?'versus':'menu');
// The LF2 input loop samples alternate ticks; hold each combo edge for two ticks.
const trace=value('--trace',move?[...moveSpecs[move].keys.flatMap(k=>[k,k]),...Array(30).fill('')].join(','):scenario==='recording'?[...Array(170).fill(''),...Array(20).fill('c'),...Array(150).fill('')].join(','):scenario==='replay'?Array(340).fill('').join(','):scenario==='menu'?',,,,,':'r*20,c*10,b*5,f*5,,r*20');
const engineDir=value('--engine-dir',runtime);
const installerPath=value('--installer',path.join(runtime,'lf2-resources.bin'));

export function loadPackedVersion(assetRoot,id) {
  const manifest=JSON.parse(fs.readFileSync(path.join(assetRoot,'manifest.json'),'utf8'));
  const version=manifest.versions.find(v=>v.id===id);
  if(!version)throw Error(`Unknown packed version ${id}`);
  const chunks=new Map();
  for(const id of new Set(version.files.map(f=>f.chunk))) {
    const item=typeof id==='number'?manifest.chunks[id]:manifest.chunks.find(c=>c.path===id);
    if(!item)throw Error(`Missing chunk ${id}`);
    const compressed=fs.readFileSync(path.join(assetRoot,item.path));
    if(compressed.length!==item.compressed_length||hash(compressed)!==item.sha256)throw Error(`Compressed chunk mismatch ${item.path}`);
    const decoded=gunzipSync(compressed);
    if(decoded.length!==item.length||hash(decoded)!==item.decoded_sha256)throw Error(`Decoded chunk mismatch ${item.path}`);
    chunks.set(id,decoded);
  }
  const seen=new Set();
  const files=version.files.map(file=> {
    const p=normalizeAssetPath(file.path);const bytes=chunks.get(file.chunk);
    if(seen.has(p)||!bytes||!Number.isSafeInteger(file.offset)||!Number.isSafeInteger(file.length)||file.offset<0||file.length<0||file.offset+file.length>bytes.length)throw Error(`Invalid resource index ${p}`);
    const slice=bytes.subarray(file.offset,file.offset+file.length);
    if(file.sha256&&hash(slice)!==file.sha256)throw Error(`Resource hash mismatch ${p}`);
    seen.add(p);return {path:p,bytes:slice};
  });
  return {version,files};
}

export async function instantiateOfficialNode(engineDirectory,{print=console.log}={}) {
  const filename=path.join(engineDirectory,'openlf2.js');
  const source=fs.readFileSync(filename,'utf8');
  const binary=fs.readFileSync(path.join(engineDirectory,'openlf2.wasm'));
  let ready,failed;
  const initialized=new Promise((resolve,reject)=> {ready=resolve;failed=reject});
  const Module={noInitialRun:true,wasmBinary:binary,locateFile:name=>path.join(engineDirectory,name),print,printErr:print,onRuntimeInitialized:()=>ready(),onAbort:reason=>failed(Error(String(reason)))};
  const context=vm.createContext({Module,require:createRequire(import.meta.url),module:{exports:{}},exports:{},__filename:filename,__dirname:engineDirectory,
    process,console,WebAssembly,TextDecoder,TextEncoder,ArrayBuffer,Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array,DataView,
    performance,setTimeout,clearTimeout,setInterval,clearInterval,setImmediate,clearImmediate,Buffer,URL,URLSearchParams,location:{search:''},crypto:globalThis.crypto});
  // WEB remains false: this uses Emscripten's actual Node fs path, not DOM emulation.
  vm.runInContext(source,context,{filename,timeout:10000});
  const timer=setTimeout(()=>failed(Error('Node WASM initialization timed out')),30000);
  try {await initialized;}finally{clearTimeout(timer)}
  // SDL's entry-point EM_ASM reads query options even in --headless. Add only
  // that inert property after initialization, retaining Emscripten Node mode.
  context.window={location:{search:''}};
  return context.Module;
}

async function main() {
  const moveEvents=[],coverageEvents=[],modeEvents=[],replayStates=[];
  let recordingKey;
  const module=await instantiateOfficialNode(engineDir,{print:line=> {
    if(String(line).startsWith('OFFLINE_MOVE '))moveEvents.push(JSON.parse(String(line).slice(13)));
    if(String(line).startsWith('OFFLINE_COVERAGE '))coverageEvents.push(JSON.parse(String(line).slice(17)));
    if(String(line).startsWith('OFFLINE_MODE '))modeEvents.push(JSON.parse(String(line).slice(13)));
    if(String(line).startsWith('OFFLINE_REPLAY_STATE '))replayStates.push(JSON.parse(String(line).slice(21)));
    if(String(line).startsWith('KATE_KEY:'))recordingKey=String(line).slice(9);
    console.log(String(line).startsWith('KATE_KEY:')?'OFFLINE_RECORDING_KEY_CAPTURED':line);
  }});
  if(!module.FS||!module.callMain)throw Error('Official build does not export FS/callMain');
  if(args.includes('--help-engine')) {await module.callMain(['--help']);return;}
  if(!fs.existsSync(installerPath))throw Error('Offline trusted original installer is not yet downloaded');
  const installer=fs.readFileSync(installerPath);
  if(installer.length!==29586263||hash(installer)!=='540c485547e234b0d09595f54d067aafd7176092c308aca61868f3cbc03030e1')throw Error('Original installer size/hash mismatch');
  const packed=loadPackedVersion(path.join(root,'shared/assets/lf2-super'),version);
  const compatible=args.includes('--raw-dat')?{files:packed.files,diagnostics:[]}:normalizeKateFiles(packed.files);
  const {files}=compatible;
  console.log('OFFLINE_DAT_COMPAT '+JSON.stringify({version,adaptations:compatible.diagnostics.length,quarantined:compatible.diagnostics.filter(d=>d.kind==='quarantined-unnumbered-frame')}));
  const write=(p,b)=> {module.FS.mkdirTree(path.posix.dirname(p));module.FS.writeFile(p,b)};
  write('/data/LF2_v2.0a.exe',installer);
  const manifest=['id=kate','version=1','api=1','requires=base@1'];
  for(const f of files) {write('/mods/kate/'+f.path,f.bytes);manifest.push(`asset=mods/kate/${f.path}|${f.path}`)}
  write('/mods/kate/replay.bin','00000000');manifest.push('asset=mods/kate/replay.bin|replay.bin');
  write('/mods/kate/package.manifest',manifest.join('\n')+'\n');
  if(scenario==='replay') {
    const replayFile=value('--replay-file',null);if(!replayFile)throw Error('Native replay needs --replay-file');
    write('/data/replay.lfr',fs.readFileSync(replayFile));
  }
  let bridge=fs.readFileSync(path.join(project,'src/kate-bridge.lua'),'utf8');
  const catalog=inspectKateCatalog(files);
  const reads=[...catalog.objects.map(o=>['object_data',o.path]),...catalog.backgrounds.map(o=>['background_data',o.path]),['stage_data','data/stage.dat']];
  // Actual C++ resource parsers run before the first game tick, not our JS extractor.
  bridge+='\nlocal kate_audit_failures, kate_audit_count = 0, 0\n';
  for(const [type,p] of reads) {
    bridge+=`do local ok, problem = pcall(openlf2_read_${type}, ${JSON.stringify('mods/kate/'+p)})\n`+
      `kate_audit_count = kate_audit_count + 1\nif not ok then kate_audit_failures = kate_audit_failures + 1; print("OFFLINE_DAT_FAIL ${p}: " .. tostring(problem)) end\nend\n`;
  }
  bridge+='print("OFFLINE_DAT_PARSED " .. kate_audit_count .. " failures=" .. kate_audit_failures)\nassert(kate_audit_failures == 0, "Kate native DAT parser audit failed")\n';
  const bootstrap='/scripts/runtime/bootstrap.lua';
  let patchedBootstrap=patchBootstrap(module.FS.readFile(bootstrap,{encoding:'utf8'}),bridge,files.map(f=>f.path));
  if(move) {
    const anchor='local state = screen.create(runtime_settings or {menu_seed = 0})';
    if(!patchedBootstrap.includes(anchor))throw Error('Move instrumentation bootstrap anchor missing');
    patchedBootstrap=patchedBootstrap.replace(anchor,anchor+`\nlocal smoke_control = load_module("base/game/control")\nlocal smoke_enter = smoke_control.enter_frame\nsmoke_control.enter_frame = function(match, value, target)\n    local before = value.mp\n    smoke_enter(match, value, target)\n    if value.record.id == 7 and math.abs(target) == ${moveSpecs[move].target} then\n        print(string.format('OFFLINE_MOVE {"target":%d,"frame":%d,"mpBefore":%d,"mpAfter":%d,"reached":%s}', target, value.frame, before, value.mp, tostring(value.frame == math.abs(target))))\n    end\nend\n`);
  }
  if(scenario==='coverage') {
    const anchor='    screen.draw(state, context)';
    const pictures=files.filter(f=>f.path.endsWith('.bmp')).map(f=>f.path);
    const sounds=files.filter(f=>f.path.endsWith('.wav')).map(f=>f.path);
    patchedBootstrap=patchedBootstrap.replace(anchor,anchor+`\n    if not state.smoke_inventory then\n        state.smoke_inventory = true\n        for _, p in ipairs({${pictures.map(p=>JSON.stringify(p)).join(',')}}) do context.sprite(p, {0,0,1,1}, 0,0,false) end\n        for _, p in ipairs({${sounds.map(p=>JSON.stringify(p)).join(',')}}) do context.sound(p,-10000,0) end\n    end\n`);
  }
  if(scenario==='recording') {
    const anchor='local state = screen.create(runtime_settings or {menu_seed = 0})';
    const hook=`local smoke_recording = load_module("base/game/recording")\nlocal smoke_begin = smoke_recording.begin\nsmoke_recording.begin = function(match,setup)\n    for i=0,1 do\n        local v=assert(match.items[i],"Recording fixture needs two humans")\n        v.x_int=300+i*40; v.x=v.x_int; v.z_int=400; v.z=400; v.y_int=0; v.y=0; v.blink=0\n    end\n    return smoke_begin(match,setup)\nend\n`;
    patchedBootstrap=patchedBootstrap.replace(anchor,hook+anchor);
  }
  if(['recording','replay'].includes(scenario)) {
    const hook=`\n    if state.match and state.match.match then\n        local m=state.match.match\n        if m.frame_number % 15 == 0 then\n            local items={}\n            for i=0,399 do local v=m.items[i]; if v then\n                items[#items+1]=string.format('{"index":%d,"id":%d,"frame":%d,"hp":%d,"mp":%d,"x":%.9f,"y":%.9f,"z":%.9f,"vx":%.9f,"vy":%.9f,"vz":%.9f}',i,v.record.id,v.frame,v.hp,v.mp,v.x,v.y,v.z,v.vx,v.vy,v.vz)\n            end end\n            print(string.format('OFFLINE_REPLAY_STATE {"frame":%d,"camera":%d,"round":%d,"winner":%d,"items":[%s]}',m.frame_number,m.camera,m.round_counter,m.winner,table.concat(items,',')))\n        end\n    end`;
    patchedBootstrap=patchedBootstrap.replace('    kate_snapshot(state, screen)','    kate_snapshot(state, screen)'+hook);
    // The product routes Replay to its browser picker. This fixture emits the
    // official native action directly so --replay invokes the actual .lfr codec.
    if(scenario==='replay')patchedBootstrap=patchedBootstrap.replace('    screen.draw(state, context)','    screen.draw(state, context)\n    if not state.smoke_replay_offered then commands[#commands+1]="action replay"; state.smoke_replay_offered=true end');
  }
  write(bootstrap,patchedBootstrap);
  const patches=patchKateScripts(module.FS,{version,files});
  if(scenario!=='menu') {
    if(!['versus','stage','coverage','modes','recording','replay'].includes(scenario))throw Error('Unknown smoke scenario');
    const luaMode=scenario==='stage'?1:0;
    const flowPath='/scripts/base/ui/flow.lua';
    const flow=module.FS.readFile(flowPath,{encoding:'utf8'}).replaceAll('\r\n','\n');
    const needle='    return state\nend\nlocal function with_recording';
    if(!flow.includes(needle))throw Error('Flow smoke fixture no longer matches official source');
    const fixture=`    do\n        local fighters = catalog.load()\n        local kate, kate_ex\n        for i, fighter in ipairs(fighters) do\n            if fighter.id == 7 then kate = i end\n            if fighter.id == 51 then kate_ex = i end\n        end\n        assert(kate and kate_ex, "Kate smoke fighters missing")\n        state.match = require("base/ui/match_screen").create({mode=${luaMode}, difficulty=0, background=0, stage_level=0, fighters=fighters, backgrounds=catalog.backgrounds(), slots={[0]={kind="human", fighter=kate, team=1}${['versus','recording'].includes(scenario)?', [1]={kind="computer", fighter=kate_ex, team=2}':''}}})\n        state.active = "match"\n    end\n`;
    let actualFixture=fixture;
    if(scenario==='recording') {
      actualFixture=fixture.replace('{kind="computer", fighter=kate_ex, team=2}','{kind="human", fighter=kate_ex, team=2, hp=1}')
        .replace('slots={[0]', 'record={names={"Kate","KateEX"},version=state.options.recording_version or 0,time=engine.local_time(),music="",author="Offline engine test",info="Recorded real input and combat",email=""},slots={[0]');
    } else if(scenario==='replay')actualFixture='    state.match=nil\n    state.active="title"\n';
    write(flowPath,flow.replace(needle,actualFixture+needle));
    if(scenario==='coverage') {
      const code=`\nlocal smoke_update = flow.update\nfunction flow.update(state, input, context)\n    state.smoke_tick = (state.smoke_tick or 0) + 1\n    local fighters, bgs = catalog.load(), catalog.backgrounds()\n    local n = state.smoke_tick\n    if n <= #fighters + #bgs then\n        local fighter, row = n <= #fighters and n or 2, n <= #fighters and 0 or n - #fighters - 1\n        state.match = require("base/ui/match_screen").create({mode=0,difficulty=0,background=row,stage_level=0,fighters=fighters,backgrounds=bgs,slots={[0]={kind="human",fighter=fighter,team=1}}})\n        state.active = "match"\n        state.smoke_last = {kind=n <= #fighters and "fighter" or "background",id=n <= #fighters and fighters[fighter].id or bgs[row+1].id}\n    end\n    return smoke_update(state,input,context)\nend\n`;
      const flow=module.FS.readFile(flowPath,{encoding:'utf8'});write(flowPath,flow.replace('return flow',code+'return flow'));
      patchedBootstrap=module.FS.readFile(bootstrap,{encoding:'utf8'}).replace('    kate_snapshot(state, screen)',`    kate_snapshot(state, screen)\n    if state.smoke_last then print(string.format('OFFLINE_COVERAGE {"kind":"%s","id":%d}', state.smoke_last.kind, state.smoke_last.id)); state.smoke_last=nil end`);
      write(bootstrap,patchedBootstrap);
    }
    if(scenario==='modes') {
      const code=`\nlocal smoke_update = flow.update\nfunction flow.update(state,input,context)\n    state.smoke_tick=(state.smoke_tick or 0)+1\n    local n=state.smoke_tick\n    if n==1 or n==7 then\n        state.championship=require("base/ui/championship").create({background=0,random_background=false,difficulty=0},n==7)\n        state.active="championship"\n        state.smoke_mode=true\n    elseif n==13 then\n        local fighters=catalog.load()\n        local cfg=require("base/ui/battle_setup").create_config()\n        cfg.stock, cfg.on_field={},{}\n        for i=0,21 do cfg.stock[i]=cfg.reserve[i] or 0; cfg.on_field[i]=cfg.first[i] or 0 end\n        state.match=require("base/ui/match_screen").create({mode=4,difficulty=0,background=0,fighters=fighters,backgrounds=catalog.backgrounds(),slots={[0]={kind="human",fighter=2,team=1},[1]={kind="computer",fighter=3,team=2}},battle=cfg})\n        state.active="match"\n        state.smoke_mode=true\n    elseif n==19 then\n        state.match=require("base/ui/match_screen").create(require("base/ui/demo").match_options(nil))\n        state.active="match"\n        state.smoke_mode=true\n    end\n    return smoke_update(state,input,context)\nend\n`;
      const flow=module.FS.readFile(flowPath,{encoding:'utf8'});write(flowPath,flow.replace('return flow',code+'return flow'));
      const hook=`\n    if state.smoke_mode then\n        local m=state.active=="championship" and (state.championship.team and 3 or 2) or state.match.match.mode\n        print(string.format('OFFLINE_MODE {"mode":%d,"screen":"%s"}',m,state.active))\n        state.smoke_mode=nil\n    end`;
      const boot=module.FS.readFile(bootstrap,{encoding:'utf8'});write(bootstrap,boot.replace('    kate_snapshot(state, screen)','    kate_snapshot(state, screen)'+hook));
    }
  }
  console.log('OFFLINE_PATCHES '+JSON.stringify(patches));
  const nativeArgs=['--headless','--config-dir','/data','--scripts','/scripts','--mod','/mods/kate','--no-jit','--input-trace',trace];
  if(scenario==='replay')nativeArgs.push('--replay','/data/replay.lfr');
  const code=await module.callMain(nativeArgs);
  if(typeof code==='number'&&code!==0)throw Error(`Headless engine returned ${code}`);
  let snapshot;
  try {snapshot=JSON.parse(module.FS.readFile('/data/state.json',{encoding:'utf8'}));} catch {}
  if(!['menu','recording','replay'].includes(scenario)&&(!snapshot||snapshot.screen!=='match'||snapshot.tick<2||(scenario!=='modes'&&!snapshot.fighters?.some(f=>f.id===7))))throw Error('Headless scenario did not produce progressing Kate match snapshots');
  if(move&&!moveEvents.some(e=>e.reached&&e.frame===moveSpecs[move].target&&e.mpAfter<e.mpBefore))throw Error(`Real input did not trigger ${move} with MP cost`);
  if(scenario==='coverage') {
    const fighters=new Set(coverageEvents.filter(e=>e.kind==='fighter').map(e=>e.id));const backgrounds=new Set(coverageEvents.filter(e=>e.kind==='background').map(e=>e.id));
    if(fighters.size!==catalog.fighters.length||backgrounds.size!==catalog.backgrounds.length)throw Error('Not every catalog fighter/background rendered in an actual match');
  }
  if(scenario==='modes'&&JSON.stringify(modeEvents.map(e=>e.mode))!==JSON.stringify([2,3,4,5]))throw Error('Not every additional native mode started');
  if(scenario==='recording') {
    const recordings=module.FS.readdir('/data/recording').filter(p=>p.endsWith('.lfr'));
    if(recordings.length!==1||!recordingKey)throw Error('Native combat did not save exactly one recording');
    const bytes=module.FS.readFile('/data/recording/'+recordings[0]);
    const size=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0,true);
    const packed=bytes.slice(4,4+size);
    for(let i=0;i<Math.min(recordingKey.length,packed.length);i++)packed[i]=(packed[i]-recordingKey.charCodeAt(i)+48)&255;
    const block=inflateSync(packed);if(block.length!==0x630e18)throw Error('Real .lfr did not decode to native fixed block size');
    const out=value('--record-out',null);if(out) {fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,bytes)}
    console.log('OFFLINE_RECORDING_SAVED '+JSON.stringify({name:recordings[0],bytes:bytes.length,decoded:block.length,keyLength:recordingKey.length,elapsed:block.readInt32LE(0x144),version:block.readInt32LE(0x748),checksum:block.readInt32LE(0x744),output:out}));
  }
  if(['recording','replay'].includes(scenario)) {
    if(!replayStates.some(s=>s.frame>=150))throw Error('Recording/replay did not advance through the native150-frame checksum checkpoint');
    const out=value('--state-out',null);if(out) {fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(replayStates,null,2))}
    const compare=value('--compare-states',null);
    if(compare) {
      const original=new Map(JSON.parse(fs.readFileSync(compare,'utf8')).map(s=>[s.frame,s]));
      const shared=replayStates.filter(s=>original.has(s.frame));
      if(shared.length<10)throw Error('Too few original/replay state checkpoints');
      for(const state of shared)if(JSON.stringify(state)!==JSON.stringify(original.get(state.frame)))throw Error(`Native replay world differs at frame${state.frame}`);
      console.log('OFFLINE_REPLAY_MATCH '+JSON.stringify({checkpoints:shared.length,throughFrame:shared.at(-1).frame}));
    }
  }
  console.log('OFFLINE_SMOKE_COMPLETE '+JSON.stringify({version,assets:files.length,scenario,move,moveEvents,coverageEvents,modeEvents,trace,code,snapshot}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=> {console.error(error.stack||error);process.exitCode=1});
