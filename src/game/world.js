// Tile world: parsing, collision, line of sight, path finding, zone clearance and tile art per theme.
import { Rng, mix } from "../engine/fx.js";

export const TILE = 16;
// solid: blocks movement; opaque: blocks sight
const SOLID = new Set(["#", "m", "k", "o", "H", "t", "h"]);
const OPAQUE = new Set(["#", "o", "H", "k", "t"]);

export const THEMES = {
  foundry: {
    floor: [0x3a302c, 0x372d29], seam: 0x2a221f, bolt: 0x4a3e38,
    wallTop: 0x6a564a, wallTop2: 0x5e4c42, wallFace: 0x3a2e28, wallEdge: 0x8a705e, wallDark: 0x231b18,
    amb: [0.6, 0.55, 0.56], lamp: 0xffc890, accent: 0xff8a3a,
  },
  cryo: {
    floor: [0x2c3644, 0x293240], seam: 0x1e2632, bolt: 0x3a4658,
    wallTop: 0x8aa2bc, wallTop2: 0x7a92ac, wallFace: 0x4a5c74, wallEdge: 0xc8e0f0, wallDark: 0x2a3446,
    amb: [0.52, 0.58, 0.7], lamp: 0xb8e4ff, accent: 0x5ad8ff,
  },
  neon: {
    floor: [0x231c32, 0x201a2e], seam: 0x2e2244, bolt: 0x3a2c54,
    wallTop: 0x40345e, wallTop2: 0x382e54, wallFace: 0x241c38, wallEdge: 0xff4ab8, wallDark: 0x140f22,
    amb: [0.46, 0.42, 0.6], lamp: 0xff8ae0, accent: 0x3affe0,
  },
};

export const RANK_TINT = [0, 0xb8977a, 0x6a9cf0, 0xff7a4a, 0xc08aff, 0xffd040];

export class World {
  constructor(stage) {
    this.stage = stage;
    this.theme = THEMES[stage.theme];
    this.rows = stage.map;
    this.h = this.rows.length; this.w = this.rows[0].length;
    this.tiles = this.rows.map((r) => r.split(""));
    this.zone = new Uint8Array(this.w * this.h).fill(1);
    for (const z of stage.zones) for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) if (this.inside(x, y)) this.zone[y * this.w + x] = z.r;
    this.find = (ch) => { const out = []; this.tiles.forEach((r, y) => r.forEach((c, x) => { if (c === ch) out.push({ x, y }); })); return out; };
    this.start = this.find("P")[0]; this.exit = this.find("X")[0];
    this.lockers = this.find("H"); this.terminals = this.find("t");
    this.lasers = this.find("~");
    this.lamps = [];
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  at(x, y) { return this.inside(x, y) ? this.tiles[y][x] : "#"; }
  solidT(x, y) { return SOLID.has(this.at(x, y)); }
  opaqueT(x, y) { return OPAQUE.has(this.at(x, y)); }
  solidAt(px, py) { return this.solidT(Math.floor(px / TILE), Math.floor(py / TILE)); }
  zoneAt(px, py) { const x = Math.floor(px / TILE), y = Math.floor(py / TILE); return this.inside(x, y) ? this.zone[y * this.w + x] : 1; }
  // box at the feet: is it free?
  free(px, py, hw = 4, hh = 3) {
    return !(this.solidAt(px - hw, py - hh) || this.solidAt(px + hw, py - hh) || this.solidAt(px - hw, py + 1) || this.solidAt(px + hw, py + 1));
  }
  // line of sight between two points (px)
  los(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), n = Math.ceil(L / 3);
    for (let i = 1; i < n; i++) {
      const x = x0 + (dx * i) / n, y = y0 + (dy * i) / n;
      if (this.opaqueT(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
    }
    return true;
  }
  // distance a ray travels before hitting something opaque
  ray(x, y, a, max) {
    const cx = Math.cos(a) * 2, cy = Math.sin(a) * 2;
    for (let d = 0; d < max; d += 2) {
      x += cx; y += cy;
      if (this.opaqueT(Math.floor(x / TILE), Math.floor(y / TILE))) return d;
    }
    return max;
  }
  // BFS path in tiles -> array of px points (tile centres)
  path(sx, sy, tx, ty) {
    const W = this.w, H = this.h;
    const s = Math.floor(sy / TILE) * W + Math.floor(sx / TILE), t = Math.floor(ty / TILE) * W + Math.floor(tx / TILE);
    if (s === t) return [{ x: tx, y: ty }];
    const prev = new Int32Array(W * H).fill(-1); prev[s] = s;
    const q = [s]; let found = false;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi]; if (c === t) { found = true; break; }
      const cx = c % W, cy = (c / W) | 0;
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + ddx, ny = cy + ddy;
        if (!this.inside(nx, ny) || this.solidT(nx, ny)) continue;
        if (ddx && ddy && (this.solidT(cx + ddx, cy) || this.solidT(cx, cy + ddy))) continue;
        const ni = ny * W + nx; if (prev[ni] !== -1) continue;
        prev[ni] = c; q.push(ni);
      }
    }
    if (!found) return null;
    const out = []; let c = t;
    while (c !== s) { out.push({ x: (c % W) * TILE + 8, y: ((c / W) | 0) * TILE + 9 }); c = prev[c]; }
    out.reverse();
    out[out.length - 1] = { x: tx, y: ty };
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Tile art, drawn once into a canvas for the whole map.
  render() {
    const T = this.theme, W = this.w * TILE, H = this.h * TILE;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const img = g.createImageData(W, H), d = img.data;
    const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255; };
    const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
    const R = new Rng(this.stage.seed || 5);
    const isWall = (x, y) => this.at(x, y) === "#";
    for (let ty = 0; ty < this.h; ty++) for (let tx = 0; tx < this.w; tx++) {
      const ch = this.at(tx, ty), X = tx * TILE, Y = ty * TILE;
      const z = this.zone[ty * this.w + tx];
      // floor under everything
      let fl = T.floor[(tx + ty) & 1];
      if (z > 1) fl = mix(fl, RANK_TINT[z], 0.07);
      rect(X, Y, 16, 16, fl);
      for (let i = 0; i < 16; i++) { put(X + i, Y + 15, T.seam); put(X + 15, Y + i, T.seam); }
      put(X + 2, Y + 2, T.bolt); put(X + 13, Y + 2, T.bolt); put(X + 2, Y + 13, T.bolt); put(X + 13, Y + 13, T.bolt);
      if (R.next() < 0.25) { const sx = X + R.int(3, 11), sy = Y + R.int(3, 11); put(sx, sy, mix(fl, 0x000000, 0.25)); put(sx + 1, sy, mix(fl, 0x000000, 0.15)); }
      // zone border hazard stripes in the zone's rank colour
      if (!isWall(tx, ty)) {
        const zc = RANK_TINT[z];
        const border = (nx, ny) => this.inside(nx, ny) && !isWall(nx, ny) && this.zone[ny * this.w + nx] < z;
        if (z > 1) {
          if (border(tx, ty - 1)) for (let i = 0; i < 16; i++) put(X + i, Y, (i >> 1) & 1 ? zc : mix(zc, 0x000000, 0.5));
          if (border(tx, ty + 1)) for (let i = 0; i < 16; i++) put(X + i, Y + 15, (i >> 1) & 1 ? zc : mix(zc, 0x000000, 0.5));
          if (border(tx - 1, ty)) for (let i = 0; i < 16; i++) put(X, Y + i, (i >> 1) & 1 ? zc : mix(zc, 0x000000, 0.5));
          if (border(tx + 1, ty)) for (let i = 0; i < 16; i++) put(X + 15, Y + i, (i >> 1) & 1 ? zc : mix(zc, 0x000000, 0.5));
        }
      }
      switch (ch) {
        case "#": {
          const below = isWall(tx, ty + 1);
          rect(X, Y, 16, 16, T.wallTop);
          for (let i = 0; i < 16; i += 4) rect(X + i, Y + ((tx + i) % 8 === 0 ? 4 : 10), 1, 3, T.wallTop2);
          if (!isWall(tx, ty - 1)) for (let i = 0; i < 16; i++) put(X + i, Y, T.wallEdge);
          if (!isWall(tx - 1, ty)) for (let i = 0; i < 16; i++) put(X, Y + i, mix(T.wallTop, T.wallEdge, 0.4));
          if (!isWall(tx + 1, ty)) for (let i = 0; i < 16; i++) put(X + 15, Y + i, T.wallTop2);
          if (!below) { // front face
            rect(X, Y + 9, 16, 7, T.wallFace);
            for (let i = 0; i < 16; i++) { put(X + i, Y + 9, T.wallDark); put(X + i, Y + 15, T.wallDark); }
            for (let i = 2; i < 16; i += 5) rect(X + i, Y + 11, 2, 2, mix(T.wallFace, T.wallEdge, 0.25));
          }
          break;
        }
        case "D": { // doorway: rails and a rank light
          const zc = RANK_TINT[z];
          const vert = isWall(tx, ty - 1) && isWall(tx, ty + 1);
          if (vert) { rect(X, Y, 2, 16, T.wallFace); rect(X + 14, Y, 2, 16, T.wallFace); rect(X + 2, Y + 7, 12, 2, mix(fl, zc, 0.35)); }
          else { rect(X, Y, 16, 2, T.wallFace); rect(X, Y + 14, 16, 2, T.wallFace); rect(X + 7, Y + 2, 2, 12, mix(fl, zc, 0.35)); }
          break;
        }
        case "m": { // molten pit: dark crust, glowing cracks, hot only in the seams
          for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
            const wx = X + i, wy = Y + j;
            const v = Math.abs(Math.sin(wx * 0.37 + Math.sin(wy * 0.21) * 2.2) + Math.sin(wy * 0.43 - wx * 0.12));
            const c = v < 0.12 ? 0xffb04a : v < 0.3 ? 0xd0441a : v < 0.55 ? 0x6a1a0c : (wx * 7 + wy * 13) % 11 === 0 ? 0x4a2418 : 0x2e1410;
            put(wx, wy, c);
          }
          if (this.at(tx, ty - 1) !== "m") { for (let i = 0; i < 16; i++) { put(X + i, Y, 0x1a100c); put(X + i, Y + 1, 0x3a2a20); } }
          if (this.at(tx - 1, ty) !== "m") for (let j = 0; j < 16; j++) put(X, Y + j, 0x3a2a20);
          if (this.at(tx + 1, ty) !== "m") for (let j = 0; j < 16; j++) put(X + 15, Y + j, 0x1a100c);
          break;
        }
        case "=": { // conveyor (animated stripes are drawn live)
          rect(X, Y + 2, 16, 12, 0x2a2420); for (let i = 0; i < 16; i++) { put(X + i, Y + 2, 0x5a4a40); put(X + i, Y + 13, 0x1a1412); }
          break;
        }
        case "o": { // crate
          rect(X + 1, Y + 1, 14, 14, mix(T.wallFace, 0x6a5030, 0.5)); rect(X + 1, Y + 1, 14, 3, mix(T.wallTop, 0x8a6a40, 0.5));
          for (let i = 1; i < 15; i++) { put(X + i, Y + 15, T.wallDark); put(X + i, Y + 8, T.wallDark); }
          put(X + 3, Y + 6, T.wallEdge); put(X + 12, Y + 6, T.wallEdge); put(X + 3, Y + 11, T.wallEdge); put(X + 12, Y + 11, T.wallEdge);
          break;
        }
        case "H": { // locker
          rect(X + 2, Y, 12, 16, 0x3a4450); rect(X + 2, Y, 12, 2, 0x6a7888);
          for (let j = 4; j < 9; j += 2) rect(X + 4, Y + j, 8, 1, 0x22282e);
          rect(X + 11, Y + 9, 1, 3, 0xa0b0c0); for (let i = 2; i < 14; i++) put(X + i, Y + 15, 0x1a1e24);
          put(X + 7, Y + 0, 0x8af8f0);
          break;
        }
        case "k": { // cryo tank
          rect(X + 1, Y + 2, 14, 14, 0x1c3a5a); rect(X + 3, Y + 3, 10, 11, 0x3a8ac8); rect(X + 4, Y + 4, 2, 9, 0xaee4ff);
          rect(X + 1, Y, 14, 3, 0x8aa2bc); rect(X + 1, Y + 14, 14, 2, 0x4a5c74);
          break;
        }
        case "t": { // terminal
          rect(X + 2, Y + 3, 12, 12, 0x2a2e3a); rect(X + 3, Y + 4, 10, 6, 0x0c3a2a); rect(X + 4, Y + 5, 6, 1, 0x3affa0); rect(X + 4, Y + 7, 4, 1, 0x3affa0);
          for (let i = 2; i < 14; i++) put(X + i, Y + 15, 0x111);
          break;
        }
        case "h": { // hologram projector
          rect(X + 3, Y + 9, 10, 6, 0x2a2240); rect(X + 4, Y + 9, 8, 1, 0xff4ab8); rect(X + 6, Y + 11, 4, 2, 0x3affe0);
          break;
        }
        case "X": { // extraction pad
          for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const dx = i - 7.5, dy = j - 7.5, r = Math.hypot(dx, dy); if (r < 7.5 && r > 5.5) put(X + i, Y + j, 0x2a6a74); else if (r < 2) put(X + i, Y + j, 0x1a4a54); }
          break;
        }
      }
    }
    g.putImageData(img, 0, 0);
    this.canvas = cv;
    return cv;
  }

  // static light: lamps and glowing things -> three Float32 arrays covering the whole map
  bakeLights() {
    const W = this.w * TILE, H = this.h * TILE, T = this.theme;
    const L = [new Float32Array(W * H), new Float32Array(W * H), new Float32Array(W * H)];
    const add = (cx, cy, r, c, k) => {
      const cr = ((c >> 16) & 255) / 255, cg = ((c >> 8) & 255) / 255, cb = (c & 255) / 255;
      for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, Math.ceil(cy + r)); y++)
        for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, Math.ceil(cx + r)); x++) {
          const d = Math.hypot(x - cx, y - cy) / r; if (d >= 1) continue;
          const f = (1 - d) * (1 - d) * k, i = y * W + x;
          L[0][i] += cr * f; L[1][i] += cg * f; L[2][i] += cb * f;
        }
    };
    // ceiling lamps on a loose grid of open floor
    for (let ty = 1; ty < this.h - 1; ty++) for (let tx = 1; tx < this.w - 1; tx++) {
      if ((tx % 6 === 3) && (ty % 5 === 2) && !this.solidT(tx, ty)) { add(tx * TILE + 8, ty * TILE + 8, 56, T.lamp, 0.42); this.lamps.push({ x: tx * TILE + 8, y: ty * TILE + 8 }); }
      const ch = this.at(tx, ty);
      if (ch === "m") add(tx * TILE + 8, ty * TILE + 8, 40, 0xff6a20, 0.5);
      if (ch === "k") add(tx * TILE + 8, ty * TILE + 8, 36, 0x5ab8ff, 0.45);
      if (ch === "h") add(tx * TILE + 8, ty * TILE + 4, 40, 0xff4ab8, 0.45);
      if (ch === "t") add(tx * TILE + 8, ty * TILE + 8, 22, 0x3affa0, 0.35);
      if (ch === "X") add(tx * TILE + 8, ty * TILE + 8, 30, 0x3ae8ff, 0.4);
    }
    this.light = L; this.lw = W; this.lh = H;
    return L;
  }
}
