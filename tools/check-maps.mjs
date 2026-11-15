// Validate the stage maps: size, start/exit, everything reachable, waypoints on free tiles.
import { STAGES } from "../src/game/stages.js";
const SOLID = new Set(["#", "m", "k", "o", "H", "t", "h"]);
let bad = 0;
for (const s of STAGES) {
  const g = s.map, h = g.length, w = g[0].length;
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? g[y][x] : "#");
  if (g.some((r) => r.length !== w)) { console.log(s.id, "ragged rows"); bad++; }
  let P, X; g.forEach((r, y) => [...r].forEach((c, x) => { if (c === "P") P = [x, y]; if (c === "X") X = [x, y]; }));
  const seen = new Set([P.join()]), q = [P];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + "," + ny; if (!seen.has(k) && !SOLID.has(at(nx, ny))) { seen.add(k); q.push([nx, ny]); } } }
  const unreachable = [];
  g.forEach((r, y) => [...r].forEach((c, x) => { if (!SOLID.has(c) && !seen.has(x + "," + y)) unreachable.push([x, y]); }));
  if (unreachable.length) { console.log(s.id, "unreachable floor:", JSON.stringify(unreachable.slice(0, 20))); bad++; }
  // interactables need a free neighbour
  g.forEach((r, y) => [...r].forEach((c, x) => { if ("Ht".includes(c) && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(x + dx + "," + (y + dy)))) { console.log(s.id, "inaccessible", c, x, y); bad++; } }));
  s.enemies.forEach((e, i) => e.path.forEach((p) => { if (SOLID.has(at(p.x, p.y)) || !seen.has(p.x + "," + p.y)) { console.log(s.id, "enemy", i, e.type, "bad waypoint", p.x, p.y, at(p.x, p.y)); bad++; } }));
  console.log(s.id, `${w}x${h}`, "P", P, "X", X, "enemies", s.enemies.length);
  console.log(g.join("\n"));
}
process.exit(bad ? 1 : 0);
