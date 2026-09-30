import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"
REPORT_DIR = ROOT / "reports"
BLEND_PATH = MODEL_DIR / "tang_dao.blend"
GLB_PATH = MODEL_DIR / "tang_dao.glb"
REPORT_PATH = REPORT_DIR / "tang_dao_export_report.json"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def principled_bsdf(material):
    return next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)


def pbr_material(name, color, metallic=0.0, roughness=0.45, alpha=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    bsdf = principled_bsdf(material)
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = color
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.85
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = 0.15 if metallic == 0 else 0.0
        if "Coat Roughness" in bsdf.inputs:
            bsdf.inputs["Coat Roughness"].default_value = 0.18
    if alpha < 1:
        material.blend_method = "BLEND"
    return material


def assign(obj, material):
    obj.data.materials.append(material)
    return obj


def shade_and_bevel(obj, bevel=0.0, segments=1):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if bevel > 0:
        mod = obj.modifiers.new("soft bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
    normal = obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    return obj


def cube_obj(name, location, dimensions, material, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    shade_and_bevel(obj, bevel=bevel, segments=2)
    return obj


def cylinder_between(name, start, end, radius, material, vertices=32, bevel=False):
    start_v = Vector(start)
    end_v = Vector(end)
    mid = (start_v + end_v) * 0.5
    direction = end_v - start_v
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=mid)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    assign(obj, material)
    shade_and_bevel(obj, bevel=0.006 if bevel else 0.0, segments=1)
    return obj


def make_blade(material, edge_material):
    # Tang dao blade: straight single-edged dao, thick spine on +Y, sharpened edge on -Y.
    stations = [
        (0.0, 0.58, 0.09),
        (1.3, 0.56, 0.085),
        (3.2, 0.52, 0.078),
        (5.4, 0.48, 0.07),
        (7.15, 0.42, 0.058),
        (8.05, 0.28, 0.042),
        (8.65, 0.035, 0.012),
    ]
    verts = []
    for x, width, thick in stations:
        spine_y = width * 0.5
        edge_y = -width * 0.5
        ridge_y = width * 0.03
        verts.extend(
            [
                (x, spine_y, thick * 0.45),
                (x, ridge_y, thick),
                (x, edge_y, 0.0),
                (x, ridge_y, -thick),
                (x, spine_y, -thick * 0.45),
                (x, spine_y + 0.035, 0.0),
            ]
        )

    faces = []
    ring = 6
    for i in range(len(stations) - 1):
        a = i * ring
        b = (i + 1) * ring
        for j in range(ring):
            faces.append((a + j, b + j, b + ((j + 1) % ring), a + ((j + 1) % ring)))
    faces.append(tuple(range(ring - 1, -1, -1)))
    last = (len(stations) - 1) * ring
    faces.append(tuple(range(last, last + ring)))

    mesh = bpy.data.meshes.new("tang_dao_single_edge_blade_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    blade = bpy.data.objects.new("straight single-edged Tang dao blade", mesh)
    bpy.context.collection.objects.link(blade)
    assign(blade, material)
    shade_and_bevel(blade, bevel=0.012, segments=2)

    edge = cylinder_between(
        "continuous sharpened edge highlight",
        (0.18, -0.31, 0.003),
        (8.2, -0.17, 0.002),
        0.011,
        edge_material,
        vertices=16,
        bevel=True,
    )
    edge.scale.z = 0.4
    return blade


def make_guard(material):
    guard = cube_obj("small oval brass guard", (-0.22, 0, 0), (0.24, 1.12, 0.22), material, bevel=0.08)
    guard.rotation_euler[0] = math.radians(0)
    cube_obj("blade collar brass habaki", (0.08, 0, 0), (0.25, 0.72, 0.15), material, bevel=0.035)
    cube_obj("rear brass ferrule", (-0.55, 0, 0), (0.18, 0.54, 0.18), material, bevel=0.035)
    return guard


def make_handle(wood, wrap, brass):
    cylinder_between("dark lacquered wooden grip core", (-1.78, 0, 0), (-0.58, 0, 0), 0.21, wood, vertices=32, bevel=True)
    # Alternating cord wraps around the grip. The rings are simple but read clearly in GLB.
    x = -1.68
    index = 1
    while x < -0.67:
        ring = cylinder_between(f"raised black handle wrap {index}", (x, 0, -0.012), (x + 0.035, 0, -0.012), 0.225, wrap, vertices=32)
        ring.rotation_euler[0] += math.radians(90)
        x += 0.105
        index += 1
    cube_obj("front brass grip band", (-0.62, 0, 0), (0.08, 0.50, 0.20), brass, bevel=0.025)
    cube_obj("rear brass grip band", (-1.83, 0, 0), (0.08, 0.50, 0.20), brass, bevel=0.025)


def make_ring_pommel(brass, dark):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.26, minor_radius=0.035, major_segments=48, minor_segments=10, location=(-2.08, 0, 0))
    ring = bpy.context.object
    ring.name = "Tang style ring pommel"
    ring.rotation_euler[1] = math.radians(90)
    assign(ring, brass)
    shade_and_bevel(ring, bevel=0.0)
    cube_obj("pommel neck brass block", (-1.9, 0, 0), (0.16, 0.36, 0.16), brass, bevel=0.03)
    cylinder_between("dark cord tassel knot", (-2.08, -0.23, -0.02), (-2.08, -0.55, -0.22), 0.025, dark, vertices=12)
    cylinder_between("dark cord tassel strand left", (-2.08, -0.5, -0.18), (-2.08, -0.78, -0.58), 0.012, dark, vertices=8)
    cylinder_between("dark cord tassel strand right", (-2.02, -0.5, -0.16), (-1.92, -0.76, -0.54), 0.01, dark, vertices=8)


def make_fullers(material):
    cylinder_between("upper shallow fuller groove dark line", (0.52, 0.17, 0.088), (6.95, 0.11, 0.062), 0.012, material, vertices=12)
    cylinder_between("lower shallow fuller groove dark line", (0.55, 0.045, 0.086), (5.9, 0.015, 0.058), 0.008, material, vertices=12)


def make_display_stand(wood):
    cube_obj("black display stand base", (2.7, 0, -0.64), (5.8, 1.25, 0.12), wood, bevel=0.035)
    cube_obj("left display stand upright", (0.15, -0.43, -0.35), (0.14, 0.16, 0.58), wood, bevel=0.025)
    cube_obj("right display stand upright", (5.1, -0.43, -0.35), (0.14, 0.16, 0.58), wood, bevel=0.025)
    cube_obj("left felt blade rest", (0.15, -0.40, -0.08), (0.34, 0.14, 0.08), wood, bevel=0.03)
    cube_obj("right felt blade rest", (5.1, -0.40, -0.08), (0.34, 0.14, 0.08), wood, bevel=0.03)


def point_camera_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_scene():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    clear_scene()

    steel = pbr_material("folded polished steel PBR", (0.73, 0.76, 0.78, 1), metallic=1.0, roughness=0.18)
    edge = pbr_material("bright sharpened edge PBR", (0.95, 0.96, 0.92, 1), metallic=1.0, roughness=0.11)
    brass = pbr_material("aged brass fittings PBR", (0.95, 0.62, 0.21, 1), metallic=1.0, roughness=0.2)
    black_lacquer = pbr_material("black lacquered wood PBR", (0.018, 0.012, 0.008, 1), metallic=0.0, roughness=0.24)
    cord = pbr_material("black silk cord wrap", (0.01, 0.008, 0.006, 1), metallic=0.0, roughness=0.72)
    dark_inlay = pbr_material("dark groove shadow inlay", (0.025, 0.025, 0.03, 1), metallic=0.0, roughness=0.64)

    make_blade(steel, edge)
    make_fullers(dark_inlay)
    make_guard(brass)
    make_handle(black_lacquer, cord, brass)
    make_ring_pommel(brass, cord)
    make_display_stand(black_lacquer)

    bpy.ops.object.light_add(type="SUN", location=(0, 0, 8))
    sun = bpy.context.object
    sun.name = "long blade sun reflection light"
    sun.data.energy = 2.6
    sun.rotation_euler = (math.radians(38), 0, math.radians(-35))

    bpy.ops.object.light_add(type="AREA", location=(2.8, -4.2, 3.4))
    area = bpy.context.object
    area.name = "large strip softbox for metal reflection"
    area.data.energy = 460
    area.data.size = 5.8

    bpy.ops.object.camera_add(location=(3.25, -7.6, 3.15))
    camera = bpy.context.object
    camera.name = "Tang dao preview camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 12.4
    point_camera_at(camera, (3.25, 0.0, -0.05))
    bpy.context.scene.camera = camera

    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 96
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    bpy.context.scene.world.color = (0.035, 0.038, 0.042)
    bpy.context.scene.unit_settings.system = "METRIC"

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_materials="EXPORT",
        export_lights=True,
        export_cameras=True,
        export_apply=True,
    )

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    report = {
        "asset": "tang_dao",
        "blend_path": str(BLEND_PATH),
        "glb_path": str(GLB_PATH),
        "mesh_object_count": len(mesh_objects),
        "material_count": len(bpy.data.materials),
        "light_count": len([obj for obj in bpy.context.scene.objects if obj.type == "LIGHT"]),
        "camera_count": len([obj for obj in bpy.context.scene.objects if obj.type == "CAMERA"]),
        "total_vertices": sum(len(obj.data.vertices) for obj in mesh_objects),
        "total_polygons": sum(len(obj.data.polygons) for obj in mesh_objects),
        "key_features": [
            "straight single-edged Tang dao blade",
            "polished steel PBR material",
            "small brass guard and habaki collar",
            "black lacquered handle with raised cord wrap",
            "Tang style ring pommel with tassel",
            "display stand",
        ],
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    build_scene()
