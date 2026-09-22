// Checks the translations: every locale has exactly the keys of the French source, every key the
// code uses exists, and every key the source defines is used. Same for the extension's
// _locales. Exits 1 on any problem.
//
//   node scripts/check-i18n.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
let problems = 0;
const fail = (msg) => {
  problems++;
  console.error(`✗ ${msg}`);
};

function flatten(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
}

function placeholders(text) {
  return [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(",");
}

function walk(dir, ext) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "locales" ? [] : walk(path, ext);
    return ext.some((e) => name.endsWith(e)) ? [path] : [];
  });
}

// --- app (src/locales, i18next) ------------------------------------------------------------------
const localeDir = join(root, "src", "locales");
const source = new Map(flatten(JSON.parse(readFileSync(join(localeDir, "fr.json"), "utf8"))));

for (const file of readdirSync(localeDir).filter((f) => f.endsWith(".json") && f !== "fr.json")) {
  const entries = new Map(flatten(JSON.parse(readFileSync(join(localeDir, file), "utf8"))));
  for (const key of source.keys()) {
    if (!entries.has(key)) fail(`${file}: missing ${key}`);
    else if (placeholders(entries.get(key)) !== placeholders(source.get(key))) fail(`${file}: placeholders differ in ${key}`);
  }
  for (const key of entries.keys()) if (!source.has(key)) fail(`${file}: extra key ${key}`);
}

const code = walk(join(root, "src"), [".ts", ".tsx"]).map((f) => readFileSync(f, "utf8")).join("\n");
const used = new Set([...code.matchAll(/\bt\(\s*["'`]([\w.]+)["'`]/g)].map((m) => m[1]));
// Keys kept in lookup tables (SECTION_KEY…) and passed to t() later.
for (const [, key] of code.matchAll(/["'`]([a-z]+\.[\w.]+)["'`]/g)) if (source.has(key)) used.add(key);
// Keys built at run time: models.<model>, scale.<scale>[Short].
for (const key of source.keys()) if (/^(models|scale)\./.test(key)) used.add(key);
for (const key of used) if (!source.has(key)) fail(`src uses unknown key ${key}`);
for (const key of source.keys()) if (!used.has(key)) fail(`fr.json key never used: ${key}`);

// --- extension (_locales, chrome.i18n) -----------------------------------------------------------
const extDir = join(root, "extension", "_locales");
let extSource;
try {
  extSource = JSON.parse(readFileSync(join(extDir, "fr", "messages.json"), "utf8"));
} catch {
  extSource = null;
}
if (extSource) {
  for (const lang of readdirSync(extDir).filter((d) => d !== "fr")) {
    const messages = JSON.parse(readFileSync(join(extDir, lang, "messages.json"), "utf8"));
    for (const key of Object.keys(extSource)) if (!messages[key]) fail(`extension ${lang}: missing ${key}`);
    for (const key of Object.keys(messages)) if (!extSource[key]) fail(`extension ${lang}: extra key ${key}`);
  }
}

console.log(problems ? `${problems} problem(s)` : "i18n OK");
process.exit(problems ? 1 : 0);
