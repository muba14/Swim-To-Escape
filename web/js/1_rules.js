'use strict';
/* ===== Swim to Escape: Octopus — rules, validator, generators =====
   The slide rules and the validator mirror tools/mech.py exactly, so the
   daily level and endless-mode chunks generated on the phone pass the same
   checks as the hand-shipped levels (no soft-locks, nothing sealed off). */

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const CUR = { R: [1, 0], L: [-1, 0], U: [0, -1], D: [0, 1] };
const PLAIN = '.*c';
const K = (x, y) => (y + 100000) * 64 + x;       // cell key (y may be negative in endless)
const KX = k => k % 64, KY = k => Math.floor(k / 64) - 100000;

class Fail extends Error {}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rint = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function shuffle(r, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- static analysis on a rows[] level (validator) ---------- */
function gridOf(rows) { return rows.map(r => r.split('')); }
function findAll(g, ch) { const o = []; g.forEach((r, y) => r.forEach((c, x) => { if (c === ch) o.push([x, y]); })); return o; }
function twinsOf(g) {
  const m = {}; g.forEach((r, y) => r.forEach((c, x) => { if ('1234'.includes(c)) (m[c] = m[c] || []).push([x, y]); }));
  const t = new Map();
  for (const d in m) { if (m[d].length !== 2) throw new Fail('portal ' + d); const [a, b] = m[d]; t.set(K(...a), b); t.set(K(...b), a); }
  return t;
}
/* generic slide; cell(x,y) returns the char ('#' outside), isBroken(x,y) for coral */
function slideOn(cell, coralIdx, mask, twin, x, y, dx, dy, passable) {
  const steps = []; const seen = new Set();
  for (;;) {
    const sk = K(x, y) * 4 + (dx === 1 ? 0 : dx === -1 ? 1 : dy === 1 ? 2 : 3);
    if (seen.has(sk)) return { end: [x, y], steps, out: 'loop', broke: null };
    seen.add(sk);
    const nx = x + dx, ny = y + dy;
    let c = cell(nx, ny);
    if (c === '%') {
      const i = coralIdx(nx, ny);
      if (i >= 0 && !((mask >> i) & 1)) return { end: [x, y], steps, out: 'stop', broke: i, brokeAt: [nx, ny] };
      c = '.';
    }
    if (c === '#') return { end: [x, y], steps, out: 'stop', broke: null };
    x = nx; y = ny; steps.push({ x, y, tp: false });
    if (c === '^' && !(passable && passable(x, y))) return { end: [x, y], steps, out: 'dead', broke: null };
    if (c === 'E') return { end: [x, y], steps, out: 'exit', broke: null };
    if (CUR[c]) { [dx, dy] = CUR[c]; }
    else if (c >= '1' && c <= '4') { const t = twin.get(K(x, y)); x = t[0]; y = t[1]; steps.push({ x, y, tp: true }); }
  }
}

function explore(level) {
  const g = gridOf(level.rows); const h = g.length, w = g[0].length;
  const cell = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? '#' : g[y][x];
  const corals = findAll(g, '%'); const cmap = new Map(corals.map((p, i) => [K(...p), i]));
  const coralIdx = (x, y) => cmap.has(K(x, y)) ? cmap.get(K(x, y)) : -1;
  const twin = twinsOf(g);
  const s = findAll(g, 'S')[0]; if (!s) throw new Fail('no start');
  const sk = st => K(st[0], st[1]) * 512 + st[2];
  const start = [s[0], s[1], 0];
  const seen = new Map([[sk(start), start]]); const q = [start]; const edges = new Map();
  const swum = new Set([K(...s)]); const brokeAny = new Set(); let exitOk = false;
  while (q.length) {
    const st = q.shift(); const [x, y, m] = st; const e = []; edges.set(sk(st), e);
    for (const [dx, dy] of DIRS) {
      const r = slideOn(cell, coralIdx, m, twin, x, y, dx, dy);
      if (r.out === 'loop') throw new Fail('loop');
      if (r.out === 'dead') continue;
      for (const p of r.steps) swum.add(K(p.x, p.y));
      const nm = r.broke !== null ? (m | (1 << r.broke)) : m;
      if (r.broke !== null) brokeAny.add(r.broke);
      if (r.out === 'exit') { exitOk = true; e.push('EXIT'); continue; }
      const ns = [r.end[0], r.end[1], nm];
      if (sk(ns) === sk(st)) continue;
      e.push(sk(ns));
      if (!seen.has(sk(ns))) { seen.set(sk(ns), ns); q.push(ns); }
    }
  }
  return { g, w, h, cell, corals, twin, seen, edges, swum, brokeAny, exitOk };
}

function analyse(level) {
  const X = explore(level); const { g, w, h, swum } = X;
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (!'#E'.includes(g[y][x])) throw new Fail('border');
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) if (!'#E'.includes(g[y][x])) throw new Fail('border');
  if (!X.exitOk) throw new Fail('exit unreachable');
  const good = new Set(); for (const [k, e] of X.edges) if (e.includes('EXIT')) good.add(k);
  let ch = true;
  while (ch) { ch = false; for (const [k, e] of X.edges) if (!good.has(k) && e.some(n => n !== 'EXIT' && good.has(n))) { good.add(k); ch = true; } }
  for (const k of X.edges.keys()) if (!good.has(k)) throw new Fail('soft-lock');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = g[y][x];
    if ('*c'.includes(c) && !swum.has(K(x, y))) throw new Fail('item');
    if ((CUR[c] || '1234p'.includes(c)) && !swum.has(K(x, y))) throw new Fail('unused feature');
    if (c === '^' && !DIRS.some(([dx, dy]) => swum.has(K(x + dx, y + dy)))) throw new Fail('sealed urchin');
  }
  X.corals.forEach((p, i) => { if (!X.brokeAny.has(i)) throw new Fail('coral'); });
  const stops = new Set([...X.seen.values()].map(s => K(s[0], s[1])));
  const danger = new Set(findAll(g, 'p').map(p => K(...p)));
  for (const e of level.enemies || []) for (const [x, y] of e.path) {
    if (!PLAIN.includes(g[y][x])) throw new Fail('enemy cell');
    if (danger.has(K(x, y))) throw new Fail('overlap'); danger.add(K(x, y));
  }
  for (const d of danger) if (stops.has(d)) throw new Fail('hazard on rest cell');
  const dead = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y][x] === '.' && !swum.has(K(x, y))) dead.push([x, y]);
  return { swum, stops, dead, X };
}
function okLevel(level) { try { return analyse(level); } catch (e) { if (e instanceof Fail) return null; throw e; } }

/* ---------- generators (runtime: daily level + endless chunks) ---------- */
function maze(w, h, r, braid) {
  const g = Array.from({ length: h }, () => Array(w).fill('#'));
  const cw = (w - 1) >> 1, ch = (h - 1) >> 1;
  const vis = new Set(['0,0']); const st = [[0, 0]]; g[1][1] = '.';
  while (st.length) {
    const [cx, cy] = st[st.length - 1];
    const nb = DIRS.map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < cw && y < ch && !vis.has(x + ',' + y));
    if (!nb.length) { st.pop(); continue; }
    const [nx, ny] = pick(r, nb); vis.add(nx + ',' + ny);
    g[cy + ny + 1][cx + nx + 1] = '.'; g[2 * ny + 1][2 * nx + 1] = '.'; st.push([nx, ny]);
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (g[y][x] !== '#' || r() >= braid) continue;
    if ((g[y][x - 1] === '.' && g[y][x + 1] === '.' && g[y - 1][x] === '#' && g[y + 1][x] === '#') ||
        (g[y - 1][x] === '.' && g[y + 1][x] === '.' && g[y][x - 1] === '#' && g[y][x + 1] === '#')) g[y][x] = '.';
  }
  return g;
}
const rowsOf = g => g.map(r => r.join(''));

function placeOne(level, kind, r, tries = 120, minY = 2) {
  const base = okLevel(level); if (!base) return null;
  const waterN = level.rows.join('').split('.').length - 1;
  for (let t = 0; t < tries; t++) {
    const g = gridOf(level.rows); const h = g.length, w = g[0].length;
    const nl = { rows: null, enemies: (level.enemies || []).map(e => ({ t: e.t, path: e.path.slice() })) };
    const water = []; for (let y = Math.max(2, minY); y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (g[y][x] === '.') water.push([x, y]);
    if (!water.length) return null;
    if (kind === 'urchin' || kind === 'puffer') { const [x, y] = pick(r, water); g[y][x] = kind === 'urchin' ? '^' : 'p'; }
    else if (kind === 'current') {
      const [x, y] = pick(r, water); const ch = pick(r, ['R', 'L', 'U', 'D']); const [dx, dy] = CUR[ch];
      if ('#%'.includes(g[y + dy][x + dx])) continue; g[y][x] = ch;
    } else if (kind === 'coral') {
      const c = []; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (g[y][x] !== '#') continue;
        if (g[y][x - 1] === '.' && g[y][x + 1] === '.' && g[y - 1][x] === '#' && g[y + 1][x] === '#') c.push([x, y]);
        if (g[y - 1][x] === '.' && g[y + 1][x] === '.' && g[y][x - 1] === '#' && g[y][x + 1] === '#') c.push([x, y]);
      }
      if (!c.length) return null; const [x, y] = pick(r, c); g[y][x] = '%';
    } else if (kind === 'crab') {
      const runs = [];
      for (let y = 2; y < h - 1; y++) { let cur = []; for (let x = 0; x <= w; x++) { if (x < w && PLAIN.includes(g[y][x])) cur.push([x, y]); else { if (cur.length >= 3) runs.push(cur); cur = []; } } }
      if (!runs.length) return null; const run = pick(r, runs); const n = rint(r, 3, Math.min(5, run.length)); const i = rint(r, 0, run.length - n);
      nl.enemies.push({ t: 'crab', path: run.slice(i, i + n) });
    }
    nl.rows = rowsOf(g);
    const res = okLevel(nl);
    if (res && res.dead.length - base.dead.length <= waterN * 0.06) return nl;
  }
  return null;
}

function finishLevel(level, r, stars, shells) {
  // items on swum cells, unreachable water -> rock, sealed urchins -> rock
  let res = analyse(level);
  const g = gridOf(level.rows); const h = g.length, w = g[0].length;
  const cand = [...res.swum].map(k => [KX(k), KY(k)]).filter(([x, y]) => g[y][x] === '.' && y > 2);
  shuffle(r, cand);
  cand.slice(0, stars).forEach(([x, y]) => g[y][x] = '*');
  cand.slice(stars, stars + shells).forEach(([x, y]) => g[y][x] = 'c');
  for (const [x, y] of res.dead) g[y][x] = '#';
  let out = { rows: rowsOf(g), enemies: level.enemies || [] };
  res = analyse(out);
  const g2 = gridOf(out.rows);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g2[y][x] === '^' && !DIRS.some(([dx, dy]) => res.swum.has(K(x + dx, y + dy)))) g2[y][x] = '#';
  out = { rows: rowsOf(g2), enemies: out.enemies };
  analyse(out);
  return out;
}

function genDaily(seed) {
  for (let a = 0; a < 400; a++) {
    const r = mulberry32(seed * 31 + a * 7919);
    const w = 13, h = 23; const g = maze(w, h, r, 0.22);
    g[1][1] = 'S';
    const xs = []; for (let x = 1; x < w - 1; x += 2) if (x > w / 2) xs.push(x);
    g[h - 1][pick(r, xs)] = 'E';
    let lv = { rows: rowsOf(g), enemies: [] };
    if (!okLevel(lv)) continue;
    const plan = ['urchin', 'urchin', 'urchin', 'urchin', 'coral', 'current', 'crab', 'puffer'];
    let fails = 0;
    for (const k of plan) { const n = placeOne(lv, k, r, 60, 3); if (n) lv = n; else fails++; }
    if (fails > 2) continue;
    try { return finishLevel(lv, r, 3, 2); } catch (e) { if (!(e instanceof Fail)) throw e; }
  }
  return null;
}
