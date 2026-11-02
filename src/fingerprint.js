const { parse } = require("@babel/parser");

// Details that never change what code does: positions, comments, quote style.
const IGNORED_KEYS = new Set([
  "start", "end", "loc", "range", "extra", "comments",
  "leadingComments", "trailingComments", "innerComments", "tokens",
]);

function toTree(code) {
  return parse(code, {
    sourceType: "unambiguous",
    plugins: ["typescript", "jsx"],
  });
}

// Step 1: find every name the code declares itself (variables, functions, parameters).
function collectDeclaredNames(node, names = new Set()) {
  if (!node || typeof node !== "object") return names;
  if (Array.isArray(node)) {
    node.forEach((child) => collectDeclaredNames(child, names));
    return names;
  }
  if (node.type === "VariableDeclarator" && node.id.type === "Identifier") names.add(node.id.name);
  if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id) names.add(node.id.name);
  if (node.params) {
    node.params.forEach((p) => { if (p.type === "Identifier") names.add(p.name); });
  }
  for (const key of Object.keys(node)) {
    if (!IGNORED_KEYS.has(key)) collectDeclaredNames(node[key], names);
  }
  return names;
}

// Step 2: rebuild the tree with those names swapped for v1, v2, v3... in order of appearance.
function normalize(node, declared, renames) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((child) => normalize(child, declared, renames));

  if (node.type === "Identifier" && declared.has(node.name)) {
    if (!renames.has(node.name)) renames.set(node.name, "v" + (renames.size + 1));
    return { type: "Identifier", name: renames.get(node.name) };
  }

  // "if (x) return;" and "if (x) { return; }" do the same thing, so drop the extra braces.
  if (node.type === "BlockStatement" && node.body.length === 1 && node.body[0].type !== "VariableDeclaration") {
    return normalize(node.body[0], declared, renames);
  }

  const out = {};
  for (const key of Object.keys(node)) {
    if (IGNORED_KEYS.has(key) || key === "shorthand") continue;
    // Object keys and ".property" names are part of what the code does, so keep them as written.
    const isFixedName =
      (key === "key" && (node.type === "ObjectProperty" || node.type === "ObjectMethod") && !node.computed) ||
      (key === "property" && node.type === "MemberExpression" && !node.computed);
    out[key] = isFixedName ? { type: "Identifier", name: node[key].name } : normalize(node[key], declared, renames);
  }
  return out;
}

function fingerprint(code) {
  const tree = toTree(code).program;
  const declared = collectDeclaredNames(tree);
  return JSON.stringify(normalize(tree, declared, new Map()));
}

function isRefactorOnly(oldCode, newCode) {
  return fingerprint(oldCode) === fingerprint(newCode);
}

module.exports = { fingerprint, isRefactorOnly };