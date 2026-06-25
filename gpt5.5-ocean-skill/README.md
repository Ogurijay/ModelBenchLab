# GPTSkill Ocean

Three.js + Vite 的真实感海面模拟。核心效果基于 Gerstner wave（盖斯特纳波）和深水波色散关系，支持风速、风向、浪涌、浪峰、白沫和时间倍率调整。

## 运行

```powershell
npm install
npm run dev
```

## 验证

```powershell
npm run build
$env:OCEAN_URL="http://127.0.0.1:4173"; npm run verify
```

`npm run verify` 会用 Playwright 检查桌面和移动端视口，确认 canvas 非空、画面有动态变化，并验证 OrbitControls（轨道相机控制）能拖动。
验证脚本会自动追加 `?preserveBuffer=1`，只在测试时打开 WebGL 后缓冲读取。

## 物理说明

更完整的模型说明在 [docs/physics-model.md](docs/physics-model.md)。
