const { isRefactorOnly } = require("./src/fingerprint");

const original = `
const fetchUser = (userId) => {
  if (!userId) return null;
  return { id: userId, name: \`user \${userId}\` };
};
const login = (userId, password) => {
  const user = fetchUser(userId);
  if (password.length < 6) return false;
  return user !== null;
};
module.exports = { fetchUser, login };
`;

// Test 1: rename a variable and reformat. Should be a refactor.
const renamed = `
const fetchUser = (userId) => {
  if (!userId) return null;
  return { id: userId, name: \`user \${userId}\` };
};
const login = (userId, password) => {
  const currentUser = fetchUser(userId);   // renamed!
  if (password.length < 6) {
    return false;
  }
  return currentUser !== null;
};
module.exports = { fetchUser, login };
`;

// Test 2: change the password rule. Should be a behavior change.
const stricter = original.replace("password.length < 6", "!password || password.length < 8");

// Test 3: rename an exported function. Other files would break, so it's a behavior change.
const renamedExport = original.replaceAll("fetchUser", "getUser");

console.log("Test 1, rename a variable:  ", isRefactorOnly(original, renamed) ? "🦝 refactor only" : "⚠️ behavior change");
console.log("Test 2, stricter password:  ", isRefactorOnly(original, stricter) ? "🦝 refactor only" : "⚠️ behavior change");
console.log("Test 3, rename an export:   ", isRefactorOnly(original, renamedExport) ? "🦝 refactor only" : "⚠️ behavior change");