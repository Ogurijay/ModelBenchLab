# GSAP ScrollTrigger × Three.js · 相机随滚动飞行（React Three Fiber）

滚动页面,相机沿一条平滑中心线穿越光环隧道——所有镜头运动都由 GSAP `ScrollTrigger` 的滚动进度驱动。本项目同时是一份「**在 R3F 里正确配合 GSAP**」的最佳实践范例。

> 模型：Claude Opus 4.8 · 端口：`3014` · 渲染：WebGL（React Three Fiber）

---

## 快速开始

```bash
npm install
npm run dev        # → http://localhost:3014
```

也可从仓库根目录用门户脚本启动：`npm run dev:gsap-three`。

---

## 技术栈

| 作用 | 库 |
|------|----|
| 视图 | React 19 |
| 3D 渲染 | three + @react-three/fiber（R3F） |
| 3D 辅助组件 | @react-three/drei（`Stars` / `Float`） |
| 动画 / 滚动 | gsap + `ScrollTrigger` |
| React 集成 | @gsap/react（`useGSAP`） |
| 构建 | Vite + @vitejs/plugin-react |

---

## 核心实现：相机随滚动飞行

相机与光环隧道共用一条「中心线」函数。相机沿它飞行，并**看向中心线前方约 12 个单位**，于是前方的环始终落在视野正中（见 [`src/components/Scene.jsx`](src/components/Scene.jsx)）。

```jsx
// curve.js —— 相机与隧道共用的中心线（x/y 随 z 平滑摆动）
export function centerline(z) {
  return [Math.sin(z * 0.16) * 1.9, Math.cos(z * 0.12) * 1.4]
}

// Scene.jsx —— ScrollTrigger 只写进度，useFrame 平滑落位
useGSAP(() => {
  gsap.to(state, {
    target: 1, ease: 'none',
    scrollTrigger: { trigger: '#scroll', start: 'top top', end: 'bottom bottom', scrub: true },
  })
}, { dependencies: [state] })

useFrame(() => {
  state.progress += (state.target - state.progress) * 0.08   // 平滑追赶
  const z = Z_START + (Z_END - Z_START) * state.progress
  const c = centerline(z)
  camera.position.set(c[0], c[1], z)
  const l = centerline(z - 12)
  camera.lookAt(l[0], l[1], z - 12)                          // 看向中心线前方
})
```

精髓:**把「滚动」和「写相机」拆开** —— ScrollTrigger 产出进度,`useFrame` 平滑落位。两者解耦,既顺滑又不会出现「两处同时改 `camera.position`」的抖动。

---

## R3F × GSAP 最佳实践

> 在 React Three Fiber 里用 GSAP,踩坑大多集中在「生命周期」「谁来写属性」和「Canvas 定位」三件事上。

1. **用 `@gsap/react` 的 `useGSAP()`,不要裸 `useEffect`。** 它把回调里创建的 tween / ScrollTrigger 收进 `gsap.context`,卸载 / 依赖变化 / HMR 时自动 `revert()`,杜绝 ScrollTrigger 泄漏与重复绑定,连 `StrictMode` 双调用都安全。
2. **插件模块顶层注册一次**:`gsap.registerPlugin(ScrollTrigger)`(`useGSAP` 是 hook,不用注册)。
3. **用 `useThree()` 拿对象,绝不自己 new**:`const { camera } = useThree()`。
4. **单一数据源 —— 一个属性只让一处写。** 相机交给 GSAP / useFrame 其一,不要两处都写 `camera.position`。本项目:ScrollTrigger 写进度,useFrame 写相机。
5. **平滑放渲染端**:`useFrame` 里 `lerp`,与帧率无关、最跟手。
6. **`frameloop`**:默认 `always` 自动渲染;若改 `demand` 省电,必须在 `onUpdate` 里 `invalidate()`。
7. **`trigger` 指向真正滚动的 DOM**(`#scroll`),`<Canvas>` 是固定层不能当 trigger。
8. **看向「前方一段」而非曲线切线**:沿路径飞行时,`lookAt` 一个稍远的前方点(本项目用中心线前方 12 单位)比严格用切线更稳 —— 切线在弯折处会把视野带离前方物体。

---

## ⚠️ 必读的坑：`<Canvas>` 必须「真正」固定

全屏背景式的 R3F 场景,惯例是让 `<Canvas>` `position: fixed` 铺满视口、让上层 DOM 滚动。但 **R3F 会给 Canvas 容器加一段内联 `position: relative`,它的优先级高于你 CSS class 里的 `position: fixed`** —— 于是 Canvas 退化成普通流里占首屏的一个元素,`scrollY=0` 时能看到 3D,**一滚就把整块画布滚出视野**(表现为「滚动后 3D 全黑/消失」)。

正确做法是用 **Canvas 的 `style` 属性**设置定位(内联 style 会覆盖 R3F 默认):

```jsx
<Canvas
  style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh' }}
  camera={{ fov: 60, position: [0, 0, 12] }}
>
```

> 自查信号:`document.body.scrollHeight` 比你预期的滚动内容**多出一个视口高度** —— 那多出来的就是没固定住、占着首屏的 Canvas。

---

## 目录结构

```
claudeopus4.8-gsapthreetest/
├── index.html / vite.config.js
├── src/
│   ├── main.jsx            # React 挂载（StrictMode）
│   ├── App.jsx             # 固定 Canvas（style 定位）+ 滚动 Overlay
│   ├── index.css           # 布局与玻璃拟态卡片
│   ├── curve.js            # 中心线函数 + Z 区间
│   └── components/
│       ├── Scene.jsx       # ★ 灯光/星空/相机飞行（CameraFlight）
│       ├── Tunnel.jsx      # 沿中心线排布的光环
│       ├── FloatingShapes.jsx  # 漂浮多面体（drei Float）
│       └── Overlay.jsx     # 滚动文案 + 进度条（ScrollTrigger 驱动 DOM）
└── README.md / HANDOVER.md / CHANGELOG.md
```

---

## 常见坑（FAQ）

- **滚动后 3D 画面消失/变黑?** 见上方「Canvas 必须真正固定」—— 99% 是这个。
- **顶部首屏看不到文字?** 别对首屏元素用 `gsap.from(..., { scrollTrigger })`:它会 `immediateRender` 成隐藏态,而 `onEnter` 在加载时不触发。首屏内容用「加载即播放」的动画(本项目 hero 卡片即如此)。
- **HMR 后动画重复 / 越来越卡?** 没用 `useGSAP`(或没 revert)导致 ScrollTrigger 叠加。换成 `useGSAP` 即可。
- **滚到中段 3D 变空?** 检查相机 `lookAt` 是否被曲线切线带偏 —— 改看「前方一段」。

---

## 扩展方向

- 接 `@react-three/postprocessing` 的 Bloom,让 emissive 光环辉光更强。
- 用 drei `<ScrollControls>` + `useScroll()` 做一版「R3F 原生滚动」对照(不依赖 GSAP)。
- 中心线函数参数化,做成可调的镜头路径编辑器。
