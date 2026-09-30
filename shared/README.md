# shared/ — 公用资源库

共享资源以 assets/manifest.json 为索引，记录 SHA-256、来源与消费者。相同二进制只存一份；生产构建输出副本属于 dist 构建产物，允许生成。项目私有资源可暂存在项目中；一旦重复跨项目使用，移入共享库并补充来源。禁止把迁移共享资产解释为获得再分发许可。

- assets/：共享模型、贴图等；blender/ 包含本地建模源文件、生成与验证脚本及报告。
- fixtures/：冻结输入，分 vision、agent、code、prompts；private 子目录被忽略。
- rubrics/：通用六轴、3D、UI 数据网格与 UI 游戏评分卡。
- schema/：测试单元和运行记录 JSON Schema。

## Vite 引用

首选从源码导入相对路径，例如 import modelUrl from '../../shared/assets/models/digimon/agumon.glb?url'，根据当前源码文件层级调整路径。Vite 会在 root dev 与独立 build 中解析并输出资源。

根 Vite 已声明 @shared。独立子项目若使用 @shared，需要在该项目配置中声明同一别名；子项目配置不会自动作用于根单端口服务。

## 冻结

正式评测的输入使用新版本文件，不覆盖旧内容。二进制文件迁移以哈希一致为依据，引用路径变化不表示内容变化；修改内容须新增版本与哈希。fixtures/**/private/ 必须 gitignore。
