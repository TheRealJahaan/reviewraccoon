# 🦝 ReviewRaccoon

[![Tests](https://github.com/TheRealJahaan/reviewraccoon/actions/workflows/test.yml/badge.svg)](https://github.com/TheRealJahaan/reviewraccoon/actions/workflows/test.yml)

**Most of a pull request is noise. ReviewRaccoon proves which part.**

A 400-line pull request often has only 14 lines that change what the code does. The rest is renames, reformatting and moved code, but a reviewer can't tell which is which without reading everything.

ReviewRaccoon reads every changed JavaScript and TypeScript file and posts one comment that says:

- **How much really changed:** "Only 14 of 412 changed lines need a careful look."
- **Exactly where:** the functions, classes and methods that behave differently, with links to their lines.
- **What's safe to skim:** files where only formatting, comments or local names changed.

<p align="center">
  <img src="docs/comment.png" width="640" alt="A ReviewRaccoon comment: only 2 of 11 changed lines need a careful look, with links to the login function and the Cart.total method">
</p>

It updates the same comment on every push, so it never spams the pull request.

## Not a guess. A proof.

ReviewRaccoon doesn't use AI. It turns the old and new version of each file into a syntax tree, strips out everything that can't change behavior, and compares the two trees, piece by piece. A piece is only called safe when it is provably the same.

**Ignored (safe to skim):**
- Formatting, whitespace, semicolons and quote style
- Comments
- Braces around a single statement
- Renaming local variables, parameters, functions, classes and imports, scope by scope
- Moving a function or class to another place in the same file

**Always flagged (needs a careful look):**
- Any change to logic, values, strings or calls
- Renaming anything other files can see: exports, object keys, properties, class methods
- A rename that makes a name point at a different variable
- Code that now runs in a different order
- Type changes in TypeScript

When it isn't sure, it flags the code. A false alarm costs you a minute. A missed bug costs much more.

## Your code never leaves GitHub

ReviewRaccoon runs inside your own GitHub Actions runner. There's no server, no account, no API key and no AI model. Your code is never sent anywhere.

## Install in 1 minute

Add this file to your repository as `.github/workflows/reviewraccoon.yml`:

```yaml
name: ReviewRaccoon

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  sort:
    runs-on: ubuntu-latest
    steps:
      - uses: TheRealJahaan/reviewraccoon@v1
```

Then open a pull request that changes a `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs` or `.cjs` file. The raccoon comments within about 20 seconds.

## How noisy are your pull requests?

The scanner runs ReviewRaccoon over the recent merged pull requests of any public repo and tells you how many changed lines actually changed behavior.

```bash
git clone https://github.com/TheRealJahaan/reviewraccoon
cd reviewraccoon
npm install
GITHUB_TOKEN=$(gh auth token) node scripts/scan.js facebook/react vercel/next.js --prs 100
```

It prints a summary for each repo and saves every pull request's numbers to `scan-results.json`.

## Limitations

- JavaScript and TypeScript only for now.
- Each file is compared on its own, so code moved from one file to another shows up as a deletion and a new file.
- Inside a function that changed, every changed line counts as needing a look, even a rename on the next line.
- Some rewrites that do the same thing, such as turning an arrow function into a `function`, are flagged on purpose.
- Pull requests from forks get a read-only token from GitHub, so the raccoon can't comment on them. It puts the same report on the run's summary page instead.

## Run the tests

```bash
npm install
npm test
```

## Roadmap

- Python, Go and Java support
- Detect code moved between files
- Optional AI review of only the lines that changed behavior, with your own API key
- Comments on pull requests from forks

Found a refactor it flagged, or a behavior change it missed? [Open an issue](https://github.com/TheRealJahaan/reviewraccoon/issues) with the before and after code.

## License

MIT
