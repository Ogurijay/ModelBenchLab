<!-- modelbenchlab-access -->
统一访问：在仓库根目录运行 `npm run dev`，打开 `http://localhost:3000/grok4.7-dev-world/`。
独立调试：根目录运行 `npm run dev:one -- grok4.7-dev-world`，打开 `http://localhost:3052/`。下文子目录启动说明仅用于独立开发。

# 开洲 · 开发世界

在一块程序化淤洲上行走、铺路、盖屋、种田。Three.js 0.186.0 / WebGL / Vite 8，中文界面。地形、建筑、树和水面都由本地代码生成，不请求外部模型或贴图。

## 开始

在 ModelBenchLab 根目录：

```powershell
npm run dev
```

打开 <http://localhost:3000/grok4.7-dev-world/>。

只开这一项：

```powershell
npm run dev:one grok4.7-dev-world
```

调试端口 **3052**。

## 怎么玩

上岸之后用 WASD 走动，拖拽转镜头，滚轮拉远。底下一排是营造印：土路、茅舍、田垄、林场、陶窑、栈桥、果林、水井、路灯、公所、望楼，还有拆。左键落在地上，R 旋转栈桥这一类有朝向的建筑。

木料、陶土、口粮、铜钱会随建筑产出。人口吃口粮，茅舍、公所和水井决定能留下多少人。发展从营地、村落、圩镇走到开洲。空格暂停时辰，速度可以开到 4 倍。册子记在这台浏览器的 localStorage 里。

## 验证

```powershell
npm run test --workspace grok4.7-dev-world
npm run build --workspace grok4.7-dev-world
npm run sync:check
```
