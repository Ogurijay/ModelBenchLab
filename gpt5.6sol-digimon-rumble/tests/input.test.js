import test from 'node:test';
import assert from 'node:assert/strict';
import { InputController } from '../src/game/InputController.js';

class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, code) { for (const listener of this.listeners.get(type) || []) listener({ code, preventDefault() {} }); }
}

const buttons = (...active) => Array.from({ length: 16 }, (_, index) => ({ pressed: active.includes(index), value: active.includes(index) ? 1 : 0 }));

test('readAll keeps P1 and P2 keyboard commands separate and edge-triggered', () => {
  const target = new FakeTarget();
  const input = new InputController({ target, navigatorRef: { getGamepads: () => [] } });
  target.emit('keydown', 'KeyD'); target.emit('keydown', 'KeyJ');
  target.emit('keydown', 'ArrowLeft'); target.emit('keydown', 'Numpad2');
  const first = input.readAll([{ id: 'p1' }, { id: 'p2' }]);
  assert.equal(first.p1.moveX, 1); assert.equal(first.p1.attack, true);
  assert.equal(first.p2.moveX, -1); assert.equal(first.p2.ranged, true); assert.equal(first.p2.skill, true);
  const second = input.readAll(['p1', 'p2']);
  assert.equal(second.p1.attack, false); assert.equal(second.p2.skill, false);
  input.dispose();
});

test('four gamepads expose only horizontal movement plus normal/ranged attacks and utility actions', () => {
  const target = new FakeTarget();
  const pads = [
    { index: 0, axes: [0, 0], buttons: buttons(0) },
    { index: 1, axes: [0, 0], buttons: buttons(3) },
    { index: 2, axes: [1, 1], buttons: buttons(2) },
    { index: 3, axes: [0, 0], buttons: buttons(7) },
  ];
  const input = new InputController({ target, navigatorRef: { getGamepads: () => pads } });
  const first = input.readAll(['p1', 'p2', 'p3', 'p4'], Math.PI / 2);
  assert.equal(first.p1.jump, true); assert.equal(first.p2.ranged, true); assert.equal(first.p2.skill, true);
  assert.equal(first.p3.attack, true); assert.equal(first.p3.moveX, 1); assert.equal(first.p3.moveZ, 0);
  assert.equal(first.p4.evolve, true); assert.equal(first.p4.overdrive, true);
  const second = input.readAll(['p1', 'p2', 'p3', 'p4']);
  assert.equal(second.p2.ranged, false); assert.equal(second.p3.attack, false); assert.equal(second.p4.evolve, false);
  input.dispose();
});

test('legacy read accepts arrow keys and exposes evolve as overdrive', () => {
  const target = new FakeTarget();
  const input = new InputController({ target, navigatorRef: { getGamepads: () => [] } });
  target.emit('keydown', 'ArrowRight'); target.emit('keydown', 'KeyE');
  const command = input.read(0);
  assert.equal(command.moveX, 1); assert.equal(command.evolve, true); assert.equal(command.overdrive, true);
  assert.equal(command.moveZ, 0);
  input.dispose();
  assert.equal(target.listeners.get('keydown').size, 0);
});
