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
- `pnpm typecheck`, `pnpm test`, `pnpm build`
- One package: `pnpm --filter @gop/api test`
- Database: `pnpm --filter @gop/api db:generate`, then `db:migrate`

Before you say a change is done, run `pnpm lint && pnpm typecheck && pnpm test`.

## Rules

- **Money:** whole VND as integers. No floats, no decimals, one currency per group.
- **Shared contracts:** every request and response body has a Zod schema in `packages/shared`. The API returns that type, and web and mobile parse with that schema.
- **Domain logic** (balances, splits, settlements) is pure functions in `packages/shared` with unit tests. Keep it out of route handlers and components.
- **Tests first:** write tests from the issue's Given/When/Then acceptance criteria before the code.
- **API:** `buildApp(deps)` in `apps/api/src/app.ts` takes its dependencies, so tests call it with `app.inject` and fakes. Only `server.ts` touches the real database and network.
- **Config:** read env vars through the schema in `apps/api/src/env.ts`. Commit `.env.example`, never `.env`.
- **Next.js:** this version differs from older training data. Read `apps/web/AGENTS.md` and the guides in `node_modules/next/dist/docs/` before changing web code. Keep the generated `AGENTS.md` block committed.
- **Mobile:** set the API URL with `EXPO_PUBLIC_API_URL`. Without it the app uses `localhost` on iOS and `10.0.2.2` on Android. Give testable elements a `testID` for Maestro.
- **Dependencies:** pin exact versions, except Expo packages, which follow `npx expo install`.
- **Formatting:** Biome formats with double quotes and 2 spaces. Do not hand-format.

## Factory workflow

Each issue goes through the `factory-kit` skills, which live in `.claude/` as a copy generated from `thanhwoe/solo-factory`:

1. `/factory-intake <N>` runs the zero-questions check.
2. `/factory-spec <N>` writes `docs/specs/<N>.md`. Gate 1: the `spec-ok` label.
3. `/factory-plan <N>` writes `docs/specs/<N>-plan.md`. Gate 2: the `plan-ok` label.
4. `/factory-build <N>` builds it test-first, then runs `/factory-ship`, which opens the PR. Gate 3: review and merge.

Never edit `.claude/skills/factory-*`, `.claude/agents/factory-*` or `.claude/factory-kit/` here. Change the kit in `solo-factory`, then run `node scripts/sync-kit.mjs ~/projects/pilot-app` there.

## Where work runs

- **Cloud session (Linux):** API, `packages/shared`, web, unit tests, specs and plans.
- **Mac mini:** anything that needs the iOS Simulator, the Android emulator, Xcode or Maestro.
- Each issue's plan tags it `cloud` or `mac`.

## Definition of done

- A PR that says `Closes #N`.
- Tests derived from the acceptance criteria, and CI green.
- Screenshots for UI changes: web, plus iOS and Android when mobile changed.
- A PR description written from the spec.
