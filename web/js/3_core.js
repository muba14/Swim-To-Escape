/* ===== data, save, audio, haptics, sprites ===== */
const LEVELS = {{LEVELS}};
const AUDIO = {{AUDIO}};
const MUSIC = {{MUSIC}};
const $ = id => document.getElementById(id);

const WORLDS = [
  { name: 'Sığ Resif', music: 'reef', pal: { water: '#0c1620', wall: '#14323a', dot: '#1c434c', edge: '#3fd6c8', pearl: '#e6f2f2' } },
  { name: 'Mercan Mağarası', music: 'coral', pal: { water: '#170b18', wall: '#3a1830', dot: '#4f2443', edge: '#ff8fab', pearl: '#ffe6ee' } },
  { name: 'Batık Gemi', music: 'wreck', tex: 'planks', pal: { water: '#0d1417', wall: '#3b2a1a', dot: '#4d3822', edge: '#e8a65a', pearl: '#fff1dc' } },
  { name: 'Derin Hendek', music: 'trench', dark: true, pal: { water: '#04060d', wall: '#111a3a', dot: '#1b2754', edge: '#7f8cff', pearl: '#dfe3ff' } },
];
const ENDLESS_PAL = { water: '#0a0d14', wall: '#1d1830', dot: '#2a2346', edge: '#b38cff', pearl: '#efe6ff' };
const PER_WORLD = 6;

/* ---------- save (localStorage + Flutter bridge) ---------- */
const SAVE_KEY = 'ste2';
function defaultSave() {
  return { v: 2, unlocked: 1, stars: {}, best: {}, shells: 0, totalShells: 0, muted: false,
    owned: { skin: ['orange'], hat: ['none'], trail: ['bubbles'] },
    equip: { skin: 'orange', hat: 'none', trail: 'bubbles' },
    items: { shield: 1, magnet: 1, life: 1 }, ach: {}, seen: {}, endlessBest: 0,
    daily: { date: '', done: false, stars: 0 } };
}
let save = defaultSave();
function mergeSave(s) {
  const d = defaultSave();
  if (!s || typeof s !== 'object') return d;
  const out = Object.assign(d, s);
  for (const k of ['owned', 'equip', 'items', 'daily']) out[k] = Object.assign(defaultSave()[k], s[k] || {});
  return out;
}
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) save = mergeSave(JSON.parse(raw));
  else {
    const old = JSON.parse(localStorage.getItem('ste') || 'null');   // first preview version
    if (old) { save.unlocked = Math.min(old.unlocked || 1, 7); save.shells = old.shells || 0;
      save.totalShells = save.shells; save.muted = !!old.muted;
      for (const k in old.stars || {}) if (+k < 6) save.stars[k] = old.stars[k]; }
  }
} catch (e) {}
function persist() {
  const j = JSON.stringify(save);
  try { localStorage.setItem(SAVE_KEY, j); } catch (e) {}
  try { window.SaveChannel && window.SaveChannel.postMessage(j); } catch (e) {}
}
// Flutter calls this after the page loads with the copy kept in SharedPreferences.
window.__nativeLoad = function (json) {
  try { if (json) { save = mergeSave(JSON.parse(json)); if (typeof refreshScreens === 'function') refreshScreens(); } } catch (e) {}
};
function haptic(kind) { try { window.HapticChannel && window.HapticChannel.postMessage(kind); } catch (e) {} }

/* ---------- audio ---------- */
let AC = null, master = null, musicBus = null, BUF = {}, curMusic = null, wantMusic = null, lastPearl = 0;
const MUSIC_VOL = 0.32;
function b64buf(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = AC.createGain(); master.connect(AC.destination);
  musicBus = AC.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(master);
  for (const [k, b] of Object.entries(AUDIO.sfx)) AC.decodeAudioData(b64buf(b)).then(buf => BUF[k] = buf).catch(() => {});
  if (wantMusic) playMusic(wantMusic);
}
function decodeMusic(name) {
  if (BUF['m_' + name] || !AC) return Promise.resolve(BUF['m_' + name]);
  return AC.decodeAudioData(b64buf(AUDIO.music[name])).then(b => (BUF['m_' + name] = b)).catch(() => null);
}
function playMusic(name) {
  wantMusic = name;
  if (!AC || save.muted) return;
  if (curMusic && curMusic.name === name) return;
  decodeMusic(name).then(buf => {
    if (!buf || wantMusic !== name || save.muted || (curMusic && curMusic.name === name)) return;
    stopMusic(0.6);
    const src = AC.createBufferSource(), g = AC.createGain();
    src.buffer = buf; src.loop = true;
    src.loopStart = MUSIC.pad; src.loopEnd = MUSIC.pad + MUSIC.loops[name];
    g.gain.setValueAtTime(0, AC.currentTime); g.gain.linearRampToValueAtTime(1, AC.currentTime + 0.6);
    src.connect(g); g.connect(musicBus); src.start(0, MUSIC.pad);
    curMusic = { name, src, g };
  });
}
function stopMusic(fade = 0.3) {
  if (!curMusic || !AC) { curMusic = null; return; }
  const { src, g } = curMusic; curMusic = null;
  try { g.gain.cancelScheduledValues(AC.currentTime); g.gain.setValueAtTime(g.gain.value, AC.currentTime);
    g.gain.linearRampToValueAtTime(0, AC.currentTime + fade); src.stop(AC.currentTime + fade + 0.05); } catch (e) {}
}
function sfx(name, vol = 1, rate = 1) {
  if (!AC || save.muted || !BUF[name]) return;
  const s = AC.createBufferSource(), g = AC.createGain();
  s.buffer = BUF[name]; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g); g.connect(master); s.start();
}
function pearlSfx(chain) { const n = performance.now(); if (n - lastPearl < 40) return; lastPearl = n; sfx('pearl' + Math.min(7, chain), 0.7); }
function setMuted(m) { save.muted = m; persist(); if (m) stopMusic(0.2); else { initAudio(); const w = wantMusic; curMusic = null; if (w) playMusic(w); } syncMute(); }
function syncMute() {
  for (const id of ['muteHome', 'muteGame']) { const b = $(id); if (!b) continue;
    b.textContent = save.muted ? '×' : '♪'; b.setAttribute('aria-label', save.muted ? 'Sesi aç' : 'Sesi kapat'); b.style.color = save.muted ? 'var(--dim)' : ''; }
}

/* ---------- pixel sprites ---------- */
const SKINS = {
  orange: { name: 'Turuncu', price: 0, O: '#e8682a', L: '#f68c3c', D: '#c4462a' },
  pink: { name: 'Pembe', price: 10, O: '#f06aa0', L: '#ff9cc4', D: '#c24277' },
  purple: { name: 'Mor', price: 15, O: '#9a5be0', L: '#b98af0', D: '#6c3aa8' },
  mint: { name: 'Nane', price: 20, O: '#3fcf9a', L: '#7ee8bf', D: '#24946c' },
  ghost: { name: 'Hayalet', price: 30, O: '#cfe3f0', L: '#ffffff', D: '#8fa9bf' },
  gold: { name: 'Altın', price: 40, O: '#f1b62a', L: '#ffd968', D: '#b9801a' },
};
const HATS = {
  none: { name: 'Şapkasız', price: 0, rows: null },
  pirate: { name: 'Korsan şapkası', price: 15, rows: ['...KKKKKK...', '..KKKWWKKK..', '.KKKKKKKKKK.', 'KYYYYYYYYYYK'] },
  sailor: { name: 'Denizci şapkası', price: 20, rows: ['....WWWW....', '...WWWWWW...', '..WWWWWWWW..', '..BBBBBBBB..'] },
  crown: { name: 'Taç', price: 30, rows: ['...Y.YY.Y...', '...YYYYYY...', '...YRYYBY...', '...YYYYYY...'] },
};
const HAT_PAL = { K: '#1b1b22', W: '#f4f4f4', Y: '#f5c542', B: '#3567d6', R: '#e5484d' };
const TRAILS = {
  bubbles: { name: 'Baloncuk izi', price: 0 },
  ink: { name: 'Parlayan mürekkep izi', price: 20 },
  sparkle: { name: 'Pırıltı izi', price: 25 },
};
const ITEMS = {
  shield: { name: 'Kalkan', desc: 'Bir çarpmayı emer', price: 8 },
  magnet: { name: 'Mıknatıs', desc: '8 sn incileri çeker', price: 6 },
  life: { name: 'Ekstra can', desc: 'Hemen +1 can', price: 10 },
};
const OCT_A = ['....LLLL....', '...LLLLLL...', '..LOOOOOOL..', '..OOOOOOOO..', '..OWBOOWBO..', '..OBBOOBBO..', '..OOOOOOOO..', '..DOOOOOOD..', '.ODODOODODO.', '.D.D.DD.D.D.', 'D..D.D..D..D', '............'];
const OCT_B = ['....LLLL....', '...LLLLLL...', '..LOOOOOOL..', '..OOOOOOOO..', '..OWBOOWBO..', '..OBBOOBBO..', '..OOOOOOOO..', '..DOOOOOOD..', '..ODODDODO..', '.D.D.DD.D.D.', '.D..D..D..D.', '............'];
const SHELL = ['..........', '....YY....', '..YYYYYY..', '.YLYLYLYY.', '.YLYLYLYY.', 'YYLYLYLYYY', '.YYLYLYYY.', '..DYYYYD..', '...DDDD...', '..........'];
const SHELL_P = { Y: '#f5b82e', L: '#ffe17a', D: '#c9861a' };
const STAR = ['..........', '....YY....', '....YY....', 'YYYYLLYYYY', '.YYLLLLYY.', '..YYLLYY..', '..YYYYYY..', '.YYY..YYY.', '.YY....YY.', '..........'];
const STAR_P = { Y: '#ffc93c', L: '#fff3a0' };
const STAR_DIM = { Y: '#2a3e46', L: '#34505a' };
const URCHIN = ['P...P...P.', '.P..P..P..', '..PDDDDP..', 'PPDDDDDDPP', '..DDKDKD..', '..DDDDDD..', 'PPDDDDDDPP', '..PDDDDP..', '.P..P..P..', 'P...P...P.'];
const URCHIN_P = { P: '#ff6f91', D: '#b0306a', K: '#2a0a1a' };
const URCHIN_STUN = { P: '#55606a', D: '#3a434b', K: '#1a1f24' };
const CRAB_A = ['..........', '..........', 'R........R', 'RR.W..W.RR', '.R.B..B.R.', '.RRRRRRRR.', 'RRRRRRRRRR', '.RRDDDDRR.', '.R.R..R.R.', 'R..R..R..R'];
const CRAB_B = ['..........', '..........', 'R........R', 'RR.W..W.RR', '.R.B..B.R.', '.RRRRRRRR.', 'RRRRRRRRRR', '.RRDDDDRR.', '..R.RR.R..', '.R..R..R..'];
const CRAB_P = { R: '#e5533b', D: '#a83222', W: '#ffffff', B: '#111111' };
const SHARK = ['..........', '.....G....', '....GG....', 'G.GGGGGGG.', 'GGGGGGGBGG', 'GGLLLLLLGG', 'G.LLLWLWL.', '....G.....', '..........', '..........'];
const SHARK_P = { G: '#7d8ea3', L: '#d6e0ea', B: '#111111', W: '#ffffff' };
const PUFF_S = ['..........', '..........', '...YYYY...', '..YYYYYY..', '.YYBYYYYY.', '.YYYYYYYYY', '..YWWWWY..', '...YYYY...', '..........', '..........'];
const PUFF_B = ['S..S..S..S', '.YYYYYYYY.', 'SYYYYYYYYS', '.YYBYYYBY.', 'SYYYYYYYYS', '.YWWWWWWY.', 'SYWWWWWWYS', '.YYYYYYYY.', 'S..S..S..S', '..........'];
const PUFF_P = { Y: '#f2c14e', W: '#fff3d0', B: '#111111', S: '#c98a1f' };
const CORAL = ['..P....P..', '.PP.P.PP..', '..PPP.P...', 'P..PPPP.P.', 'PP..PP..PP', '.PPPPPPPP.', '...PPPP...', '..PPPPPP..', '.PPDDDDPP.', 'PPDDDDDDPP'];
const CORAL_P = { P: '#ff7f6b', D: '#c4504a' };
const I_INK = ['...P....', '..PPP...', '.PPPPP..', 'PPPPPPP.', 'PPWPPPP.', 'PPPPPPP.', '.PPPPP..', '..PPP...'];
const I_SHIELD = ['..BBBB..', '.B....B.', 'B..W...B', 'B.W....B', 'B......B', 'B......B', '.B....B.', '..BBBB..'];
const I_MAGNET = ['WW....WW', 'RR....RR', 'RR....RR', 'RR....RR', 'RR....RR', '.RR..RR.', '..RRRR..', '........'];
const I_HEART = ['.RR..RR.', 'RRRRRRRR', 'RRRRRRRR', '.RRRRRR.', '..RRRR..', '...RR...', '........', '........'];
const I_SHELLC = ['...YY...', '.YYYYYY.', 'YLYLYLYY', 'YLYLYLYY', '.YLYLYY.', '..DDDD..', '........', '........'];
const I_TROPHY = ['YYYYYYYY', 'YYYYYYYY', '.YYYYYY.', '..YYYY..', '...YY...', '...YY...', '..YYYY..', '.DDDDDD.'];
const I_HAND = ['.....WW.........', '....WWWW........', '....WWWW........', '....WWWW........', '....WWWWWW......', '....WWWWWWWW....', '.WW.WWWWWWWWWW..', 'WWWWWWWWWWWWWW..', 'WWWWWWWWWWWWWW..', '.WWWWWWWWWWWWW..', '..WWWWWWWWWWWW..', '...WWWWWWWWWW...', '....WWWWWWWW....', '....WWWWWWWW....', '................', '................'];
const IP = { P: '#8a5be0', W: '#ffffff', B: '#7fe3ff', R: '#e5484d', Y: '#ffc93c', L: '#fff0a0', D: '#c9861a' };

function spr(ctx, rows, pal, x0, y0, size, o = {}) {
  const n = rows.length, m = rows[0].length, p = size / Math.max(n, m);
  ctx.save();
  ctx.translate(x0 + size / 2, y0 + size / 2);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale((o.sx || 1) * (o.flip ? -1 : 1), o.sy || 1);
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.translate(-m * p / 2, -size / 2 + (o.dy || 0) * p);
  for (let y = 0; y < n; y++) { const r = rows[y]; for (let x = 0; x < r.length; x++) {
    const c = pal[r[x]]; if (!c) continue; ctx.fillStyle = c; ctx.fillRect(x * p, y * p, p + 0.5, p + 0.5); } }
  ctx.restore();
}
function iconCanvas(rows, pal, px = 2, cls = 'ico') {
  const c = document.createElement('canvas'); c.width = rows[0].length * px; c.height = rows.length * px; c.className = cls;
  const x = c.getContext('2d'); spr(x, rows, pal, 0, 0, Math.max(c.width, c.height));
  return c;
}
function octoPal(skin) { const s = SKINS[skin] || SKINS.orange; return { O: s.O, L: s.L, D: s.D, W: '#ffffff', B: '#14101a' }; }
function drawOctopus(ctx, x, y, size, frame, o = {}) {
  const eq = o.equip || save.equip;
  spr(ctx, frame ? OCT_B : OCT_A, octoPal(eq.skin), x, y, size, o);
  const hat = HATS[eq.hat];
  if (hat && hat.rows) {
    const p = size / 12;
    spr(ctx, hat.rows, HAT_PAL, x, y - p * 2.6 * (o.sy || 1), size, Object.assign({}, o, { dy: 0 }));
  }
}
