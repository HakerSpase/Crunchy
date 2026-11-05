"""python web_textures.py <textures_dir> <public_assets_dir>: resizes for the site, generates the chip texture."""
import sys
import cv2, numpy as np
T, O = sys.argv[1:3]
def save(name, out, w, q=84, mode=cv2.IMREAD_COLOR):
    im = cv2.imread(f"{T}/{name}", mode)
    h = int(im.shape[0] * w / im.shape[1])
    im = cv2.resize(im, (w, h), interpolation=cv2.INTER_AREA)
    cv2.imwrite(f"{O}/{out}", im, [cv2.IMWRITE_WEBP_QUALITY, q])
save("front_albedo.jpg", "front.webp", 1440, 88)
save("back_albedo.jpg", "back.webp", 1440, 88)
save("front_normal.png", "front_n.webp", 900, 78)
save("back_normal.png", "back_n.webp", 900, 78)
save("kraft_tile.jpg", "kraft.webp", 512, 80)
save("tag.png", "tag.webp", 700, 90, cv2.IMREAD_UNCHANGED)

# Baked chip: toasted cheese-lentil cracker, pitted, with dark seeds and spice.
n = 768
r = np.random.default_rng(4)
def noise(sig):
    a = cv2.GaussianBlur(r.standard_normal((n, n)).astype(np.float32), (0, 0), sig)
    return a / a.std()
base = np.array([52, 140, 226], np.float32)   # BGR warm orange-gold
dark = np.array([26, 84, 168], np.float32)
light = np.array([96, 188, 244], np.float32)
t = np.clip(0.5 + 0.28 * noise(40) + 0.20 * noise(12) + 0.1 * noise(3), 0, 1)[..., None]
col = dark * (1 - t) + light * t
col = col * 0.55 + base * 0.45
pits = np.clip(noise(2.6) - 1.1, 0, 2)                     # pitted, airy surface
col *= (1 - 0.34 * np.clip(pits, 0, 1))[..., None]
blis = np.clip(noise(7) - 1.0, 0, 1.5)
col = col * (1 - 0.3 * blis[..., None]) + dark * 0.3 * blis[..., None]
hgt = 0.7 * noise(18) + 0.55 * noise(6) - 1.1 * np.clip(pits, 0, 1.4) + 0.2 * noise(1.5)
for _ in range(190):                                         # seeds and pepper
    x, y = r.integers(0, n, 2)
    a, b = r.uniform(2, 7), r.uniform(1.4, 3.6)
    c = (int(r.integers(14, 30)), int(r.integers(26, 44)), int(r.integers(32, 62)))
    cv2.ellipse(col, (int(x), int(y)), (int(a), int(b)), float(r.uniform(0, 180)), 0, 360, c, -1, cv2.LINE_AA)
    cv2.ellipse(hgt, (int(x), int(y)), (int(a), int(b)), 0, 0, 360, 2.2, -1, cv2.LINE_AA)
cv2.imwrite(f"{O}/chip.webp", np.clip(col, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 84])
gx = cv2.Sobel(hgt, cv2.CV_32F, 1, 0, ksize=3) / 8 * 2.4
gy = cv2.Sobel(hgt, cv2.CV_32F, 0, 1, ksize=3) / 8 * 2.4
ln = np.sqrt(gx * gx + gy * gy + 1)
nm = np.dstack([(1 / ln), (gy / ln), (-gx / ln)]) * 0.5 + 0.5  # BGR
cv2.imwrite(f"{O}/chip_n.webp", (nm * 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 80])
