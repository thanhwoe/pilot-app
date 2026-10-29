# Plan: Health check reports the API version

Issue: #2 · Spec: [2.md](2.md) · Runs in: `cloud`

## Files

| File                                 | Change                                                              |
| ------------------------------------ | ------------------------------------------------------------------- |
| `packages/shared/src/health.ts`      | Add required `version: z.string().min(1)` to `healthResponseSchema` |
| `packages/shared/src/health.test.ts` | Tests for AC 2                                                      |
| `apps/api/src/version.ts`            | New: `apiVersion`, read from `apps/api/package.json`                |
| `apps/api/src/app.ts`                | `buildApp` takes `version` as a dependency and returns it           |
| `apps/api/src/app.test.ts`           | Tests for AC 1                                                      |
| `apps/api/src/server.ts`             | Pass `apiVersion` to `buildApp`                                     |
| `apps/web/src/app/api-status.tsx`    | Show the version in the status line (AC 3)                          |

## Steps

1. Write the failing tests for AC 1 and AC 2.
2. Add `version` to the schema.
3. Add `version.ts`, the `version` dependency and wire it in `server.ts`.
4. Show the version in the web status line.
5. Run `pnpm lint && pnpm typecheck && pnpm test`, then check the home page against the running API and take a screenshot.

## Risks

- `version` becomes required in the shared schema, so a client talking to an older API fails to parse `/health`. The API, web and mobile ship from one repo, so they move together.
- The mobile app parses the same schema but does not display the version. That is a non-goal of this issue.
