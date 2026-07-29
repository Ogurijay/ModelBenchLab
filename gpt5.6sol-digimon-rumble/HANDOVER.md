# HANDOVER — DIGI-RUMBLE

> 交接日期：2026-07-19
> 项目目录：`gpt5.6sol-digimon-rumble`
> 技术栈：Vanilla JavaScript、Three.js 0.185、Vite 8、Node 原生测试

## 当前交付

当前代码已从“亚古兽对加布兽的一局原型”扩展为完整产品结构：标题/菜单/模式/选择/杯赛/战斗/暂停/结算/结局/资料库/设置流程，1–4 人战斗模拟，8 条三段谱系、2 名单形态 Boss、5 场地、4 规则、六战解锁，以及版本化存档和设置。

`src/main.js` 负责把流程、UI、资源预载、比赛配置、固定步长模拟、输入、渲染、音频、结算和自动化接口接到同一个生命周期。业务状态以服务和纯模拟快照为准，Three.js 视图不反向决定伤害或胜负。

## 模块地图

| 模块 | 职责 |
| --- | --- |
| `src/data/gameData.js` | 角色/形态、Boss、场地、规则、道具展示数据、难度、六轮杯赛 |
| `src/app/GameFlowController.js` | 有限状态机（FSM）、模式流程、杯赛奖励、结算和返回路径 |
| `src/app/MatchFactory.js` | 将流程状态归一化为比赛/模拟配置，并把多人快照归一化为结算摘要 |
| `src/game/BattleSimulation.js` | 无 DOM 的确定性战斗内核：1–4 人、CPU、攻击、进化、四规则、机关、道具和快照 |
| `src/game/InputController.js` | 双键盘、最多四手柄、平面移动与普通/远程两种攻击输入 |
| `src/services/SaveService.js` | `digi-rumble.save` v1：解锁、杯赛、DATA、徽章与记录 |
| `src/services/SettingsService.js` | `digi-rumble.settings` v1：难度、音量、画面、辅助与控制设置 |
| `src/services/AssetManager.js` | GLB 预载、进度、缓存、克隆、引用计数、中止与卸载 |
| `src/render/Arena.js` | 五场地程序化表现、2.5D 平台边界与机关预警 |
| `src/render/FighterView.js` | 真实形态切换、骨骼动画语义映射与快照同步 |
| `src/render/EffectSystem.js` | 多斗士颜色、投射物、道具、命中、进化、Ultra、KO、机关特效 |
| `src/audio/AudioSystem.js` | Web Audio 程序化战斗反馈音 |
| `src/ui/GameUI.js` | 全产品页面、HUD、公告、Toast（短提示）、加载和错误界面 |
| `src/main.js` | 浏览器组合根、固定 60 Hz 循环、资源与界面生命周期、`window.__bench` |

## 关键运行时契约

### BattleSimulation

```js
const simulation = new BattleSimulation({
  rule: 'stock',              // stock | timed | race | training
  fighters: [/* 1–4 个唯一 id */],
  duration: 90,
  stocks: 3,
  raceTarget: 2,
  readyTime: 2.4,
  respawnDelay: 1,
  hazards: ['pulse'],
  items: ['energy', 'health', 'power', 'life'],
  platform: { minX: -11, maxX: 11, laneZ: 0, fallY: -4 },
  seed: 17,
});
```

斗士至少需要 `id`；常用字段为 `name`、`controller: 'human' | 'cpu'`、`difficulty`、`forms`、`stocks`、`energy`、出生坐标和可选 `team`。`forms` 必须传真实形态数组：普通谱系三个，Boss 一个；内核不会再填充假形态。

固定步长调用：

```js
simulation.step(1 / 60, {
  fighters: {
    p1: { moveX: 1, attack: true, ranged: false },
  },
});
const events = simulation.drainEvents();
const snapshot = simulation.getState();
```

玩家输入动作字段为 `moveX`、`attack`、`ranged`、`jump`、`evolve`/兼容别名 `overdrive`、`pause`；`skill` 只保留为 `ranged` 的兼容别名。模拟会忽略纵深移动并在每个固定步把所有战斗实体锁回 `platform.laneZ`。输出快照额外包含 `combatPlane: { horizontal: 'x', vertical: 'y', lockedDepth }`，便于渲染和自动化确认 2.5D 平面契约。

自由形态作弊使用 `simulation.forceForm(fighterId, 1 | -1)`；升阶/降阶均不扣能量，达到真实形态数组边界时返回 `false`。组合层通过 `window.__bench.cheatEvolve(fighterId)` 和 `window.__bench.cheatDevolve(fighterId)` 暴露同一能力，设置键为 `freeEvolutionCheat`。

事件驱动视听反馈，常用类型包括 `announce`、`attack`、`hit`、`skill`、`projectileHit`、`energyPickup`、`itemSpawn`、`itemPickup`、`evolution`、`devolution`、`ultra`、`ko`、`respawn`、`hazard`、`hazardHit`、`paused`、`resumed`、`ended`。每个固定步后应排空一次，避免重复表现。

### 流程与比赛工厂

`GameFlowController.getState()` 返回 `screen`、`revision`、深拷贝 `context`、当前 `save`、`settings` 和 `canGoBack`。公开方法包括启动/菜单/模式/角色/场地/战斗/暂停/结算/重试/继续/返回；也可用 `dispatch(event, payload)`。只从允许的状态调用，非法路径会抛 `InvalidFlowTransitionError`，不要在 UI 中直接改 `context`。

`buildMatchConfig(flowState, options)` 输出：

- `simulation`：可直接传给 `BattleSimulation` 的配置；
- `roster`、`humanIds`：渲染、输入和多人胜负归属；
- `arena`：场地数据；
- `meta`：模式、规则、难度、人数、时间、场地和杯赛轮次。

杯赛的对手阵容来自 `CUP_ROUTE`，不能被自由乱斗 UI 覆盖；Boss 形态原样传递。`summarizeBattle(snapshot, humanIds)` 把多人胜负、最大连击、伤害和时长归一化为 `finishBattle()` 输入。

### 存档、设置与资源

`SaveService` 和 `SettingsService` 均可注入 Storage（存储）实现，支持读取、领域写入、`subscribe`、`reset` 与版本迁移；浏览器存储不可用时共享内存回退。不要绕过服务直接写 `localStorage`。

`AssetManager.loadMatch(characters, { signal, onProgress })` 预载本局全部形态；`FighterView.create(manager, character, options)` 为每名斗士克隆模型。切局时依次中止旧加载、销毁视图、清理特效、释放引用，再调用 `evictUnused()`。资源错误保留原始 URL 和 cause（原因），供 UI 给出可操作提示。

运行时道具只能使用 `energy`、`health`、`power`、`life`。`gameData.ITEMS` 的展示 id 与 effect 已对齐这四种语义（`evo-orb → energy`）；比赛工厂向模拟传递 effect 类型，不能把展示 id 当成构造器类型。

## 浏览器组合与自动化

`src/main.js` 使用 60 Hz 固定步长，单帧最多补 8 步并把异常长帧截到 0.1 秒。每帧顺序为读取输入、推进模拟、消费事件、同步斗士/投射物/道具、更新相机与机关预警、更新特效、渲染。页面隐藏时自动暂停；切局和卸载时中止加载并释放 Three.js/Web Audio 资源。

浏览器暴露 `window.__bench`：

| API | 用途 |
| --- | --- |
| `ready`、`screen`、`state`、`getState()` | 读取流程、运行时、战斗、加载、结果和资产统计 |
| `dispatch(action, payload)` | 触发与 UI 相同的产品动作 |
| `startQuickMatch(options)` | 从任意非战斗流程快速创建杯赛/自由/训练对局 |
| `startBattle(payload)`、`waitForMatch()` | 启动并等待模型加载 |
| `stepFrame(frames, commands)` | 以固定步长推进，适合可重复的浏览器 QA |
| `finishCurrentMatch(winner)` | 自动结束当前局并进入正常结算 |
| `pause()`、`resume()`、`retry()`、`next()`、`exitToMenu()` | 驱动生命周期 |
| `assetStats()` | 检查缓存与引用状态 |

`startQuickMatch` 会尊重当前存档解锁；请求未解锁角色/场地时会回退到第一个已解锁项。自动化若要测试 Boss，应先通过服务/正常杯赛建立对应存档，而不是绕过产品约束。

## 发布风险与当前版本边界

1. **资产授权（发布阻断）**：26 个 GLB 的真实 E:\XHub 源路径和 SHA256 已记录在 [`docs/ASSET_PROVENANCE.md`](docs/ASSET_PROVENANCE.md)，源/目标 26/26 字节一致；但可证明的公开再分发和商业授权仍均为 0。公开部署前必须取得书面许可或替换资产。
2. **设置范围**：本版采用 README 所列固定键位和中文界面；自定义改键、隐藏操作提示和语言切换不属于当前可玩范围。controls 存档结构保留给后续扩展。
3. **音频范围**：本版只有 Web Audio 程序化战斗音效总线，没有独立音乐声源；运行时以主音量 × 音效音量控制。
4. **手柄热插拔槽位**：手柄按 `navigator.getGamepads()` 当前顺序映射，未持久化设备与角色槽位；四人开局前需人工确认。
5. **追加设备矩阵**：Chrome 产品冒烟已通过，但四只实体手柄、所有浏览器/GPU、音频设备和无障碍组合仍需按发布平台补测。
6. **玩法边界**：碰撞采用确定性 2.5D 近似而非刚体引擎；没有在线联机、原作全部角色/10 场地/9 规则，也不应宣传为 1:1 移植。

## 验证记录

交付基线命令：

```powershell
npm test
npm run build
```

2026-07-19 在项目目录实测：

- `npm test`：32/32 通过，0 失败、0 跳过；覆盖 battle、flow、input、match-factory 四组测试文件，新增平面锁定和自由形态作弊回归。
- `npm run build`：成功，Vite 8.1.2 转换 23 个模块；产物 JS 约 763.83 kB（gzip 205.76 kB）。
- 构建只有一个非阻断警告：主 JS 分块超过 500 kB；后续可用动态 import（动态导入）拆分产品页/Three.js 资源路径。
- 真实 Chrome 冒烟：Boot 时缓存为 0；4P 自由乱斗按局加载 12 个形态且四名均为 human；暂停/继续/结算正常；结果页后缓存与引用归零。
- 真实 Chrome 流程：杯赛下一关与失败重试正常；训练固定 1P+1CPU、无限时间、100 能量正常。
- 尚未用四只实体手柄和全部 26 个形态逐一走查；完整发布验收清单见 `docs/GAME_DESIGN.md` 第 12 节。

## 建议接续顺序

1. 依据 [`docs/ASSET_PROVENANCE.md`](docs/ASSET_PROVENANCE.md) 取得覆盖模型、内嵌贴图、动画和角色形象的书面许可；无法取得的资源全部替换后再发布。
2. 用浏览器自动化走通自由乱斗与六轮杯赛，再以真实手柄补做四人输入和热插拔验证。
3. 若后续增加改键系统，只暴露左右移动、跳跃、普通攻击、远程攻击、自然进化和暂停，不重新引入纵深或额外攻击类型。
4. 若需要网络发布，再做代码分块、缓存策略、低端 GPU 性能档与错误遥测；不要在授权审计前上传角色资产。
