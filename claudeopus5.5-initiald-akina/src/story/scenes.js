// 剧情背景与关键画面：Canvas 2D 程序化"手绘"（渐变平涂 + 笔触 + 颗粒）。
// 说明：题面建议海滩表白、终章对视用 Krita/AI 精绘 PNG；本实现不加载外部图片，
// 这两张用更细的程序化绘制代替，并在 HANDOVER 中如实标注为"未达到精绘"。
import { rng } from '../core/math.js';

const W = 1600, H = 900;

function grad(g, y0, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([t, c]) => gr.addColorStop(t, c));
  return gr;
}
function sky(g, stops, h = H) { g.fillStyle = grad(g, 0, h, stops); g.fillRect(0, 0, W, h); }
function glow(g, x, y, r, c, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1;
}
function ridge(g, base, amp, color, seed, rough = 1) {
  const r = rng(seed);
  g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
  let y = base;
  for (let x = 0; x <= W; x += 20) { y += (r() - 0.5) * 40 * rough; y = Math.max(base - amp, Math.min(base + amp * 0.3, y)); g.lineTo(x, y); }
  g.lineTo(W, H); g.closePath(); g.fill();
}
function clouds(g, n, y0, y1, color, seed) {
  const r = rng(seed);
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = y0 + r() * (y1 - y0), s = 40 + r() * 90;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(x + (k - 2) * s * 0.5, y + Math.sin(k) * s * 0.12, s * (0.55 + r() * 0.3), s * 0.28, 0, 0, Math.PI * 2); g.fill(); }
  }
}
function strokes(g, n, seed, color, a = 0.08, box = [0, 0, W, H]) {
  const r = rng(seed); g.globalAlpha = a; g.fillStyle = color;
  for (let i = 0; i < n; i++) { g.beginPath(); g.ellipse(box[0] + r() * box[2], box[1] + r() * box[3], 20 + r() * 80, 2 + r() * 5, -0.3 + r() * 0.2, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
}
function grain(g, a = 0.06, seed = 3) {
  const r = rng(seed); g.globalAlpha = a;
  for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? '#000' : '#fff'; g.fillRect(r() * W, r() * H, 2, 2); }
  g.globalAlpha = 1;
}
function vignette(g, a = 0.5) {
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
function rainLines(g, n, seed, color = 'rgba(200,215,225,0.35)') {
  const r = rng(seed); g.strokeStyle = color; g.lineWidth = 1.5;
  for (let i = 0; i < n; i++) { const x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 8, y + 40); g.stroke(); }
}
function car86(g, x, y, s = 1, light = false) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = '#f2f2ee'; g.strokeStyle = '#111'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-200, 0); g.lineTo(-205, -40); g.lineTo(-150, -58); g.lineTo(-60, -62); g.lineTo(-10, -110); g.lineTo(110, -112); g.lineTo(190, -64); g.lineTo(205, -40); g.lineTo(200, 0); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#16161a'; g.fillRect(-205, -26, 410, 26);
  g.fillStyle = '#26303f'; g.beginPath(); g.moveTo(-40, -64); g.lineTo(-2, -102); g.lineTo(100, -104); g.lineTo(160, -64); g.closePath(); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 22px SimHei, sans-serif'; g.fillText('藤原豆腐店（自家用）', -60, -36);
  for (const wx of [-130, 130]) { g.fillStyle = '#111'; g.beginPath(); g.arc(wx, 0, 34, 0, Math.PI * 2); g.fill(); g.fillStyle = '#bbb'; g.beginPath(); g.arc(wx, 0, 16, 0, Math.PI * 2); g.fill(); }
  if (light) glow(g, -205, -30, 60, 'rgba(255,40,40,0.9)');
  g.restore();
}
function sedan(g, x, y, s, color, chrome = '#d9dde3') {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = color; g.strokeStyle = '#000'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-260, 0); g.lineTo(-262, -50); g.lineTo(-170, -66); g.lineTo(-90, -122); g.lineTo(80, -124); g.lineTo(150, -70); g.lineTo(262, -58); g.lineTo(266, 0); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#1d232c'; g.beginPath(); g.moveTo(-76, -114); g.lineTo(72, -116); g.lineTo(130, -72); g.lineTo(-150, -70); g.closePath(); g.fill();
  g.strokeStyle = chrome; g.lineWidth = 3; g.beginPath(); g.moveTo(-250, -40); g.lineTo(255, -42); g.stroke();
  for (const wx of [-170, 170]) { g.fillStyle = '#0b0b0b'; g.beginPath(); g.arc(wx, 0, 38, 0, Math.PI * 2); g.fill(); g.fillStyle = chrome; g.beginPath(); g.arc(wx, 0, 20, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
function person(g, x, y, s, color, hair = '#111', long = false) {
  g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = color;
  g.beginPath(); g.moveTo(-26, 0); g.lineTo(-20, -110); g.quadraticCurveTo(0, -126, 20, -110); g.lineTo(26, 0); g.closePath(); g.fill();
  g.fillStyle = hair; g.beginPath(); g.arc(0, -134, 18, 0, Math.PI * 2); g.fill();
  if (long) { g.beginPath(); g.moveTo(-18, -138); g.quadraticCurveTo(-24, -100, -12, -88); g.lineTo(12, -88); g.quadraticCurveTo(24, -100, 18, -138); g.fill(); }
  g.restore();
}
function shopFront(g, dusk) {
  g.fillStyle = dusk ? '#4a3a3a' : '#2c3350'; g.fillRect(380, 260, 840, 460);
  g.fillStyle = dusk ? '#6a4a3a' : '#3a4366'; g.fillRect(360, 220, 880, 60);
  g.fillStyle = '#f4efe4'; g.fillRect(560, 290, 480, 90); g.strokeStyle = '#111'; g.lineWidth = 5; g.strokeRect(560, 290, 480, 90);
  g.fillStyle = '#111'; g.font = '900 64px "STXingkai","KaiTi",serif'; g.textAlign = 'center'; g.fillText('藤原豆腐店', 800, 358); g.textAlign = 'left';
  g.fillStyle = dusk ? 'rgba(255,200,120,0.85)' : 'rgba(255,220,160,0.55)'; g.fillRect(450, 420, 300, 200); g.fillRect(850, 420, 300, 200);
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 4; for (let x = 450; x <= 750; x += 75) { g.beginPath(); g.moveTo(x, 420); g.lineTo(x, 620); g.stroke(); }
  g.fillStyle = '#555'; g.fillRect(0, 720, W, 180);
}

export const SCENES = {
  summit_night(g) {
    sky(g, [[0, '#04060d'], [0.6, '#0D1225'], [1, '#22305a']]);
    const r = rng(4); g.fillStyle = '#fff'; for (let i = 0; i < 260; i++) { g.globalAlpha = r(); g.fillRect(r() * W, r() * H * 0.6, 2, 2); } g.globalAlpha = 1;
    glow(g, 1250, 150, 70, 'rgba(230,236,255,1)'); g.fillStyle = '#eef2ff'; g.beginPath(); g.arc(1250, 150, 34, 0, Math.PI * 2); g.fill();
    ridge(g, 560, 80, '#0b1022', 11, 0.8);
    // 山下城市灯火
    const rr = rng(9); for (let i = 0; i < 500; i++) { const x = rr() * W, y = 600 + rr() * 90; g.fillStyle = rr() < 0.7 ? 'rgba(255,210,140,0.9)' : 'rgba(180,220,255,0.9)'; g.fillRect(x, y, 3, 2); }
    g.fillStyle = '#05070f'; g.beginPath(); g.moveTo(0, 720); g.quadraticCurveTo(800, 660, W, 730); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    sedan(g, 420, 790, 0.7, '#f4f6fa'); sedan(g, 1150, 800, 0.72, '#141518');
    person(g, 640, 800, 1.1, '#cfd8e6', '#1c1a22'); person(g, 930, 805, 1.1, '#16171c', '#101012');
    grain(g, 0.05); vignette(g, 0.6);
  },
  tofu_dawn(g) {
    sky(g, [[0, '#1d2850'], [0.55, '#2B3A67'], [0.85, '#c98aa0'], [1, '#f2b8c6']], 420);
    clouds(g, 6, 80, 240, 'rgba(240,180,200,0.35)', 2);
    ridge(g, 300, 60, '#3a4570', 5);
    shopFront(g, false);
    g.fillStyle = 'rgba(30,36,70,0.6)'; g.fillRect(0, 720, W, 180);
    car86(g, 1300, 820, 0.9);
    glow(g, 1400, 300, 160, 'rgba(255,220,170,0.25)');
    grain(g, 0.06); vignette(g, 0.55);
  },
  tofu_dusk(g) {
    sky(g, [[0, '#4a3a7a'], [0.5, '#a3557a'], [1, '#F28C38']], 420);
    clouds(g, 7, 60, 260, 'rgba(255,190,120,0.45)', 3);
    shopFront(g, true);
    car86(g, 1300, 820, 0.9);
    grain(g, 0.05); vignette(g, 0.45);
  },
  school_noon(g) {
    sky(g, [[0, '#2f8fe0'], [0.6, '#4FB3FF'], [1, '#eaf7ff']], 560);
    clouds(g, 5, 80, 300, 'rgba(255,255,255,0.95)', 7);
    g.fillStyle = '#f4f1ea'; g.fillRect(200, 260, 1200, 320); g.fillStyle = '#d9d3c5'; for (let x = 240; x < 1380; x += 110) g.fillRect(x, 300, 70, 90);
    g.fillStyle = '#e8e2d2'; g.fillRect(0, 560, W, 340);
    g.fillStyle = '#6a6a6a'; g.fillRect(150, 420, 30, 300); g.fillRect(560, 420, 30, 300);
    g.fillStyle = '#fff'; g.fillRect(190, 470, 340, 60); g.fillStyle = '#111'; g.font = '900 40px "KaiTi",serif'; g.fillText('秋名高中', 270, 512);
    // 校门口的奔驰（只有两秒的伏笔）
    sedan(g, 1080, 780, 0.85, '#0c0d10');
    person(g, 880, 790, 1.05, '#ffffff', '#2a1d1a', true);
    glow(g, 1300, 120, 200, 'rgba(255,255,240,0.6)');
    grain(g, 0.03); vignette(g, 0.3);
  },
  gas_dusk(g) {
    sky(g, [[0, '#4a3a7a'], [0.5, '#c0607a'], [1, '#F28C38']], 520);
    clouds(g, 6, 80, 260, 'rgba(255,170,110,0.5)', 8);
    ridge(g, 470, 70, '#5a3a5a', 13);
    g.fillStyle = '#3a3036'; g.fillRect(0, 600, W, 300);
    g.fillStyle = '#f4f4f4'; g.fillRect(200, 300, 1000, 50); g.fillStyle = '#d7263d'; g.fillRect(200, 340, 1000, 14);
    g.fillStyle = '#e8e8e8'; for (const x of [320, 700, 1080]) g.fillRect(x, 350, 26, 300);
    for (const x of [450, 850]) { g.fillStyle = '#d7263d'; g.fillRect(x, 520, 70, 130); g.fillStyle = '#fff'; g.fillRect(x + 12, 540, 46, 30); }
    sedan(g, 1350, 780, 0.6, '#141518');
    glow(g, 700, 330, 300, 'rgba(255,230,190,0.3)');
    grain(g, 0.05); vignette(g, 0.4);
  },
  touge_night(g) {
    sky(g, [[0, '#04060d'], [0.7, '#0D1225'], [1, '#1f2d55']]);
    const r = rng(12); g.fillStyle = '#fff'; for (let i = 0; i < 200; i++) { g.globalAlpha = r(); g.fillRect(r() * W, r() * H * 0.5, 2, 2); } g.globalAlpha = 1;
    ridge(g, 420, 120, '#0b1124', 21, 1.2); ridge(g, 560, 80, '#070b18', 22, 1);
    g.strokeStyle = 'rgba(255,240,200,0.8)'; g.lineWidth = 6; g.beginPath(); g.moveTo(100, 900); g.bezierCurveTo(500, 600, 1100, 760, 1500, 520); g.stroke();
    glow(g, 1500, 520, 120, 'rgba(255,60,60,0.6)');
    grain(g, 0.05); vignette(g, 0.6);
  },
  beach_noon(g) {
    sky(g, [[0, '#2f8fe0'], [0.55, '#4FB3FF'], [1, '#f2fbff']], 470);
    clouds(g, 4, 60, 260, 'rgba(255,255,255,0.95)', 31);
    strokes(g, 60, 5, '#ffffff', 0.15, [0, 40, W, 300]);
    // 海：几层横向笔触
    g.fillStyle = grad(g, 470, 680, [[0, '#2a7fc2'], [1, '#79c8e8']]); g.fillRect(0, 470, W, 210);
    strokes(g, 220, 33, '#ffffff', 0.22, [0, 480, W, 200]);
    g.fillStyle = 'rgba(255,255,255,0.85)'; const r = rng(34);
    for (let i = 0; i < 6; i++) { const y = 640 + i * 8; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 40) g.quadraticCurveTo(x + 20, y - 6 - r() * 4, x + 40, y); g.lineTo(W, y + 4); g.lineTo(0, y + 4); g.fill(); }
    g.fillStyle = grad(g, 680, 900, [[0, '#f3e3c2'], [1, '#e2c99a']]); g.fillRect(0, 680, W, 220);
    strokes(g, 120, 35, '#b89a6a', 0.12, [0, 700, W, 200]);
    // 两个人，隔着一点距离
    person(g, 690, 840, 1.6, '#f2f2ee', '#2b211c'); person(g, 900, 845, 1.55, '#ffffff', '#2a1d1a', true);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(690, 845, 60, 10, 0, 0, Math.PI * 2); g.ellipse(900, 850, 58, 10, 0, 0, Math.PI * 2); g.fill();
    glow(g, 1350, 110, 260, 'rgba(255,255,235,0.7)');
    grain(g, 0.035); vignette(g, 0.25);
  },
  garage_rain(g) {
    g.fillStyle = '#1b2125'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2b353b'; g.fillRect(260, 140, 1080, 620);
    // 车库里那盏亮了一整夜的灯
    glow(g, 800, 200, 520, 'rgba(255,214,150,0.55)');
    g.fillStyle = '#ffe7b0'; g.fillRect(760, 180, 80, 14);
    g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.moveTo(800, 140); g.lineTo(800, 180); g.stroke();
    car86(g, 800, 700, 1.1);
    g.fillStyle = '#f2f2ee'; g.save(); g.translate(1000, 590); g.rotate(-0.9); g.fillRect(0, 0, 160, 10); g.restore();
    person(g, 1120, 720, 1.3, '#4a3e33', '#3a3a3a');
    g.fillStyle = '#5A6B73'; g.fillRect(0, 0, 260, H); g.fillRect(1340, 0, 260, H);
    rainLines(g, 600, 4);
    grain(g, 0.09); vignette(g, 0.7);
  },
  hotel_rain(g) {
    sky(g, [[0, '#2b353b'], [1, '#5A6B73']]);
    g.fillStyle = '#3a454b'; g.fillRect(300, 150, 1000, 560);
    for (let y = 200; y < 650; y += 80) for (let x = 340; x < 1260; x += 90) { g.fillStyle = (x * y) % 7 < 3 ? 'rgba(255,220,160,0.75)' : 'rgba(40,50,60,0.9)'; g.fillRect(x, y, 50, 40); }
    g.fillStyle = '#c9b48a'; g.fillRect(620, 560, 360, 150); g.fillStyle = '#222'; g.font = '900 36px serif'; g.fillText('HOTEL', 740, 610);
    g.fillStyle = '#20282c'; g.fillRect(0, 710, W, 190);
    sedan(g, 820, 820, 0.8, '#0c0d10');
    rainLines(g, 700, 6);
    grain(g, 0.1); vignette(g, 0.65);
  },
  road_morning(g) {
    sky(g, [[0, '#d8e2ea'], [0.5, '#f4f2ea'], [1, '#fff6dc']], 520);
    glow(g, 800, 380, 620, 'rgba(255,248,220,0.9)');
    ridge(g, 470, 40, 'rgba(220,214,196,0.8)', 41, 0.6);
    g.fillStyle = '#d9d2bd'; g.beginPath(); g.moveTo(0, H); g.lineTo(760, 500); g.lineTo(840, 500); g.lineTo(W, H); g.fill();
    g.strokeStyle = '#f4f0e0'; g.lineWidth = 4; g.setLineDash([30, 30]); g.beginPath(); g.moveTo(800, 500); g.lineTo(800, H); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(200,184,140,0.5)'; g.fillRect(0, 520, 760, 380);
    grain(g, 0.05); vignette(g, 0.2);
  },
  epilogue(g) {
    SCENES.tofu_dawn(g);
    sedan(g, 360, 830, 0.62, '#f6f7fa');
  },
  black(g) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); },
  white(g) { g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, W, H); },

  // —— 关键画面
  /** 车窗后的夏树（终章对视右格） */
  window_natsuki(g) {
    g.fillStyle = grad(g, 0, H, [[0, '#cfd6dc'], [1, '#8e9aa4']]); g.fillRect(0, 0, W, H);
    // 车窗框
    g.fillStyle = '#0c0d10'; g.fillRect(0, 0, W, 90); g.fillRect(0, 0, 120, H); g.fillRect(W - 120, 0, 120, H); g.fillRect(0, H - 120, W, 120);
    // 玻璃后：夏树的侧脸
    g.save(); g.beginPath(); g.rect(120, 90, W - 240, H - 210); g.clip();
    g.fillStyle = '#2a1d1a'; g.beginPath(); g.ellipse(820, 470, 260, 330, 0, 0, Math.PI * 2); g.fill();
    // 发丝：细笔触
    g.strokeStyle = 'rgba(70,46,40,0.7)'; g.lineWidth = 2;
    for (let i = 0; i < 46; i++) { const x = 880 + i * 4; g.beginPath(); g.moveTo(x, 300 + (i % 7) * 4); g.quadraticCurveTo(x - 30 + (i % 5) * 9, 520, x - 50 + (i % 9) * 6, 760); g.stroke(); }
    g.fillStyle = '#f3d3b8'; g.beginPath(); g.moveTo(640, 340); g.quadraticCurveTo(600, 520, 680, 650); g.quadraticCurveTo(760, 730, 860, 690); g.quadraticCurveTo(940, 600, 930, 420); g.quadraticCurveTo(840, 300, 640, 340); g.fill();
    g.fillStyle = '#2a1d1a'; g.beginPath(); g.moveTo(600, 300); g.quadraticCurveTo(760, 250, 960, 330); g.lineTo(930, 450); g.quadraticCurveTo(800, 380, 640, 420); g.closePath(); g.fill();
    // 白色上衣领口与肩
    g.fillStyle = '#f7f5f0'; g.beginPath(); g.moveTo(560, 780); g.quadraticCurveTo(640, 690, 760, 700); g.quadraticCurveTo(880, 700, 980, 780); g.closePath(); g.fill();
    g.strokeStyle = '#d7263d'; g.lineWidth = 8; g.beginPath(); g.moveTo(720, 712); g.lineTo(760, 760); g.lineTo(800, 712); g.stroke();
    // 看向窗外（看向你）的眼睛
    g.fillStyle = '#4a2c22'; g.beginPath(); g.ellipse(700, 500, 22, 28, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(706, 490, 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#16161c'; g.lineWidth = 6; g.beginPath(); g.moveTo(668, 474); g.quadraticCurveTo(700, 458, 734, 474); g.stroke();
    g.lineWidth = 3; for (const [x0, y0, x1, y1] of [[670, 474, 660, 466], [678, 468, 670, 458], [730, 472, 742, 466]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    g.strokeStyle = 'rgba(22,22,28,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(650, 440); g.quadraticCurveTo(690, 428, 730, 438); g.stroke();
    g.strokeStyle = '#c98a80'; g.lineWidth = 4; g.beginPath(); g.moveTo(690, 640); g.quadraticCurveTo(706, 646, 722, 640); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(700, 497, 3, 3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,140,140,0.35)'; g.beginPath(); g.ellipse(740, 590, 40, 18, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    // 玻璃反光：斜向高光带 + 晨光
    g.globalAlpha = 0.28; g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(300, 90); g.lineTo(520, 90); g.lineTo(220, H - 120); g.lineTo(120, H - 120); g.lineTo(120, 400); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(1100, 90); g.lineTo(1160, 90); g.lineTo(900, H - 120); g.lineTo(860, H - 120); g.closePath(); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,240,200,0.18)'; g.fillRect(120, 90, W - 240, H - 210);
    grain(g, 0.06);
  },
  projectd(g) {
    g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(800, 430);
    // 飘动的队旗
    g.fillStyle = '#0d0d10'; g.beginPath(); g.moveTo(-460, -260);
    for (let x = -460; x <= 460; x += 20) g.lineTo(x, -260 + Math.sin(x * 0.012) * 26);
    for (let x = 460; x >= -460; x -= 20) g.lineTo(x, 260 + Math.sin(x * 0.012 + 0.6) * 26);
    g.closePath(); g.fill();
    g.fillStyle = '#ffd400'; g.font = '900 360px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('D', 0, 20);
    g.fillStyle = '#f7f4ec'; g.font = '900 60px "Arial Black", sans-serif'; g.fillText('PROJECT', 0, -190);
    g.font = '400 30px "KaiTi", serif'; g.fillText('群 马 远 征', 0, 210);
    g.restore();
    g.fillStyle = '#555'; g.fillRect(320, 150, 12, 620);
    grain(g, 0.05);
  }
};

const cache = new Map();
/** 取场景画布（缓存） */
export function sceneCanvas(id) {
  if (cache.has(id)) return cache.get(id);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  (SCENES[id] || SCENES.black)(g);
  cache.set(id, c);
  return c;
}
