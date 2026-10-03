// 秋名山主路线的"龟行"描述：直道 S / 圆弧 A（角度为正=左转）。
// 下坡、上坡、雨夜、出山国道都在同一条主路线上截取区间，世界几何只建一次。
// 坡度 grade 为每米下降量（正=下坡方向下降）。

export const ROAD_HALF = 4.6; // 半路宽（米），双车道山路

// tag.ditch：该弯内侧有排水渠；tag.hairpin：发夹弯编号；tag.final：终章"最后一个发夹弯"
export const PROGRAM = [
  { t: 'S', len: 70, grade: 0.03, name: '山顶起点' },
  { t: 'A', ang: -50, r: 70, grade: 0.05 },
  { t: 'S', len: 90, grade: 0.06 },
  { t: 'A', ang: 75, r: 42, grade: 0.06 },
  { t: 'S', len: 150, grade: 0.075, name: '第一高速段' },
  { t: 'A', ang: -25, r: 85, grade: 0.07 },
  { t: 'S', len: 60, grade: 0.07 },
  // 五连发夹弯：东西向折返，逐层向南下山
  { t: 'A', ang: -180, r: 16, grade: 0.07, tag: { hairpin: 1, ditch: true } },
  { t: 'S', len: 100, grade: 0.085 },
  { t: 'A', ang: 180, r: 15, grade: 0.07, tag: { hairpin: 2, ditch: true } },
  { t: 'S', len: 105, grade: 0.085 },
  { t: 'A', ang: -180, r: 16, grade: 0.07, tag: { hairpin: 3, ditch: true } },
  { t: 'S', len: 95, grade: 0.085 },
  { t: 'A', ang: 180, r: 15, grade: 0.07, tag: { hairpin: 4 } },
  { t: 'S', len: 110, grade: 0.085 },
  { t: 'A', ang: -180, r: 17, grade: 0.07, tag: { hairpin: 5, ditch: true } },
  { t: 'S', len: 70, grade: 0.07 },
  // S 弯
  { t: 'A', ang: 65, r: 34, grade: 0.06, tag: { sbend: true } },
  { t: 'S', len: 25, grade: 0.06 },
  { t: 'A', ang: -65, r: 34, grade: 0.06 },
  { t: 'S', len: 20, grade: 0.06 },
  { t: 'A', ang: 90, r: 30, grade: 0.06 },
  { t: 'S', len: 210, grade: 0.075, name: '山腰长直' },
  { t: 'A', ang: -95, r: 28, grade: 0.06 },
  { t: 'S', len: 85, grade: 0.05 },
  { t: 'A', ang: 160, r: 18, grade: 0.045, tag: { hairpin: 6, ditch: true, final: true } },
  { t: 'S', len: 80, grade: 0.03, name: '山脚' },
  // 出山国道
  { t: 'S', len: 360, grade: 0.012, road: 'national' },
  { t: 'A', ang: 12, r: 600, grade: 0.006, road: 'national' },
  { t: 'S', len: 620, grade: 0.004, road: 'national' },
  { t: 'A', ang: -8, r: 700, grade: 0.003, road: 'national' },
  { t: 'S', len: 560, grade: 0.002, road: 'national' }
];

export const START_HEADING = 0; // 弧度，+x 方向

/**
 * 沿程序生成中心线控制点（间距 step 米）。
 * 返回 { pts:[{x,z,y,s,head,curv,seg}], segs:[{s0,s1,...}] }
 */
export function traceProgram(program = PROGRAM, step = 2) {
  let x = 0, z = 0, y = 260, head = START_HEADING, s = 0;
  const pts = [{ x, z, y, s, head, curv: 0, seg: 0 }];
  const segs = [];
  program.forEach((seg, i) => {
    const s0 = s;
    const len = seg.t === 'S' ? seg.len : Math.abs(seg.ang) * Math.PI / 180 * seg.r;
    const n = Math.max(1, Math.round(len / step));
    const ds = len / n;
    const curv = seg.t === 'S' ? 0 : Math.sign(seg.ang) / seg.r;
    for (let k = 0; k < n; k++) {
      // 中点积分让圆弧闭合精确
      const h0 = head;
      head += curv * ds;
      const hm = (h0 + head) / 2;
      // 平面：x 东，z 南（Three.js 右手系，俯视 x 右 z 下）；左转 = 逆时针（俯视）
      x += Math.cos(hm) * ds;
      z -= Math.sin(hm) * ds;
      y -= seg.grade * ds;
      s += ds;
      pts.push({ x, z, y, s, head, curv, seg: i });
    }
    segs.push({ ...seg, i, s0, s1: s, len, curv });
  });
  return { pts, segs, length: s };
}

/** 赛道（课程）定义：主路线上的区间 + 方向 */
export const COURSES = {
  akina_down: { name: '秋名山下坡', from: 'start', to: 'foot', dir: 1, desc: '招牌赛道，急弯多，排水渠可用' },
  akina_up: { name: '秋名山上坡', from: 'start', to: 'foot', dir: -1, desc: '考验马力，四驱车占优' },
  akina_rain: { name: '雨夜秋名山', from: 'start', to: 'foot', dir: 1, rain: true, desc: '低抓地力，漂移更难控制' },
  route_out: { name: '出山国道', from: 'sbend', to: 'end', dir: 1, desc: '终章那条直路，奔驰的主场' },
  // 剧情专用区间
  finale: { name: '出山', from: 'hp3exit', to: 'end', dir: 1 },
  tofu_up: { name: '送豆腐（上山）', from: 'hp1in', to: 'foot', dir: -1 },
  tofu_down: { name: '送豆腐（下山）', from: 'start', to: 'foot', dir: 1 },
  gas_up: { name: '加油站→山腰（上坡）', from: 'hp3exit', to: 'foot', dir: -1 }
};

/** 把命名锚点换算成主路线弧长 */
export function anchorS(segs, name, total) {
  const find = (pred) => segs.find(pred);
  switch (name) {
    case 'start': return 20;
    case 'foot': { const sg = find((g) => g.name === '山脚'); return sg.s1 - 8; }
    case 'end': return total - 15;
    case 'sbend': { const sg = find((g) => g.tag?.sbend); return sg.s0 - 60; }
    case 'hp1in': { const sg = find((g) => g.tag?.hairpin === 1); return sg.s0 - 40; }
    case 'hp3exit': { const sg = find((g) => g.tag?.hairpin === 3); return sg.s1 + 15; }
    case 'hp4exit': { const sg = find((g) => g.tag?.hairpin === 4); return sg.s1 + 30; }
    default: throw new Error('未知锚点 ' + name);
  }
}
