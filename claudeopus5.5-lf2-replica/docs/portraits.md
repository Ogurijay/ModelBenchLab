# 角色头像生成记录

`assets/portraits/*.png`(23 张,128×128)由 **Grok Build CLI 1.0.50 的 Imagine 工具**生成(2026-10-10),再经本地脚本统一后处理。角色均为本项目原创设计,描述与游戏内造型对应;未使用任何原版 LF2 素材。

## 流程

1. 风格基准:`rex` 用 `image_gen` 文生图(1024×1024),提示词见下。
2. 其余 22 人:`grok -p "<提示词>" --always-approve` 无头调用 `image_edit`,以 rex 头像为**仅限画风**的参考图,4 路并行,每张约 30–90 秒,一次全部成功。
3. 后处理:居中裁方 → 盒式缩放到 128×128 → 中值切分量化为 48 色(无抖动)→ 只把与四角背景色几乎相同的边缘连通像素抠成透明。
4. 游戏中 `hud.js` 的 `portrait()` 优先使用这些图片(状态栏 44×48、出招表 88×96、选人 120×120 覆盖式缩放),图片缺失或未加载完时退回程序化侧脸头像。

## 提示词

**rex(image_gen)**:an original fighting-game character portrait, head and shoulders, facing the viewer (front view, slight 3/4), in crisp 1990s PC fighting game pixel-art style with dark outlines, flat cel shading, limited palette, plain solid dark-navy background. The character: a young martial artist with spiky dark-brown hair, a white cloth headband, determined eyes, light tan skin, wearing a royal-blue short-sleeve shirt. Centered, face fills most of the frame, square composition. Do not add any text.

**其余角色(image_edit,参考图 = rex)**:Use the reference image ONLY as an art-style reference: keep exactly the same pixel size, dark outlines, flat cel shading, limited palette, head-and-shoulders framing, front / slight three-quarter view, square composition and a plain solid very dark navy background. Draw a completely different person (do not reuse the reference's face, hair, headband or clothes): `<描述>`. Original character, no text, no logo.

| 角色 | 描述 |
|---|---|
| tora | an original tiger-style martial artist man, golden-blond hair tied in a topknot, tanned skin, confident grin, sleeveless black vest over an orange shirt, red wristbands |
| jet | an original young kick-boxer, messy auburn hair under a red baseball cap, fair skin, cheerful, green track jacket with a white stripe |
| glacia | an original ice sorceress woman, long pale icy-blue hair, blue eyes, fair skin, calm expression, blue robe with white trim and a light-blue cape |
| pyra | an original fire brawler man, flame-red spiky hair, orange eyes, tan skin, fierce expression, black shirt with a red vest and a red scarf |
| gallant | an original golden armored knight, gold helmet with a red plume and a dark visor slit, gold shoulder plates, red cape |
| sage | an original mystic sage man, long brown hair, kind eyes, purple robe with gold trim, holding a short wooden staff topped with a violet orb |
| ronin | an original wandering swordsman, black hair in a ponytail, tan skin, stern eyes, white kimono top with an indigo vest and red sash, katana hilt over his shoulder |
| hawk | an original archer man, short blond hair, green hat with a red feather, green tunic with a brown leather vest and a quiver strap |
| shade | an original ninja, dark purple hood and mask covering everything except sharp eyes, crimson scarf |
| thug | an original bandit thug, red bandana on head, black cloth mask over mouth and nose, white t-shirt, yellow gloves, rough look |
| poacher | an original hunter man, brown hair, red headband, short dark beard, white shirt with a brown vest and quiver strap |
| brute | an original huge muscular bruiser, black mohawk, bare chest, a scar across the cheek, tan skin, angry |
| viper | an original kung-fu boxer, grey-brown bowl-cut hair, white long-sleeve shirt with a black stripe, blue wristbands, focused |
| hexer | an original old sorcerer in a deep-green hood with the upper face in shadow, long white beard, beige shawl |
| monk | an original bald muscular monk, serene expression, brown robe draped over one shoulder |
| mira | an original healer nun woman, dark navy hair in a high ponytail, blue eyes, gentle smile, pink gown with white trim |
| sentinel | an original steel-blue armored knight, closed visored helmet with a red plume, blue cape |
| warden | an original prison warden, short grey hair and grey stubble, iron half-mask over the mouth, stern eyes, dark green uniform with a brown leather vest |
| nocturne | an original vampire lord, pale skin, spiky dark-brown hair, glowing red eyes, smirk, maroon vest, high dark cape collar |
| gallantEx | an original young knight without armor, swept blond hair, blue eyes, confident smile, blue t-shirt |
| tempest | an original fused fire-and-ice warrior, swept teal hair, glowing red eyes, gold top with a grey mantle and cape, faint flames on one side and frost on the other |
| malakar | an original dark overlord, wild silver-white mane, bone-white horned mask with glowing red eyes, black-violet armor with gold trim, menacing |
