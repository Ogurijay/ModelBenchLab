// Builder：静态几何的收集器。按「材质 × 120 m 分区」合并成少量网格（省 drawcall，又保住视锥剔除），
// box() 同时登记碰撞盒——渲染和碰撞同源，这是"看得见就挡得住、门洞就走得过"的保证。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo } from './geom.js';

const CHUNK = 120;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _box = new THREE.Box3();

function normalizeGeo(g) {
  let out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  out.morphAttributes = {};
  out.clearGroups();
  return out;
}

export class Builder {
  /**
   * @param ctx    共享上下文（需要 ctx.collision）
   * @param opts   { parent: Object3D, castShadow, receiveShadow, tag, chunk }
   */
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.parent = opts.parent || ctx.scene;
    this.castShadow = opts.castShadow ?? true;
    this.receiveShadow = opts.receiveShadow ?? true;
    this.tag = opts.tag || 'static';
    this.chunk = opts.chunk || CHUNK;
    this.buckets = new Map(); // key → { mat, geos: [] }
    this.tris = 0;
  }

  // 局部坐标系：push/pop 一个变换（先旋转再平移，用于"在原点建好再搬过去"）
  frame(x, y, z, ry = 0) {
    return new Frame(this, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)).clone(), _s), ry);
  }

  // 盒子：中心 (x, z)，底面 y，尺寸 w×h×d，绕 Y 旋转 ry。collide 默认 true。
  box(mat, x, y, z, w, h, d, opts = {}) {
    const ry = opts.ry || 0;
    const g = boxGeo(w, h, d);
    _m.compose(_p.set(x, y + h / 2, z), _q.setFromEuler(_e.set(opts.rx || 0, ry, opts.rz || 0)), _s);
    this.add(mat, g, _m);
    if (opts.collide !== false && !opts.rx && !opts.rz) {
      this.ctx.collision.add({ x, z, hx: w / 2, hz: d / 2, ry, y0: y, y1: y + h, tag: opts.tag || this.tag });
    }
  }

  // 只登记碰撞（例如屋顶下的看不见的挡板、楼梯的斜面近似）
  collider(x, y, z, w, h, d, ry = 0, tag = this.tag) {
    this.ctx.collision.add({ x, z, hx: w / 2, hz: d / 2, ry, y0: y, y1: y + h, tag });
  }

  // 任意几何：matrix 可选（会 clone 后变换）。不登记碰撞。
  add(mat, geometry, matrix) {
    if (!mat) throw new Error('Builder.add: 材质为空');
    let g = geometry;
    if (matrix) g = geometry.clone().applyMatrix4(matrix);
    g = normalizeGeo(g);
    g.computeBoundingBox();
    g.boundingBox.getCenter(_p);
    const key = `${mat.uuid}|${Math.floor(_p.x / this.chunk)},${Math.floor(_p.z / this.chunk)}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { mat, geos: [] }));
    b.geos.push(g);
    this.tris += g.attributes.position.count / 3;
  }

  // 把收集到的几何合并成网格，挂到 parent 下
  finish() {
    const meshes = [];
    for (const { mat, geos } of this.buckets.values()) {
      const merged = mergeGeometries(geos, false);
      if (!merged) {
        console.warn('mergeGeometries 失败', mat.name);
        continue;
      }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = this.castShadow && !mat.userData.noShadow && !mat.transparent;
      mesh.receiveShadow = this.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.parent.add(mesh);
      meshes.push(mesh);
      for (const g of geos) g.dispose();
    }
    this.buckets.clear();
    return meshes;
  }
}

// 局部坐标帧：fr.box(...) 里的坐标都是相对这个帧的
class Frame {
  constructor(builder, matrix, ry) {
    this.b = builder;
    this.m = matrix;
    this.ry = ry; // 显式记录：从矩阵反解欧拉角在 |ry|>90° 时会翻成 (π, ·, π)
  }
  toWorld(x, y, z) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.m);
  }
  box(mat, x, y, z, w, h, d, opts = {}) {
    const p = this.toWorld(x, y, z);
    this.b.box(mat, p.x, p.y, p.z, w, h, d, { ...opts, ry: this.ry + (opts.ry || 0) });
  }
  collider(x, y, z, w, h, d, ry = 0, tag) {
    const p = this.toWorld(x, y, z);
    this.b.collider(p.x, p.y, p.z, w, h, d, this.ry + ry, tag);
  }
  add(mat, geometry, localMatrix) {
    const m = localMatrix ? this.m.clone().multiply(localMatrix) : this.m;
    this.b.add(mat, geometry, m);
  }
  sub(x, y, z, ry = 0) {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), _s);
    return new Frame(this.b, this.m.clone().multiply(local), this.ry + ry);
  }
}

// 计算场景里某对象的世界包围盒（给悬浮检测、调试用）
export function worldBox(obj) {
  return _box.setFromObject(obj).clone();
}
