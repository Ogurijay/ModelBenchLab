// 道具系统：赛道上的加速带（boost pad）与道具箱（item box）。
// 道具箱给予蘑菇（mushroom，瞬时加速），车辆最多攒 MAX_ITEMS 个，先拾先用。

import { applyBoost } from './kart.js';

export const PAD_BOOST_DURATION = 1.0;
export const MUSHROOM_BOOST_DURATION = 1.4;
export const BOX_RESPAWN_SECONDS = 4;
export const MAX_ITEMS = 2;

export function createItems(track, {
  padFractions = [0.16, 0.52, 0.8],
  boxFractions = [0.32, 0.68],
} = {}) {
  const place = (fraction) => {
    const p = track.pointAt(track.total * fraction);
    return { x: p.x, z: p.z, index: p.index };
  };
  return {
    pads: padFractions.map((f) => ({ ...place(f), radius: track.halfWidth * 0.6 })),
    boxes: boxFractions.map((f) => ({ ...place(f), radius: 2.4, cooldown: 0 })),
  };
}

export function updateItems(items, karts, dt) {
  for (const box of items.boxes) {
    box.cooldown = Math.max(0, box.cooldown - dt);
  }
  for (const kart of karts) {
    for (const pad of items.pads) {
      if (Math.hypot(kart.x - pad.x, kart.z - pad.z) <= pad.radius) {
        applyBoost(kart, PAD_BOOST_DURATION);
      }
    }
    for (const box of items.boxes) {
      if (
        box.cooldown <= 0
        && kart.items.length < MAX_ITEMS
        && Math.hypot(kart.x - box.x, kart.z - box.z) <= box.radius
      ) {
        kart.items.push('mushroom');
        box.cooldown = BOX_RESPAWN_SECONDS;
      }
    }
  }
}

export function useItem(kart) {
  const item = kart.items.shift();
  if (item === 'mushroom') {
    applyBoost(kart, MUSHROOM_BOOST_DURATION);
    return true;
  }
  return false;
}
