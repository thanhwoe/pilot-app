# Plan: One handler for a rejected session on every API call

Issue: #31 · Spec: [31.md](31.md) · Runs on: `cloud` · Status: waiting for gate 2

## Contracts

None. No endpoint, request or response body, migration or copy changes.

One new internal export from `packages/shared`: the result type `Guarded<T>` (`ok`, `signed-out` or `failed` with the call's error) and `guardSession(result)`, which turns an `ApiResult<T>` into one. It is a TypeScript type, not a body, so it needs no Zod schema (spec assumption 6). `GroupsState`, `CreateGroupOutcome` and `AccountState` keep their shapes, so the #19 and #23 tests pass unchanged.

## Files

| File                                                       | Change                                                                                                                                             | AC       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `packages/shared/src/session-guard.ts`                     | New: `Guarded<T>` and `guardSession`, the one place that reads 401 `unauthorized` as signed out                                                    | 1, 2     |
| `packages/shared/src/session-guard.test.ts`                | New: a call with no 401 handling of its own, and each non-401 answer through the real API client with a fake `fetch`                               | 1, 2     |
| `packages/shared/src/index.ts`                             | Export the new module                                                                                                                              | 1        |
| `packages/shared/src/groups/flow.ts`                       | `loadGroups` and `submitGroup` use `guardSession` instead of their own `unauthorized` branches                                                     | 1, 2     |
| `packages/shared/src/sign-in/flow.ts`                      | `accountState` uses `guardSession`                                                                                                                 | 1        |
| `apps/web/vitest.config.ts`                                | Add the `@/` path alias, so tests can import app code                                                                                              | 3, 4, 5  |
| `apps/web/src/lib/rejected-session.ts`                     | New: two functions. One for Server Actions deletes the cookie and redirects to `/sign-in`. One for Server Components redirects to `/session/clear` | 3, 4     |
| `apps/web/src/lib/rejected-session.test.ts`                | New: fake cookie store and mocked `redirect`                                                                                                       | 3, 4     |
| `apps/web/src/app/actions.test.ts`                         | New: the real `createGroupAction` with a fake groups API: 401, then each failure that keeps the session                                            | 3, 5     |
| `apps/web/src/app/groups.test.ts`                          | New: the real `Groups` component with a fake groups API: 401, then a failure that keeps the session                                                | 4, 5     |
| `apps/web/src/app/session/clear/route.test.ts`             | New: `GET /session/clear?next=https://example.com` redirects to `/sign-in` and deletes the cookie                                                  | A5       |
| `apps/web/src/app/actions.ts`, `groups.tsx`, `account.tsx` | Use the two web functions instead of their own cookie and redirect code                                                                            | 3, 4     |
| `apps/mobile/src/lib/session-guard.ts`                     | New: a hook that runs a call and, on a signed-out result, calls `expire()` unless the screen is gone                                               | 6, 8     |
| `apps/mobile/src/lib/session-guard.test.tsx`               | New: the hook with a fake call                                                                                                                     | 6, 7     |
| `apps/mobile/src/home.test.tsx`                            | Add screen tests: 401 on the list and on the create shows sign-in and deletes the token; a failure keeps the token and shows the error             | 6, 7     |
| `apps/mobile/src/app/index.tsx`                            | `Groups` uses the hook; its `mounted` ref and `expireIfShown` go. `inFlight` stays                                                                 | 6, 7, 8  |
| `CLAUDE.md`                                                | A Rules bullet: authenticated calls go through the shared guard and the web and mobile helpers                                                     | plumbing |

## Steps

1. `cloud` · AC 1, 2 · Write `session-guard.test.ts` first: a fake call answering 401 `unauthorized` gives `signed-out`; 400, 404, 429, 500, a timeout, a network failure and an unparseable body, each made by `createApiCall` with a fake `fetch`, never do; success gives `ok` → add `session-guard.ts` and the export · done when `pnpm --filter @gop/shared test` passes
2. `cloud` · AC 1, 2, A1, A2, A4 · The existing `flow.test.ts` and `session.test.ts` are the tests; they must keep passing, so there are none to write first. Make `loadGroups`, `submitGroup` and `accountState` use `guardSession` · done when `pnpm --filter @gop/shared test` passes with no test file changed, and the sign-in and sign-out tests still pass
3. `cloud` · AC 3, 4, 5, A5 · Write first, in `apps/web`: `rejected-session.test.ts` (the action function deletes the cookie then redirects to `/sign-in`; the component function redirects to `/session/clear` and touches no cookie), `actions.test.ts` and `groups.test.ts` (401 signs out; unavailable and 5xx keep the cookie and show the connection error or the form error), and `session/clear/route.test.ts`. They need the alias in `vitest.config.ts` → add `rejected-session.ts` and use it in `actions.ts`, `groups.tsx` and `account.tsx` · done when `pnpm --filter @gop/web test` passes and `pnpm --filter @gop/web typecheck` passes
4. `cloud` · AC 6, 7, 8 · Write first: `session-guard.test.tsx` for the hook (a signed-out result calls `expire()`; another result is returned and nothing is expired; a signed-out result after unmount expires nothing), and the four screen tests in `home.test.tsx` → add `session-guard.ts` and use it in `index.tsx`. The two existing #23 late-401 tests, unchanged, are the AC 8 proof · done when `pnpm --filter @gop/mobile test` passes, and `typecheck` passes
5. `cloud` · plumbing · Add the `CLAUDE.md` bullet, so the next authenticated screen uses the guard · done when `pnpm lint && pnpm typecheck && pnpm test` pass at the root

For steps 3 and 4, the 401 and failure-keeps-the-session tests also pass before the change (they pin today's behaviour). To prove they catch a regression, I remove the guard's `signed-out` branch by hand, see them fail, and restore it. The new files (the web and mobile helpers) fail first because they don't exist yet.

## Verification

- Each step: `pnpm lint && pnpm typecheck && pnpm test` from the root.
- Web end-to-end tests: `pnpm --filter @gop/web test:e2e`, for the #19 tests (`groups.spec.ts` AC 1 and `session.spec.ts` AC 16, three tests). They run in the cloud only if the environment allows Playwright's browser hosts, otherwise in CI. Both app unit suites run in the cloud.
- No `verify` for the API, since nothing there changes. No mobile `verify` or Maestro: no screen changes, and Maestro can't produce a 401. Web `verify` is the Playwright run above.
- No screenshots: no UI changes. The PR carries the failing output for the regression checks in steps 3 and 4.

## Risks

- **The spec's AC 5 row cites an "existing API-down E2E" that does not exist.** `groups.spec.ts` and `session.spec.ts` have no test with the API down, and the E2E setup has no way to stop the API for one test. This plan covers AC 5 with unit tests of the real action and component with a failing fake API instead, which is a lower level than the spec's row. If you want a Playwright test for it, it needs a second web server pointed at a dead port, which is a new test setup and I'd raise it as a follow-up.
- **Mocking Next in Vitest.** `redirect` throws in real use, and `cookies()` needs a request. The tests mock `next/headers`, `next/navigation` and `next/cache`, and the mocked `redirect` throws so code after it can't run. If an async Server Component can't be called directly as a function, the plan falls back to testing its decision through the helper only, and I'd say so.
- **Redirect inside a `try`.** `redirect` works by throwing. The web helpers must not be called inside a `try`/`catch`, or the redirect is swallowed. The existing code already follows this.
- **The mobile hook and the React Compiler.** The compiler is on (`app.config.ts`). The `mounted` ref moves into a hook, and its effect cleanup must still run on unmount, as in #23. The #23 late-401 tests, unchanged, catch a mistake here.
- **Behaviour change risk.** None intended: #19 and #23 tests pass unchanged. The exports of `GroupsState`, `CreateGroupOutcome` and `AccountState` keep their shapes.
- **Rollback:** revert the PR. There is no data or API change.
