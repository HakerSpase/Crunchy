"""Builds the pack textures from the artwork embedded in the deck.

Usage: python prepare_textures.py <FINAL.pdf> <out_dir>
Outputs: front/back albedo, front/back normal maps, kraft tile, seed tag (RGBA), layout.json
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import pymupdf
from scipy import ndimage as ndi

PDF, OUT = sys.argv[1], Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
SCALE = 4
rng = np.random.default_rng(7)


def load(doc, xref, smask):
    img = cv2.imdecode(np.frombuffer(doc.extract_image(xref)["image"], np.uint8), cv2.IMREAD_COLOR)
    m = pymupdf.Pixmap(doc, smask)
    mask = np.frombuffer(m.samples, np.uint8).reshape(m.height, m.width, m.n)[..., 0]
    if mask.shape != img.shape[:2]:
        mask = cv2.resize(mask, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)
    return img, mask


def bleed(img, mask):
    """Replace everything outside the pack with the nearest pack colour (no black fringe)."""
    inside = cv2.erode((mask > 200).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    idx = ndi.distance_transform_edt(~inside, return_distances=False, return_indices=True)
    return img[idx[0], idx[1]]


def find_blob(img, box, lo, hi):
    x0, y0, x1, y1 = box
    hsv = cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_BGR2HSV)
    if lo[0] > hi[0]:  # hue wraps around red
        m = cv2.inRange(hsv, (0, lo[1], lo[2]), (hi[0], 255, 255)) | cv2.inRange(hsv, (lo[0], lo[1], lo[2]), (180, 255, 255))
    else:
        m = cv2.inRange(hsv, lo, hi)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, cents = cv2.connectedComponentsWithStats(m)
    best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    r = float(np.sqrt(stats[best, cv2.CC_STAT_AREA] / np.pi))
    return float(cents[best][0] + x0), float(cents[best][1] + y0), r


def paint_white_disc(big, cx, cy, r, dome):
    """Paints the white indicator into the upscaled art, antialiased."""
    h, w = big.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = np.hypot(xx - cx, yy - cy)
    alpha = np.clip((r - dist) / 3.0, 0, 1)[..., None]
    if dome:
        n = np.clip(dist / r, 0, 1)
        shade = 250 - 34 * n ** 2.5
    else:
        n = np.clip(dist / r, 0, 1)
        shade = 244 - 18 * n ** 4
    color = np.dstack([shade * 0.985, shade * 0.995, shade])
    # soft contact shadow so the disc sits in the print
    sh = np.clip((r + 7 - dist) / 7.0, 0, 1)[..., None] * 0.28 * (1 - alpha)
    return (big * (1 - sh) * (1 - alpha) + color * alpha).astype(np.float32)


def fibres(h, w, seed):
    r = np.random.default_rng(seed)
    a = cv2.GaussianBlur(r.standard_normal((h, w)).astype(np.float32), (0, 0), sigmaX=7, sigmaY=0.7)
    b = cv2.GaussianBlur(r.standard_normal((h, w)).astype(np.float32), (0, 0), sigmaX=0.7, sigmaY=5)
    c = cv2.GaussianBlur(r.standard_normal((h, w)).astype(np.float32), (0, 0), 1.1)
    f = a / a.std() + 0.8 * b / b.std() + 0.7 * c / c.std()
    return f / f.std()


def smooth_noise(h, w, sigma, seed):
    r = np.random.default_rng(seed)
    n = r.standard_normal((h // 8 + 1, w // 8 + 1)).astype(np.float32)
    n = cv2.GaussianBlur(n, (0, 0), sigma / 8)
    n = cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC)
    return n / n.std()


def crease_height(h, w, seed):
    """Paper crease height field: seals, shoulder folds, corner fans, gusset arc."""
    r = np.random.default_rng(seed)
    sharp = np.zeros((h, w), np.float32)

    def line(pts, amp):
        p = (np.array(pts) * [w, h]).astype(np.int32)
        cv2.polylines(sharp, [p.reshape(-1, 1, 2)], False, float(amp), 3, cv2.LINE_AA)

    def curve(a, b, bend, amp):
        a, b = np.array(a), np.array(b)
        n = np.array([-(b - a)[1], (b - a)[0]])
        ts = np.linspace(0, 1, 18)
        line([a + (b - a) * t + n * bend * np.sin(np.pi * t) for t in ts], amp)

    # shoulder folds under the top seal
    for _ in range(26):
        u = r.uniform(0.03, 0.97)
        v = r.uniform(0.085, 0.26)
        ang = r.normal(np.pi / 2, 0.75)
        ln = r.uniform(0.03, 0.11)
        curve((u, v), (u + np.cos(ang) * ln, v + np.sin(ang) * ln), r.uniform(-0.12, 0.12), r.uniform(-1, 1))
    # corner fans at the side seams
    for side in (0.03, 0.97):
        for _ in range(26):
            v = r.uniform(0.1, 0.93)
            ang = r.normal(0, 0.5)
            ln = r.uniform(0.025, 0.09)
            dx = np.cos(ang) * ln * (1 if side < 0.5 else -1)
            curve((side, v), (side + dx, v + np.sin(ang) * ln), r.uniform(-0.15, 0.15), r.uniform(-1, 1))
    # bottom gusset folds
    for _ in range(22):
        u = r.uniform(0.04, 0.96)
        v = r.uniform(0.8, 0.975)
        ang = r.normal(-np.pi / 2, 0.8)
        ln = r.uniform(0.02, 0.07)
        curve((u, v), (u + np.cos(ang) * ln, v + np.sin(ang) * ln), r.uniform(-0.1, 0.1), r.uniform(-0.8, 0.8))
    # gusset arc: the heat-seal line of a stand-up pouch
    ts = np.linspace(0, 1, 60)
    arc = [(t, 0.975 - 0.145 * (1 - (2 * t - 1) ** 2) ** -0.0 * abs(2 * t - 1) ** 2.4) for t in ts]
    line(arc, -1.5)

    fine = cv2.GaussianBlur(sharp, (0, 0), 1.6)
    wide = cv2.GaussianBlur(sharp, (0, 0), 9)
    broad = cv2.GaussianBlur(sharp, (0, 0), 26)
    out = 1.0 * fine + 3.2 * wide + 7.0 * broad

    # top heat seal: flat band with a crisp step and a fine embossed texture
    yy = np.arange(h, dtype=np.float32) / h
    band = np.clip((0.072 - yy) / 0.0016, 0, 1)
    out += (-3.2 * band)[:, None]
    knurl = np.sin(yy * h * 2 * np.pi / 13.0) * band * 0.35
    out += knurl[:, None]
    return out


def normal_map(height, strength):
    gx = cv2.Sobel(height, cv2.CV_32F, 1, 0, ksize=3) / 8 * strength
    gy = cv2.Sobel(height, cv2.CV_32F, 0, 1, ksize=3) / 8 * strength
    nz = np.ones_like(gx)
    ln = np.sqrt(gx * gx + gy * gy + nz)
    # OpenGL convention (+Y up): image Y grows down, so green uses +gy
    nrm = np.dstack([-gx / ln, gy / ln, nz / ln])
    enc = ((nrm * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)
    return enc[..., ::-1]  # RGB -> BGR for cv2


doc = pymupdf.open(PDF)
# The two pack images on slide 6: find them by reading xrefs of that page.
imgs = doc[5].get_images(full=True)
front_src, front_mask = load(doc, imgs[0][0], imgs[0][1])
back_src, back_mask = load(doc, imgs[1][0], imgs[1][1])
H, W = front_src.shape[:2]

# --- locate artwork features on the source (613x919 space) ---
fx, fy, fr = find_blob(front_src, (470, 380, 580, 480), (35, 50, 40), (85, 255, 255))
bx, by, br = find_blob(back_src, (90, 680, 180, 750), (35, 60, 40), (85, 255, 255))
print("front indicator", fx, fy, fr, "| back legend", bx, by, br)

# Seed tag: light paper, much brighter/less saturated than kraft.
hsv = cv2.cvtColor(front_src, cv2.COLOR_BGR2HSV)
tag_seed = ((hsv[..., 1] < 62) & (hsv[..., 2] > 150)).astype(np.uint8)
tag_seed[:640] = 0
tag_seed[:, :150] = 0
tag_seed[:, 470:] = 0
tag_closed = cv2.morphologyEx(tag_seed, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(tag_closed)
best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
tag_mask = (lab == best).astype(np.uint8)
tag_mask = ndi.binary_fill_holes(tag_mask).astype(np.uint8)
tx, ty, tw, th = (int(v) for v in stats[best, :4])
print("tag bbox", tx, ty, tw, th)

# The printed weight comes off: each format gets its own label as a separate decal.
WEIGHT_BOX = (452, 838, 524, 895)
wx0, wy0, wx1, wy1 = WEIGHT_BOX
wbox = front_src[wy0:wy1, wx0:wx1]
wink = cv2.cvtColor(wbox, cv2.COLOR_BGR2HSV)[..., 2] < 105
wmask = np.zeros(front_src.shape[:2], np.uint8)
wmask[wy0:wy1, wx0:wx1] = cv2.dilate(wink.astype(np.uint8), np.ones((5, 5), np.uint8)) * 255
front_src = cv2.inpaint(front_src, wmask, 7, cv2.INPAINT_TELEA)

# --- upscaled albedo ---
def upscale(img):
    big = cv2.resize(img, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_LANCZOS4).astype(np.float32)
    blur = cv2.GaussianBlur(big, (0, 0), 3.2)
    return np.clip(big + (big - blur) * 0.9, 0, 255)


front_big = upscale(bleed(front_src, front_mask))
back_big = upscale(bleed(back_src, back_mask))
bh, bw = front_big.shape[:2]

# Clean art under the indicator (old glow and green ticks), then repaint it white.
def clean_annulus(big, cx, cy, r_in, r_out):
    h, w = big.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = np.hypot(xx - cx, yy - cy)
    ring = (dist > r_out + 6) & (dist < r_out + 34)
    col = np.median(big[ring].reshape(-1, 3), axis=0)
    paper = col[None, None, :] * (1 + 0.018 * smooth_noise(h, w, 10, 5)[..., None])
    a = np.clip((r_out - dist) / 10.0, 0, 1)[..., None]
    out = big * (1 - a) + paper * a
    # thin printed ring around the sensor
    ink = np.array([38, 72, 34], np.float32)
    k = (np.clip(1 - np.abs(dist - (r_in + 9)) / 3.0, 0, 1) * 0.85)[..., None]
    return out * (1 - k) + ink * k


front_big = clean_annulus(front_big, fx * SCALE, fy * SCALE, (fr + 3) * SCALE, (fr + 3) * SCALE * 1.42)
front_big = paint_white_disc(front_big, fx * SCALE, fy * SCALE, (fr + 3) * SCALE, True)
back_big = paint_white_disc(back_big, bx * SCALE, by * SCALE, (br + 2) * SCALE, False)

# Seed tag texture (keeps the printed tag; alpha from the detected outline).
cnts, _ = cv2.findContours(tag_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
hull = cv2.convexHull(max(cnts, key=cv2.contourArea))
tag_mask = np.zeros_like(tag_mask)
cv2.fillConvexPoly(tag_mask, hull, 1)
hull_big = np.zeros((bh, bw), np.uint8)
cv2.fillConvexPoly(hull_big, (hull * SCALE).astype(np.int32), 1)
sdf = cv2.distanceTransform(hull_big, cv2.DIST_L2, 5)
deckle = 3.5 * smooth_noise(bh, bw, 9, 12) + 2.0 * smooth_noise(bh, bw, 3 * 8 / 8 + 8, 13)
mask_big = ((sdf - 6 + deckle) * 90).clip(0, 255)
mask_big[sdf < 2] = 0  # deckle noise must never leave crumbs outside the outline
mask_big = mask_big.astype(np.uint8)
pad = 12
x0, y0 = max(0, (tx - pad) * SCALE), max(0, (ty - pad) * SCALE)
x1, y1 = min(bw, (tx + tw + pad) * SCALE), min(bh, (ty + th + pad) * SCALE)
tag_rgb = front_big[y0:y1, x0:x1].copy()
tag_rgb = tag_rgb * (1 + 0.012 * fibres(y1 - y0, x1 - x0, 11)[..., None])
tag_rgba = np.dstack([np.clip(tag_rgb, 0, 255), mask_big[y0:y1, x0:x1].astype(np.float32)]).astype(np.uint8)
cv2.imwrite(str(OUT / "tag.png"), tag_rgba)

# Fill under the tag with plain kraft, so a torn-off tag leaves paper behind.
clean = front_big[int(0.03 * bh):int(0.13 * bh), int(0.12 * bw):int(0.42 * bw)]
mean_col = np.median(clean.reshape(-1, 3), axis=0)
spk = np.random.default_rng(3).random((bh, bw)) > 0.9992
spk = cv2.GaussianBlur(spk.astype(np.float32), (0, 0), 3.0) * 16
patch = mean_col[None, None, :] * (1 + 0.02 * smooth_noise(bh, bw, 30, 4)[..., None]) * (1 - np.clip(spk, 0, 0.5)[..., None])
under = cv2.GaussianBlur(cv2.dilate(tag_mask * 255, np.ones((3, 3), np.uint8)), (0, 0), 1)
under = cv2.resize(under, (bw, bh), interpolation=cv2.INTER_CUBIC).astype(np.float32)[..., None] / 255
front_big = front_big * (1 - under) + patch * under
# soft contact shadow of the tag on the pack
tag_shadow = cv2.GaussianBlur(under[..., 0], (0, 0), 11)[..., None]
front_big = front_big * (1 - 0.3 * tag_shadow * (1 - under))


def finish_albedo(big, seed):
    f = fibres(bh, bw, seed)[..., None]
    return np.clip(big * (1 + 0.022 * f), 0, 255).astype(np.uint8)


cv2.imwrite(str(OUT / "front_albedo.jpg"), finish_albedo(front_big, 21), [cv2.IMWRITE_JPEG_QUALITY, 93])
cv2.imwrite(str(OUT / "back_albedo.jpg"), finish_albedo(back_big, 22), [cv2.IMWRITE_JPEG_QUALITY, 93])

# --- normal maps ---
for name, seed in (("front", 31), ("back", 32)):
    hgt = crease_height(bh, bw, seed)
    hgt += 0.55 * fibres(bh, bw, seed + 5)
    hgt += 1.6 * smooth_noise(bh, bw, 14, seed + 6)
    if name == "front":
        # the tag is a separate object: keep its footprint a little calmer
        hgt = hgt * (1 - 0.5 * under[..., 0])
    cv2.imwrite(str(OUT / f"{name}_normal.png"), normal_map(hgt, 1.45), [cv2.IMWRITE_PNG_COMPRESSION, 6])

# --- plain kraft tile for the gusset ---
tile = 1024
base = mean_col[None, None, :] * (1 + 0.03 * smooth_noise(tile, tile, 40, 8)[..., None])
base = base * (1 + 0.03 * fibres(tile, tile, 9)[..., None])
cv2.imwrite(str(OUT / "kraft_tile.jpg"), np.clip(base, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])

# --- silhouette, from the front mask, per row ---
ys = np.where((front_mask > 128).any(axis=1))[0]
y_top, y_bot = int(ys[0]), int(ys[-1])
rows = []
for y in range(y_top, y_bot + 1):
    xs = np.where(front_mask[y] > 128)[0]
    rows.append([int(y), int(xs[0]), int(xs[-1]) + 1])
yb = np.where((back_mask > 128).any(axis=1))[0]
xb = np.where((back_mask > 128).any(axis=0))[0]

layout = {
    "src_w": W,
    "src_h": H,
    "rows": rows,
    "front_indicator": [fx, fy, fr],
    "back_legend": [bx, by, br],
    "tag_bbox": [tx, ty, tw, th],
    "weight_box": list(WEIGHT_BOX),
    "tag_crop_px": [x0 / SCALE, y0 / SCALE, x1 / SCALE, y1 / SCALE],
    "back_bbox": [int(xb[0]), int(yb[0]), int(xb[-1]) + 1, int(yb[-1]) + 1],
}
(OUT / "layout.json").write_text(json.dumps(layout))
print("rows", len(rows), "y", y_top, y_bot, "back bbox", layout["back_bbox"])
