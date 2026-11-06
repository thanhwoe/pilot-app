# Plan: Web: remove the unused name from the create-group failure state

Issue: #54 · Spec: [54.md](54.md) · Runs on: `cloud` · Status: waiting for gate 2

## Contracts

None. No endpoint, shared schema or migration changes, and no change in `apps/mobile` or `packages/shared`.

One internal type changes, `CreateGroupState` in `apps/web/src/app/actions.ts`, which only the web form and its action use (`grep -rln CreateGroupState apps packages` finds `actions.ts` and `create-group-form.tsx`, nothing else):

| Result of `createGroupAction`                             | Before                  | After                                    |
| --------------------------------------------------------- | ----------------------- | ---------------------------------------- |
| Create succeeds                                           | `{}`                    | `{ name }`, the submitted value as typed |
| Create fails (empty name, API unreachable, 404, 429, 400) | `{ error, name }`       | `{ error }`                              |
| Session rejected                                          | redirects to `/sign-in` | unchanged                                |

## Files

| File                                     | Change                                                                                                                    | AC   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---- |
| `apps/web/src/app/actions.test.ts`       | Failure rows expect `{ error }` and nothing else; new success tests expect `{ name }`, also untrimmed                     | 1, 5 |
| `apps/web/src/app/actions.ts`            | Failure returns `{ error }`; success returns `{ name }`; the doc comment on `CreateGroupState` says what `name` now means | 1, 5 |
| `apps/web/e2e/groups.spec.ts`            | New test: a name typed while a successful create is pending stays in the field                                            | 3, 4 |
| `apps/web/src/app/create-group-form.tsx` | The effect clears the field only when it still equals the `name` in the success state                                     | 3, 4 |

## Steps

1. `cloud` · AC 1, 5 · In `actions.test.ts`, first: change the four failure rows to `toStrictEqual({ error })` (`toEqual` would let a `name: undefined` through, and the spec says no `name` field), and add success tests: `{ name: "Đà Lạt" }`, `{ name: "  Đà Lạt  " }` for a name with spaces (as typed, not trimmed), and `refresh` called once. They fail because the failure still returns `name` and the success returns `{}` → change `actions.ts` · done when `pnpm --filter @gop/web test` and `pnpm --filter @gop/web typecheck` pass, and `pnpm --filter @gop/web test:e2e groups.spec.ts` still passes (the form clears on any state without an `error`, so a success state of `{ name }` still clears it).
   - Search run: `grep -rn "state\.name\|CreateGroupState\|createGroupAction" apps/web --include=*.ts --include=*.tsx` finds `create-group-form.tsx:5` and `:7` and `:10` (the type and `useActionState`, no read of `.name`), `actions.ts` (the definition) and `actions.test.ts:5,38,54` (the only assertion on `name`). `groups.spec.ts:140` is a test title. The form never reads `state.name` today. Re-run it after the change: `actions.test.ts` must be the only file that still mentions `name:` for this state, and only for the success value.
2. `cloud` · AC 3, 4 · In `groups.spec.ts`, first, add `#54 AC 3`, modelled on `#51 AC 1`: hold the first Server Action, type `Nhà` while `Đà Lạt` is being created, release it. Expect the group `Đà Lạt` in the list and `Nhà` still in the field. Then click "Tạo nhóm" and expect two groups and an empty field (that is AC 4 again, after a kept name). It fails because the effect clears the field on every success → change the effect in `create-group-form.tsx` to `if (state.name !== undefined) setName((typed) => (typed === state.name ? "" : typed))` · done when `pnpm --filter @gop/web test:e2e groups.spec.ts` passes, with `#20 AC 2`, `#20 AC 3`, `#51 AC 1` and `AC 15` unchanged. AC 2 is those existing tests, and AC 4 is `#20 AC 3`, `AC 15` and the new test's tail.
   - Search run: `grep -n "setName\|state\." apps/web/src/app/create-group-form.tsx` finds the effect, the `state.error` message and the `useActionState` line. After the change the effect reads `state.name` and the message still reads `state.error`; nothing reads the old `state !== initialState` test, so `initialState` is only the argument of `useActionState`.
3. `cloud` · AC 1, 3, 5 (proof, no commit of its own) · Show that each new test fails without its fix: put `name` back in the failure return, so the `{ error }` rows fail; remove the comparison in the effect (always clear), so `#54 AC 3` fails. Copy each file first and copy it back, never `git checkout` a directory. · done when both fail, then pass again with the files restored.

## Verification

- Each step: `pnpm lint && pnpm typecheck && pnpm test` from the root.
- Steps 1 and 2: `pnpm --filter @gop/web test:e2e groups.spec.ts`, then the whole `pnpm --filter @gop/web test:e2e` once at the end (Playwright runs in the cloud here; if its browser hosts are blocked, it runs in CI).
- `verify` web: the home page form, for AC 2, 3 and 4 in a browser, covered by the E2E run above. No API or mobile `verify`, since nothing there changes.
- No screenshots: the form shows and keeps the same things, except in the race in AC 3.

## Risks

- **Same name typed while pending.** If the member types exactly the submitted name while the create is pending, the field is cleared, because it can't be told apart from an untouched one. The spec's AC 4 accepts this.
- **Timing in the new E2E test.** It holds the first Server Action with `page.route`, as `#51 AC 1` does, and waits for the hold before typing, so it times out instead of passing for no reason. It could still fail for the wrong reason on a very slow runner; the `#51` test has run in CI since it merged.
- **A copy of the hold code.** The new test needs the same ~20 lines as `#51 AC 1`. The issue's non-goals forbid changing other tests, so I don't extract a helper from that test. The new test gets its own small local helper, and the two can be merged later if you want that. Question for the author: is a later cleanup wanted, or is the copy fine?
- **A repeated success.** Each success returns a new state object, so the effect runs again. I looked for a case where two successes with the same name would not clear the field and found none (the updater compares the field to the new `name`). The spec leaves a separate test for that out, so I add none.
- **Open pull requests.** None are open (`gh api repos/thanhwoe/pilot-app/pulls` returns no rows). The PR for #51 (#56) is merged, and this builds on its controlled input.
- **Rollback:** revert the PR. There is no data or API change.
