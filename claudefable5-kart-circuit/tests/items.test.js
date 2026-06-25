import { describe, expect, it } from 'vitest';
import { createTrack } from '../src/sim/track.js';
import { createKart } from '../src/sim/kart.js';
import {
  createItems,
  updateItems,
  useItem,
  PAD_BOOST_DURATION,
  BOX_RESPAWN_SECONDS,
  MAX_ITEMS,
} from '../src/sim/items.js';

const DT = 1 / 60;

describe('items', () => {
  const track = createTrack();

  it('经过加速带获得 boost', () => {
    const items = createItems(track);
    const pad = items.pads[0];
    const kart = createKart({ x: pad.x, z: pad.z });
    updateItems(items, [kart], DT);
    expect(kart.boostTimer).toBeCloseTo(PAD_BOOST_DURATION, 9);
  });

  it('拾取道具箱获得蘑菇，箱子进入冷却后再刷新', () => {
    const items = createItems(track);
    const box = items.boxes[0];
    const kart = createKart({ x: box.x, z: box.z });
    updateItems(items, [kart], DT);
    expect(kart.items).toEqual(['mushroom']);
    expect(box.cooldown).toBeGreaterThan(0);

    // 冷却中：第二辆车拾取不到。
    const other = createKart({ x: box.x, z: box.z });
    updateItems(items, [other], DT);
    expect(other.items).toEqual([]);

    // 冷却结束后恢复。
    updateItems(items, [], BOX_RESPAWN_SECONDS + 1);
    updateItems(items, [other], DT);
    expect(other.items).toEqual(['mushroom']);
  });

  it(`道具最多攒 ${MAX_ITEMS} 个，攒满后不再拾取也不消耗箱子`, () => {
    const items = createItems(track);
    const box = items.boxes[0];
    const kart = createKart({ x: box.x, z: box.z });

    for (let n = 0; n < MAX_ITEMS; n += 1) {
      updateItems(items, [kart], DT);
      updateItems(items, [], BOX_RESPAWN_SECONDS + 1); // 等待箱子刷新
    }
    expect(kart.items.length).toBe(MAX_ITEMS);

    // 攒满：箱子保持可用（冷却不被触发）。
    updateItems(items, [kart], DT);
    expect(kart.items.length).toBe(MAX_ITEMS);
    expect(box.cooldown).toBe(0);
  });

  it('使用蘑菇获得 boost 并按先后顺序消耗', () => {
    const kart = createKart();
    kart.items = ['mushroom', 'mushroom'];
    expect(useItem(kart)).toBe(true);
    expect(kart.boostTimer).toBeGreaterThan(0);
    expect(kart.items.length).toBe(1);
    expect(useItem(kart)).toBe(true);
    expect(kart.items.length).toBe(0);
    expect(useItem(kart)).toBe(false);
  });
});
