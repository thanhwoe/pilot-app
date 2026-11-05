# Plan: Web: check that one-time-code autofill still fills the controlled sign-in code field

Issue: #67 · Spec: [67.md](67.md) · Runs on: `cloud, then mac` · Status: waiting for gate 2

## Contracts

None. No schema, endpoint or migration changes. If the check finds a defect the plan stops there (see **Risks**); a fix is planned and approved separately.

## What the code does today

Read in full: `apps/web/src/app/sign-in/sign-in-form.tsx`, `apps/web/src/app/action-text-field.tsx`, `apps/web/src/app/sign-in/actions.ts`, `apps/web/src/lib/session-cookie.ts`, `apps/web/next.config.ts`, `apps/api/src/env.ts`, `apps/api/src/auth/dev-codes.ts`, `scripts/e2e-lock.sh` and `apps/web/e2e/sign-in.spec.ts`.

- **The field.** The spec names `CodeField`, from #59. #72 (merged, PR #84) replaced it with `ActionTextField`. The code input is now `<ActionTextField id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required />`, rendered after its own `<label htmlFor="code">`. It is controlled: its `useState` changes only in `onChange`. So the issue's concern applies to `ActionTextField`, which is the "shared text field component" the spec's assumptions name.
- **Submit reads the DOM.** The form is `<form action={formAction}>`, so React builds the `FormData` from the DOM when the form is submitted. A code that is in the DOM but not in React's state would still be submitted, so AC 1 may pass even in the failure case. What is lost is the value on the next render: React sets the input back to its state. That is why AC 2 (a re-render after a failed request) is the likely failure, and why the two criteria are checked apart.
- **Cookie and origin.** `sessionCookieOptions` sets `secure` only when `NODE_ENV === "production"`. A sign-in over plain HTTP to a host other than `localhost` would not keep the cookie in a production build, so the check runs against `next dev` and reaches it as `localhost` on both platforms (see steps 2 and 3). `next.config.ts` has no `allowedDevOrigins`, which is another reason to avoid `10.0.2.2`.
- **Sign-in on a dev machine.** The API needs `AUTH_SECRET` (32+ characters), and the dev code endpoint needs `NODE_ENV=development` or `test` with `DEV_SIGN_IN_CODES=true`. Without the endpoint, the code is in the API log. The API limits codes per email and attempts per code, so each platform uses its own email and one wrong attempt.
- **Tools.** No test tool in the repo drives a mobile browser's autofill: Playwright `fill()` fires the same events as typing, and Maestro here covers the native app only. `apps/mobile/e2e/run.sh` names the devices the Mac mini already has: `iPhone 16` and `Pixel_9_API_35`.
- **Evidence folder.** `docs/evidence/<N>/` holds screenshots for earlier issues (for example `docs/evidence/55/`). `pr-evidence.yml` fails a PR that still has `<!-- screenshot` placeholders in its description.
- **Open PRs.** `gh api repos/{owner}/{repo}/pulls` returns none, so nothing else touches these files.

## Files

| File                        | Change                                                                                                                                                                                        | AC   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `docs/evidence/67/check.md` | The record of the check: for each platform, the device, OS and browser, how the code was entered, what each criterion showed, and what stays unproven on a real device. Links the screenshots | 1, 2 |
| `docs/evidence/67/*.png`    | Screenshots from the Simulator and the emulator, named `<platform>-ac1-*.png` and `<platform>-ac2-*.png`                                                                                      | 1, 2 |

No code, test or config change, as the spec's deliverable is a check first. The scratch probe in step 1 is not committed.

## Steps

1. `cloud` · informs AC 1, 2 · A scratch probe to learn what a "missed event" looks like here, before the devices. It is not proof for either criterion (a Playwright run is not accepted as proof, per the spec), and nothing is committed. Add a temporary spec `apps/web/e2e/probe-67.spec.ts` and delete it afterwards. On the code step it fills the field in four ways with the browser's own value setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set`), because React patches the instance's `value` property and a direct assignment would update its tracker: (a) setter, then an `input` event; (b) setter, then a `change` event only; (c) setter, no event at all; (d) `fill()` as the baseline. For each, press "Đăng nhập" with a wrong 6-digit code, hold nothing, and read the field after the error shows. Use `devices["Pixel 7"]` for the mobile viewport. Expected, from how React works: (a), (b) and (d) keep the code; (c) is submitted (the form reads the DOM) but the field is empty after the render. Record the four results · done when the table of four results is saved for the issue comment and `git status` shows the probe file gone. This tells step 4 whether a fix, if one is needed, can have a regression test that reproduces the missed event (intake assumption 4)
2. `mac` · AC 1, 2 · iOS Simulator (Safari). Take the e2e lock for the whole check, because the Mac mini has room for one simulator or emulator and the `mobile-e2e` job takes the same lock: `scripts/e2e-lock.sh sleep 7200 &` (the lock is released when it is killed at the end). Then: `pnpm db:up`; `pnpm --filter @gop/api db:migrate`; start the API with `DATABASE_URL=postgres://gop:gop@localhost:5432/gop PORT=3001 NODE_ENV=development DEV_SIGN_IN_CODES=true AUTH_SECRET=<32+ throwaway characters> pnpm --filter @gop/api start`; start the web with `pnpm --filter @gop/web dev`. Boot `iPhone 16`, open `http://localhost:3000/sign-in` in Safari (`xcrun simctl openurl booted …`), sign in with a fresh email (`ios-<timestamp>@example.test`) and read the code with `curl "http://localhost:3001/dev/sign-in-code?email=…"`. The Simulator cannot receive a real SMS, so it cannot show the keyboard's code suggestion. Use the nearest thing: put the code on the Simulator's pasteboard (`xcrun simctl pbcopy booted`), long-press the field, choose Paste, and say in the record that this was a paste and not a suggestion.
   - **AC 1:** press "Đăng nhập" with the right code: the groups page opens. Screenshot before and after (`xcrun simctl io booted screenshot`).
   - **AC 2:** sign out, go to the code step again with a new email, paste a wrong code, press "Đăng nhập": the error shows and the field still holds the code. Screenshot.

   Done when each criterion has a screenshot and a pass or fail on iOS, with the input method named
3. `mac` · AC 1, 2 · Android emulator (Chrome). Shut the Simulator down first (one at a time). Boot `Pixel_9_API_35`, run `adb reverse tcp:3000 tcp:3000` so the emulator's `localhost:3000` reaches the dev server (an origin of `localhost`, as on iOS), and open `http://localhost:3000/sign-in` (`adb shell am start -a android.intent.action.VIEW -d …`). Sign in with another fresh email (`android-<timestamp>@example.test`). Try the suggestion first: `adb emu sms send 5551234 "<code> is your Góp code"`, and see whether the keyboard or Chrome offers the code for the field. If it does, tap it. If it doesn't, copy the code from the SMS and paste it into the field, and say so in the record. Then the same two checks as step 2, with screenshots from `adb exec-out screencap -p`. Note the Chrome version and the system image (with or without Google Play), because the suggestion depends on them · done when each criterion has a screenshot and a pass or fail on Android, with the input method named
4. `mac` · AC 1, 2 · Record. Stop the servers and release the lock (kill the `sleep`). Write `docs/evidence/67/check.md` from steps 1 to 3 and add the screenshots. Commit as `docs(evidence): the one-time-code autofill check for #67`. If both platforms pass on both criteria, there is no code change: the PR carries the record and closes the issue. If either fails, **stop**: post the result on the issue with the failing step's screenshot, and do not write a fix; see Risks · done when `docs/evidence/67/check.md` names both platforms, both criteria, the input method on each and what stays unproven, and `pnpm lint && pnpm typecheck && pnpm test` still pass

## Verification

- Step 1 (cloud): the probe's table of four results; `git status` clean after it.
- Steps 2 and 3 (mac): the criteria are `manual`, as the spec says, because no tool in the repo can reproduce a mobile browser's autofill. The evidence is the screenshots and `check.md`.
- Step 4: `pnpm lint`, `pnpm typecheck` and `pnpm test` from the repo root, each on its own with its exit status read. No `verify` run: no screen or code changes.

## Risks

- **A check is only as good as its input.** The Simulator cannot offer the code from an SMS, so iOS proves a paste, not Safari's QuickType suggestion. The emulator may or may not offer one. The record says so, and says what stays unproven on a real phone. **Question for the author:** do you want a pass on your own phone as well? It needs the dev server reachable on the network (`next dev` blocks other origins without `allowedDevOrigins`, a config change the spec does not cover), so I have not planned it.
- **If the check finds a defect, the build stops.** The spec's out-of-scope says a fix is planned then. The build posts the failing result on the issue and asks for a revised plan: a regression test that reproduces the missed event first (step 1's probe says how), then a fix limited to `ActionTextField` and the code field, keeping the "Action forms" rule. That revised plan goes through gate 2 again.
- **`next dev`, not a production build.** The session cookie is `Secure` in production and `localhost` is the only host that keeps it over HTTP, so the check uses the dev server on `localhost`. Event handling does not differ between the two builds. Not tested: a production build on a device.
- **One simulator or emulator at a time, 16 GB.** The check holds the e2e lock for its whole time, so a `mobile-e2e` job or a session waits. Before starting, `gh api 'repos/thanhwoe/pilot-app/actions/runs?status=in_progress'` should show no `Mobile E2E` run; if one is running, wait.
- **Sign-in limits.** The API limits codes per email and attempts per code. Each platform uses its own fresh email and one wrong attempt, well inside both.
- **Rollback.** The change is files under `docs/evidence/67/`. Delete them. No data or app code is touched.
