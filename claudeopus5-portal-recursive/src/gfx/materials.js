// 程序化 canvas 纹理与材质 —— 零外部资产。
// 纹理按世界尺度平铺(每 2m 一格),UV 在合并几何时按面的真实大小生成,因此不需要为每块墙克隆材质。
import * as THREE from 'three';

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function grain(ctx, size, amount, seed = 7) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount * 255;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function tex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 白色测试面板:两道细缝分成四格,四角有装配孔
function whiteCanvas() {
  const S = 256;
  const [c, g] = makeCanvas(S);
  g.fillStyle = '#e2e6e4';
  g.fillRect(0, 0, S, S);
  for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128]]) {
    const grad = g.createLinearGradient(x, y, x + 128, y + 128);
    grad.addColorStop(0, '#eef2f0');
    grad.addColorStop(1, '#d3d8d5');
    g.fillStyle = grad;
    g.fillRect(x + 3, y + 3, 122, 122);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1.5;
    g.strokeRect(x + 4, y + 4, 120, 120);
    g.fillStyle = 'rgba(120,132,128,0.55)';
    for (const [ox, oy] of [[14, 14], [110, 14], [14, 110], [110, 110]]) {
      g.beginPath();
      g.arc(x + ox, y + oy, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.strokeStyle = '#a6ada9';
  g.lineWidth = 3;
  g.strokeRect(0.5, 0.5, S - 1, S - 1);
  g.beginPath();
  g.moveTo(128, 0); g.lineTo(128, S);
  g.moveTo(0, 128); g.lineTo(S, 128);
  g.stroke();
  grain(g, S, 0.025, 11);
  return c;
}

// 深色装甲板:不可开门
function darkCanvas() {
  const S = 256;
  const [c, g] = makeCanvas(S);
  g.fillStyle = '#3b4045';
  g.fillRect(0, 0, S, S);
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#464c52');
  grad.addColorStop(1, '#33383d');
  g.fillStyle = grad;
  g.fillRect(4, 4, S - 8, S - 8);
  g.strokeStyle = '#23272b';
  g.lineWidth = 5;
  g.strokeRect(2.5, 2.5, S - 5, S - 5);
  g.fillStyle = '#2b2f33';
  for (const [x, y] of [[22, 22], [234, 22], [22, 234], [234, 234]]) {
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(120,140,160,0.09)';
  g.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(0, i * 64); g.lineTo(S, i * 64);
    g.stroke();
  }
  grain(g, S, 0.035, 23);
  return c;
}

function floorCanvas() {
  const S = 256;
  const [c, g] = makeCanvas(S);
  g.fillStyle = '#8e9396';
  g.fillRect(0, 0, S, S);
  const grad = g.createRadialGradient(128, 128, 16, 128, 128, 190);
  grad.addColorStop(0, '#989ea1');
  grad.addColorStop(1, '#7f8588');
  g.fillStyle = grad;
  g.fillRect(3, 3, S - 6, S - 6);
  g.strokeStyle = '#666c6f';
  g.lineWidth = 4;
  g.strokeRect(2, 2, S - 4, S - 4);
  grain(g, S, 0.05, 5);
  return c;
}

function ceilCanvas() {
  const S = 256;
  const [c, g] = makeCanvas(S);
  g.fillStyle = '#4e5357';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#3d4246';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 64, 0); g.lineTo(i * 64, S);
    g.moveTo(0, i * 64); g.lineTo(S, i * 64);
    g.stroke();
  }
  grain(g, S, 0.03, 31);
  return c;
}

/** 测试室编号招牌 */
export function signTexture(num, total, name) {
  const S = 512;
  const [c, g] = makeCanvas(S);
  g.fillStyle = '#eceeec';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#2f3336';
  g.lineWidth = 12;
  g.strokeRect(12, 12, S - 24, S - 24);
  g.fillStyle = '#22262a';
  g.font = '900 200px "Segoe UI", Arial, sans-serif';
  g.textBaseline = 'top';
  g.fillText(String(num).padStart(2, '0'), 46, 44);
  g.font = '600 62px "Segoe UI", Arial, sans-serif';
  g.fillStyle = '#767c80';
  g.fillText('/ ' + String(total).padStart(2, '0'), 330, 160);
  g.fillStyle = '#2f3336';
  g.fillRect(46, 276, S - 92, 7);
  g.font = '700 74px "Microsoft YaHei", "PingFang SC", sans-serif';
  g.fillText(name, 46, 318);
  g.font = '400 46px "Segoe UI Symbol", sans-serif';
  g.fillStyle = '#8a9095';
  g.fillText('◉  ▣  ⇵  ◬', 48, 424);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildMaterials() {
  const mk = (canvas, opts) => new THREE.MeshStandardMaterial({ map: tex(canvas), ...opts });
  return {
    white: mk(whiteCanvas(), { roughness: 0.78, metalness: 0.06 }),
    dark: mk(darkCanvas(), { roughness: 0.62, metalness: 0.42 }),
    floor: mk(floorCanvas(), { roughness: 0.93, metalness: 0.04 }),
    ceil: mk(ceilCanvas(), { roughness: 0.88, metalness: 0.14 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8f979c, roughness: 0.35, metalness: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x9fc8d4, roughness: 0.06, metalness: 0,
      transparent: true, opacity: 0.22, side: THREE.DoubleSide,
      transmission: 0, // 保持廉价:多遍渲染下不用 transmission
    }),
  };
}
