# Plan: Groups: an expired session shows the connection error instead of sign-in

Issue: #19 · Spec: [19.md](19.md) · Runs on: `cloud, then mac` · Status: waiting for gate 2

## Contracts

No endpoint, request or response body and no migration changes: the group routes already answer 401 `unauthorized` (#14, AC 11), and `createApiCall` already turns that body into `error: "unauthorized"`.

Shared TypeScript types that web and mobile use change:

- `GroupsState` (`packages/shared/src/groups/flow.ts`) gains `{ kind: "signed-out" }`. `loadGroups` returns it when the API answers `unauthorized`; every other failure stays `{ kind: "unavailable" }`.
- `CreateGroupOutcome` gains `{ created: false; signedOut: true }`. `submitGroup` returns it when the API answers `unauthorized`; `invalid_request` stays "Hãy nhập tên nhóm.", everything else stays the connection error.
- New export `expireSession(store: SessionStore): Promise<void>` (`packages/shared/src/sign-in/session.ts`): deletes the stored token and never throws, the same quiet delete `restoreSession` and `signOutSession` already use. It makes no API call (spec assumption 2).

## Files

| File                                          | Change                                                                                                                     | AC   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---- |
| `packages/shared/src/sign-in/session.test.ts` | Tests for `expireSession`                                                                                                  | 3, 4 |
| `packages/shared/src/sign-in/session.ts`      | Export `expireSession`, built on the existing `deleteQuietly`                                                              | 3, 4 |
| `packages/shared/src/groups/flow.test.ts`     | Replace "reads unauthorized as unavailable" with signed-out tests; add regression cases                                    | 1–6  |
| `packages/shared/src/groups/flow.ts`          | Signed-out variants in `GroupsState` and `CreateGroupOutcome`; map `unauthorized` to them; update the `loadGroups` comment | 1–6  |
| `apps/web/src/app/groups.tsx`                 | `signed-out` → `redirect("/session/clear")`, as `account.tsx` does                                                         | 2    |
| `apps/web/src/app/actions.ts`                 | `signedOut` outcome → delete the session cookie, `redirect("/sign-in")`                                                    | 1    |
| `apps/mobile/src/lib/session.tsx`             | Session gains `expire()`: `expireSession(store)`, then state `clear`                                                       | 3, 4 |
| `apps/mobile/src/app/index.tsx`               | `Groups` calls `expire()` on a signed-out list or create result                                                            | 3, 4 |
| `apps/web/e2e/helpers.ts`                     | `endSession(token)`: `POST /auth/sign-out` on the API with that token                                                      | 1    |
| `apps/web/e2e/groups.spec.ts`                 | AC 1 end-to-end test                                                                                                       | 1    |

## Steps

1. `cloud` · AC 3, 4 `[security]` · First, in `session.test.ts`: `expireSession` deletes the stored token; it resolves without throwing when `store.delete` rejects; it calls no API → add `expireSession` to `session.ts`, reusing `deleteQuietly` · done when `pnpm --filter @gop/shared test` passes.
2. `cloud` · AC 1, 2, 3, 4, 5, 6 `[security]` · First, in `flow.test.ts`: `loadGroups` with `unauthorized` gives `{ kind: "signed-out" }`; `submitGroup` with `unauthorized` gives `{ created: false, signedOut: true }`; `unavailable` still gives the connection error from both (5xx and timeouts already reach the flow as `unavailable`, tested in `sign-in/api.test.ts`); an empty name and `invalid_request` still give "Hãy nhập tên nhóm." and never signed-out → change `flow.ts`, then handle the new variants in `groups.tsx`, `actions.ts`, `session.tsx` and `index.tsx` · done when `pnpm lint && pnpm typecheck && pnpm test` passes. This step touches six files because the new union members break the four callers' typecheck until they handle them; splitting it would leave the repo red between commits.
3. `cloud` · AC 1 `[security]` · First, the web E2E test in `groups.spec.ts`: sign in, read the session cookie's value with `sessionCookie(page)`, end that session with the new `endSession` helper, submit "Đà Lạt"; then the URL is `/sign-in`, `sessionCookie(page)` is undefined, and after signing in again with the same email the page shows "Bạn chưa có nhóm nào." · done when `pnpm --filter @gop/web test:e2e` passes, with the existing `session.spec.ts` "AC 16: a cookie the API rejects sends me to sign-in" still green (spec AC 2's E2E row). If the cloud environment blocks Playwright's browser hosts, CI's `e2e` job is the check.
4. `mac` · AC 3, 4, 6 · No new test file (spec: manual). Run the existing groups flows on iOS, then Android: `pnpm --filter @gop/mobile e2e:ios groups-create.yaml groups-empty-name.yaml groups-empty.yaml`, then `e2e:android` with the same flows. Then by hand on each platform, against the dev database: sign in with a fresh email, end its sessions with `psql "$DATABASE_URL" -c "delete from sessions where user_id = (select id from users where email = '<email>')"`, type a name and tap "Tạo nhóm": the sign-in screen shows (AC 3). Take a screenshot. Relaunch: the sign-in screen still shows, so the token is gone (AC 3, 4). Take a screenshot · done when both platforms' flows pass and the four screenshots are ready for the PR.

## Verification

- `pnpm lint && pnpm typecheck && pnpm test` after every step.
- `pnpm --filter @gop/web test:e2e` for AC 1 and AC 2 (step 3), in the cloud or CI.
- `verify` web: on a local server, sign in, end the session through the API, submit the create form, and check the redirect and the missing cookie (AC 1). Also stop the API with the page open and submit, to check the connection error shows and the cookie stays (AC 5).
- `verify` mobile on the Mac mini: step 4's by-hand checks, with iOS and Android screenshots (AC 3, 4).
- `verify` API: not needed; the API doesn't change.

## Risks

- **Existing users:** only a 401 from the group calls behaves differently. Today it shows the connection error; afterwards it signs the user out on that device, which the account check would have done at the next page load (web) or start (mobile) anyway. No data changes. To roll back, revert the PR.
- **The `index.tsx` create path:** `expire()` unmounts the home screen while `create()` is in its `finally`. Setting state on an unmounted component is a no-op in React 19, so the plan doesn't guard it. Step 4 is where a warning or crash would show.
- **AC 2 and AC 4 rest on unit tests.** Only the groups call getting a 401 while the account check passed can't be produced end to end (both calls use one session). The relaunch in step 4 shows sign-in through the account check, not the groups path. Review should read `groups.tsx` and `index.tsx` against those criteria.
- **Spec correction:** the spec's test matrix (AC 5) says "Existing E2E for the API-down page still pass", but there is no such E2E test: #14 covered its API-down criterion with unit tests and a by-hand check. AC 5 here is covered by the unit tests in step 2 and the `verify` web check above. This plan adds no API-down E2E, since that needs a second web server pointed at a dead API (the same trade-off #14 made at gate 2). Say so if you want it.
- **Local Postgres:** the SessionStart hook in this cloud session fell back to the image's PostgreSQL 16 because Docker failed to start. CI uses 18. Nothing here depends on a version difference, but a test that passes only locally should be checked in CI.
