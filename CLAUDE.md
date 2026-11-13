# Góp

Góp is a group expense-splitting app. Friends, roommates or a trip group record shared expenses and see who owes whom. It is the pilot app for the `solo-factory` project (`thanhwoe/solo-factory`): each GitHub issue goes from spec to merged PR with Claude doing most stages.

## Layout

| Path              | What                                                         | Stack                                                                |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `apps/api`        | HTTP API                                                     | Fastify 5, Drizzle ORM, Postgres (`postgres` driver), run with `tsx` |
| `apps/web`        | Web app: history, filters, export                            | Next.js 16 App Router, `cacheComponents` on                          |
| `apps/mobile`     | Mobile app: quick entry, invites, camera                     | Expo SDK 58, Expo Router, React Native 0.88                          |
| `packages/shared` | Zod schemas, types and pure domain logic shared by all three | Zod 4, shipped as TypeScript source                                  |
| `docs/specs/`     | `<N>.md` spec and `<N>-plan.md` plan per issue               |                                                                      |

## Commands

Run from the repo root.

- `pnpm install`: install everything (Node 24, pnpm 11)
- `pnpm db:up` / `pnpm db:down`: start or stop Postgres in Docker
- `pnpm dev`: run the API (:3001), web (:3000) and the Expo dev server
- `pnpm lint`: Biome lint and format check; `pnpm format` fixes
- `pnpm typecheck`, `pnpm test`, `pnpm build`. The API tests need Postgres: run `pnpm db:up` first. Each test file gets its own throwaway database.
- One package: `pnpm --filter @gop/api test`
- Mobile unit tests (Jest with `jest-expo`, no simulator needed): `pnpm --filter @gop/mobile test`
- Web end-to-end tests: `pnpm --filter @gop/web test:e2e` (Playwright, Chromium). Needs `pnpm db:up`, and Chromium once: `pnpm --filter @gop/web exec playwright install chromium`. It starts the API with dev codes on and a production build of the web on ports 3101 and 3100, against its own `gop_e2e` database. Give every test its own email with `uniqueEmail(testInfo)`: the API limits codes per email. Pass Playwright flags and file filters right after the script name, with no `--`: `pnpm --filter @gop/web test:e2e --repeat-each=10 e2e/groups.spec.ts`. With `--`, pnpm 11 passes the `--` on and Playwright reads the flags as file filters (#51).
- Mobile end-to-end tests (Mac mini only): `pnpm --filter @gop/mobile e2e:ios`, then `e2e:android`, never both at once. Needs `pnpm db:up` and Maestro once (`curl -fsSL https://get.maestro.mobile.dev | bash`, into `~/.maestro`). It starts the API with dev codes on against `gop_e2e`, builds a Release app with `GOP_E2E_BUILD=1` (several minutes the first time) and runs the flows in `apps/mobile/.maestro`. On iOS it boots the simulator and installs the app with `xcrun simctl`, and never calls `osascript`: `expo run:ios`'s own launch step asks System Events for an Automation permission that a runner can't answer, so it failed the `macos-sim` job on 13 Nov (#109). Add `--no-build` after the script name to reuse the installed app, and name flow files to run only those, as paths from `apps/mobile` (`.maestro/groups-create.yaml`); a bare file name is not found. Every flow starts with `subflows/fresh-start.yaml` (it clears the iOS keychain) and makes its own email with `subflows/new-email.yaml`.
- **Pasting on the iOS Simulator:** on the Mac mini's headless Simulator, `xcrun simctl pbcopy` doesn't reach Safari, and Safari's Paste callout isn't in Maestro's view hierarchy, so a plan can't paste into a web page on iOS. Type with Maestro's `inputText`, and say in the record that it was typed (#67).
- **Real devices:** the owner has one iPhone (iPhone 14 Pro Max, iOS 27) with Gmail as its mail app, and no Android phone. A criterion that needs a real Android phone can't be checked: use the Android emulator (`Pixel_9_API_35`) and say so, or ask before gate 1. Don't assume Apple Mail (#87).
- Database: `pnpm --filter @gop/api db:generate`, then `db:migrate`. Nothing applies migrations automatically: run `db:migrate` after pulling, before `pnpm dev`.

Before you say a change is done, run `pnpm lint && pnpm typecheck && pnpm test`.

## Rules

- **Money:** whole VND as integers. No floats, no decimals, one currency per group.
- **Shared contracts:** every request and response body has a Zod schema in `packages/shared`. The API returns that type, and web and mobile parse with that schema.
- **Rejected session:** a call that sends the session token goes through `guardSession` in `packages/shared`, and only a 401 `unauthorized` ends the session. On the web, use `endRejectedSessionInAction` (Server Actions) or `redirectRejectedSessionFromComponent` (Server Components) from `apps/web/src/lib/rejected-session.ts`. On mobile, use `useSessionGuard` from `apps/mobile/src/lib/session-guard.ts`. Never handle a 401 in a screen.
- **Domain logic** (balances, splits, settlements) is pure functions in `packages/shared` with unit tests. Keep it out of route handlers and components.
- **Tests first:** write tests from the issue's Given/When/Then acceptance criteria before the code.
- **API:** `buildApp(deps)` in `apps/api/src/app.ts` takes its dependencies, so tests call it with `app.inject` and fakes. Only `server.ts` touches the real database and network.
- **Config:** read env vars through the schema in `apps/api/src/env.ts`. Commit `.env.example`, never `.env`. The API needs `AUTH_SECRET` (at least 32 characters, e.g. `openssl rand -base64 32`).
- **Sign-in:** with `RESEND_API_KEY` set the API emails each sign-in code through Resend (from `onboarding@resend.dev`, which delivers only to the key owner's address) and does not log it; without it the API writes the code to its log. Keep the key in the git-ignored `apps/api/.env`, never in the repo, CI or an issue. The e2e runs set it empty. For automated UI tests, set `DEV_SIGN_IN_CODES=true` and read the code from `GET /dev/sign-in-code?email=`. The endpoint exists only when `NODE_ENV` is set to exactly `development` or `test`; unset or anything else means off.
- **Next.js:** this version differs from older training data. Read `apps/web/AGENTS.md` and the guides in `node_modules/next/dist/docs/` before changing web code. Keep the generated `AGENTS.md` block committed.
- **Action forms:** an input in a form that uses `useActionState` is controlled (`value` and `onChange`), not `defaultValue`. React resets an uncontrolled field when the action ends, so text typed while the action was pending is replaced by the old value (#51, #55). Test it with `holdFirstServerAction` in `apps/web/e2e/helpers.ts`. For a text field, use `ActionTextField` (`apps/web/src/app/action-text-field.tsx`) instead of a `useState` of its own. It also takes a starting value (`initial`) and clears after a success (`result`, `submitted`) (#72).
- **Waiting in e2e tests:** after a click that replaces something already on the page (a link, a total, a row), wait until it differs from the value read before the click (`expect(field).not.toHaveValue(before)`), not for a pattern the old value also matches. Otherwise a slow runner reads the old value. `makeLink` in `apps/web/e2e/invites.spec.ts` passed `--repeat-each=3` locally and failed in CI (#94).
- **Mobile:** set the API URL with `EXPO_PUBLIC_API_URL`. Without it the app uses `localhost` on iOS and `10.0.2.2` on Android. Give testable elements a `testID` for Maestro. Keep unit tests out of `src/app`: Expo Router bundles every file there, so a test file breaks the Release build. The session token lives only in `expo-secure-store`. `ios/` and `android/` are generated (Continuous Native Generation) and stay out of git; app config is in `app.config.ts`.
- **Mobile on the Mac mini:** `apps/mobile/.expo/types` (typed routes) is git-ignored and goes stale when a route is added, so `pnpm typecheck` doesn't know the new path: start the dev server once (`pnpm --filter @gop/mobile dev`) to regenerate it. Maestro's `takeScreenshot` writes only inside its own output folder: copy the images into `docs/evidence/<N>/` by hand (#97).
- **Mobile navigation and deep links:** to send the user to a screen after the session guard flips (sign-in done, session ended), render `<Redirect href=...>` from the screen that appears; a `router.replace` from the root layout or from an effect is lost on iOS or on Android, and only a Release run on both shows it (#98). In a Maestro flow that opens a deep link right after `launchApp`, first wait for a `testID` of the launched screen: on Android `launchApp` returns before the app is up, and a link sent inside the start-up window is dropped (#98).
- **Dependencies:** pin exact versions, except Expo packages, which follow `npx expo install`.
- **Formatting:** Biome formats with double quotes and 2 spaces. Do not hand-format.

## Factory workflow

Each issue goes through the `factory-kit` skills, which live in `.claude/` as a copy generated from `thanhwoe/solo-factory`:

1. `/factory-intake <N>` runs the zero-questions check.
2. `/factory-spec <N>` writes `docs/specs/<N>.md`. Gate 1: the `spec-ok` label.
3. `/factory-plan <N>` writes `docs/specs/<N>-plan.md`. Gate 2: the `plan-ok` label.
4. `/factory-build <N>` builds it test-first, then runs `/factory-ship`, which opens the PR. Gate 3: review, starting from the PR's "How to review" section, then merge.
5. `/factory-retro <N>` measures how it went and turns what went wrong into at most three concrete changes.

Never edit `.claude/skills/factory-*`, `.claude/agents/factory-*` or `.claude/factory-kit/` here. Change the kit in `solo-factory`, then run `node scripts/sync-kit.mjs ~/projects/pilot-app` there.

## Where work runs

- **Cloud session (Linux):** API, `packages/shared`, web, unit tests, specs and plans.
- **Mac mini:** anything that needs the iOS Simulator, the Android emulator, Xcode or Maestro.
- Each issue's plan tags it `cloud` or `mac`.
- **CI:** GitHub-hosted `ubuntu-latest` runs `check` and `e2e`. A self-hosted runner on the Mac mini, labelled `macos-sim` (Apple M1, 16 GB of RAM), can run jobs that need the iOS Simulator, the Android emulator or Maestro, with no GitHub macOS minutes. The `Mobile E2E` workflow runs its `mobile-e2e` job there, `e2e:ios` and then `e2e:android`, on same-repo PRs that touch `apps/mobile/**`, `packages/shared/**`, `apps/api/**`, `.github/workflows/mobile-e2e.yml`, `scripts/e2e-lock.sh`, `pnpm-lock.yaml` or `docker-compose.yml`; it waits on the e2e lock and, while it holds the lock, shuts down the simulator and emulator it started and stops whatever is left listening on port 3101. It is free but small: run one simulator or emulator at a time. A job there must not overlap a mobile build session on the same machine. When a PR opens, the `Issue labels` workflow swaps `building` for `review` on each issue it closes. When the repository owner adds `ready` to an issue, the `Ready to spec` workflow starts a cloud scheduled task that runs `/factory-intake <N> --post`, then `/factory-spec <N> --post`, and stops at gate 1.
- **Proving something on the runner:** to show how the `macos-sim` runner itself behaves (a port, the e2e lock, a cancel), put the check in the steps of a throwaway PR's workflow, as #78 did, not in a terminal on the Mac mini. The job runs as another user, with its own `$HOME` and `RUNNER_TEMP`, so a terminal there doesn't reproduce it. Close the PR unmerged.
- **Up to date:** `ci.yml` has an `up-to-date` job that fails a PR whose branch doesn't contain the latest `main` (#21). Before you push a branch for a PR, and again whenever `main` moves while the PR is open, run `git fetch origin main`, then `git merge-base --is-ancestor origin/main HEAD || git merge --no-edit origin/main`, and run `pnpm lint && pnpm typecheck && pnpm test` on the result. A merge, not a rebase: the job's own message says so, and it keeps pushed history.
- **Cloud setup:** a `SessionStart` hook (`scripts/cloud/session-start.sh`) installs dependencies and starts Postgres, and prints one status line. If it says `MISSING`, `FAILED` or `NOT running`, read `scripts/cloud/README.md` before working around it. Playwright runs in the cloud only when the environment allows its browser hosts; otherwise run Playwright steps on the Mac mini or in CI.
- **GitHub in the cloud:** `gh issue` and `gh pr` fail there, because the GitHub proxy rejects GraphQL. Use `gh api repos/<owner>/<repo>/...` instead.
- **One end-to-end run at a time per machine:** web and mobile end-to-end runs share the `gop_e2e` database and port 3101. `test:e2e`, `e2e:ios` and `e2e:android` wait on `scripts/e2e-lock.sh`, so a second run waits for the first. Two sessions, or a session and the `macos-sim` runner, can't break each other's runs.

## Definition of done

- A PR that says `Closes #N`.
- Tests derived from the acceptance criteria, and CI green.
- Screenshots for UI changes: web, plus iOS and Android when mobile changed.
- A PR description written from the spec.
