import * as THREE from 'three';

const SEMANTICS = ['idle', 'run', 'attack1', 'attack2', 'attack3', 'skill', 'hit', 'dodge', 'victory', 'defeat'];
const FALLBACK = { run: 'idle', attack1: 'idle', attack2: 'attack1', attack3: 'attack2', skill: 'attack3', hit: 'idle', dodge: 'run', victory: 'idle', defeat: 'hit' };
const ONCE = new Set(['attack1', 'attack2', 'attack3', 'skill', 'hit', 'dodge', 'victory', 'defeat']);

export const DEFAULT_ANIMATION_MAP = Object.freeze({
  idle: ['_bn01'], run: ['_br01'], attack1: ['_ba01'], attack2: ['_ba02', '_ba01'],
  attack3: ['_bs01', '_ba02'], skill: ['_bs02', '_bs01'], hit: ['_bd01', '_bd02'],
  dodge: ['_bg01'], victory: ['_bv01'], defeat: ['_fe01', '_bd03'],
});

const isGltf = value => Boolean(value?.scene?.isObject3D && Array.isArray(value.animations));
const getGltf = (value) => isGltf(value) ? value : ['gltf', 'asset', 'loaded', 'instance'].map(key => value?.[key]).find(isGltf);
const getMap = value => value?.animationMap || value?.actionMap
  || (value?.actions && !Array.isArray(value.actions) ? value.actions : null)
  || (value?.animations && !Array.isArray(value.animations) ? value.animations : null);

function normalizeForms(source, options) {
  if (isGltf(source)) return [{ gltf: source }];
  const values = Array.isArray(source) ? source : source?.forms;
  if (!values?.length) throw new TypeError('FighterView 需要 GLTF 或已加载的 forms');
  const configs = options.formConfigs || source?.formConfigs || [];
  return values.map((value, index) => {
    const gltf = getGltf(value) || getGltf(source?.gltfs?.[index]);
    if (!gltf) throw new TypeError(`第 ${index + 1} 个形态未加载，请使用 FighterView.create`);
    return { ...(configs[index] || {}), ...(isGltf(value) ? {} : value), gltf };
  });
}

function findClip(clips, query) {
  if (Array.isArray(query)) {
    for (const item of query) { const clip = findClip(clips, item); if (clip) return clip; }
    return null;
  }
  if (query?.isAnimationClip) return query;
  if (typeof query === 'number') return clips[query] || null;
  if (typeof query === 'function') return query(clips) || null;
  if (query instanceof RegExp) return clips.find(clip => query.test(clip.name)) || null;
  if (query && typeof query === 'object') return findClip(clips, query.name || query.suffix || query.includes || query.index);
  if (query == null) return null;
  const name = String(query).toLowerCase();
  return clips.find(clip => clip.name.toLowerCase() === name) || clips.find(clip => clip.name.toLowerCase().endsWith(name)) || null;
}

function prepareModel(model, targetHeight, rotationY, roughness, metalness) {
  const box = new THREE.Box3();
  const ownedMaterials = new Set();
  model.rotation.y = rotationY;
  model.updateMatrixWorld(true);
  model.traverse((object) => {
    if (!object.geometry) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.geometry.computeBoundingBox();
    if (object.geometry.boundingBox) box.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    const clone = source => {
      if (!source) return source;
      const material = source.clone();
      if (typeof material.roughness === 'number') material.roughness = Math.max(roughness, material.roughness);
      if (typeof material.metalness === 'number') material.metalness = Math.min(metalness, material.metalness);
      ownedMaterials.add(material);
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
  });
  if (box.isEmpty()) box.setFromObject(model);
  const scale = targetHeight / Math.max(0.1, box.max.y - box.min.y);
  model.scale.setScalar(scale);
  model.position.y = -box.min.y * scale;
  return { scale, ownedMaterials };
}

function disposeModel(model, disposeTextures) {
  const geometry = new Set(), material = new Set(), texture = new Set();
  model.traverse(object => {
    if (object.geometry) geometry.add(object.geometry);
    for (const item of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!item) continue;
      material.add(item);
      if (disposeTextures) for (const value of Object.values(item)) if (value?.isTexture) texture.add(value);
    }
  });
  geometry.forEach(item => item.dispose());
  material.forEach(item => item.dispose());
  texture.forEach(item => item.dispose());
}

export class FighterView {
  constructor(source, options = {}) {
    const {
      accent = 0x2eeaff, targetHeight = 2.4, player = false, initialForm = 0,
      materialRoughness = 0.55, materialMetalness = 0.1, modelRotationY = 0,
      transitionDuration = 0.1, disposeUnmanaged = true, onFormChange,
    } = options;
    this.root = new THREE.Group();
    this.modelRoot = new THREE.Group();
    this.root.add(this.modelRoot);
    this.player = player;
    this.transitionDuration = transitionDuration;
    this.disposeUnmanaged = disposeUnmanaged;
    this.onFormChange = onFormChange;
    this.disposed = false;
    const globalMap = { ...DEFAULT_ANIMATION_MAP, ...(getMap(source) || {}), ...(options.animationMap || {}) };
    const formMaps = options.animationMaps || source?.animationMaps || {};
    this.forms = normalizeForms(source, options).map((form, index) => {
      const id = form.id || form.en || form.name || `form-${index}`;
      const height = form.targetHeight ?? form.height ?? targetHeight;
      const prepared = prepareModel(form.gltf.scene, height, form.modelRotationY ?? modelRotationY, materialRoughness, materialMetalness);
      const group = new THREE.Group();
      group.visible = false;
      group.add(form.gltf.scene);
      this.modelRoot.add(group);
      const mixer = new THREE.AnimationMixer(form.gltf.scene);
      const mapping = { ...globalMap, ...(formMaps[index] || formMaps[id] || {}), ...(getMap(form) || {}) };
      const resolved = {}, actions = {};
      for (const semantic of SEMANTICS) {
        const clip = findClip(form.gltf.animations, mapping[semantic]) || resolved[FALLBACK[semantic]] || form.gltf.animations[0] || null;
        resolved[semantic] = clip;
        actions[semantic] = clip ? mixer.clipAction(clip) : null;
      }
      const release = form.release || form.gltf.release;
      return { ...form, index, id, group, model: form.gltf.scene, mixer, mapping, actions, resolvedClips: resolved, release, managed: Boolean(release || form.gltf.managed), ...prepared, currentAction: null, currentSemantic: null };
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.82, 32), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.035;
    this.root.add(this.ring);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.76, 32), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.root.add(this.shadow);
    this.formIndex = -1;
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.setForm(initialForm, { force: true });
  }

  static async create(assetManager, character, options = {}) {
    if (!assetManager?.loadMatch || !assetManager?.acquire) throw new TypeError('需要 AssetManager 实例');
    const { onProgress, signal, ...viewOptions } = options;
    await assetManager.loadMatch([character], { onProgress, signal });
    const handles = [];
    try {
      for (const form of character.forms) handles.push(await assetManager.acquire(form.model, { signal }));
      const forms = character.forms.map((form, index) => ({ ...form, gltf: handles[index], release: handles[index].release }));
      return new FighterView({ forms, animationMap: getMap(character), animationMaps: character.animationMaps }, viewOptions);
    } catch (error) {
      handles.forEach(handle => handle.release());
      throw error;
    }
  }

  static fromCharacter(assetManager, character, options) { return FighterView.create(assetManager, character, options); }
  get formCount() { return this.forms.length; }
  get activeForm() { return this.forms[this.formIndex] || null; }

  resolveForm(value) {
    if (Number.isInteger(value)) return value;
    if (typeof value !== 'string') return -1;
    if (/^\d+$/.test(value)) return Number(value);
    const key = value.toLowerCase();
    return this.forms.findIndex(form => [form.id, form.name, form.en].some(item => String(item).toLowerCase() === key));
  }

  setForm(value, { force = false, playIdle = true } = {}) {
    const index = this.resolveForm(value);
    if (this.disposed || index < 0 || index >= this.forms.length || (!force && index === this.formIndex)) return false;
    const previousIndex = this.formIndex, previousForm = this.activeForm;
    if (previousForm) {
      previousForm.mixer.stopAllAction();
      previousForm.group.visible = false;
      previousForm.currentAction = previousForm.currentSemantic = null;
    }
    const form = this.forms[index];
    form.group.visible = true;
    this.formIndex = index;
    this.model = form.model;
    this.mixer = form.mixer;
    this.actions = form.actions;
    this.current = null;
    if (playIdle) this.play('idle', true);
    const event = { index, previousIndex, form, previousForm };
    this.onFormChange?.(event);
    this.root.dispatchEvent({ type: 'formchange', ...event });
    return true;
  }

  nextForm(options) { return this.setForm(Math.min(this.formCount - 1, this.formIndex + 1), options); }

  play(name, force = false) {
    const form = this.activeForm, semantic = form?.actions[name] ? name : 'idle', next = form?.actions[semantic];
    if (!next || (!force && next === form.currentAction && semantic === form.currentSemantic)) return next || null;
    const previous = form.currentAction;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(form.timeScales?.[semantic] ?? form.timeScale ?? (semantic === 'run' ? 1.25 : 1));
    next.setLoop(ONCE.has(semantic) ? THREE.LoopOnce : THREE.LoopRepeat, ONCE.has(semantic) ? 1 : Infinity);
    next.clampWhenFinished = ONCE.has(semantic);
    next.play();
    if (previous && previous !== next) previous.crossFadeTo(next, this.transitionDuration, false);
    form.currentAction = this.current = next;
    form.currentSemantic = semantic;
    return next;
  }

  sync(state, dt, time, winner) {
    if (!state || this.disposed) return;
    const requested = state.formIndex ?? state.evolutionStage ?? state.form;
    if (requested != null) this.setForm(requested);
    this.root.position.set(state.x ?? 0, state.y ?? 0, state.z ?? 0);
    this.root.rotation.y = state.yaw ?? 0;
    this.root.scale.setScalar(state.overdrive > 0 ? 1 + Math.sin(time * 14) * 0.025 : 1);
    this.ring.material.opacity = state.invulnerable > 0 ? 0.95 : 0.48 + Math.sin(time * 4) * 0.14;
    this.ring.material.color.setHex(state.overdrive > 0 ? 0xfff066 : (this.player ? 0x2eeaff : 0xff6b26));
    this.ring.rotation.z += dt * (state.overdrive > 0 ? 4 : 0.8);
    this.shadow.scale.setScalar(1 - Math.min((state.y ?? 0) / 6, 0.55));
    if (winner) this.play(winner === state.id ? 'victory' : 'defeat');
    else if (state.action === 'attack') this.play(`attack${state.comboStep || 1}`);
    else this.play({ skill: 'skill', hit: 'hit', dodge: 'dodge', run: 'run' }[state.action] || 'idle');
    this.activeForm?.mixer.update(dt);
  }

  dispose({ disposeUnmanaged = this.disposeUnmanaged } = {}) {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const form of this.forms) {
      form.mixer.stopAllAction();
      form.mixer.uncacheRoot(form.model);
      if (form.managed || !disposeUnmanaged) form.ownedMaterials.forEach(item => item.dispose());
      else disposeModel(form.model, true);
      form.release?.();
    }
    this.ring.geometry.dispose(); this.ring.material.dispose();
    this.shadow.geometry.dispose(); this.shadow.material.dispose();
    this.root.clear();
    this.forms.length = 0;
    this.formIndex = -1;
    this.model = this.mixer = this.current = null;
    this.actions = {};
  }
}
