"""blender --background krunchi_pack.blend --python render_poster.py -- <model_dir> <assets_dir>  Poster with alpha + share image."""
import os, sys
import bpy
D, A = sys.argv[sys.argv.index("--") + 1:][:2]
exec(open(os.path.join(D, "build_pack.py"), encoding="utf-8").read(), {"MODEL_DIR": D})
g = {}
exec(open(os.path.join(D, "setup_studio.py"), encoding="utf-8").read(), g)
# weight label for the poster
m = bpy.data.materials["Weight_Label"]
m.use_nodes = True
b = m.node_tree.nodes["Principled BSDF"]
img = bpy.data.images.load(os.path.join(D, "textures", "weight75.png"))
t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = img
m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
m.node_tree.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
b.inputs["Roughness"].default_value = 0.7
scene = bpy.context.scene
g["shot"](os.path.join(A, "share_raw.png"), -18, 4, dist=7.4, target=(0, 0, 1.08), samples=48, res=(1200, 1200))
bpy.data.objects["Studio_Cyc"].hide_render = True
scene.render.film_transparent = True
g["shot"](os.path.join(A, "poster_raw.png"), -22, 4, samples=56, res=(900, 1200))
