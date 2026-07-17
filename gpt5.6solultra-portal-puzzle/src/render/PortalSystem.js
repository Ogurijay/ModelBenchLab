import * as THREE from 'three';
import {
  clampPortalPoint,
  crossingPortal,
  mapPointThroughPortal,
  mapVectorThroughPortal,
  supportAlongNormal,
} from '../game/portalMath.js';

const PORTAL_WIDTH = 1.5;
const PORTAL_HEIGHT = 2.55;
const tmpLocal = new THREE.Vector3();
const tmpWorld = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpColor = new THREE.Color();

function createEllipseLine(color, scale = 1) {
  const points = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    points.push(new THREE.Vector3(
      Math.cos(a) * PORTAL_WIDTH * 0.5 * scale,
      Math.sin(a) * PORTAL_HEIGHT * 0.5 * scale,
      0,
    ));
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false }),
  );
}

function createPortalMaterial(color, target) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tView: { value: target.texture },
      accent: { value: new THREE.Color(color) },
      time: { value: 0 },
      linked: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tView;
      uniform vec3 accent;
      uniform float time;
      uniform float linked;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float radius = length(p);
        if (radius > 1.0) discard;

        float edge = smoothstep(0.73, 1.0, radius);
        float scan = sin((p.y + time * 0.17) * 240.0) * 0.018;
        float grain = (hash(floor(vUv * 360.0) + floor(time * 18.0)) - 0.5) * 0.035;
        vec2 warped = vUv + normalize(p + 0.0001) * sin(radius * 22.0 - time * 3.2) * 0.006 * edge;
        vec3 viewColor = texture2D(tView, warped).rgb;
        vec3 idle = vec3(0.005, 0.009, 0.008) + accent * (0.045 + 0.035 * sin(radius * 20.0 - time * 2.0));
        vec3 color = mix(idle, viewColor, linked);
        color += accent * (pow(edge, 3.0) * 0.46 + scan + grain);
        float alpha = smoothstep(1.0, 0.94, radius);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
    toneMapped: false,
  });
}

function createPortal(scene, renderer, key, color) {
  const target = new THREE.WebGLRenderTarget(384, 640, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    colorSpace: THREE.SRGBColorSpace,
  });
  const group = new THREE.Group();
  group.visible = false;
  group.renderOrder = 30;

  const inner = new THREE.Mesh(new THREE.PlaneGeometry(PORTAL_WIDTH, PORTAL_HEIGHT, 1, 1), createPortalMaterial(color, target));
  inner.renderOrder = 30;
  group.add(inner);

  const rim = createEllipseLine(color, 1);
  rim.position.z = 0.012;
  rim.material.linewidth = 2;
  rim.renderOrder = 31;
  group.add(rim);

  const echo = createEllipseLine(color, 1.045);
  echo.position.z = 0.009;
  echo.material.opacity = 0.24;
  echo.renderOrder = 31;
  group.add(echo);

  const nodes = new THREE.Group();
  const nodeGeometry = new THREE.SphereGeometry(0.025, 6, 4);
  const nodeMaterial = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
    node.position.set(Math.cos(a) * PORTAL_WIDTH * 0.52, Math.sin(a) * PORTAL_HEIGHT * 0.52, 0.02);
    nodes.add(node);
  }
  group.add(nodes);
  scene.add(group);

  return {
    key,
    color,
    target,
    group,
    inner,
    rim,
    echo,
    nodes,
    active: false,
    surface: null,
    position: new THREE.Vector3(),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(0, 0, 1),
    halfWidth: PORTAL_WIDTH * 0.5,
    halfHeight: PORTAL_HEIGHT * 0.5,
  };
}

export class PortalSystem {
  constructor(scene, renderer, mainCamera, audio) {
    this.scene = scene;
    this.renderer = renderer;
    this.mainCamera = mainCamera;
    this.audio = audio;
    this.cyan = createPortal(scene, renderer, 'cyan', 0x36dcff);
    this.amber = createPortal(scene, renderer, 'amber', 0xff9b36);
    this.virtualCamera = new THREE.PerspectiveCamera(70, PORTAL_WIDTH / PORTAL_HEIGHT, 0.08, 90);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 80;
    this.time = 0;
    this.lastFailure = '';
  }

  get bothActive() { return this.cyan.active && this.amber.active; }

  getPair(kind) {
    return kind === 'cyan' ? [this.cyan, this.amber] : [this.amber, this.cyan];
  }

  aim(camera, surfaces) {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    return this.raycaster.intersectObjects(surfaces, false)[0] || null;
  }

  place(kind, hit) {
    const [portal, other] = this.getPair(kind);
    if (!hit?.object?.userData?.portalSurface) {
      this.lastFailure = '该表面无法稳定空间锚点';
      this.audio?.deny();
      return { ok: false, reason: this.lastFailure };
    }

    const surface = hit.object;
    const { width, height } = surface.userData.portalSurface;
    tmpLocal.copy(hit.point);
    surface.worldToLocal(tmpLocal);
    clampPortalPoint(tmpLocal, width, height, portal.halfWidth, portal.halfHeight, tmpLocal);
    tmpWorld.copy(tmpLocal);
    surface.localToWorld(tmpWorld);

    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(surface.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(surface.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(surface.getWorldQuaternion(new THREE.Quaternion())).normalize();

    if (other.active && other.surface === surface) {
      const d = tmpWorld.distanceTo(other.position);
      if (d < PORTAL_HEIGHT * 0.92) {
        this.lastFailure = '两个锚点距离过近';
        this.audio?.deny();
        return { ok: false, reason: this.lastFailure };
      }
    }

    portal.active = true;
    portal.surface = surface;
    portal.position.copy(tmpWorld).addScaledVector(normal, 0.028);
    portal.right.copy(right);
    portal.up.copy(up);
    portal.normal.copy(normal);
    portal.group.position.copy(portal.position);
    portal.group.quaternion.copy(surface.getWorldQuaternion(new THREE.Quaternion()));
    portal.group.visible = true;
    portal.inner.material.uniforms.linked.value = this.bothActive ? 1 : 0;
    other.inner.material.uniforms.linked.value = this.bothActive ? 1 : 0;
    this.audio?.shoot(kind);
    this.lastFailure = '';
    return { ok: true, portal };
  }

  reset() {
    for (const portal of [this.cyan, this.amber]) {
      portal.active = false;
      portal.surface = null;
      portal.group.visible = false;
      portal.inner.material.uniforms.linked.value = 0;
    }
  }

  update(dt) {
    this.time += dt;
    for (const [index, portal] of [this.cyan, this.amber].entries()) {
      portal.inner.material.uniforms.time.value = this.time + index * 0.77;
      portal.inner.material.uniforms.linked.value = this.bothActive ? 1 : 0;
      portal.nodes.rotation.z += dt * (index ? -0.24 : 0.24);
      const pulse = 1 + Math.sin(this.time * 3.1 + index) * 0.008;
      portal.echo.scale.setScalar(pulse);
      portal.echo.material.opacity = this.bothActive ? 0.34 : 0.16;
    }
  }

  tryTeleport(body, nextPosition) {
    if (!this.bothActive || body.portalCooldown > 0) return null;
    for (const entry of [this.cyan, this.amber]) {
      const exit = entry === this.cyan ? this.amber : this.cyan;
      if (!crossingPortal(body.position, nextPosition, entry, body.halfExtents, body.velocity)) continue;

      tmpLocal.subVectors(body.position, entry.position);
      const localX = tmpLocal.dot(entry.right);
      const localY = tmpLocal.dot(entry.up);
      const exitSupport = supportAlongNormal(body.halfExtents, exit.normal);
      body.position.copy(exit.position)
        .addScaledVector(exit.right, -localX)
        .addScaledVector(exit.up, localY)
        .addScaledVector(exit.normal, exitSupport + 0.1);
      mapVectorThroughPortal(body.velocity, entry, exit, body.velocity);
      body.portalCooldown = 0.18;
      this.audio?.teleport();
      return { entry, exit };
    }
    return null;
  }

  transformDirection(direction, entry, exit, target = new THREE.Vector3()) {
    return mapVectorThroughPortal(direction, entry, exit, target).normalize();
  }

  renderViews(scene, camera) {
    if (!this.bothActive) return;
    const previousTarget = this.renderer.getRenderTarget();
    const previousXr = this.renderer.xr.enabled;
    this.renderer.xr.enabled = false;

    for (const [entry, exit] of [[this.cyan, this.amber], [this.amber, this.cyan]]) {
      tmpLocal.subVectors(camera.position, entry.position);
      const lx = tmpLocal.dot(entry.right);
      const ly = tmpLocal.dot(entry.up);
      const lz = Math.max(0.08, Math.abs(tmpLocal.dot(entry.normal)));
      this.virtualCamera.position.copy(exit.position)
        .addScaledVector(exit.right, -lx)
        .addScaledVector(exit.up, ly)
        .addScaledVector(exit.normal, lz);

      camera.getWorldDirection(tmpForward);
      mapVectorThroughPortal(tmpForward, entry, exit, tmpForward).normalize();
      tmpUp.copy(camera.up).applyQuaternion(camera.quaternion);
      mapVectorThroughPortal(tmpUp, entry, exit, tmpUp).normalize();
      this.virtualCamera.up.copy(tmpUp);
      this.virtualCamera.lookAt(tmpWorld.copy(this.virtualCamera.position).add(tmpForward));
      this.virtualCamera.fov = camera.fov;
      this.virtualCamera.aspect = PORTAL_WIDTH / PORTAL_HEIGHT;
      this.virtualCamera.updateProjectionMatrix();

      this.cyan.group.visible = false;
      this.amber.group.visible = false;
      this.renderer.setRenderTarget(entry.target);
      this.renderer.setClearColor(tmpColor.set(0x090d0c), 1);
      this.renderer.clear();
      this.renderer.render(scene, this.virtualCamera);
      this.cyan.group.visible = this.cyan.active;
      this.amber.group.visible = this.amber.active;
    }

    this.renderer.setRenderTarget(previousTarget);
    this.renderer.xr.enabled = previousXr;
  }

  getState() {
    const serialize = (portal) => ({
      active: portal.active,
      surface: portal.surface?.userData?.portalSurface?.id || null,
      position: portal.active ? portal.position.toArray().map((v) => +v.toFixed(3)) : null,
      normal: portal.active ? portal.normal.toArray().map((v) => +v.toFixed(3)) : null,
    });
    return { cyan: serialize(this.cyan), amber: serialize(this.amber), linked: this.bothActive };
  }

  dispose() {
    for (const portal of [this.cyan, this.amber]) {
      portal.target.dispose();
      portal.group.traverse((object) => {
        object.geometry?.dispose?.();
        object.material?.dispose?.();
      });
    }
  }
}
