// Builds every NetsuCast icon from icon-design/netsucast-app-icon.svg (transparent, cropped to
// the drawing), at every size.
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

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(root, "extension", "icons", `${size}.png`), render(full, size));
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
