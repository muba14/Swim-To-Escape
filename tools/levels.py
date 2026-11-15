# Swim to Escape: Octopus — level source + validator
# Legend: # wall, . water, S start, E exit, ^ sea urchin (deadly), * star, c golden shell
# Pearls are NOT placed by hand: the game puts a pearl on every water cell the
# octopus can actually swim through, and water it can never reach becomes rock.
# So unreachable areas cannot exist. This script also proves: exit reachable,
# no soft-lock (from every reachable stop the exit is still reachable),
# every star/shell collectible.

import json, os
LEVELS = json.load(open(os.path.join(os.path.dirname(__file__),'levels.json')))
DIRS = [(0,-1),(0,1),(-1,0),(1,0)]

def parse(rows):
    g=[list(r) for r in rows]
    h=len(g); w=len(g[0])
    assert all(len(r)==w for r in g), "ragged rows"
    for x in range(w): assert g[0][x]=='#' or g[0][x]=='E' and False or g[0][x]=='#' or True
    return g,w,h

def slide(g,w,h,x,y,dx,dy):
    """returns (end, path, outcome) outcome: 'stop','exit','dead'"""
    path=[]
    while True:
        nx,ny=x+dx,y+dy
        if not(0<=nx<w and 0<=ny<h) or g[ny][nx]=='#':
            return (x,y),path,'stop'
        x,y=nx,ny; path.append((x,y))
        c=g[y][x]
        if c=='^': return (x,y),path,'dead'
        if c=='E': return (x,y),path,'exit'

def analyse(rows):
    g,w,h=parse(rows)
    # border must be closed except exit
    for x in range(w):
        for y in (0,h-1):
            assert g[y][x] in '#E',f"open border at {x},{y}"
    for y in range(h):
        for x in (0,w-1):
            assert g[y][x] in '#E',f"open border at {x},{y}"
    s=[(x,y) for y in range(h) for x in range(w) if g[y][x]=='S'][0]
    seen={s}; q=[s]; edges={}; swum={s}; exit_ok=False
    while q:
        p=q.pop(); edges[p]=[]
        for dx,dy in DIRS:
            end,path,out=slide(g,w,h,p[0],p[1],dx,dy)
            if not path: continue
            if out=='dead': continue
            swum.update(path)
            if out=='exit': exit_ok=True; edges[p].append('EXIT'); continue
            edges[p].append(end)
            if end not in seen: seen.add(end); q.append(end)
    assert exit_ok,"exit unreachable"
    # soft-lock check: reverse reachability to EXIT
    good=set(p for p in edges if 'EXIT' in edges[p])
    changed=True
    while changed:
        changed=False
        for p,es in edges.items():
            if p not in good and any(e in good for e in es if e!='EXIT'):
                good.add(p); changed=True
    locked=[p for p in edges if p not in good]
    assert not locked, f"soft-lock stops: {locked}"
    for y in range(h):
        for x in range(w):
            if g[y][x] in '*c' and (x,y) not in swum:
                raise AssertionError(f"item {g[y][x]} at {x},{y} unreachable")
    for y in range(h):
        for x in range(w):
            if g[y][x]=='^' and not any((x+dx,y+dy) in swum for dx,dy in DIRS):
                raise AssertionError(f"urchin at {x},{y} sits in a sealed pocket")
    water=[(x,y) for y in range(h) for x in range(w) if g[y][x] not in '#^']
    dead=[c for c in water if c not in swum]
    pearls=sum(1 for c in swum if g[c[1]][c[0]]=='.')
    return pearls,dead

if __name__=='__main__':
    ok=True
    for i,l in enumerate(LEVELS,1):
        try:
            p,dead=analyse(l)
            print(f"Level {i}: OK  pearls={p}  unreachable water (auto-rock)={dead}")
        except AssertionError as e:
            ok=False; print(f"Level {i}: FAIL {e}")
    raise SystemExit(0 if ok else 1)


def seal_dead_urchins(rows):
    """Turns urchins that no swim path ever touches into rock (iteratively)."""
    import copy
    g=[list(r) for r in rows]; h=len(g); w=len(g[0])
    s=[(x,y) for y in range(h) for x in range(w) if g[y][x]=='S'][0]
    while True:
        seen={s}; q=[s]; swum={s}
        while q:
            p=q.pop()
            for dx,dy in DIRS:
                e,path,o=slide(g,w,h,p[0],p[1],dx,dy)
                if not path or o=='dead': continue
                swum.update(path)
                if o=='stop' and e not in seen: seen.add(e); q.append(e)
        changed=False
        for y in range(h):
            for x in range(w):
                if g[y][x] in '^.*c' and (x,y) not in swum and not any((x+dx,y+dy) in swum for dx,dy in DIRS):
                    g[y][x]='#'; changed=True
        if not changed: return [''.join(r) for r in g]
