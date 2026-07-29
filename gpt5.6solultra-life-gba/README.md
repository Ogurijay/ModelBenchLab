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
