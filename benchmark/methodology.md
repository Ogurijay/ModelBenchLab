# 大模型能力测试 · 基础方法论(评测宪法)

> 本文件是本仓库所有模型能力测试的**基础规则**。任何一次测试都必须遵守这里的变量锁定、评分与流程约定,保证"每次以相同变量测出模型的真实能力,并可横向对比、可复现、抗污染"。各能力类别的专项规则见 [`categories/`](categories/)。

## 0. 能力类别总览

| 类别 | 说明 | 专项规则 | 状态 |
|---|---|---|---|
| `code-to-3d` | 代码生成 3D / 图形场景 | [categories/code-to-3d.md](categories/code-to-3d.md) | 现役(22 项目) |
| `vlm-aesthetic` | 视觉 / 审美理解(VLM) | [categories/vlm-aesthetic.md](categories/vlm-aesthetic.md) | 重心 |
| `agent-tooluse` | Agent 工具调用 / 任务执行 | [categories/agent-tooluse.md](categories/agent-tooluse.md) | 重心 |
| `llm` | 文本 / 对话 | [categories/llm.md](categories/llm.md) | 规划 |
| `text-to-image` | 文生图 | [categories/text-to-image.md](categories/text-to-image.md) | 规划 |
| `text-to-video` | 文生视频 | [categories/text-to-video.md](categories/text-to-video.md) | 规划 |
| `text-to-3d` | 文 / 图生 3D | [categories/text-to-3d.md](categories/text-to-3d.md) | 规划 |

## 1. 核心原则:三层变量锁定(强制)

每次测试只允许"被测模型"变化,其余全部锁死。

| 锁 | 锁什么 |
|---|---|
| **输入锁** | prompt 逐字固定并版本化;参考图 / 上下文 / 系统提示词一致。措辞、语言、顺序都不改,改一个字即算新任务。冻结素材存 `shared/fixtures/`。 |
| **参数锁** | temperature、top_p、seed、分辨率、宽高比、步数、guidance、负面提示、max_tokens、评测环境(浏览器/GPU/观察时长)…每类模型一份"标准参数卡"。 |
| **评判锁** | 同一套评分卡(rubric)、同一评委(人或裁判模型)、输出匿名 + 随机排序(盲测)、同一评分标度。 |

## 2. 两种评测模式(并列记录)

- **A · 公平固定**:所有模型用**完全相同**参数 → 测同等条件下的硬实力(**主榜**)。
- **B · 各自最优**:每个模型用其官方推荐 / 调优参数 → 测能力上限(参考)。
- A/B 分数并列;差值本身即"对参数的敏感度 / 易用性"信号。

## 3. 抗随机 & 抗污染(强制)

- **抗随机**:生成有随机性 → 每题用固定 seed 集跑 **n ≥ 3**,报均值 + 方差。方差本身是"稳定性"指标。
- **抗污染**:任务库分 `public/`(可复现、可对外)与 `private/`(自建、不发布、**季度轮换**),防止模型"背题"虚高。`private/` 目录建议 gitignore。

## 4. 通用能力六轴

所有类别先打这六轴,再叠加专项轴。锚定与打分见 [`../shared/rubrics/00-common-six-axis.md`](../shared/rubrics/00-common-six-axis.md)。

`① 遵循度 · ② 质量 · ③ 一致性 · ④ 可控性 · ⑤ 效率 · ⑥ 安全`

只对该任务命中的轴打分(任务在 `axes` 字段声明命中项)。

## 5. 难度分级

每个任务标一级,确保不同模型踩到同样的坡:

`L1 基础可用 → L2 常见场景 → L3 复杂挑战 → L4 极限 / 对抗`

## 6. 评分体系

| 任务性质 | 评分方式 |
|---|---|
| 客观(有标准答案) | `pass@k` / 准确率,自动判分 |
| 主观 | 0–5 **锚定** rubric(`0 完全失败 · 3 基本可用 · 5 优秀无瑕`),多评委取均值 + 记方差 |
| 对比 | 盲测两两对决 → win-rate + **Elo** |

**汇总**:每模型一张卡片 = 六轴雷达图 + 专项分表 + Elo 榜 + 成本 / 速度,保留 A/B 双模式。

## 7. 测试单元 & 运行记录(可复现的最小单位)

- **测试单元**(冻结的题目,版本化入库):schema 见 [`../shared/schema/test-unit.schema.json`](../shared/schema/test-unit.schema.json)。
- **运行记录**(每次跑一条,可回溯):schema 见 [`../shared/schema/run-record.schema.json`](../shared/schema/run-record.schema.json)。

## 8. 执行流程

1. 从任务库选子集 →
2. 按参数卡批量跑(A 必跑,B 可选),每题 n 次 →
3. 输出匿名 → 盲评(人工 + 裁判模型双轨,分歧大的复核)→
4. 汇总六轴雷达 / Elo / 成本速度 →
5. 归档 `runs/<date>_<model>/` + `reports/`,季度轮换 `private` 题、复核 rubric 防评分漂移。

## 9. 目录与产物

```
benchmark/
├─ methodology.md      本文件(基础规则)
├─ categories/         各能力类别专项规则(维度 + 示例任务 + 失败模式)
├─ registry.json       项目 / 模型单一事实源
├─ tasks/              冻结的测试单元实例(如 code-to-3d/ocean.md)
├─ runs/               每次运行的输出与评分
└─ reports/            汇总与看板(评分卡模板见 reports/scorecard-template.md)

shared/
├─ rubrics/            评分卡(通用六轴 + code-to-3d…)
├─ schema/             测试单元 / 运行记录 schema
├─ fixtures/           冻结的测试输入(vision / agent / code / prompts)
└─ assets/             公用二进制资源(贴图 / HDRI / 模型 / 音频)
```
