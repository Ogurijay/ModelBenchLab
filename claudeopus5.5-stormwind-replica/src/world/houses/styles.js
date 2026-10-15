// 民居生成器：尺寸常量 + 各区风格表 + 业态分配。
// 关键尺寸全部来自 PLAN.md「关键尺寸表」，改这里就是改全城。

export const INSET = 0.6; // 占地 = 地块四边内缩
export const FLOOR_H = 3.4; // 层高
export const SLAB = 0.25; // 楼板厚
export const STEP0 = 0.15; // 底层地板高出街面
export const JETTY = 0.5; // 半木构上层临街出挑
export const DOOR = { w: 1.5, h: 2.5 };
export const WIN = { w: 1.1, h: 1.5, sill: 1.0 };
// 直跑楼梯：12 级踢面（11 级踏步 + 落到楼板），踢面 0.283 ≤ 0.3，踏步深 0.32，宽 1.2
export const STAIR = { risers: 12, rise: FLOOR_H / 12, run: 0.32, width: 1.2, landing: 1.15 };
STAIR.steps = STAIR.risers - 1;
STAIR.len = STAIR.steps * STAIR.run; // 3.52 m

// 各区风格。ground/upper：底层 / 上层墙体材质候选；halfTimber：上层贴木构；
// pitch：屋面坡度（rise / 半跨）；over：出檐；roofT：屋面厚；winGap：窗间距
export const DISTRICT_STYLE = {
  trade: {
    wallT: 0.4, halfTimber: true, jetty: true,
    ground: ['stoneWhite', 'stoneWhite', 'stoneGrey'], upper: ['plaster', 'plasterWarm'],
    roof: ['roofBlue'], pitch: [0.85, 1.05], over: 0.6, roofT: 0.25,
    winGap: 2.9, chimney: 0.55, dormer: 0.4,
    biz: { shop: 0.48, home: 0.28, tavern: 0.1, workshop: 0.14 },
  },
  oldtown: {
    wallT: 0.4, halfTimber: true, jetty: true,
    ground: ['stoneGrey', 'stoneGrey', 'stoneWhite', 'plaster'], upper: ['plaster', 'plasterWarm', 'plaster'],
    roof: ['roofBlue', 'roofSlate', 'roofSlate'], pitch: [0.9, 1.15], over: 0.55, roofT: 0.25,
    winGap: 3.0, chimney: 0.7, dormer: 0.25,
    biz: { home: 0.58, shop: 0.14, tavern: 0.1, workshop: 0.18 },
  },
  cathedral: {
    wallT: 0.4, quoins: true, cornice: true, surrounds: true, oriels: true, noTone: true, knee: [0, 0, 0.7, 1.3],
    ground: ['stoneGrey', 'stoneGreyWarm', 'stoneGreyCool'], upper: ['stoneGrey', 'stoneGreyWarm', 'stoneGreyCool', 'plaster'],
    roof: ['roofBlue'], pitch: [0.8, 0.95], over: 0.5, roofT: 0.25,
    winGap: 2.7, chimney: 0.5, dormer: 0.45,
    biz: { home: 0.48, shop: 0.24, mage: 0.16, tavern: 0.12 },
  },
  mage: {
    wallT: 0.4, arcane: true, cornice: true, finials: true,
    ground: ['stoneWhite', 'stoneGrey'], upper: ['stoneWhite', 'stoneWhite', 'stoneGrey'],
    roof: ['roofPurple'], pitch: [1.3, 1.6], over: 0.5, roofT: 0.25,
    winGap: 2.8, chimney: 0.4, dormer: 0.5,
    biz: { mage: 0.46, home: 0.28, shop: 0.16, tavern: 0.1 },
  },
  dwarven: {
    wallT: 0.6, buttress: true, heavyLintel: true,
    ground: ['stoneDark'], upper: ['stoneDark'],
    roof: ['roofRed'], pitch: [0.5, 0.62], over: 0.9, roofT: 0.45,
    winGap: 3.6, chimney: 1.0, bigChimney: true, dormer: 0,
    biz: { workshop: 0.5, home: 0.24, shop: 0.16, tavern: 0.1 },
  },
};

// 命名建筑：业态 + 外观特色
export const NAMED = {
  暴风城银行: { biz: 'bank', door: [2.2, 2.9], banners: true, columns: true, ground: 'stoneWhite', upper: 'stoneWhite', noJetty: true },
  拍卖行: { biz: 'auction', door: [2.2, 2.9], banners: true, ground: 'stoneWhite' },
  金狮旅店: { biz: 'tavern', inn: true, door: [1.8, 2.7] },
  武器铺: { biz: 'weapons', door: [1.8, 2.7] },
  裁缝铺: { biz: 'tailor', door: [1.8, 2.7] },
  屠宰之羊酒馆: { biz: 'tavern', arcaneTavern: true, door: [1.8, 2.7] },
  奥术商店: { biz: 'arcaneShop', door: [1.8, 2.7] },
  炼金房: { biz: 'alchemy', door: [1.8, 2.7] },
  猪与哨子酒馆: { biz: 'tavern', door: [1.8, 2.7] },
  军情七处: { biz: 'si7', door: [1.8, 2.7], banners: true },
  勇士大厅: { biz: 'warriors', door: [2.2, 2.9], banners: true },
  孤儿院: { biz: 'orphanage', door: [1.8, 2.7] },
  市政厅: { biz: 'cityhall', door: [2.2, 2.9], banners: true, columns: true, noJetty: true },
  铁炉堡商栈: { biz: 'dwarfShop', door: [2.0, 2.8] },
  矮人工坊: { biz: 'workshop', door: [2.2, 2.9] },
};

// 业态中文名（报告 / HUD 用）
export const BIZ_LABEL = {
  home: '住家', shop: '店铺', tavern: '酒馆', workshop: '工坊', mage: '法师',
  bank: '银行', auction: '拍卖行', weapons: '武器铺', tailor: '裁缝铺', arcaneShop: '奥术商店',
  alchemy: '炼金房', si7: '军情七处', warriors: '勇士大厅', orphanage: '孤儿院', cityhall: '市政厅', dwarfShop: '商栈',
};

export function pick(R, arr) {
  return arr[Math.floor(R() * arr.length) % arr.length];
}

export function pickWeighted(R, table) {
  const entries = Object.entries(table);
  let t = R() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) {
    t -= w;
    if (t <= 0) return k;
  }
  return entries[entries.length - 1][0];
}
