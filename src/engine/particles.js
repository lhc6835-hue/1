// Top-down particles with height (z): screen y = y - z. Sparks stretch with speed, bounce on the floor and glow;
// smoke is truly translucent and lit on top; debris tumbles, bounces, settles and fades.
import { clamp, lerp, ramp, bayer, mix } from "./fx.js";

export const G = 520; // px/s^2 along z
export const K = { SPARK: 0, EMBER: 1, SMOKE: 2, VAPOUR: 3, DUST: 4, SHARD: 5, FLAKE: 6, STREAK: 7, BOLT: 8, MOTE: 9 };

export class Particles {
  constructor() { this.list = []; this.lights = []; }
  spawn(o) {
    const p = Object.assign({
      kind: K.SPARK, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, t: 0, delay: 0,
      size: 1, c: 0xffffff, c2: 0xffaa33, drag: 2, g: 1, bounce: 0.45, a: 0, va: 0, rest: false, ramp: null,
      glow: 0.35, tx: 0, ty: 0, seed: Math.random(),
    }, o);
    this.list.push(p); return p;
  }
  light(x, y, r, c, k, life, z = 0) { this.lights.push({ x, y, z, r, c, k, life, t: 0 }); }
  get count() { return this.list.length; }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      if (p.t >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      const dr = Math.exp(-p.drag * dt);
      switch (p.kind) {
        case K.SPARK: case K.SHARD: case K.FLAKE: {
          p.vx *= dr; p.vy *= dr;
          if (!p.rest) {
            p.vz -= G * p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.a += p.va * dt;
            if (p.z <= 0) {
              p.z = 0;
              if (Math.abs(p.vz) > 40 && p.bounce > 0) { p.vz = -p.vz * p.bounce; p.va *= 0.6; p.vx *= 0.7; p.vy *= 0.7; }
              else { p.vz = 0; if (p.kind !== K.SPARK) { p.vx *= 0.8; p.vy *= 0.8; if (Math.hypot(p.vx, p.vy) < 6) p.rest = true; } }
            }
          }
          break;
        }
        case K.EMBER: case K.MOTE: {
          p.vx = p.vx * dr + Math.sin(p.t * 7 + p.seed * 40) * 18 * dt;
          p.vy *= dr; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; break;
        }
        case K.SMOKE: case K.VAPOUR: case K.DUST: {
          p.vx *= dr; p.vy *= dr; p.x += p.vx * dt + Math.sin(p.t * 3 + p.seed * 9) * 4 * dt; p.y += p.vy * dt; p.z += p.vz * dt; break;
        }
        case K.STREAK: { // accelerates toward (tx, ty)
          const u = p.t / p.life, k = u * u;
          p.px = p.x; p.py = p.y;
          p.x = lerp(p.sx0 ?? (p.sx0 = p.x), p.tx, k); p.y = lerp(p.sy0 ?? (p.sy0 = p.y), p.ty, k); break;
        }
      }
    }
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i]; l.t += dt; if (l.t >= l.life) { this.lights.splice(i, 1); }
    }
  }

  // layer: "ground" = things lying on the floor, "air" = everything else
  draw(p, layer = "air") {
    for (const q of this.list) {
      if (q.delay > 0) continue;
      const u = q.t / q.life;
      const onGround = q.z <= 0.5 && (q.kind === K.SHARD || q.kind === K.DUST);
      if ((layer === "ground") !== onGround) continue;
      const X = q.x, Y = q.y - q.z;
      switch (q.kind) {
        case K.SPARK: {
          const sp = Math.hypot(q.vx, q.vy - q.vz);
          const len = clamp(sp * 0.022, 0.5, 6) * (1 - u * 0.5);
          const ux = sp > 1 ? q.vx / sp : 0, uy = sp > 1 ? (q.vy - q.vz) / sp : 0;
          const head = u < 0.35 ? 0xffffff : q.c, tail = q.c2;
          p.line(X - ux * len, Y - uy * len, X, Y, (t) => (t > 0.6 ? head : tail), u > 0.7 ? (1 - u) / 0.3 : 1);
          if (q.glow) p.glow(X, Y, 4, q.c, q.glow * (1 - u));
          break;
        }
        case K.EMBER: case K.MOTE: {
          const c = q.ramp ? ramp(q.ramp, 1 - u) : q.c;
          p.dot(X, Y, c, u > 0.6 ? (1 - u) / 0.4 : 1);
          if (q.kind === K.EMBER) p.dot(X - q.vx * 0.03, Y + 1, mix(c, 0x000000, 0.5), 0.5 * (1 - u));
          if (q.glow) p.glow(X, Y, 3, c, q.glow * (1 - u));
          break;
        }
        case K.SMOKE: case K.VAPOUR: case K.DUST: {
          const grow = q.kind === K.DUST ? 0.6 : 1;
          const r = q.size * (0.5 + u * 1.1 * grow);
          const a = (q.kind === K.VAPOUR ? 0.35 : q.kind === K.DUST ? 0.5 : 0.55) * (u < 0.1 ? u / 0.1 : 1 - Math.pow(u, 1.3));
          const base = q.ramp ? ramp(q.ramp, 1 - u) : q.c, top = q.ramp ? ramp(q.ramp, Math.min(0.999, 1.25 - u)) : (q.c2 ?? mix(base, 0xffffff, 0.25));
          p.disc(X, Y, r, (d, an) => (an < -0.6 && an > -2.6 && d > 0.45 ? top : base), (d) => (d > 0.8 ? a * 0.6 : a));
          if (q.glow) p.glow(X, Y, r + 4, q.ramp ? top : (q.c2 ?? q.c), q.glow * (1 - u) * (1 - u));
          break;
        }
        case K.SHARD: {
          // a small tumbling plate: 2-4 px with a lit edge; shadow when airborne
          const s = q.size, ca = Math.cos(q.a), sa = Math.sin(q.a);
          const fade = q.rest ? clamp((q.life - q.t) / 0.5) : 1;
          if (q.z > 1) p.dot(q.x, q.y + 1, 0x000000, 0.35 * fade);
          for (let i = -s; i <= s; i++) {
            const ix = X + ca * i * 0.7, iy = Y + sa * i * 0.7;
            p.dot(ix, iy, i < 0 ? q.c2 : q.c, fade);
          }
          if (s >= 2) p.dot(X - sa, Y + ca, q.c2, fade);
          if (q.glow && !q.rest) p.glow(X, Y, 3, 0xffa040, q.glow * (1 - u));
          break;
        }
        case K.FLAKE: {
          p.dot(X, Y, q.c, u > 0.7 ? (1 - u) / 0.3 : 1);
          if (q.size > 1) { p.dot(X + 1, Y, q.c2, 0.6); p.dot(X - 1, Y, q.c2, 0.6); p.dot(X, Y + 1, q.c2, 0.6); p.dot(X, Y - 1, q.c2, 0.6); }
          break;
        }
        case K.STREAK: {
          const px = q.px ?? q.x, py = q.py ?? q.y;
          const dx = q.x - px, dy = q.y - py;
          p.line(q.x - dx * 3, q.y - dy * 3, q.x, q.y, (t) => (t > 0.7 ? 0xffffff : q.c), (t) => 0.3 + t * 0.7);
          p.glow(q.x, q.y, 4, q.c, 0.4);
          break;
        }
      }
    }
    if (layer === "air") for (const l of this.lights) {
      const u = l.t / l.life, k = l.k * (1 - u) * (1 - u);
      p.glow(l.x, l.y - l.z, l.r * (0.7 + 0.3 * (1 - u)), l.c, k);
    }
  }
}

// helpers for common bursts
export function sparkBurst(ps, rng, x, y, z, n, opt = {}) {
  const { dir = null, spread = Math.PI, speed = [60, 200], vz = [40, 160], life = [0.25, 0.6], c = 0xffd27a, c2 = 0xff7a1a, glow = 0.35 } = opt;
  for (let i = 0; i < n; i++) {
    const a = dir == null ? rng.range(0, Math.PI * 2) : dir + rng.range(-spread / 2, spread / 2);
    const s = rng.range(speed[0], speed[1]);
    ps.spawn({ kind: K.SPARK, x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rng.range(vz[0], vz[1]), life: rng.range(life[0], life[1]), c, c2, drag: 2.2, bounce: 0.4, glow });
  }
}
export function smokePuff(ps, rng, x, y, z, n, opt = {}) {
  const { c = 0x3a3440, c2 = 0x5c5462, size = [3, 6], life = [0.8, 1.6], vz = [8, 22], spread = 30, glow = 0, kind = K.SMOKE, delay = 0 } = opt;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), s = rng.range(4, spread);
    ps.spawn({ kind, x: x + rng.range(-2, 2), y: y + rng.range(-2, 2), z, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rng.range(vz[0], vz[1]), life: rng.range(life[0], life[1]), size: rng.range(size[0], size[1]), c, c2, drag: 2.5, glow, delay: delay + rng.range(0, 0.08) });
  }
}
export { bayer };
