<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/gpt5.6solultra-life-gba/ 。
并行开发（仓库根目录）：`npm run dev:one -- gpt5.6solultra-life-gba`，访问 http://localhost:3037/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# 口袋日常

一款运行在浏览器中的 GBA 风格生活模拟小游戏。内部画面固定为 240×160 像素，使用 Canvas 2D（二维画布）逐像素绘制，不依赖图片素材。

## 游玩

从仓库根目录启动统一开发服务器：

```bash
npm run dev
```

打开 `http://localhost:3000/gpt5.6solultra-life-gba/`。

## 操作

- 方向键 / WASD：移动
- Z / J / 空格 / A 按钮：互动与确认
- X / K / Esc / B 按钮：取消
- P / START：开始或暂停
- M / SELECT：切换声音

靠近家具后，角色头顶会显示 `A` 提示。吃饭、睡觉、洗澡、娱乐和社交都会推进游戏时间并改变需求；数据会自动保存到浏览器 `localStorage`（本地存储）。

## 测试

```bash
npm test --workspace gpt5.6solultra-life-gba
```
