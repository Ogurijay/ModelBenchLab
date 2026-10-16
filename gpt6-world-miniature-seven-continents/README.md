# 世界一隅 · 七大洲微缩公园

精致建筑沙盘风格的可交互世界地标公园。七大洲、18组主要地标与南极自然景观；支持俯瞰、步行、地标导览、步道自动游园、日夜切换、拍照，包含园区小地图和观光列车。

## 运行

统一门户：仓库根目录 `npm run dev`，进入 http://localhost:3000/gpt6-world-miniature-seven-continents/ 。已存在本仓库3000服务时复用，不重复启动。

并行开发：根目录 `npm run dev:one -- gpt6-world-miniature-seven-continents`，或本目录 `npm run dev`。独立登记端口3071，启用strictPort；生产预览 `npm run preview` 使用同一端口，先停本项目开发服务再启动预览。

构建：根目录 `npm run build --workspace gpt6-world-miniature-seven-continents`；测试：`npm test --workspace gpt6-world-miniature-seven-continents`。

## 操作

- 俯瞰：左键旋转、右键平移、滚轮缩放。
- 步行：WASD或方向键移动，拖动转头，点击画面锁定鼠标，Esc释放；Shift加速。
- 点击左侧大洲或右侧地标切换观景机位；自动游园沿主步道行进，Esc停止。
- P隐藏/恢复界面；拍照打开当前3D画面预览，再点击保存PNG。夜景按钮切换金色日景与蓝调夜景。
- `?debug` 显示曝光与太阳强度滑块，可复制设置。

## 技术与边界

Three.js固定0.186.1，WebGL2，Vite8。所有场景模型为程序化真实几何；概念图不参与场景渲染。静态网格按材质合并，树木使用InstancedMesh。坐标与统一地面高度见src/world/coords.js，布局见layout.json。

本版是可运行的场景初版。地标是具有关键特征的微缩表达，不是测绘复原；建筑内部暂不开放。海面使用1024像素实时平面反射、细波扰动与远水雾化；泰姬陵近景池面启用独立反射，石材表面有程序化微粒和弱接缝。环境美术仍可向概念图继续精修，六轮内部视觉评审最后为6.1/10，未达到9分目标。性能目标为1080p60fps，最终版尚未完成持续前台性能验收，具体范围见docs/validation.md。未进行正式基准评测。

项目截图、录制及测试中间产物统一放仓库 `tmp/world-miniature/`，构建产物为本项目dist/。概念参考位于shared/assets/world-miniature/concepts/，制作计划见PLAN.md。
> 首版已集成。后续美术精修以概念图为目标，具体差距与内部评审记录见docs/validation.md。
