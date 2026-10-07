# 本次交付验收

日期：2026-10-07。以下为本目录的实际执行结果，不能替代正式横向评测或外形相似度评级。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 物理与赛道测试 | 12 / 12 通过 | `tests/racing.test.js`，`npm test --workspace gpt6astra-mini4wd-aerial-racing` |
| 生产构建 | 通过 | `npm run build --workspace gpt6astra-mini4wd-aerial-racing`；有 Three.js 单包体积提示 |
| 生产页面浏览器验收 | 26 / 26 通过，0 条 console error / pageerror | [browser-acceptance.json](qa/browser-acceptance.json) |
| 门户卡片和根服务子路径 | 通过；八车与八张模型图加载成功 | [root-route.json](qa/root-route.json) |
| 仓库规则回归 | 8 / 8 通过 | `npm run policy:test` |
| 当前仓库完整结构 | 通过，55 个项目 | `npm run sync:check` |
| benchmark 记录校验 | 通过，0 条正式运行记录 | `npm run benchmark:check`；20 个任务仍为 draft |

生产浏览器：Microsoft Edge 154.0.4258.62，独立 headless 上下文，1600×1000，另检查 1280×800。生产 URL 为 `http://127.0.0.1:3059/`；门户路由另在 `http://127.0.0.1:3000/gpt6astra-mini4wd-aerial-racing/` 验证。

## 功能与物理证据

三条赛道的完整八车八圈全部完赛。平均单圈：天穹双环 110.596 m、螺旋登峰 124.046 m、连弯试验场 99.404 m。每圈换一个车道，八圈涵盖的总路程相等；所有路径样本坐标和姿态有限，闭合接缝的位置与切线连续。

测试确认环道顶部低速支撑力为负，高速可保持支撑；低动力赛车会实际离轨并按重力落下。全员退赛后仍完成落地，比赛计时停止。60 Hz 和 120 Hz 的呈现帧输入产生相同物理结果。

浏览器使用真实按钮、下拉框、W / S 键盘事件和文件导入，检查八款车、参考对照、13 组件拆解、点击裸露马达选择编辑器、改装数值和双层导轮几何、刷新保存、导出、拒绝非法文件、合法导入、自定义赛车、换赛道 / 房间 / 车数、锁定配置、暂停、继续、完赛和重开。

贴身镜头在实际物理驱动的环道段暂停取证，未使用强制 seek：相机与赛车距离约 0.346 m，镜头 up 的 Y 分量约 -0.975；赛车仍有正支撑力且没有脱轨。完整比赛通过同一物理循环加速推进至八圈完赛，排名界面显示八个 FINISH。快进验证不代表实时观看了每一圈。

重复遍历八款车后，渲染器登记的几何数量保持 631、纹理数量保持 59，未因模型替换累计增长。此检查针对该选择流程，不构成无限时长内存或所有设备性能保证。

## 画面证据

- [房间赛道全景](qa/race-overview.png)
- [改装工房](qa/garage-cyclone.png)
- [结构展开](qa/garage-exploded.png)
- [贴身起跑](qa/race-chase.png)
- [实际环道倒置跟随](qa/loop-inverted-chase.png)
- [八车完赛](qa/race-results.png)
- [1280×800 桌面布局](qa/desktop-1280.png)

模型六角度及来源见 [REFERENCES.md](REFERENCES.md)。八份输入规格严格结构校验通过，但完整 img2threejs 自动流程没有通过。像素轮廓分割失败和旧 GPU 捕获失败都保留，不能将这部分称作“相似度验收通过”。未做独立视觉盲评、实车参数标定、移动端适配或正式 benchmark 评分。

初次 smoke 的 favicon 404 已通过内嵌 SVG 图标修复。其早期 `smoke.json` 保留作历史失败记录；当前生产页面的错误结论以 `browser-acceptance.json` 为准。早期验收曾用 IPv4 访问只监听 IPv6 的独立开发服务，产生连接失败；最终在明确绑定 127.0.0.1 的生产预览上完成全部验收。
