// 存档:IndexedDB(worlds 存世界元数据,chunks 存被改动过的区块记录)。不可用时退化为内存存档。
const HI = String.fromCharCode(0xffff);
const DB_NAME = 'boundless-frontier', VER = 1;
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const rq = indexedDB.open(DB_NAME, VER);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains('worlds')) d.createObjectStore('worlds', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('chunks')) d.createObjectStore('chunks');
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch { res(null); }
  });
  return dbp;
}
const memWorlds = new Map(), memChunks = new Map();
const reqP = rq => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });

export async function listWorlds() {
  const d = await db();
  if (!d) return [...memWorlds.values()];
  const all = await reqP(d.transaction('worlds').objectStore('worlds').getAll());
  return all.sort((a, b) => (b.played || 0) - (a.played || 0));
}
export async function getWorld(id) {
  const d = await db();
  if (!d) return memWorlds.get(id) || null;
  return (await reqP(d.transaction('worlds').objectStore('worlds').get(id))) || null;
}
export async function putWorld(meta) {
  const d = await db();
  if (!d) { memWorlds.set(meta.id, structuredClone(meta)); return; }
  const tx = d.transaction('worlds', 'readwrite');
  tx.objectStore('worlds').put(meta);
  await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
}
export async function deleteWorld(id) {
  const d = await db();
  if (!d) { memWorlds.delete(id); for (const k of [...memChunks.keys()]) if (k.startsWith(id + ':')) memChunks.delete(k); return; }
  const tx = d.transaction(['worlds', 'chunks'], 'readwrite');
  tx.objectStore('worlds').delete(id);
  tx.objectStore('chunks').delete(IDBKeyRange.bound(id + ':', id + ':' + HI));
  await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
}

// 区块存储:载入世界时一次性读入内存;运行期读写内存,定期把脏记录批量写回
export class ChunkStore {
  constructor(worldId) { this.id = worldId; this.map = new Map(); this.dirty = new Set(); }
  async load() {
    const d = await db();
    if (!d) { for (const [k, v] of memChunks) if (k.startsWith(this.id + ':')) this.map.set(+k.slice(this.id.length + 1), v); return; }
    const st = d.transaction('chunks').objectStore('chunks');
    const range = IDBKeyRange.bound(this.id + ':', this.id + ':' + HI);
    const [keys, vals] = await Promise.all([reqP(st.getAllKeys(range)), reqP(st.getAll(range))]);
    keys.forEach((k, i) => this.map.set(+String(k).slice(this.id.length + 1), vals[i]));
  }
  get(k) { return this.map.get(k); }
  has(k) { return this.map.has(k); }
  put(k, rec) { this.map.set(k, rec); this.dirty.add(k); }
  get size() { return this.map.size; }
  async flush() {
    if (!this.dirty.size) return;
    const keys = [...this.dirty]; this.dirty.clear();
    const d = await db();
    if (!d) { for (const k of keys) memChunks.set(this.id + ':' + k, this.map.get(k)); return; }
    const tx = d.transaction('chunks', 'readwrite'), st = tx.objectStore('chunks');
    for (const k of keys) st.put(this.map.get(k), this.id + ':' + k);
    await new Promise(r => { tx.oncomplete = r; tx.onerror = r; });
  }
}
