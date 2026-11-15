import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import fs from "fs";
const out = "records/alarm"; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message + "\n" + e.stack));
await page.goto("http://localhost:8765/index.html");
await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(400);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => window.__game.start(0)); await page.waitForTimeout(300);
// stand in front of the stationary guard at the office door (zone 2, player rank 1)
await ev(() => { const m = window.__game.mission(); const g = m.enemies[9]; m.p.x = g.x; m.p.y = g.y + 30; m.cam.x = m.p.x; m.cam.y = m.p.y; g.face = Math.PI / 2; g.path[0].look = [Math.PI / 2]; });
const log = [];
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(250);
  const s = await ev(() => { const m = window.__game.mission(); const g = m.enemies[9]; return `${g.state} sus=${g.sus.toFixed(2)} sees=${g.seesP} alarm=${m.alarm.blown}/${m.alarm.t.toFixed(1)} hp=${m.p.hp} bolts=${m.bolts.length}`; });
  log.push(s);
  if (i % 3 === 1) await page.screenshot({ path: `${out}/a-${i}.png` });
}
console.log(log.join("\n"));
// run away and hide
await ev(() => { const m = window.__game.mission(); m.p.x = 42 * 16 + 8 - 16; m.p.y = 22 * 16 + 10; m.p.inv = 5; });
await page.waitForTimeout(100);
await page.keyboard.press("KeyE");
await page.waitForTimeout(200);
console.log(await ev(() => { const m = window.__game.mission(); return "hidden=" + !!m.p.hidden + " toast=" + m.toast; }));
for (let i = 0; i < 6; i++) { await page.waitForTimeout(1000); console.log(await ev(() => { const m = window.__game.mission(); return `t=${m.time.toFixed(1)} blown=${m.alarm.blown} lost=${m.alarm.lostT.toFixed(1)} alarmT=${m.alarm.t.toFixed(1)} toast=${m.toast}`; })); }
await page.screenshot({ path: `${out}/hidden.png` });
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
