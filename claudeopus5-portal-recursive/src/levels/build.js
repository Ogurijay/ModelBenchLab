// 关卡搭建原语 —— 所有几何都是轴对齐盒;门洞/窗洞交给 boxes.js 的布尔减法。
// 约定:传入的是「房间内部净空」,壳体自动往外长 WALL_T,因此房间之间不会互相侵占。

export const WALL_T = 0.5; // 壳体厚度
export const PANEL_T = 0.08; // 白色可开门面板厚度(贴在墙的内表面上)

export const box = (min, max, mat) => ({ min, max, mat });

/** 六面壳体:地板 / 天花板 / 四面墙。角落归 X 墙所有,互不重叠。 */
export function shell(x0, x1, y0, y1, z0, z1, mats = {}) {
  const t = WALL_T;
  const wall = mats.wall || 'dark';
  return [
    box([x0 - t, y0 - t, z0 - t], [x1 + t, y0, z1 + t], mats.floor || 'floor'),
    box([x0 - t, y1, z0 - t], [x1 + t, y1 + t, z1 + t], mats.ceil || 'ceil'),
    box([x0 - t, y0, z0 - t], [x0, y1, z1 + t], mats.wallXm || wall),
    box([x1, y0, z0 - t], [x1 + t, y1, z1 + t], mats.wallXp || wall),
    box([x0, y0, z0 - t], [x1, y1, z0], mats.wallZm || wall),
    box([x0, y0, z1], [x1, y1, z1 + t], mats.wallZp || wall),
  ];
}

/** 竖井:上方地板被 cut 挖穿后,用它补出四壁与井底(视觉 + 兜住掉落) */
export function pit(x0, x1, yBottom, y0, z0, z1, mat = 'dark') {
  const t = WALL_T;
  return [
    box([x0 - t, yBottom, z0 - t], [x1 + t, yBottom + t, z1 + t], mat),
    box([x0 - t, yBottom, z0 - t], [x0, y0, z1 + t], mat),
    box([x1, yBottom, z0 - t], [x1 + t, y0, z1 + t], mat),
    box([x0, yBottom, z0 - t], [x1, y0, z0], mat),
    box([x0, yBottom, z1], [x1, y0, z1 + t], mat),
  ];
}

/** 贴在墙内表面的白色面板。face: 'x-'|'x+'|'z-'|'z+'|'y-'(天花板)|'y+'(地面) */
export function panel(face, at, a0, a1, b0, b1) {
  const t = PANEL_T;
  switch (face) {
    // at = 墙面 x 坐标,面朝 +X;a=y, b=z
    case 'x-': return box([at, a0, b0], [at + t, a1, b1], 'white');
    case 'x+': return box([at - t, a0, b0], [at, a1, b1], 'white');
    case 'z-': return box([a0, b0, at], [a1, b1, at + t], 'white');
    case 'z+': return box([a0, b0, at - t], [a1, b1, at], 'white');
    // at = 地面 y 坐标(面朝 +Y);a=x, b=z
    case 'y+': return box([a0, at - t, b0], [a1, at, b1], 'white');
    case 'y-': return box([a0, at, b0], [a1, at + t, b1], 'white');
    default: throw new Error('bad face ' + face);
  }
}

/** 一段直楼梯:沿 ±Z 逐级升高,顶面高 topY;每级 ≤ STEP_UP 才爬得上去 */
export function stairs(x0, x1, zTop, topY, steps, rise, run, dir = -1) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const h = topY - i * rise;
    const zA = zTop + dir * (i + 1) * run;
    const zB = zTop + dir * i * run;
    out.push(box([x0, -0.5, Math.min(zA, zB)], [x1, h, Math.max(zA, zB)], 'dark'));
  }
  return out;
}

/** 出口走廊:从 fromZ 往 -Z 延伸,宽 halfW,含消解栅位与电梯区 */
export function corridor(halfW, y0, y1, zNear, zFar) {
  return shell(-halfW, halfW, y0, y1, zFar, zNear, { wall: 'dark' });
}
