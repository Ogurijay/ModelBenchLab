import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"
REPORT_DIR = ROOT / "reports"
BLEND_PATH = MODEL_DIR / "medium_pirate_ship.blend"
GLB_PATH = MODEL_DIR / "medium_pirate_ship.glb"
REPORT_PATH = REPORT_DIR / "medium_pirate_ship_export_report.json"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def pbr_material(name, color, metallic=0.0, roughness=0.45, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = color
    bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
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
            bsdf.inputs["Specular IOR Level"].default_value = 0.7
        elif "Specular" in bsdf.inputs:
            bsdf.inputs["Specular"].default_value = 0.65
    if alpha < 1.0:
        mat.blend_method = "BLEND"
        mat.use_screen_refraction = True
    return mat


def assign(obj, mat):
    obj.data.materials.append(mat)
    return obj


def shade_and_bevel(obj, bevel=0.03, segments=2):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if bevel > 0:
        mod = obj.modifiers.new("soft bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
    normal = obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    return obj


def cube_obj(name, location, dimensions, mat, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    shade_and_bevel(obj, bevel=bevel, segments=1)
    return obj


def cylinder_between(name, start, end, radius, mat, vertices=24, bevel=False):
    start_v = Vector(start)
    end_v = Vector(end)
    mid = (start_v + end_v) * 0.5
    direction = end_v - start_v
    length = direction.length
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=length,
        location=mid,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    assign(obj, mat)
    shade_and_bevel(obj, bevel=0.01 if bevel else 0, segments=1)
    return obj


def point_camera_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def create_hull(mat):
    stations = [
        (-5.7, 0.22, 0.12),
        (-4.4, 1.05, 0.28),
        (-2.5, 1.52, 0.42),
        (0.0, 1.68, 0.52),
        (2.5, 1.50, 0.42),
        (4.4, 0.98, 0.27),
        (5.7, 0.18, 0.10),
    ]
    verts = []
    for x, half_width, keel_width in stations:
        verts.extend(
            [
                (x, half_width, 0.72),
                (x, half_width * 0.82, -0.16),
                (x, keel_width, -0.86),
                (x, -keel_width, -0.86),
                (x, -half_width * 0.82, -0.16),
                (x, -half_width, 0.72),
            ]
        )
    faces = []
    ring = 6
    for i in range(len(stations) - 1):
        a = i * ring
        b = (i + 1) * ring
        for j in range(ring - 1):
            faces.append((a + j, b + j, b + j + 1, a + j + 1))
    faces.append(tuple(range(ring - 1, -1, -1)))
    last = (len(stations) - 1) * ring
    faces.append(tuple(range(last, last + ring)))
    mesh = bpy.data.meshes.new("pirate_ship_hull_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("PBR curved wooden hull", mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, mat)
    shade_and_bevel(obj, bevel=0.045, segments=3)
    return obj


def create_sail(name, x_center, z_center, width, height, mat, skull=False):
    verts = [
        (x_center, -width * 0.5, z_center + height * 0.5),
        (x_center, width * 0.5, z_center + height * 0.5),
        (x_center + 0.18, width * 0.55, z_center),
        (x_center, width * 0.42, z_center - height * 0.5),
        (x_center, -width * 0.42, z_center - height * 0.5),
        (x_center + 0.18, -width * 0.55, z_center),
    ]
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], [(0, 1, 2, 3, 4, 5)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, mat)
    shade_and_bevel(obj, bevel=0.0)

    if skull:
        skull_mat = pbr_material("off-white skull paint", (0.92, 0.88, 0.74, 1), 0, 0.36)
        cylinder_between("skull left bone", (x_center - 0.012, -0.33, z_center + 0.05), (x_center - 0.012, 0.33, z_center - 0.26), 0.025, skull_mat, 12)
        cylinder_between("skull right bone", (x_center - 0.014, -0.33, z_center - 0.26), (x_center - 0.014, 0.33, z_center + 0.05), 0.025, skull_mat, 12)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.18, location=(x_center - 0.02, 0, z_center + 0.02))
        head = bpy.context.object
        head.name = "skull mark on main sail"
        head.scale.z = 1.15
        assign(head, skull_mat)
        shade_and_bevel(head, bevel=0.0)
    return obj


def add_flag(mat_black, mat_white):
    pole = cylinder_between("stern flag pole", (5.05, 0, 0.78), (5.05, 0, 2.45), 0.035, mat_black, 12)
    flag_verts = [
        (5.05, 0.0, 2.34),
        (5.05, 0.95, 2.26),
        (5.05, 0.88, 1.86),
        (5.05, 0.0, 1.92),
    ]
    mesh = bpy.data.meshes.new("black_flag_mesh")
    mesh.from_pydata(flag_verts, [], [(0, 1, 2, 3)])
    mesh.update()
    flag = bpy.data.objects.new("black pirate flag with skull", mesh)
    bpy.context.collection.objects.link(flag)
    assign(flag, mat_black)
    shade_and_bevel(flag, bevel=0.0)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.08, location=(5.045, 0.43, 2.08))
    skull = bpy.context.object
    skull.name = "small skull mark on flag"
    assign(skull, mat_white)
    return pole, flag


def add_cannon_pair(index, x, mat_metal):
    for side, y, suffix in [(1, 1.74, "port"), (-1, -1.74, "starboard")]:
        cyl = cylinder_between(
            f"cannon {index} {suffix}",
            (x, y * 0.88, 0.24),
            (x, y, 0.23),
            0.095,
            mat_metal,
            20,
        )
        cyl.scale.x = 1.0
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.115, location=(x, y * 0.83, 0.24))
        cap = bpy.context.object
        cap.name = f"cannon breech {index} {suffix}"
        assign(cap, mat_metal)


def add_lantern(name, location, mat_metal, mat_glass, mat_light):
    cube_obj(name + " brass frame", location, (0.22, 0.22, 0.34), mat_metal, bevel=0.015)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.105, location=location)
    glass = bpy.context.object
    glass.name = name + " warm glass"
    assign(glass, mat_glass)
    bpy.ops.object.light_add(type="POINT", location=location)
    light = bpy.context.object
    light.name = name + " point light"
    light.data.color = (1.0, 0.64, 0.35)
    light.data.energy = 80
    light.data.shadow_soft_size = 1.2
    return light


def build_scene():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    clear_scene()

    wood = pbr_material("varnished dark oak - PBR", (0.28, 0.12, 0.055, 1), 0.0, 0.32)
    deck_wood = pbr_material("warm deck planks - PBR", (0.48, 0.27, 0.12, 1), 0.0, 0.38)
    black = pbr_material("matte black sail cloth", (0.015, 0.014, 0.013, 1), 0.0, 0.78)
    cream = pbr_material("aged canvas sail cloth", (0.78, 0.68, 0.50, 1), 0.0, 0.62)
    metal = pbr_material("dark gunmetal reflective PBR", (0.035, 0.035, 0.04, 1), 1.0, 0.22)
    brass = pbr_material("aged brass reflective PBR", (0.92, 0.58, 0.18, 1), 1.0, 0.18)
    rope = pbr_material("tarred rope", (0.16, 0.10, 0.055, 1), 0.0, 0.72)
    glass = pbr_material("warm lantern glass", (1.0, 0.62, 0.25, 0.42), 0.0, 0.08, 0.42)

    create_hull(wood)
    cube_obj("central raised deck", (0, 0, 0.76), (9.2, 2.35, 0.12), deck_wood, bevel=0.025)
    cube_obj("stern captain deck", (4.15, 0, 1.03), (1.65, 2.08, 0.18), deck_wood, bevel=0.025)
    cube_obj("bow forecastle deck", (-4.45, 0, 0.95), (1.35, 1.72, 0.14), deck_wood, bevel=0.025)

    for i, y in enumerate([-0.92, -0.55, -0.18, 0.18, 0.55, 0.92]):
        cube_obj(f"individual deck plank {i+1}", (-0.1, y, 0.86), (8.75, 0.11, 0.035), deck_wood, bevel=0.006)
    for x in [-4.55, -3.4, -2.25, -1.1, 0.05, 1.2, 2.35, 3.5, 4.55]:
        cube_obj(f"deck cross brace {x:.1f}", (x, 0, 0.905), (0.08, 2.18, 0.045), wood, bevel=0.006)

    cylinder_between("keel metal strip", (-5.25, 0, -0.9), (5.2, 0, -0.9), 0.035, brass, 16, True)
    cylinder_between("left gunwale rail", (-4.9, 1.35, 1.04), (4.8, 1.24, 1.04), 0.045, wood, 16, True)
    cylinder_between("right gunwale rail", (-4.9, -1.35, 1.04), (4.8, -1.24, 1.04), 0.045, wood, 16, True)
    for x in [-4.4, -3.2, -2.0, -0.8, 0.4, 1.6, 2.8, 4.0]:
        cylinder_between(f"port rail post {x}", (x, 1.33, 0.78), (x, 1.37, 1.12), 0.025, wood, 10)
        cylinder_between(f"starboard rail post {x}", (x, -1.33, 0.78), (x, -1.37, 1.12), 0.025, wood, 10)

    for name, x, height, radius in [("main mast", 0.2, 4.6, 0.105), ("fore mast", -3.0, 3.65, 0.085), ("mizzen mast", 3.55, 3.25, 0.075)]:
        cylinder_between(name, (x, 0, 0.82), (x, 0, height), radius, wood, 24, True)
    for name, x, z, span in [
        ("main upper yard", 0.2, 3.9, 3.25),
        ("main lower yard", 0.2, 2.7, 3.85),
        ("fore yard", -3.0, 2.95, 2.65),
        ("mizzen yard", 3.55, 2.68, 2.1),
    ]:
        cylinder_between(name, (x, -span * 0.5, z), (x, span * 0.5, z), 0.05, wood, 18, True)

    create_sail("large black main sail", 0.2, 3.2, 3.25, 1.75, black, skull=True)
    create_sail("aged canvas fore sail", -3.0, 2.5, 2.2, 1.35, cream)
    create_sail("aged canvas mizzen sail", 3.55, 2.25, 1.65, 1.08, cream)
    cylinder_between("bowsprit", (-5.58, 0, 0.82), (-7.0, 0, 1.1), 0.055, wood, 18, True)
    cylinder_between("forward rope left", (-6.85, 0, 1.08), (-3.0, 1.05, 3.45), 0.014, rope, 8)
    cylinder_between("forward rope right", (-6.85, 0, 1.08), (-3.0, -1.05, 3.45), 0.014, rope, 8)
    cylinder_between("main stay rope", (-3.0, 0, 3.5), (0.2, 0, 4.6), 0.016, rope, 8)
    cylinder_between("rear stay rope", (0.2, 0, 4.55), (4.65, 0, 1.28), 0.014, rope, 8)

    for idx, x in enumerate([-2.9, -1.55, -0.2, 1.15, 2.5], start=1):
        add_cannon_pair(idx, x, metal)
    add_flag(black, cream)
    cube_obj("gold trimmed stern window", (5.02, 0, 1.28), (0.08, 0.86, 0.42), brass, bevel=0.014)
    cube_obj("black rudder", (5.78, 0, -0.22), (0.18, 0.62, 1.0), wood, bevel=0.025)
    add_lantern("stern lantern left", (4.9, 0.82, 1.56), brass, glass, None)
    add_lantern("stern lantern right", (4.9, -0.82, 1.56), brass, glass, None)

    bpy.ops.object.light_add(type="SUN", location=(0, 0, 8))
    sun = bpy.context.object
    sun.name = "strong sun key light"
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(38), 0, math.radians(-28))
    bpy.ops.object.light_add(type="AREA", location=(-3.5, -4.5, 5.2))
    area = bpy.context.object
    area.name = "large softbox reflection light"
    area.data.energy = 360
    area.data.size = 5.0

    bpy.ops.object.camera_add(location=(10.0, -8.5, 5.2))
    camera = bpy.context.object
    camera.name = "threejs preview camera"
    camera.data.lens = 24
    point_camera_at(camera, (0.0, 0.0, 1.45))
    bpy.context.scene.camera = camera
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.world.color = (0.03, 0.04, 0.055)
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    bpy.context.scene.unit_settings.system = "METRIC"

    empty = bpy.data.objects.new("threejs_origin_note_scale_meters", None)
    empty.location = (0, 0, 0)
    bpy.context.collection.objects.link(empty)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    export_kwargs = dict(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_materials="EXPORT",
        export_lights=True,
        export_cameras=True,
        export_apply=True,
        export_yup=True,
    )
    try:
        bpy.ops.export_scene.gltf(**export_kwargs)
    except TypeError:
        export_kwargs.pop("export_yup", None)
        bpy.ops.export_scene.gltf(**export_kwargs)

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    report = {
        "asset": "medium_pirate_ship",
        "blend_path": str(BLEND_PATH),
        "glb_path": str(GLB_PATH),
        "mesh_object_count": len(mesh_objects),
        "material_count": len(bpy.data.materials),
        "light_count": len([obj for obj in bpy.context.scene.objects if obj.type == "LIGHT"]),
        "camera_count": len([obj for obj in bpy.context.scene.objects if obj.type == "CAMERA"]),
        "total_vertices": sum(len(obj.data.vertices) for obj in mesh_objects),
        "total_polygons": sum(len(obj.data.polygons) for obj in mesh_objects),
        "pbr_materials": [mat.name for mat in bpy.data.materials if "PBR" in mat.name or mat.use_nodes],
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    build_scene()
