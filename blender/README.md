# Blender 海盗船模型说明

## 产物

- `models/medium_pirate_ship.glb`：three.js 推荐直接加载的 GLB（二进制 glTF）模型。
- `models/medium_pirate_ship.blend`：Blender 源文件，后续可以继续编辑。
- `scripts/create_medium_pirate_ship.py`：程式化建模与导出脚本。
- `scripts/validate_medium_pirate_ship_glb.py`：GLB 验证脚本。
- `reports/medium_pirate_ship_export_report.json`：导出统计。
- `reports/medium_pirate_ship_validation_report.json`：重新导入与 PBR 材质验证统计。
- `reports/medium_pirate_ship_preview.png`：Blender 渲染预览图。

## 模型特征

这是一个中等面数的程式化海盗船模型，包含弧形木船体、木板甲板、三根桅杆、横帆、黑色海盗旗、炮口、栏杆、绳索、黄铜装饰和船尾灯笼。

材质使用 PBR（Physically Based Rendering，基于物理的渲染）参数。GLB 内部包含 `metallicFactor`（金属度）与 `roughnessFactor`（粗糙度），其中黄铜与炮管为金属材质，适合在 three.js 中响应环境光、方向光、点光源或 HDRI（高动态范围环境贴图）产生高光和反射。

## three.js 加载示例

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

loader.load('/blender/models/medium_pirate_ship.glb', (gltf) => {
  const ship = gltf.scene;
  ship.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  scene.add(ship);
});

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(5, 8, 4);
sun.castShadow = true;
scene.add(sun);

const fill = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(fill);
```

## 验证结论

验证脚本已确认：

- GLB 文件头为 `glTF`，版本为 glTF 2.0。
- 模型可被 Blender 重新导入。
- GLB 使用 `KHR_materials_specular` 和 `KHR_lights_punctual` 扩展。
- 金属反射材质包括 `aged brass reflective PBR` 和 `dark gunmetal reflective PBR`。

## 唐刀模型

新增唐刀资产：

- `models/tang_dao.glb`：three.js 可加载的唐刀 GLB（二进制 glTF）模型。
- `models/tang_dao.blend`：Blender 源文件。
- `scripts/create_tang_dao.py`：程式化建模与导出脚本。
- `scripts/validate_tang_dao_glb.py`：GLB 验证脚本。
- `reports/tang_dao_export_report.json`：导出统计。
- `reports/tang_dao_validation_report.json`：重新导入与 PBR 材质验证统计。
- `reports/tang_dao_preview.png`：Blender 渲染预览图。

唐刀模型包含直刃单锋刀身、小型铜护手、刀镡/刀枕、黑漆柄、凸起缠绳、环首和流苏，并附带展示架。刀身、刃口和铜件使用 PBR 金属材质，适合在 three.js 光源或环境贴图下显示高光。
