"""
Orbit App Store Screenshots v3
- Black phone frame with 3D perspective
- Line-art minimalist stick figures
- NO zoom callouts — clean layout
- Light-gray gradient background (top #E8E8EA → bottom #F8F8F9)
- Phone positioned lower on canvas
- Black text on light background
- 1290 x 2796 (iPhone 6.7")
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
from pathlib import Path
import math

ROOT = Path("/Users/yanrong/Desktop/oribit")
SRC  = ROOT / "screenshot2"
OUT  = ROOT / "public" / "appstore" / "iphone67_zh_v3"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1284, 2778   # canvas — App Store 1284×2778 (iPhone 6.7" Pro Max)
PW, PH = 820, 1740  # flat phone dimensions


# ── Fonts ─────────────────────────────────────────────────────────────────────
def _font(size, bold=False):
    paths = (
        ["/System/Library/Fonts/STHeiti Medium.ttc",
         "/System/Library/Fonts/Hiragino Sans GB.ttc"]
        if bold else
        ["/System/Library/Fonts/STHeiti Light.ttc",
         "/System/Library/Fonts/STHeiti Medium.ttc"]
    )
    for path in paths:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()

FT_TITLE = _font(96, bold=True)
FT_SUB   = _font(44, bold=False)


# ── Gradient background ────────────────────────────────────────────────────────
def make_gradient_bg():
    """Top #E8E8EA → bottom #F8F8F9 (light gray gradient)."""
    top    = (232, 232, 234)   # #E8E8EA
    bottom = (248, 248, 249)   # #F8F8F9
    bg = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(bg)
    for y in range(H):
        t = y / (H - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))
    return bg


# ── Perspective helpers ────────────────────────────────────────────────────────
def find_coeffs(src_quad, dst_quad):
    matrix, rhs = [], []
    for s, t in zip(src_quad, dst_quad):
        matrix.append([s[0], s[1], 1, 0, 0, 0, -t[0]*s[0], -t[0]*s[1]])
        rhs.append(t[0])
        matrix.append([0, 0, 0, s[0], s[1], 1, -t[1]*s[0], -t[1]*s[1]])
        rhs.append(t[1])
    A = np.array(matrix, dtype=np.float64)
    B = np.array(rhs,    dtype=np.float64)
    return np.linalg.solve(A, B).tolist()


def perspective_phone(phone_rgba, quad, canvas_wh=(W, H)):
    pw, ph = phone_rgba.size
    coeffs = find_coeffs(quad, [(0,0),(pw,0),(pw,ph),(0,ph)])
    canvas = Image.new("RGBA", canvas_wh, (0,0,0,0))
    canvas.paste(phone_rgba, (0,0))
    return canvas.transform(canvas_wh, Image.PERSPECTIVE, coeffs, Image.BICUBIC)


# ── Phone mockup builder ───────────────────────────────────────────────────────
def make_phone(screen_img, tint_blur=False):
    phone = Image.new("RGBA", (PW, PH), (0,0,0,0))
    d = ImageDraw.Draw(phone)

    FRAME_R = 80
    d.rounded_rectangle((0, 0, PW-1, PH-1), radius=FRAME_R,
                         fill=(16, 16, 18, 255))
    d.rounded_rectangle((0, 0, PW-1, PH-1), radius=FRAME_R,
                         outline=(72, 74, 80, 255), width=3)
    d.rounded_rectangle((2, 2, PW-3, PH-3), radius=FRAME_R-2,
                         outline=(48, 50, 54, 180), width=1)

    BEZEL = 18
    SCREEN_R = 64
    SX1, SY1 = BEZEL, BEZEL
    SX2, SY2 = PW - BEZEL, PH - BEZEL
    SW, SH = SX2 - SX1, SY2 - SY1

    d.rounded_rectangle((SX1-2, SY1-2, SX2+2, SY2+2), radius=SCREEN_R+2,
                         fill=(4, 4, 6, 255))

    if screen_img is not None:
        sc = screen_img.convert("RGBA") if tint_blur else screen_img.convert("RGB")
        if tint_blur:
            sc = sc.filter(ImageFilter.GaussianBlur(12))
            overlay = Image.new("RGBA", sc.size, (0,0,0,60))
            sc = Image.alpha_composite(sc.convert("RGBA"), overlay).convert("RGB")
        scale = max(SW / sc.width, SH / sc.height)
        sc = sc.resize((int(sc.width * scale), int(sc.height * scale)), Image.LANCZOS)
        cx = (sc.width  - SW) // 2
        cy = (sc.height - SH) // 2
        sc = sc.crop((cx, cy, cx+SW, cy+SH))

        scr_mask = Image.new("L", (SW, SH), 0)
        ImageDraw.Draw(scr_mask).rounded_rectangle(
            (0, 0, SW-1, SH-1), radius=SCREEN_R, fill=255)
        phone.paste(sc, (SX1, SY1), scr_mask)

    CAM_X, CAM_Y = PW//2, 46
    d.ellipse((CAM_X-18, CAM_Y-18, CAM_X+18, CAM_Y+18), fill=(6,6,8,255))
    d.ellipse((CAM_X-12, CAM_Y-12, CAM_X+12, CAM_Y+12), fill=(0,0,2,255))

    for y0, y1 in [(320, 400), (430, 540)]:
        d.rounded_rectangle((PW-3, y0, PW+5, y1), radius=3, fill=(38,40,44,255))
    d.rounded_rectangle((-5, 400, 3, 520), radius=3, fill=(38,40,44,255))

    glare = Image.new("RGBA", (PW, PH), (0,0,0,0))
    gd = ImageDraw.Draw(glare)
    gd.polygon([(SX1+40, SY1), (SX1+160, SY1), (SX1+80, SY1+220), (SX1-10, SY1+220)],
               fill=(255,255,255,14))
    phone = Image.alpha_composite(phone, glare)

    return phone


# ── Drop shadow ────────────────────────────────────────────────────────────────
def phone_shadow(quad, blur=28, alpha=110):
    sh = Image.new("RGBA", (PW+60, PH+60), (0,0,0,0))
    ImageDraw.Draw(sh).rounded_rectangle(
        (30, 30, PW+30, PH+30), radius=84, fill=(0,0,0,alpha))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))

    expanded = [
        (quad[0][0]-18, quad[0][1]-18),
        (quad[1][0]+18, quad[1][1]-18),
        (quad[2][0]+18, quad[2][1]+18),
        (quad[3][0]-18, quad[3][1]+18),
    ]
    pw2, ph2 = sh.width, sh.height
    coeffs = find_coeffs(expanded, [(0,0),(pw2,0),(pw2,ph2),(0,ph2)])
    canvas = Image.new("RGBA", (W,H), (0,0,0,0))
    canvas.paste(sh, (0,0))
    return canvas.transform((W,H), Image.PERSPECTIVE, coeffs, Image.BICUBIC)


# ── Stick figure ───────────────────────────────────────────────────────────────
def figure(draw, cx, cy, scale=1.0, color=(22,22,24,150), lw=None):
    lw = lw or max(2, round(3.5 * scale))
    r  = round(24 * scale)
    draw.ellipse((cx-r, cy-r, cx+r, cy+r), outline=color, width=lw)
    by = cy + r
    ey = by + round(80*scale)
    draw.line([(cx, by), (cx, ey)], fill=color, width=lw)
    ay = by + round(22*scale)
    draw.line([(cx, ay), (cx-round(44*scale), ay+round(34*scale))], fill=color, width=lw)
    draw.line([(cx, ay), (cx+round(44*scale), ay+round(34*scale))], fill=color, width=lw)
    draw.line([(cx, ey), (cx-round(28*scale), ey+round(62*scale))], fill=color, width=lw)
    draw.line([(cx, ey), (cx+round(28*scale), ey+round(62*scale))], fill=color, width=lw)


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


def put_text(draw, lines, x, y, font, color=(18,18,20,255), lh=None):
    lh = lh or int(font.size * 1.22)
    for i, line in enumerate(lines):
        draw.text((x, y + i*lh), line, font=font, fill=color)


# ── Composite helper for shot 4 ────────────────────────────────────────────────
def composite_with_dialog(base_path, dialog_path, dialog_y_frac=0.18):
    base   = Image.open(base_path).convert("RGBA")
    blurred = base.filter(ImageFilter.GaussianBlur(14))
    dark   = Image.new("RGBA", blurred.size, (0,0,0,80))
    comp   = Image.alpha_composite(blurred, dark)

    dialog = Image.open(dialog_path).convert("RGBA")
    scale  = (base.width * 0.88) / dialog.width
    dw, dh = int(dialog.width * scale), int(dialog.height * scale)
    dialog = dialog.resize((dw, dh), Image.LANCZOS)
    dx = (base.width - dw) // 2
    dy = int(base.height * dialog_y_frac)
    comp.paste(dialog, (dx, dy), dialog)
    return comp.convert("RGB")


# ══════════════════════════════════════════════════════════════════════════════
# SHOT 1  ·  以记忆为先  ·  回忆页面.jpg
# Phone quad: right-leaning, shifted down +120 vs v2
# ══════════════════════════════════════════════════════════════════════════════
def shot1():
    canvas = make_gradient_bg().convert("RGBA")
    screen = Image.open(SRC / "回忆页面.jpg")
    phone  = make_phone(screen)

    quad = [(270, 430), (1110, 310), (1070, 2480), (160, 2650)]

    canvas.paste(phone_shadow(quad), (0,0), phone_shadow(quad))
    p = perspective_phone(phone, quad)
    canvas.paste(p, (0,0), p)

    d = ImageDraw.Draw(canvas, "RGBA")

    # Line-art figures
    figure(d, 95,  560, 1.25)
    figure(d, 1195, 2380, 1.0, color=(22,22,24,100))
    # subtle dashed line between figures (no zoom connector)
    dashed_line(d, (145, 740), (400, 980), (80,80,82,70), lw=2, dash=14, gap=9)

    put_text(d, ["以记忆为先"], 82, 84, FT_TITLE)
    put_text(d, ["把每个碎片，", "连成你们的共同轨迹"], 86, 196, FT_SUB, lh=62)

    canvas.convert("RGB").save(OUT / "01_memory_first.png")
    print("✓ 01")


# ══════════════════════════════════════════════════════════════════════════════
# SHOT 2  ·  一条记忆，完整记录当下  ·  记录此刻弹窗.jpg
# Phone quad: upright, slight right lean, shifted down +120
# ══════════════════════════════════════════════════════════════════════════════
def shot2():
    canvas = make_gradient_bg().convert("RGBA")
    screen = Image.open(SRC / "记录此刻弹窗.jpg")
    phone  = make_phone(screen)

    quad = [(180, 490), (1000, 430), (1010, 2600), (150, 2670)]

    canvas.paste(phone_shadow(quad), (0,0), phone_shadow(quad))
    p = perspective_phone(phone, quad)
    canvas.paste(p, (0,0), p)

    d = ImageDraw.Draw(canvas, "RGBA")

    figure(d, 100, 640, 1.2)
    # writing gesture
    d.line([(144, 740), (250, 775)], fill=(22,22,24,150), width=4)
    figure(d, 1195, 2380, 0.9, color=(22,22,24,90))

    put_text(d, ["一条记忆，完整记录当下"], 82, 84, FT_TITLE)
    put_text(d, ["地点 · 天气 · 心情 · 路线，", "一次都不落"], 86, 200, FT_SUB, lh=62)

    canvas.convert("RGB").save(OUT / "02_memory_record.png")
    print("✓ 02")


# ══════════════════════════════════════════════════════════════════════════════
# SHOT 3  ·  共同回忆，一图可见  ·  按地点.jpg
# Phone quad: strong right tilt, shifted down +120
# ══════════════════════════════════════════════════════════════════════════════
def shot3():
    canvas = make_gradient_bg().convert("RGBA")
    screen = Image.open(SRC / "按地点.jpg")
    phone  = make_phone(screen)

    quad = [(200, 360), (1140, 500), (1090, 2580), (110, 2470)]

    canvas.paste(phone_shadow(quad), (0,0), phone_shadow(quad))
    p = perspective_phone(phone, quad)
    canvas.paste(p, (0,0), p)

    d = ImageDraw.Draw(canvas, "RGBA")

    figure(d, 96, 580, 1.2)
    d.line([(118, 690), (180, 720)], fill=(22,22,24,150), width=3)
    figure(d, 1200, 2360, 0.9, color=(22,22,24,90))

    put_text(d, ["共同回忆，一图可见"], 82, 84, FT_TITLE)
    put_text(d, ["按好友筛选，", "一起走过的城市都在这里"], 86, 200, FT_SUB, lh=62)

    canvas.convert("RGB").save(OUT / "03_friendship_map.png")
    print("✓ 03")


# ══════════════════════════════════════════════════════════════════════════════
# SHOT 4  ·  分享范围，完全由你决定  ·  添加好友.jpg over 主页.jpg
# Phone quad: gentle right lean, shifted down +120
# ══════════════════════════════════════════════════════════════════════════════
def shot4():
    canvas = make_gradient_bg().convert("RGBA")
    comp_screen = composite_with_dialog(
        SRC / "主页.jpg", SRC / "添加好友.jpg", dialog_y_frac=0.18)
    phone = make_phone(comp_screen)

    quad = [(140, 500), (1050, 430), (1070, 2640), (90, 2720)]

    canvas.paste(phone_shadow(quad), (0,0), phone_shadow(quad))
    p = perspective_phone(phone, quad)
    canvas.paste(p, (0,0), p)

    d = ImageDraw.Draw(canvas, "RGBA")

    # Two figures with double-arrow (confirmation metaphor)
    figure(d, 98, 600, 1.15)
    figure(d, 1192, 620, 1.1, color=(22,22,24,150))
    MID_Y = 730
    dashed_line(d, (155, MID_Y), (1140, MID_Y), (22,22,24,110), lw=3)
    d.polygon([(155, MID_Y), (185, MID_Y-12), (185, MID_Y+12)], fill=(22,22,24,110))
    d.polygon([(1140, MID_Y), (1110, MID_Y-12), (1110, MID_Y+12)], fill=(22,22,24,110))

    put_text(d, ["分享范围，完全由你决定"], 82, 84, FT_TITLE)
    put_text(d, ["双向确认加好友，", "仅被你标记的人才能看到"], 86, 200, FT_SUB, lh=62)

    canvas.convert("RGB").save(OUT / "04_friend_privacy.png")
    print("✓ 04")


# ══════════════════════════════════════════════════════════════════════════════
# SHOT 5  ·  回忆共享，账单只有自己看  ·  记账单.jpg
# Phone quad: centered, gentle right lean, shifted down +120
# ══════════════════════════════════════════════════════════════════════════════
def shot5():
    canvas = make_gradient_bg().convert("RGBA")
    screen = Image.open(SRC / "记账单.jpg")
    phone  = make_phone(screen)

    quad = [(210, 500), (1080, 440), (1070, 2550), (160, 2630)]

    canvas.paste(phone_shadow(quad), (0,0), phone_shadow(quad))
    p = perspective_phone(phone, quad)
    canvas.paste(p, (0,0), p)

    d = ImageDraw.Draw(canvas, "RGBA")

    # Figure left with ledger
    figure(d, 98, 660, 1.2)
    d.rectangle((60, 780, 135, 850), outline=(22,22,24,170), width=3)
    d.line([(70, 800), (125, 800)], fill=(22,22,24,90), width=2)
    d.line([(70, 815), (125, 815)], fill=(22,22,24,90), width=2)
    d.line([(70, 830), (105, 830)], fill=(22,22,24,90), width=2)

    figure(d, 1192, 2360, 0.95, color=(22,22,24,90))

    put_text(d, ["回忆共享，账单只有自己看"], 82, 84, FT_TITLE)
    put_text(d, ["和朋友一起记，", "金额永远是你的秘密"], 86, 200, FT_SUB, lh=62)

    canvas.convert("RGB").save(OUT / "05_ledger_privacy.png")
    print("✓ 05")


if __name__ == "__main__":
    print("Generating App Store screenshots v3 …")
    shot1()
    shot2()
    shot3()
    shot4()
    shot5()
    print("Done →", OUT)
