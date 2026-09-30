import json
import struct
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "medium_pirate_ship.glb"
REPORT_PATH = ROOT / "reports" / "medium_pirate_ship_validation_report.json"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def principled_values(material):
    values = {
        "name": material.name,
        "metallic": None,
        "roughness": None,
        "has_principled_bsdf": False,
    }
    if not material.use_nodes:
        return values
    bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        return values
    values["has_principled_bsdf"] = True
    if "Metallic" in bsdf.inputs:
        values["metallic"] = float(bsdf.inputs["Metallic"].default_value)
    if "Roughness" in bsdf.inputs:
        values["roughness"] = float(bsdf.inputs["Roughness"].default_value)
    return values


def validate():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(MODEL_PATH)

    glb_bytes = MODEL_PATH.read_bytes()
    magic = glb_bytes[:4]
    if magic != b"glTF":
        raise ValueError(f"Unexpected GLB magic header: {magic!r}")
    _, version, declared_length = struct.unpack_from("<4sII", glb_bytes, 0)
    offset = 12
    gltf_json = {}
    while offset < len(glb_bytes):
        chunk_length, chunk_type = struct.unpack_from("<I4s", glb_bytes, offset)
        offset += 8
        chunk = glb_bytes[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == b"JSON":
            gltf_json = json.loads(chunk.decode("utf-8"))
            break

    gltf_materials = gltf_json.get("materials", [])
    gltf_pbr_materials = []
    metallic_materials = []
    for material in gltf_materials:
        pbr = material.get("pbrMetallicRoughness", {})
        item = {
            "name": material.get("name", ""),
            "metallicFactor": pbr.get("metallicFactor", 1.0),
            "roughnessFactor": pbr.get("roughnessFactor", 1.0),
            "alphaMode": material.get("alphaMode", "OPAQUE"),
        }
        gltf_pbr_materials.append(item)
        if item["metallicFactor"] >= 0.5:
            metallic_materials.append(item["name"])

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(MODEL_PATH))

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    light_objects = [obj for obj in bpy.context.scene.objects if obj.type == "LIGHT"]
    camera_objects = [obj for obj in bpy.context.scene.objects if obj.type == "CAMERA"]
    materials = list(bpy.data.materials)
    material_values = [principled_values(mat) for mat in materials]
    xs, ys, zs = [], [], []
    for obj in mesh_objects:
        for corner in obj.bound_box:
            x, y, z = obj.matrix_world @ Vector(corner)
            xs.append(float(x))
            ys.append(float(y))
            zs.append(float(z))

    report = {
        "asset": "medium_pirate_ship",
        "glb_path": str(MODEL_PATH),
        "glb_file_size_bytes": MODEL_PATH.stat().st_size,
        "glb_magic_header": magic.decode("ascii"),
        "glb_version": version,
        "glb_declared_length": declared_length,
        "mesh_object_count": len(mesh_objects),
        "material_count": len(materials),
        "principled_material_count": len([m for m in material_values if m["has_principled_bsdf"]]),
        "metallic_reflective_materials": metallic_materials,
        "gltf_pbr_materials": gltf_pbr_materials,
        "gltf_extensions_used": gltf_json.get("extensionsUsed", []),
        "light_count": len(light_objects),
        "camera_count": len(camera_objects),
        "total_vertices": sum(len(obj.data.vertices) for obj in mesh_objects),
        "total_polygons": sum(len(obj.data.polygons) for obj in mesh_objects),
        "bounds": {
            "x": [round(min(xs), 3), round(max(xs), 3)],
            "y": [round(min(ys), 3), round(max(ys), 3)],
            "z": [round(min(zs), 3), round(max(zs), 3)],
        },
        "threejs_note": "Load with THREE.GLTFLoader. PBR materials use MeshStandardMaterial-compatible glTF metallic/roughness data.",
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    validate()
