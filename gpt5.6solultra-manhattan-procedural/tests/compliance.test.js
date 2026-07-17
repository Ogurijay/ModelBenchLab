import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const forbiddenBinary = new Set([
  '.glb', '.gltf', '.fbx', '.obj', '.stl', '.hdr', '.exr',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.wav', '.ogg', '.mp4',
]);

function walk(directory, output = []) {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'docs') continue;
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) walk(absolute, output);
    else output.push(absolute);
  }
  return output;
}

describe('零外部资产合规守门', () => {
  it('业务产物不含被禁止的二进制资产', () => {
    const violations = walk(projectRoot)
      .filter((file) => forbiddenBinary.has(extname(file).toLowerCase()))
      .map((file) => relative(projectRoot, file));
    expect(violations).toEqual([]);
  });

  it('src 不发起外部网络请求或加载二进制模型', () => {
    const sources = walk(join(projectRoot, 'src'))
      .filter((file) => /\.(?:js|ts)$/.test(file))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(sources).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(|GLTFLoader|TextureLoader|AudioLoader/);
    expect(sources).not.toMatch(/https?:\/\//);
  });
});
