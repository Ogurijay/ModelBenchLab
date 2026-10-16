# 原版凯特改版资源来源与加载格式

## 公开同步边界（2026-10-17 用户确认）

本记录描述本机已有来源，不等于公开再分发授权。原包压缩分块、原素材预览及 `runtime/lf2-resources.bin` 不进入 Git，实际文件仍保留本地。源码、来源与完整性元数据、自产设计图及有 MIT 许可的 OpenLF2 引擎文件单独同步；不得把本机完整资源验收结论等同于公开克隆完整可运行。

2026-10-13，静态提取作者公开 V1.00 有 BGM 完整包作为最终资源主来源。没有运行自解压程序或包内任何 EXE/DLL，也没有重新绘制角色和招式图。先前无 BGM 包保留在 tmp 供逐字节对照。

来源：[Keaton / Kate 作者博客](https://hcyang1227.blogspot.com/2019/11/lf2-kate.html)、[作者 2021 更新公告](https://www.ptt.cc/bbs/LittleFight/M.1629986301.A.A0E.html)、[作者公开有 BGM 包](https://drive.google.com/file/d/1trBAQdI3EgXHCag5-Jone5fmQF5utIqC/view)。Google Drive 文件名为 `lf2_Kate(小朋友齊打交_凱特大改版)V1.00.exe`，大小 142,783,666 字节；SHA256 `4fcc20fc58064acb9050fcdabe914de55922ea2f180c8f9eb71c91012ddde244`。本地原包为 `tmp/lf2-super-research/LF2_Kate_V1.00_bgm.exe`，静态解压目录为 `tmp/lf2-super-research/extracted-bgm/lf2_KateV1.00`。作者包是 RAR SFX，使用本机既有 7-Zip 静态解压。

保留的[无 BGM 对照包](https://drive.google.com/file/d/1V3BpHPge6HmwvY2QUDsUGQ1TLX6ngt9p/view)大小122,789,817字节，SHA256 `e71fdc5332eb88b2eb9dd5414909cb84c8809c84957e59c076ff4af2d88ab7b8`，路径 `tmp/lf2-super-research/LF2_Kate_V1.00_no-bgm.exe`。逐文件差异、声音引用、时长及哈希记录在 `tmp/lf2-super-research/bgm-comparison.json` 与 `bgm-comparison.md`。

作者署名 Kate，现称 Keaton。原包带三个独立版本：Ver1 初始版、Ver2 闯关 plus、Ver3 2xplus Game 小游戏版。用户所称“LF2 超级大改版”与作者正式名称的唯一对应仍缺直接历史发布证据；作者包与皮卡丘式 Kate 的原始头像、招式表均已实际核对。

资源目录为 `shared/assets/lf2-super/`。manifest 注册的运行资源保留原始文件全部字节；只将虚拟路径转成小写正斜杠。角色 DAT、背景 DAT 和 stage.dat 仍带原本的 123 字节前缀及加密字节，由运行引擎解码。构建工具的可读名解析使用 OpenLF2 的 `SiuHungIsAGoodBearBecauseHeIsVeryGood` 绝对字节索引解码规则，cp950 仅用于读取名称。

资源选择从 data/data.txt 全部注册对象、全部注册背景、data/stage.dat 开始递归读取 BMP/WAV/DAT 引用，追加 OpenLF2 固定声音、8个bgm/*.wma和 data/control.txt。排除可执行文件、MZ/PE 伪数据、未引用的文件、旧隐藏安装器和 Bgw 游戏。LF2 EXE 内嵌菜单位图也不包含在包中。未加入 `_mirror.bmp` 复本，OpenLF2 通过绘制方向处理镜像。

| 版本 | 原始资源路径数 | type0对象 | 注册背景 |
| --- | ---: | ---: | ---: |
| ver1 | 721 | 29 | 11 |
| ver2 | 803 | 31 | 16 |
| ver3 | 812 | 31 | 18 |

三版均低于 OpenLF2 的 1024 项资源 map 容量；对象和背景注册数不代表所有对象都可选或所有背景均用于战斗。Pkmnt (id99 / name `???`) 标记为 stage_auxiliary，不能当成新的常规斗士。Music 背景为音乐盒，Training_Room 为完整招式表。data/data.txt 的非运行 file_editing 段出现 `data/nothing.txt`，原包不存在该文件，清单单独记录 unused_source_references；运行资源 missing 为空。声音 WAV 及8个原始 WMA 均保留原包字节；8个WMA内容相同，可按字节去重。

跨版本按 SHA256 去重为 930 个 payload，共 210,467,390 原始字节，压缩成 14 个 gzip 分块，共 33,034,405 字节。最大原始分块 16,775,806 字节，小于 32 MiB；最大 gzip 4,372,715 字节，小于 20 MiB。每个分块只拼接原文件字节，无包头；每文件通过 offset/length 定位。打包脚本逐文件验证 SHA256，同时核对 gzip 解压后的整个分块哈希。

## Manifest 与 Vite 接入

`manifest.json` 为 schema_version 1，顶层有 source、chunks、versions、previews、move_reference、excluded_pe、stats、notes。

```js
import manifest from '../../shared/assets/lf2-super/manifest.json';
import {decodeChunk} from './chunk-codec.js';
const chunkImports = import.meta.glob('../../shared/assets/lf2-super/chunks/*.gz', {
  eager: true, query: '?url', import: 'default',
});
const previewImports = import.meta.glob('../../shared/assets/lf2-super/previews/*.png', {
  eager: true, query: '?url', import: 'default',
});
const prefix = '../../shared/assets/lf2-super/';
const chunkUrl = path => chunkImports[prefix + path];
const previewUrl = path => previewImports[prefix + path];

async function loadChunk(chunk) {
  const response = await fetch(chunkUrl(chunk.path));
  if (!response.ok) throw new Error(`Chunk HTTP ${response.status}`);
  return decodeChunk(new Uint8Array(await response.arrayBuffer()), chunk);
}
// Each version has files: [{path, chunk, offset, length, sha256}],
// chunk_paths: [paths], characters: [{id,type,path,name,head_preview,
// small_preview,head_source,small_source,role,selectability}],
// backgrounds: [{id,path,name,purpose,preview,preview_source,preview_errors}].
// Load only selectedVersion.chunk_paths, then pass each range to the engine:
// const raw = decoded[file.chunk].subarray(file.offset, file.offset + file.length);
// engineResourceMap[file.path] = raw;
```

上述相对 import 按调用文件位置调整；应使用 Vite `?url` 获取构建资产 URL，不能把 shared 路径拼成生产绝对静态地址。复用 `src/chunk-codec.js`，同时兼容原始 gzip 响应与服务器 `Content-Encoding: gzip` 自动解压后的响应：前者验证压缩哈希，两者最终都验证解压哈希，避免重复解压。分块加载可逐个完成后释放 Response，原始分块缓存的持有策略由入口负责。manifest 的 chunk sha256 针对压缩文件，decoded_sha256 针对解压文件，files[].sha256 针对原始单文件字节。

## 原始预览

生成了 60 个去重头像 PNG（包含 head 和 small），Kate/KateEX/Katian 均有原始头像；28 个跨版本去重地图图层 PNG；1 张完整 5697×435 招式说明 PNG。预览仅 BMP 像素转 RGB PNG，没有缩放、重画或技能补造。地图预览使用同背景最大可解析图层，因此不是完整场景截图；部分旧压缩 BMP Pillow 解码失败，使用次大可解析层并在 preview_errors 记录。

原始 move_reference 来源 `ver3/bg/sys/5_tr/wall.bmp`，包含角色图、按键与说明。低宽度页面应提供原尺寸横向查看，以保留可读性。

生成方式：使用带 Pillow 的 Python 执行 `tools/pack-kate.py`，默认从本地 tmp 中静态解压目录读取。所有 assets 输出路径为小写，脚本及本说明留在项目内。资源仍属于各原作者；作者文章说明包含宝可梦、星之卡比及其他游戏素材，未找到覆盖全部内容的统一再分发许可。当前来源记录不代表获得商业再发布授权。

## 浏览器运行时与基础资源容器

`shared/assets/lf2-super/runtime/` 包含从 [OpenLF2 官方浏览器页面](https://openlf2.github.io/OpenLF2/) 获取的 `openlf2.js`、`openlf2.wasm`、`openlf2.data`，保持下载字节不变。引擎源项目 [OpenLF2](https://github.com/OpenLF2/OpenLF2) 当前用于核对的 checkout 为 `v0.9.4`，commit `bb335c9967adbafc6d16b130a8a26f4e984c493b`；CMake 声明版本为 0.9.4。MIT 许可全文复制为 `runtime/license.txt`。文件级 URL、长度和 SHA256 记录在 `runtime/runtime-provenance.json`。

官方托管二进制的实际构建 commit 尚未从构建证明核实，因此 provenance 分开记录 source_commit 与 binary_build_commit_verified=false，不将源 checkout 等同于已复现的二进制构建。

原始 LF2 2.0a 安装器由入口管理为 `runtime/lf2-resources.bin`，仅作为资源容器静态读取，提供 EXE 内嵌菜单位图等基础资源。浏览器执行的是 OpenLF2 WebAssembly，引擎不启动原 LF2 EXE，也不启动改版包中的任何 PE 伪数据或安装器。改版 data.txt、角色 DAT、关卡、BMP 和声音由本报告所述分块覆盖加载。

基础资源实际来自 [LF2_v2.0a.exe 公共镜像](https://static.letoltokozpont.hu/letoltokozpont.hu/programok/l/LF2_v2.0a.exe)，分段下载完成后以 `lf2-resources.bin` 保存，长度 **29,586,263 字节**，SHA256 **`540c485547e234b0d09595f54d067aafd7176092c308aca61868f3cbc03030e1`**。本轮对保存文件重新计算大小与哈希，确认与 OpenLF2 固定预期哈希一致；未执行安装器。其原文件名、镜像 URL、用途和校验结果已写入 runtime-provenance.json。

当前使用作者有 BGM 包的原始音乐 WAV。两个包逐文件对比证实：Ver1仅20个、Ver2仅36个、Ver3仅40个 `data/m_*.wav`、`data/mn*.wav`、`data/mg*.wav` 发生变化；无新增或删除版本文件，角色DAT、Music1.dat、stage.dat、BMP和程序本体逐字节相同。无 BGM 包对应文件均为48字节、0.0005秒短占位WAV；有 BGM 包恢复的音频按WAV帧数/采样率读取为1.74675至143.654秒，包含音乐主段和短接续段。示例：`data/m_1.wav`为399,942字节/49.73秒，`data/m_9.wav`为738,400字节/92.03725秒，`data/mn5.wav`为1,149,277字节/143.654秒，`data/mg2.wav`为572,585字节/71.567秒。

8个 `bgm/*.wma` 在两包之间逐字节相同，8个文件之间也相同，每个494,245字节，ASF文件头时长60秒；这组WMA不构成有/无BGM版本差异。恢复作者音乐的关键是Music1.dat等对象通过sound字段引用的data WAV，不是替换WMA。全部真实WAV已纳入原始分块。音频时长为静态解析结果，未将其视为听感或播放成功证明；作者说明的跨关卡音乐叠加行为以及WASM引擎特殊状态、战斗和闯关行为仍须实际运行核验。

## 启动封面生成实际结果

按请求使用内置 image_gen，并逐张检查 Kate、Davis、Freeze、Firen、Deep 原始头像作为身份参考，提交一张2000年代风格启动封面请求。服务在输出阶段以 HTTP400 `moderation_blocked / other` 拒绝，未返回图片，因此 `launcher-cover.png` 尚未生成。完整提示词、原始参考及错误 Request ID 见 `docs/GENERATED_ART.md`；不以占位图冒充已生成封面，原版战斗资源未改变。

## Kate 按键静态核对

原始 `data/Kate.dat` 站立帧0~3的 `hit_Fa:251` 对应防御→前→攻击，frame251 原标记 `Zap Ball~~~!!!`（电磁炮）。以网页 P1 的 J攻击/K跳跃/L防御、WASD移动映射，朝右时是 **L→D→J**，朝左是 **L→A→J**；“前”随角色朝向变化。

站立帧还登记 `hit_Fj:248`（防→前→跳，Teleport）、`hit_Dj:250`（防→下→跳，Quick Attack）、`hit_Uj:254`（防→上→跳，Thunder）、`hit_ja:240`（防→跳→攻击，Thunder_Wave）。对应网页按键分别为 L→D/A→K、L→S→K、L→W→K、L→K→J。DAT 原标签和目标帧足以核对输入映射；中文招式名应继续参照原招式图，实际伤害/触发仍需运行验收。
