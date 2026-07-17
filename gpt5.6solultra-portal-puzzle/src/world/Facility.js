import * as THREE from 'three';

const tmpBox = new THREE.Box3();

function gridTexture(base, line, repeatX, repeatY) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = base;
  context.fillRect(0, 0, 512, 512);
  const gradient = context.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, 'rgba(255,255,255,.14)');
  gradient.addColorStop(1, 'rgba(0,0,0,.12)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  context.strokeStyle = line;
  context.lineWidth = 7;
  context.strokeRect(5, 5, 502, 502);
  context.lineWidth = 2;
  context.strokeStyle = 'rgba(255,255,255,.16)';
  context.strokeRect(15, 15, 482, 482);
  // 确定性颗粒，不依赖外部贴图。
  let seed = 79;
  for (let i = 0; i < 900; i++) {
    seed = (seed * 16807) % 2147483647;
    const x = (seed / 2147483647) * 512;
    seed = (seed * 16807) % 2147483647;
    const y = (seed / 2147483647) * 512;
    context.fillStyle = 'rgba(20,28,24,.035)';
    context.fillRect(x, y, 1.2, 1.2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  return texture;
}

function labelTexture(title, subtitle, accent = '#c8ff4a') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 360;
  const context = canvas.getContext('2d');
  context.fillStyle = '#101513';
  context.fillRect(0, 0, 1024, 360);
  context.fillStyle = accent;
  context.fillRect(0, 0, 18, 360);
  context.strokeStyle = 'rgba(235,241,233,.2)';
  context.lineWidth = 3;
  context.strokeRect(35, 22, 965, 316);
  context.textBaseline = 'middle';
  context.fillStyle = '#edf1ea';
  context.font = '700 82px Microsoft YaHei UI, sans-serif';
  context.fillText(title, 72, 125);
  context.fillStyle = 'rgba(237,241,234,.55)';
  context.font = '34px Cascadia Mono, monospace';
  context.fillText(subtitle, 74, 238);
  context.fillStyle = accent;
  context.font = '700 24px Cascadia Mono, monospace';
  context.fillText('WSL // AUTHORIZED PERSONNEL', 74, 302);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function colliderFrom(mesh, id) {
  mesh.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(mesh);
  return { id, mesh, enabled: true, min: bounds.min.clone(), max: bounds.max.clone() };
}

function refresh(collider) {
  collider.mesh.updateMatrixWorld(true);
  tmpBox.setFromObject(collider.mesh);
  collider.min.copy(tmpBox.min);
  collider.max.copy(tmpBox.max);
}

export function createFacility(scene) {
  scene.background = new THREE.Color(0x090d0c);
  scene.fog = new THREE.FogExp2(0x090d0c, 0.02);

  const wallMap = gridTexture('#d8ddd5', 'rgba(45,55,49,.32)', 3, 3);
  const floorMap = gridTexture('#47514c', 'rgba(10,15,13,.55)', 7, 10);
  const white = new THREE.MeshStandardMaterial({ color: 0xdfe3dc, map: wallMap, roughness: 0.68, metalness: 0.04 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x7a8780, map: floorMap, roughness: 0.7, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171e1b, roughness: 0.42, metalness: 0.68 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9fd7c4,
    transparent: true,
    opacity: 0.2,
    transmission: 0.38,
    roughness: 0.08,
    thickness: 0.1,
    side: THREE.DoubleSide,
  });
  const solids = [];
  const surfaces = [];

  function box(id, size, position, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (solid) solids.push(colliderFrom(mesh, id));
    return mesh;
  }

  // 22 × 30 米主舱体。
  box('floor', [22, 0.5, 30], [0, -0.25, 0], floor);
  box('ceiling', [22, 0.5, 30], [0, 8.25, 0], dark);
  box('west-wall', [0.5, 8, 30], [-11.25, 4, 0], white);
  box('east-wall', [0.5, 8, 30], [11.25, 4, 0], white);
  box('south-wall', [22, 8, 0.5], [0, 4, 15.25], white);
  box('north-left', [14.2, 8, 0.5], [-3.9, 4, -15.25], white);
  box('north-right', [4.9, 8, 0.5], [8.55, 4, -15.25], white);
  box('north-lintel', [2.9, 3.2, 0.5], [4.65, 6.4, -15.25], dark);

  // 出口短廊，走过门后触发完成。
  box('corridor-floor', [4.8, 0.5, 8], [4.65, -0.25, -19], floor);
  box('corridor-left', [0.35, 5.5, 8], [2.25, 2.75, -19], dark);
  box('corridor-right', [0.35, 5.5, 8], [7.05, 2.75, -19], dark);
  box('corridor-ceiling', [4.8, 0.35, 8], [4.65, 5.65, -19], dark);

  // 相位立方体密封舱：玻璃阻挡移动，射线仍可命中舱内授权面。
  box('vault-front', [0.15, 5.5, 6.5], [-5.2, 2.75, -5], glass);
  box('vault-south', [5.8, 5.5, 0.15], [-8.1, 2.75, -1.75], glass);
  box('vault-north', [5.8, 5.5, 0.15], [-8.1, 2.75, -8.25], glass);
  box('vault-frame-a', [0.3, 5.8, 0.3], [-5.2, 2.9, -1.75], dark);
  box('vault-frame-b', [0.3, 5.8, 0.3], [-5.2, 2.9, -8.25], dark);
  box('vault-frame-top', [0.3, 0.3, 6.8], [-5.2, 5.65, -5], dark);

  function portalPanel(id, width, height, position, rotation) {
    const material = white.clone();
    material.side = THREE.FrontSide;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.receiveShadow = true;
    mesh.userData.portalSurface = { id, width, height };
    scene.add(mesh);
    surfaces.push(mesh);
  }
  portalPanel('east-array', 11, 6.4, [10.99, 3.55, 0], [0, -Math.PI / 2, 0]);
  portalPanel('south-array', 10, 6.4, [0, 3.55, 14.99], [0, Math.PI, 0]);
  portalPanel('floor-array', 8.5, 7.5, [0, 0.012, 3.2], [-Math.PI / 2, 0, 0]);
  portalPanel('vault-array', 6, 5.2, [-10.99, 2.8, -5], [0, Math.PI / 2, 0]);

  // 压力平台。
  box('plate-base', [3.1, 0.14, 3.1], [5.4, 0.07, -9.3], dark, false);
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.18, 1.32, 0.16, 48),
    new THREE.MeshStandardMaterial({ color: 0x29322e, roughness: 0.28, metalness: 0.7, emissive: 0x111914 }),
  );
  plate.position.set(5.4, 0.18, -9.3);
  plate.receiveShadow = true;
  scene.add(plate);
  const plateRing = new THREE.Mesh(new THREE.TorusGeometry(1.03, 0.045, 10, 64), new THREE.MeshBasicMaterial({ color: 0xff695e, toneMapped: false }));
  plateRing.rotation.x = Math.PI / 2;
  plateRing.position.set(5.4, 0.275, -9.3);
  scene.add(plateRing);
  const plateLight = new THREE.PointLight(0xff695e, 0.5, 5, 2);
  plateLight.position.set(5.4, 0.55, -9.3);
  scene.add(plateLight);

  // 动态出口门。
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x202824, roughness: 0.3, metalness: 0.82, emissive: 0x250a08 });
  const door = box('exit-door', [2.9, 4.8, 0.34], [4.65, 2.4, -15.03], doorMaterial);
  const doorCollider = solids.at(-1);
  const doorBars = [];
  for (let i = -2; i <= 2; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 4.1, 0.03), new THREE.MeshBasicMaterial({ color: 0xff5d49, transparent: true, opacity: 0.65, toneMapped: false }));
    bar.position.set(i * 0.44, 0, 0.19);
    door.add(bar);
    doorBars.push(bar);
  }

  const exitField = new THREE.Mesh(
    new THREE.PlaneGeometry(4.1, 4.8),
    new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 vUv;uniform float time;void main(){float b=.5+.5*sin((vUv.y+time*.3)*90.);float e=smoothstep(.5,.05,abs(vUv.x-.5));gl_FragColor=vec4(vec3(.4,1.,.55)*(b*.15+.06),e*.38);}',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  exitField.position.set(4.65, 2.55, -22.9);
  scene.add(exitField);

  // 结构肋、灯带与标识。
  for (const x of [-8, -4, 0, 4, 8]) box(`rib-${x}`, [0.15, 0.2, 29], [x, 7.82, 0], dark, false);
  const lamps = [];
  for (const [x, z, length] of [[-5.8, 6, 4.6], [5.8, 6, 4.6], [0, -4, 5.6], [4.65, -18.5, 2.8]]) {
    const tray = box(`lamp-${x}-${z}`, [length + 0.2, 0.1, 0.38], [x, z < -16 ? 5.38 : 7.7, z], dark, false);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(length, 0.025, 0.22), new THREE.MeshBasicMaterial({ color: 0xeafff3, toneMapped: false }));
    glow.position.y = -0.065;
    tray.add(glow);
    lamps.push(glow);
  }
  function sign(title, subtitle, accent, width, position, rotation) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.35), new THREE.MeshBasicMaterial({ map: labelTexture(title, subtitle, accent), toneMapped: false }));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    scene.add(mesh);
  }
  sign('密封取样舱', 'PHASE CUBE / VISUAL ACCESS ONLY', '#36dcff', 4.5, [-5.08, 3.9, -5], [0, Math.PI / 2, 0]);
  sign('出口联锁', 'PLACE MASS ON PRESSURE ARRAY', '#ff695e', 4.2, [8.1, 3.15, -14.97], [0, 0, 0]);
  sign('折跃定律', 'SPEED IN = SPEED OUT', '#c8ff4a', 3.8, [10.98, 5.4, 8], [0, -Math.PI / 2, 0]);

  const hemi = new THREE.HemisphereLight(0xe3fff4, 0x132019, 1.45);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xeafff6, 2.15);
  key.position.set(3, 10, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -18;
  key.shadow.camera.right = key.shadow.camera.top = 18;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 42;
  key.shadow.bias = -0.00035;
  scene.add(key);
  const vaultLight = new THREE.PointLight(0x63dcff, 12, 12, 2);
  vaultLight.position.set(-8.2, 4.7, -5);
  vaultLight.castShadow = true;
  scene.add(vaultLight);
  const exitLight = new THREE.SpotLight(0xc8ff4a, 22, 16, Math.PI / 5, 0.45, 1.5);
  exitLight.position.set(4.65, 5.2, -17.2);
  exitLight.target.position.set(4.65, 0, -21);
  scene.add(exitLight, exitLight.target);

  // 单 drawcall 的确定性微粒层。
  const positions = new Float32Array(360 * 3);
  let seed = 731;
  for (let i = 0; i < 360; i++) {
    seed = (seed * 16807) % 2147483647; positions[i * 3] = (seed / 2147483647 - 0.5) * 21;
    seed = (seed * 16807) % 2147483647; positions[i * 3 + 1] = (seed / 2147483647) * 7.5;
    seed = (seed * 16807) % 2147483647; positions[i * 3 + 2] = (seed / 2147483647 - 0.5) * 29;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xbdd8c7, size: 0.018, transparent: true, opacity: 0.34, depthWrite: false }));
  scene.add(dust);

  let doorProgress = 0;
  let buttonPressed = false;
  let elapsed = 0;
  function update(dt, state) {
    elapsed += dt;
    buttonPressed = !!state.buttonPressed;
    doorProgress = THREE.MathUtils.damp(doorProgress, buttonPressed ? 1 : 0, 4.8, dt);
    door.position.y = 2.4 + doorProgress * 5.25;
    doorCollider.enabled = doorProgress < 0.86;
    refresh(doorCollider);
    plate.position.y = 0.18 - doorProgress * 0.055;
    plate.material.emissive.setHex(buttonPressed ? 0x294b13 : 0x111914);
    plateRing.material.color.setHex(buttonPressed ? 0xc8ff4a : 0xff695e);
    plateLight.color.setHex(buttonPressed ? 0xc8ff4a : 0xff695e);
    plateLight.intensity = buttonPressed ? 1.2 : 0.45;
    doorMaterial.emissive.setHex(buttonPressed ? 0x183307 : 0x250a08);
    doorBars.forEach((bar) => {
      bar.material.color.setHex(buttonPressed ? 0xc8ff4a : 0xff5d49);
      bar.material.opacity = buttonPressed ? 0.18 : 0.65;
    });
    exitField.material.uniforms.time.value = elapsed;
    dust.rotation.y += dt * 0.006;
    lamps.forEach((lamp, index) => {
      const value = 0.91 + Math.sin(elapsed * 1.6 + index) * 0.05;
      lamp.material.color.setRGB(value, 1, value * 0.96);
    });
    return { doorProgress, doorOpen: doorProgress > 0.82 };
  }

  function reset() {
    doorProgress = 0;
    buttonPressed = false;
    door.position.y = 2.4;
    doorCollider.enabled = true;
    refresh(doorCollider);
  }

  return {
    surfaces,
    solids,
    plate: { position: plate.position, radius: 1.05, mesh: plate },
    door: { mesh: door, collider: doorCollider },
    update,
    reset,
    getState: () => ({ buttonPressed, doorProgress, doorOpen: doorProgress > 0.82 }),
  };
}

export function createPhaseCube(scene) {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 1.05, 1.05, 2, 2, 2),
    new THREE.MeshPhysicalMaterial({ color: 0xdfe8df, roughness: 0.22, metalness: 0.48, clearcoat: 0.7, clearcoatRoughness: 0.18 }),
  );
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.31, 1), new THREE.MeshBasicMaterial({ color: 0xc8ff4a, wireframe: true, transparent: true, opacity: 0.82, toneMapped: false }));
  group.add(core);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shell.geometry, 28), new THREE.LineBasicMaterial({ color: 0x27322d, transparent: true, opacity: 0.9 }));
  edges.scale.setScalar(1.01);
  group.add(edges);
  const cornerMaterial = new THREE.MeshStandardMaterial({ color: 0x1d2622, roughness: 0.28, metalness: 0.82 });
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const corner = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 7), cornerMaterial);
    corner.position.set(x * 0.47, y * 0.47, z * 0.47);
    corner.castShadow = true;
    group.add(corner);
  }
  const glow = new THREE.PointLight(0xc8ff4a, 1.3, 3.4, 2);
  group.add(glow);
  group.position.set(-7.8, 0.58, -5);
  scene.add(group);
  return {
    group,
    update(time, held) {
      core.rotation.x = time * 0.66;
      core.rotation.y = time * 0.94;
      core.scale.setScalar(1 + Math.sin(time * 3.2) * 0.08);
      glow.intensity = (held ? 2.3 : 1.15) + Math.sin(time * 4) * 0.18;
    },
  };
}
