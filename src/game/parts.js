// Robot parts: every robot (the spy and every enemy) is four parts. A part you tear off an enemy keeps its look,
// so the spy turns into a visible patchwork of what it has assassinated.

export const SLOTS = ["head", "core", "arm", "legs"];
export const SLOT_NAME = { head: "머리", core: "몸통", arm: "팔", legs: "다리" };
export const RANK_NAME = ["", "작업병", "경비병", "감독관", "지휘관", "사령관"];
export const RANK_COLOR = [0, 0xb8977a, 0x8ab0e8, 0xff7a4a, 0xc89aff, 0xffd040];

const PAL = {
  worker: { d: 0x5a4038, m: 0x8a6a52, l: 0xb8977a, a: 0xe0a040, e: 0x9fe8ff },
  guard: { d: 0x34405a, m: 0x52648a, l: 0x8a9cc0, a: 0xd8c050, e: 0xff6a3a },
  overseer: { d: 0x3a2c30, m: 0x6a4a48, l: 0x9a7068, a: 0xff4a3a, e: 0xffd040 },
  scientist: { d: 0x6a7a8a, m: 0xaabccc, l: 0xeaf4f8, a: 0x3ab8e0, e: 0x5af0ff },
  sentry: { d: 0x1c4048, m: 0x2e6a74, l: 0x5aa0a8, a: 0xd8f0f0, e: 0xff3a5a },
  chief: { d: 0x463868, m: 0x7464a4, l: 0xc0b8e8, a: 0x7af0ff, e: 0x7af0ff },
  officer: { d: 0x24202e, m: 0x3e3852, l: 0x645c7e, a: 0xff3aa8, e: 0x3affe0 },
  elite: { d: 0x1e2630, m: 0x384858, l: 0x6c8ca4, a: 0x3ae8ff, e: 0xff3a6a },
  commander: { d: 0x3a2a18, m: 0x8a6a28, l: 0xe8c860, a: 0xff3a3a, e: 0xff4a3a },
};

// type -> rank, look of each part, and display name
export const TYPES = {
  worker: { rank: 1, name: "작업 드론", head: { s: "box", eye: "slit" }, core: { s: "plate" }, arm: { s: "clamp" }, legs: { s: "treads" } },
  guard: { rank: 2, name: "경비 로봇", head: { s: "dome", eye: "wide" }, core: { s: "vest" }, arm: { s: "baton" }, legs: { s: "legs" } },
  overseer: { rank: 3, name: "공장 감독관", head: { s: "crest", eye: "mono" }, core: { s: "reactor" }, arm: { s: "claw" }, legs: { s: "legs" } },
  scientist: { rank: 2, name: "연구 로봇", head: { s: "round", eye: "lens" }, core: { s: "coat" }, arm: { s: "thin" }, legs: { s: "hover" } },
  sentry: { rank: 3, name: "보안 센트리", head: { s: "helm", eye: "T" }, core: { s: "armor" }, arm: { s: "gun" }, legs: { s: "digi" } },
  chief: { rank: 4, name: "수석 연구원", head: { s: "halo", eye: "twin" }, core: { s: "coat" }, arm: { s: "thin" }, legs: { s: "hover" } },
  officer: { rank: 3, name: "장교", head: { s: "cap", eye: "wide" }, core: { s: "sash" }, arm: { s: "blade" }, legs: { s: "legs" } },
  elite: { rank: 4, name: "엘리트 근위대", head: { s: "horn", eye: "twin" }, core: { s: "armor" }, arm: { s: "gun" }, legs: { s: "digi" } },
  commander: { rank: 5, name: "총사령관", head: { s: "crown", eye: "twin" }, core: { s: "reactor" }, arm: { s: "blade" }, legs: { s: "hover" } },
};

const PART_TITLE = {
  head: { box: "작업용 센서", dome: "경비 바이저", crest: "감독관 투구", round: "연구용 렌즈", helm: "보안 헬름", halo: "헤일로 안테나", cap: "장교 모자", horn: "근위대 뿔투구", crown: "사령관 왕관" },
  core: { plate: "철판 몸통", vest: "방호 조끼", reactor: "소형 반응로", coat: "연구 가운", armor: "중장갑", sash: "장교 제복" },
  arm: { clamp: "집게 팔", baton: "진압봉 팔", claw: "갈고리 팔", thin: "정밀 팔", gun: "포신 팔", blade: "고주파 칼날" },
  legs: { treads: "궤도", legs: "보행 다리", hover: "호버 유닛", digi: "역관절 다리" },
};

// one part of one type
export function part(type, slot) {
  const T = TYPES[type];
  return { id: `${type}.${slot}`, type, slot, rank: T.rank, style: T[slot], pal: PAL[type], name: PART_TITLE[slot][T[slot].s] };
}
export const partFromId = (id) => { const [t, s] = id.split("."); return part(t, s); };
export const robotOf = (type) => ({ head: part(type, "head"), core: part(type, "core"), arm: part(type, "arm"), legs: part(type, "legs") });

// what each part does for the spy
export function partStats(p) {
  const r = p.rank;
  switch (p.slot) {
    case "head": return { stealth: 0.07 * (r - 1) };          // slower detection
    case "core": return { hp: Math.floor(r / 2) };             // extra armor pips
    case "arm": return { reach: 3 * (r - 1), tear: 0.18 * (r - 1) }; // kill reach, dismantle speed
    case "legs": return { speed: 7 * (r - 1), dash: 0.25 * (r - 1) }; // move speed, dash recharge
  }
}
export function statLine(p) {
  const s = partStats(p);
  switch (p.slot) {
    case "head": return `은신 +${Math.round(s.stealth * 100)}%`;
    case "core": return `장갑 +${s.hp}`;
    case "arm": return `암살 거리 +${s.reach} · 해체 +${Math.round(s.tear * 100)}%`;
    case "legs": return `이동 +${s.speed} · 대시 충전 +${Math.round(s.dash * 100)}%`;
  }
}

// disguise rank: the average of the parts. A patchwork that is too uneven looks wrong up close.
export function rankOf(robot) {
  const rs = SLOTS.map((s) => robot[s].rank);
  const avg = rs.reduce((a, b) => a + b, 0) / 4;
  return { rank: Math.max(1, Math.min(5, Math.floor(avg + 0.5))), odd: Math.max(...rs) - Math.min(...rs) >= 3, avg };
}

// ---------------------------------------------------------------------------------------------------
// Sprites. 20 x 24 buffer, feet at (10, 22). Facings: 0 down (front), 1 up (back), 2 side (right).

export const SW = 20, SH = 24, AX = 10, AY = 22;
const OUT = 0x120e18;

function buf() { return new Int32Array(SW * SH).fill(-1); }
function put(b, x, y, c) { if (x >= 0 && y >= 0 && x < SW && y < SH) b[y * SW + x] = c; }
function rect(b, x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(b, x + i, y + j, c); }
function hline(b, x, y, w, c) { rect(b, x, y, w, 1, c); }

function drawLegs(b, P, st, f, fr) {
  const { d, m, l, a } = P;
  const step = [0, 1, 0, -1][fr];
  if (st.s === "treads") {
    if (f === 2) { rect(b, 6, 18, 8, 4, d); hline(b, 6, 18, 8, m); for (let i = 0; i < 8; i += 2) put(b, 6 + ((i + fr) % 8), 21, l); }
    else { for (const x of [5, 11]) { rect(b, x, 17, 4, 5, d); hline(b, x, 17, 4, m); for (let j = 0; j < 5; j += 2) put(b, x + (x < 10 ? 0 : 3), 17 + ((j + fr) % 5), l); } }
  } else if (st.s === "hover") {
    const bob = fr % 2;
    if (f === 2) { rect(b, 7, 17 - bob, 6, 3, m); hline(b, 7, 17 - bob, 6, l); hline(b, 8, 20 - bob, 4, a); }
    else { rect(b, 6, 17 - bob, 8, 3, m); hline(b, 6, 17 - bob, 8, l); hline(b, 7, 20 - bob, 6, a); put(b, 6, 19 - bob, d); put(b, 13, 19 - bob, d); }
  } else if (st.s === "digi") {
    if (f === 2) { rect(b, 8 + step, 16, 2, 3, m); rect(b, 9 + step, 19, 2, 2, d); hline(b, 9 + step, 21, 3, l); rect(b, 10 - step, 16, 2, 3, d); rect(b, 10 - step, 19, 2, 3, d); }
    else { for (const [x, s] of [[6, step], [12, -step]]) { rect(b, x, 16, 2, 2, m); rect(b, x + (x < 10 ? -1 : 1), 18, 2, 2, d); rect(b, x, 20 + Math.min(0, s), 2, 2 - Math.min(0, s), m); put(b, x, 21, l); } }
  } else { // legs
    if (f === 2) { rect(b, 8 + step, 16, 2, 6, m); put(b, 8 + step, 16, l); hline(b, 8 + step, 21, 3, d); rect(b, 10 - step, 16, 2, 6, d); }
    else { for (const [x, s] of [[6, step], [12, -step]]) { rect(b, x, 16, 2, 5 + Math.min(0, s), m); put(b, x, 16, l); hline(b, x - (x < 10 ? 1 : 0), 21 + Math.min(0, s), 3, d); } }
  }
}

function drawCore(b, P, st, f, bob) {
  const { d, m, l, a } = P;
  const y = 9 + bob, w = f === 2 ? 8 : 10, x = f === 2 ? 6 : 5;
  rect(b, x, y, w, 7, m); hline(b, x, y, w, l); hline(b, x, y + 6, w, d);
  if (f === 1) { rect(b, x + 3, y + 2, w - 6, 3, d); hline(b, x + 3, y + 2, w - 6, m); return; } // back vents
  switch (st.s) {
    case "plate": put(b, x + 2, y + 2, d); put(b, x + w - 3, y + 2, d); hline(b, x + 3, y + 4, w - 6, a); break;
    case "vest": rect(b, x + 1, y + 1, w - 2, 4, d); hline(b, x + 1, y + 1, w - 2, a); put(b, x + (w >> 1), y + 3, l); break;
    case "reactor": rect(b, x + (w >> 1) - 1, y + 2, 2, 2, a); put(b, x + (w >> 1) - 1, y + 2, 0xffffff); hline(b, x + 1, y + 5, w - 2, d); break;
    case "coat": rect(b, x, y, w, 7, l); hline(b, x, y + 6, w, m); for (let j = 1; j < 7; j++) put(b, x + (w >> 1), y + j, m); put(b, x + 2, y + 2, a); break;
    case "armor": rect(b, x - 1, y, 3, 3, l); rect(b, x + w - 2, y, 3, 3, l); hline(b, x - 1, y + 2, 3, d); hline(b, x + w - 2, y + 2, 3, d); hline(b, x + 2, y + 4, w - 4, a); break;
    case "sash": for (let j = 0; j < 6; j++) put(b, x + 1 + j, y + j, a); put(b, x + w - 3, y + 2, 0xffd040); break;
  }
}

function drawHead(b, P, st, f, bob) {
  const { d, m, l, a, e } = P;
  const s = st.s;
  const w = s === "box" || s === "helm" ? 10 : 8, h = 7;
  let x = 10 - (w >> 1) + (f === 2 ? 1 : 0), y = 2 + bob;
  const round = s === "dome" || s === "round" || s === "halo" || s === "crown";
  rect(b, x, y, w, h, m);
  if (round) { put(b, x, y, -1); put(b, x + w - 1, y, -1); }
  hline(b, x + (round ? 1 : 0), y, w - (round ? 2 : 0), l); hline(b, x, y + h - 2, w, d); hline(b, x + 1, y + h - 1, w - 2, OUT);
  put(b, x + 1, y + 1, l);
  // decorations
  if (s === "crest") { rect(b, x + 3, y - 2, 2, 2, a); put(b, x + 3, y - 2, l); }
  if (s === "halo") { hline(b, x + 1, y - 2, w - 2, a); put(b, x, y - 1, a); put(b, x + w - 1, y - 1, a); }
  if (s === "horn") { put(b, x, y - 1, l); put(b, x - 1, y - 2, l); put(b, x + w - 1, y - 1, l); put(b, x + w, y - 2, l); }
  if (s === "crown") { for (let i = 0; i < w; i += 2) put(b, x + i + (i ? 1 : 0), y - 1, a); hline(b, x, y, w, a); put(b, x + (w >> 1), y - 2, 0xffffff); }
  if (s === "cap") { hline(b, x - 1, y + 1, w + 2, d); hline(b, x, y, w, a); }
  if (s === "box") { put(b, x + w - 2, y - 1, d); put(b, x + w - 2, y - 2, a); }
  if (f === 1) { hline(b, x + 1, y + 3, w - 2, d); return; } // back of head
  const ey = y + 3;
  const ex = f === 2 ? x + 3 : x + 1, ew = f === 2 ? w - 3 : w - 2;
  switch (st.eye) {
    case "slit": hline(b, ex, ey, ew, OUT); hline(b, ex + 1 + (f === 2 ? 2 : 0), ey, f === 2 ? 2 : ew - 2, e); break;
    case "wide": rect(b, ex, ey - 1, ew, 2, OUT); hline(b, ex + 1, ey - 1, ew - 2, e); break;
    case "mono": rect(b, ex + (ew >> 1) - 1 + (f === 2 ? 2 : 0), ey - 1, 3, 3, OUT); put(b, ex + (ew >> 1) + (f === 2 ? 2 : 0), ey, e); break;
    case "lens": rect(b, ex + (ew >> 1) - 2 + (f === 2 ? 2 : 0), ey - 2, 4, 4, OUT); rect(b, ex + (ew >> 1) - 1 + (f === 2 ? 2 : 0), ey - 1, 2, 2, e); put(b, ex + (ew >> 1) - 1 + (f === 2 ? 2 : 0), ey - 1, 0xffffff); break;
    case "T": hline(b, ex, ey - 1, ew, OUT); hline(b, ex + 1, ey - 1, ew - 2, e); put(b, ex + (ew >> 1) + (f === 2 ? 1 : 0), ey, OUT); put(b, ex + (ew >> 1) + (f === 2 ? 1 : 0), ey + 1, OUT); break;
    case "twin": if (f === 2) { put(b, ex + 2, ey, e); put(b, ex + 4, ey, e); } else { put(b, ex + 1, ey, e); put(b, ex + ew - 2, ey, e); put(b, ex + 1, ey - 1, OUT); put(b, ex + ew - 2, ey - 1, OUT); } break;
  }
}

function drawArm(b, P, st, f, fr, bob, side) {
  const { d, m, l, a } = P;
  const sw = [0, 1, 0, -1][fr] * (side > 0 ? 1 : -1);
  let x = side < 0 ? 2 : 15, y = 10 + bob + (f === 2 ? 0 : 0);
  if (f === 2) x = side < 0 ? 5 + sw : 11 - sw; // side view: arms overlap the body
  rect(b, x, y, 3, 5, m); hline(b, x, y, 3, l); put(b, x + (side < 0 ? 0 : 2), y + 4, d);
  const hy = y + 5, hx = x;
  switch (st.s) {
    case "clamp": put(b, hx, hy, d); put(b, hx + 2, hy, d); put(b, hx, hy + 1, a); put(b, hx + 2, hy + 1, a); break;
    case "baton": rect(b, hx + 1, hy, 1, 3, a); put(b, hx + 1, hy + 2, 0xffffff); break;
    case "claw": put(b, hx, hy, l); put(b, hx + 1, hy + 1, l); put(b, hx + 2, hy, l); put(b, hx, hy + 1, d); put(b, hx + 2, hy + 1, d); break;
    case "thin": rect(b, hx + 1, hy, 1, 2, l); break;
    case "gun": rect(b, hx, hy, 3, 2, d); put(b, hx + 1, hy + 2, a); break;
    case "blade": rect(b, hx + 1, hy, 1, 4, 0xe8f4ff); put(b, hx + 1, hy + 4, a); break;
  }
}

// compose a robot into a sprite buffer for facing f and walk frame fr (0..3)
export function composeRobot(robot, f, fr) {
  const b = buf();
  const bob = fr === 1 || fr === 3 ? 1 : 0;
  drawLegs(b, robot.legs.pal, robot.legs.style, f, fr);
  if (f === 1) { drawArm(b, robot.arm.pal, robot.arm.style, f, fr, bob, -1); drawArm(b, robot.arm.pal, robot.arm.style, f, fr, bob, 1); }
  if (f === 2) drawArm(b, robot.arm.pal, robot.arm.style, f, (fr + 2) % 4, bob, -1);
  drawCore(b, robot.core.pal, robot.core.style, f, bob);
  drawHead(b, robot.head.pal, robot.head.style, f, bob);
  if (f === 0) { drawArm(b, robot.arm.pal, robot.arm.style, f, fr, bob, -1); drawArm(b, robot.arm.pal, robot.arm.style, f, fr, bob, 1); }
  if (f === 2) drawArm(b, robot.arm.pal, robot.arm.style, f, fr, bob, 1);
  // auto outline
  const o = b.slice();
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    if (b[y * SW + x] !== -1) continue;
    const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < SW && yy < SH && b[yy * SW + xx] !== -1 && b[yy * SW + xx] !== OUT;
    if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) o[y * SW + x] = OUT;
  }
  return o;
}

// canvases for every facing/frame, plus a 1-bit mask
const cache = new Map();
export function robotKey(robot) { return SLOTS.map((s) => robot[s].id).join("|"); }
export function robotSprites(robot) {
  const key = robotKey(robot);
  if (cache.has(key)) return cache.get(key);
  const out = { frames: [], masks: [], white: [] };
  for (let f = 0; f < 3; f++) {
    out.frames[f] = []; out.masks[f] = []; out.white[f] = [];
    for (let fr = 0; fr < 4; fr++) {
      const px = composeRobot(robot, f, fr);
      const cv = document.createElement("canvas"); cv.width = SW; cv.height = SH;
      const cw = document.createElement("canvas"); cw.width = SW; cw.height = SH;
      const ctx = cv.getContext("2d"), ctw = cw.getContext("2d");
      const id = ctx.createImageData(SW, SH), iw = ctw.createImageData(SW, SH);
      const m = new Uint8Array(SW * SH);
      for (let i = 0; i < px.length; i++) if (px[i] !== -1) {
        const c = px[i];
        id.data[i * 4] = (c >> 16) & 255; id.data[i * 4 + 1] = (c >> 8) & 255; id.data[i * 4 + 2] = c & 255; id.data[i * 4 + 3] = 255;
        iw.data[i * 4] = 255; iw.data[i * 4 + 1] = 255; iw.data[i * 4 + 2] = 255; iw.data[i * 4 + 3] = 255;
        m[i] = 1;
      }
      ctx.putImageData(id, 0, 0); ctw.putImageData(iw, 0, 0);
      out.frames[f][fr] = cv; out.white[f][fr] = cw; out.masks[f][fr] = m;
    }
  }
  cache.set(key, out);
  return out;
}
