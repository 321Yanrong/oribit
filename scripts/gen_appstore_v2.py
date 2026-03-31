"""
Orbit App Store Screenshots v2
- Black phone frame with 3D perspective
- Line-art minimalist stick figures
- Zoom callouts on key UI details
- Black text on light backgrounds
- 1290 x 2796 (iPhone 6.7")
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
from pathlib import Path
import math

ROOT = Path("/Users/yanrong/Desktop/oribit")
SRC  = ROOT / "screenshot2"
OUT  = ROOT / "public" / "appstore" / "iphone67_zh_v2"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1290, 2796   # canvas
PW, PH = 820, 1740  # flat phone dimensions


# ── Fonts ─────────────────────────────────────────────────────────────────────
def _font(size, bold=False):
    paths = (
        ["/System/Library/Fonts/STHeiti Medium.ttc",
         "/System/Library/Fonts/Hiragino Sans GB.ttc"]
        if bold else
        ["/System/Library/Fonts/STHeiti Light.ttc",
         "/System/Library/Fonts/STHeiti Medium.ttc",
         "/System/Library/Fonts/Hiragino Sans GB.ttc"]
    )
    for path in paths:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()

FT_TITLE = _font(96,  bold=True)
FT_SUB   = _font(44,  bold=False)


# ── Perspective helpers ────────────────────────────────────────────────────────
def find_coeffs(src_quad, dst_quad):
    """
    Compute 8 perspective coefficients.
    src_quad: 4 output-canvas points (TL TR BR BL)
    dst_quad: corresponding 4 source-image points (TL TR BR BL)
    PIL inverse-maps: for each output pixel, coefficients give source pixel.
    """
    matrix, rhs = [], []
    for s, t in zip(src_quad, dst_quad):
        matrix.append([s[0], s[1], 1, 0, 0, 0, -t[0]*s[0], -t[0]*s[1]])
        rhs.append(t[0])
        matrix.append([0, 0, 0, s[0], s[1], 1, -t[1]*s[0], -t[1]*s[1]])
        rhs.append(t[1])
    A = np.array(matrix, dtype=np.float64)
    B = np.array(rhs,    dtype=np.float64)
    res = np.linalg.solve(A, B)
    return res.tolist()


def perspective_phone(phone_rgba, quad, canvas_wh=(W, H)):
    """Place phone_rgba (PW×PH RGBA) at quad on a canvas_wh canvas."""
    pw, ph = phone_rgba.size
    coeffs = find_coeffs(quad, [(0,0),(pw,0),(pw,ph),(0,ph)])
    canvas = Image.new("RGBA", canvas_wh, (0,0,0,0))
    canvas.paste(phone_rgba, (0,0))
    return canvas.transform(canvas_wh, Image.PERSPECTIVE, coeffs, Image.BICUBIC)


# ── Phone mockup builder ───────────────────────────────────────────────────────
def make_phone(screen_img, tint_blur=False):
    """
    Returns RGBA image (PW × PH) of a black-frame phone with screen_img inside.
    """
    phone = Image.new("RGBA", (PW, PH), (0,0,0,0))
    d = ImageDraw.Draw(phone)

    # Outer body — black
    FRAME_R = 80
    d.rounded_rectangle((0, 0, PW-1, PH-1), radius=FRAME_R,
                         fill=(16, 16, 18, 255))

    # Subtle edge highlight (thin lighter line on top/left)
    d.rounded_rectangle((0, 0, PW-1, PH-1), radius=FRAME_R,
                         outline=(72, 74, 80, 255), width=3)
    d.rounded_rectangle((2, 2, PW-3, PH-3), radius=FRAME_R-2,
                         outline=(48, 50, 54, 180), width=1)

    # Screen recess (dark inner lip)
    BEZEL = 18
    SCREEN_R = 64
    SX1, SY1 = BEZEL, BEZEL
    SX2, SY2 = PW - BEZEL, PH - BEZEL
    SW, SH = SX2 - SX1, SY2 - SY1

    d.rounded_rectangle((SX1-2, SY1-2, SX2+2, SY2+2), radius=SCREEN_R+2,
                         fill=(4, 4, 6, 255))

    # Screen content
    if screen_img is not None:
        sc = screen_img.convert("RGBA") if tint_blur else screen_img.convert("RGB")
        if tint_blur:
            sc = sc.filter(ImageFilter.GaussianBlur(12))
            overlay = Image.new("RGBA", sc.size, (0,0,0,60))
            sc = Image.alpha_composite(sc.convert("RGBA"), overlay)
            sc = sc.convert("RGB")
        scale = max(SW / sc.width, SH / sc.height)
        sc = sc.resize((int(sc.width * scale), int(sc.height * scale)), Image.LANCZOS)
        cx = (sc.width  - SW) // 2
        cy = (sc.height - SH) // 2
        sc = sc.crop((cx, cy, cx+SW, cy+SH))

        scr_mask = Image.new("L", (SW, SH), 0)
        ImageDraw.Draw(scr_mask).rounded_rectangle(
            (0, 0, SW-1, SH-1), radius=SCREEN_R, fill=255)
        phone.paste(sc, (SX1, SY1), scr_mask)

    # Punch-hole camera
    CAM_X, CAM_Y = PW//2, 46
    d.ellipse((CAM_X-18, CAM_Y-18, CAM_X+18, CAM_Y+18), fill=(6,6,8,255))
    d.ellipse((CAM_X-12, CAM_Y-12, CAM_X+12, CAM_Y+12), fill=(0,0,2,255))

    # Volume buttons (right side)
    for y0, y1 in [(320, 400), (430, 540)]:
        d.rounded_rectangle((PW-3, y0, PW+5, y1), radius=3,
                             fill=(38, 40, 44, 255))
    # Power button (left side)
    d.rounded_rectangle((-5, 400, 3, 520), radius=3, fill=(38, 40, 44, 255))

    # Screen glare: thin diagonal white strip
    glare = Image.new("RGBA", (PW, PH), (0,0,0,0))
    gd = ImageDraw.Draw(glare)
    gd.polygon([(SX1+40, SY1), (SX1+160, SY1), (SX1+80, SY1+220), (SX1-10, SY1+220)],
               fill=(255, 255, 255, 14))
    phone = Image.alpha_composite(phone, glare)

    return phone


# ── Drop shadow ────────────────────────────────────────────────────────────────
def phone_shadow(quad, blur=28, alpha=130):
    sh = Image.new("RGBA", (PW+60, PH+60), (0,0,0,0))
    ImageDraw.Draw(sh).rounded_rectangle(
        (30, 30, PW+30, PH+30), radius=84, fill=(0,0,0,alpha))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))

    # expand shadow slightly so it falls behind phone
    expanded_quad = [
        (quad[0][0]-18, quad[0][1]-18),
        (quad[1][0]+18, quad[1][1]-18),
        (quad[2][0]+18, quad[2][1]+18),
        (quad[3][0]-18, quad[3][1]+18),
    ]
    pw2, ph2 = sh.width, sh.height
    coeffs = find_coeffs(expanded_quad, [(0,0),(pw2,0),(pw2,ph2),(0,ph2)])
    canvas = Image.new("RGBA", (W,H), (0,0,0,0))
    canvas.paste(sh, (0,0))
    return canvas.transform((W,H), Image.PERSPECTIVE, coeffs, Image.BICUBIC)


# ── Background helpers ─────────────────────────────────────────────────────────
def make_bg(color, line_color, diagonal=False, spacing=84):
    bg = Image.new("RGB", (W, H), color)
    d  = ImageDraw.Draw(bg)
    if diagonal:
        for i in range(-H, W+H, spacing):
            d.line([(i, 0), (i+H, H)], fill=line_color, width=1)
    else:
        for y in range(260, H, spacing):
            d.line([(60, y), (W-60, y)], fill=line_color, width=1)
    return bg


# ── Line-art stick figure ──────────────────────────────────────────────────────
def figure(draw, cx, cy, scale=1.0, color=(22,22,24,170), lw=None):
    lw = lw or max(2, round(3.5 * scale))
    r  = round(24 * scale)
    # head
    draw.ellipse((cx-r, cy-r, cx+r, cy+r), outline=color, width=lw)
    # body
    by = cy + r
    ey = by + round(80*scale)
    draw.line([(cx, by), (cx, ey)], fill=color, width=lw)
    # arms
    ay = by + round(22*scale)
    draw.line([(cx, ay), (cx-round(44*scale), ay+round(34*scale))],
              fill=color, width=lw)
    draw.line([(cx, ay), (cx+round(44*scale), ay+round(34*scale))],
              fill=color, width=lw)
    # legs
    draw.line([(cx, ey), (cx-round(28*scale), ey+round(62*scale))],
              fill=color, width=lw)
    draw.line([(cx, ey), (cx+round(28*scale), ey+round(62*scale))],
              fill=color, width=lw)


def dashed_line(draw, p1, p2, color, lw=3, dash=18, gap=11):
    dx, dy = p2[0]-p1[0], p2[1]-p1[1]
    L = math.hypot(dx, dy)
    if L < 1: return
    ux, uy = dx/L, dy/L
    pos, on = 0.0, True
    while pos < L:
        end = min(pos + (dash if on else gap), L)
        if on:
            draw.line([(p1[0]+ux*pos, p1[1]+uy*pos),
                       (p1[0]+ux*end, p1[1]+uy*end)],
                      fill=color, width=lw)
        pos, on = end, not on


# ── Zoom callout ───────────────────────────────────────────────────────────────
def zoom_circle(base_img, src_crop, center, radius=210):
    """
    Paste a magnified circular crop onto base_img.
    src_crop: (x1,y1,x2,y2) from base_img
    center: (cx, cy) on canvas
    """
    region = base_img.crop(src_crop)
    size = radius * 2
    region = region.resize((size, size), Image.LANCZOS)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size-1, size-1), fill=255)

    # White ring
    ring_s = size + 24
    ring = Image.new("RGBA", (ring_s, ring_s), (0,0,0,0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse((0, 0, ring_s-1, ring_s-1), fill=(255,255,255,230))
    rd.ellipse((8, 8, ring_s-9, ring_s-9), fill=(0,0,0,0))
    rd.ellipse((8, 8, ring_s-9, ring_s-9), outline=(20,20,22,220), width=4)

    cx, cy = center
    out = base_img.copy().convert("RGBA")
    out.paste(ring, (cx - ring_s//2, cy - ring_s//2), ring)
    out.paste(region, (cx - radius, cy - radius), mask)
    return out


def connector(draw, p1, p2, color=(40,40,42,140)):
    dashed_line(draw, p1, p2, color, lw=3)
    # arrowhead at p2
    dx, dy = p2[0]-p1[0], p2[1]-p1[1]
    L = math.hypot(dx, dy)
    if L < 1: return
    ux, uy = dx/L, dy/L
    ax = p2[0] - ux*16 - uy*10
    ay = p2[1] - uy*16 + ux*10
    bx = p2[0] - ux*16 + uy*10
    by = p2[1] - uy*16 - ux*10
    draw.polygon([(p2[0], p2[1]), (ax, ay), (bx, by)],
                 fill=color)


def put_text(draw, lines, x, y, font, color=(18,18,20,255), lh=None):
    lh = lh or int(font.size * 1.22)
    for i, line in enumerate(lines):
        draw.text((x, y + i*lh), line, font=font, fill=color)


# ══════════════════════════════════════════════════════════════════════════════
# SHOT 1  ·  以记忆为先  ·  回忆页面.jpg
# ══════════════════════════════════════════════════════════════════════════════
def shot1():
    bg = make_bg("#F5F4F0", (118,115,108,26), diagonal=True, spacing=78)

    screen = Image.open(SRC / "回忆页面.jpg")
    phone  = make_phone(screen)

    # 3D quad: right-leaning (like reference image)
    quad = [(270, 310), (1110, 190), (1070, 2360), (160, 2530)]

    canvas = bg.convert("RGBA")
    canvas.paste(phone_shadow(quad), (0,0), phone_shadow(quad))
    p = perspective_phone(phone, quad)
    canvas.paste(p, (0,0), p)

    # Zoom callout: crop the @tag area from original screen
    # Tag region in original screen is roughly lower 30%
    sh = screen.height
    sw = screen.width
    crop_box = (0, int(sh*0.62), sw, int(sh*0.80))
    canvas = zoom_circle(canvas, crop_box, center=(1090, 1100), radius=190)

    d = ImageDraw.Draw(canvas, "RGBA")
    connector(d, (970, 1270), (1000, 1100+190))

    # Line-art figures
    figure(d, 95,  580, 1.25)
    figure(d, 1190, 2280, 1.0, color=(22,22,24,110))
    dashed_line(d, (145, 760), (620, 1260), (80,80,82,90), lw=2, dash=14, gap=9)

    # Text — black
    put_text(d, ["以记忆为先"], 82, 84,  FT_TITLE)
    put_text(d, ["把每个碎片，", "连成你们的共同轨迹"], 86, 196, FT_SUB, lh=62)

    canvas.convert("RGB").save(OUT / "01_memory_first.png")
    print("✓ 01")


# ══════════════════════════════════════════════════════════════════════════════
# SHOT 2  ·  记录此刻  ·  记录此刻弹窗.jpg
# ══════════════════════════════════════════════════════════════════════════════
def shot2():
    bg = make_bg("#F8F9FB", (112,116,125,24), diagonal=False, spacing=86)

    screen = Image.open(SRC / "记录此刻弹窗.jpg")
    phone  = make_phone(screen)

    # Upright with very slight right lean
    quad = [(180, 370), (1000, 310), (1010, 2480), (150, 2550)]

    canvas = bg.convert("RGBA")
    canvas.paste(phone_shadow(quad), (0,0), phone_shadow(quad))
    p = perspective_phone(phone, quad)
    canvas.paste(p, (0,0), p)

    # Zoom: weather + mood emoji row — roughly mid-screen
    sh, sw = screen.height, screen.width
    crop_box = (0, int(sh*0.38), sw, int(sh*0.56))
    canvas = zoom_circle(canvas, crop_box, center=(1090, 1360), radius=195)

    d = ImageDraw.Draw(canvas, "RGBA")
    connector(d, (960, 1200), (1090-195+20, 1360-30))

    # Line-art: one figure "writing"
    figure(d, 100, 680, 1.2)
    # Right arm extended toward phone (writing pose hint via extra line)
    d.line([(144, 780), (250, 820)], fill=(22,22,24,160), width=4)

    figure(d, 1195, 2260, 0.9, color=(22,22,24,100))

    put_text(d, ["一条记忆，完整记录当下"], 82, 84, FT_TITLE)
    put_text(d, ["地点 · 天气 · 心情 · 路线，", "一次都不落"], 86, 200, FT_SUB, lh=62)

    canvas.convert("RGB").save(OUT / "02_memory_record.png")
    print("✓ 02")


# ══════════════════════════════════════════════════════════════════════════════
# SHOT 3  ·  友情地图  ·  按地点.jpg
# ══════════════════════════════════════════════════════════════════════════════
def shot3():
    bg = make_bg("#EFF5F2", (100,122,112,28), diagonal=True, spacing=90)

    screen = Image.open(SRC / "按地点.jpg")
    phone  = make_phone(screen)

    # Strong right tilt (like reference photo)
    quad = [(200, 240), (1140, 380), (1090, 2460), (110, 2350)]

    canvas = bg.convert("RGBA")
    canvas.paste(phone_shadow(quad), (0,0), phone_shadow(quad))
    p = perspective_phone(phone, quad)
    canvas.paste(p, (0,0), p)

    # Zoom: one of the city avatar clusters (Shantou area, lower center)
    sh, sw = screen.height, screen.width
    crop_box = (int(sw*0.25), int(sh*0.55), int(sw*0.65), int(sh*0.72))
    canvas = zoom_circle(canvas, crop_box, center=(190, 1100), radius=200)

    d = ImageDraw.Draw(canvas, "RGBA")
    connector(d, (360, 1150), (580, 1600))

    # Walking figure moving toward phone
    figure(d, 96, 620, 1.2)
    d.line([(118, 730), (180, 760)], fill=(22,22,24,160), width=3)  # forward lean

    # Faint topo contour rings behind figure
    for r in [180, 280, 380]:
        d.ellipse((96-r, 700-r, 96+r, 700+r),
                  outline=(88, 115, 100, 20), width=1)

    figure(d, 1200, 2340, 0.9, color=(22,22,24,100))

    put_text(d, ["共同回忆，一图可见"], 82, 84, FT_TITLE)
    put_text(d, ["按好友筛选，", "一起走过的城市都在这里"], 86, 200, FT_SUB, lh=62)

    canvas.convert("RGB").save(OUT / "03_friendship_map.png")
    print("✓ 03")


# ══════════════════════════════════════════════════════════════════════════════
# SHOT 4  ·  好友系统  ·  添加好友.jpg (dialog) over 主页.jpg (bg)
# ══════════════════════════════════════════════════════════════════════════════
def shot4():
    bg = make_bg("#FAFAFA", (110,110,114,22), diagonal=False, spacing=90)

    # Composite: blurred main page + friend dialog centered
    base_screen = Image.open(SRC / "主页.jpg").convert("RGBA")
    # Blur background
    blurred = base_screen.filter(ImageFilter.GaussianBlur(14))
    dark_overlay = Image.new("RGBA", blurred.size, (0,0,0,80))
    composite_screen = Image.alpha_composite(blurred, dark_overlay)

    # Paste dialog in center of composite
    dialog = Image.open(SRC / "添加好友.jpg").convert("RGBA")
    scale  = (base_screen.width * 0.88) / dialog.width
    dw = int(dialog.width * scale)
    dh = int(dialog.height * scale)
    dialog = dialog.resize((dw, dh), Image.LANCZOS)
    dx = (base_screen.width - dw) // 2
    dy = int(base_screen.height * 0.18)
    composite_screen.paste(dialog, (dx, dy), dialog)

    phone = make_phone(composite_screen.convert("RGB"))

    # Gentle right lean, large on canvas — phone starts below subtitle
    quad = [(140, 380), (1050, 310), (1070, 2510), (90, 2600)]

    canvas = bg.convert("RGBA")
    canvas.paste(phone_shadow(quad), (0,0), phone_shadow(quad))
    p = perspective_phone(phone, quad)
    canvas.paste(p, (0,0), p)

    d = ImageDraw.Draw(canvas, "RGBA")

    # Two line-art figures connected by double-arrow (two-way confirmation)
    figure(d, 98,  640, 1.15)
    figure(d, 1192, 660, 1.1, color=(22,22,24,160))
    # Double-headed dashed arrow between them
    MID_Y = 780
    dashed_line(d, (155, MID_Y), (1140, MID_Y), (22,22,24,130), lw=3)
    # Arrow tips
    d.polygon([(155, MID_Y), (185, MID_Y-12), (185, MID_Y+12)],
              fill=(22,22,24,130))
    d.polygon([(1140, MID_Y), (1110, MID_Y-12), (1110, MID_Y+12)],
              fill=(22,22,24,130))

    # Small annotation — "临时好友" callout
    d.text((68, 1590), "未注册先占位", font=_font(34), fill=(40,40,42,200))
    d.text((68, 1640), "注册后自动绑定", font=_font(34), fill=(40,40,42,200))
    dashed_line(d, (315, 1610), (450, 1530), (40,40,42,140), lw=2, dash=10, gap=7)

    put_text(d, ["分享范围，完全由你决定"], 82, 84, FT_TITLE)
    put_text(d, ["双向确认加好友，", "仅被你标记的人才能看到"], 86, 200, FT_SUB, lh=62)

    canvas.convert("RGB").save(OUT / "04_friend_privacy.png")
    print("✓ 04")


# ══════════════════════════════════════════════════════════════════════════════
# SHOT 5  ·  账单隐私  ·  记账单.jpg
# ══════════════════════════════════════════════════════════════════════════════
def shot5():
    bg = make_bg("#FBF8F3", (128,118,100,26), diagonal=False, spacing=80)

    screen = Image.open(SRC / "记账单.jpg")
    phone  = make_phone(screen)

    # Centered, gentle right lean — phone starts below subtitle
    quad = [(210, 380), (1080, 320), (1070, 2430), (160, 2510)]

    canvas = bg.convert("RGBA")
    canvas.paste(phone_shadow(quad), (0,0), phone_shadow(quad))
    p = perspective_phone(phone, quad)
    canvas.paste(p, (0,0), p)

    # Zoom callout: blurred amount region in the top of ledger (the blurred bg)
    sh, sw = screen.height, screen.width
    crop_box = (0, 0, sw, int(sh*0.18))
    canvas = zoom_circle(canvas, crop_box, center=(180, 1220), radius=190)

    d = ImageDraw.Draw(canvas, "RGBA")
    connector(d, (350, 1280), (580, 1580))

    # Lock icon (line-art) near zoom circle
    LX, LY = 180, 980
    d.rectangle((LX-28, LY, LX+28, LY+38), outline=(22,22,24,210), width=4)
    d.arc((LX-20, LY-32, LX+20, LY+4), start=0, end=180,
           fill=None)
    d.arc((LX-20, LY-32, LX+20, LY+4), start=0, end=180,
           fill=(22,22,24,0))
    # draw arc outline manually
    for angle in range(0, 181, 6):
        rad = math.radians(angle)
        ax = LX + 20 * math.cos(math.pi - rad)
        ay = LY - 14 + 18 * math.sin(math.pi - rad)
        d.ellipse((ax-3, ay-3, ax+3, ay+3), fill=(22,22,24,200))

    # Two figures: left figure "holding ledger", right looking at phone
    figure(d, 98, 700, 1.2)
    # ledger rect held by left figure
    d.rectangle((60, 820, 135, 890), outline=(22,22,24,180), width=3)
    d.line([(70, 840), (125, 840)], fill=(22,22,24,100), width=2)
    d.line([(70, 855), (125, 855)], fill=(22,22,24,100), width=2)
    d.line([(70, 870), (105, 870)], fill=(22,22,24,100), width=2)

    figure(d, 1192, 2280, 0.95, color=(22,22,24,110))

    # Dashed line with lock break between figures
    dashed_line(d, (150, 790), (560, 790), (22,22,24,90), lw=2, dash=12, gap=8)
    # small lock symbol on line
    d.rectangle((548, 776, 572, 806), outline=(22,22,24,200), width=3)

    put_text(d, ["回忆共享，账单只有自己看"], 82, 84, FT_TITLE)
    put_text(d, ["和朋友一起记，", "金额永远是你的秘密"], 86, 200, FT_SUB, lh=62)

    canvas.convert("RGB").save(OUT / "05_ledger_privacy.png")
    print("✓ 05")


if __name__ == "__main__":
    print("Generating App Store screenshots v2 …")
    shot1()
    shot2()
    shot3()
    shot4()
    shot5()
    print("Done →", OUT)
