# Plan: Web: the sign-in email field can lose an edit made while its action is pending

Issue: #55 · Spec: [55.md](55.md) · Runs on: `cloud` · Status: waiting for gate 2

## Contracts

None. No HTTP, schema or migration changes, and `packages/shared` stays as it is. `SignInState` is also used by the mobile sign-in screen, so the shared state keeps its shape. Only `apps/web/src/app/sign-in/sign-in-form.tsx` changes.

## What the code does today

Read in full: `sign-in-form.tsx`, `actions.ts`, `packages/shared/src/sign-in/flow.ts` and `apps/web/e2e/sign-in.spec.ts`.

- The email input is uncontrolled, with `defaultValue={state.email}`, inside an action form. This is the pattern behind #51: React resets an uncontrolled field to its `defaultValue` when the action ends.
- An invalid email fails inside the action, with no API call, and returns `{ step: "email", email: <the raw text>, error }`. That makes the loss easy to force: submit `not-an-email`, edit the field to a valid address while the action is held, then let the failure come back. The reset would put `not-an-email` back.
- An API failure (429, unavailable) returns the normalized email instead.
- The email input only exists on the email step. It unmounts on the code step and mounts again when the member picks "Dùng email khác", which returns `changeEmail(email)` with the email filled in.
- The Server Action posts to `/sign-in`, the page's own URL.

This is a hypothesis from reading the code, as the issue says. Step 1 tests it before anything changes.

## Files

| File                                        | Change                                                                                                                                                                                         | AC   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `apps/web/e2e/sign-in.spec.ts`              | New test `#55 AC 1: ...`: holds the first sign-in Server Action, edits the email, releases a failure; the field holds the edit and the error shows. Modelled on `#51 AC 1` in `groups.spec.ts` | 1, 2 |
| `apps/web/src/app/sign-in/sign-in-form.tsx` | The email input becomes controlled, in a small `EmailField` that starts from `state.email` and owns its value. Only the email step's field changes                                             | 1, 2 |

No change to `actions.ts`, the code step's field, the other tests, `packages/shared`, the API or mobile.

## Steps

1. `cloud` · AC 1 · Write the test first, in `sign-in.spec.ts`. It routes the Server Action POSTs to `/sign-in` (header `next-action`) and holds only the first one, fills `not-an-email` and presses "Gửi mã", and waits until the held request was seen, so it times out and does not pass for no reason. Then it fills a valid `uniqueEmail(testInfo)`, releases the request, and expects the alert "Email không hợp lệ." and the field to hold the valid email. Then it presses "Gửi mã" and expects the code step with "Nhập mã 6 số đã gửi tới <email>". Run it on the current code with `pnpm --filter @gop/web test:e2e --repeat-each=10 -g "#55"` · done when it fails 10 of 10 with the field holding `not-an-email` where the valid email was expected. **If it passes on the current code, the loss does not reproduce:** stop and go back to you; per the spec the PR then says so, the test stays as a regression guard, and nothing else changes
2. `cloud` · AC 1, 2 · Add `EmailField` to `sign-in-form.tsx`: a controlled input with its own `useState(state.email ?? "")`, used only on the email step, so a failure leaves what is typed and a return from the code step starts from `state.email`. Commit it together with step 1, so every commit stays green · done when `pnpm --filter @gop/web test:e2e e2e/sign-in.spec.ts` passes, including the new test and the existing `AC 2`, `AC 5`, `AC 6` and `AC 7`, and `pnpm lint && pnpm typecheck` pass
3. `cloud` · AC 1, 2 · Prove the new test fails without the fix: commit step 2, then take `sign-in-form.tsx` back to its previous version with `git show HEAD~1:<file> > <file>`, run `-g "#55"`, and restore it with `git checkout HEAD -- <file>`. Then run `pnpm --filter @gop/web test:e2e --repeat-each=10 e2e/sign-in.spec.ts` (without the `--`, which repeats nothing under pnpm 11; #51), the full web suite once, and `pnpm lint`, `pnpm typecheck` and `pnpm test`, each as its own command with its exit status read · done when the test fails without the fix and every command above passes

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @gop/web test:e2e`, each on its own, and `pnpm --filter @gop/web test:e2e --repeat-each=10 e2e/sign-in.spec.ts`.
- `verify` for web, by running the production build in Chromium with a held request: the field keeps the edit next to "Email không hợp lệ.", and a screenshot goes to `docs/evidence/55/`. Also check the one path the E2E tests don't assert: after "Dùng email khác" the email field holds the email again (the existing `AC 5` test only checks that the field is visible).
- No API or mobile `verify`: nothing changes there.

## Risks

- **It may not reproduce.** If step 1 passes on the current code, the plan stops there, as the spec says.
- **Normalization after a failed request.** Today, after an API failure, the field shows the normalized email (trimmed, lowercase). A controlled field shows exactly what was typed. No existing test asserts the normalized text, and `submitEmail` still returns it, so the shared tests are unchanged. Question for the author: is it fine that the field keeps what was typed, not the normalized email?
- **Coming back with "Dùng email khác".** `EmailField` starts from `state.email` each time it mounts, which is what refills the field today. `AC 5` doesn't check the value, so the verify step above covers it. Question for the author: add an assertion to `AC 5`? It is an existing test, so it is not in the steps.
- **The held request relies on Next's `next-action` header.** If a Next upgrade renames it, the test finds no held request and fails loudly instead of passing.
- **Mobile.** The mobile sign-in screen uses the same shared state. I did not read it, and it is out of scope here: the issue covers web only.
- **Open PRs and merge order.** Searched: `gh api repos/{owner}/{repo}/pulls` with `.../pulls/<n>/files` for each open PR, and `grep` for `SignInForm`, `signInAction` and `SignInState` under `apps` and `packages`. No PR is open, so there is nothing to order. The branch already contains main, so #51's fix (merged in #56) is in it.
- **Rollback:** revert the two files. No data, API or shared code is touched.
