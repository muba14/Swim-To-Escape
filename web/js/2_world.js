/* ===== Boards: what the game plays on (fixed level, daily level, endless) ===== */

class Board {
  // common runtime state on top of a char grid
  initCommon() {
    this.pearls = new Set(); this.stars = new Set(); this.shells = new Set();
    this.puffers = []; this.enemies = []; this.twin = new Map(); this.removed = new Set();
  }
  slide(x, y, dx, dy, passable) {
    return slideOn((a, b) => this.cell(a, b), () => 0, 0, this.twin, x, y, dx, dy, passable);
  }
  isRock(x, y) { const c = this.cell(x, y); return c === '#' || c === '%'; }
  addEnemies(list) {
    for (const e of list || []) {
      this.enemies.push({ t: e.t, path: e.path.map(p => [p[0], p[1]]), f: 0, dir: 1,
        speed: e.t === 'crab' ? 2.1 : 4.6, stun: 0, face: 1 });
    }
  }
  scanItems(rows, oy) {
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) {
      const c = r[x], k = K(x, y + oy);
      if (c === '*') this.stars.add(k);
      else if (c === 'c') this.shells.add(k);
      else if (c === 'p') this.puffers.push({ x, y: y + oy, ph: ((x * 7 + (y + oy) * 13) % 10) / 10 * 3.2, stun: 0 });
    } });
  }
}

class LevelBoard extends Board {
  constructor(level) {
    super(); this.initCommon();
    const res = analyse(level);                 // throws if a level were ever broken
    this.g = gridOf(level.rows); this.h = this.g.length; this.w = this.g[0].length;
    this.start = findAll(this.g, 'S')[0]; this.exit = findAll(this.g, 'E')[0];
    this.twin = twinsOf(this.g);
    this.scanItems(level.rows, 0);
    for (const k of res.swum) { const x = KX(k), y = KY(k); if (this.g[y][x] === '.') this.pearls.add(k); }
    this.addEnemies(level.enemies);
    this.totalPearls = this.pearls.size;
    this.features = new Set();
    const all = level.rows.join('');
    if (all.includes('^')) this.features.add('urchin');
    if (all.includes('%')) this.features.add('coral');
    if (/[RLUD]/.test(all)) this.features.add('current');
    if (/[1-4]/.test(all)) this.features.add('portal');
    if (all.includes('p')) this.features.add('puffer');
    for (const e of this.enemies) this.features.add(e.t);
  }
  cell(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? '#' : this.g[y][x]; }
  set(x, y, c) { this.g[y][x] = c; }
  rowsRange() { return [0, this.h - 1]; }
}

/* Endless: an 11-wide shaft that keeps growing upward in 17-row chunks.
   Each new chunk is validated together with the chunk below it (entry from the
   gap underneath, exit = the gap at its top), so no chunk can strand you. */
const EW = 11, EH = 17;
class EndlessBoard extends Board {
  constructor(seed) {
    super(); this.initCommon();
    this.r = mulberry32(seed); this.rows = new Map(); this.chunks = 0; this.w = EW;
    this.features = new Set(['urchin']);
    this.firstChunk();
    this.addChunk(); this.addChunk();
  }
  cell(x, y) { if (x < 0 || x >= EW) return '#'; const row = this.rows.get(y); return row ? row[x] : '#'; }
  set(x, y, c) { const row = this.rows.get(y); if (row) row[x] = c; }
  oddX() { return 1 + 2 * Math.floor(this.r() * ((EW - 1) / 2)); }
  commit(localRows, worldTop, swumLocal) {
    localRows.forEach((r, i) => {
      const y = worldTop + i; const arr = r.split('').map(c => (c === 'E' || c === 'S') ? '.' : c);
      this.rows.set(y, arr);
    });
    this.scanItems(localRows, worldTop);
    for (const k of swumLocal) { const x = KX(k), ly = KY(k), y = ly + worldTop;
      if (ly >= 0 && ly < localRows.length && localRows[ly][x] === '.') this.pearls.add(K(x, y)); }
  }
  firstChunk() {
    for (let a = 0; a < 300; a++) {
      const g = maze(EW, EH, this.r, 0.3);
      const sx = this.oddX(); g[EH - 2][sx] = 'S';
      const gx = this.oddX(); g[0][gx] = 'E';
      let lv = { rows: rowsOf(g), enemies: [] };
      const res = okLevel(lv); if (!res) continue;
      lv = this.finishChunk(lv, res, EH);
      const res2 = okLevel(lv); if (!res2) continue;
      const top = -(EH - 1);
      this.commit(lv.rows, top, res2.swum);
      this.start = [sx, top + EH - 2];
      this.top = top; this.gapX = gx; this.entry = this.start.slice();
      this.chunks = 1; return;
    }
    throw new Error('first chunk failed');
  }
  finishChunk(lv, res, nRows) {
    // rock-ify unreachable water and seal unreachable urchins, but only inside the new rows
    const g = gridOf(lv.rows);
    for (const [x, y] of res.dead) if (y < nRows) g[y][x] = '#';
    for (let y = 0; y < nRows; y++) for (let x = 0; x < EW; x++)
      if (g[y][x] === '^' && !DIRS.some(([dx, dy]) => res.swum.has(K(x + dx, y + dy)))) g[y][x] = '#';
    return { rows: rowsOf(g), enemies: [] };
  }
  unionRows(newRows) {
    // new chunk rows (without its bottom border) + the chunk below (both borders, bottom closed)
    const below = []; for (let y = this.top; y <= this.top + EH - 1; y++) below.push(this.rows.get(y).slice());
    below[below.length - 1] = Array(EW).fill('#');
    const ey = this.entry[1] - this.top; below[ey][this.entry[0]] = 'S';
    return newRows.slice(0, EH - 1).concat(below.map(r => r.join('')));
  }
  addChunk() {
    const n = this.chunks;
    const urchins = Math.min(6, 1 + Math.floor(n / 2));
    const puffers = n >= 4 ? 1 + (n >= 9 ? 1 : 0) : 0;
    for (let a = 0; a < 80; a++) {
      const easy = a >= 50;
      const g = maze(EW, EH, this.r, easy ? 0.45 : 0.28);
      // try every possible exit gap for this maze before giving up on it
      const gaps = shuffle(this.r, [1, 3, 5, 7, 9]);
      let gx = -1, lv = null, res = null;
      const limit = a < 40 ? 28 : 70;        // cells that would turn to rock
      for (const cand of gaps) {
        g[0][cand] = 'E';
        const l = { rows: this.unionRows(rowsOf(g)), enemies: [] };
        const r = okLevel(l);
        g[0][cand] = '#';
        if (r && r.dead.length < limit && (!res || r.dead.length < res.dead.length)) { gx = cand; lv = l; res = r; }
      }
      if (!lv) continue;
      if (!easy) {
        const plan = []; for (let i = 0; i < urchins; i++) plan.push('^'); for (let i = 0; i < puffers; i++) plan.push('p');
        for (const ch of plan) {
          for (let t = 0; t < 25; t++) {
            const gg = gridOf(lv.rows);
            const y = rint(this.r, 1, EH - 2), x = rint(this.r, 1, EW - 2);
            if (gg[y][x] !== '.') continue;
            gg[y][x] = ch; const cand = { rows: rowsOf(gg), enemies: [] };
            const rr = okLevel(cand);
            if (rr && rr.dead.length <= res.dead.length + 6) { lv = cand; res = rr; break; }
          }
        }
        if (this.r() < .5) {                    // one golden shell now and then
          const sw = [...res.swum].map(k => [KX(k), KY(k)]).filter(([x, y]) => y < EH - 1 && lv.rows[y][x] === '.');
          if (sw.length) { const [x, y] = pick(this.r, sw); const gg = gridOf(lv.rows); gg[y][x] = 'c'; lv = { rows: rowsOf(gg), enemies: [] }; res = analyse(lv); }
        }
      }
      lv = this.finishChunk(lv, res, EH - 1);
      const fin = okLevel(lv); if (!fin) continue;
      this.place(lv.rows.slice(0, EH - 1), fin.swum, gx);
      return;
    }
    // last resort: a straight shaft straight up from the entry gap (always valid)
    const g = Array.from({ length: EH }, () => Array(EW).fill('#'));
    for (let y = 0; y < EH - 1; y++) g[y][this.gapX] = '.'; g[0][this.gapX] = 'E';
    const lv = { rows: this.unionRows(rowsOf(g)), enemies: [] };
    const fin = analyse(lv);
    this.place(lv.rows.slice(0, EH - 1), fin.swum, this.gapX);
  }
  place(newRows, swum, gx) {
    const newTop = this.top - (EH - 1);
    this.commit(newRows, newTop, swum);
    this.entry = [this.gapX, this.top - 1];
    this.top = newTop; this.gapX = gx; this.chunks++;
  }
  ensure(minY) { while (this.top > minY) this.addChunk(); }
  rowsRange() { return [this.top, 0]; }
}
