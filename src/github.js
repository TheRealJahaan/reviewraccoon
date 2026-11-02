// A small client for GitHub's REST API, using the token GitHub gives every Action run.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createClient({ token, api = "https://api.github.com" }) {
  async function request(path, options = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(api + path, {
        method: options.method || "GET",
        body: options.body,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: options.accept || "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "reviewraccoon",
        },
      });
      // Out of API calls for this hour: wait until GitHub resets the limit, then try again.
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0" && reset && attempt < 3) {
        const waitMs = Math.max(reset * 1000 - Date.now(), 0) + 1000;
        console.log(`GitHub rate limit reached, waiting ${Math.ceil(waitMs / 60000)} minutes...`);
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) {
        const err = new Error(`GitHub API ${res.status} on ${path}: ${await res.text()}`);
        err.status = res.status;
        throw err;
      }
      return options.accept === "application/vnd.github.raw" ? res.text() : res.json();
    }
  }

  // Every file a pull request touched (GitHub sends 100 at a time, up to 3,000).
  async function listPullFiles(repo, number) {
    const files = [];
    for (let page = 1; ; page++) {
      const batch = await request(`/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
      files.push(...batch);
      if (batch.length < 100) return files;
    }
  }

  function readFile(repo, path, ref) {
    const safePath = encodeURIComponent(path).replace(/%2F/g, "/");
    return request(`/repos/${repo}/contents/${safePath}?ref=${ref}`, { accept: "application/vnd.github.raw" });
  }

  // The commit the pull request branched from. Comparing against it (not the latest base)
  // keeps other people's changes on the base branch out of the result.
  async function mergeBase(repo, base, head) {
    const compare = await request(`/repos/${repo}/compare/${base}...${head}?per_page=1`);
    return compare.merge_base_commit.sha;
  }

  return { request, listPullFiles, readFile, mergeBase };
}

module.exports = { createClient };
