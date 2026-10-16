# 启动封面生成记录

2026-10-13。使用内置 image_gen，单张启动封面请求；只用于启动页，不替换原版战斗精灵、头像、地图或招式。

## 当前结果

单次生成请求失败，没有返回图像或本地文件，`shared/assets/lf2-super/launcher-cover.png` 尚未生成。服务返回 HTTP 400：`Your request was rejected by the safety system.`，错误代码 `moderation_blocked`，`moderation_stage: output`，类别 `other`。未提供具体拒绝原因。Request ID：`a9a701ab-96bf-4835-b05d-d2db0acfd6bd`。未切换外部 API 或生成替代图。

## 原始参考

实际读取 manifest Ver3 中的原头像，并在请求前逐张 view_image 检查。以下图片都是作者原始BMP转PNG，没有重绘。

- Kate：`shared/assets/lf2-super/previews/face-a0b7565b357c63fbaec0.png`
- Davis：`shared/assets/lf2-super/previews/face-d93803e07faf4913b233.png`
- Freeze：`shared/assets/lf2-super/previews/face-20474ed5b8262342aebb.png`
- Firen：`shared/assets/lf2-super/previews/face-caa59861acc33e30cdf6.png`
- Deep：`shared/assets/lf2-super/previews/face-4d232a672e9b49d3a1b5.png`

来源：[作者公开V1.00无BGM包](https://drive.google.com/file/d/1V3BpHPge6HmwvY2QUDsUGQ1TLX6ngt9p/view)，详见 ASSET_PROVENANCE.md。参考图作为身份参考，不是编辑目标；指定 opaque 背景。

## 实际提交的完整提示词

```text
Use case: stylized-concept. Asset type: a single game launcher cover illustration, landscape 4:3, for Little Fighter 2 Kate super modification. Input images are ONLY original character identity references, in order: 1 Kate, 2 Davis, 3 Freeze, 4 Firen, 5 Deep. Create polished retro early-2000s Hong Kong anime fighting-game key art, compact stylized small-bodied chibi fighters with sharp expressive faces and classic game proportions, clearly drawn 2D cel illustration, not realistic humans. Backdrop is Hong Kong Coliseum sports arena at dusk in deep navy and cobalt blues. Five characters form a lively heroic battle composition across the lower two-thirds. Center front: Kate, a bright yellow Pikachu-like mascot with long black-tipped ears, lightning-shaped yellow tail, red cheek spots, wearing a blue baseball cap backwards, use the reference face and cheek style. Surround with Davis, short spiky brown hair and royal blue fighting clothes; Freeze, spiky blue ice hair and blue clothes generating icy cyan shards; Firen, orange-gold spiky hair and red fighting clothes surrounded by orange fire; Deep, spiky brown hair, orange clothes, holding his sword. Strong yellow electric arcs, ice and fire effects frame the fighters; crisp black linework, dramatic painted highlights, energetic compact forms. Composition constraint: keep the central upper third mostly empty deep navy blue arena atmosphere, no characters or bright effects there, so HTML can overlay the title. High visual clarity, nostalgic freeware game cover energy, all five characters visible. No text, letters, logo, UI, watermark. Do not replace this request with generic realistic fighters. Opaque image.
```

## 漫威角色设计扩展

八位角色分别以内置imagegen请求。快银六视图设计参考图成功，1254×1254 RGBA，路径shared/assets/lf2-super/marvel/quicksilver-design-v1.png；钢铁侠、雷神、蜘蛛侠、美队、万磁王、金刚狼、死侍均返回输出阶段moderation_blocked。逐角色完整提示词、请求ID与原始错误见../art/marvel/generation-batch-2026-10-13.json。该图未接入原角色资源或战斗。
