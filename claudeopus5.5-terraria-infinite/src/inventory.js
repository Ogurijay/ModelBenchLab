// 背包:36 格(0-8 为快捷栏)+ 4 格盔甲。槽位为 { id, n, dur? } 或 null。
import { ITEMS, maxStack, tagMatches } from './items.js';

export const INV_SIZE = 36;

export class Inventory {
  constructor() {
    this.slots = new Array(INV_SIZE).fill(null);
    this.armor = [null, null, null, null];
    this.weapon = null;     // 主手武器装备槽(技能伤害与法术强度取自这里)
    this.sel = 0;
    this.version = 0;   // 变化计数,UI 据此刷新
  }
  changed() { this.version++; }
  get held() { return this.slots[this.sel]; }
  heldItem() { const s = this.held; return s ? ITEMS[s.id] : null; }

  static make(id, n, dur) {
    const it = ITEMS[id];
    const s = { id, n };
    if (it?.tool?.dur) s.dur = dur ?? it.tool.dur;
    if (it?.armor) s.dur = dur ?? it.armor.dur;
    return s;
  }

  canAccept(id, n = 1) {
    const max = maxStack(id);
    for (const s of this.slots) {
      if (!s) return true;
      if (s.id === id && s.dur === undefined && s.n < max) return true;
    }
    return false;
  }
  // 返回剩余数量
  add(id, n, dur) {
    if (!ITEMS[id]) return 0;
    const max = maxStack(id);
    const stackable = max > 1;
    if (stackable) for (const s of this.slots) {
      if (n <= 0) break;
      if (s && s.id === id && s.n < max) { const k = Math.min(n, max - s.n); s.n += k; n -= k; }
    }
    for (let i = 0; i < INV_SIZE && n > 0; i++) {
      if (!this.slots[i]) { const k = Math.min(n, max); this.slots[i] = Inventory.make(id, k, dur); n -= k; }
    }
    this.changed();
    return n;
  }
  count(tag) {
    let c = 0;
    for (const s of this.slots) if (s && tagMatches(tag, s.id)) c += s.n;
    return c;
  }
  remove(tag, n) {
    let left = n;
    for (let i = INV_SIZE - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && tagMatches(tag, s.id)) {
        const k = Math.min(left, s.n);
        s.n -= k; left -= k;
        if (!s.n) this.slots[i] = null;
      }
    }
    this.changed();
    return n - left;
  }
  has(id) { return this.slots.some(s => s && s.id === id); }
  consumeHeld(n = 1) {
    const s = this.held;
    if (!s) return;
    s.n -= n;
    if (s.n <= 0) this.slots[this.sel] = null;
    this.changed();
  }
  // 工具损耗,返回是否损坏
  wearHeld(k = 1) {
    const s = this.held;
    if (!s || s.dur === undefined) return false;
    s.dur -= k;
    this.changed();
    if (s.dur <= 0) { this.slots[this.sel] = null; return true; }
    return false;
  }
  armorPoints() { return this.armor.reduce((a, s) => a + (s ? ITEMS[s.id].armor.pts : 0), 0); }
  wearArmor(dmg) {
    const k = Math.max(1, Math.floor(dmg / 4));
    let broke = false;
    for (let i = 0; i < 4; i++) {
      const s = this.armor[i];
      if (!s) continue;
      s.dur -= k;
      if (s.dur <= 0) { this.armor[i] = null; broke = true; }
    }
    this.changed();
    return broke;
  }
  infoFlags() {
    const f = new Set();
    for (const s of this.slots) if (s && ITEMS[s.id]?.info) f.add(ITEMS[s.id].info);
    if (f.has('minute')) f.add('hour');
    return f;
  }
  isEmpty() { return this.slots.every(s => !s) && this.armor.every(s => !s) && !this.weapon; }
  takeAll() {
    const out = [...this.slots, ...this.armor, this.weapon].filter(Boolean).map(s => ({ ...s }));
    this.slots.fill(null); this.armor.fill(null); this.weapon = null; this.changed();
    return out;
  }
  save() { return { slots: this.slots, armor: this.armor, weapon: this.weapon, sel: this.sel }; }
  load(o) {
    if (!o) return;
    this.slots = (o.slots || []).slice(0, INV_SIZE).map(s => (s && ITEMS[s.id] ? s : null));
    while (this.slots.length < INV_SIZE) this.slots.push(null);
    this.armor = (o.armor || [null, null, null, null]).map(s => (s && ITEMS[s.id] ? s : null));
    this.weapon = o.weapon && ITEMS[o.weapon.id] ? o.weapon : null;
    this.sel = o.sel || 0;
    this.changed();
  }
}
