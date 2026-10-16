# LF2 超级大改版 · Kate 浏览器移植

## 源码同步边界（2026-10-17）

公开仓库只收录源码、来源清单、自产设计图及 MIT 许可的 OpenLF2 引擎文件。原包分块 `shared/assets/lf2-super/chunks/`、原图预览 `previews/` 和原安装器资源 `runtime/lf2-resources.bin` 按用户决定只留本地，由共享 `.gitignore` 排除。完整运行须另行准备有权使用的原资源；克隆源码不等于已取得游戏素材或完整运行包。本机的构建和测试使用已有本地资源，不证明缺少这些资源的克隆可直接游玩。

用户指定带皮卡丘的“LF2 超级大改版”。本项目以 Kate / Keaton 发布的 LF2_Kate V1.00 三阶段有 BGM 原包为内容来源，使用 MIT 许可 OpenLF2 的 C++ / Lua / WebAssembly 运行时加载原始角色、招式帧、场景、音乐和音效。属于基于既有引擎与原包数据的移植，不作为从零独立实现的公平评测结果。

## 启动

仓库根目录运行 `npm run dev`，统一预览地址：`http://localhost:3000/gpt6.1sol-lf2-super/`。

并行开发使用 `npm run dev:one -- gpt6.1sol-lf2-super`，独立调试地址 `http://localhost:3068/`。不要同时占用该端口。生产构建 `npm run build --workspace gpt6.1sol-lf2-super`；构建输出在项目 `dist/`。截图、原包、解析中间件与临时验收日志在仓库 `tmp/`，不提交。

## 游玩

选择阶段后点击“进入游戏”，在原游戏菜单选择 Game Start。P1 使用 WASD 移动、J 攻击、K 跳跃、L 防御。P2 使用方向键和主键盘 1 / 2 / 3。P3 使用 TFGH 与 Z / X / C。P4 使用小键盘 8 / 4 / 5 / 6 与 1 / 2 / 3。游戏内 Control Settings 可修改。

攻击键加入玩家、选择人物和队伍；双击方向跑步。防御 → 方向 → 攻击/跳跃为组合技；招式表的 D/A/J 分别表示防御/攻击/跳跃，不能直接当作实际键盘键名。F1 暂停、F4 回选人。使用“招式手册”查看作者原表。

主菜单的 Network Game 和网页“远程同屏”进入同一双人连接面板。宿主先进入游戏并创建邀请；另一方用浏览器打开页面、粘贴邀请，产生回复码交回宿主。接通后第二方用方向键与 1 / 2 / 3 操作 P2，宿主用 P1。默认局域网直连；公共 STUN 为可选项，无 TURN，不保证任意跨网环境。当前远端只有视频，没有声音。这是网页远程同屏，不兼容原 Windows TCP 协议。

在原菜单 Recording 开启录制后，正常结束比赛才生成录像；F4 中断不保存。网页录像档案支持本机自动保存、直接播放及 .lfr 导入导出。全屏使用引擎原生策略，Esc 退出。

三版分别收录 29 / 31 / 31 个角色对象以及 11 / 16 / 18 个背景条目，含 Template、Pkmnt、说明图、音乐盒等特殊对象，不等同于全部都是普通战斗角色与竞技场。没有为原包不存在的生存关卡伪造内容。

## 资源与验证

- `src/engine-host.js` / `src/kate-bridge.lua`：原引擎、资源路径、键位、录像适配。
- `src/kate-patches.js` / `src/dat-compat.js`：真实角色及关卡范围、严格解析器兼容；原资源保留，所有有效帧数值不变。
- `src/remote-play.js`：WebRTC 视频与 P2 控制、连接码、断开释放输入。
- `shared/assets/lf2-super/`：原资源压缩分块、预览和官方 WASM；SHA-256 校验后加载。
- `npm test --workspace gpt6.1sol-lf2-super`：离线结构及适配测试。
- `node gpt6.1sol-lf2-super/tools/headless-smoke.mjs --version ver3`：真正 WASM 原生 DAT 解析与输入 tick 测试。

实时验收结果和未覆盖项见 [HANDOVER.md](HANDOVER.md) 与 [docs/VALIDATION.md](docs/VALIDATION.md)。资源来源、许可边界见 [docs/ASSET_PROVENANCE.md](docs/ASSET_PROVENANCE.md)。原游戏素材版权归原作者，不因引擎采用 MIT 许可而改变。

## 漫威角色设计

新增八位经典漫威角色的[美术规格](docs/MARVEL_ART_DIRECTION.md)、[简明出招表](docs/MARVEL_MOVE_LIST.md)与[40招详细设计](docs/MARVEL_MOVE_DESIGN.md)。当前仅设计稿，尚未接入选人或战斗。内置imagegen累计12次请求，快银设计参考图成功、其余七位受阻；提示词与失败记录见[设计包](art/marvel/README.md)。
