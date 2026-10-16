# 漫威八人美术设计包

状态：快银设计参考图已生成并保存，其余七位出图受阻。八人的完整动作帧及游戏接入尚未完成。

- [快银设计参考图](../../../shared/assets/lf2-super/marvel/quicksilver-design-v1.png)：1254×1254 RGBA，正面、侧面、背面、速度技能、防御与头像六个视图。
- [美术规格](../../docs/MARVEL_ART_DIRECTION.md)：经典服装、像素比例、动作、特效和头像。
- [简明出招表](../../docs/MARVEL_MOVE_LIST.md)：八人共40招与网页按键。
- [完整招式设计](../../docs/MARVEL_MOVE_DESIGN.md)：伤害、MP、时间、范围和实现限制。
- [prompts.json](prompts.json)：八张独立设计参考图的完整提示词及当前状态。
- [本轮逐角色生成记录](generation-batch-2026-10-13.json)：八位角色分别调用内置imagegen，快银成功，其余七位返回HTTP400 moderation_blocked，stage output、categories other。
- [完整生成记录](generation-log.json)：累计12次请求，1张图片，11次失败。

工具模式仅为内置imagegen，没有启用CLI/API。成功原图保留在默认生成目录，并以相同SHA-256复制到项目共享资产目录。SHA-256：a7d2256c852956bcec25499ba506a126d6a60ea3851e542384ed51266e752b64。

快银图已检查角色服装、六视图、完整轮廓与透明通道。它的身体比例比目标运行精灵偏高，边缘与内部存在部分alpha像素；后续转换LF2精灵时还需调整比例与色键边界。该图是造型参考，不是完整可运行动画图集。
