#!/usr/bin/env node
/**
 * CI guard: fails if any legacy "Zenwork" reference remains — including
 * common case variations, separator/spacing tricks (e.g. "Zen work",
 * "Zen-work"), zero-width character insertions, and visually similar
 * Unicode confusables (Cyrillic/Greek/fullwidth look-alikes).
 *
 * Strategy per line:
 *   1. Unicode-normalize (NFKD) to decompose accents/compat forms.
 *   2. Strip zero-width and combining marks.
 *   3. Map confusable code points for z/e/n/w/o/r/k to ASCII.
 *   4. Lowercase and search for /z[sep]*e[sep]*n[sep]*w[sep]*o[sep]*r[sep]*k/
 *      where [sep] is any whitespace or common separator punctuation.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const TERM_DISPLAY = "zenwork";

const EXCLUDES = new Set([
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
]);

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
  ".pdf", ".zip", ".gz", ".tgz", ".woff", ".woff2", ".ttf",
  ".otf", ".eot", ".mp3", ".mp4", ".mov", ".wasm", ".lockb",
  ".bin", ".exe",
]);

// Confusable → ASCII map. Keys are single code points; values are one ASCII char.
const CONFUSABLES = {
  // z
  "ᴢ": "z", "ｚ": "z", "ⱬ": "z", "ℤ": "z", "ʐ": "z", "ʑ": "z", "ƶ": "z",
  "ζ": "z", "ᙆ": "z",
  // e
  "е": "e", "ｅ": "e", "ε": "e", "ϵ": "e", "℮": "e", "ℯ": "e", "ə": "e", "ǝ": "e",
  "ҽ": "e", "ｅ": "e",
  // n
  "ｎ": "n", "ɴ": "n", "η": "n", "ⁿ": "n", "н": "n", "ռ": "n", "ｎ": "n",
  // w
  "ｗ": "w", "ω": "w", "ѡ": "w", "ա": "w", "ԝ": "w", "ẇ": "w", "ϖ": "w",
  // o
  "ｏ": "o", "о": "o", "ο": "o", "ө": "o", "ø": "o", "０": "o", "0": "o",
  "◯": "o", "○": "o", "〇": "o", "ᴏ": "o", "ⲟ": "o", "ჿ": "o",
  // r
  "ｒ": "r", "ʀ": "r", "ɾ": "r", "ⲅ": "r", "ᵣ": "r", "р": "r", "ꭇ": "r",
  // k
  "ｋ": "k", "к": "k", "κ": "k", "ⱪ": "k", "ᴋ": "k", "ⲕ": "k",
};

// Zero-width / invisible chars to strip.
const INVISIBLE_RE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;
// Combining marks (after NFKD).
const COMBINING_RE = /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;
// Allowed separators between letters (spaces, dashes, underscores, dots, slashes).
const SEP = "[\\s._\\-\\u2010-\\u2015/\\\\|]*";
const PATTERN = new RegExp(`z${SEP}e${SEP}n${SEP}w${SEP}o${SEP}r${SEP}k`, "i");

function normalizeLine(raw) {
  let s = raw.normalize("NFKD").replace(INVISIBLE_RE, "").replace(COMBINING_RE, "");
  let out = "";
  for (const ch of s) {
    out += CONFUSABLES[ch] ?? CONFUSABLES[ch.toLowerCase()] ?? ch;
  }
  return out.toLowerCase();
}

function isExcluded(rel) {
  const parts = rel.split(path.sep);
  for (const ex of EXCLUDES) {
    if (rel === ex || rel.startsWith(ex + path.sep) || rel.startsWith(ex + "/")) return true;
    if (parts.includes(ex)) return true;
  }
  return false;
}

async function readStdinAll() {
  return await new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    if (process.stdin.isTTY) resolve("");
  });
}

async function resolveFileList() {
  // Staged-only mode: NUL-separated file list on stdin (pre-commit hook).
  if (process.argv.includes("--stdin-null")) {
    const raw = await readStdinAll();
    return raw.split("\0").map((s) => s.trim()).filter(Boolean);
  }
  // Prefer git for speed and accuracy; fall back to fs walk.
  const git = spawnSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" });
  if (git.status === 0 && git.stdout.trim()) {
    return git.stdout.split("\n").filter(Boolean);
  }
  const results = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const abs = path.join(dir, entry);
      const rel = path.relative(process.cwd(), abs);
      if (isExcluded(rel)) continue;
      let st;
      try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) walk(abs);
      else results.push(rel);
    }
  }
  walk(process.cwd());
  return results;
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 4096);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

const files = (await resolveFileList()).filter((f) => f && !isExcluded(f));
const isStagedMode = process.argv.includes("--stdin-null");
const scanned = [];
const skipped = [];
const annotations = [];

for (const rel of files) {
  if (BINARY_EXT.has(path.extname(rel).toLowerCase())) {
    skipped.push({ file: rel, reason: "binary-ext" });
    continue;
  }
  let buf;
  try {
    buf = readFileSync(rel);
  } catch {
    skipped.push({ file: rel, reason: "unreadable" });
    continue;
  }
  if (looksBinary(buf)) {
    skipped.push({ file: rel, reason: "binary" });
    continue;
  }
  scanned.push(rel);
  const text = buf.toString("utf8");
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    const norm = normalizeLine(raw);
    if (PATTERN.test(norm)) {
      annotations.push({ file: rel, line: i + 1, content: raw.trim().slice(0, 400) });
    }
  }
}

// Per-file violation counts (deterministic order: most hits first, then path).
const perFile = new Map();
for (const a of annotations) perFile.set(a.file, (perFile.get(a.file) ?? 0) + 1);
const perFileSorted = [...perFile.entries()].sort(
  (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
);

// Show which files were considered in staged mode — the pre-commit hook
// runs against a limited set, so surfacing it makes intent obvious.
if (isStagedMode) {
  console.error(`Rebrand guard — scanning ${scanned.length} staged file(s):`);
  for (const f of scanned) console.error(`  • ${f}`);
  if (skipped.length) {
    console.error(`Skipped ${skipped.length} (binary/unreadable):`);
    for (const s of skipped) console.error(`  • ${s.file} [${s.reason}]`);
  }
  console.error("");
}

if (annotations.length > 0) {
  const inGithub = process.env.GITHUB_ACTIONS === "true";
  const header = `✖ Rebrand guard failed — ${annotations.length} residual "${TERM_DISPLAY}" reference(s) across ${perFile.size} file(s):`;
  console.error(header + "\n");

  // Concise per-file summary first, then full detail.
  console.error("Summary (violations per file):");
  const width = String(perFileSorted[0]?.[1] ?? 0).length;
  for (const [file, count] of perFileSorted) {
    console.error(`  ${String(count).padStart(width)}  ${file}`);
  }
  console.error("\nDetail:");

  for (const a of annotations) {
    console.error(`  ${a.file}:${a.line}:${a.content}`);
    if (inGithub) {
      const msg = `Legacy "${TERM_DISPLAY}" reference (possibly obfuscated) found: ${a.content}`
        .replace(/%/g, "%25")
        .replace(/\r/g, "%0D")
        .replace(/\n/g, "%0A");
      console.log(`::error file=${a.file},line=${a.line}::${msg}`);
    }
  }

  const outDir = "rebrand-guard-report";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify(
      {
        term: TERM_DISPLAY,
        total_matches: annotations.length,
        files_with_matches: perFile.size,
        scanned_files: scanned.length,
        per_file: Object.fromEntries(perFileSorted),
        generated_at: new Date().toISOString(),
        detection: "case-insensitive + unicode-confusables + separator-insertions + zero-width-stripped",
        matches: annotations,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(outDir, "report.txt"),
    header + "\n\n" +
      "Summary:\n" +
      perFileSorted.map(([f, c]) => `  ${c}  ${f}`).join("\n") +
      "\n\nDetail:\n" +
      annotations.map((a) => `  ${a.file}:${a.line}:${a.content}`).join("\n") + "\n",
  );

  console.error(`\nFull report written to ${outDir}/report.txt and ${outDir}/report.json.`);
  console.error(`Remove or replace every occurrence with the QualiPulse brand before merging.\n`);
  process.exit(1);
}

console.log(
  `✓ Rebrand guard passed — ${scanned.length} file(s) scanned, no "${TERM_DISPLAY}" references (including confusables) found.`,
);
