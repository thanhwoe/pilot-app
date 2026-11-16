# Plan: Mobile: a failed reload after saving an expense must not invite a second save

Issue: #107 · Spec: [107.md](107.md) · Runs on: `cloud` · Status: waiting for gate 2

## Contracts

None. No schema, endpoint, migration or copy changes. The screen reuses `expensesCopy.unavailable`, `expensesCopy.retry`, `expensesCopy.loading` and the test IDs `group-screen-error`, `group-screen-retry` and `expenses-loading`.

## Files

| File                                    | Change                                                                                                                                                                                                                                                                     | AC                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `apps/mobile/src/group-screen.test.tsx` | New tests in a `describe("a failed reload after a save")` block: the save is accepted and the reload fails (three errors), the retry works, two presses on retry, a 401 on the reload                                                                                      | 1, 2, 3, A1-A3, A5 |
| `apps/mobile/src/group-screen.tsx`      | `load()` keeps a loaded screen when a reload answers `unavailable` and records that the reload failed; the retry reloads without hiding the rows; the loaded branch shows the error and "Thử lại" above the rows; the form closes after a save whatever the reload answers | 1, 2, 3, A1-A3, A5 |

No other file changes. `apps/mobile/src/lib/expenses.ts`, `packages/shared` and the API are untouched, as the spec's scope says.

## Steps

1. `cloud` · AC 1, A1, A2 · Write first, in `group-screen.test.tsx`: (a) open the form on a group with one expense, fill 90000 and "An toi", the save answers 201, the next `getGroup` answers `unavailable`: the old row is still shown, `group-screen-error` and `group-screen-retry` show, `expense-amount-input` and `save-expense` are gone, `createExpense` was called once; (b) the same with `listExpenses` answering `not_found` and `too_many_requests` (`test.each`, as the existing `a failure with %s keeps the token` does). Then change `group-screen.tsx`: add `reload` state (`"idle" | "failed"`); in `load()`, when the answer is `unavailable` and the current screen is `loaded`, keep that screen and set `reload` to `failed` (a functional `setScreen`, so `load` needs no new dependency); any other answer sets the screen and `reload` back to `idle`; render the error and retry button in the loaded branch when `reload` is `failed`; `onSaved` still calls `load()` and then `setAdding(false)`, so the form, which owns the typed values, is unmounted and they are dropped · done when `pnpm --filter @gop/mobile test group-screen` passes. The tests in (a) and (b) fail on the current code: it replaces the screen with the error, so the old row and the closed form can't both be checked. A failed first load has no loaded screen to keep, so it still shows only the error (spec A4, the existing test `a failed first load shows the connection error and a retry button, keeps the token, and the retry loads`). The retry in this step is still the existing `retry()`, which blanks the screen while it loads; step 2 changes that.
2. `cloud` · AC 2, AC 3 [security], A3, A5 · Write first: (a) after the failed reload of step 1, `getGroup` answers the group and `listExpenses` a list holding the new expense, press `group-screen-retry`: the new row shows once, the error is gone, `createExpense` was called once in all; (b) while the retry is held, the old rows are still shown and `expenses-loading` shows; (c) two presses on `group-screen-retry` before a re-render send one load (`getGroup` called once after `mockClear`, built like `two presses on retry before a re-render send one load`); (d) `[security]` the reload after a save answers 401 on `getGroup` and, in a second case, on `listExpenses`: the token is deleted and `group-screen` is gone (built like `[security] #97 AC 9: a 401 on the save deletes the token and shows sign-in`); (e) a retry after the failed reload that answers `unavailable` again keeps the rows and shows the error again. Then change `retry()` in `group-screen.tsx`: when the screen is `loaded`, keep it, set `reload` to `running` (the loading line shows, the error and button hide), call `load()`, and keep the `retrying` ref guard; when the screen is not loaded, it behaves as today (`setScreen(null)`, then `load()`) · done when `pnpm --filter @gop/mobile test group-screen` passes. Honest about the fail-first: (a), (d) and (e) may pass on the code of step 1, because the existing retry already reloads and the guard already handles 401 on any load; they pin the changed retry path. (b) fails on the step 1 code, which blanks the screen during a retry. For (c), if it doesn't fail with the `retrying` guard removed, keep the guard and say why under **Differs from the plan**.

## Verification

- `pnpm lint && pnpm typecheck && pnpm test` from the repo root, each on its own.
- `pnpm --filter @gop/mobile test` runs the new tests and the existing ones in `group-screen.test.tsx` unchanged.
- No `verify` run: the change is a state change inside one screen, with no web page, API endpoint or Maestro flow to run. The spec rules out a Maestro flow, since the failure can't be produced on a simulator without a fault-injecting API.
- Searches run for this plan:
  - `grep -rn "group-screen-error\|group-screen-retry\|expenses-loading" apps/mobile/src apps/mobile/.maestro` finds only `group-screen.tsx` and `group-screen.test.tsx` (the Maestro flows don't read them), so no flow changes.
  - `grep -rn "GroupScreen\b" apps/mobile/src` finds only `group-screen.tsx`, its test and the route `src/app/groups/[id].tsx`, which passes `groupId` and nothing else; the props don't change.
  - No field, export or function is removed or renamed.
  - Existing tests that compare a whole text or shape in this screen: none. They read single test IDs. The loaded-branch assertions in `saving sends me as the payer and every member, ...` read `expense-description` and `expenses-empty` only.

## Risks

- **No change for any other user or data.** Mobile screen only, no API call changes, no migration. Rollback is a revert of the two commits.
- **A reload that fails after a save leaves a list that is stale until "Thử lại" works.** That is the point of the issue, and the screen says so with the connection error.
- **Question for the author, outside the spec, so not in the steps:** while the error shows, the "add expense" button still opens a blank form. A user who doesn't press "Thử lại" and adds the same expense by hand would still make a duplicate. Hiding the add button until the reload works would close that, but the spec doesn't ask for it. Should it be a follow-up issue?
- **Question for the author:** the stale member list. A reload that failed keeps the members the screen last loaded, so a member who joined meanwhile is missing from the next save's split until the reload works. The spec's assumption 6 in #97 says that stays valid; no change proposed.
