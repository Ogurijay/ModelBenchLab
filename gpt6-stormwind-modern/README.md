# 暴风城 · 现代版城市漫游

Three.js **0.186.1** / WebGL 程序化城市。包含九个导览区、90 栋可进入街区建筑、教堂中殿、法师塔底层、要塞王座厅、英雄谷、运河石桥与港口。支持步行、俯瞰、奔跑、跳跃、午后/蓝调切换及中文小地图。

这是根据现代地图与获批概念制作的风格化近似重建。地标和城区相对关系有参考依据，建筑细部、道路及岸线为程序化设计；没有使用原游戏模型、贴图或地图数据。最终视觉分数和剩余差距见 [HANDOVER.md](HANDOVER.md)，不把可运行等同于 1:1 还原。

## 运行

- 统一门户：根目录 `npm run dev` → http://localhost:3000/gpt6-stormwind-modern/ 。复用已有本仓库 3000 服务。
- 独立开发：根目录 `npm run dev:one -- gpt6-stormwind-modern` → http://localhost:3070/ 。
- 构建：`npm run build --workspace gpt6-stormwind-modern`。
- 导航测试：`npm test --workspace gpt6-stormwind-modern`。
- 独立生产预览：项目目录 `npm run preview`，使用 3070 strictPort，与独立开发服务二选一。

## 操作

俯瞰模式拖动旋转、滚轮缩放。点击“从英雄谷出发”进入步行：WASD/方向键行走，Shift 奔跑，Space 跳跃。点击画面可在支持的浏览器中捕获鼠标；也可按住鼠标拖动环视。Esc 释放鼠标，F 切换模式，H 隐藏/恢复界面。右侧九区导览可切换地标，顶部按钮切换昼夜。

`?debug` 显示曝光、太阳高度、雾、评审机位、线框、画布截图、设置与验证报告导出。`?debug&view=statues` 可直达英雄桥评审机位。调参仅影响当前页面，导出的 JSON 用于后续固化。

## 验证与资料

- 8 项几何/导航测试检查门洞、台阶、城门/英雄桥、教堂/要塞轴线、港口坡道、九区连通及全部民居入口可达。
- 内置浏览器实际验证行走、奔跑、跳跃、拖动环视、主要建筑入口和港口下降；详细范围见 `../tmp/stormwind-review/runtime-qa.json`。
- 每轮实机截图、报告及独立评审：`../tmp/stormwind-review/r1/` 至 `r6/`。演进画廊：`../tmp/stormwind-review/progress/progress.html`。
- 本机帧时间是内部运行样本，正式任务仍为 `code3d-stormwind-modern-001` v1 **draft**，不是正式基准成绩。
- [PLAN.md](PLAN.md) 与 [平面图](plan/floorplan.svg)；坐标和放置数据位于 `src/world/coords.js`，单位米，+Y 向上。
- [参考来源](refs/README.md)；获批概念及同机位材质目标位于 `../shared/assets/stormwind-modern/concepts/`，仅作参考，未作为运行背景或纹理。
- 截图、报告与下载原件统一保存在已忽略的 `../tmp/stormwind-review/`；概念图目录也由 `.gitignore` 排除。这些本地图片产物不提交 Git。

没有 NPC、任务、战斗、服务器或商店系统。普通房屋只提供可进入的底层内景；阁楼小窗及部分地标窗为装饰构件。旧有暴风城项目保持独立。
