#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image
except Exception as exc:  # pragma: no cover - runtime guard
    print("error: Pillow is required to generate icons (python3 -m pip install pillow)", file=sys.stderr)
    raise SystemExit(1) from exc


PNG_SIZES = [16, 32, 64, 128, 256, 512, 1024]
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
TRAY_SPECS = [
    ("trayTemplate.png", 16),
    ("trayTemplate@2x.png", 32),
]
ICONSET_SPECS = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]


def parse_args() -> argparse.Namespace:
    argv = sys.argv[1:]
    if argv and argv[0] == "--":
        argv = argv[1:]

    parser = argparse.ArgumentParser(description="Generate Electron app icons from a source image.")
    parser.add_argument(
        "source",
        nargs="?",
        default="build/logo-source.png",
        help="Source PNG/SVG path (defaults to build/logo-source.png relative to apps/desktop)",
    )
    parser.add_argument(
        "--output",
        default="build/icons",
        help="Output directory relative to apps/desktop (default: build/icons)",
    )
    return parser.parse_args(argv)


def ensure_rgba_square(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    if width == height:
        return rgba

    edge = max(width, height)
    square = Image.new("RGBA", (edge, edge), (0, 0, 0, 0))
    square.paste(rgba, ((edge - width) // 2, (edge - height) // 2))
    return square


def write_png_variants(image: Image.Image, output_dir: Path) -> None:
    png_dir = output_dir / "png"
    png_dir.mkdir(parents=True, exist_ok=True)

    for size in PNG_SIZES:
        resized = image.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(png_dir / f"icon-{size}.png")

    image.save(output_dir / "icon.png")


def write_ico(image: Image.Image, output_dir: Path) -> None:
    icon_path = output_dir / "icon.ico"
    image.save(icon_path, format="ICO", sizes=[(size, size) for size in ICO_SIZES])


def write_tray_templates(image: Image.Image, output_dir: Path) -> None:
    alpha = image.getchannel("A")

    for filename, size in TRAY_SPECS:
        tray_icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        resized_alpha = alpha.resize((size, size), Image.Resampling.LANCZOS)
        tray_icon.putalpha(resized_alpha)
        tray_icon.save(output_dir / filename)


def write_icns(image: Image.Image, output_dir: Path) -> None:
    iconset_dir = output_dir / "icon.iconset"
    if iconset_dir.exists():
        shutil.rmtree(iconset_dir)
    iconset_dir.mkdir(parents=True, exist_ok=True)

    for filename, size in ICONSET_SPECS:
        resized = image.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(iconset_dir / filename)

    iconutil = shutil.which("iconutil")
    if not iconutil:
        print("warning: iconutil not found; skipped icon.icns generation", file=sys.stderr)
        return

    subprocess.run(
        [iconutil, "-c", "icns", str(iconset_dir), "-o", str(output_dir / "icon.icns")],
        check=True,
    )


def main() -> int:
    args = parse_args()
    desktop_root = Path(__file__).resolve().parent.parent
    source_path = Path(args.source)
    if not source_path.is_absolute():
        source_path = (desktop_root / source_path).resolve()

    if not source_path.exists():
        print(f"error: source image not found: {source_path}", file=sys.stderr)
        return 1

    output_dir = Path(args.output)
    if not output_dir.is_absolute():
        output_dir = (desktop_root / output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(source_path) as opened:
        image = ensure_rgba_square(opened)

    source_copy = output_dir / "source.png"
    image.save(source_copy)

    write_png_variants(image, output_dir)
    write_ico(image, output_dir)
    write_tray_templates(image, output_dir)
    write_icns(image, output_dir)

    print(f"Generated Electron icons in: {output_dir}")
    print(f"  - source.png")
    print(f"  - icon.png")
    print(f"  - icon.ico")
    print(f"  - icon.icns")
    print(f"  - trayTemplate.png")
    print(f"  - trayTemplate@2x.png")
    print(f"  - png/icon-{{16,32,64,128,256,512,1024}}.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
