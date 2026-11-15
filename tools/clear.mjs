// Full stage clear: assassinate the target, extract, see results and the hub.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import fs from "fs";
const out = "records/clear"; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message + "\n" + e.stack));
await page.goto("http://localhost:8765/index.html");
await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(400);
const ev = (f, a) => page.evaluate(f, a);
const stage = +(process.argv[2] || 0);
await ev((s) => window.__game.start(s), stage); await page.waitForTimeout(300);
// sneak up behind the target
await ev(() => { const m = window.__game.mission(); const t = m.enemies.find((e) => e.target); for (const e of m.enemies) if (!e.target) e.face = -Math.PI / 2; m.p.x = t.x - Math.cos(t.face) * 12; m.p.y = t.y - Math.sin(t.face) * 12; m.cam.x = m.p.x; m.cam.y = m.p.y; t.state = "wait"; t.timer = 99; });
await page.waitForTimeout(150);
await page.keyboard.press("Space");
for (let i = 0; i < 10; i++) { await page.waitForTimeout(70); await page.screenshot({ path: `${out}/k${i}.png` }); }
await page.waitForTimeout(800);
console.log(await ev(() => { const m = window.__game.mission(); return `targetDead=${m.targetDead} toast=${m.toast} earned=${m.earned}`; }));
await ev(() => { const m = window.__game.mission(); const X = m.world.exit; m.p.x = X.x * 16 + 8; m.p.y = X.y * 16 + 6; m.cam.x = m.p.x; m.cam.y = m.p.y; });
for (let i = 0; i < 6; i++) { await page.waitForTimeout(160); await page.screenshot({ path: `${out}/x${i}.png` }); }
await page.waitForTimeout(2600);
await page.screenshot({ path: `${out}/result.png` });
await page.keyboard.press("Enter"); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/hub.png` });
console.log(JSON.stringify(await ev(() => window.__game.save())));
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
