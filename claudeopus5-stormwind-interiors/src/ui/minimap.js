// 小地图:静态底图(城墙 / 运河 / 街道 / 建筑基底)预渲染一次,每帧只贴图 + 画一个朝向箭头。
import { CITY, CANALS, LANES } from '../world/plan.js';

const RANGE = 215;   // 地图半径(米)

export function createMinimap(canvas, plan) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const base = document.createElement('canvas');
  base.width = base.height = S;
  const b = base.getContext('2d');

  const toX = (x) => (x / RANGE) * (S / 2) + S / 2;
  const toY = (z) => (z / RANGE) * (S / 2) + S / 2;

  // 底图
  b.clearRect(0, 0, S, S);
  b.fillStyle = '#141a26';
  b.beginPath();
  CITY.wall.forEach(([x, z], i) => (i ? b.lineTo(toX(x), toY(z)) : b.moveTo(toX(x), toY(z))));
  b.closePath();
  b.fill();
  b.strokeStyle = '#6e7a92';
  b.lineWidth = 2.4;
  b.stroke();

  b.fillStyle = '#2d3a4e';
  for (const l of LANES) {
    const x0 = Math.min(l.a[0], l.b[0]) - l.w / 2, x1 = Math.max(l.a[0], l.b[0]) + l.w / 2;
    const z0 = Math.min(l.a[1], l.b[1]) - l.w / 2, z1 = Math.max(l.a[1], l.b[1]) + l.w / 2;
    b.fillRect(toX(x0), toY(z0), toX(x1) - toX(x0), toY(z1) - toY(z0));
  }

  b.fillStyle = '#1d4a63';
  for (const c of CANALS) b.fillRect(toX(c[0]), toY(c[1]), toX(c[2]) - toX(c[0]), toY(c[3]) - toY(c[1]));

  b.fillStyle = '#7d8598';
  for (const p of plan.plots) {
    const r = p.rect;
    b.fillRect(toX(r[0]), toY(r[1]), Math.max(1.5, toX(r[2]) - toX(r[0])), Math.max(1.5, toY(r[3]) - toY(r[1])));
  }

  // 地标
  const marks = [
    { x: 0, z: 80, c: '#e8c877', r: 4 },
    { x: CITY.cathedral.x, z: CITY.cathedral.z, c: '#8fd4e8', r: 5 },
    { x: 0, z: -150, c: '#e88f8f', r: 6 },
  ];
  for (const m of marks) {
    b.fillStyle = m.c;
    b.beginPath();
    b.arc(toX(m.x), toY(m.z), m.r, 0, 6.283);
    b.fill();
  }
  // 指北
  b.fillStyle = '#9aa6bd';
  b.font = '10px Consolas, monospace';
  b.fillText('N', S / 2 - 4, 13);

  return {
    update(pos, yaw) {
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(base, 0, 0);
      const px = toX(pos.x), py = toY(pos.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-yaw);   // yaw=0 面向 -Z(地图上方)
      ctx.fillStyle = '#ffd97a';
      ctx.strokeStyle = '#1a1206';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
  };
}
