// 程序化 canvas 纹理与共享材质 — 零外部资产
import * as THREE from 'three';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function noise(ctx, size, alpha) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * alpha * 255;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function tex(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 白色测试面板(可放置传送门):浅灰方格板 + 细缝
export function whitePanelTexture() {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#dfe3e2';
  g.fillRect(0, 0, S, S);
  // 2×2 面板,细缝 + 内侧高光/阴影模拟倒角
  for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128]]) {
    const grad = g.createLinearGradient(x, y, x + 128, y + 128);
    grad.addColorStop(0, '#e9edec');
    grad.addColorStop(1, '#d2d7d6');
    g.fillStyle = grad;
    g.fillRect(x + 2, y + 2, 124, 124);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.strokeRect(x + 3.5, y + 3.5, 121, 121);
  }
  g.strokeStyle = '#9aa0a0';
  g.lineWidth = 2;
  g.strokeRect(0, 0, S, S);
  g.beginPath();
  g.moveTo(128, 0); g.lineTo(128, S);
  g.moveTo(0, 128); g.lineTo(S, 128);
  g.stroke();
  noise(g, S, 0.03);
  return c;
}

// 深色金属面板(不可放置)
export function darkPanelTexture() {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#41464b';
  g.fillRect(0, 0, S, S);
  for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128]]) {
    const grad = g.createLinearGradient(x, y, x, y + 128);
    grad.addColorStop(0, '#4a5055');
    grad.addColorStop(1, '#383d42');
    g.fillStyle = grad;
    g.fillRect(x + 2, y + 2, 124, 124);
    // 四角铆钉
    g.fillStyle = '#2c3034';
    for (const [rx, ry] of [[12, 12], [116, 12], [12, 116], [116, 116]]) {
      g.beginPath();
      g.arc(x + rx, y + ry, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.strokeStyle = '#26292c';
  g.lineWidth = 3;
  g.strokeRect(0, 0, S, S);
  g.beginPath();
  g.moveTo(128, 0); g.lineTo(128, S);
  g.moveTo(0, 128); g.lineTo(S, 128);
  g.stroke();
  noise(g, S, 0.04);
  return c;
}

// 地面混凝土大板
export function floorTexture() {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#8f9496';
  g.fillRect(0, 0, S, S);
  const grad = g.createRadialGradient(128, 128, 20, 128, 128, 180);
  grad.addColorStop(0, '#999ea0');
  grad.addColorStop(1, '#84898b');
  g.fillStyle = grad;
  g.fillRect(2, 2, 252, 252);
  g.strokeStyle = '#6b7072';
  g.lineWidth = 3;
  g.strokeRect(0, 0, S, S);
  noise(g, S, 0.06);
  return c;
}

// 天花板
export function ceilTexture() {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#565b5e';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#43474a';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 64, 0); g.lineTo(i * 64, S);
    g.moveTo(0, i * 64); g.lineTo(S, i * 64);
    g.stroke();
  }
  noise(g, S, 0.04);
  return c;
}

// 测试室编号招牌(仿 Aperture 风)
export function signTexture(num, total, name) {
  const S = 512;
  const [c, g] = canvas(S);
  g.fillStyle = '#e8eae9';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#3c4043';
  g.lineWidth = 10;
  g.strokeRect(10, 10, S - 20, S - 20);
  g.fillStyle = '#26282a';
  g.font = '900 190px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText(String(num).padStart(2, '0'), 42, 46);
  g.font = '600 64px "Segoe UI", Arial, sans-serif';
  g.fillText(`/ ${String(total).padStart(2, '0')}`, 320, 150);
  g.fillStyle = '#3c4043';
  g.fillRect(42, 268, S - 84, 6);
  g.font = '700 72px "Microsoft YaHei", "PingFang SC", sans-serif';
  g.fillText(name, 42, 310);
  // 底部图标条(致敬原作的象形图)
  g.font = '400 52px "Segoe UI Symbol", sans-serif';
  g.fillStyle = '#7a7f82';
  g.fillText('◉ ▣ ⇵ ⚠ ◬', 42, 412);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 材质库:mat 名称 → three 材质(可共享;世界构建时按尺寸克隆并调 repeat)
export function buildMaterials() {
  const white = new THREE.MeshStandardMaterial({
    map: tex(whitePanelTexture()), roughness: 0.82, metalness: 0.05,
  });
  const dark = new THREE.MeshStandardMaterial({
    map: tex(darkPanelTexture()), roughness: 0.6, metalness: 0.45,
  });
  const floor = new THREE.MeshStandardMaterial({
    map: tex(floorTexture()), roughness: 0.95, metalness: 0.02,
  });
  const ceil = new THREE.MeshStandardMaterial({
    map: tex(ceilTexture()), roughness: 0.9, metalness: 0.1,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fc4cf, roughness: 0.1, metalness: 0.3,
    transparent: true, opacity: 0.28, side: THREE.DoubleSide,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x5d6468, roughness: 0.4, metalness: 0.8,
  });
  return { white, dark, floor, ceil, glass, metal };
}
