// Converts the NetsuRush palettes to NetsuCast tokens (hex), derives the roles NetsuRush does not
// have, and moves the lightness of each text role until it passes on every surface it sits on.
// Prints the [data-theme] blocks pasted at the end of src/index.css, and the contrast table on
// stderr:  node scripts/make-themes.mjs > themes.css
const P = {
  midnight: { mode: "dark", bg: "#000000", surface: "#07080a", raised: "#101216", line: "#22262d", ink: "#f1f3f5", muted: "#9ba2ad", accent: "#5b8ef7", accentInk: "#ffffff", danger: "#f05252", success: "#18b982", warning: "#e2a849" },
  blue: { mode: "dark", bg: "oklch(0.190 0.022 258)", surface: "oklch(0.165 0.018 258)", raised: "oklch(0.235 0.020 255)", line: "oklch(0.285 0.018 255)", ink: "oklch(0.900 0.006 240)", muted: "oklch(0.620 0.018 248)", accent: "oklch(0.660 0.095 245)", accentInk: "oklch(0.165 0.018 258)", danger: "oklch(0.719 0.169 13.428)", success: "oklch(0.696 0.150 154)", warning: "oklch(0.770 0.130 75)" },
  graphite: { mode: "dark", bg: "oklch(0.175 0 0)", surface: "oklch(0.215 0 0)", raised: "oklch(0.265 0 0)", line: "oklch(0.325 0 0)", ink: "oklch(0.925 0 0)", muted: "oklch(0.700 0 0)", accent: "oklch(0.720 0.075 240)", accentInk: "oklch(0.175 0 0)", danger: "oklch(0.640 0.180 25)", success: "oklch(0.700 0.140 155)", warning: "oklch(0.760 0.130 80)" },
  forest: { mode: "dark", bg: "oklch(0.190 0.022 160)", surface: "oklch(0.225 0.024 160)", raised: "oklch(0.275 0.026 160)", line: "oklch(0.340 0.028 160)", ink: "oklch(0.930 0.010 155)", muted: "oklch(0.700 0.020 158)", accent: "oklch(0.740 0.140 158)", accentInk: "oklch(0.190 0.030 160)", danger: "oklch(0.650 0.180 25)", success: "oklch(0.740 0.140 158)", warning: "oklch(0.770 0.130 80)" },
  ember: { mode: "dark", bg: "oklch(0.180 0.014 45)", surface: "oklch(0.218 0.016 42)", raised: "oklch(0.268 0.018 40)", line: "oklch(0.335 0.020 40)", ink: "oklch(0.930 0.010 60)", muted: "oklch(0.705 0.018 50)", accent: "oklch(0.760 0.140 62)", accentInk: "oklch(0.180 0.020 45)", danger: "oklch(0.645 0.185 25)", success: "oklch(0.720 0.140 155)", warning: "oklch(0.780 0.130 80)" },
  plum: { mode: "dark", bg: "oklch(0.185 0.028 305)", surface: "oklch(0.222 0.032 305)", raised: "oklch(0.272 0.036 303)", line: "oklch(0.340 0.038 302)", ink: "oklch(0.930 0.012 300)", muted: "oklch(0.705 0.024 300)", accent: "oklch(0.740 0.130 305)", accentInk: "oklch(0.185 0.030 305)", danger: "oklch(0.650 0.180 25)", success: "oklch(0.720 0.140 155)", warning: "oklch(0.780 0.130 80)" },
  contrast: { mode: "dark", bg: "oklch(0 0 0)", surface: "oklch(0.145 0 0)", raised: "oklch(0.215 0 0)", line: "oklch(0.560 0 0)", ink: "oklch(1 0 0)", muted: "oklch(0.800 0 0)", accent: "oklch(0.800 0.100 235)", accentInk: "oklch(0 0 0)", danger: "oklch(0.700 0.170 25)", success: "oklch(0.800 0.170 150)", warning: "oklch(0.850 0.160 85)" },
  light: { mode: "light", bg: "#f4f6f9", surface: "#ffffff", raised: "#e9edf3", line: "#ccd3dd", ink: "#171a20", muted: "#5e6673", accent: "#2f65c8", accentInk: "#ffffff", danger: "#c93442", success: "#087a55", warning: "#946000" },
  "soft-light": { mode: "light", bg: "#e8edf3", surface: "#f7f9fc", raised: "#dde4ec", line: "#bdc8d4", ink: "#20252c", muted: "#5d6876", accent: "#356aa9", accentInk: "#ffffff", danger: "#bd3846", success: "#147657", warning: "#8c5c00" },
  paper: { mode: "light", bg: "oklch(0.930 0.022 78)", surface: "oklch(0.962 0.016 80)", raised: "oklch(0.885 0.026 76)", line: "oklch(0.815 0.030 74)", ink: "oklch(0.255 0.020 60)", muted: "oklch(0.470 0.024 62)", accent: "oklch(0.520 0.110 45)", accentInk: "oklch(0.985 0.005 85)", danger: "oklch(0.505 0.170 26)", success: "oklch(0.470 0.100 155)", warning: "oklch(0.520 0.110 75)" },
};

// --- colour maths --------------------------------------------------------------------------
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklchToRgb(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => Math.min(1, Math.max(0, toSrgb(v))));
}
function rgbToOklch([r, g, b]) {
  const [R, G, B] = [r, g, b].map(toLin);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360];
}
function parse(c) {
  if (c.startsWith("#")) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const [L, C, H] = c.match(/[\d.]+/g).map(Number);
  return oklchToRgb(L, C, H || 0);
}
const hex = (rgb) => "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
const lum = (rgb) => { const [r, g, b] = rgb.map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
const lift = (c, d) => { const [L, C, H] = rgbToOklch(c); return round(oklchToRgb(L + d, C, H)); };
const round = (rgb) => parse(hex(rgb));
/** Moves the lightness of `c` (away from `bgs`) until it reaches `need` on every background. */
function tune(c, bgs, need, dir) {
  let [L, C, H] = rgbToOklch(c);
  for (let i = 0; i < 200; i++) {
    const rgb = round(oklchToRgb(L, C, H));
    if (bgs.every((bg) => ratio(rgb, bg) >= need)) return rgb;
    L += dir * 0.005;
    if (L > 1 || L < 0) break;
  }
  throw new Error("cannot tune " + hex(c));
}

// --- derive --------------------------------------------------------------------------------
const out = [], table = [];
const VIDEO = ['page:#0a0d13','surface:#11151d','raised:#181d27','overlay:#1d2330','ink:#e7eaf0','ink-muted:#9aa4b5','ink-faint:#7d889c','line:#222836','line-strong:#5e6a80','danger:#f2767a','warning:#e8b452','success:#4fc98e'].map((x) => { const [k, v] = x.split(':'); return `--color-${k}: ${v};`; }).join(String.fromCharCode(10) + "  ");
for (const [id, p] of Object.entries(P)) {
  const c = Object.fromEntries(Object.entries(p).filter(([k]) => k !== "mode").map(([k, v]) => [k, round(parse(v))]));
  const dark = p.mode === "dark";
  const away = dark ? 1 : -1;
  const t = {};
  t.page = c.bg; t.surface = c.surface; t.raised = c.raised;
  t.overlay = dark ? lift(c.raised, 0.03) : c.surface;
  t.line = c.line;
  t.ink = c.ink;
  const texBgs = [t.page, t.surface, t.raised, t.overlay];
  t["ink-muted"] = tune(c.muted, texBgs, 4.6, away);
  t["ink-faint"] = tune(round(mix(c.muted, t.surface, 0.25)), [t.surface, t.raised], 4.5, away);
  t["line-strong"] = tune(t.line, [t.surface, t.page], 3.05, away);
  t.accent = c.accent;
  t["accent-ink"] = c.accentInk;
  if (ratio(t["accent-ink"], t.accent) < 4.5) t.accent = tune(t.accent, [t["accent-ink"]], 4.5, lum(t["accent-ink"]) > 0.5 ? -1 : 1);
  // Hover moves away from the ink, so the ink keeps its contrast.
  t["accent-hover"] = round(mix(t.accent, lum(t["accent-ink"]) > 0.5 ? [0, 0, 0] : [1, 1, 1], 0.08));
  t["accent-text"] = tune(c.accent, texBgs, 4.6, away);
  for (const k of ["danger", "warning", "success"]) t[k] = tune(c[k], [t.page, t.surface, t.raised], 4.6, away);
  const vars = Object.entries(t).map(([k, v]) => `  --color-${k}: ${hex(v)};`).join("\n");
  out.push(`[data-theme="${id}"] {\n${vars}\n  color-scheme: ${p.mode};\n}`);
  if (!dark) {
    const videoBgs = ["#0a0d13", "#11151d", "#181d27", "#1d2330"].map(parse);
    const at = tune(c.accent, videoBgs, 4.6, 1);
    out.push(`[data-theme="${id}"] .on-video {\n  ${VIDEO}\n  --color-accent-text: ${hex(at)};\n  color-scheme: dark;\n}`);
    table.push(`${id} on-video accentText ${videoBgs.map((b) => ratio(at, b).toFixed(2)).join("/")}`);
  }
  const pairs = { "ink/raised": [t.ink, t.raised], "muted/overlay": [t["ink-muted"], t.overlay], "faint/raised": [t["ink-faint"], t.raised], "lineStrong/surface": [t["line-strong"], t.surface], "accentInk/accent": [t["accent-ink"], t.accent], "accentInk/hover": [t["accent-ink"], t["accent-hover"]], "accentText/raised": [t["accent-text"], t.raised], "danger/surface": [t.danger, t.surface], "warning/raised": [t.warning, t.raised], "success/raised": [t.success, t.raised] };
  table.push(id.padEnd(11) + Object.entries(pairs).map(([k, [a, b]]) => `${k} ${ratio(a, b).toFixed(2)}`).join(" | "));
}
console.log(out.join("\n\n"));
console.error(table.join("\n"));
