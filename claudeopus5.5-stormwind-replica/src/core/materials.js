// 材质库：全部贴图用 Canvas 现画（禁止外部资产），走 WoW 手绘风格化路线：
// 饱和、暖白石墙 + 钴蓝瓦顶 + 金饰，明暗靠贴图里画出来的体积感而不是复杂 PBR。
// 贴图 UV 以米计：tex(name, meters) 表示一张贴图覆盖多少米。
import * as THREE from 'three';
import { rngFor } from '../world/coords.js';

const PX = 512;

function canvasTex(name, meters, draw, { px = PX, color = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  draw(g, px, rngFor(`tex:${name}`));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / meters, 1 / meters);
  t.anisotropy = 16; // three 会按显卡上限钳制（R4：中远距离地面糊成一片、摩尔纹）
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.name = name;
  return t;
}

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// 低频色斑：手绘感的关键
function blotches(g, S, rng, n, h, s, l, spread = 8, alpha = 0.12) {
  for (let i = 0; i < n; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = S * (0.05 + rng() * 0.18);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, hsl(h, s, l + (rng() - 0.5) * spread, alpha));
    grd.addColorStop(1, hsl(h, s, l, 0));
    g.fillStyle = grd;
    // 无缝：在四个偏移位置各画一次
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) g.fillRect(x - r + ox, y - r + oy, r * 2, r * 2);
  }
}
function speckle(g, S, rng, n, color, size = 1.5) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(rng() * S, rng() * S, size, size);
}

// 石块墙：rows 行，每行若干块，块内带上亮下暗的体积感
function stoneBlocks(base, { rows = 6, perRow = 3, mortar = 4, sat = 12, light = 82, hue = 40, jitter = 6 }) {
  return (g, S, rng) => {
    g.fillStyle = hsl(hue, sat, light - 22);
    g.fillRect(0, 0, S, S);
    const rh = S / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (S / perRow / 2) + (rng() - 0.5) * 10;
      const bw = S / perRow;
      for (let k = -1; k <= perRow; k++) {
        const x = off + k * bw;
        const y = r * rh;
        const l = light + (rng() - 0.5) * jitter;
        const hj = hue + (rng() - 0.5) * 10; // 每块石头色相微差，打破复制感
        const grd = g.createLinearGradient(0, y, 0, y + rh);
        grd.addColorStop(0, hsl(hj, sat, l + 7));
        grd.addColorStop(0.55, hsl(hj, sat, l));
        grd.addColorStop(1, hsl(hj, sat, l - 12));
        g.fillStyle = grd;
        g.fillRect(x + mortar / 2, y + mortar / 2, bw - mortar, rh - mortar);
        // 高光边
        g.fillStyle = hsl(hue, sat, l + 10, 0.5);
        g.fillRect(x + mortar / 2, y + mortar / 2, bw - mortar, 2);
        // 风化斑
        if (rng() < 0.35) {
          g.fillStyle = hsl(hue, sat, l - 12, 0.18);
          g.beginPath();
          g.ellipse(x + rng() * bw, y + rng() * rh, 6 + rng() * 14, 3 + rng() * 6, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    blotches(g, S, rng, 10, hue, sat, light - 6, 10, 0.1);
    speckle(g, S, rng, 900, hsl(hue, sat, light - 30, 0.25));
    base?.(g, S, rng);
  };
}

// 鱼鳞 / 板瓦屋面
function roofTiles(hue, sat, light) {
  return (g, S, rng) => {
    g.fillStyle = hsl(hue, sat, light - 18);
    g.fillRect(0, 0, S, S);
    const rows = 10;
    const cols = 8;
    const rh = S / rows;
    const cw = S / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * cw * 0.5;
      for (let k = -1; k <= cols; k++) {
        const x = off + k * cw;
        const y = r * rh;
        const l = light + (rng() - 0.5) * 10;
        const grd = g.createLinearGradient(0, y, 0, y + rh * 1.2);
        grd.addColorStop(0, hsl(hue, sat, l - 10));
        grd.addColorStop(0.7, hsl(hue, sat + 5, l + 4));
        grd.addColorStop(1, hsl(hue, sat, l - 14));
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(x + 2, y);
        g.lineTo(x + cw - 2, y);
        g.lineTo(x + cw - 2, y + rh * 0.75);
        g.quadraticCurveTo(x + cw / 2, y + rh * 1.25, x + 2, y + rh * 0.75);
        g.closePath();
        g.fill();
        g.strokeStyle = hsl(hue, sat, l - 25, 0.6);
        g.lineWidth = 1.5;
        g.stroke();
      }
    }
    blotches(g, S, rng, 8, hue, sat, light, 12, 0.12);
  };
}

// 卵石路：抖动网格上的不重叠石块（Critic R1：旧版是互相重叠的椭圆斑块，贴地看像"一地圆饼"）。
// 同一套石块布局同时画进颜色图与高度图，高度图再转法线贴图，石缝有凹陷感。
function cobbleLayout(rng, S, n) {
  const c = S / n;
  const stones = [];
  for (let j = 0; j < n; j++) {
    const off = (j % 2) * c * 0.5;
    for (let i = 0; i < n; i++) {
      const w = c * (0.7 + rng() * 0.2);
      const h = c * (0.66 + rng() * 0.24);
      stones.push({
        x: off + i * c + (c - w) / 2 + (rng() - 0.5) * c * 0.08,
        y: j * c + (c - h) / 2 + (rng() - 0.5) * c * 0.08,
        w,
        h,
        r: Math.min(w, h) * (0.28 + rng() * 0.12),
        l: rng(),
        rot: (rng() - 0.5) * 0.35,
      });
    }
  }
  return stones;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function drawStones(g, S, stones, paint) {
  for (const st of stones) {
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const x = st.x + ox;
        const y = st.y + oy;
        if (x > S || y > S || x + st.w < 0 || y + st.h < 0) continue;
        g.save();
        g.translate(x + st.w / 2, y + st.h / 2);
        g.rotate(st.rot);
        g.translate(-st.w / 2, -st.h / 2);
        paint(g, st);
        g.restore();
      }
    }
  }
}
function cobble(hue, sat, light, n = 10) {
  return (g, S, rng) => {
    g.fillStyle = hsl(hue + 5, sat + 8, light - 24); // 石缝：偏褐的中灰（R2：纯黑灰缝像橡胶垫）
    g.fillRect(0, 0, S, S);
    drawStones(g, S, cobbleLayout(rng, S, n), (g, st) => {
      const l = light - 8 + st.l * 18;
      const hj = hue + (st.l - 0.5) * 14; // 每块石头色相微抖
      const grd = g.createLinearGradient(0, 0, st.w * 0.3, st.h);
      grd.addColorStop(0, hsl(hj, sat, l + 9));
      grd.addColorStop(0.55, hsl(hj, sat, l));
      grd.addColorStop(1, hsl(hj, sat, l - 12));
      g.fillStyle = grd;
      roundRect(g, 0, 0, st.w, st.h, st.r);
      g.fill();
      g.fillStyle = hsl(hue, sat, l + 14, 0.35); // 磨亮的顶面
      g.beginPath();
      g.ellipse(st.w * 0.42, st.h * 0.38, st.w * 0.22, st.h * 0.16, 0, 0, Math.PI * 2);
      g.fill();
    });
    speckle(g, S, rng, 700, hsl(hue, sat, light - 30, 0.25));
  };
}
// 与 cobble() 同一种子 → 同一布局的高度图
function cobbleHeight(seedName, n = 10) {
  return (g, S) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    drawStones(g, S, cobbleLayout(rngFor(`tex:${seedName}`), S, n), (g, st) => {
      const grd = g.createRadialGradient(st.w / 2, st.h / 2, 0, st.w / 2, st.h / 2, Math.max(st.w, st.h) * 0.62);
      grd.addColorStop(0, '#fff');
      grd.addColorStop(0.7, '#bbb');
      grd.addColorStop(1, '#333');
      g.fillStyle = grd;
      roundRect(g, 0, 0, st.w, st.h, st.r);
      g.fill();
    });
  };
}
// 高度图 → 切线空间法线贴图
function normalTexFromHeight(name, meters, drawHeight, strength = 2.2) {
  const S = PX;
  const hc = document.createElement('canvas');
  hc.width = hc.height = S;
  drawHeight(hc.getContext('2d'), S);
  const src = hc.getContext('2d').getImageData(0, 0, S, S).data;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const out = g.createImageData(S, S);
  const H = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      out.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      out.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / meters, 1 / meters);
  t.anisotropy = 16; // three 会按显卡上限钳制（R4：中远距离地面糊成一片、摩尔纹）
  t.name = name;
  return t;
}

// 广场石板（R3：旧版是整齐 2 m 方格、无缺角无色差）：错缝条石，宽度随机，带缺角、色差和污渍
function flagstones(hue, sat, light) {
  return (g, S, rng) => {
    g.fillStyle = hsl(hue + 4, sat, light - 22);
    g.fillRect(0, 0, S, S);
    const rows = 6;
    const rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rng() * rh;
      while (x < S) {
        const w = rh * (0.9 + rng() * 1.3);
        const l = light + (rng() - 0.5) * 10;
        const hj = hue + (rng() - 0.5) * 8;
        const grd = g.createLinearGradient(0, r * rh, 0, r * rh + rh);
        grd.addColorStop(0, hsl(hj, sat, l + 5));
        grd.addColorStop(1, hsl(hj, sat, l - 6));
        g.fillStyle = grd;
        const cut = rng() < 0.3 ? 6 + rng() * 10 : 0; // 缺角
        const x0 = x + 2;
        const y0 = r * rh + 2;
        const x1 = Math.min(x + w, x + w) - 2;
        const y1 = r * rh + rh - 2;
        g.beginPath();
        g.moveTo(x0 + cut, y0);
        g.lineTo(x1, y0);
        g.lineTo(x1, y1 - cut * 0.6);
        g.lineTo(x1 - cut * 0.6, y1);
        g.lineTo(x0, y1);
        g.lineTo(x0, y0 + cut);
        g.closePath();
        g.fill();
        if (x1 > S) { g.save(); g.translate(-S, 0); g.fill(); g.restore(); }
        g.fillStyle = hsl(hj, sat, l + 12, 0.35); // 上沿磨亮
        g.fillRect(x0 + cut, y0, x1 - x0 - cut, 2);
        x += w;
      }
    }
    blotches(g, S, rng, 18, hue - 6, sat + 6, light - 14, 10, 0.16); // 污渍
    speckle(g, S, rng, 900, hsl(hue, sat, light - 30, 0.22));
  };
}

function woodPlanks(hue, sat, light, { vertical = false, planks = 6 } = {}) {
  return (g, S, rng) => {
    const pw = S / planks;
    for (let i = 0; i < planks; i++) {
      const l = light + (rng() - 0.5) * 10;
      g.fillStyle = hsl(hue, sat, l);
      if (vertical) g.fillRect(i * pw, 0, pw, S);
      else g.fillRect(0, i * pw, S, pw);
      // 木纹
      g.strokeStyle = hsl(hue, sat, l - 10, 0.5);
      g.lineWidth = 1;
      for (let k = 0; k < 7; k++) {
        const o = rng() * pw;
        g.beginPath();
        for (let t = 0; t <= S; t += 16) {
          const w = Math.sin(t * 0.02 + k) * 2;
          if (vertical) g.lineTo(i * pw + o + w, t);
          else g.lineTo(t, i * pw + o + w);
        }
        g.stroke();
      }
      g.fillStyle = hsl(hue, sat, l - 22);
      if (vertical) g.fillRect(i * pw, 0, 2, S);
      else g.fillRect(0, i * pw, S, 2);
    }
  };
}

// 灰泥（R3：旧版是一块无纹理平板）：低频斑驳 + 雨水垂流痕 + 细颗粒
function plaster(hue, sat, light) {
  return (g, S, rng) => {
    g.fillStyle = hsl(hue, sat, light);
    g.fillRect(0, 0, S, S);
    blotches(g, S, rng, 46, hue, sat, light - 6, 14, 0.22);
    blotches(g, S, rng, 14, hue + 8, sat + 10, light - 12, 8, 0.12);
    for (let i = 0; i < 30; i++) {
      const x = rng() * S;
      const y0 = rng() * S;
      const len = 30 + rng() * 140;
      const grd = g.createLinearGradient(0, y0, 0, y0 + len);
      grd.addColorStop(0, hsl(hue, sat, light - 14, 0.18));
      grd.addColorStop(1, hsl(hue, sat, light - 14, 0));
      g.fillStyle = grd;
      g.fillRect(x, y0, 2 + rng() * 5, len);
    }
    speckle(g, S, rng, 2200, hsl(hue, sat, light - 20, 0.2));
  };
}

function grass(g, S, rng) {
  g.fillStyle = hsl(95, 42, 38);
  g.fillRect(0, 0, S, S);
  blotches(g, S, rng, 30, 92, 45, 40, 14, 0.25);
  for (let i = 0; i < 2600; i++) {
    const x = rng() * S;
    const y = rng() * S;
    g.strokeStyle = hsl(85 + rng() * 25, 45, 30 + rng() * 22, 0.7);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rng() - 0.5) * 4, y - 4 - rng() * 6);
    g.stroke();
  }
}

function dirt(g, S, rng) {
  g.fillStyle = hsl(32, 30, 40);
  g.fillRect(0, 0, S, S);
  blotches(g, S, rng, 30, 30, 30, 38, 14, 0.25);
  speckle(g, S, rng, 2000, hsl(30, 25, 25, 0.35), 2);
}

function solid(h, s, l) {
  return (g, S, rng) => {
    g.fillStyle = hsl(h, s, l);
    g.fillRect(0, 0, S, S);
    blotches(g, S, rng, 12, h, s, l, 8, 0.12);
  };
}

function carpet(g, S, rng) {
  g.fillStyle = hsl(355, 62, 30);
  g.fillRect(0, 0, S, S);
  g.strokeStyle = hsl(45, 70, 55);
  g.lineWidth = 10;
  g.strokeRect(24, -10, S - 48, S + 20);
  g.lineWidth = 3;
  g.strokeRect(44, -10, S - 88, S + 20);
  blotches(g, S, rng, 10, 355, 60, 30, 8, 0.15);
}

// 彩窗（Critic R1：旧版是随机色块）：菱形铅条格 + 中心圆花窗（12 瓣辐射分格），4 个主色 + 明度渐变
function stainedGlass(g, S, rng) {
  const pal = [[218, 75, 38], [352, 70, 40], [44, 88, 52], [200, 60, 55]];
  const bg = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.75);
  bg.addColorStop(0, hsl(212, 70, 46));
  bg.addColorStop(1, hsl(222, 75, 26));
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  const q = S / 8;
  const R = S * 0.36;
  const diamond = (cx, cy) => {
    g.beginPath();
    g.moveTo(cx, cy - q / 2);
    g.lineTo(cx + q / 2, cy);
    g.lineTo(cx, cy + q / 2);
    g.lineTo(cx - q / 2, cy);
    g.closePath();
  };
  for (let j = -1; j <= 8; j++) {
    for (let i = -1; i <= 8; i++) {
      const cx = i * q + (j % 2 ? q / 2 : 0);
      const [h, s, l] = (i + j) % 5 === 0 ? pal[1] : (i * 3 + j) % 7 === 0 ? pal[2] : pal[0];
      g.fillStyle = hsl(h, s, l + (rng() - 0.5) * 8, 0.85);
      diamond(cx, j * q);
      g.fill();
    }
  }
  g.save();
  g.translate(S / 2, S / 2);
  for (let k = 0; k < 12; k++) {
    const [h, s, l] = pal[k % 2 ? 1 : 2];
    g.fillStyle = hsl(h, s, l + 6);
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, R, (k / 12) * Math.PI * 2, ((k + 1) / 12) * Math.PI * 2);
    g.closePath();
    g.fill();
  }
  g.fillStyle = hsl(44, 90, 62);
  g.beginPath();
  g.arc(0, 0, R * 0.28, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#141414';
  g.lineWidth = 6;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * R * 0.28, Math.sin(a) * R * 0.28);
    g.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    g.stroke();
  }
  for (const rr of [R * 0.28, R * 0.64, R]) {
    g.beginPath();
    g.arc(0, 0, rr, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = '#141414';
  g.lineWidth = 4;
  for (let j = -1; j <= 8; j++) {
    for (let i = -1; i <= 8; i++) {
      const cx = i * q + (j % 2 ? q / 2 : 0);
      if (Math.hypot(cx - S / 2, j * q - S / 2) < R + q * 0.3) continue;
      diamond(cx, j * q);
      g.stroke();
    }
  }
  g.lineWidth = 10;
  g.strokeRect(0, 0, S, S);
}

// 旗帜：暴风城蓝底金狮纹章（几何简化）
function banner(g, S) {
  g.fillStyle = hsl(222, 65, 30);
  g.fillRect(0, 0, S, S);
  g.fillStyle = hsl(45, 85, 55);
  g.fillRect(0, 0, S, S * 0.06);
  g.fillRect(0, S * 0.94, S, S * 0.06);
  // 盾形
  const cx = S / 2;
  g.beginPath();
  g.moveTo(cx - S * 0.25, S * 0.25);
  g.lineTo(cx + S * 0.25, S * 0.25);
  g.lineTo(cx + S * 0.25, S * 0.55);
  g.quadraticCurveTo(cx, S * 0.85, cx - S * 0.25, S * 0.55);
  g.closePath();
  g.fill();
  // 狮头剪影
  g.fillStyle = hsl(222, 65, 30);
  g.beginPath();
  g.arc(cx, S * 0.45, S * 0.11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hsl(45, 85, 55);
  g.beginPath();
  g.arc(cx, S * 0.46, S * 0.07, 0, Math.PI * 2);
  g.fill();
}

// 水面法线（程序化涟漪，非颜色贴图）
function waterNormal(g, S, rng) {
  const img = g.createImageData(S, S);
  const waves = Array.from({ length: 6 }, () => ({ a: rng() * Math.PI * 2, f: 2 + Math.floor(rng() * 5), p: rng() * 6 }));
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const kx = Math.round(Math.cos(w.a) * w.f);
        const ky = Math.round(Math.sin(w.a) * w.f);
        const ph = ((x * kx + y * ky) / S) * Math.PI * 2 + w.p;
        const c = Math.cos(ph);
        dx += kx * c;
        dy += ky * c;
      }
      const i = (y * S + x) * 4;
      img.data[i] = 128 + dx * 4;
      img.data[i + 1] = 128 + dy * 4;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

export function createMaterials() {
  const std = (map, opts = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.88, metalness: 0, ...opts });

  const T = {
    // 石砌每皮约 0.33 m、块长 0.5–0.7 m（R3：旧版每皮 0.6 m，门高只有 4 皮，像积木）
    stoneWhite: canvasTex('stoneWhite', 4, stoneBlocks(null, { hue: 42, sat: 18, light: 84, rows: 12, perRow: 6, mortar: 3, jitter: 9 })),
    stoneGrey: canvasTex('stoneGrey', 4, stoneBlocks(null, { hue: 35, sat: 8, light: 66, rows: 12, perRow: 7, mortar: 3, jitter: 10 })),
    stoneDark: canvasTex('stoneDark', 4, stoneBlocks(null, { hue: 25, sat: 10, light: 44, rows: 10, perRow: 5, mortar: 3, jitter: 12 })),
    stoneTrim: canvasTex('stoneTrim', 2, stoneBlocks(null, { hue: 44, sat: 22, light: 88, rows: 2, perRow: 2 })),
    plaster: canvasTex('plaster', 3, plaster(42, 38, 84)),
    timber: canvasTex('timber', 2, woodPlanks(26, 42, 33, { vertical: true, planks: 4 })), // R3：木梁提到中褐，阴影里不压成近黑
    planks: canvasTex('planks', 3, woodPlanks(30, 38, 42, { planks: 8 })),
    roofBlue: canvasTex('roofBlue', 3, roofTiles(220, 62, 42)),
    roofPurple: canvasTex('roofPurple', 3, roofTiles(275, 45, 40)),
    roofRed: canvasTex('roofRed', 3, roofTiles(12, 45, 36)),
    roofSlate: canvasTex('roofSlate', 3, roofTiles(215, 18, 36)),
    // 1.6 m 一张、10×10 块 → 单块约 0.16 m（真实卵石 0.12–0.25 m；R2/R5：旧版尺度偏大）
    cobble: canvasTex('cobble', 1.6, cobble(35, 12, 58)),
    cobbleDark: canvasTex('cobbleDark', 1.6, cobble(25, 10, 42)),
    cobbleN: normalTexFromHeight('cobbleN', 1.6, cobbleHeight('cobble')),
    cobbleDarkN: normalTexFromHeight('cobbleDarkN', 1.6, cobbleHeight('cobbleDark')),
    plaza: canvasTex('plaza', 6, flagstones(40, 20, 78)),
    grass: canvasTex('grass', 6, grass),
    dirt: canvasTex('dirt', 5, dirt),
    gold: canvasTex('gold', 2, solid(44, 78, 52)),
    marble: canvasTex('marble', 3, (g, S, rng) => {
      plaster(40, 10, 80)(g, S, rng);
      g.strokeStyle = hsl(30, 8, 62, 0.35); // 大理石细纹
      g.lineWidth = 1.2;
      for (let i = 0; i < 18; i++) {
        let x = rng() * S;
        let y = rng() * S;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 12; k++) {
          x += (rng() - 0.3) * 40;
          y += (rng() - 0.5) * 30;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }),
    carpet: canvasTex('carpet', 2, carpet),
    stained: canvasTex('stained', 2, stainedGlass),
    banner: canvasTex('banner', 1, banner, { px: 256 }),
    fabricRed: canvasTex('fabricRed', 2, solid(358, 55, 36)),
    fabricBlue: canvasTex('fabricBlue', 2, solid(222, 55, 34)),
    waterN: canvasTex('waterN', 10, waterNormal, { px: 256, color: false }),
  };

  const M = {
    stoneWhite: std(T.stoneWhite),
    stoneGrey: std(T.stoneGrey),
    stoneDark: std(T.stoneDark),
    stoneTrim: std(T.stoneTrim),
    plaster: std(T.plaster),
    timber: std(T.timber),
    planks: std(T.planks),
    roofBlue: std(T.roofBlue, { roughness: 0.6 }),
    roofPurple: std(T.roofPurple, { roughness: 0.6 }),
    roofRed: std(T.roofRed, { roughness: 0.7 }),
    roofSlate: std(T.roofSlate, { roughness: 0.7 }),
    // R5：贴地像"枕头阵"→ 单块 0.16 m、法线强度减半
    cobble: std(T.cobble, { normalMap: T.cobbleN, normalScale: new THREE.Vector2(0.6, 0.6) }),
    cobbleDark: std(T.cobbleDark, { normalMap: T.cobbleDarkN, normalScale: new THREE.Vector2(0.6, 0.6) }),
    plaza: std(T.plaza),
    grass: std(T.grass),
    dirt: std(T.dirt),
    gold: std(T.gold, { metalness: 0.75, roughness: 0.35 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.7, roughness: 0.45 }),
    carpet: std(T.carpet),
    fabricRed: std(T.fabricRed, { side: THREE.DoubleSide }),
    fabricBlue: std(T.fabricBlue, { side: THREE.DoubleSide }),
    banner: std(T.banner, { side: THREE.DoubleSide }),
    // 雕像：带细纹的暖白大理石，略有光泽（R2：哑光塑料感）
    statue: std(T.marble, { roughness: 0.5, metalness: 0.02 }),
    leaves: new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.9 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.95 }),
    // ---- 随昼夜变化的发光材质（setNight 控制）----
    windowGlow: new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0xffd38a, emissive: 0xffb050, emissiveIntensity: 0.4 }),
    fire: new THREE.MeshBasicMaterial({ color: 0xff8a2a }),
    arcane: new THREE.MeshStandardMaterial({ color: 0xb48cff, emissive: 0x9b5cff, emissiveIntensity: 1.2 }),
    stained: new THREE.MeshStandardMaterial({ map: T.stained, emissive: 0xffffff, emissiveMap: T.stained, emissiveIntensity: 0.6, side: THREE.DoubleSide }),
    // 室外侧彩窗：白天像真实玻璃一样偏暗、带高光；夜里从里面透出光（室内一侧仍用 stained）
    stainedOutside: new THREE.MeshStandardMaterial({ map: T.stained, color: 0x7a7f8c, metalness: 0.2, roughness: 0.15, emissive: 0xffffff, emissiveMap: T.stained, emissiveIntensity: 0 }),
    // 窗光变体（Critic R1：夜里所有窗一样亮，像写字楼）
    windowGlow2: new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    windowGlowDim: new THREE.MeshBasicMaterial({ color: 0xff9a50, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    windowDark: new THREE.MeshBasicMaterial({ color: 0x1c2333, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  };
  for (const k of ['windowGlow', 'windowGlow2', 'windowGlowDim', 'windowDark']) M[k].userData.noShadow = true;
  // 民居用 rng 从这里挑一块窗光：约 20% 标准暖光 / 20% 更暖 / 20% 半掩窗帘 / 40% 不亮（R2：夜里亮窗太满像灯格）
  M.windowGlowSet = [M.windowGlow, M.windowGlow2, M.windowGlow2, M.windowGlowDim, M.windowDark, M.windowDark, M.windowDark, M.windowGlow, M.windowGlowDim, M.windowDark];

  // 白天窗户是暗玻璃（略透），夜里变暖光；路灯/彩窗同步
  M.setNight = (n) => {
    M.windowGlow.opacity = 0.12 + 0.6 * n;
    M.windowGlow.color.setHSL(0.095, 0.9 * n + 0.1, 0.36 + 0.28 * n); // 暖黄（约 2700 K；R5：偏白的窗光像日光灯）
    M.lampGlow.emissiveIntensity = 0.3 + 3.2 * n;
    M.stained.emissiveIntensity = 0.35 + 0.9 * n;
    M.stainedOutside.emissiveIntensity = 0.02 + 0.9 * n;
    M.windowGlow2.opacity = 0.12 + 0.5 * n;
    M.windowGlow2.color.setHSL(0.055, 0.95 * n + 0.05, 0.28 + 0.3 * n); // 更暖偏橙（约 2200 K）
    M.windowGlowDim.opacity = 0.12 + 0.3 * n;
    M.windowGlowDim.color.setHSL(0.07, 0.8 * n + 0.1, 0.28 + 0.2 * n); // 半掩窗帘
  };
  M.setNight(0);
  M.textures = T;
  return M;
}
