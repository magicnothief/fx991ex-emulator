# Harvests real glyphs from a manual screenshot whose text and layout are known (emulator renders the same
# cells): for each character, the ink inside its cell becomes the glyph. Writes font/harvest.json.
import sys, io, json, pymupdf
from PIL import Image

sp = sys.argv[1]
out_path = f'{sp}/font/harvest.json'
try:
    H = json.load(open(out_path, encoding='utf-8'))
except FileNotFoundError:
    H = {}


def manual(pdf, page, idx):
    d = pymupdf.open(f'{sp}/{pdf}')
    infos = [i for i in d[page].get_image_info(xrefs=True) if 200 <= i['width'] <= 215]
    im = Image.open(io.BytesIO(d.extract_image(infos[idx]['xref'])['image'])).convert('L')
    px = im.load()
    W, Hh = im.size
    return [[px[x, y] >= 128 for x in range(9, 9 + 192)] for y in range(Hh)]


def harvest(img, font, pitch, asc, desc, items, keep=None):
    """items: [(x of the first cell, baseline, text)]"""
    for x0, base, text in items:
        for k, ch in enumerate(text):
            if ch == ' ' or (keep and ch not in keep):
                continue
            cx = x0 + k * pitch
            # descender rows only for letters with descenders: below them the next line begins
            low = desc if ch in 'gjpqy' else 0
            rows = range(max(0, base - asc), min(len(img), base + low + 1))
            ink = [(x, y) for y in rows for x in range(cx, cx + pitch) if x < 192 and img[y][x]]
            if not ink:
                continue
            xs = [p[0] for p in ink]; ys = [p[1] for p in ink]
            bm = [''.join('#' if img[y][x] else '.' for x in range(min(xs), max(xs) + 1)) for y in range(min(ys), max(ys) + 1)]
            H.setdefault(font, {}).setdefault(ch, {'rows': bm, 'x': min(xs) - cx, 'bottom': max(ys) - base})


# CONV ▸ Length list (fx-991CE X User's Guide p.37): two small-font columns, six lines
conv = manual('cex.pdf', 40, 1)
labels = ['1:in▸cm', '2:cm▸in', '3:ft▸m', '4:m▸ft', '5:yd▸m', '6:m▸yd', '7:mile▸km', '8:km▸mile',
          '9:n mile▸m', 'A:m▸n mile', 'B:pc▸km', 'C:km▸pc']
lines = [9, 19, 29, 39, 49, 59]
harvest(conv, 'S', 6, 8, 2, [((i % 2) * 96, lines[i // 2], l) for i, l in enumerate(labels)])

json.dump(H, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print({f: len(g) for f, g in H.items()})
