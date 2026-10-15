// 命名建筑招牌：所有店名画进一张 Canvas 图集（1 个材质 = 1 个 drawcall），每块招牌用自己的 UV 取一格。
import * as THREE from 'three';

const COLS = 2;
const CW = 512;
const CH = 128;

export function createSigns(names) {
  const rows = Math.ceil(names.length / COLS);
  const c = document.createElement('canvas');
  c.width = CW * COLS;
  c.height = CH * Math.max(1, rows);
  const g = c.getContext('2d');
  const slot = new Map();
  names.forEach((name, i) => {
    const x = (i % COLS) * CW;
    const y = Math.floor(i / COLS) * CH;
    // 蓝底金边（暴风城配色），木纹暗边
    const grd = g.createLinearGradient(0, y, 0, y + CH);
    grd.addColorStop(0, '#2a4482');
    grd.addColorStop(1, '#16264f');
    g.fillStyle = grd;
    g.fillRect(x, y, CW, CH);
    g.strokeStyle = '#d8b24a';
    g.lineWidth = 7;
    g.strokeRect(x + 8, y + 8, CW - 16, CH - 16);
    g.lineWidth = 2;
    g.strokeRect(x + 17, y + 17, CW - 34, CH - 34);
    for (const s of [0, 1]) {
      g.fillStyle = '#d8b24a';
      g.beginPath();
      g.arc(x + (s ? CW - 34 : 34), y + CH / 2, 7, 0, Math.PI * 2);
      g.fill();
    }
    let fs = 70;
    const font = (n) => `bold ${n}px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "SimHei", sans-serif`;
    g.font = font(fs);
    while (g.measureText(name).width > CW - 110 && fs > 30) g.font = font((fs -= 4));
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillText(name, x + CW / 2 + 3, y + CH / 2 + 5);
    g.fillStyle = '#f6d77c';
    g.fillText(name, x + CW / 2, y + CH / 2 + 2);
    slot.set(name, [x / c.width, 1 - (y + CH) / c.height, (x + CW) / c.width, 1 - y / c.height]);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.1 });
  signMat.name = 'houseSigns';
  // 平面几何，UV 映射到图集里该店名那一格（宽高比 4:1 时字不变形）
  const signGeo = (name, w, h) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const [u0, v0, u1, v1] = slot.get(name) || [0, 0, 1, 1];
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    return geo;
  };
  return { signMat, signGeo };
}
