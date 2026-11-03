# Plan: Mobile: test the double-tap guard and the reload after a failed first load

Issue: #23 · Spec: [23.md](23.md) · Runs on: `cloud, then mac` · Status: waiting for gate 2

## Contracts

None. No schema, endpoint or migration changes. The only production-code change allowed is a `testID`, and none is expected (`apps/mobile/src/app/index.tsx` already has `sign-out`, `create-group`, `group-name-input`, `group-name`, `group-member-count`, `groups-error`).

## Files

| File                                                          | Change                                                                                                                                                                                                                                        | AC      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `apps/mobile/package.json`                                    | Add a `test` script and the devDependencies `jest`, `jest-expo`, `@testing-library/react-native`, `@types/jest` (exact pins; Expo packages via `npx expo install`)                                                                            | A1      |
| `apps/mobile/jest.config.js`                                  | `jest-expo` preset, the `@/` path alias, and `src/**/*.test.{ts,tsx}`. The preset already transforms `@gop/shared`, which ships as TypeScript source                                                                                          | A1      |
| `apps/mobile/src/home.test.tsx`                               | Tests for AC 1, AC 2 and AC 3 (list and create): the real `Home` and `SessionProvider`, with fake API clients (groups, auth and health) and an in-memory `expo-secure-store`. Outside `src/app`, because Expo Router bundles every file there | 1, 2, 3 |
| `apps/mobile/.maestro/groups-double-tap.yaml`                 | New flow: sign in, type an ASCII name, `doubleTapOn` "Tạo nhóm", assert one group and one "1 thành viên", also after a relaunch. A check of the screen, not proof of the guard                                                                | 1       |
| `apps/mobile/tsconfig.json`, `apps/mobile/tsconfig.test.json` | The app config leaves out the tests and loads no ambient `@types`, so Jest's globals don't type-check in app code. The test config adds the `jest` types. `typecheck` runs both                                                               | A1      |
| `CLAUDE.md`                                                   | Name the mobile unit tests under Commands (REVIEW.md asks for docs when commands change)                                                                                                                                                      | A1      |
| `pnpm-lock.yaml`                                              | Updated by `pnpm install`                                                                                                                                                                                                                     | A1      |

## Steps

1. `cloud` · A1, AC 2 · Write the AC 2 test first, in `home.test.tsx`: the first `loadMyGroups` answers `unavailable`, a create succeeds, the second load lists the new group and an existing one, and both are on screen. It cannot run yet, so add the runner (`package.json`, `jest.config.js`, lockfile) and the `CLAUDE.md` line. Then prove the test: remove the reload branch in `index.tsx` by hand, see the test fail, restore it · done when `pnpm --filter @gop/mobile test` passes and `pnpm test` at the root runs it
2. `cloud` · AC 3 (security) · Write two tests first, in the same file. A real `SessionProvider` with a fake auth API and an in-memory store, and a small harness that shows `Home` while the session isn't `clear` and a sign-in button otherwise. (a) A list request is held open; press `sign-out`, sign in again, then the held request answers `signed-out`: the stored token is still the new one and `signed-in-email` shows. (b) The same with a held create request. Prove both: remove the `mounted` checks in `index.tsx` by hand, see both fail, restore them · done when `pnpm --filter @gop/mobile test` passes
3. `mac` · AC 1 · Write `groups-double-tap.yaml` first: after the shared sign-in subflow, type the name and `doubleTapOn` `create-group`, then assert one `group-name` with that name, one `group-member-count` of "1 thành viên", and `groups-empty` gone. Run it on iOS, then on Android, never both at once. Prove it: remove the `inFlight` guard by hand, rebuild, see it fail on both, restore it · done when `pnpm --filter @gop/mobile e2e:ios .maestro/groups-double-tap.yaml` and `e2e:android` pass with the guard in place

   Changed in build: Maestro's taps are too slow to beat the re-render. `doubleTapOn` on iOS and a zero-delay repeated tap on iOS and Android all passed with the guard removed, with one group stored. So AC 1's proof is a unit test in `home.test.tsx`: two presses before a re-render, with the create held open, make one create request. Prove it fails with the `inFlight` guard removed. The Maestro flow stays as a check of the screen, run on iOS then Android with the guard in place.

## Verification

- Steps 1 and 2 (cloud): `pnpm lint && pnpm typecheck && pnpm test`.
- Step 3 (mac): `pnpm db:up`, then `pnpm --filter @gop/mobile e2e:ios groups-double-tap.yaml`, then `e2e:android groups-double-tap.yaml`. Then the whole mobile suite on one platform, to check the new flow doesn't disturb the others. A Release build is needed for the guard-removed run, and the first build takes several minutes.
- No `verify` for web or the API, because nothing there changes. Mobile `verify` covers AC 1 only, through the Maestro flow.
- Screenshots: no UI changes, so none. The PR carries the failing output of each test with its own fix removed, plus the restored passing run.

## Risks

- **Runner compatibility.** `jest-expo` and `@testing-library/react-native` must work with Expo SDK 58, React Native 0.88 and React 19.3. If no compatible release exists, step 1 stops and goes back to you: the alternative is a pure-logic extraction, which the spec rules out of scope.
- **`@gop/shared` as TypeScript source.** Jest has to transform it, and the React Compiler setting in `app.config.ts` may need to be switched off in the test Babel config. Both stay inside `jest.config.js`. In the build, the `jest-expo` preset handled both with no extra config.
- **Double tap timing.** Maestro may tap too slowly to beat the re-render, so the flow passes even without the guard. If so, step 3 uses another gesture until it fails without the guard, and the spec's assumption says the flow is not accepted otherwise.
- **Mac mini load.** Step 3 must not overlap another simulator or build session (one at a time on `macos-sim`). The e2e lock handles two e2e runs but not a build session.
- **CI time.** `pnpm test` now includes a jest run in the ubuntu `check` job. It does not touch the iOS or Android toolchains.
- **Rollback:** the change is tests, config and one docs line. Reverting the PR removes it, and nothing in production code or data depends on it.
