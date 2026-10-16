# 验证记录

## 可移交的离线检查

在仓库根运行 `node --test gpt6.1sol-lf2-super/tests/*.test.mjs`。测试使用已交付的 `shared/assets/lf2-super` gzip包、manifest与官方runtime/.data/.wasm；不依赖临时源码克隆、解压作者目录、研究报告或浏览器。

2026-10-13 最终有 BGM 资源包的 `npm test --workspace gpt6.1sol-lf2-super`：20 项通过，0 失败、0 跳过，耗时 83.6 秒。涵盖压缩资源、目录与数据容量、运行时兼容、真实 Lua 执行、原生录像往返及 WebRTC 信令/按键校验。验证三版721/803/812个资源逐文件及分块SHA256，注册角色29/31/31、实际stage数量33/41/7、所有所列数据容量、目录路径规范、无PE伪DAT、真实特殊状态保留，以及运行时适配不修改输入资源字节。真实官方Lua由Node加载WASM后从其FS读取，因此上游源变化会使必须匹配的补丁测试失败。

## 原生WASM解析与游戏tick

`node gpt6.1sol-lf2-super/tools/headless-smoke.mjs --version ver3` 从 `shared/assets/lf2-super/runtime` 读官方引擎，默认读取同目录 `lf2-resources.bin`。这个文件是官方LF2安装器的原字节数据；工具核对29,586,263字节和SHA256后仅在WASM虚拟FS挂载，不执行安装器。可用 `--engine-dir`、`--installer` 覆盖。

工具在加载bootstrap时逐一调用实际C++ `openlf2_read_object_data`、`openlf2_read_background_data`、`openlf2_read_stage_data`，打印 `OFFLINE_DAT_PARSED` 和具体失败，随后运行headless trace。对战：`--scenario versus --trace 'r*20,c*10,b*5,f*5,,r*20'`；闯关：`--scenario stage --trace 'r*20,c*10,b*5,f*5,,r*20'`。版本为ver1/ver2/ver3。

对战fixture从真实catalog按id7/id51定位Kate/KateEX，直接进入原引擎match；闯关fixture进入真实stage0。Fixture仅用于工具的虚拟FS启动，不修改产品Lua或作者帧。模式逻辑、物理、AI、对象生成、资源解析均仍来自实际引擎。此测试不经过产品菜单、浏览器输入和音频输出，因此不能代替真实浏览器体验验收。

Node初始化以及官方 `--help` 已真实通过；引擎使用Emscripten Node/fs路径，没有浏览器、页面或DOM。SDL入口无条件读取查询配置，工具在初始化后仅提供空 `window.location.search` 属性。

完整官方基础资源数据SHA256匹配后，三版原生解析已实际运行。未经兼容处理的作者数据：Ver1共110条对象/地图/关卡解析调用，21失败；Ver2共117条，23失败；Ver3共119条，24失败。主要为作者帧说明文字超过OpenLF2严格19字节读取上限（例如 `rowing(RunLand----START)`）；Bandit还含无整数编号的 `<frame> transform`。这不是前述容量违规，而是原生parser的额外格式限制。

原始失败在进入对战tick前被工具主动阻断，退出码1。随后产品和工具共用 `normalizeKateFiles`，仅修改运行时副本：帧说明词截为19个ASCII字节；Ver2/3 Bandit无编号块隔离。所有有效帧ID和全部数值字段前后比较，任何变化都会拒绝加载；作者gzip包与manifest的原始hash保持不变。Ver1有有效350，后两版有10个hit_ja引用350但没有定义；不从Ver1补造该帧，无法证明原EXE错误恢复行为，明确保留这个源数据缺陷。

| 版本 | 说明词适配 | 无编号块隔离 | 涉及文件 | 原生解析最终结果 | 对战 / stage0 tick |
|---|---:|---:|---:|---|---|
| Ver1 | 228 | 0 | 21 | 110调用，0失败 | 61 / 61 |
| Ver2 | 308 | 1 | 23 | 117调用，0失败 | 61 / 61 |
| Ver3 | 307 | 1 | 24 | 119调用，0失败 | 61 / 61；另390tick |

三版Kate/KateEX真实对战与stage0都退出码0，真实产生人物移动、帧状态、敌兵/关卡对象和资源请求。Ver3的390tick仍停在stage0 phase0机关场景，不能据此声称完成关卡或通关。

## 扩大运行覆盖

`--scenario coverage` 在一个真实引擎进程逐一创建并update/draw每个原包人物和背景，并经实际native资源处理加载所有BMP与WAV；没有模拟BMP解析器。

| 版本 | 实际角色 / 背景数 | distinct BMP | WAV文件 | sound请求 | 退出码 |
|---|---:|---:|---:|---:|---:|
| Ver1 | 29 / 11 | 416 | 190 | 229 | 0 |
| Ver2 | 31 / 16 | 470 | 211 | 257 | 0 |
| Ver3 | 31 / 18 | 473 | 215 | 261 | 0 |

上表为最后切换作者有 BGM 完整包后重新运行的结果。三个独立原生进程均执行 61 tick、退出码 0；恢复的音乐 WAV 全部经 `context.sound` 进入实际 native WAV 解码，无音频解码失败，各版另真实解码一条 `bgm/main.wma`。角色、场景及招式 DAT 与先前无 BGM 包逐字节相同。两包差异与来源哈希见 `ASSET_PROVENANCE.md`。

`--move fa/fj/dj/uj/ja` 使用实际headless输入，观察真正 `control.enter_frame` 的结果，断言目标帧到达且MP下降。LF2每隔tick采样输入，所以测试每个按键边缘持有2tick，没有改产品输入逻辑。Ver3实测：

| 操作 | 工具参数 | 到达帧 | MP支出 | 结果 |
|---|---|---:|---:|---|
| L前J | fa | 251 | 120 | 通过；生成400/401投射物 |
| L前K | fj | 248 | 20 | 通过 |
| L下K | dj | 250 | 50 | 通过 |
| L上K | uj | 254 | 140 | 通过；生成406等对象 |
| LKJ | ja | 240 | 180 | 通过 |

`--scenario modes` 已实际启动并执行championship与team championship界面各6tick、battle真实match6tick、demo真实8人AI场景43tick；观察到实际模式ID2/3/4/5，最终退出码0。整组61tick加载78个BMP，11次sound请求、5个sound文件和1个WMA轨道。锦标赛只验证启动与UI执行，未完成整轮赛程。模式场景fixture只在工具MEMFS使用，不修改产品模式算法。

## 真正录像与回放链路

使用 `--scenario recording --record-out <path> --state-out <path>` 开启原生录制，170tick等待后执行真实J攻击，在正常胜负结算counter101保存。短对局fixture的第二名玩家初始maxHP为1，且在录制开始前设置位置/无blink；这些均实际写入正式.lfr metadata，不在回放时补注。解码实际header证实：slot0 maxHP500/x300/z400/blink0，slot1 maxHP1/x340/z400/blink0。原生create_replay从0x430等字段恢复初始血量。

本轮实际生成 `20000101_000000_VS.lfr`，10,019字节；用原EXE实际key（1345位）解码及zlib inflate得到6,491,672字节原生block，elapsed271、version30、data checksum24022206。全新官方WASM进程通过 `--scenario replay --replay-file <path> --compare-states <recorded JSON>` 调用真正native .lfr codec，并执行340tick。22个每15帧世界检查点直到frame330与原录制一致：全部对象ID/frame/HP/MP、x/y/z/vx/vy/vz、camera、round、winner；位置/速度以小数9位比较。正常跨过原生150帧校验门，无replay_error，退出码0。

产品Replay按钮导向浏览器录像面板；离线fixture仅发送官方native `action replay` 以使用CLI `--replay` 文件选择替代，不修改产品source。此结果验证引擎录制、.lfr压缩/key编码、原生解码/校验与回放世界推进；不代表浏览器下载对话框、IndexedDB跨重启保存或用户原版EXE已有.lfr全部兼容。

证据位于本地忽略目录：`tmp/lf2-openlf-research/generated-recording.lfr`、`recorded-states.json`、`replayed-states.json`。`recording-roundtrip.test.mjs` 可从已交付资源重新生成真实短对局与录像，再由独立WASM进程回放、逐项比较；无源码克隆或临时原包依赖。

## 内容和验收边界

原包三版均没有stage50–59生存关卡，不创建假的生存内容。Ver3音乐盒为真实地图id6、Music1对象id301和M_*.wav；地图、原生WAV处理与关卡对象已运行覆盖，实际扬声器发声仍需验听。所有人物验证初始match加载；没有逐一穷尽每个人物的所有动作。联网、回放全链路、移动触控、帧率、主观手感、与作者EXE逐招对照不由以上离线测试证明。

额外源码和原包哈希核查见 [COMPATIBILITY.md](COMPATIBILITY.md)：作者三版主 EXE 与官方 EXE 相同，特殊 state/effect 存在通用或范围处理，不应直接标为不支持。可具体指出的剩余入口问题为 Ver2/3 Bandit 缺失 frame 350；原 EXE 对匿名帧块的错误恢复行为尚未对照。

## 内置浏览器实际验收

按用户授权，仅使用 Codex 内置浏览器；没有外部浏览器、外部 CDP 或原生桌面自动化。正式入口为 `http://localhost:3000/gpt6.1sol-lf2-super/`，独立调试入口为 `http://localhost:3068/`。

- Ver1：从原菜单选择 Kate，与 Henry AI 进入香港体育馆 VS；看到原精灵、HUD、移动及真实 AI 伤害。F1 暂停、F4 返回选人可用。
- Ver3：从原 Stage 菜单选择 Kate，进入 STAGE 1-1 的原始机关小游戏场景；角色移动、场景物件及暂停在实际画面中可见。截图 `tmp/lf2-super-acceptance/stage-ver3.png`。这没有证明整关完成。
- 全屏：改用官方 Module fullscreen 策略后，选人画面八槽均完整显示；Escape 返回正常页面。未使用缩放图片模拟游戏画面。
- 远程同屏：两个独立内置浏览器页手工交换真实 RTC 邀请/回复，收到实际 canvas 视频（readyState=4，播放时间持续推进）；远端按 1 加入 P2、方向键从 Random 切至 Template，宿主画面对应变化。断开后关闭访客页。证据 `tmp/lf2-super-acceptance/remote-p2.png`。这是同机双页实测，不是跨公网可达性或音频验证。
- 录像导入：通过真实 file chooser 导入上述 10,019 字节原生 `.lfr`，从暂停的闯关切入回放，出现 Author 与 00:05 / 00:09 时间线，正常进入 P1 Win / P2 Lose 的结算。截图 `tmp/lf2-super-acceptance/replay-import.png`。
- 录像保存：刷新整页、重新启动游戏后，档案仍列出 `import_dc57726762b6d4a1.lfr`；点击播放再次正常结算。下载按钮实际保存文件，下载件与原样例 SHA256 一致：`dc57726762b6d4a1618bcc1836993c6bae23b28120c3d546c92fcd4924606f0d`。证据 `tmp/lf2-super-acceptance/replay-persisted.png`。已证明同一浏览器源的 IndexedDB 跨刷新恢复，未测试隐私模式或清除站点数据之后保留。
- 3000 统一入口：实际加载 Ver2 原菜单，WASM 与资源请求正常，当前页 console error / warn 为 0。3068 历史诊断中保留开发早期 gzip / Lua / canvas 错误，不能将旧日志误计为最终入口错误。
- 有 BGM 最终包：重新从 3000 入口加载 Ver2，进入原选人、Kate 和电脑 Jack 的战局设置，资源校验正常。原菜单 Exit 已接到保存录像并返回网页启动页；实际点击后出现可再次点击的“进入游戏”。该路由变更后额外重跑 host 7 项测试及生产构建，全部通过。

生产构建成功；主 JS 531.37 kB（含原包 manifest），Vite 提示大于 500 kB，属于体积提示。`npm run sync:check` 最终通过，当前并行工作区共 64 项目；结构通过不代表正式评测。`policy:test` 已通过 16 项，`benchmark:check` 通过且没有正式评测记录。本项目按已有引擎和原资源移植记录，不归为从零复刻的公平主榜结果。
