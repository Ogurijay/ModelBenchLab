# 交接文档 — claudeopus4.8-gsapthreetest

## 一句话
用 GSAP `ScrollTrigger` 驱动 Three.js 相机随页面滚动沿中心线飞行,穿越光环隧道,基于 React Three Fiber,并示范 R3F × GSAP 的正确集成方式。

## 当前状态
- 已完成,可运行(`npm run dev` → `http://localhost:3014`),滚动飞行全程正常。
- 已用有头 playwright 逐帧验证:顶部 hero 文字可见、隧道入口正常;中段/末段相机穿越光环、画面充实。
- 已登记到根门户:`index.html` 新增「交互 / 滚动动画」分区卡片;根 `package.json` 增加端口 3014 编排与 `dev:gsap-three` 脚本。

## 技术方案
- **渲染**:R3F `<Canvas>`,`frameloop` 默认 `always`。**用 `style` 属性固定**(见下「已知坑」)。
- **相机飞行(核心,`src/components/Scene.jsx` 的 `CameraFlight`)**:
  1. `useThree()` 取 R3F 托管 camera;
  2. `useGSAP()` 内用 `ScrollTrigger`(`scrub:true`)把滚动写入代理值 `state.target`(0→1);
  3. `useFrame()` 每帧 `lerp` 追 target,按进度算 z,再从 `centerline(z)` 取相机位置、`lookAt(centerline(z-12))` 看向前方。
  → 滚动与渲染解耦,单一数据源,无属性争抢。
- **中心线**:`src/curve.js` 的 `centerline(z)`,相机与光环共用,使相机从每个环轴心穿过。
- **物体**:`Tunnel`(沿中心线的 emissive 光环)、`FloatingShapes`(drei `Float`)、`Stars` 背景。
- **生命周期**:全程 `useGSAP`,卸载/HMR 自动 `revert`,StrictMode 安全。

## 已知坑 / 注意事项
- **★ `<Canvas>` 必须用 `style` 属性固定**:R3F 给容器加内联 `position: relative`,会覆盖 CSS class 的 `position: fixed`,导致 Canvas 退化成首屏元素、一滚就滚出视野(表现为「滚动后 3D 变黑」)。务必 `<Canvas style={{ position:'fixed', inset:0, width:'100vw', height:'100vh' }}>`。自查:`document.body.scrollHeight` 多出一个视口高度即是没固定住。
- **首屏 `gsap.from`+ScrollTrigger 陷阱**:首屏元素会被 `immediateRender` 成隐藏态、`onEnter` 又不触发 → 看不到。首屏 hero 用「加载即播放」动画。
- **`lookAt` 用前方点而非切线**:沿曲线飞行时严格用切线会在弯折处把视野带离前方物体;看「前方一段」更稳。
- **frameloop=demand**:若改按需渲染,GSAP `onUpdate` 里要 `invalidate()`。
- **物理光照**:three 新版 `pointLight.intensity` 偏大才有效;物体多用 emissive 自发光降低依赖。

## 后续计划
- [ ] 接 postprocessing Bloom,增强光环辉光。
- [ ] drei `<ScrollControls>` 原生滚动对照版。
- [ ] 中心线参数可视化编辑 / 移动端 `100dvh` 适配。

## 相关文件
- 核心:`src/components/Scene.jsx`(CameraFlight)、`src/curve.js`
- 滚动 DOM 与 ScrollTrigger 示范:`src/components/Overlay.jsx`
- Canvas 固定:`src/App.jsx`
