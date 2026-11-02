const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

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

// Is this name visible to other files? Then renaming it is a real change.
function isExported(binding) {
  const decl = binding.path.isVariableDeclarator() ? binding.path.parentPath : binding.path;
  return Boolean(decl.parentPath && decl.parentPath.isExportNamedDeclaration());
}

// Step 1: find every variable, function, class, parameter and import the file declares.
// Babel tells us which uses belong to which declaration, so two different
// "userId"s in two different functions are treated as two different things.
function findLocalNames(ast) {
  const owner = new Map(); // identifier node -> the declaration it belongs to
  const seen = new Set();
  traverse(ast, {
    Scopable(path) {
      for (const binding of Object.values(path.scope.bindings)) {
        if (seen.has(binding)) continue;
        seen.add(binding);
        if (isExported(binding)) continue;
        owner.set(binding.identifier, binding);
        for (const ref of binding.referencePaths) owner.set(ref.node, binding);
        for (const change of binding.constantViolations) {
          for (const ids of Object.values(change.getBindingIdentifiers(true))) {
            for (const id of [].concat(ids)) {
              if (id.name === binding.identifier.name) owner.set(id, binding);
            }
          }
        }
      }
    },
  });
  return owner;
}

// Positions where a name is part of what the code does, so it stays as written:
// object keys, ".property", class members, and names that cross file boundaries.
function isFixedName(node, key) {
  if (node.computed) return false;
  if (key === "key") return true;
  if (key === "property" && (node.type === "MemberExpression" || node.type === "OptionalMemberExpression")) return true;
  if (key === "exported" || key === "imported") return true;
  return false;
}

// Step 2: rebuild the tree with local names swapped for v1, v2, v3... in order of appearance.
function normalize(node, owner, names) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((child) => normalize(child, owner, names));

  // "if (x) return;" and "if (x) { return; }" do the same thing, so drop the extra braces.
  if (node.type === "BlockStatement" && node.body.length === 1 && node.body[0].type !== "VariableDeclaration") {
    return normalize(node.body[0], owner, names);
  }

  const out = {};
  for (const key of Object.keys(node)) {
    if (IGNORED_KEYS.has(key) || key === "shorthand") continue;
    // A local name: swap it for its placeholder, but keep its type annotation and the rest.
    if (key === "name" && owner.has(node)) {
      const binding = owner.get(node);
      if (!names.has(binding)) names.set(binding, "v" + (names.size + 1));
      out.name = names.get(binding);
      continue;
    }
    const child = node[key];
    if (child && child.type === "Identifier" && isFixedName(node, key)) {
      out[key] = { type: "Identifier", name: child.name };
    } else {
      out[key] = normalize(child, owner, names);
    }
  }
  return out;
}

function fingerprint(code) {
  const ast = toTree(code);
  const owner = findLocalNames(ast);
  return JSON.stringify(normalize(ast.program, owner, new Map()));
}

function isRefactorOnly(oldCode, newCode) {
  return fingerprint(oldCode) === fingerprint(newCode);
}

module.exports = { fingerprint, isRefactorOnly };
