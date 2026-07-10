import json
import struct
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "tang_dao.glb"
REPORT_PATH = ROOT / "reports" / "tang_dao_validation_report.json"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def read_gltf_json(path):
    data = path.read_bytes()
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise ValueError(f"Unexpected GLB header: {magic!r}")
    offset = 12
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == b"JSON":
            return magic.decode("ascii"), version, declared_length, json.loads(chunk.decode("utf-8"))
    raise ValueError("No JSON chunk found in GLB")


def validate():
    magic, version, declared_length, gltf = read_gltf_json(MODEL_PATH)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(MODEL_PATH))

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    light_objects = [obj for obj in bpy.context.scene.objects if obj.type == "LIGHT"]
    camera_objects = [obj for obj in bpy.context.scene.objects if obj.type == "CAMERA"]

    xs, ys, zs = [], [], []
    for obj in mesh_objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            xs.append(float(world.x))
            ys.append(float(world.y))
            zs.append(float(world.z))

    materials = []
    metallic = []
    for material in gltf.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        item = {
            "name": material.get("name"),
            "metallicFactor": pbr.get("metallicFactor", 1.0),
            "roughnessFactor": pbr.get("roughnessFactor", 1.0),
        }
        materials.append(item)
        if item["metallicFactor"] >= 0.5:
            metallic.append(item["name"])

    report = {
        "asset": "tang_dao",
        "glb_path": str(MODEL_PATH),
        "glb_file_size_bytes": MODEL_PATH.stat().st_size,
        "glb_magic_header": magic,
        "glb_version": version,
        "glb_declared_length": declared_length,
        "mesh_object_count": len(mesh_objects),
        "material_count": len(materials),
        "metallic_reflective_materials": metallic,
        "light_count": len(light_objects),
        "camera_count": len(camera_objects),
        "total_vertices": sum(len(obj.data.vertices) for obj in mesh_objects),
        "total_polygons": sum(len(obj.data.polygons) for obj in mesh_objects),
        "bounds": {
            "x": [round(min(xs), 3), round(max(xs), 3)],
            "y": [round(min(ys), 3), round(max(ys), 3)],
            "z": [round(min(zs), 3), round(max(zs), 3)],
        },
        "gltf_extensions_used": gltf.get("extensionsUsed", []),
        "materials": materials,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    validate()
