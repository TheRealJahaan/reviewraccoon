const fs = require("fs");
const { isRefactorOnly } = require("./fingerprint");

const API = process.env.GITHUB_API_URL || "https://api.github.com";
const TOKEN = process.env.GITHUB_TOKEN;
const MARKER = "<!-- reviewraccoon -->";
const CODE_FILE = /\.(js|jsx|mjs|cjs|ts|tsx)$/;

// Talk to GitHub's API using the token GitHub gives every Action run.
async function github(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: options.accept || "application/vnd.github+json",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status} on ${path}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  return options.accept === "application/vnd.github.raw" ? res.text() : res.json();
}

// Every file the PR touched (GitHub sends 100 at a time).
async function listChangedFiles(repo, prNumber) {
  const files = [];
  for (let page = 1; ; page++) {
    const batch = await github(`/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`);
    files.push(...batch);
    if (batch.length < 100) return files;
  }
}

function readFileAt(repo, path, sha) {
  return github(`/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${sha}`, {
    accept: "application/vnd.github.raw",
  });
}

// Sort each changed file into a bucket.
async function classify(repo, pr, file) {
  if (!CODE_FILE.test(file.filename)) return "skipped";
  if (file.status === "added") return "added";
  if (file.status === "removed") return "removed";
  try {
    const oldCode = await readFileAt(repo, file.previous_filename || file.filename, pr.base.sha);
    const newCode = await readFileAt(repo, file.filename, pr.head.sha);
    return isRefactorOnly(oldCode, newCode) ? "refactor" : "behavior";
  } catch (err) {
    console.log(`Could not analyze ${file.filename}: ${err.message}`);
    return "unreadable";
  }
}

function buildComment(results) {
  const pick = (bucket) => results.filter((r) => r.bucket === bucket).map((r) => `- \`${r.file}\``).join("\n");
  const code = results.filter((r) => r.bucket === "refactor" || r.bucket === "behavior");
  const refactors = results.filter((r) => r.bucket === "refactor").length;

  const sections = [
    ["⚠️ Behavior changes, review these first", pick("behavior")],
    ["🦝 Refactor only, safe to skim", pick("refactor")],
    ["➕ New files", pick("added")],
    ["🗑️ Deleted files", pick("removed")],
    ["❔ Could not analyze", pick("unreadable")],
    ["⏭️ Not checked (not JavaScript or TypeScript)", pick("skipped")],
  ].filter(([, list]) => list);

  return [
    MARKER,
    "## 🦝 ReviewRaccoon",
    code.length
      ? `**${refactors} of ${code.length} changed code files are refactor-only.**`
      : "No changed JavaScript or TypeScript files to compare.",
    ...sections.map(([title, list]) => `### ${title}\n${list}`),
    "<sub>Refactor-only means the file's syntax tree is identical once formatting, comments and local renames are ignored.</sub>",
  ].join("\n\n");
}

// Find the comment we posted on an earlier run, if there is one.
async function findOurComment(repo, prNumber) {
  for (let page = 1; ; page++) {
    const batch = await github(`/repos/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`);
    const ours = batch.find((c) => c.body && c.body.includes(MARKER));
    if (ours || batch.length < 100) return ours;
  }
}

// Post the comment, or update our earlier one so each push doesn't add a new comment.
async function postComment(repo, prNumber, body) {
  const ours = await findOurComment(repo, prNumber);
  if (ours) {
    await github(`/repos/${repo}/issues/comments/${ours.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
  } else {
    await github(`/repos/${repo}/issues/${prNumber}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  }
}

async function main() {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const pr = event.pull_request;
  if (!pr) {
    console.log("Not a pull request event, nothing to do.");
    return;
  }
  const repo = process.env.GITHUB_REPOSITORY;
  const files = await listChangedFiles(repo, pr.number);
  const results = [];
  for (const file of files) {
    results.push({ file: file.filename, bucket: await classify(repo, pr, file) });
  }
  const body = buildComment(results);
  console.log(body);

  // Also show the report on the run's summary page.
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + "\n");

  try {
    await postComment(repo, pr.number, body);
  } catch (err) {
    // Pull requests from forks get a read-only token, so GitHub won't let us comment.
    if (err.status === 403) {
      console.log("::warning::ReviewRaccoon can't comment on this pull request (GitHub gives pull requests from forks a read-only token). The report is on this run's summary page.");
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});