#!/usr/bin/env node
/**
 * CI guard: fails if any legacy "Zenwork" references remain.
 *
 * Scans the repo (excluding build output, dependencies, lockfiles, and this
 * file itself) for the case-insensitive term "zenwork". Any match exits 1
 * so the build breaks.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
  "scripts/check-rebrand.mjs",
  "tests/unit/rebrand-guard.test.ts",
  ".github/workflows/rebrand-guard.yml",
  "rebrand-guard-report",
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
  const header = `✖ Rebrand guard failed — found ${lines.length} residual "${TERM}" reference(s):`;
  console.error("\n" + header + "\n");

  const annotations = [];
  for (const l of lines) {
    console.error("  " + l);
    // Parse "./path/to/file:LINE:content" (rg) or "path:LINE:content" (grep).
    const m = l.match(/^\.?\/?([^:]+):(\d+):(.*)$/);
    if (m) {
      const [, file, line, content] = m;
      annotations.push({ file, line: Number(line), content: content.trim() });
      if (inGithub) {
        const msg = `Legacy "${TERM}" reference found: ${content.trim()}`
          .replace(/%/g, "%25")
          .replace(/\r/g, "%0D")
          .replace(/\n/g, "%0A");
        console.log(`::error file=${file},line=${line}::${msg}`);
      }
    }
  }

  // Write full report to disk so CI can upload it as an artifact.
  const outDir = "rebrand-guard-report";
  mkdirSync(outDir, { recursive: true });
  const summary = {
    term: TERM,
    total_matches: lines.length,
    generated_at: new Date().toISOString(),
    matches: annotations,
  };
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(summary, null, 2));
  writeFileSync(
    path.join(outDir, "report.txt"),
    header + "\n\n" + lines.join("\n") + "\n",
  );

  console.error(
    `\nFull report written to ${outDir}/report.txt and ${outDir}/report.json.`,
  );
  console.error(
    `Remove or replace every occurrence with the QualiPulse brand before merging.\n`,
  );
  process.exit(1);
}

console.log(`✓ Rebrand guard passed — no "${TERM}" references found.`);
