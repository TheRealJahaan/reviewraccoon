// The GitHub Action: runs on a pull request and posts (or updates) one comment.
const fs = require("fs");
const { createClient } = require("./github");
const { analyzeFile } = require("./analyze");
const { buildComment, MARKER } = require("./report");

// Find the comment we posted on an earlier run, if there is one.
async function findOurComment(gh, repo, number) {
  for (let page = 1; ; page++) {
    const batch = await gh.request(`/repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`);
    const ours = batch.find((c) => c.body && c.body.includes(MARKER));
    if (ours || batch.length < 100) return ours;
  }
}

// Post the comment, or update our earlier one so each push doesn't add a new comment.
async function postComment(gh, repo, number, body) {
  const ours = await findOurComment(gh, repo, number);
  if (ours) {
    await gh.request(`/repos/${repo}/issues/comments/${ours.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
  } else {
    await gh.request(`/repos/${repo}/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
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
  const gh = createClient({ token: process.env.GITHUB_TOKEN, api: process.env.GITHUB_API_URL || "https://api.github.com" });

  const headSha = pr.head.sha;
  let oldSha = pr.base.sha;
  try {
    oldSha = await gh.mergeBase(repo, pr.base.sha, headSha);
  } catch (err) {
    console.log(`Could not find where the branch started, comparing with the base branch instead: ${err.message}`);
  }

  const files = await gh.listPullFiles(repo, pr.number);
  const results = [];
  for (const file of files) {
    const read = (which) =>
      which === "old"
        ? gh.readFile(repo, file.previous_filename || file.filename, oldSha)
        : gh.readFile(repo, file.filename, headSha);
    const result = await analyzeFile(file, read);
    if (result.reason) console.log(`Could not analyze ${file.filename}: ${result.reason}`);
    results.push({ file: file.filename, ...result });
  }

  const body = buildComment(results, {
    repo,
    headSha,
    oldSha,
    server: process.env.GITHUB_SERVER_URL || "https://github.com",
  });
  console.log(body);

  // Also show the report on the run's summary page.
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + "\n");

  try {
    await postComment(gh, repo, pr.number, body);
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
