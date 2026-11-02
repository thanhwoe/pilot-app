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
- Web end-to-end tests: `pnpm --filter @gop/web test:e2e` (Playwright, Chromium). Needs `pnpm db:up`, and Chromium once: `pnpm --filter @gop/web exec playwright install chromium`. It starts the API with dev codes on and a production build of the web on ports 3101 and 3100, against its own `gop_e2e` database. Give every test its own email with `uniqueEmail(testInfo)`: the API limits codes per email.
- Mobile end-to-end tests (Mac mini only): `pnpm --filter @gop/mobile e2e:ios`, then `e2e:android`, never both at once. Needs `pnpm db:up` and Maestro once (`curl -fsSL https://get.maestro.mobile.dev | bash`, into `~/.maestro`). It starts the API with dev codes on against `gop_e2e`, builds a Release app with `GOP_E2E_BUILD=1` (several minutes the first time) and runs the flows in `apps/mobile/.maestro`. Add `--no-build` after the script name to reuse the installed app, and name flow files to run only those. Every flow starts with `subflows/fresh-start.yaml` (it clears the iOS keychain) and makes its own email with `subflows/new-email.yaml`.
- Database: `pnpm --filter @gop/api db:generate`, then `db:migrate`. Nothing applies migrations automatically: run `db:migrate` after pulling, before `pnpm dev`.

Before you say a change is done, run `pnpm lint && pnpm typecheck && pnpm test`.

## Rules

- **Money:** whole VND as integers. No floats, no decimals, one currency per group.
- **Shared contracts:** every request and response body has a Zod schema in `packages/shared`. The API returns that type, and web and mobile parse with that schema.
- **Domain logic** (balances, splits, settlements) is pure functions in `packages/shared` with unit tests. Keep it out of route handlers and components.
- **Tests first:** write tests from the issue's Given/When/Then acceptance criteria before the code.
- **API:** `buildApp(deps)` in `apps/api/src/app.ts` takes its dependencies, so tests call it with `app.inject` and fakes. Only `server.ts` touches the real database and network.
- **Config:** read env vars through the schema in `apps/api/src/env.ts`. Commit `.env.example`, never `.env`. The API needs `AUTH_SECRET` (at least 32 characters, e.g. `openssl rand -base64 32`).
- **Sign-in:** there's no email yet; the API writes each sign-in code to its log. For automated UI tests, set `DEV_SIGN_IN_CODES=true` and read the code from `GET /dev/sign-in-code?email=`. The endpoint exists only when `NODE_ENV` is set to exactly `development` or `test`; unset or anything else means off.
- **Next.js:** this version differs from older training data. Read `apps/web/AGENTS.md` and the guides in `node_modules/next/dist/docs/` before changing web code. Keep the generated `AGENTS.md` block committed.
- **Mobile:** set the API URL with `EXPO_PUBLIC_API_URL`. Without it the app uses `localhost` on iOS and `10.0.2.2` on Android. Give testable elements a `testID` for Maestro. The session token lives only in `expo-secure-store`. `ios/` and `android/` are generated (Continuous Native Generation) and stay out of git; app config is in `app.config.ts`.
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
- **CI:** GitHub-hosted `ubuntu-latest` runs `check` and `e2e`. A self-hosted runner on the Mac mini, labelled `macos-sim` (Apple M1, 16 GB of RAM), can run jobs that need the iOS Simulator, the Android emulator or Maestro, with no GitHub macOS minutes. It is free but small: run one simulator or emulator at a time. A job there must not overlap a mobile build session on the same machine.
- **Cloud setup:** a `SessionStart` hook (`scripts/cloud/session-start.sh`) installs dependencies and starts Postgres, and prints one status line. If it says `MISSING`, `FAILED` or `NOT running`, read `scripts/cloud/README.md` before working around it. Playwright runs in the cloud only when the environment allows its browser hosts; otherwise run Playwright steps on the Mac mini or in CI.
- **GitHub in the cloud:** `gh issue` and `gh pr` fail there, because the GitHub proxy rejects GraphQL. Use `gh api repos/<owner>/<repo>/...` instead.
- **One end-to-end run at a time per machine:** web and mobile end-to-end runs share the `gop_e2e` database and port 3101. `test:e2e`, `e2e:ios` and `e2e:android` wait on `scripts/e2e-lock.sh`, so a second run waits for the first. Two sessions, or a session and the `macos-sim` runner, can't break each other's runs.

## Definition of done

- A PR that says `Closes #N`.
- Tests derived from the acceptance criteria, and CI green.
- Screenshots for UI changes: web, plus iOS and Android when mobile changed.
- A PR description written from the spec.
