// Menu-only adaptation of OpenLF2's MIT-licensed Lua scripts. DAT bytes are never written.
const originals = new WeakMap();
const decoder = new TextDecoder('utf-8');
const key = new TextEncoder().encode('SiuHungIsAGoodBearBecauseHeIsVeryGood');

export function normalizeKatePath(path) {
  const value = String(path).replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
  if (!value || /[^\x20-\x7e]|:/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new Error(`Unsupported Kate resource path: ${path}`);
  }
  return value;
}

export function decodeKateDat(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (source.length < 123 || (source[0] === 77 && source[1] === 90)) throw new Error('Not an LF2 DAT resource');
  const result = new Uint8Array(source.length - 123);
  for (let i = 123; i < source.length; i++) result[i - 123] = (source[i] - key[i % key.length] + 256) & 255;
  return result;
}

export function inspectKateCatalog(files) {
  const records = Array.isArray(files) ? files : Object.entries(files ?? {}).map(([path, bytes]) => ({path, bytes}));
  const map = new Map(records.map(f => [normalizeKatePath(f.path), f.bytes]));
  const find = suffix => [...map].find(([path]) => path === suffix || path.endsWith('/' + suffix));
  const listing = find('data/data.txt');
  const stage = find('data/stage.dat');
  if (!listing || !stage) throw new Error('Kate package must include data/data.txt and data/stage.dat');
  const text = decoder.decode(listing[1]).replace(/#[^\r\n]*/g, '');
  const objectSection = text.match(/<object>([\s\S]*?)<object_end>/)?.[1];
  const backgroundSection = text.match(/<background>([\s\S]*?)<background_end>/)?.[1];
  if (objectSection == null || backgroundSection == null) throw new Error('Invalid Kate catalog');
  const objects = [...objectSection.matchAll(/id:\s*(\d+)\s+type:\s*(\d+)\s+file:\s*(\S+)/g)].map(m => ({id:+m[1], type:+m[2], path:normalizeKatePath(m[3])}));
  const backgrounds = [...backgroundSection.matchAll(/id:\s*(\d+)\s+file:\s*(\S+)/g)].map(m => ({id:+m[1], path:normalizeKatePath(m[2])}));
  const stageText = decoder.decode(decodeKateDat(stage[1])).replace(/#[^\r\n]*/g, '');
  const stageIds = [...stageText.matchAll(/<stage>\s*id:\s*(\d+)/g)].map(m => +m[1]).sort((a,b) => a-b);
  if (!stageIds.length) throw new Error('Kate stage catalog is empty');
  return {objects, fighters:objects.filter(o => o.type === 0), backgrounds, stageIds:[...new Set(stageIds)]};
}

function resolveScript(FS, suffix) {
  for (const prefix of ['/scripts/', '/assets/scripts/', '/app/scripts/', '/']) {
    const path = prefix + suffix;
    try { const text = FS.readFile(path, {encoding:'utf8'}); if (typeof text === 'string') return {path,text}; } catch {}
  }
  throw new Error(`OpenLF2 Lua script not mounted: ${suffix}`);
}

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`OpenLF2 source mismatch: ${label}`);
  return source.replace(before, after);
}

/** Run after mounting original Lua and Kate resources, before Lua modules are required.
 * files is the original [{path,bytes}] resource list (or path->Uint8Array map).
 * Returns menu adaptation metadata. Does not edit any character/state/resource data.
 */
export function patchKateScripts(FS, {version, files}) {
  const catalog = inspectKateCatalog(files);
  let cache = originals.get(FS);
  if (!cache) { cache = new Map(); originals.set(FS, cache); }
  const staged = [];
  function edit(suffix, transform) {
    const {path,text} = resolveScript(FS, suffix);
    if (!cache.has(path)) cache.set(path, text.replaceAll('\r\n', '\n'));
    const patched = transform(cache.get(path));
    staged.push({path, text:patched});
  }
  edit('base/game/catalog.lua', source => replaceRequired(source,
    'hidden = family == 3 or family == 5', 'hidden = false', 'fighter visibility'));
  edit('base/ui/character_select.lua', source => {
    source = replaceRequired(source,
      'fighter.record >= 1 and fighter.id < constants.record_id_ranges.random_fighter_end_exclusive',
      'fighter.id > 0 and catalog.selectable(fighter)', 'random fighter catalog');
    source = replaceRequired(source, 'local idle_countdown = 150',
      `local idle_countdown = 150\n-- Kate: only actual stage records, including sub-stages, are offered.\nlocal kate_stage_ids = {${catalog.stageIds.join(', ')}}`, 'stage list insertion');
    source = replaceRequired(source, 'options.stage_level = options.stage_level - options.stage_level % 10',
      '-- Kate: retain the selected concrete stage id', 'stage rounding');
    source = replaceRequired(source,
      'if level < 5 then text(state, tostring(level + 1), 194, 91, option_blue)\n        else text(state, "Survival", 174, 91, option_blue) end',
      'text(state, tostring(options.stage_level), 194, 91, option_blue)', 'stage label');
    source = replaceRequired(source, 'options.stage_level = (options.stage_level + 10) % 60',
      'local next_stage = kate_stage_ids[1]\n            for i, id in ipairs(kate_stage_ids) do\n                if id == options.stage_level then next_stage = kate_stage_ids[i % #kate_stage_ids + 1]; break end\n            end\n            options.stage_level = next_stage', 'stage selection');
    return source;
  });
  // Validate every replacement before committing any Lua writes.
  for (const {path,text} of staged) FS.writeFile(path,text,{encoding:'utf8'});
  return {version, patched:staged.map(s => s.path), fighterCount:catalog.fighters.length,
    backgroundCount:catalog.backgrounds.length, stageIds:catalog.stageIds,
    diagnostics:['Menu patches preserve gameplay IDs and do not write DAT resources.',
      ...(catalog.stageIds.some(id => id >= 50) ? [] : ['This package has no survival stage record (50–59).']),
      'Eight participant slots are preserved; the character catalog has no original-ID selection limit.',
      'Map selection remains catalog-driven; built-in Lee On Road and Random entries are preserved.']};
}
