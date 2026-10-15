// 从 src/world/coords.js 生成俯视平面图 plan/floorplan.svg（和 3D 场景同一份数据）。
// 用法：node tools/floorplan.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../src/world/coords.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [bx0, bz0, bx1, bz1] = [-340, -420, 440, 300];
const S = 1.6; // px / m
const W = (bx1 - bx0) * S;
const H = (bz1 - bz0) * S;
const X = (x) => ((x - bx0) * S).toFixed(1);
const Z = (z) => ((z - bz0) * S).toFixed(1);
const pts = (poly) => poly.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ');
const rectEl = (r, attrs) => `<rect x="${X(r[0])}" y="${Z(r[1])}" width="${((r[2] - r[0]) * S).toFixed(1)}" height="${((r[3] - r[1]) * S).toFixed(1)}" ${attrs}/>`;
const text = (x, z, s, size = 13, extra = '') => `<text x="${X(x)}" y="${Z(z)}" font-size="${size}" text-anchor="middle" ${extra}>${s}</text>`;

const COLORS = { trade: '#e8d9b5', mage: '#d9c8ec', oldtown: '#d6cfc4', cathedral: '#f1ede2', dwarven: '#c9bcae', keep: '#cfd8e6', park: '#bfe0a8', harbor: '#d8c39a' };
const LOT_COLORS = { trade: '#b88a4a', mage: '#7d5aa6', oldtown: '#8a7e70', cathedral: '#9aa3b5', dwarven: '#6e5a48' };

const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Microsoft YaHei, system-ui, sans-serif">`);
out.push(`<rect width="100%" height="100%" fill="#8fae6f"/>`); // 城外艾尔文
out.push(rectEl(C.SEA_RECT, 'fill="#3d7fa8"'));
out.push(`<polygon points="${pts(C.WATER_POLY)}" fill="#4a9cc0"/>`);

// 英雄谷盆地
const vq = [C.valleyToWorld(-C.VALLEY.halfWidth, 0), C.valleyToWorld(C.VALLEY.halfWidth, 0), C.valleyToWorld(C.VALLEY.halfWidth, C.VALLEY.gateZ), C.valleyToWorld(-C.VALLEY.halfWidth, C.VALLEY.gateZ)];
out.push(`<polygon points="${pts(vq)}" fill="#6d9a52"/>`);

for (const [key, d] of Object.entries(C.DISTRICTS)) {
  out.push(`<polygon points="${pts(d.poly)}" fill="${COLORS[d.style]}" stroke="#7a7466" stroke-width="1.5"/>`);
  if (d.plaza) out.push(rectEl(d.plaza.rect, 'fill="#f6efd8" stroke="#b5a880" stroke-dasharray="4 3"'));
  if (d.stairs) out.push(rectEl(d.stairs.rect, 'fill="#bbb" stroke="#555"'));
  for (const p of d.piers || []) out.push(rectEl([p.x - p.w / 2, p.z1, p.x + p.w / 2, p.z0], 'fill="#9b7a4c"'));
}

// 主桥（斜向）
const bA = C.valleyToWorld(0, C.VALLEY.bridge.from);
const bB = C.valleyToWorld(0, C.VALLEY.bridge.to);
out.push(`<line x1="${X(bA[0])}" y1="${Z(bA[1])}" x2="${X(bB[0])}" y2="${Z(bB[1])}" stroke="#ddd6c4" stroke-width="${C.VALLEY.bridge.width * S}"/>`);
for (const s of C.VALLEY.statues) {
  const [x, z] = C.valleyToWorld(s.lx, s.lz);
  out.push(`<circle cx="${X(x)}" cy="${Z(z)}" r="5" fill="#fff" stroke="#555"/>`);
}
for (const b of C.BRIDGES) {
  out.push(`<line x1="${X(b.a[0])}" y1="${Z(b.a[1])}" x2="${X(b.b[0])}" y2="${Z(b.b[1])}" stroke="#d9d2bf" stroke-width="${b.w * S}"/>`);
}

for (const lot of C.LOTS) {
  const fill = LOT_COLORS[lot.style] || '#888';
  out.push(rectEl([lot.r[0] + 0.6, lot.r[1] + 0.6, lot.r[2] - 0.6, lot.r[3] - 0.6], `fill="${fill}" fill-opacity="${0.45 + lot.floors * 0.15}" stroke="${lot.named ? '#c00' : '#333'}" stroke-width="${lot.named ? 2 : 0.6}"`));
  // 门：临街面中点的小白条
  const [x0, z0, x1, z1] = lot.r;
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  const door = { N: [mx, z0], S: [mx, z1], W: [x0, mz], E: [x1, mz] }[lot.face];
  out.push(`<circle cx="${X(door[0])}" cy="${Z(door[1])}" r="2.2" fill="#fff"/>`);
  if (lot.named) out.push(text(mx, mz + 1, lot.named, 10, 'fill="#600"'));
}

// 城墙
out.push(`<polygon points="${pts(C.WALL_POLY)}" fill="none" stroke="#f4f1ea" stroke-width="${C.WALL.thickness * S}" stroke-linejoin="round"/>`);
out.push(`<polygon points="${pts(C.WALL_POLY)}" fill="none" stroke="#6f6a60" stroke-width="1"/>`);
for (const [x, z] of C.WALL_POLY) out.push(`<circle cx="${X(x)}" cy="${Z(z)}" r="${7 * S}" fill="#f4f1ea" stroke="#3b5ba5" stroke-width="2.5"/>`);
out.push(`<circle cx="${X(C.GATE.center[0])}" cy="${Z(C.GATE.center[1])}" r="9" fill="#c9a227"/>`);
out.push(text(C.GATE.center[0] + 22, C.GATE.center[1] + 14, '暴风城大门', 13, 'font-weight="bold"'));
out.push(rectEl([C.HARBOR_TUNNEL.x - 4, -266, C.HARBOR_TUNNEL.x + 4, -258], 'fill="#333"'));

for (const l of C.LAMPS) out.push(`<circle cx="${X(l.x)}" cy="${Z(l.z)}" r="1.8" fill="#ffcf4a"/>`);

// 地标
const L = C.LANDMARKS;
const lmRect = (c, size, fill) => rectEl([c[0] - size[0] / 2, c[1] - size[1] / 2, c[0] + size[0] / 2, c[1] + size[1] / 2], `fill="${fill}" stroke="#222" stroke-width="1.5"`);
out.push(lmRect(L.cathedral.center, L.cathedral.size, '#fafafa'));
out.push(lmRect(L.keep.center, L.keep.size, '#e6ecf5'));
out.push(rectEl(L.keep.courtyard, 'fill="none" stroke="#3b5ba5" stroke-dasharray="6 4"'));
out.push(`<circle cx="${X(L.sanctum.center[0])}" cy="${Z(L.sanctum.center[1])}" r="${L.sanctum.radius * S}" fill="#8e5bd0" stroke="#222"/>`);
out.push(`<circle cx="${X(L.fountain.center[0])}" cy="${Z(L.fountain.center[1])}" r="${L.fountain.radius * S}" fill="#5fb2d6" stroke="#555"/>`);
out.push(`<circle cx="${X(L.cathedralStatue.center[0])}" cy="${Z(L.cathedralStatue.center[1])}" r="${L.cathedralStatue.radius * S}" fill="#5fb2d6" stroke="#555"/>`);
out.push(lmRect(L.greatForge.center, L.greatForge.size, '#a0522d'));
out.push(lmRect(L.tram.center, L.tram.size, '#444'));
out.push(`<circle cx="${X(L.lionsMemorial.center[0])}" cy="${Z(L.lionsMemorial.center[1])}" r="6" fill="#c9a227"/>`);

// 标注
for (const [, d] of Object.entries(C.DISTRICTS)) {
  const xs = d.poly.map((p) => p[0]);
  const zs = d.poly.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = Math.min(...zs) + 14;
  out.push(text(cx, cz, d.name, 18, 'font-weight="bold" fill="#222" stroke="#fff" stroke-width="3" paint-order="stroke"'));
}
const vc = C.valleyToWorld(0, 90);
out.push(text(vc[0] + 36, vc[1] - 6, '英雄谷', 18, 'font-weight="bold" fill="#222" stroke="#fff" stroke-width="3" paint-order="stroke"'));
for (const [k, lab] of [['cathedral', '光明大教堂'], ['keep', '王座厅'], ['sanctum', '巫师圣所'], ['greatForge', '大熔炉'], ['tram', '矿道地铁'], ['lionsMemorial', '纪念碑']]) {
  const c = L[k].center;
  out.push(text(c[0], c[1] + 4, lab, 12, 'fill="#111" stroke="#fff" stroke-width="2.5" paint-order="stroke"'));
}

// 比例尺 + 指北
out.push(`<line x1="40" y1="${H - 40}" x2="${40 + 100 * S}" y2="${H - 40}" stroke="#000" stroke-width="3"/>`);
out.push(`<text x="40" y="${H - 48}" font-size="13">100 m</text>`);
out.push(`<text x="${W - 50}" y="50" font-size="22" font-weight="bold" text-anchor="middle">N ↑</text>`);
const named = C.LOTS.filter((l) => l.named).length;
out.push(`<text x="40" y="34" font-size="15" font-weight="bold">暴风城平面图（coords.js 生成）· 可进入建筑地块 ${C.LOTS.length} 个（命名 ${named}）· 桥 ${C.BRIDGES.length + 1} 座 · 路灯 ${C.LAMPS.length} 盏</text>`);
out.push('</svg>');

fs.mkdirSync(path.join(root, 'plan'), { recursive: true });
fs.writeFileSync(path.join(root, 'plan', 'floorplan.svg'), out.join('\n'));
const byDistrict = {};
for (const l of C.LOTS) byDistrict[l.district] = (byDistrict[l.district] || 0) + 1;
console.log('plan/floorplan.svg 已生成', { lots: C.LOTS.length, byDistrict, lamps: C.LAMPS.length, bridges: C.BRIDGES.length + 1 });
