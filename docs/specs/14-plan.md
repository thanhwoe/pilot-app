# Plan: Create a group and list my groups

Issue: #14 · Spec: [14.md](14.md) · Runs on: `cloud, then mac` · Status: waiting for gate 2

## Contracts

### Shared schemas (`packages/shared/src/groups.ts`, re-exported from the package index)

| Export                                         | Shape                                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GROUP_NAME_MAX_LENGTH`                        | `100`                                                                                                 |
| `groupNameSchema`                              | `z.string().trim().min(1).max(100)`                                                                   |
| `createGroupBodySchema`, `CreateGroupBody`     | `{ name: groupNameSchema }`                                                                           |
| `groupSchema`, `Group`                         | `{ id: uuid, name: string, memberCount: positive integer, createdAt: ISO 8601 datetime string }`      |
| `groupResponseSchema`                          | `groupSchema`, the body of create and get-one                                                         |
| `groupListResponseSchema`, `GroupListResponse` | `{ groups: Group[] }`                                                                                 |
| `errorResponseSchema` (changed)                | Its `error` enum gains `"not_found"`. Existing values are unchanged, so existing clients still parse. |

### Endpoints

Every endpoint takes `Authorization: Bearer <token>`. A missing, wrong or expired token gets `401 { error: "unauthorized" }`, the same as `GET /me`. The session is checked before the body.

| Method and path   | Request                 | Success                                                                             | Errors                                                                                         |
| ----------------- | ----------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST /groups`    | `createGroupBodySchema` | `201` with `groupResponseSchema`                                                    | `400 invalid_request`: name missing, empty, spaces only, or over 100 characters after trimming |
| `GET /groups`     | none                    | `200` with `groupListResponseSchema`, newest `createdAt` first, ties broken by `id` | none                                                                                           |
| `GET /groups/:id` | none                    | `200` with `groupResponseSchema`                                                    | `404 not_found`: not a member, no such group, or `id` not a UUID, all with the same body       |

### Migration (`apps/api/drizzle/0001_*.sql`, generated with `db:generate`)

It only adds tables; nothing existing changes.

- `groups`: `id uuid` primary key with a random default, `name text not null`, `created_at timestamptz not null`.
- `group_members`:
  - `group_id uuid not null`, referencing `groups(id)` with `on delete cascade`;
  - `user_id uuid not null`, referencing `users(id)` with `on delete cascade`;
  - `joined_at timestamptz not null`;
  - primary key `(group_id, user_id)`, and an index on `user_id` for "my groups".

### API internals that later routes reuse

- **Session check:** a function, `findSessionUser(request)`, that returns the signed-in user or null. It moves out of `registerAuthRoutes`, so auth and group routes check sessions the same way.
- **`GroupStore`:**
  - `createGroup({ name, creatorId, now })` saves the group and the creator's membership in one transaction;
  - `listGroupsForMember(userId)`;
  - `findGroupForMember(groupId, userId)` returns null unless the user is a member. This is the membership check later routes call; it never says whether the group exists.

  There is a Postgres implementation and an in-memory one, kept in step by a contract suite, as with `AuthStore`.

### Shared client and UI logic (`packages/shared/src/groups/`)

- **`createGroupsApi(baseUrl, fetchFn?, timeoutMs?)`:** `listGroups(token)` and `createGroup(token, body)`, both returning `ApiResult`. The `call` helper (timeout, schema parse, every failure becomes `unavailable`) moves out of `createAuthApi` into a shared internal module, so both clients behave the same way.
- **`loadGroups(api, token)`:** returns `{ kind: "loaded", groups }` or `{ kind: "unavailable" }`.
- **`submitGroup(api, token, { name })`:**
  - checks the name with `groupNameSchema` first; an empty name returns `groupsCopy.nameRequired` without calling the API;
  - on success returns `{ created: true, group }`, otherwise `{ error }`;
  - an API failure maps to `signInCopy.unavailable`.
- **`groupsCopy`:**
  - `heading: "Nhóm của tôi"`;
  - `empty: "Bạn chưa có nhóm nào."`;
  - `nameLabel: "Tên nhóm"`;
  - `create: "Tạo nhóm"`;
  - `nameRequired: "Hãy nhập tên nhóm."`;
  - `memberCount: (n) => \`${n} thành viên\``.

### Mobile `testID`s

`groups-heading`, `groups-empty`, `groups-error`, `group-item` (one per group), `group-name-input`, `create-group`, `group-form-error`.

## Files

| File                                                                             | Change                                                                                                            | AC         |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| `packages/shared/src/groups.ts` + `groups.test.ts`                               | New schemas                                                                                                       | 2, 3, 12   |
| `packages/shared/src/auth.ts`                                                    | Add `not_found` to the error enum                                                                                 | 9, 10      |
| `packages/shared/src/index.ts`                                                   | Re-export groups                                                                                                  | –          |
| `apps/api/src/db/schema.ts`                                                      | `groups`, `groupMembers` tables                                                                                   | 1, 5       |
| `apps/api/drizzle/0001_*.sql`, `drizzle/meta/*`                                  | Generated migration                                                                                               | 1, 5       |
| `apps/api/src/groups/store.ts`                                                   | `GroupStore` interface and Postgres implementation                                                                | 1, 4–9     |
| `apps/api/src/groups/memory-store.ts`                                            | In-memory `GroupStore` for route tests                                                                            | 1, 4–9     |
| `apps/api/src/groups/store.contract.ts`, `store.test.ts`, `memory-store.test.ts` | Contract suite on both stores, plus a Postgres-only check that one membership row is written                      | 1, 4–9     |
| `apps/api/src/auth/session.ts`                                                   | Session check moved out of `auth/routes.ts`                                                                       | 11         |
| `apps/api/src/auth/routes.ts`                                                    | Uses the shared session check; behaviour unchanged                                                                | 11         |
| `apps/api/src/groups/routes.ts` + `routes.test.ts`                               | `POST /groups`, `GET /groups`, `GET /groups/:id`                                                                  | 1–12       |
| `apps/api/src/app.ts`                                                            | `AppDeps.groupStore`; registers the group routes                                                                  | 1–12       |
| `apps/api/src/server.ts`                                                         | Passes the Postgres `GroupStore`                                                                                  | –          |
| `apps/api/src/app.test.ts`, `auth/routes.test.ts`                                | Pass a memory `GroupStore` to `buildApp`                                                                          | –          |
| `packages/shared/src/api-client.ts`                                              | `call` helper moved out of `sign-in/api.ts`                                                                       | 17, 22     |
| `packages/shared/src/sign-in/api.ts`                                             | Uses the shared helper; behaviour unchanged (existing tests prove it)                                             | –          |
| `packages/shared/src/groups/{api,flow,copy,index}.ts` + tests                    | Groups client, `loadGroups`, `submitGroup`, copy                                                                  | 13–22      |
| `apps/web/src/lib/api.ts`                                                        | `groupsApi()`                                                                                                     | 13–17      |
| `apps/web/src/app/groups.tsx`                                                    | Server component: the list, the empty state or the connection error                                               | 13, 14, 17 |
| `apps/web/src/app/create-group-form.tsx`                                         | Client form with `useActionState`; button disabled while pending                                                  | 15, 16, 17 |
| `apps/web/src/app/actions.ts`                                                    | `createGroupAction`: reads the cookie, calls `submitGroup`, then refreshes the page                               | 15, 16, 17 |
| `apps/web/src/app/page.tsx`, `globals.css`                                       | Groups section under the account line                                                                             | 13–17      |
| `apps/web/e2e/groups.spec.ts`                                                    | Playwright tests                                                                                                  | 13–16      |
| `apps/mobile/src/lib/api.ts`                                                     | `groupsApi`                                                                                                       | 18–22      |
| `apps/mobile/src/lib/groups.ts`                                                  | Reads the token from secure storage and calls `loadGroups` and `submitGroup`; the token never enters screen state | 18–22      |
| `apps/mobile/src/app/index.tsx`                                                  | Groups section: list, empty state, error, create form; the screen scrolls                                         | 18–22      |
| `apps/mobile/.maestro/groups-*.yaml`                                             | Maestro flows                                                                                                     | 18–21      |

## Steps

1. `cloud` · AC 2, 3, 12 · **Shared group schemas.**
   - Write first, in `groups.test.ts`: the name is trimmed; empty, spaces-only and missing names fail; 100 characters pass and 101 fail; a group with an ISO `createdAt` parses; `not_found` parses in `errorResponseSchema`.
   - Then add `groups.ts` and the enum value.
   - Done when `pnpm --filter @gop/shared test` passes.
2. `cloud` · plumbing for AC 1, 5 · **Tables and migration.** Add `groups` and `groupMembers` to `schema.ts`, then run `db:generate`.
   - It is needed because steps 3 to 6 need the tables.
   - Done when `pnpm db:up && pnpm --filter @gop/api test` passes. The existing store tests run every migration on a fresh database.
3. `cloud` · AC 1, 4, 5, 6, 7, 8, 9 · **`GroupStore`.**
   - Write first, in `store.contract.ts`, run against both stores:
     - creating a group returns it with member count 1;
     - two groups can share a name;
     - the list is newest first with member counts, and a second member, added through a test hook, shows 2;
     - a new user's list is empty;
     - user B's group is not in A's list;
     - `findGroupForMember` returns the group to a member and null to a non-member and for an unknown id.
   - Also first, in `store.test.ts` (Postgres only): after a create there is exactly one `group_members` row, the creator's.
   - Then add the Postgres store, with group and membership in one transaction, and the memory store.
   - Done when `pnpm --filter @gop/api test` passes.
4. `cloud` · plumbing for AC 11 · **Move the session check** out of `registerAuthRoutes` into `auth/session.ts`, unchanged.
   - It is needed so the group routes check sessions exactly as `/me` does.
   - Done when the existing `auth/routes.test.ts` passes untouched.
5. `cloud` · AC 1–7 · **Group routes.**
   - Write first, in `groups/routes.test.ts` with the memory stores and the test clock, as in `auth/routes.test.ts`:
     - create answers 201 with the group, and the group is in `GET /groups`;
     - a name with spaces around it comes back trimmed;
     - empty, spaces-only and missing names get 400 `invalid_request`, and the list stays empty;
     - a duplicate name is created;
     - the list is newest first;
     - a new user gets `{ groups: [] }`;
     - a member gets `GET /groups/:id`.
   - Then add the routes, add `groupStore` to `AppDeps`, and wire `server.ts`.
   - Every response is built as the shared type and checked with the shared schema in the tests.
   - Done when `pnpm --filter @gop/api test` and `pnpm typecheck` pass.
6. `cloud` · [security] AC 8, 9, 10, 11, 12 · **Security route tests**, in their own `describe` in `groups/routes.test.ts`:
   - B's group is not in A's list;
   - A asking for B's group gets the same status and body as for a random unused UUID, both `404 not_found`;
   - `GET /groups/not-a-uuid` gets 404 `not_found`;
   - with no token, a wrong token and a token past 30 days, each of the three routes answers 401 `unauthorized`, and no group is created;
   - 101 characters get 400 with no group, and 100 characters are accepted.

   These may pass at once on step 5's code. If they do, confirm that each one fails when its guard is removed (the membership check, the UUID check, the session check, the length limit), then put the guard back.

   Done when `pnpm --filter @gop/api test` passes.
7. `cloud` · AC 17 and 22 (unit), and the client side of 13–16 and 18–21 · **Shared groups client and flow.**
   - Write first, with a fake `fetch`:
     - `createGroupsApi` sends the bearer token to `GET /groups` and `POST /groups`, parses with the shared schemas, and returns `unavailable` on a timeout, a network error or a body that doesn't parse;
     - `submitGroup` with spaces only returns `nameRequired` and calls nothing;
     - `submitGroup` trims and sends the name;
     - `submitGroup` maps `unavailable` to the connection copy;
     - `loadGroups` maps failures to `unavailable`;
     - `memberCount(1)` is `"1 thành viên"`.
   - Then move `call` into `api-client.ts` and add `groups/`.
   - Done when `pnpm --filter @gop/shared test` passes, including the existing `sign-in/api.test.ts` unchanged.
8. `mac` · AC 13, 14, 15, 16 · **Web.** Read `apps/web/AGENTS.md` and the Next 16 docs on Server Actions and refreshing after a mutation first.
   - Write first, in `e2e/groups.spec.ts`, each test with its own `uniqueEmail`:
     - a new user sees the heading and "Bạn chưa có nhóm nào.";
     - creating "Đà Lạt" puts it in the list with "1 thành viên" and clears the field;
     - creating two groups lists the second one first;
     - submitting spaces only shows "Hãy nhập tên nhóm." and the empty state stays.
   - Then build the groups section, the form and the action.
   - It runs on `mac` because the cloud's network allowlist blocks Playwright's browser download (`CLAUDE.md`); CI's `e2e` job runs it too.
   - Done when `pnpm --filter @gop/web test:e2e` passes.
9. `mac` · AC 18, 19, 20, 21 · **Mobile.**
   - Write first, as Maestro flows, each starting with `fresh-start` and `new-email`:
     - `groups-empty.yaml`: the heading and the empty state (AC 19);
     - `groups-create.yaml`: create "Đà Lạt", see it with "1 thành viên" and an empty field; create "Nhà" and see it above "Đà Lạt" (AC 18, 20);
     - `groups-empty-name.yaml`: spaces only shows the error, and the empty state stays (AC 21).
   - Then add the groups section to `index.tsx`. The screen scrolls, since the list can grow.
   - Done when `pnpm --filter @gop/mobile e2e:ios` passes, and then `e2e:android`, run one at a time.
10. `mac` · AC 17, 22 · **API down, by hand.** Stop the API and open the web home and the app home. Each shows the connection error. A create shows it too and adds no group. Screenshots of each go in the PR. The shared unit tests from step 7 cover the mapping.

## Verification

- `pnpm lint && pnpm typecheck && pnpm test`, with `pnpm db:up` (steps 1–7, in the cloud).
- `pnpm --filter @gop/web test:e2e` (step 8), and CI's `check` and `e2e` jobs green.
- `pnpm --filter @gop/mobile e2e:ios`, then `e2e:android` (step 9).
- `/factory-verify`:
  - **API**: create, list and get on a local server with curl, including another user's group (404), a malformed id (404) and no token (401), for AC 1–12.
  - **Web**: the home page with no groups, one group and two groups, the empty-name error, and the API stopped, for AC 13–17.
  - **Mobile**: the same on the iOS Simulator and then the Android emulator, for AC 18–22.
  - Screenshots of the list and the create form on web, iOS and Android, plus the API-down state, go in the PR.

## Risks

- **Migration:** it only adds two tables, so existing users, codes and sessions are untouched. To roll back, revert the PR and drop `group_members`, then `groups`. Nothing else references them. Remember to run `db:migrate` after pulling, as `CLAUDE.md` says.
- **Error enum:** `not_found` is a new value in the shared enum. Both clients ship from this repo and parse with the updated schema, so no old client sees it.
- **Refactors in steps 4 and 7:** moving the session check and the `call` helper touches sign-in code. The existing auth route tests and `sign-in/api.test.ts` must pass unchanged. That is the safety net, so neither test file is edited in those steps.
- **Same-instant creates:** two groups created at the same instant are ordered by `id`, which is stable but arbitrary. The tests move the clock (API) or create in sequence (E2E), so they don't depend on the tie-break.
- **A 401 while listing:** if the session dies between the account check and the groups call, the groups section shows the connection error instead of signing out. The web's account line still redirects on its own 401, and mobile does the same at its next start. That is out of the spec's scope.
- **Question for gate 2: AC 17's test level.** The spec's matrix asks for a web E2E test of the API-down page. The web calls the API from its server, so Playwright can't make that call fail without a second production web server pointed at a dead API URL, which would be a new web server in `playwright.config.ts`. The plan instead covers AC 17 with unit tests (step 7) and a by-hand check with screenshots (step 10), as #6 and #7 did. If you want the E2E test, say so and step 8 adds that second server.
- **Size:** the spec has 22 criteria across API, web and mobile, and the split proposed at gate 1 wasn't taken up, so this is one PR. The `cloud` steps (1–7) can be pushed and reviewed first, and the `mac` steps (8–10) continue with `/factory-build 14 --from 8`.
