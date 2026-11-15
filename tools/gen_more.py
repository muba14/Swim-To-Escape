"""Adds new validated levels after the first 6 in levels.json.
Sea urchins are placed one by one; each one is kept only if the level still
passes every check (exit reachable, no soft-lock, all items collectible) and
it does not wall off a big part of the map."""
import json, os, random, sys, time
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
from levels import analyse, seal_dead_urchins
from gen import maze, swum_cells, num_stops

def ok(rows):
    try: return analyse(rows)
    except AssertionError: return None

def build(w,h,seed,urchins,braid,stars=3,shells=2):
    rng=random.Random(seed)
    g=maze(w,h,rng,braid)
    g[1][1]='S'
    g[h-1][rng.choice([x for x in range(1,w-1,2) if x>w//2])]='E'
    rows=[''.join(r) for r in g]
    base=ok(rows)
    if not base: return None
    water=sum(r.count('.') for r in rows)
    sw=swum_cells(rows)
    cand=[c for c in sw if c[1]>=3 and g[c[1]][c[0]]=='.']
    rng.shuffle(cand); placed=0
    for (x,y) in cand:
        if placed>=urchins: break
        g[y][x]='^'
        r=ok([''.join(r) for r in g])
        if r is None or len(r[1])-len(base[1])>water*0.06: g[y][x]='.'; continue
        placed+=1
    if placed<urchins-2: return None
    rows=[''.join(r) for r in g]
    sw=swum_cells(rows)
    cand=[c for c in sw if rows[c[1]][c[0]]=='.' and c[1]>2]
    rng.shuffle(cand)
    for c in cand[:stars]: g[c[1]][c[0]]='*'
    for c in cand[stars:stars+shells]: g[c[1]][c[0]]='c'
    _,dead=analyse([''.join(r) for r in g])
    for (x,y) in dead: g[y][x]='#'
    rows=seal_dead_urchins([''.join(r) for r in g])
    pearls,dead2=analyse(rows); assert not dead2
    return rows,pearls,num_stops(rows),len(dead)/water

SPECS=[  # (w,h,urchins,braid)
 (13,21,3,.25),(13,23,4,.24),(13,23,5,.24),(13,25,5,.22),(13,25,6,.22),(13,27,6,.2),
 (15,25,6,.22),(15,27,7,.2),(15,27,8,.2),(15,29,8,.2),(15,29,9,.18),(15,31,9,.18),
 (15,31,10,.18),(15,33,10,.16),(15,33,11,.16),(15,35,12,.15),(15,35,12,.15),(15,37,14,.14),
]
if __name__=='__main__':
    path=os.path.join(HERE,'levels.json')
    levels=json.load(open(path))[:6]
    for i,(w,h,u,b) in enumerate(SPECS):
        t=time.time(); best=None
        for seed in range(250):
            r=build(w,h,10000+i*1000+seed,u,b)
            if not r: continue
            rows,p,st,df=r
            score=p+2.5*st-300*df+8*sum(r.count("^") for r in rows)
            if best is None or score>best[0]: best=(score,rows,p,st,df)
        levels.append(best[1])
        print(f"L{len(levels):2d} {w}x{h} pearls={best[2]} stops={best[3]} urchins={sum(r.count('^') for r in best[1])} rockified={best[4]:.0%} ({time.time()-t:.0f}s)",flush=True)
    json.dump(levels,open(path,'w'))
