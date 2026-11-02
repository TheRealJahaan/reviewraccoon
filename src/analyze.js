// Decides, for one changed file, what changed behavior and how many changed lines need review.
const { isRefactorOnly } = require("./fingerprint");
const { changedPieces } = require("./units");
const { changedLines } = require("./diff");

const CODE_FILE = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/;

const inside = (line, range) => range && line >= range[0] && line <= range[1];

// file: { filename, status, patch, additions, deletions }
// read(which): returns the old ("old") or new ("new") contents of the file.
async function analyzeFile(file, read) {
  const total = (file.additions || 0) + (file.deletions || 0);
  if (!CODE_FILE.test(file.filename)) return { bucket: "skipped" };
  if (file.status === "added") return { bucket: "added", safeLines: 0, reviewLines: total };
  if (file.status === "removed") return { bucket: "removed", safeLines: 0, reviewLines: total };

  let oldCode;
  let newCode;
  try {
    oldCode = await read("old");
    newCode = await read("new");
  } catch (err) {
    return { bucket: "unreadable", reason: err.message, safeLines: 0, reviewLines: total };
  }

  try {
    if (isRefactorOnly(oldCode, newCode)) return { bucket: "refactor", safeLines: total, reviewLines: 0 };
    const changes = changedPieces(oldCode, newCode);

    // GitHub leaves out the patch for very large files: then every line counts as needing review.
    if (!file.patch) return { bucket: "behavior", changes, safeLines: 0, reviewLines: total };

    const { added, removed } = changedLines(file.patch);
    const reviewAdded = added.filter((line) => changes.some((c) => inside(line, c.newLines))).length;
    const reviewRemoved = removed.filter((line) => changes.some((c) => inside(line, c.oldLines))).length;
    const reviewLines = reviewAdded + reviewRemoved;
    return {
      bucket: "behavior",
      changes,
      safeLines: added.length + removed.length - reviewLines,
      reviewLines,
    };
  } catch (err) {
    return { bucket: "unreadable", reason: err.message, safeLines: 0, reviewLines: total };
  }
}

module.exports = { analyzeFile, CODE_FILE };
