/* ===== screens, HUD, input, boot ===== */
const SCREENS = ['home', 'levels', 'shop', 'achs', 'game'];
let current = 'home';
function showScreen(name) {
  current = name;
  for (const s of SCREENS) $(s).hidden = s !== name;
  if (name !== 'game') { playMusic('reef'); closeOverlay(); }
  refreshScreens();
}
function refreshScreens() {
  syncMute();
  if (current === 'home') renderHome();
  if (current === 'levels') renderLevels();
  if (current === 'shop') renderShop();
  if (current === 'achs') renderAchs();
  if (current === 'game') { renderPowerbar(); hudDirty = true; }
}
function shellLabel(el, n) { el.replaceChildren(iconCanvas(I_SHELLC, IP, 2), document.createTextNode(String(n))); }
function totalStars() { let s = 0; for (let i = 0; i < LEVELS.length; i++) s += save.stars[i] || 0; return s; }

function renderHome() {
  shellLabel($('homeShells'), save.shells);
  $('homeStars').textContent = `${totalStars()}/${LEVELS.length * 3} YILDIZ`;
  $('homeBest').textContent = save.endlessBest ? `EN İYİ ${save.endlessBest} m` : 'YENİ';
  const done = save.daily.date === todayStr() && save.daily.done;
  $('homeDaily').textContent = done ? 'BUGÜN BİTTİ' : `+${DAILY_REWARD} KABUK`;
  $('homeShop').textContent = '';
  $('homeAch').textContent = `${Object.keys(save.ach).length}/${ACH.length}`;
}
function renderLevels() {
  shellLabel($('lvShells'), save.shells);
  const box = $('worlds'); box.replaceChildren();
  WORLDS.forEach((w, wi) => {
    const sec = document.createElement('section'); sec.className = 'world';
    sec.style.setProperty('--wc', w.pal.edge); sec.style.setProperty('--wbg', w.pal.wall);
    let st = 0; for (let i = 0; i < PER_WORLD; i++) st += save.stars[wi * PER_WORLD + i] || 0;
    const head = document.createElement('header');
    head.innerHTML = `<b>${wi + 1}. ${w.name.toLocaleUpperCase('tr')}</b>`;
    const sc = document.createElement('span'); sc.className = 'row'; sc.style.gap = '4px';
    sc.append(iconCanvas(STAR, STAR_P, 1), document.createTextNode(`${st}/${PER_WORLD * 3}`));
    head.append(sc);
    const grid = document.createElement('div'); grid.className = 'lvgrid';
    for (let i = 0; i < PER_WORLD; i++) {
      const idx = wi * PER_WORLD + i, open = idx < save.unlocked, s = save.stars[idx] || 0;
      const bt = document.createElement('button'); bt.className = 'lv'; bt.disabled = !open;
      bt.setAttribute('aria-label', `Bölüm ${idx + 1}${open ? '' : ', kilitli'}`);
      bt.append(document.createTextNode(String(idx + 1)));
      const stars = document.createElement('span'); stars.className = 'st';
      for (let k = 0; k < 3; k++) stars.append(iconCanvas(STAR, k < s && open ? STAR_P : STAR_DIM, 1));
      bt.append(stars);
      bt.onclick = () => { initAudio(); sfx('tap', 0.6); startLevel(idx); };
      grid.append(bt);
    }
    sec.append(head, grid); box.append(sec);
  });
}

/* ---------- shop ---------- */
let shopTab = 'look';
function renderShop() {
  shellLabel($('shopShells'), save.shells);
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === shopTab)));
  const box = $('shopItems'); box.replaceChildren();
  const sec = t => { const d = document.createElement('div'); d.className = 'sec'; d.textContent = t; box.append(d); };
  const row = (icon, name, sub, btnText, onClick, disabled, on) => {
    const r = document.createElement('div'); r.className = 'item' + (on ? ' on' : '');
    const nm = document.createElement('div'); nm.className = 'nm'; nm.innerHTML = `${name}${sub ? `<small>${sub}</small>` : ''}`;
    const b = document.createElement('button'); b.textContent = btnText; b.disabled = !!disabled; b.onclick = onClick;
    r.append(icon, nm, b); box.append(r);
  };
  const octoIcon = (eq) => { const c = document.createElement('canvas'); c.width = c.height = 40; c.className = 'ico';
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; drawOctopus(x, 4, 8, 32, 0, { equip: eq }); return c; };
  if (shopTab === 'look') {
    const group = (title, kind, table, iconFor) => {
      sec(title);
      for (const [id, it] of Object.entries(table)) {
        const owned = save.owned[kind].includes(id), on = save.equip[kind] === id;
        const txt = on ? 'TAKILI' : owned ? 'TAK' : `AL · ${it.price}`;
        row(iconFor(id), it.name, owned ? '' : `${it.price} kabuk`, txt, () => {
          if (owned) { save.equip[kind] = id; sfx('tap', 0.6); }
          else { if (save.shells < it.price) return; save.shells -= it.price; save.owned[kind].push(id); save.equip[kind] = id; sfx('buy'); unlock('moda'); }
          persist(); renderShop();
        }, on || (!owned && save.shells < it.price), on);
      }
    };
    group('RENKLER', 'skin', SKINS, id => octoIcon({ skin: id, hat: 'none' }));
    group('ŞAPKALAR', 'hat', HATS, id => octoIcon({ skin: save.equip.skin, hat: id }));
    group('İZLER', 'trail', TRAILS, id => iconCanvas(id === 'ink' ? I_INK : id === 'sparkle' ? STAR : I_SHIELD, id === 'sparkle' ? STAR_P : IP, id === 'sparkle' ? 3 : 4));
  } else {
    sec('Oyun içinde alttaki çubuktan kullanılır. Mürekkep her bölümde bir kez ücretsiz.');
    const icons = { shield: I_SHIELD, magnet: I_MAGNET, life: I_HEART };
    for (const [id, it] of Object.entries(ITEMS)) {
      row(iconCanvas(icons[id], IP, 4), `${it.name} <span class="gold">×${save.items[id] || 0}</span>`, it.desc, `AL · ${it.price}`, () => {
        if (save.shells < it.price) return;
        save.shells -= it.price; save.items[id] = (save.items[id] || 0) + 1; sfx('buy'); persist(); renderShop();
      }, save.shells < it.price);
    }
  }
}
function drawShopPreview(t) {
  const c = $('shopPrev'), x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.fillStyle = '#0c1620'; x.fillRect(0, 0, 120, 120);
  x.strokeStyle = 'rgba(255,255,255,.25)';
  for (let i = 0; i < 4; i++) { const yy = 110 - ((t / 20 + i * 30) % 120); x.beginPath(); x.arc(22 + i * 24, yy, 3, 0, 6.283); x.stroke(); }
  drawOctopus(x, 30, 34 + Math.sin(t / 300) * 3, 60, Math.floor(t / 250) % 2);
}

/* ---------- achievements ---------- */
function renderAchs() {
  const n = Object.keys(save.ach).length; $('achCount').textContent = `${n}/${ACH.length}`;
  const box = $('achList'); box.replaceChildren();
  for (const a of ACH) {
    const done = !!save.ach[a.id];
    const r = document.createElement('div'); r.className = 'ach' + (done ? ' done' : '');
    const nm = document.createElement('div'); nm.className = 'nm'; nm.innerHTML = `${a.name}<small>${a.desc}</small>`;
    const rw = document.createElement('span'); rw.className = 'rw'; rw.textContent = done ? 'AÇILDI' : `+${ACH_REWARD}`;
    r.append(iconCanvas(I_TROPHY, done ? IP : { Y: '#2a3e46', D: '#1c2a30' }, 3), nm, rw); box.append(r);
  }
}

/* ---------- HUD & power bar ---------- */
function hud() {
  if (!G) return;
  shellLabel($('hudShells'), save.shells + G.shg);
  const hs = $('hudStars'); hs.replaceChildren();
  for (let i = 0; i < 3; i++) hs.append(iconCanvas(STAR, i < G.sg ? STAR_P : STAR_DIM, 2));
  const hh = $('hudHearts'); hh.replaceChildren();
  const slots = G.mode === 'endless' ? Math.max(1, G.lives) : Math.max(3, G.lives);
  for (let i = 0; i < slots; i++) hh.append(iconCanvas(I_HEART, i < G.lives ? IP : { R: '#2a3e46' }, 2));
  if (G.mode === 'endless') {
    $('hudMeters').textContent = `${G.e.meters} m`;
    $('hudSub').textContent = `REKOR ${Math.max(save.endlessBest, G.e.meters)} m`;
  } else {
    $('hudSub').textContent = `${G.pg}/${G.board.totalPearls} İNCİ`;
  }
}
function renderPowerbar() {
  const bar = $('powerbar'); bar.replaceChildren();
  if (!G) return;
  const mk = (icon, label, n, onClick, opts = {}) => {
    const b = document.createElement('button'); b.className = 'pw' + (opts.active ? ' active' : ''); b.setAttribute('aria-label', label);
    b.append(iconCanvas(icon, IP, 3));
    if (n !== null) { const s = document.createElement('span'); s.className = 'n'; s.textContent = n; b.append(s); }
    if (opts.bar !== undefined) { const s = document.createElement('span'); s.className = 'bar'; s.style.transform = `scaleX(${opts.bar})`; b.append(s); }
    b.disabled = !!opts.disabled; b.onclick = e => { e.stopPropagation(); onClick(); };
    bar.append(b); return b;
  };
  mk(I_INK, 'Mürekkep', G.inkUsed ? 0 : 1, useInk, { disabled: G.inkUsed });
  mk(I_SHIELD, 'Kalkan', save.items.shield || 0, () => usePower('shield'), { active: G.shield });
  G.magnetBtn = mk(I_MAGNET, 'Mıknatıs', save.items.magnet || 0, () => usePower('magnet'), { active: G.magnetT > 0, bar: G.magnetT > 0 ? G.magnetT / 8 : undefined });
  mk(I_HEART, 'Ekstra can', save.items.life || 0, () => usePower('life'));
}

/* ---------- overlays & toasts ---------- */
function overlay(html) { $('panel').innerHTML = html; $('over').hidden = false; const f = $('panel').querySelector('button.primary') || $('panel').querySelector('button'); if (f) f.focus({ preventScroll: true }); }
function closeOverlay() { $('over').hidden = true; }
function toast(title, sub, icon) {
  const t = document.createElement('div'); t.className = 'toast';
  if (icon) t.append(iconCanvas(icon, IP, 3));
  const d = document.createElement('div'); d.innerHTML = `${title}<small>${sub || ''}</small>`; t.append(d);
  $('toasts').append(t); setTimeout(() => t.remove(), 2600);
}

/* ---------- input ---------- */
let ds = null;
const stage = $('stage');
stage.addEventListener('pointerdown', e => { ds = [e.clientX, e.clientY]; });
stage.addEventListener('pointermove', e => {
  if (!ds) return;
  const dx = e.clientX - ds[0], dy = e.clientY - ds[1];
  if (Math.hypot(dx, dy) < 22) return;
  ds = null;
  if (Math.abs(dx) > Math.abs(dy)) swipe(dx > 0 ? 1 : -1, 0); else swipe(0, dy > 0 ? 1 : -1);
});
addEventListener('pointerup', () => { ds = null; });
addEventListener('pointercancel', () => { ds = null; });
addEventListener('keydown', e => {
  const m = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] }[e.code];
  if (current === 'game' && G) {
    if (m) { e.preventDefault(); swipe(...m); }
    else if (e.code === 'Space') { e.preventDefault(); useInk(); }
    else if (e.code === 'Escape' || e.code === 'KeyP') { G.phase === 'paused' ? resumeGame() : pauseGame(); }
  }
});
// audio may only start after a user gesture
addEventListener('pointerdown', initAudio, { capture: true });
addEventListener('keydown', initAudio, { capture: true });

$('goLevels').onclick = () => { sfx('tap', 0.6); showScreen('levels'); };
$('goEndless').onclick = () => { initAudio(); sfx('tap', 0.6); startEndless(); };
$('goDaily').onclick = () => { initAudio(); sfx('tap', 0.6); startDaily(); };
$('goShop').onclick = () => { sfx('tap', 0.6); showScreen('shop'); };
$('goAch').onclick = () => { sfx('tap', 0.6); showScreen('achs'); };
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { sfx('tap', 0.6); showScreen('home'); });
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { shopTab = b.dataset.tab; sfx('tap', 0.5); renderShop(); });
$('muteHome').onclick = () => setMuted(!save.muted);
$('muteGame').onclick = () => setMuted(!save.muted);
$('btnPause').onclick = () => { sfx('tap', 0.6); pauseGame(); };
$('handIco').getContext('2d').imageSmoothingEnabled = false;
spr($('handIco').getContext('2d'), I_HAND, IP, 0, 0, 16);

/* ---------- app lifecycle (Flutter calls these) ---------- */
window.__onPause = function () { appPaused = true; if (AC) AC.suspend(); if (G) pauseGame(); };
window.__onResume = function () { appPaused = false; if (AC && !save.muted) AC.resume(); };
window.__onBack = function () {          // returns true if the game handled Android's back button
  if (G && current === 'game') {
    if (G.phase === 'paused') { resumeGame(); return true; }
    if (G.phase === 'card') return true;
    if (['won', 'lost', 'over'].includes(G.phase)) { leaveGame(); return true; }
    pauseGame(); return true;
  }
  if (current !== 'home') { showScreen('home'); return true; }
  return false;
};
document.addEventListener('visibilitychange', () => { document.hidden ? window.__onPause() : window.__onResume(); });

/* ---------- main loop ---------- */
function loop(now) {
  requestAnimationFrame(loop);
  draw(now);
  if (hudDirty && G) { hud(); hudDirty = false; }
  if (G && G.magnetT > 0 && G.magnetBtn) { const s = G.magnetBtn.querySelector('.bar'); if (s) s.style.transform = `scaleX(${G.magnetT / 8})`; }
  if (current === 'shop') drawShopPreview(now);
}
showScreen('home');
requestAnimationFrame(loop);
window.__T = { get G() { return G; }, startLevel, startDaily, startEndless, swipe, useInk, usePower, LEVELS, get save() { return save; }, analyse, genDaily, EndlessBoard };
