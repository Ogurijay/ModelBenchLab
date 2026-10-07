// 地图:地砖网格 + 物件。坐标单位为 16px 格。
// 物件字段:t 精灵类型, x/y/w/h 占地, act 交互组, name 显示名,
//   spot 使用位(玩家走到该格并朝 dir), up 升级物品 id(拥有时切换变体), need 需购买物品 id 才出现,
//   solid 默认 true, deco 纯装饰(不可交互)。

const HOME = [
  '##################',
  '#==n===n==#==n===#',
  '#.........#,,,,,,#',
  '#.........#,,,,,,#',
  '#..........,,,,,,#',
  '#.........#,,,,,,#',
  '#.........########',
  '#.........#==n===#',
  '#..........::::::#',
  '#.........#::::::#',
  '#.........#::::::#',
  '#.........#::::::#',
  '########EE########',
];

const CAFE = [
  '##############',
  '#==n===n===n=#',
  '#oooooooooo,,#',
  '#oooooooooo,,#',
  '#oooooooooooo#',
  '#oooooooooooo#',
  '#oooooooooooo#',
  '#oooooooooooo#',
  '#oooooooooooo#',
  '######EE######',
];

const SHOP = [
  '#############',
  '#==n==n==n==#',
  '#___________#',
  '#___________#',
  '#___________#',
  '#___________#',
  '#___________#',
  '#___________#',
  '######EE#####',
];

const GYM = [
  '#############',
  '#==n==n==n==#',
  '#mmmmmmmmm::#',
  '#mmmmmmmmm::#',
  '#..........:#',
  '#...........#',
  '#...........#',
  '#...........#',
  '######EE#####',
];

const GARAGE = [
  '##############',
  '#=n====n===n=#',
  '#cccccccccccc#',
  '#cccccccccccc#',
  '#cccccccccccc#',
  '#cccccccccccc#',
  '#cccccccccccc#',
  '#cccccccccccc#',
  '######EE######',
];

function buildTown() {
  const W = 44, H = 34;
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const fill = (x0, y0, x1, y1, ch) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y] && g[y][x] !== undefined) g[y][x] = ch;
  };
  // 散落的花草
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    if (h - Math.floor(h) < 0.08) g[y][x] = ',';
  }
  // 马路与人行道
  fill(0, 14, W - 1, 14, 's'); fill(0, 18, W - 1, 18, 's');
  fill(0, 15, W - 1, 17, 'r');
  for (let x = 0; x < W; x += 2) g[16][x] = 'h';
  fill(19, 0, 19, H - 1, 's'); fill(23, 0, 23, H - 1, 's');
  fill(20, 0, 22, H - 1, 'r');
  for (let y = 0; y < H; y += 2) if (y < 14 || y > 18) g[y][21] = 'v';
  fill(20, 15, 22, 17, 'r');
  // 西北:自家与老杰叔家
  fill(6, 9, 6, 13, 'p'); fill(14, 9, 14, 13, 'p');
  fill(2, 11, 11, 11, 'f'); g[11][6] = 'p';
  fill(2, 3, 2, 10, 'l'); fill(11, 3, 11, 10, 'l'); fill(2, 3, 11, 3, 'b'); g[3][2] = 'f'; g[3][11] = 'f';
  g[9][4] = 'F'; g[9][8] = 'F';
  // 东北:咖啡馆、家具店
  fill(28, 10, 28, 13, 's'); fill(36, 10, 36, 13, 's');
  fill(24, 10, 41, 10, 's');
  // 西南:修车厂、健身房
  fill(2, 25, 18, 26, 'p');
  fill(12, 27, 18, 27, ',');
  // 东南:公园
  fill(27, 20, 36, 25, 'x');
  fill(31, 19, 32, 19, 'p');
  fill(24, 22, 26, 23, 'p');
  fill(33, 26, 34, 28, 'p');
  fill(35, 26, 41, 31, 'w');
  fill(35, 28, 37, 28, 'k');
  g[26][35] = 'p'; g[27][35] = 'p';
  g[20][25] = 'F'; g[25][25] = 'F'; g[20][38] = 'F';
  fill(24, 32, 41, 32, 'b');
  // 地图四周树木
  const trees = [];
  for (let x = 0; x < W; x++) {
    if (x >= 19 && x <= 23) continue;
    if (x % 2 === 0) { trees.push([x, 0]); trees.push([x, H - 1]); }
  }
  for (let y = 2; y < H - 1; y++) {
    if (y >= 14 && y <= 18) continue;
    if (y % 2 === 0) { trees.push([0, y]); trees.push([W - 1, y]); }
  }
  trees.push([4, 1], [9, 1], [15, 1], [17, 2], [26, 2], [31, 2], [38, 2], [41, 3],
    [2, 28], [5, 30], [9, 28], [12, 30], [16, 31], [3, 32],
    [24, 26], [25, 30], [29, 30], [32, 31], [41, 21], [41, 24], [38, 19]);
  for (const [x, y] of trees) g[y][x] = 'T';
  return { grid: g.map((r) => r.join('')), trees };
}

const town = buildTown();

export const MAPS = {
  home: {
    name: '我的小屋', theme: 'home', tiles: HOME, music: 'home', room: 'home',
    entry: { x: 8, y: 11, dir: 'up' }, exitTo: { map: 'town', x: 6, y: 9, dir: 'down' },
    objects: [
      { id: 'bed', t: 'bed', x: 1, y: 2, w: 2, h: 2, act: 'bed', name: '床', up: 'bed2', spot: { x: 1, y: 4, dir: 'up' } },
      { id: 'nightstand', t: 'nightstand', x: 3, y: 2, deco: true },
      { id: 'bookshelf', t: 'bookshelf', x: 5, y: 2, act: 'bookshelf', name: '书架', spot: { x: 5, y: 3, dir: 'up' } },
      { id: 'computer', t: 'computer', x: 7, y: 2, w: 2, act: 'computer', name: '电脑', need: 'computer', spot: { x: 7, y: 3, dir: 'up' } },
      { id: 'phone', t: 'phone', x: 9, y: 2, act: 'phone', name: '电话', spot: { x: 9, y: 3, dir: 'up' } },
      { id: 'tv', t: 'tv', x: 4, y: 6, w: 2, act: 'tv', name: '电视', up: 'tv2', spot: { x: 4, y: 7, dir: 'up' } },
      { id: 'sofa', t: 'sofaBack', x: 4, y: 9, w: 2, act: 'sofa', name: '沙发', up: 'sofa2', spot: { x: 4, y: 10, dir: 'up' } },
      { id: 'aquarium', t: 'aquarium', x: 7, y: 6, w: 2, act: 'aquarium', name: '鱼缸', need: 'aquarium', spot: { x: 7, y: 7, dir: 'up' } },
      { id: 'easel', t: 'easel', x: 1, y: 6, act: 'easel', name: '画架', need: 'easel', spot: { x: 2, y: 6, dir: 'left' } },
      { id: 'treadmill', t: 'treadmill', x: 1, y: 8, act: 'treadmill', name: '跑步机', need: 'treadmill', spot: { x: 2, y: 8, dir: 'left' } },
      { id: 'guitar', t: 'guitar', x: 9, y: 9, act: 'guitar', name: '吉他', need: 'guitar', spot: { x: 8, y: 9, dir: 'right' } },
      { id: 'plant1', t: 'plant', x: 1, y: 11, act: 'plant', name: '盆栽', need: 'plant1', spot: { x: 2, y: 11, dir: 'left' } },
      { id: 'plant2', t: 'plant', x: 9, y: 5, act: 'plant', name: '琴叶榕', need: 'plant2', spot: { x: 8, y: 5, dir: 'right' } },
      { id: 'fridge', t: 'fridge', x: 11, y: 2, act: 'fridge', name: '冰箱', spot: { x: 11, y: 3, dir: 'up' } },
      { id: 'stove', t: 'stove', x: 12, y: 2, act: 'stove', name: '灶台', spot: { x: 12, y: 3, dir: 'up' } },
      { id: 'counter', t: 'counter', x: 13, y: 2, act: 'counter', name: '洗碗池', spot: { x: 13, y: 3, dir: 'up' } },
      { id: 'trash', t: 'trash', x: 16, y: 2, act: 'trash', name: '垃圾桶', spot: { x: 16, y: 3, dir: 'up' } },
      { id: 'table', t: 'table', x: 14, y: 4, w: 2, act: 'table', name: '餐桌', spot: { x: 14, y: 5, dir: 'up' } },
      { id: 'toilet', t: 'toilet', x: 12, y: 8, act: 'toilet', name: '马桶', spot: { x: 12, y: 9, dir: 'up' } },
      { id: 'sink', t: 'sink', x: 14, y: 8, act: 'sink', name: '洗手台', spot: { x: 14, y: 9, dir: 'up' } },
      { id: 'shower', t: 'shower', x: 16, y: 8, act: 'shower', name: '淋浴间', spot: { x: 16, y: 9, dir: 'up' } },
      { id: 'bathtub', t: 'bathtub', x: 11, y: 11, w: 2, act: 'bathtub', name: '浴缸', need: 'bathtub', spot: { x: 13, y: 11, dir: 'left' } },
    ],
  },
  town: {
    name: '绿钻镇', theme: 'town', tiles: town.grid, music: 'town', room: 62, outdoor: true,
    entry: { x: 17, y: 13, dir: 'left' },
    objects: [
      { id: 'b_home', t: 'building', kind: 'home', x: 4, y: 4, w: 6, h: 5, door: 2, to: 'home', name: '我的小屋' },
      { id: 'b_jed', t: 'building', kind: 'jed', x: 12, y: 4, w: 6, h: 5, door: 2, to: null, name: '老杰叔的家' },
      { id: 'b_cafe', t: 'building', kind: 'cafe', x: 25, y: 5, w: 7, h: 5, door: 3, to: 'cafe', name: '绿钻咖啡馆' },
      { id: 'b_shop', t: 'building', kind: 'shop', x: 34, y: 5, w: 6, h: 5, door: 2, to: 'shop', name: '汪记家具' },
      { id: 'b_garage', t: 'building', kind: 'garage', x: 3, y: 20, w: 8, h: 5, door: 2, to: 'garage', name: '阿强修车厂' },
      { id: 'b_gym', t: 'building', kind: 'gym', x: 12, y: 20, w: 6, h: 5, door: 3, to: 'gym', name: '活力健身房' },
      { id: 'mailbox', t: 'mailbox', x: 7, y: 12, act: 'mailbox', name: '邮箱', spot: { x: 6, y: 12, dir: 'right' } },
      { id: 'busstop', t: 'busstop', x: 18, y: 13, act: 'busstop', name: '公交站牌', spot: { x: 17, y: 13, dir: 'right' } },
      { id: 'sign', t: 'signpost', x: 1, y: 13, w: 2, deco: true },
      { id: 'fountain', t: 'fountain', x: 31, y: 22, w: 2, h: 2, act: 'fountain', name: '许愿喷泉', spot: { x: 31, y: 24, dir: 'up' } },
      { id: 'chess', t: 'chess', x: 28, y: 21, act: 'chess', name: '棋桌', spot: { x: 28, y: 22, dir: 'up' } },
      { id: 'bench1', t: 'bench', x: 29, y: 25, w: 2, act: 'bench', name: '长椅', spot: { x: 29, y: 26, dir: 'up' } },
      { id: 'bench2', t: 'bench', x: 34, y: 21, w: 2, act: 'bench', name: '长椅', spot: { x: 34, y: 22, dir: 'up' } },
      { id: 'lamp1', t: 'lamp', x: 24, y: 13, deco: true, light: true },
      { id: 'lamp2', t: 'lamp', x: 33, y: 13, deco: true, light: true },
      { id: 'lamp3', t: 'lamp', x: 12, y: 13, deco: true, light: true },
      { id: 'lamp4', t: 'lamp', x: 27, y: 19, deco: true, light: true },
      { id: 'lamp5', t: 'lamp', x: 36, y: 19, deco: true, light: true },
      { id: 'lamp6', t: 'lamp', x: 11, y: 25, deco: true, light: true },
      { id: 'hydrant', t: 'hydrant', x: 24, y: 19, deco: true },
      { id: 'pot1', t: 'flowerpot', x: 26, y: 10, deco: true },
      { id: 'pot2', t: 'flowerpot', x: 30, y: 10, deco: true },
      { id: 'pot3', t: 'flowerpot', x: 39, y: 10, deco: true },
      { id: 'boat', t: 'boat', x: 39, y: 29, w: 2, deco: true },
      { id: 'tires_out', t: 'tires', x: 2, y: 23, deco: true },
      { id: 'trash_town', t: 'trash', x: 33, y: 25, act: 'trash', name: '公共垃圾桶', spot: { x: 33, y: 26, dir: 'up' } },
    ],
  },
  cafe: {
    name: '绿钻咖啡馆', theme: 'cafe', tiles: CAFE, music: 'cafe', room: 75, hours: [7, 22],
    entry: { x: 6, y: 8, dir: 'up' }, exitTo: { map: 'town', x: 28, y: 10, dir: 'down' },
    objects: [
      { id: 'cafeCounter', t: 'cafeCounter', x: 2, y: 3, w: 3, act: 'cafeCounter', name: '柜台', spot: { x: 3, y: 4, dir: 'up' } },
      { id: 'menu', t: 'menuBoard', x: 6, y: 1, w: 2, deco: true, solid: false, wall: true },
      { id: 'ct1', t: 'cafeTable', x: 7, y: 4, act: 'cafeTable', name: '餐桌', spot: { x: 7, y: 5, dir: 'up' } },
      { id: 'ct2', t: 'cafeTable', x: 10, y: 4, act: 'cafeTable', name: '餐桌', spot: { x: 10, y: 5, dir: 'up' } },
      { id: 'ct3', t: 'cafeTable', x: 4, y: 7, act: 'cafeTable', name: '餐桌', spot: { x: 4, y: 8, dir: 'up' } },
      { id: 'ct4', t: 'cafeTable', x: 9, y: 7, act: 'cafeTable', name: '餐桌', spot: { x: 9, y: 8, dir: 'up' } },
      { id: 'cafeToilet', t: 'toilet', x: 12, y: 2, act: 'toilet', name: '洗手间', spot: { x: 12, y: 3, dir: 'up' } },
      { id: 'cafePlant', t: 'plant', x: 1, y: 2, deco: true },
      { id: 'cafePlant2', t: 'plant', x: 12, y: 8, deco: true },
    ],
  },
  shop: {
    name: '汪记家具', theme: 'shop', tiles: SHOP, music: 'shop', room: 72, hours: [9, 21],
    entry: { x: 6, y: 7, dir: 'up' }, exitTo: { map: 'town', x: 36, y: 10, dir: 'down' },
    objects: [
      { id: 'shopCounter', t: 'shopCounter', x: 2, y: 3, w: 2, act: 'shopCounter', name: '收银台', spot: { x: 2, y: 4, dir: 'up' } },
      { id: 'catalog', t: 'catalog', x: 6, y: 3, act: 'shopCounter', name: '商品目录', spot: { x: 6, y: 4, dir: 'up' } },
      { id: 'd_sofa', t: 'sofa', x: 8, y: 2, w: 2, variant: 1, deco: true },
      { id: 'd_tv', t: 'tv', x: 8, y: 5, w: 2, variant: 1, deco: true },
      { id: 'd_aq', t: 'aquarium', x: 2, y: 6, w: 2, deco: true },
      { id: 'd_plant', t: 'plant', x: 11, y: 2, deco: true },
      { id: 'd_easel', t: 'easel', x: 11, y: 5, deco: true },
      { id: 'd_guitar', t: 'guitar', x: 5, y: 6, deco: true },
    ],
  },
  gym: {
    name: '活力健身房', theme: 'gym', tiles: GYM, music: 'gym', room: 55, hours: [6, 23],
    entry: { x: 6, y: 7, dir: 'up' }, exitTo: { map: 'town', x: 15, y: 25, dir: 'down' },
    objects: [
      { id: 'tm1', t: 'treadmill', x: 1, y: 2, act: 'treadmill', name: '跑步机', spot: { x: 1, y: 3, dir: 'up' } },
      { id: 'tm2', t: 'treadmill', x: 2, y: 2, act: 'treadmill', name: '跑步机', spot: { x: 2, y: 3, dir: 'up' } },
      { id: 'weights', t: 'weights', x: 4, y: 2, w: 2, act: 'weights', name: '举重床', spot: { x: 4, y: 3, dir: 'up' } },
      { id: 'bag', t: 'punchbag', x: 8, y: 2, act: 'punchbag', name: '沙袋', spot: { x: 8, y: 3, dir: 'up' } },
      { id: 'gymShower', t: 'shower', x: 11, y: 2, act: 'shower', name: '淋浴间', spot: { x: 11, y: 3, dir: 'up' } },
      { id: 'gymToilet', t: 'toilet', x: 10, y: 2, act: 'toilet', name: '洗手间', spot: { x: 10, y: 3, dir: 'up' } },
      { id: 'gymPlant', t: 'plant', x: 1, y: 7, deco: true },
    ],
  },
  garage: {
    name: '阿强修车厂', theme: 'garage', tiles: GARAGE, music: 'garage', room: 38, hours: [8, 20],
    entry: { x: 6, y: 7, dir: 'up' }, exitTo: { map: 'town', x: 5, y: 25, dir: 'down' },
    objects: [
      { id: 'car', t: 'car', x: 4, y: 3, w: 3, h: 2, act: 'car', name: '待修汽车', spot: { x: 5, y: 5, dir: 'up' } },
      { id: 'toolbench', t: 'toolbench', x: 1, y: 2, w: 2, act: 'toolbench', name: '工具台', spot: { x: 1, y: 3, dir: 'up' } },
      { id: 'tires', t: 'tires', x: 11, y: 2, deco: true },
      { id: 'drum', t: 'drum', x: 12, y: 2, deco: true },
      { id: 'drum2', t: 'drum', x: 12, y: 7, deco: true },
    ],
  },
};

export const TOWN_TREES = town.trees;
export const SOLID_TILES = new Set(['#', '=', 'n', 'f', 'l', 'b', 'F', 'w', 'T']);
