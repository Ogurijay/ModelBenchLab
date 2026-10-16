<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/gpt5.6solultra-business-tycoon/ 。
并行开发（仓库根目录）：`npm run dev:one -- gpt5.6solultra-business-tycoon`，访问 http://localhost:3038/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# 街区大亨 · Pixel Borough

一款浏览器内直接游玩的像素商业养成游戏。玩家从 7.2 万元启动资金起步，在九块街区地块中选择商业模式、开店、调整策略并逐日结算，目标是建立多业态商业版图。

## 玩法组成

- 144 种可开设模式：12 个行业 × 4 类核心客群 × 3 种渠道。
- 12 类联动机制：行业、客群、渠道、价格、供应链、人员、营销、数字化、声誉、贷款、城市事件和组合扩张。
- 5 项店级策略：定价、供应、人员、营销和数字系统。
- 随机城市事件、近 14 日账本、五项成长里程碑与自动存档。

## 启动

在仓库根目录执行：

```powershell
npm run dev
```

然后访问 `http://localhost:3000/gpt5.6solultra-business-tycoon/`。

也可以单独调试：

```powershell
npm run dev:one -- gpt5.6solultra-business-tycoon
```

## 验证

```powershell
npm test --workspace gpt5.6solultra-business-tycoon
npm run build --workspace gpt5.6solultra-business-tycoon
```

页面还暴露了只读调试入口 `window.__TYCOON__`，可检查当前状态和模式数量。
