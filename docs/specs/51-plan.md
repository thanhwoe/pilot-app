# Plan: Test: #20 AC 3 web e2e test is flaky, main is red

Issue: #51 · Spec: [51.md](51.md) · Runs on: `cloud` · Status: waiting for gate 2

## Cause

Found before planning, by holding the first Server Action open in a scratch script. It is confirmed, not guessed.

- The create-group input is uncontrolled and uses `defaultValue={state.name}`. When a Server Action finishes, React resets the form, and the reset puts `defaultValue` back into the field.
- `#20 AC 3` submits spaces, then checks `toHaveValue("   ")`. That check passes as soon as the typed spaces are in the field, while the first action is still running. It does not wait for the action to finish.
- The test then fills "Đà Lạt". If the first action finishes after that, the reset overwrites "Đà Lạt" with the old " ". The disabled button makes the click wait for the action, so it then submits " " again, shows the empty-name error, and the list stays empty: `Received: 0`, with no `<ul>` at all.
- With the first request held, the script printed: field `"   "` after the guard, `"Đà Lạt"` after typing, then `"   "` after the action finished, with the alert "Hãy nhập tên nhóm." and one Server Action sent.
- It only shows when the first action is slow. That fits CI (cold server, shared CPU) and fits AC 15 passing, because AC 15 has no failed create first. It does not reproduce on this machine: `--repeat-each=10` ran 80 of 80 passed here.

It is a real app behavior, not only a test race: text typed while a create is pending is lost when the result arrives. The #20 case, an unreachable API with a 5 s timeout, is where a person is most likely to type during the wait. So, as the spec says, the fix goes in the app.

## Contracts

None. No HTTP, shared-schema or migration changes. The form's own state type `CreateGroupState` in `apps/web/src/app/actions.ts` may lose its `name` field, which #20 added only to feed `defaultValue`. Nothing else reads it.

## Files

| File                                     | Change                                                                                                                                                                                                                   | AC   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `apps/web/e2e/groups.spec.ts`            | New test `#51 AC 1: ...` that holds the first Server Action open, types the next name while it is pending, releases it, and expects the field to still hold the typed name; it then submits and expects the group listed | 1, 3 |
| `apps/web/src/app/create-group-form.tsx` | The input becomes controlled (`value` and `onChange`), so a form reset cannot overwrite what is typed; the field is cleared when a create succeeds and left alone when it fails                                          | 2, 3 |
| `apps/web/src/app/actions.ts`            | Drop `name` from `CreateGroupState` and from the failure return, because the controlled input no longer needs it (REVIEW.md: no dead code)                                                                               | 3    |

No change to other tests, to `#20 AC 3` itself, to mobile, the API or `packages/shared`.

## Steps

1. `cloud` · AC 1 · Write the reproduction test first, in `groups.spec.ts`. It routes the page's Server Action POSTs (header `next-action`) and holds only the first one, signs in, submits `"   "`, waits until the held request is seen, fills `"Đà Lạt"`, releases the request, and waits for the alert "Hãy nhập tên nhóm.". Then it expects the field to hold `"Đà Lạt"`, submits, and expects the group listed with "1 thành viên" and an empty field. It must fail if no request was held, so it can't pass by accident. Run it on the current code with `pnpm --filter @gop/web test:e2e --repeat-each=10 -g "#51"` and see it fail all 10 times, with the field holding `"   "` where `"Đà Lạt"` was expected · done when it fails 10 of 10 for that reason
2. `cloud` · AC 2, 3 · Make the input controlled in `create-group-form.tsx` and clear it on a successful create only; remove the unused `name` from `CreateGroupState` and the failure return in `actions.ts`. Keep `#20 AC 2` (a failed create keeps what was typed) and the success path of AC 15 and `#20 AC 3` unchanged · done when `pnpm --filter @gop/web test:e2e e2e/groups.spec.ts` passes, including `#51 AC 1`, `#20 AC 2`, `#20 AC 3`, `AC 15` and `AC 16`, and `pnpm lint && pnpm typecheck` pass
3. `cloud` · AC 2 · Run the spec's repeat run, without the `--` (see Risks): `pnpm --filter @gop/web test:e2e --repeat-each=10 e2e/groups.spec.ts`, then the full web suite once and `pnpm test` · done when all 10 runs of `#20 AC 3` pass and `pnpm lint && pnpm typecheck && pnpm test` pass

## Verification

- `pnpm lint && pnpm typecheck && pnpm test`
- `pnpm --filter @gop/web test:e2e --repeat-each=10 e2e/groups.spec.ts`, and the full `pnpm --filter @gop/web test:e2e` once. It needs `pnpm db:up` and Chromium, and it ran in this cloud session.
- The reproduction's failing output from step 1, with the fix absent, goes into the PR beside the cause above. That is the evidence for AC 1.
- `verify` for web: the page with a held request, to see the field keep the second name. The test already does this, so a screenshot is optional.
- No API or mobile `verify`: nothing changes there.

## Risks

- **AC 2's command does not repeat anything.** With pnpm 11 the `--` is passed on to Playwright, which then reads `--repeat-each=10` and the file as file filters. I ran `pnpm --filter @gop/web test:e2e -- --repeat-each=10 e2e/groups.spec.ts` and it ran all 27 tests once. Without the `--` it ran 80 tests, 10 of them `#20 AC 3`. The plan uses the second form. Question for the author: correct the command in the spec at the next revision?
- **Repeating the test cannot prove the fix here.** The flake does not show locally (80 of 80 passed), so a green `--repeat-each=10` was already true before the fix. The held-request test from step 1 is the proof that the cause is gone.
- **The reproduction relies on Next's `next-action` header.** If a Next upgrade renames it, the test finds no held request and fails loudly, by design, instead of passing.
- **A controlled input under React 19's form reset.** A controlled field should keep its value across the reset. If this React version still resets it, the fallback is to submit through an `onSubmit` handler that calls `formAction` inside a transition, which skips the automatic reset. Step 2's tests show which one is needed.
- **Question: typing while a _successful_ create is pending.** The same reset wipes whatever was typed for a next group once the success arrives, and the plan keeps that: it clears on success. The spec covers only the failed-then-valid case. Should the field be cleared only if it still holds the created name? Not in the steps until you say.
- **Question: the sign-in form has the same pattern.** `apps/web/src/app/sign-in/sign-in-form.tsx` uses `defaultValue={state.email}` on an action form, so an edit made while its action is pending would be reset the same way. It is outside this issue's scope, so I would file it as a separate issue if you agree.
- **The branch is behind main.** Main has only the kit sync (#53), nothing under `apps/web`, and no PR is open on the same files. CI's `up-to-date` job will ask for main to be merged into the branch before the PR can go green.
- **Rollback:** revert the three files. No data or API is touched.
