#!/usr/bin/env node
/**
 * CI guard: fails if any legacy "Zenwork" references remain.
 *
 * Scans the repo (excluding build output, dependencies, lockfiles, and this
 * file itself) for the case-insensitive term "zenwork". Any match exits 1
 * so the build breaks.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const TERM = "zenwork";
const EXCLUDES = [
  "node_modules",
  "dist",
  ".wrangler",
  ".output",
  ".vercel",
  ".netlify",
  "build",
  ".git",
  "bun.lockb",
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "src/routeTree.gen.ts",
  "scripts/check-no-zenwork.mjs",
  "tests/unit/no-zenwork.test.ts",
];

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8", cwd: process.cwd() });
}

// Prefer ripgrep; fall back to grep -r.
const hasRg = run("sh", ["-c", "command -v rg"]).stdout.trim().length > 0;

let matches = "";
if (hasRg) {
  const args = ["-n", "-i", "--hidden", "--no-messages", TERM];
  for (const ex of EXCLUDES) args.push("-g", `!${ex}`);
  args.push(".");
  const out = run("rg", args);
  matches = out.stdout;
} else {
  const excludeArgs = EXCLUDES.flatMap((e) =>
    existsSync(path.join(process.cwd(), e))
      ? ["--exclude-dir=" + e, "--exclude=" + e]
      : [],
  );
  const out = run("grep", ["-rniI", ...excludeArgs, TERM, "."]);
  matches = out.stdout
    .split("\n")
    .filter((l) => !EXCLUDES.some((e) => l.includes(`/${e}/`) || l.startsWith(`./${e}`)))
    .join("\n");
}

const lines = matches.split("\n").filter(Boolean);
if (lines.length > 0) {
  const inGithub = process.env.GITHUB_ACTIONS === "true";
  console.error(
    `\n✖ Rebrand guard failed — found ${lines.length} residual "${TERM}" reference(s):\n`,
  );
  for (const l of lines) {
    console.error("  " + l);
    if (inGithub) {
      // Parse "./path/to/file:LINE:content" (rg) or "path:LINE:content" (grep).
      const m = l.match(/^\.?\/?([^:]+):(\d+):(.*)$/);
      if (m) {
        const [, file, line, content] = m;
        const msg = `Legacy "${TERM}" reference found: ${content.trim()}`
          .replace(/%/g, "%25")
          .replace(/\r/g, "%0D")
          .replace(/\n/g, "%0A");
        console.log(`::error file=${file},line=${line}::${msg}`);
      }
    }
  }
  console.error(
    `\nRemove or replace every occurrence with the QualiPulse brand before merging.\n`,
  );
  process.exit(1);
}

console.log(`✓ Rebrand guard passed — no "${TERM}" references found.`);
