#!/usr/bin/env node
// Runs ReviewRaccoon over the recent merged pull requests of public repos and reports
// how many changed lines of code actually change behavior.
//
// Usage:
//   GITHUB_TOKEN=$(gh auth token) node scripts/scan.js facebook/react vercel/next.js --prs 100
//
// It writes the numbers for every pull request to scan-results.json.
const fs = require("fs");
const { createClient } = require("../src/github");
const { analyzeFile, CODE_FILE } = require("../src/analyze");

const MAX_CODE_FILES = 100; // Skip giant pull requests (mass renames, generated code) to save API calls.

function parseArgs(argv) {
  const repos = [];
  let prs = 100;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prs") prs = Number(argv[++i]);
    else repos.push(argv[i]);
  }
  return { repos, prs };
}

const fmt = (n) => n.toLocaleString("en-US");
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

async function mergedPulls(gh, repo, count) {
  const pulls = [];
  for (let page = 1; pulls.length < count && page <= 20; page++) {
    const batch = await gh.request(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);
    pulls.push(...batch.filter((p) => p.merged_at));
    if (batch.length < 100) break;
  }
  return pulls.slice(0, count);
}

async function scanPull(gh, repo, pr) {
  const files = await gh.listPullFiles(repo, pr.number);
  const codeFiles = files.filter((f) => CODE_FILE.test(f.filename));
  const row = { number: pr.number, title: pr.title, url: pr.html_url, safe: 0, review: 0, unreadable: 0, skipped: false };
  if (!codeFiles.length) return row;
  if (codeFiles.length > MAX_CODE_FILES) return { ...row, skipped: true };

  let oldSha = pr.base.sha;
  try {
    oldSha = await gh.mergeBase(repo, pr.base.sha, pr.head.sha);
  } catch {
    // Fall back to the base commit.
  }
  for (const file of codeFiles) {
    const read = (which) =>
      which === "old"
        ? gh.readFile(repo, file.previous_filename || file.filename, oldSha)
        : gh.readFile(repo, file.filename, pr.head.sha);
    const result = await analyzeFile(file, read);
    if (result.bucket === "unreadable") {
      row.unreadable++;
      continue;
    }
    row.safe += result.safeLines || 0;
    row.review += result.reviewLines || 0;
  }
  return row;
}

function summarize(repo, rows) {
  const withCode = rows.filter((r) => !r.skipped && r.safe + r.review > 0);
  const safe = withCode.reduce((s, r) => s + r.safe, 0);
  const review = withCode.reduce((s, r) => s + r.review, 0);
  const pureRefactors = withCode.filter((r) => r.review === 0).sort((a, b) => b.safe - a.safe);
  const lines = [
    `\n${repo}: ${rows.length} merged pull requests, ${withCode.length} changed JavaScript or TypeScript`,
    `  Changed lines of code:         ${fmt(safe + review)}`,
    `  Need a careful look:           ${fmt(review)} (${pct(review, safe + review)}%)`,
    `  Don't change what code does:   ${fmt(safe)} (${pct(safe, safe + review)}%)`,
    `  Pull requests that are 100% refactor: ${pureRefactors.length}`,
  ];
  if (pureRefactors.length) {
    const top = pureRefactors[0];
    lines.push(`  Biggest one: #${top.number} "${top.title}" (${fmt(top.safe)} lines, none change behavior)`);
  }
  const skipped = rows.filter((r) => r.skipped).length;
  if (skipped) lines.push(`  Skipped ${skipped} giant pull requests (over ${MAX_CODE_FILES} code files)`);
  console.log(lines.join("\n"));
  return { repo, pulls: rows.length, withCode: withCode.length, safe, review, pureRefactors: pureRefactors.length };
}

async function main() {
  const { repos, prs } = parseArgs(process.argv.slice(2));
  if (!repos.length || !process.env.GITHUB_TOKEN) {
    console.log("Usage: GITHUB_TOKEN=$(gh auth token) node scripts/scan.js owner/repo [owner/repo ...] [--prs 100]");
    process.exit(1);
  }
  const gh = createClient({ token: process.env.GITHUB_TOKEN, api: process.env.GITHUB_API_URL || "https://api.github.com" });
  const output = { scannedAt: new Date().toISOString(), repos: [] };

  for (const repo of repos) {
    console.log(`\nScanning the last ${prs} merged pull requests of ${repo}...`);
    const pulls = await mergedPulls(gh, repo, prs);
    const rows = [];
    for (const [i, pr] of pulls.entries()) {
      try {
        rows.push(await scanPull(gh, repo, pr));
      } catch (err) {
        console.log(`  #${pr.number}: skipped (${err.message.slice(0, 80)})`);
      }
      if ((i + 1) % 10 === 0) console.log(`  ${i + 1} of ${pulls.length} done`);
    }
    output.repos.push({ ...summarize(repo, rows), rows });
    fs.writeFileSync("scan-results.json", JSON.stringify(output, null, 2));
  }

  if (output.repos.length > 1) {
    const safe = output.repos.reduce((s, r) => s + r.safe, 0);
    const review = output.repos.reduce((s, r) => s + r.review, 0);
    const pulls = output.repos.reduce((s, r) => s + r.pulls, 0);
    console.log(`\nAll repos: ${fmt(pulls)} pull requests, ${fmt(safe + review)} changed lines of code.`);
    console.log(`${pct(safe, safe + review)}% of them don't change what the code does.`);
  }
  console.log("\nEvery pull request's numbers are in scan-results.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
