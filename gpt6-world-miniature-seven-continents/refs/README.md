# 参考与证据

用户已确认的概念参考：
- ../../shared/assets/world-miniature/concepts/overview.png
- ../../shared/assets/world-miniature/concepts/asia.png
- 原始平面方案与生成提示词：仓库tmp/seven-continents-concept-2026-10-15/。

2026-10-15核验的官方建筑资料：
- 泰姬陵：https://whc.unesco.org/en/list/252/
- 长城：https://whc.unesco.org/en/list/438/
- 吴哥：https://whc.unesco.org/en/list/668/

资料用于关键结构和地标身份，当前模型为程序化微缩表达，不声称测绘精度。其他地标的精确复原仍未核验；不将生成图视为建筑结构证据。

Three.js版本与API：
- npm官方包元数据：https://registry.npmjs.org/three/latest
- r186发布：https://github.com/mrdoob/three.js/releases/tag/r186
- 迁移：https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186
- WebGLRenderer r186：https://raw.githubusercontent.com/mrdoob/three.js/r186/docs/pages/WebGLRenderer.html
- OrbitControls r186：https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/jsm/controls/OrbitControls.js
- ExtrudeGeometry r186：https://raw.githubusercontent.com/mrdoob/three.js/r186/src/geometries/ExtrudeGeometry.js

当前根manifest、lockfile、已安装包均为0.186.1。旧本地skill示例仍出现PCFSoftShadowMap，本项目按官方当前接口使用PCFShadowMap。
