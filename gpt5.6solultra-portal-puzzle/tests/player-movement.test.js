import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameSimulation } from '../src/game/GameSimulation.js';
import {
  advanceSprintState,
  PLAYER_MOVEMENT,
} from '../src/game/playerMovement.js';

const FIXED_DT = 1 / 120;

function advanceFrames(frameCount, initialElapsed = 0) {
  let state = advanceSprintState(initialElapsed, {
    sprintHeld: true,
    moving: true,
    dt: 0,
  });
  for (let frame = 0; frame < frameCount; frame += 1) {
    state = advanceSprintState(state.elapsed, {
      sprintHeld: true,
      moving: true,
      dt: FIXED_DT,
    });
  }
  return state;
}

test('新的冲刺最高速度是原冲刺上限的两倍', () => {
  assert.equal(PLAYER_MOVEMENT.sprintEntrySpeed, 6.4);
  assert.equal(PLAYER_MOVEMENT.sprintMaxSpeed, PLAYER_MOVEMENT.sprintEntrySpeed * 2);
  assert.equal(PLAYER_MOVEMENT.sprintChargeSeconds, 3);
});

test('连续冲刺 1.5 秒时处于半程蓄速', () => {
  const state = advanceFrames(180);
  assert.ok(Math.abs(state.elapsed - 1.5) < 1e-9);
  assert.ok(Math.abs(state.progress - 0.5) < 1e-9);
  assert.ok(Math.abs(state.speed - 9.6) < 1e-9);
  assert.equal(state.maxed, false);
});

test('连续冲刺 360 个固定步后精确达到 3 秒与双倍上限', () => {
  const state = advanceFrames(360);
  assert.equal(state.elapsed, 3);
  assert.equal(state.progress, 1);
  assert.equal(state.speed, 12.8);
  assert.equal(state.maxed, true);

  const clamped = advanceSprintState(state.elapsed, {
    sprintHeld: true,
    moving: true,
    dt: 10,
  });
  assert.equal(clamped.elapsed, 3);
  assert.equal(clamped.speed, 12.8);
});

test('松开 Shift 或停止有效移动都会立即清空蓄速', () => {
  const charged = advanceFrames(348);
  assert.ok(charged.elapsed > 2.8);

  const released = advanceSprintState(charged.elapsed, {
    sprintHeld: false,
    moving: true,
    dt: FIXED_DT,
  });
  assert.deepEqual(released, {
    active: false,
    elapsed: 0,
    progress: 0,
    speed: 4.45,
    maxed: false,
  });

  const stopped = advanceSprintState(charged.elapsed, {
    sprintHeld: true,
    moving: false,
    dt: FIXED_DT,
  });
  assert.deepEqual(stopped, released);
});

test('冲刺中断后重新开始不会继承之前的计时', () => {
  const charged = advanceFrames(240);
  const interrupted = advanceSprintState(charged.elapsed, {
    sprintHeld: true,
    moving: false,
    dt: FIXED_DT,
  });
  const restarted = advanceSprintState(interrupted.elapsed, {
    sprintHeld: true,
    moving: true,
    dt: FIXED_DT,
  });

  assert.equal(restarted.elapsed, FIXED_DT);
  assert.ok(restarted.speed > PLAYER_MOVEMENT.sprintEntrySpeed);
  assert.ok(restarted.speed < 6.5);
  assert.equal(restarted.maxed, false);
});

class MockInput extends EventTarget {
  constructor() {
    super();
    this.keys = new Set();
    this.pressed = new Set();
    this.yaw = 0;
    this.pitch = 0;
  }

  down(code) { return this.keys.has(code); }

  consume(code) {
    const value = this.pressed.has(code);
    this.pressed.delete(code);
    return value;
  }

  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.dispatchEvent(new Event('clear'));
  }

  getFlatForward(target) { return target.set(0, 0, -1); }

  getForward(target) { return target.set(0, 0, -1); }

  setDirection() {}
}

function createMovementSimulation() {
  const input = new MockInput();
  const facility = {
    solids: [{
      enabled: true,
      min: new THREE.Vector3(-100, -1, -100),
      max: new THREE.Vector3(100, 0, 100),
    }],
    plate: { position: new THREE.Vector3(80, 0, 80), radius: 1 },
    reset() {},
    update() { return { doorOpen: false }; },
    getState() { return { doorProgress: 0 }; },
  };
  const portals = {
    bothActive: false,
    reset() {},
    getState() {
      return {
        cyan: { active: false },
        amber: { active: false },
      };
    },
    tryTeleport() { return null; },
    transformDirection() {},
    update() {},
  };
  const ui = {
    setObjective() {},
    setPortalStatus() {},
    setSprintState() {},
    showToast() {},
  };
  const game = new GameSimulation({
    camera: new THREE.PerspectiveCamera(),
    input,
    facility,
    portals,
    cubeVisual: { group: new THREE.Group() },
    audio: {},
    ui,
  });
  return { game, input };
}

test('输入清空与完整重置会立即重置运行时冲刺状态', () => {
  const { game, input } = createMovementSimulation();
  input.keys.add('ShiftLeft');
  input.keys.add('KeyW');
  for (let frame = 0; frame < 360; frame += 1) game.updatePlayer(FIXED_DT);

  assert.equal(game.getState().player.sprint.maxed, true);
  assert.equal(game.getState().player.sprint.targetSpeed, 12.8);

  input.clear();
  assert.deepEqual(game.getState().player.sprint, {
    active: false,
    elapsed: 0,
    progress: 0,
    maxed: false,
    targetSpeed: 4.45,
    maxSpeed: 12.8,
    chargeSeconds: 3,
  });

  input.keys.add('ShiftRight');
  input.keys.add('KeyD');
  for (let frame = 0; frame < 120; frame += 1) game.updatePlayer(FIXED_DT);
  assert.ok(game.getState().player.sprint.elapsed > 0.99);

  game.reset();
  assert.equal(game.getState().player.sprint.elapsed, 0);
  assert.equal(game.getState().player.sprint.active, false);
});
