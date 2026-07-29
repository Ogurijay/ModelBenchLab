# 模块契约（CONTRACT）— claudeopus5-manhattan-procedural

> **本文件是唯一接口事实源。** 每个模块由一个开发者独占实现，只允许创建/修改自己那一个文件（外加自己的测试文件）。
> 任何跨模块调用必须严格按本文件签名，**不得擅自改动他人签名，不得修改本文件**。
> 若发现契约有缺陷，在自己文件顶部注释里写明并按契约兜底实现（例如缺参数就给默认值），不要单方面改接口。

## 0. 全局约定

| 项 | 约定 |
|---|---|
| 语言 | 原生 ESM JavaScript（**不是 TypeScript**），Three.js `^0.185.1`，`import * as THREE from 'three'` |
| 单位 | **1 世界单位 = 1 米** |
| 坐标 | Y 轴向上；**+X = 东，−X = 西；+Z = 南（下城），−Z = 北（上城）** |
| 资产 | **禁止加载任何外部文件**（模型/贴图/HDRI/音频/字体）。几何、贴图（Canvas/Data 纹理）、音效（WebAudio 合成）一律代码生成 |
| 随机 | **禁止 `Math.random()`**。一切随机来自 `core/rng.js` 的种子 RNG。同种子必须逐顶点一致 |
| 注释 | 中文 JSDoc，关键算法注明公式出处（如"NOAA 太阳位置算法""IDM 跟车模型"） |
| 报错 | 控制台零报错零警告；不得使用已废弃的 Three.js API（如 `outputEncoding`、`sRGBEncoding`、`Geometry`） |
| 依赖方向 | `core/*` 与 `render/shaderpatch.js` 不依赖任何本项目其他模块；`city/*`、`sculpt/*`、`sim/*`、`weather/*`、`sky/*`、`ui/*` 只依赖 `core/*` 和 `render/shaderpatch.js`，**互相之间不 import** |

### 0.1 Three.js 0.185 注意事项

- 颜色空间：`renderer.outputColorSpace = THREE.SRGBColorSpace`（main.js 已设）；自己创建的**颜色类贴图**须设 `texture.colorSpace = THREE.SRGBColorSpace`，**数据类贴图**（法线/粗糙度/噪声）保持 `NoColorSpace`。
- 合并几何：`import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'`。
- 控制器：`import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'`。
- `InstancedMesh` 设完矩阵后必须 `instanceMatrix.needsUpdate = true`；用到 `instanceColor` 时 `mesh.instanceColor.needsUpdate = true`。
- 光照统一走 `renderer.useLegacyLights` 不设（0.185 已移除该项），灯光强度按物理值给（见 §3 ctx.sun.intensity）。

## 1. 系统句柄（SystemHandle）

**每个场景模块导出一个工厂函数，返回统一形状的句柄对象：**

```js
/**
 * @typedef {Object} SystemHandle
 * @property {THREE.Object3D|null} object3D  加入场景的根节点（无可视物体则为 null）
 * @property {(ctx: FrameContext) => void} [update]   每帧调用（可选）
 * @property {() => void} [dispose]  释放 geometry/material/texture（**必须实现**，重建城市时会调用）
 * @property {Object} [stats]   可选统计，如 { instances: 1234, draws: 6 }
 */
```

约定：

- 工厂函数**同步**返回，内部不得有 `await`、不得发起网络请求。
- `object3D` 的 `name` 设为模块名（如 `'buildings'`），便于调试。
- `dispose()` 必须遍历释放所有自建 `geometry` / `material` / `texture`；不要释放从 `ctx.textures` 拿到的共享贴图（由 `core/textures.js` 统一释放）。
- 模块内部不得直接读写 DOM（`ui/*` 除外），不得调用 `renderer.render`。

## 2. 帧上下文（FrameContext）

main.js 每帧构造并传给所有 `update()`。**只读**，模块不得修改（`ctx.tallStructures` 除外，见下）。

```js
/**
 * @typedef {Object} FrameContext
 * @property {number}  dt            本帧秒数，已 clamp 到 [0, 0.1]
 * @property {number}  elapsed       启动至今秒数（真实时间）
 * @property {number}  simMinutes    城市当地时间，0..1440（分钟）
 * @property {number}  simHours      同上，单位小时 0..24
 * @property {number}  dayOfYear     1..365（默认 172 夏至）
 * @property {Object}  sun
 *   @property {THREE.Vector3} sun.direction   由城市指向太阳的单位向量
 *   @property {number} sun.elevationDeg       高度角（度，地平线下为负）
 *   @property {number} sun.azimuthDeg         方位角（度，0=北 90=东）
 *   @property {number} sun.intensity          建议直射光强度（0..3.2）
 *   @property {THREE.Color} sun.color         直射光色（日出偏橙、正午偏白）
 * @property {Object}  moon  { direction:THREE.Vector3, elevationDeg:number, illumination:number(0..1), intensity:number }
 * @property {number}  nightFactor   0=白昼 1=深夜（由太阳高度角平滑映射，黄昏渐变）
 * @property {Object}  weather
 *   @property {'clear'|'cloudy'|'fog'|'rain'|'storm'|'snow'} weather.current  目标天气
 *   @property {WeatherParams} weather.params   **已插值**的当前参数（见 §6）
 *   @property {number} weather.flash           闪电闪光强度 0..1（本帧）
 * @property {Object}  wind  { dirDeg:number, speed:number(m/s), vector:THREE.Vector3(水平单位向量×速度) }
 * @property {THREE.PerspectiveCamera} camera
 * @property {THREE.Scene} scene
 * @property {THREE.WebGLRenderer} renderer
 * @property {'high'|'medium'|'low'} quality
 * @property {CityPlan} plan            见 §4.1
 * @property {HeightField} heightField  见 §4.2
 * @property {Rng} rng                  根 RNG（**只用于 fork 派生，不要直接抽数**）
 * @property {TextureLib} textures      见 §3.5
 * @property {EnvUniforms} env          见 §3.7（共享 shader uniforms）
 * @property {Array<StrikePoint>} tallStructures  高建筑登记表；建楼类模块在**创建时**push，闪电模块读取
 * @property {AudioBus|null} audio      见 §3.6，音效关闭时为 null
 */

/** @typedef {{x:number, y:number, z:number, name:string}} StrikePoint  y = 结构顶端高度 */
```

## 3. 基础模块（core / render）

### 3.1 `src/core/rng.js`

```js
export function hashString(str)                  // string|number -> uint32
export function mulberry32(seed)                 // uint32 -> () => number in [0,1)
export function makeRng(seed, stream = 'root')   // -> Rng
export function hash2D(x, y, seed)               // -> [0,1)，无状态、可并行调用
```

`Rng` 对象（用普通对象 + 闭包实现即可）：

```js
{
  seed: number,               // 实际生效的 uint32 种子
  next(): number,             // [0,1)
  range(min, max): number,    // [min,max)
  int(min, maxInclusive): number,
  bool(p = 0.5): boolean,
  pick(array): any,           // 空数组返回 undefined
  weighted(items, weightFn): any,   // 按权重取一个
  gauss(mean = 0, std = 1): number, // Box-Muller
  shuffle(array): array,      // 原地洗牌并返回
  fork(streamName): Rng       // 派生独立子流：同名同种子必得同一子流
}
```

**关键约束**：`fork('a')` 与 `fork('b')` 互不影响；父流后续抽数不受子流影响（子流用 `hashString(streamName) ^ seed` 重新起链）。

测试 `tests/rng.test.js`：同种子序列一致、fork 独立性、range/int 边界、gauss 均值方差近似。

### 3.2 `src/core/noise.js`

```js
export function makeNoise2D(seed)   // -> (x, y) => [-1,1]，2D simplex 或 value-noise（须平滑、无网格感）
export function makeNoise3D(seed)   // -> (x, y, z) => [-1,1]
export function fbm2D(noise2D, x, y, opts)     // opts: {octaves=4, lacunarity=2, gain=0.5, frequency=1} -> [-1,1]
export function fbm3D(noise3D, x, y, z, opts)  // 同上
export function ridged2D(noise2D, x, y, opts)  // -> [0,1]，脊状噪声（山脊/岩石用）
export function worley2D(x, y, seed, cellSize) // -> {f1, f2, id}，F1/F2 距离与格子 id（用于岩石/水塘/裂纹）
```

要求：纯函数、确定性、无 `Math.random`；`fbm2D` 结果必须归一化到 [-1,1]（除以权重和）。
测试 `tests/noise.test.js`：确定性、值域、连续性（相邻采样差值有界）、不同种子结果不同。

### 3.3 `src/core/mathx.js`

```js
export const TWO_PI, DEG2RAD, RAD2DEG
export function clamp(v, min, max)
export function lerp(a, b, t)
export function invLerp(a, b, v)
export function smoothstep(edge0, edge1, x)
export function smootherstep(edge0, edge1, x)
export function damp(current, target, lambda, dt)   // 帧率无关指数逼近: current + (target-current)*(1-exp(-lambda*dt))
export function dampAngleDeg(current, target, lambda, dt)  // 走最短弧
export function mod(n, m)                            // 永远返回非负
export function solveCatenaryA(halfSpan, sag, iterations = 60)
export function catenaryY(x, a)                      // = a*cosh(x/a) - a
export function catenaryPoints(span, sag, count)     // -> [{x, y}]，x∈[-span/2, span/2]，y(0)=0 最低点，y(±span/2)=sag
export function catenaryLength(halfSpan, a)          // = 2*a*sinh(halfSpan/a)
export function catmullRom(p0, p1, p2, p3, t)        // 标量插值
```

**悬链线**：`solveCatenaryA` 用牛顿迭代解 `a * (cosh(halfSpan/a) - 1) = sag`（初值可用抛物线近似 `a ≈ halfSpan²/(2*sag)`），返回参数 `a`。这是任务要求的"真实公式"之一，测试必须验证解出的 `a` 代回误差 < 1e-6，且 `catenaryPoints` 端点垂度等于给定 sag。

测试 `tests/mathx.test.js`：damp 帧率无关性（1×0.1s 与 10×0.01s 结果接近）、悬链线精度、smoothstep 边界、mod 负数。

### 3.4 `src/core/solar.js`

```js
export const NYC = { lat: 40.7128, lon: -74.0060, tzOffsetHours: -5 }
export function solarPosition(dayOfYear, localHours, lat = NYC.lat, lon = NYC.lon, tz = NYC.tzOffsetHours)
// -> { elevationDeg, azimuthDeg, declinationDeg, hourAngleDeg, equationOfTimeMin, zenithDeg }
export function sunDirection(elevationDeg, azimuthDeg)  // -> {x, y, z} 单位向量（方位角 0=北(-Z)，90=东(+X)）
export function sunriseSunset(dayOfYear, lat, lon, tz)  // -> { sunriseHours, sunsetHours, dayLengthHours }
export function moonPhase(dayOfYear, localHours)        // -> { phase01, illumination, ageDays }（朔望月 29.530588 天）
export function moonPosition(dayOfYear, localHours, lat = NYC.lat, lon = NYC.lon, tz = NYC.tzOffsetHours)
// -> { elevationDeg, azimuthDeg }（可用"太阳位置 + 相位角偏移"的简化模型，注释说明）
```

**必须实现真正的 NOAA/天文算法**（分数年角 → 均时差 → 赤纬 → 时角 → 高度角/方位角），不得用 `sin(t)` 拍脑袋近似。
测试 `tests/solar.test.js`：纽约夏至正午高度角 ≈ 72.6°±1.5°、冬至正午 ≈ 25.9°±1.5°、春分昼长 ≈ 12h±0.3h、日出前高度角为负、方位角单调性。

### 3.5 `src/core/textures.js`

```js
export function createTextureLib(rng, opts = {})   // -> TextureLib（**一次性创建，全场景共享**）
export function disposeTextureLib(lib)
```

`TextureLib` 字段（全部 `THREE.CanvasTexture` / `THREE.DataTexture`，已设好 `wrapS/wrapT=RepeatWrapping`、`anisotropy=4`、颜色贴图 `colorSpace=SRGBColorSpace`）：

```js
{
  asphalt, asphaltRough,        // 沥青路面 + 粗糙度图
  sidewalk,                     // 人行道板块
  concrete, limestone, brick, glassCurtain,   // 建筑立面基材（可平铺）
  facadeWindows: { map, emissiveMap, roughnessMap },  // 窗格幕墙：白天反射 / 夜间发光
  crosswalk, laneMarking,       // 斑马线 / 车道线（带 alpha）
  roofGravel, water, snowGrain,
  billboards: [ { texture, update(timeSec) }, ... ],   // ≥3 块动画广告牌（时代广场用）
  cloudSprite,                  // 云边缘软化用的径向渐变 alpha 图
  starfield,                    // 星空贴图（可选，天空模块也可自绘）
  noise: DataTexture,           // R 通道噪声，供 shader 打散用
  all: Texture[]                // 便于统一释放
}
```

要求：每张贴图 ≤ 512×512（幕墙 1024 可），细节靠噪声/条纹算法生成，不要纯色块。生成耗时总计控制在 150ms 内。

### 3.6 `src/core/audio.js`

```js
export function createAudioBus()   // -> AudioBus，**必须惰性创建 AudioContext**（首次 enable 时才 new）
```

```js
AudioBus = {
  enabled: boolean,
  enable(): Promise<void>|void,   // 用户手势后调用，创建/恢复 AudioContext
  disable(): void,
  thunder(distanceMeters, strength): void,  // 合成雷声：低频噪声 + 包络，按 343 m/s 延迟播放
  rainLevel(level01): void,       // 雨声底噪（粉噪声 + 带通），平滑过渡
  windLevel(level01): void,
  cityAmbience(level01): void,    // 低频城市底噪
  boatHorn(): void,
  update(dt): void,
  dispose(): void
}
```

全部用 `OscillatorNode` / `AudioBufferSourceNode`（程序化生成 buffer）合成，**禁止加载音频文件**。禁用时所有方法必须安全空转。

### 3.7 `src/render/shaderpatch.js`

全场景共享的环境 uniforms 与材质注入，**其他模块的建筑/地面/桥梁材质必须调用 `patchCityMaterial`**，否则不会有积雪/湿滑/闪电响应。

```js
export function createEnvUniforms()  // -> EnvUniforms
export function patchCityMaterial(material, env, opts = {})  // 原地注入并返回 material
export function updateEnvUniforms(env, ctx)   // main.js 每帧调用，把 ctx 的天气/时间写进 uniforms
export const CITY_MATERIAL_DEFAULTS  // { roughness:0.85, metalness:0.05 } 供各模块参考
```

```js
EnvUniforms = {
  uWetness:   { value: 0 },      // 0..1 路面/地面湿润度
  uSnowCover: { value: 0 },      // 0..1 积雪覆盖度
  uFlash:     { value: 0 },      // 0..1 闪电补光
  uTime:      { value: 0 },      // 秒
  uNight:     { value: 0 },      // 0..1 夜晚程度
  uFogColor:  { value: new THREE.Color() },
  uWindVec:   { value: new THREE.Vector2() }
}
```

`patchCityMaterial(material, env, opts)` 的 `opts`：

```js
{
  snow: true,        // 是否接受积雪（默认 true）
  snowAmount: 1.0,   // 该材质积雪倍率（屋顶 1.0，玻璃 0.25，垂直面自然接近 0）
  wetness: true,     // 是否接受湿滑（默认 true）
  wetDarken: 0.35,   // 湿润时反照率压暗幅度
  puddles: false,    // 是否生成水洼（地面用 true）
  flash: true        // 是否接受闪电补光
}
```

注入实现要点（`material.onBeforeCompile`）：

1. 把 `env` 的 uniforms 合入 `shader.uniforms`；给 `material.userData.envPatched = true` 防重复注入；**必须设 `material.customProgramCacheKey = () => 'city-patch-<opts签名>'`**。
2. 顶点着色器传出世界坐标 `vWorldPos` 与世界法线 `vWorldNormal`。
3. 片元着色器在 `#include <color_fragment>` 之后：
   - **积雪**：`snowMask = smoothstep(0.35, 0.8, vWorldNormal.y) * uSnowCover * snowAmount`，再乘一层基于 `vWorldPos` 的噪声打散边缘；`diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92,0.94,0.97), snowMask)`。
   - **湿滑**：`wet = uWetness * (wetness?1:0)`，向上面（`vWorldNormal.y>0.5`）压暗 `wetDarken`，并在 `#include <roughnessmap_fragment>` 后把 `roughnessFactor` 拉向 0.08、`metalnessFactor` 抬向 0.35，形成镜面反光；`puddles` 开启时用低频噪声阈值做出水洼斑块（水洼处更光滑）。
   - **闪电**：`totalEmissiveRadiance += uFlash * 0.55 * vec3(0.8,0.85,1.0)`（`flash:true` 时）。
4. 不得破坏原有 `#include`，用 `shader.fragmentShader.replace(...)` 精确插入。

## 4. 城市数据层

### 4.1 `src/city/grid.js` — 路网与地块（纯数据，不 import three）

```js
export const CITY = {
  minX: -800, maxX: 800, minZ: -2400, maxZ: 2400,   // 陆地范围（米）
  avenueXs: [-700, -420, -140, 140, 420, 700],       // 南北向大道中心线 X（间距 280m）
  streetSpacing: 80,                                  // 东西向街道间距（米）
  avenueRoadWidth: 34, streetRoadWidth: 20, sidewalkWidth: 6,
  park:     { minX: -420, maxX: 140, minZ: -2080, maxZ: -720 },   // 中央公园
  broadway: { ax: -700, az: -2400, bx: 300, bz: 2400, width: 30 }, // 百老汇斜切（约 11.8°）
  river:    { hudsonX: -800, eastX: 800 },
  bridge:   { z: 1900, startX: 760, endX: 1560 }
};

export function buildCityPlan(seed)   // -> CityPlan（**纯数据、可 JSON 序列化、同种子完全一致**）
export function pointInPolygon(px, pz, polygon)      // polygon: [[x,z], ...]
export function clipPolygonByHalfPlane(polygon, ax, az, bx, bz, keepLeft)  // Sutherland-Hodgman 单边裁剪
export function polygonArea(polygon)
export function polygonCentroid(polygon)             // -> {x, z}
```

```js
CityPlan = {
  seed, streetZs: number[], avenueXs: number[],
  broadway: { ax, az, bx, bz, width, angleDeg, dirX, dirZ, polygon:[[x,z]...] },
  blocks: [{
    id, minX, maxX, minZ, maxZ, centerX, centerZ,
    district: 'midtown'|'downtown'|'uptown'|'village'|'park',
    isPark: boolean,
    lots: [{
      id, polygon: [[x,z]...],       // 顺时针，**已扣除人行道**
      centerX, centerZ, area,
      shape: 'rect'|'triangle'|'poly',
      onBroadway: boolean, corner: boolean,
      frontAngleDeg: number          // 主立面朝向（度）
    }]
  }],
  triangleLots: Lot[],                // 被百老汇切出的三角/异形地块（≥8 个）
  intersections: [{ id, x, z, avenueIndex, streetIndex, hasSignal: boolean }],
  parkPolygon: [[x,z]...],
  isOnRoad(x, z): boolean, isInPark(x, z): boolean, isWater(x, z): boolean, isOnBroadway(x, z): boolean
}
```

生成规则：

- 街道 Z 从 `minZ` 到 `maxZ` 按 `streetSpacing` 排布；公园范围内的**街道跳过**（公园是整块）。
- 每个"大道×街道"围成的街区（280×80）沿长边切 3~7 个地块（用 rng 抖动，保证 ≥18m 面宽）。
- **百老汇**：以 `(ax,az)-(bx,bz)` 为中心线、宽 30m 的带状多边形，凡与之相交的地块要被裁掉带内部分；裁剪后面积 < 220m² 的碎块丢弃；裁出的**三角形地块**（顶点数 3、或最小内角 < 45°）收进 `triangleLots`，其中面积最大的几块留给熨斗大厦等。
- `district` 按 Z 划分：`z < -720` 上城/公园带、`-720..300` 中城、`300..1200` 村区/苏活、`> 1200` 下城。
- 河流：`x < -800` 或 `x > 800` 为水域（桥面区域除外）。

测试 `tests/grid.test.js`：同种子两次生成 JSON 相同、不同种子不同、地块不重叠（抽样）、三角地块 ≥8、地块不侵入路面与公园、`isWater/isOnRoad` 正确性。

### 4.2 `src/city/skyline.js` — 双峰天际线高度场

```js
export const SKYLINE_PEAKS = [
  { name: 'midtown',  x: 0,   z: -560, amp: 300, sigma: 430 },
  { name: 'downtown', x: 100, z: 1750, amp: 265, sigma: 390 }
];
export function createHeightField(seed)   // -> HeightField
```

```js
HeightField = {
  heightAt(x, z): number,        // 建筑目标高度（米），公园/水域返回 0
  densityAt(x, z): number,       // 0..1 建筑密集度（影响地块细分与楼间距）
  styleAt(x, z): string,         // 'limestone'|'brick'|'glass'|'deco'  分区材质
  peaks: SKYLINE_PEAKS, maxHeight: number
}
```

公式：`h = (Σ ampᵢ·exp(-dᵢ²/(2σᵢ²)) + base) × (0.45 + 0.75·fbm) × cornerBonus`，`base ≈ 22`，
`cornerBonus` 在大道两侧 1.25、百老汇沿线 1.15；结果 clamp 到 [12, 330]（地标另行硬编码，不走此场）。
高度须**离散到 3.5m 层高的整数倍**，让楼群有楼层感。

测试 `tests/skyline.test.js`：两峰中心高于周边、公园为 0、同种子一致、值域合规、层高离散。

## 5. 城市几何模块（city / sculpt）

所有模块签名统一为 `create<X>(ctx0)`，其中 `ctx0` 是"构建期上下文"：

```js
/** @typedef {{ plan, heightField, rng, textures, env, quality, seed }} BuildContext */
```

（`env` 用于 `patchCityMaterial`；`rng` 请用 `rng.fork('模块名')` 派生自己的流。）

### 5.1 `src/city/roads.js` — `createRoads(ctx0) -> SystemHandle`

- 大道/街道/百老汇路面（沥青，`puddles:true`）、人行道（抬高 0.18m，带路缘）、路口铺装。
- 车道线（虚线/双黄线）、斑马线、停止线，用**贴花平面**（`polygonOffset` 防 z-fighting，不要靠 y 抬升硬凑）。
- 河流水面（两条河 + 港湾，简单动态法线波动即可）、公园外围绿化带边界。
- **必须合并几何**（`mergeGeometries`）：整个路网 ≤ 6 个 drawcall。
- `object3D.name='roads'`；导出 `handle.waterMaterial` 供主循环无需干预（自己在 update 里推进水面 uv 即可）。

### 5.2 `src/city/buildings.js` — `createBuildings(ctx0) -> SystemHandle`

- 遍历 `plan.blocks[].lots`（跳过 park/水域），按 `heightField` 造楼：矩形地块用盒体，三角/异形地块用 `Shape+ExtrudeGeometry` 贴合多边形。
- 形态多样性：≥5 种体块策略（平顶板楼、退台塔楼、裙楼+塔、坡顶砖楼、带女儿墙的老楼），高度 >120m 的必须有 1~3 级退台（Setback）。
- 立面：按 `styleAt` 选石灰岩/砖/玻璃幕墙贴图 + `facadeWindows` 的 `emissiveMap`；**贴图 repeat 必须按楼体尺寸算**，让窗格大小在全城一致（约 3.5m 层高 × 2.6m 窗宽）。
- 屋顶细节：水塔（木桶+支架）、空调机组、电梯机房、女儿墙、屋顶天线；用 `InstancedMesh` 批量放置（≥3 类，总数 ≥600）。
- **渲染预算**：按材质分组，用 `InstancedMesh`（同种体块共享 geometry）或合并几何；整个楼群 ≤ 24 个 drawcall，三角形 ≤ 900k。
- 所有材质调用 `patchCityMaterial(mat, ctx0.env, { snowAmount: 玻璃0.25/其他1, puddles:false })`。
- 把最高的 12 栋楼 push 进 `ctx0.tallStructures`（`{x, y:楼顶高, z, name:'楼群#id'}`）。
- `handle.stats = { instances, buildings }`。

### 5.3 `src/city/landmarks.js` — `createLandmarks(ctx0) -> SystemHandle`

四座**可辨认**地标，纯代码建模（不走高度场），位置写死并避开普通楼群（`plan` 中对应地块由本模块占用，通过 `handle.occupiedLots: string[]` 告知——buildings.js 不读它，main.js 会在建楼前把这些 lot id 传给 buildings，因此**本模块必须导出常量** `export const LANDMARK_LOTS_HINT`，见下）：

| 地标 | 位置 (x, z) | 高度 | 造型要点 |
|---|---|---|---|
| 帝国大厦 | (-60, -430) | 381m + 62m 天线 | 五段退台、中央塔身收分、装饰艺术冠顶、圆形观景层、顶部尖塔天线 |
| 克莱斯勒大厦 | (250, -540) | 282m + 37m 尖顶 | 塔身收分 + **7 层放射状拱形冠顶**（三角窗）+ 细长尖针 |
| 世贸中心一号楼 | (60, 1830) | 417m + 124m 尖塔 | 底部方形 → 中部**八角形**（四角切角渐变）→ 顶部旋转 45° 方形，全玻璃幕墙 + 顶部圆形尖塔 |
| 熨斗大厦 | 由 `plan.triangleLots` 中挑最接近 (0, 240) 的三角地块 | 87m | 锐角楔形、22 层、檐口线脚、圆角尖端 |

```js
export const LANDMARK_LOTS_HINT = [ { x, z, radius } , ... ]  // 供 main.js 排除普通楼群的圆形禁建区
```

- 冠顶/尖塔夜间自带泛光（`emissive` 随 `uNight` 增强），帝国大厦顶部投射彩色泛光灯。
- 每座地标顶点 push 进 `ctx0.tallStructures`（名字用中文，如 `'帝国大厦'`）。
- 三角形楼（熨斗）必须真正沿三角地块多边形挤出，不能用盒子凑。

### 5.4 `src/city/bridge.js` — `createBridge(ctx0) -> SystemHandle`

- 位置 `CITY.bridge`：跨东河，主跨 520m，两座**石砌哥特双拱主塔**（高 84m），桥面高 40m。
- **主缆必须用 `core/mathx.js` 的 `solveCatenaryA` + `catenaryPoints` 计算真实悬链线**（垂度 58m），用 `TubeGeometry` 沿曲线生成；两侧各一条主缆。
- 竖直吊索：沿主缆每 12m 一根，长度 = 主缆高度 − 桥面高度（必须由悬链线求值得到，不得手写数组）。
- 桥面：车行道 + 中央步道 + 加劲桁架 + 栏杆；引桥接回 Manhattan 街面。
- 桥塔顶航空障碍灯闪烁；把桥塔顶 push 进 `tallStructures`。
- 文档注释写明：`a` 的求解式与所得数值。

### 5.5 `src/city/streetfurniture.js` — `createStreetFurniture(ctx0) -> SystemHandle`

全部 `InstancedMesh`：

- 路灯（弯颈灯杆 + 灯头，夜间灯头发光；沿所有街道每 32m 一盏，交替两侧）
- **红绿灯灯柱**（灯箱三色，**灯色由 `sim/traffic.js` 自己控制**——本模块只放"造型"，位置须与路口对齐，且导出 `handle.signalSlots: [{x,z,angleDeg,intersectionId}]` 供交通模块挂灯色；若交通模块未接管，本模块自行做固定循环兜底）
- 行道树（树干 + 3~5 层锥形树冠，风中轻摆，冬季/雪天挂雪）、消防栓、垃圾桶、长椅、报刊亭、井盖（供蒸汽用，导出 `handle.manholes: [{x,z}]`）
- 街边商铺雨棚与霓虹招牌（夜间发光）
- 总实例 ≥ 4000，drawcall ≤ 14。

### 5.6 `src/sculpt/terrain.js` — `createParkTerrain(ctx0) -> SystemHandle`

- 中央公园地形：`PlaneGeometry` 细分（约 220×140 段，边长 ≈ 4m）后**逐顶点位移雕刻**：低频丘陵 fbm + 中频起伏 + 高频细节。
- **下凹水塘**（真实凹陷）：以 `(x≈-150, z≈-1500)` 为中心的椭圆盆地，用 `smoothstep` 降深 4.5m，水面单独一片半透明网格；岸线用噪声扰动，不要正圆。
- 草地纹理靠顶点色 + 噪声（近处细节靠法线扰动），有小径（用低饱和度顶点色带绘出）、灌木与树丛（实例化）。
- **边缘必须与街面平滑衔接**（公园外圈 25m 内高度收敛到 0.0±0.05，避免悬空/穿插）。
- 导出 `handle.heightAtPark(x, z): number` 供其他模块（岩石/树/行人）贴地。
- 材质 `patchCityMaterial(..., { snowAmount: 1.0, puddles: true })`，雪天变白、雨天泥泞反光。

### 5.7 `src/sculpt/rocks.js` — `createRocks(ctx0, parkHeightFn) -> SystemHandle`

- 公园内 ≥ 14 处片麻岩露头（曼哈顿片岩特征）：`IcosahedronGeometry(detail 3~4)` 逐顶点 **fbm + worley 位移雕刻**，再沿某个平面做"切削"（层理），底部压平嵌入地形。
- 每块岩石形态不同（不同 rng 子流），大小 3~14m；表面用顶点色做深浅斑驳与苔藓。
- 第二个参数 `parkHeightFn(x,z)` 由 main.js 传入 `terrain.heightAtPark`，用于贴地（若为空则退化到 y=0）。
- 合并为 ≤ 2 个 drawcall（材质共享，几何 merge）。

### 5.8 `src/sculpt/statue.js` — `createStatue(ctx0) -> SystemHandle`

- 位置 `(-1500, 2200)`（自由岛，本模块自建岛屿基座地形），总高约 93m：星形要塞基座 + 花岗岩台座（47m）+ 铜像（46m）。
- **铜像必须体现雕刻手法**：
  - 躯干/长袍用 `LatheGeometry` 车削出轮廓后，**逐顶点做衣褶位移**（沿高度的正弦褶皱 × 噪声调制 × 越往下越深），褶皱需绕轴向不均匀。
  - 举火炬的右臂（分段圆柱 + 关节球，姿态自然）、持板的左臂、七道尖芒的冠冕、可辨认的头部（简化但有下巴/鼻梁起伏）。
  - 火炬金色发光（夜间点亮 + 轻微摇曳）。
- 铜绿材质：顶点色/噪声混出氧化铜绿 (#4e9b86) 与深铜色斑驳。
- 顶点 push 进 `tallStructures`；导出 `handle.torchLight`（PointLight）。

### 5.9 `src/sculpt/clouds.js` — `createClouds(ctx0) -> SystemHandle`

- **有体积感**：每朵云由 8~20 个 `IcosahedronGeometry` 球体聚合，每个球体逐顶点噪声位移出蓬松边缘；合并为单个几何后按云朵实例化。
- 三层：高层卷云（薄、快）、中层积云（主力，24~40 朵）、低层碎云（雨/雾天下压）。
- 材质：自定义 `ShaderMaterial` 或 `MeshStandardMaterial` + `onBeforeCompile`，需实现：
  - 依太阳方向的**朝阳面亮、背阳面暗**（半兰伯特 + 边缘透光），日落时染橙红；
  - 雷暴时云底压暗并被闪电从内部照亮（读 `env.uFlash`）；
  - 依 `ctx.weather.params.cloudCover` 控制**数量与不透明度**（云不够时隐藏多余实例，不要重建）。
- 随 `ctx.wind.vector` 漂移，超出边界后循环回卷（wrap）。
- `update(ctx)` 每帧只做矩阵更新与 uniform 写入，**禁止每帧重建几何**。
- drawcall ≤ 4。

## 6. 仿真与天气

### 6.1 `src/sim/traffic.js` — `createTraffic(ctx0) -> SystemHandle`

**这是"计算能力"的重点，必须是真仿真，不是循环动画。**

- 自建车道图：每条大道 2 向各 2 车道、每条街道 2 向各 1 车道、百老汇 2 向各 2 车道；车道中心线按 `CITY` 尺寸偏移计算。
- 信号相位：每个 `plan.intersections[i].hasSignal` 的路口一个相位机（南北绿 30s → 黄 4s → 东西绿 24s → 黄 4s，相位偏移按坐标错开形成"绿波"）。
- 车辆运动用 **IDM（Intelligent Driver Model）**：
  `a = a_max [ 1 − (v/v₀)^δ − (s*/s)² ]`，`s* = s₀ + max(0, v·T + v·Δv/(2√(a_max·b)))`
  参数：`v₀` 由道路类型定（大道 13.4 m/s ≈ 30mph、街道 9 m/s）、`a_max=1.6`、`b=2.2`、`δ=4`、`s₀=2.5m`、`T=1.4s`。
  红灯当作"距停止线处的静止前车"处理。**车辆之间不得穿插、不得穿越红灯**。
- 路口转向：到达路口按概率（直行 0.72 / 右转 0.18 / 左转 0.10）选择出边，转弯路径用二次贝塞尔平滑过渡，车头朝向跟随切线。
- 车辆外形 ≥ 5 类（轿车/出租车（黄）/SUV/公交/货车），`InstancedMesh` 渲染，车数按 quality：high 260 / medium 160 / low 90。
- 夜间车灯：前灯（暖白，小面片 + 加性混合）、尾灯（红），刹车时尾灯变亮；**不要每车一个 PointLight**（性能）。
- 雨雪天：降低 `v₀`（×0.75）、加大跟车距离；湿地面车轮溅水（可选）。
- 必须导出用于测试的纯函数：
  ```js
  export function idmAcceleration({ v, v0, gap, dv, aMax, b, s0, T, delta })  // -> 加速度 m/s²
  export function signalStateAt(intersectionPhaseOffset, timeSec)  // -> {ns:'green'|'yellow'|'red', ew:...}
  ```
- `handle.stats = { cars, instances }`；`handle.signalColorFor(intersectionId, axis)` 供街道家具灯箱取色（可选）。
- 若 `ctx0.signalSlots` 存在（main.js 传入街道家具的灯柱位置），须驱动其灯色。

测试 `tests/traffic.test.js`：IDM 在自由流下趋近 v₀、前车极近时加速度为负、相位机时序正确且循环、绿灯总时长占比合理。

### 6.2 `src/sim/agents.js` — `createAgents(ctx0) -> SystemHandle`

≥3 类非车辆动画体：

- **鸟群**：Boids 三规则（分离/对齐/聚合）+ 边界回引 + 高度偏好；2~3 群，每群 25~60 只；**翅膀扇动**（用两片薄面按正弦绕轴旋转，随速度改变频率）；雨雪天鸟群数量减少并降低高度。
- **直升机**：1~2 架，沿样条巡航（含高度变化与转向倾斜），主旋翼/尾桨高速旋转（旋翼用半透明圆盘 + 桨叶），夜间频闪红灯 + 探照灯（`SpotLight`，仅 high 画质）。
- **船只**：东河/哈德逊河 2~4 艘（拖轮/渡轮/驳船），沿河道往返，随水面轻微起伏与横摇，拖出 V 形尾迹（半透明面片 + 滚动 uv）；偶尔鸣笛（调 `ctx.audio.boatHorn()`，节流 ≥ 40s）。
- **行人**：人行道上的实例化简化人形（胶囊 + 摆动四肢，或方块化剪影），≥120 个，沿人行道方向行走，路口停走；low 画质可减半。
- 全部实例化，drawcall ≤ 10。

### 6.3 `src/weather/weather.js` — `createWeather(ctx0) -> WeatherSystem`

**状态机 + 平滑插值的唯一权威**。main.js 每帧先 `weather.update(dt)` 再读 `weather.params` 填进 ctx。

```js
export const WEATHER_PRESETS = { clear, cloudy, fog, rain, storm, snow }   // 每个是 WeatherParams
export function createWeather(ctx0)
```

```js
WeatherParams = {
  cloudCover: 0..1, cloudDarkness: 0..1, cloudHeight: number,
  fogDensity: number,          // 指数雾密度（建议 clear 0.00016 → fog 0.0035）
  fogColor: [r,g,b],           // 0..1
  skyTurbidity: 1..12, sunDim: 0..1,     // 阳光衰减（阴雨天压暗直射）
  ambientBoost: 0..1,
  rainIntensity: 0..1, snowIntensity: 0..1,
  wetnessTarget: 0..1, snowCoverTarget: 0..1,
  lightningPerMinute: number,  // 雷暴 ≈ 14
  windSpeed: number, windGust: number
}

WeatherSystem = {
  object3D: null,
  current: string, target: string, transition: 0..1,
  params: WeatherParams,       // 已插值
  set(name, immediate = false): void,   // 切换（默认 4.5s 平滑过渡）
  update(dt, ctx): void,
  dispose(): void
}
```

要求：

- 6 种预设：`clear` 晴、`cloudy` 多云、`fog` 雾、`rain` 雨、`storm` 雷暴、`snow` 雪。
- **平滑过渡**：所有数值参数按 `damp` 逼近目标（时间常数 ≈ 4.5s），颜色分量插值；**禁止硬切**。
- `wetness` 有**记忆**：雨停后按 ~60s 时间常数缓慢变干；`snowCover` 雪天以 ~90s 累积、晴天 ~150s 融化（融化时 wetness 短暂上升）。
- 风：`windSpeed` 在预设基础上叠加低频噪声阵风（`windGust`）。

测试 `tests/weather.test.js`：切换后参数单调逼近目标、不出现越界值、雨停后 wetness 衰减、雪后 snowCover 累积。

### 6.4 `src/weather/precipitation.js` — `createPrecipitation(ctx0) -> SystemHandle`

- **雨**：GPU 粒子（`Points` 或实例化细长四边形），跟随相机的盒形区域（约 260×160×260m），粒子在 shader 内按 `uTime` 下落 + wrap，**倾角由 `uWind` 决定**；速度 ~9 m/s；近处雨丝更长。数量：high 26000 / medium 14000 / low 7000。
- **雪**：更慢（~1.2 m/s）+ 水平飘摆（正弦 × 噪声）+ 自旋，粒子更大更软（圆形 alpha）。
- **地面雨溅**：雨强 > 0.3 时在相机附近生成环状涟漪贴花（实例化，≤ 200），生命周期 0.6s。
- 强度由 `ctx.weather.params.rainIntensity / snowIntensity` 驱动，通过**调整绘制数量**（`geometry.setDrawRange`）而非重建缓冲区。
- 全部用一个 `ShaderMaterial`（雨/雪各一），drawcall ≤ 4；`depthWrite = false`，`transparent = true`。

### 6.5 `src/weather/lightning.js` — `createLightning(ctx0) -> SystemHandle`

- 依 `ctx.weather.params.lightningPerMinute` 泊松触发。
- **打击点**：从 `ctx.tallStructures` 中按高度加权随机（越高概率越大，最高的几栋占主导），优先取相机视野内的。
- 闪电几何：从云底到打击点的**分叉折线**（递归分支 2~3 级，主干抖动），用 `LineSegments` 或细条带 + 加性混合，配合 0.06~0.18s 的多次闪烁（1~3 次 flicker）。
- 全局补光：写 `env.uFlash`（并让 `ctx.weather.flash` 反映），同时一个短寿命 `PointLight` 在打击点。
- **雷声**：`ctx.audio?.thunder(distance, strength)`，按 343 m/s 延迟（距离 = 打击点到相机）。
- 云层内部闪（无打击点的片状闪光）也要有，占比约 40%。
- 非雷暴天气不触发；`dispose` 时清理定时状态。

## 7. 天空与 UI

### 7.1 `src/sky/sky.js` — `createSky(ctx0) -> SystemHandle`

- 大半球/立方天空（`BackSide` 球，半径 9000），自定义 `ShaderMaterial`：
  - **大气散射近似**（Preetham 或 Hosek 简化版；也可用 Rayleigh 相函数手写），依太阳高度角产生黎明红霞 → 正午蓝白 → 黄昏橙紫 → 夜空深蓝的连续变化；
  - `turbidity` 由 `weather.params.skyTurbidity` 驱动，阴雨天变灰白；
  - 雾天时天空色须与 `scene.fog.color` 一致（避免天地割裂）。
- **星空**：夜间渐显（≥1500 颗，`Points`，亮度/色温随机，缓慢闪烁），随时间绕天极旋转（用真实天球旋转轴倾角 40.7° 即当地纬度）。
- **太阳盘**与**月亮**：月亮须按 `solar.moonPhase()` 显示相位（明暗界线），位置由 `moonPosition` 决定。
- 城市夜间**光污染**：地平线附近偏暖的辉光。
- 导出 `handle.getSkyColorAt(direction): THREE.Color`（供雾色/环境光取样，可近似）。
- drawcall ≤ 3。

### 7.2 `src/ui/panel.js` — `createPanel(handlers) -> PanelHandle`

**只负责把 index.html 里已有的 DOM 接上回调**（不要新建面板 DOM 结构）。

```js
export function createPanel(handlers)
// handlers = {
//   onWeather(name), onTime(minutes), onTimeScale(x), onSeason(dayOfYear),
//   onSeed(seedString), onRandomSeed(), onCameraMode(mode), onCameraPreset(name),
//   onWind({dirDeg, speed}), onAudioToggle(on), onHudToggle(on), onQuality(level)
// }
// -> { setWeather(name), setTime(minutes), setSeed(s), setCameraMode(m), setLoading(visible, text, progress01), dispose() }
```

元素 id 见 `index.html`：`#weather-buttons [data-weather]`、`#time-slider`、`#time-value`、`#timescale-slider`、`#timescale-value`、`#season`、`#seed-input`、`#seed-apply`、`#seed-random`、`#camera-mode`、`[data-camera-preset]`、`#wind-dir`、`#wind-speed`、`#wind-dir-value`、`#wind-speed-value`、`#toggle-audio`、`#toggle-hud`、`#quality`、`#panel-toggle`、`#panel`、`#panel-body`、`#loading`、`#loading-fill`、`#loading-text`、`#hint`。

行为：滑块拖动实时回调（不等 change）；时间显示格式 `HH:MM`；切换天气时更新 `.wbtn.is-active`；面板折叠切换 `#panel.collapsed`；启动 8 秒后给 `#hint` 加 `.hidden`。

### 7.3 `src/ui/hud.js` — `createHud() -> HudHandle`

```js
export function createHud()
// -> { update(ctx, renderer, extra), setVisible(on), dispose() }
// extra = { cars, instances, seed }
```

- 每 **0.5s** 刷新一次文本（不要每帧写 DOM）；FPS 用 250ms 滑动窗口。
- 读 `renderer.info.render.calls / triangles`；时间显示 `HH:MM`；天气显示中文名；太阳高度角保留 1 位小数并带 `°`。
- `#hud` 元素缺失时安全空转。

## 8. main.js（集成方负责，其他人不要动）

职责：创建 renderer/scene/camera/controls、构建全部系统、装配 ctx、主循环、相机模式、种子重建、`window.__bench` 测试接口。
其他模块**不要**在自己文件里创建 renderer、camera 或调用 `requestAnimationFrame`。

`window.__bench`（供无头测试驱动）：

```js
{
  ready: boolean,
  step(seconds): void,       // 手动推进一帧（rAF 被冻结时用）
  setWeather(name), setTime(hours), setSeed(str), setCameraPreset(name), setQuality(level),
  stats(): { fps, draws, tris, instances, cars, simHours, weather, sunElevationDeg, seed },
  cityHash(): string         // 城市几何摘要，用于验证同种子确定性
}
```

## 9. 性能与验收预算

| 指标 | 目标 |
|---|---|
| 桌面 1080p 帧率 | ≥ 60fps（high 画质，默认视角） |
| drawcall | ≤ 150 |
| 三角形 | ≤ 1.8M |
| 启动构建耗时 | ≤ 2.5s |
| 控制台 | 零 error / 零 warning |
| 内存 | 重建城市 10 次不增长（dispose 必须彻底） |

## 10. 测试要求

- 用 `vitest`，测试放 `tests/*.test.js`，**只测纯逻辑**（不要在测试里 new WebGLRenderer）。
- 必测：`rng` `noise` `mathx`（含悬链线）`solar`（含真实角度断言）`grid` `skyline` `traffic`（IDM/相位）`weather`（过渡）。
- 涉及 Three.js 对象的模块可只做浅层导出检查，或跳过。
- 命令：`npm test`（等价 `vitest run`）。
