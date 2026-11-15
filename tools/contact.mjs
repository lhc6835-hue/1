// Render contact sheets of effects or robots to PNG so they can be looked at and judged.
// usage: node tools/contact.mjs <out.png> "<query string>"     (needs a static server on :8765 at the repo root)
// e.g.   node tools/contact.mjs records/stab.png "fx=stab&victim=guard"
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [out, query] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(`http://localhost:8765/tools/fxlab.html?${query}`);
await page.waitForFunction(() => document.title === "done", null, { timeout: 15000 });
await page.locator("#c").screenshot({ path: out });
await browser.close();
console.log("wrote", out);
