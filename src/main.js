// App shell: screens (title, hub, briefing, mission, picker, results), input, scaling, saving.
import { Mission, VW, VH, LW, LH, UPGRADES, deriveStats } from "./game/mission.js";
import { STAGES } from "./game/stages.js";
import { SLOTS, SLOT_NAME, RANK_NAME, partFromId, robotSprites, statLine, SW, SH } from "./game/parts.js";
import { RANK_TINT } from "./game/world.js";
import { initAudio, sfx, siren } from "./engine/audio.js";

const $ = (s) => document.querySelector(s);
const screen = $("#screen"), sctx = screen.getContext("2d");
const low = document.createElement("canvas"); low.width = LW; low.height = LH;
const lctx = low.getContext("2d", { willReadFrequently: true });
const ui = $("#ui"), hud = $("#hud");
const hex = (c) => "#" + c.toString(16).padStart(6, "0");

// ---------------------------------------------------------------------------------------------------
// save
const SAVE_KEY = "scrap-spy-save-v1";
const fresh = () => ({ unlocked: 0, cleared: [], credits: 0, equipped: { head: "worker.head", core: "worker.core", arm: "worker.arm", legs: "worker.legs" }, storage: [], upgrades: {}, best: {} });
let save = fresh();
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.equipped) save = { ...fresh(), ...s }; } catch {}
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} };

// ---------------------------------------------------------------------------------------------------
// input
const keys = new Set(), hit = new Set();
const input = { down: (k) => keys.has(k), pressed: (k) => hit.has(k) };
addEventListener("keydown", (e) => {
  initAudio();
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) hit.add(e.code);
  keys.add(e.code);
  onKey(e);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
addEventListener("pointerdown", () => initAudio());

// ---------------------------------------------------------------------------------------------------
// scaling: integer pixel scale when possible
let S = 3;
function fit() {
  const s = Math.min(innerWidth / VW, innerHeight / VH);
  S = s >= 2 ? Math.floor(s) : s;
  screen.width = Math.round(VW * S); screen.height = Math.round(VH * S);
  $("#stage").style.width = screen.width + "px"; $("#stage").style.height = screen.height + "px";
  document.documentElement.style.setProperty("--s", S);
}
addEventListener("resize", fit); fit();

// ---------------------------------------------------------------------------------------------------
// state
let mode = "title", mission = null, selStage = Math.min(save.unlocked, STAGES.length - 1), selSlot = null, picker = null;

function setUI(html) { ui.innerHTML = html; }
function title() {
  mode = "title"; hud.hidden = true; mission = null; siren(false);
  setUI(`<div class="screen title">
    <div class="en">S C R A P &nbsp; S P Y</div>
    <h1>스크랩 스파이</h1>
    <p class="story">나는 적군 로봇 군단에 숨어든 최하급 작업 드론이에요.<br>적을 한 방에 해치우고, 뜯어낸 부품을 내 몸에 달아 계급을 올리세요.<br>단, 절대 들키면 안 돼요.</p>
    <div class="keys">
      <span><span class="key">WASD</span> 이동</span><span><span class="key">Shift</span> 대시</span>
      <span><span class="key">Space</span> 암살</span><span><span class="key">E</span> 숨기 · 해체 · 해킹</span>
      <span><span class="key">Esc</span> 일시정지</span><span><span class="key">M</span> 소리 끄기</span>
    </div>
    <div class="row"><button id="go">시작하기</button>${save.cleared.length || save.credits ? `<button class="ghost" id="reset">처음부터</button>` : ""}</div>
  </div>`);
  $("#go").onclick = () => { initAudio(); sfx.click(); hub(); };
  const r = $("#reset"); if (r) r.onclick = () => { if (confirm("저장된 진행을 지우고 처음부터 할까요?")) { save = fresh(); persist(); selStage = 0; title(); } };
}

function pipStr(n, c) { return `<span class="pips" style="color:${hex(RANK_TINT[n])}">${"▲".repeat(n)}</span>`; }

function robotCanvas(robot, scale, f = 0) {
  const S2 = robotSprites(robot), c = document.createElement("canvas");
  c.width = SW * scale; c.height = SH * scale;
  const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(S2.frames[f][0], 0, 0, c.width, c.height);
  return c;
}

function hub() {
  mode = "hub"; hud.hidden = true; mission = null; siren(false);
  const eq = Object.fromEntries(SLOTS.map((s) => [s, partFromId(save.equipped[s])]));
  const st = deriveStats(eq, save.upgrades);
  const storeFor = (slot) => save.storage.map((id, i) => ({ p: partFromId(id), i })).filter((o) => o.p.slot === slot);
  setUI(`<div class="screen hub">
    <div class="hub-head"><h2>비밀 아지트</h2><span class="credits">◆ ${save.credits} 크레딧</span></div>
    <div class="hub-grid">
      <div class="panel">
        <h3>내 로봇 · 위장 계급</h3>
        <div class="robot"><div id="rbox"></div>
          <div>
            <div style="font-size:calc(var(--s)*6px);color:${hex(RANK_TINT[st.rank])}">${RANK_NAME[st.rank]} ${pipStr(st.rank)}</div>
            <div class="muted">부품 평균 계급 ${st.avg.toFixed(2)}${st.odd ? ` · <span style="color:var(--orange)">어색한 조합</span>` : ""}</div>
            <div class="muted">내구도 ${st.maxHp} · 속도 ${st.speed} · 은신 ${Math.round(st.stealth * 100)}% · 암살 거리 ${st.reach}</div>
          </div>
        </div>
        <div class="slots">${SLOTS.map((s) => `<div class="slot ${selSlot === s ? "sel" : ""}" data-slot="${s}"><span class="sl">${SLOT_NAME[s]}</span><span>${eq[s].name} ${pipStr(eq[s].rank)}<br><small class="muted">${statLine(eq[s])}</small></span><span class="muted">${storeFor(s).length ? `보관 ${storeFor(s).length}` : ""}</span></div>`).join("")}</div>
        ${selSlot ? `<div class="store">${storeFor(selSlot).length ? storeFor(selSlot).map((o) => `<button data-store="${o.i}">${o.p.name} ${"▲".repeat(o.p.rank)}</button>`).join("") : `<span class="muted">보관함에 ${SLOT_NAME[selSlot]} 부품이 없어요</span>`}</div>` : `<div class="muted" style="margin-top:calc(var(--s)*2px);font-size:calc(var(--s)*3.4px)">부품 칸을 누르면 보관함 부품으로 바꿔 달 수 있어요</div>`}
      </div>
      <div class="panel">
        <h3>업그레이드</h3>
        <div class="ups">${UPGRADES.map((u) => { const lv = save.upgrades[u.id] || 0, cost = u.cost[lv]; return `<div class="up"><span>${u.name} <span class="lv">${"■".repeat(lv)}${"□".repeat(u.max - lv)}</span></span><button data-up="${u.id}" ${lv >= u.max || save.credits < cost ? "disabled" : ""}>${lv >= u.max ? "최대" : `◆${cost}`}</button><small>${u.desc}</small></div>`; }).join("")}</div>
      </div>
    </div>
    <div class="missions">${STAGES.map((s, i) => `<div class="mission ${i > save.unlocked ? "locked" : ""} ${i === selStage ? "sel" : ""}" data-stage="${i}"><span class="muted">${s.sub}</span><b>${s.name}</b>${save.cleared.includes(i) ? `<span class="done">완료${save.best[i]?.ghost ? " · 유령" : ""}</span>` : i > save.unlocked ? "잠김" : "작전 가능"}</div>`).join("")}</div>
    <div class="row"><button id="launch">출격 ▶</button><button class="ghost" id="back">타이틀</button></div>
  </div>`);
  $("#rbox").appendChild(robotCanvas(eq, Math.max(3, Math.round(S * 1.6))));
  ui.querySelectorAll("[data-slot]").forEach((el) => (el.onclick = () => { sfx.click(); selSlot = selSlot === el.dataset.slot ? null : el.dataset.slot; hub(); }));
  ui.querySelectorAll("[data-store]").forEach((el) => (el.onclick = () => {
    const i = +el.dataset.store, part = partFromId(save.storage[i]);
    save.storage.splice(i, 1, save.equipped[part.slot]);
    save.equipped[part.slot] = part.id; persist(); sfx.equip(); hub();
  }));
  ui.querySelectorAll("[data-up]").forEach((el) => (el.onclick = () => {
    const u = UPGRADES.find((x) => x.id === el.dataset.up), lv = save.upgrades[u.id] || 0;
    if (lv >= u.max || save.credits < u.cost[lv]) return;
    save.credits -= u.cost[lv]; save.upgrades[u.id] = lv + 1; persist(); sfx.rankUp(); hub();
  }));
  ui.querySelectorAll("[data-stage]").forEach((el) => (el.onclick = () => { const i = +el.dataset.stage; if (i <= save.unlocked) { selStage = i; sfx.click(); hub(); } }));
  $("#launch").onclick = () => { sfx.click(); briefing(selStage); };
  $("#back").onclick = () => { sfx.click(); title(); };
}

function briefing(i) {
  mode = "brief"; const s = STAGES[i];
  setUI(`<div class="screen">
    <span class="muted">${s.sub}</span><h2>${s.name}</h2>
    <p class="brief">${s.brief}</p>
    <p class="brief tip">TIP · ${s.tip}</p>
    <div class="row"><button id="start">잠입 시작 (Enter)</button><button class="ghost" id="back">아지트</button></div>
  </div>`);
  $("#start").onclick = () => start(i);
  $("#back").onclick = () => hub();
}

function start(i) {
  initAudio(); sfx.click();
  mode = "play"; setUI(""); hud.hidden = false;
  mission = new Mission(i, save, {
    onPicker: openPicker,
    onEnd: (r) => results(r),
  });
}

// ---------------------------------------------------------------------------------------------------
// part picker after dismantling a wreck
function openPicker(robot, equipped, done) {
  mode = "picker";
  picker = { robot, equipped, done };
  const cards = SLOTS.map((s, i) => {
    const p = robot[s], cur = equipped[s], d = p.rank - cur.rank;
    return `<div class="card"><span class="slotname">${i + 1} · ${SLOT_NAME[s]}</span><div class="pc" data-i="${i}"></div><b>${p.name}</b>${pipStr(p.rank)}<span>${statLine(p)}</span>
      <span class="cmp">지금: ${cur.name} ${"▲".repeat(cur.rank)} ${d > 0 ? `<span class="up-arrow">▲${d}</span>` : d < 0 ? `<span class="down-arrow">▼${-d}</span>` : "="}</span>
      <div class="row"><button data-eq="${s}">장착</button><button class="ghost" data-st="${s}">보관</button></div></div>`;
  }).join("");
  setUI(`<div class="screen"><h2>부품 해체 완료</h2><span class="muted">하나만 챙길 수 있어요 · 숫자키 1~4 = 장착, Shift+숫자 = 보관, Esc = 버리기</span><div class="cards">${cards}</div></div>`);
  // tiny previews of the part on the spy
  ui.querySelectorAll(".pc").forEach((el) => {
    const s = SLOTS[+el.dataset.i];
    el.appendChild(robotCanvas({ ...equipped, [s]: robot[s] }, Math.max(2, Math.round(S * 1.1))));
  });
  ui.querySelectorAll("[data-eq]").forEach((el) => (el.onclick = () => closePicker({ part: robot[el.dataset.eq], mode: "equip" })));
  ui.querySelectorAll("[data-st]").forEach((el) => (el.onclick = () => closePicker({ part: robot[el.dataset.st], mode: "store" })));
}
function closePicker(choice) {
  if (!picker) return;
  const d = picker.done; picker = null; setUI(""); mode = "play"; d(choice);
}

// ---------------------------------------------------------------------------------------------------
function pause() {
  if (!mission) return;
  mode = "pause"; mission.paused = true; siren(false);
  setUI(`<div class="screen"><h2>일시정지</h2><div class="row"><button id="res">계속 (Esc)</button><button class="ghost" id="retry">다시 시작</button><button class="ghost" id="quit">작전 포기</button></div></div>`);
  $("#res").onclick = resume;
  $("#retry").onclick = () => start(mission.si);
  $("#quit").onclick = () => hub();
}
function resume() { mode = "play"; setUI(""); mission.paused = false; if (mission.alarm.t > 0) siren(true); }

function results(r) {
  mode = "results"; hud.hidden = true; siren(false);
  if (r.win) {
    save.credits += r.earned;
    save.equipped = r.equipped; save.storage = save.storage.concat(r.storage);
    if (!save.cleared.includes(r.stage)) save.cleared.push(r.stage);
    save.unlocked = Math.max(save.unlocked, Math.min(STAGES.length - 1, r.stage + 1));
    const b = save.best[r.stage] || {}; save.best[r.stage] = { ghost: b.ghost || r.ghost, time: Math.min(b.time || 1e9, r.time) };
    selStage = Math.min(STAGES.length - 1, r.stage + 1);
    persist();
  }
  const m = Math.floor(r.time / 60), s = Math.floor(r.time % 60).toString().padStart(2, "0");
  const last = r.win && r.stage === STAGES.length - 1;
  setUI(`<div class="screen">
    ${r.win ? `<div class="big-win">${last ? "작전 완수" : "임무 성공"}</div>` : `<div class="big-lose">임무 실패</div>`}
    ${last ? `<p class="brief">총사령관이 쓰러졌어요. 고철 더미에서 시작한 작업 드론이 적군 최고 계급의 부품을 두르고 사라졌어요.</p>` : ""}
    <div class="stats panel">
      <span>처치</span><span>${r.kills}</span>
      <span>들킴 없이</span><span>${r.ghost ? "유령 ★" : "아니요"}</span>
      <span>시간</span><span>${m}:${s}</span>
      <span>획득 크레딧</span><span>${r.win ? `◆ ${r.earned}` : "—"}</span>
    </div>
    ${r.win ? "" : `<span class="muted">실패하면 이번 작전에서 얻은 부품과 크레딧은 사라져요</span>`}
    <div class="row">${r.win ? `<button id="hub">아지트로 (Enter)</button>` : `<button id="retry">다시 도전 (Enter)</button><button class="ghost" id="hub">아지트로</button>`}</div>
  </div>`);
  $("#hub").onclick = () => hub();
  const rt = $("#retry"); if (rt) rt.onclick = () => start(r.stage);
}

// ---------------------------------------------------------------------------------------------------
function onKey(e) {
  if (e.code === "KeyM") { import("./engine/audio.js").then((a) => a.setMuted(!a.muted)); }
  if (mode === "title" && (e.code === "Enter" || e.code === "Space")) { sfx.click(); hub(); }
  else if (mode === "hub" && e.code === "Enter") briefing(selStage);
  else if (mode === "brief" && (e.code === "Enter" || e.code === "Space")) start(selStage);
  else if (mode === "brief" && e.code === "Escape") hub();
  else if (mode === "play" && e.code === "Escape") pause();
  else if (mode === "pause" && e.code === "Escape") resume();
  else if (mode === "results" && e.code === "Enter") { const b = $("#retry") || $("#hub"); b?.click(); }
  else if (mode === "picker") {
    const n = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(e.code);
    if (n >= 0) closePicker({ part: picker.robot[SLOTS[n]], mode: e.shiftKey ? "store" : "equip" });
    if (e.code === "Escape") closePicker(null);
  }
}

// ---------------------------------------------------------------------------------------------------
// HUD
let hudT = 0;
function updateHud() {
  const m = mission, p = m.p, st = p.st;
  $("#hp").innerHTML = Array.from({ length: st.maxHp }, (_, i) => `<i class="${i < p.hp ? "" : "off"}"></i>`).join("");
  $("#rank").innerHTML = `<b style="color:${hex(RANK_TINT[st.rank])}">${RANK_NAME[st.rank]} ${"▲".repeat(st.rank)}</b>${st.odd ? `<span class="odd">어색한 조합</span>` : ""}`;
  $("#parts").innerHTML = SLOTS.map((s) => `<span style="color:${hex(RANK_TINT[m.equipped[s].rank])}">${SLOT_NAME[s]}</span>`).join("");
  const A = m.alarm, al = $("#alarm");
  if (A.blown) { al.className = "on"; al.textContent = `경보 · 추적 중 ${A.lostT > 0 ? `(따돌리는 중 ${Math.max(0, 7 - A.lostT).toFixed(0)})` : ""}`; }
  else if (A.t > 0) { al.className = "wary"; al.textContent = `경계 태세 ${A.t.toFixed(0)}초`; }
  else if (m.camerasOff > 0) { al.className = "cam"; al.textContent = `카메라 정지 ${m.camerasOff.toFixed(0)}초`; }
  else al.className = "";
  $("#objective").textContent = m.targetDead ? "▶ 탈출 지점으로" : `▶ 목표: ${m.enemies.find((e) => e.target)?.robot && STAGES[m.si].enemies.find((e) => e.target) ? { overseer: "공장 감독관", chief: "수석 연구원", commander: "총사령관" }[STAGES[m.si].enemies.find((e) => e.target).type] : ""} 암살`;
  $("#earned").textContent = `◆ ${m.earned} · 처치 ${m.kills}`;
  const zone = m.world.zoneAt(p.x, p.y), z = $("#zone");
  z.className = zone > st.rank ? "bad" : "";
  z.innerHTML = `구역 <span style="color:${hex(RANK_TINT[zone])}">${"▲".repeat(zone)}</span> ${zone > st.rank ? "· 출입 금지 구역!" : "· 출입 허가"}`;
  $("#dash span").style.width = `${100 * (1 - p.dashCD / st.dashCD)}%`;
  const pr = $("#prompt");
  if (m.prompt && !p.hidden) { pr.className = "on" + (m.prompt.key === "Space" ? " kill" : ""); pr.innerHTML = `${m.prompt.key ? `<kbd>${m.prompt.key}</kbd>` : ""}${m.prompt.text}`; }
  else if (p.hidden) { pr.className = "on"; pr.innerHTML = `<kbd>E</kbd>사물함에서 나오기`; }
  else pr.className = "";
  const t = $("#toast"); t.textContent = m.toast; t.className = m.toastT > 0 ? "on" : "";
  const v = $("#vignette");
  v.className = A.blown ? "alarm" : zone > st.rank && !p.hidden ? "illegal" : "";
  v.style.opacity = m.hurtFlash > 0 ? Math.max(0.2, m.hurtFlash) : "";
}

// ---------------------------------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
  if (mission) {
    if (mode === "play") mission.update(dt, input);
    else mission.update(0, { down: () => false, pressed: () => false });
    mission.render(lctx);
    sctx.imageSmoothingEnabled = false;
    sctx.fillStyle = "#000"; sctx.fillRect(0, 0, screen.width, screen.height);
    const v = mission.view;
    sctx.drawImage(low, -v.fx * S, -v.fy * S, LW * S, LH * S);
    hudT -= dt; if (hudT <= 0 && !hud.hidden) { hudT = 1 / 20; updateHud(); }
  } else {
    drawBackdrop(now / 1000);
  }
  hit.clear();
  requestAnimationFrame(frame);
}

// title/hub backdrop: a slow pan over the first base
let backdrop = null;
function drawBackdrop(t) {
  if (!backdrop) backdrop = new Mission(Math.min(save.unlocked, STAGES.length - 1), save, { onPicker() {}, onEnd() {} });
  const b = backdrop;
  b.p.hidden = { x: -9, y: -9 };
  b.cam.x = b.world.w * 8 + Math.sin(t * 0.07) * b.world.w * 4; b.cam.y = b.world.h * 8 + Math.cos(t * 0.05) * b.world.h * 3;
  b.time += 1 / 60;
  for (const e of b.enemies) b.updateEnemy(e, 1 / 60);
  b.updateCameras(1 / 60);
  for (const f of b.fx) f.update(1 / 60); b.fx = b.fx.filter((f) => !f.done());
  b.amb.update(1 / 60); b.ambient(1 / 60);
  b.render(lctx);
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(low, -b.view.fx * S, -b.view.fy * S, LW * S, LH * S);
}

// test hook for automated play-testing
window.__dbg = () => {
  if (!mission) return null;
  const p = mission.p, alive = mission.enemies.filter((e) => e.state !== "dead" && e.state !== "dying");
  const e = alive.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  return { px: p.x, py: p.y, ex: e?.x, ey: e?.y, victim: !!mission.nearby().victim, mode };
};

title();
requestAnimationFrame(frame);
