import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createKartModel, updateKartModel } from '../src/render/kartModel.js';

describe('kart model orientation', () => {
  it('points the visual nose in the same direction as simulation forward movement', () => {
    const model = createKartModel();
    const heading = Math.PI / 2;

    updateKartModel(model, { x: 0, y: 0, z: 0, heading, speed: 12, sideSlip: 0, boostTime: 0 }, 1 / 60);
    model.updateMatrixWorld(true);

    const visualForward = new THREE.Vector3(0, 0, -1).applyQuaternion(model.quaternion);
    const simulationForward = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));

    expect(visualForward.x).toBeCloseTo(simulationForward.x, 5);
    expect(visualForward.z).toBeCloseTo(simulationForward.z, 5);
  });
});
