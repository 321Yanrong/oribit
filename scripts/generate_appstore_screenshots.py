from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path


ROOT = Path("/Users/yanrong/Desktop/oribit")
SRC = ROOT / "screenshot2"
OUT = ROOT / "public" / "appstore" / "iphone67_zh"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1290, 2796

try:
    FONT_TITLE = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", 88)
    FONT_SUB = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", 44)
except Exception:
    FONT_TITLE = ImageFont.load_default()
    FONT_SUB = ImageFont.load_default()


def add_line_figure(draw: ImageDraw.ImageDraw, x: int, y: int, scale: float = 1.0, color=(47, 79, 79, 150)):
    r = int(24 * scale)
    draw.ellipse((x - r, y - r - int(85 * scale), x + r, y + r - int(85 * scale)), outline=color, width=max(2, int(3 * scale)))
    draw.line((x, y - int(55 * scale), x, y + int(35 * scale)), fill=color, width=max(2, int(3 * scale)))
    draw.line((x, y - int(20 * scale), x - int(40 * scale), y + int(8 * scale)), fill=color, width=max(2, int(3 * scale)))
    draw.line((x, y - int(20 * scale), x + int(40 * scale), y + int(8 * scale)), fill=color, width=max(2, int(3 * scale)))
    draw.line((x, y + int(35 * scale), x - int(30 * scale), y + int(88 * scale)), fill=color, width=max(2, int(3 * scale)))
    draw.line((x, y + int(35 * scale), x + int(30 * scale), y + int(88 * scale)), fill=color, width=max(2, int(3 * scale)))


def fit_source(src: Image.Image) -> Image.Image:
    src = src.convert("RGB")
    scale = max(960 / src.width, 1960 / src.height)
    resized = src.resize((int(src.width * scale), int(src.height * scale)), Image.Resampling.LANCZOS)
    x = (resized.width - 960) // 2
    y = (resized.height - 1960) // 2
    return resized.crop((x, y, x + 960, y + 1960))


def compose(source_name: str, title: str, subtitle: str, filename: str, zoom_circle=False):
    bg = Image.new("RGB", (W, H), "#f7f8fa")
    draw = ImageDraw.Draw(bg, "RGBA")

    # subtle line grid
    for y in range(280, H, 88):
        draw.line((64, y, W - 64, y), fill=(120, 140, 160, 24), width=1)
    for x in range(64, W, 88):
        draw.line((x, 220, x, H - 80), fill=(120, 140, 160, 20), width=1)

    # phone shadow
    shadow = Image.new("RGBA", (980, 1980), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(shadow)
    sh_draw.rounded_rectangle((0, 0, 980, 1980), radius=96, fill=(0, 0, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    bg.paste(shadow, (170, 560), shadow)

    # phone case/body
    body = Image.new("RGBA", (980, 1980), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(body, "RGBA")
    bdraw.rounded_rectangle((0, 0, 980, 1980), radius=98, fill=(236, 240, 245, 255), outline=(196, 205, 215, 255), width=6)
    bdraw.rounded_rectangle((25, 25, 955, 1955), radius=86, fill=(18, 20, 24, 255))
    bdraw.rounded_rectangle((400, 34, 580, 62), radius=14, fill=(40, 44, 50, 255))
    bg.paste(body, (155, 520), body)

    src = Image.open(SRC / source_name)
    screen = fit_source(src)
    bg.paste(screen, (165 + 10, 520 + 10))

    # zoom callout
    if zoom_circle:
        z = screen.crop((250, 520, 760, 1030)).resize((360, 360), Image.Resampling.LANCZOS)
        mask = Image.new("L", (360, 360), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.ellipse((0, 0, 359, 359), fill=255)
        ring = Image.new("RGBA", (372, 372), (0, 0, 0, 0))
        rdraw = ImageDraw.Draw(ring)
        rdraw.ellipse((0, 0, 371, 371), fill=(255, 255, 255, 230), outline=(76, 102, 120, 220), width=5)
        bg.paste(ring, (810, 1280), ring)
        bg.paste(z, (816, 1286), mask)
        draw.line((760, 1320, 920, 1450), fill=(76, 102, 120, 140), width=4)

    # line-art figures
    add_line_figure(draw, 130, 640, 1.2)
    add_line_figure(draw, 1170, 700, 0.95)
    add_line_figure(draw, 1080, 2360, 1.1)

    draw.text((88, 92), title, font=FONT_TITLE, fill=(23, 34, 45, 255))
    draw.text((92, 196), subtitle, font=FONT_SUB, fill=(67, 89, 106, 255))

    bg.save(OUT / filename, quality=95)


def main():
    compose("主页.jpg", "以记忆为先的社交", "把碎片化日常连接成共同轨迹", "01_memory_first.png", zoom_circle=True)
    compose("回忆页面.jpg", "一条记忆，完整记录当下", "图文视频与地点心情，留住每个细节", "02_memory_stream.png", zoom_circle=True)
    compose("地图.jpg", "共同回忆，一图可见", "按好友筛选，按城市聚合，回看一起走过的路", "03_friendship_map.png", zoom_circle=True)
    compose("添加好友.jpg", "双向确认好友，分享范围由你决定", "仅被你标记的人可见，不是公开社交", "04_friend_privacy.png", zoom_circle=False)
    compose("记账单.jpg", "回忆共享，账单分离", "回忆可一起看，金额仅自己可见", "05_ledger_privacy.png", zoom_circle=True)


if __name__ == "__main__":
    main()
