// 交互菜单与行动定义。每个物件的 act 组返回一组菜单项;选中后由世界层让角色走到使用位并执行。
import * as sim from './sim.js';
import { S, skillLv, addMoney, changeRel, has, absMin, hour } from './sim.js';
import { NPCS, SOCIALS, LINES, CAREERS, SHOP, shopItem, relTier } from './data.js';
import { say, menu, toast } from './ui.js';
import { sfx } from './audio.js';
import { world } from './world.js';
import { startMinigame } from './minigames.js';

const H = (n) => n; // 可读性:每小时速率

function tooTired(min = 12) { return S.motives.energy < min ? '太累了,先休息一下吧' : false; }
function tooSad() { return sim.mood() < 18 ? '心情太差,什么都不想学' : false; }
function money(n) { return S.money < n ? `钱不够(需要 §${n})` : false; }

// 简单工具:构造一个行动
const A = (o) => ({ speed: 22, pose: 'act', at: 'spot', ...o });

// ---------------------------------------------------------------- 做饭流程
function cookChain(obj) {
  const stove = world.obj('stove');
  const lv = skillLv('cooking');
  world.run(stove, A({
    label: '做饭', dur: 45, pose: 'act', overlay: 'cook', cost: 10,
    rates: { fun: H(-2) }, skill: ['cooking', 28],
    end(done) {
      if (!done) return;
      S.flags.cooked = true;
      const fire = Math.random() < [0.12, 0.05, 0.02, 0, 0, 0][lv];
      if (fire) {
        S.home.fire = true;
        sfx.fire();
        toast('着火啦!快灭火!', 'angry', 3.5);
        return;
      }
      S.home.plates = 1;
      S.home.mealQ = lv;
      toast(['一盘黑乎乎的东西', '普通的家常菜', '香喷喷的炒饭', '色香味俱全!', '大厨级料理!', '米其林水准!'][lv], 'hunger');
      eatAtTable();
    },
  }));
}
function eatAtTable() {
  const table = world.obj('table');
  const q = S.home.pizzaReady ? 2 : (S.home.mealQ ?? 1);
  world.run(table, A({
    label: '吃饭', dur: 30, pose: 'sit', overlay: 'eat',
    rates: { hunger: H(150 + q * 20), fun: H(q * 6) }, sitting: true,
    end(done) {
      if (S.home.pizzaReady) S.home.pizzaReady = 0;
      else S.home.plates = 0;
      S.home.dirty = Math.min(3, (S.home.dirty || 0) + 1);
    },
  }));
}

// ---------------------------------------------------------------- 物件菜单
const MENUS = {
  bed: (o) => [
    { label: '睡觉', icon: 'energy', desc: '睡到精力充沛,时间快进。', fn: () => world.run(o, A({
      label: '睡觉', until: () => S.motives.energy >= 99.5, max: 660, speed: 140, pose: 'lie', at: 'on', sleep: true, overlay: 'zzz',
      rates: { energy: H(has('bed2') ? 19 : 14), comfort: H(has('bed2') ? 14 : 9) },
    })) },
    { label: '小睡一会', icon: 'zzz', desc: '睡一个半小时。', fn: () => world.run(o, A({
      label: '小睡', dur: 90, speed: 60, pose: 'lie', at: 'on', sleep: true, overlay: 'zzz',
      rates: { energy: H(has('bed2') ? 17 : 13), comfort: H(8) },
    })) },
  ],
  bookshelf: (o) => [
    { label: '学习烹饪', icon: 'cooking', disabled: tooSad(), desc: '读菜谱,提升烹饪技能。', fn: () => world.run(o, A({ label: '学烹饪', dur: 60, pose: 'stand', overlay: 'book', skill: ['cooking', 40], rates: { fun: H(-6) } })) },
    { label: '学习机械', icon: 'mechanical', disabled: tooSad(), desc: '读维修手册,提升机械技能。', fn: () => world.run(o, A({ label: '学机械', dur: 60, pose: 'stand', overlay: 'book', skill: ['mechanical', 40], rates: { fun: H(-6) } })) },
    { label: '看小说', icon: 'fun', desc: '纯粹消遣。', fn: () => world.run(o, A({ label: '看小说', dur: 60, pose: 'stand', overlay: 'book', rates: { fun: H(26) } })) },
  ],
  computer: (o) => [
    { label: '玩电脑游戏', icon: 'fun', desc: '娱乐大幅恢复。', fn: () => world.run(o, A({ label: '打游戏', dur: 60, pose: 'act', rates: { fun: H(42), energy: H(-2) } })) },
    { label: '网上聊天', icon: 'chat', desc: '和网友聊聊,社交慢慢恢复。', fn: () => world.run(o, A({ label: '网聊', dur: 60, pose: 'act', rates: { social: H(24), fun: H(10) } })) },
    { label: '写代码接单', icon: 'logic', disabled: tooTired(20), desc: '按逻辑等级赚钱,同时练逻辑。', fn: () => world.run(o, A({
      label: '写代码', dur: 120, pose: 'act', skill: ['logic', 22], rates: { fun: H(-6), energy: H(-4) },
      tick(m) { this.earn = (this.earn || 0) + m / 60 * (10 + skillLv('logic') * 9); },
      end() { const n = Math.round(this.earn || 0); if (n > 0) addMoney(n, '接单收入'); },
    })) },
    { label: '自学编程', icon: 'logic', disabled: tooSad(), desc: '逻辑技能提升最快的方法之一。', fn: () => world.run(o, A({ label: '学编程', dur: 60, pose: 'act', skill: ['logic', 45], rates: { fun: H(-4) } })) },
  ],
  phone: (o) => {
    const friends = Object.keys(NPCS).filter((id) => S.rels[id].v >= 10);
    const items = [
      { label: '叫外卖披萨', icon: 'hunger', right: '§20', disabled: money(20) || (S.home.pizzaAt ? '披萨已经在路上了' : false), desc: '一小时后送到餐桌。', fn: () => {
        S.money -= 20; S.home.pizzaAt = absMin() + 60; sfx.phone();
        say([[null, '“您好,绿钻披萨!一小时内送达,不准时不要钱!”']]);
      } },
      { label: '给朋友打电话', icon: 'phone', disabled: friends.length ? false : '还没有熟人可以打电话', desc: '电话聊天,社交与关系一起涨。', fn: () => {
        menu({ title: '打给谁?', items: friends.map((id) => ({ label: NPCS[id].name, right: relTier(S.rels[id].v, S.rels[id].romance), fn: () => {
          sfx.phone();
          world.run(o, A({ label: `和${NPCS[id].name}通话`, dur: 30, pose: 'stand', overlay: 'phone', rates: { social: H(50), fun: H(10) },
            end(done) { if (done) { changeRel(id, 2 + Math.round(Math.random() * 2)); S.stats.socials++; } } }));
        } })) });
      } },
    ];
    if (S.home.tvBroken) items.push({ label: '叫修理工', icon: 'mechanical', right: '§60', disabled: money(60), desc: '电视立刻修好。', fn: () => { S.money -= 60; S.home.tvBroken = false; sfx.phone(); toast('修理工来过了,电视修好了', 'check'); } });
    if (S.home.fire) items.push({ label: '打火警电话', icon: 'phone', desc: '消防员把火扑灭,但要罚款 §40。', fn: () => { S.home.fire = false; S.money = Math.max(0, S.money - 40); sfx.phone(); toast('消防员扑灭了大火(罚款 §40)', 'check'); } });
    return items;
  },
  tv: (o) => {
    const sofa = world.obj('sofa');
    if (S.home.tvBroken) {
      return [{ label: '修理电视', icon: 'mechanical', disabled: tooTired(10), desc: '机械技能越高越容易修好。', fn: () => world.run(o, A({
        label: '修电视', dur: 60, pose: 'act', overlay: 'spark', skill: ['mechanical', 32], rates: { fun: H(-4), hygiene: H(-4) },
        end(done) {
          if (!done) return;
          if (Math.random() < 0.45 + skillLv('mechanical') * 0.12) { S.home.tvBroken = false; sfx.good(); toast('电视修好了!', 'check'); }
          else { sfx.bad(); toast('还是修不好……再试试或叫修理工', 'angry'); }
        },
      })) }];
    }
    return [
      { label: '看电视', icon: 'fun', desc: has('tv2') ? '大屏彩电,娱乐飞涨。' : '旧电视,偶尔会坏。', fn: () => world.run(sofa, A({
        label: '看电视', dur: 60, pose: 'sit', at: 'on', overlay: 'tv', sitting: true,
        rates: { fun: H(has('tv2') ? 46 : 28), comfort: H(has('sofa2') ? 26 : 14) },
        end(done) {
          if (done && !has('tv2') && Math.random() < 0.08) { S.home.tvBroken = true; sfx.bad(); toast('电视冒烟了!坏掉了……', 'angry'); }
        },
      })) },
      { label: '看烹饪节目', icon: 'cooking', disabled: tooSad(), desc: '边看边学,烹饪技能 +', fn: () => world.run(sofa, A({
        label: '烹饪节目', dur: 60, pose: 'sit', at: 'on', overlay: 'tv', sitting: true, skill: ['cooking', 22], rates: { fun: H(12), comfort: H(10) },
      })) },
    ];
  },
  sofa: (o) => [
    { label: '坐一会', icon: 'comfort', desc: '恢复舒适。', fn: () => world.run(o, A({ label: '休息', dur: 45, pose: 'sit', at: 'on', sitting: true, rates: { comfort: H(has('sofa2') ? 70 : 45) } })) },
    { label: '打个盹', icon: 'zzz', desc: '在沙发上眯一会儿。', fn: () => world.run(o, A({ label: '打盹', dur: 60, speed: 50, pose: 'sit', at: 'on', sitting: true, sleep: true, overlay: 'zzz', rates: { energy: H(9), comfort: H(20) } })) },
  ],
  aquarium: (o) => [
    { label: '观赏鱼', icon: 'fish', desc: '看鱼游来游去,心情放松。', fn: () => world.run(o, A({ label: '赏鱼', dur: 30, pose: 'stand', rates: { fun: H(28), comfort: H(6) } })) },
    { label: '喂鱼', icon: 'fish', desc: '鱼儿开心,你也开心。', fn: () => world.run(o, A({ label: '喂鱼', dur: 10, pose: 'act', rates: { fun: H(40) } })) },
  ],
  easel: (o) => [
    { label: '画画', icon: 'creativity', disabled: tooSad() || tooTired(), desc: `创意 +,画满三小时得一幅画(当前 ${Math.round((S.inv.paintProgress || 0) * 100)}%)`, fn: () => world.run(o, A({
      label: '画画', dur: 90, pose: 'act', skill: ['creativity', 36], rates: { fun: H(14) },
      tick(m) {
        S.inv.paintProgress = (S.inv.paintProgress || 0) + m / 180;
        if (S.inv.paintProgress >= 1) { S.inv.paintProgress = 0; S.inv.painting++; S.stats.paintings++; sfx.good(); toast('完成了一幅画!可以卖给家具店', 'creativity'); }
      },
    })) },
  ],
  treadmill: (o) => [
    { label: '跑步', icon: 'body', disabled: tooTired(15), desc: '体魄 +,会出汗。', fn: () => world.run(o, A({
      label: '跑步', dur: 60, pose: 'walk', at: 'on', face: 'up', overlay: 'sweat', skill: ['body', 42], rates: { energy: H(-9), hygiene: H(-12), fun: H(-2) },
    })) },
  ],
  weights: (o) => [
    { label: '举重', icon: 'body', disabled: tooTired(18), desc: '体魄提升最快,非常累。', fn: () => world.run(o, A({
      label: '举重', dur: 60, pose: 'act', overlay: 'sweat', skill: ['body', 58], rates: { energy: H(-12), hygiene: H(-14), fun: H(-4) },
    })) },
  ],
  punchbag: (o) => [
    { label: '打沙袋', icon: 'body', disabled: tooTired(15), desc: '发泄一下!体魄 + 娱乐 +', fn: () => world.run(o, A({
      label: '打沙袋', dur: 45, pose: 'act', overlay: 'sweat', skill: ['body', 36], rates: { energy: H(-8), hygiene: H(-10), fun: H(20) },
    })) },
  ],
  guitar: (o) => [
    { label: '弹吉他', icon: 'music', desc: '创意 + 娱乐 +', fn: () => world.run(o, A({ label: '弹吉他', dur: 60, pose: 'act', overlay: 'notes', skill: ['creativity', 30], rates: { fun: H(30) } })) },
  ],
  plant: (o) => [
    { label: '浇水', icon: 'hygiene', desc: '照顾植物让人心情平静。', fn: () => world.run(o, A({ label: '浇花', dur: 10, pose: 'act', rates: { fun: H(30), comfort: H(10) } })) },
  ],
  fridge: (o) => [
    { label: '做饭', icon: 'cooking', right: '§10', disabled: money(10) || tooTired(6) || (S.home.fire ? '厨房着火了!' : false) || (S.home.plates ? '桌上还有饭没吃' : false), desc: '去灶台做一顿正餐,烹饪越高越香。', fn: () => cookChain(o) },
    { label: '吃零食', icon: 'hunger', right: '§3', disabled: money(3), desc: '快速垫垫肚子。', fn: () => world.run(o, A({ label: '吃零食', dur: 15, cost: 3, pose: 'act', rates: { hunger: H(70) } })) },
    { label: '喝杯牛奶', icon: 'cup', desc: '免费。睡前喝更香。', fn: () => world.run(o, A({ label: '喝牛奶', dur: 5, pose: 'act', rates: { hunger: H(60), comfort: H(40) } })) },
  ],
  stove: (o) => S.home.fire
    ? [{ label: '灭火!', icon: 'angry', desc: '危险!但不灭火会一直烧。', fn: () => world.run(o, A({
      label: '灭火', dur: 20, pose: 'act', overlay: 'spark', rates: { hygiene: H(-30), fun: H(-20) },
      end(done) { if (done) { S.home.fire = false; S.home.plates = 0; sfx.splash(); toast('火灭了……吓死人了', 'check'); } },
    })) }]
    : [{ label: '做饭', icon: 'cooking', right: '§10', disabled: money(10) || tooTired(6) || (S.home.plates ? '桌上还有饭没吃' : false), desc: '烹饪越高越香,新手可能着火。', fn: () => cookChain(o) }],
  counter: (o) => [
    { label: '洗碗', icon: 'hygiene', disabled: S.home.dirty ? false : '没有脏盘子', desc: '把脏盘子洗干净,环境 +', fn: () => world.run(o, A({ label: '洗碗', dur: 10 * S.home.dirty, pose: 'act', rates: { hygiene: H(-6) }, end(done) { if (done) S.home.dirty = 0; } })) },
    { label: '洗手', icon: 'hygiene', desc: '卫生 + 一点点。', fn: () => world.run(o, A({ label: '洗手', dur: 5, pose: 'act', rates: { hygiene: H(100) } })) },
  ],
  table: (o) => {
    const items = [];
    if (S.home.plates || S.home.pizzaReady) items.push({ label: S.home.pizzaReady ? '吃披萨' : '吃饭', icon: 'hunger', desc: '饱餐一顿。', fn: () => eatAtTable() });
    if (S.home.dirty) items.push({ label: '收拾脏盘子', icon: 'hygiene', desc: '端到洗碗池洗掉。', fn: () => world.run(world.obj('counter'), A({ label: '洗碗', dur: 10 * S.home.dirty, pose: 'act', end(done) { if (done) S.home.dirty = 0; } })) });
    items.push({ label: '坐一会', icon: 'comfort', desc: '歇歇脚。', fn: () => world.run(o, A({ label: '坐着', dur: 30, pose: 'sit', sitting: true, rates: { comfort: H(30) } })) });
    return items;
  },
  trash: (o) => [
    { label: '翻垃圾桶', icon: 'ask', desc: '……真的要这么做吗?', fn: () => world.run(o, A({
      label: '翻垃圾', dur: 15, pose: 'act', rates: { hygiene: H(-60), fun: H(20) },
      end(done) { if (done && Math.random() < 0.2) { const n = 5 + Math.floor(Math.random() * 16); addMoney(n, '捡到钱'); toast(`居然翻到了 §${n}!`, 'money'); } },
    })) },
  ],
  toilet: (o) => [
    { label: '上厕所', icon: 'bladder', desc: '解决内急。', fn: () => world.run(o, A({
      label: '上厕所', until: () => S.motives.bladder >= 99.5, max: 20, speed: 18, pose: 'sit', at: 'on', face: 'down', rates: { bladder: H(480), comfort: H(20) },
    })) },
  ],
  sink: (o) => [
    { label: '洗手洗脸', icon: 'hygiene', desc: '卫生 +', fn: () => world.run(o, A({ label: '洗漱', dur: 10, pose: 'act', rates: { hygiene: H(110) } })) },
    { label: '对镜练习演讲', icon: 'charisma', disabled: tooSad(), desc: '魅力 +。看起来有点傻。', fn: () => world.run(o, A({ label: '练演讲', dur: 60, pose: 'act', overlay: 'speech', skill: ['charisma', 40], rates: { fun: H(-3), social: H(4) } })) },
  ],
  shower: (o) => [
    { label: '洗澡', icon: 'hygiene', desc: '卫生回满。', fn: () => world.run(o, A({
      label: '洗澡', dur: 30, pose: 'stand', at: 'on', face: 'down', overlay: 'shower', rates: { hygiene: H(220), comfort: H(16) },
      end(done) { if (done) S.flags.showered = true; },
    })) },
  ],
  bathtub: (o) => [
    { label: '泡澡', icon: 'hygiene', desc: '卫生、舒适、娱乐一起涨。', fn: () => world.run(o, A({
      label: '泡澡', dur: 60, pose: 'lie', at: 'on', overlay: 'bubbles', sitting: true, rates: { hygiene: H(130), comfort: H(50), fun: H(18) },
      end(done) { if (done) S.flags.showered = true; },
    })) },
  ],
  puddle: (o) => [
    { label: '拖地', icon: 'hygiene', desc: '把这摊……清理掉。', fn: () => world.run(o, A({ label: '拖地', dur: 15, pose: 'act', at: 'adjacent', end(done) { if (done) world.removePuddle(o); } })) },
  ],
  mailbox: (o) => {
    const items = [];
    if (S.bill) items.push({ label: '缴纳账单', icon: 'money', right: `§${S.bill.amount}`, disabled: money(S.bill.amount), desc: `${S.day - S.bill.day} 天前寄到,三天内不缴会被收走家具。`, fn: () => { if (sim.payBill()) { sfx.coin(); toast('账单已缴清', 'check'); } } });
    items.push({ label: `查看信件(${S.mail.filter((m) => !m.read).length} 封新信)`, icon: 'mail', desc: '看看都有谁来信。', fn: () => {
      if (!S.mail.length) { toast('信箱空空的', 'mail'); return; }
      menu({ title: '信件', max: 6, items: S.mail.map((m) => ({ label: (m.read ? '' : '● ') + m.title, right: `D${m.day}`, fn: () => { m.read = true; say([[null, m.body]]); } })) });
    } });
    return items;
  },
  busstop: () => [
    { label: '看站牌', icon: 'ask', desc: '', fn: () => say([[null, '“绿钻镇 ⇄ 城区”班车,每周一班。下一班……站牌上的字被雨水冲掉了。']]) },
    { label: '坐着发呆', icon: 'comfort', desc: '看着来往的车辆。', fn: () => world.run(world.obj('busstop'), A({ label: '发呆', dur: 30, pose: 'stand', rates: { comfort: H(10), fun: H(10) } })) },
  ],
  fountain: (o) => [
    { label: '投硬币许愿', icon: 'star', right: '§1', disabled: money(1), desc: '据说很灵验。', fn: () => world.run(o, A({
      label: '许愿', dur: 5, cost: 1, pose: 'act', rates: { fun: H(80) },
      end(done) {
        if (!done) return;
        if (Math.random() < 0.12) { addMoney(25, '许愿灵验'); sfx.levelup(); toast('愿望成真!在池底捡到 §25', 'star'); }
        else toast('硬币“扑通”一声沉下去了', 'star');
      },
    })) },
    { label: '坐在池边', icon: 'comfort', desc: '听水声。', fn: () => world.run(o, A({ label: '休息', dur: 30, pose: 'sit', sitting: true, rates: { comfort: H(40), fun: H(10) } })) },
  ],
  chess: (o) => [
    { label: '下棋', icon: 'logic', disabled: tooSad(), desc: '逻辑 + 娱乐 +;高博士在旁边会更有意思。', fn: () => world.run(o, A({
      label: '下棋', dur: 60, pose: 'act', skill: ['logic', 38], rates: { fun: H(20) },
      tick(m) {
        const gao = world.npcNear('gao', 64);
        if (gao) { S.motives.social = Math.min(100, S.motives.social + m / 60 * 24); this.gao = (this.gao || 0) + m; }
      },
      end(done) { if (this.gao > 30) { changeRel('gao', 3); toast('和高博士下了一盘好棋', 'logic'); } },
    })) },
  ],
  bench: (o) => [
    { label: '坐坐', icon: 'comfort', desc: '晒晒太阳。', fn: () => world.run(o, A({ label: '坐着', dur: 30, pose: 'sit', sitting: true, rates: { comfort: H(50), fun: H(8) } })) },
    { label: '喂鸽子', icon: 'fun', desc: '鸽子们很开心。', fn: () => world.run(o, A({ label: '喂鸽子', dur: 30, pose: 'act', rates: { fun: H(28), social: H(6) },
      end(done) { if (done && world.npcNear('rosa', 80)) { changeRel('rosa', 2); toast('罗莎奶奶对你笑了笑', 'heart'); } } })) },
  ],
  water: (o) => [
    { label: '钓鱼', icon: 'fish', disabled: tooTired(8), desc: '钓到的鱼可以卖给咖啡馆。', fn: () => world.run(o, A({
      label: '钓鱼', dur: 60, pose: 'act', at: 'here', overlay: 'fish', rates: { fun: H(16), comfort: H(4) },
      tick(m) {
        this.acc = (this.acc || 0) + m;
        while (this.acc >= 20) {
          this.acc -= 20;
          if (Math.random() < 0.3) { S.inv.fish++; S.stats.fish++; sfx.splash(); toast('钓到一条鱼!', 'fish'); }
        }
      },
    })) },
  ],
  // 咖啡馆
  cafeCounter: (o) => {
    const items = [];
    items.push(...jobItems('cafe', o));
    items.push({ label: '外带三明治', icon: 'hunger', right: '§8', disabled: money(8) || (cafeOpen() ? false : '还没开门'), desc: '站着吃,快速填饱肚子。', fn: () => world.run(o, A({ label: '吃三明治', dur: 15, cost: 8, pose: 'act', rates: { hunger: H(160) } })) });
    if (S.inv.fish) items.push({ label: `卖鱼 ×${S.inv.fish}`, icon: 'fish', right: `§${S.inv.fish * 15}`, desc: '莉莉按 §15 一条收购。', fn: () => { const n = S.inv.fish * 15; S.inv.fish = 0; addMoney(n, '卖鱼'); sfx.coin(); } });
    return items;
  },
  cafeTable: (o) => [
    { label: '用餐', icon: 'hunger', right: '§15', disabled: money(15) || (cafeOpen() ? false : '还没开门'), desc: '咖啡馆套餐,吃饱还能顺便社交。', fn: () => world.run(o, A({ label: '用餐', dur: 40, cost: 15, pose: 'sit', sitting: true, overlay: 'eat', rates: { hunger: H(130), fun: H(14), social: H(10) } })) },
    { label: '喝咖啡', icon: 'cup', right: '§5', disabled: money(5) || (cafeOpen() ? false : '还没开门'), desc: '精力 +', fn: () => world.run(o, A({ label: '喝咖啡', dur: 20, cost: 5, pose: 'sit', sitting: true, overlay: 'eat', rates: { energy: H(60), fun: H(18), bladder: H(-20) } })) },
  ],
  shopCounter: (o) => {
    const items = [{ label: '选购家具', icon: 'room', desc: '买回的家具会直接送到家里。', fn: () => openShop() }];
    if (S.inv.painting) {
      const price = 30 + skillLv('creativity') * 28;
      items.push({ label: `卖画 ×${S.inv.painting}`, icon: 'creativity', right: `§${price * S.inv.painting}`, desc: `汪老板按创意等级估价,每幅 §${price}。`, fn: () => { addMoney(price * S.inv.painting, '卖画'); S.inv.painting = 0; sfx.coin(); } });
    }
    return items;
  },
  car: (o) => jobItems('garage', o),
  toolbench: (o) => [
    { label: '研究工具', icon: 'mechanical', disabled: tooSad(), desc: '机械 +', fn: () => world.run(o, A({ label: '研究工具', dur: 60, pose: 'act', overlay: 'spark', skill: ['mechanical', 38], rates: { fun: H(-4), hygiene: H(-4) } })) },
  ],
};

function cafeOpen() { const h = hour(); return h >= 7 && h < 22; }

// ---------------------------------------------------------------- 工作
function jobItems(id, o) {
  const c = CAREERS[id];
  const j = S.jobs[id];
  const boss = id === 'cafe' ? 'lily' : 'max';
  if (!j) {
    return [{ label: '申请工作', icon: 'money', desc: `${c.name}:${c.levels[0].title},起薪 §${c.levels[0].pay}/班`, fn: () => {
      S.jobs[id] = { lvl: 0, perf: 0, workedToday: false, shifts: 0 };
      sfx.good();
      say([[boss, id === 'cafe' ? '太好了!正缺人手呢。每天 8 点到 16 点之间来柜台找我上班就行~' : '行,看你手脚挺利索。8 点到 14 点之间来车边找我开工!'], [null, `你被录用为「${c.levels[0].title}」!`]]);
    } }];
  }
  const lv = c.levels[j.lvl];
  const h = hour();
  const late = c.close - 4;
  let dis = false;
  if (j.workedToday) dis = '今天已经上过班了';
  else if (h < c.open || h >= late) dis = `上班时间 ${c.open}:00-${late}:00 开工`;
  else if (S.motives.energy < 15) dis = '太累了,干不动';
  else if (S.motives.hunger < 10) dis = '饿得眼冒金星';
  return [{ label: `上班(${lv.title})`, icon: 'money', right: `§${lv.pay}`, disabled: dis, desc: '进入打工小游戏,一班 4 小时。', fn: () => {
    startMinigame(id, j.lvl, (score, tips) => finishShift(id, score, tips));
  } }];
}

export function finishShift(id, score, tips = 0) {
  const c = CAREERS[id];
  const j = S.jobs[id];
  const lv = c.levels[j.lvl];
  const m = sim.mood();
  const moodK = m >= 60 ? 1.1 : m >= 40 ? 1 : 0.85;
  const pay = Math.round(lv.pay * (0.55 + 0.65 * score) * moodK);
  const lines = [];
  addMoney(pay + tips, '工资');
  sim.advance(240, { rates: { social: 10, fun: -3, hygiene: -6, energy: -6 }, roomTarget: id === 'cafe' ? 70 : 40 });
  S.flags.worked = true;
  j.workedToday = true; j.shifts++; S.stats.shifts++;
  const perfGain = Math.round(score * 45 + (m - 50) / 5 - 8);
  j.perf = Math.max(0, Math.min(100, j.perf + perfGain));
  lines.push([null, `下班!本班表现 ${Math.round(score * 100)} 分,工资 §${pay}${tips ? `,小费 §${tips}` : ''}。绩效 ${perfGain >= 0 ? '+' : ''}${perfGain}。`]);
  if (j.perf >= 100 && c.levels[j.lvl + 1]) {
    const need = sim.promoReq(id);
    if (need.length === 0) {
      j.lvl++; j.perf = 0;
      sfx.levelup();
      lines.push([id === 'cafe' ? 'lily' : 'max', `干得好!从明天起你就是「${c.levels[j.lvl].title}」了,日薪 §${c.levels[j.lvl].pay}!`]);
    } else {
      lines.push([id === 'cafe' ? 'lily' : 'max', `你很努力,但想升职还得提升:${need.join('、')}。`]);
    }
  }
  say(lines, () => sim.checkChapter());
}

// ---------------------------------------------------------------- 家具店
export function openShop() {
  const items = SHOP.map((it) => {
    const owned = has(it.id);
    let dis = false;
    if (owned) dis = '已经买过了';
    else if (it.id === 'deed' && S.chapter < 3) dis = '先完成第三章再来吧';
    else if (S.money < it.price) dis = `钱不够(还差 §${it.price - S.money})`;
    return {
      label: it.name, right: owned ? 'OK' : `§${it.price}`, disabled: dis, desc: it.desc,
      fn: () => {
        S.money -= it.price;
        S.owned[it.id] = true;
        sfx.coin();
        if (it.id === 'deed') { world.ending(); return; }
        toast(`${it.name}已送到家中!`, 'room');
        sim.checkChapter();
      },
    };
  });
  menu({ title: '汪记家具 · 商品目录', items, max: 6, w: 200, x: 20, y: 14 });
}

// ---------------------------------------------------------------- 社交
export function socialMenu(npc) {
  const r = S.rels[npc.id];
  const n = NPCS[npc.id];
  const opts = SOCIALS.map((s) => {
    let dis = false;
    if (s.romance && !n.romance) dis = `${n.name}对你没有那种意思`;
    else if (r.v < s.min) dis = `关系还不够好(需要 ${s.min})`;
    else if (s.needCrush && !r.crush) dis = '先调调情吧';
    else if (s.cost && S.money < s.cost) dis = '钱不够';
    else if (s.id === 'kiss' && r.romance) dis = false;
    return { label: s.label, icon: s.icon, disabled: dis, fn: () => world.social(npc, s) };
  });
  menu({ title: `${n.name} · ${relTier(r.v, r.romance)}`, items: opts, max: 9, onCancel: () => world.endTalk(npc) });
}

// 社交判定:返回 {ok, d}
export function resolveSocial(npcId, s) {
  const n = NPCS[npcId];
  const r = S.rels[npcId];
  let p = s.base + r.v / 300 + (sim.mood() - 50) / 250;
  if (n.likes.includes(s.id)) p += 0.28;
  if (n.dislikes.includes(s.id)) p -= 0.45;
  if (s.skill) p += skillLv(s.skill) * 0.05;
  if (S.motives.hygiene < 25) p -= 0.2;
  if (s.id === 'gift') p = 0.97;
  // 同一天反复纠缠会降低效果
  p -= Math.max(0, r.today - 3) * 0.08;
  const ok = Math.random() < Math.max(0.05, Math.min(0.97, p));
  let d = ok ? s.gain : -s.loss;
  if (ok && n.likes.includes(s.id)) d += 2;
  if (ok && r.today > 4) d = Math.max(1, d >> 1);
  return { ok, d };
}

export function socialLine(npcId, s, ok) {
  const L = LINES[npcId];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const n = NPCS[npcId];
  if (!ok) {
    return pick({
      chat: ['嗯……我现在不太想聊。', '哦。', '你说完了吗?'],
      joke: L.joke && npcId !== 'max' && npcId !== 'mia' && npcId !== 'jed' ? L.joke : ['……一点都不好笑。'],
      compliment: ['少来这套。', '你是不是有求于我?'],
      hug: ['喂!别突然抱过来!', '我们还没那么熟吧?'],
      flirt: ['你、你在说什么呢!', '……不好意思,我没那个意思。'],
      kiss: ['等一下!太快了!', '不行不行!'],
      prank: ['你干什么!太过分了!', '一点也不好玩!'],
      ask: ['这是我的私事。', '问那么多干嘛?'],
      gift: ['谢谢,不过……'],
    }[s.id] || ['……']);
  }
  switch (s.id) {
    case 'joke': return pick(L.joke);
    case 'ask': return pick(L.ask);
    case 'compliment': return pick(['真的吗?谢谢你!', '嘿嘿,你嘴真甜。', '你今天也很不错哦!']);
    case 'hug': return pick(['抱抱~感觉好多了!', '哈哈,你真热情!']);
    case 'flirt': return pick(['哎呀……你这人真是的。', '你……是认真的吗?', '(脸红了)']);
    case 'kiss': return pick(['……我也喜欢你。', '(紧紧握住了你的手)']);
    case 'gift': return pick(['哇,送我的?太谢谢了!', '你怎么知道我想要这个!']);
    case 'prank': return pick(['哈哈哈!你这家伙!看我怎么报复你!', '好啊你!有意思!']);
    default: return pick(L.chat);
  }
}

export function menuFor(target) {
  const f = MENUS[target.act];
  return f ? f(target) : [];
}
