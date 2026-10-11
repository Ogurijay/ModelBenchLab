// 闯关模式数据:按原版 stage.dat 结构 —— 5 大关 × 5 幕(1-1 … 5-5),每幕若干段(段间锁镜头,清敌后 GO→),外加生存关。
// 敌人条目 [角色, 基础数量, {hp, boss}];实际数量 = 基础数量 × 我方人数(CRAZY! 难度每人算 2 人),首领不乘。
// 敌人血量取原版:山贼/猎人 50、巫师 100、拳师 150、壮汉/骑士 200、修女/英雄 250,首领见各幕。'hero' = 随机英雄。
const S = (...phases) => ({ phases });
export const STAGES = [
  {
    name: 'Stage 1 · 松谷 Pine Valley', bg: 'forest', music: 'stage',
    acts: [
      S([['thug', 2], ['poacher', 1]], [['thug', 3]]),
      S([['thug', 2], ['poacher', 2]], [['thug', 3], ['poacher', 1]]),
      S([['thug', 3]], [['poacher', 3]], [['thug', 2], ['poacher', 2]]),
      S([['thug', 3], ['poacher', 1]], [['brute', 1, { hp: 200, boss: true }], ['thug', 2]]),
      S([['thug', 2], ['poacher', 2]], [['brute', 2, { hp: 200, boss: true }], ['poacher', 2]]),
    ],
  },
  {
    name: 'Stage 2 · 铁门监狱 Iron Gate', bg: 'prison', music: 'stage',
    acts: [
      S([['thug', 3], ['poacher', 2]], [['thug', 4]]),
      S([['poacher', 3], ['thug', 2]], [['hero', 1, { hp: 250 }], ['thug', 2]]),
      S([['thug', 4]], [['brute', 1, { hp: 200, boss: true }], ['hero', 1, { hp: 250 }]]),
      S([['hero', 1, { hp: 250 }], ['poacher', 3]], [['brute', 2, { hp: 200 }], ['thug', 2]]),
      S([['thug', 3], ['poacher', 2]], [['hero', 2, { hp: 250 }], ['brute', 1, { hp: 200, boss: true }]]),
    ],
  },
  {
    name: 'Stage 3 · 龙脊长城 Dragon Wall', bg: 'wall', music: 'stage',
    acts: [
      S([['hexer', 2, { hp: 100 }], ['thug', 2]], [['viper', 2, { hp: 150 }], ['poacher', 2]]),
      S([['viper', 2, { hp: 150 }], ['hexer', 1, { hp: 100 }]], [['hero', 1, { hp: 250 }], ['thug', 3]]),
      S([['hexer', 2, { hp: 100 }], ['viper', 1, { hp: 150 }], ['poacher', 2]], [['hero', 2, { hp: 250 }]]),
      S([['viper', 2, { hp: 150 }], ['hexer', 2, { hp: 100 }]], [['hero', 1, { hp: 600, boss: true }]]),
      S([['thug', 3], ['poacher', 2]], [['gallantEx', 1, { hp: 1000, boss: true }]]),
    ],
  },
  {
    name: 'Stage 4 · 珊瑚岛 Coral Isle', bg: 'isle', music: 'stage',
    acts: [
      S([['mira', 1, { hp: 250 }], ['thug', 3]], [['hero', 1, { hp: 250 }], ['poacher', 2]]),
      S([['hexer', 2, { hp: 100 }], ['mira', 1, { hp: 250 }], ['viper', 1, { hp: 150 }]], [['hero', 2, { hp: 250 }]]),
      S([['viper', 2, { hp: 150 }], ['brute', 1, { hp: 200 }], ['mira', 1, { hp: 250 }]], [['hero', 2, { hp: 250 }], ['hexer', 1, { hp: 100 }]]),
      S([['thug', 3], ['poacher', 2]], [['pyra', 1, { hp: 400, boss: true }], ['glacia', 1, { hp: 400, boss: true }]]),
      { phases: [[['tempest', 1, { hp: 1500, boss: true }]]], endless: ['thug', 'poacher'] },
    ],
  },
  {
    name: 'Stage 5 · 黑曜塔 Obsidian Spire', bg: 'spire', music: 'boss',
    acts: [
      S([['warden', 2, { hp: 150 }], ['sentinel', 1, { hp: 200 }]], [['monk', 2, { hp: 200 }], ['mira', 1, { hp: 250 }]]),
      S([['sentinel', 2, { hp: 200 }], ['warden', 1, { hp: 150 }]], [['nocturne', 1, { hp: 750, boss: true }]]),
      S([['monk', 2, { hp: 200 }], ['warden', 2, { hp: 150 }]], [['gallantEx', 1, { hp: 1000, boss: true }]]),
      S([['sentinel', 2, { hp: 200 }], ['mira', 1, { hp: 250 }]], [['tempest', 1, { hp: 1000, boss: true }]]),
      S([['warden', 2, { hp: 200 }], ['monk', 1, { hp: 200 }]], [['malakar', 1, { hp: 2500, boss: true }]]),
    ],
  },
  { name: 'Survival · 生存挑战', bg: 'temple', music: 'battle3', survival: true, acts: [] },
];

// 生存关:无尽编号关卡,10 关一个循环:山贼猎人 → 拳师巫师 → 壮汉武僧骑士 → 英雄 → 首领(第 7/8/9/10 关依次为夜之君主、卸甲骑士、冰火合体、黑曜塔之主)
export function survivalWave(n, rnd, heroes) {
  const k = ((n - 1) % 10) + 1, lap = Math.floor((n - 1) / 10);
  const hp = (base) => Math.round(base * (1 + lap * 0.25));
  const out = [];
  const add = (id, c, h, boss) => { for (let i = 0; i < c; i++) out.push([id, 1, { hp: hp(h), boss }]); };
  if (k <= 2) { add('thug', 2 + k + lap, 50); add('poacher', 1 + k, 50); }
  else if (k <= 4) { add('viper', 1 + (k - 2), 150); add('hexer', k - 2, 100); add('thug', 2, 50); }
  else if (k <= 6) { add('brute', 1, 200); add('monk', k - 4, 200); add('sentinel', k - 4, 200); }
  else if (k === 7) add('nocturne', 1, 750, true);
  else if (k === 8) add('gallantEx', 1, 1000, true);
  else if (k === 9) add('tempest', 1, 1000, true);
  else add('malakar', 1, 2500, true);
  if (k >= 5 && k <= 6) for (let i = 0; i < 1 + lap; i++) out.push([heroes[Math.floor(rnd() * heroes.length)], 1, { hp: hp(250) }]);
  return { enemies: out, boss: k >= 7 };
}
