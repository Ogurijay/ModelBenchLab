# CHANGELOG — claudefable5-domino-rube

## 2026-07-10 修复会话(静态审查后)

- **端口修正(blocker)**:vite.config.js 3025 → 3026,与冻结任务文档 / registry.json / RULES.md / 门户 / launch.json 登记一致(3025 是姊妹项目 cloth-flag 的端口);README / HANDOVER 同步更正。
- **链条实际跑通(初版只 desk-check,实测第一环即断)**:
  - 骨牌间摩擦自锁是断链根因:新增专用 `domino` 物理材质,骨牌-骨牌摩擦置 0(0.02~0.42 全部实测卡死),对台面保持高摩擦抓地;
  - 斜坡上沿下沉 1.5cm 藏进发球台缘,消除坡体延伸段凸出台面形成的 1.3cm 暗脊;
  - 跷跷板新增近端止挡块(`stopDeg=10°`,物理 + 视觉),板急停时弹射杯以竖直偏 +x 方向抛球,替代原「翻满行程几何强制接触」的擦碰设计(实测该设计余量为 0 且倒飞);
  - 锤球下移至 y=0.78 对准小球实测弹道、减重至 0.45kg;铃铛同步下移。
- **运行时验证补齐**:新增 `scripts/verify-chain.mjs` headless 回归(5 次重建→触发→步进,断言必响/五阶段单调/逐比特一致/无掉桌,已 PASS,bellRungAt=6.725s);浏览器端 5 次运行逐比特一致(bellRungAt=6.250s,差异为跨 V8 版本 Math ULP,详见 HANDOVER);验证记录写入 HANDOVER。
- **控制台清零**:three 0.185 弃用 PCFSoftShadowMap → PCFShadowMap(消除 warning)。
- **HUD 降频落实**:ui.refresh 原注释宣称降频但实现每帧全量重写 DOM;现数字文本每 6 帧一写(≈10Hz),阶段芯片按状态签名脏检查,`stepFrame`/复位走 force 全量刷新。
- main.js 新增 `__bench.probe()` 物理探针(骨牌倾角/球位/板角)。
- 主会话终验后移除诊断期临时接口 `__bench.domino(i)` / `__bench.kick(i,w)`(裸刚体引用与直接改角速度仅用于断链定位,不属长期 API;`probe()` 保留);浏览器复测两次全链 bellRungAt=6.250s 逐比特一致。

## 2026-07-10 初版实现

- 五连锁机关:多米诺弧线(25 张)→ 斜坡+高架滚球 → 杠杆跷跷板弹射 → 铰链摆锤 → 终点铃铛(碰撞即响)。
- 确定性物理:cannon-es 固定 1/120 步长 + 累加器渲染解耦;触发前世界冻结;复位 = 完整重建 World;禁 sleep;单帧最多追 5 步防后台切回爆炸。
- 触发 / 复位按钮(可反复,`bellRungAt` 按仿真时间严格一致);触发 = 对第一张骨牌施加冲量。
- 双相机:自动运镜(按阶段跟拍活动机关,阻尼插值,响铃后拉回全景)⇄ 手动 OrbitControls,`C` 键切换。
- 布景:暖主光 + 冷补光 + 程序化环境反射;canvas 木纹桌面 / 圆形高台(顶面弧线镶嵌)/ 渐变夜色背景;骨牌暖→冷色相扫描。
- 响铃反馈:WebAudio 六分音合成钟声 + emissive 发光脉冲 + 点光闪烁 + 彩屑粒子 + 中文横幅。
- 全合成音效:骨牌哒声 / 木板闷响 / 金属叮当(碰撞事件驱动,节流)。
- 中文 HUD:阶段芯片(带各阶段触达时刻)、帧率 / 仿真时间 / 铃响时刻、慢动作开关(`S`)。
- `window.__bench = { ready, stepFrame(n), getState(), trigger(), reset() }` 调试钩子。
- 文档:README / HANDOVER / CHANGELOG。
