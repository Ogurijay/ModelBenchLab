<!-- modelbenchlab-access -->
统一访问：在仓库根目录运行 `npm run dev`，打开 `http://localhost:3000/gpt6-ocean-observatory/`。
独立调试：根目录运行 `npm run dev:one -- gpt6-ocean-observatory`，打开 `http://localhost:3049/`。下文子目录启动说明仅用于独立开发。

# PELAGIC · 海洋观测站

GPT 6 创建的实时海洋模拟网页。独立任务目录：`gpt6-ocean-observatory`，变体：`observatory`。

## 访问

在仓库根目录运行 `npm install`、`npm run dev`，访问：

**http://localhost:3000/gpt6-ocean-observatory/**

门户会从 `benchmark/registry.json` 自动显示本项目。3049 仅登记给 `dev:one` 独立调试；常规运行使用仓库唯一端口 3000。

## 功能

- 八组确定性 Gerstner 波，解析法线、近景细浪、浪尖泡沫、天空反射与菲涅尔。
- 三组海况：平静海面、远海涌浪、风暴前夕；风速、有效波高、行进方向和太阳高度可单独调节。
- 天空与海面共享太阳、云量和时间；观测浮标同步采样同一波面的位置与法线。
- 轨道相机、海面以上的保守高度限制、三档画质与移动设备初始流畅档。
- 模拟时间暂停、纯净观海、PNG 海面截图、全屏、用户主动开启的本地合成海浪声。
- 观测点最近 30 秒海面高度曲线。有效波高为波谱参数，不是从有限时间曲线反算的实测值。
- 无远程图片、字体、音频或模型请求。

快捷键：空格暂停/继续，H 纯净观海，R 重置，Esc 返回界面。表单获得焦点时保留原生键盘操作，按钮获得焦点时空格仍触发按钮。支持单指旋转、双指缩放；系统开启减少动态效果时初始暂停。

## 验证与复现

```powershell
npm run sync:check
npm run test --workspace=gpt6-ocean-observatory
npm run build --workspace=gpt6-ocean-observatory
node gpt6-ocean-observatory/tests/browser-smoke.mjs
node gpt6-ocean-observatory/tests/final-smoke.mjs
```

浏览器检查使用仓库已有的 Playwright 和本机 Chrome（`channel: 'chrome'`），默认连接上述 3000 路径。种子默认 71；URL 支持 `?seed=71&time=12&paused=1` 固定相位，时间单位为波浪模拟秒。所有初始化参数均有有限数值校验。

## 模拟边界

这是用于视觉观察的程序化近似，未求解 Navier–Stokes 或 FFT 波谱。风速与推进速度的关系为艺术控制；云雾、泡沫和水体散射为近似，反射覆盖程序天空，未实现浮标的平面反射。浮标贴合解析海面，不含质量、阻尼与刚体碰撞。风暴前夕为强风多云预设，不包含雷雨系统。

工程验证不属于仓库 A/B 排名评测；冻结原始 prompt 仍未补齐，也未进行 n≥3 的模型重复生成和匿名盲评，不填写主观分数。

技术基线与检查结果见 [HANDOVER.md](./HANDOVER.md)，变更记录见 [CHANGELOG.md](./CHANGELOG.md)。
