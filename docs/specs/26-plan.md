# Plan: CI: run the Maestro flows on the macos-sim runner

Issue: #26 · Spec: [26.md](26.md) · Runs on: `cloud, then mac` · Status: waiting for gate 2

## Contracts

None. No schema, endpoint or migration changes, and no app code changes. The only new artifact is one workflow file, `.github/workflows/mobile-e2e.yml`.

The workflow's shape, so the steps below stay short:

- **Trigger:** `pull_request` (opened, synchronize, reopened) with `paths: [apps/mobile/**, packages/shared/**, apps/api/**]`.
- **Guard:** the job runs only `if: github.event.pull_request.head.repo.full_name == github.repository`.
- **Runner:** `runs-on: [self-hosted, macOS, ARM64, macos-sim]`, `timeout-minutes: 60`.
- **Permissions:** `permissions: contents: read`, no `secrets.` reference anywhere.
- **Concurrency:** group `mobile-e2e-${{ github.ref }}` with `cancel-in-progress: true`, as `ci.yml` does.

## Files

| File                               | Change                                                                                                                                                                                                                                                         | AC                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `.github/workflows/mobile-e2e.yml` | New workflow: trigger and path filter, fork guard, runner, timeout, permissions, concurrency, install, PATH and Postgres, `e2e:ios` and `e2e:android` as separate steps, log and Maestro output collection, artifact upload, cleanup of the devices it started | 1, 2, 3, 4, 5, 6, 7, 8, A3 |
| `CLAUDE.md`                        | The CI bullet says the `macos-sim` runner "can run" jobs; it now runs `mobile-e2e` on PRs that touch mobile, shared or api. REVIEW.md asks for docs when behaviour changes                                                                                     | plumbing                   |

No change to `apps/mobile/e2e/run.sh`, `scripts/e2e-lock.sh`, the Maestro flows, `ci.yml` or any app code, as the spec requires.

## Steps

1. `cloud` · AC 1, 2, 6, 7, 8 · Write the checks first, as commands, and run them before the file exists so they fail: `actionlint .github/workflows/mobile-e2e.yml`; `grep -c 'secrets\.'` is 0; the file contains `timeout-minutes: 60`, `contents: read`, the three `paths` and the `head.repo.full_name == github.repository` condition. Then write the workflow's skeleton: trigger, path filter, guard, runner, timeout, permissions, concurrency, checkout, pnpm and Node from `.nvmrc`, `pnpm install --frozen-lockfile` · done when `actionlint` passes and each grep matches
2. `cloud` · AC 1, 3, A5 · Test first: a grep that the iOS and Android runs are two separate steps, the Android one with `if: ${{ !cancelled() }}` so it still runs after an iOS failure, and that neither pipes a check through `tail`, `head` or `grep` (the pipe hides the exit status; #20 retro). Then add the steps: put Docker's CLI directory on `PATH` through `$GITHUB_PATH`, run `pnpm db:up`, `pnpm --filter @gop/mobile e2e:ios`, then `e2e:android`. Both go through `e2e-lock.sh` already, which prints the wait line for AC 3. After each run, copy `apps/mobile/e2e/api.log` to a per-platform file, because `run.sh` overwrites it, and keep the run's exit code · done when `actionlint` and the greps pass
3. `cloud` · AC 4, 5, A3 · Test first: greps for an `upload-artifact@v4` step with `if: ${{ failure() || cancelled() }}` and `retention-days: 7`, and for a cleanup step with `if: always()`. Then add: a marker file and a snapshot of the booted simulators and emulators before the runs; a step that copies the Maestro output newer than the marker, plus the two `api.log` copies, into one folder; the upload; and a cleanup that runs `scripts/e2e-lock.sh` with a short `E2E_LOCK_WAIT`, so it never touches a device an end-to-end run is using, and shuts down only the simulators (`xcrun simctl shutdown`) and emulators (`adb -s <serial> emu kill`) that were not booted in the snapshot. If it can't get the lock in time it logs a warning and shuts nothing down · done when `actionlint` and the greps pass
4. `cloud` · plumbing · Update the CI bullet in `CLAUDE.md`: `mobile-e2e` runs on the `macos-sim` runner for PRs that touch `apps/mobile/**`, `packages/shared/**` or `apps/api/**`, and waits on the e2e lock · done when `pnpm lint && pnpm typecheck && pnpm test` pass
5. `mac` · AC 1, 2, 3, 4, 5, 6, 8, A3, A4, A5 · Check the runner first, from a shell with the runner's own environment: `docker`, `adb`, `xcrun`, `maestro` and the Android SDK variables are visible to a launchd-started job. Run `maestro test --help` and confirm where Maestro writes its output by default, since step 3 assumes `~/.maestro/tests`. Then, with throwaway PRs branched from this branch so they carry the workflow:
   - a PR that touches a file under `apps/mobile/**`: `mobile-e2e` runs `e2e:ios` then `e2e:android` and goes green (AC 1);
   - a PR that touches only `docs/**`: no `mobile-e2e` check (AC 2);
   - start `pnpm --filter @gop/mobile e2e:ios` in a session, then push to the first PR: the job log shows `e2e-lock: waiting for another end-to-end run` and neither run fails (AC 3);
   - break one flow: the job is red, the artifact holds the Maestro output and both `api.log` files, and the Android run still ran after the iOS failure (AC 4, A5);
   - after a green and a red run, `xcrun simctl list devices booted` and `adb devices` list nothing (AC 5);
   - push twice quickly: the first run is cancelled and leaves no booted simulator or emulator (A3);
   - let the lock stay held past `E2E_LOCK_WAIT`, or set it to a few seconds on a throwaway run: the job fails with exit 75 (A4);
   - a fork PR does not start the job (AC 6). If no fork exists, show the guard condition and say so;
   - the job's `timeout-minutes: 60` is read in the file; waiting for 60 minutes is not run (AC 8).

   Close the throwaway PRs and delete their branches · done when each bullet has its run link or log line saved for the PR

## Verification

- Steps 1 to 4 (cloud): `actionlint` on the workflow, the greps above, then `pnpm lint && pnpm typecheck && pnpm test`. If `actionlint` can't be installed in the cloud session, run it on the Mac mini.
- Step 5 (mac): the throwaway PR runs listed there. No test tool in the repo runs workflows, so these are the spec's manual evidence. The PR carries the links to the green and red `mobile-e2e` runs and the log lines for the lock wait (AC 3) and the empty booted lists (AC 5).
- No `verify` for web, the API or mobile: no app code changes.
- Screenshots: none. The PR has no UI change.

## Risks

- **A public repository with a self-hosted runner.** The repo is public and forking is allowed, so the fork guard (AC 6) is the one thing keeping outside code off the Mac mini. The workflow must never use `pull_request_target` or `workflow_run`. Same-repo branches run on the machine too, but only people who can push here can start them. The repository setting that requires approval before a first-time contributor's workflows run is on the owner's side and is worth checking. It is not part of this change.
- **The #26 PR will not run its own job.** The spec's path filter leaves out `.github/workflows/mobile-e2e.yml`, so this PR touches no listed path. Step 5's throwaway PRs are the proof. Question for the author: add the workflow file to its own `paths`, so a change to it runs the job? I have not added it, because the spec doesn't ask.
- **Spec gap: assumptions 4, 5 and 7 promise behaviour with no matrix row.** They are the lock timeout failing with exit 75, the Android run continuing after an iOS failure, and the 7-day artifact retention. Steps 3 and 5 cover them, but the spec's matrix has rows only for the criteria and A3. Suggest adding `A4`, `A5` and `A7` rows at the next spec revision.
- **Where Maestro writes its output.** The spec says to upload Maestro's output, but `run.sh` passes no output directory and changing it is out of scope. Step 3 copies what is new under `~/.maestro/tests` since the job started. I could not check that location, because Maestro isn't installed in the cloud session; step 5 confirms it first. If it differs, only the copy path in the workflow changes.
- **Docker, `adb` and Maestro on a launchd `PATH`.** The issue names Docker's CLI. `adb`, the Android SDK variables and `xcrun` may be missing from the runner's environment too. Step 5 checks them before any run, and a missing one is fixed with `$GITHUB_PATH` or `env` in the workflow.
- **A killed run can leave state behind.** A cancelled or timed-out job may leave the API on port 3101. `e2e-lock.sh` takes over a lock whose process has gone, but `run.sh` refuses to start while the port is held, so the next run, or a session, fails with "Port 3101 is already in use". The spec says cleanup covers the simulator and the emulator only. Question for the author: should cleanup also stop whatever listens on 3101, under the lock? Not in the steps until you say.
- **The 60-minute budget.** Two Release builds and the flows can exceed 60 minutes on the first run, and a long lock wait uses the same budget. If the first run times out, the timeout stays at 60 as the spec says, and the fix is a warm build, not a longer limit.
- **Runner offline.** `mobile-e2e` would queue until the runner is back. It is not a required check, so it does not block a merge.
- **Rollback:** delete `.github/workflows/mobile-e2e.yml`. No data or app code is touched.
