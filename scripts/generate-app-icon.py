#!/usr/bin/env python3
"""Generate checkism launcher / web icons from one vector-like master."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / "app" / "android" / "app" / "src" / "main" / "res"
ASSETS = ROOT / "app" / "assets" / "brand"
WEB = ROOT / "app" / "web"

CREAM = (255, 248, 243, 255)
RED = (199, 0, 11, 255)
DEEP = (142, 0, 7, 255)
WHITE = (255, 255, 255, 255)
TEAL = (15, 139, 141, 255)


def rounded_square(size: int, radius: int, fill, inset: int = 0) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (inset, inset, size - 1 - inset, size - 1 - inset),
        radius=radius,
        fill=fill,
    )
    return image


def draw_mark(image: Image.Image, scale: int = 1, offset: int = 0) -> None:
    """White check mark, coordinates tuned for a 1024 canvas."""
    draw = ImageDraw.Draw(image)
    points = [
        (300 + offset, 540 + offset),
        (455 + offset, 690 + offset),
        (735 + offset, 350 + offset),
    ]
    width = max(12, int(86 * scale))
    draw.line(points, fill=WHITE, width=width, joint="curve")
    radius = width // 2
    for x, y in points:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=WHITE)


def build_master() -> Image.Image:
    size = 1024
    canvas = Image.new("RGBA", (size, size), CREAM)
    # subtle inner warm border
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((18, 18, size - 18, size - 18), radius=220, outline=(255, 255, 255, 170), width=3)
    # soft red shadow
    shadow = rounded_square(size, 190, (142, 0, 7, 90), inset=178)
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    canvas.alpha_composite(shadow, (0, 14))
    # red tile
    tile = rounded_square(size, 190, RED, inset=160)
    canvas.alpha_composite(tile)
    # gloss
    gloss = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gloss)
    gd.rounded_rectangle((210, 205, 814, 420), radius=120, fill=(255, 255, 255, 22))
    canvas.alpha_composite(gloss)
    draw_mark(canvas)
    # small teal "freshness" dot
    draw.ellipse((760, 760, 820, 820), fill=TEAL)
    return canvas


def build_foreground() -> Image.Image:
    size = 1024
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tile = rounded_square(size, 190, RED, inset=230)
    canvas.alpha_composite(tile)
    # check is drawn in a tighter safe zone
    draw = ImageDraw.Draw(canvas)
    points = [(350, 545), (475, 670), (690, 400)]
    draw.line(points, fill=WHITE, width=70, joint="curve")
    for x, y in points:
        draw.ellipse((x - 35, y - 35, x + 35, y + 35), fill=WHITE)
    return canvas


def build_round() -> Image.Image:
    size = 1024
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((0, 0, size - 1, size - 1), fill=CREAM)
    tile = rounded_square(size, 180, RED, inset=190)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    canvas.alpha_composite(Image.composite(tile, Image.new("RGBA", (size, size), (0, 0, 0, 0)), mask))
    draw_mark(canvas, scale=0.9)
    return canvas


def export() -> None:
    ANDROID.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    legacy = build_master()
    foreground = build_foreground()
    round_icon = build_round()
    legacy.save(ASSETS / "icon-master.png")
    foreground.save(ASSETS / "icon-foreground.png")
    round_icon.save(ASSETS / "icon-round.png")

    for density, size in {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }.items():
        folder = ANDROID / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        legacy.resize((size, size), Image.Resampling.LANCZOS).save(folder / "ic_launcher.png")
        round_icon.resize((size, size), Image.Resampling.LANCZOS).save(folder / "ic_launcher_round.png")

    drawable = ANDROID / "drawable-nodpi"
    drawable.mkdir(parents=True, exist_ok=True)
    foreground.resize((432, 432), Image.Resampling.LANCZOS).save(drawable / "ic_launcher_foreground.png")

    anydpi = ANDROID / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    xml = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
"""
    (anydpi / "ic_launcher.xml").write_text(xml, encoding="utf-8")
    (anydpi / "ic_launcher_round.xml").write_text(xml, encoding="utf-8")

    values = ANDROID / "values"
    values.mkdir(parents=True, exist_ok=True)
    colors = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFF8F3</color>
</resources>
"""
    (values / "colors.xml").write_text(colors, encoding="utf-8")

    legacy.resize((512, 512), Image.Resampling.LANCZOS).save(WEB / "icon-512.png")
    legacy.resize((192, 192), Image.Resampling.LANCZOS).save(WEB / "icon-192.png")
    legacy.resize((64, 64), Image.Resampling.LANCZOS).save(WEB / "favicon.png")
    print("generated icons")


if __name__ == "__main__":
    export()
