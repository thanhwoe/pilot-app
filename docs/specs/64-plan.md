# Plan: Test: hold Server Actions with the shared helper in groups.spec.ts

Issue: #64 · Spec: [64.md](64.md) · Runs on: `cloud` · Status: waiting for gate 2

## Contracts

None. No HTTP, schema or migration changes. Only `apps/web/e2e/groups.spec.ts` changes.

## What the code does today

Read in full: `apps/web/e2e/helpers.ts`, `apps/web/e2e/groups.spec.ts`, `apps/web/src/app/create-group-form.tsx` and `apps/web/src/app/actions.ts`.

- `holdFirstServerAction(page, path)` in `helpers.ts` routes requests to `path`, holds the first Server Action POST (`POST` with a `next-action` header), and returns `{ held, release }`. `sign-in.spec.ts` already uses it (`holdFirstServerAction(page, "/sign-in")`).
- `groups.spec.ts` has two copies of the same code, line for line apart from comments:
  - inline in `#51 AC 1` (lines 105–125): `release`, `released`, `markHeld`, `held`, `actions` and the `page.route` call, for path `/`;
  - `holdFirstAction(page)` (lines 144–166), used once, by `#54 AC 3, 4` (line 173).
- The Assumption in the spec holds: both copies match the helper, so the helper stays as it is.
- Neither copy has another reader: `grep -rn "holdFirstServerAction\|holdFirstAction\|markHeld" apps` finds `markHeld` only in `helpers.ts` and in the two copies, `holdFirstAction` only in its definition and its one call, and `holdFirstServerAction` in `helpers.ts` and `sign-in.spec.ts`.
- After the change `groups.spec.ts` still needs `Page` (used by `groupsList` and `createGroup`).

## Files

| File                          | Change                                                                                                                                                                                                                                                                                                                        | AC      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `apps/web/e2e/groups.spec.ts` | Import `holdFirstServerAction` from `./helpers`. In `#51 AC 1`, replace the inline block with `const { held, release } = await holdFirstServerAction(page, "/");`, keeping the comment that says why the action is held. Delete `holdFirstAction`, and call `holdFirstServerAction(page, "/")` in `#54 AC 3, 4`. Nothing else | 1, 2, 3 |

No change to `helpers.ts`, to what any test asserts, or to app code.

## Steps

1. `cloud` · AC 1, 3 · The test is the existing pair, `#51 AC 1` and `#54 AC 3, 4`, so no new test. First record that both pass before the change: `pnpm --filter @gop/web test:e2e e2e/groups.spec.ts` · done when it passes. Then edit `groups.spec.ts` as in **Files** · done when `rg -n "markHeld|holdFirstAction" apps/web/e2e/groups.spec.ts` finds nothing, `rg -n 'holdFirstServerAction\(page, "/"\)' apps/web/e2e/groups.spec.ts` finds two calls, and `pnpm --filter @gop/web test:e2e e2e/groups.spec.ts`, `pnpm lint` and `pnpm typecheck` pass. Commit: `test(web): hold the Server Action in groups.spec.ts with the shared helper (#64)`
2. `cloud` · AC 2 · Show that both tests still fail without their fixes, on a scratch branch off the step 1 commit (`git switch -c scratch/64-revert-fixes`), one fix at a time. A plain `git revert d9f12bc` or `git revert 9b169f5` stops with conflicts (later commits changed the same lines; checked with `git revert --no-commit`), so undo each fix by hand:
   - **#54**: `git show 9b169f5 -- apps/web/src/app/create-group-form.tsx | git apply -R` puts back the effect that clears the field on any success. Run `pnpm --filter @gop/web test:e2e -g "#54 AC 3, 4"` · done when it fails on the field holding `""` where `"Nhà"` was expected. Then `git checkout -- apps/web/src/app/create-group-form.tsx`.
   - **#51**: `git show d9f12bc^:apps/web/src/app/create-group-form.tsx > apps/web/src/app/create-group-form.tsx` puts back the uncontrolled `defaultValue={state.name}` input. Run `pnpm --filter @gop/web test:e2e -g "#51 AC 1"` · done when it fails on the field not holding `"Đà Lạt"`. If it passes instead, the helper does not hold the request the way the old copy did: stop and go back to you. Then `git checkout -- apps/web/src/app/create-group-form.tsx`.

   Each failure is run to the end with its output kept, and goes into the PR description. Nothing from the scratch branch is pushed or merged; delete it afterwards. Checking this at the original commits (`git switch --detach d9f12bc^`) is not an option: the tests in `groups.spec.ts` at those commits are the old copies, not the changed file.
3. `cloud` · AC 3 · Back on the issue's branch, run the repeat from the issue: `pnpm --filter @gop/web test:e2e --repeat-each=5 e2e/groups.spec.ts` (no `--`, which pnpm 11 would pass on to Playwright; #51), then `pnpm lint`, `pnpm typecheck` and `pnpm test`, each as its own command with its exit status read · done when every run in the repeat passes and the three commands pass

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @gop/web test:e2e` and `pnpm --filter @gop/web test:e2e --repeat-each=5 e2e/groups.spec.ts`, each on its own. Playwright needs `pnpm db:up` and Chromium; if the cloud environment blocks the browser hosts, run these steps on the Mac mini or let CI's `e2e` job run them, and say so in the PR.
- AC 2 evidence: the two failing runs from step 2 and the two commands that made them, in the PR description.
- No `verify` for web, API or mobile: no page, endpoint or screen changes.
- No screenshots: no UI change.

## Risks

- **Nothing in production changes.** Only a test file is edited, so rollback is `git revert` of the one commit.
- **A test could stop failing without its fix.** The helper and the copies match, so this is unlikely. Step 2 checks it for both tests; it is the only proof for AC 2.
- **Flakiness.** Both tests share the helper's `/` route with `signIn`, which runs before the helper is called, as before. Step 3 repeats the whole file five times to see it.
- **Open PRs.** There are none (`gh api 'repos/thanhwoe/pilot-app/pulls?state=open'` returns an empty list), so nothing touches `groups.spec.ts` or `helpers.ts` at the same time. #59, which the issue names, will use the helper after this merges.
