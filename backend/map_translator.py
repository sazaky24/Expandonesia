"""
Image processing logic for the weather map translator.

Erases Indonesian legend text on a precipitation analysis map (by drawing
white rectangles over known bounding boxes) and writes the translated
English text on top. Everything happens in memory — no disk I/O.
"""

from __future__ import annotations

import io
import logging
import os

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fonts
# ---------------------------------------------------------------------------
# Drop your custom fonts in backend/fonts/ (mounted or baked into the image)
# and they will be picked up automatically. Falls back to system arial /
# DejaVuSans / the PIL default bitmap font if nothing else is available.
FONT_DIR = os.path.join(os.path.dirname(__file__), "fonts")
LINUX_DEJAVU_DIR = "/usr/share/fonts/truetype/dejavu"
BOLD_CANDIDATES = [
    "custom-bold.ttf",
    "arialbd.ttf",
    "DejaVuSans-Bold.ttf",
    os.path.join(LINUX_DEJAVU_DIR, "DejaVuSans-Bold.ttf"),
    "arial.ttf",
    "DejaVuSans.ttf",
    os.path.join(LINUX_DEJAVU_DIR, "DejaVuSans.ttf"),
]
REGULAR_CANDIDATES = [
    "custom.ttf",
    "custom-regular.ttf",
    "arial.ttf",
    "DejaVuSans.ttf",
    os.path.join(LINUX_DEJAVU_DIR, "DejaVuSans.ttf"),
]

_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont | ImageFont.ImageFont] = {}


def _load_font(size: int, *, bold: bool = True) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Resolve the first available truetype font; fall back to PIL's default."""
    key = ("bold" if bold else "regular", size)
    if key in _font_cache:
        return _font_cache[key]

    candidates = BOLD_CANDIDATES if bold else REGULAR_CANDIDATES
    for name in candidates:
        for path in (os.path.join(FONT_DIR, name), name):  # bundled dir, then system name/absolute path
            try:
                font = ImageFont.truetype(path, size)
                _font_cache[key] = font
                return font
            except OSError:
                continue

    logger.warning("No truetype font found; using PIL default bitmap font.")
    font = ImageFont.load_default()
    _font_cache[key] = font
    return font


# ---------------------------------------------------------------------------
# Legend bounding boxes — CALIBRATED against sample_data/2025.01_CH_GSMAP_POS-1.webp
# (1280x912). Boxes are erase rectangles [x1, y1, x2, y2] sized to sit strictly
# BETWEEN the black table borders, so the grid lines are preserved.
# `anchor`  = (x, y) where the new text is drawn (left-aligned, vertically
#             centered on the old text's rows).
# `center_x`= if set, each title line is horizontally centered on this x.
# If you use a different map size, re-calibrate these numbers.
# ---------------------------------------------------------------------------
LEGEND_BOXES: dict[str, dict] = {
    # Title panel (3 lines, centered): PETA ANALISIS CURAH HUJAN / JANUARI 2025 / INDONESIA
    "title": {
        "erase": [78, 664, 440, 736],
        "center_x": 259,
        "top_y": 666,
        "line_spacing": 24,
        "font_size": 18,
        "bold": True,
        "dynamic_title": True,
    },
    # "CURAH HUJAN (mm) :" header
    "precip_header": {
        "erase": [500, 644, 699, 661],
        "text": "PRECIPITATION (mm) :",
        "anchor": (506, 652),
        "font_size": 16,
        "bold": True,
    },
    # "KETERANGAN :" header
    "legend_header": {
        "erase": [800, 644, 968, 661],
        "text": "LEGEND :",
        "anchor": (805, 652),
        "font_size": 16,
        "bold": True,
    },
    # "RENDAH"
    "low": {
        "erase": [595, 692, 690, 713],
        "text": "LOW",
        "anchor": (601, 702),
        "font_size": 16,
        "bold": True,
    },
    # "MENENGAH"
    "medium": {
        "erase": [594, 764, 696, 785],
        "text": "MEDIUM",
        "anchor": (600, 774),
        "font_size": 16,
        "bold": True,
    },
    # "TINGGI"
    "high": {
        "erase": [594, 824, 700, 847],
        "text": "HIGH",
        "anchor": (599, 835),
        "font_size": 16,
        "bold": True,
    },
    # "SANGAT TINGGI" (cell bounded by black lines at y=865 and y=893)
    "very_high": {
        "erase": [592, 868, 738, 892],
        "text": "VERY HIGH",
        "anchor": (601, 878),
        "font_size": 16,
        "bold": True,
    },
    # "Batas Propinsi" (vertical border line at x≈974 must be avoided)
    "province_border": {
        "erase": [838, 748, 970, 772],
        "text": "Province Border",
        "anchor": (843, 760),
        "font_size": 15,
        "bold": True,
    },
    # "Luar Negeri"
    "overseas": {
        "erase": [838, 791, 970, 814],
        "text": "Overseas",
        "anchor": (843, 803),
        "font_size": 15,
        "bold": True,
    },
}

# Sea labels INSIDE the map (LAUT JAWA, SAMUDERA HINDIA, ...) are intentionally
# left untouched, matching the reference translated sample.


def _erase_area(draw: ImageDraw.ImageDraw, box: list[int]) -> None:
    """Cover an old text area with a solid white rectangle (inside table borders)."""
    draw.rectangle(box, fill="white")


def _draw_at(
    draw: ImageDraw.ImageDraw,
    text: str,
    anchor_xy: tuple[int, int],
    font,
    fill: str = "black",
) -> None:
    """Draw text left-aligned at x, vertically centered on anchor_y."""
    x, y = anchor_xy
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    draw.text((x - left, y - (bottom - top) / 2 - top), text, fill=fill, font=font)


def remaster_map(image_bytes: bytes, month: str, year: str) -> bytes:
    """
    Translate the map legend to English and rewrite the title with the given
    month/year. The map area itself (incl. sea labels) is untouched.
    Returns the modified image as JPEG bytes.
    """
    img = Image.open(io.BytesIO(image_bytes))

    # JPEG has no alpha channel; flatten transparency onto white.
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        background = Image.new("RGBA", img.size, (255, 255, 255, 255))
        background.alpha_composite(img)
        img = background
    if img.mode != "RGB":
        img = img.convert("RGB")

    draw = ImageDraw.Draw(img)

    for spec in LEGEND_BOXES.values():
        _erase_area(draw, spec["erase"])

        bold = spec["bold"]
        size = spec["font_size"]
        font = _load_font(size, bold=bold)

        lines = (
            ["PRECIPITATION ANALYSIS MAP", f"{month.upper()} {year}", "INDONESIA"]
            if spec.get("dynamic_title")
            else [spec["text"]]
        )

        # Auto-shrink guard: never let (bigger/bolder) text collide with the
        # table borders — reduces the size until the widest line fits the box.
        erase_width = spec["erase"][2] - spec["erase"][0]
        while size > 9:
            widest = max(
                (lambda bb: bb[2] - bb[0])(draw.textbbox((0, 0), line, font=font))
                for line in lines
            )
            if widest <= erase_width - 4:
                break
            size -= 1
            font = _load_font(size, bold=bold)

        if spec.get("dynamic_title"):
            center_x = spec["center_x"]
            y = spec["top_y"]
            for line in lines:
                left, top, right, bottom = draw.textbbox((0, 0), line, font=font)
                draw.text((center_x - (right - left) / 2 - left, y - top), line, fill="black", font=font)
                y += spec["line_spacing"]
        else:
            _draw_at(draw, spec["text"], spec["anchor"], font)

    out_buf = io.BytesIO()
    img.save(out_buf, format="JPEG", quality=95)
    return out_buf.getvalue()
