# Plan: Sign in on the mobile app with an email one-time code

Issue: #7 · Spec: [7.md](7.md) · Runs on: `cloud, then mac` · Status: waiting for gate 2

## Contracts

### Shared schemas and endpoints

No new or changed request or response schemas, API endpoints or migrations. Both apps use #5's endpoints (`POST /auth/code`, `POST /auth/sign-in`, `GET /me`, `POST /auth/sign-out`) and schemas from `packages/shared/src/auth.ts`.

### New shared exports (`packages/shared/src/sign-in/`, re-exported from the package index)

These move from `apps/web/src/lib/`, so the code and its behaviour stay the same, except where the table says otherwise.

| Export                                                                             | What                                                                                                        | Change from the web version                                                   |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `createAuthApi(baseUrl, fetchFn?, timeoutMs?)`, `AuthApi`, `ApiResult`, `ApiError` | Typed client for the four endpoints; every failure → `unavailable`                                          | Timeout via `AbortController` + `setTimeout` instead of `AbortSignal.timeout` |
| `signInCopy`                                                                       | The Vietnamese copy table from `6.md`                                                                       | Renamed from `copy`                                                           |
| `submitEmail(api, { email })`                                                      | Email step → `SignInState`                                                                                  | Takes plain values, not `FormData`                                            |
| `submitCode(api, { email, code })`                                                 | Code step → `SignInState` or `{ signedIn, token }`                                                          | Takes plain values                                                            |
| `changeEmail(email)`                                                               | Back to the email step                                                                                      | Takes the email, not `FormData`                                               |
| `accountState(me)`                                                                 | `GET /me` result → `signed-in` / `unavailable` / `clear`                                                    | –                                                                             |
| `signOut(api, token, clear)`                                                       | Ends the session; always calls `clear`                                                                      | –                                                                             |
| `SessionStore`                                                                     | `{ get(): Promise<string \| null>; set(token): Promise<void>; delete(): Promise<void> }`                    | New, for mobile                                                               |
| `completeSignIn(api, store, { email, code })`                                      | `submitCode`, then `store.set(token)`; returns `SignInState` or `{ signedIn: true }`, **without the token** | New                                                                           |
| `restoreSession(api, store)`                                                       | Reads the stored token, `GET /me`, `accountState`; deletes the token on `clear`                             | New                                                                           |

The web keeps only the Next-only parts: `authApi()` (reads `API_URL`), the cookie options, the Server Actions (which turn `FormData` into plain values), the proxy and `/session/clear`.

### Mobile

| Piece     | What                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Screens   | `sign-in` (email step, then code step) and `index` (home: email, sign-out, API status line). The root layout uses `Stack.Protected` with the session state as the guard. |
| Token     | Kept only in `expo-secure-store`, under one key (`gop_session`), through a `SessionStore` adapter                                                                        |
| API URL   | `EXPO_PUBLIC_API_URL`, or `localhost` on iOS and `10.0.2.2` on Android, as today                                                                                         |
| `testID`s | `email-input`, `send-code`, `code-input`, `sign-in`, `change-email`, `form-error`, `signed-in-email`, `sign-out`, `account-error`                                        |

### Config

- `packages/shared/tsconfig.json` adds `"DOM"` to `lib`, so the shared client can use the `fetch`, `Response` and `AbortController` types.
- `apps/mobile/app.json` becomes `app.config.ts` with the same values. It allows Android plain-HTTP traffic only when the build sets `GOP_E2E_BUILD=1` (see Risks).
- `apps/mobile/.gitignore` adds `/ios` and `/android` (Continuous Native Generation).

### Migrations

None.

## Files

| File                                                                | Change                                                                                                            | AC                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `packages/shared/tsconfig.json`                                     | Add `"DOM"` to `lib`                                                                                              | plumbing                         |
| `packages/shared/src/sign-in/api.ts` + test                         | Moved from web; `AbortController` timeout                                                                         | 8, 20                            |
| `packages/shared/src/sign-in/copy.ts`                               | Moved from web                                                                                                    | 20                               |
| `packages/shared/src/sign-in/flow.ts` + test                        | Moved from web, plain values; `completeSignIn`, `restoreSession`, `SessionStore`                                  | 6, 8, 11, 12, 14, 15, 16, 17, 20 |
| `packages/shared/src/index.ts`                                      | Re-export `./sign-in`                                                                                             | 20                               |
| `apps/web/src/lib/api.ts`                                           | Keeps only `authApi()`, built on the shared client                                                                | 19                               |
| `apps/web/src/lib/api.test.ts`, `copy.ts`, `sign-in-flow.ts` + test | Deleted (moved)                                                                                                   | 19                               |
| `apps/web/src/app/**` (5 files)                                     | Import from `@gop/shared`; actions turn `FormData` into plain values                                              | 19                               |
| `apps/mobile/package.json`                                          | `expo-secure-store` via `npx expo install`; `e2e` scripts                                                         | plumbing                         |
| `apps/mobile/app.config.ts` (replaces `app.json`)                   | Same config; cleartext only for `GOP_E2E_BUILD=1`                                                                 | plumbing                         |
| `apps/mobile/.gitignore`                                            | `/ios`, `/android`                                                                                                | plumbing                         |
| `apps/mobile/src/lib/api.ts`                                        | Adds `authApi` from the shared client                                                                             | 2, 3                             |
| `apps/mobile/src/lib/session-store.ts`                              | `SessionStore` on `expo-secure-store`                                                                             | 10, 15                           |
| `apps/mobile/src/lib/session.tsx`                                   | Session context: restore at start, sign-in, sign-out                                                              | 1, 10, 11, 12, 13, 16            |
| `apps/mobile/src/app/_layout.tsx`                                   | Session provider and `Stack.Protected` guard                                                                      | 1, 10, 13                        |
| `apps/mobile/src/app/sign-in.tsx`                                   | Email and code steps                                                                                              | 1–7, 17, 18                      |
| `apps/mobile/src/app/index.tsx`                                     | Home: email, sign-out, API status; connection error when the API is down                                          | 9, 11, 12                        |
| `apps/mobile/.maestro/*.yaml`                                       | One flow per behaviour, plus shared sub-flows (`sign-in.yaml`, `fresh-start.yaml`)                                | 1–7, 9, 10, 12, 13, 15, 17, 18   |
| `apps/mobile/e2e/run.sh`                                            | Starts the E2E API (dev codes on, `gop_e2e`), builds Release with `GOP_E2E_BUILD=1`, runs Maestro on one platform | plumbing                         |
| `CLAUDE.md`, `README.md`                                            | Maestro setup and command                                                                                         | plumbing                         |

## Steps

Each step writes its test first, sees it fail, then makes it pass. Each one leaves `pnpm lint && pnpm typecheck && pnpm test` green.

1. `cloud` · AC 8, 20 · Move the API client to `packages/shared`.
   - **Test first:** move `apps/web/src/lib/api.test.ts` to `packages/shared/src/sign-in/api.test.ts`, with these expectations:
     - success, error bodies, network failure, a 500 and a schema break all map as before;
     - a call that never answers gives `unavailable` after `timeoutMs`, using `AbortController`.
   - **Code:** add `DOM` to the shared `lib`, then `shared/src/sign-in/api.ts`. `apps/web/src/lib/api.ts` keeps only `authApi()`, built on it.
   - **Done when** `pnpm test` and `pnpm typecheck` pass.
2. `cloud` · AC 6, 17, 20 · Move the copy and step logic to shared, taking plain values.
   - **Test first:** move `sign-in-flow.test.ts` to shared and change its inputs from `FormData` to `{ email }` and `{ email, code }`. Every outcome keeps its copy:
     - an invalid email or bad code never calls the API;
     - 400, 401, 429 and `unavailable` map to their messages;
     - `changeEmail` and `accountState` behave as before.
   - **Code:** `shared/src/sign-in/copy.ts` and `flow.ts`. The web actions turn `FormData` into plain values. Delete the web copies.
   - **Done when** `pnpm test`, `pnpm typecheck` and `pnpm turbo run build --filter=@gop/web` pass, and `grep` finds no `sign-in-flow` or `copy` module left in `apps/web/src/lib`.
3. `cloud` · [security] AC 15 · Signing in saves the token only in the store.
   - **Test first:** `completeSignIn` with a fake API and a fake store:
     - the right code calls `store.set(token)` once and returns `{ signedIn: true }`, with no `token` field;
     - a wrong code, a bad format or `unavailable` never calls `store.set`.
   - **Code:** `SessionStore` and `completeSignIn`.
   - **Done when** `pnpm --filter @gop/shared test` passes.
4. `cloud` · AC 11, [security] AC 16 · Restoring the session at start.
   - **Test first:** `restoreSession` with fakes:
     - no stored token → `clear`, and `me` is not called;
     - 200 → `signed-in` with the email;
     - 401 → `clear`, and `store.delete` is called;
     - `unavailable` → `unavailable`, and the token is kept.
   - **Code:** `restoreSession`.
   - **Done when** `pnpm --filter @gop/shared test` passes.
5. `cloud` · AC 12, 14 · Sign-out with a store.
   - **Test first:** `signOut(api, await store.get(), store.delete)`:
     - it sends the stored token to `api.signOut`;
     - `store.delete` runs after a 204, a 401 or a thrown error;
     - with no token, it deletes without calling the API.

     This is the existing `signOut` tested with a store, so no new function is needed if these pass.
   - **Done when** `pnpm --filter @gop/shared test` passes.
6. `mac` · AC 19 · Prove the web is unchanged. Run `pnpm --filter @gop/web test:e2e`; every test file under `apps/web/e2e/` stays unedited (`git diff --stat origin/main -- apps/web/e2e` is empty).
   - It's tagged `mac` because the cloud allowlist may block Playwright (see `CLAUDE.md`). If this step runs in the cloud, CI's `e2e` job on the pushed branch proves it instead.
   - **Done when** all 19 tests pass.
7. `mac` · AC 1 · **plumbing + first flow.**
   - **Setup:** install Maestro on the Mac mini (setup, not repo code). Add `expo-secure-store` with `npx expo install`, `app.config.ts`, the `.gitignore` entries, `session-store.ts`, `session.tsx`, the `Stack.Protected` layout, and `e2e/run.sh` plus `pnpm --filter @gop/mobile e2e:ios` and `e2e:android`.
   - **Test first:** `fresh-start.yaml` launches with `clearState` and `clearKeychain`. `01-signed-out.yaml` checks that `email-input` and "Gửi mã" are visible.
   - **Code:** a `sign-in.tsx` email step and the guard.
   - **Done when** `e2e:ios` and `e2e:android` both pass. Run them one at a time; only one simulator or emulator runs at once on the 16 GB Mac mini.
8. `mac` · AC 2, 5, 6, 7 · Email step flows, each with its own email made in the flow with `evalScript`.
   - **Tests first:**
     - the code step names the email, and `GET /dev/sign-in-code` has a code (`runScript` with `http.get`);
     - "Dùng email khác" goes back;
     - "not-an-email" shows "Email không hợp lệ.";
     - after 5 `POST /auth/code` made straight to the API, a 6th through the app shows the too-many-requests copy.
   - **Code:** the email step and the code step markup.
   - **Done when** both platforms pass.
9. `mac` · AC 3, 4, 9, 10 · Code step and home flows.
   - **Tests first:**
     - the dev code lands on home with "Đã đăng nhập: <email>";
     - a wrong code shows the wrong-code copy on the code step;
     - `stopApp` and `launchApp` (no clear) still show the email.
   - **Code:** the code step through `completeSignIn`, the home screen, and the session provider's restore at start.
   - **Done when** both platforms pass.
10. `mac` · [security] AC 15, 17, 18 · Abuse flows.
    - **Tests first:**
      - after sign-in, no visible text has the token's shape: 43 characters of base64url, because the API makes tokens from 32 random bytes. Maestro can't read the stored token, so the flow checks the shape, and step 3's unit test proves the token never leaves the store's `set`;
      - a 5-digit code shows "Mã gồm 6 chữ số." and stays on the code step;
      - after 5 wrong codes sent straight to the API, the right code through the app shows the wrong-code copy.

    - **Code:** these should already pass. Check each flow fails when its behaviour is broken once, locally.
    - **Done when** both platforms pass.
11. `mac` · AC 12, 13 · Sign-out flows.
    - **Tests first:**
      - "Đăng xuất" lands on sign-in;
      - `stopApp` and `launchApp` then still show sign-in.

      The server side of AC 12 is step 5's unit test plus #5's API test (AC 30).
    - **Code:** the sign-out button through the session provider.
    - **Done when** both platforms pass.
12. `mac` · **plumbing:** docs. Add the Maestro install, `pnpm db:up`, and `pnpm --filter @gop/mobile e2e:ios` / `e2e:android` (one at a time) to `CLAUDE.md`'s Commands. Add one line to the README.
    - **Done when** `pnpm lint` passes.

## Verification

- `pnpm lint && pnpm typecheck && pnpm test` (with `pnpm db:up`), `pnpm --filter @gop/web test:e2e` (AC 19), and `pnpm --filter @gop/mobile e2e:ios` and `e2e:android`, one at a time.
- `/factory-verify` on **mobile**, in the iOS Simulator and the Android emulator, one at a time. It covers sign-in, the wrong-code error, home, sign-out and relaunch (AC 1–5, 9, 10, 12, 13). With the API stopped, it covers the home screen's connection error and sign-out (AC 11 and 14 by hand). Screenshots of each go in the PR, including AC 11's on both platforms.
- `/factory-verify` on **web**: a short re-check of sign-in and sign-out after the move (AC 19).

## Risks

- **Web regression from the move.** The web keeps the same behaviour, but its imports change. AC 19 (Playwright unchanged) and CI's `e2e` job guard it. Rollback: revert steps 1–2. The web from #6 is self-contained there.
- **Android plain-HTTP traffic.** A Release build blocks `http://10.0.2.2` by default. `app.config.ts` allows cleartext only when the E2E script builds with `GOP_E2E_BUILD=1`, so store and production builds keep the default. iOS allows `localhost` under App Transport Security's local-networking exception. If the iOS Release build blocks it, the same flag adds the exception.
- **iOS keychain survives reinstall and `clearState`.** A stale token would make "signed out" flows start signed in, so every flow starts with Maestro's `clearKeychain`.
- **One device at a time.** The Mac mini has 16 GB of RAM, so `e2e:ios` and `e2e:android` run one after the other, never together. They must not overlap a CI job on the `macos-sim` runner.
- **Build time.** A Release build takes several minutes per platform. `run.sh` rebuilds only when `apps/mobile` or `packages/shared` changed since the last build, and a flag can force it.
- **`app.json` → `app.config.ts`.** Expo reads either one. The values don't change, and `npx expo config` is diffed against the old JSON in step 7.
- **No migration and no API change.** Reverting the PR removes mobile sign-in, and the web goes back to its own copy of the logic.
