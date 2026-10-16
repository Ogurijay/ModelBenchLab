import manifest from '../../shared/assets/lf2-super/manifest.json';
import {decodeChunk} from './chunk-codec.js';
const assetFiles = import.meta.glob('../../shared/assets/lf2-super/**/*', {
  eager: true, query: '?url', import: 'default'
});

export {manifest};
export function assetURL(path) {
  const url = assetFiles[`../../shared/assets/lf2-super/${path}`];
  if (!url) throw new Error(`缺少本地资源：${path}`);
  return url;
}

/** Resource bytes are preserved; the index is checked before any engine file is mounted. */
export async function loadVersion(id, progress = () => {}) {
  const version = manifest.versions.find(v => v.id === id);
  if (!version) throw new Error(`未知版本：${id}`);
  if (typeof DecompressionStream !== 'function') throw new Error('此浏览器不支持游戏资源解压，请使用较新的内置浏览器。');
  const needed = [...new Set(version.files.map(f=>f.chunk))];
  const decoded = new Map();
  let completed = 0, next = 0;
  async function worker() {
    while (next < needed.length) {
      const index = needed[next++];
      const chunk = typeof index === 'number' ? manifest.chunks[index] : manifest.chunks.find(c=>c.path===index);
      if (!chunk) throw new Error(`缺少资源分块：${index}`);
      const response = await fetch(assetURL(chunk.path));
      if (!response.ok) throw new Error(`资源读取失败 (${response.status})：${chunk.path}`);
      const bytes = await decodeChunk(new Uint8Array(await response.arrayBuffer()),chunk);
      decoded.set(index, bytes);
      progress(++completed / needed.length);
    }
  }
  await Promise.all([worker(),worker()]);
  const files = version.files.map(file => {
    const data = decoded.get(file.chunk);
    if (!data || file.offset < 0 || file.offset + file.length > data.length || !/^[a-z0-9_./-]+$/.test(file.path) || file.path.split('/').includes('..')) throw new Error(`无效资源索引：${file.path}`);
    return {path: file.path, bytes: data.subarray(file.offset, file.offset + file.length)};
  });
  return {version, files};
}
