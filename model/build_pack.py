"""Builds the КРАНЧИ pack in the open Blender scene.

Run inside Blender with MODEL_DIR set in the globals:
    exec(open(r"<dir>/build_pack.py").read(), {"MODEL_DIR": r"<dir>"})

Geometry is a parametric stand-up pouch whose outline comes from the artwork's mask,
so the silhouette and the print line up exactly.
Units: pack height = 2.2 BU (real 75 g pack ~ 22 cm, so 1 BU = 10 cm).
"""
import json
import math
import os

import bpy
import numpy as np

TEX = os.path.join(MODEL_DIR, "textures")
L = json.load(open(os.path.join(TEX, "layout.json")))
SRC_W, SRC_H = L["src_w"], L["src_h"]

rows = np.array(L["rows"], dtype=np.float64)
Y_TOP, Y_BOT = rows[0, 0], rows[-1, 0]


def smooth1d(a, k):
    w = np.hanning(k * 2 + 1)
    w /= w.sum()
    p = np.pad(a, k, mode="edge")
    return np.convolve(p, w, mode="valid")


LEFT = smooth1d(rows[:, 1], 2)
RIGHT = smooth1d(rows[:, 2], 2)
PACK_H = 2.2
S = PACK_H / (Y_BOT - Y_TOP)  # BU per source pixel
CX = 0.5 * (np.median(LEFT) + np.median(RIGHT))

D_MAX = 0.31       # bulge of the front panel
D_BOTTOM = 0.285   # half depth of the oval base
TOP_SEAL = 0.925   # v above which the panels are sealed flat

# Deterministic low-frequency wobble: paper never sits perfectly smooth.
_r = np.random.default_rng(5)
_W = [(_r.uniform(0, 2 * math.pi), _r.uniform(2.5, 8.5), _r.uniform(0, 6.28), _r.uniform(0.004, 0.012))
      for _ in range(14)]


def wobble(u, v, seed):
    out = np.zeros_like(u)
    for i, (a, f, ph, amp) in enumerate(_W):
        out += amp * np.sin((u * math.cos(a) + v * 1.5 * math.sin(a)) * f + ph + seed * (i + 1) * 1.7)
    return out


def depth(u, v, back):
    """Distance of a panel from the mid plane. u in [-1,1], v 0 bottom .. 1 top."""
    au = np.clip(np.abs(u) / 0.985, 0, 1)
    low = np.clip(v / 0.11, 0, 1)
    low = low * low * (3 - 2 * low)
    side_high = (1 - au ** 2.8) ** 0.62
    side_low = np.sqrt(np.maximum(1 - au ** 2, 0))  # true oval base
    side = side_low * (1 - low) + side_high * low
    rise = 0.9 + 0.1 * np.clip(v / 0.26, 0, 1) ** 0.8
    t = np.clip((v - 0.26) / (TOP_SEAL - 0.26), 0, 1)
    fall = 1 - t * t * t * (t * (6 * t - 15) + 10)
    fall = fall ** 0.85
    prof = rise * fall
    d = (D_MAX * (0.86 if back else 1.0)) * side * prof
    # shoulder dent: the fill settles, the upper third goes slightly concave
    d -= 0.022 * side * np.exp(-((v - 0.62) / 0.085) ** 2) * (0.6 + 0.4 * np.cos(u * 3.1))
    # wobble fades at the seals
    d += wobble(u, v, 1.0 if back else 0.0) * side * np.clip(fall * 1.6, 0, 1)
    # paper thickness: panels never coincide, or one shows through the other at the seal
    floor = 0.0035 * np.clip((1 - np.abs(u)) / 0.02, 0, 1) * np.clip((1 - v) / 0.004, 0, 1)
    return np.maximum(d, floor)


def lean(v):
    """A gentle lean of the unsupported top."""
    return 0.055 * np.clip(v - 0.45, 0, 1) ** 2.2


def row_span(y):
    return np.interp(y, rows[:, 0], LEFT), np.interp(y, rows[:, 0], RIGHT)


def panel_xyz(px, py, back):
    """Source pixel coordinates (front art) -> world position on a panel."""
    v = (Y_BOT - py) / (Y_BOT - Y_TOP)
    l, r = row_span(py)
    mid = (l + r) / 2
    half = np.maximum((r - l) / 2, 1e-3)
    u = (px - mid) / half
    d = depth(u, v, back)
    x = (px - CX) * S
    z = v * PACK_H
    y = (d if back else -d) + lean(v)
    return np.stack([x, y, z], axis=-1), u, v


def grid_rows(n):
    """Cosine-ish row spacing: denser near the top and bottom edges."""
    t = np.linspace(0, 1, n)
    return Y_TOP + (Y_BOT - Y_TOP) * (0.72 * t + 0.28 * (1 - np.cos(t * math.pi)) / 2)


def make_mesh(name, verts, faces, uvs, material, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.reshape(-1, 3).tolist(), [], faces)
    me.update()
    uv = me.uv_layers.new(name="UVMap")
    data = np.zeros(len(me.loops) * 2, dtype=np.float32)
    idx = np.zeros(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", idx)
    flat = uvs.reshape(-1, 2)
    data[0::2] = flat[idx, 0]
    data[1::2] = flat[idx, 1]
    uv.data.foreach_set("uv", data)
    me.materials.append(material)
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    ob.parent = ROOT
    return ob


def grid_faces(nr, nc, flip=False):
    faces = []
    for r in range(nr - 1):
        for c in range(nc - 1):
            a, b, d, e = r * nc + c, r * nc + c + 1, (r + 1) * nc + c + 1, (r + 1) * nc + c
            faces.append((a, b, d, e) if flip else (a, e, d, b))
    return faces


def image(fname, colorspace="sRGB"):
    path = os.path.join(TEX, fname)
    img = bpy.data.images.get(fname) or bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def paper_material(name, albedo, normal=None, rough=0.68, normal_strength=1.7, alpha=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = image(albedo)
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = 0.32
    b.inputs["Sheen Weight"].default_value = 0.25
    b.inputs["Sheen Roughness"].default_value = 0.6
    if normal:
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = image(normal, "Non-Color")
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    if alpha:
        nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
        m.blend_method = "CLIP"
        m.alpha_threshold = 0.5
    return m


# ---------------------------------------------------------------- scene reset
for ob in list(bpy.data.objects):
    if ob.name in ("Cube", "Light") or ob.name.startswith(("Pack_", "KRUNCHI", "Tag_", "Indicator")):
        bpy.data.objects.remove(ob, do_unlink=True)

COL = bpy.data.collections.get("KRUNCHI_Pack")
if COL is None:
    COL = bpy.data.collections.new("KRUNCHI_Pack")
    bpy.context.scene.collection.children.link(COL)

ROOT = bpy.data.objects.new("KRUNCHI_Root", None)
ROOT.empty_display_size = 0.3
COL.objects.link(ROOT)

mat_front = paper_material("Kraft_Front", "front_albedo.jpg", "front_normal.png")
mat_back = paper_material("Kraft_Back", "back_albedo.jpg", "back_normal.png")
mat_tile = paper_material("Kraft_Gusset", "kraft_tile.jpg", None, rough=0.75)
mat_tag = paper_material("Seed_Tag", "tag.png", None, rough=0.85, alpha=True)

# ---------------------------------------------------------------- panels
NR, NC = globals().get("GRID", (240, 130))
ys = grid_rows(NR)
ts = np.linspace(0, 1, NC)
ls, rs = row_span(ys)
PX = ls[:, None] + (rs - ls)[:, None] * ts[None, :]
PY = np.repeat(ys[:, None], NC, axis=1)

# front
pos_f, U, V = panel_xyz(PX, PY, back=False)
uv_f = np.stack([PX / SRC_W, 1 - PY / SRC_H], axis=-1)
make_mesh("Pack_Front", pos_f, grid_faces(NR, NC, flip=False), uv_f, mat_front)

# back: the back art has its own bbox and is seen mirrored
bx0, by0, bx1, by1 = L["back_bbox"]
fx0, fx1 = rows[:, 1].min(), rows[:, 2].max()
pos_b, _, _ = panel_xyz(PX, PY, back=True)
ax = 1 - (PX - fx0) / (fx1 - fx0)
ay = (PY - Y_TOP) / (Y_BOT - Y_TOP)
uv_b = np.stack([(bx0 + ax * (bx1 - bx0)) / SRC_W, 1 - (by0 + ay * (by1 - by0)) / SRC_H], axis=-1)
make_mesh("Pack_Back", pos_b, grid_faces(NR, NC, flip=True), uv_b, mat_back)

# gusset: oval base joining the bottom rows of both panels, slightly domed inwards
NG = 14
f_row, b_row = pos_f[-1], pos_b[-1]
tt = np.linspace(0, 1, NG)[:, None, None]
pos_g = f_row[None] * (1 - tt) + b_row[None] * tt
span = (1 - np.clip(np.abs(U[-1]), 0, 1) ** 2)[None, :]
pos_g[..., 2] += 0.075 * np.sin(tt[..., 0] * math.pi) * span
uv_g = np.stack([pos_g[..., 0] * 0.6 + 0.5, pos_g[..., 1] * 0.6 + 0.5], axis=-1)
make_mesh("Pack_Gusset", pos_g, grid_faces(NG, NC, flip=False), uv_g, mat_tile)

# ---------------------------------------------------------------- seed tag: lies on the front panel
cx0, cy0, cx1, cy1 = L["tag_crop_px"]
TN = globals().get("TAG_GRID", 40)
tx = np.linspace(cx0, cx1, TN)
ty = np.linspace(cy0, cy1, TN)
TX, TY = np.meshgrid(tx, ty)
pos_t, _, _ = panel_xyz(TX, TY, back=False)
pos_t[..., 1] -= 0.0055
uv_t = np.stack([(TX - cx0) / (cx1 - cx0), 1 - (TY - cy0) / (cy1 - cy0)], axis=-1)
make_mesh("Tag_SeedLabel", pos_t, grid_faces(TN, TN, flip=False), uv_t, mat_tag)

# ---------------------------------------------------------------- weight label: separate so each format can differ
wx0, wy0, wx1, wy1 = L["weight_box"]
WN = 8
WX, WY = np.meshgrid(np.linspace(wx0, wx1, WN), np.linspace(wy0, wy1, WN))
pos_w, _, _ = panel_xyz(WX, WY, back=False)
pos_w[..., 1] -= 0.0025
uv_w = np.stack([(WX - wx0) / (wx1 - wx0), 1 - (WY - wy0) / (wy1 - wy0)], axis=-1)
mat_w = bpy.data.materials.get("Weight_Label") or bpy.data.materials.new("Weight_Label")
make_mesh("Pack_Weight", pos_w, grid_faces(WN, WN, flip=False), uv_w, mat_w)

# ---------------------------------------------------------------- freshness indicator: a white dome in the print
ix, iy, ir = L["front_indicator"]
p, _, _ = panel_xyz(np.array([ix]), np.array([iy]), back=False)
p2, _, _ = panel_xyz(np.array([ix, ix]), np.array([iy - 5, iy + 5]), back=False)
p3, _, _ = panel_xyz(np.array([ix - 5, ix + 5]), np.array([iy, iy]), back=False)
tan_z = p2[0] - p2[1]
tan_x = p3[1] - p3[0]
nrm = np.cross(tan_z, tan_x)
nrm /= np.linalg.norm(nrm)
if nrm[1] > 0:
    nrm = -nrm

mat_ind = bpy.data.materials.get("Indicator_White") or bpy.data.materials.new("Indicator_White")
mat_ind.use_nodes = True
b = mat_ind.node_tree.nodes.get("Principled BSDF")
b.inputs["Base Color"].default_value = (0.93, 0.935, 0.93, 1)
b.inputs["Roughness"].default_value = 0.24
b.inputs["Coat Weight"].default_value = 1.0
b.inputs["Coat Roughness"].default_value = 0.06

bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.0)
ind = bpy.context.active_object
ind.name = "Indicator_Freshness"
for c in list(ind.users_collection):
    c.objects.unlink(ind)
COL.objects.link(ind)
ind.data.materials.clear()
ind.data.materials.append(mat_ind)
ind.data.shade_smooth()
ind.parent = ROOT
r_w = (ir + 3) * S
ind.scale = (r_w, r_w, r_w * 0.2)
ind.rotation_mode = "QUATERNION"
from mathutils import Vector
ind.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(nrm.tolist()))
ind.location = (p[0] + nrm * 0.004).tolist()

bpy.context.view_layer.update()
stats = {o.name: len(o.data.vertices) for o in COL.objects if o.type == "MESH"}
print(stats)
