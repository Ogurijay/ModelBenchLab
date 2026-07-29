import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

function createAbortError() {
  const error = new Error('资源加载已取消');
  error.name = 'AbortError';
  return error;
}

function waitWithSignal(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    const abort = () => reject(createAbortError());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function isAbsoluteUrl(url) {
  return /^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:');
}

function readModelUrl(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  return value.model || value.url || value.assetUrl || null;
}

function collectMaterialTextures(material, textures) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) textures.add(value);
  }
  for (const uniform of Object.values(material.uniforms || {})) {
    const value = uniform?.value;
    if (value?.isTexture) textures.add(value);
    if (Array.isArray(value)) value.filter(item => item?.isTexture).forEach(item => textures.add(item));
  }
}

function disposeGltf(gltf) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const scenes = gltf?.scenes?.length ? gltf.scenes : [gltf?.scene];

  for (const scene of scenes) {
    scene?.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) {
        if (!material) continue;
        materials.add(material);
        collectMaterialTextures(material, textures);
      }
    });
  }

  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}

export class AssetLoadError extends Error {
  constructor(url, cause) {
    const reason = cause?.message ? `：${cause.message}` : '';
    super(`无法加载 3D 资源 ${url}${reason}`, { cause });
    this.name = 'AssetLoadError';
    this.url = url;
  }
}

/**
 * 从参战角色配置中提取本局需要的模型地址。
 * 默认收集每名角色的全部形态，以保证战斗中进化时不再等待网络。
 */
export function collectMatchModelUrls(fighters, { formIndices = 'all' } = {}) {
  const urls = [];
  const seen = new Set();
  const selected = formIndices === 'all' || formIndices == null
    ? null
    : new Set(Array.isArray(formIndices) ? formIndices : [formIndices]);

  const add = (url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };

  for (const fighter of Array.isArray(fighters) ? fighters : [fighters]) {
    if (!fighter) continue;
    const directUrl = readModelUrl(fighter);
    if (directUrl) add(directUrl);

    if (!Array.isArray(fighter.forms)) continue;
    fighter.forms.forEach((form, index) => {
      if (!selected || selected.has(index)) add(readModelUrl(form));
    });
  }

  return urls;
}

/**
 * GLB 按需加载器：网络与解析结果去重缓存，实际出场时再克隆骨骼实例。
 */
export class AssetManager {
  constructor({ loader = new GLTFLoader(), basePath = '' } = {}) {
    this.loader = loader;
    this.basePath = basePath;
    this.cache = new Map();
    this.errors = new Map();
  }

  resolve(url) {
    if (typeof url !== 'string' || !url.trim()) throw new TypeError('模型 URL 不能为空');
    const cleanUrl = url.trim().replaceAll('\\', '/');
    if (!this.basePath || isAbsoluteUrl(cleanUrl)) return cleanUrl;
    return `${this.basePath.replace(/\/$/, '')}/${cleanUrl.replace(/^\.\//, '').replace(/^\//, '')}`;
  }

  has(url) {
    return this.cache.get(this.resolve(url))?.status === 'loaded';
  }

  get(url) {
    return this.cache.get(this.resolve(url))?.gltf || null;
  }

  getError(url) {
    return this.errors.get(this.resolve(url)) || null;
  }

  get stats() {
    const entries = [...this.cache.values()];
    return {
      cached: entries.filter(entry => entry.status === 'loaded').length,
      loading: entries.filter(entry => entry.status === 'loading').length,
      references: entries.reduce((sum, entry) => sum + entry.references, 0),
      errors: this.errors.size,
    };
  }

  _progressEvent(entry, phase, extra = {}) {
    return {
      phase,
      url: entry.url,
      loaded: entry.loaded,
      total: entry.total,
      progress: entry.status === 'loaded' ? 1 : entry.progress,
      cached: false,
      ...extra,
    };
  }

  _emit(entry, phase, extra) {
    const event = this._progressEvent(entry, phase, extra);
    for (const listener of entry.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('AssetManager 进度回调执行失败', error);
      }
    }
  }

  _startLoad(url) {
    const entry = {
      url,
      status: 'loading',
      gltf: null,
      error: null,
      loaded: 0,
      total: 0,
      progress: 0,
      references: 0,
      pendingDispose: false,
      listeners: new Set(),
      promise: null,
    };

    entry.promise = new Promise((resolve, reject) => {
      const complete = (gltf) => {
        entry.status = 'loaded';
        entry.gltf = gltf;
        entry.progress = 1;
        entry.loaded = entry.total || entry.loaded;
        this.errors.delete(url);
        this._emit(entry, 'complete');
        resolve(gltf);
        if (entry.pendingDispose && entry.references === 0) queueMicrotask(() => this.unload(url));
      };

      const progress = (event) => {
        entry.loaded = Number.isFinite(event?.loaded) ? event.loaded : entry.loaded;
        entry.total = Number.isFinite(event?.total) ? event.total : entry.total;
        entry.progress = entry.total > 0 ? Math.min(1, entry.loaded / entry.total) : 0;
        this._emit(entry, 'progress');
      };

      const fail = (cause) => {
        const error = cause instanceof AssetLoadError ? cause : new AssetLoadError(url, cause);
        entry.status = 'error';
        entry.error = error;
        this.errors.set(url, error);
        if (this.cache.get(url) === entry) this.cache.delete(url);
        this._emit(entry, 'error', { error });
        reject(error);
      };

      try {
        this.loader.load(url, complete, progress, fail);
      } catch (error) {
        fail(error);
      }
    });

    this.cache.set(url, entry);
    return entry;
  }

  async load(url, { onProgress, signal } = {}) {
    const resolvedUrl = this.resolve(url);
    let entry = this.cache.get(resolvedUrl);
    const cached = entry?.status === 'loaded';
    if (!entry) entry = this._startLoad(resolvedUrl);

    if (onProgress) {
      entry.listeners.add(onProgress);
      onProgress(this._progressEvent(entry, cached ? 'complete' : 'start', { cached }));
    }

    try {
      return await waitWithSignal(entry.promise, signal);
    } finally {
      if (onProgress) entry.listeners.delete(onProgress);
    }
  }

  async loadMatch(fighters, { onProgress, signal, formIndices = 'all' } = {}) {
    const urls = collectMatchModelUrls(fighters, { formIndices }).map(url => this.resolve(url));
    const state = new Map(urls.map(url => [url, { progress: 0, loaded: 0, total: 0 }]));

    const emit = (phase, url = null, asset = null, error = null) => {
      if (!onProgress) return;
      const values = [...state.values()];
      const completed = values.filter(item => item.progress >= 1).length;
      const aggregate = values.length
        ? values.reduce((sum, item) => sum + item.progress, 0) / values.length
        : 1;
      try {
        onProgress({
          phase,
          url,
          asset,
          error,
          progress: aggregate,
          completed,
          totalAssets: values.length,
          loaded: values.reduce((sum, item) => sum + item.loaded, 0),
          total: values.reduce((sum, item) => sum + item.total, 0),
        });
      } catch (callbackError) {
        console.error('AssetManager 对局进度回调执行失败', callbackError);
      }
    };

    emit('start');
    const pairs = await Promise.all(urls.map(async (url) => {
      try {
        const gltf = await this.load(url, {
          signal,
          onProgress: (asset) => {
            const item = state.get(url);
            item.loaded = asset.loaded;
            item.total = asset.total;
            item.progress = asset.progress;
            emit('progress', url, asset);
          },
        });
        state.get(url).progress = 1;
        emit('progress', url);
        return [url, gltf];
      } catch (error) {
        emit('error', url, null, error);
        throw error;
      }
    }));
    emit('complete');
    return new Map(pairs);
  }

  preloadMatch(fighters, options) {
    return this.loadMatch(fighters, options);
  }

  async acquire(url, options) {
    const resolvedUrl = this.resolve(url);
    const source = await this.load(resolvedUrl, options);
    const entry = this.cache.get(resolvedUrl);
    if (!entry || entry.status !== 'loaded') throw new AssetLoadError(resolvedUrl, new Error('缓存条目在实例化前已失效'));

    let scene;
    try {
      scene = cloneSkeleton(source.scene);
    } catch (error) {
      throw new AssetLoadError(resolvedUrl, error);
    }

    entry.references += 1;
    let released = false;
    const handle = {
      scene,
      animations: source.animations || [],
      assetUrl: resolvedUrl,
      source,
      managed: true,
      release: () => {
        if (released) return;
        released = true;
        if (scene.parent) scene.parent.remove(scene);
        this._release(resolvedUrl);
      },
    };
    Object.defineProperty(handle, 'released', { get: () => released });
    return handle;
  }

  createInstance(url, options) {
    return this.acquire(url, options);
  }

  release(handleOrUrl) {
    if (handleOrUrl && typeof handleOrUrl === 'object' && typeof handleOrUrl.release === 'function') {
      handleOrUrl.release();
      return;
    }
    this._release(this.resolve(handleOrUrl));
  }

  _release(url) {
    const entry = this.cache.get(url);
    if (!entry) return;
    entry.references = Math.max(0, entry.references - 1);
    if (entry.references === 0 && entry.pendingDispose) this.unload(url);
  }

  unload(url, { force = false } = {}) {
    const resolvedUrl = this.resolve(url);
    const entry = this.cache.get(resolvedUrl);
    if (!entry) return true;
    if (entry.status === 'loading') {
      entry.pendingDispose = true;
      return false;
    }
    if (entry.references > 0 && !force) {
      entry.pendingDispose = true;
      return false;
    }

    if (entry.gltf) disposeGltf(entry.gltf);
    this.cache.delete(resolvedUrl);
    this.errors.delete(resolvedUrl);
    return true;
  }

  evictUnused() {
    let removed = 0;
    for (const [url, entry] of [...this.cache]) {
      if (entry.status === 'loaded' && entry.references === 0 && this.unload(url)) removed += 1;
    }
    return removed;
  }

  clear({ force = false } = {}) {
    let removed = 0;
    for (const url of [...this.cache.keys()]) {
      if (this.unload(url, { force })) removed += 1;
    }
    return removed;
  }

  dispose(options) {
    return this.clear(options);
  }
}
