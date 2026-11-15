// Exercise the stealth systems and every stage, with screenshots.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import fs from "fs";
const out = "records/sys"; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message + "\n" + e.stack));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:8765/index.html");
await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(500);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const ev = (f, a) => page.evaluate(f, a);
// stage 1: walk into the guard wing as a rank-1 nobody
await ev(() => window.__game.start(0)); await page.waitForTimeout(400);
await ev(() => { const m = window.__game.mission(); m.p.x = 34 * 16 + 8; m.p.y = 16 * 16 + 10; m.cam.x = m.p.x; m.cam.y = m.p.y; });
for (let i = 0; i < 6; i++) { await page.waitForTimeout(500); await shot(`s1-illegal-${i}`); }
const st = await ev(() => { const m = window.__game.mission(); return { alarm: m.alarm, hp: m.p.hp, bolts: m.bolts.length, states: m.enemies.map((e) => e.state + ":" + e.sus.toFixed(2)) }; });
console.log(JSON.stringify(st));
// hide in a locker nearby
await ev(() => { const m = window.__game.mission(); m.p.x = 42 * 16 + 8 - 16; m.p.y = 22 * 16 + 10; });
await page.keyboard.press("KeyE"); await page.waitForTimeout(300); await shot("s1-hide");
console.log(await ev(() => { const m = window.__game.mission(); return { hidden: !!m.p.hidden, toast: m.toast }; }));
for (const i of [1, 2]) {
  await ev((i) => window.__game.start(i), i); await page.waitForTimeout(700); await shot(`stage${i + 1}-start`);
  await ev(() => { const m = window.__game.mission(); const t = m.enemies.find((e) => e.target); m.p.x = t.x - 40; m.p.y = t.y + 20; m.cam.x = m.p.x; m.cam.y = m.p.y; m.p.hidden = { x: -1, y: -1 }; });
  await page.waitForTimeout(700); await shot(`stage${i + 1}-target`);
}
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
