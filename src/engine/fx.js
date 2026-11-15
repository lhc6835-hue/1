// Pixel FX core: two buffers in the pixelfx spirit (color = pixels, light = additive glow),
// plus an illumination buffer that lights the scene underneath. Written for this game.

export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const ease = {
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inQuad: (t) => t * t,
  inCubic: (t) => t * t * t,
  outBack: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

export const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
export const mix = (a, b, t) => {
  const A = rgb(a), B = rgb(b);
  return (Math.round(lerp(A[0], B[0], t)) << 16) | (Math.round(lerp(A[1], B[1], t)) << 8) | Math.round(lerp(A[2], B[2], t));
};
// pick a step from a ramp (dark -> bright), u in 0..1; hard steps, no gradients
export const ramp = (R, u) => R[Math.max(0, Math.min(R.length - 1, Math.floor(u * R.length)))];

// seeded rng
export class Rng {
  constructor(seed = 1) { this.s = (seed * 2654435761) >>> 0 || 1; }
  next() { let x = this.s; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; this.s = x; return x / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

export class Frame {
  constructor(w, h) {
    this.w = w; this.h = h;
    const n = w * h;
    this.cr = new Float32Array(n); this.cg = new Float32Array(n); this.cb = new Float32Array(n); this.ca = new Float32Array(n);
    this.lr = new Float32Array(n); this.lg = new Float32Array(n); this.lb = new Float32Array(n);
    this.ir = new Float32Array(n); this.ig = new Float32Array(n); this.ib = new Float32Array(n);
  }
  clear() {
    this.cr.fill(0); this.cg.fill(0); this.cb.fill(0); this.ca.fill(0);
    this.lr.fill(0); this.lg.fill(0); this.lb.fill(0);
    this.ir.fill(0); this.ig.fill(0); this.ib.fill(0);
  }
  over(ix, iy, c, a) {
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h || a <= 0) return;
    const i = iy * this.w + ix; if (a > 1) a = 1;
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, k = 1 - a;
    this.cr[i] = r * a + this.cr[i] * k; this.cg[i] = g * a + this.cg[i] * k; this.cb[i] = b * a + this.cb[i] * k;
    this.ca[i] = a + this.ca[i] * k;
  }
  add(ix, iy, c, k) {
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h || k <= 0) return;
    const i = iy * this.w + ix;
    this.lr[i] += ((c >> 16) & 255) * k; this.lg[i] += ((c >> 8) & 255) * k; this.lb[i] += (c & 255) * k;
  }
  illum(ix, iy, c, k) {
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h || k <= 0) return;
    const i = iy * this.w + ix;
    this.ir[i] += (((c >> 16) & 255) / 255) * k; this.ig[i] += (((c >> 8) & 255) / 255) * k; this.ib[i] += ((c & 255) / 255) * k;
  }
}

// A painter maps local effect coordinates (x right, y down, origin at the anchor) to the frame.
export class Painter {
  constructor(frame) { this.f = frame; this.set(0, 0, 0, 0); }
  set(x, y, ox, oy, flip = false, angle = 0, z = 0) {
    this.x = x; this.y = y - z; this.ox = ox; this.oy = oy; this.fl = flip ? -1 : 1;
    this.an = angle; this.cs = Math.cos(angle); this.sn = Math.sin(angle);
    return this;
  }
  // local -> screen (floats)
  sx(lx, ly) { lx *= this.fl; return this.x + lx * this.cs - ly * this.sn - this.ox; }
  sy(lx, ly) { lx *= this.fl; return this.y + lx * this.sn + ly * this.cs - this.oy; }
  // local angle -> screen angle
  ang(a) { if (this.fl < 0) a = Math.PI - a; return a + this.an; }

  px(x, y, c) { this.f.over(Math.round(this.sx(x, y)), Math.round(this.sy(x, y)), c, 1); }
  dot(x, y, c, a = 1) {
    const ix = Math.round(this.sx(x, y)), iy = Math.round(this.sy(x, y));
    if (a >= 1 || a > bayer(ix, iy)) this.f.over(ix, iy, c, 1);
  }
  blend(x, y, c, a) { this.f.over(Math.round(this.sx(x, y)), Math.round(this.sy(x, y)), c, a); }
  light(x, y, c, k = 0.5) {
    const ix = Math.round(this.sx(x, y)), iy = Math.round(this.sy(x, y));
    this.f.add(ix, iy, c, k); this.f.illum(ix, iy, c, k * 0.6);
  }

  // line with dithered alpha; c and a may be functions of u (0..1 along the line)
  line(x0, y0, x1, y1, c, a = 1, translucent = false) {
    const X0 = this.sx(x0, y0), Y0 = this.sy(x0, y0), X1 = this.sx(x1, y1), Y1 = this.sy(x1, y1);
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(X1 - X0), Math.abs(Y1 - Y0))));
    let lx = -9999, ly = -9999;
    for (let i = 0; i <= n; i++) {
      const u = i / n, ix = Math.round(lerp(X0, X1, u)), iy = Math.round(lerp(Y0, Y1, u));
      if (ix === lx && iy === ly) continue; lx = ix; ly = iy;
      const cc = typeof c === "function" ? c(u) : c, aa = typeof a === "function" ? a(u) : a;
      if (cc == null) continue;
      if (translucent) this.f.over(ix, iy, cc, aa);
      else if (aa >= 1 || aa > bayer(ix, iy)) this.f.over(ix, iy, cc, 1);
    }
  }

  // iterate screen pixels of a local-space disc; fn(ix, iy, d 0..1, screenAngle)
  _disc(x, y, r, fn) {
    const cx = this.sx(x, y), cy = this.sy(x, y);
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    const r2 = r * r;
    for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
      const dx = ix - cx, dy = iy - cy, d2 = dx * dx + dy * dy;
      if (d2 <= r2) fn(ix, iy, Math.sqrt(d2) / (r || 1), Math.atan2(dy, dx));
    }
  }
  // solid/dithered filled circle
  circle(x, y, r, c, a = 1) {
    this._disc(x, y, r, (ix, iy, d, an) => {
      const cc = typeof c === "function" ? c(d, an) : c, aa = typeof a === "function" ? a(d, an) : a;
      if (cc != null && (aa >= 1 || aa > bayer(ix, iy))) this.f.over(ix, iy, cc, 1);
    });
  }
  // truly translucent disc (smoke, vapour, flashes)
  disc(x, y, r, c, a = 0.5) {
    this._disc(x, y, r, (ix, iy, d, an) => {
      const cc = typeof c === "function" ? c(d, an) : c, aa = typeof a === "function" ? a(d, an) : a;
      if (cc != null) this.f.over(ix, iy, cc, aa);
    });
  }
  // ellipse ring on the floor (top-down depth: sy squash)
  ring(x, y, r, w, c, a = 1, sy = 1) {
    const cx = this.sx(x, y), cy = this.sy(x, y);
    const R = r + w;
    for (let iy = Math.floor(cy - R * sy) - 1; iy <= Math.ceil(cy + R * sy) + 1; iy++)
      for (let ix = Math.floor(cx - R) - 1; ix <= Math.ceil(cx + R) + 1; ix++) {
        const dx = ix - cx, dy = (iy - cy) / sy, d = Math.sqrt(dx * dx + dy * dy);
        if (d >= r && d < r + w) {
          const an = Math.atan2(dy, dx), v = (d - r) / w;
          const cc = typeof c === "function" ? c(v, an) : c, aa = typeof a === "function" ? a(v, an) : a;
          if (cc != null && (aa >= 1 || aa > bayer(ix, iy))) this.f.over(ix, iy, cc, 1);
        }
      }
  }
  // band of a ring between local angles a0..a1; c(u along, v across), w may taper w(u)
  arc(x, y, r, w, a0, a1, c, a = 1) {
    const cx = this.sx(x, y), cy = this.sy(x, y);
    let s0 = this.ang(a0), s1 = this.ang(a1);
    if (this.fl < 0) { const t = s0; s0 = s1; s1 = t; }
    const span = s1 - s0, wmax = typeof w === "function" ? Math.max(w(0), w(0.5), w(1)) : w;
    const R = r + wmax + 1;
    for (let iy = Math.floor(cy - R); iy <= Math.ceil(cy + R); iy++)
      for (let ix = Math.floor(cx - R); ix <= Math.ceil(cx + R); ix++) {
        const dx = ix - cx, dy = iy - cy, d = Math.sqrt(dx * dx + dy * dy);
        let an = Math.atan2(dy, dx) - s0; an = ((an % TAU) + TAU) % TAU;
        if (an > span) continue;
        let u = an / span; if (this.fl < 0) u = 1 - u;
        const ww = typeof w === "function" ? w(u) : w;
        if (ww <= 0 || d < r - ww / 2 || d >= r + ww / 2) continue;
        const v = (d - (r - ww / 2)) / ww;
        const cc = typeof c === "function" ? c(u, v) : c, aa = typeof a === "function" ? a(u, v) : a;
        if (cc != null && (aa >= 1 || aa > bayer(ix, iy))) this.f.over(ix, iy, cc, 1);
      }
  }
  // additive glow: bloom on top + illumination of what's under
  glow(x, y, r, c, k = 0.5, illum = 1) {
    this._disc(x, y, r, (ix, iy, d) => {
      const f = (1 - d) * (1 - d) * k;
      this.f.add(ix, iy, c, f * 0.55); if (illum) this.f.illum(ix, iy, c, f * 1.3 * illum);
    });
  }
  glowLine(x0, y0, x1, y1, r, c, k = 0.4) {
    const ax = this.sx(x0, y0), ay = this.sy(x0, y0), bx = this.sx(x1, y1), by = this.sy(x1, y1);
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
    for (let iy = Math.floor(Math.min(ay, by) - r); iy <= Math.ceil(Math.max(ay, by) + r); iy++)
      for (let ix = Math.floor(Math.min(ax, bx) - r); ix <= Math.ceil(Math.max(ax, bx) + r); ix++) {
        const t = clamp(((ix - ax) * vx + (iy - ay) * vy) / L2);
        const dx = ix - (ax + vx * t), dy = iy - (ay + vy * t), d = Math.sqrt(dx * dx + dy * dy) / r;
        if (d < 1) { const f = (1 - d) * (1 - d) * k; this.f.add(ix, iy, c, f * 0.55); this.f.illum(ix, iy, c, f * 1.2); }
      }
  }
  // 1-bit mask (Uint8Array w*h, anchored at feet-centre ax, ay)
  mask(m, w, h, ax, ay, c, a = 1, translucent = false) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (m[j * w + i]) {
      const ix = Math.round(this.sx(i - ax, j - ay)), iy = Math.round(this.sy(i - ax, j - ay));
      if (translucent) this.f.over(ix, iy, c, a);
      else if (a >= 1 || a > bayer(ix, iy)) this.f.over(ix, iy, c, 1);
    }
  }
  // tiny sprite from strings; pal maps chars to colors
  sprite(rows, pal, x, y, a = 1) {
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i], c = pal[ch];
      if (c == null) continue;
      this.dot(x + i, y + j, c, a);
    }
  }
}

// star glint: a cross that tapers
export function sparkle(p, x, y, arm, c, tip, k = 0.6) {
  p.px(x, y, c);
  for (let i = 1; i <= arm; i++) {
    const cc = i > arm * 0.5 ? tip : c;
    p.px(x + i, y, cc); p.px(x - i, y, cc); p.px(x, y + i, cc); p.px(x, y - i, cc);
  }
  if (arm > 2) { p.px(x + 1, y + 1, tip); p.px(x - 1, y - 1, tip); p.px(x + 1, y - 1, tip); p.px(x - 1, y + 1, tip); }
  p.glow(x, y, arm * 2 + 3, c, k);
}

// jagged bolt points between two local points
export function bolt(rng, x0, y0, x1, y1, n = 6, jit = 3) {
  const pts = [[x0, y0]];
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let i = 1; i < n; i++) {
    const u = i / n, o = rng.range(-jit, jit);
    pts.push([x0 + dx * u + nx * o, y0 + dy * u + ny * o]);
  }
  pts.push([x1, y1]);
  return pts;
}
export function polyline(p, pts, c, a = 1) {
  for (let i = 0; i < pts.length - 1; i++) p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, a);
}

// Composite the scene (ImageData RGBA) with illumination, fx color and fx light.
// amb: [r, g, b] base light multiplier; base: optional static illum arrays for the view.
export function applyColor(frame, data) {
  const n = frame.w * frame.h, { cr, cg, cb, ca } = frame;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = ca[i]; if (a <= 0) continue; const k = 1 - a;
    data[j] = cr[i] + data[j] * k; data[j + 1] = cg[i] + data[j + 1] * k; data[j + 2] = cb[i] + data[j + 2] * k;
  }
}

export function composite(frame, data, amb, base, tint, extra) {
  const n = frame.w * frame.h;
  const { cr, cg, cb, ca, lr, lg, lb, ir, ig, ib } = frame;
  if (extra) for (let i = 0; i < n; i++) { lr[i] += extra.lr[i]; lg[i] += extra.lg[i]; lb[i] += extra.lb[i]; ir[i] += extra.ir[i]; ig[i] += extra.ig[i]; ib[i] += extra.ib[i]; }
  const ar = amb[0], ag = amb[1], ab = amb[2];
  const tr = tint ? tint[0] : 0, tg = tint ? tint[1] : 0, tb = tint ? tint[2] : 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    let mr = ar + ir[i], mg = ag + ig[i], mb = ab + ib[i];
    if (base) { mr += base[0][i]; mg += base[1][i]; mb += base[2][i]; }
    if (mr > 1.5) mr = 1.5; if (mg > 1.5) mg = 1.5; if (mb > 1.5) mb = 1.5;
    let r = data[j] * mr, g = data[j + 1] * mg, b = data[j + 2] * mb;
    const a = ca[i];
    if (a > 0) { const k = 1 - a; r = cr[i] + r * k; g = cg[i] + g * k; b = cb[i] + b * k; }
    r += lr[i] + tr; g += lg[i] + tg; b += lb[i] + tb;
    data[j] = r > 255 ? 255 : r; data[j + 1] = g > 255 ? 255 : g; data[j + 2] = b > 255 ? 255 : b; data[j + 3] = 255;
  }
}
