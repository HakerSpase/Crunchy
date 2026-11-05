"""Studio set for pack previews: warm seamless backdrop, soft key, rim, fill.

    exec(open(r"<dir>/setup_studio.py").read())
"""
import math

import bpy
from mathutils import Vector

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
scene.cycles.max_bounces = 6
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.resolution_x = 900
scene.render.resolution_y = 1200

for ob in list(bpy.data.objects):
    if ob.name.startswith("Studio_"):
        bpy.data.objects.remove(ob, do_unlink=True)

col = bpy.data.collections.get("Studio")
if col is None:
    col = bpy.data.collections.new("Studio")
    scene.collection.children.link(col)

# Seamless cyclorama: floor sweeping up into a back wall.
R = 3.5
Y0 = 2.2
pts = [(-16.0, 0.0), (Y0, 0.0)]
for i in range(1, 33):
    ang = i / 32 * math.pi / 2
    pts.append((Y0 + R * math.sin(ang), R - R * math.cos(ang)))
pts.append((Y0 + R, 18.0))
verts, faces = [], []
for (y, z) in pts:
    verts += [(-30, y, z), (30, y, z)]
for i in range(len(pts) - 1):
    a = i * 2
    faces.append((a, a + 1, a + 3, a + 2))
me = bpy.data.meshes.new("Studio_Cyc")
me.from_pydata(verts, [], faces)
me.shade_smooth()
cyc = bpy.data.objects.new("Studio_Cyc", me)
col.objects.link(cyc)
mc = bpy.data.materials.get("Studio_Backdrop") or bpy.data.materials.new("Studio_Backdrop")
mc.use_nodes = True
b = mc.node_tree.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = (0.96, 0.93, 0.87, 1)
b.inputs["Roughness"].default_value = 0.55
me.materials.append(mc)


def area(name, loc, target, size, power, color):
    d = bpy.data.lights.new(name, "AREA")
    d.shape = "RECTANGLE"
    d.size, d.size_y = size
    d.energy = power
    d.color = color
    ob = bpy.data.objects.new(name, d)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    col.objects.link(ob)
    return ob


area("Studio_Key", (-3.2, -4.2, 4.0), (0, 0, 1.1), (4.0, 4.0), 230, (1.0, 0.96, 0.9))
area("Studio_Fill", (4.0, -3.6, 1.6), (0, 0, 1.1), (4.0, 4.0), 55, (0.95, 0.97, 1.0))
area("Studio_Rim", (2.4, 3.0, 4.2), (0, 0, 1.3), (2.5, 2.5), 170, (1.0, 0.98, 0.92))
area("Studio_RimL", (-3.4, 2.2, 2.2), (0, 0, 1.2), (1.5, 3.5), 70, (1.0, 0.97, 0.92))

pack_col = bpy.data.collections.get("KRUNCHI_Pack")
for n in ("Studio_Rim", "Studio_RimL"):
    bpy.data.objects[n].light_linking.receiver_collection = pack_col

w = scene.world or bpy.data.worlds.new("World")
scene.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.87, 0.8, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.62

cam = bpy.data.objects.get("Camera")
cam.data.lens = 70
cam.data.dof.use_dof = False


def aim(azimuth_deg, elev_deg=5.0, dist=6.6, target=(0, 0, 1.08)):
    """Camera stays in front of the set; the pack turns. Azimuth 0 shows the front panel."""
    root = bpy.data.objects["KRUNCHI_Root"]
    root.rotation_euler = (0, 0, math.radians(azimuth_deg))
    e = math.radians(elev_deg)
    t = Vector(target)
    cam.location = t + Vector((0, -math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()


def shot(path, azimuth, elev=5.0, dist=6.6, target=(0, 0, 1.08), samples=None, res=None):
    aim(azimuth, elev, dist, target)
    if samples:
        scene.cycles.samples = samples
    if res:
        scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
