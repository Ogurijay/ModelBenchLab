// 示例场景：一次演示水循环、生长、电解、岩浆地热、放射热、降雪等系统
import { W, H } from './const.js';
import { E } from './elements.js';

export function buildDemo(sim) {
  sim.clear();
  const { set } = bindHelpers(sim);

  // —— 基岩地面（带起伏）——
  for (let x = 1; x < W - 1; x++) {
    const h = 16 + Math.round(Math.sin(x * 0.045) * 3 + Math.sin(x * 0.013) * 4);
    for (let y = H - h; y < H - 1; y++) set(x, y, E.STONE);
  }

  // —— 左侧：湖泊（水 + 油膜 + 盐岸）——
  carveBowl(sim, 16, 100, H - 18, 26); // 挖湖床
  for (let y = H - 40; y < H - 18; y++)
    for (let x = 20 + Math.abs(y - (H - 40)), xe = 96 - Math.abs(y - (H - 40)); x < xe; x++)
      if (sim.cells[y * W + x] === E.EMPTY) set(x, y, E.WATER);
  for (let x = 34, y0 = H - 41; x < 82; x++) if (sim.cells[y0 * W + x] === E.EMPTY) set(x, y0, E.OIL); // 油浮在水面
  pile(sim, 100, H - 20, 7, E.SALT); // 盐堆在岸边

  // —— 湖底：铀矿脉（地热，把湖水局部煮出蒸汽）——
  block(sim, 40, 48, H - 16, H - 12, E.URANIUM);

  // —— 中部：沙丘 + 种子（靠近小水洼会发芽长藤）——
  for (let x = 118; x < 190; x++) {
    const h = Math.max(0, 18 - Math.abs(x - 154) * 0.55);
    for (let y = 0; y < h; y++) set(x, H - 19 - y, E.SAND);
  }
  carveBowl(sim, 196, 228, H - 18, 10);
  for (let y = H - 26; y < H - 18; y++)
    for (let x = 199; x < 225; x++)
      if (sim.cells[y * W + x] === E.EMPTY) set(x, y, E.WATER);
  for (let x = 196; x < 203; x++) set(x, H - 28, E.SEED);

  // —— 中部高处：木屋骨架 + 蜡烛（等你来点火）——
  block(sim, 138, 141, H - 60, H - 34, E.WOOD);
  block(sim, 168, 171, H - 60, H - 34, E.WOOD);
  block(sim, 134, 175, H - 64, H - 61, E.WOOD);
  block(sim, 150, 153, H - 40, H - 34, E.WAX);   // 蜡烛
  block(sim, 151, 152, H - 42, H - 41, E.WOOD);  // 烛芯

  // —— 右中：电解装置（电源 → 金属电极插入盐水 → 冒氢氧气泡）——
  block(sim, 250, 282, H - 18, H - 16, E.GLASS);         // 皿底
  block(sim, 250, 251, H - 42, H - 17, E.GLASS);         // 左壁
  block(sim, 281, 282, H - 42, H - 17, E.GLASS);         // 右壁
  for (let y = H - 36; y < H - 18; y++)
    for (let x = 252; x < 281; x++) set(x, y, E.SALTWATER);
  block(sim, 258, 259, H - 66, H - 22, E.METAL);         // 电极 A
  block(sim, 273, 274, H - 66, H - 22, E.METAL);         // 电极 B
  block(sim, 258, 274, H - 68, H - 67, E.METAL);         // 顶部母线
  block(sim, 265, 267, H - 72, H - 69, E.BATTERY);       // 电源

  // —— 右侧：封在岩石里的岩浆房 + 上方金属板（被烤到发红）——
  block(sim, 300, 344, H - 30, H - 28, E.STONE);
  block(sim, 300, 302, H - 28, H - 17, E.STONE);
  block(sim, 342, 344, H - 28, H - 17, E.STONE);
  for (let y = H - 27; y < H - 17; y++)
    for (let x = 303; x < 342; x++) set(x, y, E.LAVA);
  block(sim, 304, 340, H - 33, H - 31, E.METAL);

  // —— 天上：一朵会下雪的「克隆云」——
  for (let x = 150; x < 186; x += 2) {
    const i = 8 * W + x;
    set(x, 8, E.CLONE);
    sim.aux[i] = E.SNOW; // 直接预设克隆目标
  }

  // —— 一台向右吹的风扇，让雪花飘斜 ——
  block(sim, 120, 122, 40, 44, E.FAN);
  for (let y = 40; y <= 44; y++) for (let x = 120; x <= 122; x++) sim.aux[y * W + x] = 0; // 0 = 向右

  // —— 角落彩蛋：金块和钻石各一粒 ——
  block(sim, 8, 12, H - 22, H - 18, E.GOLD);
  block(sim, 350, 353, H - 20, H - 17, E.DIAMOND);
}

function bindHelpers(sim) {
  return { set: (x, y, t) => sim.set(x, y, t) };
}

// 在 y0 之上挖一个 V 形碗（清空并铺石壁）
function carveBowl(sim, x0, x1, yBottom, depth) {
  const cx = (x0 + x1) / 2;
  for (let x = x0; x <= x1; x++) {
    const d = Math.round(depth * (1 - Math.abs(x - cx) / ((x1 - x0) / 2)));
    for (let y = yBottom - d; y <= yBottom; y++) {
      if (y === yBottom || x === x0 || x === x1) sim.set(x, y, E.STONE);
      else sim.set(x, y, E.EMPTY);
    }
    sim.set(x, yBottom + 1, E.STONE);
  }
}

function block(sim, x0, x1, y0, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sim.set(x, y, t);
}

function pile(sim, cx, yBase, r, t) {
  for (let dy = 0; dy < r; dy++)
    for (let dx = -(r - dy); dx <= r - dy; dx++)
      sim.set(cx + dx, yBase - dy, t);
}
