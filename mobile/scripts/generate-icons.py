#!/usr/bin/env python3
"""
Generate the Blood Bridge app icon and splash assets.

Run:
    python3 mobile/scripts/generate-icons.py

Outputs (overwrites in place):
    mobile/assets/icon.png            1024 x 1024 — red rounded square + white blood drop (iOS / Expo Go)
    mobile/assets/adaptive-icon.png   1024 x 1024 — TRANSPARENT bg + WHITE blood drop (Android adaptive foreground)
    mobile/assets/splash.png          1284 x 2778 — red full-bleed + centered drop + "Blood Bridge" wordmark

Why three files:
    - Android adaptive icons composite the foreground (adaptive-icon.png) over a
      solid background color set in app.json. We use #DC2626 there. The foreground
      MUST be just the white drop on transparent — earlier the foreground was a
      RED drop, which became invisible against the red background.
    - iOS and older Android versions use the standalone icon.png (red + white drop
      baked together).
    - The splash screen shows on launch.

Design:
    - 4x supersampling + LANCZOS downsample for clean antialiased edges.
    - Smooth teardrop shape: a circle for the round bottom + a cubic-Bezier curve
      from the apex down to the tangent points on the circle.
"""

import os
from PIL import Image, ImageDraw, ImageFont

RED       = (220, 38, 38, 255)      # #DC2626
WHITE     = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

ASSETS_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')


def cubic_bezier_points(p0, p1, p2, p3, steps=200):
    """Sample (x, y) points along a cubic Bezier curve."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3 * p0[0] + 3*u**2*t * p1[0] + 3*u*t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3*u**2*t * p1[1] + 3*u*t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def teardrop_polygon(size, color=WHITE, height_frac=0.78, width_frac=0.52, y_offset_frac=0.05):
    """
    Render a smooth teardrop shape onto a (size, size) RGBA canvas.

    The drop is built from:
      - A circle at the bottom (the round bowl)
      - Two cubic Bezier curves from the apex down to the tangent points on the circle

    Returns an Image with the white drop on transparent background.
    """
    # 4x supersample for clean antialiasing
    s = size * 4
    img = Image.new('RGBA', (s, s), TRANSPARENT)
    d   = ImageDraw.Draw(img)

    # Drop bounding box (centered, with optional y-offset)
    drop_h = s * height_frac
    drop_w = s * width_frac
    cx     = s / 2
    top_y  = (s - drop_h) / 2 + s * y_offset_frac
    apex   = (cx, top_y)
    bottom = (cx, top_y + drop_h)

    # The round bowl is a circle whose diameter equals drop_w,
    # sitting at the bottom of the drop bounding box.
    bowl_d = drop_w
    bowl_r = bowl_d / 2
    bowl_center = (cx, bottom[1] - bowl_r)
    left_tangent  = (bowl_center[0] - bowl_r, bowl_center[1])
    right_tangent = (bowl_center[0] + bowl_r, bowl_center[1])

    # Cubic Bezier from apex → left tangent (curving outward)
    control1_left = (apex[0],            apex[1] + (left_tangent[1] - apex[1]) * 0.5)
    control2_left = (left_tangent[0],    apex[1] + (left_tangent[1] - apex[1]) * 0.7)
    left_curve    = cubic_bezier_points(apex, control1_left, control2_left, left_tangent)

    # Mirror for the right side (apex → right tangent), reversed so the polygon traces clockwise
    control1_right = (apex[0],           apex[1] + (right_tangent[1] - apex[1]) * 0.5)
    control2_right = (right_tangent[0],  apex[1] + (right_tangent[1] - apex[1]) * 0.7)
    right_curve    = cubic_bezier_points(apex, control1_right, control2_right, right_tangent)

    # Polygon: apex → down the left curve → around the bowl (right side) → up the right curve → apex
    polygon = []
    polygon.extend(left_curve)
    # Arc along the BOTTOM half of the bowl, from left_tangent through the
    # bottom-most point to right_tangent. Note PIL's y axis points down, so
    # sin(a) > 0 actually moves DOWN. To sweep through the bottom we go from
    # angle π (left) → π/2 (bottom) → 0 (right).
    import math
    arc_steps = 120
    for i in range(arc_steps + 1):
        t = i / arc_steps
        a = math.pi * (1 - t)
        x = bowl_center[0] + bowl_r * math.cos(a)
        y = bowl_center[1] + bowl_r * math.sin(a)
        polygon.append((x, y))
    polygon.extend(reversed(right_curve))

    d.polygon(polygon, fill=color)

    # Downsample with LANCZOS for clean antialiased edges
    return img.resize((size, size), Image.LANCZOS)


def rounded_square(size, color, corner_radius_frac=0.22):
    """Solid color rounded square at (size, size)."""
    s = size * 4
    img = Image.new('RGBA', (s, s), TRANSPARENT)
    d   = ImageDraw.Draw(img)
    r   = int(s * corner_radius_frac)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=color)
    return img.resize((size, size), Image.LANCZOS)


def render_icon():
    """icon.png — red rounded square + white drop (1024×1024)."""
    size = 1024
    bg   = rounded_square(size, RED)
    drop = teardrop_polygon(size, WHITE, height_frac=0.62, width_frac=0.40, y_offset_frac=0.02)
    bg.alpha_composite(drop)
    out = os.path.join(ASSETS_DIR, 'icon.png')
    bg.save(out, 'PNG', optimize=True)
    return out


def render_adaptive_icon():
    """
    adaptive-icon.png — WHITE drop on TRANSPARENT background, sized so it fits
    well inside the Android adaptive safe zone (the inner 66% of the 1024×1024
    canvas — the launcher may apply a circular mask). Android composites this
    foreground over the red background color set in app.json.
    """
    size = 1024
    drop = teardrop_polygon(size, WHITE, height_frac=0.60, width_frac=0.39, y_offset_frac=0.02)
    out  = os.path.join(ASSETS_DIR, 'adaptive-icon.png')
    drop.save(out, 'PNG', optimize=True)
    return out


def render_splash():
    """
    splash.png — full-bleed red background, centered white drop, "Blood Bridge"
    wordmark below the drop. 1284×2778 matches iPhone 14 Pro Max and works well
    on Android (Expo resizes it as needed).
    """
    w, h = 1284, 2778
    img  = Image.new('RGBA', (w, h), RED)

    # Drop: render onto a square canvas, then paste centered (slightly above middle)
    drop_size = 480
    drop = teardrop_polygon(drop_size, WHITE, height_frac=0.78, width_frac=0.52, y_offset_frac=0.03)
    drop_x = (w - drop_size) // 2
    drop_y = (h // 2) - drop_size - 60   # bias upward so the wordmark sits below the drop
    img.alpha_composite(drop, (drop_x, drop_y))

    # Wordmark
    text = 'Blood Bridge'
    font = None
    for candidate in (
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    ):
        if os.path.exists(candidate):
            font = ImageFont.truetype(candidate, 96)
            break
    if font is None:
        font = ImageFont.load_default()

    d = ImageDraw.Draw(img)
    bbox = d.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = (w - text_w) // 2
    text_y = drop_y + drop_size + 60
    d.text((text_x, text_y), text, fill=WHITE, font=font)

    out = os.path.join(ASSETS_DIR, 'splash.png')
    img.save(out, 'PNG', optimize=True)
    return out


def report_colors(path):
    """Print dominant colors for a generated PNG (sanity check)."""
    img    = Image.open(path).convert('RGBA')
    pixels = list(img.getdata())
    total  = len(pixels)
    counter = {}
    for px in pixels:
        # Bucket the alpha: 0 = transparent, else "opaque"
        bucket = 'transparent' if px[3] == 0 else f'rgb{px[:3]}'
        counter[bucket] = counter.get(bucket, 0) + 1
    top = sorted(counter.items(), key=lambda kv: -kv[1])[:4]
    print(f'  {os.path.basename(path)}:')
    for label, count in top:
        print(f'    {count/total*100:6.2f}%  {label}')


def main():
    assert os.path.isdir(ASSETS_DIR), f'assets dir not found: {ASSETS_DIR}'
    print('Generating icons...')
    icon = render_icon();             print(f'  wrote {icon}')
    adap = render_adaptive_icon();    print(f'  wrote {adap}')
    splash = render_splash();         print(f'  wrote {splash}')
    print('\nColor sanity check:')
    report_colors(icon)
    report_colors(adap)
    report_colors(splash)


if __name__ == '__main__':
    main()
