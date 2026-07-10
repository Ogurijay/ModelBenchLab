# HANDOVER — claudefable5-cloth-flag

## 项目概况

- **任务**:`benchmark/tasks/code-to-3d/cloth.md`(冻结 v1 · 2026-07-10)— 旗帜布料模拟,mission=cloth / variant=flag / 模型 Claude Fable 5
- **实现方式**:Three.js `^0.185.0` + **纯自写 Verlet 布料物理**(无任何物理 / 布料库),JavaScript ESM,Vite `^8.1.2`
- **端口**:3025(`vite.config.js` 中 server/preview 均已固定;根 registry 已预留)
- **启动**:依赖由仓库主会话统一安装,项目内**不要**单独 `npm install`;`npm run dev` → http://localhost:3025

## 技术架构

| 文件 | 职责 |
|---|---|
| `index.html` | 入口、HUD 标题与操作提示、面板挂载点、内联 SVG favicon |
| `src/main.js` | 装配全部子系统;固定 1/120 子步主循环(累加器,上限 5 子步);`__bench` 状态组装 |
| `src/config.js` | 布料尺寸(3×2m)、旗杆几何、默认参数、`segYFor()` 分辨率比例推导 |
| `src/cloth.js` | **物理核心**:Verlet 积分、结构+剪切约束求解、撕裂、旗杆/地面碰撞、BufferGeometry 零拷贝回写 |
| `src/wind.js` | 风场:方向/强度滑杆 + 三层正弦阵风包络 + 空间相位非均匀扰动 |
| `src/interaction.js` | 指针抓取:raycast 命中 → 最近粒子 → 相机正交平面拖拽;悬停 grab 光标;抓取时禁用 OrbitControls |
| `src/scene.js` | 渲染器(ACES/阴影)、相机、三灯光照、天空穹顶 shader、雾、地面、旗杆、晾布绳桩、远山、飘尘 |
| `src/textures.js` | 程序化 canvas 纹理:旗面「乘风」图案(旭日/波浪/织物经纬)、四方连续草地 |
| `src/ui.js` | 自写轻量参数面板(无 lil-gui):8 滑杆 + 模式切换 + 撕裂开关 + 重置 + 统计 |
| `src/bench.js` | `window.__bench` 钩子实现 |
| `src/style.css` | HUD 与面板样式(暗色玻璃拟态,金色强调) |

## 核心系统清单

1. **Verlet 积分**(`cloth.js#_integrate`):`pos' = pos + (pos − prev)·(1 − damping) + a·dt²`;pos/prev/accel 均为 Float32Array;固定 dt=1/120,主循环累加器最多 5 子步防螺旋死亡。
2. **距离约束**(`_buildConstraints` / `_solveConstraints`):结构(横+竖)+ 剪切(每格两对角),Gauss-Seidel 投影,按 invMass 加权;迭代次数 = 刚度参数(1–15,默认 5)。默认 32×21 网格:726 粒子 / 2741 约束(结构 1397 + 剪切 1344)。
3. **风力**(`_accumulateForces`):逐面片 `F = n̂ · dot(n̂, wind − v_tri) · area · k`,质心处采样风场(空间非均匀);风速为 0 时退化为 `-v` 气动阻尼。阵风 = 三层不同频率正弦包络 + 风向摆动(`wind.js`)。
4. **抓取拖拽**(`interaction.js`):pointerdown raycast 旗面 → `nearestParticle` → 拖拽平面 = 过抓取点、法线为相机视线;拖拽中该粒子 invMass=0 且 pos=prev=目标点(零速度钉扎),松手恢复 invMass 并清零瞬时速度。
5. **固定点模式**(`setPinMode`):`edge` = 左列整边钉在旗杆侧;`corners` = 左上+右上两角(晾布),场景联动显示晾布绳与木桩;切换时重置布料。
6. **L4 撕裂**(`_tearConstraint`):约束长度 > rest×阈值(默认 1.6,可调 1.2–3.0)即断开,并把毗邻网格单元的 6 个索引置退化隐藏面片;重置可完全恢复(index0 备份)。
7. **碰撞**:旗杆竖直圆柱(半径 0.085 推出)+ 地面(y 钳制 + 水平摩擦 0.6)。
8. **渲染**:position attribute 直接引用物理数组(零拷贝),每帧 `needsUpdate + computeVertexNormals()`;材质 DoubleSide 双面受光;boundingSphere 半径 ×2.5 保证 raycast 稳定。

## 调试钩子(window.__bench)

```js
__bench.ready            // 首帧渲染后 true
__bench.stepFrame(60)    // 手动推进 60 帧(每帧 dt=1/60,物理子步+渲染),隐藏标签页可用;返回推进帧数
__bench.getState()       // JSON 快照:fps/frame、resolution、particles、constraints(结构/剪切/存活/撕裂)、
                         // pinMode、iterations、gravity、damping、wind(含瞬时有效风速)、
                         // dragging、avgSpeed(平均粒子速度)、clothCenter、freeCorner(自由角坐标)
```

验证布料在动:连续两次 `getState()` 对比 `freeCorner` / `avgSpeed`。

## 已知限制

- 撕裂只断约束 + 隐藏面片,不做真实拓扑切割 / 撕裂边缝合
- 无布料自碰撞(仅旗杆圆柱 + 地面);极端风速下布可穿过自身
- 阵风为程序化正弦叠加,非流体求解
- 拖拽平面在抓取瞬间固定,拖拽中旋转相机不重建平面(交互上无感)
- 分辨率滑杆在 `change`(松手)时才重建,避免拖动过程反复重分配

## 后续可做

- Web Worker + SharedArrayBuffer 物理线程,主线程只渲染
- 弯曲约束(跨两格)与经纬各向异性刚度
- 空间哈希自碰撞;撕裂边缘毛边 / 布纹细节
- 旗杆顶滑轮 + 升旗动画;昼夜光照切换
