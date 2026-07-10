# benchmark/ — 模型能力评测体系

把"用相同变量测出模型真实能力,可复现、可横向对比、抗污染"落成制度。

## 从这里开始

- **基础规则(必读)**:[methodology.md](methodology.md) — 三层变量锁定 / 两模式 / 抗随机抗污染 / 六轴 / 难度 / 评分 / 流程。
- **单一事实源**:[registry.json](registry.json) — 项目 / 模型 / 端口。改后运行 `npm run sync:check` 校验四方一致。

## 各能力类别专项规则([categories/](categories/))

| 现役 / 重心 | 规划 |
|---|---|
| [code-to-3d](categories/code-to-3d.md) 现役 · [code-to-ui](categories/code-to-ui.md) 现役 · [vlm-aesthetic](categories/vlm-aesthetic.md) ★ · [agent-tooluse](categories/agent-tooluse.md) ★ | [llm](categories/llm.md) · [text-to-image](categories/text-to-image.md) · [text-to-video](categories/text-to-video.md) · [text-to-3d](categories/text-to-3d.md) |

## 目录

```
benchmark/
├─ methodology.md   基础规则(评测宪法)
├─ categories/      各类别专项(维度 + 示例任务 + 失败模式)
├─ registry.json    项目 / 模型单一事实源
├─ tasks/           冻结的测试单元(如 code-to-3d/ocean.md)
├─ runs/            每次运行的输出与评分
└─ reports/         汇总与看板(scorecard-template.md)
```

评分卡在 [`../shared/rubrics/`](../shared/rubrics/),schema 在 [`../shared/schema/`](../shared/schema/),测试输入素材在 [`../shared/fixtures/`](../shared/README.md)。
