/**
 * three.js 场景 — 深夜荧光保龄球馆(cosmic bowling 氛围)。
 * 程序化纹理 + RoomEnvironment 反射,单聚光投影,霓虹点缀。
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  LANE_WIDTH, FOUL_Z, HEAD_PIN_Z, LANE_END_Z,
  GUTTER_CENTER_X, BALL_RADIUS, PIN_COM_Y, PIN_SPOTS,
} from './physics.js';
import {
  makeLaneTexture, makePinTexture, makeBallTexture,
  makeNeonSignTexture, makeCarpetTexture,
} from './textures.js';

const LANE_LENGTH = Math.abs(LANE_END_Z - FOUL_Z);

/** 球瓶旋转剖面(半径, 距瓶底高度) */
const PIN_PROFILE = [
  [0.002, 0.0], [0.045, 0.0], [0.052, 0.03], [0.058, 0.09], [0.06, 0.14],
  [0.055, 0.19], [0.04, 0.24], [0.029, 0.285], [0.03, 0.32], [0.034, 0.345],
  [0.028, 0.368], [0.012, 0.382], [0.002, 0.385],
];

export class SceneManager {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // 0.185 中 PCFSoftShadowMap 已弃用(会刷 console 警告)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07060d);
    this.scene.fog = new THREE.Fog(0x07060d, 20, 46);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 80);
    this.camera.position.set(0, 1.5, 2.2);
    this._camPos = new THREE.Vector3(0, 1.5, 2.2);
    this._camLook = new THREE.Vector3(0, 0.6, -9);
    this._camLookCur = this._camLook.clone();

    this._buildLights();
    this._buildLane();
    this._buildRoom();
    this._buildPins();
    this._buildBall();
    this._buildSweeper();
    this._buildAimLine();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------- 灯光 ----------
  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x4a4f7a, 0x0a0812, 0.5));

    const key = new THREE.SpotLight(0xffe2b8, 260, 30, 0.42, 0.55, 1.6);
    key.position.set(0, 6, -13.5);
    key.target.position.set(0, 0, -17.1);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 20;
    key.shadow.bias = -0.0006;
    this.scene.add(key, key.target);

    const laneWash = new THREE.SpotLight(0xa9c8ff, 90, 26, 0.6, 0.8, 1.4);
    laneWash.position.set(0, 5.2, -5);
    laneWash.target.position.set(0, 0, -8.5);
    this.scene.add(laneWash, laneWash.target);

    const pink = new THREE.PointLight(0xff2d95, 26, 15, 1.6);
    pink.position.set(-3.4, 1.8, -4.5);
    const cyan = new THREE.PointLight(0x23e5ff, 26, 15, 1.6);
    cyan.position.set(3.4, 1.8, -10.5);
    this.scene.add(pink, cyan);

    // 球体随行灯(紫罗兰,照亮球身边道面)
    this.ballLight = new THREE.PointLight(0x9a5cff, 6, 3.2, 1.8);
    this.scene.add(this.ballLight);
  }

  // ---------- 球道 ----------
  _buildLane() {
    const laneTex = makeLaneTexture(LANE_LENGTH, PIN_SPOTS);
    laneTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const laneMat = new THREE.MeshPhysicalMaterial({
      map: laneTex,
      roughness: 0.32,
      metalness: 0.0,
      clearcoat: 0.85,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.1,
    });
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(LANE_WIDTH, LANE_LENGTH), laneMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, 0.001, (FOUL_Z + LANE_END_Z) / 2);
    lane.receiveShadow = true;
    this.scene.add(lane);

    // 助走区(犯规线后)
    const approachMat = new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.75 });
    const approach = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.2), approachMat);
    approach.rotation.x = -Math.PI / 2;
    approach.position.set(0, 0.0, FOUL_Z + 1.1);
    approach.receiveShadow = true;
    this.scene.add(approach);

    // 犯规线
    const foul = new THREE.Mesh(
      new THREE.PlaneGeometry(LANE_WIDTH + 0.55, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xff3344 })
    );
    foul.rotation.x = -Math.PI / 2;
    foul.position.set(0, 0.003, FOUL_Z);
    this.scene.add(foul);

    // 两侧边沟(浅弧半管:沟沿齐道面,沟底 -0.06 与物理一致)
    const gutterGeo = new THREE.CylinderGeometry(0.1375, 0.1375, LANE_LENGTH, 20, 1, true, Math.PI, Math.PI);
    gutterGeo.rotateZ(Math.PI / 2);
    gutterGeo.rotateY(Math.PI / 2);
    const gutterMat = new THREE.MeshStandardMaterial({
      color: 0x15161e, roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.9,
    });
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(gutterGeo, gutterMat);
      g.position.set(s * GUTTER_CENTER_X, 0, (FOUL_Z + LANE_END_Z) / 2);
      g.scale.y = 0.44;
      g.receiveShadow = true;
      this.scene.add(g);
    }

    // 外侧护墙 + 顶部霓虹光带
    const railMat = new THREE.MeshStandardMaterial({ color: 0x241a30, roughness: 0.6 });
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.28, LANE_LENGTH), railMat);
      rail.position.set(s * 0.85, 0.14, (FOUL_Z + LANE_END_Z) / 2);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.scene.add(rail);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.012, LANE_LENGTH),
        new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff2d95 : 0x23e5ff })
      );
      strip.position.set(s * 0.85, 0.29, (FOUL_Z + LANE_END_Z) / 2);
      this.scene.add(strip);
    }

    // 落坑(黑)+ 后缓冲幕
    const pit = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 1.4, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x05050a, roughness: 1 })
    );
    pit.position.set(0, -0.72, LANE_END_Z - 0.7);
    this.scene.add(pit);
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x120a18, roughness: 0.95 })
    );
    curtain.position.set(0, 0.55, LANE_END_Z - 1.1);
    this.scene.add(curtain);

    // 瓶台上方遮罩箱 + 霓虹招牌
    const mask = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.72, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x1a1226, roughness: 0.5 })
    );
    mask.position.set(0, 1.35, -17.6);
    this.scene.add(mask);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 0.52),
      new THREE.MeshBasicMaterial({
        map: makeNeonSignTexture('霓虹保龄球馆', '#ff2d95', 'NEON BOWLING'),
        transparent: true,
      })
    );
    sign.position.set(0, 1.35, -17.14);
    this.scene.add(sign);
  }

  // ---------- 房间氛围 ----------
  _buildRoom() {
    const carpetTex = makeCarpetTexture();
    carpetTex.repeat.set(10, 14);
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 44),
      new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.95 })
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, -0.01, -12);
    carpet.receiveShadow = true;
    this.scene.add(carpet);

    // 邻道(左右各一,昏暗陪衬,增加球馆纵深)
    const neighborMat = new THREE.MeshStandardMaterial({ color: 0x54381f, roughness: 0.55 });
    for (const s of [-1, 1]) {
      const nl = new THREE.Mesh(new THREE.PlaneGeometry(LANE_WIDTH, LANE_LENGTH), neighborMat);
      nl.rotation.x = -Math.PI / 2;
      nl.position.set(s * 2.6, 0.0, (FOUL_Z + LANE_END_Z) / 2);
      this.scene.add(nl);
    }

    // 后墙 + 大霓虹招牌
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 8),
      new THREE.MeshStandardMaterial({ color: 0x0d0a18, roughness: 0.9 })
    );
    backWall.position.set(0, 3.2, LANE_END_Z - 1.6);
    this.scene.add(backWall);

    const bigSign = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 1.6),
      new THREE.MeshBasicMaterial({ map: makeNeonSignTexture('今夜全中', '#23e5ff', 'STRIKE NIGHT'), transparent: true })
    );
    bigSign.position.set(0, 3.6, LANE_END_Z - 1.5);
    this.scene.add(bigSign);

    // 天花板 + 一排冷色灯管(自发光装饰)
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 44),
      new THREE.MeshStandardMaterial({ color: 0x070510, roughness: 1 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 6.2, -12);
    this.scene.add(ceiling);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0x6f7cff });
    for (let i = 0; i < 6; i++) {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 0.08), tubeMat);
      tube.position.set(0, 6.1, -1 - i * 3.2);
      this.scene.add(tube);
    }
  }

  // ---------- 球瓶 ----------
  _buildPins() {
    const pts = PIN_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, 28);
    const mat = new THREE.MeshStandardMaterial({
      map: makePinTexture([0.62, 0.7]),
      roughness: 0.3,
      metalness: 0.0,
      envMapIntensity: 0.9,
      emissive: 0x14141c,
    });
    this.pinGroups = PIN_SPOTS.map(() => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.y = -PIN_COM_Y; // 网格原点在瓶底,物理体原点在重心
      const group = new THREE.Group();
      group.add(mesh);
      this.scene.add(group);
      return group;
    });
  }

  // ---------- 球 ----------
  _buildBall() {
    const tex = makeBallTexture();
    const mat = new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: 0.18,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.4,
    });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 40, 28), mat);
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);
  }

  // ---------- 扫瓶机 ----------
  _buildSweeper() {
    const group = new THREE.Group();
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.32, 0.3, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x2b2038, roughness: 0.4, metalness: 0.5 })
    );
    bar.castShadow = true;
    group.add(bar);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(1.32, 0.03, 0.075),
      new THREE.MeshBasicMaterial({ color: 0xffb347 })
    );
    glow.position.y = -0.12;
    group.add(glow);
    group.position.set(0, 1.6, HEAD_PIN_Z + 0.35);
    this.sweeper = group;
    this.scene.add(group);
  }

  // ---------- 瞄准弧线 ----------
  _buildAimLine() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    this.aimLine = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0x23e5ff, transparent: true, opacity: 0.65 })
    );
    this.aimLine.frustumCulled = false;
    this.scene.add(this.aimLine);
  }

  /** 更新瞄准弧线(points: [{x,z}], gutter: 是否落沟) */
  setAimPath(points, gutter) {
    const attr = this.aimLine.geometry.getAttribute('position');
    const n = Math.min(points.length, 64);
    for (let i = 0; i < n; i++) {
      attr.setXYZ(i, points[i].x, 0.02, points[i].z);
    }
    attr.needsUpdate = true;
    this.aimLine.geometry.setDrawRange(0, n);
    this.aimLine.material.color.set(gutter ? 0xff5a6a : 0x23e5ff);
  }

  setAimVisible(v) {
    this.aimLine.visible = v;
  }

  // ---------- 同步物理 ----------
  syncFromPhysics(physics) {
    physics.pins.forEach((p, i) => {
      const g = this.pinGroups[i];
      g.visible = p.inWorld;
      if (p.inWorld) {
        g.position.copy(p.body.position);
        g.quaternion.copy(p.body.quaternion);
      }
    });
    const b = physics.ball;
    this.ballMesh.position.copy(b.position);
    this.ballMesh.quaternion.copy(b.quaternion);
    this.ballLight.position.set(b.position.x, b.position.y + 0.5, b.position.z + 0.2);
    this.ballLight.visible = this.ballMesh.visible;
  }

  setBallVisible(v) {
    this.ballMesh.visible = v;
  }

  // ---------- 相机 ----------
  /**
   * mode: 'aim' | 'follow' | 'deck'
   */
  updateCamera(mode, ballPos, dt) {
    const want = this._camPos;
    const look = this._camLook;
    if (mode === 'follow' && ballPos) {
      const z = Math.max(ballPos.z + 3.4, -11.8);
      want.set(ballPos.x * 0.35, 1.18, Math.min(z, 2.2));
      look.set(ballPos.x * 0.6, 0.22, Math.max(ballPos.z - 4, HEAD_PIN_Z - 0.6));
    } else if (mode === 'deck') {
      want.set(0, 1.25, -12.6);
      look.set(0, 0.32, HEAD_PIN_Z - 0.7);
    } else {
      want.set(0, 1.5, 2.2);
      look.set(0, 0.55, -9);
    }
    const k = 1 - Math.exp(-3.2 * dt);
    this.camera.position.lerp(want, k);
    this._camLookCur.lerp(look, k);
    this.camera.lookAt(this._camLookCur);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
