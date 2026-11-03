# Plan: Web: the create-group form clears the name after a failed create

Issue: #20 · Spec: [20.md](20.md) · Runs on: `cloud` · Status: waiting for gate 2

## Contracts

None. No HTTP request or response changes, no shared schema changes and no migration.

The only new shape is the form's own state. `CreateGroupState` in `apps/web/src/app/actions.ts` gets an optional `name` field. It is the return value of a Server Action that only the form reads, not an API body, so it needs no schema in `packages/shared`. The sign-in form already works the same way (`state.email` as `defaultValue`).

## Files

| File                                     | Change                                                                                                                                                                          | AC       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `apps/web/e2e/groups.spec.ts`            | New test for a spaces-only name keeping the field; new test for a valid name succeeding after a failure                                                                         | 2, 3, A3 |
| `apps/web/src/app/actions.ts`            | `CreateGroupState` gets `name?: string`; on a failed create (empty-name or connection error) the action returns the submitted name with the error; a success still returns `{}` | 1, 2     |
| `apps/web/src/app/create-group-form.tsx` | The input gets `defaultValue={state.name}`                                                                                                                                      | 1, 2     |

No change to `packages/shared`, `apps/api` or `apps/mobile`.

## Steps

1. `cloud` · AC 2, A3 · Write the web E2E test "AC 2: a name of only spaces keeps what I typed". It signs in, submits `"   "`, expects the "Hãy nhập tên nhóm." alert, expects the field to have the value `"   "`, and expects no group. Run it and see it fail on the field value. Then add `name` to `CreateGroupState`, return it with the error in `createGroupAction`, and set `defaultValue={state.name}` on the input. Done when `pnpm --filter @gop/web test:e2e groups.spec.ts` passes.
2. `cloud` · AC 3 · Write the web E2E test "AC 3: a valid name after a failed create creates the group and clears the field". It submits `"   "`, then fills `"Đà Lạt"` and submits, then expects the group at the top with "1 thành viên" and an empty field. This is the spec's risk case: after step 1 the field's `defaultValue` is the failed name, and the form reset after a success must go back to empty. If it fails, fix the form (for example by keying the input on the state) until it passes. Done when the same E2E command passes, with the existing "AC 15" test still passing.
3. `cloud` · AC 1 · Check by hand, as agreed on the issue: start the stack with `pnpm dev`, sign in, stop the API, submit a name, and see the connection error with the name still in the field. Take a screenshot with the pre-installed Chromium for the PR. Done when the screenshot shows the error and the kept name. If the cloud environment can't run the dev stack, say so in the PR and run this step on the Mac mini.
4. `cloud` · A2 · No new code. Confirm the existing "[security] #19 AC 1" test still passes, because the action now returns different state on failure. Done when the full web E2E run passes.

## Verification

- `pnpm lint && pnpm typecheck && pnpm test`
- `pnpm --filter @gop/web test:e2e`. It needs `pnpm db:up` (running) and Chromium. It covers AC 2, AC 3, A2 and A3.
- `verify` for web, for AC 1: run the page against a stopped API and capture the screenshot. This replaces an automated test, as the owner agreed on the issue.
- No `verify` for the API or mobile, because neither changes.

## Risks

- **Form reset after a success.** React 19 resets an uncontrolled form after its action finishes. After a failure the input's `defaultValue` is the failed name. After a success the state has no name, so the reset must go back to empty. Step 2 tests exactly this. If React keeps the old value, the fix stays inside the form component.
- **The failed name travels in the action state.** It is the member's own input, returned to the same browser. It isn't logged or stored, and it adds no exposure beyond what the sign-in form already does with the email.
- **No data, API or mobile impact.** Rolling back is reverting the three files.
- **Question for the author:** none. The spec covers everything this plan changes.
