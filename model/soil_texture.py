"""Potting soil texture: tiling, three sizes of crumbs (Worley cells), cracks and pale grit."""
import sys
import cv2
import numpy as np
from scipy.spatial import cKDTree

O = sys.argv[1]
n = 1024
r = np.random.default_rng(17)
yy, xx = np.mgrid[0:n, 0:n]
grid = np.stack([yy.ravel(), xx.ravel()], axis=1).astype(np.float32)


def crumbs(count):
    pts = r.random((count, 2)) * n
    d, i = cKDTree(pts, boxsize=n).query(grid, k=2, workers=-1)
    return d[:, 0].reshape(n, n).astype(np.float32), d[:, 1].reshape(n, n).astype(np.float32), i[:, 0].reshape(n, n)


hgt = np.zeros((n, n), np.float32)
val = np.zeros((n, n), np.float32)
for count, weight, tint in ((420, 1.0, 0.55), (2200, 0.5, 0.35), (11000, 0.2, 0.2)):
    f1, f2, ids = crumbs(count)
    size = n / np.sqrt(count)
    dome = np.clip(1 - f1 / (size * 0.72), 0, 1) ** 0.6
    edge = np.clip((f2 - f1) / (size * 0.32), 0, 1)
    hgt += weight * size * 0.42 * dome * edge
    val += tint * r.random(count).astype(np.float32)[ids]
    val -= tint * 0.9 * (1 - edge) ** 2  # dark gaps between crumbs
val = (val - val.mean()) / val.std()
base = np.array([16, 27, 40], np.float32)  # BGR, damp dark brown
soil = base[None, None] * np.clip(1 + 0.42 * val, 0.18, 2.1)[..., None]
ambient = cv2.GaussianBlur(hgt, (0, 0), 7)
soil = soil * np.clip(0.72 + 0.075 * (hgt - ambient), 0.32, 1.45)[..., None]
soil = soil.astype(np.float32)
for _ in range(1100):  # perlite and peat fibres
    x, y = int(r.integers(0, n)), int(r.integers(0, n))
    if r.random() < 0.5:
        rad = int(r.integers(1, 3))
        c = float(r.integers(120, 195))
        cv2.circle(soil, (x, y), rad, (c * 0.92, c * 0.97, c), -1, cv2.LINE_AA)
        cv2.circle(hgt, (x, y), rad, float(hgt[y, x]) + 3, -1, cv2.LINE_AA)
    else:
        a = r.uniform(0, np.pi)
        ln = r.uniform(5, 22)
        p2 = (int(x + np.cos(a) * ln), int(y + np.sin(a) * ln))
        c = float(r.integers(45, 88))
        cv2.line(soil, (x, y), p2, (c * 0.42, c * 0.68, c), 1, cv2.LINE_AA)
cv2.imwrite(f"{O}/soil.webp", np.clip(soil, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 80])
gx = cv2.Sobel(hgt, cv2.CV_32F, 1, 0, ksize=3) / 8 * 0.55
gy = cv2.Sobel(hgt, cv2.CV_32F, 0, 1, ksize=3) / 8 * 0.55
ln = np.sqrt(gx * gx + gy * gy + 1)
nm = np.dstack([1 / ln, gy / ln, -gx / ln]) * 0.5 + 0.5
cv2.imwrite(f"{O}/soil_n.webp", (nm * 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 74])
