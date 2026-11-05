"""blender --background --python export_web.py -- <model_dir> <out_glb>   Light mesh for the site; textures load separately."""
import os, sys
import bpy
D, OUT = sys.argv[sys.argv.index("--") + 1:][:2]
exec(open(os.path.join(D, "build_pack.py"), encoding="utf-8").read(), {"MODEL_DIR": D, "GRID": (130, 64), "TAG_GRID": 18})
bpy.ops.object.select_all(action="DESELECT")
for ob in bpy.data.collections["KRUNCHI_Pack"].objects:
    ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_materials="NONE",
                          export_yup=True, export_animations=False)
print("exported", OUT, os.path.getsize(OUT))
