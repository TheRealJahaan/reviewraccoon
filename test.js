// Run with: npm test
// Each case is [what changed, old code, new code, should it count as refactor-only?]
const { isRefactorOnly } = require("./src/fingerprint");

const cases = [
  // Safe changes: these should be refactor-only.
  ["formatting and comments", "const a=1;//hi\nf( a )", "/* x */const a = 1\nf(a)", true],
  ["quote style", "f('a')", 'f("a")', true],
  ["braces around one statement", "function f(x){ if (x) return 1; }", "function f(x){ if (x) { return 1; } }", true],
  ["rename a local variable", "function f(){ const user = get(); return user; }", "function f(){ const found = get(); return found; }", true],
  ["rename a parameter in one function only", "const a = (id) => id; const b = (id) => id + 1;", "const a = (uid) => uid; const b = (id) => id + 1;", true],
  ["swap two names everywhere", "const a=1,b=2; f(a,b)", "const b=1,a=2; f(b,a)", true],
  ["rename a variable that gets reassigned", "let n=0; n=n+1; n++; use(n)", "let k=0; k=k+1; k++; use(k)", true],
  ["rename a catch variable", "try{}catch(e){log(e)}", "try{}catch(err){log(err)}", true],
  ["rename a loop variable", "for (const item of list) use(item)", "for (const it of list) use(it)", true],
  ["rename inside a closure", "function f(){ let c=0; return ()=>c++ }", "function f(){ let count=0; return ()=>count++ }", true],
  ["rename with var declared twice", "var a=1; var a=2; use(a)", "var b=1; var b=2; use(b)", true],
  ["rename an import", "import { x } from 'm'; x();", "import { x as y } from 'm'; y();", true],
  ["rename a default import", "import React from 'react'; React.go()", "import R from 'react'; R.go()", true],
  ["rename a destructured variable", "const { a } = obj; use(a)", "const { a: b } = obj; use(b)", true],
  ["keep an object key, rename the value", "const f=(userId)=>({ userId })", "const f=(uid)=>({ userId: uid })", true],
  ["rename a local export but keep its public name", "const a=1; export { a };", "const b=1; export { b as a };", true],
  ["rename a local React component", "const Btn=()=>null; const X=()=><Btn/>", "const Button=()=>null; const X=()=><Button/>", true],
  ["rename a typed parameter", "function f(x: number){ return x }", "function f(y: number){ return y }", true],
  ["rename an optional typed parameter", "function f(x?: number){ return x }", "function f(y?: number){ return y }", true],

  // Real changes: these must be caught as behavior changes.
  ["change a number", "if (pw.length < 8) fail()", "if (pw.length < 10) fail()", false],
  ["change a string", "f('a')", "f('b')", false],
  ["swap two arguments", "const a=1,b=2; f(a,b)", "const a=1,b=2; f(b,a)", false],
  ["assign to a different variable", "let n=0, m=0; n=1; use(n,m)", "let n=0, m=0; m=1; use(n,m)", false],
  ["a rename that changes which variable is used", "const y=1; function f(x){ return y; }", "const x=1; function f(x){ return x; }", false],
  ["rename an exported variable", "export const a = 1;", "export const b = 1;", false],
  ["rename an exported function", "export function a(){ return 1 }", "export function b(){ return 1 }", false],
  ["rename a public export name", "const a=1; export { a };", "const b=1; export { b };", false],
  ["rename a module.exports key", "const fetchUser=()=>1; module.exports = { fetchUser };", "const getUser=()=>1; module.exports = { getUser };", false],
  ["rename an exports property", "exports.foo = 1", "exports.bar = 1", false],
  ["import a different name", "import { x } from 'm'; x();", "import { z } from 'm'; z();", false],
  ["destructure a different key", "const { a } = obj; use(a)", "const { c } = obj; use(c)", false],
  ["rename a returned object key", "const f=(userId)=>({ userId })", "const f=(uid)=>({ uid })", false],
  ["call a different global", "foo()", "bar()", false],
  ["read a different property", "a.b()", "a.c()", false],
  ["read a different optional property", "a?.b", "a?.c", false],
  ["rename a class method", "class A { foo(){ return 1 } }", "class A { bar(){ return 1 } }", false],
  ["rename a class method next to a same-named variable", "const foo=1; class A { foo(){} }", "const bar=1; class A { bar(){} }", false],
  ["change a JSX prop", "const C=()=><div className='a'/>", "const C=()=><div className='b'/>", false],
  ["render a different component", "const X=()=><Btn/>", "const X=()=><Button/>", false],
  ["change a type", "function f(x: number){ return x }", "function f(x: string){ return x }", false],
  ["make a parameter required", "function f(x?: number){}", "function f(x: number){}", false],
];

let failed = 0;
console.log("Whole files:");
for (const [name, oldCode, newCode, expected] of cases) {
  let actual;
  try {
    actual = isRefactorOnly(oldCode, newCode);
  } catch (err) {
    actual = "crashed: " + err.message;
  }
  const label = expected ? "🦝 refactor only " : "⚠️  behavior change";
  if (actual === expected) {
    console.log(`✅ ${label}  ${name}`);
  } else {
    failed++;
    console.log(`❌ ${label}  ${name}  (got ${actual})`);
  }
}

// Which pieces changed, and which changed lines need review.
const { changedPieces } = require("./src/units");
const { analyzeFile } = require("./src/analyze");
const { headline } = require("./src/report");

// A tiny line diff, so the tests don't need git: one hunk covering the whole file.
function makePatch(oldCode, newCode) {
  const a = oldCode.split("\n");
  const b = newCode.split("\n");
  const lcs = a.map(() => new Array(b.length + 1).fill(0));
  lcs.push(new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [`@@ -1,${a.length} +1,${b.length} @@`];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { out.push(" " + a[i++]); j++; }
    else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) out.push("+" + b[j++]);
    else out.push("-" + a[i++]);
  }
  return out.join("\n");
}

const pieceCases = [
  // [what changed, old code, new code, expected list of "kind name lines"]
  ["one function's logic changed", "function a(x){ return x }\nfunction b(y){ return y * 2 }", "function a(x){ return x }\nfunction b(y){ return y * 3 }", ["changed b 2"]],
  ["rename in one function, logic change in another", "const a = (id) => id;\nconst b = (n) => n > 8;", "const a = (uid) => uid;\nconst b = (n) => n > 10;", ["changed b 2"]],
  ["a new function", "function a(){ return 1 }", "function a(){ return 1 }\n\nfunction b(){ return 2 }", ["added b 3"]],
  ["a removed function", "function a(){ return 1 }\nfunction b(){ return 2 }", "function a(){ return 1 }", ["removed b 2"]],
  ["one method in a class", "class User {\n  name(){ return 1 }\n  save(){ return 2 }\n}", "class User {\n  name(){ return 1 }\n  save(){ return 3 }\n}", ["changed User.save 3"]],
  ["moved function plus a real change", "function a(){ return 1 }\nfunction b(){ return 2 }\nfunction c(){ return 3 }", "function b(){ return 2 }\nfunction a(){ return 1 }\nfunction c(){ return 4 }", ["changed c 3"]],
  ["reads a different top-level variable", "const x = 1;\nconst y = 2;\nfunction f(){ return x }", "const x = 1;\nconst y = 2;\nfunction f(){ return y }", ["changed f 3"]],
  ["module.exports changed", "const a=1, b=2;\nmodule.exports = { a };", "const a=1, b=2;\nmodule.exports = { a, b };", ["changed module.exports 2"]],
  ["side effects run in a new order", "setup();\nstart();", "start();\nsetup();", ["reordered - 1-2"]],
  ["three new imports in a row show up once", "const a = 1;", "const { x } = require(\"x\");\nconst { y, z } = require(\"y\");\nconst w = require(\"w\");\nconst a = 1;", ["added x, y, z, w 1-3"]],
  ["two changed functions next to each other stay separate", "function a(){ return 1 }\nfunction b(){ return 2 }", "function a(){ return 3 }\nfunction b(){ return 4 }", ["changed a 1", "changed b 2"]],
  ["a removed loop", "for (const i of list) use(i);\nconst a = 1;", "const a = 1;", ["removed - 1"]],
  ["\"use strict\" added", "function a(){ return 1 }", "\"use strict\";\nfunction a(){ return 1 }", ["file - 1-2"]],
];

const short = (c) => {
  const lines = c.newLines || c.oldLines;
  const range = lines[0] === lines[1] ? `${lines[0]}` : `${lines[0]}-${lines[1]}`;
  return `${c.kind} ${c.name || "-"} ${range}`;
};

let pieceCount = 0;
console.log("\nChanged pieces:");
for (const [name, oldCode, newCode, expected] of pieceCases) {
  pieceCount++;
  let actual;
  try {
    actual = changedPieces(oldCode, newCode).map(short);
  } catch (err) {
    actual = ["crashed: " + err.message];
  }
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`✅ ${name}`);
  } else {
    failed++;
    console.log(`❌ ${name}  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

// Line counts: renaming in fetchUser is safe, the password change in login needs review.
async function lineCountTest() {
  const oldCode = [
    "const fetchUser = (userId) => {",
    "  if (!userId) return null;",
    "  return { id: userId };",
    "};",
    "",
    "const login = (userId, pw) => {",
    "  if (pw.length < 8) return false;",
    "  return fetchUser(userId) !== null;",
    "};",
  ].join("\n");
  const newCode = oldCode
    .replace("(userId) => {", "(uid) => {")
    .replace("if (!userId)", "if (!uid)")
    .replace("{ id: userId }", "{ id: uid }")
    .replace("pw.length < 8", "pw.length < 10");
  const result = await analyzeFile(
    { filename: "user.js", status: "modified", patch: makePatch(oldCode, newCode), additions: 4, deletions: 4 },
    async (which) => (which === "old" ? oldCode : newCode)
  );
  return `${result.bucket} safe=${result.safeLines} review=${result.reviewLines}`;
}

const headlineCases = [
  ["mostly safe", [398, 14, 3], "**Only 14 of 412 changed lines need a careful look.** The other 398 (96%) don't change what the code does."],
  ["all safe", [12, 0, 1], "**All 12 changed lines are refactor-only. Nothing here changes what the code does.**"],
  ["all review", [0, 7, 1], "**All 7 changed lines need a careful look.**"],
  ["one line needs review", [11, 1, 1], "**Only 1 of 12 changed lines needs a careful look.** The other 11 (91%) don't change what the code does."],
  ["a single safe line", [1, 0, 1], "**The 1 changed line is refactor-only. Nothing here changes what the code does.**"],
  ["mostly review", [1, 9, 1], "**9 of 10 changed lines need a careful look.** The other 1 (10%) doesn't change what the code does."],
];

lineCountTest().then((actual) => {
  pieceCount++;
  const expected = "behavior safe=6 review=2";
  console.log("\nLine counts:");
  if (actual === expected) console.log("✅ rename lines are safe, the password lines need review");
  else {
    failed++;
    console.log(`❌ line counts (expected ${expected}, got ${actual})`);
  }

  console.log("\nHeadline:");
  for (const [name, args, expectedText] of headlineCases) {
    pieceCount++;
    const text = headline(...args);
    if (text === expectedText) console.log(`✅ ${name}`);
    else {
      failed++;
      console.log(`❌ ${name}  (got ${text})`);
    }
  }

  const total = cases.length + pieceCount;
  console.log(failed ? `\n${failed} of ${total} failed` : `\nAll ${total} passed`);
  process.exit(failed ? 1 : 0);
});
