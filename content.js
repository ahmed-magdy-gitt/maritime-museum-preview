/* =====================================================================
   SCREEN CONTENT LIBRARY - abstract, text-free maritime visuals drawn in code.
   Each type is  draw(ctx, w, h, t, p)  where t = scene time in seconds (deterministic),
   p = params from CONFIG.contents[i].p.   Add your own type by adding a function to CONTENT.types,
   or give a content entry its own  draw: (ctx,w,h,t,p)=>{...}  in config.js.
   (Replace a type body with ctx.drawImage(yourVideoOrImage,0,0,w,h) to show real footage.)
   ===================================================================== */
(function () {
  const TAU = Math.PI * 2;
  const hsl = (h, s, l, a) => `hsla(${h},${s}%,${l}%,${a == null ? 1 : a})`;
  function rng(seed) { let s = (seed | 0) + 1013904223; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function rose(ctx, cx, cy, R, rot, col, col2) {           // compass rose
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, R * 0.025);
    for (const k of [1, 0.82, 0.55]) { ctx.beginPath(); ctx.arc(0, 0, R * k, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < 32; i++) { const a = i / 32 * TAU, l = i % 8 == 0 ? 1 : i % 4 == 0 ? 0.92 : 0.86;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82); ctx.lineTo(Math.cos(a) * R * l, Math.sin(a) * R * l); ctx.stroke(); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, L = i % 4 == 0 ? 0.95 : i % 2 == 0 ? 0.7 : 0.5, wdt = i % 4 == 0 ? 0.13 : 0.08;
      ctx.fillStyle = i % 4 == 0 ? col2 : col; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * L, Math.sin(a) * R * L);
      ctx.lineTo(Math.cos(a + 0.5 * wdt * 3) * R * wdt * 2, Math.sin(a + 0.5 * wdt * 3) * R * wdt * 2); ctx.lineTo(0, 0);
      ctx.lineTo(Math.cos(a - 0.5 * wdt * 3) * R * wdt * 2, Math.sin(a - 0.5 * wdt * 3) * R * wdt * 2); ctx.closePath(); ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.restore();
  }
  function dhow(ctx, x, y, s, col, sailCol) {               // little ship silhouette (lateen sail)
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-60, -8); ctx.quadraticCurveTo(-30, 18, 10, 14); ctx.lineTo(62, -22); ctx.quadraticCurveTo(10, -6, -60, -8); ctx.fill();
    ctx.fillStyle = sailCol; ctx.beginPath(); ctx.moveTo(-14, -9); ctx.lineTo(48, -20); ctx.lineTo(-4, -78); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-4, -80); ctx.moveTo(-18, -12); ctx.lineTo(52, -24); ctx.stroke();
    ctx.restore();
  }
  function seaLayers(ctx, w, h, t, y0, n, hue, amp, speed) {
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), y = y0 + (h - y0) * k * 0.95;
      ctx.fillStyle = hsl(hue + k * 12, 70 - k * 10, 18 + k * 22, 1);
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin(x * (0.012 + k * 0.008) + t * speed * (1 + k) + i * 1.7) * amp * (0.4 + k) + Math.sin(x * 0.031 - t * speed * 0.6 + i) * amp * 0.3);
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    }
  }

  const types = {
    waves(ctx, w, h, t, p) {
      const hue = p.hue || 200, g = ctx.createLinearGradient(0, 0, 0, h * 0.6);
      g.addColorStop(0, hsl(hue + 30, 60, 14)); g.addColorStop(1, hsl(hue - 160, 70, 55));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const sx = w * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.15))), sy = h * 0.38;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.45); sg.addColorStop(0, 'rgba(255,230,170,0.95)'); sg.addColorStop(0.15, 'rgba(255,200,120,0.5)'); sg.addColorStop(1, 'rgba(255,180,100,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);
      seaLayers(ctx, w, h, t, h * 0.45, 7, hue, 9, 1.2);
    },
    chart(ctx, w, h, t, p) {
      const hue = p.hue || 190, r = rng(p.seed || 3);
      ctx.fillStyle = hsl(hue, 55, 12); ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = hsl(hue, 50, 28, 0.6); ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let k = 0; k < 4; k++) {                          // land masses
        const cx = r() * w, cy = r() * h, R = 50 + r() * 70; ctx.fillStyle = hsl(40, 30, 30 + k * 3, 0.9); ctx.beginPath();
        for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU, rr = R * (0.6 + 0.4 * Math.sin(a * 3 + k) * Math.cos(a * 2 + cx)); ctx.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr * 0.8); }
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = hsl(hue, 60, 55, 0.7); ctx.stroke();
      }
      const pts = []; for (let i = 0; i < 6; i++) pts.push([w * (0.08 + i * 0.17) + r() * 20, h * (0.3 + 0.4 * r())]);
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 20; ctx.strokeStyle = 'rgba(255,200,90,0.95)'; ctx.lineWidth = 3; ctx.beginPath();
      pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); ctx.setLineDash([]);
      pts.forEach(q => { ctx.fillStyle = 'rgba(255,230,160,1)'; ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, TAU); ctx.fill(); });
      const u = (t * 0.07) % 1, sIdx = Math.min(4, Math.floor(u * 5)), f = u * 5 - sIdx, a = pts[sIdx], b = pts[sIdx + 1];
      const px = a[0] + (b[0] - a[0]) * f, py = a[1] + (b[1] - a[1]) * f;
      ctx.fillStyle = 'rgba(120,230,255,0.4)'; ctx.beginPath(); ctx.arc(px, py, 14 + 4 * Math.sin(t * 4), 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 6, 0, TAU); ctx.fill();
      rose(ctx, w - 70, h - 70, 55, 0, hsl(hue, 60, 70, 0.9), 'rgba(255,200,90,0.9)');
    },
    ships(ctx, w, h, t, p) {
      const hue = p.hue || 25, g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hsl(hue + 220, 50, 22)); g.addColorStop(0.5, hsl(hue + 10, 85, 58)); g.addColorStop(0.55, hsl(hue, 90, 70)); g.addColorStop(1, hsl(hue + 200, 50, 18));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,240,200,0.9)'; ctx.beginPath(); ctx.arc(w * 0.72, h * 0.46, 36, 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) { const sp = 12 + i * 5, x = ((t * sp + i * 260) % (w + 200)) - 100; dhow(ctx, x, h * (0.5 + i * 0.05) + Math.sin(t * 1.5 + i) * 3, 0.9 + i * 0.35, '#10161f', '#1d2733'); }
      seaLayers(ctx, w, h, t, h * 0.56, 4, hue + 200, 6, 1.5);
    },
    compass(ctx, w, h, t, p) {
      const hue = p.hue || 205, g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.6);
      g.addColorStop(0, hsl(hue, 60, 26)); g.addColorStop(1, hsl(hue + 10, 70, 8)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const R = h * 0.42; rose(ctx, w / 2, h / 2, R, Math.sin(t * 0.4) * 0.3, hsl(hue, 70, 75), 'rgba(255,205,100,1)');
      ctx.strokeStyle = 'rgba(120,200,255,0.5)'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(w / 2, h / 2, R * (1.1 + ((t * 0.3 + i / 4) % 1) * 0.6), 0, TAU); ctx.globalAlpha = 1 - ((t * 0.3 + i / 4) % 1); ctx.stroke(); } ctx.globalAlpha = 1;
    },
    ripple(ctx, w, h, t, p) {
      const hue = p.hue || 175; ctx.fillStyle = hsl(hue, 70, 9); ctx.fillRect(0, 0, w, h);
      for (let c = 0; c < 3; c++) { const cx = w * (0.2 + 0.3 * c + 0.08 * Math.sin(t * 0.3 + c)), cy = h * (0.5 + 0.2 * Math.cos(t * 0.25 + c * 2));
        for (let i = 0; i < 9; i++) { const k = ((t * 0.18 + i / 9 + c * 0.3) % 1); ctx.strokeStyle = hsl(hue + c * 15, 80, 62, (1 - k) * 0.9); ctx.lineWidth = 2 + (1 - k) * 4;
          ctx.beginPath(); ctx.arc(cx, cy, k * h * 0.9, 0, TAU); ctx.stroke(); } }
    },
    stars(ctx, w, h, t, p) {
      const hue = p.hue || 230, g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, hsl(hue, 60, 6)); g.addColorStop(1, hsl(hue - 20, 60, 20)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const r = rng(11); const st = []; for (let i = 0; i < 90; i++) st.push([r() * w, r() * h * 0.7, r()]);
      st.forEach(s => { ctx.fillStyle = `rgba(255,245,220,${0.4 + 0.6 * Math.abs(Math.sin(t * (1 + s[2]) + s[2] * 20))})`; ctx.beginPath(); ctx.arc(s[0], s[1], 0.8 + s[2] * 1.6, 0, TAU); ctx.fill(); });
      ctx.strokeStyle = 'rgba(160,200,255,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 9; i++) ctx.lineTo(st[i * 3][0], st[i * 3][1]); ctx.stroke();
      ctx.fillStyle = 'rgba(255,250,230,0.95)'; ctx.beginPath(); ctx.arc(w * 0.8, h * 0.2, 22, 0, TAU); ctx.fill();
      dhow(ctx, ((t * 9) % (w + 160)) - 80, h * 0.7, 1.1, '#04070c', '#0a1019'); seaLayers(ctx, w, h, t, h * 0.74, 4, hue - 10, 5, 1.1);
    },
    sunrise(ctx, w, h, t, p) {
      const hue = p.hue || 30, k = 0.5 + 0.5 * Math.sin(t * 0.25), g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hsl(hue + 215, 60, 18 + k * 10)); g.addColorStop(0.55, hsl(hue, 90, 45 + k * 20)); g.addColorStop(1, hsl(hue + 200, 50, 16)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const sy = h * (0.62 - 0.22 * k); ctx.save(); ctx.translate(w / 2, sy);
      for (let i = 0; i < 18; i++) { ctx.rotate(TAU / 18); ctx.fillStyle = `rgba(255,220,150,${0.12 + 0.06 * Math.sin(t + i)})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-18, -h); ctx.lineTo(18, -h); ctx.fill(); } ctx.restore();
      ctx.fillStyle = 'rgba(255,238,190,1)'; ctx.beginPath(); ctx.arc(w / 2, sy, 42, 0, TAU); ctx.fill();
      seaLayers(ctx, w, h, t, h * 0.64, 5, hue + 195, 7, 1.3);
    },
    medallion(ctx, w, h, t, p) {                             // static decoration (compass rose + shell spiral)
      ctx.fillStyle = '#d9c7a0'; ctx.fillRect(0, 0, w, h); const cx = w / 2, cy = h / 2, R = h * 0.48;
      ctx.fillStyle = '#c9a56b'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.fillStyle = '#efe2c4'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, 0, TAU); ctx.fill();
      rose(ctx, cx, cy, R * 0.88, 0, '#1d5873', '#b3541e');
      ctx.strokeStyle = '#8a4a1f'; ctx.lineWidth = 4; ctx.beginPath();
      for (let a = 0; a < 5.5 * Math.PI; a += 0.1) { const rr = R * 0.04 * Math.exp(a * 0.28); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.stroke();
    },
    // 360 dome ceiling: top-down azimuthal view (centre of canvas = zenith). Underwater-to-surface ocean journey.
    ocean(ctx, S, _h, t, p) {
      const c = S / 2, g = ctx.createRadialGradient(c, c, 0, c, c, c);
      const k = 0.5 + 0.5 * Math.sin(t * 0.12);
      g.addColorStop(0, hsl(195, 80, 62 + k * 8)); g.addColorStop(0.5, hsl(205, 80, 34)); g.addColorStop(1, hsl(222, 80, 11)); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
      ctx.save(); ctx.translate(c, c);
      for (let i = 0; i < 26; i++) {                         // expanding swell rings
        const f = ((t * 0.05 + i / 26) % 1), rr = f * c * 1.05, a = Math.sin(f * Math.PI);
        ctx.strokeStyle = hsl(185 + i * 2, 80, 70, a * 0.55); ctx.lineWidth = 2 + 10 * (1 - f); ctx.beginPath();
        for (let j = 0; j <= 120; j++) { const an = j / 120 * TAU, r2 = rr + Math.sin(an * 7 + t * 0.7 + i) * 8 * f + Math.sin(an * 13 - t) * 3; ctx.lineTo(Math.cos(an) * r2, Math.sin(an) * r2); } ctx.stroke();
      }
      for (let i = 0; i < 70; i++) {                         // god-rays / caustic flecks
        const an = i * 2.399 + t * 0.03, rr = ((i * 0.137 + t * 0.02) % 1) * c * 0.95; ctx.fillStyle = `rgba(220,250,255,${0.25 * (1 - rr / c)})`;
        ctx.beginPath(); ctx.arc(Math.cos(an) * rr, Math.sin(an) * rr, 2 + (i % 5), 0, TAU); ctx.fill();
      }
      for (let i = 0; i < 4; i++) { const an = t * 0.05 * (i % 2 ? -1 : 1) + i * 1.57, rr = c * (0.45 + 0.12 * i); ctx.save(); ctx.translate(Math.cos(an) * rr, Math.sin(an) * rr); ctx.rotate(an + 1.57 * (i % 2 ? -1 : 1)); dhow(ctx, 0, 0, 1.6, 'rgba(8,14,26,0.85)', 'rgba(18,30,48,0.85)'); ctx.restore(); }
      rose(ctx, 0, 0, c * 0.3, t * 0.06, 'rgba(255,235,190,0.85)', 'rgba(255,200,100,0.95)'); ctx.restore();
    },
  };
  window.CONTENT = { types, hsl, rng, rose, dhow };
})();
