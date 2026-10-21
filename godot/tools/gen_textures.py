#!/usr/bin/env python3
"""Generates the game's small tileable data textures into godot/art/.

Run from the repo root:  python3 godot/tools/gen_textures.py
Needs numpy and Pillow. The PNGs are committed, so this only runs when a
texture recipe changes.

  water_normal.png  ripple normal map from integer-frequency sine waves
                    (RG = slope, B = height), perfectly tileable
  noise.png         R soft large fbm, G medium fbm, B Worley cells, A fine fbm
  caustics.png      R caustic web, G and B its two layers
  foam.png          R equalised foam web, G fray fbm, B second web, A soft fbm
"""
import os
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art')


def save(name, rgba):
    img = Image.fromarray(np.clip(np.round(rgba * 255), 0, 255).astype(np.uint8), 'RGBA')
    img.save(os.path.join(OUT, name), optimize=True)
    print('wrote', name, rgba.shape)


def water_normal(size=256, seed=7):
    rng = np.random.default_rng(seed)
    comps = []
    while len(comps) < 48:
        r = 3 + int((rng.random() ** 1.6) * 26)
        ang = rng.random() * np.pi * 2
        kx, ky = int(round(np.cos(ang) * r)), int(round(np.sin(ang) * r))
        if kx == 0 and ky == 0:
            continue
        ln = np.hypot(kx, ky)
        comps.append((kx, ky, 1.0 / ln ** 1.15, rng.random() * np.pi * 2))
    v, u = np.mgrid[0:size, 0:size] / size
    h = np.zeros((size, size))
    dx = np.zeros((size, size))
    dy = np.zeros((size, size))
    for kx, ky, a, p in comps:
        th = 2 * np.pi * (kx * u + ky * v) + p
        h += a * np.sin(th)
        c = a * np.cos(th)
        dx += c * kx
        dy += c * ky
    sx, sy = dx * 0.055, dy * 0.055
    inv = 1 / np.sqrt(sx * sx + sy * sy + 1)
    out = np.zeros((size, size, 4))
    out[..., 0] = -sx * inv * 0.5 + 0.5
    out[..., 1] = -sy * inv * 0.5 + 0.5
    out[..., 2] = np.clip(h * 0.18 + 0.5, 0, 1)
    out[..., 3] = 1
    return out


def value_noise(size, cells, rng):
    lat = rng.random((cells, cells))
    f = np.arange(size) / size * cells
    i0 = np.floor(f).astype(int)
    t = f - i0
    q = t * t * t * (t * (t * 6 - 15) + 10)
    a0 = i0 % cells
    a1 = (i0 + 1) % cells
    ty, tx = np.meshgrid(q, q, indexing='ij')
    ya, xa = np.meshgrid(a0, a0, indexing='ij')
    yb, xb = np.meshgrid(a1, a1, indexing='ij')
    a, b, c, d = lat[ya, xa], lat[ya, xb], lat[yb, xa], lat[yb, xb]
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty


def fbm(size, base, octaves, rng):
    out = np.zeros((size, size))
    amp, cells, norm = 0.5, base, 0.0
    for _ in range(octaves):
        out += value_noise(size, cells, rng) * amp
        norm += amp
        amp *= 0.5
        cells *= 2
    return out / norm


def worley(size, cells, rng, weights=None, warp=None):
    """Periodic Worley: F1, F2 (optionally weighted sites and a warp of the lookup)."""
    pts = rng.random((cells, cells, 2))
    w = weights if weights is not None else np.ones((cells, cells))
    v, u = np.mgrid[0:size, 0:size] / size
    if warp is not None:
        u = u + warp[0]
        v = v + warp[1]
    fx, fy = u * cells, v * cells
    cx, cy = np.floor(fx).astype(int), np.floor(fy).astype(int)
    d1 = np.full((size, size), 9.0)
    d2 = np.full((size, size), 9.0)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            gx, gy = cx + ox, cy + oy
            wx, wy = gx % cells, gy % cells
            px = gx + pts[wy, wx, 0]
            py = gy + pts[wy, wx, 1]
            d = np.hypot(px - fx, py - fy) * w[wy, wx]
            nd2 = np.where(d < d1, d1, np.minimum(d2, d))
            d1 = np.minimum(d1, d)
            d2 = nd2
    return d1, d2


def noise(size=256, seed=11):
    rng = np.random.default_rng(seed)
    r = fbm(size, 4, 5, rng)
    g = fbm(size, 8, 4, rng)
    f1, _ = worley(size, 14, rng)
    a = fbm(size, 32, 2, rng)
    return np.stack([r, g, np.minimum(1, f1 * 1.25), a], -1)


def caustics(size=256, seed=23):
    rng = np.random.default_rng(seed)
    a1, a2 = worley(size, 7, rng)
    b1, b2 = worley(size, 11, rng)
    l1 = np.maximum(0, 1 - (a2 - a1) / 0.22) ** 3.2
    l2 = np.maximum(0, 1 - (b2 - b1) / 0.2) ** 3.0
    v = np.minimum(1, l1 * 0.85 + l2 * 0.5)
    return np.stack([v, l1, l2, np.ones_like(v)], -1)


def equalise(f):
    order = np.argsort(f, axis=None, kind='stable')
    out = np.empty(f.size)
    out[order] = np.arange(f.size) / (f.size - 1)
    return out.reshape(f.shape)


def foam(size=384, seed=31):
    rng = np.random.default_rng(seed)
    warp_x = fbm(size, 4, 3, rng)
    warp_y = fbm(size, 4, 3, rng)
    patch = fbm(size, 3, 4, rng)
    fray = fbm(size, 12, 3, rng)
    soft = fbm(size, 4, 4, rng)
    wx = (warp_x - 0.5) * 1.6
    wy = (warp_y - 0.5) * 1.6

    def web(cells, spread, warp, width):
        wts = 1 / (1 - spread + rng.random((cells, cells)) * spread * 2)
        d1, d2 = worley(size, cells, rng, wts, (warp[0] / cells, warp[1] / cells))
        return np.minimum(1, (d2 - d1) / width)

    h_a = web(7, 0.45, (wx, wy), 0.55)
    h_b = web(17, 0.4, (-wy, wx), 0.5)
    h_c = web(38, 0.35, (wy * 0.6, -wx * 0.6), 0.45)
    opened = np.maximum(np.maximum(h_a * h_a * (0.75 + 0.5 * patch), h_b * (0.8 + 0.3 * fray) * 0.9), h_c * 0.72)
    web_a = 1 - opened + (patch - 0.5) * 0.55 + (fray - 0.5) * 0.25
    web_b = 1 - np.maximum(h_b * h_b, h_c * 0.6) + (soft - 0.5) * 0.5
    return np.stack([equalise(web_a), fray, equalise(web_b), soft], -1)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    save('water_normal.png', water_normal())
    save('noise.png', noise())
    save('caustics.png', caustics())
    save('foam.png', foam())
