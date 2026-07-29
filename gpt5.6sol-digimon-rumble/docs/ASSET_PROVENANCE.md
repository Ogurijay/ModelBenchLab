# 3D 资产来源与发布边界

> 核对日期：2026-07-17
> 覆盖范围：`public/models/*.glb` 共 26 个文件
> 结论：26/26 个目标文件均在 `E:\XHub` 找到字节完全一致的源 GLB；当前没有发现允许公开再分发或商业使用这些美术资产的许可证。

## 1. 来源链

```text
《Digimon Story: Cyber Sleuth – Complete Edition》本地 PC/Steam 资源
  → E:\XHub\Resource\Digimon\美术资源\（内部拆解成果）
  → E:\XHub\Resource\Digimon\美术资源\查看器\models\chr*.glb
  → 本项目 public\models\*.glb（仅重命名，文件字节未变化）
```

E:\XHub 内部说明文件：

- `E:\XHub\Resource\Digimon\说明文档.md`
- `E:\XHub\Resource\Digimon\素材提取交接文档.md`
- `E:\XHub\Resource\Digimon\美术资源\查看器\图鉴清单.csv`

前两份说明将这些 GLB 描述为从本地游戏副本提取、转换并内嵌贴图/骨骼/动画的成果，并将美术资源版权归属于“万代南梦宫 / Media.Vision”。这些内部记录能说明技术来源，**不能替代权利人的授权书、购买凭证或可再分发许可证**。

## 2. 权利状态代码

表中所有文件均使用同一状态：

**LOCAL-ONLY（仅限本地）**：第三方专有角色美术；仓库和 E:\XHub 中未发现授予本项目公开再分发、在线部署或商业使用的许可证。仅允许作为当前机器上的个人学习、研究和本地演示素材处理。

开源提取/转换工具的 MIT、zlib 等许可证只适用于工具代码，不会把游戏模型、贴图、动画或角色形象重新授权为开放资产。

## 3. 逐文件核对

SHA256 使用 PowerShell `Get-FileHash -Algorithm SHA256` 分别对源文件和目标文件计算；下表合并为一列，是因为两端哈希与字节数均完全一致。

| 目标文件 | E:\XHub 实际源文件 | 字节数 | SHA256（源 = 目标） | 一致 | 权利/许可状态 |
| --- | --- | ---: | --- | :---: | --- |
| `public/models/agumon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr050.glb` | 1,480,920 | `EA52C82C346E78EAAD3D1355076DA92CBE70B19C8B70DFC09A8FBE90D854C4DB` | 是 | LOCAL-ONLY |
| `public/models/angemon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr087.glb` | 3,301,176 | `83A81278EB080301D2F2C3999526784E2987444B297808CDD396B1FDDA34F27F` | 是 | LOCAL-ONLY |
| `public/models/angewomon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr148.glb` | 3,457,148 | `49EFE78A1EEC4F4AEBD0FA432395D60C3B8B76D368AB4584B88DE4D94A55858E` | 是 | LOCAL-ONLY |
| `public/models/apocalymon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr328.glb` | 3,800,572 | `5CAAD72BBDCE481C52276B163D41749859EC2E166E091C00B8358F2307798E92` | 是 | LOCAL-ONLY |
| `public/models/diaboromon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr632.glb` | 1,047,252 | `A44E37B06EB514893BEA372F6D0605D1EE0F6231346A0A3A3AEA27CA3B494A92` | 是 | LOCAL-ONLY |
| `public/models/exveemon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr365.glb` | 1,333,824 | `5B6737ED7166177229E23B2C26E6D0E5DA3D8F461DB45BB0CADEF843D3275E5E` | 是 | LOCAL-ONLY |
| `public/models/gabumon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr151.glb` | 1,825,076 | `53134147C36F65799108512C6C6C8063E3F92E66E7CDCA3ED0D030C1E58EC4A4` | 是 | LOCAL-ONLY |
| `public/models/gallantmon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr126.glb` | 1,516,112 | `5717E0D4477046EBCB9B868AD3B9AFA90C9F4CA3DEA37D6560DB11B6D09DE875` | 是 | LOCAL-ONLY |
| `public/models/garurumon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr012.glb` | 1,021,272 | `534E33BF2D80395C6F9B8FE70C89CCD8A3227E9330532F07477935ED1DE9C853` | 是 | LOCAL-ONLY |
| `public/models/gatomon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr092.glb` | 1,197,496 | `A6F564392A1A9BE2872B12733CCFA1D744619F64AD0F0C96145FED63E8550894` | 是 | LOCAL-ONLY |
| `public/models/greymon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr326.glb` | 937,788 | `413917A47AAF81A032D0BF5B13477BA058C37A3EA1C10B91551E21ECD0FE9378` | 是 | LOCAL-ONLY |
| `public/models/growlmon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr078.glb` | 1,246,112 | `3BAF44A6622A929C55D5447B1B5DC9759DDD0B12AA58DCBCDFB0F3A62163720F` | 是 | LOCAL-ONLY |
| `public/models/guilmon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr090.glb` | 1,000,188 | `EB53774D10854C351C9CBDC5E1B546174EC088938E7E9021BDA9CE8696DFF154` | 是 | LOCAL-ONLY |
| `public/models/herculeskabuterimon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr306.glb` | 1,576,068 | `D7C3E822AB76F92F22CF922244F298F457B18C884E5439E050104B232880FF3E` | 是 | LOCAL-ONLY |
| `public/models/imperialdramon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr419.glb` | 1,390,300 | `D7573DCD35651EBF115B8060F8517358C293E0422DC6C2B5E8D16264926F87AE` | 是 | LOCAL-ONLY |
| `public/models/kabuterimon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr304.glb` | 1,266,932 | `32956D937D8F23B0BC1F8B6E404A4E868D566C1CE0040EC7E890DC48696E7533` | 是 | LOCAL-ONLY |
| `public/models/kyubimon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr395.glb` | 1,595,392 | `B9697B400897F8E741F6F8605DB7B849C5653CEE9B6886B1064AE1B2BE92E438` | 是 | LOCAL-ONLY |
| `public/models/metalgarurumon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr135.glb` | 1,504,684 | `0531A8D2F2DA719FC9A6D0195EC81542F180EA7CE3737F9DF2185ED9A4523AAE` | 是 | LOCAL-ONLY |
| `public/models/ophanimon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr421.glb` | 1,729,560 | `1DC2ACA74B0DF9816E60D2C6467F939763F8447B34DD69A65DD0CB8FF36D5829` | 是 | LOCAL-ONLY |
| `public/models/patamon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr096.glb` | 899,480 | `2924FCEECD418695450ADD156504E48A713F4C486D686EA1ECD16E55B17FBDCE` | 是 | LOCAL-ONLY |
| `public/models/renamon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr391.glb` | 1,513,460 | `5DFACF7E8238640E82F04F5237712FFEA7BAE7E3B8733988D1837873F9DDC0BC` | 是 | LOCAL-ONLY |
| `public/models/sakuyamon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr425.glb` | 1,254,708 | `316E698AE3B0501E41F602B3ECE99A299806E85318D79AA4E1F39C0CEAD24AA0` | 是 | LOCAL-ONLY |
| `public/models/seraphimon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr315.glb` | 1,462,708 | `72CEDBA8370302EFD592DCD8F690F8E3358AC6CC562F6023E1D5E686550E421B` | 是 | LOCAL-ONLY |
| `public/models/tentomon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr303.glb` | 1,063,128 | `022C0568CC0DFDC0B8EC2B48EF16EAF07DEC9C0E161E1604AB4B130496842745` | 是 | LOCAL-ONLY |
| `public/models/veemon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr114.glb` | 1,115,656 | `D13FFED61171D3CDF8343246895D94C4DB1A4F9CFB18F8C2C30D41DDAE51E08B` | 是 | LOCAL-ONLY |
| `public/models/wargreymon.glb` | `E:\XHub\Resource\Digimon\美术资源\查看器\models\chr027.glb` | 1,327,664 | `D93D0FA8DBB6952D45666C28D4FA179847DCA33C37A3450C4F4CDD8D55792F4F` | 是 | LOCAL-ONLY |

## 4. 发布决策

本项目当前只按以下范围处理（不构成法律意见，也不表示权利人已授权）：

- 在本机离线运行项目，用于个人学习、技术验证和非公开演示；
- 为完整性核对文件名、大小与哈希；
- 在不传播 GLB 本体的内部文档中记录技术来源和风险。

当前不允许视为已获授权：

- 将这 26 个 GLB 提交到公开仓库、公开下载包或 CDN；
- 将含这些资产的构建部署到公网；
- 用于收费产品、广告、众筹、商业演示或任何商业用途；
- 因为提取工具是开源软件，就推定导出的游戏美术也可自由使用。

如果需要公开发布，应先取得可覆盖模型、内嵌贴图、动画、角色形象和商标使用的书面许可；否则必须用原创资产或具有明确再分发条款的替代资源替换全部相关 GLB。

## 5. 维护规则

1. 新增或替换 GLB 时，先记录真实源路径与授权文件，再复制到 `public/models`。
2. 重新计算源/目标 SHA256；只有哈希一致时才能在本表使用单列哈希。
3. 若取得授权，记录授权方、许可文本/合同位置、适用地域、用途、期限、署名与再分发条件；不得只写“已授权”。
4. 若无法证明授权，状态保持 LOCAL-ONLY。
5. 本表只覆盖 26 个 GLB，不代表代码、字体、音频、名称、商标或其他第三方内容已完成授权审查。

## 6. 核对结果

- 项目目标 GLB：26 个；
- E:\XHub 精确源文件：26 个；
- 源/目标文件大小一致：26/26；
- 源/目标 SHA256 一致：26/26；
- 可证明的公开再分发许可证：0 个；
- 可证明的商业使用授权：0 个。
