# Plan: Sign in on the web with an email one-time code

Issue: #6 · Spec: [6.md](6.md) · Runs on: `cloud` · Status: waiting for gate 2

## Contracts

### Shared schemas

None new. The web uses the schemas from #5 in `packages/shared/src/auth.ts`:

| Use                                      | Schema                                                            |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Check the email before sending it        | `requestCodeBodySchema`                                           |
| Check email and code before sending them | `signInBodySchema`                                                |
| Parse API responses                      | `signInResponseSchema`, `meResponseSchema`, `errorResponseSchema` |
| E2E tests read a code                    | `devSignInCodeResponseSchema`                                     |

### API endpoints

None new or changed. The web calls, only from the server:

| Call                  | Used by         | Outcomes the web handles                              |
| --------------------- | --------------- | ----------------------------------------------------- |
| `POST /auth/code`     | email step      | 204 → code step · 400 · 429 · network error           |
| `POST /auth/sign-in`  | code step       | 200 → set cookie, go home · 400 · 401 · network error |
| `GET /me`             | signed-in home  | 200 → show email · 401 → clear cookie, go to sign-in  |
| `POST /auth/sign-out` | sign-out button | any outcome, including a network error → clear cookie |

### Web routes

| Route                  | What                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /`                | Signed-in home: email, sign-out button, existing API status line                                                         |
| `GET /sign-in`         | Email step, then code step (one page, the step is form state)                                                            |
| `GET /session/clear`   | Route handler: deletes the session cookie, redirects to `/sign-in`. Used only for AC 16                                  |
| Proxy (`src/proxy.ts`) | GET `/` with no cookie → `/sign-in`. GET `/sign-in` with a cookie → `/`. Checks only that the cookie exists; no API call |

### Session cookie

`gop_session` = the API's bearer token. Options: `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `secure: NODE_ENV === "production"`, `maxAge: SESSION_TTL_MS / 1000` (30 days). Set by the sign-in Server Action, deleted by the sign-out Server Action and by `/session/clear`.

### Env

The web reads `API_URL` as it does today (default `http://localhost:3001`). No new web env var. E2E runs set the API's `NODE_ENV=test`, `DEV_SIGN_IN_CODES=true` and a test `AUTH_SECRET`.

### Migrations

None.

## Where the rejected cookie is cleared (AC 16)

Next.js can't set or delete cookies while rendering a Server Component, so the cookie is cleared in the `/session/clear` route handler:

1. The proxy sees a cookie on `/` and lets the request through. It never calls the API.
2. The home page's account section (inside `<Suspense>`, since it reads `cookies()`) calls `GET /me`. On 401 it calls `redirect("/session/clear")`. The page is streaming by then, so Next.js sends that redirect as a client-side redirect.
3. `/session/clear` deletes the cookie and answers 307 to `/sign-in`. With no cookie left, the proxy lets `/sign-in` through, so there's no loop.

The costs:

- `GET /me` runs once per home render, in the page. The proxy makes no API calls, so a normal visit costs one API call, not two.
- A rejected cookie costs two extra hops (`/` → `/session/clear` → `/sign-in`), only in that case.
- `GET /session/clear` can be triggered by any site, because the cookie is `SameSite=Lax` and top-level GET navigations send it. The worst it can do is sign the user out of this browser. The server session survives until it expires or the user signs out. That's accepted, and listed under Risks.

Rejected options: a `GET /me` in the proxy on every request (one extra API call per page view, and the Next.js docs warn against slow data fetching in Proxy), and a Server Action (it needs a client to trigger it after render, which means a flash of the home page and a JavaScript dependency).

## E2E test isolation

The API limits codes per email (5 per 15 minutes, 5 wrong attempts per code), so no two tests share an email. A helper builds each test's email from the test id and a random suffix, for example `e2e-<testId>-<random>@example.test`. Every test calls it once and never reuses another test's address. This keeps tests independent whether they run in sequence, in parallel, or in a retry.

The E2E API uses its own database, `gop_e2e`, which is created if missing and migrated before the API starts. Local dev data is never touched. Each run's users stay in `gop_e2e`, which is harmless because emails never repeat.

## Files

| File                                        | Change                                                                                                                           | AC                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `apps/web/package.json`                     | Add `vitest`, `@playwright/test`, `postgres` (devDependencies, exact versions); `test` and `test:e2e` scripts                    | plumbing          |
| `pnpm-lock.yaml`                            | Regenerated by `pnpm install`                                                                                                    | plumbing          |
| `apps/web/vitest.config.ts`                 | Node environment; only `src/**/*.test.ts`                                                                                        | plumbing          |
| `apps/web/src/lib/session-cookie.ts` + test | Cookie name and `sessionCookieOptions(nodeEnv)`                                                                                  | 14, 15            |
| `apps/web/src/lib/copy.ts`                  | The Vietnamese copy from the spec, and error kind → message                                                                      | 4, 6, 7, 8, 17    |
| `apps/web/src/lib/api.ts` + test            | Typed calls to the four endpoints. Each parses with the shared schemas and returns a result: ok, an API error kind, or `network` | 2, 3, 8, 9, 11    |
| `apps/web/src/lib/sign-in-flow.ts` + test   | Pure step logic with an injected API: `submitEmail`, `submitCode`, `signOut` (always clears)                                     | 6, 8, 13, 17      |
| `apps/web/src/app/sign-in/page.tsx`         | Static page that renders the form                                                                                                | 1                 |
| `apps/web/src/app/sign-in/sign-in-form.tsx` | Client component, `useActionState`, email step then code step, "Dùng email khác"                                                 | 2, 4, 5, 6, 7, 17 |
| `apps/web/src/app/sign-in/actions.ts`       | Server Actions that call the flow, set the cookie and `redirect("/")`                                                            | 2, 3, 14, 15      |
| `apps/web/src/app/page.tsx`                 | Home: account section in `<Suspense>`, API status kept                                                                           | 9                 |
| `apps/web/src/app/account.tsx`              | Reads the cookie, `GET /me`, shows "Đã đăng nhập: <email>" and the sign-out form; 401 → `/session/clear`                         | 9, 16             |
| `apps/web/src/app/actions.ts`               | Sign-out Server Action                                                                                                           | 11, 12, 13        |
| `apps/web/src/app/session/clear/route.ts`   | Deletes the cookie, redirects to `/sign-in`                                                                                      | 16                |
| `apps/web/src/proxy.ts`                     | Cookie-presence redirects for GET `/` and `/sign-in`                                                                             | 1, 10, 12         |
| `apps/web/src/app/globals.css`              | Form, error and button styles                                                                                                    | –                 |
| `apps/web/playwright.config.ts`             | Chromium; `webServer` for the API (port 3101) and `next build && next start` (port 3100)                                         | plumbing          |
| `apps/web/e2e/prepare-db.ts`                | Creates `gop_e2e` if missing; then the API's `db:migrate` runs against it                                                        | plumbing          |
| `apps/web/e2e/helpers.ts`                   | `uniqueEmail(testInfo)`, `devCode(email)`, `signIn(page, email)`, direct API calls                                               | plumbing          |
| `apps/web/e2e/sign-in.spec.ts`              | E2E for the sign-in steps                                                                                                        | 1–7, 17, 18       |
| `apps/web/e2e/session.spec.ts`              | E2E for the signed-in home, sign-out and the cookie                                                                              | 9–12, 14–16       |
| `apps/web/.gitignore`                       | `test-results/`, `playwright-report/`                                                                                            | plumbing          |
| `.github/workflows/ci.yml`                  | New `e2e` job: Postgres service, install, Playwright Chromium, `test:e2e`, report on failure                                     | plumbing          |
| `CLAUDE.md`                                 | `pnpm --filter @gop/web test:e2e` in Commands                                                                                    | plumbing          |

## Steps

Each step writes its test first, sees it fail, then makes it pass, and leaves `pnpm lint && pnpm typecheck && pnpm test` green.

1. `cloud` · AC 14, 15 (unit) · **plumbing + first test:** add Vitest to `apps/web` and a `test` script, so `pnpm test` runs the web unit tests. Test first: `sessionCookieOptions("production")` has `httpOnly`, `sameSite: "lax"`, `secure: true`, `path: "/"` and a 30-day `maxAge`; with `"development"`, `"test"` or `undefined`, `secure` is false. Then `session-cookie.ts` · done when `pnpm --filter @gop/web test` passes.
2. `cloud` · AC 6, 8, 17 (unit) · Tests first, with a fake API:
   - an invalid email returns the invalid-email error and never calls `requestCode`;
   - a 5-digit or non-numeric code returns the code-format error and never calls `signIn`;
   - a network failure maps to the connection error on both steps;
   - 400, 401 and 429 map to their copy;
   - a 204 moves to the code step with the normalized email.

   Then `api.ts`, `copy.ts` and `sign-in-flow.ts` · done when `pnpm --filter @gop/web test` passes.
3. `cloud` · AC 13 (unit) · Tests first: `signOut` clears the cookie when the API answers 204, 401 or throws. Then `signOut` in `sign-in-flow.ts` · done when `pnpm --filter @gop/web test` passes.
4. `cloud` · AC 1 · **plumbing + first E2E:** Playwright config, `prepare-db.ts`, `helpers.ts` (including `uniqueEmail`) and the `test:e2e` script. Test first: signed out, `/` lands on `/sign-in` with the email field and "Gửi mã". Then the proxy's no-cookie branch and the sign-in page with the email step · done when `pnpm --filter @gop/web test:e2e` passes.
5. `cloud` · AC 2, 6, 7 · E2E first, each test with its own email:
   - a valid email shows "Nhập mã 6 số đã gửi tới <email>", and `GET /dev/sign-in-code` has a code for it;
   - "not-an-email" shows "Email không hợp lệ." and stays on the email step;
   - after 5 code requests made straight to the API, a 6th through the page shows the too-many-requests copy.

   Then the email-step Server Action · done when `test:e2e` passes.
6. `cloud` · AC 3, 4, 5, 9 · E2E first:
   - the dev code signs in and lands on `/`, which shows "Đã đăng nhập: <email>";
   - a wrong code shows the wrong-code copy on the code step and sets no cookie;
   - "Dùng email khác" returns to the email step.

   Then the code-step action (set cookie, `redirect("/")`), `account.tsx` and the `page.tsx` changes · done when `test:e2e` passes.
7. `cloud` · [security] AC 14, 15, 17, 18 (E2E) · E2E first:
   - after sign-in, the `gop_session` cookie is `httpOnly`, `sameSite: "Lax"` and `secure: true` (the server is `next start`, so `NODE_ENV=production`);
   - the cookie's expiry is 30 days from now, give or take a minute;
   - a 5-digit code shows "Mã gồm 6 chữ số." and sets no cookie;
   - after 5 wrong codes sent straight to the API, the right code through the page shows the wrong-code copy and sets no cookie.

   Code should already pass. A test that passes before any change still has to fail when its behaviour is broken: check that by flipping the option or the check once, locally · done when `test:e2e` passes.
8. `cloud` · AC 10, 11, 12 · E2E first:
   - signed in, `/sign-in` lands on `/`;
   - signing out lands on `/sign-in`, and the token read from the cookie before sign-out now gets 401 from the API's `GET /me`;
   - after sign-out, `/` lands on `/sign-in` and the cookie is gone.

   Then the proxy's cookie branch for `/sign-in`, the sign-out action and the form · done when `test:e2e` passes.
9. `cloud` · [security] AC 16 · E2E first: a made-up `gop_session` cookie on `/` lands on `/sign-in`, and the cookie is gone. Then the 401 branch in `account.tsx` and `session/clear/route.ts` · done when `test:e2e` passes.
10. `cloud` · **plumbing:** CI and docs. Add the `e2e` job to `.github/workflows/ci.yml`, next to `check` and with the same Postgres service. It runs `pnpm exec playwright install --with-deps chromium` and `pnpm --filter @gop/web test:e2e`, and uploads `playwright-report/` when it fails. Also add the command to `CLAUDE.md` and the ignores to `.gitignore` · done when CI's `check` and `e2e` jobs are green on the PR.

## Verification

- `pnpm lint && pnpm typecheck && pnpm test` (with `pnpm db:up`), and `pnpm --filter @gop/web test:e2e`.
- `pnpm turbo run build --filter=@gop/web` passes. Reading the cookie inside `<Suspense>` is required with Cache Components.
- `/factory-verify` on the **web**: sign-in email step, code step with the wrong-code error, signed-in home, and sign-out, against a local API with dev codes (AC 1–5, 9, 11). It takes the PR's screenshots of these. No mobile or API verification is needed, since neither changes.
- CI: the `check` and `e2e` jobs are green.

## Risks

- **Changes CI.** A new `e2e` job, about 2–3 minutes with the Chromium install. Rollback: remove the job, which leaves the unit tests and the app as they are.
- **`Secure` on `http://localhost`.** The E2E server is `next start` (production), so the cookie is `Secure` over plain HTTP. Chromium accepts that on `localhost`, but other hosts would drop it. Running `next start` behind a non-localhost HTTP URL would make sign-in look broken. Deployments must use HTTPS.
- **Sign-out by link.** `GET /session/clear` can be triggered from another site. It only deletes this browser's cookie. The server session stays valid until it expires, and the token is gone from the browser anyway. Accepted (see "Where the rejected cookie is cleared").
- **Proxy is a convenience, not the check.** It looks only at whether the cookie exists. The home page's `GET /me` and the API decide whether a session is valid. Server Actions don't rely on the proxy: sign-out reads its own cookie, and the proxy redirects only GET requests, so an action POST to `/sign-in` is never redirected.
- **API env files.** The E2E API starts from `apps/api`, where `process.loadEnvFile()` reads a local `.env`. Values the E2E command sets are already in the environment, and Node doesn't override them, so a developer's `.env` can't switch dev codes off.
- **Question for the author (not in the spec, so not in the steps):** what should the home page show when `GET /me` fails because the API is down, not because of a 401? The plan keeps the session and lets the existing API status line say the API is down, with the account section showing the connection copy. If you'd rather sign the user out or show something else, say so at gate 2.
- **No migration**, so nothing to roll back for data. Reverting the PR removes the web sign-in. The API from #5 is untouched.
