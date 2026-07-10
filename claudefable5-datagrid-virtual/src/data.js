// ============================================================
// 数据生成:mulberry32(seed=42) 确定性 PRNG,100,000 行员工数据。
// 刷新后数据完全一致;同时预构建各列数值型排序键(typed array),
// 让 100k 行排序只做数字比较。
// ============================================================

import { STATUS } from './columns.js';
import { formatThousands } from './utils.js';

export const SEED = 42;
export const TOTAL_ROWS = 100000;

/** mulberry32:32 位种子的确定性 PRNG,返回 [0,1) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 姓/名池按拼音序排列 —— 姓名排序键直接用池下标组合,零运行时拼音开销
const SURNAMES = [
  '曹', '陈', '邓', '丁', '董', '杜', '范', '冯', '傅', '高',
  '郭', '韩', '何', '贺', '胡', '黄', '姜', '蒋', '金', '孔',
  '雷', '黎', '李', '梁', '林', '刘', '卢', '罗', '吕', '马',
  '毛', '孟', '潘', '彭', '钱', '秦', '邱', '任', '邵', '沈',
  '石', '宋', '苏', '孙', '谭', '唐', '陶', '田', '汪', '王',
  '魏', '吴', '武', '夏', '萧', '谢', '徐', '许', '薛', '严',
  '杨', '姚', '叶', '易', '尹', '于', '余', '袁', '曾', '张',
  '赵', '郑', '钟', '周', '朱', '邹',
];

const GIVEN = [
  '安', '斌', '波', '超', '晨', '聪', '丹', '飞', '芳', '刚',
  '浩', '华', '慧', '佳', '健', '杰', '静', '娟', '军', '凯',
  '兰', '磊', '丽', '亮', '琳', '玲', '梅', '敏', '娜', '宁',
  '鹏', '平', '琪', '强', '晴', '荣', '睿', '珊', '爽', '涛',
  '婷', '伟', '文', '霞', '翔', '欣', '鑫', '雪', '雅', '燕',
  '阳', '洋', '怡', '毅', '英', '勇', '宇', '雨', '悦', '云',
  '哲', '振', '志', '舟',
];

export const DEPTS = [
  '采购部', '财务部', '产品部', '测试部', '法务部', '技术部',
  '人事部', '设计部', '市场部', '数据部', '运维部', '运营部',
];

export const CITIES = [
  '北京', '长沙', '成都', '重庆', '大连', '东莞', '佛山', '福州',
  '广州', '贵阳', '杭州', '合肥', '济南', '昆明', '南京', '宁波',
  '青岛', '上海', '深圳', '沈阳', '苏州', '天津', '武汉', '无锡',
  '厦门', '西安', '郑州',
];

const DAY_MS = 86400000;
const DATE_BASE = Date.UTC(2015, 0, 1);
const DATE_SPAN = Math.floor((Date.UTC(2026, 5, 30) - DATE_BASE) / DAY_MS);

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/**
 * 生成全部行 + 各列排序键。
 * 返回 { rows, keys, generateMs }。
 * row: { id, codeText, name, dept, city, salary, salaryText,
 *        dateText, statusIdx, statusText, hay }
 */
export function generateData(count = TOTAL_ROWS, seed = SEED) {
  const t0 = performance.now();
  const rand = mulberry32(seed);

  const rows = new Array(count);
  const nameKey = new Float64Array(count);
  const deptKey = new Uint8Array(count);
  const cityKey = new Uint8Array(count);
  const statusKey = new Uint8Array(count);
  const salaryKey = new Float64Array(count);
  const dateKey = new Float64Array(count);

  const nS = SURNAMES.length;
  const nG = GIVEN.length;
  const nD = DEPTS.length;
  const nC = CITIES.length;

  for (let i = 0; i < count; i++) {
    // —— 注意:rand() 调用次序固定,保证 seed 确定性 ——
    const s = (rand() * nS) | 0;
    const g1 = (rand() * nG) | 0;
    const two = rand() < 0.62;
    const g2 = two ? (rand() * nG) | 0 : -1;
    const name = SURNAMES[s] + GIVEN[g1] + (two ? GIVEN[g2] : '');

    const d = (rand() * nD) | 0;
    const c = (rand() * nC) | 0;

    // 薪资:7,000 – 58,000,幂次偏斜贴近真实分布,取整到百
    const salary = Math.round((7000 + Math.pow(rand(), 1.7) * 51000) / 100) * 100;

    const days = (rand() * DATE_SPAN) | 0;
    const dt = new Date(DATE_BASE + days * DAY_MS);
    const dateText =
      dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());

    const rs = rand();
    const st = rs < 0.76 ? 0 : rs < 0.86 ? 1 : rs < 0.95 ? 2 : 3;

    const dept = DEPTS[d];
    const city = CITIES[c];

    rows[i] = {
      id: i,
      codeText: 'NX' + String(i + 1).padStart(6, '0'),
      name,
      dept,
      city,
      salary,
      salaryText: '¥' + formatThousands(salary),
      dateText,
      statusIdx: st,
      statusText: STATUS[st],
      // 搜索干草堆:姓名/部门/城市,小写化后用 includes 匹配
      hay: (name + '\u0001' + dept + '\u0001' + city).toLowerCase(),
    };

    // 姓名排序键:姓下标*1e6 + (首名+1)*1000 + (次名+1),单字名排在双字名前
    nameKey[i] = s * 1e6 + (g1 + 1) * 1000 + (g2 + 1);
    deptKey[i] = d;
    cityKey[i] = c;
    statusKey[i] = st;
    salaryKey[i] = salary;
    dateKey[i] = days;
  }

  const keys = {
    // code 列排序键即行 id(工号随 id 递增),comparator 里特判
    name: nameKey,
    dept: deptKey,
    city: cityKey,
    salary: salaryKey,
    date: dateKey,
    status: statusKey,
  };

  return { rows, keys, generateMs: performance.now() - t0 };
}
