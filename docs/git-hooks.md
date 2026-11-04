# Git hooks

Two checks run on your machine before code leaves it: one when you commit,
one when you push. They catch in seconds what CI would otherwise catch in
minutes ([ci.md](./ci.md)).

- [What a Git hook is](#what-a-git-hook-is)
- [The two hooks](#the-two-hooks)
- [When you commit](#when-you-commit)
- [When you push](#when-you-push)
- [Skipping them](#skipping-them)
- [How they are set up](#how-they-are-set-up)

## What a Git hook is

A script Git runs by itself at a certain moment — before a commit is made,
before a push is sent. If the script fails, Git stops. This repository uses
two tools for them:

- **Husky** installs the hooks: the scripts live in `.husky/`, in the
  repository, so everyone gets the same ones.
- **lint-staged** runs commands on the files you are committing only (the
  *staged* files), not on the whole project, so the commit hook stays fast.

## The three hooks

| Hook | When | Runs | Why |
|------|--------------|--------------|-----|
| `pre-commit` | Before each commit | gitleaks on the staged files, then `npx lint-staged`: `eslint --fix` then `prettier --write` on the staged `.ts` and `.tsx` files, and on `k6/**/*.js` | No secret is committed; fixes what can be fixed and lays the code out the house way; stops the commit on a lint error it cannot fix |
| `commit-msg` | After you write the message | The [CONSTRAINTS.md](../CONSTRAINTS.md) floor on what the commit holds | No new `@ts-ignore` / `eslint-disable`, stubs, skipped tests, or tests removed without a `Tests-removed:` line |
| `pre-push` | Before each push | `pnpm test` | No push with a failing unit test |

The pre-commit hook needs [gitleaks](https://github.com/gitleaks/gitleaks)
on the PATH and fails, saying how to install it, when it is missing
(Windows: `winget install --id Gitleaks.Gitleaks -e`, then restart the
terminal or editor).

## When you commit

```bash
git add src/components/MyComponent.tsx
git commit -m "Add a component"
```

1. Husky runs `.husky/pre-commit`, which runs lint-staged.
2. lint-staged runs `eslint --fix` and `prettier --write` on
   `MyComponent.tsx`, and adds their fixes to the commit.
3. An ESLint error that `--fix` cannot fix stops the commit, with the file,
   the line and the rule. Fix it and commit again.

The rules are in `package.json`, under `"lint-staged"`.

## When you push

1. Husky runs `.husky/pre-push`: `pnpm test`, every unit test
   ([testing.md](./testing.md)).
2. All pass: the push goes ahead. One fails: the push is stopped, and the
   output names the test.

It does not run the type check or the build; CI does
([ci.md](./ci.md#the-checks-one-by-one)). `pnpm build` runs both locally.

## Skipping them

For an emergency only — CI runs the same checks anyway, so skipping them only
moves the failure:

```bash
git commit --no-verify -m "…"
git push --no-verify
```

## How they are set up

`pnpm install` runs the `prepare` script in `package.json`, which is
`husky`: it points Git at `.husky/`. Nothing else to do after cloning.

The Docker build skips this (`pnpm install --ignore-scripts`): there is no
`.git` inside a build, and the hooks would fail there.

| File | Content |
| --- | --- |
| `.husky/pre-commit` | `npx lint-staged` |
| `.husky/pre-push` | `pnpm test` |
| `package.json`, `"lint-staged"` | `*.{ts,tsx}` and `k6/**/*.js`: `eslint --fix`, `prettier --write` |

Further reading: [Husky](https://typicode.github.io/husky/),
[lint-staged](https://github.com/lint-staged/lint-staged),
[Git hooks](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks).
