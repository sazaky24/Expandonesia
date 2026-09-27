"""
Generate the PWA icon set for frontend-react/public/icons/.

Pure Pillow, no external assets: a blue gradient tile with a white cloud and a
yellow sun — the same "weather map" mark the UI uses (lucide ``CloudSun``).

Run:  python frontend-react/scripts/generate_icons.py
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "public", "icons"))

SS = 1024  # everything is drawn supersampled, then downscaled with LANCZOS

BRAND_TOP = (37, 99, 235)  # tailwind blue-600
BRAND_BOTTOM = (29, 78, 216)  # tailwind blue-700
SUN = (253, 224, 71)  # tailwind yellow-300
WHITE = (255, 255, 255, 255)

# Geometry of the mark in units of the mark width, relative to its centre.
BASE_HALF = (0.42, 0.11)  # half width / half height of the cloud's base bar
PUFFS = ((-0.22, -0.10, 0.16), (0.02, -0.20, 0.22), (0.24, -0.09, 0.17))  # (cx, cy, r)
SUN_CX, SUN_CY, SUN_R = 0.33, -0.33, 0.18


def _gradient(size: int) -> Image.Image:
    """Vertical blue gradient (1px wide strip stretched to a square)."""
    strip = Image.new("RGB", (1, size))
    pixels = strip.load()
    for y in range(size):
        ratio = y / max(size - 1, 1)
        pixels[0, y] = tuple(round(a + (b - a) * ratio) for a, b in zip(BRAND_TOP, BRAND_BOTTOM))
    return strip.resize((size, size), Image.BILINEAR)


def _rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def _mark_offsets(mark_width: float) -> tuple[float, float]:
    """Top-left offset that centres the cloud+sun bounding box on the canvas."""
    xs = [-BASE_HALF[0]] + [p[0] - p[2] for p in PUFFS] + [SUN_CX - SUN_R]
    ys = [-BASE_HALF[1]] + [p[1] - p[2] for p in PUFFS] + [SUN_CY - SUN_R]
    x_hi = [BASE_HALF[0]] + [p[0] + p[2] for p in PUFFS] + [SUN_CX + SUN_R]
    y_hi = [BASE_HALF[1]] + [p[1] + p[2] for p in PUFFS] + [SUN_CY + SUN_R]
    left, right = min(xs) * mark_width, max(x_hi) * mark_width
    top, bottom = min(ys) * mark_width, max(y_hi) * mark_width
    return SS / 2 - (left + right) / 2, SS / 2 - (top + bottom) / 2


def _draw_mark(layer: Image.Image, mark_width: float) -> None:
    draw = ImageDraw.Draw(layer)
    ox, oy = _mark_offsets(mark_width)

    def circle(cx: float, cy: float, r: float) -> list[float]:
        x, y, rad = ox + cx * mark_width, oy + cy * mark_width, r * mark_width
        return [x - rad, y - rad, x + rad, y + rad]

    # Sun goes first so the cloud covers its lower half (cloud in front of sun).
    draw.ellipse(circle(SUN_CX, SUN_CY, SUN_R), fill=SUN)

    half_w, half_h = BASE_HALF[0] * mark_width, BASE_HALF[1] * mark_width
    draw.rounded_rectangle([ox - half_w, oy - half_h, ox + half_w, oy + half_h],
                           radius=min(half_w, half_h), fill=WHITE)
    for cx, cy, r in PUFFS:
        draw.ellipse(circle(cx, cy, r), fill=WHITE)


def _tile(rounded: bool, mark_ratio: float) -> Image.Image:
    tile = _gradient(SS).convert("RGBA")
    mark = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
    _draw_mark(mark, SS * mark_ratio)
    tile.alpha_composite(mark)
    if rounded:
        tile.putalpha(_rounded_mask(SS, round(SS * 0.22)))
    return tile


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    rounded = _tile(rounded=True, mark_ratio=0.66)
    maskable = _tile(rounded=False, mark_ratio=0.50)  # fits the maskable safe zone

    targets = (
        (rounded, 192, "icon-192.png"),
        (rounded, 512, "icon-512.png"),
        (rounded, 180, "apple-touch-icon-180.png"),
        (maskable, 512, "icon-512-maskable.png"),
    )
    for source, size, name in targets:
        path = os.path.join(OUT_DIR, name)
        source.resize((size, size), Image.LANCZOS).save(path, format="PNG", optimize=True)
        print(f"wrote {os.path.relpath(path)} ({size}x{size})")


if __name__ == "__main__":
    main()
