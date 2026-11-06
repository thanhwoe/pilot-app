# Plan: Web: the sign-in code field can lose an edit made while its action is pending

Issue: #59 · Spec: [59.md](59.md) · Runs on: `cloud` · Status: waiting for gate 2

## Contracts

None. No HTTP, schema or migration changes, and `packages/shared` stays as it is. Only `apps/web/src/app/sign-in/sign-in-form.tsx` changes, plus one new test.

## What the code does today

Read in full: `sign-in-form.tsx`, `actions.ts`, `apps/web/e2e/sign-in.spec.ts` and `apps/web/e2e/helpers.ts`.

- The code input has no `defaultValue` and no state. React resets an uncontrolled field when a Server Action ends, so after the action it goes back to empty. A code typed while a wrong-code request was pending is replaced by an empty field. This is a hypothesis from reading the code, as the issue says. Step 1 tests it before anything changes.
- A wrong code leaves the member on the code step: `submitCode` returns `{ step: "code", email, error }`. The field stays mounted, so the reset hits the same input.
- Today, after a wrong code, the field is emptied even when nothing was typed meanwhile. No test asserts that: the tests for a wrong code (`AC 4`), a code that isn't 6 digits (`[security] AC 17`) and five wrong codes (`[security] AC 18`) check the alert, the URL and the cookie only.
- `goToCodeStep` ends on the code step. `holdFirstServerAction` counts only the requests sent after it is registered, so registering it after `goToCodeStep` makes the first held request the code submit. The helper needs no change.
- After #51 and #55, the code input is the last uncontrolled field in the two `useActionState` forms under `apps/web/src` (`grep -rn "useActionState\|defaultValue" apps/web/src --include=*.tsx` finds only the create-group form and the sign-in form, and no `defaultValue`). The `CLAUDE.md` rule "Action forms" says such fields are controlled.

## Files

| File                                        | Change                                                                                                                                                                                                              | AC   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `apps/web/e2e/sign-in.spec.ts`              | New test `#59 AC 1: ...`: after reaching the code step, holds the first sign-in Server Action, submits a wrong code, types the right code, releases the failure; the field holds the typed code and the error shows | 1, 2 |
| `apps/web/src/app/sign-in/sign-in-form.tsx` | The code input becomes controlled, in a small `CodeField` with its own state, used only on the code step. Same shape as `EmailField` from #55                                                                       | 1, 2 |

No change to `actions.ts`, the email step's field, the other tests, `helpers.ts`, `packages/shared`, the API or mobile.

## Steps

1. `cloud` · AC 1, 2 · Write the test first, in `sign-in.spec.ts`, next to the `#55 AC 1` test. It makes a `uniqueEmail`, goes to the code step with `goToCodeStep`, reads the real code with `devCode`, and only then registers `holdFirstServerAction(page, "/sign-in")`, so the held request is the code submit. It fills a wrong code (`000000`, or `111111` if that is the real one) and presses "Đăng nhập", waits until the request is held, fills the real code, releases it, and expects the wrong-code alert "Mã không đúng hoặc đã hết hạn. Hãy thử lại hoặc yêu cầu mã mới." and the field to hold the real code. Then it presses "Đăng nhập" and expects the home page (AC 2's outcome, as the existing `AC 3, 9` test checks it). Run it on the current code with `pnpm --filter @gop/web test:e2e --repeat-each=10 -g "#59"` · done when it fails 10 of 10 with the field empty (`Received: ""`) where the real code was expected. **If it passes on the current code, the loss does not reproduce:** stop and go back to you; per the spec the PR then says so, the test stays as a regression guard, and nothing else changes
2. `cloud` · AC 1, 2 · Add `CodeField` to `sign-in-form.tsx`: a controlled input with its own `useState("")`, used only on the code step, with the label, `id="code"`, `name="code"`, `inputMode`, `autoComplete` and `required` it has today. Commit it together with step 1, so every commit stays green. The searches before the change: `grep -rn 'name="code"\|field(form, "code")\|id="code"' apps` finds the input in `sign-in-form.tsx` and the read in `actions.ts:25`, which keep working because the field's name and id stay the same; `grep -rn 'getByLabel("Mã")' apps` finds only `helpers.ts` and `sign-in.spec.ts`, whose label text stays the same · done when `pnpm --filter @gop/web test:e2e e2e/sign-in.spec.ts` passes, including the new test, `AC 3, 9`, `AC 4`, `AC 5`, `[security] AC 17`, `[security] AC 18` and `#55 AC 1`, and `pnpm lint && pnpm typecheck` pass
3. `cloud` · AC 1, 2 · Prove the new test fails without the fix: commit step 2, then take `sign-in-form.tsx` back to its previous version with `git show HEAD~1:<file> > <file>`, run `-g "#59"`, and restore it with `git checkout HEAD -- <file>`. Then run `pnpm --filter @gop/web test:e2e --repeat-each=10 e2e/sign-in.spec.ts` (without the `--`), the full web suite once, and `pnpm lint`, `pnpm typecheck` and `pnpm test`, each as its own command with its exit status read · done when the test fails without the fix and every command above passes

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @gop/web test:e2e`, each on its own, and `pnpm --filter @gop/web test:e2e --repeat-each=10 e2e/sign-in.spec.ts`.
- `verify` for web, by running the production build in Chromium with a held request: the right code stays in the field next to the wrong-code error, then signing in works. A screenshot goes to `docs/evidence/59/`.
- No API or mobile `verify`: nothing changes there.

## Risks

- **It may not reproduce.** If step 1 passes on the current code, the plan stops there, as the spec says.
- **A wrong code now stays in the field.** Today, after a wrong code, the field is emptied even when the member typed nothing more. A controlled field keeps what was in it. That helps a typo (for example a 5-digit code from `[security] AC 17`, which can be completed), and it matches what #51 and #55 did for their fields, but it is a visible change that the spec does not mention. No test asserts the empty field. Question for the author, in the comment: keep the wrong code in the field, or clear it when the request ends and the member typed nothing meanwhile? The plan assumes keep.
- **Attempt limit.** The new test makes one wrong attempt for its own email, within the limit of 5 wrong codes, so it cannot lock itself out. `[security] AC 18` is unchanged.
- **The hold must be registered after `goToCodeStep`.** Registered before, it would hold the email submit instead. The test waits on `held`, so a wrong order fails by timing out, not by passing.
- **The held request relies on Next's `next-action` header.** If a Next upgrade renames it, the test finds no held request and fails loudly instead of passing.
- **Mobile.** The mobile sign-in screen is out of scope, and I did not read it.
- **Open PRs and merge order.** Searched: `gh api repos/{owner}/{repo}/pulls`, then `.../pulls/<n>/files` for each open PR. No PR is open, so there is nothing to order. The branch contains main, including #55's `EmailField` and the `CLAUDE.md` "Action forms" rule.
- **Rollback:** revert the two files. No data, API or shared code is touched.
