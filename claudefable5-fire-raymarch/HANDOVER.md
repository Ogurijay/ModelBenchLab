# 交接文档

## 当前状态

- 状态：可运行、可构建、已接入统一门户。
- 技术栈：Three.js r185、WebGL、Vite 8、原生 JavaScript。
- 评测端口：`3033`，常规使用统一门户端口 `3000`。
- 外部资产：无，场景、噪声、火焰、火星和烟羽均由程序生成。

## 实现结构

- `src/main.js`：应用装配、主循环、尺寸与质量控制。
- `src/fireComposite.js`：体积火焰合成和光线步进。
- `src/firelight.js`：动态火光与阴影。
- `src/sparks.js`：火星和伴随粒子。
- `src/bench.js`：`window.__bench` 自动评测接口。
- `src/ui.js`：中文实时控制面板。

## 已验证

- `npm run sync:check` 通过，registry、workspace 和项目目录一致。
- `npm --prefix claudefable5-fire-raymarch run build` 通过。

## 后续关注

- 进行固定机位截图与多角度审美盲评。
- 在桌面 1080p 环境记录帧率、采样步数和绘制调用。
- 与同任务其他模型实现使用相同输入锁、参数锁和评判锁比较。
