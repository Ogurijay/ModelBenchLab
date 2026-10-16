# Kate 数据与 OpenLF2 兼容性核查

本页记录源码和实际资源核查结果。能够解析、存在处理路径、已运行的玩法，与逐招对照原版 EXE 的行为等价，是不同结论。

## 原包没有修改主游戏 EXE

三版作者包 `LF2_Kate_Ver1/2/3/lf2.exe` 的实际 SHA-256 均为：

```text
12dfa00f6b767508612550e9ab27ab74b4201ff4cb9ff31d068925924eab8fc5
```

本次通过官方 OpenLF2 WASM，从已验证的 LF2 v2.0a installer 内读取 `lf2.exe`，得到同一 SHA-256。此过程只读取 executable 数据，没有运行 Windows EXE。因此，这三个实际作者包的主游戏 EXE 与官方 installer 内的 EXE 字节一致，不能把下述 DAT 值称为作者修改 EXE 才支持的扩展。

用于读取的官方 installer 为 29,586,263 bytes，SHA-256：

```text
540c485547e234b0d09595f54d067aafd7176092c308aca61868f3cbc03030e1
```

官方验证逻辑：[src/resources/installer.cpp:11](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/src/resources/installer.cpp#L11)。原包哈希亦可在 `tmp/lf2-super-research/audit-data/` 的来源审计中复核。

## state 3289：接受数值，走普通帧流程

三版 `data/bandit.dat` 的 frame 319（`A3_shadow`）均使用 `state:3289`，并声明 `pic:999`、`wait:20`、`next:1000` 和一块宽 530、injury 40、effect 1 的普通攻击区域。

- [object_data.cpp:345](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/src/resources/object_data.cpp#L345) 原样读取 state 整数，没有拒绝 3289。
- 没有找到 3289 的专用状态分支；普通按键转帧与速度字段仍执行：[control.lua:397](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/scripts/base/game/control.lua#L397)、[control.lua:365](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/scripts/base/game/control.lua#L365)。
- 普通动画按 wait/next 推进：[animation.lua:11](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/scripts/base/game/animation.lua#L11)。进入 next 1000 后，由 [match.lua:534](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/scripts/base/game/match.lua#L534) 的越界帧路径移除对象。攻击区域仍参与普通碰撞。

结论是“存在通用处理路径，3289 的原版特殊语义尚未逐帧对照”，不是“该帧不支持”。

## effect 6 / 9 / 25：通用与范围处理

effect 在 [object_data.cpp:205](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/src/resources/object_data.cpp#L205) 原样读取整数。这三个值没有独立命名分支，但不会因此跳过攻击。

| 值 | 作者 DAT 的实际使用 | 当前引擎实际路径 |
|---|---|---|
| 6 | V1 共 26 处，V2/V3 共 30 处；涉及 criminal、john、john_ball、jan_chaseh、rudolf_weaponf，V2/V3 另有 pkmnt | 普通碰撞、伤害、击退和攻击间隔；负 injury 按普通伤害公式增加 HP。 |
| 9 | V1/V2 各 2 处，V3 共 3 处，均在 john_ball；例如 frame 51 injury -50 | 同样走普通命中与负伤害路径，没有专用 effect 9 分支。 |
| 25 | 三版各 56 处，位于 bandit_flame / bandit_flame2 | `floor(effect/10)==2` 命中元素范围判断，绕过 Knight/Louis 的部分护甲条件，其余仍走普通命中。 |

普通命中与 HP 计算：[combat.lua:367](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/scripts/base/game/combat.lua#L367)、[combat.lua:383](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/scripts/base/game/combat.lua#L383)。角色专用普通/锐利命中音效仅显式匹配 effect 0/1：[combat.lua:430](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/scripts/base/game/combat.lua#L430)，所以不能直接承诺 effect 6/9 播放同样音效。

effect 25 的元素护甲判断：[combat.lua:259](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/scripts/base/game/combat.lua#L259)。强制烧伤帧的分支只列举 2、20、21、22；23 另有声音路径，25 不在其中：[combat.lua:556](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/scripts/base/game/combat.lua#L556)。不能把 25 等同于 effect 2 的全部烧伤行为，也不能说它完全未处理。

## 可具体点名的剩余阻碍

V2/V3 的 Bandit 有一个写成 `<frame> transform`、缺少整数编号的块，位于编号 319 与 351 之间。原 OpenLF2 解析器会拒绝这种块：[object_data.cpp:331](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/src/resources/object_data.cpp#L331)。当前 [src/dat-compat.js](../src/dat-compat.js) 在内存中隔离该匿名块，没有擅自补编号；原作者包和归档字节不变。V1 没有此匿名块。

V2/V3 Bandit 的 frames 0/1/2/3/5/6/7/8/110/111 声明 `hit_ja:350`，但运行数据没有定义 frame 350。[control.lua:23](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/scripts/base/game/control.lua#L23) 查不到目标帧即返回，因此该人物的 Defend → Jump → Attack 入口不能进入 350。这是可指出的具体入口缺失；不能扩大为“Bandit 全部变身不支持”。原 EXE 如何恢复这个错误块，仍没有运行对照证据。

包中最大 itr kind 16 实际是已有的 freezing_whirlwind；opoint kind 4100 也满足普通 `kind > 0` 生成门槛。不得仅凭数值较大就称其不支持。源码：[constants.lua:193](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/scripts/base/game/constants.lua#L193)、[objects.lua:120](https://github.com/OpenLF2/OpenLF2/blob/bb335c9967adbafc6d16b130a8a26f4e984c493b/scripts/base/game/objects.lua#L120)。

上述源代码核查不能替代对原版 EXE 的逐招、逐帧比较。除了已经明确的匿名帧/350 入口，未找到足够证据把这些通用值列为本改版的额外“不支持人物功能”。
