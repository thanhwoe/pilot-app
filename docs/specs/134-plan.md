# Plan: Mobile: the group screen shows each member's balance and who pays whom

Issue: #134 · Spec: [134.md](134.md) · Runs on: `cloud, then mac` · Status: waiting for gate 2

## Contracts

No new schema, endpoint or migration. `GET /groups/:id/balances` (#96) and `balancesResponseSchema` already exist in `packages/shared/src/balances.ts` and the API route in `apps/api/src/expenses/routes.ts` is used as it is. Added in `packages/shared`:

- `GroupsApi.getBalances(token, groupId): Promise<ApiResult<BalancesResponse>>`, implemented in `createGroupsApi` with `balancesResponseSchema` (a body that fails the schema is an error, not figures).
- `loadBalances(api, token, groupId): Promise<BalancesState>` calls `getBalances` and `getGroup` together, so the section has its own member list for the emails and does not depend on the expenses load (a failed expenses load must not turn every email into "Thành viên khác"). `BalancesState = { kind: "loaded"; balances: BalancesResponse; members: GroupDetailResponse["members"] } | { kind: "unavailable" } | { kind: "signed-out" }`, and `isBalancesSignedOut`. It goes through `guardSession`: only a 401 `unauthorized` is `signed-out`; every other failure is `unavailable`.
- Pure functions in a new `packages/shared/src/balances/lines.ts`: `formatSignedVnd`, `memberLabel`, `balanceRows`, `paymentLines`.
- `balancesCopy` in `groups/copy.ts` (section title, "Đã cân bằng", loading line, "Thành viên khác", error and retry text, and the `trả` line builders).

## What the code does today

Read in full: `apps/mobile/src/group-screen.tsx`, `apps/mobile/src/lib/expenses.ts`, `packages/shared/src/balances.ts`, `packages/shared/src/groups/flow.ts` (the `loadGroupScreen` part), `groups/api.ts` (the `GroupsApi` part) and `groups/copy.ts` (the `expensesCopy` part).

- `GroupScreen` loads group and expenses together with `loadMyGroupScreen` through `guard(..., isScreenSignedOut)`; a failed reload after a save sets `reload` to `failed`, which hides the add button (#107). Balances must not use that path: AC 5 says a balances failure keeps the add button.
- `onSaved` awaits `load()` and then closes the form. Balances reload after a save needs to start there too.
- `apps/mobile/src/group-screen.test.tsx` mocks `@/lib/api` with `groupsApi: { getGroup, listExpenses, createExpense }` and `beforeEach` resets mocks. Without `getBalances` in the mock, every existing test would call `undefined`.
- The API returns members in `userId` order, including those at 0, and `suggestions` empty when all are 0.

## Files

| File                                                          | Change                                                                                    | AC                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------- |
| `packages/shared/src/balances/lines.ts` + `lines.test.ts`     | New pure functions and their unit tests                                                   | 1, 2, 3, A8, A10    |
| `packages/shared/src/balances/index.ts`                       | Export `lines`                                                                            | 1, 2                |
| `packages/shared/src/groups/copy.ts` + `copy.test.ts`         | `balancesCopy` and its exact-string test                                                  | 1, 2, 3, 5          |
| `packages/shared/src/groups/api.ts` + `api.test.ts`           | `getBalances` in the interface and in `createGroupsApi`; tests beside `listExpenses`      | 6                   |
| `packages/shared/src/groups/flow.ts` + `flow.test.ts`         | `loadBalances`, `BalancesState`, `isBalancesSignedOut`; tests                             | 5, 6                |
| `apps/mobile/src/lib/expenses.ts`                             | `loadMyBalances(groupId)`, reading the token as `loadMyGroupScreen` does                  | 4, 5, 6             |
| `apps/mobile/src/group-screen.tsx`                            | A `BalancesSection` with its own state, load, retry and `testID`s, above the expense list | 1 to 6, A5, A9, A11 |
| `apps/mobile/src/group-screen.test.tsx`                       | `getBalances` added to the `groupsApi` mock and to `beforeEach`; new tests                | 1 to 6              |
| `apps/mobile/.maestro/balances.yaml`, `balances-settled.yaml` | New flows                                                                                 | 1 to 4              |
| `docs/evidence/134/`                                          | iOS and Android screenshots                                                               | A12                 |

No change to `apps/api`, `apps/web`, migrations or `balancesResponseSchema`.

## Steps

1. `cloud` · AC 1, 2, 3, A8, A10 · Write `balances/lines.test.ts` first: `formatSignedVnd(50000)` is `+50.000 ₫`, `-50000` is `−50.000 ₫` (U+2212), `0` is `0 ₫`; `balanceRows` gives "Bạn" for my id and the email for others, keeps the API's order, and shows `Thành viên khác` for an id not in the members (not dropped); `paymentLines` gives `<email> trả Bạn 50.000 ₫`, `Bạn trả <email> 20.000 ₫`, `<email> trả <email> …` between two others, and `Thành viên khác` for an unknown id. They fail first because the module does not exist. Then add `lines.ts`, `balancesCopy` (with its exact-string test in `copy.test.ts`) and the export in `balances/index.ts`. The amount goes through `formatVnd`, so there is no float · done when `pnpm --filter @gop/shared test` passes
2. `cloud` · AC 5, 6 · Write the tests first. In `api.test.ts`, modelled on the `listExpenses` ones: `getBalances` sends the bearer token to `/groups/<id>/balances`, parses with the schema, and a body that fails it is `{ ok: false }`. In `flow.test.ts`: `loadBalances` returns `loaded`, `unavailable` for a network error, a 500 and a 404, and `signed-out` only for 401 `unauthorized`. They fail first because the functions do not exist. Then add `getBalances`, `loadBalances`, `BalancesState` and `isBalancesSignedOut`. Adding a method to the `GroupsApi` interface: `grep -rn "GroupsApi\b" apps packages --include=*.ts --include=*.tsx` finds the other implementers and fakes, and this step updates each one it finds · done when `pnpm --filter @gop/shared test` and `pnpm typecheck` pass
3. `cloud` · AC 1, 2, 3, 4, 5, 6, A5, A6, A9, A11 · Mobile unit tests first, in `group-screen.test.tsx`. Add `getBalances` to the `jest.mock("@/lib/api")` factory and `getBalances.mockResolvedValue({ ok: true, data: { balances: [], suggestions: [] } })` to `beforeEach`; `grep -n "groupsApi\|resetAllMocks" apps/mobile/src/group-screen.test.tsx` shows the one mock and the one `beforeEach`, and `grep -rn "getGroup" apps/mobile/src` shows no other test using the group screen, so no other file changes. The existing tests assert only on `expense-*`, `group-title` and the error ids, so a new section above the list changes none of them. New tests: (a) one row per member with `Bạn +50.000 ₫` and `bao@example.com −50.000 ₫`; (b) one payment line per suggestion; (c) empty `suggestions` and zero balances show "Đã cân bằng", every member at `0 ₫` and no payment line, also for a group with no expenses; (d) after a save the balances call runs again and the new figures show with the screen open; (e) (also A6: the add button stays) a network error and a 500 keep the expense rows and the add button, show the error and "Thử lại" and no figures; retry calls `getBalances` and `getGroup` for the section but never `listExpenses` (its count stays); two presses send one call; a failed reload after a save shows the error, not the old figures; (f) expense rows show while balances is pending, and balances show, with emails and not "Thành viên khác", while the expenses call fails (A5); (g) the loading line shows and no figures while pending (A9); (h) each part has its `testID` (A11); (i) [security] a 401 on the first load, on the reload after a save and on the retry each delete the token and show sign-in, a 500 keeps it, modelled on `a 401 on the expenses deletes the token and shows sign-in`. All fail first because the screen has no section. Then add `loadMyBalances` and the section: its own `useState`, a `latestBalancesLoad` counter like `latestLoad`, a `retrying` ref, `guard(() => loadMyBalances(groupId), isBalancesSignedOut)`, loaded in parallel with `load()` and again from `onSaved`. While loading or after a failure the state holds no figures. For (i), `grep -n "replace(" apps/mobile/src/group-screen.tsx` finds no `replace` in the screen, so the assertions are the stored token and the sign-in screen, as in the existing 401 tests. For the two-press test, if it passes with the `retrying` ref removed, keep the ref and say why under **Differs from the plan** · done when `pnpm --filter @gop/mobile test` passes, and `pnpm lint && pnpm typecheck && pnpm test` pass
4. `mac` · AC 1, 2, 3, 4, A12 · The unit tests of step 3 are the test first (they fail on the unchanged screen); the Maestro flows run only on the finished code. Add `.maestro/balances.yaml`: `fresh-start`, `new-email`, `sign-in`, `create-group`, then `scripts/other-member-expense.js` (adds a second member, "An toi" 90.000 paid by them and "Taxi" 50.000 paid by me), open the group. The figures: each paid share is 70.000, so me `−20.000 ₫`, the other `+20.000 ₫`, and the payment line `Bạn trả <otherEmail> 20.000 ₫`. Then add "Cafe" 60.000 on the screen (AC 4): me `+10.000 ₫`, the other `−10.000 ₫`, line `<otherEmail> trả Bạn 10.000 ₫`, without leaving the screen. Add `.maestro/balances-settled.yaml` on a new group: "Đã cân bằng", one member row at `0 ₫`, no payment line. Both take a screenshot per platform with `${output.platform}`, copied to `docs/evidence/134/` by hand. Run `pnpm --filter @gop/mobile e2e:ios .maestro/balances.yaml .maestro/balances-settled.yaml`, then `e2e:android` the same way, never both at once, in the background with its log watched · done when both flows pass on the iOS Simulator and on the Android emulator `Pixel_9_API_35`, and the existing `expenses-add`, `expenses-list` and `expenses-empty` flows still pass on both

## Verification

- `pnpm lint && pnpm typecheck && pnpm test`, each read on its own.
- `verify` mobile for AC 1 to 4 on the iOS Simulator and the Android emulator, with a screenshot of each in `docs/evidence/134/` (A12).
- No API or web `verify`: nothing changes there.

## Risks

- **Existing mobile tests.** The group screen test file is the only one that renders `GroupScreen` (`grep -rn "GroupScreen" apps/mobile/src`); step 3 adds the mock it needs. A forgotten mock would show up in the first run as `undefined is not a function`.
- **Minus sign.** The spec writes "−50.000 ₫" with U+2212, not a hyphen. The pure-function test pins it, and the Maestro flow types the same character in its assertions. A Maestro `text` match is a regex, so `+` is escaped there (`\+10.000 ₫`).
- **Two reloads after a save.** The expenses reload and the balances reload run in parallel and fail separately, as the spec says. A failed balances reload shows the error and no old figures; a failed expenses reload keeps the #107 behaviour.
- **Open PRs.** `gh api repos/thanhwoe/pilot-app/pulls` lists none touching `group-screen.tsx`, `groups/*` or `.maestro` at the time of writing, so there is no merge order to propose.
- **Rollback.** Revert the PR: no data, schema or API change.
- **Question for the author:** the section fetches the member list itself (a second `getGroup` call per balances load) so emails show even when the expenses load fails, as AC 5 / A5 need. The alternative is to wait for the screen's own group load and show the loading line until then. **Default:** the section's own `getGroup` call.
- **Question for the author:** step 4's flow adds "Cafe" through the form with the keyboard. Maestro can't type non-ASCII text on Android, so descriptions stay ASCII as in #97. **Default:** ASCII descriptions.
