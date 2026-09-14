"""Generate packaging/icon.ico (tennis-ball mark on clay) with Pillow. Run before PyInstaller."""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).parent / "icon.ico"


def render(size: int) -> Image.Image:
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = s * 0.06
    d.rounded_rectangle((pad, pad, s - pad, s - pad), radius=s * 0.22, fill=(158, 59, 38, 255))
    r = s * 0.30
    cx = cy = s / 2
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(246, 247, 245, 255))
    w = max(1, int(s * 0.05))
    d.arc(
        (cx - r * 0.55, cy - r * 1.9, cx + r * 1.4, cy + r * 0.9),
        95,
        215,
        fill=(158, 59, 38, 255),
        width=w,
    )
    d.arc(
        (cx - r * 1.4, cy - r * 0.9, cx + r * 0.55, cy + r * 1.9),
        275,
        35,
        fill=(158, 59, 38, 255),
        width=w,
    )
    return img


if __name__ == "__main__":
    sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [render(z) for z in sizes]
    frames[-1].save(OUT, format="ICO", sizes=[(z, z) for z in sizes], append_images=frames[:-1])
    print(f"wrote {OUT}")
