// 特效系统:命中火花 / 冲击环 / 进化光柱 / 弹体拖尾 / KO 爆发。全部程序化贴图 + additive 混合。
import * as THREE from 'three';

function radialTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.6)'));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function starTex(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath();
  const spikes = 4, outer = size / 2, inner = size / 9;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    g[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX_GLOW = radialTex();
const TEX_STAR = starTex();

export class FxSystem {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.live = [];
    this.shake = 0;
    this.flashEl = null;
  }

  _sprite(tex, color, blending = THREE.AdditiveBlending) {
    let s = this.pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, blending,
      }));
    }
    s.material.map = tex;
    s.material.color.set(color);
    s.material.opacity = 1;
    s.material.rotation = Math.random() * Math.PI * 2;
    s.visible = true;
    this.scene.add(s);
    return s;
  }

  _emit(opts) {
    const s = this._sprite(opts.tex || TEX_GLOW, opts.color ?? 0xffffff);
    s.position.copy(opts.pos);
    const item = {
      s, t: 0, life: opts.life ?? 0.4,
      vel: opts.vel || new THREE.Vector3(),
      grow: opts.grow ?? 0,
      size0: opts.size ?? 0.5,
      gravity: opts.gravity ?? 0,
      fade: opts.fade ?? true,
      spin: opts.spin ?? 0,
    };
    s.scale.setScalar(item.size0);
    this.live.push(item);
    return item;
  }

  // 普通命中:火花星 + 短闪
  hitSpark(pos, color = 0xffe066, heavy = false) {
    const n = heavy ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (heavy ? 5.5 : 3.2) * (0.4 + Math.random() * 0.8);
      this._emit({
        pos, tex: TEX_STAR, color,
        size: (heavy ? 0.5 : 0.32) * (0.6 + Math.random() * 0.7),
        vel: new THREE.Vector3(Math.cos(a) * sp, Math.sin(a) * sp + 1.5, (Math.random() - 0.5) * 1.5),
        life: 0.28 + Math.random() * 0.18, gravity: -9, spin: (Math.random() - 0.5) * 14,
      });
    }
    this._emit({ pos, color: 0xffffff, size: heavy ? 2.2 : 1.3, life: 0.14, grow: heavy ? 9 : 5 });
    if (heavy) this.shake = Math.max(this.shake, 0.32);
    else this.shake = Math.max(this.shake, 0.1);
  }

  // 防御成功:蓝白六边形感光盾
  guardSpark(pos) {
    this._emit({ pos, color: 0x88ddff, size: 1.1, life: 0.18, grow: 4 });
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      this._emit({
        pos, tex: TEX_STAR, color: 0x88ddff, size: 0.22,
        vel: new THREE.Vector3(Math.cos(a) * 2, Math.sin(a) * 2 + 1, 0),
        life: 0.25, gravity: -6,
      });
    }
  }

  // 弹体命中爆炸
  explosion(pos, color, big = false) {
    const n = big ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = Math.random() * Math.PI - Math.PI / 2;
      const sp = (big ? 6 : 3.5) * (0.3 + Math.random());
      this._emit({
        pos, color, size: (big ? 0.7 : 0.4) * (0.5 + Math.random()),
        vel: new THREE.Vector3(Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 2, Math.sin(a) * Math.cos(el) * sp),
        life: 0.35 + Math.random() * 0.25, gravity: -7,
      });
    }
    this._emit({ pos, color: 0xffffff, size: big ? 3 : 1.6, life: 0.16, grow: big ? 14 : 7 });
    this._emit({ pos, color, size: big ? 2 : 1.2, life: 0.3, grow: big ? 8 : 4 });
    this.shake = Math.max(this.shake, big ? 0.4 : 0.16);
  }

  // 数码进化:光柱 + 数据环上升
  evolutionBurst(target) {
    const pos = target.clone();
    pos.y += 0.2;
    // 白闪大爆发
    this._emit({ pos: pos.clone().setY(pos.y + 1), color: 0xffffff, size: 3, life: 0.5, grow: 16 });
    // 光柱粒子持续上升
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.7;
      this._emit({
        pos: new THREE.Vector3(pos.x + Math.cos(a) * r, pos.y + Math.random() * 0.4, pos.z + Math.sin(a) * r),
        color: Math.random() > 0.5 ? 0x66e0ff : 0xaaffee,
        size: 0.24 + Math.random() * 0.3,
        vel: new THREE.Vector3(0, 3.5 + Math.random() * 4.5, 0),
        life: 0.9 + Math.random() * 0.9,
      });
    }
    // 数据环(0/1 感的星点圈,分层上升)
    for (let ring = 0; ring < 4; ring++) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        this._emit({
          pos: new THREE.Vector3(pos.x + Math.cos(a) * 1.1, pos.y + ring * 0.5, pos.z + Math.sin(a) * 1.1),
          tex: TEX_STAR, color: 0x88ffdd, size: 0.2,
          vel: new THREE.Vector3(Math.cos(a) * 0.4, 2.6, Math.sin(a) * 0.4),
          life: 1.1, spin: 6,
        });
      }
    }
    this.shake = Math.max(this.shake, 0.35);
  }

  // KO 大爆发
  koBurst(pos) {
    this.explosion(pos, 0xffcc44, true);
    this.explosion(pos, 0xff6644, true);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      this._emit({
        pos, tex: TEX_STAR, color: 0xffee88, size: 0.6,
        vel: new THREE.Vector3(Math.cos(a) * 9, Math.sin(a) * 9, 0),
        life: 0.5, spin: 10,
      });
    }
    this.shake = 0.8;
  }

  // 跳跃/落地尘土
  dust(pos, n = 5) {
    for (let i = 0; i < n; i++) {
      this._emit({
        pos: new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.6, pos.y + 0.08, pos.z),
        color: 0xccbbaa, size: 0.3 + Math.random() * 0.25,
        vel: new THREE.Vector3((Math.random() - 0.5) * 2.4, 0.8 + Math.random(), (Math.random() - 0.5) * 0.8),
        life: 0.4, grow: 1.4,
      });
    }
  }

  // 弹体飞行拖尾(由 battle 每帧调用)
  trail(pos, color, size = 0.3) {
    this._emit({
      pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, 0)),
      color, size, life: 0.28, grow: -1.2,
    });
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const it = this.live[i];
      it.t += dt;
      if (it.t >= it.life) {
        it.s.visible = false;
        this.scene.remove(it.s);
        this.pool.push(it.s);
        this.live.splice(i, 1);
        continue;
      }
      const k = it.t / it.life;
      it.vel.y += it.gravity * dt;
      it.s.position.addScaledVector(it.vel, dt);
      const sc = Math.max(0.01, it.size0 + it.grow * it.t);
      it.s.scale.setScalar(sc);
      if (it.fade) it.s.material.opacity = 1 - k * k;
      if (it.spin) it.s.material.rotation += it.spin * dt;
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }
}

export { TEX_GLOW, TEX_STAR };
