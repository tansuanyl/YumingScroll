import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const bundleDir = resolve(root, ".next/static");
const checks = [
  { label: "OpenAI-compatible API key", pattern: /sk-[A-Za-z0-9_-]{16,}/g },
  {
    label: "public provider key env name",
    pattern: /\b(?:NEXT_PUBLIC|VITE)_(?:OPENAI|MOONSHOT|SEEDANCE)[A-Z0-9_]*(?:KEY|TOKEN)[A-Z0-9_]*\b/g
  },
  {
    label: "server provider key env name in client bundle",
    pattern: /\b(?:OPENAI|MOONSHOT|SEEDANCE)_API_KEY\b/g
  }
];

if (!existsSync(bundleDir)) {
  console.error("Missing .next/static. Run `npm run build` before verifying browser bundle secrets.");
  process.exit(1);
}

const findings = [];

for (const file of walk(bundleDir)) {
  if (!isTextLike(file)) continue;

  const content = readFileSync(file, "utf8");
  for (const check of checks) {
    const matches = content.match(check.pattern);
    if (!matches) continue;

    findings.push({
      file: relative(root, file),
      label: check.label,
      matches: [...new Set(matches)].slice(0, 5)
    });
  }
}

if (findings.length > 0) {
  console.error("Potential provider secret exposure found in browser bundle:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.label} (${finding.matches.join(", ")})`);
  }
  process.exit(1);
}

console.log("No provider keys or provider key env names found in .next/static browser bundle.");

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      yield* walk(path);
    } else if (stats.isFile()) {
      yield path;
    }
  }
}

function isTextLike(file) {
  return /\.(?:js|mjs|cjs|css|html|json|map|txt|svg)$/i.test(file);
}
