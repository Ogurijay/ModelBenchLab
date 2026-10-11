# 持续刷新修复 · 2026-10-11

## 根因与修复

直接监听正在运行的 `127.0.0.1:3000` Vite WebSocket，发现其他项目生成 `claudeopus5.5-bvn-replica/assets/art/*.webp` 时发送 `type: full-reload, path: *`。`triggeredBy` 指向该项目资源。Vite 默认把这类消息广播给全部页面，导致本游戏频繁回到创建角色界面。

在根开发服务增加 `scripts/project-hmr.mjs`：项目文件引起的通配刷新被转换为对应项目的 HTML 路径，让现有 Vite 客户端只刷新匹配页面。记录已请求的子页面，并沿模块导入图包含跨项目使用方；共享文件、明确指定 HTML 的刷新、服务器重启、编译错误及正常 CSS HMR 消息保持默认行为。

未通过禁用 HMR、停止其他项目任务或修改游戏存档规避问题。

## 验证

- 5 项规则测试：兄弟项目隔离、本项目两种入口、嵌套页面、共享与配置消息、跨项目及循环导入、热更新通道参数。
- 1 项真实 Vite 集成测试：在临时测试目录启动随机端口，HTTP 加载两个项目的入口和模块，修改文件后通过 WebSocket 验证其他项目素材刷新限定范围、本项目 JS 仍刷新、CSS 仍发送局部更新。测试结束清理自己的临时目录与服务器。
- 运行中的 3000 服务监听 30,009 毫秒，收到 18 条整页刷新消息，全部限定为 `/claudeopus5.5-bvn-replica/index.html`；按当前 Vite 客户端的路径匹配规则，触发本游戏刷新 0 次。原始消息：`tmp/azeroth-sol-qa/v3/hmr-isolation.json`。
- 未使用 Computer Use 或浏览器自动化；上述结论来自真实服务器协议和集成测试，不是浏览器画面观察。

命令：`node --test scripts/tests/project-hmr*.test.mjs`。

最终检查：`npm run policy:test` 14/14、游戏模型测试 45/45、游戏构建与 `benchmark:check` 通过。`sync:check` 检出本轮未创建、未修改的根目录 `assets` 为未知根条目；保留其他工作的文件，没有为通过结构检查删除它。该项与本次刷新隔离无关。
