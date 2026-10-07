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


def shot(pdf, xref):
    d = pymupdf.open(f'{sp}/{pdf}')
    im = Image.open(io.BytesIO(d.extract_image(xref)['image'])).convert('L')
    px = im.load()
    return [[px[x, y] >= 128 for x in range(9, 9 + 192)] for y in range(im.size[1])]


def harvest(img, font, pitch, asc, desc, items, keep=None):
    """items: [(x of the first cell, baseline, text or list of glyph names)]"""
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

# Matrix and vector editors (User's Guide p.27, p.30): titles in the tiny font
harvest(manual('cex.pdf', 26, 1), 'T', 6, 6, 1, [(0, 7, 'MatA=')])
harvest(manual('cex.pdf', 29, 0), 'T', 6, 6, 1, [(0, 7, 'VctA=')])
harvest(manual('cex.pdf', 27, 0), 'T', 6, 6, 1, [(0, 7, 'MatAns=')])
harvest(manual('cex.pdf', 29, 1), 'T', 6, 6, 1, [(0, 7, 'VctAns=')])

# CONST ▸ Universal list (p.37): three small-font columns from x 1, 10 cells apart; the subscripts of c₀ ε₀
# μ₀ Z₀ lₚ tₚ are index-font glyphs standing on the baseline in the next cell
const = shot('cex.pdf', 227)
labels = ['1:h', '2:ħ', '3:c', '4:ε', '5:μ', '6:Z', '7:G', '8:l', '9:t']
harvest(const, 'S', 6, 8, 2, [(1 + (i % 3) * 60, lines[i // 3], l) for i, l in enumerate(labels)])
harvest(const, 'I', 6, 5, 0, [(139, 9, '0'), (79, 29, 'p')])

# Statistics results and regression (p.23): labels from cell 36, values from cell 66 (7-row lowercase);
# raised index digits stand at the capital height
stat = shot('cex.pdf', 126)
harvest(stat, 'S', 6, 8, 2, [(36, 9, ['x̄']), (36, 19, 'Σx'), (78, 19, '='), (36, 49, 'σx'), (36, 59, 's')])
harvest(stat, 'I', 6, 8, 0, [(48, 29, '2')])
reg = shot('cex.pdf', 127)
harvest(reg, 'S', 6, 8, 2, [(36, 9, 'y=a+b·ln(x)'), (66, 39, 'r')])
harvest(shot('cex.pdf', 81), 'I', 6, 8, 0, [(60, 45, '1')])  # M=7,2115×10¹⁰ (recall screen)
# Inequality solution with letters (p.32), cropped one row lower than the display: "a<x<b;c<x"
harvest(shot('cex.pdf', 185), 'S', 6, 8, 2, [(0, 8, 'a<x<b;c<x')], keep='<;')

json.dump(H, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print({f: len(g) for f, g in H.items()})
