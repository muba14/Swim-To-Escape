/* ===== rendering & effects ===== */
const cv = $('cv'), ctx = cv.getContext('2d');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PORTAL_COLS = { 1: '#3fd6c8', 2: '#ff8fab', 3: '#ffc93c', 4: '#b38cff' };
function portalColor(x, y) { return PORTAL_COLS[G.board.cell(Math.round(x), Math.round(y))] || '#ffffff'; }

/* ---------- particles (world units = cells) ---------- */
function burst(x, y, col, n, type = 'sq') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = 2 + Math.random() * 5;
    G.parts.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.3, max: 0.8,
      col, sz: type === 'ring' ? 0.5 : 0.16 + Math.random() * 0.1, type, drag: 4 });
  }
}
function sparkle(x, y, col) {
  if (reduceMotion) return;
  for (let i = 0; i < 3; i++) { const a = Math.random() * 6.283;
    G.parts.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 0.3, max: 0.3, col, sz: 0.1, type: 'sq', drag: 6 }); }
}
function trail(dt) {
  G.trailT += dt; if (G.trailT < 0.03) return; G.trailT = 0;
  const t = save.equip.trail, x = G.ox + 0.5 - G.cdx * 0.4, y = G.oy + 0.5 - G.cdy * 0.4;
  const j = () => (Math.random() - 0.5) * 0.4;
  if (t === 'ink') G.parts.push({ x: x + j(), y: y + j(), vx: 0, vy: 0, life: 0.55, max: 0.55, col: '#9b6bff', sz: 0.3, type: 'glow', drag: 0 });
  else if (t === 'sparkle') G.parts.push({ x: x + j(), y: y + j(), vx: 0, vy: -0.3, life: 0.5, max: 0.5, col: '#ffe17a', sz: 0.22, type: 'plus', drag: 0 });
  else G.parts.push({ x: x + j(), y: y + j(), vx: 0, vy: -0.8, life: 0.6, max: 0.6, col: '#ffffff', sz: 0.06 + Math.random() * 0.08, type: 'bubble', drag: 0 });
}
function updateParticles(dt) {
  if (!G) return;
  for (const p of G.parts) {
    p.life -= dt;
    if (p.type === 'fly') { const k = 1 - p.life / p.max; p.x += (p.tx - p.x) * k * 0.5; p.y += (p.ty - p.y) * k * 0.5; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
  }
  G.parts = G.parts.filter(p => p.life > 0);
  for (const c of G.confetti) { c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 260 * dt; c.r += c.vr * dt; }
  G.confetti = G.confetti.filter(c => c.life > 0);
  if (G.shakeT > 0) G.shakeT -= dt;
}
function shake(amp, t) { if (reduceMotion) return; G.shakeAmp = amp; G.shakeT = t; }
function confettiBurst() {
  if (reduceMotion) return;
  const W = cv.clientWidth, cols = ['#ffc93c', '#ff6f91', '#3fd6c8', '#b38cff', '#e8682a', '#ffffff'];
  for (let i = 0; i < 90; i++) G.confetti.push({ x: W / 2 + (Math.random() - 0.5) * 60, y: cv.clientHeight * 0.35,
    vx: (Math.random() - 0.5) * 520, vy: -200 - Math.random() * 380, life: 1.6 + Math.random(), col: pick(Math.random, cols),
    w: 4 + Math.random() * 5, h: 3 + Math.random() * 3, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
}

/* ---------- board drawing ---------- */
let lastT = 0;
function draw(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
  if (!appPaused) update(dt);
  if (!G || $('game').hidden) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
  const b = G.board, pal = G.pal, endless = G.mode === 'endless';
  ctx.fillStyle = '#05080b'; ctx.fillRect(0, 0, W, H);
  const c = Math.floor(Math.min(W / b.w, 40));
  const mapW = c * b.w, offX = Math.floor((W - mapW) / 2);
  let target;
  if (endless) target = H * 0.6 - (G.oy + 0.5) * c;
  else { const mapH = c * b.h; target = mapH <= H ? (H - mapH) / 2 : Math.max(H - mapH, Math.min(0, H / 2 - (G.oy + 0.5) * c)); }
  G.camY = G.camY === null ? target : G.camY + (target - G.camY) * Math.min(1, dt * 9);
  let offY = Math.round(G.camY), sx = 0, sy = 0;
  if (G.shakeT > 0) { sx = (Math.random() - 0.5) * 2 * G.shakeAmp; sy = (Math.random() - 0.5) * 2 * G.shakeAmp; }
  ctx.save(); ctx.translate(offX + sx, offY + sy);
  const [r0, r1] = b.rowsRange();
  const y0 = Math.max(r0, Math.floor(-offY / c) - 1), y1 = Math.min(r1, Math.ceil((H - offY) / c) + 1);
  const t = G.clock;
  ctx.fillStyle = pal.water; ctx.fillRect(0, y0 * c, mapW, (y1 - y0 + 1) * c);
  const et = Math.max(2, Math.round(c / 10));
  const solid = (x, y) => { const ch = b.cell(x, y); return ch === '#' || ch === '%'; };
  const inside = (x, y) => x >= 0 && x < b.w && y >= r0 && y <= r1;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < b.w; x++) {
    const X = x * c, Y = y * c, ch = b.cell(x, y);
    if (ch === '#') {
      ctx.fillStyle = pal.wall; ctx.fillRect(X, Y, c, c);
      if (G.tex === 'planks') { ctx.fillStyle = pal.dot; ctx.fillRect(X, Y + Math.round(c / 3), c, 1); ctx.fillRect(X, Y + Math.round(2 * c / 3), c, 1);
        if ((x + y) % 3 === 0) ctx.fillRect(X + Math.round(c * 0.2), Y + Math.round(c * 0.15), 2, 2); }
      else if (((x * 7 + y * 13) % 5 + 5) % 5 === 0) { ctx.fillStyle = pal.dot; ctx.fillRect(X + c * 0.3, Y + c * 0.6, Math.max(2, c * 0.1), Math.max(2, c * 0.1)); }
      ctx.fillStyle = pal.edge;
      if (inside(x, y - 1) && !solid(x, y - 1)) ctx.fillRect(X, Y, c, et);
      if (inside(x, y + 1) && !solid(x, y + 1)) ctx.fillRect(X, Y + c - et, c, et);
      if (inside(x - 1, y) && !solid(x - 1, y)) ctx.fillRect(X, Y, et, c);
      if (inside(x + 1, y) && !solid(x + 1, y)) ctx.fillRect(X + c - et, Y, et, c);
      continue;
    }
    if (ch === '%') { ctx.fillStyle = pal.wall; ctx.fillRect(X, Y, c, c); spr(ctx, CORAL, CORAL_P, X, Y, c); continue; }
    if (CUR[ch]) drawCurrent(X, Y, c, CUR[ch], t, pal);
    else if (ch >= '1' && ch <= '4') drawPortal(X, Y, c, PORTAL_COLS[ch], t);
    else if (ch === 'E') drawExit(X, Y, c, t);
    else if (ch === '^') {
      const st = isStunnedUrchin(x, y), k = 0.85 + (st ? 0 : 0.05 * Math.sin(t * 6 + x));
      spr(ctx, URCHIN, st ? URCHIN_STUN : URCHIN_P, X, Y, c, { sx: k, sy: k, alpha: st ? 0.7 : 1 });
    }
    const k = K(x, y);
    if (b.pearls.has(k)) { const ps = Math.max(2, Math.round(c * 0.18)); ctx.fillStyle = pal.pearl; ctx.fillRect(X + (c - ps) / 2, Y + (c - ps) / 2, ps, ps); }
    else if (b.shells.has(k)) spr(ctx, SHELL, SHELL_P, X, Y, c, { sx: 0.8, sy: 0.8 });
    else if (b.stars.has(k)) { const s = 0.8 + 0.08 * Math.sin(t * 4 + x); spr(ctx, STAR, STAR_P, X, Y, c, { sx: s, sy: s }); }
  }
  // puffers
  for (const p of b.puffers) {
    if (p.y < y0 - 1 || p.y > y1 + 1) continue;
    const st = pufferState(p), X = p.x * c, Y = p.y * c;
    if (st === 'big') spr(ctx, PUFF_B, PUFF_P, X, Y, c, { sx: 1.15, sy: 1.15 });
    else spr(ctx, PUFF_S, PUFF_P, X + (st === 'warn' ? (Math.random() - 0.5) * c * 0.15 : 0), Y, c, { alpha: p.stun > 0 ? 0.5 : 1 });
  }
  // enemies
  for (const e of b.enemies) {
    const [ex, ey] = enemyPos(e), X = ex * c, Y = ey * c;
    if (ey < y0 - 1 || ey > y1 + 1) continue;
    const o = { alpha: e.stun > 0 ? 0.45 : 1 };
    if (e.t === 'crab') spr(ctx, Math.floor(t * 8) % 2 ? CRAB_A : CRAB_B, CRAB_P, X, Y, c, o);
    else {
      const vert = e.path[0][0] === e.path[e.path.length - 1][0];
      spr(ctx, SHARK, SHARK_P, X, Y, c, Object.assign(o, vert ? { rot: e.face > 0 ? Math.PI / 2 : -Math.PI / 2 } : { flip: e.face < 0 }));
    }
  }
  // particles (under the octopus)
  for (const p of G.parts) {
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = p.type === 'glow' ? a * 0.8 : a;
    ctx.fillStyle = p.col; ctx.strokeStyle = p.col;
    const px = p.x * c, py = p.y * c, s = p.sz * c;
    if (p.type === 'ring') { ctx.lineWidth = Math.max(1, c / 16); ctx.beginPath(); ctx.arc(px, py, s * (1.4 - a), 0, 6.283); ctx.stroke(); }
    else if (p.type === 'bubble') { ctx.lineWidth = Math.max(1, c / 24); ctx.beginPath(); ctx.arc(px, py, s, 0, 6.283); ctx.stroke(); }
    else if (p.type === 'plus') { const q = Math.max(1, Math.round(s / 3)); ctx.fillRect(px - s / 2, py - q / 2, s, q); ctx.fillRect(px - q / 2, py - s / 2, q, s); }
    else { const q = Math.max(1, Math.round(s * (p.type === 'glow' ? a : 1))); ctx.fillRect(px - q / 2, py - q / 2, q, q); }
  }
  ctx.globalAlpha = 1;
  // ink cloud
  if (G.inkFx) { const f = G.inkFx, a = 1 - f.t / 0.8; ctx.fillStyle = `rgba(40,20,80,${0.45 * a})`;
    ctx.beginPath(); ctx.arc((f.x + 0.5) * c, (f.y + 0.5) * c, (1 + f.t * 4) * c, 0, 6.283); ctx.fill(); }
  // octopus
  if (G.phase !== 'dying' && !(G.invuln > 0 && Math.floor(t * 12) % 2)) {
    const mv = G.phase === 'moving'; const frame = Math.floor(t * (mv ? 14 : 4)) % 2;
    let ssx = 1, ssy = 1;
    if (mv) { if (G.cdx) { ssx = 1.15; ssy = 0.88; } else { ssx = 0.88; ssy = 1.15; } }
    else if (G.squash > 0) { const q = G.squash * 0.3; if (G.lastDx) { ssx = 1 - q; ssy = 1 + q; } else { ssx = 1 + q; ssy = 1 - q; } }
    drawOctopus(ctx, G.ox * c, G.oy * c, c, frame, { sx: ssx, sy: ssy });
    if (G.shield) { ctx.strokeStyle = 'rgba(127,227,255,.85)'; ctx.lineWidth = Math.max(1.5, c / 14); ctx.beginPath();
      ctx.arc((G.ox + 0.5) * c, (G.oy + 0.5) * c, c * (0.68 + 0.04 * Math.sin(t * 5)), 0, 6.283); ctx.stroke(); }
    if (G.magnetT > 0) { ctx.strokeStyle = `rgba(229,72,77,${0.25 + 0.15 * Math.sin(t * 10)})`; ctx.lineWidth = 1; ctx.beginPath();
      ctx.arc((G.ox + 0.5) * c, (G.oy + 0.5) * c, c * 2.5, 0, 6.283); ctx.stroke(); }
  }
  // endless ink
  if (G.e) {
    const iy = G.e.inkY * c;
    ctx.fillStyle = '#1a0f2e';
    ctx.beginPath(); ctx.moveTo(-offX - 10, H - offY + 10);
    for (let x = -offX - 10; x <= W - offX + 10; x += 6) ctx.lineTo(x, iy + Math.sin(x / 14 + t * 3) * c * 0.12);
    ctx.lineTo(W - offX + 10, H - offY + 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5b3a99';
    for (let x = -offX; x <= W - offX; x += 6) ctx.fillRect(x, iy + Math.sin(x / 14 + t * 3) * c * 0.12 - 1, 6, 2);
  }
  ctx.restore();
  // deep trench: limited light around the octopus
  if (G.dark) {
    const gx = offX + (G.ox + 0.5) * c, gy = offY + (G.oy + 0.5) * c;
    const gr = ctx.createRadialGradient(gx, gy, c * 2.2, gx, gy, c * 7.5);
    gr.addColorStop(0, 'rgba(2,3,8,0)'); gr.addColorStop(1, 'rgba(2,3,8,.78)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  for (const k of G.confetti) { ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.r); ctx.fillStyle = k.col; ctx.fillRect(-k.w / 2, -k.h / 2, k.w, k.h); ctx.restore(); }
}
function drawCurrent(X, Y, c, [dx, dy], t, pal) {
  ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(X, Y, c, c);
  ctx.save(); ctx.beginPath(); ctx.rect(X, Y, c, c); ctx.clip();
  ctx.translate(X + c / 2, Y + c / 2); ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = pal.edge; ctx.globalAlpha = 0.55;
  const off = ((t * 1.6) % 1) * c * 0.5, q = Math.max(2, Math.round(c / 10));
  for (let i = -2; i <= 2; i++) {
    const cx = i * c * 0.5 + off;
    for (let j = 0; j < 3; j++) { ctx.fillRect(cx - j * q, -j * q - q / 2, q, q); ctx.fillRect(cx - j * q, j * q - q / 2, q, q); }
  }
  ctx.restore();
}
function drawPortal(X, Y, c, col, t) {
  const cx = X + c / 2, cy = Y + c / 2, d = Math.max(2, Math.round(c / 10));
  ctx.fillStyle = col;
  for (let ring = 0; ring < 2; ring++) {
    const r = c * (ring ? 0.18 : 0.36), n = ring ? 5 : 8, sp = ring ? -3 : 2;
    for (let i = 0; i < n; i++) { const a = t * sp + i * 6.283 / n; ctx.fillRect(cx + Math.cos(a) * r - d / 2, cy + Math.sin(a) * r - d / 2, d, d); }
  }
}
function drawExit(X, Y, c, t) {
  ctx.fillStyle = '#ff6f91'; const d = Math.max(2, Math.round(c / 9));
  for (let i = 0; i < 8; i++) { const a = t * 2 + i * Math.PI / 4; ctx.fillRect(X + c / 2 + Math.cos(a) * c * 0.33 - d / 2, Y + c / 2 + Math.sin(a) * c * 0.33 - d / 2, d, d); }
}
function drawCardArt(x, f) {
  x.imageSmoothingEnabled = false; x.fillStyle = '#0c1620'; x.fillRect(0, 0, 84, 84);
  const s = 60, o = 12;
  if (f === 'urchin') spr(x, URCHIN, URCHIN_P, o, o, s);
  if (f === 'coral') { x.fillStyle = '#3a1830'; x.fillRect(o, o, s, s); spr(x, CORAL, CORAL_P, o, o, s); }
  if (f === 'crab') spr(x, CRAB_A, CRAB_P, o, o, s);
  if (f === 'puffer') spr(x, PUFF_B, PUFF_P, o, o, s);
  if (f === 'shark') spr(x, SHARK, SHARK_P, o, o, s);
  if (f === 'current') { x.fillStyle = '#3fd6c8'; for (let j = 0; j < 3; j++) for (let k = 0; k < 4; k++) { x.fillRect(30 + j * 14 - k * 4, 30 - k * 4, 4, 4); x.fillRect(30 + j * 14 - k * 4, 50 + k * 4 - 12, 4, 4); } }
  if (f === 'portal') { x.fillStyle = '#ff8fab'; for (let i = 0; i < 8; i++) { const a = i * 6.283 / 8; x.fillRect(42 + Math.cos(a) * 22 - 3, 42 + Math.sin(a) * 22 - 3, 6, 6); }
    for (let i = 0; i < 5; i++) { const a = i * 6.283 / 5 + 0.5; x.fillRect(42 + Math.cos(a) * 10 - 3, 42 + Math.sin(a) * 10 - 3, 6, 6); } }
}
