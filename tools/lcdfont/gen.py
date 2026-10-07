# Generates src/ui/lcdfont.js: glyphs extracted from the fx-991CE X / fx-991EX manuals plus hand-drawn
# glyphs in the same style for characters the manuals never show.
import sys, json, pickle
sys.stdout.reconfigure(encoding='utf-8')
sp, out_path = sys.argv[1], sys.argv[2]
F = json.load(open(f'{sp}/font/fonts.json', encoding='utf-8'))
order2 = pickle.load(open(f'{sp}/font/order2.pkl', 'rb'))
status = pickle.load(open(f'{sp}/font/status.pkl', 'rb'))


def g(rows, x=1, bottom=0):
    rows = [r.replace(' ', '') for r in rows]
    return {'rows': rows, 'x': x, 'bottom': bottom}


# labels added for singleton glyphs of the small fonts (order2 indices)
for line in open(f'{sp}/font/labels.txt', encoding='utf-8'):
    p = line.split()
    if len(p) == 3 and p[0].startswith('t'):
        bm, off = order2[int(p[0][1:])]
        F.setdefault(p[1], {})[p[2]] = {'rows': list(bm), 'bottom': off, 'x': 1 if p[1] != 'L' else None}

L, S, T, E = F['L'], F['S'], F['T'], F['E']
# the tiny "M" and "ε" samples are the small font's 7-row μ and ε (CONST list), harvested there
T.pop('M')
T.pop('ε')
T['E'] = {'rows': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], 'x': 1, 'bottom': 0}  # the sample was the boxed ENG indicator


def squeeze(rows, n):
    """Remove n rows, taking repeated rows from the middle first (how the accented capitals are drawn)."""
    rows = list(rows)
    for _ in range(n):
        dup = [i for i in range(1, len(rows) - 1) if rows[i] == rows[i - 1]]
        i = dup[len(dup) // 2] if dup else len(rows) // 2
        rows.pop(i)
    return rows


def center(pattern, width):
    pad = width - len(pattern)
    return '.' * (pad // 2) + pattern + '.' * (pad - pad // 2)


ACUTE = ['..##', '.##.']
DACUTE = ['.##.##', '##.##.']


def accented(base, accent, blank=False):
    b = L[base]
    w = len(b['rows'][0])
    body = b['rows']
    acc = [center(a, w) for a in accent]
    if len(body) == 12:  # capitals: squeezed to 10 rows under a 2-row accent
        rows = acc + squeeze(body, 2)
    else:  # lowercase: accent, blank row, x-height letter
        rows = acc + ['.' * w] + body
    return {'rows': rows, 'x': b['x'], 'bottom': b['bottom']}


UML = ['.##..##.', '.##..##.']
for ch, base, acc in [('Á', 'A', ACUTE), ('Í', 'I', ['.##', '##.']), ('Ó', 'O', ACUTE), ('Ö', 'O', UML), ('Ő', 'O', DACUTE),
                      ('Ú', 'U', ACUTE), ('Ü', 'U', UML), ('Ű', 'U', DACUTE), ('ü', 'u', UML), ('ű', 'u', DACUTE)]:
    if ch not in L:
        L[ch] = accented(base, acc)

L['W'] = g(['###.##.###', '.#..##..#.', '.#..##..#.', '.#..##..#.', '.#.####.#.', '.#.#..#.#.', '.#.#..#.#.',
            '.###..###.', '..##..##..', '..##..##..', '..#....#..', '..#....#..'], 1, 0)
L['≤'] = {'rows': [r[::-1] for r in L['≥']['rows']], 'x': L['≥']['x'], 'bottom': L['≥']['bottom']}
L['≠'] = g(['.......##.', '......##..', '##########', '##########', '....##....', '...##.....', '##########',
            '##########', '.##.......', '##........'], 1, -1)
L['▸'] = g(['#...', '##..', '###.', '####', '###.', '##..', '#...'], 3, -3)
L['•'] = g(['.##.', '####', '####', '.##.'], 3, -4)
L['…'] = g(['##.##.##', '##.##.##'], 1, 0)
L['ȳ'] = {'rows': [L['x̄']['rows'][0]] + ['.' * len(L['x̄']['rows'][0])] + [r.ljust(len(L['x̄']['rows'][0]), '.')[:len(L['x̄']['rows'][0])] for r in L['y']['rows']],
          'x': L['y']['x'], 'bottom': L['y']['bottom']}
L['|'] = g(['##'] * 12, 4, 0)
L['_'] = g(['##########'], 0, 1)
L["'"] = g(['##', '##', '#.'], 4, -9)
L['"'] = g(['##.##', '##.##', '#..#.'], 2, -9)
L['@'] = g(['..######..', '.##....##.', '##......##', '##..####.#', '##.##..#.#', '##.##..#.#', '##.##..#.#',
            '##..#####.', '##........', '.##.....#.', '..######..'], 0, 0)

# ---------------------------------------------------------------- small font (5×9 capitals, x-height 7)
# Lowercase fills the 7 rows above the baseline, without descenders: p, y fold their tails inside (CONV,
# CONST and statistics screens). Fallbacks for letters the harvested screens do not show:
SMALL = {
    'g': (['.####', '#...#', '#...#', '.####', '....#', '#...#', '.###.'], 0),
    'm': (['##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#'], 0),
    'n': (['#.##.', '##..#', '#...#', '#...#', '#...#', '#...#', '#...#'], 0),
    'o': (['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], 0),
    'p': (['####.', '#...#', '#...#', '#...#', '##..#', '#.##.', '#....'], 0),
    'q': (['.####', '#...#', '#...#', '#...#', '#..##', '.##.#', '....#'], 0),
    's': (['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'], 0),
    'u': (['#...#', '#...#', '#...#', '#...#', '#...#', '#..##', '.##.#'], 0),
    'v': (['#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..', '..#..'], 0),
    'w': (['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'], 0),
    'x': (['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'], 0),
    'y': (['#...#', '#...#', '.#.#.', '.#.#.', '..#..', '..#..', '##...'], 0),
    'z': (['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'], 0),
    'α': (['.##.#', '#..##', '#..#.', '#..#.', '#..#.', '#..##', '.##.#'], 0),
    'γ': (['#...#', '#...#', '.#.#.', '.#.#.', '..#..', '.#.#.', '..#..'], 0),
    'τ': (['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '...##'], 0),
    '∞': (['.#.#.', '#.#.#', '#.#.#', '.#.#.'], -2),
    'Φ': (['..#..', '.###.', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '.###.', '..#..'], 0),
    'H': (['#...#'] * 4 + ['#####'] + ['#...#'] * 4, 0),
    'J': (['..###'] + ['...#.'] * 5 + ['#..#.', '#..#.', '.##..'], 0),
    'L': (['#....'] * 8 + ['#####'], 0),
    'N': (['#...#', '#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#', '#...#'], 0),
    'O': (['.###.'] + ['#...#'] * 7 + ['.###.'], 0),
    'S': (['.###.', '#...#', '#....', '#....', '.###.', '....#', '....#', '#...#', '.###.'], 0),
    'T': (['#####'] + ['..#..'] * 8, 0),
    'U': (['#...#'] * 8 + ['.###.'], 0),
    'W': (['#...#'] * 4 + ['#.#.#'] * 3 + ['##.##', '#...#'], 0),
    'X': (['#...#', '#...#', '.#.#.', '.#.#.', '..#..', '.#.#.', '.#.#.', '#...#', '#...#'], 0),
    'Y': (['#...#', '#...#', '.#.#.', '.#.#.'] + ['..#..'] * 5, 0),
    'Σ': (['#####', '#....', '.#...', '..#..', '...#.', '..#..', '.#...', '#....', '#####'], 0),
    'π': (['#####', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '.#..#'], 0),
    'θ': (['.###.'] + ['#...#'] * 3 + ['#####'] + ['#...#'] * 3 + ['.###.'], 0),
    'λ': (['#....', '.#...', '.#...', '..#..', '..#..', '.#.#.', '.#.#.', '#...#', '#...#'], 0),
    'ȳ': (['#####', '#...#', '#...#', '.#.#.', '.#.#.', '..#..', '..#..', '##...'], 0),
    '=': (['#####', '.....', '#####'], -2),
    ':': (['#', '.', '.', '#'], -1),
    '/': (['....#', '....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....', '#....'], 0),
    '▸': (['#..', '##.', '###', '##.', '#..'], -2),
    '<': (['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'], -1),
    '>': (['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'], -1),
    '≤': (['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#', '....', '####'], 0),
    '≥': (['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...', '....', '####'], 0),
    '%': (['##..#', '##..#', '...#.', '...#.', '..#..', '.#...', '.#...', '#..##', '#..##'], 0),
    '!': (['#'] * 6 + ['.', '#'], 0),
    '?': (['.###.', '#...#', '....#', '...#.', '..#..', '..#..', '.....', '..#..'], 0),
    "'": (['#', '#'], -7),
    '"': (['#.#', '#.#'], -7),
    '^': (['..#..', '.#.#.', '#...#'], -6),
    '~': (['.#..#', '#.##.'], -3),
    '[': (['###'] + ['#..'] * 7 + ['###'], 0),
    ']': (['###'] + ['..#'] * 7 + ['###'], 0),
    '∠': (['....#', '...#.', '..#..', '.#...', '#####'], 0),
    '°': (['.#.', '#.#', '.#.'], -6),
    '|': (['#'] * 9, 0),
    '#': (['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'], 0),
    '&': (['.##..', '#..#.', '#..#.', '.##..', '.#...', '#.#.#', '#..#.', '#..#.', '.##.#'], 0),
    '$': (['..#..', '.####', '#.#..', '#.#..', '.###.', '..#.#', '..#.#', '####.', '..#..'], 0),
    '÷': (['..#..', '.....', '#####', '.....', '..#..'], -2),
    ';': (['.#', '..', '..', '.#', '#.'], 1),
}
for ch, (rows, bottom) in SMALL.items():
    if ch not in S:
        S[ch] = g(rows, 1 if len(rows[0]) >= 4 else 2, bottom)

# ---------------------------------------------------------------- glyphs harvested from known screens
import os
F.setdefault('I', {})
if os.path.exists(f'{sp}/font/harvest.json'):
    for fname, gl in json.load(open(f'{sp}/font/harvest.json', encoding='utf-8')).items():
        F[fname].update(gl)

# small-font accented letters: lowercase get the accent two rows above the x-height, capitals are
# squeezed from 9 to 7 rows under a 2-row accent (as the main font does)
S_ACC = {'acute': ['..#..', '.#...'], 'uml': ['.#.#.', '.....'], 'dac': ['.#.#.', '#.#..']}
S_CAP_ACC = {'acute': ['...#.', '..#..'], 'uml': ['.#.#.', '.....'], 'dac': ['..#.#', '.#.#.']}
for ch, base, kind in [('á', 'a', 'acute'), ('é', 'e', 'acute'), ('í', 'i', 'acute'), ('ó', 'o', 'acute'), ('ö', 'o', 'uml'),
                       ('ő', 'o', 'dac'), ('ú', 'u', 'acute'), ('ü', 'u', 'uml'), ('ű', 'u', 'dac'),
                       ('Á', 'A', 'acute'), ('É', 'E', 'acute'), ('Í', 'I', 'acute'), ('Ó', 'O', 'acute'), ('Ö', 'O', 'uml'),
                       ('Ő', 'O', 'dac'), ('Ú', 'U', 'acute'), ('Ü', 'U', 'uml'), ('Ű', 'U', 'dac')]:
    b = S[base]
    w = len(b['rows'][0])
    if base.islower():
        acc = [r[:w].ljust(w, '.') for r in S_ACC[kind]]
        if base == 'i':
            body = [r for r in b['rows']]
            body = body[2:] if len(body) > 6 else body  # drop the dot of i
            rows = [r[:w].ljust(w, '.') for r in ['.#.', '#..']] + body
        else:
            rows = acc + b['rows']  # 2-row accent right above the 7-row letter: 9 rows like the capitals
    else:
        rows = [r[:w].ljust(w, '.') for r in S_CAP_ACC[kind]] + squeeze(b['rows'], 2)
    S[ch] = {'rows': rows, 'x': b['x'], 'bottom': b['bottom']}

# ---------------------------------------------------------------- tiny font (5×7, lowercase full height)
TINY = {
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    'a': ['.....', '.###.', '....#', '.####', '#...#', '#..##', '.##.#'],
    'b': ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
    'c': ['.....', '.###.', '#...#', '#....', '#....', '#...#', '.###.'],
    'd': ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
    'f': ['..##.', '.#..#', '.#...', '###..', '.#...', '.#...', '.#...'],
    'h': ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
    'i': ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
    'k': ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
    'l': ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    'n': ['.....', '.....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
    'o': ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
    'q': ['.####', '#...#', '#...#', '#...#', '.####', '....#', '....#'],
    's': ['.....', '.####', '#....', '.###.', '....#', '....#', '####.'],
    'u': ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
    'v': ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'w': ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
    'y': ['#...#', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
    'z': ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
    'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'N': ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
    'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '.': ['##', '##'],
    ',': ['.#', '.#', '#.'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
    '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
    '[': ['###', '#..', '#..', '#..', '#..', '#..', '###'],
    ']': ['###', '..#', '..#', '..#', '..#', '..#', '###'],
    '∠': ['.....', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    '𝑦': ['..#.#', '..#.#', '.#..#', '..###', '....#', '#..#.', '.##..'],
    'μ': ['.....', '#...#', '#...#', '#...#', '#..##', '###.#', '#....'],
    'σ': ['.....', '.....', '.####', '#..#.', '#...#', '#...#', '.###.'],
    'x̄': ['#####', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
}
for ch, rows in TINY.items():
    if ch not in T:
        bottom = 0 if len(rows) > 3 else 0
        if ch == ',':
            bottom = 1
        T[ch] = g(rows, 1 if len(rows[0]) >= 4 else 2, bottom)
S['−'] = g(['#####'], 1, -4)  # the sample was a fraction-bar fragment; a 1-pixel minus like the tiny font
S.pop('-', None)
# the sign of a negative number is a dash shorter than the subtraction operator: 3 px in small and tiny
# text (regression "a=-852,1627746" p.23; table cells "-0,5" p.29), 6 px in the main font
S['-'] = g(['###'], 2, -4)
T['-'] = g(['###'], 2, -3)
L['-'] = g(['######', '######'], 3, -5)  # main font: "-0,8660254038" (p.25)

# ---------------------------------------------------------------- remove stray pixels
# Glyphs cut from screenshots can carry a piece of a fraction bar or of the next line under them. A glyph
# made of one part keeps only its main body (the largest run of non-blank rows).
import unicodedata
MULTI = set('ij𝑖𝑗!?:;="%÷≥≤…¨¸ȳŷx̄•ħ') | {'x̄'}  # glyphs with separate parts (dots, bars)


def multi_part(ch):
    return ch in MULTI or any(unicodedata.combining(c) for c in unicodedata.normalize('NFD', ch))


for fname in ('L', 'S', 'T', 'E'):
    for ch, gl in F[fname].items():
        if multi_part(ch) or not gl['rows']:
            continue
        rows = gl['rows']
        groups, cur = [], []
        for i, r in enumerate(rows):
            if '#' in r:
                cur.append(i)
            elif cur:
                groups.append(cur); cur = []
        if cur:
            groups.append(cur)
        if len(groups) < 2:
            continue
        main = max(groups, key=lambda g: sum(rows[i].count('#') for i in g))
        below = len(rows) - 1 - main[-1]
        gl['rows'] = rows[main[0]:main[-1] + 1]
        gl['bottom'] -= below

# the small font has one middle dot for products (regression models "y=a+b·ln(x)", p.23)
S['•'] = S['·']

# ---------------------------------------------------------------- index font
# Raised and lowered characters inside small-font text (σ²x, ×10¹⁰, c₀, μ_N, R_K-90) in 6-pixel cells:
# digits and capitals 6 rows, lowercase 5, all placed by the screens (subscripts stand on the baseline,
# superscripts hang from the capital height). Harvested: 0 1 2 p; 3, 8 and e drawn (squeezing loses a
# stroke); the rest squeezed from the small font as the guides' 0, 1 and p are.
I = F['I']
for gl in I.values():
    gl['bottom'] = 0
for ch, rows in {'3': ['.###.', '#...#', '..##.', '....#', '#...#', '.###.'],
                 '8': ['.###.', '#...#', '.###.', '#...#', '#...#', '.###.'],
                 'e': ['.###.', '#...#', '#####', '#....', '.###.']}.items():
    I.setdefault(ch, g(rows))
for ch, gl in S.items():
    n = len(gl['rows'])
    if ch not in I and len(ch) == 1 and ch.isalnum() and gl['bottom'] == 0 and n in (7, 9):
        I[ch] = {'rows': squeeze(gl['rows'], 3 if n == 9 else 2), 'x': gl['x'], 'bottom': 0}
I['−'] = g(['#####'], 1, -2)
I['-'] = I['−']

# ---------------------------------------------------------------- status-line indicators
# positions: LCD x of the left edge (screenshot x − 9), top row within the status line
icon_names = {2: 'D', 4: 'math', 5: 'up', 13: 'R', 18: 'down', 12: 'cmplx', 14: 'left', 51: 'eng', 52: 'M'}
ICONS = {}
for i, name in icon_names.items():
    bm, v = status[i]
    ICONS[name] = {'rows': list(bm), 'x': v['xs'].most_common(1)[0][0] - 9, 'y': v['ys'].most_common(1)[0][0]}
box = lambda letter: ['#######', '#.....#'] + ['#.' + r + '.#' for r in letter] + ['#.....#', '#######']
ICONS['S'] = {'rows': box(['###', '#..', '###', '..#', '###']), 'x': 1, 'y': 1}
ICONS['A'] = {'rows': box(['.#.', '#.#', '###', '#.#', '#.#']), 'x': 1, 'y': 1}
ICONS['G'] = {'rows': box(['###', '#..', '#.#', '#.#', '###']), 'x': ICONS['R']['x'] + 7, 'y': ICONS['D']['y']}
ICONS['FIX'] = {'text': 'FIX', 'x': 72, 'y': 1}
ICONS['SCI'] = {'text': 'SCI', 'x': 72, 'y': 1}
ICONS['STO'] = {'text': 'STO', 'x': 9, 'y': 1}
ICONS['RCL'] = {'text': 'RCL', 'x': 9, 'y': 1}
ICONS['Disp'] = {'text': 'Disp', 'x': 160, 'y': 1}


def js_glyphs(font):
    items = []
    for ch in sorted(font):
        v = font[ch]
        key = json.dumps(ch, ensure_ascii=False)
        items.append(f"    {key}: [{v['x'] if v['x'] is not None else 1}, {v['bottom']}, '{'|'.join(v['rows'])}'],")
    return '\n'.join(items)


lines = [
    "// LCD fonts of the fx-991CE X. Generated by tools/lcdfont (from the glyphs in the fx-991CE X and fx-991EX",
    "// User's Guide screenshots, plus hand-drawn glyphs in the same style for characters the guides never show).",
    "// glyph: [x offset in the cell, bottom row relative to the baseline, rows of '#'/'.' from the top]",
    "",
    "export const FONTS = {",
    "  // main font: 11-pixel cells; capitals and digits 12 rows (−11…0), lowercase 9, descenders 1",
    "  L: { pitch: 11, ascent: 11, descent: 1, glyphs: {",
    js_glyphs(L),
    "  } },",
    "  // bold engineering symbols (k, M, m, μ …) drawn in the main font's cells",
    "  E: { pitch: 11, ascent: 11, descent: 1, glyphs: {",
    js_glyphs(E),
    "  } },",
    "  // small font: lists of results, constants and conversions; 6-pixel cells, capitals 9 rows, lowercase 7",
    "  S: { pitch: 6, ascent: 8, descent: 2, glyphs: {",
    js_glyphs(S),
    "  } },",
    "  // index font: raised and lowered characters in small-font text; digits and capitals 6 rows, lowercase 5",
    "  I: { pitch: 6, ascent: 5, descent: 0, glyphs: {",
    js_glyphs(I),
    "  } },",
    "  // tiny font: table and spreadsheet cells, headers, menu numbers; 6-pixel cells, 7 rows",
    "  T: { pitch: 6, ascent: 6, descent: 1, glyphs: {",
    js_glyphs(T),
    "  } },",
    "};",
    "",
    "/** Status-line indicators: bitmaps (or tiny-font text) at fixed positions; y is the row in the status line. */",
    "export const ICONS = {",
]
for name, v in ICONS.items():
    if 'text' in v:
        lines.append(f"  {name}: {{ x: {v['x']}, y: {v['y']}, text: '{v['text']}' }},")
    else:
        lines.append(f"  {name}: {{ x: {v['x']}, y: {v['y']}, rows: '{'|'.join(v['rows'])}' }},")
lines.append("};")
open(out_path, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
print('L', len(L), 'E', len(E), 'S', len(S), 'I', len(I), 'T', len(T), 'icons', len(ICONS))
