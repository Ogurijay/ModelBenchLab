# 接手说明

## 当前入口与范围

- 项目：`D:\Administartor\Study\WorkStation\ModelBenchLab\gpt6-mini4wd-room-racing`
- 统一入口：`http://localhost:3000/gpt6-mini4wd-room-racing/`
- 独立入口：`http://localhost:3051/`
- 仓库登记以 `benchmark/registry.json` 为事实源，根 `package.json` workspaces 与 lockfile 已添加本项目。
- 本轮开始时根 registry/package/lockfile 已有修改；它们被保留。其他项目目录和已有未跟踪项目没有改动，没有 Git 提交、推送或远程发布。

## 已交付的运行闭环

选车 → 选场地/赛道 → 1–8 车发车 → 自动或手动驾驶 → 完成圈数 → 全场成绩。工坊六部件分别展开并装配，配置被应用到新的比赛；自定义车型可创建、持久化、导入导出。

## 继续工作顺序

1. 先运行并体验默认赛道、跟车视角和改装工坊，收集用户对车型造型与手动操作的反馈。
2. 读 `src/data.js`、`src/track.js`、`src/race.js` 理解配置和导轨规则，再读模型与视图。
3. 如需要更贴近动漫原型，逐辆替换模型细节，保留六部件分组和升级可视化接口。
4. 如要提升物理真实性，先确立世界尺度、实际马达与轮径参数、碰撞标准和可验收情景，再替换当前简化模型。
5. 每次 Three.js 改动前按本机 `check-threejs-updates` 技能核验当前版本；不要借此项目升级其他项目。

## 已知边界与未验证项

- 无刚体物理、真实动力标定、轮胎磨损或飞出赛道后的自由落体；碰壁采用恢复减速规则。
- 经典车型为程序化风格模型，未宣称官方模型还原。
- 自定义赛车复用八种基础轮廓，不解析外部 GLB/FBX。
- 浏览器测试以 Windows 本机 Edge 的无头 WebGL 2 运行，不等于所有手机硬件的实际帧率验收。
- 用户尚未验收视觉相似度、键盘/触屏手感和长期运行表现。
- 导入赛车 JSON 有数量、大小、颜色、属性范围和总和限制；不接受脚本。存档失败会提示并降为本次会话可用。

## 精确检查命令

在仓库根目录：

```powershell
npm run test --workspace gpt6-mini4wd-room-racing
npm run build --workspace gpt6-mini4wd-room-racing
npm run sync:check
npm run dev
```

另一个终端：

```powershell
node gpt6-mini4wd-room-racing/tests/browser-smoke.mjs
```

报告：`docs/browser-validation.json`。单元测试覆盖四车道连续性、三赛道八车完赛、手动驾驶、换道约束、升级后的实测圈速变化、变帧率计时一致性、畸形拓展数据。

## 2026-10-01 仓库结构整理

- 常规入口：`http://localhost:3000/gpt6-mini4wd-room-racing/`。
- 独立调试：根目录运行 `npm run dev:one -- gpt6-mini4wd-room-racing`，端口 3051。
- 交接与改动记录以根目录文件为准。测试单元目前为 draft；结构校验通过不代表正式评测完成。
