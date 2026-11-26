/* =====================================================================
   ENGINE - raw WebGL2. Builds the whole museum procedurally from CONFIG (config.js), draws screen
   content (content.js), renders cube faces -> equirectangular, or a normal perspective view.
   You normally do not need to edit this file; edit config.js.
   ===================================================================== */
(function () {
  const C = window.CONFIG, A = C.arch, COL = C.colors, D2R = Math.PI / 180, TAU = Math.PI * 2;
  const hex = c => { if (Array.isArray(c)) return c; const n = parseInt(c.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const ZONES = { hall: 0, dome: 1, out: 2, ring: 3 };
  const M = { plain: 0, stone: 1, wood: 2, sand: 3, fabric: 4, plaster: 5, screen: 6, dome: 7, glass: 8, shell: 9, frond: 10, emis: 11, black: 12, stripes: 13, sea: 14, glow: 16, leaf: 17, decal: 18, sky: 19, metal: 20, sail: 21 };
  let seedState = 12345; const rnd = () => { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState / 4294967296; };

  /* ---------- tiny matrix helpers (column-major 4x4) ---------- */
  const mat4 = {
    id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; },
    persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; },
    look(e, f, u) { // eye, forward, up (up need not be orthogonal)
      const nz = norm([-f[0], -f[1], -f[2]]), nx = norm(cross(u, nz)), ny = cross(nz, nx);
      return [nx[0], ny[0], nz[0], 0, nx[1], ny[1], nz[1], 0, nx[2], ny[2], nz[2], 0, -dot(nx, e), -dot(ny, e), -dot(nz, e), 1];
    },
  };
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

  /* ---------- mesh builder ---------- */
  class Mesh {
    constructor() { this.opq = []; this.blend = []; this.add = []; this.out = this.opq; this.m = mat4.id(); this.stack = []; this.zone = 0; this.col = [1, 1, 1]; this.fps = []; this.lights = []; this.screenList = []; }
    pass(n) { this.out = this[n]; }
    push() { this.stack.push(this.m.slice()); }
    pop() { this.m = this.stack.pop(); }
    tr(x, y, z) { this.m = mat4.mul(this.m, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); }
    rotY(d) { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); this.m = mat4.mul(this.m, [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]); }
    rotX(d) { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); this.m = mat4.mul(this.m, [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); }
    rotZ(d) { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); this.m = mat4.mul(this.m, [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
    sc(k) { this.m = mat4.mul(this.m, [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1]); }
    wp(p) { const m = this.m; return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
    wn(n) { const m = this.m; return norm([m[0] * n[0] + m[4] * n[1] + m[8] * n[2], m[1] * n[0] + m[5] * n[1] + m[9] * n[2], m[2] * n[0] + m[6] * n[1] + m[10] * n[2]]); }
    vert(p, n, uv, o) {
      const w = this.wp(p), nn = this.wn(n), c = o.cc || o.col || this.col;
      this.out.push(w[0], w[1], w[2], nn[0], nn[1], nn[2], c[0], c[1], c[2], uv[0], uv[1], o.mat || 0, o.zone != null ? o.zone : this.zone);
    }
    quad(p, n, uv, o) { // p[4] ccw-ish, n = single normal or array of 4
      const nn = n[0].length ? n : [n, n, n, n];
      for (const i of [0, 1, 2, 0, 2, 3]) this.vert(p[i], nn[i], uv[i], o);
    }
    footprint(pts, blur, k) { this.fps.push({ pts: pts.map(p => this.wp(p)).map(w => [w[0], w[2]]), blur: blur || 1, k: k == null ? 1 : k }); }
    box(cx, y0, cz, w, h, d, o) {
      o = o || {}; const x0 = cx - w / 2, x1 = cx + w / 2, y1 = y0 + h, z0 = cz - d / 2, z1 = cz + d / 2, top = o.top || o.col || this.col, ou = o;
      const F = (p, n, uv, c) => this.quad(p, n, uv, Object.assign({}, ou, { cc: c }));
      F([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], top);
      if (o.bottom) F([[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]], [0, -1, 0], [[x0, z0], [x0, z1], [x1, z1], [x1, z0]], o.col || this.col);
      const sc = o.col || this.col;
      F([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[z1, y0], [z0, y0], [z0, y1], [z1, y1]], sc);
      F([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0, y0], [z1, y0], [z1, y1], [z0, y1]], sc);
      F([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], sc);
      F([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[x1, y0], [x0, y0], [x0, y1], [x1, y1]], sc);
      if (y0 < 0.5 && o.ao !== false) this.footprint([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], o.aoBlur, o.aoK);
    }
    surf(fn, nu, nv, o) {
      o = o || {}; const e = 1e-3, G = [];
      for (let i = 0; i <= nu; i++) { const u = i / nu; G.push([]); for (let j = 0; j <= nv; j++) { const v = j / nv, p = fn(u, v);
        const pu = fn(Math.min(1, u + e), v), pu2 = fn(Math.max(0, u - e), v), pv = fn(u, Math.min(1, v + e)), pv2 = fn(u, Math.max(0, v - e));
        let n = cross(sub(pu, pu2), sub(pv, pv2)); if (Math.hypot(...n) < 1e-12) n = [0, 1, 0]; n = norm(n);
        G[i].push({ p, n, u, v, c: o.colFn ? o.colFn(u, v) : (o.col || this.col), uv: o.uvFn ? o.uvFn(u, v, p) : [u * (o.us || 1), v * (o.vs || 1)] }); } }
      const V = q => this.vert(q.p, q.n, q.uv, Object.assign({}, o, { cc: q.c }));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = G[i][j], b = G[i + 1][j], c = G[i + 1][j + 1], d = G[i][j + 1]; V(a); V(b); V(c); V(a); V(c); V(d); }
    }
    cyl(cx, y0, cz, r0, r1, h, seg, o) {
      o = o || {}; seg = seg || 20;
      this.surf((u, v) => { const a = u * TAU; return [cx + Math.cos(a) * (r0 + (r1 - r0) * v), y0 + h * v, cz + Math.sin(a) * (r0 + (r1 - r0) * v)]; }, seg, 1, Object.assign({ uvFn: (u, v) => [u * TAU * r0, v * h] }, o));
      const cap = (y, r, n) => { const ctr = [cx, y, cz]; for (let i = 0; i < seg; i++) { const a = i / seg * TAU, b = (i + 1) / seg * TAU; const P = [[cx + Math.cos(a) * r, y, cz + Math.sin(a) * r], [cx + Math.cos(b) * r, y, cz + Math.sin(b) * r]];
        this.vert(ctr, n, [cx, cz], Object.assign({}, o, { cc: o.top || o.col || this.col })); this.vert(P[0], n, [P[0][0], P[0][2]], Object.assign({}, o, { cc: o.top || o.col || this.col })); this.vert(P[1], n, [P[1][0], P[1][2]], Object.assign({}, o, { cc: o.top || o.col || this.col })); } };
      if (o.cap !== false) cap(y0 + h, r1, [0, 1, 0]); if (o.bottom) cap(y0, r0, [0, -1, 0]);
      if (y0 < 0.5 && o.ao !== false && r0 > 0.05) { const pts = []; for (let i = 0; i < 12; i++) pts.push([cx + Math.cos(i / 12 * TAU) * r0, 0, cz + Math.sin(i / 12 * TAU) * r0]); this.footprint(pts, o.aoBlur, o.aoK); }
    }
    tube(p0, p1, r, o, seg) { // cylinder between two points
      const d = norm(sub(p1, p0)), up = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0], e1 = norm(cross(d, up)), e2 = cross(d, e1), L = Math.hypot(...sub(p1, p0));
      this.surf((u, v) => { const a = u * TAU; return [0, 1, 2].map(k => p0[k] + d[k] * L * v + (e1[k] * Math.cos(a) + e2[k] * Math.sin(a)) * r); }, seg || 10, 1, Object.assign({ uvFn: (u, v) => [v * L, u * TAU * r] }, o || {}));
    }
    poly(pts, y, o, uvs) { // flat polygon facing up (pts = [[x,z],...]) by ear clipping
      const idx = earClip(pts); for (const i of idx) this.vert([pts[i][0], y, pts[i][1]], o.flip ? [0, -1, 0] : [0, 1, 0], uvs ? uvs(pts[i]) : [pts[i][0], pts[i][1]], o);
    }
    arc(cx, cz, r0, r1, a0, a1, y0, y1, o) { // thick curved wall between angles (deg); o.colIn / o.colOut / o.top
      o = o || {}; const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (o.step || 4))), P = (r, a, y) => [cx + Math.cos(a * D2R) * r, y, cz + Math.sin(a * D2R) * r], rad = a => [Math.cos(a * D2R), 0, Math.sin(a * D2R)];
      const cI = o.colIn || o.col || this.col, cO = o.colOut || o.col || this.col, cT = o.top || o.col || this.col;
      for (let i = 0; i < n; i++) {
        const a = a0 + (a1 - a0) * i / n, b = a0 + (a1 - a0) * (i + 1) / n, ra = rad(a), rb = rad(b), ri = [-ra[0], 0, -ra[2]], rbi = [-rb[0], 0, -rb[2]];
        const s0 = a * D2R * r1, s1 = b * D2R * r1, t0 = a * D2R * r0, t1 = b * D2R * r0;
        if (o.outer !== false) this.quad([P(r1, a, y0), P(r1, b, y0), P(r1, b, y1), P(r1, a, y1)], [ra, rb, rb, ra], [[s0, y0], [s1, y0], [s1, y1], [s0, y1]], Object.assign({}, o, { cc: cO }));
        if (o.inner !== false) this.quad([P(r0, b, y0), P(r0, a, y0), P(r0, a, y1), P(r0, b, y1)], [rbi, ri, ri, rbi], [[t1, y0], [t0, y0], [t0, y1], [t1, y1]], Object.assign({}, o, { cc: cI }));
        if (o.topFace !== false) this.quad([P(r0, a, y1), P(r0, b, y1), P(r1, b, y1), P(r1, a, y1)], [0, 1, 0], [[t0, r0], [t1, r0], [s1, r1], [s0, r1]], Object.assign({}, o, { cc: cT }));
      }
      if (o.caps !== false) { // end faces
        for (const [a, sgn] of [[a0, -1], [a1, 1]]) { const tg = [-Math.sin(a * D2R) * sgn, 0, Math.cos(a * D2R) * sgn];
          this.quad([P(r0, a, y0), P(r1, a, y0), P(r1, a, y1), P(r0, a, y1)], tg, [[0, y0], [r1 - r0, y0], [r1 - r0, y1], [0, y1]], Object.assign({}, o, { cc: cO })); }
      }
      if (y0 < 0.5 && o.ao !== false) { const pts = []; for (let i = 0; i <= n; i++) pts.push([...P(r1, a0 + (a1 - a0) * i / n, 0)]); for (let i = n; i >= 0; i--) pts.push([...P(r0, a0 + (a1 - a0) * i / n, 0)]); this.footprint(pts, o.aoBlur, o.aoK); }
    }
  }
  function earClip(pts) {
    const n = pts.length, idx = [...Array(n).keys()]; let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; } if (area < 0) idx.reverse();
    const out = [], cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const inTri = (p, a, b, c) => cr(a, b, p) >= -1e-9 && cr(b, c, p) >= -1e-9 && cr(c, a, p) >= -1e-9; let guard = 0;
    while (idx.length > 3 && guard++ < 5000) { let clipped = false;
      for (let i = 0; i < idx.length; i++) { const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length], a = pts[i0], b = pts[i1], c = pts[i2];
        if (cr(a, b, c) <= 1e-9) continue; let ok = true; for (const j of idx) { if (j === i0 || j === i1 || j === i2) continue; if (inTri(pts[j], a, b, c)) { ok = false; break; } }
        if (ok) { out.push(i0, i1, i2); idx.splice(i, 1); clipped = true; break; } }
      if (!clipped) { out.push(idx[0], idx[1], idx[2]); idx.splice(1, 1); } }
    if (idx.length === 3) out.push(idx[0], idx[1], idx[2]); return out;
  }

  /* ---------- helpers ---------- */
  const polar = C.polar, P = C.P;
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function freeIntervals(r, clear) { // free angular intervals (deg) on a circle of radius r, minus openings (+clear metres each side)
    const gaps = A.domeOpenings.map(g => { const half = Math.atan2(g.w / 2 + clear, r) / D2R, c = ((g.angle % 360) + 360) % 360; return [c - half, c + half]; });
    let pts = []; gaps.forEach(g => { pts.push([g[0], g[1]]); });
    const segs = []; const sorted = gaps.map(g => [((g[0] % 360) + 360) % 360, g[1] - g[0]]).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < sorted.length; i++) { const end = sorted[i][0] + sorted[i][1], nextStart = sorted[(i + 1) % sorted.length][0] + (i + 1 === sorted.length ? 360 : 0); if (nextStart > end) segs.push([end, nextStart]); }
    return segs;
  }
  const shade = (c, k) => c.map(v => clamp(v * k, 0, 1));

  /* ---------- hull (dhow / canoe) ---------- */
  function hull(B, L, beam, o) { // local: x = length, y up, z across. y values are absolute.
    const k0 = o.keel, sh0 = o.sheer, bowUp = o.bowUp, sternUp = o.sternUp, p = o.sectionPow || 1.6, ends = o.endPow || 2.2;
    const half = t => beam / 2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), ends)), 0.62);
    const sheer = t => sh0 + bowUp * Math.pow(Math.max(2 * t - 1, 0), 3) + sternUp * Math.pow(Math.max(1 - 2 * t, 0), 3);
    const keel = t => k0 + (o.keelRise || 0.8) * Math.pow(Math.abs(2 * t - 1), 3);
    const sec = (t, s, inset) => { const w = Math.max(0, half(t) - inset), yk = keel(t) + inset, sh = sheer(t); return [(t - 0.5) * L, yk + (sh - yk) * Math.pow(Math.abs(s), p), w * s]; };
    B.surf((u, v) => sec(u, (v - 0.5) * 2, 0), 60, 24, { mat: M.wood, uvFn: (u, v, pp) => [pp[0], (v - 0.5) * 2 * 1.6], colFn: (u, v) => { const s = Math.abs((v - 0.5) * 2); return s > 0.9 ? o.band : (s > 0.86 ? o.woodDark : o.wood); } });
    B.surf((u, v) => sec(u, (v - 0.5) * 2, o.thick), 40, 16, { mat: M.wood, uvFn: (u, v, pp) => [pp[0], (v - 0.5) * 2 * 1.2], col: o.woodDark });
    // rim (gunwale) as thin tube following the sheer line
    for (const sgn of [-1, 1]) { let prev = null; for (let i = 0; i <= 30; i++) { const t = i / 30, q = sec(t, sgn, 0); if (prev) B.tube(prev, q, 0.045, { mat: M.plain, col: o.woodDark }, 6); prev = q; } }
    const dk = { mat: M.plain, col: o.woodDark, ao: false };
    // plank seams (strakes) + a heavier wale along the outside of the hull
    for (const sgn of [-1, 1]) for (const s of (o.strakes || [])) { let prev = null; for (let i = 0; i <= 40; i++) { const q = sec(0.03 + 0.94 * i / 40, sgn * s, -0.012); if (prev) B.tube(prev, q, 0.011, dk, 4); prev = q; } }
    if (o.wale) for (const sgn of [-1, 1]) { let prev = null; for (let i = 0; i <= 40; i++) { const q = sec(0.04 + 0.92 * i / 40, sgn * o.wale, -0.02); if (prev) B.tube(prev, q, 0.03, { mat: M.wood, col: o.wood, ao: false }, 5); prev = q; } }
    // ribs (frames) across the inner skin
    if (o.ribs) for (let i = 1; i < o.ribs; i++) { let prev = null; for (let j = 0; j <= 14; j++) { const q = sec(i / o.ribs, -1 + 2 * j / 14, o.thick + 0.012); if (prev) B.tube(prev, q, 0.026, { mat: M.wood, col: shade(o.wood, 0.7), ao: false }, 5); prev = q; } }
    // projecting cross-beam ends + rib heads at the gunwale (typical dhow detail)
    if (o.beams) for (let i = 1; i < o.beams; i++) { const t = 0.08 + 0.84 * i / o.beams, a = sec(t, -1, 0), b = sec(t, 1, 0), y = a[1] - 0.3; B.tube([a[0], y, a[2] - 0.22], [b[0], y, b[2] + 0.22], 0.045, { mat: M.wood, col: o.woodDark, ao: false }, 6); B.tube([a[0], a[1] - 0.02, a[2]], [a[0], a[1] + 0.13, a[2]], 0.03, dk, 5); B.tube([b[0], b[1] - 0.02, b[2]], [b[0], b[1] + 0.13, b[2]], 0.03, dk, 5); }
    // dugout: flat lip joining outer and inner skin (thick log walls)
    if (o.dugout) for (const sgn of [-1, 1]) B.surf((u, v) => { const a = sec(0.02 + 0.96 * u, sgn, 0), b = sec(0.02 + 0.96 * u, sgn, o.thick); return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v + 0.004, a[2] + (b[2] - a[2]) * v]; }, 50, 1, { mat: M.wood, col: o.lip || o.wood, uvFn: (u, v, pp) => [pp[0], v * 0.3], ao: false });
    return { sec, half, sheer, keel };
  }

  /* ---------- shells ---------- */
  function shell(B, x, y, z, size, yaw, tilt, col, turns, kind) {
    kind = kind || 'turban'; const fp = () => B.footprint([[x - size * 0.4, 0, z - size * 0.4], [x + size * 0.4, 0, z - size * 0.4], [x + size * 0.4, 0, z + size * 0.4], [x - size * 0.4, 0, z + size * 0.4]], 0.3, 0.0);
    const O = { mat: M.shell, col, ao: false };
    if (kind === 'turban' || kind === 'conch' || kind === 'auger') {   // logarithmic spirals with different growth / height
      const P = { turban: [0.14, 0.4, 3.2, 0.3], conch: [0.2, 0.9, 3.0, 0.34], auger: [0.085, 1.5, 6.5, 0.26] }[kind], k = P[0], drop = P[1], tn = P[2], rr = P[3], G = Math.exp(k * tn * TAU), sc = size / (1.55 * G * (kind === 'auger' ? 0.85 : 1));
      B.push(); B.tr(x, y, z); B.rotY(yaw); B.rotZ(tilt); B.sc(sc);
      B.surf((u, v) => { const s = u * tn * TAU, g = Math.exp(k * s), a = v * TAU, R = 0.5 * g, r = rr * g, cy = -drop * (g - 1);
        return [R * Math.cos(s) + r * Math.cos(a) * Math.cos(s), cy + r * Math.sin(a), R * Math.sin(s) + r * Math.cos(a) * Math.sin(s)]; }, 70, 12, Object.assign({ uvFn: (u, v) => [u * 40, v * 6] }, O));
      B.pop(); fp(); return;
    }
    B.push(); B.tr(x, y, z); B.rotY(yaw); B.rotZ(tilt); B.sc(size);
    if (kind === 'scallop') {            // ribbed fan with a small hinge
      B.surf((u, v) => { const a = (u - 0.5) * 2.2, r = v * 0.62, rib = 0.018 * Math.sin(a * 16) * v; return [r * Math.cos(a) - 0.1, 0.12 * v * (1 - 0.5 * Math.abs(a)) * 2.2 + rib + 0.05 * v * v, r * Math.sin(a)]; }, 44, 10, Object.assign({ uvFn: (u, v) => [u * 30, v * 4] }, O));
    } else if (kind === 'cowrie') {      // glossy egg with a slit
      B.surf((u, v) => { const a = u * TAU, p = (v - 0.5) * Math.PI; return [0.42 * Math.sin(p), 0.2 * Math.cos(p) * Math.sin(a) + 0.14, 0.27 * Math.cos(p) * Math.cos(a)]; }, 24, 12, Object.assign({ uvFn: (u, v) => [u * 6, v * 3] }, O));
    } else if (kind === 'star') {        // five-armed starfish
      B.surf((u, v) => { const a = u * TAU, arm = Math.pow(Math.abs(Math.cos(a * 2.5)), 1.6), R = (0.18 + 0.52 * arm) * v; return [R * Math.cos(a), 0.1 * (1 - v) * (0.4 + 0.6 * arm) + 0.02 + 0.015 * Math.sin(a * 5) * v, R * Math.sin(a)]; }, 60, 8, Object.assign({ uvFn: (u, v) => [u * 40, v * 5] }, O));
    }
    B.pop(); fp();
  }
  function plant(B, x, z, kind, s) {
    const potC = hex(COL.pot), leafA = hex(COL.leaf), leafB = hex(COL.leaf2);
    B.cyl(x, 0, z, 0.3 * s, 0.38 * s, 0.5 * s, 14, { mat: M.plain, col: potC, top: [0.12, 0.08, 0.05] });
    const frond = (yaw, elev, len, wdt, y0, mat, col) => {
      B.push(); B.tr(x, y0, z); B.rotY(yaw);
      B.surf((u, v) => { const d = len * u, hz = d * Math.cos(elev * D2R) + 0.05, yy = d * Math.sin(elev * D2R) - 0.55 * u * u * len, w = wdt * Math.sin(Math.PI * Math.pow(0.12 + 0.88 * u, 0.9)) * (v * 2 - 1);
        return [hz, yy - Math.abs(w) * 0.25, w]; }, 14, 4, { mat, col, uvFn: (u, v) => [u * len, (v * 2 - 1)], ao: false });
      B.pop();
    };
    if (kind === 'palm') {   // curved tapering trunk with growth rings, drooping + upright fronds, coconuts
      const h = 2.0 * s, ty = 0.5 * s, lean = (rnd() - 0.5) * 0.5, lyaw = rnd() * TAU, tp = u => [x + Math.cos(lyaw) * lean * s * u * u, ty + h * u, z + Math.sin(lyaw) * lean * s * u * u];
      let prev = tp(0); for (let i = 1; i <= 10; i++) { const q = tp(i / 10); B.tube(prev, q, (0.085 - 0.03 * i / 10) * s, { mat: M.plain, col: i % 2 ? [0.4, 0.3, 0.2] : [0.32, 0.23, 0.15] }, 8); prev = q; }
      const top = tp(1), fr = (yaw, elev, len, wdt, mat, col) => { B.push(); B.tr(top[0], top[1], top[2]); B.rotY(yaw);
        B.surf((u, v) => { const d = len * u, hz = d * Math.cos(elev * D2R) + 0.04, yy = d * Math.sin(elev * D2R) - 0.95 * u * u * u * len - 0.25 * u * u * len, w = wdt * Math.sin(Math.PI * Math.pow(0.1 + 0.9 * u, 0.85)) * (v * 2 - 1);
          return [hz, yy - Math.abs(w) * 0.45, w]; }, 18, 4, { mat, col, uvFn: (u, v) => [u * len * 2.6, (v * 2 - 1)], ao: false }); B.pop(); };
      const nF = 15; for (let i = 0; i < nF; i++) { const k = i / nF; fr(i * 137.5 + rnd() * 18, 62 - 80 * Math.pow(k, 0.8) + rnd() * 16, s * (1.25 + 0.55 * rnd()) * (0.8 + 0.3 * Math.sin(k * 3.1)), 0.26 * s, M.frond, i % 3 ? leafA : leafB); }
      for (let i = 0; i < 4; i++) B.cyl(top[0] + Math.cos(i * 1.7) * 0.09 * s, top[1] - 0.13 * s, top[2] + Math.sin(i * 1.7) * 0.09 * s, 0.07 * s, 0.07 * s, 0.1 * s, 8, { mat: M.plain, col: [0.25, 0.4, 0.15], top: [0.25, 0.4, 0.15], ao: false });
    } else for (let i = 0; i < 16; i++) frond(i * 137.5, 50 + rnd() * 28, 0.95 * s * (0.7 + 0.5 * rnd()), 0.16 * s, 0.5 * s, M.leaf, i % 2 ? leafA : leafB);
  }

  /* ---------- screens ---------- */
  function screenFace(B, cx, cz, y, facing, off, w, h, ci, glow, margin) {
    B.push(); B.tr(cx, y, cz); B.rotY(facing);
    const cell = ci, cols = 4, rows = Math.ceil((C.contents.length) / cols), cu = (cell % cols) / cols, cv = Math.floor(cell / cols) / rows, cw = 1 / cols, ch = 1 / rows, asp = w / h, base = 16 / 9;
    let fu = 1, fv = 1; if (asp < base) fu = asp / base; else fv = base / asp; const ins = 0.003;
    const u0 = cu + cw * (0.5 - fu / 2) + ins * cw, u1 = cu + cw * (0.5 + fu / 2) - ins * cw, v0 = cv + ch * (0.5 - fv / 2) + ins * ch, v1 = cv + ch * (0.5 + fv / 2) - ins * ch;
    B.pass('opq'); B.quad([[off, -h / 2, w / 2], [off, -h / 2, -w / 2], [off, h / 2, -w / 2], [off, h / 2, w / 2]], [1, 0, 0], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], { mat: M.screen, col: [1, 1, 1] });
    B.pass('add'); const gw = w / 2 + margin, gh = h / 2 + margin, hn = [w / 2, h / 2, margin];
    B.quad([[off + 0.01, -gh, gw], [off + 0.01, -gh, -gw], [off + 0.01, gh, -gw], [off + 0.01, gh, gw]], [hn, hn, hn, hn], [[gw, -gh], [-gw, -gh], [-gw, gh], [gw, gh]], { mat: M.glow, col: glow });
    B.pass('opq'); B.pop();
  }
  function addScreen(B, s) {
    if (s.hidden) return; const f = s.facing, ci = Math.max(0, C.contents.findIndex(c => c.id === s.content)), glow = (s.glow || [0.5, 0.8, 1]).map(v => v * 0.5), z0 = B.zone;
    B.zone = ZONES[s.zone || 'hall'];
    const [x, z] = s.pos; B.push(); B.tr(x, s.y, z); B.rotY(f);
    if (s.free) { // two-sided slab on a stand
      B.box(0, -s.h / 2 - 0.04, 0, 0.08, s.h + 0.08, s.w + 0.08, { mat: M.plain, col: hex(COL.screenFrame), ao: false });
      B.box(0, -s.y, 0, 0.3, s.y - s.h / 2 - 0.04, 0.12, { mat: M.metal, col: [0.12, 0.12, 0.14] });
      B.box(0, -s.y, 0, 0.5, 0.05, 0.7, { mat: M.metal, col: [0.12, 0.12, 0.14] });
      B.pop(); screenFace(B, x, z, s.y, f, 0.05, s.w, s.h, ci, glow, 0.5); screenFace(B, x, z, s.y, f + 180, 0.05, s.w, s.h, ci, glow, 0.5);
    } else {
      B.box(0.03, -s.h / 2 - 0.05, 0, 0.06, s.h + 0.1, s.w + 0.1, { mat: M.plain, col: hex(COL.screenFrame), ao: false });
      B.pop(); screenFace(B, x, z, s.y, f, 0.065, s.w, s.h, ci, glow, 0.6);
    }
    const a = f * D2R; B.lights.push({ type: 'point', zone: s.zone || 'hall', pos: [x + Math.cos(a) * 0.9, s.y, z + Math.sin(a) * 0.9], color: s.glow || [0.5, 0.8, 1], intensity: C.screenLightIntensity * Math.min(1.6, s.w * s.h / 3), range: 6.5, screen: true });
    B.zone = z0;
  }

  /* ---------- build the whole scene ---------- */
  function buildScene() {
    seedState = 12345; const B = new Mesh(), E = C.exhibits, H = A.hallCeiling, DR = A.domeInnerR, DO = DR + A.ringThickness, T = A.wallThickness;
    const c = k => hex(COL[k]);
    // ---- outdoors: sand, sea
    B.zone = 2; B.col = c('sand');
    B.quad([[-80, -0.03, -80], [80, -0.03, -80], [80, -0.03, 80], [-80, -0.03, 80]], [0, 1, 0], [[-80, -80], [80, -80], [80, 80], [-80, 80]], { mat: M.sand, col: c('sand'), ao: false });
    const S = 1500; B.quad([[-S, -0.7, -S], [S, -0.7, -S], [S, -0.7, S], [-S, -0.7, S]], [0, 1, 0], [[-S, -S], [S, -S], [S, S], [-S, S]], { mat: M.sea, col: C.outside.sea });
    // ---- hall floor & ceiling
    const ringPt = a => polar(0, 0, DO, a), arcPts = (cx, cz, r, a0, a1, st) => { const o = [], n = Math.ceil(Math.abs(a1 - a0) / st); for (let i = 0; i <= n; i++) o.push(polar(cx, cz, r, a0 + (a1 - a0) * i / n)); return o; };
    const hp = A.hallPoly, ac = C.P(470, 375), ar = 95 / C.PLAN.pxPerM;
    const a0 = Math.atan2(hp[0][1], hp[0][0]) / D2R, endPt = polar(ac[0], ac[1], ar, -90), a1 = Math.atan2(endPt[1], endPt[0]) / D2R;
    const hallArc = arcPts(ac[0], ac[1], ar, 0, -90, 6).slice(1), domeArc = arcPts(0, 0, DO, a1, a0, 4);
    const outline = [...hp, ...hallArc, ...domeArc];
    B.zone = 0; B.poly(outline, 0.0, { mat: M.stone, col: c('hallFloor') });
    const V = A.void, zbS = hp[6][1];
    const ceilOutline = V ? [hp[0], hp[1], hp[2], hp[3], hp[4], hp[5], [V.x0, zbS], [V.x0, V.z0], [hp[6][0], V.z0], hp[7], ...hallArc, ...domeArc] : outline;   // double-height void = a notch in the ceiling slab
    if (!(C.debug && C.debug.hideCeiling)) B.poly(ceilOutline, H, { mat: M.plaster, col: c('ceiling'), flip: true });
    // ---- hall walls (thin boxes along every edge except the dome side), with the entrance door gap
    const area = (() => { let s = 0; for (let i = 0; i < outline.length; i++) { const a = outline[i], b = outline[(i + 1) % outline.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; })();
    const wallChain = [ringPt(a0), ...hp, ...hallArc, ringPt(a1)];
    const door = A.hallDoor, wallCol = c('hallWall');
    const coveCol = COL.cove;
    for (let i = 0; i < wallChain.length - 1; i++) {
      const p = wallChain[i], q = wallChain[i + 1], dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz); if (len < 1e-3) continue;
      const ang = Math.atan2(dz, dx) / D2R, out = area > 0 ? [dz / len, -dx / len] : [-dz / len, dx / len];
      const wall = (s0, s1, y0, y1) => { const l = s1 - s0; if (l <= 0) return; B.push(); B.tr((p[0] + dx / len * (s0 + s1) / 2) + out[0] * T / 2, 0, (p[1] + dz / len * (s0 + s1) / 2) + out[1] * T / 2); B.rotY(ang);
        const L = l + (s0 > 0 ? 0 : T) + (s1 < len ? 0 : T), oz = area < 0 ? 1 : -1, zs = -oz * (T / 2 + 0.003), zz = B.zone;
        B.zone = 2; B.box(0, y0, 0, L, y1 - y0, T, { mat: M.plaster, col: wallCol }); B.zone = zz;       // outer shell lit as "outdoors"
        B.quad([[-L / 2, y0, zs], [L / 2, y0, zs], [L / 2, y1, zs], [-L / 2, y1, zs]], [0, 0, -oz], [[-L / 2, y0], [L / 2, y0], [L / 2, y1], [-L / 2, y1]], { mat: M.plaster, col: wallCol, zone: 0 });   // inner skin lit as "hall"
        B.pop(); };
      const isDoorEdge = Math.abs(p[1] - door.pos[1]) < 0.05 && Math.abs(q[1] - door.pos[1]) < 0.05;
      if (isDoorEdge) { const x0 = Math.min(p[0], q[0]), dir = Math.sign(dx), sDoor0 = (door.pos[0] - door.w / 2 - p[0]) * dir, sDoor1 = (door.pos[0] + door.w / 2 - p[0]) * dir, lo = Math.min(sDoor0, sDoor1), hi = Math.max(sDoor0, sDoor1);
        wall(0, lo, 0, H); wall(hi, len, 0, H); wall(lo, hi, door.h, H); }
      else wall(0, len, 0, H);
      // cove light strip along the wall just under the ceiling
      B.push(); B.tr(p[0] + dx / 2 - out[0] * 0.09, 0, p[1] + dz / 2 - out[1] * 0.09); B.rotY(ang); B.box(0, H - 0.5, 0, len, 0.08, 0.1, { mat: M.emis, col: coveCol, ao: false }); B.pop();
    }
    // cove strip following the dome ring on the hall side
    for (let i = 0; i < domeArc.length - 1; i++) { const q = domeArc[i], r = domeArc[i + 1]; const mx = (q[0] + r[0]) / 2, mz = (q[1] + r[1]) / 2, l = Math.hypot(r[0] - q[0], r[1] - q[1]), an = Math.atan2(r[1] - q[1], r[0] - q[0]) / D2R, rl = Math.hypot(mx, mz);
      B.push(); B.tr(mx * (rl + 0.12) / rl, 0, mz * (rl + 0.12) / rl); B.rotY(an); B.box(0, H - 0.5, 0, l + 0.02, 0.08, 0.1, { mat: M.emis, col: coveCol, ao: false }); B.pop(); }
    // downlights
    for (let x = -17; x <= 12; x += 3.2) for (let z = 3; z <= 23; z += 3.2) { if (Math.hypot(x, z) < DO + 0.6 || !inPoly([x, z], outline) || (V && x > V.x0 - 0.3 && z > V.z0 - 0.3)) continue; B.cyl(x, H - 0.03, z, 0.14, 0.14, 0.03, 12, { bottom: true, mat: M.emis, col: [1, 0.92, 0.8], ao: false }); }
    // door leaves (open) + frame
    const doorLeaf = (len, h, fc, gc) => { const F = { mat: M.metal, col: fc, ao: false };
      B.box(len / 2, 0, 0, len, 0.08, 0.05, F); B.box(len / 2, h - 0.08, 0, len, 0.08, 0.05, F); B.box(0.04, 0, 0, 0.08, h, 0.05, F); B.box(len - 0.04, 0, 0, 0.08, h, 0.05, F);
      B.pass('blend'); B.box(len / 2, 0.08, 0, len - 0.16, h - 0.16, 0.015, { mat: M.glass, col: gc, ao: false }); B.pass('opq'); };
    { const dz = door.pos[1], dx0 = door.pos[0]; const leaf = (hx, hz, heading) => { B.push(); B.tr(hx, 0, hz); B.rotY(heading); doorLeaf(door.w / 2, door.h - 0.1, [0.12, 0.13, 0.15], [0.6, 0.8, 0.9]); B.pop(); };
      leaf(dx0 - door.w / 2, dz - 0.05, -75); leaf(dx0 + door.w / 2, dz - 0.05, -105);
      B.box(dx0, door.h - 0.08, dz, door.w + 0.1, 0.1, T + 0.1, { mat: M.metal, col: [0.12, 0.13, 0.15], ao: false }); }

    // ---- DOME
    B.zone = 1; const dcol = c('domeFloor');
    { const pts = arcPts(0, 0, DO, 0, 360, 6); pts.pop(); B.poly(pts, 0.005, { mat: M.stone, col: dcol }, p => [p[0] * 0.7, p[1] * 0.7]); }
    // ring wall with openings (zone 3 = auto inner/outer)
    B.zone = 3; const op = A.domeOpenings;
    for (const [s, e] of freeIntervals(DO, 0)) B.arc(0, 0, DR, DO, s, e, 0, H, { mat: M.black, colIn: c('domeWall'), colOut: c('ringBlack'), top: c('ringBlack'), aoBlur: 1 });
    for (const g of op) { const half = Math.atan2(g.w / 2, (DR + DO) / 2) / D2R; B.arc(0, 0, DR, DO, g.angle - half, g.angle + half, g.h, H, { mat: M.black, colIn: c('domeWall'), colOut: c('ringBlack'), top: c('ringBlack'), ao: false });
      // door fittings
      const ctr = polar(0, 0, (DR + DO) / 2, g.angle), tang = (g.angle + 90);
      if (g.type === 'blackdoor') { B.push(); B.tr(ctr[0], 0, ctr[1]); B.rotY(tang); B.box(0, 0, 0, g.w, g.h, 0.08, { mat: M.black, col: [0.02, 0.025, 0.03], ao: false }); B.pop(); }
      if (g.type === 'whitedoor') { const rad = [Math.cos(g.angle * D2R), Math.sin(g.angle * D2R)], tg = [-rad[1], rad[0]];
        for (const sgn of [-1, 1]) { const hx = ctr[0] + tg[0] * sgn * g.w / 2, hz = ctr[1] + tg[1] * sgn * g.w / 2, dir = [-tg[0] * sgn * Math.cos(70 * D2R) - rad[0] * Math.sin(70 * D2R), -tg[1] * sgn * Math.cos(70 * D2R) - rad[1] * Math.sin(70 * D2R)];
          B.push(); B.tr(hx, 0, hz); B.rotY(Math.atan2(dir[1], dir[0]) / D2R); doorLeaf(g.w / 2, g.h - 0.05, [0.95, 0.95, 0.93], [0.9, 0.95, 1]); B.pop(); } } }
    // dome interior cap (projection surface) + exterior shell
    B.zone = 1; const hy = A.domeWallH, hh = A.domeApex - hy;
    B.surf((u, v) => { const a = u * TAU, psi = v * Math.PI / 2; const rr = DR * Math.cos(psi) + 0.05 * (1 - v); return [rr * Math.cos(a), hy + hh * Math.sin(psi), rr * Math.sin(a)]; }, 90, 24,
      { mat: M.dome, uvFn: (u, v, p) => [p[0] / DR * 0.5 + 0.5, p[2] / DR * 0.5 + 0.5], col: [1, 1, 1], ao: false });
    B.zone = 2; if (!(C.debug && C.debug.hideCeiling)) B.surf((u, v) => { const a = u * TAU, psi = v * Math.PI / 2; return [DO * Math.cos(psi) * Math.cos(a), H + 3.6 * Math.sin(psi), DO * Math.cos(psi) * Math.sin(a)]; }, 48, 10, { mat: M.plaster, col: [0.86, 0.82, 0.74], ao: false });
    B.zone = 1;
    // cove ring at the base of the dome wall
    for (const [s, e] of freeIntervals(DR, 0.2)) B.arc(0, 0, DR - 0.16, DR - 0.02, s, e, 0.02, 0.1, { mat: M.emis, col: COL.cove, ao: false, outer: false, caps: false });
    // tiers + chairs + tables
    const sg = C.seating, bandH = r => { for (const row of sg.rows) if (r >= row.band[0] && r < row.band[1]) return row.h; return 0; };
    for (const row of sg.rows) {
      for (const [s, e] of freeIntervals(row.band[1], sg.aisleClear)) B.arc(0, 0, row.band[0], row.band[1], s, e, 0, row.h, { mat: M.plain, col: [0.17, 0.18, 0.21], top: [0.12, 0.13, 0.16], colOut: [0.14, 0.15, 0.18], aoBlur: 1 });
      for (const [s, e] of freeIntervals(row.band[0] + 0.05, sg.aisleClear)) B.arc(0, 0, row.band[0] - 0.03, row.band[0] + 0.04, s, e, row.h - 0.03, row.h, { mat: M.emis, col: COL.cove, ao: false, outer: false, caps: false });
      // chairs spaced evenly over the free arcs
      const iv = freeIntervals(row.r, sg.aisleClear), tot = iv.reduce((a, b) => a + (b[1] - b[0]), 0);
      for (let i = 0; i < row.n; i++) { let d = (i + 0.5) / row.n * tot, a = 0; for (const [s, e] of iv) { if (d <= e - s) { a = s + d; break; } d -= e - s; }
        const [x, z] = polar(0, 0, row.r, a); B.push(); B.tr(x, row.h, z); B.rotY(a + 180);
        const fc = shade(c('chair'), 0.9 + 0.2 * rnd());
        B.box(0, 0.42, 0, 0.5, 0.09, 0.52, { mat: M.fabric, col: fc, ao: false }); B.box(-0.26, 0.5, 0, 0.08, 0.52, 0.52, { mat: M.fabric, col: fc, ao: false });
        B.box(0, 0, 0, 0.08, 0.42, 0.08, { mat: M.metal, col: [0.1, 0.1, 0.12], ao: false }); B.cyl(0, 0, 0, 0.2, 0.2, 0.03, 10, { mat: M.metal, col: [0.1, 0.1, 0.12], ao: false }); B.pop();
        B.footprint([[x - 0.3, 0, z - 0.3], [x + 0.3, 0, z - 0.3], [x + 0.3, 0, z + 0.3], [x - 0.3, 0, z + 0.3]], 0.6, 0.35); }
    }
    for (const [r, a] of sg.tables) { const [x, z] = polar(0, 0, r, a); B.cyl(x, bandH(r), z, 0.3, 0.3, 0.5, 18, { mat: M.plain, col: c('tableOrange'), top: shade(c('tableOrange'), 1.1) }); }

    // ---- HALL EXHIBITS
    B.zone = 0;
    // dhow (hull, mast, lateen sail, rigging)
    { const d = E.dhow, sl = d.sail; B.push(); B.tr(d.pos[0], 0, d.pos[1]); B.rotY(d.heading);
      B.box(0, 0, 0, d.platform[0], d.platformH, d.platform[1], { mat: M.plain, col: c('platform'), top: shade(c('platform'), 1.05), aoBlur: 1.2 });
      B.box(0, d.platformH - 0.005, 0, d.platform[0] - 0.12, 0.02, d.platform[1] - 0.12, { mat: M.plain, col: shade(c('platform'), 0.88), ao: false });
      const h = hull(B, d.hullLength, d.beam, { keel: d.platformH + 0.45, sheer: d.platformH + 1.55, bowUp: 1.15, sternUp: 0.8, keelRise: 0.55, thick: 0.07, wood: c('boatWood'), woodDark: c('boatWoodDark'), band: c('boatBand'), strakes: [0.22, 0.42, 0.62, 0.8], wale: 0.55, ribs: 22, beams: 9 });
      for (const t of [0.12, 0.3, 0.5, 0.7, 0.88]) B.box((t - 0.5) * d.hullLength, d.platformH, 0, 0.14, h.keel(t) - d.platformH, 0.5, { mat: M.wood, col: c('boatWoodDark'), ao: false });
      for (const t of [0.2, 0.32, 0.44, 0.56, 0.68, 0.8]) { const yy = h.keel(t) + 0.55, hw = h.half(t) * Math.pow(0.55 / Math.max(0.1, h.sheer(t) - h.keel(t)), 1 / 1.6); B.box((t - 0.5) * d.hullLength, yy, 0, 0.2, 0.06, hw * 2, { mat: M.wood, col: c('boatWood'), ao: false }); }
      B.box(0, h.keel(0.5) + 0.06, 0, d.hullLength * 0.7, 0.04, d.beam * 0.5, { mat: M.wood, col: shade(c('boatWood'), 0.75), ao: false });
      const wood = { mat: M.wood, col: c('boatWoodDark') }, rope = { mat: M.plain, col: [0.2, 0.14, 0.08], ao: false }, mx = sl.mastX, topY = d.mastH + d.platformH, zy = sl.yardZ, Mt = [mx, topY, 0];
      B.tube([mx, h.keel(0.4) + 0.1, 0], [mx, 5.5, 0], 0.12, wood, 12); B.tube([mx, 5.5, 0], Mt, 0.085, wood, 10);
      B.cyl(mx, topY - 0.02, 0, 0.1, 0.1, 0.12, 10, { mat: M.wood, col: c('boatWoodDark'), ao: false });               // masthead cap
      const P = sl.peak, T = sl.tack, K = sl.clew, dl = Math.hypot(P[0] - T[0], P[1] - T[1]), dx = (P[0] - T[0]) / dl, dy = (P[1] - T[1]) / dl;
      B.tube([T[0] - dx * 0.55, T[1] - dy * 0.55, zy], [P[0] + dx * 0.45, P[1] + dy * 0.45, zy], 0.06, wood, 8);   // yard (lateen antenna)
      B.tube([T[0] - 0.1, T[1] - 0.06, zy], [K[0], K[1] - 0.06, zy], 0.045, wood, 8);                              // boom along the foot
      // the sail: triangle peak-tack-clew, billowed to leeward with soft folds
      const SAIL = (u, v) => { const ex = P[0] + (T[0] - P[0]) * u, ey = P[1] + (T[1] - P[1]) * u, vv = v * 0.996, su = Math.sin(Math.PI * u);
        const env = Math.pow(su, 0.75) * 4 * vv * (1 - vv), fold = (0.09 * Math.sin(u * 17 + vv * 2.6) * Math.sqrt(su) + 0.035 * Math.sin(u * 41 - vv * 5) + 0.02 * Math.sin(u * 9 - vv * 11)) * Math.min(1, vv * 5);
        return [ex + (K[0] - ex) * vv, ey + (K[1] - ey) * vv, zy + sl.billow * env + fold * (0.4 + env)]; };
      B.surf(SAIL, 60, 30, { mat: M.sail, col: hex(sl.color), uvFn: (u, v, p) => [p[0], p[1]], ao: false });
      B.tube([P[0], P[1], zy], [K[0], K[1], zy], 0.014, rope, 4); B.tube([T[0], T[1], zy], [K[0], K[1], zy], 0.014, rope, 4);   // boltropes
      // rigging: shrouds, stays, halyard, tack line, sheet, vang
      const gw = (t, sg) => h.sec(t, sg, 0);
      for (const x of [-1.9, -1.0, -0.1]) for (const sg of [-1, 1]) { const g = gw(x / d.hullLength + 0.5, sg); B.tube([mx, 7.8, sg * 0.05], [g[0], g[1] + 0.02, g[2]], 0.012, rope, 4); }
      B.tube(Mt, [d.hullLength / 2, h.sheer(1) - 0.1, 0], 0.013, rope, 4); B.tube(Mt, [-d.hullLength / 2 + 0.1, h.sheer(0) - 0.1, 0], 0.013, rope, 4);
      const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      const hy = lerp3(T, P, 0.42), vg = lerp3(T, P, 0.72), tg = gw(0.93, 1);
      B.tube(Mt, [hy[0], hy[1], zy], 0.014, rope, 4);
      B.tube([T[0], T[1], zy], [tg[0] - 0.1, tg[1], 0.0], 0.014, rope, 4);
      B.tube([K[0], K[1], zy], [-d.hullLength / 2 + 0.55, h.sheer(0.06) - 0.02, 0.0], 0.016, rope, 4);
      B.tube([vg[0], vg[1], zy], gw(0.36, -1), 0.012, rope, 4);
      B.tube([d.hullLength / 2, h.keel(1) + 0.1, 0], [d.hullLength / 2 + 0.35, h.sheer(1) + 0.35, 0], 0.05, { mat: M.wood, col: c('boatWoodDark') }, 6);
      B.pop();
      const s = E.infoStand; B.box(s.pos[0], 0, s.pos[1], s.w, 1.4, 0.35, { mat: M.plain, col: [0.46, 0.47, 0.5] }); }
    // grate + skylight
    { const g = E.grate; B.box(g.pos[0], 0, g.pos[1], g.size[0], 0.03, g.size[1], { mat: M.stripes, col: [0.45, 0.46, 0.5], ao: false });
      const k = E.skylight; B.box(k.pos[0], 0, k.pos[1], k.size, 0.04, k.size, { mat: M.sky, col: [0.5, 0.75, 0.95], ao: false }); }
    // plinth kiosk
    { const p = E.plinth; B.box(p.pos[0], 0, p.pos[1], p.size, p.h, p.size, { mat: M.plain, col: [0.8, 0.8, 0.82], top: [0.9, 0.9, 0.92] });
      B.cyl(p.pos[0], p.h, p.pos[1], 0.38, 0.38, 0.03, 20, { mat: M.emis, col: [0.4, 0.8, 1], ao: false });
      B.pass('blend'); B.surf((u, v) => { const a = u * TAU, ps = v * Math.PI / 2; return [p.pos[0] + 0.38 * Math.cos(ps) * Math.cos(a), p.h + 0.03 + 0.3 * Math.sin(ps), p.pos[1] + 0.38 * Math.cos(ps) * Math.sin(a)]; }, 20, 8, { mat: M.glass, col: [0.8, 0.9, 1], ao: false }); B.pass('opq');
      addScreen(B, { pos: [p.pos[0], p.pos[1] + p.size / 2 + 0.001], facing: 90, y: 0.55, w: 1.1, h: 0.7, content: 'compass', glow: [0.4, 0.8, 1], zone: 'hall' });
      addScreen(B, { pos: [E.infoStand.pos[0], E.infoStand.pos[1] + 0.18], facing: 90, y: 0.95, w: 1.05, h: 0.65, content: 'chart', glow: [0.4, 0.8, 1], zone: 'hall' }); }
    // canoe + niche
    { const k = E.canoe; B.box(k.pos[0], 0, k.pos[1], k.nicheSize[0], 0.12, k.nicheSize[1], { mat: M.plain, col: c('niche'), top: [0.95, 0.92, 0.85], aoBlur: 1 });
      B.push(); B.tr(k.pos[0], 0.12, k.pos[1]); B.rotY(k.heading); hull(B, k.length, k.beam, { keel: 0.2, sheer: 0.62, bowUp: 0.25, sternUp: 0.2, keelRise: 0.2, thick: 0.11, sectionPow: 1.4, endPow: 2.6, wood: c('canoeWood'), woodDark: shade(c('canoeWood'), 0.48), band: shade(c('canoeWood'), 0.8), dugout: true, lip: shade(c('canoeWood'), 1.12), ribs: 16, strakes: [0.35, 0.7] });
      B.pop(); }
    const SK = ['turban', 'scallop', 'conch', 'cowrie', 'star', 'auger', 'scallop', 'turban', 'cowrie', 'conch'], SC = [c('shellA'), c('shellB'), c('shellC'), hex('#f7f0e2'), hex('#cf8a68'), hex('#e9d4a6'), hex('#b9a58f'), hex('#f3c9b5')]; let shellN = 0;
    const mixShell = (B2, x, y, z, size) => { const i = shellN++, kind = SK[i % SK.length], col = kind === 'star' ? [[0.86, 0.4, 0.2], [0.8, 0.3, 0.25], [0.9, 0.62, 0.3]][i % 3] : SC[(i * 3 + Math.floor(rnd() * SC.length)) % SC.length];
      shell(B2, x, y, z, size * (kind === 'star' ? 1.7 : kind === 'auger' ? 1.4 : 1), rnd() * 360, kind === 'scallop' || kind === 'star' || kind === 'cowrie' ? rnd() * 22 : 60 + rnd() * 90, col, null, kind); };
    // medallion platform + shells + plants
    { const m = E.medallion, rx = m.platform[0] / 2, rz = m.platform[1] / 2;
      B.surf((u, v) => { const a = u * TAU; return [m.pos[0] + Math.cos(a) * rx * (1 - 0.04 * v), 0.16 * v, m.pos[1] + Math.sin(a) * rz * (1 - 0.04 * v)]; }, 40, 1, { mat: M.sand, col: c('sand'), uvFn: (u, v, p) => [p[0], p[2]], ao: false });
      const pts = []; for (let i = 0; i < 40; i++) pts.push([m.pos[0] + Math.cos(i / 40 * TAU) * rx * 0.96, m.pos[1] + Math.sin(i / 40 * TAU) * rz * 0.96]); B.poly(pts, 0.16, { mat: M.sand, col: shade(c('sand'), 1.05) }, p => [p[0], p[1]]);
      B.footprint(pts.map(p => [p[0], 0, p[1]]), 1, 0.8);
      const ci = C.contents.findIndex(q => q.id === 'medallion'), cols = 4, rows = Math.ceil(C.contents.length / cols), cu = (ci % cols) / cols, cv = Math.floor(ci / cols) / rows, cw = 1 / cols, ch = 1 / rows, fu = 9 / 16, uc = cu + cw / 2, vc = cv + ch / 2;
      const mp = m.medallionPos; for (let i = 0; i < 36; i++) { const a = i / 36 * TAU, b = (i + 1) / 36 * TAU; const uvp = t => [uc + Math.cos(t) * cw * fu * 0.5 * 0.985, vc + Math.sin(t) * ch * 0.5 * 0.985];
        const o = { mat: M.decal, col: [1, 1, 1], ao: false }; B.vert([mp[0], 0.172, mp[1]], [0, 1, 0], [uc, vc], o); B.vert([mp[0] + Math.cos(a) * m.radius, 0.172, mp[1] + Math.sin(a) * m.radius], [0, 1, 0], uvp(a), o); B.vert([mp[0] + Math.cos(b) * m.radius, 0.172, mp[1] + Math.sin(b) * m.radius], [0, 1, 0], uvp(b), o); }
      B.cyl(mp[0], 0.16, mp[1], m.radius + 0.04, m.radius + 0.04, 0.012, 36, { mat: M.metal, col: [0.7, 0.55, 0.3], cap: false, ao: false });
      const cs = [c('shellA'), c('shellB'), c('shellC')]; for (let i = 0; i < E.shellsOnMedallion; i++) { const a = rnd() * TAU, rr = 1.3 + rnd() * 0.4; mixShell(B, m.pos[0] + Math.cos(a) * rx * rr * 0.7 * (0.6 + 0.4 * rnd()) + 0.0, 0.17, m.pos[1] + Math.sin(a) * rz * 0.8 * (0.55 + 0.4 * rnd()), 0.14 + rnd() * 0.16); } }
    // wave bench
    { const w = E.waveBench, N = 28; for (let i = 0; i < N; i++) { const t0 = i / N, t1 = (i + 1) / N, f = t => [lerp(w.from[0], w.to[0], t), lerp(w.from[1], w.to[1], t) + w.amp * Math.sin(t * TAU * 1.5)], a = f(t0), b = f(t1), l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        B.push(); B.tr((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2); B.rotY(Math.atan2(b[1] - a[1], b[0] - a[0]) / D2R); B.box(0, 0, 0, l + 0.06, 0.42, w.width, { mat: M.plain, col: [0.86, 0.78, 0.62], top: [0.92, 0.85, 0.7], ao: i % 3 == 0 }); B.pop(); } }
    // oval pods
    for (const pd of E.pods) { const dx = pd.pos[0] - ac[0], dz = pd.pos[1] - ac[1], ang = Math.atan2(dz, dx) / D2R + 90, rx = pd.size[0] / 2, rz = pd.size[1] / 2;
      B.push(); B.tr(pd.pos[0], 0, pd.pos[1]); B.rotY(ang); B.surf((u, v) => { const a = u * TAU, ps = v * Math.PI / 2; return [rx * Math.cos(ps) * Math.cos(a), 0.52 * Math.sin(ps) + 0.1 * (1 - v), rz * Math.cos(ps) * Math.sin(a)]; }, 32, 8, { mat: M.fabric, col: [0.9, 0.82, 0.68], ao: false });
      B.cyl(0, 0, 0, rx * 0.8, rx * 0.8, 0.1, 24, { mat: M.plain, col: [0.55, 0.55, 0.58], ao: false, cap: false }); B.pop();
      const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, ca = Math.cos(ang * D2R), sa = Math.sin(ang * D2R), lx = Math.cos(a) * rx, lz = Math.sin(a) * rz; pts.push([lx * ca - lz * sa + pd.pos[0], 0, lx * sa + lz * ca + pd.pos[1]]); } B.footprint(pts, 1, 0.8); }
    // display tables with shells
    for (const t of E.displayTables) { B.push(); B.tr(t.pos[0], 0, t.pos[1]); B.rotY(t.heading); const [w, d] = t.size;
      B.box(0, 0, 0, w, 0.72, d, { mat: M.plain, col: [0.16, 0.17, 0.2], top: [0.9, 0.84, 0.7] }); B.box(0, 0.72, 0, w - 0.06, 0.02, d - 0.06, { mat: M.fabric, col: [0.85, 0.78, 0.62], ao: false });
      B.box(0, 0.72, 0, w + 0.04, 0.05, 0.04, { mat: M.metal, col: [0.7, 0.6, 0.4], ao: false }); B.box(0, 0.72, d / 2 - 0.02, w + 0.04, 0.12, 0.03, { mat: M.metal, col: [0.7, 0.6, 0.4], ao: false }); B.box(0, 0.72, -d / 2 - 0.0, w + 0.04, 0.12, 0.03, { mat: M.metal, col: [0.7, 0.6, 0.4], ao: false });
      B.box(w / 2, 0.72, 0, 0.03, 0.12, d, { mat: M.metal, col: [0.7, 0.6, 0.4], ao: false }); B.box(-w / 2, 0.72, 0, 0.03, 0.12, d, { mat: M.metal, col: [0.7, 0.6, 0.4], ao: false });
      B.pass('blend'); B.box(0, 0.83, 0, w, 0.015, d, { mat: M.glass, col: [0.8, 0.92, 1], ao: false }); B.pass('opq');
      B.box(0, 0.711, 0, w * 0.96, 0.005, 0.03, { mat: M.emis, col: [1, 0.9, 0.7], ao: false });
      const cs = [c('shellA'), c('shellB'), c('shellC')]; for (let i = 0; i < t.shells; i++) mixShell(B, (i / (t.shells - 1) - 0.5) * (w - 0.4) + (rnd() - 0.5) * 0.1, 0.745, (rnd() - 0.5) * (d - 0.35), 0.1 + rnd() * 0.12);
      B.pop(); }
    // plants
    for (const p of E.plants) plant(B, p.pos[0], p.pos[1], p.kind, p.s);

    // ---- screens
    for (const s of C.screens) addScreen(B, s);

    // ---- OUTSIDE
    B.zone = 2; const O = C.outside, so = O.sofa;
    B.arc(so.pos[0], so.pos[1], so.radius - 0.4, so.radius + 0.1, so.from, so.to, 0, 0.45, { mat: M.fabric, col: c('sofaBlue'), step: 6 });
    B.arc(so.pos[0], so.pos[1], so.radius - 0.05, so.radius + 0.1, so.from, so.to, 0.45, 0.95, { mat: M.fabric, col: c('sofaBlue'), step: 6 });
    B.cyl(O.firepit.pos[0], 0, O.firepit.pos[1], 0.75, 0.75, 0.4, 20, { mat: M.plain, col: [0.55, 0.5, 0.45], top: [0.1, 0.05, 0.03] }); B.cyl(O.firepit.pos[0], 0.4, O.firepit.pos[1], 0.45, 0.45, 0.02, 16, { mat: M.emis, col: [1, 0.45, 0.12], ao: false });
    const dk = O.deck; B.box((dk.x0 + dk.x1) / 2, -0.03, (dk.z0 + dk.z1) / 2, dk.x1 - dk.x0, 0.2, dk.z1 - dk.z0, { mat: M.wood, col: c('deckWood'), top: c('deckWood'), ao: false });
    for (const t of O.deckTables) { B.cyl(t[0], 0.17, t[1], 0.5, 0.5, 0.05, 20, { mat: M.plain, col: [0.75, 0.74, 0.7] }); B.cyl(t[0], 0.17, t[1], 0.06, 0.06, 0.7, 8, { mat: M.metal, col: [0.2, 0.2, 0.2], cap: false });
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; B.cyl(t[0] + Math.cos(a) * 0.95, 0.17, t[1] + Math.sin(a) * 0.95, 0.2, 0.2, 0.42, 10, { mat: M.fabric, col: c('sofaBlue') }); } }
    for (const p of O.deckPlants) plant(B, p[0], p[1], 'bush', 1.0);
    for (const p of [[11, 2.5], [12.6, -2.1]]) plant(B, p[0], p[1], 'palm', 1.2);

    // ---- track lights over exhibits (visible fixtures)
    B.zone = 0; for (const l of C.lights) if (l.type === 'spot' && l.zone === 'hall') { const Hc = l.ceil || H; B.cyl(l.pos[0], Hc - 0.5, l.pos[2], 0.1, 0.1, 0.3, 10, { bottom: true, mat: M.metal, col: [0.08, 0.08, 0.09], ao: false }); B.cyl(l.pos[0], Hc - 0.52, l.pos[2], 0.085, 0.085, 0.02, 10, { bottom: true, mat: M.emis, col: [1, 0.85, 0.6], ao: false }); B.box(l.pos[0], Hc - 0.2, l.pos[2], 0.05, 0.2, 0.05, { mat: M.metal, col: [0.08, 0.08, 0.09], ao: false }); }
    if (A.void) buildVoid(B, c, hp); else { const d = E.dhow; B.box(d.pos[0], H - 0.16, d.pos[1] - 2.2, d.platform[0], 0.05, 0.1, { mat: M.metal, col: [0.08, 0.08, 0.09], ao: false }); }

    return B;
  }
  /* ---------- double-height void around the dhow: upper-floor gallery, glass railing, stairs ---------- */
  function buildVoid(B, c, hp) {
    const V = A.void, H = A.hallCeiling, H2 = V.h, T = A.wallThickness, zb = hp[6][1], xe = hp[6][0], hz7 = hp[7][1], x0 = V.x0, z0 = V.z0, nb = V.northBack, wb = V.westBack, ex = V.eastBack;
    const z_ = B.zone; B.zone = 0; const wc = c('hallWall'), white = { mat: M.plain, col: [0.86, 0.87, 0.9], ao: false }, metal = { mat: M.metal, col: [0.7, 0.72, 0.76], ao: false };
    const wallBox = (cx, cz, w, d) => B.box(cx, H, cz, w, H2 - H, d, { mat: M.plaster, col: wc, ao: false });
    wallBox((wb + xe) / 2, zb + T / 2, xe - wb, T);                     // south wall (upper part)
    wallBox(xe + T / 2, (hz7 + zb) / 2, T, zb - hz7);                   // east wall
    wallBox((ex + xe) / 2, hz7 - T / 2, xe - ex, T); wallBox(ex + T / 2, (nb + hz7) / 2, T, hz7 - nb);   // north-east return
    wallBox((wb + ex) / 2, nb - T / 2, ex - wb, T);                     // north back wall of the gallery
    wallBox(wb - T / 2, (nb + zb) / 2, T, zb - nb);                     // west back wall
    B.poly([[wb, nb], [ex, nb], [ex, hz7], [xe, hz7], [xe, zb], [wb, zb]], H2, { mat: M.plaster, col: c('ceiling'), flip: true });   // upper ceiling
    // slab edge beams (fascia) around the void
    B.box((x0 + xe) / 2, H - 0.3, z0, xe - x0, 0.66, 0.2, white); B.box(x0, H - 0.3, (z0 + zb) / 2, 0.2, 0.66, zb - z0, white);
    // glass railings along the upper-floor edge
    const yb = H + 0.33, yt = yb + 1.05;
    const railing = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 1.5));
      for (let i = 0; i < n; i++) { const f0 = i / n, f1 = (i + 1) / n, p0 = [ax + (bx - ax) * f0, az + (bz - az) * f0], p1 = [ax + (bx - ax) * f1, az + (bz - az) * f1];
        B.pass('blend'); B.quad([[p0[0], yb + 0.08, p0[1]], [p1[0], yb + 0.08, p1[1]], [p1[0], yt, p1[1]], [p0[0], yt, p0[1]]], [bz - az, 0, -(bx - ax)].map(v => v / L), [[0, 0], [1, 0], [1, 1], [0, 1]], { mat: M.glass, col: [0.7, 0.88, 0.98], ao: false }); B.pass('opq');
        B.box(p0[0], yb, p0[1], 0.07, yt - yb, 0.07, metal); }
      B.box(bx, yb, bz, 0.07, yt - yb, 0.07, metal); B.tube([ax, yt, az], [bx, yt, bz], 0.028, metal, 8); B.tube([ax, yb + 0.04, az], [bx, yb + 0.04, bz], 0.02, metal, 6); };
    railing(x0, z0, 11.1, z0); railing(x0, z0, x0, zb - 0.05);
    // stairs (the striped rectangle on the plan stands for them): along the east wall, rising north to the gallery
    const n = 30, rise = (H + 0.3) / n, run = 0.29, xs = 11.7, zs = z0 + n * run, sw = 1.2;
    for (let i = 0; i < n; i++) B.box(xs, (i + 1) * rise - 0.08, zs - (i + 0.5) * run, sw, 0.08, run + 0.04, { mat: M.wood, col: c('deckWood'), top: shade(c('deckWood'), 1.05), ao: false });
    const yAt = z => (zs - z) / run * rise;                          // tread level along the flight
    B.quad([[xs - sw / 2, 0, zs], [xs - sw / 2, yAt(z0) - 0.08, z0], [xs - sw / 2, yAt(z0) + 0.03, z0], [xs - sw / 2, 0.11, zs]], [-1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], Object.assign({}, white));   // stringer
    B.box(xs, yAt(z0) - 0.08, z0 - 0.02, sw, 0.08, 0.04, { mat: M.wood, col: c('deckWood'), ao: false });
    B.pass('blend'); B.quad([[xs - sw / 2, yAt(zs) + 0.12, zs], [xs - sw / 2, yAt(z0) + 0.12, z0], [xs - sw / 2, yAt(z0) + 1.0, z0], [xs - sw / 2, yAt(zs) + 1.0, zs]], [-1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], { mat: M.glass, col: [0.7, 0.88, 0.98], ao: false }); B.pass('opq');
    B.tube([xs - sw / 2, yAt(zs) + 1.0, zs], [xs - sw / 2, yAt(z0) + 1.0, z0], 0.03, metal, 8);
    for (let i = 0; i <= n; i += 5) { const z = zs - i * run; B.tube([xs - sw / 2, yAt(z) + 0.05, z], [xs - sw / 2, yAt(z) + 1.0, z], 0.02, metal, 6); }
    // upper-floor details: coves, ceiling downlights, display screens on the gallery walls
    const cv = { mat: M.emis, col: COL.cove, ao: false };
    B.box((wb + ex) / 2, H2 - 0.5, nb + 0.09, ex - wb - 0.3, 0.08, 0.1, cv); B.box(wb + 0.09, H2 - 0.5, (nb + zb) / 2, 0.1, 0.08, zb - nb - 0.3, cv); B.box((wb + xe) / 2, H2 - 0.5, zb - 0.09, xe - wb - 0.3, 0.08, 0.1, cv); B.box(xe - 0.09, H2 - 0.5, (hz7 + zb) / 2, 0.1, 0.08, zb - hz7 - 0.3, cv);
    for (let x = wb + 1.6; x <= xe - 1; x += 3.2) for (let z = nb + 1.4; z <= zb - 1; z += 3.2) B.cyl(x, H2 - 0.03, z, 0.14, 0.14, 0.03, 12, { bottom: true, mat: M.emis, col: [1, 0.92, 0.8], ao: false });
    for (const s of (V.screens || [])) addScreen(B, s);
    for (const x of [-7, -2.2, 2.6, 7.4]) B.box(x, H + 0.6, nb + 0.02, 1.3, 0.04, 0.03, { mat: M.emis, col: [1, 0.75, 0.45], ao: false });
    B.zone = z_;
  }
  function inPoly(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }

  /* ---------- camera path ---------- */
  function buildCamera() {
    const K = C.camera.keys, n = K.length, T = K.map(k => k.t);
    const X = K.map(k => k.pos[0]), Z = K.map(k => k.pos[1]), R = K.map(k => k.rise || 0), PI = K.map(k => k.pitch || 0);
    const tang = (arr, i) => { if (i === 0 || i === n - 1 || K[i].stop) return 0; return (arr[i + 1] - arr[i - 1]) / (T[i + 1] - T[i - 1]); };
    let Hd = K.map((k, i) => { const hd = k.heading; if (typeof hd === 'number') return hd; if (hd && hd.look) return Math.atan2(hd.look[1] - k.pos[1], hd.look[0] - k.pos[0]) / D2R;
      const j = i === 0 ? 1 : i, vx = X[Math.min(n - 1, j + 1)] - X[j - 1], vz = Z[Math.min(n - 1, j + 1)] - Z[j - 1]; return Math.atan2(vz, vx) / D2R; });
    for (let i = 1; i < n; i++) { while (Hd[i] - Hd[i - 1] > 180) Hd[i] -= 360; while (Hd[i] - Hd[i - 1] < -180) Hd[i] += 360; }
    const ch = [X, Z, R, PI, Hd].map(arr => ({ v: arr, m: arr.map((_, i) => tang(arr, i)) }));
    return function (t) {
      t = clamp(t, T[0], T[n - 1]); let i = 0; while (i < n - 2 && t > T[i + 1]) i++; const dt = T[i + 1] - T[i], s = (t - T[i]) / dt, s2 = s * s, s3 = s2 * s;
      const h = (c) => (2 * s3 - 3 * s2 + 1) * c.v[i] + (s3 - 2 * s2 + s) * dt * c.m[i] + (-2 * s3 + 3 * s2) * c.v[i + 1] + (s3 - s2) * dt * c.m[i + 1];
      return { x: h(ch[0]), y: C.camera.eyeHeight + h(ch[2]), z: h(ch[1]), pitch: h(ch[3]), yaw: h(ch[4]) };
    };
  }

  /* ---------- GL renderer ---------- */
  const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aCol; layout(location=3) in vec2 aUV; layout(location=4) in vec2 aMZ;
uniform mat4 uVP; out vec3 vP; out vec3 vN; out vec3 vC; out vec2 vUV; out vec2 vMZ;
void main(){ vP=aPos; vN=aNor; vC=aCol; vUV=aUV; vMZ=aMZ; gl_Position=uVP*vec4(aPos,1.); }`;
  const FS = `#version 300 es
precision highp float;
#define MAXL 56
in vec3 vP; in vec3 vN; in vec3 vC; in vec2 vUV; in vec2 vMZ; out vec4 oC;
uniform vec3 uEye; uniform sampler2D uAtlas, uDome, uAO; uniform vec4 uAOBox; uniform float uTime, uExp, uPass;
uniform int uNL; uniform vec4 uLPos[MAXL], uLCol[MAXL], uLDir[MAXL], uLPar[MAXL];
uniform vec3 uAmbH, uAmbD, uAmbO, uSunDir, uSunCol, uSea, uSkyTop, uSkyHor;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=.5;} return s; }
vec3 tone(vec3 c){ c*=uExp; c=(c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14); return pow(clamp(c,0.,1.),vec3(1./2.2)); }
void main(){
  int m=int(vMZ.x+.5); int zone=int(vMZ.y+.5);
  if(zone==3){ float r=length(vP.xz); if(r<8.75) zone=1; else { float a=degrees(atan(vP.z,vP.x)); zone=(a>49.&&a<170.)?0:2; } }
  vec3 N=normalize(vN), V=normalize(uEye-vP);
  if(m==16){ vec2 q=abs(vUV)-vN.xy; float d=length(max(q,0.))+min(max(q.x,q.y),0.); float g=exp(-max(d,0.)/max(vN.z,0.01)*3.0)*0.45; oC=vec4(vC*g,1.); return; }
  if(dot(N,V)<0.) N=-N;
  vec3 alb=pow(vC,vec3(2.2)); float spec=0.08, shin=24.; vec3 emis=vec3(0.); float wao=1.; vec2 uv=vUV;
  if(m==1){ vec2 g=uv/1.2; vec2 id=floor(g), f=fract(g); float edge=min(min(f.x,1.-f.x),min(f.y,1.-f.y)); float vv=abs(fbm(uv*1.4+id*3.)-0.5);
    alb*= (0.8+0.35*h21(id))*(0.88+0.25*fbm(uv*3.)); alb*=1.-0.14*smoothstep(0.04,0.,vv); alb*=mix(0.45,1.,smoothstep(0.,0.012,edge)); spec=0.45; shin=70.; }
  else if(m==2){ float pw=0.16; float pid=floor(uv.y/pw); float fv=fract(uv.y/pw); float seg=floor(uv.x/2.4+pid*0.37); float rr=h21(vec2(pid,seg)); float grain=fbm(vec2(uv.x*1.3+rr*9.,uv.y*26.));
    alb*=(0.62+0.7*grain)*(0.82+0.35*rr); alb*=mix(0.35,1.,smoothstep(0.,0.07,fv)*smoothstep(0.,0.07,1.-fv)); float bj=fract(uv.x/2.4+pid*0.37); alb*=mix(0.4,1.,smoothstep(0.,0.01,bj)); spec=0.25; shin=36.; }
  else if(m==3){ alb*=0.86+0.22*fbm(uv*6.)+0.08*h21(floor(uv*140.)); alb*=1.+0.05*sin(uv.x*3.+fbm(uv*0.8)*9.); spec=0.02; }
  else if(m==4){ alb*=(0.93+0.07*sin(uv.x*90.)*sin(uv.y*90.))*(0.92+0.16*fbm(uv*10.)); spec=0.06; shin=10.; }
  else if(m==5){ alb*=0.94+0.1*fbm(uv*5.); wao=0.62+0.38*smoothstep(0.,1.6,vP.y); wao*=1.-0.25*smoothstep(H_TOP-0.9,H_TOP,vP.y); spec=0.05; }
  else if(m==6){ vec3 t=texture(uAtlas,uv).rgb; emis=t*1.5; alb=vec3(0.); }
  else if(m==7){ vec3 t=texture(uDome,uv).rgb; float r=length(uv*2.-1.); emis=t*1.25*smoothstep(1.05,0.9,r)+vec3(0.01,0.02,0.04); alb=vec3(0.); }
  else if(m==9){ float s=sin(uv.x*1.2+uv.y*3.)*.5+.5; alb*=mix(1.,0.62,smoothstep(.4,.6,s))*(0.9+0.2*fbm(uv*8.)); spec=0.7; shin=60.; }
  else if(m==10){ float tooth=abs(fract(uv.x*7.)-0.5)*2.; if(abs(uv.y)>0.18+0.82*(1.-tooth*0.85)) discard; alb*=0.75+0.4*vn(uv*7.); spec=0.12; }
  else if(m==17){ alb*=0.8+0.3*vn(uv*6.); alb=mix(alb,alb*1.5,smoothstep(0.12,0.,abs(uv.y))); spec=0.15; }
  else if(m==11){ emis=vC*2.6; alb=vec3(0.); }
  else if(m==12){ spec=0.9; shin=100.; wao=0.55+0.45*smoothstep(0.,2.,vP.y); }
  else if(m==13){ float s=step(0.5,fract(uv.x/0.2)); alb*=mix(0.3,1.1,s); spec=0.3; shin=40.; }
  else if(m==14){ float d=length(vP.xz); float w=fbm(vP.xz*0.12+vec2(uTime*0.03,0.))+0.5*vn(vP.xz*0.6+uTime*0.1); alb*=0.7+0.5*w; spec=1.; shin=300.; }
  else if(m==18){ alb=pow(texture(uAtlas,uv).rgb,vec3(2.2)); spec=0.25; shin=40.; }
  else if(m==19){ vec2 q=(uv-floor(uv/1.6)*1.6)/1.6*2.-1.; float x=min(abs(abs(q.x)-abs(q.y)),9.); float fr=max(abs(q.x),abs(q.y)); float frame=step(x,0.07)+step(0.93,fr); alb=mix(vec3(0.3,0.45,0.6),vec3(0.05),clamp(frame,0.,1.)); emis=mix(vec3(0.25,0.4,0.6),vec3(0.),clamp(frame,0.,1.))*0.7; spec=0.8; shin=80.; }
  else if(m==20){ spec=0.9; shin=70.; }
  else if(m==21){ float sm=abs(fract(uv.x*1.2)-0.5); float seam=smoothstep(0.5,0.47,sm); alb*=mix(0.8,1.,seam)*(0.93+0.12*fbm(uv*2.2))*(0.97+0.05*sin(uv.y*55.+fbm(uv*3.)*6.)); emis=alb*vec3(1.,0.82,0.58)*0.16; spec=0.04; shin=8.; }
  else if(m==8){ vec3 acc=vec3(0.); float fres=pow(1.-max(dot(N,V),0.),3.); vec3 env=mix(uAmbH*2.,vec3(0.8,0.9,1.)*0.25,0.5); acc=env*(0.4+fres);
    for(int i=0;i<MAXL;i++){ if(i>=uNL) break; float lz=uLCol[i].w; if(lz>=0.&&int(lz+.5)!=zone) continue; vec3 Lv=uLPos[i].xyz-vP; float d=length(Lv); if(d>uLPos[i].w) continue; vec3 L=Lv/d; float sf=smoothstep(uLDir[i].w,uLPar[i].x,dot(-L,uLDir[i].xyz)); float at=pow(clamp(1.-pow(d/uLPos[i].w,4.),0.,1.),2.)/(1.+d*d*0.25); acc+=uLCol[i].rgb*sf*at*pow(max(dot(N,normalize(L+V)),0.),90.)*3.; }
    oC=vec4(tone(acc*0.8),clamp(0.14+fres*0.6+dot(acc,vec3(0.3))*0.25,0.,0.85)); return; }
  float ao=1.;
  if(vP.y<0.3 && N.y>0.5){ ao=texture(uAO,(vP.xz-uAOBox.xy)/uAOBox.zw).r; }
  vec3 amb = zone==0? uAmbH : (zone==1? uAmbD : uAmbO*mix(0.6,1.,N.y*.5+.5));
  if(zone==0) amb*=mix(0.75,1.15,N.y*.5+.5);
  vec3 lit=alb*amb*ao*wao; vec3 sp=vec3(0.);
  if(zone==2){ float d=max(dot(N,uSunDir),0.); lit+=alb*uSunCol*d*1.5; sp+=uSunCol*pow(max(dot(N,normalize(uSunDir+V)),0.),shin)*spec*1.5; }
  for(int i=0;i<MAXL;i++){ if(i>=uNL) break; float lz=uLCol[i].w; if(lz>=0.&&int(lz+.5)!=zone) continue;
    vec3 Lv=uLPos[i].xyz-vP; float d=length(Lv); if(d>uLPos[i].w) continue; vec3 L=Lv/d;
    float sf=smoothstep(uLDir[i].w,uLPar[i].x,dot(-L,uLDir[i].xyz)); if(sf<=0.) continue;
    float at=pow(clamp(1.-pow(d/uLPos[i].w,4.),0.,1.),2.)/(1.+d*d*0.25);
    float nd=max((dot(N,L)+0.15)/1.15,0.); vec3 lc=uLCol[i].rgb*sf*at*mix(1.,ao,0.55)*wao;
    lit+=alb*lc*nd; sp+=lc*pow(max(dot(N,normalize(L+V)),0.),shin)*spec*step(0.,dot(N,L)); }
  vec3 col=lit+sp+emis;
  oC=vec4(tone(col),1.);
}`.replace(/H_TOP/g, (C.arch.hallCeiling).toFixed(2));
  const SKY_VS = `#version 300 es
out vec3 vD; uniform vec3 uR, uU, uF; uniform vec2 uT;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); vec2 q=p*2.-1.; gl_Position=vec4(q,0.9999,1.); vD=uF+uR*q.x*uT.x+uU*q.y*uT.y; }`;
  const SKY_FS = `#version 300 es
precision highp float; in vec3 vD; out vec4 oC; uniform vec3 uSunDir, uSunCol, uSkyTop, uSkyHor, uSea; uniform float uExp;
vec3 tone(vec3 c){ c*=uExp; c=(c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14); return pow(clamp(c,0.,1.),vec3(1./2.2)); }
void main(){ vec3 d=normalize(vD); float h=d.y; vec3 sky=mix(uSkyHor,uSkyTop,pow(clamp(h,0.,1.),0.45)); sky=pow(sky,vec3(2.2))*1.6;
  float s=max(dot(d,normalize(uSunDir)),0.); sky+=uSunCol*(pow(s,900.)*8.+pow(s,10.)*0.35); if(h<0.) sky=mix(sky,pow(uSea,vec3(2.2))*0.8,smoothstep(0.,-0.05,h)); oC=vec4(tone(sky),1.); }`;
  const EQ_VS = `#version 300 es
out vec2 vUV; void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUV=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;
  const EQ_FS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 oC; uniform samplerCube uCube; uniform vec3 uR, uU, uF; uniform float uFade;
void main(){ float lon=(vUV.x-0.5)*6.2831853, lat=(vUV.y-0.5)*3.1415927; vec3 d=vec3(sin(lon)*cos(lat), sin(lat), -cos(lon)*cos(lat)); vec3 w=uR*d.x+uU*d.y+uF*(-d.z);
  oC=vec4(texture(uCube,w).rgb*uFade,1.); }`;

  class Renderer {
    constructor(canvas, opts) {
      opts = opts || {}; let gl = null;   // try the preferred attributes first, then progressively plainer ones (some drivers refuse powerPreference / MSAA)
      for (const a of [{ antialias: opts.antialias !== false, powerPreference: 'high-performance' }, { antialias: false, powerPreference: 'default' }, { antialias: false, powerPreference: 'low-power' }]) { gl = canvas.getContext('webgl2', Object.assign({ preserveDrawingBuffer: !!opts.preserve, alpha: false }, a)); if (gl) break; }
      this.gl = gl; if (!gl) throw new Error('WebGL2 not available'); this.canvas = canvas;
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) + '\n' + s.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n').slice(0, 4000)); return o; };
      const prog = (v, f) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); p.u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name.replace('[0]', ''); p.u[nm] = gl.getUniformLocation(p, gl.getActiveUniform(p, i).name); } return p; };
      this.pMain = prog(VS, FS); this.pSky = prog(SKY_VS, SKY_FS); this.pEq = prog(EQ_VS, EQ_FS);
      this.scene = opts.scene || buildScene(); this.cam = buildCamera(); this.lights = this.scene.lights.concat(C.lights.map(l => Object.assign({}, l)));
      this.lights = C.lights.concat(this.scene.lights).slice(0, 56);
      this.vao = gl.createVertexArray(); this.bufs = {};
      for (const k of ['opq', 'blend', 'add']) { const arr = new Float32Array(this.scene[k]); this.bufs[k] = { n: arr.length / 13, b: gl.createBuffer() }; gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[k].b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); }
      this.vaos = {}; for (const k of ['opq', 'blend', 'add']) { const v = gl.createVertexArray(); gl.bindVertexArray(v); gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[k].b); [[3, 0], [3, 3], [3, 6], [2, 9], [2, 11]].forEach(([n, o], i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 52, o * 4); }); this.vaos[k] = v; }
      gl.bindVertexArray(null);
      this.lowQ = !!opts.lowQ; this.makeTextures(); this.cube = null; this.log = opts.log || (() => {});
      this.log('scene: ' + this.bufs.opq.n + ' opaque verts, ' + this.bufs.blend.n + ' blend, ' + this.bufs.add.n + ' glow, ' + this.lights.length + ' lights');
    }
    makeTextures() {
      const gl = this.gl, nC = C.contents.length, cols = 4, rows = Math.ceil(nC / cols); this.cw = 640; this.ch = 360;
      this.atlasCv = document.createElement('canvas'); this.atlasCv.width = cols * this.cw; this.atlasCv.height = rows * this.ch; this.atlasCtx = this.atlasCv.getContext('2d');
      this.domeCv = document.createElement('canvas'); this.domeCv.width = this.domeCv.height = this.lowQ ? 512 : 1024; this.domeCtx = this.domeCv.getContext('2d');
      const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const an = gl.getExtension('EXT_texture_filter_anisotropic'); if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 8); return t; };
      this.tAtlas = tex(); this.tDome = tex(); this.tAO = tex();
      this.staticDone = false; this.buildAO();
    }
    buildAO() {
      const gl = this.gl, S = 1536, box = this.aoBox = [-22, -16, 46, 46], cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S); const k = S / box[2];
      const draw = (blurM, strength, sel) => { const t = document.createElement('canvas'); t.width = t.height = S; const tc = t.getContext('2d'); tc.fillStyle = '#000';
        for (const f of this.scene.fps) { if (!sel(f)) continue; tc.globalAlpha = Math.min(1, f.k); tc.beginPath(); f.pts.forEach((p, i) => { const x = (p[0] - box[0]) * k, y = (p[1] - box[1]) * k; i ? tc.lineTo(x, y) : tc.moveTo(x, y); }); tc.closePath(); tc.fill(); }
        ctx.filter = `blur(${blurM * k}px)`; ctx.globalAlpha = strength; ctx.drawImage(t, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1; };
      draw(0.55, 0.55, f => true); draw(0.12, 0.35, f => true);
      const gl2 = gl; gl2.bindTexture(gl2.TEXTURE_2D, this.tAO); gl2.pixelStorei(gl2.UNPACK_FLIP_Y_WEBGL, false); gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, gl2.RGBA, gl2.UNSIGNED_BYTE, cv); gl2.generateMipmap(gl2.TEXTURE_2D);
    }
    setLowQ(v) { this.lowQ = !!v; this.domeCv.width = this.domeCv.height = v ? 512 : 1024; this._n = 0; }
    updateContent(t) {
      if (this.lowQ && this.staticDone && (this._n = (this._n || 0) + 1) % 3 !== 1) return;   // low quality: refresh screens at 1/3 rate
      const gl = this.gl, ctx = this.atlasCtx, cols = 4;
      C.contents.forEach((c, i) => { if (c.static && this.staticDone) return; const x = (i % cols) * this.cw, y = Math.floor(i / cols) * this.ch; ctx.save(); ctx.beginPath(); ctx.rect(x, y, this.cw, this.ch); ctx.clip(); ctx.translate(x, y);
        (c.draw || CONTENT.types[c.type])(ctx, this.cw, this.ch, t, c.p || {}); ctx.restore(); }); this.staticDone = true;
      const dc = this.domeCtx; dc.save(); const DS = this.domeCv.width; (C.dome.draw || CONTENT.types[C.dome.type])(dc, DS, DS, t, C.dome.p || {}); dc.restore();
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, this.tAtlas); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlasCv); gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, this.tDome); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.domeCv); gl.generateMipmap(gl.TEXTURE_2D);
    }
    setLights(t) {
      const gl = this.gl, p = this.pMain, n = this.lights.length, pos = new Float32Array(224), col = new Float32Array(224), dir = new Float32Array(224), par = new Float32Array(224);
      this.lights.forEach((l, i) => { const zid = l.zone === 'all' ? -1 : ZONES[l.zone]; let k = l.intensity * (l.pulse ? 0.8 + 0.25 * Math.sin(t * 0.7) : 1);
        pos.set([l.pos[0], l.pos[1], l.pos[2], l.range], i * 4); col.set([l.color[0] * k, l.color[1] * k, l.color[2] * k, zid], i * 4);
        if (l.type === 'spot') { const d = norm(sub(l.target, l.pos)), co = Math.cos(l.cone / 2 * D2R), ci = Math.cos(l.cone / 2 * 0.55 * D2R); dir.set([d[0], d[1], d[2], co], i * 4); par.set([ci, 0, 0, 0], i * 4); } else { dir.set([0, -1, 0, -2], i * 4); par.set([-1.5, 0, 0, 0], i * 4); } });
      gl.uniform1i(p.u.uNL, n); gl.uniform4fv(p.u.uLPos, pos); gl.uniform4fv(p.u.uLCol, col); gl.uniform4fv(p.u.uLDir, dir); gl.uniform4fv(p.u.uLPar, par);
    }
    drawWorld(vp, eye, basis, tanx, tany, t) {
      const gl = this.gl, O = C.outside, V = C.video, p = this.pMain;
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.pSky); const s = this.pSky.u; gl.uniform3fv(s.uR, basis.r); gl.uniform3fv(s.uU, basis.u); gl.uniform3fv(s.uF, basis.f); gl.uniform2f(s.uT, tanx, tany);
      gl.uniform3fv(s.uSunDir, O.sunDir); gl.uniform3fv(s.uSunCol, O.sunColor); gl.uniform3fv(s.uSkyTop, O.skyTop); gl.uniform3fv(s.uSkyHor, O.skyHorizon); gl.uniform3fv(s.uSea, O.sea); gl.uniform1f(s.uExp, V.exposure);
      gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST); gl.useProgram(p);
      gl.uniformMatrix4fv(p.u.uVP, false, vp); gl.uniform3fv(p.u.uEye, eye); gl.uniform1f(p.u.uTime, t); gl.uniform1f(p.u.uExp, V.exposure);
      gl.uniform3fv(p.u.uAmbH, C.ambient.hall); gl.uniform3fv(p.u.uAmbD, C.ambient.dome); gl.uniform3fv(p.u.uAmbO, C.ambient.out);
      gl.uniform3fv(p.u.uSunDir, norm(O.sunDir)); gl.uniform3fv(p.u.uSunCol, O.sunColor); gl.uniform3fv(p.u.uSea, O.sea);
      gl.uniform4f(p.u.uAOBox, this.aoBox[0], this.aoBox[1], this.aoBox[2], this.aoBox[3]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tAtlas); gl.uniform1i(p.u.uAtlas, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tDome); gl.uniform1i(p.u.uDome, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tAO); gl.uniform1i(p.u.uAO, 2);
      this.setLights(t);
      gl.bindVertexArray(this.vaos.opq); gl.drawArrays(gl.TRIANGLES, 0, this.bufs.opq.n);
      gl.depthMask(false); gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.bindVertexArray(this.vaos.blend); gl.drawArrays(gl.TRIANGLES, 0, this.bufs.blend.n);
      gl.blendFunc(gl.ONE, gl.ONE); gl.bindVertexArray(this.vaos.add); gl.drawArrays(gl.TRIANGLES, 0, this.bufs.add.n);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    ensureCube(size) {
      const gl = this.gl; if (this.cube && this.cubeSize === size) return; this.cubeSize = size;
      this.cube = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.cube);
      for (let i = 0; i < 6; i++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.fbo = gl.createFramebuffer(); this.depthRb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, size, size);
    }
    /** Render the full 360 view for time t into the current canvas (equirectangular). */
    renderEquirect(t, fade) {
      const gl = this.gl, V = C.video, size = V.cubeSize, cam = this.cam(t); this.ensureCube(size); this.updateContent(t);
      const eye = [cam.x, cam.y, cam.z], faces = [[[1, 0, 0], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]], [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, -1]], [[0, 0, 1], [0, -1, 0]], [[0, 0, -1], [0, -1, 0]]];
      const proj = mat4.persp(Math.PI / 2, 1, 0.05, 1000);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRb); gl.viewport(0, 0, size, size);
      for (let i = 0; i < 6; i++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, this.cube, 0);
        const [f, u] = faces[i], vp = mat4.mul(proj, mat4.look(eye, f, u)), r = norm(cross(f, u));
        this.drawWorld(vp, eye, { r, u: [u[0], u[1], u[2]], f }, 1, 1, t);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.disable(gl.DEPTH_TEST);
      const yaw = cam.yaw * D2R, pit = cam.pitch * D2R, f = [Math.cos(yaw) * Math.cos(pit), Math.sin(pit), Math.sin(yaw) * Math.cos(pit)], rr = norm(cross(f, [0, 1, 0])), uu = cross(rr, f);
      gl.useProgram(this.pEq); const q = this.pEq.u; gl.uniform3fv(q.uR, rr); gl.uniform3fv(q.uU, uu); gl.uniform3fv(q.uF, f); gl.uniform1f(q.uFade, fade == null ? 1 : fade);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.cube); gl.uniform1i(q.uCube, 3); gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    /** Normal perspective view for the live viewer. view = {x,y,z,yaw,pitch,fov}. */
    renderPerspective(t, view, fade) {
      const gl = this.gl, w = this.canvas.width, h = this.canvas.height; this.updateContent(t); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
      const yaw = view.yaw * D2R, pit = view.pitch * D2R, f = [Math.cos(yaw) * Math.cos(pit), Math.sin(pit), Math.sin(yaw) * Math.cos(pit)], r = norm(cross(f, [0, 1, 0])), u = cross(r, f), eye = [view.x, view.y, view.z];
      const fovy = view.fov * D2R, vp = mat4.mul(mat4.persp(fovy, w / h, 0.05, 1000), mat4.look(eye, f, [0, 1, 0]));
      this.drawWorld(vp, eye, { r, u, f }, Math.tan(fovy / 2) * w / h, Math.tan(fovy / 2), t);
    }
  }
  window.Museum = { Renderer, hex, buildCamera, buildScene };
})();
