// ============================================================
// 像素大亨 — 静态数据表（单一事实源）
// 12 行业 × 121 种业态；6 城区；28 项科技；28 种城市事件；
// 5 档营销；8 支股票；3 家对手；17 步目标链；13 项成就；15 项机制说明。
// 所有数值只在这里定义，结算公式见 sim.js。
// ============================================================

export const MONTH_DAYS = 30;
export const SEASONS = ['春', '夏', '秋', '冬'];
export const SEASON_ICONS = ['🌸', '☀️', '🍁', '❄️'];

// ---------- 供应链货品 ----------
export const GOODS = {
  crop:  '农产品',   meat:  '肉蛋食材', flour: '粮油米面', fabric: '布料织品',
  wood:  '木材板材', elec:  '电子元件', med:   '药材药品', drink:  '酒水饮品',
  fuel:  '燃油能源', steel: '钢材',     print: '纸品印刷', data:   '云数据',
};

// ---------- 行业 ----------
// mat 材料成本率 | elast 价格弹性 | wage 人均日薪基准 | sea 四季需求 [春夏秋冬]
// pal 建筑配色 {w 墙 r 顶 a 点缀 s 招牌}
export const INDUSTRIES = {
  food:    { name: '餐饮',     mat: 0.35, elast: 1.30, wage: 90,  sea: [1, 1.05, 1, 1.05],
             pal: { w: '#c96a4a', r: '#8a3b2a', a: '#ffd166', s: '#e8452f' } },
  retail:  { name: '零售',     mat: 0.45, elast: 1.40, wage: 85,  sea: [1, 1, 1.05, 1.1],
             pal: { w: '#4a7dc9', r: '#2a4d8a', a: '#9ad1ff', s: '#2f7de8' } },
  service: { name: '生活服务', mat: 0.15, elast: 1.10, wage: 95,  sea: [1, 1, 1, 1],
             pal: { w: '#3aa89b', r: '#20655e', a: '#b8f3e6', s: '#1fae8e' } },
  fun:     { name: '娱乐',     mat: 0.18, elast: 1.25, wage: 100, sea: [1, 1.15, 1, 1.1],
             pal: { w: '#8a5ac9', r: '#54308a', a: '#ffa3e0', s: '#b03fe8' } },
  tech:    { name: '科技互联网', mat: 0.20, elast: 0.90, wage: 220, sea: [1, 1, 1, 1],
             pal: { w: '#3c6d8f', r: '#1f3d54', a: '#6ef0ff', s: '#28c4e8' } },
  mfg:     { name: '制造业',   mat: 0.40, elast: 0.80, wage: 110, sea: [1, 1, 1, 1],
             pal: { w: '#8f8578', r: '#57504a', a: '#ffb35c', s: '#a8845c' } },
  agri:    { name: '农业',     mat: 0.25, elast: 0.90, wage: 70,  sea: [1.15, 1.2, 1.1, 0.65],
             pal: { w: '#6da84c', r: '#3e6b2a', a: '#d6f59a', s: '#59c243' } },
  edu:     { name: '文教',     mat: 0.12, elast: 0.95, wage: 130, sea: [1.05, 0.85, 1.1, 1],
             pal: { w: '#c9a04a', r: '#8a6a2a', a: '#ffe9a3', s: '#e8a52f' } },
  health:  { name: '医疗健康', mat: 0.25, elast: 0.70, wage: 180, sea: [1, 0.95, 1, 1.1],
             pal: { w: '#c4ccd4', r: '#7d8a96', a: '#ff6b6b', s: '#e84f4f' } },
  hotel:   { name: '酒店文旅', mat: 0.20, elast: 1.10, wage: 100, sea: [1, 1.2, 1.05, 0.85],
             pal: { w: '#b08d57', r: '#6e5530', a: '#ffe08a', s: '#d4a017' } },
  trans:   { name: '交通物流', mat: 0.30, elast: 1.00, wage: 100, sea: [1, 1, 1, 1],
             pal: { w: '#c9884a', r: '#8a552a', a: '#ffd9a3', s: '#e8832f' } },
  fin:     { name: '金融',     mat: 0.08, elast: 0.85, wage: 250, sea: [1, 1, 1, 1],
             pal: { w: '#3f7d5a', r: '#24503a', a: '#ffe27a', s: '#2fb56a' } },
};
export const IND_IDS = Object.keys(INDUSTRIES);

// ---------- 业态（121 种） ----------
// T(行业, id, 名称, 档次1-4, 开店成本, 日基准营收, 基础人手, 选项{mk产出 nd需求 sea四季覆写})
const _types = [];
function T(ind, id, name, tier, cost, rev, staff, o = {}) {
  _types.push({ id, ind, name, tier, cost, rev, staff, mk: o.mk || null, nd: o.nd || null, sea: o.sea || null });
}
// 餐饮 12
T('food', 'baozi',    '包子铺',       1, 12000,  700,  2, { nd: ['flour'] });
T('food', 'noodle',   '兰州拉面馆',   1, 16000,  850,  2, { nd: ['flour', 'meat'] });
T('food', 'mala',     '麻辣烫店',     1, 18000,  950,  2, { nd: ['crop', 'meat'], sea: [1, 0.9, 1.05, 1.25] });
T('food', 'milktea',  '奶茶店',       1, 20000,  1000, 2, { nd: ['drink'], sea: [1, 1.35, 1, 0.75] });
T('food', 'bbq',      '烧烤大排档',   2, 30000,  1400, 3, { nd: ['meat', 'drink'], sea: [1, 1.4, 1.1, 0.7] });
T('food', 'coffee',   '街角咖啡馆',   2, 45000,  1500, 3, { nd: ['drink'] });
T('food', 'bakery',   '甜品烘焙坊',   2, 40000,  1400, 3, { nd: ['flour'] });
T('food', 'hotpot',   '老灶火锅店',   2, 60000,  2200, 5, { nd: ['meat', 'crop'], sea: [0.9, 0.7, 1.1, 1.5] });
T('food', 'sushi',    '寿司料理店',   3, 90000,  2600, 4, { nd: ['meat'] });
T('food', 'fastfood', '快餐连锁店',   3, 120000, 3200, 6, { nd: ['flour', 'meat'] });
T('food', 'western',  '西餐厅',       3, 150000, 3600, 6, { nd: ['meat', 'drink'] });
T('food', 'privchef', '私房菜馆',     4, 260000, 5200, 6, { nd: ['crop', 'meat'] });
// 零售 12
T('retail', 'kiosk',      '报刊小卖部', 1, 8000,   550,  1, { nd: ['print'] });
T('retail', 'fruit',      '水果店',     1, 14000,  800,  2, { nd: ['crop'] });
T('retail', 'conven',     '便利店',     1, 25000,  1100, 2, { nd: ['drink', 'print'] });
T('retail', 'stationery', '文具店',     1, 15000,  750,  2, { nd: ['print'] });
T('retail', 'flower',     '花店',       2, 20000,  900,  2, { nd: ['crop'], sea: [1.3, 1, 1, 0.85] });
T('retail', 'toy',        '玩具店',     2, 35000,  1200, 2, { nd: ['wood'] });
T('retail', 'shoes',      '鞋帽店',     2, 40000,  1300, 3, { nd: ['fabric'] });
T('retail', 'clothes',    '服装精品店', 2, 50000,  1600, 3, { nd: ['fabric'], sea: [1.1, 0.85, 1.1, 1.2] });
T('retail', 'book',       '独立书店',   2, 45000,  1200, 3, { nd: ['print'] });
T('retail', 'digital',    '数码配件店', 3, 80000,  2200, 3, { nd: ['elec'] });
T('retail', 'market',     '精品超市',   3, 160000, 3800, 8, { nd: ['crop', 'meat', 'drink'] });
T('retail', 'jewelry',    '珠宝行',     4, 300000, 5000, 4);
// 生活服务 10
T('service', 'barber',  '理发店',       1, 10000,  600,  2);
T('service', 'laundry', '干洗店',       1, 12000,  620,  1);
T('service', 'express', '快递驿站',     1, 15000,  700,  2, { nd: ['fuel'] });
T('service', 'repair',  '家电维修铺',   1, 12000,  650,  1, { nd: ['elec'] });
T('service', 'photo',   '照相馆',       2, 25000,  950,  2, { nd: ['print'] });
T('service', 'nail',    '美容美甲店',   2, 30000,  1100, 3);
T('service', 'pet',     '宠物店',       2, 35000,  1200, 2, { nd: ['meat'] });
T('service', 'gym',     '健身房',       3, 90000,  2400, 5);
T('service', 'house',   '家政公司',     3, 60000,  1800, 4);
T('service', 'wedding', '婚庆策划公司', 4, 180000, 3800, 5, { sea: [1.25, 0.9, 1.25, 0.8] });
// 娱乐 10
T('fun', 'billiard',  '台球厅',     1, 22000,  900,  2);
T('fun', 'boardgame', '桌游吧',     2, 30000,  1100, 2);
T('fun', 'arcade',    '街机游戏厅', 2, 40000,  1400, 2, { nd: ['elec'] });
T('fun', 'script',    '剧本杀馆',   2, 45000,  1500, 3, { nd: ['print'] });
T('fun', 'netcafe',   '电竞网咖',   2, 60000,  1800, 3, { nd: ['elec', 'data'] });
T('fun', 'escape',    '密室逃脱',   3, 80000,  2200, 4);
T('fun', 'skate',     '室内溜冰场', 3, 90000,  2000, 4, { sea: [1, 0.85, 1, 1.35] });
T('fun', 'bar',       '精酿酒吧',   3, 100000, 2600, 4, { nd: ['drink'] });
T('fun', 'ktv',       '量贩式KTV',  3, 120000, 3000, 6, { nd: ['drink'] });
T('fun', 'cinema',    '电影院',     4, 320000, 6000, 8, { nd: ['data'] });
// 科技互联网 10
T('tech', 'pcstore',    '电脑装机柜台', 2, 50000,  1600, 2,  { nd: ['elec'] });
T('tech', 'phone',      '手机专卖店',   2, 60000,  1900, 3,  { nd: ['elec'] });
T('tech', 'drone',      '无人机体验店', 2, 70000,  1800, 2,  { nd: ['elec'] });
T('tech', 'robot',      '机器人展销店', 3, 120000, 2800, 3,  { nd: ['elec'] });
T('tech', 'ecom',       '电商运营公司', 3, 140000, 3600, 6,  { nd: ['data', 'print'] });
T('tech', 'software',   '软件外包公司', 3, 150000, 3600, 8,  { nd: ['data'] });
T('tech', 'stream',     '直播传媒公司', 3, 160000, 4000, 6,  { nd: ['data'] });
T('tech', 'gamedev',    '游戏工作室',   3, 180000, 4200, 8,  { nd: ['data'] });
T('tech', 'datacenter', '云数据中心',   4, 500000, 9000, 10, { mk: 'data', nd: ['elec'] });
T('tech', 'ailab',      'AI 实验室',    4, 600000, 11000, 12, { nd: ['data', 'elec'] });
// 制造业 13
T('mfg', 'mill',      '面粉加工厂',   2, 60000,  1600, 5,  { mk: 'flour', nd: ['crop'] });
T('mfg', 'meatplant', '肉联加工厂',   2, 80000,  2000, 6,  { mk: 'meat', nd: ['fuel'] });
T('mfg', 'printfab',  '印刷厂',       2, 70000,  1800, 5,  { mk: 'print' });
T('mfg', 'toyfab',    '玩具厂',       2, 90000,  2200, 6,  { nd: ['wood'] });
T('mfg', 'textile',   '纺织厂',       2, 90000,  2200, 7,  { mk: 'fabric' });
T('mfg', 'garment',   '服装代工厂',   2, 100000, 2400, 8,  { nd: ['fabric'] });
T('mfg', 'furniture', '家具厂',       3, 140000, 3200, 8,  { mk: 'wood' });
T('mfg', 'brewery',   '精酿酿酒厂',   3, 160000, 3600, 7,  { mk: 'drink', nd: ['flour'] });
T('mfg', 'elecfab',   '电子装配厂',   3, 200000, 4600, 10, { mk: 'elec', nd: ['steel'] });
T('mfg', 'autoparts', '汽车零件厂',   3, 220000, 5000, 10, { nd: ['steel'] });
T('mfg', 'refinery',  '炼化厂',       4, 380000, 7000, 10, { mk: 'fuel' });
T('mfg', 'pharma',    '制药厂',       4, 400000, 8000, 12, { mk: 'med', nd: ['crop'] });
T('mfg', 'steelworks','炼钢厂',       4, 450000, 8500, 14, { mk: 'steel', nd: ['fuel'] });
// 农业 10
T('agri', 'veggie',      '有机菜园',   1, 10000, 500,  1, { mk: 'crop', sea: [1.2, 1.3, 1.1, 0.6] });
T('agri', 'honey',       '蜂蜜农场',   1, 15000, 550,  1, { mk: 'crop', sea: [1.4, 1.2, 0.9, 0.5] });
T('agri', 'orchard',     '果园',       1, 15000, 600,  2, { mk: 'crop', sea: [0.9, 1.3, 1.4, 0.6] });
T('agri', 'chicken',     '养鸡场',     1, 18000, 700,  2, { mk: 'meat' });
T('agri', 'flowerhouse', '花卉大棚',   2, 25000, 850,  2, { mk: 'crop', sea: [1.4, 1, 0.9, 0.8] });
T('agri', 'mushroom',    '菌菇培育房', 2, 30000, 900,  2, { mk: 'crop', sea: [1, 0.9, 1.2, 1.2] });
T('agri', 'fish',        '生态鱼塘',   2, 30000, 1000, 2, { mk: 'meat', sea: [1, 1.25, 1.1, 0.75] });
T('agri', 'rice',        '稻田农庄',   2, 35000, 1000, 3, { mk: 'flour', sea: [0.8, 1.2, 1.5, 0.6] });
T('agri', 'dairy',       '奶牛牧场',   2, 40000, 1200, 3, { mk: 'meat' });
T('agri', 'tea',         '高山茶园',   3, 60000, 1500, 3, { mk: 'drink', sea: [1.5, 1, 1.1, 0.6] });
// 文教 9
T('edu', 'calligraphy', '书法国画班',   1, 15000,  600,  1, { nd: ['print'] });
T('edu', 'tutoring',    '课外辅导班',   1, 25000,  1000, 3, { nd: ['print'], sea: [1, 1.35, 1.05, 0.95] });
T('edu', 'music',       '音乐教室',     2, 30000,  1000, 2);
T('edu', 'dance',       '舞蹈工作室',   2, 30000,  1000, 2);
T('edu', 'coding',      '少儿编程班',   2, 45000,  1400, 3, { nd: ['data', 'elec'] });
T('edu', 'library',     '私立图书馆',   2, 50000,  1100, 3, { nd: ['print'] });
T('edu', 'daycare',     '幼儿园',       2, 60000,  1600, 5);
T('edu', 'vocational',  '职业培训学校', 3, 100000, 2400, 6, { nd: ['print'] });
T('edu', 'driving',     '驾校',         3, 120000, 2800, 6, { nd: ['fuel'] });
// 医疗健康 9
T('health', 'pharmacy', '药店',         1, 30000,  1100, 2, { nd: ['med'] });
T('health', 'optical',  '眼镜验光店',   2, 40000,  1300, 2, { nd: ['elec'] });
T('health', 'psych',    '心理咨询室',   2, 45000,  1400, 2);
T('health', 'tcm',      '中医养生馆',   2, 50000,  1500, 3, { nd: ['med', 'crop'] });
T('health', 'clinic',   '社区诊所',     2, 60000,  1800, 4, { nd: ['med'] });
T('health', 'pethosp',  '宠物医院',     2, 70000,  2000, 4, { nd: ['med'] });
T('health', 'dental',   '牙科诊所',     3, 120000, 3000, 5, { nd: ['med'] });
T('health', 'rehab',    '康复理疗中心', 3, 130000, 3000, 6, { nd: ['med'] });
T('health', 'checkup',  '体检中心',     3, 200000, 4500, 8, { nd: ['med', 'elec'] });
// 酒店文旅 9
T('hotel', 'hostel',    '青年旅舍',   1, 30000,  900,  2);
T('hotel', 'bnb',       '特色民宿',   2, 60000,  1500, 3, { sea: [1.1, 1.3, 1.1, 0.7] });
T('hotel', 'exphotel',  '快捷酒店',   2, 100000, 2400, 5);
T('hotel', 'apartment', '公寓长租',   2, 150000, 2600, 3);
T('hotel', 'spring',    '温泉会馆',   3, 180000, 3600, 6, { sea: [0.9, 0.7, 1.2, 1.6] });
T('hotel', 'bizhotel',  '商务酒店',   3, 200000, 4200, 8);
T('hotel', 'office',    '写字楼出租', 3, 260000, 4400, 4);
T('hotel', 'resort',    '海滨度假村', 4, 450000, 8000, 12, { sea: [0.9, 1.7, 1, 0.5] });
T('hotel', 'grand',     '星级大酒店', 4, 500000, 9000, 14, { nd: ['drink'] });
// 交通物流 9
T('trans', 'carwash', '洗车行',           1, 15000,  650,  2);
T('trans', 'bike',    '共享单车运营点',   1, 20000,  700,  2);
T('trans', 'courier', '同城快送站',       2, 40000,  1300, 3, { nd: ['fuel'] });
T('trans', 'moving',  '搬家公司',         2, 45000,  1300, 4, { nd: ['fuel'] });
T('trans', 'autofix', '汽修厂',           2, 50000,  1500, 4, { nd: ['steel'] });
T('trans', 'charge',  '新能源充电站',     2, 90000,  2000, 2, { nd: ['elec'] });
T('trans', 'gas',     '加油站',           3, 150000, 3600, 4, { nd: ['fuel'] });
T('trans', 'taxi',    '出租车公司',       3, 160000, 3600, 8, { nd: ['fuel'] });
T('trans', 'freight', '物流货运公司',     4, 300000, 6000, 10, { nd: ['fuel'] });
// 金融 8
T('fin', 'pawn',      '典当行',         2, 60000,  1600, 2);
T('fin', 'insurance', '保险代理所',     2, 70000,  1800, 3, { nd: ['print'] });
T('fin', 'account',   '会计师事务所',   2, 80000,  2000, 4, { nd: ['print'] });
T('fin', 'microloan', '小额贷款公司',   3, 150000, 3600, 4);
T('fin', 'auction',   '拍卖行',         3, 180000, 4000, 4);
T('fin', 'broker',    '证券营业部',     3, 200000, 4600, 6, { nd: ['data'] });
T('fin', 'vc',        '风险投资办公室', 4, 400000, 8000, 6, { nd: ['data'] });
T('fin', 'privbank',  '私人银行',       4, 600000, 11000, 10, { nd: ['data'] });

export const TYPES = _types;
export const TYPE_BY_ID = Object.fromEntries(_types.map((t) => [t.id, t]));

// ---------- 城区（各 10 块地） ----------
// traffic 基础客流 | land 基础地价 | upkeep 日物业费 | unlock 解锁所需大亨等级
// aff 行业亲和加成 | seaT 四季客流(仅滨海)
export const PLOTS_PER_DIST = 10;
export const DISTRICTS = [
  { id: 'old',   name: '老城区',     traffic: 1.0,  land: 8000,  upkeep: 30,  unlock: 1,
    aff: { food: 1.15, service: 1.15, retail: 1.05 } },
  { id: 'uni',   name: '大学城',     traffic: 1.25, land: 15000, upkeep: 45,  unlock: 2,
    aff: { food: 1.1, fun: 1.2, edu: 1.25, retail: 1.05 } },
  { id: 'ind',   name: '城郊工业区', traffic: 0.7,  land: 10000, upkeep: 25,  unlock: 3,
    aff: { mfg: 1.3, agri: 1.3, trans: 1.25 } },
  { id: 'tech',  name: '高新科技园', traffic: 1.05, land: 25000, upkeep: 70,  unlock: 4,
    aff: { tech: 1.3, fin: 1.1, health: 1.05, food: 1.05 } },
  { id: 'coast', name: '滨海度假区', traffic: 0.95, land: 30000, upkeep: 80,  unlock: 5,
    aff: { hotel: 1.35, fun: 1.15, food: 1.1 }, seaT: [0.8, 1.5, 1.0, 0.6] },
  { id: 'cbd',   name: '中央商务区', traffic: 1.6,  land: 60000, upkeep: 150, unlock: 6,
    aff: { retail: 1.2, fin: 1.25, hotel: 1.1, fun: 1.1, health: 1.1 } },
];
export const DIST_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

// ---------- 门店策略档位 ----------
export const SUPPLY_PLANS = [
  { name: '低价原料', mat: 0.80, rep: -0.18, qual: 0.94 },
  { name: '标准供应', mat: 1.00, rep: 0,     qual: 1.00 },
  { name: '优质直采', mat: 1.25, rep: +0.22, qual: 1.08 },
];
export const WAGE_PLANS = [
  { name: '压缩薪酬', mul: 0.85, morale: -0.35 },
  { name: '行业标准', mul: 1.00, morale: 0 },
  { name: '高薪激励', mul: 1.25, morale: +0.28 },
];
export const DIGITAL_PLANS = [
  { name: '无',         reach: 1.00, comm: 0,    wage: 1.00, tech: null,    desc: '纯线下经营' },
  { name: '外卖/平台',  reach: 1.25, comm: 0.08, wage: 1.00, tech: 'digi1', desc: '接入平台，触达 +25%，抽佣 8%' },
  { name: '自营小程序', reach: 1.18, comm: 0.02, wage: 1.00, tech: 'digi2', desc: '自有渠道，触达 +18%，仅 2% 支付成本' },
  { name: '智能自动化', reach: 1.05, comm: 0,    wage: 0.70, tech: 'digi3', desc: '无人化改造，人力成本 -30%' },
];

// ---------- 科技树（4 分支 28 项） ----------
export const TECH_BRANCHES = { biz: '经营管理', mkt: '市场品牌', digi: '数字化', ind: '产业与金融' };
export const TECHS = {
  pos:      { name: '电子收银系统', branch: 'biz', cost: 4000,  days: 6,  desc: '全部门店营收 +4%', eff: { revAll: 0.04 } },
  chain:    { name: '连锁管理',     branch: 'biz', cost: 12000, days: 12, req: ['pos'], desc: '同业态第 2 家起开店成本 -25%', eff: { openSameMul: 0.75 } },
  hr:       { name: '员工培训体系', branch: 'biz', cost: 10000, days: 10, desc: '培训费 -40%，技能上限提至 5', eff: { trainCostMul: 0.6, trainMax: 5 } },
  lean:     { name: '精益运营',     branch: 'biz', cost: 15000, days: 12, req: ['pos'], desc: '全部门店物业维护费 -20%', eff: { upkeepMul: 0.8 } },
  supply2:  { name: '供应链整合',   branch: 'biz', cost: 20000, days: 15, req: ['chain'], desc: '自有上游降本加深(85%/75%→80%/68%)', eff: { supplyDeep: 1 } },
  lic2:     { name: '中级工商执照', branch: 'biz', cost: 8000,  days: 8,  desc: '解锁 ★★ 档业态', eff: { tier: 2 } },
  lic3:     { name: '高级工商执照', branch: 'biz', cost: 30000, days: 20, req: ['lic2'], desc: '解锁 ★★★ 档业态', eff: { tier: 3 } },
  group:    { name: '集团化经营',   branch: 'biz', cost: 100000, days: 30, req: ['lic3'], desc: '解锁 ★★★★ 旗舰业态', eff: { tier: 4 } },
  ads:      { name: '广告学',       branch: 'mkt', cost: 6000,  days: 8,  desc: '营销活动效果 +30%', eff: { mktEff: 0.3 } },
  brand2:   { name: '品牌战略',     branch: 'mkt', cost: 20000, days: 15, req: ['ads'], desc: '品牌值衰减减半', eff: { brandDecayMul: 0.5 } },
  member:   { name: '会员体系',     branch: 'mkt', cost: 15000, days: 12, req: ['ads'], desc: '门店声望增长 +50%', eff: { repGainMul: 1.5 } },
  bigdata:  { name: '大数据画像',   branch: 'mkt', cost: 40000, days: 20, req: ['member'], desc: '全部门店营收 +6%，需求波动收窄', eff: { revAll: 0.06, calmNoise: 1 } },
  digi1:    { name: '数字化转型',   branch: 'digi', cost: 10000, days: 10, desc: '解锁门店“外卖/平台”方案', eff: { digital: 1 } },
  digi2:    { name: '自营小程序',   branch: 'digi', cost: 30000, days: 18, req: ['digi1'], desc: '解锁门店“自营小程序”方案', eff: { digital: 2 } },
  digi3:    { name: '智能自动化',   branch: 'digi', cost: 80000, days: 25, req: ['digi2'], desc: '解锁门店“智能自动化”方案', eff: { digital: 3 } },
  cloud:    { name: '云协同办公',   branch: 'digi', cost: 25000, days: 15, req: ['digi1'], desc: '全员工资 -8%', eff: { wageAllMul: 0.92 } },
  pfun:     { name: '娱乐经营许可', branch: 'ind', cost: 10000, days: 8,  desc: '解锁【娱乐】行业', eff: { unlockInd: 'fun' } },
  pmfg:     { name: '制造业园区入驻', branch: 'ind', cost: 20000, days: 12, desc: '解锁【制造业】行业', eff: { unlockInd: 'mfg' } },
  pedu:     { name: '教育办学资质', branch: 'ind', cost: 15000, days: 10, desc: '解锁【文教】行业', eff: { unlockInd: 'edu' } },
  ptrans:   { name: '运输牌照',     branch: 'ind', cost: 15000, days: 10, desc: '解锁【交通物流】行业', eff: { unlockInd: 'trans' } },
  ptech:    { name: '科技孵化器',   branch: 'ind', cost: 25000, days: 15, desc: '解锁【科技互联网】行业', eff: { unlockInd: 'tech' } },
  photel:   { name: '文旅开发许可', branch: 'ind', cost: 25000, days: 15, desc: '解锁【酒店文旅】行业', eff: { unlockInd: 'hotel' } },
  phealth:  { name: '医疗执业资质', branch: 'ind', cost: 30000, days: 18, desc: '解锁【医疗健康】行业', eff: { unlockInd: 'health' } },
  pfin:     { name: '金融牌照',     branch: 'ind', cost: 60000, days: 25, desc: '解锁【金融】行业与股票市场', eff: { unlockInd: 'fin', stocks: 1 } },
  coldchain:{ name: '冷链物流',     branch: 'ind', cost: 20000, days: 12, req: ['pmfg'], desc: '餐饮/农业的季节波动减半', eff: { coldchain: 1 } },
  autoline: { name: '自动化产线',   branch: 'ind', cost: 60000, days: 20, req: ['pmfg'], desc: '制造业工资 -35%', eff: { mfgWageMul: 0.65 } },
  credit:   { name: '信用体系建设', branch: 'ind', cost: 15000, days: 10, desc: '贷款利率 -25%', eff: { loanRateMul: 0.75 } },
  invest:   { name: '投资顾问团队', branch: 'ind', cost: 30000, days: 15, req: ['pfin'], desc: '股票手续费 1%→0.3%，分红 +50%', eff: { stockFee: 0.003, divMul: 1.5 } },
};

// 初始已解锁行业；其余 8 个行业由“产业”分支科技解锁
export const START_INDS = ['food', 'retail', 'service', 'agri'];

// ---------- 营销活动 ----------
export const MARKETING = [
  { id: 'flyer',    name: '传单派发',   cost: 2000,  days: 7,  cd: 10, scope: 'dist',  desc: '当前城区客流 +15%（7 天）' },
  { id: 'radio',    name: '电台广告',   cost: 8000,  days: 14, cd: 20, scope: 'city',  desc: '全城需求 +10%（14 天）' },
  { id: 'kol',      name: '网红探店',   cost: 6000,  days: 10, cd: 15, scope: 'biz',   desc: '选中门店需求 +50%（10 天），声望 +5' },
  { id: 'sale',     name: '全城大促',   cost: 15000, days: 7,  cd: 30, scope: 'city',  desc: '全城需求 +35%，但让利使利润率 -10%（7 天）' },
  { id: 'billboard',name: '广告牌投放', cost: 12000, days: 0,  cd: 25, scope: 'brand', desc: '品牌值立即 +15' },
];

// ---------- 城市事件（28 种；choice 为二选一抉择） ----------
// mods: 持续效果 {k,...,m,dur}; inst: 立即效果
export const EVENTS = [
  { id: 'foodfest', name: '全城美食节',   w: 3,   dur: 7,  desc: '美食节开幕，餐饮需求大涨！', mods: [{ k: 'ind', ind: 'food', m: 1.4 }] },
  { id: 'schoolstart', name: '开学季',    w: 2,   dur: 30, cond: { month: [3, 9] }, desc: '大学城迎来开学潮。', mods: [{ k: 'dist', d: 'uni', m: 1.3 }] },
  { id: 'heatwave', name: '高温热浪',     w: 2,   dur: 10, cond: { season: [1] }, desc: '酷暑难耐，冷饮生意火爆。', mods: [{ k: 'ind', ind: 'food', m: 1.18 }] },
  { id: 'coldwave', name: '寒潮来袭',     w: 2,   dur: 8,  cond: { season: [3] }, desc: '气温骤降，火锅与保暖消费升温。', mods: [{ k: 'ind', ind: 'food', m: 1.25 }] },
  { id: 'typhoon',  name: '台风过境',     w: 2,   dur: 5,  cond: { season: [1] }, desc: '台风登陆，滨海封闭，全城出行减少。', visual: 'rain',
    mods: [{ k: 'dist', d: 'coast', m: 0.45 }, { k: 'traffic', m: 0.9 }] },
  { id: 'flu',      name: '流感季',       w: 2,   dur: 20, cond: { season: [0, 3] }, desc: '流感高发，医疗需求上升，娱乐场所冷清。',
    mods: [{ k: 'ind', ind: 'health', m: 1.35 }, { k: 'ind', ind: 'fun', m: 0.85 }] },
  { id: 'matup',    name: '原料涨价',     w: 2,   dur: 30, desc: '大宗商品行情上行，进货成本普涨 20%。', mods: [{ k: 'mat', m: 1.2 }] },
  { id: 'matdown',  name: '供应过剩',     w: 1.5, dur: 20, desc: '供应端产能过剩，进货成本下降 15%。', mods: [{ k: 'mat', m: 0.85 }] },
  { id: 'oilup',    name: '油价上涨',     w: 1.5, dur: 20, desc: '燃油价格上涨，物流行业成本走高。', mods: [{ k: 'indmat', ind: 'trans', m: 1.3 }] },
  { id: 'rentup',   name: '物业费上调',   w: 1.5, dur: 60, desc: '物业公司统一上调管理费 20%。', mods: [{ k: 'upkeep', m: 1.2 }] },
  { id: 'boom',     name: '经济利好政策', w: 1.5, dur: 0,  desc: '刺激政策出台，宏观景气回升。', inst: [{ k: 'econ', add: 0.12 }] },
  { id: 'crisis',   name: '金融风波',     w: 1.2, dur: 0,  desc: '外部金融市场动荡，景气受挫，股市下挫。', inst: [{ k: 'econ', add: -0.15 }, { k: 'stockAll', m: 0.88 }] },
  { id: 'bull',     name: '股市牛市传闻', w: 1.2, dur: 0,  cond: { stocks: 1 }, desc: '资金涌入，股市全线上扬。', inst: [{ k: 'stockAll', m: 1.15 }] },
  { id: 'subsidy',  name: '创业补贴到账', w: 1.5, dur: 0,  desc: '政府发放中小企业扶持补贴。', inst: [{ k: 'cash', add: 15000 }] },
  { id: 'celeb',    name: '明星意外打卡', w: 1.5, dur: 0,  cond: { biz: 1 }, desc: '一位明星到访你的门店并发了动态！', inst: [{ k: 'repRand', add: 15 }, { k: 'brand', add: 8 }] },
  { id: 'viral',    name: '门店意外走红', w: 1.5, dur: 7,  cond: { biz: 1 }, desc: '你的一家门店登上同城热搜！', mods: [{ k: 'bizRand', m: 1.8 }] },
  { id: 'tourism',  name: '旅游旺季',     w: 2,   dur: 20, cond: { season: [1] }, desc: '暑期游客涌入滨海度假区。', mods: [{ k: 'dist', d: 'coast', m: 1.45 }] },
  { id: 'newmall',  name: '新商场开业',   w: 1.5, dur: 20, desc: '邻市大型商场开业，分流本地零售客源。', mods: [{ k: 'ind', ind: 'retail', m: 0.88 }] },
  { id: 'blackout', name: '电网检修',     w: 1.2, dur: 5,  desc: '工业区计划性停电检修。', mods: [{ k: 'dist', d: 'ind', m: 0.7 }, { k: 'ind', ind: 'mfg', m: 0.8 }] },
  { id: 'marathon', name: '城市马拉松',   w: 1.2, dur: 3,  desc: '马拉松封路：人气上升，运输受阻。', mods: [{ k: 'traffic', m: 1.15 }, { k: 'ind', ind: 'trans', m: 0.8 }] },
  { id: 'double11', name: '双十一购物节', w: 3,   dur: 7,  cond: { month: [11] }, desc: '全民网购狂欢，零售与电商爆单。', mods: [{ k: 'ind', ind: 'retail', m: 1.35 }, { k: 'ind', ind: 'tech', m: 1.25 }] },
  { id: 'springfest', name: '春节',       w: 3,   dur: 15, cond: { month: [1] }, desc: '春节到来：消费旺、工厂歇。',
    mods: [{ k: 'ind', ind: 'food', m: 1.3 }, { k: 'ind', ind: 'retail', m: 1.25 }, { k: 'ind', ind: 'mfg', m: 0.7 }] },
  { id: 'rivalsale', name: '对手价格战',  w: 1.5, dur: 20, cond: { rival: 1 }, desc: '竞争对手集体降价抢客！', mods: [{ k: 'share', m: 0.8 }] },
  { id: 'hireseason', name: '招聘旺季',   w: 1.5, dur: 20, desc: '人才市场火热，招聘成本下降。', mods: [{ k: 'hirecost', m: 0.7 }] },
  { id: 'strike', name: '员工集体谈薪', w: 1.2, dur: 0, cond: { staff: 6 }, desc: '员工代表提出涨薪诉求，如何回应？',
    choice: {
      a: { label: '全员加薪 15%（60 天）', note: '士气大涨', mods: [{ k: 'wage', m: 1.15, dur: 60 }], inst: [{ k: 'moraleAll', add: 15 }] },
      b: { label: '婉拒诉求', note: '士气与口碑受挫', inst: [{ k: 'moraleAll', add: -18 }, { k: 'repAll', add: -4 }] },
    } },
  { id: 'inspect', name: '卫生大检查', w: 1.5, dur: 0, cond: { indBiz: 'food' }, desc: '监管部门突击检查餐饮卫生。',
    choice: {
      a: { label: '每店花 ¥1500 提前整改', note: '各餐饮店声望 +5', inst: [{ k: 'cashPerFood', add: -1500 }, { k: 'repInd', ind: 'food', add: 5 }] },
      b: { label: '心存侥幸', note: '30% 概率被通报停业 3 天', inst: [{ k: 'inspectGamble' }] },
    } },
  { id: 'taxaudit', name: '税务稽查通知', w: 1.2, dur: 0, cond: { worth: 100000 }, desc: '收到税务自查通知。',
    choice: {
      a: { label: '主动补缴 ¥8000', note: '平稳过关', inst: [{ k: 'cash', add: -8000 }] },
      b: { label: '据理力争', note: '30% 概率被罚 ¥25000', inst: [{ k: 'taxGamble' }] },
    } },
  { id: 'charity', name: '慈善晚宴邀请', w: 1.2, dur: 0, cond: { worth: 80000 }, desc: '商会邀请你出席慈善晚宴。',
    choice: {
      a: { label: '捐款 ¥10000', note: '品牌 +12，全店声望 +3', inst: [{ k: 'cash', add: -10000 }, { k: 'brand', add: 12 }, { k: 'repAll', add: 3 }] },
      b: { label: '婉拒出席', note: '无事发生', inst: [] },
    } },
];

// ---------- 股票（金融牌照后解锁） ----------
export const STOCKS = [
  { id: 'bluesea',   name: '蓝海科技', base: 24, vol: 0.028, sector: 'tech' },
  { id: 'hengyun',   name: '恒运物流', base: 12, vol: 0.018, sector: 'trans' },
  { id: 'weifang',   name: '味坊食品', base: 8,  vol: 0.014, sector: 'food' },
  { id: 'xingchen',  name: '星辰娱乐', base: 15, vol: 0.030, sector: 'fun' },
  { id: 'huijin',    name: '汇金银行', base: 18, vol: 0.012, sector: 'fin' },
  { id: 'lvzhou',    name: '绿洲地产', base: 10, vol: 0.020, sector: 'hotel' },
  { id: 'yunduan',   name: '云端数据', base: 30, vol: 0.032, sector: 'tech' },
  { id: 'changqing', name: '长青医药', base: 22, vol: 0.016, sector: 'health' },
];

// ---------- 竞争对手 ----------
export const RIVALS = [
  { id: 'wang',     name: '王氏商业', color: '#e05555', style: 'steady',     desc: '稳扎稳打，爱升级' },
  { id: 'xinghui',  name: '星辉集团', color: '#a06bff', style: 'aggressive', desc: '专抢你的赛道' },
  { id: 'xiangkou', name: '巷口连锁', color: '#56c46a', style: 'spam',       desc: '小店铺天盖地' },
];

// ---------- 大亨等级 ----------
export const LEVEL_XP = [0, 60, 180, 450, 1000, 2200, 4800, 10000, 20000]; // L1..L9 门槛
export const LEVEL_PERKS = [
  '', '起点：老城区营业', '解锁大学城', '解锁城郊工业区', '解锁高新科技园',
  '解锁滨海度假区', '解锁中央商务区', '商业传奇', '城市名片', '大亨殿堂',
];

// ---------- 目标任务链（17 步） ----------
export const GOALS = [
  { id: 'shop1',    name: '万事开头难', desc: '购买一块地并开出第一家门店', cash: 3000,  xp: 10 },
  { id: 'staffed',  name: '开门迎客',   desc: '任意门店雇满所需人手',       cash: 1500,  xp: 6 },
  { id: 'profit3',  name: '连续盈利',   desc: '全局连续 3 天净利润为正',    cash: 2000,  xp: 8 },
  { id: 'strategy', name: '精打细算',   desc: '累计调整 3 种不同经营策略（定价/供应/薪酬/数字化/促销）', cash: 2000, xp: 8 },
  { id: 'upgrade1', name: '门面翻新',   desc: '任意门店升级到 Lv2',         cash: 3000,  xp: 10 },
  { id: 'tech1',    name: '第一桶科技', desc: '完成一项科技研发',           cash: 3000,  xp: 10 },
  { id: 'shop2',    name: '连点成线',   desc: '同时拥有 2 家门店（现金不够可去银行贷款）', cash: 5000, xp: 14 },
  { id: 'brand10',  name: '小有名气',   desc: '品牌值达到 10',              cash: 3000,  xp: 10 },
  { id: 'loan1',    name: '善用杠杆',   desc: '使用一次银行贷款',           cash: 2000,  xp: 8 },
  { id: 'chain1',   name: '产业协同',   desc: '达成一条供应链协同（自有上游+下游）', cash: 6000, xp: 16 },
  { id: 'month10k', name: '月入过万',   desc: '单月净利润 ≥ ¥1 万',         cash: 5000,  xp: 14 },
  { id: 'dist2',    name: '跨区经营',   desc: '在第 2 个城区拥有地块',      cash: 8000,  xp: 18 },
  { id: 'ind4',     name: '多元布局',   desc: '涉足 4 个不同行业',          cash: 8000,  xp: 18 },
  { id: 'stock1',   name: '初涉股市',   desc: '首次买入股票（需金融牌照）', cash: 5000,  xp: 12 },
  { id: 'worth50',  name: '身家五十万', desc: '净资产 ≥ ¥50 万',            cash: 20000, xp: 40 },
  { id: 'shops10',  name: '商业版图',   desc: '同时拥有 10 家门店',         cash: 30000, xp: 60 },
  { id: 'worth1000',name: '像素大亨',   desc: '净资产 ≥ ¥1000 万 —— 登顶城市之巅！', cash: 0, xp: 200 },
];

// ---------- 成就（13 项） ----------
export const ACHIEVEMENTS = [
  { id: 'cash1m',    name: '现金为王',   desc: '现金持有量达到 ¥100 万' },
  { id: 'allind',    name: '全能大亨',   desc: '同时涉足全部 12 个行业' },
  { id: 'types30',   name: '博览百业',   desc: '累计经营过 30 种不同业态' },
  { id: 'rep95',     name: '金字招牌',   desc: '任意门店声望达到 95' },
  { id: 'maxlv5',    name: '五星连锁',   desc: '同时拥有 5 家满级(Lv5)门店' },
  { id: 'techall',   name: '科技先驱',   desc: '研发完成全部 28 项科技' },
  { id: 'stock100k', name: '股海弄潮',   desc: '股票累计盈利 ¥10 万' },
  { id: 'nodebt',    name: '稳健经营',   desc: '连续 360 天无贷款经营' },
  { id: 'acquire',   name: '大鱼吃小鱼', desc: '收购一家竞争对手的门店' },
  { id: 'recession', name: '穿越周期',   desc: '安然度过一次经济衰退' },
  { id: 'profit1m',  name: '利润机器',   desc: '累计净利润达到 ¥100 万' },
  { id: 'staff50',   name: '百人麾下',   desc: '全公司雇员总数达到 50 人' },
  { id: 'brand80',   name: '家喻户晓',   desc: '品牌值达到 80' },
];

// ---------- 15 项商业机制（帮助面板 & 自测口径） ----------
export const MECHANICS = [
  { n: '选址与地价',   d: '六大城区客流/行业亲和不同；地价随城区开发度上涨，客流随入驻商家提升' },
  { n: '供需定价',     d: '定价 60%~160% 滑杆，按行业价格弹性折算客量——高价高毛利、客量流失' },
  { n: '供应品质',     d: '低价/标准/优质三档原料：影响材料成本、出品质量与声望涨落' },
  { n: '供应链协同',   d: '自有上游（农场/工厂）可为下游门店降本 15%~32%；上游因销路稳定客量 +10%' },
  { n: '雇员养成',     d: '人数/技能/士气四维：招聘、培训、三档薪酬政策；缺人与低士气直接压产能' },
  { n: '升级扩建',     d: '门店 Lv1→Lv5：容量与品质上升、外观长高，物业与用人同步增加' },
  { n: '科技研发',     d: '4 分支 28 项科技：全局增益、行业解锁、业态档次执照、数字化方案' },
  { n: '营销与品牌',   d: '5 种营销活动（城区/全城/单店/品牌），品牌值全局放大需求并随时间衰减' },
  { n: '数字化经营',   d: '外卖平台/自营小程序/智能自动化三种方案：触达、抽佣与人力的三难权衡' },
  { n: '银行信贷',     d: '额度随净资产浮动；信用分 400~850 决定利率，逾期透支扣分' },
  { n: '股票投资',     d: '8 支个股随宏观景气与事件波动，季度分红；需金融牌照' },
  { n: '城市事件',     d: '28 种事件（季节/条件触发），含 5 种二选一抉择事件，直接改写结算参数' },
  { n: '竞争对手 AI',  d: '3 家风格迥异的对手抢地开店、瓜分同区同业市场份额；可溢价收购其门店' },
  { n: '声望系统',     d: '每家门店 0~100 声望由供应/人效/事件驱动，折算为需求乘数' },
  { n: '经济周期与四季', d: '繁荣/平稳/衰退马尔可夫切换 + 四季需求曲线，宏观直接进结算' },
];

// ---------- 行业像素图标（8×8 位图，每行一个字节） ----------
export const IND_ICONS = {
  food:    [0x00, 0x24, 0x24, 0x00, 0x7e, 0x42, 0x3c, 0x18],
  retail:  [0x00, 0x24, 0x24, 0x7e, 0x42, 0x42, 0x7e, 0x00],
  service: [0x00, 0x42, 0x66, 0x3c, 0x18, 0x3c, 0x24, 0x42],
  fun:     [0x00, 0x1e, 0x12, 0x12, 0x12, 0x72, 0x70, 0x00],
  tech:    [0x00, 0x5a, 0x3c, 0x7e, 0x7e, 0x3c, 0x5a, 0x00],
  mfg:     [0x18, 0x5a, 0x3c, 0x66, 0x66, 0x3c, 0x5a, 0x18],
  agri:    [0x00, 0x0c, 0x1e, 0x18, 0x78, 0x30, 0x30, 0x7c],
  edu:     [0x00, 0x7e, 0x42, 0x5a, 0x42, 0x5a, 0x7e, 0x00],
  health:  [0x00, 0x18, 0x18, 0x7e, 0x7e, 0x18, 0x18, 0x00],
  hotel:   [0x00, 0x40, 0x40, 0x5c, 0x7e, 0x42, 0x42, 0x00],
  trans:   [0x00, 0x00, 0x78, 0x7e, 0x7e, 0x24, 0x00, 0x00],
  fin:     [0x00, 0x3c, 0x42, 0x5a, 0x5a, 0x42, 0x3c, 0x00],
};
