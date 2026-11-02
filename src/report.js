// Turns the results into the comment the raccoon posts on the pull request.
const MARKER = "<!-- reviewraccoon -->";
const HOME = "https://github.com/TheRealJahaan/reviewraccoon";
const MAX_CHANGES_PER_FILE = 10;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function linesLabel([start, end]) {
  return start === end ? `line ${start}` : `lines ${start}–${end}`;
}

function blobLink(ctx, sha, path, [start, end]) {
  const anchor = start === end ? `L${start}` : `L${start}-L${end}`;
  return `${ctx.server}/${ctx.repo}/blob/${sha}/${encodeURI(path)}#${anchor}`;
}

function describeChange(change, file, ctx) {
  const name = change.name ? `\`${change.name}\`` : "Top-level code";
  const at = (lines, sha, suffix = "") => `[${linesLabel(lines)}${suffix}](${blobLink(ctx, sha, file, lines)})`;
  switch (change.kind) {
    case "changed":
      return `${name} changed · ${at(change.newLines, ctx.headSha)}`;
    case "added":
      return `${name} is new · ${at(change.newLines, ctx.headSha)}`;
    case "removed":
      return `${name} was removed · ${at(change.oldLines, ctx.oldSha, " before")}`;
    case "reordered":
      return `${change.name ? `The order inside \`${change.name}\`` : "The order of the code"} changed · ${at(change.newLines, ctx.headSha)}`;
    default:
      return `Something at file level changed, such as \`"use strict"\` · ${at(change.newLines, ctx.headSha)}`;
  }
}

function headline(safe, review, codeFiles) {
  const total = safe + review;
  if (!codeFiles) return "No JavaScript or TypeScript files changed, so there's nothing to check.";
  const all = total === 1 ? "The 1 changed line" : `All ${total} changed lines`;
  if (review === 0) {
    return total
      ? `**${all} ${total === 1 ? "is" : "are"} refactor-only. Nothing here changes what the code does.**`
      : "**Nothing in this pull request changes what the code does.**";
  }
  if (safe === 0) return `**${all} ${total === 1 ? "needs" : "need"} a careful look.**`;
  const pct = Math.floor((safe / total) * 100);
  const lead = pct >= 50 ? "Only " : "";
  return `**${lead}${review} of ${plural(total, "changed line")} ${review === 1 ? "needs" : "need"} a careful look.** The other ${safe} (${pct}%) ${safe === 1 ? "doesn't" : "don't"} change what the code does.`;
}

function buildComment(results, ctx) {
  const by = (bucket) => results.filter((r) => r.bucket === bucket);
  const codeFiles = results.filter((r) => r.bucket !== "skipped");
  const safe = codeFiles.reduce((sum, r) => sum + (r.safeLines || 0), 0);
  const review = codeFiles.reduce((sum, r) => sum + (r.reviewLines || 0), 0);
  const list = (rows) => rows.map((r) => `- \`${r.file}\``).join("\n");

  const sections = [];

  const behavior = by("behavior");
  if (behavior.length) {
    const items = behavior.map((r) => {
      const shown = r.changes.slice(0, MAX_CHANGES_PER_FILE).map((c) => `  - ${describeChange(c, r.file, ctx)}`);
      const more = r.changes.length - shown.length;
      if (more > 0) shown.push(`  - …and ${more} more`);
      return [`- **\`${r.file}\`**`, ...shown].join("\n");
    });
    sections.push(`### ⚠️ Review these first\n${items.join("\n")}`);
  }

  const refactor = by("refactor");
  if (refactor.length) {
    sections.push(`### 🦝 Safe to skim\nOnly formatting, comments or local names changed.\n${list(refactor)}`);
  }
  if (by("added").length) sections.push(`### ➕ New files\n${list(by("added"))}`);
  if (by("removed").length) sections.push(`### 🗑️ Deleted files\n${list(by("removed"))}`);
  if (by("unreadable").length) sections.push(`### ❔ Could not analyze\n${list(by("unreadable"))}`);

  const skipped = by("skipped");
  if (skipped.length) {
    sections.push(
      `<details><summary>⏭️ ${plural(skipped.length, "file")} not checked (not JavaScript or TypeScript)</summary>\n\n${list(skipped)}\n\n</details>`
    );
  }

  return [
    MARKER,
    "## 🦝 ReviewRaccoon",
    headline(safe, review, codeFiles.length),
    ...sections,
    `<sub>🦝 [Add ReviewRaccoon to your repo](${HOME}) in 1 minute. Free, no AI, and your code never leaves GitHub.</sub>`,
  ].join("\n\n");
}

module.exports = { buildComment, headline, MARKER };
