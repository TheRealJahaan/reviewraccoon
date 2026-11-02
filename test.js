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

console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nAll ${cases.length} passed`);
process.exit(failed ? 1 : 0);
