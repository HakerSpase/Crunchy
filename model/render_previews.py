"""blender --background krunchi_pack.blend --python render_previews.py -- <model_dir> <still|turn>"""
import os
import sys

import bpy

D, MODE = sys.argv[sys.argv.index("--") + 1:][:2]
g = {}
exec(open(os.path.join(D, "setup_studio.py"), encoding="utf-8").read(), g)
shot = g["shot"]
R = os.path.join(D, "renders")

if MODE == "still":
    res = (1080, 1440)
    shot(os.path.join(R, "01_hero.png"), -24, 6, samples=48, res=res)
    shot(os.path.join(R, "02_front.png"), 0, 4, samples=48, res=res)
    shot(os.path.join(R, "03_back.png"), 180, 4, samples=48, res=res)
    shot(os.path.join(R, "04_side.png"), 72, 4, samples=48, res=res)
    shot(os.path.join(R, "05_indicator.png"), -12, 4, dist=2.3, target=(0.42, 0, 1.2), samples=64, res=(1080, 1080))
    shot(os.path.join(R, "06_tag.png"), -20, 12, dist=2.7, target=(0.05, 0, 0.38), samples=64, res=(1080, 1080))
else:
    os.makedirs(os.path.join(R, "turn"), exist_ok=True)
    for i in range(60):
        shot(os.path.join(R, "turn", f"f{i:03d}.png"), i * 6, 5, samples=14, res=(540, 720))
        print("frame", i, flush=True)
