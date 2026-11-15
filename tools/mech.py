"""Swim to Escape: Octopus — full-rules level validator + mechanic placer.

Map legend
  #  rock            .  water          S  start        E  exit
  ^  sea urchin      *  star           c  golden shell
  %  breakable coral (stops you, breaks on hit, becomes water)
  R L U D  current (entering it turns you right/left/up/down)
  1-4  portal pair (entering one moves you to its twin, same direction)
  p  puffer fish (dangerous only while puffed up; timing based)
Moving enemies live in level["enemies"]: {"t": "crab"|"shark", "path": [[x,y],..]}

A level passes only if:
  * the exit can be reached, and from EVERY reachable resting state the exit
    can still be reached (no soft-locks), counting broken coral as state;
  * no slide can loop forever (currents/portals);
  * every star/shell is collectable, every coral can be broken, every
    current and portal is actually swum through;
  * puffers and enemy paths never cover a cell where the octopus can rest,
    so waiting is always safe and the timing hazards can always be passed;
  * nothing is left sealed off (unreachable water becomes rock, urchins
    no path touches become rock).
"""
import json, os, random, sys
from collections import deque

DIRS = [(0, -1), (0, 1), (-1, 0), (1, 0)]
CUR = {'R': (1, 0), 'L': (-1, 0), 'U': (0, -1), 'D': (0, 1)}
PLAIN = set('.*c')            # cells an enemy / puffer / feature may sit on


class Fail(Exception):
    pass


def grid_of(level):
    return [list(r) for r in level['rows']]


def find(g, ch):
    return [(x, y) for y, r in enumerate(g) for x, c in enumerate(r) if c == ch]


def portal_pairs(g):
    pairs = {}
    for y, r in enumerate(g):
        for x, c in enumerate(r):
            if c in '1234':
                pairs.setdefault(c, []).append((x, y))
    twin = {}
    for d, cells in pairs.items():
        if len(cells) != 2:
            raise Fail(f'portal {d} has {len(cells)} ends')
        a, b = cells
        twin[a] = b; twin[b] = a
    return twin


def slide(g, corals, broken, twin, x, y, dx, dy):
    """-> (end, steps[(x,y,teleport)], outcome, broke)"""
    h, w = len(g), len(g[0])
    steps = []; seen = set()
    while True:
        if (x, y, dx, dy) in seen:
            return (x, y), steps, 'loop', None
        seen.add((x, y, dx, dy))
        nx, ny = x + dx, y + dy
        if not (0 <= nx < w and 0 <= ny < h):
            return (x, y), steps, 'stop', None
        c = g[ny][nx]
        if c == '%':
            i = corals[(nx, ny)]
            if not (broken >> i) & 1:
                return (x, y), steps, 'stop', i
            c = '.'
        if c == '#':
            return (x, y), steps, 'stop', None
        x, y = nx, ny
        steps.append((x, y, False))
        if c == '^':
            return (x, y), steps, 'dead', None
        if c == 'E':
            return (x, y), steps, 'exit', None
        if c in CUR:
            dx, dy = CUR[c]
        elif c in '1234':
            x, y = twin[(x, y)]
            steps.append((x, y, True))


def explore(level):
    g = grid_of(level)
    corals = {p: i for i, p in enumerate(find(g, '%'))}
    twin = portal_pairs(g)
    s = find(g, 'S')[0]
    start = (s, 0)
    seen = {start}; q = deque([start]); edges = {}
    swum = {s}; used_cells = set(); broke_any = set(); exit_ok = False
    while q:
        st = q.popleft(); (x, y), m = st; edges[st] = []
        for dx, dy in DIRS:
            end, steps, out, br = slide(g, corals, m, twin, x, y, dx, dy)
            if out == 'loop':
                raise Fail(f'endless loop from {x},{y} dir {dx},{dy}')
            if out == 'dead':
                continue
            for (cx, cy, _) in steps:
                swum.add((cx, cy))
            nm = m | (1 << br) if br is not None else m
            if br is not None:
                broke_any.add(br)
            if out == 'exit':
                exit_ok = True; edges[st].append('EXIT'); continue
            ns = (end, nm)
            if ns == st:
                continue
            edges[st].append(ns)
            if ns not in seen:
                seen.add(ns); q.append(ns)
    return g, corals, twin, seen, edges, swum, broke_any, exit_ok


def analyse(level):
    g, corals, twin, seen, edges, swum, broke_any, exit_ok = explore(level)
    h, w = len(g), len(g[0])
    for x in range(w):
        for y in (0, h - 1):
            if g[y][x] not in '#E':
                raise Fail(f'open border {x},{y}')
    for y in range(h):
        for x in (0, w - 1):
            if g[y][x] not in '#E':
                raise Fail(f'open border {x},{y}')
    if not exit_ok:
        raise Fail('exit unreachable')
    good = {s for s, e in edges.items() if 'EXIT' in e}
    changed = True
    while changed:
        changed = False
        for s, es in edges.items():
            if s not in good and any(e in good for e in es if e != 'EXIT'):
                good.add(s); changed = True
    if any(s not in good for s in edges):
        raise Fail('soft-lock state exists')
    for y in range(h):
        for x in range(w):
            c = g[y][x]
            if c in '*c' and (x, y) not in swum:
                raise Fail(f'item {c} at {x},{y} unreachable')
            if c in CUR or c in '1234' or c == 'p':
                if (x, y) not in swum:
                    raise Fail(f'feature {c} at {x},{y} never used')
            if c == '^' and not any((x + dx, y + dy) in swum for dx, dy in DIRS):
                raise Fail(f'urchin {x},{y} sealed')
    for p, i in corals.items():
        if i not in broke_any:
            raise Fail(f'coral {p} can never be broken')
    stops = {pos for pos, _ in seen}
    danger = set(find(g, 'p'))
    for e in level.get('enemies', []):
        for c in e['path']:
            c = tuple(c)
            if g[c[1]][c[0]] not in PLAIN:
                raise Fail(f'{e["t"]} on special cell {c}')
            if c in danger:
                raise Fail(f'{e["t"]} overlaps another hazard at {c}')
            danger.add(c)
    bad = danger & stops
    if bad:
        raise Fail(f'hazard on a resting cell {sorted(bad)}')
    pearls = sum(1 for (x, y) in swum if g[y][x] == '.')
    dead = [(x, y) for y in range(h) for x in range(w)
            if g[y][x] in '.%' and (x, y) not in swum and g[y][x] != '%']
    return {'pearls': pearls, 'stops': stops, 'swum': swum, 'dead': dead}


def ok(level):
    try:
        return analyse(level)
    except Fail:
        return None


# ---------------- feature placement ----------------
def rows(g):
    return [''.join(r) for r in g]


def try_place(level, mutate, rng, tries=300, check=None):
    for _ in range(tries):
        g = grid_of(level)
        new = {'rows': None, 'enemies': [dict(e) for e in level.get('enemies', [])]}
        if not mutate(g, new, rng):
            continue
        new['rows'] = rows(g)
        r = ok(new)
        if r and not r['dead'] and (check is None or check(new, r)):
            return new
    return None


def add_coral(g, new, rng):
    h, w = len(g), len(g[0])
    cand = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if g[y][x] != '#':
                continue
            if g[y][x - 1] in '.' and g[y][x + 1] in '.' and g[y - 1][x] == '#' and g[y + 1][x] == '#':
                cand.append((x, y))
            if g[y - 1][x] in '.' and g[y + 1][x] in '.' and g[y][x - 1] == '#' and g[y][x + 1] == '#':
                cand.append((x, y))
    if not cand:
        return False
    x, y = rng.choice(cand); g[y][x] = '%'
    return True


def add_current(g, new, rng):
    h, w = len(g), len(g[0])
    cells = [(x, y) for y in range(2, h - 2) for x in range(1, w - 1) if g[y][x] == '.']
    if not cells:
        return False
    x, y = rng.choice(cells)
    ch = rng.choice('RLUD'); dx, dy = CUR[ch]
    if g[y + dy][x + dx] in '#%':
        return False
    g[y][x] = ch
    return True


def add_portal(g, new, rng):
    used = {c for r in g for c in r if c in '1234'}
    free = [d for d in '1234' if d not in used]
    h, w = len(g), len(g[0])
    cells = [(x, y) for y in range(2, h - 1) for x in range(1, w - 1) if g[y][x] == '.']
    if len(cells) < 2 or not free:
        return False
    a, b = rng.sample(cells, 2)
    if abs(a[0] - b[0]) + abs(a[1] - b[1]) < 8:
        return False
    g[a[1]][a[0]] = free[0]; g[b[1]][b[0]] = free[0]
    return True


def add_puffer(g, new, rng):
    h, w = len(g), len(g[0])
    cells = [(x, y) for y in range(3, h - 1) for x in range(1, w - 1) if g[y][x] == '.']
    if not cells:
        return False
    x, y = rng.choice(cells); g[y][x] = 'p'
    return True


def runs(g, horizontal, minlen, maxlen):
    h, w = len(g), len(g[0]); out = []
    outer = range(h) if horizontal else range(w)
    for a in outer:
        cur = []
        rng_inner = range(w) if horizontal else range(h)
        for b in list(rng_inner) + [None]:
            if b is not None:
                x, y = (b, a) if horizontal else (a, b)
                if g[y][x] in PLAIN:
                    cur.append((x, y)); continue
            if len(cur) >= minlen:
                out.append(cur[:maxlen] if len(cur) > maxlen else cur)
            cur = []
    return out


def make_enemy(kind):
    def f(g, new, rng):
        lo, hi = (3, 5) if kind == 'crab' else (5, 9)
        horizontal = True if kind == 'crab' else rng.random() < .5
        rs = [r for r in runs(g, horizontal, lo, 99) if r[0][1] > 1]
        if not rs:
            return False
        r = rng.choice(rs)
        n = rng.randint(lo, min(hi, len(r)))
        i = rng.randint(0, len(r) - n)
        new['enemies'].append({'t': kind, 'path': [list(c) for c in r[i:i + n]]})
        return True
    return f


PLACERS = {'coral': add_coral, 'current': add_current, 'portal': add_portal,
           'puffer': add_puffer, 'crab': make_enemy('crab'), 'shark': make_enemy('shark')}

WORLD_PLAN = {  # level index (1-based) -> features to add
    7: ['coral', 'coral'], 8: ['coral', 'coral', 'crab'], 9: ['coral', 'crab', 'puffer'],
    10: ['coral', 'coral', 'crab', 'puffer'], 11: ['coral', 'crab', 'crab', 'puffer'],
    12: ['coral', 'coral', 'crab', 'puffer', 'puffer'],
    13: ['current', 'current'], 14: ['current', 'current', 'portal'],
    15: ['current', 'portal', 'shark'], 16: ['current', 'current', 'portal', 'shark'],
    17: ['current', 'portal', 'portal', 'shark', 'coral'],
    18: ['current', 'current', 'portal', 'shark', 'shark'],
    19: ['coral', 'current', 'crab', 'puffer'], 20: ['coral', 'portal', 'shark', 'puffer'],
    21: ['coral', 'current', 'current', 'crab', 'shark'],
    22: ['coral', 'portal', 'current', 'puffer', 'puffer', 'crab'],
    23: ['coral', 'coral', 'portal', 'current', 'shark', 'puffer'],
    24: ['coral', 'portal', 'portal', 'current', 'current', 'shark', 'crab', 'puffer'],
}

if __name__ == '__main__':
    HERE = os.path.dirname(os.path.abspath(__file__))
    base = json.load(open(os.path.join(HERE, 'levels.json')))
    out = []
    for i, r in enumerate(base, 1):
        lv = {'rows': r, 'enemies': []}
        assert ok(lv), f'base level {i} invalid'
        rng = random.Random(500 + i)
        for feat in WORLD_PLAN.get(i, []):
            nl = try_place(lv, PLACERS[feat], rng)
            if nl is None:
                print(f'  L{i}: could not place {feat}')
                continue
            lv = nl
        r = analyse(lv)
        feats = {k: sum(row.count(c) for row in lv['rows'] for c in v)
                 for k, v in {'coral': '%', 'current': 'RLUD', 'portal': '1234', 'puffer': 'p', 'urchin': '^'}.items()}
        en = [e['t'] for e in lv['enemies']]
        print(f'L{i:2d} ok pearls={r["pearls"]:3d} {feats} enemies={en}')
        out.append(lv)
    json.dump(out, open(os.path.join(HERE, 'levels_v2.json'), 'w'))
