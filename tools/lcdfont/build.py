# Builds the LCD font tables from the labelled manual glyphs.
import sys, pickle, json
from collections import Counter, defaultdict

sp = sys.argv[1]
glyphs, bands = pickle.load(open(f'{sp}/font/glyphs.pkl', 'rb'))
order = pickle.load(open(f'{sp}/font/order.pkl', 'rb'))
order1 = pickle.load(open(f'{sp}/font/order1.pkl', 'rb'))

labels = {}
for line in open(f'{sp}/font/labels.txt', encoding='utf-8'):
    parts = line.split()
    if len(parts) != 3:
        continue
    idx, font, ch = parts
    key = order1[int(idx[1:])] if idx.startswith('s') else order[int(idx)]
    labels[key] = (font, ch)

# best sample per (font, char): most frequent
best = {}
for key, (font, ch) in labels.items():
    n = glyphs[key]['n']
    if (font, ch) not in best or n > glyphs[best[(font, ch)]]['n']:
        best[(font, ch)] = key

# glyph lookup by bitmap only (to find every occurrence regardless of vertical offset)
by_bitmap = defaultdict(list)
for key, (font, ch) in labels.items():
    by_bitmap[key[0]].append((font, ch))

PITCH = {'L': 11, 'E': 11}


# Recover per-band segment bitmaps: segment.py stored only x ranges, so recompute from shots.
shots = pickle.load(open(f'{sp}/font/shots.pkl', 'rb'))


def clean(B):
    h, w = len(B), len(B[0])
    framec = {x for x in range(w) if sum(B[y][x] for y in range(h)) > 0.8 * h}
    framer = {y for y in range(h) if sum(B[y][x] for x in range(w)) > 0.8 * w}
    return [[B[y][x] and x not in framec and y not in framer for x in range(w)] for y in range(h)]


cleaned = {}
inv = {}
for (font, ch), key in best.items():
    inv[key[0]] = (font, ch)

offsets = defaultdict(Counter)
pitch_votes = defaultdict(Counter)
for skey, y0, y1, base, segs in bands:
    if skey not in cleaned:
        cleaned[skey] = clean(shots[skey]['bits'])
    B = cleaned[skey]
    items = []
    for x0, x1 in segs:
        rr = [r for r in range(y0, y1) if any(B[r][c] for c in range(x0, x1))]
        bm = tuple(''.join('#' if B[r][c] else '.' for c in range(x0, x1)) for r in range(rr[0], rr[-1] + 1))
        if bm in inv:
            items.append((x0, x1 - x0, inv[bm]))
    for font in ('L', 'S', 'T'):
        its = [(x, w, (f, ch)) for x, w, (f, ch) in items if f == font or (font == 'L' and f == 'E')]
        if len(its) < 3:
            continue
        pitches = [PITCH['L']] if font == 'L' else [5, 6, 7]
        best_fit = None
        for p in pitches:
            for o in range(p):
                fit = sum(1 for x, w, _ in its if (x - o) % p + w <= p)
                if best_fit is None or fit > best_fit[0]:
                    best_fit = (fit, p, o)
        fit, p, o = best_fit
        if fit < len(its) * 0.9:
            continue
        pitch_votes[font][p] += 1
        for x, w, fc in its:
            offsets[fc][(x - o) % p] += 1

print({f: v.most_common(3) for f, v in pitch_votes.items()})

out = {}
for (font, ch), key in sorted(best.items()):
    bm, off = key
    h = len(bm)
    # large-font descenders are one row deep (User's Guide screenshots: g, p, q, y end one row below the base)
    if font == 'L' and ch in 'gpqy' and h == 10:
        off = 1
    xo = offsets.get((font, ch))
    xoff = xo.most_common(1)[0][0] if xo else None
    out.setdefault(font, {})[ch] = {'rows': list(bm), 'bottom': off, 'x': xoff}

json.dump(out, open(f'{sp}/font/fonts.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
for f, g in out.items():
    missing_x = [c for c, v in g.items() if v['x'] is None]
    print(f, len(g), 'no x offset:', ''.join(missing_x))
