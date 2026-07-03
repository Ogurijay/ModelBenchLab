# 粉末物理沙盒 100.0-CN

`gpt5.5-powdergame` 是一个受 The Powder Toy 启发的中文浏览器物理沙盒。项目没有复制原游戏源码或素材，而是用 TypeScript + Canvas 从零实现逐格粒子模拟。

## 运行

```powershell
npm --prefix E:\Web3dTest\gpt5.5-powdergame run dev -- --port 3018
```

根工作区也提供单独脚本：

```powershell
npm run dev:powdergame
```

## 主要能力

- 中文元素表：元素名保留原符号，例如 `水(H2O/WATR)`、`碱(BASE)`、`种子(SEED)`。
- 元胞自动机：每个像素格按邻域规则更新，适合模拟粉末、液体、气体和能量粒子。
- 热力学：热传导、热容量、熔化、凝固、沸腾、冷凝。
- 流体与空气：密度交换、液体横向流、气体浮升、环境风、压力扩散、涡量。
- 化学反应：酸腐蚀、碱中和酸、盐溶于水、熔岩遇水、氢氧燃烧。
- 电学：电池、导线、金属、半导体、火花传播与点燃。
- 高能粒子：铀、中子、光子、等离子、黑洞吸收。
- 生命规则：`SEED` 在水和支撑物附近生长为植物/木头。
- 视图模式：常规、热量、压力、电路。
- 本地保存：使用 `localStorage` 保存/读取当前沙盒。

## 参考口径

官方网页当前显示 The Powder Toy `100.0`，GitHub 最新 release 为 `v100.0.399`。本项目吸收了 100.0 方向中的 `BASE`、`SEED`、环境气压/风速、管道导热思路和动态热显示，但实现为浏览器版轻量规则系统。

## 结构

```text
src/
  simulation/   粒子、温度、压力、反应、电路等可测试规则
  render/       Canvas 像素渲染
  input/        鼠标/触控绘制
  ui/           中文 HUD 与控制面板
  diagnostics/  window.__powderGame 调试桥
tests/          Vitest 规则测试
```

## 验证

```powershell
npm --prefix E:\Web3dTest\gpt5.5-powdergame run test
npm --prefix E:\Web3dTest\gpt5.5-powdergame run build
```
