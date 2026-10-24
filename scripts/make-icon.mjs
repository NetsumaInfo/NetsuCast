// Builds every NetsuCast icon from the sources in icon-design/:
//   netsucast-app-icon.svg        the app icon (1024, full bleed)
//   netsucast-app-icon-small.svg  the same, cropped to the mascot, for 16 and 32 px
// Writes extension/icons/*.png and runs `tauri icon` for src-tauri/icons/.
//
//   node scripts/make-icon.mjs
import { Resvg } from "@resvg/resvg-js";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const svg = (name) => readFileSync(join(root, "icon-design", name), "utf8");
const render = (source, size) => new Resvg(source, { fitTo: { mode: "width", value: size } }).render().asPng();

const full = svg("netsucast-app-icon.svg");
const small = svg("netsucast-app-icon-small.svg");

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(root, "extension", "icons", `${size}.png`), render(size <= 32 ? small : full, size));
}

const dir = mkdtempSync(join(tmpdir(), "netsucast-icon-"));
try {
  const png = join(dir, "icon.png");
  writeFileSync(png, render(full, 1024));
  execSync(`pnpm tauri icon "${png}" -o src-tauri/icons`, { cwd: root, stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
// Desktop only: drop what `tauri icon` makes for mobile.
for (const extra of ["android", "ios"]) rmSync(join(root, "src-tauri", "icons", extra), { recursive: true, force: true });
