// 角色外观(全部原创造型,按原作人物的"定位"设计:配色/轮廓/武器类型)。
const NINJA_BAND = { band: '#1e3a7a', plate: '#c9d0da', tails: true };

export const LOOKS = {
  // ---------------- 忍界
  shippu: { // 金发护目镜 · 红围巾 · 风之螺旋
    skin: '#f6d0a8', hair: '#f2c040', hairStyle: 'shippu', eye: '#e09a20', scarf: { color: '#d02020', n: 8 },
    top: '#ff8020', top2: '#1c1c24', topStyle: 'jacket', sleeve: 'long', sleeveColor: '#1c1c24',
    pants: '#3a3a44', legWrap: '#eeeeea', shoe: '#1c1c24', shoeStyle: 'sandal',
  },

  yasha: { // 黑发白挑染 · 靛蓝高领 · 雷与火 · 背剑
    skin: '#f2d6bc', hair: '#16141e', hairStyle: 'yasha', eye: '#8a5ad0', top: '#2a2a6a', topStyle: 'shirt', sleeve: 'short', sleeveColor: '#2a2a6a',
    highCollar: '#2a2a6a', pants: '#1a1a22', pantsStyle: 'normal', shoe: '#1a1a22', shoeStyle: 'boot', gloves: '#1a1a22',
    back: 'sword', weapon: { type: 'chokuto', len: 50, hilt: '#f0f0f0', color: '#dfe6ee' }, holdWeapon: false,
  },

  ryusa: { // 铜红短发 · 砂色兜帽斗篷 · 背负陶瓮
    skin: '#f0d8c0', hair: '#b85a3a', hairStyle: 'ryusa', eye: '#3ab0a0', eyeStyle: 'narrow', sclera: '#f6f6ec',
    top: '#5a3a24', topStyle: 'shirt', sleeve: 'long', cloak: { color: '#d8c4a0' }, pants: '#4a3020', shoe: '#3a2a1a', shoeStyle: 'boot', belt: '#8a6a40',
    back: 'gourd', build: { chest: 0.95 },
  },

  raiga: { // 银白乱发 · 灰面罩 · 橄榄战术背心
    skin: '#eed2b4', hair: '#e0e4ea', hairStyle: 'raiga', eye: '#5a5a62', mask: 'lower', maskColor: '#3a3c44', ponytail: { n: 3 },
    top: '#1e2a48', top2: '#5a6a3a', topStyle: 'vest', sleeve: 'long',
    pants: '#1e2a48', shoe: '#1a1a22', shoeStyle: 'sandal', gloves: '#1a1a1e', weapon: { type: 'kunai', len: 15 }, holdWeapon: false,
  },

  karasu: { // 黑长发低马尾 · 赤瞳 · 银色新月纹黑长衣
    skin: '#eed6c0', hair: '#141218', hairStyle: 'karasu', eye: '#d01828', marks: 'lines', ponytail: { n: 4 },
    top: '#141218', topStyle: 'shirt', sleeve: 'long',
    cloak: { color: '#18161e', pattern: '#c8ccd8' }, highCollar: '#18161e', pants: '#2a2a32', shoe: '#1a1a22', shoeStyle: 'boot',
    weapon: { type: 'kunai', len: 15 }, holdWeapon: false,
  },

  // ---------------- 魂界
  souga: { // 橙发黑衣 · 巨刃斩月
    skin: '#f4d2b0', hair: '#a01828', hairStyle: 'souga', eye: '#6a3a1a', top: '#16141a', topStyle: 'kimono', sleeve: 'wide', sleeveColor: '#16141a',
    pants: '#16141a', pantsStyle: 'hakama', shoe: '#c8a060', shoeStyle: 'tabi', sash: '#f0f0f0', strap: '#a83020',
    weapon: { type: 'cleaver', len: 74 }, holdWeapon: true, build: { chest: 1.05 },
  },
  hyorin: { // 白发少年队长 · 冰龙
    skin: '#f4dcc6', hair: '#bfe6ff', hairStyle: 'hyorin', eye: '#6ac8f0', scale: 0.9, top: '#16141a', topStyle: 'kimono', sleeve: 'wide', sleeveColor: '#16141a',
    pants: '#16141a', pantsStyle: 'hakama', shoe: '#c8a060', shoeStyle: 'tabi', sash: '#2a9a8a',
    coat: { color: '#f6f6f2', trim: '#d0d0c8', len: 1.05 }, weapon: { type: 'katana', len: 58, hilt: '#2a5a7a', guard: '#9adce8', color: '#e6f4fa' }, holdWeapon: true,
  },
  hizakura: { // 黑长发贵公子 · 千樱花刃
    skin: '#f6e0cc', hair: '#3a2a4a', hairStyle: 'hizakura', eye: '#7a7a8a', ponytail: { n: 6 }, eyeStyle: 'narrow', top: '#16141a', topStyle: 'kimono', sleeve: 'wide', sleeveColor: '#16141a',
    pants: '#16141a', pantsStyle: 'hakama', shoe: '#c8a060', shoeStyle: 'tabi',
    coat: { color: '#f6f6f2', trim: '#ff9ac4', len: 1.15, sleeves: true }, weapon: { type: 'katana', len: 56, hilt: '#5a2a4a', guard: '#e8c0d0' }, holdWeapon: true, build: { leg: 1.04 },
  },
  kyouken: { // 狂乱长刺头 · 锯齿刀
    skin: '#e6c4a0', hair: '#141218', hairStyle: 'kyouken', eye: '#2a2a2a', eyepatch: true, marks: 'scar', scale: 1.14,
    top: '#16141a', topStyle: 'kimono', sleeve: 'wide', sleeveColor: '#16141a', pants: '#16141a', pantsStyle: 'hakama', shoe: '#c8a060', shoeStyle: 'tabi',
    coat: { color: '#8a8a88', trim: '#5a5a58', len: 1.0, ragged: true }, weapon: { type: 'jagged', len: 62, hilt: '#3a3a3a', guard: '#7a7a7a', color: '#c8ccd0' }, holdWeapon: true,
    build: { chest: 1.15, armW: 1.15, legW: 1.1 },
  },
  genshu: { // 背头白袍 · 幻术与鬼道
    skin: '#f2d8c0', hair: '#e0e0e8', hairStyle: 'genshu', eye: '#d8a020', eyeStyle: 'narrow', top: '#f2f2ee', topStyle: 'uniform', top2: '#c8c8c0', sleeve: 'long',
    pants: '#f2f2ee', pantsStyle: 'hakama', shoe: '#2a2a30', shoeStyle: 'tabi', sash: '#5a3a8a',
    coat: { color: '#f8f8f6', trim: '#d8d8d0', len: 1.25, sleeves: true }, weapon: { type: 'katana', len: 56, hilt: '#3a2a4a', guard: '#c8a040' }, holdWeapon: true, build: { leg: 1.05 },
  },
  // ---------------- 援助
  suiei: { skin: '#f2d2b0', hair: '#121216', hairStyle: 'suiei', eye: '#1a1a1a', top: '#2e9a3a', topStyle: 'jumpsuit', top2: '#c8a038', sleeve: 'long', pants: '#2e9a3a', legWrap: '#e86a2a', shoe: '#2a6a2a', shoeStyle: 'sandal', bandage: true, headband: { band: '#c03030', plate: '#c9d0da', tails: true } },
  senjin: { skin: '#f0cfa8', hair: '#f2f2f2', hairStyle: 'senjin', eye: '#3a2a1a', marks: 'lines', top: '#5a7a4a', topStyle: 'shirt', sleeve: 'long', pants: '#5a7a4a', shoe: '#5a3a24', shoeStyle: 'sandal', coat: { color: '#c83a2a', trim: '#8a2a1a', len: 0.8 }, scale: 1.08, back: 'scroll' },
  juushou: { skin: '#f6e2d0', hair: '#24204a', hairStyle: 'juushou', eye: '#d8d0f0', blankEye: true, top: '#cfc8e8', topStyle: 'shirt', sleeve: 'long', pants: '#24224a', shoe: '#24224a', shoeStyle: 'sandal', headband: { band: '#1e2a48', plate: '#c9d0da', tails: false }, scale: 0.95 },
  messhi: { skin: '#f2dcc8', hair: '#121418', hairStyle: 'messhi', eye: '#1e2a5a', glasses: true, top: '#f6f6f6', topStyle: 'uniform', top2: '#3a6ad0', sleeve: 'long', pants: '#f6f6f6', shoe: '#e8e8e8', weapon: { type: 'bow' }, holdWeapon: true },
  tatehana: { skin: '#f6dcc4', hair: '#ff7a2e', hairStyle: 'tatehana', eye: '#7a4a2a', top: '#f2f2ee', topStyle: 'school', top2: '#3a4a7a', sleeve: 'short', pants: '#3a4a7a', pantsStyle: 'normal', shoe: '#5a3a2a', scale: 0.94 },
  boukage: { skin: '#f0d4b4', hair: '#e8d070', hairStyle: 'boukage', eye: '#3a3a3a', top: '#2a3a2a', topStyle: 'kimono', sleeve: 'wide', sleeveColor: '#2a3a2a', pants: '#2a3a2a', pantsStyle: 'hakama', shoe: '#5a3a24', shoeStyle: 'sandal', coat: { color: '#3a5a3a', trim: '#e8e8e0', len: 1.1 }, weapon: { type: 'cane', len: 50 }, holdWeapon: true },
};

for (const k in LOOKS) LOOKS[k].id = k;
