# Collects every LCD screenshot (images about 210 pixels wide) from the User's Guides into font/shots.pkl as
# 1-bit rows (True = ink).  python collect.py <dir>
import sys, io, pickle, hashlib
import pymupdf
from PIL import Image

sp = sys.argv[1]
shots = {}
for name in ['cex.pdf', 'manual.pdf', 'learn.pdf']:
    d = pymupdf.open(f'{sp}/{name}')
    seen = set()
    for pno, p in enumerate(d):
        for info in p.get_image_info(xrefs=True):
            x = info['xref']
            if x in seen or x == 0:
                continue
            seen.add(x)
            if not (180 <= info['width'] <= 230 and 20 <= info['height'] <= 90):
                continue
            try:
                im = Image.open(io.BytesIO(d.extract_image(x)['image'])).convert('L')
            except Exception:
                continue
            px = im.load()
            w, h = im.size
            high = sum(px[i, j] >= 128 for j in range(h) for i in range(w)) < w * h / 2  # ink is the minority value
            bits = tuple(tuple((px[i, j] >= 128) == high for i in range(w)) for j in range(h))
            key = hashlib.md5(repr(bits).encode()).hexdigest()
            shots.setdefault(key, {'src': f'{name}:p{pno + 1}:x{x}', 'w': w, 'h': h, 'bits': bits})
pickle.dump(shots, open(f'{sp}/font/shots.pkl', 'wb'))
print(len(shots), 'screenshots')
