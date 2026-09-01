import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(repoRoot, "packages", "zotero-plugin");
const required = ["manifest.json", "bootstrap.js", "content/citebridge.js"];

for (const file of required) {
  await fs.access(path.join(root, file));
}

if (process.argv.includes("--check-only")) {
  process.exit(0);
}

const outputName = process.argv.find((arg) => arg.endsWith(".xpi")) ?? "citebridge-zotero-0.2.1.xpi";
const output = path.join(repoRoot, outputName);
const staging = path.join(repoRoot, ".tmp-zotero-xpi");
await fs.rm(output, { force: true });
await fs.rm(staging, { recursive: true, force: true });
await fs.mkdir(staging, { recursive: true });
await fs.copyFile(path.join(root, "manifest.json"), path.join(staging, "manifest.json"));
await fs.copyFile(path.join(root, "bootstrap.js"), path.join(staging, "bootstrap.js"));
await fs.cp(path.join(root, "content"), path.join(staging, "content"), { recursive: true });
await fs.cp(path.join(root, "locale"), path.join(staging, "locale"), { recursive: true });

const pythonScript = [
  "import os, zipfile",
  "root = r'''%STAGING%'''",
  "out = r'''%OUTPUT%'''",
  "with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as z:",
  "    files = []",
  "    for dirpath, _, filenames in os.walk(root):",
  "        for name in filenames:",
  "            full = os.path.join(dirpath, name)",
  "            rel = os.path.relpath(full, root).replace(os.sep, '/')",
  "            files.append((rel, full))",
  "    files.sort(key=lambda item: (item[0] != 'manifest.json', item[0]))",
  "    for rel, full in files:",
  "        z.write(full, rel)"
]
  .join("\n")
  .replace("%STAGING%", staging)
  .replace("%OUTPUT%", output);

const result = spawnSync("python", ["-c", pythonScript], { stdio: "inherit" });
await fs.rm(staging, { recursive: true, force: true });
process.exit(result.status ?? 0);
