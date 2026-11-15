import random, sys
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from levels import analyse, slide, DIRS

def maze(w,h,rng,braid):
    g=[['#']*w for _ in range(h)]
    cw,ch=(w-1)//2,(h-1)//2
    st=[(0,0)]; vis={(0,0)}; g[1][1]='.'
    while st:
        cx,cy=st[-1]
        nb=[(cx+dx,cy+dy) for dx,dy in DIRS if 0<=cx+dx<cw and 0<=cy+dy<ch and (cx+dx,cy+dy) not in vis]
        if not nb: st.pop(); continue
        nx,ny=rng.choice(nb); vis.add((nx,ny))
        g[cy+ny+1][cx+nx+1]='.'; g[2*ny+1][2*nx+1]='.'; st.append((nx,ny))
    # braid: knock out internal walls between two water cells
    for y in range(1,h-1):
        for x in range(1,w-1):
            if g[y][x]=='#' and rng.random()<braid:
                if (g[y][x-1]=='.' and g[y][x+1]=='.' and g[y-1][x]=='#' and g[y+1][x]=='#') or \
                   (g[y-1][x]=='.' and g[y+1][x]=='.' and g[y][x-1]=='#' and g[y][x+1]=='#'):
                    g[y][x]='.'
    return g

def build(w,h,seed,urchins,stars=3,shells=2,braid=0.25):
    rng=random.Random(seed)
    g=maze(w,h,rng,braid)
    g[1][1]='S'
    ex=rng.choice([x for x in range(1,w-1,2) if x>w//2])
    g[h-1][ex]='E'
    water=[(x,y) for y in range(1,h-1) for x in range(1,w-1) if g[y][x]=='.']
    rng.shuffle(water)
    for (x,y) in water[:urchins]:
        if y>2: g[y][x]='^'
    rows=[''.join(r) for r in g]
    try: pearls,dead=analyse(rows)
    except AssertionError: return None
    # place stars/shells on swum cells
    from levels import parse
    sw=swum_cells(rows)
    cand=[c for c in sw if rows[c[1]][c[0]]=='.' and c[1]>2]
    rng.shuffle(cand)
    g=[list(r) for r in rows]
    for c in cand[:stars]: g[c[1]][c[0]]='*'
    for c in cand[stars:stars+shells]: g[c[1]][c[0]]='c'
    for (x,y) in dead: g[y][x]='#'   # bake unreachable water into rock
    rows=[''.join(r) for r in g]
    pearls,dead=analyse(rows)
    stops=num_stops(rows)
    return rows,pearls,stops

def swum_cells(rows):
    g=[list(r) for r in rows]; h=len(g); w=len(g[0])
    s=[(x,y) for y in range(h) for x in range(w) if g[y][x]=='S'][0]
    seen={s}; q=[s]; sw={s}
    while q:
        p=q.pop()
        for dx,dy in DIRS:
            end,path,out=slide(g,w,h,p[0],p[1],dx,dy)
            if not path or out=='dead': continue
            sw.update(path)
            if out=='stop' and end not in seen: seen.add(end); q.append(end)
    return sw

def num_stops(rows):
    g=[list(r) for r in rows]; h=len(g); w=len(g[0])
    s=[(x,y) for y in range(h) for x in range(w) if g[y][x]=='S'][0]
    seen={s}; q=[s]
    while q:
        p=q.pop()
        for dx,dy in DIRS:
            end,path,out=slide(g,w,h,p[0],p[1],dx,dy)
            if path and out=='stop' and end not in seen: seen.add(end); q.append(end)
    return len(seen)

if __name__=='__main__':
    specs=[(11,13,0,0.30),(11,17,1,0.28),(11,19,3,0.25),(13,21,4,0.22),(13,23,6,0.20),(13,25,8,0.20)]
    out=[]
    for i,(w,h,u,b) in enumerate(specs):
        best=None
        for seed in range(4000):
            r=build(w,h,seed*7+i,u,braid=b)
            if not r: continue
            rows,p,st=r
            swater=sum(row.count('.') for row in rows)
            score=p*1.0+st*2
            if best is None or score>best[0]: best=(score,rows,p,st,seed)
        print(f"L{i+1} {w}x{h} pearls={best[2]} stops={best[3]} seed={best[4]}")
        print('\n'.join(best[1]))
        out.append(best[1])
    import json; json.dump(out,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'levels.json'),'w'))
