// Auto-player test: npm i playwright && node tools/play_test.js
// Solves every level with a BFS over (position, broken corals)
// and plays the moves through the real game loop.
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'build', 'test-shots') + path.sep;
require('fs').mkdirSync(OUT, { recursive: true });
const FILE = 'file://' + path.join(__dirname, '..', 'assets', 'game', 'index.html');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(FILE); await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + 's_home.png' });

  // in-page solver
  await p.evaluate(() => {
    window.solve = function (rows) {
      const g = gridOf(rows), h = g.length, w = g[0].length;
      const cell = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? '#' : g[y][x];
      const cor = findAll(g, '%'), cm = new Map(cor.map((q, i) => [K(...q), i]));
      const ci = (x, y) => cm.has(K(x, y)) ? cm.get(K(x, y)) : -1;
      const tw = twinsOf(g), s = findAll(g, 'S')[0];
      const key = (x, y, m) => x + ',' + y + ',' + m;
      const prev = new Map([[key(s[0], s[1], 0), null]]); const q = [[s[0], s[1], 0]];
      while (q.length) {
        const [x, y, m] = q.shift();
        for (const [dx, dy] of DIRS) {
          const r = slideOn(cell, ci, m, tw, x, y, dx, dy);
          if (r.out === 'dead' || r.out === 'loop') continue;
          const nm = r.broke !== null ? m | (1 << r.broke) : m;
          if (r.out === 'exit') { const path = [[dx, dy]]; let k = key(x, y, m); while (prev.get(k)) { path.unshift(prev.get(k).d); k = prev.get(k).k; } return path; }
          const nk = key(r.end[0], r.end[1], nm);
          if (!prev.has(nk)) { prev.set(nk, { k: key(x, y, m), d: [dx, dy] }); q.push([r.end[0], r.end[1], nm]); }
        }
      }
      return null;
    };
  });
  const waitIdle = async () => {
    for (let i = 0; i < 200; i++) {
      const ph = await p.evaluate(() => { const G = __T.G; if (G) G.invuln = 99; return G ? G.phase : 'none'; });
      if (ph === 'card') { await p.click('#oOk'); continue; }
      if (ph !== 'moving' && ph !== 'dying') return ph;
      await p.waitForTimeout(30);
    }
    return 'timeout';
  };
  const results = [];
  const playRows = async (rows, label, shotAt) => {
    const moves = await p.evaluate(r => solve(r), rows);
    if (!moves) { results.push(label + ' NO SOLUTION'); return; }
    await waitIdle();
    let ph;
    for (let i = 0; i < moves.length; i++) {
      await p.evaluate(m => __T.swipe(m[0], m[1]), moves[i]);
      if (shotAt !== undefined && i === shotAt) { await p.waitForTimeout(60); await p.screenshot({ path: OUT + `s_${label}.png` }); }
      ph = await waitIdle();
    }
    const st = await p.evaluate(() => ({ ph: __T.G.phase, pg: __T.G.pg, tot: __T.G.board.totalPearls, mv: __T.G.moves }));
    results.push(`${label}: ${st.ph} in ${st.mv} moves (solver ${moves.length}), pearls ${st.pg}/${st.tot}`);
  };

  for (let i = 0; i < 24; i++) {
    await p.evaluate(i => __T.startLevel(i), i);
    const shot = { 0: 2, 8: 3, 14: 3, 22: 4 }[i];
    await playRows(await p.evaluate(i => __T.LEVELS[i].rows, i), 'L' + (i + 1), shot);
    if (i === 6) { await p.waitForTimeout(400); await p.screenshot({ path: OUT + 's_win.png' }); }
  }
  // daily
  const t0 = Date.now();
  const drows = await p.evaluate(() => { const d = dailyLevel(); return d.level ? d.level.rows : null; });
  results.push(`daily generated in ${Date.now() - t0} ms: ${drows ? drows.length + ' rows' : 'FAILED'}`);
  if (drows) { await p.evaluate(() => __T.startDaily()); await playRows(drows, 'daily', 2); }
  // daily generator robustness over many days
  const dstat = await p.evaluate(() => { let ok = 0, ms = 0; for (let d = 20000; d < 20030; d++) { const t = performance.now(); const l = genDaily(d); ms = Math.max(ms, performance.now() - t); if (l && okLevel(l)) ok++; } return { ok, ms: Math.round(ms) }; });
  results.push(`daily generator: ${dstat.ok}/30 valid, slowest ${dstat.ms} ms`);
  // endless stress: generate 60 chunks, time them, and validate a sample union
  const es = await p.evaluate(() => { const t = performance.now(); const e = new __T.EndlessBoard(12345); const t1 = performance.now(); e.ensure(-16 * 60); return { first: Math.round(t1 - t), per: ((performance.now() - t1) / (e.chunks - 3)).toFixed(1), chunks: e.chunks }; });
  results.push(`endless: first 3 chunks ${es.first} ms, ${es.per} ms/chunk, ${es.chunks} chunks`);
  // endless play: climb with BFS to higher cells
  await p.evaluate(() => __T.startEndless());
  await waitIdle();
  let climbed = 0;
  for (let round = 0; round < 6; round++) {
    const mv = await p.evaluate(() => {
      const G = __T.G, b = G.board; const s = G.pos; const key = (x, y) => x + ',' + y;
      const prev = new Map([[key(...s), null]]); const q = [s]; let goal = null;
      while (q.length && !goal) { const [x, y] = q.shift(); for (const [dx, dy] of DIRS) { const r = b.slide(x, y, dx, dy);
        if (!r.steps.length || r.out === 'dead') continue; const nk = key(...r.end);
        if (!prev.has(nk)) { prev.set(nk, { k: key(x, y), d: [dx, dy] }); q.push(r.end); if (r.end[1] < s[1] - 14) { goal = nk; break; } } } }
      if (!goal) return null; const path = []; let k = goal; while (prev.get(k)) { path.unshift(prev.get(k).d); k = prev.get(k).k; } return path;
    });
    if (!mv) { results.push('endless: no upward path found at round ' + round); break; }
    for (const m of mv) { await p.evaluate(m => __T.swipe(m[0], m[1]), m); await waitIdle(); }
    climbed = await p.evaluate(() => __T.G.e.meters);
    if (round === 3) await p.screenshot({ path: OUT + 's_endless.png' });
  }
  results.push(`endless climbed ${climbed} m`);
  // hazards really kill: remove invulnerability and walk into ink
  const died = await p.evaluate(async () => { const G = __T.G; G.invuln = 0; G.e.inkY = G.oy + 0.2; await new Promise(r => setTimeout(r, 1500)); return G.phase; });
  results.push('endless ink catches the octopus -> ' + died);
  await p.waitForTimeout(300); await p.screenshot({ path: OUT + 's_over.png' });

  // shop & achievements screens
  await p.evaluate(() => { __T.save.shells = 120; leaveGame(); showScreen('shop'); });
  await p.click('text=AL · 10'); await p.waitForTimeout(100);
  await p.evaluate(() => { const b = [...document.querySelectorAll('#shopItems button')].find(x => x.textContent === 'AL · 15' && x.closest('.item').textContent.includes('Korsan')); b.click(); });
  await p.waitForTimeout(300); await p.screenshot({ path: OUT + 's_shop.png' });
  await p.evaluate(() => showScreen('achs')); await p.waitForTimeout(200); await p.screenshot({ path: OUT + 's_ach.png' });
  await p.evaluate(() => showScreen('levels')); await p.waitForTimeout(200); await p.screenshot({ path: OUT + 's_levels.png' });
  const sv = await p.evaluate(() => ({ ach: Object.keys(__T.save.ach), equip: __T.save.equip, shells: __T.save.shells }));
  results.push('save: ' + JSON.stringify(sv));
  console.log(results.join('\n'));
  console.log('ERRORS:', errs.filter(e => !e.includes('ERR_')).slice(0, 10));
  await b.close();
})();
