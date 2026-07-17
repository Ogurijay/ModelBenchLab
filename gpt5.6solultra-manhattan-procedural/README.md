# Manhattan Storm Shift（曼哈顿风暴换班）

GPT 5.6 SOL Ultra 对仓库冻结任务 `code3d-manhattan-001` 的独立实现：在浏览器中用纯代码生成一座可辨认、可运行、可计算验证的 3D 曼哈顿。它不是静态城市模型，而是一套把建模、顶点雕刻、动画、天气和仿真绑在同一场景里的综合能力基准。

## 快速开始

从仓库根目录启动统一门户：

```powershell
npm install
npm run dev
```

访问：`http://localhost:3000/gpt5.6solultra-manhattan-procedural/`

单项目调试可使用：

```powershell
npm run dev:one -- gpt5.6solultra-manhattan-procedural
```

页面默认运行约 69 秒一昼夜的“风暴换班”编排。控制台可手动选择六种天气、拖动纽约时刻、输入种子重建城市、改变风速，并在自动环游与自由轨道相机间切换。

## 能力证据

| 能力 | 实现与可验证证据 |
|---|---|
| 建模 | 9 条大道、19 条街、Broadway 斜切与真实三角地块；382–385 个确定性楼宇地块；帝国大厦、克莱斯勒、One WTC（世贸中心一号楼）、熨斗大厦等地标；街具与悬索桥 |
| 3D 雕刻 | 中央公园高细分网格的顶点位移、低于岸线的湖盆、非规则岩石、带冠/炬/法典/衣褶的自由女神、三维体积云 |
| 动画绘制 | 太阳/月亮/星空/窗灯联动；144 辆固定步长交通；红灯停车、路口转向、跟车防撞；鸟群、直升机和船；环境蒸汽与样条环游 |
| 天气 | 晴、多云、晨雾、降雨、雷暴、降雪六态平滑插值；风影响云和降水；湿路、积雪、雾层、命中最高避雷点的闪电与程序化雷声 |
| 计算 | 种子城市函数；NOAA 风格太阳位置、悬链线、双峰天际线三类公式；IDM（智能驾驶模型）式跟车；实例化渲染和实时性能 HUD |

更完整的连续用例、观察窗口与评分建议见 [`docs/SCENARIO.md`](docs/SCENARIO.md)。

## 目录结构

```text
src/
├─ core/       PRNG（伪随机数）、噪声、太阳/悬链线/天际线公式
├─ world/      城市规划、楼群、地标、公园、雕像、桥梁与街具
├─ sim/        信号交通与鸟/直升机/船等动画体
├─ weather/    六态天气、降水、闪电和 WebAudio 雷声
├─ render/     天空、昼夜光照、相机环游
├─ ui/         中文控制台与 HUD（抬头显示）
├─ config.js   冻结坐标、地点和配色常量
└─ main.js     生命周期、固定步长与自动评测接口
```

## 真实公式

1. **太阳位置**：根据纬度、年积日、太阳赤纬和时角计算太阳高度角与方位角。页面固定纽约纬度 `40.7128°N`，昼夜光照与天体位置读取同一计算结果。
2. **悬链线**：桥梁主缆使用 `y = a·cosh(x/a) - a`，再通过二分法从桥跨和垂度反解参数 `a`；吊索长度取自主缆真实高度。
3. **双峰天际线**：Downtown（下城）与 Midtown（中城）用两个高斯峰叠加，再乘横向衰减，形成曼哈顿典型的“两簇高楼、中间低谷”。
4. **交通跟车**：用期望车速、相对速度和安全时距计算纵向加速度，并把红灯停止线作为虚拟前车；仿真以 `1/60 s` 固定步长推进。

## 自动评测

页面暴露 `window.__BENCH__`：

```js
await window.__BENCH__.reset(42);
window.__BENCH__.setTime(16);
window.__BENCH__.setWeather('storm', 0);
window.__BENCH__.step(1 / 60, 3600);
console.table(window.__BENCH__.getMetrics());
console.log(window.__BENCH__.getCityHash());
```

`scene`、`camera`、`renderer` 也直接开放给本地评分器。真实对象以 `userData.benchRole` 标注语义，使测试可检查几何、实例矩阵、材质参数和轨迹，而不是只读取自报 JSON。

## 验证

```powershell
npm --workspace gpt5.6solultra-manhattan-procedural test
npm --workspace gpt5.6solultra-manhattan-procedural run build
npm run sync:check
```

视觉验收使用 1920×1080、DPR 1，依次重建 `1337 / 2026 / 42`，每种天气至少观察 10 秒，并覆盖一个完整昼夜。HUD 显示 FPS（每秒帧数）、draw call（绘制调用）、三角形、实例与车辆数量。

本次自动验收结果保存在 [`docs/qa/browser-report.json`](docs/qa/browser-report.json)：32 项单元测试全绿，1920×1080 浏览器检查全部通过，60 秒交通快进为 0 次碰撞、0 次红灯违规。截图位于 [`docs/qa/`](docs/qa/)。

## 零外部资产

项目没有模型、贴图、HDRI、图片或音频文件，也不发起外网请求。雷声由 WebAudio 实时合成；浏览器要求先由用户点击“启用雷声”解锁音频。完整清单见 [`docs/ASSET_PROVENANCE.md`](docs/ASSET_PROVENANCE.md)。
