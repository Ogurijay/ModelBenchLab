# Mission: ocean — 海洋模拟(code-to-3d)

给定"用 Web 3D 技术实现一片可信的海洋"这一任务,不同模型各自写代码生成场景。本文件是该 mission 的**冻结规范**:评分时对照此清单,保证同一标准。

## 原始任务描述(冻结 — 待补你当初给模型的原话)

> 【在此粘贴当初下发给各模型的确切 prompt。一旦确定即冻结,不再修改;要改就在 registry 里升版本。】

## 公共核心要求(所有 ocean 项目都应具备)

- [ ] 动态波浪(Gerstner / 波谱 / TSL 等任一,连续无缝)
- [ ] 天空 / 环境光与海面光照联动(反射 / 折射 / 菲涅尔)
- [ ] 相机可观察(轨道或漫游),不穿海面
- [ ] 稳定帧率(桌面 ≥60fps,移动可跑)
- [ ] 无控制台报错、无明显穿模 / 闪烁

## 变体附加要求(按 registry 的 variant 计分)

| variant | 附加清单 |
|---|---|
| `realistic` | 写实海浪 + 天空;lil-gui 参数调试面板;浮体 / 浮力交互 |
| `weather` | 多种天气切换(晴 / 雾 / 雨 / 暴风 / 龙卷风)且海面响应 |
| `storm` | 极端天气 / 风暴单元;闪电 + 雷声;浮力船受浪响应 |
| `webgpu` | WebGPU / TSL 节点方案;泡沫 / 海底 / 天穹等增强 |
| `skill` | 物理建模(如 Pierson-Moskowitz 波谱)、弹簧阻尼浮力、模块化架构 |

## 参与项目(源自 registry,mission=ocean)

| 端口 | 目录 | 模型 | variant |
|---|---|---|---|
| 3001 | claudeopus4.8-ocean-webgpu | Claude Opus 4.8 | webgpu |
| 3002 | gpt5.5-ocean-weather | GPT 5.5 | weather |
| 3003 | doubao2.1-ocean-webgpu | Doubao 2.1 | webgpu |
| 3013 | gpt5.5-ocean-webgpu | GPT 5.5 | webgpu |
| 3004 | gpt5.5-ocean-skill | GPT 5.5 | skill |
| 3005 | claudefable5-ocean-realistic | Claude Fable 5 | realistic |
| 3006 | geminiflash3.5-ocean-realistic | Gemini Flash 3.5 | realistic |
| 3007 | gpt5.5-ocean-realistic | GPT 5.5 | realistic |
| 3008 | grok4.3-ocean-realistic | Grok 4.3 | realistic |
| 3012 | geminiflash3.5-ocean-storm | Gemini Flash 3.5 | storm |
| 3015 | claudesonnet5-ocean-storm | Claude Sonnet 5 | storm |

> **公平对比原则**:直接横向对比只在**同一 variant 内**进行(如 4 个 realistic 之间)。跨 variant 只比"公共核心要求"部分。

## 评分

用 `shared/rubrics/code-to-3d.md`(七维 + 审美子表)。评测环境锁定:桌面 1920×1080、固定 GPU 档、每场景观察 30s,截图归档 `benchmark/runs/<date>_<model>/`,匿名盲评。
