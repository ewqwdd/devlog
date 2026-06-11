import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SOURCE_DIRS = [
  "app",
  "components",
  "hooks",
  "lib",
  "services",
  "use-cases",
  "shared",
  "e2e",
];
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
const BANNED = /@ts-(nocheck|ignore)\b/;

const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (!EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (BANNED.test(line))
        offenders.push(`${path}:${index + 1}: ${line.trim()}`);
    });
  }
}

for (const dir of SOURCE_DIRS) {
  try {
    statSync(dir);
  } catch {
    continue;
  }
  walk(dir);
}

if (offenders.length > 0) {
  console.error(`Banned TypeScript directives found:\n${offenders.join("\n")}`);
  process.exit(1);
}
