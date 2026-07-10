// 雷暴闪电:锯齿主干 + 分支管状几何,优先击中城市制高点(地标尖顶);
// 天空闪光联动;WebAudio 程序化合成雷声,按真实声速(340m/s)延迟到达。
import * as THREE from 'three';
import { Rng } from '../core/prng.js';

export function createLightning(scene, sky) {
  const rng = new Rng(313373);
  const bolts = [];
  let timer = 3;
  let flash = 0;
  let audioCtx = null;
  let noiseBuf = null;
  let getTargets = () => [];

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const len = audioCtx.sampleRate * 2.2;
      noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        // 布朗噪声:低频隆隆
        const white = Math.random() * 2 - 1;
        last = (last + 0.021 * white) / 1.021;
        d[i] = last * 4.2;
      }
    } catch { audioCtx = null; }
  }

  function playThunder(delay, loud) {
    if (!audioCtx || audioCtx.state === 'closed') return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime + delay;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuf;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(520, t0);
    lp.frequency.exponentialRampToValueAtTime(75, t0 + 1.9);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.02, 0.5 * loud), t0 + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.1);
    src.connect(lp).connect(g).connect(audioCtx.destination);
    src.start(t0);
    src.stop(t0 + 2.2);
  }

  function jaggedCurve(from, to, spread, segs) {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = new THREE.Vector3().lerpVectors(from, to, t);
      const w = Math.sin(t * Math.PI) * spread;
      p.x += rng.range(-w, w);
      p.z += rng.range(-w, w);
      pts.push(p);
    }
    return new THREE.CatmullRomCurve3(pts);
  }

  function strike(camera) {
    const targets = getTargets();
    let tx, ty, tz;
    if (targets.length && rng.chance(0.72)) {
      const g = targets[rng.int(0, targets.length - 1)];
      tx = g.x; ty = g.y; tz = g.z;
    } else {
      tx = rng.range(-240, 240); tz = rng.range(-540, 540); ty = 30;
    }
    const top = new THREE.Vector3(tx + rng.range(-90, 90), 400, tz + rng.range(-90, 90));
    const hit = new THREE.Vector3(tx, ty, tz);

    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xe8efff, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const main = new THREE.Mesh(new THREE.TubeGeometry(jaggedCurve(top, hit, 26, 15), 48, 0.55, 5), mat);
    group.add(main);
    // 分支
    const midT = rng.range(0.35, 0.6);
    const mid = new THREE.Vector3().lerpVectors(top, hit, midT);
    const bEnd = mid.clone().add(new THREE.Vector3(rng.range(-70, 70), -rng.range(40, 90), rng.range(-70, 70)));
    const branch = new THREE.Mesh(new THREE.TubeGeometry(jaggedCurve(mid, bEnd, 14, 8), 24, 0.28, 4), mat);
    group.add(branch);
    scene.add(group);
    bolts.push({ group, mat, age: 0 });

    flash = 1;
    const dist = camera.position.distanceTo(hit);
    playThunder(dist / 340, 1 / (1 + dist / 420));
  }

  return {
    initAudio,
    setTargets(fn) { getTargets = fn; },
    dispose() {
      for (const b of bolts) {
        scene.remove(b.group);
        b.group.traverse((o) => o.geometry && o.geometry.dispose());
        b.mat.dispose();
      }
      bolts.length = 0;
    },
    update(dt, boltLevel, camera) {
      flash = Math.max(0, flash - dt * 5.2);
      sky.setFlash(flash * 0.55);

      if (boltLevel > 0.4) {
        timer -= dt * boltLevel;
        if (timer <= 0) {
          strike(camera);
          timer = rng.range(2.2, 7.5);
        }
      }
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.age += dt;
        b.mat.opacity = Math.max(0, 1 - b.age / 0.26);
        if (b.age > 0.26) {
          scene.remove(b.group);
          b.group.traverse((o) => o.geometry && o.geometry.dispose());
          b.mat.dispose();
          bolts.splice(i, 1);
        }
      }
    },
  };
}
