export const INDUSTRIES = [
  { id: 'coffee', mark: '啡', name: '精品咖啡', cost: 18000, ticket: 32, demand: 58, margin: .68, rent: 580, color: '#d17b49', desc: '高频复购，早高峰明显' },
  { id: 'bakery', mark: '烘', name: '社区烘焙', cost: 22000, ticket: 38, demand: 54, margin: .61, rent: 620, color: '#e8b75b', desc: '损耗较高，适合社区客群' },
  { id: 'market', mark: '便', name: '智能便利店', cost: 26000, ticket: 45, demand: 66, margin: .36, rent: 680, color: '#61b96c', desc: '薄利多销，夜间需求稳定' },
  { id: 'food', mark: '食', name: '风味餐馆', cost: 35000, ticket: 86, demand: 48, margin: .55, rent: 820, color: '#e25d52', desc: '客单较高，口碑影响显著' },
  { id: 'book', mark: '书', name: '独立书店', cost: 16000, ticket: 56, demand: 32, margin: .52, rent: 480, color: '#6488c5', desc: '客流较低，但品牌韧性强' },
  { id: 'flower', mark: '花', name: '花艺工作室', cost: 14500, ticket: 108, demand: 28, margin: .64, rent: 420, color: '#d978a6', desc: '节日爆发，高毛利低频次' },
  { id: 'fitness', mark: '健', name: '轻量健身房', cost: 48000, ticket: 138, demand: 26, margin: .72, rent: 1100, color: '#54b8b1', desc: '会员订阅，前期投入较高' },
  { id: 'pet', mark: '宠', name: '宠物生活馆', cost: 30000, ticket: 118, demand: 36, margin: .59, rent: 720, color: '#b28bd3', desc: '服务与零售并行，复购稳定' },
  { id: 'beauty', mark: '美', name: '美学护理店', cost: 42000, ticket: 228, demand: 22, margin: .73, rent: 920, color: '#f28c90', desc: '高客单，依赖专业员工' },
  { id: 'digital', mark: '数', name: '数码体验店', cost: 52000, ticket: 680, demand: 12, margin: .24, rent: 980, color: '#5c91ed', desc: '资金占用大，渠道协同强' },
  { id: 'studio', mark: '创', name: '联合工作室', cost: 38000, ticket: 168, demand: 23, margin: .76, rent: 1250, color: '#7a81ad', desc: '租赁订阅，重视位置与设施' },
  { id: 'music', mark: '乐', name: '现场音乐馆', cost: 56000, ticket: 198, demand: 20, margin: .62, rent: 1350, color: '#bd62c7', desc: '夜间经济，事件波动更大' },
];

export const SEGMENTS = [
  { id: 'student', name: '校园青年', prefix: '青春', demand: 1.22, ticket: .72, color: '#68c8d5' },
  { id: 'office', name: '都市白领', prefix: '通勤', demand: 1.05, ticket: 1.12, color: '#f0b75d' },
  { id: 'family', name: '社区家庭', prefix: '邻里', demand: 1.12, ticket: .94, color: '#84c56f' },
  { id: 'premium', name: '品质客群', prefix: '臻选', demand: .72, ticket: 1.64, color: '#e1839d' },
];

export const CHANNELS = [
  { id: 'store', name: '街边门店', suffix: '铺', demand: 1, fee: 0, setup: 1 },
  { id: 'delivery', name: '即时到家', suffix: '闪送站', demand: 1.24, fee: .16, setup: 1.08 },
  { id: 'community', name: '社群订阅', suffix: '会员社', demand: .86, fee: .04, setup: .92 },
];

export const PRICE_PLANS = [
  { id: 'traffic', name: '引流价', multiplier: .82, demand: 1.28 },
  { id: 'fair', name: '标准价', multiplier: 1, demand: 1 },
  { id: 'premium', name: '品质溢价', multiplier: 1.32, demand: .78 },
  { id: 'dynamic', name: '动态定价', multiplier: 1.16, demand: .93 },
];

export const SUPPLY_PLANS = [
  { id: 'local', name: '本地直采', cost: 1.04, quality: 1.08, risk: .92 },
  { id: 'wholesale', name: '批量集采', cost: .86, quality: .94, risk: 1.08 },
  { id: 'agile', name: '敏捷供应', cost: .96, quality: 1, risk: .78 },
];

export const MARKETING_PLANS = [
  { id: 'none', name: '自然客流', daily: 0, demand: 1 },
  { id: 'local', name: '社区种草', daily: 180, demand: 1.16 },
  { id: 'ads', name: '精准投放', daily: 420, demand: 1.31 },
  { id: 'viral', name: '达人联名', daily: 760, demand: 1.48 },
];

export const STAFF_PLANS = [
  { id: 'lean', name: '精简排班', daily: 360, capacity: .82, quality: .94 },
  { id: 'standard', name: '标准团队', daily: 620, capacity: 1, quality: 1 },
  { id: 'service', name: '明星服务', daily: 980, capacity: 1.18, quality: 1.12 },
];

export const TECH_PLANS = [
  { id: 'basic', name: '手工管理', cost: 0, demand: 1, efficiency: 1 },
  { id: 'pos', name: '智能 POS', cost: 5000, demand: 1.05, efficiency: .94 },
  { id: 'ai', name: 'AI 经营脑', cost: 15000, demand: 1.13, efficiency: .86 },
];

export const MECHANISMS = [
  ['01', '行业景气', '12 个行业拥有不同需求、毛利与周期'],
  ['02', '客群定位', '四类客群改变流量与可接受客单价'],
  ['03', '渠道组合', '门店、到家、订阅带来不同规模与抽佣'],
  ['04', '价格策略', '低价引流、标准、溢价与动态定价'],
  ['05', '供应链', '成本、品质和断供风险三者取舍'],
  ['06', '人员管理', '排班成本决定产能与服务质量'],
  ['07', '市场营销', '从自然流量到达人联名的获客阶梯'],
  ['08', '数字化', 'POS 与 AI 系统提升需求预测和效率'],
  ['09', '品牌声誉', '口碑会跨店传播，影响整个商业版图'],
  ['10', '资金杠杆', '贷款加速扩张，同时产生每日利息'],
  ['11', '城市事件', '天气、节庆、检查等改变短期经营环境'],
  ['12', '组合扩张', '多行业协同降低波动并解锁里程碑'],
];

export const CITY_EVENTS = [
  { title: '街区艺术节', text: '全城客流涌入，未来 3 天需求 +22%', days: 3, demand: 1.22, tone: 'good' },
  { title: '连续降雨', text: '线下客流减少，到家渠道逆势增长', days: 2, demand: .86, delivery: 1.38, tone: 'warn' },
  { title: '消费券发放', text: '居民消费意愿提升，未来 4 天客单 +15%', days: 4, ticket: 1.15, tone: 'good' },
  { title: '供应波动', text: '进货成本暂时上升 18%', days: 2, cost: 1.18, tone: 'bad' },
  { title: '城市夜经济季', text: '餐饮与音乐行业需求大幅提升', days: 4, demand: 1.08, night: 1.42, tone: 'good' },
  { title: '例行卫生检查', text: '服务品质将显著影响近期口碑', days: 1, quality: true, tone: 'warn' },
];

export const BUSINESS_MODELS = INDUSTRIES.flatMap((industry) =>
  SEGMENTS.flatMap((segment) =>
    CHANNELS.map((channel) => ({
      id: `${industry.id}-${segment.id}-${channel.id}`,
      industry,
      segment,
      channel,
      name: `${segment.prefix}${industry.name}${channel.suffix}`,
      setupCost: Math.round(industry.cost * channel.setup),
      tagline: `${segment.name} × ${channel.name}`,
    })),
  ),
);

export const byId = (list, id) => list.find((item) => item.id === id);
