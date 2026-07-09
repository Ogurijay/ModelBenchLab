# shared/ — 公用资源库

所有测试**共享一份**资源,禁止各项目 / 各任务重复下载。新增资源前先在此搜同名文件,能复用就复用。

## 结构

```
shared/
├─ assets/      二进制资源:贴图 / HDRI / 模型 / 音频 / 字体(一份,按类型分目录)
├─ fixtures/    测试输入素材(冻结、版本化):
│  ├─ vision/   视觉·审美理解用图(构图 / 配色 / 光影 / OCR / 图表 / 找不同)
│  ├─ agent/    Agent 任务的沙盒文件 / mock API / 可判定的成功条件
│  ├─ code/     代码测试题(题面 + 参考实现 + 测试)
│  └─ prompts/  各模型标准 prompt 库
├─ rubrics/     评分卡:通用六轴 + 各类型专项
└─ schema/      测试单元 / 运行记录 的 JSON Schema
```

## 在 vite 项目里引用共享资源

项目 `vite.config.*` 加别名:

```js
import path from 'node:path';
export default { resolve: { alias: { '@shared': path.resolve(__dirname, '../shared') } } };
```

然后 `import waterNormal from '@shared/assets/textures/water-normal.jpg?url'`。
纯静态大文件也可直接用相对路径 `../shared/assets/...`。

## 命名与冻结原则

- 资源命名:`<类别>/<语义名>.<ext>`,如 `textures/water-normal.jpg`、`hdri/sky-dusk.hdr`。
- 一旦某素材用于正式评测即**冻结**,不再修改;需要新版本就新建文件(`-v2`)。
- 私有 / 未发布的评测集放 `fixtures/**/private/`(该目录建议 gitignore,防污染)。
