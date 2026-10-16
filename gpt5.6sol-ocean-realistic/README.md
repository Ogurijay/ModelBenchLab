<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/gpt5.6sol-ocean-realistic/ 。
并行开发（仓库根目录）：`npm run dev:one -- gpt5.6sol-ocean-realistic`，访问 http://localhost:3024/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# GPT 5.6 SOL Ocean

这是一个独立的 Three.js + WebGL 写实海面基准项目。场景只保留海面与天空，把 GPU（图形处理器）预算集中用于波浪轮廓、微法线、菲涅尔反射、太阳光路和程序化浪尖泡沫。

## 视觉模式

- **清冽正午**：高太阳、蓝绿深海，最适合观察波浪结构和反射。
- **低角度晨光**：暖色太阳贴近地平线，产生长距离金色光路。
- **银灰阴天**：宽软光与低饱和天空，呈现纪录片式海况。

三个模式使用同一套海浪物理，只平滑改变天空、太阳、海色、雾、粗糙度和曝光。

## 风暴与降雨

风暴是独立天气叠加层，可覆盖在任一光照模式上。启用后会在 2.4 秒内平滑压暗天空、增加雾和云量、提高浪高与浪尖泡沫，并打开相机跟随的 GPU（图形处理器）程序化雨场；关闭后按相同方式退场。桌面档使用 12,000 个雨滴，移动档使用 5,000 个雨滴，雨滴位置由固定种子生成，便于稳定复现。

## 技术方案

- 12 组确定性风驱 Gerstner（特罗科伊德）波，固定随机种子保证复现。
- 顶点着色器计算海浪位移与解析法线。
- 片元着色器叠加双尺度程序化微法线、深水吸收色、菲涅尔反射和破碎泡沫。
- 程序化天空穹顶包含太阳盘、地平线雾化与五层 FBM（分形布朗运动）云层。
- 海面网格跟随相机重定位，但使用连续世界坐标计算波形，避免“浪粘在网格上”。
- 桌面和移动端使用不同几何密度；持续低帧率时自动降低像素比。

## 运行

从仓库根目录执行：

```powershell
npm run dev:one -- gpt5.6sol-ocean-realistic
```

打开 `http://localhost:3024/`。

也可以在本目录独立运行：

```powershell
npm run dev
```

## 操作

- 鼠标拖拽：旋转观察方向。
- 滚轮：缩放观察距离。
- 页面底部按钮：切换正午、晨光、阴天。
- 数字键 `1`、`2`、`3`：切换对应光照预设。
- 风暴按钮或 `S` 键：独立开关风暴与降雨，可与三个光照预设组合。

相机会根据 CPU 海面采样自动保持在波峰上方，不能穿入水面。

## 验证

```powershell
npm test --workspace gpt5.6sol-ocean-realistic
npm run build --workspace gpt5.6sol-ocean-realistic
npm run sync:check
```

页面提供 `window.__ocean` 只读约定式诊断入口，字段包括：

- `ready`：首帧是否已完成。
- `frames`：累计渲染帧数。
- `activePreset`：当前或正在切换的预设。
- `stormEnabled`：风暴目标状态是否开启。
- `stormIntensity`：风暴当前插值强度，范围 `0—1`。
- `rainDrops`：当前质量档的 GPU 雨滴数量。
- `quality`：`high` 或 `mobile`。
- `webgl`：WebGL 渲染器是否已建立。
- `fps`：最近一秒平均帧率。

## 结构

```text
src/
  environment/
    presets.js   # 三套环境参数与平滑插值
    sky.js       # 程序化天空 GLSL
  ocean/
    spectrum.js  # 风驱波谱与 CPU 采样
    material.js  # 海面 GLSL
  ui/
    controls.js  # 按钮和快捷键
  weather/
    storm.js     # 独立风暴状态与环境叠加
    rain.js      # 确定性 GPU 雨场
  main.js        # Three.js 场景装配与渲染循环
  styles.css     # HUD 与响应式界面
tests/           # Vitest 单元与页面契约测试
docs/            # 设计、实施计划与 QA 截图
```
