// One infiltration: the spy, the base, its robots, cameras and lasers, alarms, assassinations and extraction.
import { Frame, Painter, composite, applyColor, Rng, TAU, clamp, lerp, mix, ease, seg } from "../engine/fx.js";
import { Particles, K, sparkBurst, smokePuff } from "../engine/particles.js";
import * as FX from "../fx/effects.js";
import { World, TILE, RANK_TINT } from "./world.js";
import { STAGES } from "./stages.js";
import { robotOf, robotSprites, rankOf, partStats, partFromId, SLOTS, SW, SH, AX, AY, TYPES, RANK_NAME } from "./parts.js";
import { sfx, siren } from "../engine/audio.js";

export const VW = 320, VH = 180, LW = VW + 2, LH = VH + 2;
const HALF = 0.62, RANGE = 78, RANGE_ALARM = 100;

export const UPGRADES = [
  { id: "cloak", name: "광학 위장막", desc: "적이 의심하는 속도 -8%", max: 3, cost: [80, 160, 260] },
  { id: "servo", name: "서보 모터", desc: "이동 속도 +6", max: 3, cost: [60, 120, 200] },
  { id: "armor", name: "보강 장갑", desc: "최대 내구도 +1", max: 2, cost: [100, 220] },
  { id: "blade", name: "진동 칼날", desc: "암살 거리 +3 · 해체 속도 +20%", max: 3, cost: [70, 140, 230] },
  { id: "jammer", name: "소음 억제기", desc: "폭발음 범위 -20% · 경보 시간 -20%", max: 2, cost: [90, 180] },
  { id: "shock", name: "충격 흡수 다리", desc: "대시 재충전 -15%", max: 2, cost: [70, 150] },
];

export function deriveStats(robot, up = {}) {
  const s = { stealth: 0, hp: 0, reach: 0, tear: 0, speed: 0, dash: 0 };
  for (const sl of SLOTS) Object.entries(partStats(robot[sl])).forEach(([k, v]) => (s[k] += v));
  const r = rankOf(robot);
  return {
    rank: r.rank, odd: r.odd, avg: r.avg,
    maxHp: 3 + s.hp + (up.armor || 0),
    speed: 64 + s.speed + (up.servo || 0) * 6,
    stealth: Math.min(0.65, s.stealth + (up.cloak || 0) * 0.08),
    reach: 16 + s.reach + (up.blade || 0) * 3,
    tear: 1 + s.tear + (up.blade || 0) * 0.2,
    dashCD: 2.4 * Math.max(0.35, 1 - s.dash * 0.5 - (up.shock || 0) * 0.15),
    noise: 64 * (1 - (up.jammer || 0) * 0.2),
    alarmTime: 22 * (1 - (up.jammer || 0) * 0.2),
  };
}

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const facingOf = (a) => { const c = Math.cos(a), s = Math.sin(a); if (Math.abs(c) > Math.abs(s) * 0.9) return { f: 2, flip: c < 0 }; return { f: s > 0 ? 0 : 1, flip: false }; };

export class Mission {
  constructor(stageIndex, save, hooks) {
    this.si = stageIndex; this.stage = STAGES[stageIndex]; this.save = save; this.hooks = hooks;
    this.world = new World(this.stage); this.world.render(); this.world.bakeLights();
    this.R = new Rng(this.stage.seed * 7 + 1);
    this.ground = new Frame(LW, LH); this.air = new Frame(LW, LH);
    this.gp = new Painter(this.ground); this.ap = new Painter(this.air);
    this.base = [new Float32Array(LW * LH), new Float32Array(LW * LH), new Float32Array(LW * LH)];
    this.fx = []; this.amb = new Particles(); this.bolts = []; this.wrecks = []; this.msgs = [];
    this.alarm = { t: 0, blown: false, lostT: 0 }; this.camerasOff = 0;
    this.time = 0; this.hitstop = 0; this.slow = 0; this.shakeT = 0; this.shakeA = 0; this.flash = 0; this.flashC = 0xffffff; this.hurtFlash = 0;
    this.kills = 0; this.blownEver = false; this.earned = 0; this.targetDead = false; this.over = null; this.toastT = 0; this.toast = "";
    this.equipped = Object.fromEntries(SLOTS.map((s) => [s, partFromId(save.equipped[s])]));
    const st = deriveStats(this.equipped, save.upgrades);
    const W0 = this.world.start;
    this.p = { x: W0.x * TILE + 8, y: W0.y * TILE + 10, vx: 0, vy: 0, f: 0, flip: false, walk: 0, dir: Math.PI / 2,
      hp: st.maxHp, st, hidden: null, act: null, tear: null, inv: 0, dashT: 0, dashCD: 0, ghostT: 0, dead: false, gone: false, extracting: false, whiteT: 0 };
    this.enemies = this.stage.enemies.map((d, i) => this.makeEnemy(d, i));
    this.cameras = this.stage.cameras.map((c) => ({ x: c.x * TILE, y: c.y * TILE, a0: c.a, sweep: c.sweep, period: c.period, a: c.a, sus: 0, ph: this.R.range(0, 6) }));
    this.cam = { x: this.p.x, y: this.p.y };
    this.say(`${this.stage.name} 잠입 개시`, 2.5);
  }

  makeEnemy(d, i) {
    const robot = robotOf(d.type), wp = d.path[0];
    const e = { i, type: d.type, robot, rank: TYPES[d.type].rank, target: !!d.target, path: d.path, wi: 0,
      x: wp.x * TILE + 8, y: wp.y * TILE + 10, face: wp.look ? wp.look[0] : Math.PI / 2, route: null, ri: 0, state: "wait", timer: wp.wait * this.R.range(0.3, 1),
      sus: 0, seesP: false, walk: 0, moving: false, fireCD: 1, lastSeen: null, goal: null, dieT: 0, flash: 0, push: { x: 0, y: 0 }, repath: 0, lookI: 0, speed: 26 };
    return e;
  }

  say(text, t = 2.2) { this.toast = text; this.toastT = t; }
  float(x, y, text, c = "#ffd040") { this.msgs.push({ x, y, text, c, t: 0 }); }
  addFx(f) { this.fx.push(f); return f; }
  shake(a, t = 0.25) { this.shakeA = Math.max(this.shakeA, a); this.shakeT = Math.max(this.shakeT, t); }
  earn(n, x, y) { this.earned += n; if (x != null) this.float(x, y - 24, `+${n}`); }

  get stats() { return this.p.st; }

  // ---------------------------------------------------------------------------------------------
  update(rdt, input) {
    if (this.over && this.over.t !== undefined) { this.over.t += rdt; }
    this.toastT -= rdt;
    for (const m of this.msgs) m.t += rdt; this.msgs = this.msgs.filter((m) => m.t < 1.2);
    this.flash = Math.max(0, this.flash - rdt * 6); this.hurtFlash = Math.max(0, this.hurtFlash - rdt * 2.5);
    if (this.shakeT > 0) { this.shakeT -= rdt; if (this.shakeT <= 0) this.shakeA = 0; }
    if (this.paused) return;
    if (this.hitstop > 0) { this.hitstop -= rdt; this.updateCamera(rdt * 0.3); return; }
    let dt = rdt;
    if (this.slow > 0) { this.slow -= rdt; dt *= lerp(1, 0.22, clamp(this.slow / 0.6)); }
    this.time += dt;
    this.updatePlayer(dt, input);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.updateCameras(dt);
    this.updateLasers(dt);
    this.updateAlarm(dt);
    this.updateBolts(dt);
    for (const f of this.fx) f.update(dt);
    this.fx = this.fx.filter((f) => !f.done());
    this.amb.update(dt);
    this.ambient(dt);
    for (const w of this.wrecks) if (!w.popped) { w.t += dt; if (w.t >= w.pop) this.popWreck(w); }
    this.updateCamera(dt);
    if (this.over && this.over.t > this.over.wait && !this.over.sent) { this.over.sent = true; this.hooks.onEnd(this.result()); }
  }

  result() {
    const ghost = !this.blownEver;
    return { win: this.over.win, stage: this.si, kills: this.kills, ghost, time: this.time, earned: this.earned, equipped: Object.fromEntries(SLOTS.map((s) => [s, this.equipped[s].id])), storage: this.storage || [] };
  }

  // ---------------------------------------------------------------------------------------------
  updatePlayer(dt, input) {
    const p = this.p, W = this.world;
    p.inv = Math.max(0, p.inv - dt); p.dashCD = Math.max(0, p.dashCD - dt); p.whiteT = Math.max(0, p.whiteT - dt);
    if (p.dead || p.gone || this.over) { p.vx = p.vy = 0; return; }
    if (p.extracting) return;
    // hidden in a locker
    if (p.hidden) {
      if (input.pressed("KeyE") || input.pressed("Space")) {
        p.hidden = null; this.addFx(FX.hidePuff({ x: p.x, y: p.y })); sfx.hide();
      }
      return;
    }
    // assassination act
    if (p.act) { this.updateStab(dt); return; }
    // tearing a wreck apart / hacking a terminal (hold E)
    if (p.tear) {
      const T = p.tear;
      if (!input.down("KeyE") || Math.hypot(T.x - p.x, T.y - p.y) > 26) { T.fx?.stop(); p.tear = null; }
      else {
        T.prog += (dt * (T.kind === "wreck" ? p.st.tear : 1)) / T.need;
        if (T.fx) T.fx.progress = clamp(T.prog);
        if (this.R.next() < dt * 10) (T.kind === "wreck" ? sfx.tear : sfx.hack)();
        if (T.prog >= 1) { T.fx?.stop(); p.tear = null; T.kind === "wreck" ? this.finishTear(T.obj) : this.finishHack(T.obj); }
      }
      p.vx *= 0.7; p.vy *= 0.7;
      return;
    }
    // movement
    let ix = (input.down("KeyD") || input.down("ArrowRight") ? 1 : 0) - (input.down("KeyA") || input.down("ArrowLeft") ? 1 : 0);
    let iy = (input.down("KeyS") || input.down("ArrowDown") ? 1 : 0) - (input.down("KeyW") || input.down("ArrowUp") ? 1 : 0);
    const il = Math.hypot(ix, iy); if (il > 0) { ix /= il; iy /= il; p.dir = Math.atan2(iy, ix); }
    let max = p.st.speed;
    if (p.dashT > 0) {
      p.dashT -= dt; max = 230;
      p.vx = Math.cos(p.dir) * 230; p.vy = Math.sin(p.dir) * 230;
      p.ghostT -= dt;
      if (p.ghostT <= 0) { p.ghostT = 0.025; this.afterimage(); }
    } else {
      const acc = il > 0 ? 900 : 1100;
      const tx = ix * max, ty = iy * max;
      const k = 1 - Math.exp(-acc / max * dt);
      p.vx += (tx - p.vx) * k; p.vy += (ty - p.vy) * k;
      if (input.pressed("ShiftLeft") || input.pressed("ShiftRight")) {
        if (p.dashCD <= 0) {
          if (il === 0) p.dir = Math.atan2(p.vy || Math.sin(p.dir), p.vx || Math.cos(p.dir));
          p.dashT = 0.13; p.dashCD = p.st.dashCD; p.ghostT = 0; sfx.dash();
          this.addFx(FX.dust({ x: p.x, y: p.y, n: 5, seed: (this.time * 100) | 0, c: 0x6a6070 }));
          this.noticeDash = 0.5;
        } else sfx.deny();
      }
    }
    this.noticeDash = Math.max(0, (this.noticeDash || 0) - dt);
    this.move(p, p.vx * dt, p.vy * dt);
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 8) {
      p.walk += sp * dt;
      const fc = facingOf(Math.atan2(p.vy, p.vx)); p.f = fc.f; p.flip = fc.flip;
      if (Math.floor((p.walk - sp * dt) / 22) !== Math.floor(p.walk / 22)) this.amb.spawn({ kind: K.DUST, x: p.x + this.R.range(-2, 2), y: p.y, z: 0, vx: -p.vx * 0.1, vy: -p.vy * 0.1, vz: 4, life: 0.35, size: 1.2, c: 0x5a5262, c2: 0x7a7282 });
    } else p.walk = 0;
    // actions
    const near = this.nearby();
    this.prompt = near.prompt;
    if (input.pressed("Space")) {
      if (near.victim) this.startStab(near.victim);
      else if (near.blocked) { this.say("경계 중인 적은 정면에서 못 베요. 뒤로 돌아가세요"); sfx.deny(); }
    }
    if (input.pressed("KeyE")) {
      if (near.locker) {
        if (this.enemies.some((e) => e.seesP && (e.state === "alert" || e.sus > 0.3))) { this.say("보는 눈이 있어요. 지금은 못 숨어요"); sfx.deny(); }
        else { p.hidden = near.locker; p.vx = p.vy = 0; this.addFx(FX.hidePuff({ x: p.x, y: p.y })); sfx.hide(); }
      } else if (near.wreck) {
        p.tear = { kind: "wreck", obj: near.wreck, x: near.wreck.x, y: near.wreck.y, prog: 0, need: 1.5, fx: this.addFx(FX.dismantle({ x: near.wreck.x, y: near.wreck.y })) };
      } else if (near.terminal) {
        p.tear = { kind: "hack", obj: near.terminal, x: near.terminal.x, y: near.terminal.y, prog: 0, need: 1.2, fx: null };
      }
    }
  }

  move(o, dx, dy) {
    const W = this.world;
    const n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 3) || 1;
    for (let i = 0; i < n; i++) {
      if (W.free(o.x + dx / n, o.y)) o.x += dx / n; else if (o === this.p) o.vx *= 0.5;
      if (W.free(o.x, o.y + dy / n)) o.y += dy / n; else if (o === this.p) o.vy *= 0.5;
    }
  }

  afterimage() {
    const p = this.p, S = robotSprites(this.equipped), fr = Math.floor(p.walk / 6) % 4;
    this.addFx(FX.afterimage({ x: p.x, y: p.y, mask: S.masks[p.f][fr], w: SW, h: SH, ax: AX, ay: AY, flip: p.flip, life: 0.26 }));
  }

  nearby() {
    const p = this.p, out = { prompt: null };
    let best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.state === "dying" || e.state === "dead") continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > p.st.reach || !this.world.los(p.x, p.y - 6, e.x, e.y - 6)) continue;
      const front = Math.abs(angDiff(Math.atan2(p.y - e.y, p.x - e.x), e.face)) < 1.0;
      if (e.state === "alert" && front) { out.blocked = e; continue; }
      if (d < bd) { bd = d; best = e; }
    }
    out.victim = best;
    if (best) out.prompt = { key: "Space", text: best.target ? "목표 암살" : "암살" };
    // locker
    for (const l of this.world.lockers) {
      const x = l.x * TILE + 8, y = l.y * TILE + 10;
      if (Math.hypot(x - p.x, y - p.y) < 20) { out.locker = l; if (!out.prompt) out.prompt = { key: "E", text: "사물함에 숨기" }; break; }
    }
    for (const w of this.wrecks) if (w.popped && !w.torn && Math.hypot(w.x - p.x, w.y - p.y) < 20) { out.wreck = w; if (!out.prompt || out.prompt.key !== "Space") out.prompt = { key: "E", text: "길게 눌러 부품 해체", hold: true }; break; }
    for (const t of this.world.terminals) {
      const x = t.x * TILE + 8, y = t.y * TILE + 10;
      if (Math.hypot(x - p.x, y - p.y) < 22) { out.terminal = { x, y, t }; if (!out.prompt) out.prompt = { key: "E", text: this.cameras.length ? "길게 눌러 카메라 해킹" : "단말기 (반응 없음)", hold: true }; break; }
    }
    if (this.targetDead && this.onExit()) out.prompt = { key: "", text: "탈출 중..." };
    return out;
  }

  onExit() { const X = this.world.exit; return Math.hypot(X.x * TILE + 8 - this.p.x, X.y * TILE + 8 - this.p.y) < 11; }

  // ---------------------------------------------------------------------------------------------
  startStab(e) {
    const p = this.p, dir = Math.atan2(e.y - p.y, e.x - p.x);
    p.act = { t: -0.07, e, dir, sx: p.x, sy: p.y, hit: false };
    p.vx = p.vy = 0;
    const fc = facingOf(dir); p.f = fc.f; p.flip = fc.flip;
  }
  updateStab(dt) {
    const p = this.p, A = p.act;
    A.t += dt;
    const e = A.e;
    if (A.t < 0) { p.ox = -Math.cos(A.dir) * 3 * (1 + A.t / 0.07); p.oy = -Math.sin(A.dir) * 3 * (1 + A.t / 0.07); return; }
    p.ox = 0; p.oy = 0;
    if (!A.hit) {
      const u = ease.outQuart(clamp(A.t / 0.05));
      const tx = e.x - Math.cos(A.dir) * 9, ty = e.y - Math.sin(A.dir) * 6;
      const nx = lerp(A.sx, tx, u), ny = lerp(A.sy, ty, u);
      this.move(p, nx - p.x, ny - p.y);
      if (A.t >= 0.05) { A.hit = true; this.hitEnemy(e, A.dir); }
      else if (this.R.next() < 0.6) this.afterimage();
    }
    if (A.t > 0.05 + 0.2) { p.act = null; }
  }
  hitEnemy(e, dir) {
    const p = this.p;
    sfx.stab();
    this.addFx(FX.stab({ x: e.x, y: e.y, dir, seed: (this.time * 1000) | 0 }));
    e.state = "dying"; e.dieT = 0; e.flash = 0.12; e.push = { x: Math.cos(dir) * 4, y: Math.sin(dir) * 3 };
    const w = { x: e.x + e.push.x, y: e.y + e.push.y, e, pal: e.robot.core.pal, type: e.type, rank: e.rank, target: e.target, popped: false, t: 0, pop: 0.34, torn: false, discovered: false, face: e.face };
    w.fx = this.addFx(FX.wreck({ x: w.x, y: w.y, pal: { ...e.robot.core.pal }, seed: (this.time * 999) | 0, pop: w.pop }));
    this.wrecks.push(w);
    this.hitstop = e.target ? 0.16 : 0.1; this.shake(e.target ? 4 : 2.5, 0.22); this.flash = 0.35; this.flashC = 0xffffff;
    if (e.target) this.slow = 0.9;
    this.kills++; this.earn(e.rank * 10, e.x, e.y);
    // witnesses
    for (const o of this.enemies) {
      if (o === e || o.state === "dying" || o.state === "dead") continue;
      if (this.sees(o, p.x, p.y) || this.sees(o, e.x, e.y)) { o.lastSeen = { x: p.x, y: p.y }; this.becomeAlert(o, "암살 목격!"); }
    }
    for (const c of this.cameras) if (this.camerasOff <= 0 && this.camSees(c, p.x, p.y)) this.cameraAlarm(c);
  }
  popWreck(w) {
    w.popped = true; sfx.pop(); this.shake(2, 0.2);
    w.e.state = "dead";
    // noise: robots nearby come to look
    for (const o of this.enemies) {
      if (o.state === "dying" || o.state === "dead" || o.state === "alert") continue;
      if (Math.hypot(o.x - w.x, o.y - w.y) < this.p.st.noise) { o.state = "investigate"; o.goal = { x: w.x, y: w.y, wreck: w }; o.route = null; o.sus = Math.max(o.sus, 0.2); o.qT = 1; sfx.sus(); }
    }
    if (w.target) { this.targetDead = true; this.earn(120, w.x, w.y - 8); this.say("목표 제거! 탈출 지점으로 가세요", 3.5); }
  }
  finishTear(w) {
    w.torn = true; sfx.equip();
    this.addFx(FX.partFly({ x: w.x, y: w.y, tx: this.p.x, ty: this.p.y }));
    this.earn(w.rank * 5, w.x, w.y);
    this.paused = true;
    this.hooks.onPicker(robotOf(w.type), this.equipped, (choice) => {
      this.paused = false;
      if (!choice) return;
      const { part, mode } = choice;
      this.storage = this.storage || [];
      if (mode === "equip") {
        const old = this.equipped[part.slot], before = this.p.st.rank;
        this.storage.push(old.id);
        this.equipped = { ...this.equipped, [part.slot]: part };
        const hpGain = deriveStats(this.equipped, this.save.upgrades).maxHp - this.p.st.maxHp;
        this.p.st = deriveStats(this.equipped, this.save.upgrades);
        this.p.hp = clamp(this.p.hp + Math.max(0, hpGain), 1, this.p.st.maxHp);
        this.p.whiteT = 0.12;
        this.addFx(FX.equip({ x: this.p.x, y: this.p.y, seed: (this.time * 77) | 0 }));
        if (this.p.st.rank > before) {
          this.addFx(FX.rankUp({ x: this.p.x, y: this.p.y, rank: this.p.st.rank, ramp: FX.RAMP.gold }));
          sfx.rankUp(); this.shake(2, 0.2); this.flash = 0.25; this.flashC = 0xffe08a;
          this.say(`계급 상승! ${RANK_NAME[this.p.st.rank]}(으)로 위장 중`, 3);
        } else if (this.p.st.rank < before) this.say(`계급이 ${RANK_NAME[this.p.st.rank]}(으)로 내려갔어요`);
        if (this.p.st.odd) this.say("부품 조합이 어색해요. 가까이 가면 의심받아요", 3);
      } else { this.storage.push(part.id); this.say(`${part.name} 보관함으로`); sfx.coin(); }
    });
  }
  finishHack() {
    if (!this.cameras.length) { this.say("이 기지엔 카메라가 없어요"); return; }
    this.camerasOff = 25; sfx.hack(); this.say("카메라 25초간 정지", 2.5);
    for (const c of this.cameras) this.addFx(FX.impact({ x: c.x, y: c.y + 4, z: 0, ramp: FX.RAMP.cyan, seed: (c.x * 3) | 0 }));
  }

  // ---------------------------------------------------------------------------------------------
  sees(e, x, y, range) {
    range = range ?? (this.alarm.t > 0 ? RANGE_ALARM : RANGE);
    const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
    if (d > range) return false;
    if (d > 9 && Math.abs(angDiff(Math.atan2(dy, dx), e.face)) > HALF) return false;
    return this.world.los(e.x, e.y - 6, x, y - 6);
  }
  becomeAlert(e, why) {
    if (e.state !== "alert") { this.addFx(FX.alertBurst({ x: e.x, y: e.y - 30 })); sfx.alert(); }
    e.state = "alert"; e.sus = 1; e.route = null; e.repath = 0; e.fireCD = Math.max(e.fireCD, 0.5);
    e.lastSeen = e.lastSeen || { x: this.p.x, y: this.p.y };
    this.raiseAlarm(true, why);
  }
  raiseAlarm(blown, why) {
    const was = this.alarm.t > 0, wasBlown = this.alarm.blown;
    this.alarm.t = this.p.st.alarmTime;
    if (blown) {
      this.alarm.blown = true; this.alarm.lostT = 0; this.blownEver = true;
      if (!wasBlown) {
        this.say(why || "정체가 들켰어요! 숨거나 도망치세요", 2.8);
        for (const o of this.enemies) if ((o.state !== "dying" && o.state !== "dead" && o.state !== "alert") && Math.hypot(o.x - this.p.x, o.y - this.p.y) < 150) { o.state = "alert"; o.lastSeen = { x: this.p.x, y: this.p.y }; o.route = null; o.sus = 1; }
      }
    } else if (!was) this.say(why || "경계 태세 돌입", 2.5);
    siren(true);
  }
  updateAlarm(dt) {
    const A = this.alarm;
    if (A.blown) {
      if (this.enemies.some((e) => e.seesP && e.state === "alert")) A.lostT = 0; else A.lostT += dt;
      if (A.lostT > 7 || this.p.hidden && A.lostT > 4) {
        A.blown = false; this.say("추적을 따돌렸어요. 다시 위장 상태", 2.5);
        for (const e of this.enemies) if (e.state === "alert") { e.state = "search"; e.timer = 6; e.route = null; e.sus = 0.4; }
      }
    } else if (A.t > 0) {
      A.t -= dt;
      if (A.t <= 0) { A.t = 0; siren(false); this.say("경보 해제"); }
    }
    this.camerasOff = Math.max(0, this.camerasOff - dt);
  }

  updateEnemy(e, dt) {
    const p = this.p;
    if (e.state === "dead") return;
    e.flash = Math.max(0, e.flash - dt); e.qT = Math.max(0, (e.qT || 0) - dt);
    if (e.state === "dying") { e.dieT += dt; if (this.R.next() < dt * 12) sfx.sputter(); return; }
    const range = this.alarm.t > 0 ? RANGE_ALARM : RANGE;
    e.seesP = !p.hidden && !p.gone && !p.dead && this.sees(e, p.x, p.y, range);
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    // suspicion
    if (e.state !== "alert") {
      let rate = 0;
      if (e.seesP) {
        if (this.alarm.blown && d < range * 0.85) { e.lastSeen = { x: p.x, y: p.y }; this.becomeAlert(e); }
        const close = clamp(1.35 - d / range, 0.35, 1.2);
        const zone = this.world.zoneAt(p.x, p.y);
        if (zone > p.st.rank) rate += 1.0 * close * (1 + (zone - p.st.rank - 1) * 0.5);
        if (p.tear && p.tear.kind === "wreck") rate += 2.2;
        if (p.tear && p.tear.kind === "hack" && zone > 1) rate += 1.2;
        if (this.noticeDash > 0) rate += 1.6;
        if (p.st.odd && d < 34) rate += 0.45;
        for (const w of this.wrecks) if (w.popped && !w.torn && Math.hypot(w.x - p.x, w.y - p.y) < 30) { rate += 1.2; break; }
        if (p.act) rate += 4;
        if (e.rank > p.st.rank + 1 && d < 26) rate += 0.35; // superiors notice a nobody standing too close
        rate *= (1 - p.st.stealth) * (this.alarm.t > 0 ? 1.6 : 1);
      }
      if (rate > 0) {
        const before = e.sus;
        e.sus = Math.min(1, e.sus + rate * dt * 0.75);
        if (before < 0.3 && e.sus >= 0.3) { sfx.sus(); e.qT = 0.3; }
        if (e.sus >= 1) { e.lastSeen = { x: p.x, y: p.y }; this.becomeAlert(e); }
      } else e.sus = Math.max(0, e.sus - dt * 0.22);
      // wrecks
      if (e.state !== "investigate" || !e.goal?.wreck) for (const w of this.wrecks) {
        if (w.popped && !w.torn && !w.discovered && this.sees(e, w.x, w.y, range)) { e.state = "investigate"; e.goal = { x: w.x, y: w.y, wreck: w }; e.route = null; e.qT = 1; sfx.sus(); e.sus = Math.max(e.sus, 0.35); break; }
      }
    }
    if (e.state !== "alert" && e.state !== "investigate" && e.state !== "search") {
      if (e.sus >= 0.3 && e.seesP) e.state = "sus";
      else if (e.state === "sus" && e.sus < 0.12) { e.state = "patrol"; e.route = null; }
    }
    let goal = null, speed = 26;
    switch (e.state) {
      case "wait": {
        const wp = e.path[e.wi];
        e.timer -= dt;
        if (wp.look) { e.lookT = (e.lookT || 0) + dt; const L = wp.look; this.turn(e, L[Math.floor(e.lookT / 1.6) % L.length], dt, 3); }
        else this.turn(e, e.face + Math.sin(this.time * 1.3 + e.i) * 0.6, dt, 0.8);
        if (e.timer <= 0 && e.path.length > 1) { e.wi = (e.wi + 1) % e.path.length; e.state = "patrol"; e.route = null; }
        else if (e.timer <= 0) e.timer = wp.wait;
        break;
      }
      case "patrol": {
        const wp = e.path[e.wi]; goal = { x: wp.x * TILE + 8, y: wp.y * TILE + 10 };
        if (Math.hypot(goal.x - e.x, goal.y - e.y) < 3) { e.state = "wait"; e.timer = wp.wait; e.lookT = 0; goal = null; }
        break;
      }
      case "sus": this.turn(e, Math.atan2(p.y - e.y, p.x - e.x), dt, 5); break;
      case "investigate": {
        goal = e.goal; speed = 40;
        if (goal.wreck && goal.wreck.torn && Math.hypot(goal.x - e.x, goal.y - e.y) < 30) { e.state = "search"; e.timer = 2.5; e.lastSeen = { x: goal.x, y: goal.y }; goal = null; break; }
        if (Math.hypot(goal.x - e.x, goal.y - e.y) < 14) {
          if (goal.wreck && !goal.wreck.torn && !goal.wreck.discovered) { goal.wreck.discovered = true; this.addFx(FX.alertBurst({ x: e.x, y: e.y - 30, ramp: FX.RAMP.gold })); sfx.alert(); this.raiseAlarm(false, "잔해 발견! 기지 경계 태세"); }
          e.state = "search"; e.timer = 4; e.lastSeen = { x: goal.x, y: goal.y }; goal = null;
        }
        break;
      }
      case "search": {
        speed = 30; e.timer -= dt;
        if (!e.wander || Math.hypot(e.wander.x - e.x, e.wander.y - e.y) < 4 || e.wanderT <= 0) {
          const c = e.lastSeen || { x: e.x, y: e.y };
          for (let k = 0; k < 8; k++) { const x = c.x + this.R.range(-48, 48), y = c.y + this.R.range(-40, 40); if (this.world.free(x, y)) { e.wander = { x, y }; break; } }
          e.wanderT = 2.2; e.route = null;
        }
        e.wanderT -= dt; goal = e.wander;
        if (e.timer <= 0) { e.state = "patrol"; e.route = null; e.wander = null; e.lastSeen = null; }
        break;
      }
      case "alert": {
        speed = 52;
        if (e.seesP) e.lastSeen = { x: p.x, y: p.y };
        const tgt = e.lastSeen || { x: p.x, y: p.y };
        e.fireCD -= dt;
        if (e.seesP && d < 125) {
          this.turn(e, Math.atan2(p.y - e.y, p.x - e.x), dt, 8);
          if (e.fireCD <= 0) this.fire(e);
          if (d > 44) goal = tgt;
        } else {
          goal = tgt;
          if (Math.hypot(tgt.x - e.x, tgt.y - e.y) < 6 && !e.seesP) { if (!this.alarm.blown) { e.state = "search"; e.timer = 6; } else { e.wander = null; e.state = "search"; e.timer = 5; } }
        }
        break;
      }
    }
    e.moving = false;
    if (goal) {
      e.repath -= dt;
      if (!e.route || e.repath <= 0 || (e.route.goal && Math.hypot(e.route.goal.x - goal.x, e.route.goal.y - goal.y) > 12)) {
        const r = this.world.path(e.x, e.y, goal.x, goal.y);
        e.route = r ? { pts: r, i: 0, goal: { ...goal } } : null; e.repath = e.state === "alert" ? 0.4 : 3;
        if (!r && e.state === "patrol") { e.wi = (e.wi + 1) % e.path.length; }
      }
      if (e.route) {
        const n = e.route.pts[e.route.i];
        if (n) {
          const dx = n.x - e.x, dy = n.y - e.y, L = Math.hypot(dx, dy);
          if (L < 2.5) e.route.i++;
          else {
            const s = Math.min(L, speed * dt);
            this.move(e, (dx / L) * s, (dy / L) * s);
            e.walk += s; e.moving = true;
            if (!(e.state === "alert" && e.seesP)) this.turn(e, Math.atan2(dy, dx), dt, 7);
          }
        }
      }
    }
  }
  turn(e, a, dt, rate) { e.face += angDiff(a, e.face) * (1 - Math.exp(-rate * dt)); }

  fire(e) {
    const p = this.p, a = Math.atan2(p.y - e.y, p.x - e.x) + this.R.range(-0.06, 0.06), sp = 170;
    const x = e.x + Math.cos(a) * 8, y = e.y + Math.sin(a) * 8;
    this.bolts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.4, a });
    this.addFx(FX.muzzle({ x, y, dir: a, z: 9 })); sfx.laser();
    e.fireCD = 1.15 + this.R.range(0, 0.4);
  }
  updateBolts(dt) {
    const p = this.p;
    for (const b of this.bolts) {
      b.life -= dt;
      const n = 3;
      for (let i = 0; i < n && b.life > 0; i++) {
        b.x += (b.vx * dt) / n; b.y += (b.vy * dt) / n;
        if (this.world.opaqueT(Math.floor(b.x / TILE), Math.floor(b.y / TILE)) || this.world.at(Math.floor(b.x / TILE), Math.floor(b.y / TILE)) === "#") {
          b.life = 0; this.addFx(FX.impact({ x: b.x - b.vx * 0.01, y: b.y - b.vy * 0.01, z: 8, dir: b.a + Math.PI, seed: (b.x * 13) | 0 }));
        } else if (!p.hidden && !p.dead && !p.gone && Math.hypot(b.x - p.x, b.y - p.y + 4) < 7) {
          b.life = 0;
          if (p.inv <= 0) this.damage();
          this.addFx(FX.impact({ x: b.x, y: b.y, z: 8, dir: b.a, seed: (b.x * 7) | 0 }));
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }
  damage() {
    const p = this.p;
    p.hp -= 1; p.inv = 1.0; sfx.hit();
    this.addFx(FX.hurt({ x: p.x, y: p.y, seed: (this.time * 31) | 0 }));
    this.shake(4, 0.3); this.hitstop = 0.06; this.hurtFlash = 1;
    if (p.tear) { p.tear.fx?.stop(); p.tear = null; }
    if (p.hp <= 0) {
      p.dead = true; p.act = null;
      this.addFx(FX.wreck({ x: p.x, y: p.y, pal: this.equipped.core.pal, pop: 0.3, seed: 99 }));
      setTimeout(() => sfx.pop(), 300);
      this.over = { win: false, t: 0, wait: 2.0 };
      siren(false);
    }
  }

  updateCameras(dt) {
    const p = this.p;
    for (const c of this.cameras) {
      c.a = c.a0 + Math.sin((this.time / c.period) * TAU + c.ph) * c.sweep;
      if (this.camerasOff > 0) { c.sus = 0; continue; }
      c.seesP = !p.hidden && !p.dead && this.camSees(c, p.x, p.y);
      let rate = 0;
      if (c.seesP) {
        const zone = this.world.zoneAt(p.x, p.y);
        if (zone > p.st.rank || p.tear?.kind === "wreck" || this.alarm.blown || p.act) rate = 1.3 * (1 - p.st.stealth * 0.5);
      }
      if (rate > 0) { const b = c.sus; c.sus = Math.min(1, c.sus + rate * dt); if (b < 0.3 && c.sus >= 0.3) sfx.sus(); if (c.sus >= 1 && !this.alarm.blown) this.cameraAlarm(c); }
      else c.sus = Math.max(0, c.sus - dt * 0.4);
      for (const w of this.wrecks) if (w.popped && !w.torn && !w.discovered && this.camSees(c, w.x, w.y)) { w.discovered = true; this.raiseAlarm(false, "카메라가 잔해를 발견했어요"); }
    }
  }
  camSees(c, x, y) {
    const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy);
    if (d > 92 || Math.abs(angDiff(Math.atan2(dy, dx), c.a)) > 0.42) return false;
    return this.world.los(c.x, c.y, x, y - 6);
  }
  cameraAlarm(c) {
    this.addFx(FX.alertBurst({ x: c.x, y: c.y - 6 }));
    sfx.alert();
    this.raiseAlarm(true, "카메라에 찍혔어요!");
    const near = this.enemies.filter((e) => e.state !== "dying" && e.state !== "dead").sort((a, b) => Math.hypot(a.x - this.p.x, a.y - this.p.y) - Math.hypot(b.x - this.p.x, b.y - this.p.y)).slice(0, 3);
    for (const e of near) { e.state = "alert"; e.lastSeen = { x: this.p.x, y: this.p.y }; e.route = null; e.sus = 1; }
  }
  laserOn(l) { return ((this.time + l.x * 0.37 + l.y * 0.21) % 3.4) < 2.0; }
  updateLasers(dt) {
    const p = this.p;
    for (const l of this.world.lasers) {
      l.on = this.laserOn(l);
      const z = this.world.zone[l.y * this.world.w + l.x];
      l.ok = p.st.rank >= z;
      if (!l.on || l.ok || p.hidden || p.dead) continue;
      const cx = l.x * TILE + 8, cy = l.y * TILE + 8;
      if (Math.abs(p.x - cx) < 9 && Math.abs(p.y - cy) < 9 && !this.alarm.blown) {
        this.addFx(FX.impact({ x: p.x, y: p.y, z: 8, ramp: FX.RAMP.holo, seed: 5 }));
        this.raiseAlarm(true, "레이저 게이트에 걸렸어요!");
        const near = this.enemies.filter((e) => e.state !== "dying" && e.state !== "dead").sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 3);
        for (const e of near) { e.state = "alert"; e.lastSeen = { x: p.x, y: p.y }; e.route = null; e.sus = 1; }
      }
    }
    // extraction
    if (this.targetDead && !p.extracting && !p.dead && !p.hidden && this.onExit()) {
      p.extracting = true; p.vx = p.vy = 0; sfx.extract(); siren(false);
      const X = this.world.exit; p.x = X.x * TILE + 8; p.y = X.y * TILE + 10;
      this.extractFx = this.addFx(FX.extract({ x: p.x, y: p.y }));
      if (!this.blownEver) this.earn(80, p.x, p.y - 10);
      this.earn(60 + this.si * 20);
      this.over = { win: true, t: 0, wait: 2.3 };
    }
    if (this.extractFx && this.extractFx.slammed && !p.gone) { p.gone = true; this.shake(3, 0.3); this.flash = 0.3; this.flashC = 0xaef8ff; }
  }

  // ambient life per base
  ambient(dt) {
    const th = this.stage.theme, R = this.R, W = this.world;
    const vx0 = this.cam.x - VW / 2 - 16, vy0 = this.cam.y - VH / 2 - 16;
    const rnd = () => ({ x: Math.floor(R.range(vx0, vx0 + VW + 32) / TILE), y: Math.floor(R.range(vy0, vy0 + VH + 32) / TILE) });
    if (th === "foundry") {
      for (let k = 0; k < 6; k++) { const t = rnd(); if (W.at(t.x, t.y) === "m" && R.next() < 0.5) this.amb.spawn({ kind: K.EMBER, x: t.x * TILE + R.range(0, 16), y: t.y * TILE + R.range(0, 16), z: 0, vx: R.range(-6, 6), vz: R.range(14, 34), life: R.range(0.8, 1.8), ramp: FX.RAMP.fire, glow: 0.3, drag: 0.6 }); }
      if (R.next() < dt * 1.5) { const t = rnd(); if (W.at(t.x, t.y) === "=") sparkBurst(this.amb, R, t.x * TILE + 8, t.y * TILE + 8, 2, 3, { speed: [20, 60], vz: [40, 90], life: [0.2, 0.4] }); }
    } else if (th === "cryo") {
      if (R.next() < dt * 14) this.amb.spawn({ kind: K.FLAKE, x: R.range(vx0, vx0 + VW + 60), y: R.range(vy0, vy0 + VH), z: R.range(40, 80), vx: -R.range(8, 20), vy: R.range(2, 8), vz: 0, g: 0.04, life: R.range(2, 4), c: 0xdff4ff, c2: 0x8ab8d8, size: R.next() < 0.25 ? 2 : 1, drag: 0, bounce: 0 });
      for (let k = 0; k < 3; k++) { const t = rnd(); if (W.at(t.x, t.y) === "k" && R.next() < 0.12) smokePuff(this.amb, R, t.x * TILE + 8, t.y * TILE + 2, 6, 1, { kind: K.VAPOUR, c: 0x8ab8d8, c2: 0xd8f0ff, size: [2, 4], life: [1, 1.8], vz: [4, 10], spread: 10 }); }
    } else {
      for (let k = 0; k < 3; k++) { const t = rnd(); if (W.at(t.x, t.y) === "h" && R.next() < 0.3) this.amb.spawn({ kind: K.MOTE, x: t.x * TILE + R.range(4, 12), y: t.y * TILE + 10, z: 4, vx: 0, vz: R.range(16, 30), life: R.range(0.8, 1.4), c: R.next() < 0.5 ? 0xff7af0 : 0x3affe0, glow: 0.35, drag: 0.4 }); }
      if (R.next() < dt * 4) this.amb.spawn({ kind: K.MOTE, x: R.range(vx0, vx0 + VW + 32), y: R.range(vy0, vy0 + VH + 32), z: 0, vx: 0, vz: R.range(8, 18), life: R.range(1, 2), c: 0x8a5aff, glow: 0.2, drag: 0.4 });
    }
  }

  updateCamera(dt) {
    const p = this.p;
    let tx = p.x + p.vx * 0.22, ty = p.y - 8 + p.vy * 0.22;
    if (p.act) { tx = lerp(tx, p.act.e.x, 0.3); ty = lerp(ty, p.act.e.y - 8, 0.3); }
    const k = 1 - Math.exp(-7 * dt);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
  }

  // ---------------------------------------------------------------------------------------------
  render(ctx) {
    const W = this.world, MW = W.w * TILE, MH = W.h * TILE;
    let sx = 0, sy = 0;
    if (this.shakeT > 0) { const a = this.shakeA * clamp(this.shakeT / 0.25); sx = (Math.random() * 2 - 1) * a; sy = (Math.random() * 2 - 1) * a; }
    let tlx = clamp(this.cam.x - VW / 2, 0, MW - LW) + sx, tly = clamp(this.cam.y - VH / 2, 0, MH - LH) + sy;
    tlx = clamp(tlx, 0, MW - LW); tly = clamp(tly, 0, MH - LH);
    const ox = Math.floor(tlx), oy = Math.floor(tly);
    this.view = { ox, oy, fx: tlx - ox, fy: tly - oy };
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(W.canvas, ox, oy, LW, LH, 0, 0, LW, LH);
    this.drawTilesLive(ctx, ox, oy);
    // wreck piles on the floor
    for (const w of this.wrecks) if (w.popped) this.drawPile(ctx, w, ox, oy);
    // ground fx
    const G = this.ground; G.clear();
    for (const f of this.fx) f.draw(this.gp, ox, oy, "ground");
    this.amb.draw(this.gp.set(0, 0, ox, oy), "ground");
    let img = ctx.getImageData(0, 0, LW, LH);
    applyColor(G, img.data); ctx.putImageData(img, 0, 0);
    // shadows + robots, sorted by feet
    const list = [];
    for (const e of this.enemies) if (e.state !== "dead") list.push({ y: e.y, e });
    const p = this.p;
    if (!p.hidden && !p.gone) list.push({ y: p.y, p });
    list.sort((a, b) => a.y - b.y);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (const it of list) { const o = it.e || it.p; ctx.fillRect(Math.round(o.x - ox) - 5, Math.round(o.y - oy) - 1, 10, 3); ctx.fillRect(Math.round(o.x - ox) - 4, Math.round(o.y - oy) + 2, 8, 1); }
    // player ground ring so the spy is always findable in a crowd of lookalikes
    if (!p.hidden && !p.gone && !p.dead) {
      this.gp.set(p.x, p.y, ox, oy);
    }
    for (const it of list) it.e ? this.drawEnemy(ctx, it.e, ox, oy) : this.drawPlayer(ctx, ox, oy);
    // air fx, light
    const A = this.air; A.clear();
    const ap = this.ap;
    this.drawCones(A, ox, oy);
    for (const f of this.fx) f.draw(ap, ox, oy, "air");
    this.amb.draw(ap.set(0, 0, ox, oy), "air");
    this.drawBolts(ap, ox, oy);
    this.drawLiveLights(ap, ox, oy);
    // static light for the view
    const L = W.light, lw = W.lw, B = this.base;
    for (let y = 0; y < LH; y++) { const so = (y + oy) * lw + ox, d = y * LW; for (let x = 0; x < LW; x++) { B[0][d + x] = L[0][so + x]; B[1][d + x] = L[1][so + x]; B[2][d + x] = L[2][so + x]; } }
    img = ctx.getImageData(0, 0, LW, LH);
    let amb = W.theme.amb;
    if (this.alarm.t > 0) { const k = 0.5 + 0.5 * Math.sin(this.time * 7); amb = [amb[0] + 0.12 * k, amb[1] - 0.06 * k, amb[2] - 0.06 * k]; }
    const tint = this.flash > 0 ? [((this.flashC >> 16) & 255) * this.flash, ((this.flashC >> 8) & 255) * this.flash, (this.flashC & 255) * this.flash] : null;
    composite(A, img.data, amb, B, tint, G);
    ctx.putImageData(img, 0, 0);
    this.drawMarkers(ctx, ox, oy);
  }

  drawTilesLive(ctx, ox, oy) {
    const W = this.world, t = this.time;
    const x0 = Math.floor(ox / TILE), y0 = Math.floor(oy / TILE), x1 = x0 + Math.ceil(LW / TILE) + 1, y1 = y0 + Math.ceil(LH / TILE) + 1;
    for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
      const ch = W.at(tx, ty), X = tx * TILE - ox, Y = ty * TILE - oy;
      if (ch === "=") { ctx.fillStyle = "#4a3e36"; const s = Math.floor(t * 20) % 6; for (let i = -6 + s; i < 16; i += 6) if (i >= 0 && i < 15) ctx.fillRect(X + i, Y + 4, 2, 8); }
      else if (ch === "H" && this.p.hidden && this.p.hidden.x === tx && this.p.hidden.y === ty) { ctx.fillStyle = Math.floor(t * 3) % 2 ? "#3affe0" : "#1a8a7a"; ctx.fillRect(X + 7, Y, 2, 1); }
      else if (ch === "t") { ctx.fillStyle = Math.floor(t * 2 + tx) % 2 ? "#3affa0" : "#0c3a2a"; ctx.fillRect(X + 11, Y + 5, 1, 1); }
    }
  }

  drawPile(ctx, w, ox, oy) {
    if (!w.pile) {
      // a downed robot: its sprite tipped onto its back, darkened; later just scrap
      const S = robotSprites(w.e.robot), cv = document.createElement("canvas"); cv.width = SH; cv.height = SW;
      const c = cv.getContext("2d"); c.translate(SH / 2, SW / 2); c.rotate(Math.cos(w.face) >= 0 ? Math.PI / 2 : -Math.PI / 2); c.drawImage(S.frames[0][0], -SW / 2, -SH / 2);
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "source-atop"; c.fillStyle = "rgba(10,6,10,0.45)"; c.fillRect(0, 0, SH, SW);
      w.pile = cv;
      const sc = document.createElement("canvas"); sc.width = 12; sc.height = 6; const s2 = sc.getContext("2d");
      const R = new Rng(Math.floor(w.x * 3 + w.y));
      for (let i = 0; i < 14; i++) { s2.fillStyle = "#" + mix(R.pick([w.pal.d, w.pal.m, 0x2a2228]), 0x000000, 0.3).toString(16).padStart(6, "0"); s2.fillRect(R.int(0, 10), R.int(1, 5), R.int(1, 2), 1); }
      w.scrap = sc;
    }
    if (w.torn) ctx.drawImage(w.scrap, Math.round(w.x - ox) - 6, Math.round(w.y - oy) - 3);
    else ctx.drawImage(w.pile, Math.round(w.x - ox) - SH / 2, Math.round(w.y - oy) - SW / 2 - 2);
  }

  drawRobot(ctx, robot, x, y, f, fr, flip, white, alpha = 1) {
    const S = robotSprites(robot), img = (white ? S.white : S.frames)[f][fr];
    const X = Math.round(x - AX), Y = Math.round(y - AY);
    ctx.globalAlpha = alpha;
    if (flip) { ctx.save(); ctx.translate(X + SW, Y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore(); }
    else ctx.drawImage(img, X, Y);
    ctx.globalAlpha = 1;
  }
  drawEnemy(ctx, e, ox, oy) {
    const fc = facingOf(e.face), fr = e.moving ? Math.floor(e.walk / 5) % 4 : 0;
    let x = e.x - ox, y = e.y - oy;
    if (e.state === "dying") {
      x += e.push.x * ease.outCubic(clamp(e.dieT / 0.1)) + (Math.random() - 0.5) * 1.5; y += e.push.y * ease.outCubic(clamp(e.dieT / 0.1));
      const blink = e.dieT < 0.12 || Math.floor(e.dieT * 30) % 3 === 0;
      this.drawRobot(ctx, e.robot, x, y, fc.f, 0, fc.flip, false);
      if (blink) this.drawRobot(ctx, e.robot, x, y, fc.f, 0, fc.flip, true, e.dieT < 0.12 ? 1 : 0.6);
      return;
    }
    this.drawRobot(ctx, e.robot, x, y, fc.f, fr, fc.flip, false);
    if (e.flash > 0) this.drawRobot(ctx, e.robot, x, y, fc.f, fr, fc.flip, true, e.flash / 0.12);
  }
  drawPlayer(ctx, ox, oy) {
    const p = this.p;
    if (p.inv > 0 && Math.floor(p.inv * 20) % 2) return;
    const fr = Math.hypot(p.vx, p.vy) > 8 ? Math.floor(p.walk / 6) % 4 : 0;
    const x = p.x - ox + (p.ox || 0), y = p.y - oy + (p.oy || 0);
    this.drawRobot(ctx, this.equipped, x, y, p.f, fr, p.flip, false);
    if (p.whiteT > 0) this.drawRobot(ctx, this.equipped, x, y, p.f, fr, p.flip, true, p.whiteT / 0.12);
  }

  // vision cones as flashlights: they light the floor and show where the danger is
  drawCones(F, ox, oy) {
    const items = [];
    for (const e of this.enemies) {
      if (e.state === "dying" || e.state === "dead") continue;
      const range = this.alarm.t > 0 ? RANGE_ALARM : RANGE;
      const c = e.state === "alert" ? 0xff3040 : e.sus > 0.3 || e.state === "investigate" ? 0xffa040 : this.alarm.t > 0 ? 0xffc890 : 0xfff2c8;
      items.push({ x: e.x, y: e.y - 2, a: e.face, half: HALF, range, c, k: e.state === "alert" ? 0.6 : 0.46 });
    }
    if (this.camerasOff <= 0) for (const c of this.cameras) items.push({ x: c.x, y: c.y, a: c.a, half: 0.42, range: 92, c: c.sus > 0.3 ? 0xff5040 : 0x9af0ff, k: 0.32, cam: true });
    const N = 32;
    for (const it of items) {
      if (it.x + it.range < ox || it.x - it.range > ox + LW || it.y + it.range < oy || it.y - it.range > oy + LH) continue;
      const rays = new Float32Array(N + 1);
      for (let i = 0; i <= N; i++) rays[i] = this.world.ray(it.x, it.cam ? it.y : it.y - 4, it.a - it.half + (2 * it.half * i) / N, it.range);
      const cr = (it.c >> 16) & 255, cg = (it.c >> 8) & 255, cb = it.c & 255;
      const ca = Math.cos(it.a), sa = Math.sin(it.a), cosH = Math.cos(it.half);
      const cx = it.x - ox, cy = it.y - oy;
      const x0 = Math.max(0, Math.floor(cx - it.range)), x1 = Math.min(LW - 1, Math.ceil(cx + it.range));
      const y0 = Math.max(0, Math.floor(cy - it.range)), y1 = Math.min(LH - 1, Math.ceil(cy + it.range));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        if (d < 3 || d > it.range) continue;
        const dot = (dx * ca + dy * sa) / d; if (dot < cosH) continue;
        const rel = Math.atan2(dx * -sa + dy * ca, dx * ca + dy * sa);
        const fi = ((rel + it.half) / (2 * it.half)) * N, i0 = Math.floor(fi), u = fi - i0;
        const lim = lerp(rays[i0], rays[Math.min(N, i0 + 1)], u);
        if (d > lim + 1) continue;
        const fall = (1 - d / it.range), k = it.k * Math.sqrt(fall);
        const edge = d > lim - 1.2 || dot < cosH + 0.012 || d > it.range - 1.5;
        const i = y * LW + x;
        F.ir[i] += (cr / 255) * k; F.ig[i] += (cg / 255) * k; F.ib[i] += (cb / 255) * k;
        if (edge) { const e2 = 0.1 + 0.2 * fall; F.lr[i] += cr * e2; F.lg[i] += cg * e2; F.lb[i] += cb * e2; }
      }
    }
  }

  drawBolts(p, ox, oy) {
    p.set(0, 0, ox, oy);
    for (const b of this.bolts) {
      const ux = b.vx / 170, uy = b.vy / 170, x = b.x, y = b.y - 8;
      p.line(x - ux * 7, y - uy * 7, x, y, (t) => (t > 0.6 ? 0xffffff : 0xff4a5a));
      p.glowLine(x - ux * 7, y - uy * 7, x, y, 5, 0xff3040, 0.5);
    }
  }

  drawLiveLights(p, ox, oy) {
    const W = this.world, t = this.time;
    // molten shimmer, lasers, holograms, extraction pad
    const x0 = Math.floor(ox / TILE), y0 = Math.floor(oy / TILE), x1 = x0 + Math.ceil(LW / TILE) + 1, y1 = y0 + Math.ceil(LH / TILE) + 1;
    p.set(0, 0, ox, oy);
    for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
      const ch = W.at(tx, ty), X = tx * TILE, Y = ty * TILE;
      if (ch === "m") {
        const ph = Math.sin(t * 2 + tx * 1.7 + ty * 2.3);
        if (ph > 0.6) { const bx = X + 4 + ((tx * 7 + ty * 3) % 8), by = Y + 5 + ((tx * 3) % 6); p.px(bx, by, 0xffe08a); p.px(bx + 1, by, 0xff9a3a); p.glow(bx, by, 6, 0xff9a3a, 0.3); }
      } else if (ch === "~") {
        const l = W.lasers.find((q) => q.x === tx && q.y === ty);
        const vert = W.at(tx, ty - 1) !== "#";
        const col = l?.ok ? 0x5aff8a : 0xff3a8a;
        if (l?.on) {
          for (let i = 0; i < 3; i++) {
            const o = 4 + i * 4 + Math.sin(t * 30 + i) * 0.5;
            if (vert) p.line(X + 1, Y + o, X + 14, Y + o, (u) => (u > 0.3 && u < 0.7 ? 0xffffff : col)); else p.line(X + o, Y + 1, X + o, Y + 14, (u) => (u > 0.3 && u < 0.7 ? 0xffffff : col));
          }
          p.glow(X + 8, Y + 8, 18, col, 0.5);
        } else { p.px(X + 1, Y + 8, col); p.px(X + 14, Y + 8, col); p.glow(X + 8, Y + 8, 6, col, 0.15); }
      } else if (ch === "h") {
        const fl = Math.sin(t * 23 + tx) > 0.85 ? 0.3 : 1;
        for (let j = 0; j < 9; j++) { const w = 3 + Math.round(2 * Math.sin(t * 2 + j * 0.6)); if ((j + Math.floor(t * 8)) % 4 !== 0) p.line(X + 8 - w, Y + j, X + 8 + w, Y + j, j % 2 ? 0xff7af0 : 0x3affe0, 0.5 * fl, true); }
        p.glow(X + 8, Y + 4, 16, 0xff7af0, 0.3 * fl);
      } else if (ch === "X") {
        const on = this.targetDead, k = on ? 0.7 + 0.3 * Math.sin(t * 6) : 0.25;
        p.ring(X + 8, Y + 8, 6 + (on ? Math.sin(t * 4) : 0), 1.2, (v, an) => (Math.floor((an + t * (on ? 3 : 0.5)) * 3) % 2 ? 0x8af8f0 : 0x2ac0c8), k);
        p.glow(X + 8, Y + 8, on ? 28 : 14, 0x3ae8ff, on ? 0.6 : 0.2);
      }
    }
    // camera bodies: a red eye when watching
    for (const c of this.cameras) {
      const off = this.camerasOff > 0;
      p.px(c.x, c.y, 0x222630); p.px(c.x + Math.cos(c.a) * 2, c.y + Math.sin(c.a) * 2, off ? 0x333 : c.sus > 0.3 ? 0xff3040 : 0x9af0ff);
      if (!off) p.glow(c.x + Math.cos(c.a) * 2, c.y + Math.sin(c.a) * 2, 5, c.sus > 0.3 ? 0xff3040 : 0x9af0ff, 0.5);
    }
  }

  // world-space UI drawn after lighting: suspicion marks, rank pips, the spy's marker, target marker
  drawMarkers(ctx, ox, oy) {
    const glyph = (rows, x, y, col, out = "#120e18") => {
      for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) if (rows[j][i] !== " ") {
        ctx.fillStyle = out; ctx.fillRect(x + i - 1, y + j, 1, 1); ctx.fillRect(x + i + 1, y + j, 1, 1); ctx.fillRect(x + i, y + j - 1, 1, 1); ctx.fillRect(x + i, y + j + 1, 1, 1);
      }
      for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) if (rows[j][i] !== " ") { ctx.fillStyle = col; ctx.fillRect(x + i, y + j, 1, 1); }
    };
    const Q = ["###", "  #", " ##", "   ", " # "], EX = ["#", "#", "#", " ", "#"];
    const pips = (x, y, n, c) => { ctx.fillStyle = "#120e18"; ctx.fillRect(x - n * 2 - 1, y - 1, n * 4 + 1, 4); ctx.fillStyle = c; for (let i = 0; i < n; i++) { ctx.fillRect(x - n * 2 + i * 4, y, 3, 1); ctx.fillRect(x - n * 2 + i * 4 + 1, y + 1, 1, 1); } };
    const near = this.p.act ? null : this.nearby();
    for (const e of this.enemies) {
      if (e.state === "dying" || e.state === "dead") continue;
      const x = Math.round(e.x - ox), y = Math.round(e.y - oy) - 26;
      if (x < -20 || x > LW + 20 || y < -20 || y > LH + 30) continue;
      const rc = "#" + RANK_TINT[e.rank].toString(16).padStart(6, "0");
      pips(x, y + 1, e.rank, rc);
      if (e.target) { const b = Math.round(Math.sin(this.time * 5)); ctx.fillStyle = "#120e18"; ctx.fillRect(x - 3, y - 8 + b, 7, 6); ctx.fillStyle = "#ff3a4a"; ctx.fillRect(x - 2, y - 7 + b, 5, 4); ctx.fillStyle = "#ffd0d0"; ctx.fillRect(x - 1, y - 6 + b, 1, 1); }
      const pop = e.qT > 0 ? Math.round(ease.outBack(1 - e.qT / 0.3) * 0) : 0;
      if (e.state === "alert") glyph(EX, x, y - 9 - (e.target ? 6 : 0) - pop, "#ff3a4a");
      else if (e.sus > 0.05 || e.state === "investigate" || e.state === "search") {
        const yy = y - 9 - (e.target ? 6 : 0);
        const col = e.state === "investigate" ? "#ffa040" : e.state === "search" ? "#8a9cc0" : "#ffd040";
        glyph(Q, x - 1, yy, "#4a4250");
        // fill the ? from the bottom by suspicion
        const fillRows = Math.ceil((e.state === "sus" || e.sus > 0.05 ? e.sus : 1) * 5);
        for (let j = 0; j < 5; j++) if (5 - j <= fillRows) for (let i = 0; i < 3; i++) if (Q[j][i] !== " ") { ctx.fillStyle = col; ctx.fillRect(x - 1 + i, yy + j, 1, 1); }
      }
      if (near && near.victim === e) {
        const k = 9 + Math.round(Math.sin(this.time * 10)), cy = Math.round(e.y - oy) - 9;
        ctx.fillStyle = "#ff3a4a";
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.fillRect(x + sx * k - (sx > 0 ? 2 : 0), cy + sy * (k + 2), 3, 1); ctx.fillRect(x + sx * k, cy + sy * (k + 2) - (sy > 0 ? 2 : 0), 1, 3); }
      }
    }
    for (const c of this.cameras) {
      if (c.sus > 0.05 && this.camerasOff <= 0) { const x = Math.round(c.x - ox), y = Math.round(c.y - oy) - 10; glyph(Q, x - 1, y, c.sus >= 0.99 ? "#ff3a4a" : "#ffd040"); }
    }
    // the spy: cyan pips and a small arrow
    const p = this.p;
    if (!p.hidden && !p.gone && !p.dead) {
      const x = Math.round(p.x - ox + (p.ox || 0)), y = Math.round(p.y - oy) - 26;
      const rc = "#" + RANK_TINT[p.st.rank].toString(16).padStart(6, "0");
      pips(x, y + 1, p.st.rank, rc);
      const b = Math.round(Math.sin(this.time * 4));
      ctx.fillStyle = "#120e18"; ctx.fillRect(x - 3, y - 6 + b, 7, 4); ctx.fillStyle = "#3affe0"; ctx.fillRect(x - 2, y - 5 + b, 5, 1); ctx.fillRect(x - 1, y - 4 + b, 3, 1); ctx.fillRect(x, y - 3 + b, 1, 1);
      // illegal zone warning: a red ring under the feet
      if (this.world.zoneAt(p.x, p.y) > p.st.rank) { ctx.fillStyle = Math.floor(this.time * 6) % 2 ? "#ff3a4a" : "#8a1424"; const fx = Math.round(p.x - ox), fy = Math.round(p.y - oy); ctx.fillRect(fx - 6, fy + 2, 12, 1); ctx.fillRect(fx - 7, fy + 1, 1, 1); ctx.fillRect(fx + 6, fy + 1, 1, 1); }
    }
    // floating texts
    ctx.font = "8px Galmuri9, monospace"; ctx.textAlign = "center";
    for (const m of this.msgs) { const u = m.t / 1.2, y = Math.round(m.y - oy - ease.outCubic(u) * 10); ctx.globalAlpha = 1 - seg(u, 0.6, 1); ctx.fillStyle = "#120e18"; ctx.fillText(m.text, Math.round(m.x - ox) + 1, y + 1); ctx.fillStyle = m.c; ctx.fillText(m.text, Math.round(m.x - ox), y); ctx.globalAlpha = 1; }
    // off-screen objective arrow
    let obj = null;
    if (!this.targetDead) { const t = this.enemies.find((e) => e.target && e.state !== "dead" && e.state !== "dying"); if (t) obj = { x: t.x, y: t.y - 10, c: "#ff3a4a" }; }
    else { const X = this.world.exit; obj = { x: X.x * TILE + 8, y: X.y * TILE + 8, c: "#3affe0" }; }
    if (obj) {
      const sx = obj.x - ox, sy = obj.y - oy;
      if (sx < 4 || sy < 4 || sx > LW - 4 || sy > LH - 4) {
        const cx = LW / 2, cy = LH / 2, a = Math.atan2(sy - cy, sx - cx);
        const t = Math.min((LW / 2 - 10) / Math.abs(Math.cos(a) || 1e-6), (LH / 2 - 10) / Math.abs(Math.sin(a) || 1e-6));
        const ax = Math.round(cx + Math.cos(a) * t), ay = Math.round(cy + Math.sin(a) * t);
        const pulse = 1 + Math.round(Math.sin(this.time * 8));
        ctx.fillStyle = obj.c;
        for (let i = 0; i < 5; i++) { const px = ax - Math.cos(a) * i, py = ay - Math.sin(a) * i; const w = Math.round(i * 0.8) + pulse * 0; ctx.fillRect(Math.round(px - Math.sin(a) * w), Math.round(py + Math.cos(a) * w), 1, 1); ctx.fillRect(Math.round(px + Math.sin(a) * w), Math.round(py - Math.cos(a) * w), 1, 1); }
        ctx.fillRect(ax - 1, ay - 1, 2, 2);
      }
    }
  }
}
