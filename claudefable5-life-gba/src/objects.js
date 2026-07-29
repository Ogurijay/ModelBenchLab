// objects.js — 家具注册表:摆放、脚印碰撞、交互菜单与升级
import { TILE } from './art.js';

// 动作模板:rates 每游戏分钟增减;until 该需求满则自动结束;dur 固定分钟;instant 立即生效
// pose: stand | sit | hideBed | hideShower ; needsPower 停电时禁用
export const FURN = {
  bed_basic: { label: '单人床', fp: [1, 2], solid: true },
  bed_big: { label: '双人大床', fp: [2, 2], solid: true },
  lamp: { label: '落地灯', fp: [1, 1], solid: true },
  bookshelf: { label: '书架', fp: [1, 1], solid: true },
  toilet: { label: '马桶', fp: [1, 1], solid: true },
  shower: { label: '淋浴间', fp: [1, 1], solid: true },
  basin: { label: '洗漱台', fp: [1, 1], solid: true },
  tv_basic: { label: '小电视', fp: [1, 1], solid: true },
  tv_big: { label: '大彩电', fp: [2, 1], solid: true },
  sofa_basic: { label: '布沙发', fp: [2, 1], solid: true },
  sofa_leather: { label: '真皮沙发', fp: [2, 1], solid: true },
  phone: { label: '电话', fp: [1, 1], solid: true },
  stereo: { label: '音响', fp: [1, 1], solid: true },
  plant: { label: '盆栽', fp: [1, 1], solid: true },
  counter: { label: '橱柜台面', fp: [1, 1], solid: true },
  sink: { label: '水槽', fp: [1, 1], solid: true },
  stove: { label: '灶台', fp: [1, 1], solid: true },
  fridge: { label: '冰箱', fp: [1, 1], solid: true },
  table: { label: '餐桌', fp: [2, 1], solid: true },
  chair: { label: '椅子', fp: [1, 1], solid: true },
  mailbox: { label: '邮箱', fp: [1, 1], solid: true },
  tree: { label: '树', fp: [1, 1], solid: true },
  door: { label: '家门', fp: [1, 1], solid: false },
  rug: { label: '地毯', fp: [3, 2], solid: false, flat: true },
  puddle: { label: '水洼', fp: [1, 1], solid: false, flat: true },
};

export function initialInstances() {
  return [
    { id: 'bed', type: 'bed_basic', tx: 3, ty: 3 },
    { id: 'lampBR', type: 'lamp', tx: 5, ty: 3, on: true },
    { id: 'shelf', type: 'bookshelf', tx: 7, ty: 3 },
    { id: 'toilet', type: 'toilet', tx: 3, ty: 8 },
    { id: 'shower', type: 'shower', tx: 5, ty: 8 },
    { id: 'basin', type: 'basin', tx: 8, ty: 8 },
    { id: 'tv', type: 'tv_basic', tx: 11, ty: 3 },
    { id: 'phone', type: 'phone', tx: 15, ty: 3 },
    { id: 'plant1', type: 'plant', tx: 17, ty: 3 },
    { id: 'rug', type: 'rug', tx: 12, ty: 7 },
    { id: 'sofa', type: 'sofa_basic', tx: 11, ty: 5 },
    { id: 'lampLR', type: 'lamp', tx: 10, ty: 11, on: true },
    { id: 'counter1', type: 'counter', tx: 19, ty: 3 },
    { id: 'sink', type: 'sink', tx: 20, ty: 3 },
    { id: 'stove', type: 'stove', tx: 21, ty: 3 },
    { id: 'counter2', type: 'counter', tx: 22, ty: 3 },
    { id: 'counter3', type: 'counter', tx: 23, ty: 3 },
    { id: 'fridge', type: 'fridge', tx: 24, ty: 3 },
    { id: 'chair1', type: 'chair', tx: 19, ty: 7 },
    { id: 'table', type: 'table', tx: 20, ty: 7 },
    { id: 'chair2', type: 'chair', tx: 22, ty: 7 },
    { id: 'mailbox', type: 'mailbox', tx: 15, ty: 14 },
    { id: 'tree1', type: 'tree', tx: 2, ty: 13 },
    { id: 'tree2', type: 'tree', tx: 24, ty: 13 },
    { id: 'door', type: 'door', tx: 13, ty: 12 },
  ];
}

export class ObjectMap {
  constructor(instances) {
    this.list = instances;
  }
  byId(id) { return this.list.find((o) => o.id === id) || null; }
  footprint(inst) { return FURN[inst.type].fp; }
  // 占用某格的实例(含脚印)
  at(tx, ty) {
    for (const o of this.list) {
      const [w, h] = FURN[o.type].fp;
      if (tx >= o.tx && tx < o.tx + w && ty >= o.ty && ty < o.ty + h) return o;
    }
    return null;
  }
  solidAt(tx, ty) {
    const o = this.at(tx, ty);
    return !!(o && FURN[o.type].solid);
  }
  addPuddle(tx, ty) {
    const id = `puddle${Date.now() % 100000}`;
    this.list.push({ id, type: 'puddle', tx, ty });
    return id;
  }
  remove(id) {
    const i = this.list.findIndex((o) => o.id === id);
    if (i >= 0) this.list.splice(i, 1);
  }
  // 购物升级
  applyPurchase(key) {
    switch (key) {
      case 'bedBig': this.byId('bed').type = 'bed_big'; break;
      case 'tvBig': this.byId('tv').type = 'tv_big'; break;
      case 'sofaLeather': this.byId('sofa').type = 'sofa_leather'; break;
      case 'stereo': this.list.push({ id: 'stereo', type: 'stereo', tx: 16, ty: 3 }); break;
      case 'console': this.byId('tv').console = true; break;
      case 'plant2': this.list.push({ id: 'plant2', type: 'plant', tx: 17, ty: 11 }); break;
    }
  }
}

// ---------- 交互菜单 ----------
// 返回 [{id,label,cost,disabled,reason, act:{...动作模板}}]
export function optionsFor(inst, sim) {
  const S = sim.state;
  const power = S.power;
  const o = [];
  const opt = (id, label, cost, act, disabled = false, reason = '') =>
    o.push({ id, label, cost, act, disabled, reason });

  switch (inst.type) {
    case 'bed_basic':
    case 'bed_big': {
      const big = inst.type === 'bed_big';
      opt('sleep', '睡觉到天亮', 0, { kind: 'sleep', quality: big ? 1.35 : 1 });
      opt('nap', '小睡一会', 0, {
        kind: 'timed', pose: 'hideBed', until: 'energy',
        rates: { energy: big ? 0.75 : 0.55, hunger: -0.03 }, speed: 8, sfx: 'sleep',
        text: '呼……眯一会儿。',
      });
      break;
    }
    case 'lamp':
      opt('toggle', inst.on ? '关灯' : '开灯', 0, { kind: 'lamp' });
      break;
    case 'bookshelf':
      opt('read', '读一本书', 0, {
        kind: 'timed', pose: 'stand', until: 'fun',
        rates: { fun: 0.8, energy: -0.02 }, speed: 6, text: '翻开了一本旧小说……',
      });
      break;
    case 'toilet':
      opt('use', '上厕所', 0, {
        kind: 'timed', pose: 'sitOn', until: 'bladder',
        rates: { bladder: 9 }, speed: 4, endSfx: 'flush', text: '如释重负……',
      });
      break;
    case 'shower':
      opt('shower', power ? '洗个热水澡' : '洗冷水澡(停电)', 0, {
        kind: 'timed', pose: 'hideShower', until: 'hygiene',
        rates: { hygiene: power ? 2.6 : 1.2, fun: power ? 0.15 : -0.3 },
        speed: 6, loopSfx: 'shower', text: power ? '哗啦啦——舒服!' : '水是凉的!好冷!',
      });
      break;
    case 'basin':
      opt('wash', '洗把脸', 0, {
        kind: 'timed', pose: 'stand', dur: 5,
        rates: { hygiene: 2.0 }, speed: 4, text: '在洗漱台洗了把脸。',
      });
      break;
    case 'sink':
      opt('wash', '洗洗手', 0, {
        kind: 'timed', pose: 'stand', dur: 4,
        rates: { hygiene: 2.0 }, speed: 4, text: '把手洗得干干净净。',
      });
      break;
    case 'fridge':
      if (power) {
        opt('snack', '吃份快餐', 5, {
          kind: 'timed', pose: 'stand', dur: 12,
          rates: { hunger: 2.6, bladder: -0.5 }, speed: 5, sfx: 'eat', text: '从冰箱翻出快餐,加热开吃。',
        }, S.money < 5, '钱不够');
      } else {
        opt('cold', '啃点冷食', 5, {
          kind: 'timed', pose: 'stand', dur: 10,
          rates: { hunger: 2.0, fun: -0.2, bladder: -0.5 }, speed: 5, sfx: 'eat', text: '停电了,只能吃冷的……',
        }, S.money < 5, '钱不够');
      }
      break;
    case 'stove':
      opt('cook', '做顿好饭', 18, {
        kind: 'timed', pose: 'stand', dur: 30,
        rates: { hunger: 2.6, fun: 0.3, bladder: -0.4 }, speed: 6, sfx: 'eat', text: '锅铲翻飞,香气四溢!',
      }, !power || S.money < 18, !power ? '停电了' : '钱不够');
      opt('feast', '烛光大餐', 32, {
        kind: 'timed', pose: 'stand', dur: 45,
        rates: { hunger: 2.8, fun: 0.6, social: 0.2, bladder: -0.4 }, speed: 6, sfx: 'eat', text: '为自己做一顿丰盛大餐!',
      }, !power || S.money < 32, !power ? '停电了' : '钱不够');
      break;
    case 'chair':
      opt('sit', '坐下歇脚', 0, {
        kind: 'timed', pose: 'sitOn', dur: 30,
        rates: { energy: 0.3, fun: 0.15 }, speed: 6, text: '坐在餐椅上发了会儿呆。',
      });
      break;
    case 'tv_basic':
    case 'tv_big': {
      const big = inst.type === 'tv_big';
      opt('watch', '看电视', 0, {
        kind: 'timed', pose: 'sofa', until: 'fun', tvOn: true,
        rates: { fun: big ? 2.0 : 1.2, energy: -0.02 }, speed: 6, sfx: 'tv', text: '打开电视换到综艺台~',
      }, !power, '停电了');
      if (inst.console) {
        opt('game', '打游戏', 0, {
          kind: 'timed', pose: 'sofa', until: 'fun', tvOn: true,
          rates: { fun: 2.6, social: 0.15, energy: -0.05 }, speed: 6, sfx: 'tv', text: '掌机连上电视,开肝!',
        }, !power, '停电了');
      }
      break;
    }
    case 'sofa_basic':
    case 'sofa_leather': {
      const lux = inst.type === 'sofa_leather';
      opt('rest', '窝着放松', 0, {
        kind: 'timed', pose: 'sitOn', dur: 45,
        rates: { energy: lux ? 0.6 : 0.35, fun: lux ? 0.6 : 0.35 }, speed: 6,
        text: lux ? '陷进真皮沙发,人生巅峰。' : '窝在沙发里放空。',
      });
      break;
    }
    case 'phone':
      opt('shop', '拨打购物热线', 0, { kind: 'shop' });
      opt('delivery', '叫外卖', 20, {
        kind: 'timed', pose: 'stand', dur: 8,
        rates: { hunger: 5.5, fun: 0.5 }, speed: 5, sfx: 'eat', text: '外卖小哥火速送来了热腾腾的披萨!',
      }, S.money < 20, '钱不够');
      opt('chat', '闲聊热线', 3, {
        kind: 'timed', pose: 'stand', dur: 10,
        rates: { social: 2.2, fun: 0.3 }, speed: 5, text: '和热线那头聊得停不下来……',
      }, S.money < 3, '钱不够');
      break;
    case 'stereo':
      opt('music', '放张唱片', 0, {
        kind: 'timed', pose: 'stand', until: 'fun',
        rates: { fun: 1.7, social: 0.15, energy: -0.02 }, speed: 6, text: '音乐响起,身体不由自主摇摆!',
      }, !power, '停电了');
      break;
    case 'plant':
      opt('water', '浇浇水', 0, {
        kind: 'timed', pose: 'stand', dur: 4,
        rates: { fun: 1.2 }, speed: 4, sfx: 'splash', text: '给绿植浇了点水,心情舒畅。',
      });
      break;
    case 'mailbox':
      opt('mail', '查看邮箱', 0, { kind: 'mailbox' });
      break;
    case 'door':
      if (S.weekday <= 5 && !S.wentToday && S.clock >= 480 && S.clock <= 570) {
        opt('work', '出门上班', 0, { kind: 'work' });
      }
      opt('look', '在门口吹吹风', 0, {
        kind: 'timed', pose: 'stand', dur: 6,
        rates: { fun: 0.8 }, speed: 4, text: '门外的街道很安静,风刚刚好。',
      });
      break;
    case 'puddle':
      opt('mop', '清理水洼', 0, { kind: 'mop', inst });
      break;
  }
  return o;
}

// ---------- 绘制 ----------
// 返回待排序绘制单元 {sortY, draw(g, cam)};flat 类返回 sortY=-Infinity 先画
export function drawablesFor(objects, Art, sim, game) {
  const out = [];
  const S = sim.state;
  const animT = Math.floor(game.t * 2) % 2; // 0.5s 交替

  for (const inst of objects.list) {
    const def = FURN[inst.type];
    const [fw, fh] = def.fp;
    const baseX = inst.tx * TILE;
    const bottomY = (inst.ty + fh) * TILE;

    let img = null;
    switch (inst.type) {
      case 'bed_basic':
      case 'bed_big': {
        const big = inst.type === 'bed_big';
        const sleeping = game.action && (game.action.kind === 'sleepAnim' || game.action.pose === 'hideBed');
        img = sleeping ? Art.bedOccupied(S.charIdx, big) : Art.furn[inst.type];
        break;
      }
      case 'shower': {
        const inShower = game.action && game.action.pose === 'hideShower';
        img = inShower ? Art.showerOccupied(S.charIdx) : Art.furn.shower;
        break;
      }
      case 'tv_basic':
      case 'tv_big': {
        const on = game.action && game.action.tvOn;
        const set = Art.furn[inst.type];
        img = on ? set[1 + animT] : set[0];
        break;
      }
      case 'lamp':
        img = (inst.on && S.power) ? Art.furn.lamp_on : Art.furn.lamp_off;
        break;
      case 'mailbox':
        img = S.billsDue > 0 ? Art.furn.mailbox_flag : Art.furn.mailbox;
        break;
      case 'door':
        img = game.doorOpenT > 0 ? Art.furn.door_open : Art.furn.door;
        break;
      default:
        img = Art.furn[inst.type];
    }
    if (!img) continue;

    const drawX = inst.type === 'tree' ? baseX - 8 : baseX + Math.floor((fw * TILE - img.width) / 2);
    const drawY = bottomY - img.height;
    const isFlat = !!def.flat;
    const consoleAddon = (inst.type === 'tv_basic' || inst.type === 'tv_big') && inst.console;

    out.push({
      sortY: isFlat ? -Infinity : bottomY,
      draw(g, cam) {
        g.drawImage(img, drawX - cam.x, drawY - cam.y);
        if (consoleAddon) g.drawImage(Art.furn.consoleAddon, drawX - cam.x + img.width - 12, drawY - cam.y + img.height - 11);
      },
    });
  }
  return out;
}

// 灯光位置(世界像素);停电时无灯
export function lightsOf(objects, game, power) {
  if (!power) return [];
  const L = [];
  for (const inst of objects.list) {
    if (inst.type === 'lamp' && inst.on) {
      L.push({ x: inst.tx * TILE + 8, y: inst.ty * TILE + 6, r: 40, a: 0.6 });
    }
    if ((inst.type === 'tv_basic' || inst.type === 'tv_big') && game.action && game.action.tvOn) {
      L.push({ x: inst.tx * TILE + 8, y: inst.ty * TILE + 10, r: 26, a: 0.45 });
    }
  }
  return L;
}

// ---------- 电话购物目录 ----------
export const CATALOG = [
  { key: 'bedBig', name: '双人大床', price: 420, desc: '睡眠恢复大幅加快', once: true },
  { key: 'tvBig', name: '大彩电', price: 350, desc: '看电视娱乐 +67%', once: true },
  { key: 'sofaLeather', name: '真皮沙发', price: 260, desc: '放松效果加倍', once: true },
  { key: 'stereo', name: '组合音响', price: 220, desc: '客厅新增音乐娱乐', once: true },
  { key: 'console', name: '游戏主机', price: 380, desc: '电视新增打游戏选项', once: true },
  { key: 'plant2', name: '大盆栽', price: 60, desc: '客厅角落添点绿意', once: true },
];
