import { patchKateScripts } from './kate-patches.js';

import {normalizeKateFiles} from './dat-compat.js';
const INSTALLER_SIZE = 29586263;
const INSTALLER_HASH = '540c485547e234b0d09595f54d067aafd7176092c308aca61868f3cbc03030e1';
const REPLAY_BLOCK_SIZE = 0x630e18;
const encoder = new TextEncoder();
const CONTROL_STORAGE_KEY = 'modelbench-kate-controls-v1';
const RECORDING_STORAGE_LIMIT = 32 * 1024 * 1024;

function openRecordingStore() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('IndexedDB is unavailable')); return; }
    const request = indexedDB.open('modelbench-kate-local-v1', 1);
    const timer = setTimeout(() => reject(new Error('Recording storage initialization timed out')), 8000);
    request.onupgradeneeded = () => request.result.createObjectStore('recordings', { keyPath: 'key' });
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
    request.onblocked = () => { clearTimeout(timer); reject(new Error('Recording storage is blocked by another page')); };
    request.onsuccess = () => { clearTimeout(timer); resolve(request.result); };
  });
}
function storeRequest(db, operation, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('recordings', operation === 'getAll' ? 'readonly' : 'readwrite');
    const request = transaction.objectStore('recordings')[operation](value);
    let result;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () => reject(transaction.error || request.error || new Error('Recording storage failed'));
  });
}

export function normalizeAssetPath(path) {
  const result = String(path).replaceAll('\\', '/').toLowerCase().replace(/^\.\//, '');
  if (!/^[a-z0-9_./-]+$/.test(result) || result.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsupported Kate resource path: ${path}`);
  }
  return result;
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError('Expected an ArrayBuffer or typed byte array');
}

function replaceRequired(source, needle, replacement) {
  if (!source.includes(needle)) throw new Error(`OpenLF2 runtime does not match the tested bridge: ${needle}`);
  return source.replace(needle, replacement);
}

export function patchBootstrap(source, bridge, paths) {
  source = source.replaceAll('\r\n', '\n');
  bridge = bridge.replaceAll('\r\n', '\n');
  const mapping = '{' + paths.map(path => `[${JSON.stringify(path)}]=true`).join(',') + '}';
  let result = bridge.replace('__KATE_PATHS__', mapping) + '\n' + source;
  for (const kind of ['resource', 'object_data', 'background_data', 'stage_data']) {
    result = replaceRequired(result, `local read_${kind} = openlf2_read_${kind}`, `local read_${kind} = kate_read(openlf2_read_${kind})`);
  }
  result = replaceRequired(result, 'local read_settings = openlf2_read_settings', 'local read_settings = kate_read_settings');
  result = replaceRequired(result, 'local write_settings = openlf2_write_settings', 'local write_settings = kate_write_settings');
  result = replaceRequired(result, 'local save_recording, take_recording = openlf2_save_recording, openlf2_take_recording',
    'local save_recording, take_recording = openlf2_save_recording, kate_take_recording');
  result = replaceRequired(result, 'fields[1], fields[2] = "sprite", resource', 'fields[1], fields[2] = "sprite", kate_path(resource)');
  result = replaceRequired(result, '"sound", resource, tostring(volume)', '"sound", kate_path(resource), tostring(volume)');
  result = replaceRequired(result, '"music play " .. value', '"music play " .. kate_path(value)');
  result = replaceRequired(result, 'screen.draw(state, context)', 'screen.draw(state, context)\n    kate_snapshot(state, screen)');
  result = replaceRequired(result, 'function context.action(name)', `function context.action(name)
        local host_action = ({open_remote_play = "remote", open_recordings = "recordings", replay = "recordings", quit = "exit"})[name]
        if host_action then print("KATE_HOST_ACTION:" .. host_action); return end`);
  return result;
}

export function patchLaunchMenu(source) {
  return replaceRequired(source.replaceAll('\r\n', '\n'),
    'if state.page == "network" then state.page = "menu"; context.action("network") end',
    'if state.page == "network" then state.page = "menu"; context.action("open_remote_play") end');
}

export function createEngineHost({ canvas, onStatus = () => {}, onError = () => {}, onLog = () => {}, onReady = () => {} }) {
  let module, recordingKey, loaded = false, loading = false, failed = false, replayToken = 0;
  let snapshot = { screen: 'unloaded', fighters: [], running: false };
  let stateTimer;
  let startupTimer;
  let currentVersion;
  let recordingStore, persistenceTimer, persistenceBusy = false;
  const persisted = new Map();
  const heldKeys = new Set();
  const persistence = { recordings: 'initializing', controls: 'default', error: null };
  const warnStorage = error => {
    const message = error?.message || String(error);
    if (persistence.error !== message) onLog(`Browser local storage: ${message}. Export recordings before leaving this page.`);
    persistence.error = message;
  };
  const report = (phase, detail = '') => onStatus({ phase, detail });
  const fail = error => {
    failed = true;
    const normalized = error instanceof Error ? error : new Error(String(error));
    report('error', normalized.message);
    onError(normalized);
    return normalized;
  };
  function log(text) {
    const line = String(text);
    if (line.startsWith('KATE_KEY:')) recordingKey = line.slice(9);
    else if (line.startsWith('KATE_STATE:')) {
      try { acceptSnapshot(JSON.parse(line.slice(11))); } catch { /* Preserve the last valid snapshot. */ }
    } else if (line.startsWith('KATE_CONTROLS:')) {
      try { localStorage.setItem(CONTROL_STORAGE_KEY, JSON.parse(line.slice(14))); persistence.controls = 'saved'; }
      catch (error) { warnStorage(error); }
    } else onLog(line);
  }
  function acceptSnapshot(data) {
    snapshot = { ...data, version: currentVersion, running: !failed };
    if (!loaded) {
      loaded = true; loading = false;
      clearTimeout(startupTimer);
      onLog(`First frame: screen=${data.screen}, tick=${data.tick}, canvas=${canvas.id}`);
      report('ready', 'OpenLF2 is running');
      onReady(getState());
    }
  }
  function write(path, bytes) {
    const directory = path.slice(0, path.lastIndexOf('/'));
    module.FS.mkdirTree(directory);
    module.FS.writeFile(path, bytes);
  }
  async function load({ engineUrls, installerBytes, files, version }) {
    if (loaded || loading) throw new Error('This engine instance is already loaded. Reload the page to switch versions.');
    loading = true;
    currentVersion = version;
    try {
      report('verifying', 'Checking the original LF2 v2.0a data archive');
      const installer = asBytes(installerBytes);
      if (installer.length !== INSTALLER_SIZE) throw new Error('The original LF2 v2.0a installer must be 29,586,263 bytes.');
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', installer));
      const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== INSTALLER_HASH) throw new Error('The selected file is not the supported original LF2 v2.0a installer.');
      const compatible = normalizeKateFiles(files);
      if (compatible.diagnostics.length) {
        const quarantined = compatible.diagnostics.filter(item => item.kind === 'quarantined-unnumbered-frame').length;
        onLog(`KATE_DAT_COMPAT: ${compatible.diagnostics.length} runtime adaptations, ${quarantined} unnumbered frames quarantined`);
      }
      const assets = new Map();
      for (const file of compatible.files) {
        const path = normalizeAssetPath(file.path);
        if (assets.has(path)) throw new Error(`Duplicate resource after path normalization: ${path}`);
        assets.set(path, asBytes(file.bytes));
      }
      if (!assets.has('data/data.txt')) throw new Error('Kate data/data.txt is missing.');
      // Original packages remain intact. These Win32 virtual key codes are what
      // OpenLF2's SDL adapter maps physical scancodes to (not SDL keycodes).
      const controls = [
        [0, 87, 83, 65, 68, 74, 75, 76, 0, 1, 2],
        [0, 38, 40, 37, 39, 49, 50, 51, 0, 1, 2],
        [0, 84, 71, 70, 72, 90, 88, 67, 0, 1, 2],
        [0, 104, 101, 100, 102, 97, 98, 99, 0, 1, 2],
      ];
      let controlText = controls.map(row => row.join(' ')).join('\n') + '\nPlayer1 Player2 Player3 Player4\n0 0\n\n\n';
      try {
        const saved = localStorage.getItem(CONTROL_STORAGE_KEY);
        const tokens = saved?.trim().split(/\s+/);
        const valid = saved?.length <= 4096 && tokens?.length >= 48 && tokens.slice(0, 44).every((token, index) => {
          if (!/^\d+$/.test(token)) return false;
          const column = index % 11;
          return Number(token) <= (column === 0 ? 4 : column >= 8 ? 31 : 255);
        });
        if (valid) { controlText = saved; persistence.controls = 'restored'; }
      } catch (error) { warnStorage(error); }
      assets.set('data/control.txt', encoder.encode(controlText));
      if (assets.size + 1 > 1024) throw new Error('OpenLF2 supports at most 1024 package assets. Import only resources referenced by this version.');
      report('loading', 'Loading the local WebAssembly engine');
      const bridgeResponse = await fetch(new URL('./kate-bridge.lua', import.meta.url));
      if (!bridgeResponse.ok) throw new Error(`Kate bridge could not be loaded (${bridgeResponse.status}).`);
      const bridge = await bridgeResponse.text();
      if (window.Module?.FS) throw new Error('An OpenLF2 engine is already running in this page.');
      await new Promise((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error('WebAssembly initialization timed out after 90 seconds.')), 90000);
        module = {
          canvas, noInitialRun: true,
          preRun: [() => {
            // SDL3's software framebuffer selects a DOM element by its own
            // hint, defaulting to #canvas. Module.canvas alone does not route
            // that framebuffer to an application canvas with another id.
            if (!canvas.id) canvas.id = 'kate-engine-canvas';
            const selector = `#${CSS.escape(canvas.id)}`;
            if (!window.ENV) throw new Error('The engine does not expose the expected Emscripten environment.');
            window.ENV.SDL_EMSCRIPTEN_CANVAS_SELECTOR = selector;
            onLog(`SDL canvas selector configured: ${selector}`);
          }],
          locateFile(name) {
            if (name.endsWith('.wasm')) return new URL(engineUrls.wasm, location.href).href;
            if (name.endsWith('.data')) return new URL(engineUrls.data, location.href).href;
            return new URL(name, new URL(engineUrls.js, location.href)).href;
          },
          print: log, printErr: log,
          setStatus: text => { if (text) report('loading', String(text)); },
          onRuntimeInitialized() { clearTimeout(deadline); resolve(); },
          onAbort(reason) {
            clearTimeout(deadline);
            const error = new Error(`Engine aborted: ${reason}`);
            if (loaded) fail(error); else reject(error);
          },
          onExit(code) { if (code !== 0) fail(new Error(`Engine exited with code ${code}`)); },
        };
        window.Module = module;
        const script = document.createElement('script');
        script.src = new URL(engineUrls.js, location.href).href;
        script.async = true;
        script.onerror = () => { clearTimeout(deadline); reject(new Error('The local OpenLF2 engine script could not be loaded.')); };
        document.head.append(script);
      });
      if (!module.FS || !module.callMain) throw new Error('This WebAssembly build does not export FS and callMain.');
      report('mounting', `Mounting ${assets.size} resources for ${version}`);
      write('/data/LF2_v2.0a.exe', installer);
      try {
        recordingStore = await openRecordingStore();
        const saved = await storeRequest(recordingStore, 'getAll');
        for (const entry of saved) {
          if (entry.version === String(version) && /^[a-z0-9 _.-]+\.lfr$/i.test(entry.name)) {
            write(`/data/recording/${entry.name}`, new Uint8Array(entry.bytes));
          }
        }
        persistence.recordings = 'available';
      } catch (error) { persistence.recordings = 'unavailable'; warnStorage(error); }
      const manifest = ['id=kate', 'version=1', 'api=1', 'requires=base@1'];
      for (const [path, bytes] of assets) {
        write(`/mods/kate/${path}`, bytes);
        manifest.push(`asset=mods/kate/${path}|${path}`);
      }
      write('/mods/kate/replay.bin', encoder.encode('00000000'));
      manifest.push('asset=mods/kate/replay.bin|replay.bin');
      write('/mods/kate/package.manifest', encoder.encode(manifest.join('\n') + '\n'));
      const patches = patchKateScripts(module.FS, { version, files: [...assets].map(([path, bytes]) => ({ path, bytes })) });
      onLog(`Kate menu scripts adapted for ${version}; default controls are mounted in memory: P1 WASD/JKL, P2 arrows/123, P3 TFGH/ZXC, P4 numpad 8456/123.`);
      const bootstrapPath = '/scripts/runtime/bootstrap.lua';
      const originalBootstrap = module.FS.readFile(bootstrapPath, { encoding: 'utf8' });
      write(bootstrapPath, encoder.encode(patchBootstrap(originalBootstrap, bridge, [...assets.keys()])));
      const launchPath = '/scripts/base/ui/launch.lua';
      write(launchPath, encoder.encode(patchLaunchMenu(module.FS.readFile(launchPath, { encoding: 'utf8' }))));
      // Replay imports may interrupt a running match instead of requiring the
      // unavailable browser-native file dialog on the title screen.
      const flowPath = '/scripts/base/ui/flow.lua';
      const flow = module.FS.readFile(flowPath, { encoding: 'utf8' }).replaceAll('\r\n', '\n');
      write(flowPath, encoder.encode(replaceRequired(flow,
        'if state.active == "title" then\n        local block, problem = engine.take_recording()',
        'if true then\n        local block, problem = engine.take_recording()')));
      stateTimer = setInterval(() => {
        try {
          const data = JSON.parse(module.FS.readFile('/data/state.json', { encoding: 'utf8' }));
          acceptSnapshot(data);
        } catch { /* The first frame may not have produced a snapshot yet. */ }
      }, 250);
      persistenceTimer = setInterval(() => { if (loaded) persistRecordings().catch(warnStorage); }, 2000);
      startupTimer = setTimeout(() => {
        if (!loaded && !failed) { loading = false; clearInterval(stateTimer); fail(new Error('The engine did not produce its first game frame within 60 seconds. Check the diagnostic log.')); }
      }, 60000);
      const result = module.callMain(['--config-dir', '/data', '--mod', '/mods/kate', '--no-jit']);
      if (result?.catch) result.catch(error => fail(error));
      else if (typeof result === 'number' && result !== 0) throw new Error(`Engine start failed (${result}).`);
      canvas.focus({ preventScroll: true });
      return { mounted: true, version, assets: assets.size, patches };
    } catch (error) {
      loading = false;
      if (stateTimer) clearInterval(stateTimer);
      if (persistenceTimer) clearInterval(persistenceTimer);
      clearTimeout(startupTimer);
      throw fail(error);
    }
  }
  async function importReplay(value) {
    if (!loaded) throw new Error('Start the game before importing a recording.');
    const file = asBytes(value);
    let block;
    if (file.length === REPLAY_BLOCK_SIZE) block = file;
    else {
      if (!recordingKey) throw new Error('The original recording key is unavailable; this recording cannot be decoded.');
      if (file.length < 1000 || file.length > 16 * 1024 * 1024) throw new Error('Invalid .lfr recording size.');
      const length = new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(0, true);
      if (length > file.length - 4) throw new Error('The recording has an invalid compressed length.');
      const packed = file.slice(4, 4 + length);
      for (let index = 0; index < Math.min(recordingKey.length, packed.length); index++) packed[index] = (packed[index] - recordingKey.charCodeAt(index) + 48) & 255;
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser does not support recording decompression.');
      const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { value: chunk, done } = await reader.read(); if (done) break;
          size += chunk.length;
          if (size > REPLAY_BLOCK_SIZE) throw new Error('The recording decompressed beyond the supported size.');
          chunks.push(chunk);
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw new Error(`Corrupted recording: ${error.message}`); }
      if (size !== REPLAY_BLOCK_SIZE) throw new Error('The recording decompressed to an invalid size.');
      block = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { block.set(chunk, offset); offset += chunk.length; }
    }
    const packet = new Uint8Array(8 + block.length);
    packet.set(encoder.encode(String(++replayToken).padStart(8, '0')));
    packet.set(block, 8);
    write('/mods/kate/replay.bin', packet);
    // Keep imported packed files too, so a version switch does not lose the
    // selected replay. Raw internal blocks are not mislabeled as .lfr files.
    if (file.length !== REPLAY_BLOCK_SIZE) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', file));
      const id = Array.from(digest.slice(0, 8), byte => byte.toString(16).padStart(2, '0')).join('');
      write(`/data/recording/import_${id}.lfr`, file);
      await persistRecordings().catch(warnStorage);
    }
    report('replay', 'Recording decoded; the game will validate its version and checksums.');
    return { queued: true, storageAvailable: !!recordingStore };
  }
  function exportRecordings() {
    if (!module?.FS) return [];
    try {
      return module.FS.readdir('/data/recording').filter(name => name.toLowerCase().endsWith('.lfr')).map(name => ({ name, bytes: module.FS.readFile(`/data/recording/${name}`).slice() }));
    } catch { return []; }
  }
  async function persistRecordings() {
    if (!recordingStore || persistenceBusy) return { saved: 0, available: !!recordingStore };
    persistenceBusy = true;
    let count = 0;
    try {
      const existing = await storeRequest(recordingStore, 'getAll');
      const byKey = new Map(existing.map(entry => [entry.key, entry]));
      let total = existing.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
      for (const recording of exportRecordings()) {
        const key = `${currentVersion}/${recording.name}`;
        const stat = module.FS.stat(`/data/recording/${recording.name}`);
        const signature = `${stat.size}/${+stat.mtime}`;
        if (persisted.get(key) === signature) continue;
        const previous = byKey.get(key);
        const nextTotal = total - (previous?.bytes.byteLength || 0) + recording.bytes.length;
        if ((!previous && byKey.size >= 20) || nextTotal > RECORDING_STORAGE_LIMIT) {
          throw new Error('Local recording storage limit (20 recordings / 32 MiB) reached; existing saved recordings have been preserved');
        }
        const entry = { key, version: String(currentVersion), name: recording.name, bytes: recording.bytes.slice().buffer, savedAt: Date.now() };
        await storeRequest(recordingStore, 'put', entry);
        byKey.set(key, entry); total = nextTotal; persisted.set(key, signature); count++;
      }
      return { saved: count, available: true };
    } finally { persistenceBusy = false; }
  }
  async function getSavedRecordings({ allVersions = false } = {}) {
    if (!recordingStore) return [];
    const stored = await storeRequest(recordingStore, 'getAll');
    return stored.filter(entry => allVersions || entry.version === String(currentVersion)).map(entry => ({ name: entry.name, version: entry.version, savedAt: entry.savedAt, bytes: new Uint8Array(entry.bytes) }));
  }
  function getState() { return { ...snapshot, fighters: (snapshot.fighters || []).map(fighter => ({ ...fighter })), loaded, loading, failed, replayAvailable: !!recordingKey, networkSupported: false, persistence: { ...persistence } }; }
  function sendKey(code, pressed = true) {
    if (!loaded || failed) throw new Error('The engine is not ready for input.');
    const aliases = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', enter: 'Enter', escape: 'Escape', space: 'Space' };
    const physical = aliases[String(code).toLowerCase()] || (/^[a-z]$/i.test(String(code)) ? `Key${String(code).toUpperCase()}` : /^[0-9]$/.test(String(code)) ? `Digit${code}` : String(code));
    let key, keyCode, location = 0;
    if (/^Key[A-Z]$/.test(physical)) { key = physical.slice(3).toLowerCase(); keyCode = physical.charCodeAt(3); }
    else if (/^Digit[0-9]$/.test(physical)) { key = physical.slice(5); keyCode = physical.charCodeAt(5); }
    else if (/^Numpad[0-9]$/.test(physical)) { key = physical.slice(6); keyCode = 96 + Number(key); location = 3; }
    else if (/^F([1-9]|1[0-2])$/.test(physical)) { key = physical; keyCode = 111 + Number(physical.slice(1)); }
    else {
      const specials = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27, Space: 32, Tab: 9 };
      if (!(physical in specials)) throw new Error(`Unsupported physical key: ${code}`);
      key = physical === 'Space' ? ' ' : physical; keyCode = specials[physical];
    }
    canvas.focus({ preventScroll: true });
    // SDL's Emscripten callback reads KeyboardEvent.code/location/keyCode.
    // Bubbling from its actual canvas reaches document/window listeners too.
    const event = new KeyboardEvent(pressed ? 'keydown' : 'keyup', { key, code: physical, keyCode, which: keyCode, location, bubbles: true, cancelable: true });
    canvas.dispatchEvent(event);
    if (pressed) heldKeys.add(physical); else heldKeys.delete(physical);
    return { code: physical, pressed, dispatched: true };
  }
  function releaseKeys() {
    const keys = [...heldKeys];
    for (const code of keys) {
      try { sendKey(code, false); } catch { /* An unsupported physical key was never bridged. */ }
      heldKeys.delete(code);
    }
    return keys.length;
  }
  async function tapKey(code, duration = 90) {
    if (!Number.isFinite(duration) || duration < 40 || duration > 2000) throw new Error('Key tap duration must be between 40 and 2000 ms.');
    sendKey(code, true);
    await new Promise(resolve => setTimeout(resolve, duration));
    sendKey(code, false);
  }
  // Track real keyboard holds as well as synthetic controls. Every keyup still
  // bubbles through SDL's listener chain before returning focus to the page.
  canvas.addEventListener('keydown', event => { if (event.code) heldKeys.add(event.code); });
  window.addEventListener('keyup', event => heldKeys.delete(event.code), true);
  window.addEventListener('blur', releaseKeys);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { releaseKeys(); persistRecordings().catch(warnStorage); }
  });
  window.addEventListener('pagehide', () => { releaseKeys(); persistRecordings().catch(warnStorage); });
  return { load, importReplay, exportRecordings, getState, sendKey, tapKey, releaseKeys, persistRecordings, getSavedRecordings };
}
