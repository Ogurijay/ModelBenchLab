// 四种底盘的程序化模型：AR / Super-II / Super-1 / FM-A。
// 尺寸依据田宫商品页（全长、全宽）与套件扫描图换算（轴距 80 mm，13 mm 导轮），细部为结构性推导。
import * as THREE from 'three';
import { loftX, loftZ, fillet, stations, extrude, merge, cyl, box, roundBox, curve, lerp, mirrorZ } from './geo.js';
import { plastic, metalPlastic, metal, matte, PALETTE } from './mats.js';
import { buildRoller, buildWheel, TIRES } from './wheels.js';

export const WHEELBASE = 80;
export const ROLLER_H = 5.5; // 13 mm 导轮厚度

// 底盘规格：坐标原点在前后轴中点、地面 y=0
export const CHASSIS = {
  AR: {
    label: 'AR 底盘', motor: 'rear', floorY: 2.2, wallTop: 15.5, tubFront: 54, tubRear: -60, tubHalf: 25,
    frontRoller: { x: 67.9, z: 42, y: 7.1 }, rearRoller: { x: -63.9, z: 42, y: 19.2, double: true, lowerY: 7.8 },
    track: 32, // 车轮中心到中线（72 mm 轴）
    sideGuard: { x0: -18, x1: 14, z: 43 },
    length: 155, width: 97, gear: '3.5:1',
  },
  'Super-II': {
    label: 'Super-II 底盘', motor: 'rear', floorY: 2.4, wallTop: 15, tubFront: 58, tubRear: -58, tubHalf: 26,
    frontRoller: { x: 62.7, z: 42, y: 5.3 }, rearRoller: { x: -71.4, z: 42, y: 11.1, double: false },
    track: 32, length: 150, width: 97, gear: '4:1',
  },
  'Super-1': {
    label: 'Super-1 底盘', motor: 'rear', floorY: 2.6, wallTop: 15, tubFront: 56, tubRear: -58, tubHalf: 25,
    frontRoller: { x: 66.5, z: 38.5, y: 11.7 }, rearRoller: { x: -13.6, z: 41.6, y: 12.5, double: false, side: true },
    track: 32, length: 132, width: 90, gear: '4:1',
  },
  'FM-A': {
    label: 'FM-A 底盘', motor: 'front', floorY: 2.2, wallTop: 15.5, tubFront: 60, tubRear: -56, tubHalf: 25,
    frontRoller: { x: 62.0, z: 42, y: 4.4 }, rearRoller: { x: -64.1, z: 42, y: 2.3, double: false, skid: true },
    sideGuard: { x0: -12, x1: 18, z: 45 },
    track: 32, length: 156, width: 97, gear: '3.5:1',
  },
};

function part(obj, id, label, explode) {
  obj.name = id;
  obj.userData.part = { id, label, explode: new THREE.Vector3(...explode) };
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

const holeMat = () => plastic(0x0d0e10, { rough: 0.95 });

// 底盘托盘外形（俯视）：前后端收窄，用于底板挤出
function tubOutline(c) {
  const f = c.tubFront, r = c.tubRear, w = c.tubHalf;
  return [
    [r, -w + 5], [r + 6, -w], [f - 10, -w], [f, -w + 9], [f, w - 9], [f - 10, w], [r + 6, w], [r, w - 5],
  ];
}

export function buildChassis(type, colors = {}) {
  const c = CHASSIS[type] || CHASSIS.AR;
  const col = {
    tub: colors.tub ?? PALETTE.arGray, aParts: colors.aParts ?? 0x2b5fd9, roller: colors.roller ?? 0x2b5fd9,
    gearCover: colors.gearCover ?? colors.aParts ?? 0x2b5fd9, stay: colors.stay ?? colors.tub ?? PALETTE.arGray,
    bumper: colors.bumper ?? colors.tub ?? PALETTE.arGray,
  };
  const tubMat = colors.tubFinish === 'plain' ? plastic(col.tub, { rough: 0.5 }) : metalPlastic(col.tub, { rough: 0.48, metal: 0.35 });
  const aMat = plastic(col.aParts, { rough: 0.38, clearcoat: 0.3 });
  const stayMat = colors.stayMetal ? metalPlastic(col.stay, { rough: 0.4, metal: 0.55 }) : plastic(col.stay, { rough: 0.5 });
  const bumperMat = col.bumper === col.tub ? tubMat : metalPlastic(col.bumper, { rough: 0.45, metal: 0.45 });
  const root = new THREE.Group(); root.name = 'chassis-root';
  const fy = c.floorY, wt = c.wallTop;

  // ---------- 底盘本体 ----------
  const tub = new THREE.Group();
  const geos = [];
  // 底板（2 mm），带倒角
  geos.push(extrude(tubOutline(c), 2.0, { plane: 'xz', bevel: 0.4, offset: 0 }).translate(0, fy + 1.0, 0));
  // 侧墙：沿 x 放样的薄壁，中段较高（电池仓），前后轴处开轴承座
  const wallH = curve([[c.tubRear, wt - 4], [c.tubRear + 14, wt - 1], [-20, wt], [20, wt], [c.tubFront - 14, wt - 2], [c.tubFront, wt - 6]]);
  const wallZ = curve([[c.tubRear, c.tubHalf - 5], [c.tubRear + 6, c.tubHalf], [c.tubFront - 10, c.tubHalf], [c.tubFront, c.tubHalf - 9]]);
  const wall = loftX(stations(c.tubRear + 0.5, c.tubFront - 0.5, 3), x => {
    const z = wallZ(x), h = wallH(x);
    return fillet([[z - 1.8, fy + 0.5], [z - 1.8, h], [z, h], [z, fy + 0.5]], [0, 0.6, 0.6, 0], { seg: 2 });
  });
  geos.push(wall, mirrorZ(wall));
  // 前后隔板
  geos.push(roundBox(c.tubFront - 3.5, c.tubFront - 1, -c.tubHalf + 9, c.tubHalf - 9, fy, wt - 6, 0.5));
  geos.push(roundBox(c.tubRear + 0.8, c.tubRear + 3.2, -c.tubHalf + 5, c.tubHalf - 5, fy, wt - 4, 0.5));
  // 电池仓中隔与加强筋
  for (const x of [-22, -6, 10, 26]) geos.push(roundBox(x - 0.6, x + 0.6, -c.tubHalf + 2, c.tubHalf - 2, fy + 1.5, fy + 4.5, 0.3));
  geos.push(roundBox(-30, 34, -0.6, 0.6, fy + 1.5, fy + 4.2, 0.3));
  // 轴承座（前后轴穿过侧墙处）
  for (const x of [-WHEELBASE / 2, WHEELBASE / 2]) for (const s of [1, -1]) {
    const tr = TIRES.low26.od / 2;
    geos.push(cyl(3.2, 3.2, 4.2, { axis: 'z', at: [x, tr, s * (wallZ(x) - 1.2)], seg: 18 }));
    geos.push(roundBox(x - 4, x + 4, s > 0 ? wallZ(x) - 3 : -wallZ(x), s > 0 ? wallZ(x) : -wallZ(x) + 3, fy, tr, 0.5));
  }
  const tubMesh = new THREE.Mesh(merge(geos), tubMat); tubMesh.name = 'tub';
  tub.add(tubMesh);

  // ---------- 前保险杠（导轮安装板） ----------
  const fr = c.frontRoller;
  const bumper = [];
  const plateY = fr.y - 2.6;
  if (type === 'AR' || type === 'FM-A') {
    // 鸥翼形宽保险杠：中段在前轴前方，两翼后掠再前伸到导轮
    const half = [
      [c.tubFront - 6, 0], [c.tubFront + 4, 0], [fr.x - 6, 14], [fr.x + 2, fr.z - 9], [fr.x + 6.5, fr.z], [fr.x + 2, fr.z + 6.2],
      [fr.x - 6, fr.z + 5.5], [fr.x - 11, fr.z - 3], [c.tubFront - 2, 20], [c.tubFront - 12, c.tubHalf - 4],
    ];
    const outline = [...half, ...half.slice(1).reverse().map(([x, z]) => [x, -z])];
    bumper.push(extrude(outline, 2.6, { plane: 'xz', bevel: 0.5 }).translate(0, plateY + 1.3, 0));
    // 加强筋
    for (const s of [1, -1]) bumper.push(loftX(stations(c.tubFront - 4, fr.x - 2, 4), x => {
      const t = (x - c.tubFront + 4) / (fr.x - 2 - c.tubFront + 4), zc = s * lerp(c.tubHalf - 8, fr.z - 4, t);
      return fillet([[zc - 1.2, plateY + 2.4], [zc - 1.2, plateY + 4.6], [zc + 1.2, plateY + 4.6], [zc + 1.2, plateY + 2.4]], [0, 0.6, 0.6, 0], { seg: 2 });
    }));
  } else if (type === 'Super-II') {
    // Super-II：车头一体式前端 + 平直导轮横梁
    const half = [[c.tubFront - 8, 0], [fr.x + 3, 0], [fr.x + 6, 10], [fr.x + 6.5, fr.z], [fr.x + 1, fr.z + 6.2], [fr.x - 5, fr.z + 5], [fr.x - 5, 20], [c.tubFront - 8, c.tubHalf - 6]];
    const outline = [...half, ...half.slice(1).reverse().map(([x, z]) => [x, -z])];
    bumper.push(extrude(outline, 2.8, { plane: 'xz', bevel: 0.5 }).translate(0, plateY + 1.4, 0));
  } else {
    // Super-1：窄长前端
    const half = [[c.tubFront - 8, 0], [fr.x + 4, 0], [fr.x + 6.5, fr.z - 3], [fr.x + 2, fr.z + 6], [fr.x - 6, fr.z + 4], [c.tubFront - 4, 14], [c.tubFront - 8, c.tubHalf - 6]];
    const outline = [...half, ...half.slice(1).reverse().map(([x, z]) => [x, -z])];
    bumper.push(extrude(outline, 2.6, { plane: 'xz', bevel: 0.5 }).translate(0, plateY + 1.3, 0));
  }
  // 保险杠上的孔位（暗点）
  const holes = [];
  for (const s of [1, -1]) for (let i = 1; i <= 3; i++) {
    const t = i / 4, x = lerp(c.tubFront + 2, fr.x - 4, t), z = s * lerp(8, fr.z - 6, t);
    holes.push(cyl(1.0, 1.0, 0.3, { at: [x, plateY + 2.75, z], seg: 10 }));
  }
  const bumperMesh = new THREE.Mesh(merge(bumper), bumperMat); bumperMesh.name = 'front-bumper';
  tub.add(bumperMesh);
  const holeMesh = new THREE.Mesh(merge(holes), holeMat()); holeMesh.name = 'bumper-holes'; tub.add(holeMesh);

  // ---------- 侧护（AR / FM-A 中段两侧凸出） ----------
  if (c.sideGuard) {
    const sg = c.sideGuard, g = [];
    for (const s of [1, -1]) {
      const half = [[sg.x0, c.tubHalf - 2], [sg.x0 + 6, sg.z - 2], [sg.x0 + 9, sg.z], [sg.x1 - 9, sg.z], [sg.x1 - 6, sg.z - 2], [sg.x1, c.tubHalf - 2]];
      const pts = half.map(([x, z]) => [x, z * s]);
      g.push(extrude(s > 0 ? pts : pts.slice().reverse(), 3.0, { plane: 'xz', bevel: 0.5 }).translate(0, fy + 5.5, 0));
    }
    const m = new THREE.Mesh(merge(g), tubMat); m.name = 'side-guards'; tub.add(m);
  }
  part(tub, 'chassis', c.label, [0, -14, 0]);
  root.add(tub);

  // ---------- 后导轮支架 ----------
  const rr = c.rearRoller;
  const stay = new THREE.Group();
  const sg = [];
  const sy = rr.y - 3.0;
  if (rr.side) {
    // Super-1：侧置后导轮架——自底盘侧墙伸出的短臂，导轮位于后轮前方
    for (const sg2 of [1, -1]) {
      const arm = [[rr.x + 7, 20], [rr.x + 6, rr.z - 3], [rr.x + 4.5, rr.z + 5.5], [rr.x - 4.5, rr.z + 5.5], [rr.x - 6, rr.z - 3], [rr.x - 9, 20]];
      const pts = arm.map(([x, z]) => [x, z * sg2]);
      sg.push(extrude(sg2 > 0 ? pts : pts.slice().reverse(), 2.6, { plane: 'xz', bevel: 0.5 }).translate(0, sy + 1.3, 0));
      sg.push(roundBox(rr.x - 9, rr.x + 7, sg2 > 0 ? 18 : -24, sg2 > 0 ? 24 : -18, c.floorY + 2, sy + 1.5, 0.8));
    }
  } else {
    const back = c.tubRear;
    const plateY = rr.double ? rr.y - 3.0 : sy;
    const half = [[back + 6, 0], [back - 3, 0], [rr.x + 2, rr.z - 14], [rr.x - 6.5, rr.z - 2], [rr.x - 4, rr.z + 6], [rr.x + 4, rr.z + 5.5], [rr.x + 8, rr.z - 6], [back + 10, 16], [back + 10, 0]];
    const outline = [...half, ...half.slice(1).reverse().map(([x, z]) => [x, -z])];
    sg.push(extrude(outline, rr.skid ? 2.2 : 2.8, { plane: 'xz', bevel: 0.5 }).translate(0, plateY + 1.4, 0));
    if (rr.double) {
      // 支架根部立柱（从底盘尾部升到导轮板）与上下导轮之间的隔套
      sg.push(roundBox(back + 1, back + 11, -14, 14, c.floorY + 2, plateY + 1, 1.2));
      for (const s of [1, -1]) sg.push(cyl(3.4, 3.4, rr.y - (rr.lowerY + ROLLER_H) + 0.1, { at: [rr.x, (rr.y + rr.lowerY + ROLLER_H) / 2, s * rr.z], seg: 18 }));
    }
    if (rr.skid) {
      // 滑板式后导轮架：下沿带弧形滑块
      for (const s of [1, -1]) sg.push(loftX(stations(rr.x - 2, back + 4, 3), x => {
        const z = s * lerp(rr.z - 6, 14, (x - rr.x + 2) / (back + 6 - rr.x)), y0 = sy - 3 + 2.5 * Math.pow((x - (rr.x - 2)) / (back + 6 - rr.x), 0.5);
        return fillet([[z - 2, y0], [z - 2, sy], [z + 2, sy], [z + 2, y0]], [1, 0, 0, 1], { seg: 2 });
      }));
    }
  }
  const stayMesh = new THREE.Mesh(merge(sg), stayMat); stayMesh.name = 'rear-stay'; stay.add(stayMesh);
  part(stay, 'stay', '后导轮支架', [-14, -6, 0]);
  root.add(stay);

  // ---------- 导轮 ----------
  const rollers = new THREE.Group();
  const rs = colors.rollerSpec || {};
  const addRoller = (x, y, z, screw = true, color = col.roller) => { const r = buildRoller(rs.color ?? color, { h: ROLLER_H, screw, d: rs.d || 13, bearing: !!rs.bearing }); r.position.set(x, y, z); rollers.add(r); };
  const rearColor = colors.rollerRear ?? col.roller;
  const widen = rs.d ? (rs.d - 13) / 2 : 0;
  for (const s of [1, -1]) {
    addRoller(fr.x, fr.y, s * (fr.z + widen));
    if (rs.double) addRoller(fr.x, fr.y - ROLLER_H - 0.8, s * (fr.z + widen), false);
    addRoller(rr.x, rr.y, s * (rr.z + widen), true, rearColor);
    if (rr.double) addRoller(rr.x, rr.lowerY, s * (rr.z + widen), false, rearColor);
    else if (rs.double) addRoller(rr.x, rr.y - ROLLER_H - 0.8, s * (rr.z + widen), false, rearColor);
  }
  part(rollers, 'rollers', rs.d ? `导轮（${rs.d} mm${rs.bearing ? ' 轴承' : ''}）` : `导轮（13 mm${rs.bearing ? ' 轴承' : ''}${rs.double ? '，双层' : ''}）`, [0, 8, 0]);
  root.add(rollers);

  // ---------- 刹车海绵（后导轮架下方）与配重阻尼 ----------
  if (colors.brake != null) {
    const bk = new THREE.Group();
    const pads = [];
    for (const s of [1, -1]) pads.push(roundBox(rr.x + 4, rr.x + 14, s * 9 - 5, s * 9 + 5, Math.max(0.6, rr.y - 4.2), Math.max(1.8, rr.y - 2.6), 0.4));
    bk.add(new THREE.Mesh(merge(pads), matte(colors.brake, 0.95)));
    part(bk, 'brake', '刹车海绵', [-8, -10, 0]);
    root.add(bk);
  }
  if (colors.dampers) {
    const dm = new THREE.Group(), weights = [];
    const spots = colors.dampers >= 4 ? [[22, 1], [22, -1], [-22, 1], [-22, -1]] : [[0, 1], [0, -1]];
    for (const [x, s] of spots) {
      weights.push(cyl(3.4, 3.4, 6, { axis: 'y', at: [x, 9, s * 37], seg: 18 }));
      weights.push(cyl(0.9, 0.9, 12, { axis: 'y', at: [x, 9, s * 37], seg: 8 }));
    }
    dm.add(new THREE.Mesh(merge(weights), metal(PALETTE.brass, { rough: 0.3 })));
    part(dm, 'dampers', '质量阻尼器（黄铜）', [0, 4, 0]);
    root.add(dm);
  }

  // ---------- 马达 ----------
  const motorX = c.motor === 'front' ? 27 : -26, motorY = 12.4;
  const motor = buildMotor(colors.motorLabel ?? 0xbcc1c6, colors.motorEnd ?? 0x23252a);
  motor.position.set(motorX, motorY, -1.5);
  part(motor, 'motor', '马达（130 型）', [c.motor === 'front' ? 10 : -10, 22, 0]);
  root.add(motor);

  // ---------- 齿轮组与传动轴 ----------
  const gears = new THREE.Group();
  const gearSide = 1; // 齿轮在右侧
  const gx = motorX, gearZ = gearSide * 13.5;
  const gMats = { pinion: plastic(0xd9c9a0, { rough: 0.5 }), counter: plastic(colors.counterGear ?? 0x7fc7e8, { rough: 0.5 }), spur: plastic(colors.spurGear ?? 0xf0d23a, { rough: 0.5 }), crown: plastic(0xea7bb0, { rough: 0.5 }) };
  const axleX = c.motor === 'front' ? WHEELBASE / 2 : -WHEELBASE / 2;
  const sp = new THREE.Mesh(gearGeo(9.5, 1.6, 30), gMats.spur); sp.position.set(axleX, TIRES.low26.od / 2, gearZ + 1.5); gears.add(sp);
  const cg = new THREE.Mesh(gearGeo(5.4, 2.2, 18), gMats.counter); cg.position.set((axleX + gx) / 2 + (c.motor === 'front' ? 3 : -3), motorY + 0.5, gearZ + 0.2); gears.add(cg);
  const pn = new THREE.Mesh(gearGeo(2.6, 3.0, 8), gMats.pinion); pn.position.set(gx, motorY, gearZ - 0.6); gears.add(pn);
  // 传动轴（贯穿底盘一侧）
  const shaftZ = 9.5;
  const shaft = new THREE.Mesh(cyl(0.9, 0.9, WHEELBASE - 4, { axis: 'x', at: [0, 8.8, shaftZ], seg: 10 }), metal(0xc9ccd2, { rough: 0.25 }));
  gears.add(shaft);
  for (const x of [WHEELBASE / 2 - 4, -WHEELBASE / 2 + 4]) {
    const cr = new THREE.Mesh(gearGeo(4.5, 2.0, 16), gMats.crown); cr.rotation.y = Math.PI / 2; cr.position.set(x, 8.8, shaftZ); gears.add(cr);
  }
  // 齿轮盖
  const gc = new THREE.Mesh(gearCoverGeo(axleX, gx, gearZ, motorY, c.motor === 'front'), plastic(col.gearCover, { rough: 0.35, clearcoat: 0.4, metal: colors.gearCoverMetal ? 0.5 : 0 }));
  gc.name = 'gear-cover'; gears.add(gc);
  part(gears, 'gears', `齿轮组（${c.gear}）与传动轴`, [0, 16, 18]);
  root.add(gears);

  // ---------- 车轴 ----------
  const axles = new THREE.Group();
  for (const x of [-WHEELBASE / 2, WHEELBASE / 2]) {
    const a = new THREE.Mesh(cyl(1.0, 1.0, c.track * 2 + 4, { axis: 'z', seg: 6, at: [x, 0, 0] }), metal(0xd2d5da, { rough: 0.3 }));
    a.userData.axle = x; axles.add(a);
  }
  part(axles, 'axles', '六角轴', [0, -4, 0]);
  root.add(axles);

  // ---------- 电池 ----------
  const bat = new THREE.Group();
  const bx = c.motor === 'front' ? -12 : 8;
  for (const s of [1, -1]) bat.add(buildAA(colors.battery ?? 'alkaline', bx, 9.6, s * 7.6));
  bat.userData.kind = colors.battery ?? 'alkaline';
  part(bat, 'battery', '电池（2 × AA）', [0, 30, 0]);
  root.add(bat);

  // ---------- 电池盖 / 底板 ----------
  const cover = new THREE.Group();
  const cv = [];
  cv.push(loftX(stations(bx - 25, bx + 25, 2.5), x => {
    const k = Math.min(1, (x - (bx - 25)) / 4, (bx + 25 - x) / 4);
    const w = 16.5 * (0.8 + 0.2 * k), top = 18.4 + 0.8 * k;
    return fillet([[-w, 15.5], [-w, top - 0.6], [-w + 3, top], [w - 3, top], [w, top - 0.6], [w, 15.5]], [0, 1, 1, 1, 1, 0], { seg: 2 });
  }));
  // 开关
  cv.push(roundBox(c.motor === 'front' ? -36 : 30, c.motor === 'front' ? -30 : 36, -4, 4, 15.6, 19.6, 0.8));
  const coverMesh = new THREE.Mesh(merge(cv), aMat); coverMesh.name = 'battery-cover'; cover.add(coverMesh);
  part(cover, 'cover', '电池盖与开关', [0, 22, -10]);
  root.add(cover);

  root.userData.spec = c;
  root.userData.colors = col;
  return root;
}

// 130 型马达：扁圆罐（20.1×15.1），后盖，转轴
export function buildMotor(labelColor = 0xbcc1c6, endColor = 0x23252a) {
  const g = new THREE.Group();
  const L = 25, rw = 10.05, rh = 7.55;
  // 扁圆截面（平面朝上下），轴向沿 z
  const flat = (k = 0) => { const pts = []; for (let i = 0; i < 32; i++) { const a = -i / 32 * Math.PI * 2; pts.push([Math.cos(a) * (rw + k), Math.max(-rh - k, Math.min(rh + k, Math.sin(a) * (rw + k)))]); } return pts; };
  const can = new THREE.Mesh(loftZ([-L / 2, -L / 2 + 0.8, L / 2 - 1.2, L / 2], z => { const k = z > L / 2 - 1 ? -0.9 : 0; return flat(k); }), metal(0xc5c9ce, { rough: 0.32 }));
  can.name = 'motor-can'; g.add(can);
  const label = new THREE.Mesh(loftZ([-6, 6], () => flat(0.08), { capStart: false, capEnd: false }), matte(labelColor, 0.55));
  label.name = 'motor-label'; g.add(label);
  const eb = new THREE.Mesh(loftZ([-L / 2 - 5.2, -L / 2 - 4.6, -L / 2], z => flat(z < -L / 2 - 5 ? -1.2 : -0.4)), plastic(endColor, { rough: 0.5 }));
  eb.name = 'motor-endbell'; g.add(eb);
  for (const s of [1, -1]) { const t = new THREE.Mesh(box(1.6, 3.4, 0.4, [s * 5.5, rh + 0.9, -L / 2 - 3]), metal(PALETTE.copper, { rough: 0.35 })); t.name = 'motor-terminal'; g.add(t); }
  const shaftM = new THREE.Mesh(cyl(1.0, 1.0, 6, { axis: 'z', at: [0, 0, L / 2 + 2.6], seg: 10 }), metal(0xd8dbe0, { rough: 0.2 })); shaftM.name = 'motor-shaft'; g.add(shaftM);
  return g;
}

function gearGeo(r, w, teeth) {
  const pts = [];
  for (let i = 0; i < teeth * 2; i++) { const a = i / (teeth * 2) * Math.PI * 2; const rr = i % 2 ? r : r - Math.min(0.9, r * 0.12); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  return extrude(pts, w, { plane: 'xy', curveSeg: 2 });
}

function gearCoverGeo(axleX, gx, gz, my, front) {
  const x0 = Math.min(axleX, gx) - 9, x1 = Math.max(axleX, gx) + 7;
  return loftX(stations(x0, x1, 2), x => {
    const t = (x - x0) / (x1 - x0), top = 21 - 4 * Math.pow(Math.abs(t - 0.45) * 1.6, 2);
    return fillet([[gz - 5, 4], [gz - 5, top], [gz + 4.5, top], [gz + 4.5, 4]], [0, 2.2, 2.2, 0], { seg: 3 });
  });
}

// AA 电池（14.5 × 50.5）：沿 x 放置
export function buildAA(kind, cx, cy, cz) {
  const g = new THREE.Group();
  const colors = { alkaline: [0xc7a24a, 0x1e1f22], nimh: [0x3c9f74, 0xdcdfe2], light: [0xd96b3c, 0x222326] };
  const [a, b] = colors[kind] || colors.alkaline;
  const body = new THREE.Mesh(cyl(7.25, 7.25, 49, { axis: 'x', at: [cx, cy, cz], seg: 28 }), plastic(a, { rough: 0.32, clearcoat: 0.6 }));
  const band = new THREE.Mesh(cyl(7.28, 7.28, 14, { axis: 'x', at: [cx - 14, cy, cz], seg: 28, open: true }), plastic(b, { rough: 0.4, clearcoat: 0.5 }));
  const nub = new THREE.Mesh(cyl(2.6, 2.6, 1.4, { axis: 'x', at: [cx + 25.2, cy, cz], seg: 16 }), metal(0xd7dade, { rough: 0.25 }));
  body.name = 'battery-cell'; band.name = 'battery-band'; nub.name = 'battery-tip';
  g.add(body, band, nub);
  return g;
}

// 四轮：返回 { group, wheels }；wheels 按 fl/fr/rl/rr
export function buildWheels(type, wheelDef) {
  const c = CHASSIS[type] || CHASSIS.AR;
  const out = new THREE.Group(); out.name = 'wheels-root';
  const list = {};
  const spec = TIRES[wheelDef.tire] || TIRES.low26;
  for (const [id, x, s] of [['fl', WHEELBASE / 2, -1], ['fr', WHEELBASE / 2, 1], ['rl', -WHEELBASE / 2, -1], ['rr', -WHEELBASE / 2, 1]]) {
    const front = x > 0;
    const def = { ...wheelDef, cover: front ? wheelDef.frontCover : wheelDef.rearCover };
    const w = buildWheel(def, s);
    const holder = new THREE.Group();
    holder.add(w);
    holder.position.set(x, spec.od / 2, s * c.track);
    holder.userData.spin = w;
    const labels = { fl: '左前轮', fr: '右前轮', rl: '左后轮', rr: '右后轮' };
    part(holder, 'wheel-' + id, labels[id] + '（' + spec.label + '）', [front ? 10 : -10, 0, s * 22]);
    out.add(holder); list[id] = holder;
  }
  return { group: out, wheels: list, spec };
}
