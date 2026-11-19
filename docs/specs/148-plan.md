# Plan: Mobile: record a suggested payment as paid from the group screen

Issue: #148 · Spec: [148.md](148.md) · Runs on: `cloud, then mac` · Status: waiting for gate 2

## Contracts

New table, one migration (`apps/api/drizzle/0004_*.sql`, made by `db:generate`):

- `settlements`: `id` uuid pk, `group_id` uuid → `groups` (cascade), `payer_id` and `payee_id` uuid → `users` (restrict, as for `expenses.payer_id`), `amount` integer not null, `created_at` timestamptz not null, index on `(group_id, created_at)`. Purely additive: nothing existing changes.

New shared schemas in `packages/shared/src/settlements.ts`, exported from `index.ts`:

- `createSettlementBodySchema`: `{ payerId: uuid, payeeId: uuid, amount: expenseAmountSchema }`, with a refinement that `payerId !== payeeId` (AC 6, 7). It reuses the expense amount rule: a whole VND integer from 1 to 100.000.000.
- `settlementSchema` / `settlementResponseSchema`: `{ id, groupId, payerId, payeeId, amount, createdAt (ISO string) }`.

New endpoint `POST /groups/:id/settlements`: request `createSettlementBodySchema`, response 201 `settlementResponseSchema`. Checks in this order: session (401), group and membership (404, one body for a non-member, as for the expense routes), body (400 `invalid_request`), payer and payee are members (400), payer is the caller (403 `forbidden`). Nothing is stored on any failure. No other existing route changes shape: `GET /groups/:id/balances` returns the same `BalancesResponse`, now computed with the group's settlements.

Changed shared logic: `computeBalances(memberIds, expenses, settlements = [])` takes settlements as an optional third argument (`BalanceSettlement = { payerId, payeeId, amount }`): the payer's balance goes up by the amount and the payee's down by the same amount, so the sum stays 0. `GroupsApi` gets `createSettlement(token, groupId, body)`. New `recordSettlement` flow and copy in `packages/shared/src/groups`.

## What the code does today

Read in full: `apps/api/src/expenses/routes.ts`, `store.ts`, `memory-store.ts`, `store.contract.ts`, `packages/shared/src/balances/compute.ts`, `lines.ts`, `groups/api.ts`, `groups/flow.ts` (the balances and expense parts), `apps/mobile/src/group-screen.tsx`, `apps/mobile/src/lib/expenses.ts` and `apps/mobile/.maestro/balances.yaml`.

- Balances are `computeBalances(memberIds, expenses)` and `suggestSettlements(balances)`; the only caller outside tests is `GET /groups/:id/balances` (`grep -rn "computeBalances(" apps packages` finds that one route and `compute.test.ts`). No settlement is stored anywhere: the word `settlement` appears only in `suggestSettlements`, which only suggests.
- `BalancesSection` in `group-screen.tsx` renders one `Text` with `testID="payment-line"` per suggestion, with no button. `loadBalancesNow` sets the balances to `null` (the loading line) before each reload, so no lines show while loading or after a failed reload. That already gives AC 16: after a stored payment and a failed reload, no line, and so no "Đã trả", is on screen until a retry succeeds.
- `ExpenseForm` has the double-tap pattern to copy: an `inFlight` ref beside the `saving` state, since `saving` only disables the button from the next render.
- Adding methods to `ExpenseStore` breaks no fake: `grep -rn "ExpenseStore" apps` finds only the Postgres store, `createMemoryExpenseStore` and `store.contract.ts`, which run against both.

## Files

| File                                                                     | Change                                                          | AC                      |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------- |
| `packages/shared/src/balances/compute.ts`                                | `computeBalances` takes optional settlements                    | 4, 5                    |
| `packages/shared/src/balances/compute.test.ts`                           | New tests for settlements                                       | 4, 5                    |
| `packages/shared/src/settlements.ts`, `index.ts`                         | New schemas                                                     | 2, 6, 7                 |
| `packages/shared/src/groups/api.ts`, `api.test.ts`                       | `createSettlement` and its test                                 | 2                       |
| `packages/shared/src/groups/flow.ts`, `flow.test.ts`, `copy.ts`          | `recordSettlement` and its outcome, copy                        | 11                      |
| `apps/api/src/db/schema.ts`, `apps/api/drizzle/0004_*`                   | `settlements` table and migration                               | 2                       |
| `apps/api/src/expenses/store.ts`, `memory-store.ts`, `store.contract.ts` | `addSettlement`, `listSettlements` in both stores, one contract | 2, 3                    |
| `apps/api/src/expenses/routes.ts`, `routes.test.ts`                      | New route, balances read settlements                            | 2, 4, 6–10, 14, A3      |
| `apps/mobile/src/lib/expenses.ts`                                        | `recordMyPayment`                                               | 2, 3                    |
| `apps/mobile/src/group-screen.tsx`, `group-screen.test.tsx`              | "Đã trả" button on my payment lines, in-flight guard, error     | 1, 3, 11–13, 15, 16, A5 |
| `apps/mobile/.maestro/settlements-pay.yaml`                              | New flow, reuses `scripts/other-member-expense.js`              | 1, 3                    |

No change to the web app, to the expense split, or to `suggestSettlements`.

## Steps

1. `cloud` · AC 4, 5 · Write the tests first in `compute.test.ts`: (AC 4) A owes X 20000, a settlement A→X of 20000 gives 0 for both and `suggestSettlements` returns `[]`; (AC 5) with a settlement the payer rises and the payee falls by the amount and the sum is 0, including a settlement between users not in `memberIds`. They fail on the current code because `computeBalances` ignores a third argument, so A stays at −20000. Then add the optional third argument · done when `pnpm --filter @gop/shared test` passes, the existing two-argument tests unchanged, and `pnpm typecheck` passes
2. `cloud` · AC 2, 6, 7 · Plumbing for the API and clients: write the failing tests first, in `api.test.ts` (`createSettlement` posts to `/groups/:id/settlements` with the bearer token and parses the 201 body; a body failing the schema is `unavailable`) and a schema test (0, −5, 1.5 and payer = payee fail; 1 and 100000000 pass). Then add `settlements.ts`, `createSettlement` to `GroupsApi` and `createGroupsApi` · done when `pnpm --filter @gop/shared test` and `pnpm typecheck` pass. `grep -rn "GroupsApi" apps packages` finds the web and mobile `api.ts` (they call `createGroupsApi`, so they gain the method) and test mocks that list only the methods they use, so none breaks
3. `cloud` · AC 2, 3 · Migration and stores, contract test first in `store.contract.ts`: `addSettlement` stores payer, payee, amount, group and time and returns them; `listSettlements(groupId)` returns only that group's, oldest first. It fails first on a missing method. Then add the `settlements` table, run `pnpm --filter @gop/api db:generate`, add `addSettlement` and `listSettlements` to `ExpenseStore`, the Postgres store and the in-memory store · done when `pnpm --filter @gop/api test` passes for both stores and `pnpm --filter @gop/api db:migrate` applies the migration to the dev database
4. `cloud` · AC 2, 6, 7, 8, 9, 10, 14, A3 · Route tests first in `routes.test.ts`, one `describe("POST /groups/:id/settlements")`: 201 with the stored row (AC 2); a different amount from the suggestion also gets 201 (A3); 400 for amount 0, −5, 1.5 and payer = payee, nothing stored (AC 6, 7); 401 for no, unknown and ended session (AC 8); 404 for a non-member and a malformed group id, identical to an unknown group (AC 9); 400 for a payee who is not a member (AC 10); 403 when the payer is another member (AC 14); the balances route then shows the settlement. Every failure asserts `listSettlements` is empty. They fail on the current code with a 404 from the missing route. Then add the route and make `GET /balances` read the settlements with the members and expenses. Order of the last checks: payer and payee members (400) before payer = caller (403), so a non-member payer gets the 400 that AC 10 says and a member who is not the caller gets the 403 of AC 14 (see the question under Risks) · done when `pnpm --filter @gop/api test` passes, including `#96` balances tests, which add no settlement and so see the same empty list
5. `cloud` · AC 11 · `recordSettlement(api, token, { groupId, myId, payeeId, amount })` in `flow.ts`, test first in `flow.test.ts` as for `submitExpense`: success gives `{ saved: true }`, a failed call gives `{ saved: false, error }` with the shared copy, a 401 gives `signedOut` and only a 401 does. Add the copy for the error · done when `pnpm --filter @gop/shared test` and `pnpm typecheck` pass
6. `cloud` · AC 1, 3, 11, 12, 13, 15, 16, A5 · Screen tests first in `group-screen.test.tsx` (Jest, no simulator; add `createSettlement` to the mocked `groupsApi`, modelled on the `#134 balances` block): (AC 1) a line "Bạn trả bao@example.com 20.000 ₫" has a button "Đã trả"; (AC 13) no suggestions, no button; (AC 15) a line where I am the payee, or neither side, has no button; (AC 3, A5) after a tap the screen calls `getBalances` again and shows what it returns, with the line gone and the title still shown; (AC 11) a failed call, for a network error and a 5xx, shows the error, keeps the line and its button, and `getBalances` is not called again; (AC 12) two taps before the first call answers send one `createSettlement` call, with the request held open as in the existing double-tap test; (AC 16) the post succeeds and the next `getBalances` fails: the balances error with its retry shows, no "Đã trả" button, and after the retry works the button is back only on a line the balances still show. They fail first because no button exists. Then add `recordMyPayment` to `lib/expenses.ts` and the button: a `Pressable` with `testID="pay-button"` beside each of my lines (`line.from === myId`), a screen-level in-flight ref plus a `paying` state that disables every button, an error `Text` with `testID="pay-error"`, and a reload through `loadBalancesNow` after a 201. The screen does no arithmetic, and a 401 goes through `guard` with a new `isRecordSettlementSignedOut` · done when `pnpm --filter @gop/mobile test` passes, the existing `#134` tests unchanged (`grep -rn "payment-line" apps/mobile/src` finds `group-screen.test.tsx` and `qa/134.test.tsx`, which read the line's own `Text` and not its parent, so a sibling button doesn't change them), and `pnpm lint && pnpm typecheck && pnpm test` pass. AC 12 is proven here, at the level that controls timing; the Maestro flow does not try to beat a re-render
7. `mac` · AC 1, 3 · Write `apps/mobile/.maestro/settlements-pay.yaml`, modelled on `balances.yaml`: sign in, create "Da Lat", run `scripts/other-member-expense.js` (I am at −20.000), open the group, assert the button "Đã trả" is visible next to `payment-line` "Bạn trả <other> 20.000 ₫", take a screenshot, tap it, assert `payment-line` is gone and `balances-settled` visible, `group-title` still shown, then screenshot. The behaviour is already proven by the step 6 unit tests, so no fail-first flow is run (it would need another Release build per platform). Run on iOS, then Android, never both at once, and copy the screenshots to `docs/evidence/148/` · done when `pnpm --filter @gop/mobile e2e:ios .maestro/settlements-pay.yaml` and then `e2e:android .maestro/settlements-pay.yaml` pass, then the whole `balances*.yaml` family still passes

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, each as its own command; the API tests need `pnpm db:up`.
- `verify` for the API: a local server with the new migration, `POST /groups/:id/settlements` called with a valid and an invalid body, and `GET /balances` after it, for AC 2 to 10 and 14.
- `verify` for mobile on the iOS Simulator and the Android emulator (`Pixel_9_API_35`): the Maestro flow above, for AC 1 and 3. The spec has no criterion that needs a real phone.
- No `verify` for the web: nothing there changes.

## Risks

- **Existing data and rollback:** the migration only adds a table, so existing groups, expenses and balances are unchanged. Roll back by reverting the PR and dropping `settlements`; nothing else reads it. Settlements are never deleted (out of scope), so a mistaken tap can't be undone in this version.
- **A mistaken or stale tap stores what the line said** (spec assumption), with no undo. The button records exactly the amount on the line.
- **Existing tests that read whole rows:** `GET /balances` tests (`#96`) add no settlement, so their output is unchanged; the `#134` mobile tests read the line text, which doesn't change.
- **Open PRs:** searched `gh api repos/thanhwoe/pilot-app/pulls?state=open`: none is open, so there is nothing to order. The branch already contains `main`.
- **Mac mini:** step 7 needs the Simulator, the emulator and Maestro, so the cloud build stops there with a handover. Steps 1 to 6 finish in the cloud.
- **Question for the author:** the spec's check order says body (400), then payer = caller (403), while AC 10 says a payer who is not a member gets 400. A non-member can't be the caller, so both can't hold for a non-member payer. **Default:** check that payer and payee are members (400) before payer = caller (403), so a non-member payer gets 400 as AC 10 says and a member who isn't the caller gets 403 as AC 14 says.
