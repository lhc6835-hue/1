// Bundle the game into one self-contained HTML file (JS modules, CSS and fonts inlined). No dependencies.
// usage: node tools/bundle.mjs [out.html]
import fs from "fs";
import path from "path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = process.argv[2] || path.join(root, "dist/scrap-spy.html");
const mods = new Map(); // abs path -> { id, code }
const order = [];

function load(abs) {
  if (mods.has(abs)) return mods.get(abs).id;
  const id = path.relative(root, abs);
  mods.set(abs, { id });
  let src = fs.readFileSync(abs, "utf8");
  const exports = [];
  const dep = (spec) => load(path.resolve(path.dirname(abs), spec));
  // imports
  src = src.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+"([^"]+)";?/gm, (_, n, s) => `const ${n} = __m(${JSON.stringify(dep(s))});`);
  src = src.replace(/^import\s+\{([^}]+)\}\s+from\s+"([^"]+)";?/gm, (_, names, s) =>
    `const { ${names.split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\s+as\s+/, ": ")).join(", ")} } = __m(${JSON.stringify(dep(s))});`);
  // dynamic import of a module we bundle
  src = src.replace(/import\("([^"]+)"\)/g, (_, s) => `Promise.resolve(__m(${JSON.stringify(dep(s))}))`);
  // exports
  src = src.replace(/^export\s+\{([^}]+)\};?/gm, (_, names) => { names.split(",").map((x) => x.trim()).filter(Boolean).forEach((n) => exports.push(n)); return ""; });
  // `export const a = 1, b = 2;` declares several names: collect every one at bracket depth 0
  src = src.replace(/^export\s+(const|let|var)\s+(.*)$/gm, (_, kw, rest) => {
    let depth = 0, start = 0;
    const parts = [];
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if ("([{".includes(ch)) depth++; else if (")]}".includes(ch)) depth--;
      else if (ch === "," && depth === 0) { parts.push(rest.slice(start, i)); start = i + 1; }
    }
    parts.push(rest.slice(start));
    for (const part of parts) { const m = part.match(/^\s*(\w+)\s*=/); if (m) exports.push(m[1]); }
    return `${kw} ${rest}`;
  });
  src = src.replace(/^export\s+(async\s+function|function|class)\s+(\w+)/gm, (_, kw, n) => { exports.push(n); return `${kw} ${n}`; });
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(`unhandled import/export in ${id}`);
  const getters = exports.map((n) => `${JSON.stringify(n)}: { get: () => ${n}, enumerable: true }`).join(", ");
  mods.get(abs).code = `__d(${JSON.stringify(id)}, (__x) => {\n${src}\nObject.defineProperties(__x, { ${getters} });\n});`;
  order.push(abs);
  return id;
}

load(path.join(root, "src/main.js"));
const entry = "src/main.js";

// CSS with fonts as data URIs
let css = fs.readFileSync(path.join(root, "style.css"), "utf8");
css = css.replace(/url\("([^"]+\.woff2)"\)/g, (_, f) => `url("data:font/woff2;base64,${fs.readFileSync(path.join(root, f)).toString("base64")}")`);

const runtime = `const __defs = {}, __cache = {};
function __d(id, fn) { __defs[id] = fn; }
function __m(id) { if (!__cache[id]) { const x = {}; __cache[id] = x; __defs[id](x); } return __cache[id]; }`;
// modules must be defined before the entry runs; order[] is dependency-first
const js = [runtime, ...order.map((a) => mods.get(a).code), `__m(${JSON.stringify(entry)});`].join("\n\n");

let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace(/<link rel="stylesheet" href="style.css">/, () => `<style>\n${css}\n</style>`);
html = html.replace(/<script type="module" src="src\/main.js"><\/script>/, () => `<script>\n"use strict";\n${js.replace(/<\/script>/g, "<\\/script>")}\n</script>`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${order.length} modules)`);
