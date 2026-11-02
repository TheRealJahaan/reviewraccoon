// Finds WHICH parts of a file changed behavior: the functions, classes, variables
// and other top-level pieces, with their line numbers.
const { toTree, findLocalNames, normalize } = require("./fingerprint");

// A readable name for one top-level piece of code.
function nameOf(node) {
  if (!node) return null;
  switch (node.type) {
    case "ExportNamedDeclaration":
    case "ExportDefaultDeclaration":
      if (node.declaration) return nameOf(node.declaration) || "default export";
      return "export list";
    case "FunctionDeclaration":
    case "ClassDeclaration":
    case "TSInterfaceDeclaration":
    case "TSTypeAliasDeclaration":
    case "TSEnumDeclaration":
    case "TSModuleDeclaration":
      return node.id && node.id.name ? node.id.name : null;
    case "VariableDeclaration": {
      const names = node.declarations.map((d) => (d.id.type === "Identifier" ? d.id.name : null)).filter(Boolean);
      return names.length ? names.join(", ") : null;
    }
    case "ImportDeclaration":
      return `import "${node.source.value}"`;
    case "ExpressionStatement": {
      const e = node.expression;
      if (e.type === "AssignmentExpression") return memberName(e.left);
      if (e.type === "CallExpression") {
        const callee = memberName(e.callee);
        return callee ? `${callee}(…)` : null;
      }
      return null;
    }
    case "ClassMethod":
    case "ClassPrivateMethod":
    case "ClassProperty":
    case "ClassPrivateProperty":
    case "ClassAccessorProperty":
    case "TSDeclareMethod":
      if (node.key.type === "Identifier") return node.key.name;
      if (node.key.type === "PrivateName") return "#" + node.key.id.name;
      if (node.key.type === "StringLiteral") return node.key.value;
      return null;
    case "StaticBlock":
      return "static block";
    default:
      return null;
  }
}

// "module.exports", "exports.login", "app.get" ...
function memberName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    const object = memberName(node.object);
    return object ? `${object}.${node.property.name}` : null;
  }
  return null;
}

// The class inside a top-level piece, if it is one, so we can look at its methods.
function classBodyOf(node) {
  const decl = node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration" ? node.declaration : node;
  if (decl && (decl.type === "ClassDeclaration" || decl.type === "ClassExpression")) return decl.body.body;
  return null;
}

// Fingerprint one piece on its own. Names declared inside it become v1, v2...;
// names it borrows from the rest of the file stay as written, so that pointing
// at a different top-level variable still counts as a change.
function pieceFingerprint(node, owner, isTopLevel) {
  return JSON.stringify(normalize(node, owner, new Map(), isTopLevel));
}

function describe(nodes, owner, isTopLevel, prefix) {
  return nodes.map((node, index) => {
    const name = nameOf(node);
    return {
      node,
      index,
      name: name ? prefix + name : null,
      fp: pieceFingerprint(node, owner, isTopLevel),
      start: node.loc.start.line,
      end: node.loc.end.line,
      members: classBodyOf(node),
    };
  });
}

// Pair up old and new pieces: first the ones that are identical (even if they moved),
// then the ones with the same name (those changed), and the rest were added or removed.
function matchPieces(oldPieces, newPieces) {
  const unusedOld = new Set(oldPieces);
  const pairs = [];
  const unmatchedNew = [];

  for (const piece of newPieces) {
    const same = oldPieces.find((o) => unusedOld.has(o) && o.fp === piece.fp);
    if (same) {
      unusedOld.delete(same);
      pairs.push({ kind: "same", old: same, new: piece });
    } else {
      unmatchedNew.push(piece);
    }
  }
  for (const piece of unmatchedNew) {
    const named = piece.name && oldPieces.find((o) => unusedOld.has(o) && o.name === piece.name);
    if (named) {
      unusedOld.delete(named);
      pairs.push({ kind: "changed", old: named, new: piece });
    } else {
      pairs.push({ kind: "added", old: null, new: piece });
    }
  }
  for (const piece of oldPieces) {
    if (unusedOld.has(piece)) pairs.push({ kind: "removed", old: piece, new: null });
  }
  return pairs;
}

function toChange(pair) {
  const piece = pair.new || pair.old;
  return {
    kind: pair.kind,
    name: piece.name,
    oldLines: pair.old ? [pair.old.start, pair.old.end] : null,
    newLines: pair.new ? [pair.new.start, pair.new.end] : null,
  };
}

function compareLevel(oldNodes, newNodes, ctx, prefix) {
  const oldPieces = describe(oldNodes, ctx.oldOwner, ctx.oldTop, prefix);
  const newPieces = describe(newNodes, ctx.newOwner, ctx.newTop, prefix);
  const pairs = matchPieces(oldPieces, newPieces);
  const changes = [];

  for (const pair of pairs) {
    if (pair.kind === "same") continue;
    // A changed class: report the methods that changed instead of the whole class.
    if (pair.kind === "changed" && pair.old.members && pair.new.members) {
      const inner = compareLevel(pair.old.members, pair.new.members, ctx, (pair.new.name || "class") + ".");
      if (inner.length) {
        changes.push(...inner);
        continue;
      }
    }
    changes.push(toChange(pair));
  }

  // Nothing changed piece by piece, but the file is different: the order changed.
  const order = pairs.filter((p) => p.kind === "same").map((p) => p.old.index);
  const reordered = order.some((value, i) => i > 0 && value < order[i - 1]);
  if (!changes.length && reordered) {
    changes.push({
      kind: "reordered",
      name: prefix ? prefix.slice(0, -1) : null,
      oldLines: [oldNodes[0].loc.start.line, oldNodes[oldNodes.length - 1].loc.end.line],
      newLines: [newNodes[0].loc.start.line, newNodes[newNodes.length - 1].loc.end.line],
    });
  }
  return changes;
}

function topLevelChecker(ast, owner) {
  const top = new Set();
  for (const binding of new Set(owner.values())) {
    if (binding.scope.path.isProgram()) top.add(binding);
  }
  return (binding) => top.has(binding);
}

// The pieces of the file that behave differently, with old and new line ranges.
function changedPieces(oldCode, newCode) {
  const oldAst = toTree(oldCode);
  const newAst = toTree(newCode);
  const oldOwner = findLocalNames(oldAst);
  const newOwner = findLocalNames(newAst);
  const ctx = {
    oldOwner,
    newOwner,
    oldTop: topLevelChecker(oldAst, oldOwner),
    newTop: topLevelChecker(newAst, newOwner),
  };
  const changes = compareLevel(oldAst.program.body, newAst.program.body, ctx, "");
  // Something outside the pieces changed, such as a "use strict" line: flag the whole file.
  if (!changes.length) {
    changes.push({ kind: "file", name: null, oldLines: [1, oldCode.split("\n").length], newLines: [1, newCode.split("\n").length] });
  }
  return changes;
}

module.exports = { changedPieces };
