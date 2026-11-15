/* ===== game logic ===== */
const SPEED = 22;                 // cells per second
let G = null;                     // current run
let appPaused = false;
let hudDirty = true;

const ACH = [
  { id: 'ilk', name: 'İlk Kaçış', desc: 'Bir bölümü bitir.' },
  { id: 'inci', name: 'İnci Avcısı', desc: 'Bir bölümdeki bütün incileri topla.' },
  { id: 'yildiz3', name: 'Üç Yıldız', desc: 'Bir bölümü 3 yıldızla bitir.' },
  { id: 'resif', name: 'Resif Kaşifi', desc: 'Sığ Resif dünyasını bitir.' },
  { id: 'tum', name: 'Dibe Vuran', desc: '24 bölümün hepsini bitir.' },
  { id: 'm100', name: '100 Metre', desc: 'Sonsuz modda 100 m tırman.' },
  { id: 'm300', name: 'Mürekkepten Hızlı', desc: 'Sonsuz modda 300 m tırman.' },
  { id: 'murekkep', name: 'Mürekkep Ustası', desc: 'Mürekkeple bir tehlikeyi etkisiz bırak.' },
  { id: 'kalkan', name: 'Kıl Payı', desc: 'Kalkan sayesinde bir çarpmadan kurtul.' },
  { id: 'moda', name: 'Şık Ahtapot', desc: 'Mağazadan bir görünüm al.' },
  { id: 'gunluk', name: 'Günün Kaçağı', desc: 'Günlük bölümü bitir.' },
  { id: 'kabuk100', name: 'Kabuk Koleksiyoncusu', desc: 'Toplam 100 deniz kabuğu topla.' },
];
const ACH_REWARD = 5;
const DAILY_REWARD = 5;

const CARDS = {
  urchin: { title: 'DENİZ KESTANESİ', text: 'Dokunursan bir can gider. Mürekkep onu birkaç saniye etkisiz bırakır.' },
  coral: { title: 'KIRILGAN MERCAN', text: 'Üstüne doğru yüzünce çarpıp durursun, mercan kırılır ve yol açılır.' },
  crab: { title: 'YENGEÇ', text: 'Bir ileri bir geri yürür. Geçmek için doğru anı bekle.' },
  puffer: { title: 'BALON BALIĞI', text: 'Titremeye başladıysa şişmek üzeredir. Şişkinken yanından geçme.' },
  current: { title: 'AKINTI', text: 'Üstünden geçerken seni okun gösterdiği yöne çevirir.' },
  portal: { title: 'GİRDAP', text: 'Birine girersen aynı renkteki eşinden, aynı yöne doğru çıkarsın.' },
  shark: { title: 'KÖPEKBALIĞI', text: 'Koridorda hızla devriye gezer. Arkasından geç.' },
};
const CARD_ORDER = ['urchin', 'coral', 'crab', 'puffer', 'current', 'portal', 'shark'];

function localDay() { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
let dailyCache = null;
function dailyLevel() {
  const day = localDay();
  if (!dailyCache || dailyCache.day !== day) dailyCache = { day, level: genDaily(day), world: day % 4 };
  return dailyCache;
}
function fmtTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; }

/* ---------- starting runs ---------- */
function startLevel(i) {
  const w = Math.floor(i / PER_WORLD);
  newRun('level', new LevelBoard(LEVELS[i]), { idx: i, world: w, pal: WORLDS[w].pal, music: WORLDS[w].music, dark: WORLDS[w].dark, tex: WORLDS[w].tex });
}
function startDaily() {
  const d = dailyLevel(); const W = WORLDS[d.world];
  newRun('daily', new LevelBoard(d.level), { world: d.world, pal: W.pal, music: W.music, dark: W.dark, tex: W.tex });
}
function startEndless() {
  newRun('endless', new EndlessBoard((Date.now() & 0x7fffffff) ^ 0x5eed), { pal: ENDLESS_PAL, music: 'endless' });
}
function restartRun() {
  if (!G) return;
  if (G.mode === 'level') startLevel(G.idx); else if (G.mode === 'daily') startDaily(); else startEndless();
}
function newRun(mode, board, o) {
  G = { mode, board, idx: o.idx ?? -1, world: o.world || 0, pal: o.pal, dark: !!o.dark, tex: o.tex || null,
    pos: board.start.slice(), ox: board.start[0], oy: board.start[1], phase: 'idle', prevPhase: 'idle',
    mv: null, lives: mode === 'endless' ? 1 : 3, maxLives: 5, moves: 0, time: 0, clock: 0,
    sg: 0, shg: 0, pg: 0, shield: false, magnetT: 0, inkUsed: false, stunU: new Map(), inkFx: null,
    parts: [], confetti: [], shakeT: 0, shakeAmp: 0, squash: 0, lastDx: 0, lastDy: 1, cdx: 0, cdy: 1,
    chain: 0, invuln: 0, trailT: 0, cards: [], dyingT: 0, camY: null };
  if (mode === 'endless') G.e = { inkY: board.start[1] + 3.5, startY: board.start[1], meters: 0, nextShell: 30, nextInk: 100, rising: false };
  showScreen('game');
  $('hudStars').hidden = mode === 'endless'; $('hudMeters').hidden = mode !== 'endless';
  renderPowerbar(); hudDirty = true;
  playMusic(o.music);
  G.cards = CARD_ORDER.filter(f => board.features.has(f) && !save.seen['card_' + f]);
  $('swipeHint').hidden = !!save.seen.swipe;
  closeOverlay();
  const bn = $('banner');
  bn.innerHTML = mode === 'endless' ? 'SONSUZ MOD<small>Mürekkepten kaç, yukarı yüz</small>'
    : mode === 'daily' ? `GÜNLÜK BÖLÜM<small>${WORLDS[G.world].name}</small>`
    : `BÖLÜM ${G.idx + 1}<small>${WORLDS[G.world].name}</small>`;
  bn.hidden = false; bn.style.animation = 'none'; void bn.offsetWidth; bn.style.animation = '';
  clearTimeout(newRun.bt); newRun.bt = setTimeout(() => { bn.hidden = true; }, 1900);
  if (G.cards.length) showCard();
}

/* ---------- input → moves ---------- */
const isStunnedUrchin = (x, y) => { const t = G.stunU.get(K(x, y)); return t !== undefined && t > G.clock; };
function swipe(dx, dy) {
  if (!G || appPaused || G.phase !== 'idle') return;
  if (!save.seen.swipe) { save.seen.swipe = true; persist(); $('swipeHint').hidden = true; }
  const [x, y] = G.pos;
  const r = G.board.slide(x, y, dx, dy, isStunnedUrchin);
  G.lastDx = dx; G.lastDy = dy;
  if (!r.steps.length) {
    if (r.brokeAt) { G.moves++; breakCoral(r.brokeAt); }
    else { G.squash = 0.5; sfx('bump', 0.4); }
    return;
  }
  G.moves++;
  if (G.e) G.e.rising = true;
  sfx('swim', 0.8); haptic('select');
  G.mv = { steps: r.steps, i: 0, res: r }; G.cdx = dx; G.cdy = dy; G.chain = 0; G.phase = 'moving';
}

function moveStep(dt) {
  let dist = dt * SPEED;
  while (dist > 0 && G.phase === 'moving') {
    const st = G.mv.steps[G.mv.i];
    if (!st) { finishSlide(); return; }
    if (st.tp) {
      burst(G.ox, G.oy, portalColor(G.ox, G.oy), 10, 'ring');
      G.ox = st.x; G.oy = st.y; G.mv.i++; sfx('portal', 0.8); burst(st.x, st.y, portalColor(st.x, st.y), 10, 'ring');
      G.camY = null; continue;
    }
    const ddx = st.x - G.ox, ddy = st.y - G.oy, rem = Math.abs(ddx) + Math.abs(ddy);
    if (rem > 0) { G.cdx = Math.sign(ddx); G.cdy = Math.sign(ddy); }
    if (rem <= dist) { G.ox = st.x; G.oy = st.y; dist -= rem; G.mv.i++; enterCell(st.x, st.y); }
    else { G.ox += Math.sign(ddx) * dist; G.oy += Math.sign(ddy) * dist; dist = 0; }
  }
  if (G.phase === 'moving' && G.mv && G.mv.i >= G.mv.steps.length) finishSlide();
}
function enterCell(x, y) {
  collect(x, y);
  const c = G.board.cell(x, y);
  if (CUR[c]) sfx('swim', 0.35, 1.4);
}
function finishSlide() {
  const r = G.mv.res; const [ex, ey] = r.end;
  G.pos = [ex, ey]; G.ox = ex; G.oy = ey;
  if (r.out === 'exit') { G.mv = null; return winLevel(); }
  if (r.out === 'dead') {
    if (G.shield) {
      shieldSave(); G.board.set(ex, ey, '.'); burst(ex, ey, '#ff6f91', 14);
      const r2 = G.board.slide(ex, ey, G.cdx, G.cdy, isStunnedUrchin);
      if (r2.steps.length) { G.mv = { steps: r2.steps, i: 0, res: r2 }; return; }
      G.mv = null; G.phase = 'idle'; if (r2.brokeAt) breakCoral(r2.brokeAt); return;
    }
    G.mv = null; return die();
  }
  G.mv = null; G.phase = 'idle'; G.squash = 1; sfx('bump', 0.5); shake(2, 0.12);
  if (r.brokeAt) breakCoral(r.brokeAt);
}
function breakCoral([x, y]) {
  G.board.set(x, y, '.');
  sfx('break'); haptic('medium'); shake(4, 0.18);
  burst(x, y, '#ff7f6b', 16); burst(x, y, '#c4504a', 8);
}

function collect(x, y) {
  const k = K(x, y), b = G.board;
  if (b.pearls.delete(k)) { G.pg++; pearlSfx(G.chain++); sparkle(x, y, G.pal.pearl); hudDirty = true; }
  if (b.stars.delete(k)) { G.sg++; sfx('star'); burst(x, y, '#ffc93c', 12); haptic('light'); hudDirty = true; }
  if (b.shells.delete(k)) { G.shg++; sfx('shell'); burst(x, y, '#f5b82e', 10); haptic('light'); hudDirty = true; }
}

/* ---------- hazards ---------- */
function enemyPos(e) {
  const n = e.path.length - 1, f = Math.max(0, Math.min(n, e.f)), i = Math.floor(f), t = f - i;
  const a = e.path[i], b = e.path[Math.min(n, i + 1)];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
function pufferState(p) {
  if (p.stun > 0) return 'small';
  const t = (G.clock + p.ph) % 3.2;
  return t < 2.0 ? 'small' : t < 2.5 ? 'warn' : 'big';
}
function updateEnemies(dt) {
  for (const e of G.board.enemies) {
    if (e.stun > 0) { e.stun -= dt; continue; }
    const n = e.path.length - 1;
    e.f += e.dir * e.speed * dt;
    if (e.f >= n) { e.f = n - (e.f - n); e.dir = -1; }
    if (e.f <= 0) { e.f = -e.f; e.dir = 1; }
    const a = e.path[0], b = e.path[n];
    e.face = (b[0] - a[0] + b[1] - a[1]) * e.dir >= 0 ? 1 : -1;
  }
  for (const p of G.board.puffers) if (p.stun > 0) p.stun -= dt;
}
function checkHazards() {
  if (G.invuln > 0) return;
  for (const e of G.board.enemies) {
    if (e.stun > 0) continue;
    const [x, y] = enemyPos(e);
    if (Math.abs(x - G.ox) < 0.62 && Math.abs(y - G.oy) < 0.62) return hitHazard(e);
  }
  for (const p of G.board.puffers) {
    if (pufferState(p) === 'big' && Math.abs(p.x - G.ox) < 0.62 && Math.abs(p.y - G.oy) < 0.62) return hitHazard(p);
  }
}
function hitHazard(h) {
  if (G.shield) { shieldSave(); h.stun = 1.6; G.invuln = 0.6; return; }
  die();
}
function shieldSave() {
  G.shield = false; G.invuln = 0.4; sfx('shield'); haptic('medium');
  burst(G.ox, G.oy, '#7fe3ff', 16, 'ring'); unlock('kalkan'); renderPowerbar();
}
function die() {
  G.phase = 'dying'; G.mv = null; G.dyingT = 0.8; G.lives--; hudDirty = true;
  sfx('hurt'); shake(7, 0.35); haptic('heavy');
  burst(G.ox, G.oy, SKINS[save.equip.skin].O, 18);
}
function afterDeath() {
  if (G.lives <= 0) { if (G.mode === 'endless') endlessOver(); else lostLevel(); return; }
  if (G.mode !== 'endless') G.pos = G.board.start.slice();
  G.ox = G.pos[0]; G.oy = G.pos[1]; G.phase = 'idle'; G.invuln = 1.2; G.camY = null;
}

/* ---------- abilities ---------- */
function useInk() {
  if (!G || G.inkUsed || !(G.phase === 'idle' || G.phase === 'moving')) return;
  G.inkUsed = true; sfx('ink'); haptic('medium');
  const R = 3, T = 4.5, cx = Math.round(G.ox), cy = Math.round(G.oy); let n = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (G.board.cell(cx + dx, cy + dy) === '^') { G.stunU.set(K(cx + dx, cy + dy), G.clock + T); n++; }
  }
  for (const e of G.board.enemies) { const [x, y] = enemyPos(e); if (Math.abs(x - G.ox) <= R + 0.5 && Math.abs(y - G.oy) <= R + 0.5) { e.stun = T; n++; } }
  for (const p of G.board.puffers) if (Math.abs(p.x - G.ox) <= R + 0.5 && Math.abs(p.y - G.oy) <= R + 0.5) { p.stun = T; n++; }
  G.inkFx = { x: G.ox, y: G.oy, t: 0 };
  for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 5;
    G.parts.push({ x: G.ox + 0.5, y: G.oy + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.9, max: 0.9, col: '#3a2466', sz: 0.35, type: 'sq', drag: 3 }); }
  if (n > 0) unlock('murekkep');
  renderPowerbar();
}
function usePower(kind) {
  if (!G || !(G.phase === 'idle' || G.phase === 'moving')) return;
  if ((save.items[kind] || 0) <= 0) { toast('Bu güçlendirme bitti', 'Mağazadan kabukla alabilirsin', I_SHELLC); return; }
  if (kind === 'shield' && G.shield) return;
  if (kind === 'magnet' && G.magnetT > 0) return;
  if (kind === 'life' && G.lives >= G.maxLives) return;
  if (kind === 'shield') G.shield = true;
  if (kind === 'magnet') G.magnetT = 8;
  if (kind === 'life') { G.lives++; hudDirty = true; }
  save.items[kind]--; persist(); sfx('powerup'); haptic('light');
  burst(G.ox, G.oy, kind === 'life' ? '#ff6f91' : kind === 'shield' ? '#7fe3ff' : '#e5484d', 12, 'ring');
  renderPowerbar();
}
function magnetPull() {
  const cx = Math.round(G.ox), cy = Math.round(G.oy), b = G.board;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (dx * dx + dy * dy > 6.5) continue;
    const x = cx + dx, y = cy + dy, k = K(x, y);
    if (b.pearls.has(k) || b.shells.has(k)) {
      G.parts.push({ x: x + 0.5, y: y + 0.5, tx: G.ox + 0.5, ty: G.oy + 0.5, life: 0.25, max: 0.25, col: b.shells.has(k) ? '#f5b82e' : G.pal.pearl, sz: 0.2, type: 'fly' });
      collect(x, y);
    }
  }
}

/* ---------- per-frame update ---------- */
function update(dt) {
  if (!G) return;
  updateParticles(dt);
  if (appPaused || ['card', 'paused', 'won', 'lost', 'over'].includes(G.phase)) return;
  G.clock += dt;
  if (G.phase === 'idle' || G.phase === 'moving') G.time += dt;
  G.squash = Math.max(0, G.squash - dt * 4); G.invuln = Math.max(0, G.invuln - dt);
  if (G.inkFx) { G.inkFx.t += dt; if (G.inkFx.t > 0.8) G.inkFx = null; }
  updateEnemies(dt);
  if (G.phase === 'moving') { moveStep(dt); trail(dt); }
  if (G.phase === 'dying') { G.dyingT -= dt; if (G.dyingT <= 0) afterDeath(); if (G.e) updateEndless(dt); return; }
  if (G.magnetT > 0) { G.magnetT -= dt; magnetPull(); if (G.magnetT <= 0) renderPowerbar(); }
  if (G.phase === 'idle' || G.phase === 'moving') checkHazards();
  if (G.e) updateEndless(dt);
}
function updateEndless(dt) {
  const e = G.e, b = G.board;
  const climbed = Math.max(0, Math.floor(e.startY - G.oy));
  if (climbed > e.meters) {
    e.meters = climbed; hudDirty = true;
    while (e.meters >= e.nextShell) { G.shg++; e.nextShell += 30; sfx('shell', 0.6); }
    if (e.meters >= e.nextInk) { e.nextInk += 100; if (G.inkUsed) { G.inkUsed = false; renderPowerbar(); toast('Mürekkep doldu', 'Her 100 metrede bir yenilenir', I_INK); } }
    if (e.meters >= 100) unlock('m100');
    if (e.meters >= 300) unlock('m300');
  }
  if (e.rising) {
    const dist = e.inkY - G.oy;
    let v = 0.55 + Math.min(1.5, e.meters / 220);
    if (dist > 11) v += (dist - 11) * 0.35;
    e.inkY -= v * dt;
  }
  b.ensure(Math.floor(G.oy) - 40);
  for (const y of [...b.rows.keys()]) if (y > e.inkY + 30) b.rows.delete(y);
  if (G.phase !== 'dying' && G.oy + 0.45 > e.inkY && G.invuln <= 0) {
    if (G.shield) { shieldSave(); e.inkY += 6; return; }
    G.lives--; hudDirty = true; sfx('hurt'); shake(7, 0.35); haptic('heavy');
    if (G.lives > 0) { e.inkY += 8; G.invuln = 1.2; }
    else { G.phase = 'dying'; G.mv = null; G.dyingT = 0.8; }
  }
}

/* ---------- results ---------- */
function addShells(n) {
  if (n <= 0) return;
  save.shells += n; save.totalShells += n;
  if (save.totalShells >= 100) unlock('kabuk100');
}
function unlock(id) {
  if (save.ach[id]) return;
  save.ach[id] = Date.now();
  const a = ACH.find(a => a.id === id);
  save.shells += ACH_REWARD; save.totalShells += ACH_REWARD;
  persist(); sfx('achieve'); haptic('light');
  toast(a.name, `Başarım açıldı · +${ACH_REWARD} kabuk`, I_TROPHY);
  hudDirty = true;
  if (save.totalShells >= 100 && id !== 'kabuk100') unlock('kabuk100');
}
function winLevel() {
  G.phase = 'won'; sfx('win'); haptic('medium'); confettiBurst();
  const b = G.board, stars = G.sg;
  const rec = { moves: false, time: false }; let bonus = 0;
  if (G.mode === 'level') {
    const i = G.idx;
    save.stars[i] = Math.max(save.stars[i] || 0, stars);
    save.unlocked = Math.max(save.unlocked, i + 2);
    const best = save.best[i] || {};
    rec.moves = best.moves !== undefined && G.moves < best.moves;
    rec.time = best.time !== undefined && G.time < best.time;
    save.best[i] = { moves: Math.min(best.moves ?? Infinity, G.moves), time: Math.min(best.time ?? Infinity, +G.time.toFixed(2)) };
    if (i === PER_WORLD - 1) unlock('resif');
    if (Object.keys(save.stars).length >= LEVELS.length) unlock('tum');
  } else {
    const today = todayStr();
    if (save.daily.date !== today || !save.daily.done) bonus = DAILY_REWARD;
    save.daily = { date: today, done: true, stars: Math.max(save.daily.date === today ? save.daily.stars : 0, stars) };
    unlock('gunluk');
  }
  addShells(G.shg + bonus);
  unlock('ilk');
  if (b.pearls.size === 0) unlock('inci');
  if (stars === 3) unlock('yildiz3');
  persist();
  const hasNext = G.mode === 'level' && G.idx + 1 < LEVELS.length;
  const starsEl = document.createElement('div'); starsEl.className = 'row';
  for (let i = 0; i < 3; i++) starsEl.appendChild(iconCanvas(STAR, i < stars ? STAR_P : STAR_DIM, 4));
  const best = G.mode === 'level' ? save.best[G.idx] : null;
  overlay(`<h2 style="color:var(--gold)">KAÇTIN!</h2><div id="wStars"></div>
    <div class="stats">
      <span>İnci</span><span>${G.pg}/${b.totalPearls}</span>
      <span>Hamle${rec.moves ? ' <b class="rec">REKOR</b>' : ''}</span><span>${G.moves}${best ? ' <span class="muted">/ en iyi ' + best.moves + '</span>' : ''}</span>
      <span>Süre${rec.time ? ' <b class="rec">REKOR</b>' : ''}</span><span>${fmtTime(G.time)}${best ? ' <span class="muted">/ ' + fmtTime(best.time) + '</span>' : ''}</span>
      <span>Kabuk</span><span>+${G.shg}${bonus ? ' (+' + bonus + ' günlük)' : ''}</span>
    </div>
    <div class="row"><button id="oRetry">TEKRAR</button>${hasNext ? '<button class="primary" id="oNext">SONRAKİ</button>' : '<button class="primary" id="oMenu">MENÜ</button>'}</div>`);
  $('wStars').replaceWith(starsEl);
  $('oRetry').onclick = () => { sfx('tap', 0.6); restartRun(); };
  if (hasNext) $('oNext').onclick = () => { sfx('tap', 0.6); startLevel(G.idx + 1); };
  else $('oMenu').onclick = () => { sfx('tap', 0.6); leaveGame(); };
}
function lostLevel() {
  G.phase = 'lost'; sfx('lose'); addShells(G.shg); persist();
  overlay(`<h2 style="color:var(--pink)">YAKALANDIN</h2><p>Canların bitti. Topladığın ${G.shg} kabuk yine de senin.</p>
    <div class="row"><button id="oMenu">MENÜ</button><button class="primary" id="oRetry">TEKRAR</button></div>`);
  $('oMenu').onclick = () => { sfx('tap', 0.6); leaveGame(); };
  $('oRetry').onclick = () => { sfx('tap', 0.6); restartRun(); };
}
function endlessOver() {
  G.phase = 'over'; sfx('lose');
  const m = G.e.meters, rec = m > save.endlessBest;
  if (rec) save.endlessBest = m;
  addShells(G.shg); persist();
  overlay(`<h2 style="color:#b38cff">MÜREKKEP YETİŞTİ</h2>
    <div class="stats"><span>Yükseklik${rec ? ' <b class="rec">REKOR</b>' : ''}</span><span>${m} m</span>
    <span>En iyi</span><span>${save.endlessBest} m</span><span>İnci</span><span>${G.pg}</span><span>Kabuk</span><span>+${G.shg}</span></div>
    <div class="row"><button id="oMenu">MENÜ</button><button class="primary" id="oRetry">TEKRAR</button></div>`);
  $('oMenu').onclick = () => { sfx('tap', 0.6); leaveGame(); };
  $('oRetry').onclick = () => { sfx('tap', 0.6); restartRun(); };
}
function leaveGame() {
  const mode = G ? G.mode : 'level';
  G = null; closeOverlay();
  showScreen(mode === 'level' ? 'levels' : 'home');
}

/* ---------- pause & tutorial cards ---------- */
function pauseGame() {
  if (!G || !['idle', 'moving', 'dying'].includes(G.phase)) return;
  G.prevPhase = G.phase; G.phase = 'paused';
  overlay(`<h2>DURAKLATILDI</h2>
    <div style="display:flex;flex-direction:column;gap:10px;width:100%">
    <button class="primary" id="oResume">DEVAM</button><button id="oRestart">YENİDEN BAŞLAT</button><button id="oMenu">${G.mode === 'level' ? 'BÖLÜMLER' : 'ANA MENÜ'}</button></div>`);
  $('oResume').onclick = resumeGame;
  $('oRestart').onclick = () => { sfx('tap', 0.6); restartRun(); };
  $('oMenu').onclick = () => { sfx('tap', 0.6); leaveGame(); };
}
function resumeGame() { if (!G || G.phase !== 'paused') return; G.phase = G.prevPhase; closeOverlay(); sfx('tap', 0.6); }
function showCard() {
  const f = G.cards[0]; const c = CARDS[f];
  G.prevPhase = G.phase === 'card' ? G.prevPhase : G.phase; G.phase = 'card';
  overlay(`<div class="small muted">YENİ</div><canvas class="cardart" id="cardArt" width="84" height="84"></canvas><h2>${c.title}</h2><p>${c.text}</p>
    <button class="primary" id="oOk">ANLADIM</button>`);
  drawCardArt($('cardArt').getContext('2d'), f);
  $('oOk').onclick = () => {
    save.seen['card_' + f] = true; persist(); sfx('tap', 0.6);
    G.cards.shift();
    if (G.cards.length) showCard(); else { G.phase = 'idle'; closeOverlay(); }
  };
}
