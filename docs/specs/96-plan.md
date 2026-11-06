# Plan: Balances: each member's balance and the fewest payments to settle, on the API

Issue: #96 · Spec: [96.md](96.md) · Runs on: `cloud` · Status: waiting for gate 2

## Contracts

No migration, no new table, no change to an existing schema. The balances are computed from what #95 already stores.

- **New shared module** `packages/shared/src/balances.ts` (schemas) and `packages/shared/src/balances/compute.ts` (pure functions), exported from `packages/shared/src/index.ts` the way `expenses` is.
- **`memberBalanceSchema`** `{ userId: uuid, balance: integer }`. Positive means the group owes the member, negative means the member owes the group.
- **`suggestedPaymentSchema`** `{ from: uuid, to: uuid, amount: integer ≥ 1 }`: `from` has a negative balance, `to` a positive one.
- **`balancesResponseSchema`** `{ balances: MemberBalance[], suggestions: SuggestedPayment[] }`. `balances` lists every current member of the group, including those at 0, ordered by `userId` ascending. `suggestions` is empty when every balance is 0.
- **Endpoint** `GET /groups/:id/balances`: no body; `200` `balancesResponseSchema`; `401 unauthorized`; `404 not_found` (a non-member, an unknown group and a malformed id all get the same body). Checks run in this order: session, then group id and membership.
- **Pure functions** in `packages/shared`:
  - `computeBalances(memberIds, expenses)`: for each user, what they paid minus the sum of their shares over the expenses. It covers `memberIds` and any user an expense names, so the balances always add up to exactly 0.
  - `suggestSettlements(balances)`: the payments that settle them. It throws a `RangeError` if the balances do not add up to 0.
- **The suggestion rule.** Repeat: take the member with the largest debt and the member with the largest credit (ties go to the lower `userId`), pay `min(debt, credit)` from the first to the second, and reduce both. Every payment zeroes at least one of the two and the last one zeroes both, so there are at most (members with a non-zero balance − 1) payments, as AC 3 requires. The same balances always give the same payments, whatever order the expenses came in.

## What the code does today

Read in full: `apps/api/src/expenses/routes.ts`, `expenses/store.ts`, `groups/store.ts` (the `listMembers` and `findGroupForMember` signatures), `apps/api/src/app.ts`, `packages/shared/src/expenses.ts`, `expenses/split.ts` and `index.ts`, and the helpers in `expenses/routes.test.ts` (`setup`, `world`, and the 401 and 404 blocks).

- **The data is there.** `ExpenseStore.listExpenses(groupId)` returns every expense with its payer, amount and shares (a payer outside the split has no share row, a member of the split can hold 0). `GroupStore.listMembers(groupId)` returns the members. Both landed with #95, which is merged into this branch's base.
- **The group-access check already exists.** `registerExpenseRoutes` has a local `findGroup` (uuid check, then `findGroupForMember`) and constants for the three error bodies. The balances route needs exactly these and the same `ExpenseDeps` (`groupStore`, `expenseStore`, the session deps), so it is a third route in that function. A new file would copy the constants a third time. The route is registered by `buildApp` already, so `app.ts` does not change.
- **Session handling.** The spec's assumption 6 says "the same `guardSession` path". `guardSession` is the client side (web and mobile). On the API the check is `createSessionCheck`, which `registerExpenseRoutes` already uses, so the route gets the same 401 with no new code.
- **Names.** `grep -rn "computeBalances\|suggestSettlements\|MemberBalance\|SuggestedPayment\|balancesResponse\|/balances" apps packages --include=*.ts --include=*.tsx` finds nothing, so the new names collide with nothing.
- **Open PRs.** `gh api repos/{owner}/{repo}/pulls` lists #100 (`chore/retro-95`), which touches only `apps/api/src/test/db.test.ts`. This plan does not touch that file: there is no migration.

## Files

| File                                                                     | Change                                                                             | AC                         |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------- |
| `packages/shared/src/balances.ts`, `balances.test.ts`                    | New. The three schemas, and their tests                                            | 1, 4, A1                   |
| `packages/shared/src/balances/compute.ts`, `compute.test.ts`, `index.ts` | New. `computeBalances` and `suggestSettlements`, with unit and property tests      | 1, 2, 3, 4, A2, A3, A4, A7 |
| `packages/shared/src/index.ts`                                           | Export `./balances` and `./balances/index`                                         | plumbing                   |
| `apps/api/src/expenses/routes.ts`                                        | The `GET /groups/:id/balances` route, in `registerExpenseRoutes`                   | 1, 4, 5, 6, 7              |
| `apps/api/src/expenses/routes.test.ts`                                   | New `describe` blocks for the balances route, using the file's `setup` and `world` | 1, 4, 5, 6, 7, A1          |

No change to the stores, `app.ts`, `server.ts`, the migrations, CI, the web or the mobile app.

## Steps

1. `cloud` · AC 1, 2, 3, 4, A2, A3, A4, A7 · **Test first**, in `packages/shared`:
   - `compute.test.ts`: 100000 paid by A and split between A and B gives A +50000 and B −50000 (AC 1); no expenses gives 0 for every member and no suggestions (AC 4); a payer outside the split is positive by the full amount, and a member who only owes is negative (A2); a user an expense names who is not in `memberIds` is still counted, so the balances add up to 0; the same balances in a different order of expenses give identical suggestions, and a tie goes to the lower `userId` (A3); every suggestion goes from a negative to a positive balance with an amount above 0 (A4); `suggestSettlements` throws a `RangeError` for balances that do not add up to 0. A property test over 300 generated groups (2 to 8 members, 1 to 6 expenses each, amounts up to 100,000,000, random payer and split, built with `splitEqually` and a fixed pseudo-random sequence so a failure repeats) checks that the balances are whole and add up to 0 (AC 2), that applying the suggestions brings every balance to 0, and that their number is at most (members with a balance ≠ 0) − 1 (AC 3).
   - `balances.test.ts`: the response schema parses a body with balances and suggestions, and an empty one; rejects a suggestion of 0 VND and a non-integer balance.

   Run them before the code exists: they fail on the missing modules → write `balances.ts`, `balances/compute.ts`, `balances/index.ts` and the exports · done when `pnpm --filter @gop/shared test` passes, then `pnpm --filter @gop/shared typecheck` and `pnpm lint`. Search: nothing is removed or renamed. Commit `feat(shared): balances and the payments that settle them (#96)`
2. `cloud` · AC 1, 4, 5, 6, 7, A1 · `GET /groups/:id/balances`. **Test first**, in `expenses/routes.test.ts`, using `world()`:
   - AC 1: Ana adds 100000 split between Ana and Bao, then the balances show Ana +50000, Bao −50000 and Cy 0, with one suggestion Bao → Ana of 50000. Several expenses, a payer outside the split and an expense paid by another member give balances that add up to 0.
   - AC 4 and A1: a group with no expenses answers `200` with every member at 0 (all three, including those who never took part) and `suggestions: []`; the body parses with `balancesResponseSchema`; members are ordered by `userId`; any member, not only the creator, can ask.
   - **[security] AC 5:** a non-member's request answers exactly as for an id no group has (same status and body), and the body holds none of the group's user ids. **[security] AC 6:** no token, a wrong token and an expired token each give `401 unauthorized`. **AC 7:** a malformed id gives `404 not_found`, on the in-memory stores and in a second test on Postgres, which rejects non-UUIDs.

   They fail because the route does not exist (Fastify's own `404` body does not parse as `ErrorResponse`, and the balances tests get no `200`) → add the route to `registerExpenseRoutes`: session, then `findGroup`, then `listMembers` and `listExpenses`, `computeBalances`, `suggestSettlements` · done when `pnpm --filter @gop/api test` passes, and typecheck and lint pass. Commit `feat(api): the group's balances and the payments that settle them (#96)`
3. `cloud` · AC 1–7 · No new code. `pnpm lint`, `pnpm typecheck` and `pnpm test`, each on its own with its exit status read. Then the `verify` API run in **Verification** · done when all pass and the `verify` output is saved for the PR

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, each on its own. The API tests need Postgres (`pnpm db:up`, or the session's fallback). The web e2e is not needed: no web code, config or migration changes.
- `verify` for the API, with the real server and `curl`, as in #95: start the API with `DEV_SIGN_IN_CODES=true` and `NODE_ENV=development`; sign in three users, create a group and add two of them in `group_members` directly (invites do not exist); add expenses with `POST /groups/:id/expenses`; then check by `curl` AC 1 (+50000 / −50000 and one suggestion), AC 2 and 3 (several expenses: the balances add up to 0, and doing the suggestions by hand zeroes them), AC 4 (an empty group), AC 5 (a non-member's `404` equals an unknown id's), AC 6 (`401`) and AC 7 (`404`). The output goes in the PR description.
- No `verify` for web or mobile: no screen or client changes.

## Risks

- **Question for the author. Answer this before adding `plan-ok`; the build reads the answer.** The issue's title says "the fewest payments", but AC 3 only requires at most (non-zero members − 1) payments, and the spec follows AC 3. The rule above (largest debt pays largest credit) always meets that bound, but it does not always find the true minimum: finding it means looking for groups of members whose balances cancel each other, and that search grows quickly with the number of members. Is the bound enough for now? I would build that and leave the exact minimum for a later issue, if you want it, because a friends' group has few members and the bound is already one payment less than everyone paying everyone. If you want the exact minimum now, say so and I will revise the plan with a subset search and a limit on group size.
- **Balances can drift from the expenses only if the data is wrong.** Every share is whole VND and the shares of an expense add up to its amount (#95), so the balances add up to 0. `computeBalances` counts any user an expense names, so a stray id cannot break the sum.
- **The balances are read in two queries.** The members and the expenses are loaded one after the other, not in one transaction. An expense added in between is counted or not as a whole, and the balances still add up to 0 either way, because they come from expenses only. A member added between the two queries appears in the next answer.
- **No paging, as on the list.** A group with thousands of expenses is read in full on every call. The cost is linear in the expenses; a stored running balance is a later issue if it ever matters.
- **Payments already made are not counted**, as the spec says (recording a payment is seed item 5). Once it lands, `computeBalances` takes them as another input.
- **Rollback.** Revert the commits. No table, column or data is touched.
