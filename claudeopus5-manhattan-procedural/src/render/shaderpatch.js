/**
 * @file src/render/shaderpatch.js
 * @description 全场景共享的环境 uniforms（积雪 / 湿滑 / 闪电）与材质注入器（契约 §3.7）。
 *
 * ---------------------------------------------------------------------------
 * 一、这个文件解决什么问题
 * ---------------------------------------------------------------------------
 * 城市里的路面、楼体、桥梁、公园地形分散在十几个模块里，各自建自己的材质。
 * 若每个模块自行处理"下雪变白 / 下雨反光 / 闪电补光"，既重复又不可能保持一致。
 * 因此本模块提供**一组共享 uniform 对象**（`createEnvUniforms()`）与**一个注入函数**
 * （`patchCityMaterial()`）：各模块把自己的材质丢进来，main.js 每帧只更新一次
 * uniform（`updateEnvUniforms()`），全城视觉即同步响应天气。
 *
 * uniform 对象是**按引用共享**的：`shader.uniforms.uWetness` 与 `env.uWetness`
 * 是同一个 `{ value }`，所以改 `env.uWetness.value` 会立刻影响所有已注入材质，
 * 无需遍历材质，也无需 `needsUpdate`。
 *
 * ---------------------------------------------------------------------------
 * 二、注入点（Three.js r185 的 ShaderChunk 名称，改版本时先核对这几处）
 * ---------------------------------------------------------------------------
 * 顶点着色器：
 *   1) `#include <common>`              → 追加 varying 声明
 *   2) `#include <defaultnormal_vertex>`→ 取 `transformedNormal`（**视图空间**法线），
 *                                         并 `#define CITY_TN_AVAILABLE`。
 *                                         注意 MeshBasicMaterial 把该 include 包在
 *                                         `#if defined(USE_ENVMAP)||defined(USE_SKINNING)`
 *                                         里，条件不成立时 `#define` 不会生效，
 *                                         下面的 `#ifdef` 分支会自动走回退路径。
 *   3) `#include <worldpos_vertex>`     → 计算世界坐标并写 varying。
 *                                         **不能直接用 chunk 里的 `worldPosition`**：
 *                                         它被 `#if defined(USE_ENVMAP)||...` 包着，
 *                                         多数情况下根本不存在。这里用 `transformed`
 *                                         自行乘 batchingMatrix / instanceMatrix /
 *                                         modelMatrix，完整兼容 InstancedMesh 与
 *                                         BatchedMesh（morph / skin 按任务要求不支持）。
 *   视图空间法线 → 世界空间：viewMatrix 上 3×3 是刚体旋转（正交阵），
 *   故 `worldN = transpose(mat3(viewMatrix)) * viewN`，GLSL 里等价写作
 *   `viewN * mat3(viewMatrix)`。
 *
 * 片元着色器：
 *   1) `#include <common>`              → 追加 uniform / varying / 噪声函数
 *   2) `#include <color_fragment>`      → 计算 citySnowMask / cityWetAmt / cityPuddle，
 *                                         并修改 `diffuseColor.rgb`
 *   3) `#include <roughnessmap_fragment>` → 修改 `roughnessFactor`（必须在此 include 之后，
 *                                           该变量在此才声明）
 *   4) `#include <metalnessmap_fragment>` → 修改 `metalnessFactor`（同上）
 *   5) `#include <emissivemap_fragment>`  → `totalEmissiveRadiance += 闪电补光`
 *   所有替换均为 `原 include 行 + 追加代码`，绝不删除原 include，不破坏 include 链。
 *   每处替换前都会检测 token 是否存在，缺失即跳过（兼容 MeshBasicMaterial 这类
 *   没有 roughness / metalness / emissive 的材质），保证"注入永不炸"。
 *
 * ---------------------------------------------------------------------------
 * 三、uniforms 语义（EnvUniforms）
 * ---------------------------------------------------------------------------
 *   uWetness   0..1  地面/朝上表面的湿润度。>0 时压暗反照率、拉低 roughness、
 *                    抬高 metalness，形成"湿沥青镜面"。由 weather.params.wetnessTarget 驱动。
 *   uSnowCover 0..1  积雪覆盖度。与表面朝上程度、材质 snowAmount、世界坐标噪声共同
 *                    决定 snowMask。由 weather.params.snowCoverTarget 驱动。
 *   uFlash     0..1  本帧闪电补光强度，直接加到自发光上（冷白偏蓝）。
 *   uTime      秒    全局时间（本文件不使用，供云 / 降水 / 水面等模块复用）。
 *   uNight     0..1  夜晚程度，仅用于把积雪反照率往月光冷蓝微调。
 *   uFogColor  Color 当前雾色（本文件不使用，供天空 / 云模块复用）。
 *                    **不做色彩空间转换**，与 weather.params.fogColor 的数值一致，
 *                    以免和 main.js 设的 scene.fog.color 对不上。
 *   uWindVec   Vec2  水平风矢量 (x = 东向分量, y = 取自世界 +Z 南向分量)，单位 m/s。
 *
 * ---------------------------------------------------------------------------
 * 四、排错提示
 * ---------------------------------------------------------------------------
 * - 材质没反应：确认调用了 `patchCityMaterial(mat, ctx0.env, ...)`，且 `env` 与
 *   main.js 每帧 `updateEnvUniforms` 用的是**同一个** env 对象。
 * - 视觉"串味"（A 材质用了 B 材质的雪量）：说明 `customProgramCacheKey` 失效。
 *   本文件已按 opts 生成唯一 key，若你手动改写了 `material.customProgramCacheKey`
 *   就会复现该问题。
 * - 二次注入：`material.userData.envPatched === true` 时直接返回，幂等安全。
 *   注入用到的 opts 签名记录在 `material.userData.envPatchKey`，方便排查。
 *
 * 契约差异说明（按 §0 要求就地记录，不改契约）：契约 §3.7-2 写的 varying 名为
 * `vWorldPos / vWorldNormal`，任务书要求 `vCityWorldPos / vCityWorldNormal`。
 * 这两个名字是**注入内部实现细节**，不构成跨模块接口，故采用带 `city` 前缀的版本，
 * 以免与其他模块（如云、天空）自己的 `vWorldPos` 撞名。
 */

import * as THREE from 'three';

/**
 * 各模块建材质时可参考的基准参数（契约 §3.7）。
 * @type {{ roughness: number, metalness: number }}
 */
export const CITY_MATERIAL_DEFAULTS = Object.freeze({ roughness: 0.85, metalness: 0.05 });

/** `patchCityMaterial` 的 opts 默认值。 */
const DEFAULT_OPTS = Object.freeze({
  snow: true,
  snowAmount: 1.0,
  wetness: true,
  wetDarken: 0.35,
  puddles: false,
  flash: true
});

/** 积雪反照率（干净新雪，日间）。 */
const SNOW_ALBEDO = 'vec3( 0.92, 0.94, 0.97 )';
/** 积雪反照率（夜间月光下的冷蓝偏移目标）。 */
const SNOW_ALBEDO_NIGHT = 'vec3( 0.74, 0.79, 0.90 )';

/**
 * 把值夹到 [0,1]，非有限数回落到 fallback。
 * @param {number} v
 * @param {number} [fallback=0]
 * @returns {number}
 */
function clamp01(v, fallback = 0) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 把值夹到 [min,max]，非有限数回落到 fallback。
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
function clampNum(v, min, max, fallback) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return v < min ? min : v > max ? max : v;
}

/**
 * 生成 GLSL 浮点字面量（保证带小数点，避免被当成 int）。
 * @param {number} v
 * @returns {string}
 */
function glslFloat(v) {
  return v.toFixed(5);
}

/**
 * 精确替换一次 `#include <xxx>`：把原行保留在前，追加代码在后。
 * @param {string} source 着色器源码
 * @param {string} token  形如 `#include <color_fragment>`
 * @param {string} addition 追加代码
 * @returns {{ source: string, ok: boolean }} ok=false 表示该 include 不存在（已安全跳过）
 */
function appendAfterInclude(source, token, addition) {
  if (source.indexOf(token) === -1) return { source, ok: false };
  // 用函数式 replacement，避免追加代码里出现 `$&` 之类的替换模式被误解析
  return { source: source.replace(token, () => `${token}\n${addition}`), ok: true };
}

/**
 * 创建一组全场景共享的环境 uniforms（契约 §3.7）。
 * 整个应用只应创建一次，放进 `ctx.env` 传给所有模块。
 * @returns {{
 *   uWetness:{value:number}, uSnowCover:{value:number}, uFlash:{value:number},
 *   uTime:{value:number}, uNight:{value:number},
 *   uFogColor:{value:THREE.Color}, uWindVec:{value:THREE.Vector2}
 * }}
 */
export function createEnvUniforms() {
  return {
    uWetness: { value: 0 },
    uSnowCover: { value: 0 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uNight: { value: 0 },
    uFogColor: { value: new THREE.Color(0.62, 0.68, 0.76) },
    uWindVec: { value: new THREE.Vector2(0, 0) }
  };
}

/**
 * 顶点着色器：varying 声明块。
 * @returns {string}
 */
function vertexParsChunk() {
  return [
    'varying vec3 vCityWorldPos;',
    'varying vec3 vCityWorldNormal;'
  ].join('\n');
}

/**
 * 顶点着色器：在 `#include <defaultnormal_vertex>` 之后暂存视图空间法线。
 * 用 `#define` 标记可用性——若该 include 被包在未成立的 `#if` 里（MeshBasicMaterial），
 * 预处理器不会执行这个 `#define`，后面自动走回退分支。
 * @returns {string}
 */
function vertexNormalGrabChunk() {
  return [
    '#define CITY_TN_AVAILABLE',
    '\tvec3 cityViewNormal_ = transformedNormal;'
  ].join('\n');
}

/**
 * 顶点着色器：在 `#include <worldpos_vertex>` 之后写出世界坐标与世界法线。
 * 世界坐标自行由 `transformed` 推导，兼容 InstancedMesh / BatchedMesh。
 * @returns {string}
 */
function vertexWorldChunk() {
  return [
    '\tvec4 cityWorldPos_ = vec4( transformed, 1.0 );',
    '\t#ifdef USE_BATCHING',
    '\t\tcityWorldPos_ = batchingMatrix * cityWorldPos_;',
    '\t#endif',
    '\t#ifdef USE_INSTANCING',
    '\t\tcityWorldPos_ = instanceMatrix * cityWorldPos_;',
    '\t#endif',
    '\tcityWorldPos_ = modelMatrix * cityWorldPos_;',
    '\tvCityWorldPos = cityWorldPos_.xyz;',
    '',
    '\t#ifdef CITY_TN_AVAILABLE',
    // viewMatrix 上 3×3 为正交阵 → 其逆等于转置；GLSL 中 v * M == transpose(M) * v
    '\t\tvCityWorldNormal = normalize( cityViewNormal_ * mat3( viewMatrix ) );',
    '\t#else',
    // 回退路径：目标着色器没有（或条件性地没有）transformedNormal，直接用 normal 属性推导。
    // `attribute vec3 normal` 由 Three 的顶点前缀无条件声明，故一定可用。
    '\t\tvec3 cityObjNormal_ = normal;',
    '\t\t#ifdef USE_BATCHING',
    '\t\t\tcityObjNormal_ = mat3( batchingMatrix ) * cityObjNormal_;',
    '\t\t#endif',
    '\t\t#ifdef USE_INSTANCING',
    '\t\t\tcityObjNormal_ = mat3( instanceMatrix ) * cityObjNormal_;',
    '\t\t#endif',
    '\t\tvec3 cityWorldN_ = mat3( modelMatrix ) * cityObjNormal_;',
    '\t\tfloat cityNLen_ = length( cityWorldN_ );',
    // 几何体缺 normal 属性时 WebGL 给 (0,0,0)，normalize 会产生 NaN，这里兜底成朝上
    '\t\tvCityWorldNormal = cityNLen_ > 1e-5 ? cityWorldN_ / cityNLen_ : vec3( 0.0, 1.0, 0.0 );',
    '\t#endif'
  ].join('\n');
}

/**
 * 片元着色器：uniform / varying / 噪声函数声明块。
 *
 * 噪声用 Dave Hoskins 的 "Hash without Sine"（hash12，见 shadertoy XdGfRR）+
 * 2D value noise（Perlin 的平滑插值 `f*f*(3-2f)`）+ 3 倍频 fBm。
 * 纯算术、无贴图依赖，作用是把积雪 / 水洼边界打散，避免整片死白或圆斑感。
 * @param {boolean} needNight 是否需要 uNight
 * @returns {string}
 */
function fragmentParsChunk(needNight) {
  const lines = [
    'uniform float uWetness;',
    'uniform float uSnowCover;',
    'uniform float uFlash;'
  ];
  if (needNight) lines.push('uniform float uNight;');
  lines.push(
    'varying vec3 vCityWorldPos;',
    'varying vec3 vCityWorldNormal;',
    '',
    '// Hash without Sine (Dave Hoskins) —— 无三角函数的确定性哈希，值域 [0,1)',
    'float cityHash21_( vec2 p ) {',
    '\tvec3 p3 = fract( vec3( p.xyx ) * 0.1031 );',
    '\tp3 += dot( p3, p3.yzx + 33.33 );',
    '\treturn fract( ( p3.x + p3.y ) * p3.z );',
    '}',
    '',
    '// 2D value noise：四角哈希 + Perlin 平滑插值曲线 f*f*(3-2f)，值域 [0,1]',
    'float cityValueNoise_( vec2 p ) {',
    '\tvec2 i = floor( p );',
    '\tvec2 f = fract( p );',
    '\tvec2 u = f * f * ( 3.0 - 2.0 * f );',
    '\tfloat a = cityHash21_( i );',
    '\tfloat b = cityHash21_( i + vec2( 1.0, 0.0 ) );',
    '\tfloat c = cityHash21_( i + vec2( 0.0, 1.0 ) );',
    '\tfloat d = cityHash21_( i + vec2( 1.0, 1.0 ) );',
    '\treturn mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );',
    '}',
    '',
    '// 3 倍频 fBm，除以权重和归一化到 [0,1]',
    'float cityFbm2_( vec2 p ) {',
    '\tfloat v = 0.0;',
    '\tfloat amp = 0.5;',
    '\tfloat wsum = 0.0;',
    '\tfor ( int i = 0; i < 3; i ++ ) {',
    '\t\tv += amp * cityValueNoise_( p );',
    '\t\twsum += amp;',
    '\t\tp *= 2.03;',
    '\t\tamp *= 0.5;',
    '\t}',
    '\treturn v / wsum;',
    '}'
  );
  return lines.join('\n');
}

/**
 * 片元着色器：`#include <color_fragment>` 之后的主计算块。
 * 这里声明的 citySnowMask_ / cityWetAmt_ / cityPuddle_ 与 roughness / metalness
 * 注入块处于同一个 `main()` 作用域，后面可以直接复用。
 * @param {{snow:boolean,snowAmount:number,wetness:boolean,wetDarken:number,puddles:boolean,flash:boolean}} o
 * @param {boolean} hasEmissive 目标着色器是否有 `#include <emissivemap_fragment>`
 * @returns {string}
 */
function fragmentColorChunk(o, hasEmissive) {
  const L = [
    '\tvec3 cityN_ = normalize( vCityWorldNormal );',
    '\tfloat citySnowMask_ = 0.0;',
    '\tfloat cityWetAmt_ = 0.0;',
    '\tfloat cityPuddle_ = 0.0;'
  ];

  if (o.wetness) {
    L.push(
      '',
      '\t// —— 湿滑：只有朝上的面会积水，立面几乎不受影响 ——',
      '\tfloat cityUp_ = smoothstep( 0.15, 0.65, cityN_.y );',
      '\tcityWetAmt_ = clamp( uWetness, 0.0, 1.0 ) * cityUp_;'
    );
    if (o.puddles) {
      L.push(
        '\t// 水洼：低频噪声过阈值成斑块，湿度越高阈值越低（水洼越大），边界用 smoothstep 柔化',
        '\tfloat cityPn_ = cityFbm2_( vCityWorldPos.xz * 0.035 );',
        '\tfloat cityPthr_ = mix( 0.88, 0.30, clamp( uWetness, 0.0, 1.0 ) );',
        '\tcityPuddle_ = smoothstep( cityPthr_, cityPthr_ + 0.10, cityPn_ ) * cityWetAmt_;'
      );
    }
    L.push(
      `\tdiffuseColor.rgb *= ( 1.0 - ${glslFloat(o.wetDarken)} * cityWetAmt_ );`
    );
    if (o.puddles) {
      L.push('\tdiffuseColor.rgb *= ( 1.0 - 0.30 * cityPuddle_ );');
    }
  }

  if (o.snow) {
    L.push(
      '',
      '\t// —— 积雪：朝上程度 × 覆盖度 × 材质倍率，再用世界坐标噪声打散边缘 ——',
      `\tfloat citySnowBase_ = smoothstep( 0.35, 0.8, cityN_.y ) * clamp( uSnowCover, 0.0, 1.0 ) * ${glslFloat(o.snowAmount)};`,
      '\tcitySnowBase_ = clamp( citySnowBase_, 0.0, 1.0 );',
      '\tfloat citySnowN_ = cityFbm2_( vCityWorldPos.xz * 0.11 + vec2( vCityWorldPos.y * 0.035 ) );',
      '\t// 覆盖度越高阈值越低 → 雪从零星斑块逐渐连成片，而不是整面同时变白',
      '\tfloat citySnowThr_ = mix( 0.95, 0.02, citySnowBase_ );',
      '\tfloat citySnowBreak_ = smoothstep( citySnowThr_, citySnowThr_ + 0.30, citySnowN_ );',
      '\tcitySnowMask_ = clamp( citySnowBase_ * ( 0.30 + 0.70 * citySnowBreak_ ), 0.0, 1.0 );',
      `\tvec3 citySnowAlbedo_ = mix( ${SNOW_ALBEDO}, ${SNOW_ALBEDO_NIGHT}, clamp( uNight, 0.0, 1.0 ) * 0.35 );`,
      '\tdiffuseColor.rgb = mix( diffuseColor.rgb, citySnowAlbedo_, citySnowMask_ );'
    );
  }

  // 没有 emissive 通道的材质（如 MeshBasicMaterial）用反照率兜底闪电补光
  if (o.flash && !hasEmissive) {
    L.push(
      '',
      '\t// 该材质无 emissive 通道，闪电补光退化为直接提亮反照率',
      '\tdiffuseColor.rgb += clamp( uFlash, 0.0, 1.0 ) * 0.55 * vec3( 0.8, 0.85, 1.0 );'
    );
  }

  return L.join('\n');
}

/**
 * 片元着色器：`#include <roughnessmap_fragment>` 之后修改 roughnessFactor。
 * @param {{snow:boolean,wetness:boolean,puddles:boolean}} o
 * @returns {string}
 */
function fragmentRoughnessChunk(o) {
  const L = [];
  if (o.wetness) {
    L.push(
      '\t// 湿润：粗糙度拉向 0.08（水膜），水洼里更接近镜面',
      '\troughnessFactor = mix( roughnessFactor, 0.08, cityWetAmt_ * 0.9 );'
    );
    if (o.puddles) L.push('\troughnessFactor = mix( roughnessFactor, 0.035, cityPuddle_ );');
  }
  if (o.snow) {
    L.push(
      '\t// 积雪覆盖处是漫反射的粉雪，粗糙度回到高位（雪要盖住湿滑反光）',
      '\troughnessFactor = mix( roughnessFactor, 0.80, citySnowMask_ );'
    );
  }
  L.push('\troughnessFactor = clamp( roughnessFactor, 0.02, 1.0 );');
  return L.join('\n');
}

/**
 * 片元着色器：`#include <metalnessmap_fragment>` 之后修改 metalnessFactor。
 * @param {{snow:boolean,wetness:boolean,puddles:boolean}} o
 * @returns {string}
 */
function fragmentMetalnessChunk(o) {
  const L = [];
  if (o.wetness) {
    L.push(
      '\t// 湿润：抬高金属度以获得强方向性高光（近似水面菲涅尔）',
      '\tmetalnessFactor = mix( metalnessFactor, 0.35, cityWetAmt_ * 0.9 );'
    );
    if (o.puddles) L.push('\tmetalnessFactor = mix( metalnessFactor, 0.45, cityPuddle_ );');
  }
  if (o.snow) {
    L.push('\tmetalnessFactor = mix( metalnessFactor, 0.0, citySnowMask_ );');
  }
  L.push('\tmetalnessFactor = clamp( metalnessFactor, 0.0, 1.0 );');
  return L.join('\n');
}

/**
 * 片元着色器：`#include <emissivemap_fragment>` 之后叠加闪电补光。
 * @returns {string}
 */
function fragmentFlashChunk() {
  return '\ttotalEmissiveRadiance += clamp( uFlash, 0.0, 1.0 ) * 0.55 * vec3( 0.8, 0.85, 1.0 );';
}

/**
 * 给城市材质注入积雪 / 湿滑 / 闪电响应（契约 §3.7）。**原地修改并返回同一个 material。**
 *
 * 幂等：`material.userData.envPatched === true` 时直接返回，不会重复注入。
 * 会设置 `material.customProgramCacheKey`，保证不同 opts 的材质编译出各自的着色器程序
 * （否则 Three 会因 onBeforeCompile 源码文本相同而错误复用程序，导致视觉串味）。
 *
 * @param {THREE.Material} material 目标材质（MeshStandard/Physical/Lambert/Phong/Toon/Basic 均可）
 * @param {ReturnType<typeof createEnvUniforms>} env 共享环境 uniforms
 * @param {Object} [opts] 逐材质开关
 * @param {boolean} [opts.snow=true] 是否接受积雪
 * @param {number}  [opts.snowAmount=1.0] 积雪倍率（屋顶 1.0，玻璃 0.25）
 * @param {boolean} [opts.wetness=true] 是否接受湿滑
 * @param {number}  [opts.wetDarken=0.35] 湿润时反照率压暗幅度
 * @param {boolean} [opts.puddles=false] 是否生成水洼斑块（地面用 true）
 * @param {boolean} [opts.flash=true] 是否接受闪电补光
 * @returns {THREE.Material} 同一个 material，便于链式书写
 */
export function patchCityMaterial(material, env, opts = {}) {
  if (!material || typeof material !== 'object') return material;

  // (1) 幂等：已注入过就原样返回
  if (!material.userData) material.userData = {};
  if (material.userData.envPatched === true) return material;

  // env 缺失时不注入（保持材质可用），但仍打标避免后续反复尝试
  if (!env || !env.uWetness || !env.uSnowCover || !env.uFlash) {
    material.userData.envPatched = true;
    material.userData.envPatchKey = 'city-patch|disabled(no-env)';
    return material;
  }

  const o = {
    snow: opts.snow !== false,
    snowAmount: clampNum(opts.snowAmount, 0, 4, DEFAULT_OPTS.snowAmount),
    wetness: opts.wetness !== false,
    wetDarken: clampNum(opts.wetDarken, 0, 1, DEFAULT_OPTS.wetDarken),
    puddles: opts.puddles === true,
    flash: opts.flash !== false
  };
  // 水洼依附于湿滑逻辑，湿滑关闭时水洼自动失效
  if (!o.wetness) o.puddles = false;

  // (2) 程序缓存键：必须随 opts 变化，否则 Three 复用同一 program → 视觉串味。
  //     数值参数被烘成 GLSL 字面量，所以也要参与签名。
  const cacheKey =
    'city-patch|s' + (o.snow ? 1 : 0) + ':' + o.snowAmount.toFixed(3) +
    '|w' + (o.wetness ? 1 : 0) + ':' + o.wetDarken.toFixed(3) +
    '|p' + (o.puddles ? 1 : 0) +
    '|f' + (o.flash ? 1 : 0);

  material.userData.envPatched = true;
  material.userData.envPatchKey = cacheKey;

  // 四个特性全关就没必要注入了（省一次着色器编译）
  if (!o.snow && !o.wetness && !o.flash) {
    material.customProgramCacheKey = () => cacheKey;
    return material;
  }

  // 保留他人已挂的 onBeforeCompile（只在材质实例上自有该属性时才算数，
  // 原型上的空实现不需要链式调用）
  const hasOwnHook = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile');
  const prevHook = hasOwnHook && typeof material.onBeforeCompile === 'function'
    ? material.onBeforeCompile
    : null;

  material.customProgramCacheKey = () => cacheKey;

  material.onBeforeCompile = function cityEnvOnBeforeCompile(shader, renderer) {
    if (prevHook) prevHook.call(this, shader, renderer);

    // ---- uniforms 合入（按引用共享，改 env.uXxx.value 即全城生效）----
    for (const key of Object.keys(env)) {
      if (shader.uniforms[key] === undefined) shader.uniforms[key] = env[key];
    }

    // 先把两个着色器都改在局部变量上，**两边都成功才一起写回**，
    // 避免出现"顶点声明了 varying、片元没用"或反之的半截状态。
    const rawVs = shader.vertexShader;
    const rawFs = shader.fragmentShader;

    // ---- 顶点着色器 ----
    const vWorld = appendAfterInclude(rawVs, '#include <worldpos_vertex>', vertexWorldChunk());
    if (!vWorld.ok) return; // 没有 worldpos_vertex 的着色器（如 Points/Sprite）静默跳过
    let vs = vWorld.source;
    vs = appendAfterInclude(vs, '#include <defaultnormal_vertex>', vertexNormalGrabChunk()).source;
    const vPars = appendAfterInclude(vs, '#include <common>', vertexParsChunk());
    vs = vPars.ok ? vPars.source : `${vertexParsChunk()}\n${vs}`;

    // ---- 片元着色器 ----
    const hasEmissive = o.flash && rawFs.indexOf('#include <emissivemap_fragment>') !== -1;
    const fColor = appendAfterInclude(
      rawFs, '#include <color_fragment>', fragmentColorChunk(o, hasEmissive)
    );
    // 理论上所有 Mesh 材质都有 color_fragment；万一没有就整体放弃注入，材质保持原样
    if (!fColor.ok) return;
    let fs = fColor.source;

    fs = appendAfterInclude(
      fs, '#include <roughnessmap_fragment>', fragmentRoughnessChunk(o)
    ).source;
    fs = appendAfterInclude(
      fs, '#include <metalnessmap_fragment>', fragmentMetalnessChunk(o)
    ).source;
    if (hasEmissive) {
      fs = appendAfterInclude(
        fs, '#include <emissivemap_fragment>', fragmentFlashChunk()
      ).source;
    }
    const fPars = appendAfterInclude(fs, '#include <common>', fragmentParsChunk(o.snow));
    fs = fPars.ok ? fPars.source : `${fragmentParsChunk(o.snow)}\n${fs}`;

    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };

  // 材质可能已经编译过，强制下一帧重编
  material.needsUpdate = true;
  return material;
}

/**
 * 每帧把 `FrameContext` 里的天气 / 时间状态写进共享 uniforms（main.js 调用一次即可）。
 *
 * 天气参数取自 `ctx.weather.params`（契约 §6.3）——该对象由 `weather/weather.js`
 * **已做好平滑插值**，这里直接取用，不再二次插值：
 *   - `wetnessTarget`   → uWetness
 *   - `snowCoverTarget` → uSnowCover
 *   - `fogColor`        → uFogColor（[r,g,b] 0..1，不做色彩空间转换）
 * 所有读取都做了存在性与数值有效性检查，缺字段时保持上一帧值，绝不写入 NaN。
 *
 * @param {ReturnType<typeof createEnvUniforms>} env
 * @param {Object} ctx FrameContext（契约 §2）
 * @returns {void}
 */
export function updateEnvUniforms(env, ctx) {
  if (!env || !ctx) return;

  const weather = ctx.weather;
  const p = weather && weather.params ? weather.params : null;

  // 湿润度 / 积雪覆盖度：weather 已插值好的当前值
  if (p) {
    if (env.uWetness && typeof p.wetnessTarget === 'number' && Number.isFinite(p.wetnessTarget)) {
      env.uWetness.value = clamp01(p.wetnessTarget, env.uWetness.value);
    }
    if (env.uSnowCover && typeof p.snowCoverTarget === 'number' && Number.isFinite(p.snowCoverTarget)) {
      env.uSnowCover.value = clamp01(p.snowCoverTarget, env.uSnowCover.value);
    }
  }

  // 闪电补光（lightning.js 写进 ctx.weather.flash）
  if (env.uFlash) {
    const f = weather && typeof weather.flash === 'number' ? weather.flash : 0;
    env.uFlash.value = clamp01(f, 0);
  }

  // 时间与夜晚程度
  if (env.uTime && typeof ctx.elapsed === 'number' && Number.isFinite(ctx.elapsed)) {
    env.uTime.value = ctx.elapsed;
  }
  if (env.uNight) {
    env.uNight.value = clamp01(ctx.nightFactor, env.uNight.value);
  }

  // 雾色：优先用天气参数，其次退回场景雾
  if (env.uFogColor && env.uFogColor.value) {
    const fc = p ? p.fogColor : null;
    if (Array.isArray(fc) && fc.length >= 3 &&
        Number.isFinite(fc[0]) && Number.isFinite(fc[1]) && Number.isFinite(fc[2])) {
      env.uFogColor.value.setRGB(fc[0], fc[1], fc[2]);
    } else if (ctx.scene && ctx.scene.fog && ctx.scene.fog.color) {
      env.uFogColor.value.copy(ctx.scene.fog.color);
    }
  }

  // 风：优先用 ctx.wind.vector（水平单位向量 × 速度），取其水平分量 (x, z)
  if (env.uWindVec && env.uWindVec.value) {
    const wind = ctx.wind;
    if (wind && wind.vector &&
        Number.isFinite(wind.vector.x) && Number.isFinite(wind.vector.z)) {
      env.uWindVec.value.set(wind.vector.x, wind.vector.z);
    } else if (wind && Number.isFinite(wind.dirDeg) && Number.isFinite(wind.speed)) {
      // 兜底：方位角 0 = 北(-Z)，90 = 东(+X)，与契约 §0 坐标约定一致
      const rad = wind.dirDeg * Math.PI / 180;
      env.uWindVec.value.set(Math.sin(rad) * wind.speed, -Math.cos(rad) * wind.speed);
    }
  }
}
