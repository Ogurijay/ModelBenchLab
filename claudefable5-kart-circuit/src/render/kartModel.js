import * as THREE from 'three';

// 代码原生卡丁车模型：车头朝 +Z，rotation.y 直接使用 sim 的 heading。
// 返回 { group, update }，update 负责车轮滚动、前轮转向和漂移侧倾。

export function createKartModel(color = 0xd23c3c) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.42, 2.7),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15 }),
  );
  chassis.position.y = 0.45;
  chassis.castShadow = true;
  body.add(chassis);

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.3, 0.7),
    chassis.material,
  );
  nose.position.set(0, 0.42, 1.6);
  nose.castShadow = true;
  body.add(nose);

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.65, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.8 }),
  );
  seat.position.set(0, 0.95, -0.75);
  body.add(seat);

  // 车手：头盔 + 身体
  const driver = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.36, 0.6, 10),
    new THREE.MeshStandardMaterial({ color: 0x2b5fa3, roughness: 0.7 }),
  );
  torso.position.y = 0.95;
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3 }),
  );
  helmet.position.y = 1.42;
  helmet.castShadow = true;
  driver.add(torso, helmet);
  driver.position.z = -0.45;
  body.add(driver);

  // 方向盘
  const wheelRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.045, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
  );
  wheelRing.position.set(0, 1.0, 0.25);
  wheelRing.rotation.x = -1.1;
  body.add(wheelRing);

  const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 14);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.9 });
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.32, 10);
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xc9c9c9, metalness: 0.6, roughness: 0.3 });

  const wheels = [];
  const frontSteerGroups = [];
  for (const [sx, sz, front] of [
    [-0.85, 1.05, true],
    [0.85, 1.05, true],
    [-0.85, -1.0, false],
    [0.85, -1.0, false],
  ]) {
    const steer = new THREE.Group();
    steer.position.set(sx, 0.34, sz);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    spin.add(tire, hub);
    steer.add(spin);
    body.add(steer);
    wheels.push(spin);
    if (front) frontSteerGroups.push(steer);
  }

  let spinAngle = 0;
  return {
    group,
    update(kart, input, dt) {
      group.position.set(kart.x, 0, kart.z);
      group.rotation.y = kart.heading;

      spinAngle += (kart.speed / 0.34) * dt;
      for (const w of wheels) w.rotation.x = spinAngle;
      for (const s of frontSteerGroups) s.rotation.y = (input.steer ?? 0) * 0.45;

      // 漂移时车体向外侧倾 + 轻微甩尾偏航。
      const targetRoll = kart.drifting ? kart.driftDir * 0.09 : 0;
      const targetYaw = kart.drifting ? -kart.driftDir * 0.3 : 0;
      const blend = 1 - Math.exp(-8 * dt);
      body.rotation.z += (targetRoll - body.rotation.z) * blend;
      body.rotation.y += (targetYaw - body.rotation.y) * blend;
    },
  };
}
