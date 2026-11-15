// Drive the game in a headless browser and take screenshots. usage: node tools/play.mjs <outdir> [script]
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const out = process.argv[2] || "records/play";
const script = process.argv[3] || "basic";
import fs from "fs";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message + "\n" + e.stack));
await page.goto("http://localhost:8765/index.html");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(800);
const shot = async (n) => page.screenshot({ path: `${out}/${n}.png` });
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
await shot("01-title");
await page.keyboard.press("Enter"); await page.waitForTimeout(300); await shot("02-hub");
await page.keyboard.press("Enter"); await page.waitForTimeout(300); await shot("03-brief");
await page.keyboard.press("Enter"); await page.waitForTimeout(700); await shot("04-play");
if (script === "basic") {
  await hold("KeyD", 500); await shot("05-move");
  await hold("KeyS", 300); await hold("KeyW", 900); await shot("06-up");
  await page.keyboard.press("ShiftLeft"); await page.waitForTimeout(60); await shot("07-dash");
}
if (script === "kill") {
  // walk toward the worker near the start and stab it
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => window.__dbg && window.__dbg());
    if (!s) break;
    if (s.victim) break;
    const dx = s.ex - s.px, dy = s.ey - s.py;
    const k = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "KeyD" : "KeyA") : (dy > 0 ? "KeyS" : "KeyW");
    await hold(k, 120);
  }
  await shot("05-near");
  await page.keyboard.press("Space");
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(45); await shot(`06-kill-${i}`); }
  await page.waitForTimeout(500); await shot("07-after");
  await page.keyboard.down("KeyE"); await page.waitForTimeout(400); await shot("08-tear"); await page.waitForTimeout(1800); await page.keyboard.up("KeyE");
  await page.waitForTimeout(200); await shot("09-picker");
  await page.keyboard.press("Digit1"); await page.waitForTimeout(120); await shot("10-equip"); await page.waitForTimeout(400); await shot("11-equip2");
}
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
