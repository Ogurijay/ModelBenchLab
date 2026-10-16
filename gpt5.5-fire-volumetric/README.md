<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/gpt5.5-fire-volumetric/ 。
并行开发（仓库根目录）：`npm run dev:one -- gpt5.5-fire-volumetric`，访问 http://localhost:3032/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# 燃烧标本 — Three.js r185 实体火焰

这是 ModelBenchLab 的 `fire`（实体火焰模拟）任务实现。场景使用 Three.js r185 的自定义 ShaderMaterial，在一个三维包围盒内执行体积光线步进（ray marching）：每个像素沿观察射线采样程序化密度场，并把颜色与透明度从前到后积分，因此可从任意方向环绕观察，不是始终朝向相机的平面贴图。

## 运行

从仓库根目录 `E:\ModelBenchLab` 运行：

```powershell
npm run dev
```

访问 `http://localhost:3000/gpt5.5-fire-volumetric/`。

单项目调试：

```powershell
npm run dev:one -- gpt5.5-fire-volumetric
```

访问 `http://localhost:3032/`。

## 交互

- 鼠标拖拽：环绕火焰
- 滚轮：拉近 / 拉远
- 空格：暂停 / 继续
- 控制台：调节火势、湍流、横向风和渲染质量
- 重置观察视角：恢复默认构图

## 技术要点

- 96 步上限的动态体积采样，质量档位实际使用 36 / 54 / 72 步。
- 四层三维分形噪声（FBM，分形布朗运动）驱动密度与域扭曲。
- 高温核心、明亮主焰、橙红外焰及底部蓝焰按温度场连续着色。
- 128 个火星与 44 个烟羽粒子，受热流和横向风共同影响。
- 两级动态火光照亮石材、金属火盆和焦木，亮度由多频波动合成。
- 所有几何、纹理、粒子和噪声均由代码生成，不加载外部模型、图片或视频。
- 提供 `window.__bench` 自动化验证接口。
