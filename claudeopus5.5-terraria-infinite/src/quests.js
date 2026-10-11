// 任务日志:每个阵营一条主线 + 可重复的阵营战争任务。目标类型:击杀 / 击杀敌方阵营 / 收集 / 放置 / 抵达 / 等级 / 砍倒战旗 / 建立前哨。
import { QUESTS, REPEAT_QUEST, FACTIONS, CLASSES } from './wow.js';
import { itemName } from './items.js';
import { MOBS } from './mobs.js';

export class QuestLog {
  constructor(game, o = {}) {
    this.game = game;
    this.stage = o.stage || 0;          // 主线进度(下一个要接的序号)
    this.active = o.active || null;     // { id, n }
    this.repeats = o.repeats || 0;
  }
  save() { return { stage: this.stage, active: this.active, repeats: this.repeats }; }
  get faction() { return this.game.faction(); }
  chain() { return QUESTS[this.faction]; }
  def(id) { return this.chain().find(q => q.id === id) || (REPEAT_QUEST[this.faction].id === id ? REPEAT_QUEST[this.faction] : null); }
  current() { return this.active ? this.def(this.active.id) : null; }
  offer() {
    if (this.active) return null;
    const c = this.chain();
    return this.stage < c.length ? c[this.stage] : REPEAT_QUEST[this.faction];
  }
  accept() {
    const q = this.offer();
    if (!q) return;
    this.active = { id: q.id, n: 0 };
    this.game.msg(`接受任务:<b>${q.name}</b>`, '#ffd76a');
    this.event({ type: 'check' });
  }
  abandon() { if (this.active) { this.game.msg(`放弃任务:${this.current().name}`, '#aab'); this.active = null; } }

  progress() {
    const q = this.current();
    if (!q) return null;
    const o = q.obj, p = this.game.player, rpg = p.rpg;
    switch (o.type) {
      case 'collect': return { have: Math.min(o.n, p.inv.count(o.item)), need: o.n };
      case 'level': return { have: Math.min(o.n, rpg.level), need: o.n };
      default: return { have: Math.min(o.n || 1, this.active.n), need: o.n || 1 };
    }
  }
  done() { const pr = this.progress(); return pr && pr.have >= pr.need; }
  objText(q = this.current()) {
    if (!q) return '';
    const o = q.obj;
    switch (o.type) {
      case 'collect': return `收集 ${itemName(o.item)}`;
      case 'kill': return `击败 ${o.mob === 'beast' ? '野兽' : MOBS[o.mob]?.name || o.mob}`;
      case 'killFaction': return `击败${FACTIONS[o.faction].name}成员`;
      case 'place': return '放置方块';
      case 'reach': return o.depth ? `抵达深度 ${o.depth}` : `抵达高度 ${o.height}`;
      case 'level': return `达到 ${o.n} 级`;
      case 'banner': return `砍倒${FACTIONS[o.faction].name}战旗`;
      case 'outpost': return '建立本阵营前哨';
    }
    return '';
  }

  // 事件:kill / place / reach / level / banner / outpost / check
  event(e) {
    if (!this.active) return;
    const q = this.current();
    if (!q) { this.active = null; return; }
    const o = q.obj, before = this.done();
    switch (e.type) {
      case 'kill': {
        const m = e.mob;
        if (o.type === 'kill' && (m.kind === o.mob || (o.mob === 'beast' && m.def?.beast && !m.npc))) this.active.n++;
        if (o.type === 'killFaction' && m.npc && m.faction === o.faction) this.active.n++;
        break;
      }
      case 'place': if (o.type === 'place') this.active.n++; break;
      case 'reach':
        if (o.type === 'reach' && ((o.depth && e.y >= o.depth) || (o.height && -e.y >= o.height))) this.active.n = 1;
        break;
      case 'banner': if (o.type === 'banner' && e.faction === o.faction) this.active.n++; break;
      case 'outpost': if (o.type === 'outpost') this.active.n++; break;
    }
    if (!before && this.done()) {
      this.game.msg(`任务目标完成:<b>${q.name}</b>——回到任意本阵营任务官处交付。`, '#8f8');
      this.game.ui.hint(`<span style="color:#8f8">任务完成:${q.name}</span>`, 3);
      this.game.sfx('chime');
    }
  }

  turnIn() {
    const q = this.current(), g = this.game, p = g.player;
    if (!q || !this.done()) return false;
    if (q.obj.type === 'collect') p.inv.remove(q.obj.item, q.obj.n);
    const r = q.reward;
    let xp = r.xp;
    if (q.repeat) xp = Math.round(80 + p.rpg.level * 40);
    p.rpg.gainXp(xp);
    p.rpg.money += Math.round(r.money * (p.rpg.race === 'human' ? 1.1 : 1));
    for (const [id, n] of r.items || []) { const left = p.inv.add(id, n); if (left) g.dropItem(p.x, p.y - 1, id, left); }
    if (r.unlock === 'fusion') p.rpg.fusionReady = true;
    g.msg(`完成任务:<b>${q.name}</b>(经验 +${xp})`, '#ffd76a');
    g.sfx('chime');
    if (q.repeat) this.repeats++; else this.stage++;
    this.active = null;
    return true;
  }
}
