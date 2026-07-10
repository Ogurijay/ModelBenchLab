# 回声画廊 · claudefable5-gallery-lighting

Three.js 第一人称漫游小型美术馆(benchmark mission: `gallery`,模型 Claude Fable 5,variant `lighting`)。

八件展品(5 画作 + 3 雕塑)沿一条 S 形动线布置:每件展品一盏半影射灯,檐口 RectArea 洗墙补光,头顶天窗可一键开关——昼夜切换时阳光、面光、色温、曝光、天穹颜色整体联动过渡。全部几何与纹理程序化生成,零外部资产。

## 启动

```bash
# 依赖由仓库主会话统一安装(three ^0.185.0 · vite ^8.1.2)
npm run dev -- --port 3024 --strictPort
# 浏览器打开 http://localhost:3024
```

构建:`npm run build`,预览:`npm run preview`。

## 操作

| 输入 | 行为 |
|---|---|
| 点击进入界面 | 锁定指针,进入展厅 |
| `W A S D` / 方向键 | 移动(不可穿墙、穿展品) |
| 鼠标 | 环视 |
| `Shift` | 快走 |
| `L` / 右上角按钮 | 切换天光(昼 / 夜氛围过渡) |
| `ESC` | 释放鼠标,回到暂停界面 |

走近展品并注视,底部会浮出中文说明(名称 · 类型 · 一句介绍)。

## 调试钩子

`window.__bench = { ready, stepFrame(n), getState(), setSkylight(on) }`,详见 `HANDOVER.md`。
