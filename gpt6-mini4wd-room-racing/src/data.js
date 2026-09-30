export const CARS = [
  { id: 'cyclone', name: '旋风冲锋', en: 'CYCLONE MAGNUM', color: '#1974cc', accent: '#ffdb45', trim: '#f0f0e5', shape: 'magnum', number: '01', style: '直线突破', stats: [86, 78, 71, 78], desc: '蓝白旋风，向着终点全速冲锋。宽翼与轻量车身带来出色的极速。' },
  { id: 'hurricane', name: '飓风音速号', en: 'HURRICANE SONIC', color: '#df333b', accent: '#ffd655', trim: '#f3ede2', shape: 'sonic', number: '02', style: '弯道专家', stats: [78, 82, 90, 77], desc: '红色飓风，划出最漂亮的弯线。高下压力车壳让高速过弯更加稳定。' },
  { id: 'triangle', name: '新三角剑', en: 'NEO-TRIDAGGER ZMC', color: '#262b38', accent: '#ef5f32', trim: '#e2d8c6', shape: 'dagger', number: '03', style: '轻量先锋', stats: [89, 83, 69, 72], desc: '锋利的三角轮廓，轻量化的速度机器。优秀的加速需要精细的弯道控制。' },
  { id: 'evolution', name: '进化者', en: 'EVOLUTION', color: '#e5c33a', accent: '#ef4b30', trim: '#e6e4d6', shape: 'evo', number: '04', style: '全能进化', stats: [79, 84, 82, 83], desc: '以平衡应对每一条赛道。兼顾动力、抓地与续航的全能型赛车。' },
  { id: 'cobra', name: '极速眼镜蛇', en: 'FAST COBRA', color: '#178455', accent: '#f4dd61', trim: '#dbe1d8', shape: 'cobra', number: '05', style: '极速猎手', stats: [92, 72, 72, 73], desc: '低伏的车头与蛇形中脊。长直道上的速度优势，足以扭转比赛。' },
  { id: 'spider', name: '蜘蛛王', en: 'BEAK SPIDER', color: '#8b4dab', accent: '#ed534b', trim: '#dedbe1', shape: 'spider', number: '06', style: '精准切线', stats: [83, 79, 87, 73], desc: '伸展的侧翼与蛛网纹路。灵巧的车体在连续弯道中游刃有余。' },
  { id: 'giant', name: '巨无霸', en: 'BROCKEN GIGANT', color: '#25353c', accent: '#d3493c', trim: '#bbbfad', shape: 'giant', number: '07', style: '重装稳定', stats: [70, 88, 92, 89], desc: '宽大的装甲与强力底盘。虽然极速较低，却有坚实的抓地与长程续航。' },
  { id: 'devil', name: '魔鬼司令', en: 'DIOSPADA', color: '#c72436', accent: '#70c7df', trim: '#e9e4d7', shape: 'devil', number: '08', style: '双刃疾行', stats: [87, 85, 79, 71], desc: '双刃车鼻与低矮驾驶舱。猛烈的起步加速，是它抢占先机的秘诀。' },
];

// Slots and options are declarative: new cars reuse this same assembly contract.
export const PARTS = {
  shell: { name: '空气动力车壳', en: 'BODY SHELL', detail: '车壳决定风阻与下压力。', options: [
    { name: '原厂彩绘车壳', type: 'STANDARD', delta: [0, 0, 0, 0], color: null },
    { name: '轻量镂空车壳', type: 'LIGHTWEIGHT', delta: [5, 4, -2, 0], color: null },
    { name: '低阻下压力车壳', type: 'AERO PRO', delta: [7, 1, 7, -1], color: null },
  ] },
  chassis: { name: '四驱底盘', en: 'CHASSIS', detail: '底盘的刚性与重量影响起步和稳定性。', options: [
    { name: '标准 ABS 底盘', type: 'STANDARD', delta: [0, 0, 0, 0], color: '#353e45' },
    { name: '强化纤维底盘', type: 'REINFORCED', delta: [0, 3, 8, 2], color: '#475366' },
    { name: '碳纤维轻量底盘', type: 'CARBON PRO', delta: [5, 7, 6, 3], color: '#202528' },
  ] },
  motor: { name: '高转速马达', en: 'MOTOR', detail: '高转速提升极速，但会产生更多热量。', options: [
    { name: '标准 FA 马达', type: 'STANDARD', delta: [0, 0, 0, 0], color: '#a7afb0' },
    { name: '疾速冲刺马达', type: 'HYPER DASH', delta: [10, 6, 0, -5], color: '#db7740' },
    { name: '高扭矩竞速马达', type: 'TORQUE PRO', delta: [7, 13, 0, -3], color: '#dfb952' },
  ] },
  tires: { name: '轮毂与轮胎', en: 'WHEELS & TIRES', detail: '软胎提升抓地，硬胎减少直线滚动阻力。', options: [
    { name: '标准橡胶轮胎', type: 'STANDARD', delta: [0, 0, 0, 0], color: '#25282b' },
    { name: '低摩擦硬质轮胎', type: 'LOW FRICTION', delta: [8, 2, -3, 3], color: '#444852' },
    { name: '超软抓地海绵胎', type: 'SUPER GRIP', delta: [-1, 5, 12, 2], color: '#8b443b' },
  ] },
  rollers: { name: '导轮与防倾杆', en: 'GUIDE ROLLERS', detail: '导轮减少擦墙损失，提高弯道安全速度。', options: [
    { name: '塑料导轮组', type: 'STANDARD', delta: [0, 0, 0, 0], color: '#9baba9' },
    { name: '铝合金轴承导轮', type: 'BALL BEARING', delta: [4, 1, 8, 1], color: '#8bb7c2' },
    { name: '双层竞速导轮', type: 'DOUBLE PRO', delta: [3, 2, 13, 2], color: '#d8b867' },
  ] },
  battery: { name: '动力电池', en: 'POWER CELL', detail: '电压影响加速，容量影响冲刺时间和续航。', options: [
    { name: '标准 AA 电池', type: 'STANDARD', delta: [0, 0, 0, 0], color: '#448376' },
    { name: '高电压镍氢电池', type: 'POWER BOOST', delta: [3, 8, 0, 5], color: '#dc7641' },
    { name: '长效竞赛电池', type: 'ENDURANCE PRO', delta: [2, 4, 0, 17], color: '#61a66d' },
  ] },
};
export const STAT_NAMES = ['极速', '加速', '稳定', '续航'];
export const VENUES = [
  { id: 'bedroom', name: '放学后的房间', en: 'AFTER SCHOOL', tag: '温暖木地板 · 午后阳光', wall: '#9faaa2', floor: '#bc9267', accent: '#e76940', light: '#fff0d3', grip: 1, ambient: 25 },
  { id: 'club', name: '街角模型俱乐部', en: 'THE HOBBY CLUB', tag: '专业练习室 · 冷白灯光', wall: '#8098a0', floor: '#9b9e98', accent: '#1b817d', light: '#e6f5ff', grip: 1.08, ambient: 21 },
  { id: 'night', name: '午夜车库', en: 'MIDNIGHT GARAGE', tag: '霓虹灯带 · 深夜竞速', wall: '#293b4c', floor: '#414850', accent: '#d95948', light: '#bfd7ff', grip: .96, ambient: 19 },
];
export const TRACKS = [
  { id: 'classic', name: '旋风环线', en: 'CYCLONE CIRCUIT', level: '均衡型', desc: '长直道、连续弯与起伏桥面，适合第一场比赛。', points: [[-10,0,8],[0,0,8],[10,0,8],[15,0,4],[15,0,-3],[10,0,-7],[5,0,-4],[0,0,0],[-6,0,-4],[-11,0,-7],[-16,0,-3],[-16,0,3]], hill: true },
  { id: 'speed', name: '闪电高速环', en: 'LIGHTNING OVAL', level: '高速型', desc: '流畅大弯连接超长直线，考验马达和电池。', points: [[-10,0,7],[0,0,7],[11,0,7],[16,0,3],[16,0,-3],[11,0,-7],[0,0,-7],[-11,0,-7],[-16,0,-3],[-16,0,3]], hill: false },
  { id: 'cross', name: '双层交叉挑战', en: 'CROSSOVER EIGHT', level: '技术型', desc: '真正分层的立交八字赛道，连续弯道与爬坡。', points: [[-13,0,7],[-6,0,6],[0,3.4,0],[7,2.4,-6],[13,0,-7],[17,0,-2],[15,0,5],[9,0,7],[0,0,0],[-8,0,-7],[-15,0,-5],[-17,0,1]], hill: false },
];
export function defaultBuild() { return Object.fromEntries(Object.keys(PARTS).map(key => [key, 0])); }
export function normalizeBuild(build = {}) { return Object.fromEntries(Object.keys(PARTS).map(key => [key, Number.isInteger(build[key]) && PARTS[key].options[build[key]] ? build[key] : 0])); }
export function getStats(car, build = {}) {
  const result = [...car.stats];
  for (const [key, part] of Object.entries(PARTS)) {
    const option = part.options[build[key]] || part.options[0];
    option.delta.forEach((value, index) => { result[index] += value; });
  }
  return result.map(value => Math.max(30, Math.min(125, value)));
}
export function topSpeed(stats) { return 6.4 + stats[0] * .055; }
export function validateCustomCar(raw, existing = []) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('赛车数据必须是 JSON 对象。');
  const name = String(raw.name || '').trim();
  if (!name || name.length > 18) throw new Error('赛车名称需要 1–18 个字符。');
  if (!/^#[\da-f]{6}$/i.test(raw.color || '')) throw new Error('车身颜色需要 #RRGGBB 格式。');
  if (!Array.isArray(raw.stats) || raw.stats.length !== 4 || raw.stats.some(x => !Number.isInteger(x) || x < 45 || x > 95)) throw new Error('四项基础属性必须是 45–95 之间的整数。');
  if (raw.stats.reduce((sum, n) => sum + n, 0) > 340) throw new Error('基础属性总和不能超过 340。');
  if (existing.length >= 16) throw new Error('车库最多可保存 16 辆拓展赛车。');
  const shape = CARS.some(c => c.shape === raw.shape) ? raw.shape : 'magnum';
  return { id: `custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name, en: 'CUSTOM MACHINE', color: raw.color, accent: /^#[\da-f]{6}$/i.test(raw.accent || '') ? raw.accent : '#f9d36c', trim: '#efe9da', shape, stats: raw.stats.map(Math.round), number: 'EX', style: '专属改造', desc: '为自己的热爱打造一辆赛车。基础属性与六个改装槽均参与实际比赛。', custom: true };
}
