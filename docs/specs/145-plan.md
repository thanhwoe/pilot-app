# Plan: API: a member can delete an expense they paid

Issue: #145 · Spec: [145.md](145.md) · Runs on: `cloud` · Status: waiting for gate 2

## Contracts

- `DELETE /groups/:id/expenses/:expenseId`. No request body. Answers: 204 with an empty body; 401 `unauthorized`; 404 `not_found`; 403 `forbidden`. Every error body is an `ErrorResponse`.
- `packages/shared/src/auth.ts`: `errorResponseSchema` gains `"forbidden"`. `ApiError` (`api-client.ts`) follows, because it is derived from the schema.
- `ExpenseStore` gains `deleteExpense(groupId: string, expenseId: string): Promise<boolean>`: deletes the expense when it belongs to that group, and says whether it did. The shares go through the existing `ON DELETE CASCADE` on `expense_shares`; one `DELETE` statement is atomic, so a failure leaves the expense whole (A7).
- Migration: none.

## What the code does today

Read in full: `apps/api/src/expenses/routes.ts`, `store.ts`, `memory-store.ts`, `store.contract.ts` (head), `store.test.ts`, `memory-store.test.ts`, `packages/shared/src/auth.ts` (the schema) and `api-client.ts`.

- The store has `addExpense` and `listExpenses` only; there is no lookup by id. The route finds the expense with `listExpenses(group.id)` and `find` by id, which keeps the store to the one new method the spec names, and gives "belongs to another group" for free (it is not in this group's list).
- `findGroup` in `routes.ts` already returns null for a malformed id, an unknown group and a non-member, so AC 4 reuses it and the existing `notFound` body.
- The expense id is a uuid column. A malformed id must be rejected in the route (`z.uuid()`, as `groupIdSchema` does) before it reaches the store.
- `ApiError` is used as `Partial<Record<ApiError, string>>` in `sign-in/flow.ts` and in `session-guard.ts` types. Search: `git grep -n "Record<ApiError\|ApiError" -- apps packages` found only those; none is an exhaustive `Record`, so adding `forbidden` needs no change in web or mobile. Step 1 confirms with `pnpm typecheck`.
- Both stores are covered by one contract suite (`store.contract.ts`), run by `store.test.ts` (Postgres) and `memory-store.test.ts`.

## Files

| File                                      | Change                                                  | AC   |
| ----------------------------------------- | ------------------------------------------------------- | ---- |
| `packages/shared/src/auth.test.ts`        | New test: the error schema accepts `forbidden`          | 3    |
| `packages/shared/src/auth.ts`             | Add `"forbidden"` to the `errorResponseSchema` enum     | 3    |
| `apps/api/src/expenses/store.contract.ts` | New contract tests for `deleteExpense`                  | 1, 5 |
| `apps/api/src/expenses/store.ts`          | `deleteExpense` on the interface and the Postgres store | 1, 5 |
| `apps/api/src/expenses/memory-store.ts`   | `deleteExpense` in memory                               | 1, 5 |
| `apps/api/src/expenses/routes.test.ts`    | New `describe` for the DELETE route                     | 1–6  |
| `apps/api/src/expenses/routes.ts`         | The DELETE route                                        | 1–6  |

No change to `store.test.ts` or `memory-store.test.ts` (they run the contract), the web, mobile, migrations or `.env.example`.

## Steps

1. `cloud` · AC 3 · Write the test first, in `packages/shared/src/auth.test.ts`: `errorResponseSchema.safeParse({ error: "forbidden" }).success` is true. It fails today because the enum lacks the value. Then add `"forbidden"` to the enum · done when `pnpm --filter @gop/shared test` passes, and `pnpm typecheck` passes in web and mobile with no other change (the search above found no exhaustive reader).
2. `cloud` · AC 1, 5, A7 · Write the contract tests first, in `store.contract.ts`, each named `#145 AC n`: (a) deleting an expense in its group returns `true`, and `listExpenses` no longer holds it, while another expense of the group stays; (b) deleting with another group's id returns `false` and the expense stays; (c) deleting an unknown id returns `false`; (d) a second delete returns `false`. In the Postgres run, one more test in `store.test.ts`'s storage `describe` reads `expense_shares` directly and finds no row left for the deleted expense (A7). They fail now because `deleteExpense` doesn't exist (a type and runtime error). Then add `deleteExpense` to the interface, the Postgres store (`delete(expenses).where(and(eq(id), eq(groupId))).returning({ id })`, `true` when a row came back) and the memory store · done when `pnpm db:up` is running and `pnpm --filter @gop/api test expenses` passes for both stores. Why one statement is enough for A7: Postgres runs the cascade in the same statement, so the shares can't be left behind or deleted alone.
3. `cloud` · AC 1, 2, 3, 4, 5, 6, A5, A6 · Write the route tests first, in `routes.test.ts`, on `world()`, each named `#145 AC n`: payer's DELETE answers 204 with an empty body and the store no longer holds it (1); the list lacks it and balances are 0 with no suggestions, and with two expenses only the deleted one stops counting (2); Bao's DELETE of Ana's expense answers 403 `forbidden`, and the list and balances still include it (3); a non-member, an unknown group id and a malformed group id each get the identical 404 body, with the expense still listed (4, and A5 for the non-member on a real expense: 404, not 403); a member's DELETE of an unknown id, a malformed id, another group's expense id and an already deleted id each answer 404 `not_found` and another group's expense is unchanged (5, A5 for the wrong id: 404, not 403; A6 for the second DELETE); no session, an ended session and an unknown session each get 401 and the expense is still listed (6; modelled on `#95 AC 10`). They fail now because the route doesn't exist, so Fastify answers its own 404 body instead of the shapes asserted (204, 403, the `not_found` body). Then add the route: session (401), `findGroup` (404), `z.uuid()` on the expense id (404), find the expense in `listExpenses(group.id)` (404), `payerId === session.user.id` (403, else), `deleteExpense` (a `false` answers 404, for a delete that lost a race), then `reply.code(204).send()` · done when `pnpm --filter @gop/api test expenses` passes.
4. `cloud` · AC 3 · Prove the 403 test fails without the guard: temporarily delete the payer check, run `pnpm --filter @gop/api test routes`, and expect the `#145 AC 3` test to fail with 204 where 403 was expected (it is the only guard on that path: the group, the id and the expense checks all pass for a member), then restore it with `git checkout -- apps/api/src/expenses/routes.ts` only if the check was not committed, otherwise re-add the line. Then run `pnpm lint`, `pnpm typecheck` and `pnpm test`, each as its own command · done when the test fails without the guard and the three commands pass.

## Verification

- `pnpm lint && pnpm typecheck && pnpm test`, with Postgres up.
- `verify` for the API: start the API against the dev database and call the DELETE with `curl` as the payer (204), as another member (403), as a non-member (404) and with no token (401), then list and read the balances. No web or mobile `verify`: nothing changes there.

## Risks

- **Existing tests that compare a whole shape.** `git grep -n "errorResponseSchema\|ErrorResponse" -- '*.test.*'` finds only tests that parse one error body and compare it to one value (`apps/api/src/auth/routes.test.ts`, `expenses/routes.test.ts`), none that lists the enum's values, so adding `forbidden` changes no assertion. The expense list and balance responses are untouched.
- **Lookup through the list.** The route reads the group's whole list to find one expense. It is fine at a group's size and keeps the store to the one method the spec names. Question for the author: add a `findExpense` to the store instead? **Default:** keep the list lookup.
- **A delete that races another delete.** Both pass the checks, one wins; the other's `deleteExpense` returns `false` and it answers 404, the same as a second DELETE (A6).
- **The 403 is the API's first.** No client handles `forbidden` yet; a client that gets one sees it as an unknown error. No screen calls the DELETE (out of scope).
- **Open PRs and merge order.** Searched `gh api repos/thanhwoe/pilot-app/pulls`: no open PR. The branch contains `origin/main`. `qa/134-group-balances` exists on the remote (QA tests for #134, mostly mobile files); it is not a PR and I did not find it touching `apps/api/src/expenses/` or `packages/shared/src/auth.ts`.
- **Rollback:** revert the PR. No migration and no stored data change; deleted expenses are gone by design.
