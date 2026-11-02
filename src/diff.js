// Reads the "patch" GitHub sends for each file and lists which lines were added and removed.
function changedLines(patch) {
  const added = [];
  const removed = [];
  let oldLine = 0;
  let newLine = 0;
  for (const line of patch.split("\n")) {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
    } else if (line.startsWith("+")) {
      added.push(newLine++);
    } else if (line.startsWith("-")) {
      removed.push(oldLine++);
    } else if (!line.startsWith("\\")) {
      oldLine++;
      newLine++;
    }
  }
  return { added, removed };
}

module.exports = { changedLines };
