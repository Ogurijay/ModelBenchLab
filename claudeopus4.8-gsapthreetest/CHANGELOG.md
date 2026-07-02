# 改动记录 — claudeopus4.8-gsapthreetest

## [1.0.1] — 2026-06-30

### 修复
- **滚动后 3D 画面消失**:根因是 R3F 给 `<Canvas>` 容器加的内联 `position: relative` 覆盖了 CSS class 的 `position: fixed`,Canvas 退化为首屏元素、一滚即滚出视野。改用 Canvas `style` 属性强制 `position: fixed` 解决。
- **首屏 hero 文字不可见**:`gsap.from`+ScrollTrigger 对首屏元素的 `immediateRender` 陷阱。hero 改为「加载即播放」动画。
- **中段画面偏空**:相机改为沿共享「中心线」飞行、并 `lookAt` 中心线前方(而非曲线切线),前方光环全程稳定在视野内。

### 变更
- 相机驱动从 `CatmullRomCurve3 + getPointAt` 改为更稳的中心线函数 `centerline(z)`(`src/curve.js`),`CameraRig` 合并进 `Scene.jsx` 的 `CameraFlight`。
- 文案与 README/HANDOVER 同步更新,新增「Canvas 必须真正固定」专节(踩坑经验)。

## [1.0.0] — 2026-06-30

### 新增
- 初始化项目:React Three Fiber + GSAP ScrollTrigger,相机随滚动穿越光环隧道。
- 组件:相机飞行、`Tunnel`(光环)、`FloatingShapes`(drei Float)、`Overlay`(滚动文案 + 进度条)。
- R3F × GSAP 最佳实践:全程 `useGSAP` 托管生命周期;`scrub` 写进度、`useFrame` 平滑写相机的解耦方案。
- 配置:Vite + `@vitejs/plugin-react`,固定端口 3014;`README` / `HANDOVER` / `CHANGELOG` 三件套。

### 门户登记（根目录统一资源）
- `index.html`:新增「交互 / 滚动动画」分区及本项目卡片(端口 3014,WebGL 徽章)。
- `package.json`:`dev` 脚本(concurrently)追加 `vite --port 3014 claudeopus4.8-gsapthreetest`,补 `-n`/`-c` 项;新增 `dev:gsap-three` 单独启动脚本。
- 端口分配表(RULES.md):3014 → claudeopus4.8-gsapthreetest。
