"""
程序化生成一艘风格化海盗大帆船（galleon），导出自包含 GLB 供 Three.js 加载。

用法（无界面后台运行）：
  blender --background --python build_pirate_ship.py

产物（同目录）：
  pirate-ship.glb    —— 运行时模型（内嵌材质，单文件）
  pirate-ship.blend  —— 可再编辑的 Blender 工程

约定：Blender 用 Z 轴朝上建模，船身长度沿 X（船首指向 +X），船宽沿 Y。
glTF 导出会自动转成 Three.js 的 Y-up（船保持直立，长度沿 X，船宽沿 Z）。
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector

# ----------------------------------------------------------------------------- 工具
def clamp(x, a, b):
    return max(a, min(b, x))

def smoothstep(e0, e1, x):
    if e0 == e1:
        return 0.0 if x < e0 else 1.0
    t = clamp((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def make_material(name, color, rough=0.8, metal=0.0, emit=None, double_sided=True):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (emit[0], emit[1], emit[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    mat.use_backface_culling = not double_sided   # 导出器据此设 doubleSided
    return mat

def mesh_from(name, verts, faces, mat, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    # 统一外向法线
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    bpy.context.collection.objects.link(ob)
    return ob

def cyl(name, mat, radius, length, axis='Z', loc=(0, 0, 0), rot=(0, 0, 0), r2=None, verts=16):
    """沿给定轴的圆柱/圆台，底面在 loc，沿 axis 正向延伸 length。"""
    r2 = radius if r2 is None else r2
    bm = bmesh.new()
    ring0, ring1 = [], []
    for i in range(verts):
        a = 2 * math.pi * i / verts
        ring0.append(bm.verts.new((radius * math.cos(a), radius * math.sin(a), 0.0)))
    for i in range(verts):
        a = 2 * math.pi * i / verts
        ring1.append(bm.verts.new((r2 * math.cos(a), r2 * math.sin(a), length)))
    for i in range(verts):
        j = (i + 1) % verts
        bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
    bm.faces.new(reversed(ring0))
    bm.faces.new(ring1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    bpy.context.collection.objects.link(ob)
    # 朝向：默认沿 Z；axis='X'/'Y' 时旋转
    if axis == 'X':
        ob.rotation_euler = (0, math.radians(90), 0)
    elif axis == 'Y':
        ob.rotation_euler = (math.radians(-90), 0, 0)
    ob.rotation_euler = (ob.rotation_euler[0] + rot[0],
                         ob.rotation_euler[1] + rot[1],
                         ob.rotation_euler[2] + rot[2])
    ob.location = loc
    return ob

def box(name, mat, sx, sy, sz, loc=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (sx, sy, sz)
    ob.data.materials.append(mat)
    return ob

# ----------------------------------------------------------------------------- 材质
reset_scene()
WOOD_HULL = make_material("WoodHull", (0.20, 0.105, 0.052), rough=0.85)
WOOD_DECK = make_material("WoodDeck", (0.42, 0.27, 0.14), rough=0.8)
WOOD_TRIM = make_material("WoodTrim", (0.085, 0.045, 0.022), rough=0.7)
SPAR = make_material("Spar", (0.30, 0.185, 0.092), rough=0.75)
GOLD = make_material("Gold", (0.62, 0.46, 0.16), rough=0.35, metal=0.85)
SAIL = make_material("Sail", (0.86, 0.81, 0.70), rough=0.9, double_sided=True)
SAIL_DK = make_material("SailWorn", (0.74, 0.68, 0.57), rough=0.92, double_sided=True)
FLAG = make_material("Flag", (0.06, 0.06, 0.07), rough=0.85, double_sided=True)
IRON = make_material("Iron", (0.05, 0.05, 0.06), rough=0.5, metal=0.6)

# ----------------------------------------------------------------------------- 船体（断面放样）
X_STERN, X_BOW = -11.0, 13.0
MAX_BEAM = 3.5          # 半宽
DEPTH = 3.4            # 舷顶到龙骨
NST = 22              # 纵向断面数
NARC = 12             # 每个断面弧上点数

def beam_frac(a):       # a in [0,1]，船尾→船首
    stern = 0.46 + 0.54 * smoothstep(0.0, 0.20, a)   # 尾部方艉（transom）→满宽
    bow = 1.0 - smoothstep(0.60, 1.0, a)             # 向船首收成尖
    return clamp(min(stern, bow), 0.0, 1.0)

def sheer(a):           # 舷顶高度（中部低、两端翘，船首最高）
    base = 1.7 * ((a - 0.47) ** 2) / (0.47 ** 2)
    bow = 0.7 * smoothstep(0.66, 1.0, a)
    stern = 0.35 * smoothstep(0.18, 0.0, a)
    return base * 0.85 + bow + stern

def depth_frac(a):      # 船首吃水略浅
    return 1.0 - 0.18 * smoothstep(0.7, 1.0, a)

stations = []           # 每个断面的世界顶点（含 deckZ）
for i in range(NST):
    a = i / (NST - 1)
    x = X_STERN + (X_BOW - X_STERN) * a
    B = MAX_BEAM * beam_frac(a)
    D = sheer(a)
    DEP = DEPTH * depth_frac(a)
    pts = []
    for k in range(NARC + 1):
        ang = math.pi * k / NARC
        y = B * math.cos(ang)
        z = D - DEP * (math.sin(ang) ** 1.3)
        pts.append((x, y, z))
    stations.append({'x': x, 'B': B, 'D': D, 'pts': pts})

# 外壳面
hull_verts = []
idx = []
for st in stations:
    base = len(hull_verts)
    idx.append(base)
    hull_verts.extend(st['pts'])
hull_faces = []
for s in range(NST - 1):
    for k in range(NARC):
        a0 = idx[s] + k
        a1 = idx[s] + k + 1
        b0 = idx[s + 1] + k
        b1 = idx[s + 1] + k + 1
        hull_faces.append((a0, a1, b1, b0))
# 方艉封口（尾断面三角扇）
stern_pts = list(range(idx[0], idx[0] + NARC + 1))
cx = sum(hull_verts[p][0] for p in stern_pts) / len(stern_pts)
cy = sum(hull_verts[p][1] for p in stern_pts) / len(stern_pts)
cz = sum(hull_verts[p][2] for p in stern_pts) / len(stern_pts)
cidx = len(hull_verts)
hull_verts.append((cx, cy, cz))
for k in range(NARC):
    hull_faces.append((stern_pts[k], cidx, stern_pts[k + 1]))
hull = mesh_from("Hull", hull_verts, hull_faces, WOOD_HULL, smooth=True)

# 甲板（左右舷顶之间，沿舷弧的平面）
deck_verts, deck_faces = [], []
for st in stations:
    port = st['pts'][0]                 # k=0  → +B
    star = st['pts'][NARC]              # k=NARC → -B
    inset = 0.86
    deck_verts.append((port[0], port[1] * inset, port[2] - 0.12))
    deck_verts.append((star[0], star[1] * inset, star[2] - 0.12))
for s in range(NST - 1):
    p0, s0 = 2 * s, 2 * s + 1
    p1, s1 = 2 * (s + 1), 2 * (s + 1) + 1
    deck_faces.append((p0, p1, s1, s0))
deck = mesh_from("Deck", deck_verts, deck_faces, WOOD_DECK, smooth=False)

# 舷墙（沿舷顶外缘的一圈矮墙）：左右各一条加厚边
def bulwark(side):
    vs, fs = [], []
    sign = 1 if side == 'port' else -1
    kk = 0 if side == 'port' else NARC
    for st in stations:
        p = st['pts'][kk]
        h = 0.55
        vs.append((p[0], p[1], p[2] - 0.1))
        vs.append((p[0], p[1], p[2] + h))
    for s in range(NST - 1):
        b0, t0 = 2 * s, 2 * s + 1
        b1, t1 = 2 * (s + 1), 2 * (s + 1) + 1
        fs.append((b0, t0, t1, b1) if sign > 0 else (b0, b1, t1, t0))
    return mesh_from("Bulwark_" + side, vs, fs, WOOD_TRIM, smooth=True)
bulwark('port')
bulwark('starboard')

# 龙骨
keel = box("Keel", WOOD_TRIM, 22.0, 0.35, 0.6, loc=(1.0, 0.0, -DEPTH + 0.2))
# 船舵
rudder = box("Rudder", WOOD_TRIM, 0.25, 0.18, 2.6, loc=(X_STERN - 0.25, 0.0, -DEPTH + 1.6))

# ----------------------------------------------------------------------------- 艉楼舱室
cabin = box("Cabin", WOOD_DECK, 5.0, 5.4, 2.4, loc=(X_STERN + 3.0, 0.0, sheer(0.06) + 1.0))
cabin_roof = box("CabinRoof", WOOD_TRIM, 5.4, 5.8, 0.3, loc=(X_STERN + 3.0, 0.0, sheer(0.06) + 2.3))
# 艉部金色装饰带
box("SternTrim", GOLD, 0.3, 5.5, 0.5, loc=(X_STERN + 0.55, 0.0, sheer(0.06) + 0.8))
# 艏楼小平台
fo_castle = box("Forecastle", WOOD_DECK, 3.0, 4.2, 1.4, loc=(X_BOW - 4.5, 0.0, sheer(0.85) + 0.5))

# ----------------------------------------------------------------------------- 桅杆 + 帆桁 + 帆
def mast(name, x, base_z, height, rad=0.32):
    m = cyl(name, SPAR, rad, height, axis='Z', loc=(x, 0.0, base_z), r2=rad * 0.55)
    return m

def yard(name, x, z, half_len, rad=0.16):
    return cyl(name, SPAR, rad, half_len * 2, axis='Y', loc=(x, half_len, z), r2=rad)

def sail(name, x_mast, z_top, half_w, height, belly=0.9, mat=SAIL, nu=8, nv=6):
    """挂在帆桁下、向前（+X）鼓起的方帆。"""
    vs, fs = [], []
    for j in range(nv + 1):
        fv = j / nv
        z = z_top - height * fv
        for i in range(nu + 1):
            fu = i / nu
            y = (fu - 0.5) * 2 * half_w
            # 鼓帆：中部最鼓，顶部贴桁、底部略收
            bulge = belly * math.sin(math.pi * fu) * math.sin(math.pi * (0.25 + 0.7 * fv))
            x = x_mast + 0.35 + bulge
            vs.append((x, y, z))
    row = nu + 1
    for j in range(nv):
        for i in range(nu):
            a0 = j * row + i
            a1 = j * row + i + 1
            b0 = (j + 1) * row + i
            b1 = (j + 1) * row + i + 1
            fs.append((a0, a1, b1, b0))
    return mesh_from(name, vs, fs, mat, smooth=True)

DECK_Z = 0.0
# 三根桅杆：前(fore) / 主(main) / 后(mizzen)
fore_x, main_x, miz_x = 6.0, -0.5, -6.5
mast("MastFore", fore_x, DECK_Z - 2.5, 17.5)
mast("MastMain", main_x, DECK_Z - 3.0, 21.5, rad=0.38)
mast("MastMizzen", miz_x, DECK_Z - 2.0, 13.5, rad=0.28)

# 前桅两道帆
yard("YardFore1", fore_x, 12.5, 3.6); sail("SailFore1", fore_x, 12.3, 3.4, 5.0, belly=0.9)
yard("YardFore2", fore_x, 7.2, 4.2);  sail("SailFore2", fore_x, 7.0, 4.0, 4.6, belly=1.0, mat=SAIL_DK)
# 主桅两道帆（最大）
yard("YardMain1", main_x, 16.0, 4.6); sail("SailMain1", main_x, 15.8, 4.4, 6.0, belly=1.05)
yard("YardMain2", main_x, 9.2, 5.4);  sail("SailMain2", main_x, 9.0, 5.2, 5.6, belly=1.15, mat=SAIL_DK)
# 后桅斜桁帆（简化为一道帆）
yard("YardMiz", miz_x, 10.0, 3.0);    sail("SailMiz", miz_x, 9.8, 2.8, 4.4, belly=0.8)

# 艏斜桅 + 三角帆
bowsprit = cyl("Bowsprit", SPAR, 0.22, 6.5, axis='X',
               loc=(X_BOW - 0.5, 0.0, sheer(0.9) + 0.4), rot=(0, math.radians(-22), 0), r2=0.12)
# 艏三角帆
jib_vs = [(X_BOW + 4.5, 0.0, sheer(0.9) - 0.2),
          (X_BOW - 1.0, 0.0, sheer(0.9) + 3.0),
          (X_BOW - 1.5, 0.0, sheer(0.9) - 0.4)]
mesh_from("Jib", jib_vs, [(0, 1, 2)], SAIL, smooth=True)

# ----------------------------------------------------------------------------- 主桅顶：旗杆 + 海盗旗
mast_top = DECK_Z - 3.0 + 21.5                  # 主桅顶 z = 18.5
STAFF_H = 3.0
# 旗杆：从主桅顶继续向上的细圆柱（顶端再收细）
cyl("Flagstaff", SPAR, 0.085, STAFF_H, axis='Z', loc=(main_x, 0.0, mast_top - 0.25), r2=0.045)
# 旗杆顶小球（truck）
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, location=(main_x, 0.0, mast_top - 0.25 + STAFF_H))
_truck = bpy.context.active_object
_truck.name = "Truck"
_truck.data.materials.append(GOLD)

staff_top = mast_top - 0.25 + STAFF_H           # 旗杆顶 z ≈ 21.25
# 海盗旗：旗根贴紧旗杆，向船首（+X，与风向/鼓帆一致）飘；离杆越远摆动越大、旗角自然下垂
fv, ff = [], []
FW, FH = 2.7, 1.35
nu, nv = 12, 5
flag_z_top = staff_top - 0.35
for j in range(nv + 1):
    for i in range(nu + 1):
        fu, fzn = i / nu, j / nv
        x = main_x + 0.085 + fu * FW
        wave = (0.08 + 0.5 * fu) * math.sin(fu * 5.0 - fzn * 1.1)   # 旗面飘动
        y = wave
        z = flag_z_top - fzn * FH - 0.18 * fu                        # 旗尾随距离略下垂
        fv.append((x, y, z))
row = nu + 1
for j in range(nv):
    for i in range(nu):
        a0 = j * row + i; a1 = j * row + i + 1
        b0 = (j + 1) * row + i; b1 = (j + 1) * row + i + 1
        ff.append((a0, a1, b1, b0))
mesh_from("JollyRoger", fv, ff, FLAG, smooth=True)

# ----------------------------------------------------------------------------- 火炮（两舷各 4 门）
for k in range(4):
    px = -5.0 + k * 3.2
    for side in (1, -1):
        cyl("Cannon", IRON, 0.22, 1.6, axis='Y',
            loc=(px, side * (MAX_BEAM * 0.78), DECK_Z + 0.2),
            rot=(0, 0, 0), r2=0.18)
        # 炮身朝外：沿 ±Y 已由 axis='Y' 给出，正负侧用位置区分（统一朝 +Y，足够示意）

# ----------------------------------------------------------------------------- 导出
out_dir = os.path.dirname(os.path.abspath(__file__))
glb_path = os.path.join(out_dir, "pirate-ship.glb")
blend_path = os.path.join(out_dir, "pirate-ship.blend")

# 选中全部网格
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = hull

bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    use_selection=True,
    export_apply=True,           # 应用修改器/变换
    export_yup=True,
)
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
print("EXPORTED_GLB:", glb_path)
print("SAVED_BLEND:", blend_path)
