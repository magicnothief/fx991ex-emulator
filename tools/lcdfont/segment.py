import sys, pickle
from collections import Counter, defaultdict
sp=sys.argv[1]
shots=pickle.load(open(f'{sp}/font/shots.pkl','rb'))

def clean(B):
    """Remove frame lines: columns/rows that are almost entirely ink."""
    h,w=len(B),len(B[0])
    framec={x for x in range(w) if sum(B[y][x] for y in range(h))>0.8*h}
    framer={y for y in range(h) if sum(B[y][x] for x in range(w))>0.8*w}
    return [[B[y][x] and x not in framec and y not in framer for x in range(w)] for y in range(h)]

glyphs=defaultdict(lambda: {'n':0,'heights':Counter(),'srcs':[]})
bands=[]
for key,s in shots.items():
    B=clean(s['bits']); h,w=s['h'],s['w']
    rows=[any(B[y]) for y in range(h)]
    y=0
    while y<h:
        if not rows[y]: y+=1; continue
        y0=y
        while y<h and rows[y]: y+=1
        y1=y; bh=y1-y0
        if not (6<=bh<=16): continue
        cols=[any(B[r][x] for r in range(y0,y1)) for x in range(w)]
        segs=[]; x=0
        while x<w:
            if not cols[x]: x+=1; continue
            x0=x
            while x<w and cols[x]: x+=1
            segs.append((x0,x))
        info=[]
        for x0,x1 in segs:
            rr=[r for r in range(y0,y1) if any(B[r][c] for c in range(x0,x1))]
            info.append((x0,x1,rr[0],rr[-1]))
        base=Counter(b for *_,b in info).most_common(1)[0][0]
        bands.append((key,y0,y1,base,[(x0,x1) for x0,x1,_,_ in info]))
        for x0,x1,t,b in info:
            bm=tuple(''.join('#' if B[r][c] else '.' for c in range(x0,x1)) for r in range(t,b+1))
            g=glyphs[(bm,b-base)]
            g['n']+=1; g['heights'][bh]+=1
            if len(g['srcs'])<4: g['srcs'].append((key,x0,y0))
pickle.dump((dict(glyphs),bands), open(f'{sp}/font/glyphs.pkl','wb'))
freq=sorted(glyphs.items(), key=lambda kv:-kv[1]['n'])
print('bands', len(bands), 'unique', len(glyphs), 'n>=2', sum(1 for k,v in freq if v['n']>=2), 'n>=5', sum(1 for k,v in freq if v['n']>=5))
