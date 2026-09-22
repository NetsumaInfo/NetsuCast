// Writes latest.json, the manifest the in-app updater reads from
// https://github.com/NetsumaInfo/NetsuCast/releases/latest/download/latest.json
//
//   node scripts/create-update-manifest.mjs [artifactDir] [output] [--notes-file <file>] [--dry-run]
//
// artifactDir defaults to src-tauri/target/release/bundle/nsis, output to <artifactDir>/latest.json.
// Release notes, first match wins: --notes-file, then the entry for this version in
// src/data/releases.json (when that file exists), then "NetsuCast <version>".
// The signature field holds the CONTENTS of the installer's .sig, never a link to it: regenerate
// the .sig after any Authenticode signing, before running this (docs/code-signing.md).
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    "Usage: node scripts/create-update-manifest.mjs [artifactDir] [output] [--notes-file <file>] [--dry-run]\n" +
      "Writes the updater manifest (latest.json) for the NSIS installer of the current package.json version.",
  );
  process.exit(0);
}
const dryRun = args.includes("--dry-run");
const notesIndex = args.indexOf("--notes-file");
const notesFile = notesIndex >= 0 ? args[notesIndex + 1] : undefined;
const positional = args.filter((arg, i) => !arg.startsWith("--") && !(notesIndex >= 0 && i === notesIndex + 1));

const root = process.cwd();
const artifactDir = path.resolve(positional[0] || path.join(root, "src-tauri", "target", "release", "bundle", "nsis"));
const output = path.resolve(positional[1] || path.join(artifactDir, "latest.json"));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

// Same shapes as NetsuBoard's release history: classified `changes`, or a flat `highlights` list.
async function releaseEntry() {
  const file = path.join(root, "src", "data", "releases.json");
  if (!(await exists(file))) return undefined;
  const releases = JSON.parse(await readFile(file, "utf8"));
  return Array.isArray(releases) ? releases.find((entry) => entry.version === pkg.version) : undefined;
}

const release = await releaseEntry();
const notes =
  (notesFile && (await readFile(path.resolve(notesFile), "utf8")).trim()) ||
  release?.changes?.map((change) => change.fr ?? change.en).join("\n") ||
  release?.highlights?.fr?.join("\n") ||
  `NetsuCast ${pkg.version}`;

const repository = process.env.GITHUB_REPOSITORY || "NetsumaInfo/NetsuCast";
// The release tag is always v<version>: a manual workflow run from a branch must not point the
// updater at `.../download/main/...`.
const tag = `v${pkg.version}`;

let installer;
let signature;
if (await exists(artifactDir)) {
  const files = await readdir(artifactDir);
  installer = files.find((name) => name.endsWith("-setup.exe") && name.includes(`_${pkg.version}_`));
}
if (installer) {
  const signaturePath = path.join(artifactDir, `${installer}.sig`);
  signature = (await exists(signaturePath)) ? (await readFile(signaturePath, "utf8")).trim() : "";
  if (!signature && !dryRun) throw new Error(`Signature vide ou absente : ${signaturePath}`);
} else if (!dryRun) {
  throw new Error(`Installateur updater NSIS ${pkg.version} introuvable dans ${artifactDir}`);
}

const installerName = installer || `NetsuCast_${pkg.version}_x64-setup.exe`;
const manifest = {
  version: pkg.version,
  notes,
  pub_date: release?.date ? new Date(`${release.date}T00:00:00Z`).toISOString() : new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: signature || "<signature>",
      url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(installerName)}`,
    },
  },
};

if (dryRun) {
  console.log(JSON.stringify(manifest, null, 2));
  if (!installer) console.warn(`(dry run) aucun installateur ${pkg.version} dans ${artifactDir}`);
} else {
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Manifest updater prêt : ${output}`);
}
