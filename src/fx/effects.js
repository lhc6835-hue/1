// Game effects, authored for this game with the pixelfx method (draft, render, look, refine).
// Each factory returns { update(dt), draw(p, ox, oy, layer), done() }. Coordinates are world px; z is height.
import { Rng, TAU, clamp, lerp, seg, ease, ramp, mix, sparkle, bolt, polyline } from "../engine/fx.js";
import { Particles, K, sparkBurst, smokePuff } from "../engine/particles.js";

export const RAMP = {
  blade: [0x0c2a4a, 0x1a5c9a, 0x3aa8e8, 0x9ae8ff, 0xffffff],
  fire: [0x2a0c08, 0x7a1e0c, 0xd0441a, 0xff9a2a, 0xffe08a, 0xffffff],
  smoke: [0x18141c, 0x2a2430, 0x3e3644, 0x554c5a],
  heat: [0x3a3238, 0x6a4a3a, 0xc0581a, 0xff9a3a, 0xffe6a0],
  red: [0x3a0810, 0x8a1424, 0xe03040, 0xff8a8a, 0xffffff],
  holo: [0x1a0c3a, 0x4a1a8a, 0xa03ae0, 0xff7af0, 0xffffff],
  cyan: [0x0a2a30, 0x14646a, 0x2ac0c8, 0x8af8f0, 0xffffff],
  gold: [0x3a2408, 0x8a5a14, 0xe0a030, 0xffe07a, 0xffffff],
  ice: [0x0c1c3a, 0x1e4a8a, 0x4a9ae0, 0xaee4ff, 0xffffff],
};

const base = (life) => { let t = 0; return { get t() { return t; }, step(dt) { t += dt; }, done: () => t >= life }; };

// ---------------------------------------------------------------------------------------------------
// 1. Assassination strike: a fast crescent cut through the target, white hero frame, metal sparks,
//    a cut line that lingers, and electric arcs leaking from the wound.
export function stab(o) {
  const R = new Rng(o.seed ?? 7), ps = new Particles();
  const dir = o.dir ?? 0, B = o.ramp ?? RAMP.blade, z = 10, life = 0.75;
  const T = base(life);
  sparkBurst(ps, R, o.x, o.y, z, 16, { dir, spread: 1.3, speed: [110, 280], vz: [20, 130], life: [0.25, 0.6], c: 0xffe6a0, c2: 0xff7a1a });
  sparkBurst(ps, R, o.x, o.y, z, 6, { dir: dir + Math.PI, spread: 1.0, speed: [40, 110], vz: [30, 90], life: [0.2, 0.4], c: B[3], c2: B[2] });
  ps.light(o.x, o.y, 34, B[3], 1.1, 0.3, z);
  ps.light(o.x, o.y, 18, 0xffffff, 0.9, 0.12, z);
  const arcs = [];
  return {
    update(dt) {
      T.step(dt); ps.update(dt);
      if (T.t > 0.08 && T.t < 0.45 && R.next() < dt * 30) arcs.push({ t: 0, pts: bolt(R, R.range(-5, 5), R.range(-6, 2), R.range(-7, 7), R.range(-10, 4), 4, 2) });
      for (const a of arcs) a.t += dt;
      while (arcs.length && arcs[0].t > 0.06) arcs.shift();
    },
    draw(p, ox, oy, layer) {
      if (layer !== "air") return;
      const t = T.t;
      // hero frame: two frames of white
      p.set(o.x, o.y, ox, oy, false, 0, z);
      if (t < 0.018) { p.disc(0, 0, 5, 0xffffff, 0.9); p.glow(0, 0, 20, 0xffffff, 0.6); }
      // the crescent, centred a little behind the target, sweeping across the strike direction
      p.set(o.x, o.y, ox, oy, false, dir, z);
      const grow = ease.outExpo(seg(t, 0, 0.06)), shrink = ease.inQuad(seg(t, 0.08, 0.3));
      if (t < 0.3) {
        const a0 = -2.0, span = 3.3 * grow, cut = span * shrink;
        const s0 = a0 + cut, s1 = a0 + span;
        if (s1 - s0 > 0.02) {
          p.arc(-5, 0, 16, (u) => 5.5 * Math.sin(Math.PI * clamp(u * 0.9 + 0.1)) * (1 - shrink * 0.7), s0, s1,
            (u, v) => (v > 0.72 ? 0xffffff : v > 0.45 ? B[3] : v > 0.2 ? B[2] : B[1]), (u) => (u < 0.15 ? u / 0.15 : 1));
          for (let i = 0; i <= 8; i++) {
            const a = lerp(s0, s1, i / 8);
            p.glow(-5 + Math.cos(a) * 16, Math.sin(a) * 16, 8, B[3], 0.2 * (1 - shrink));
          }
        }
      }
      // the cut line through the body, lingering
      const L = ease.outQuart(seg(t, 0.02, 0.09)) * 13, fade = 1 - seg(t, 0.12, 0.5);
      if (fade > 0) {
        p.line(-L, -2, L, 2, (u) => (Math.abs(u - 0.5) < 0.2 ? 0xffffff : B[3]), fade);
        p.glowLine(-L, -2, L, 2, 4, B[3], 0.35 * fade);
      }
      // leaking arcs
      p.set(o.x, o.y, ox, oy, false, 0, z - 2);
      for (const a of arcs) { polyline(p, a.pts, a.t < 0.03 ? 0xffffff : B[3]); p.glow(a.pts[2][0], a.pts[2][1], 8, B[3], 0.3); }
      p.set(0, 0, ox, oy);
      ps.draw(p, "air");
    },
    done: () => T.done() && ps.count === 0,
  };
}

// ---------------------------------------------------------------------------------------------------
// 2. Robot breakdown: sputtering arcs, then a pop: white flash, floor shock ring, fireball cooling to smoke,
//    the robot's own plates tumbling and bouncing, sparks, a long smoke column.
export function wreck(o) {
  const R = new Rng(o.seed ?? 3), ps = new Particles(), P = o.pal ?? { l: 0xaaaaaa, m: 0x777777, d: 0x444444, a: 0xffaa33 };
  const POP = o.pop ?? 0.32, life = 3.2, T = base(life);
  let popped = false; const arcs = [];
  return {
    get popped() { return popped; },
    update(dt) {
      T.step(dt); ps.update(dt);
      const t = T.t;
      if (t < POP) {
        if (R.next() < dt * 26) arcs.push({ t: 0, pts: bolt(R, R.range(-6, 6), R.range(-16, -4), R.range(-8, 8), R.range(-18, -2), 4, 2.5) });
        if (R.next() < dt * 10) sparkBurst(ps, R, o.x + R.range(-4, 4), o.y, R.range(6, 14), 2, { speed: [40, 100], vz: [40, 100], life: [0.15, 0.3], c: 0xaef8ff, c2: 0x3aa8e8, glow: 0.3 });
      }
      if (!popped && t >= POP) {
        popped = true;
        // fireball: hot balls cooling into smoke
        for (let i = 0; i < 9; i++) {
          const a = R.range(0, TAU), s = R.range(10, 46);
          ps.spawn({ kind: K.SMOKE, x: o.x + Math.cos(a) * 2, y: o.y + Math.sin(a) * 2, z: R.range(4, 12), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: R.range(10, 40), life: R.range(0.35, 0.7), size: R.range(3, 6), ramp: RAMP.fire, drag: 4, glow: 0.5 });
        }
        smokePuff(ps, R, o.x, o.y, 8, 8, { c: 0x4a4352, c2: 0x6e6678, size: [4, 7], life: [1.4, 2.6], vz: [10, 22], spread: 22, delay: 0.12 });
        // the robot's own plates
        for (let i = 0; i < 13; i++) {
          const a = R.range(0, TAU), s = R.range(25, 75);
          const c = R.pick([P.l, P.m, P.m, P.d, P.a]);
          ps.spawn({ kind: K.SHARD, x: o.x, y: o.y, z: R.range(6, 14), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.75, vz: R.range(70, 170), life: R.range(2.0, 2.9), size: R.int(2, 3), c, c2: mix(c, 0x000000, 0.45), a: R.range(0, TAU), va: R.range(-18, 18), drag: 1.6, bounce: 0.38, glow: i < 4 ? 0.25 : 0 });
        }
        sparkBurst(ps, R, o.x, o.y, 10, 22, { speed: [80, 260], vz: [60, 220], life: [0.3, 0.8] });
        ps.light(o.x, o.y, 50, 0xff9a3a, 0.8, 0.6, 8);
        ps.light(o.x, o.y, 18, 0xffffff, 0.6, 0.1, 8);
      }
      if (popped && t < 2.6 && R.next() < dt * 5) ps.spawn({ kind: K.EMBER, x: o.x + R.range(-4, 4), y: o.y + R.range(-2, 2), z: R.range(2, 6), vx: R.range(-8, 8), vy: 0, vz: R.range(14, 30), life: R.range(0.6, 1.2), ramp: RAMP.fire, glow: 0.3, drag: 1 });
      for (const a of arcs) a.t += dt;
      while (arcs.length && arcs[0].t > 0.05) arcs.shift();
    },
    draw(p, ox, oy, layer) {
      const t = T.t;
      p.set(0, 0, ox, oy);
      ps.draw(p, layer);
      if (layer === "ground") {
        // scorch and the shock ring on the floor
        if (popped) {
          const u = seg(t, POP, POP + 0.3);
          p.set(o.x, o.y, ox, oy);
          if (u < 1) p.ring(0, 0, lerp(3, 24, ease.outCubic(u)), lerp(3, 1, u), (v) => (v > 0.5 ? RAMP.fire[4] : RAMP.fire[3]), 1 - u, 0.55);
          const sc = 1 - seg(t, 1.5, 3.0);
          if (sc > 0) p.disc(0, 0, 8, 0x0e0a0e, (d) => sc * (d < 0.5 ? 0.55 : d < 0.8 ? 0.35 : 0.15));
        }
        return;
      }
      p.set(o.x, o.y, ox, oy);
      for (const a of arcs) { polyline(p, a.pts, a.t < 0.025 ? 0xffffff : 0x8ae8ff); p.glow(a.pts[2][0], a.pts[2][1], 9, 0x5ac8ff, 0.35); }
      if (popped && t < POP + 0.02) { p.disc(0, -8, 8, 0xffffff, 0.85); p.glow(0, -8, 30, 0xffe0a0, 0.8); }
    },
    done: () => T.done() && ps.count === 0,
  };
}

// ---------------------------------------------------------------------------------------------------
// 3. Dismantle: a scan beam sweeps the wreck while a cutter throws sparks. Driven by the game: set .progress.
export function dismantle(o) {
  const R = new Rng(o.seed ?? 11), ps = new Particles();
  let t = 0, alive = true;
  const fx = {
    progress: 0,
    stop() { alive = false; },
    update(dt) {
      t += dt; ps.update(dt);
      if (alive && R.next() < dt * 22) {
        const x = o.x + R.range(-6, 6), y = o.y + R.range(-3, 3);
        sparkBurst(ps, R, x, y, R.range(1, 6), R.int(1, 3), { speed: [30, 110], vz: [40, 120], life: [0.15, 0.35], c: 0xfff0b0, c2: 0xffa030, glow: 0.3 });
      }
    },
    draw(p, ox, oy, layer) {
      p.set(0, 0, ox, oy); ps.draw(p, layer);
      if (layer !== "air" || !alive) return;
      p.set(o.x, o.y, ox, oy);
      const yy = -2 - Math.abs(Math.sin(t * 7)) * 12;
      p.line(-9, yy, 9, yy, (u) => (Math.abs(u - 0.5) < 0.15 ? 0xffffff : RAMP.cyan[3]), (u) => 1 - Math.abs(u - 0.5) * 1.4);
      p.glowLine(-9, yy, 9, yy, 5, RAMP.cyan[3], 0.35);
      // progress ring on the floor
      const pr = fx.progress;
      p.arc(0, 0, 12, 2, -Math.PI / 2, -Math.PI / 2 + TAU * pr, (u, v) => (v > 0.5 ? 0xffffff : RAMP.cyan[3]), 1);
      p.glow(Math.cos(-Math.PI / 2 + TAU * pr) * 12, Math.sin(-Math.PI / 2 + TAU * pr) * 12, 8, RAMP.cyan[3], 0.5);
    },
    done: () => !alive && ps.count === 0,
  };
  return fx;
}

// parts fly from the wreck into the spy: accelerating streaks
export function partFly(o) {
  const R = new Rng(o.seed ?? 5), ps = new Particles();
  for (let i = 0; i < 10; i++) {
    const a = R.range(0, TAU), r = R.range(4, 12);
    ps.spawn({ kind: K.STREAK, x: o.x + Math.cos(a) * r, y: o.y - 6 + Math.sin(a) * r, tx: o.tx, ty: o.ty - 10, life: R.range(0.22, 0.38), delay: R.range(0, 0.12), c: o.c ?? RAMP.cyan[3] });
  }
  return { update(dt) { ps.update(dt); }, draw(p, ox, oy, layer) { p.set(0, 0, ox, oy); ps.draw(p, layer); }, done: () => ps.count === 0 };
}

// ---------------------------------------------------------------------------------------------------
// 4. Equip: a ring snaps in onto the spy, glints at the joints, a short hot flare.
export function equip(o) {
  const R = new Rng(o.seed ?? 9), ps = new Particles(), C = o.ramp ?? RAMP.cyan, T = base(0.7);
  sparkBurst(ps, R, o.x, o.y, 10, 10, { speed: [40, 120], vz: [20, 90], life: [0.2, 0.45], c: C[3], c2: C[2], glow: 0.3 });
  ps.light(o.x, o.y, 30, C[3], 0.9, 0.35, 10);
  return {
    update(dt) { T.step(dt); ps.update(dt); },
    draw(p, ox, oy, layer) {
      p.set(0, 0, ox, oy); ps.draw(p, layer);
      const t = T.t;
      p.set(o.x, o.y, ox, oy);
      if (layer === "ground") {
        const u = ease.outQuart(seg(t, 0, 0.22));
        if (t < 0.4) p.ring(0, 0, lerp(20, 5, u), 1.5, (v) => (v > 0.5 ? 0xffffff : C[3]), 1 - seg(t, 0.2, 0.4), 0.5);
        return;
      }
      const g = seg(t, 0.1, 0.5);
      if (g > 0 && g < 1) for (const [x, y] of [[-6, -12], [6, -12], [0, -19], [0, -4]]) sparkle(p, x, y, Math.round(3 * (1 - g)), 0xffffff, C[3], 0.3);
    },
    done: () => T.done() && ps.count === 0,
  };
}

// ---------------------------------------------------------------------------------------------------
// 5. Rank up: a pillar of light lands on the spy, two floor rings roll out, the new chevrons rise and glint.
export function rankUp(o) {
  const R = new Rng(o.seed ?? 21), ps = new Particles(), C = o.ramp ?? RAMP.gold, T = base(1.8), n = o.rank ?? 2;
  for (let i = 0; i < 18; i++) ps.spawn({ kind: K.MOTE, x: o.x + R.range(-8, 8), y: o.y + R.range(-3, 3), z: R.range(0, 6), vx: 0, vy: 0, vz: R.range(30, 70), life: R.range(0.6, 1.3), ramp: C, glow: 0.3, drag: 0.5, delay: R.range(0.05, 0.4) });
  ps.light(o.x, o.y, 48, C[3], 0.8, 0.8, 10);
  return {
    update(dt) { T.step(dt); ps.update(dt); },
    draw(p, ox, oy, layer) {
      const t = T.t;
      p.set(o.x, o.y, ox, oy);
      if (layer === "ground") {
        for (const d of [0.05, 0.22]) {
          const u = seg(t, d, d + 0.6);
          if (u > 0 && u < 1) p.ring(0, 0, lerp(4, 34, ease.outCubic(u)), lerp(2.5, 1, u), (v) => (v > 0.5 ? C[4] : C[3]), 1 - u, 0.5);
        }
      } else {
        // pillar
        const w = 7 * (1 - ease.outCubic(seg(t, 0.04, 0.55)));
        if (w > 0.4) {
          for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) {
            const v = Math.abs(x) / w; if (v > 1) continue;
            p.line(x, -90, x, 0, v < 0.35 ? 0xffffff : v < 0.7 ? C[4] : C[3], (u) => (u < 0.25 ? u / 0.25 : 1) * (v < 0.35 ? 1 : 0.75 - v * 0.35), true);
          }
          p.glowLine(0, -90, 0, 0, w * 3 + 6, C[3], 0.5);
        }
        if (t < 0.03) p.glow(0, -10, 28, 0xffffff, 0.7);
        // chevrons rising
        const u = ease.outBack(seg(t, 0.2, 0.6)), fade = 1 - seg(t, 1.3, 1.8);
        if (u > 0 && fade > 0) {
          const y = -26 - u * 8;
          for (let i = 0; i < n; i++) {
            const yy = y - i * 3;
            p.line(-4, yy, 0, yy - 2, C[4], fade); p.line(0, yy - 2, 4, yy, C[4], fade);
            p.line(-4, yy + 1, 0, yy - 1, C[2], fade); p.line(0, yy - 1, 4, yy + 1, C[2], fade);
          }
          p.glow(0, y - n, 14, C[3], 0.6 * fade);
          if (t > 0.5 && t < 0.9) sparkle(p, 5, y - n * 3, Math.round(3 * (1 - seg(t, 0.5, 0.9))), 0xffffff, C[3], 0.4);
        }
      }
      p.set(0, 0, ox, oy); ps.draw(p, layer);
    },
    done: () => T.done() && ps.count === 0,
  };
}

// ---------------------------------------------------------------------------------------------------
// 6. Alert burst over a head: radiating ticks and a flash, the "!" itself is drawn by the game.
export function alertBurst(o) {
  const T = base(0.4), C = o.ramp ?? RAMP.red;
  return {
    update(dt) { T.step(dt); },
    draw(p, ox, oy, layer) {
      if (layer !== "air") return;
      const t = T.t, u = ease.outQuart(seg(t, 0, 0.3)), fade = 1 - seg(t, 0.15, 0.4);
      p.set(o.x, o.y, ox, oy);
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.42;
        const r0 = 5 + u * 6, r1 = r0 + 4 * (1 - u) + 1;
        p.line(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, i % 2 ? C[3] : 0xffffff, fade);
      }
      p.glow(0, 0, 16, C[2], 0.7 * fade);
    },
    done: () => T.done(),
  };
}

// ---------------------------------------------------------------------------------------------------
// 7. Dash: afterimages of the spy's silhouette that dither away, and dust kicked at the feet.
export function afterimage(o) {
  const T = base(o.life ?? 0.28), C = o.c ?? RAMP.cyan[3];
  return {
    update(dt) { T.step(dt); },
    draw(p, ox, oy, layer) {
      if (layer !== "air") return;
      const u = T.t / (o.life ?? 0.28);
      p.set(o.x, o.y, ox, oy, o.flip);
      p.mask(o.mask, o.w, o.h, o.ax, o.ay, u < 0.25 ? 0xffffff : C, (1 - u) * 0.55, true);
    },
    done: () => T.done(),
  };
}
export function dust(o) {
  const R = new Rng(o.seed ?? 2), ps = new Particles();
  smokePuff(ps, R, o.x, o.y, 1, o.n ?? 3, { kind: K.DUST, c: o.c ?? 0x6a6070, c2: o.c2 ?? 0x8a8090, size: [1.5, 3], life: [0.3, 0.55], vz: [4, 10], spread: o.spread ?? 22 });
  return { update(dt) { ps.update(dt); }, draw(p, ox, oy, layer) { p.set(0, 0, ox, oy); ps.draw(p, "air"); }, done: () => ps.count === 0 };
}

// ---------------------------------------------------------------------------------------------------
// 8. Laser bolt impact and muzzle flash
export function impact(o) {
  const R = new Rng(o.seed ?? 4), ps = new Particles(), C = o.ramp ?? RAMP.red, T = base(0.3);
  sparkBurst(ps, R, o.x, o.y, o.z ?? 8, 9, { dir: o.dir, spread: o.dir == null ? TAU : 2.2, speed: [50, 160], vz: [20, 100], life: [0.15, 0.4], c: C[3], c2: C[2], glow: 0.3 });
  ps.light(o.x, o.y, 22, C[3], 0.9, 0.2, o.z ?? 8);
  return {
    update(dt) { T.step(dt); ps.update(dt); },
    draw(p, ox, oy, layer) {
      p.set(0, 0, ox, oy); ps.draw(p, layer);
      if (layer !== "air") return;
      const u = seg(T.t, 0, 0.18);
      if (u < 1) { p.set(o.x, o.y, ox, oy, false, 0, o.z ?? 8); p.ring(0, 0, lerp(1, 7, ease.outCubic(u)), 1.2, (v) => (v > 0.5 ? 0xffffff : C[3]), 1 - u); }
    },
    done: () => T.done() && ps.count === 0,
  };
}
export function muzzle(o) {
  const T = base(0.08), C = o.ramp ?? RAMP.red;
  return {
    update(dt) { T.step(dt); },
    draw(p, ox, oy, layer) {
      if (layer !== "air") return;
      p.set(o.x, o.y, ox, oy, false, o.dir, o.z ?? 8);
      const k = 1 - T.t / 0.08;
      p.line(0, 0, 6 * k + 2, 0, 0xffffff); p.line(1, -1, 4 * k, -2, C[3]); p.line(1, 1, 4 * k, 2, C[3]);
      p.glow(2, 0, 12, C[3], 0.8 * k);
    },
    done: () => T.done(),
  };
}

// ---------------------------------------------------------------------------------------------------
// 9. Extraction: energy gathers in, a beam slams down, the spy is gone, the column thins away.
export function extract(o) {
  const R = new Rng(o.seed ?? 31), ps = new Particles(), C = o.ramp ?? RAMP.cyan, T = base(2.0), SLAM = 0.55;
  for (let i = 0; i < 26; i++) {
    const a = R.range(0, TAU), r = R.range(16, 34);
    ps.spawn({ kind: K.STREAK, x: o.x + Math.cos(a) * r, y: o.y - 8 + Math.sin(a) * r * 0.6, tx: o.x, ty: o.y - 8, life: R.range(0.3, 0.5), delay: R.range(0, 0.25), c: C[3] });
  }
  let slammed = false;
  return {
    get slammed() { return slammed; },
    update(dt) {
      T.step(dt); ps.update(dt);
      if (!slammed && T.t >= SLAM) {
        slammed = true;
        sparkBurst(ps, R, o.x, o.y, 2, 20, { speed: [60, 180], vz: [80, 200], life: [0.3, 0.8], c: C[4], c2: C[3] });
        for (let i = 0; i < 16; i++) ps.spawn({ kind: K.MOTE, x: o.x + R.range(-5, 5), y: o.y, z: R.range(0, 10), vx: 0, vy: 0, vz: R.range(60, 140), life: R.range(0.5, 1.1), ramp: C, glow: 0.3, drag: 0.6 });
        ps.light(o.x, o.y, 56, C[3], 0.9, 0.9, 10);
      }
    },
    draw(p, ox, oy, layer) {
      const t = T.t;
      p.set(o.x, o.y, ox, oy);
      if (layer === "ground") {
        const u = seg(t, SLAM, SLAM + 0.5);
        if (u > 0 && u < 1) p.ring(0, 0, lerp(4, 40, ease.outCubic(u)), lerp(3, 1, u), (v) => (v > 0.5 ? 0xffffff : C[3]), 1 - u, 0.5);
      } else {
        const g = seg(t, 0, SLAM);
        if (t < SLAM) p.glow(0, -8, 6 + g * 14, C[3], 0.4 + g * 0.6);
        const w = t < SLAM ? 0 : 9 * (1 - ease.outCubic(seg(t, SLAM, SLAM + 1.1)));
        if (w > 0.4) {
          for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) {
            const v = Math.abs(x) / w; if (v > 1) continue;
            p.line(x, -120, x, 2, v < 0.4 ? 0xffffff : v < 0.75 ? C[4] : C[3], (u) => (u < 0.2 ? u / 0.2 : 1) * (v < 0.4 ? 1 : 0.8 - v * 0.35), true);
          }
          p.glowLine(0, -120, 0, 0, w * 3 + 8, C[3], 0.6);
        }
        if (t >= SLAM && t < SLAM + 0.03) p.glow(0, -10, 34, 0xffffff, 0.8);
      }
      p.set(0, 0, ox, oy); ps.draw(p, layer);
    },
    done: () => T.done() && ps.count === 0,
  };
}

// ---------------------------------------------------------------------------------------------------
// 10. Hide: a puff and a click of light when the spy slips into a locker
export function hidePuff(o) {
  const R = new Rng(o.seed ?? 8), ps = new Particles();
  smokePuff(ps, R, o.x, o.y, 4, 6, { kind: K.VAPOUR, c: 0x8a9aa8, c2: 0xc0d0dc, size: [2, 4], life: [0.4, 0.7], vz: [6, 16], spread: 30 });
  ps.light(o.x, o.y, 18, 0x8af8f0, 0.5, 0.2, 8);
  return { update(dt) { ps.update(dt); }, draw(p, ox, oy, layer) { p.set(0, 0, ox, oy); ps.draw(p, layer); }, done: () => ps.count === 0 };
}

// hurt: the spy gets shot
export function hurt(o) {
  const R = new Rng(o.seed ?? 6), ps = new Particles();
  sparkBurst(ps, R, o.x, o.y, 10, 12, { speed: [60, 180], vz: [40, 140], life: [0.2, 0.5], c: 0xffd0a0, c2: 0xff4a2a });
  smokePuff(ps, R, o.x, o.y, 10, 3, { size: [2, 4], life: [0.5, 0.9] });
  ps.light(o.x, o.y, 30, 0xff4a3a, 1.0, 0.3, 10);
  return { update(dt) { ps.update(dt); }, draw(p, ox, oy, layer) { p.set(0, 0, ox, oy); ps.draw(p, layer); }, done: () => ps.count === 0 };
}
