// Three enemy bases, each with its own concept. Maps are assembled from walls, doors and props.
// Legend: # wall, . floor, D door, = conveyor, m molten pit, k cryo tank, o crate/desk, H locker (hide),
//         t terminal (cameras off), h hologram, ~ laser gate, P start, X extraction.

function build(w, h, fn) {
  const g = Array.from({ length: h }, () => Array(w).fill("."));
  const api = {
    put: (x, y, c) => { g[y][x] = c; },
    fill: (x, y, ww, hh, c) => { for (let j = y; j < y + hh; j++) for (let i = x; i < x + ww; i++) g[j][i] = c; },
    vwall: (x, y0, y1) => { for (let y = y0; y <= y1; y++) g[y][x] = "#"; },
    hwall: (y, x0, x1) => { for (let x = x0; x <= x1; x++) g[y][x] = "#"; },
    many: (c, pts) => pts.forEach(([x, y]) => (g[y][x] = c)),
  };
  api.fill(0, 0, w, 1, "#"); api.fill(0, h - 1, w, 1, "#"); api.fill(0, 0, 1, h, "#"); api.fill(w - 1, 0, 1, h, "#");
  fn(api);
  return g.map((r) => r.join(""));
}

const W = (x, y, wait = 1.2, look = null) => ({ x, y, wait, look });

export const STAGES = [
  {
    id: "foundry", theme: "foundry", seed: 11,
    name: "녹슨 주조 공장", sub: "STAGE 1 · 폐차장 외곽",
    brief: "용광로와 컨베이어가 쉴 새 없이 돌아가는 고철 공장이에요. 작업 드론들 사이에 섞여 들어가, 보안동을 오가는 공장 감독관을 처리하세요.",
    tip: "경비 로봇 부품 2개를 달면 계급 2가 돼서 파란 구역(보안동)을 당당하게 걸어다닐 수 있어요.",
    map: build(44, 28, ({ put, fill, vwall, hwall, many }) => {
      vwall(11, 1, 26); put(11, 5, "D"); put(11, 22, "D");
      vwall(31, 1, 26); put(31, 4, "D"); put(31, 15, "D"); put(31, 23, "D");
      hwall(18, 1, 10); put(5, 18, "D");
      hwall(11, 32, 42); put(37, 11, "D");
      fill(13, 3, 17, 1, "="); fill(13, 14, 17, 1, "="); fill(13, 24, 17, 1, "=");
      fill(14, 8, 3, 3, "m"); fill(24, 8, 4, 3, "m"); fill(18, 18, 4, 3, "m");
      many("o", [[20, 5], [21, 5], [13, 12], [28, 17], [15, 21], [27, 21], [22, 11], [4, 8], [5, 8], [7, 13], [3, 15], [8, 20], [8, 21], [35, 14], [36, 14], [40, 19], [34, 22], [39, 24], [34, 3], [40, 7], [37, 4], [38, 4]]);
      many("H", [[29, 1], [12, 26], [30, 12], [12, 9], [1, 3], [10, 15], [10, 26], [42, 13], [32, 25], [42, 22], [42, 2], [32, 9]]);
      put(3, 24, "P"); put(2, 20, "X");
    }),
    zones: [{ x: 32, y: 1, w: 11, h: 11, r: 3 }, { x: 31, y: 4, w: 1, h: 1, r: 3 }, { x: 32, y: 12, w: 11, h: 15, r: 2 }, { x: 31, y: 15, w: 1, h: 1, r: 2 }, { x: 31, y: 23, w: 1, h: 1, r: 2 }],
    enemies: [
      { type: "worker", path: [W(6, 20, 1.5), W(6, 25, 1.5)] },
      { type: "worker", path: [W(13, 6), W(29, 6)] },
      { type: "worker", path: [W(13, 16), W(29, 16), W(29, 22), W(13, 22)] },
      { type: "worker", path: [W(3, 5), W(9, 5), W(9, 12), W(3, 12)] },
      { type: "worker", path: [W(14, 26, 2), W(29, 26, 2)] },
      { type: "worker", path: [W(16, 1, 2), W(26, 1, 2)] },
      { type: "guard", path: [W(33, 13), W(41, 13)] },
      { type: "guard", path: [W(34, 17), W(41, 17), W(41, 25), W(36, 25)] },
      { type: "guard", path: [W(25, 12, 2), W(25, 20, 2)] },
      { type: "guard", path: [W(37, 13, 4, [-Math.PI / 2, Math.PI / 2])] },
      { type: "overseer", target: true, path: [W(36, 6, 2), W(41, 9, 1.5), W(37, 9, 0.5), W(37, 16, 2.5), W(34, 20, 2), W(37, 16, 0.3), W(37, 9, 0.3)] },
    ],
    cameras: [],
  },
  {
    id: "cryo", theme: "cryo", seed: 23,
    name: "극지 냉동 연구소", sub: "STAGE 2 · 빙하 아래",
    brief: "영하의 연구소예요. 복도에는 감시 카메라가 돌고, 보안 센트리가 연구원들을 지켜요. 핵심 연구실의 수석 연구원을 처리하세요.",
    tip: "초록 단말기를 길게 조작하면 잠시 카메라가 꺼져요. 수석 연구원은 가끔 보안동(주황 구역)에 들러요.",
    map: build(46, 30, ({ put, fill, vwall, hwall, many }) => {
      vwall(17, 1, 28); put(17, 6, "D"); put(17, 18, "D"); put(17, 26, "D");
      vwall(28, 11, 28); put(28, 16, "D"); put(28, 26, "D");
      hwall(11, 18, 44); put(22, 11, "D"); put(38, 11, "D");
      hwall(23, 18, 27); put(22, 23, "D");
      hwall(14, 1, 16); put(5, 14, "D"); put(12, 14, "D");
      many("k", [[3, 3], [3, 5], [3, 7], [7, 3], [7, 5], [7, 7], [11, 3], [11, 5], [11, 7], [4, 18], [8, 18], [12, 18], [4, 23], [8, 23], [12, 23], [22, 4], [22, 7], [27, 4], [27, 7], [32, 4], [32, 7], [37, 4], [37, 7], [42, 5]]);
      many("o", [[20, 15], [25, 19], [31, 14], [32, 14], [36, 20], [41, 24], [42, 24], [33, 25], [14, 10], [2, 26], [24, 26]]);
      many("H", [[1, 10], [16, 20], [18, 21], [27, 13], [44, 13], [29, 22], [44, 27], [18, 9], [44, 1], [1, 28], [16, 12]]);
      many("t", [[8, 1], [43, 18]]);
      put(22, 27, "P"); put(20, 26, "X");
    }),
    zones: [{ x: 1, y: 1, w: 16, h: 28, r: 2 }, { x: 17, y: 6, w: 1, h: 1, r: 4 }, { x: 18, y: 12, w: 10, h: 11, r: 2 }, { x: 17, y: 18, w: 1, h: 1, r: 2 }, { x: 29, y: 12, w: 16, h: 17, r: 3 }, { x: 28, y: 16, w: 1, h: 1, r: 3 }, { x: 28, y: 26, w: 1, h: 1, r: 3 }, { x: 18, y: 1, w: 27, h: 11, r: 4 }],
    enemies: [
      { type: "scientist", path: [W(5, 2), W(5, 9), W(9, 9), W(9, 2)] },
      { type: "scientist", path: [W(13, 2, 2), W(13, 12, 2)] },
      { type: "scientist", path: [W(2, 16), W(15, 16), W(15, 21), W(2, 21)] },
      { type: "scientist", path: [W(6, 25, 2), W(14, 25, 2)] },
      { type: "scientist", path: [W(20, 13, 1.5), W(26, 21, 1.5)] },
      { type: "sentry", path: [W(22, 13, 4, [Math.PI / 2, 0, Math.PI])] },
      { type: "sentry", path: [W(30, 13), W(43, 13), W(43, 16), W(30, 16)] },
      { type: "sentry", path: [W(31, 19), W(42, 21), W(36, 27), W(30, 24)] },
      { type: "sentry", path: [W(38, 13, 3, [-Math.PI / 2, Math.PI])] },
      { type: "scientist", path: [W(25, 2), W(35, 2), W(35, 9), W(25, 9)] },
      { type: "sentry", path: [W(19, 2, 2), W(19, 9, 2)] },
      { type: "chief", target: true, path: [W(30, 5, 2.5), W(40, 2, 2), W(43, 9, 1.5), W(38, 10, 0.3), W(36, 17, 3), W(33, 20, 2), W(38, 10, 0.3), W(30, 9, 2)] },
    ],
    cameras: [
      { x: 18.2, y: 12.2, a: 0.8, sweep: 0.7, period: 5 },
      { x: 27.8, y: 22.8, a: -2.3, sweep: 0.7, period: 6 },
      { x: 18.2, y: 1.2, a: 0.6, sweep: 0.6, period: 6 },
      { x: 44.8, y: 10.8, a: -2.5, sweep: 0.6, period: 5 },
    ],
  },
  {
    id: "neon", theme: "neon", seed: 37,
    name: "네온 사령탑", sub: "STAGE 3 · 적 본부 최상층",
    brief: "적군의 심장부예요. 홀로그램이 번쩍이는 사령탑 꼭대기 지휘실에 총사령관이 있어요. 레이저 게이트는 계급이 모자라면 경보를 울려요.",
    tip: "레이저 게이트는 깜빡여요. 꺼진 틈을 노리거나, 계급을 올려서 당당하게 지나가세요.",
    map: build(48, 32, ({ put, fill, vwall, hwall, many }) => {
      vwall(23, 1, 30); put(23, 8, "~"); put(23, 20, "D"); put(23, 27, "D");
      hwall(16, 24, 46); put(30, 16, "~"); put(40, 16, "D");
      hwall(23, 1, 22); put(5, 23, "D"); put(16, 23, "D");
      vwall(12, 1, 10); put(12, 5, "D");
      hwall(11, 1, 11); put(6, 11, "D");
      many("o", [[3, 3], [4, 3], [8, 3], [9, 3], [3, 7], [4, 7], [8, 7], [9, 7], [15, 3], [16, 3], [19, 3], [20, 3], [15, 8], [16, 8], [19, 8], [20, 8], [4, 15], [5, 15], [10, 18], [11, 18], [17, 14], [18, 14], [8, 27], [27, 20], [28, 20], [33, 24], [34, 24], [41, 20], [42, 26], [43, 26], [30, 4], [31, 4], [38, 4], [39, 4]]);
      many("h", [[14, 13], [20, 19], [34, 9], [44, 6], [2, 19]]);
      many("H", [[1, 1], [22, 1], [1, 13], [22, 15], [11, 21], [24, 17], [46, 17], [24, 30], [46, 30], [24, 1], [46, 14], [9, 30]]);
      many("t", [[1, 9], [46, 24]]);
      put(4, 28, "P"); put(2, 26, "X");
    }),
    zones: [{ x: 1, y: 1, w: 22, h: 22, r: 3 }, { x: 5, y: 23, w: 1, h: 1, r: 3 }, { x: 16, y: 23, w: 1, h: 1, r: 3 }, { x: 24, y: 17, w: 23, h: 14, r: 4 }, { x: 23, y: 20, w: 1, h: 1, r: 4 }, { x: 23, y: 27, w: 1, h: 1, r: 4 }, { x: 24, y: 1, w: 23, h: 16, r: 5 }, { x: 23, y: 8, w: 1, h: 1, r: 5 }],
    enemies: [
      { type: "officer", path: [W(7, 25, 2), W(14, 29, 2)] },
      { type: "officer", path: [W(2, 2), W(10, 2), W(10, 9), W(2, 9)] },
      { type: "officer", path: [W(14, 2), W(21, 2), W(21, 10), W(14, 10)] },
      { type: "officer", path: [W(3, 13), W(20, 13), W(20, 21), W(3, 21)] },
      { type: "officer", path: [W(8, 17, 3), W(15, 17, 3)] },
      { type: "elite", path: [W(25, 18), W(45, 18), W(45, 29), W(25, 29)] },
      { type: "elite", path: [W(30, 22, 2), W(38, 28, 2)] },
      { type: "elite", path: [W(40, 17, 4, [Math.PI / 2, 0, Math.PI])] },
      { type: "elite", path: [W(25, 9, 3, [0, Math.PI / 2])] },
      { type: "elite", path: [W(27, 2), W(45, 2), W(45, 12), W(27, 12)] },
      { type: "commander", target: true, path: [W(35, 6, 3), W(44, 4, 2), W(44, 12, 2), W(40, 14, 0.3), W(36, 21, 3), W(44, 24, 2), W(40, 18, 0.3), W(40, 14, 0.3), W(31, 12, 2)] },
    ],
    cameras: [
      { x: 24.2, y: 1.2, a: 0.7, sweep: 0.6, period: 6 },
      { x: 46.8, y: 15.8, a: -2.4, sweep: 0.6, period: 5 },
      { x: 24.2, y: 17.2, a: 0.7, sweep: 0.7, period: 6 },
      { x: 46.8, y: 30.8, a: -2.4, sweep: 0.6, period: 7 },
      { x: 22.8, y: 1.2, a: 2.3, sweep: 0.6, period: 6 },
    ],
  },
];
