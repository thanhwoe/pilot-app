# Plan: CI: the iOS step of Mobile E2E fails on the macos-sim runner (osascript System Events)

Issue: #109 · Spec: [109.md](109.md) · Runs on: `mac` · Status: waiting for gate 2

## Contracts

None. No endpoint, schema, migration or app code. One script changes: the iOS branch of `apps/mobile/e2e/run.sh`.

## What the code does today

Read in full: `apps/mobile/e2e/run.sh`, `.github/workflows/mobile-e2e.yml`, `apps/mobile/.gitignore`, the iOS part of `CLAUDE.md`, and in `node_modules/@expo/cli/build/src/run/ios/` the file `runIosAsync.js` (the `@expo/cli` version here is 58.1.16).

- **`run.sh` runs `npx expo run:ios --configuration Release --no-bundler --device "iPhone 16"`.** That one command builds the app, boots the simulator, installs the app and launches it. The launch goes through `launchAppAsync`, then `AppleDeviceManager.activateWindowAsync`, then `ensureSimulatorAppRunningAsync`, which runs `osascript -e 'tell app "System Events" to count processes whose name is "Simulator" or name is "DeviceHub"'`. That is the call that failed on the runner, twice, in the Actions logs (`› Opening on iPhone 16`, then the error exactly two minutes later).
- **`expo run:ios` has a build-only mode.** `--device generic --output <dir>` builds for the simulator (`isSimulator` is true when there is no device), copies the `.app` to `<dir>`, prints `Build complete` and returns, before the bundler starts and before `launchAppAsync` (`runIosAsync.js`, the block that starts "Generic build (`--device generic`)"). A `grep` for `osascript` and `ensureSimulatorAppRunning` in `run/ios/*.js` finds nothing: the only users are `start/platforms/ios/AppleDeviceManager.js` and `ensureSimulatorAppRunning.js`, which the generic path never reaches.
- **With `--no-build` nothing boots a simulator today.** `run.sh` skips the whole block, so Maestro uses whichever simulator is already booted.
- **`apps/mobile/ios` is git-ignored** (`.gitignore` line 42, `git check-ignore` confirms `ios/e2e-app` is covered), so the built `.app` can be copied under it.
- **The workflow needs no change.** Its "Note the start" step records the booted simulators and its cleanup step shuts down any that were not booted before, so a simulator that `run.sh` boots is shut down after the job. Android goes through its own branch of `run.sh`, which this plan does not touch.
- **Readers of the iOS branch.** `grep -rn "expo run:ios\|e2e:ios\|IOS_DEVICE" . --include=*.sh --include=*.json --include=*.yml --include=*.md --exclude-dir=node_modules` is run in step 1; the plan expects `run.sh`, `package.json`, `mobile-e2e.yml` and `CLAUDE.md`, and step 2 updates what it finds.
- **Open PRs.** `gh api repos/{owner}/{repo}/pulls` returns #108 (issue #97). It changes `apps/mobile/src/**`, `.maestro/**`, `packages/shared/**`, `apps/api/**` and docs, and none of `run.sh`, the workflow or `CLAUDE.md`. No overlap.

## Files

| File                     | Change                                                                                                                                                                                 | AC      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `apps/mobile/e2e/run.sh` | The iOS branch: build with `expo run:ios --device generic --output`, then `xcrun simctl` boots the simulator and installs the app; the simulator is also booted with `--no-build`.     | 1, 3, 4 |
| `CLAUDE.md`              | The mobile end-to-end bullet says how the iOS app is built and installed, and that the iOS run needs no System Events permission. Only if step 2's search shows the text is now wrong. | 3, 4    |

No change to `.github/workflows/mobile-e2e.yml`, any Maestro flow or any app code (the spec's non-goals).

## Steps

1. `mac` · AC 3 · **Reproduce the failure here.** Test first: this Mac has the Automation permission, so `osascript` works and the bug can't happen. A throwaway shim in the scratchpad stands in for the missing permission: a directory with an `osascript` script that appends its arguments to `$SHIM_LOG` and exits 1, put first on `PATH`. Run `PATH="<shim dir>:$PATH" SHIM_LOG=<log> pnpm --filter @gop/mobile e2e:ios .maestro/groups-empty.yaml` on the unchanged `run.sh`. Expect it to **fail** with the same `osascript … System Events … exited with non-zero code: 1` error as the Actions logs, and the shim log to hold the `System Events` call. If it passes, the shim isn't first on `PATH`: fix the test. Run the search from "What the code does today" and note what it finds. Nothing is committed. · done when the run fails for that reason, with the shim log as proof.
2. `mac` · AC 1, 3, 4 · **Build and install without `expo run:ios`'s launch.** In `run.sh`, for `ios`:
   - find the simulator's UDID from its name (`IOS_DEVICE`, default `iPhone 16`) with `xcrun simctl list devices available -j`, and stop with a message when there is none;
   - boot it with `xcrun simctl boot` (an "already booted" answer is fine) and wait with `xcrun simctl bootstatus <udid> -b`; this runs with and without `--no-build`;
   - with a build: `npx expo run:ios --configuration Release --no-bundler --device generic --output "$mobile_dir/ios/e2e-app"`, then `xcrun simctl install <udid> "$mobile_dir/ios/e2e-app/<name>.app"` (the `.app` name is read from the folder, not typed in);
   - Maestro launches the app, as the flows already do. Android is not touched.

   Re-run step 1's command, with the shim, on the new `run.sh`, and the whole suite after it: `pnpm --filter @gop/mobile e2e:ios` (21 flows, about 9 minutes). Before that run, shut down every simulator and quit Simulator.app, so the run starts as the headless runner does. Check `CLAUDE.md`'s end-to-end bullet against the new script and update it if a sentence is wrong. · done when the shim run of `groups-empty` passes with an **empty** shim log, then all iOS flows pass with the shim still on `PATH`, `pnpm lint` passes, and `bash -n apps/mobile/e2e/run.sh` passes. Commit `fix(mobile): build and install the iOS e2e app without System Events (#109)`
3. `mac` · AC 4, A5 · **The Android path is unchanged, and `--no-build` works.** Run `pnpm --filter @gop/mobile e2e:android .maestro/groups-empty.yaml` (it passes as before; `git diff` shows no change to the Android branch), and `pnpm --filter @gop/mobile e2e:ios --no-build .maestro/groups-empty.yaml` after step 2's run (it boots the simulator if it was shut down and finds the installed app). Keep the terminal output for the PR (AC 4's evidence: the same commands locally and on the runner). · done when both pass. No commit unless a fix is needed.
4. `mac` · AC 1, 3, A5 · **The runner proves it.** The branch is pushed (ask first) and a PR is opened with `--draft`, because only its own `Mobile E2E` run can show AC 1 and 3: the `Maestro flows on iOS` step builds, installs and runs every flow, and its log has no `osascript` call and no two-minute wait. The Android step in the same job still passes. The PR names this evidence as missing until the run is green, and is marked ready after. Leave the machine's Automation settings alone until then (spec assumption 4). · done when the run's iOS and Android steps are green.
5. `mac` · AC 2 · **Re-run #108.** #108's job runs on the merge of its own branch and `main` as they were when it started, so re-running it does not pick up this fix. After this PR is merged, update #108's branch with `main` (`git merge --no-edit origin/main`, which the `up-to-date` job needs anyway) so a new run starts, and link that green run in this issue. This step happens after the merge, so it is a comment on the issue, not part of the PR.

## Verification

- `pnpm lint`, `bash -n apps/mobile/e2e/run.sh` and `pnpm --filter @gop/mobile e2e:ios` with the `osascript` shim on `PATH`, then `e2e:android` for one flow. `pnpm typecheck` and `pnpm test` are not affected (no TypeScript changes) and run at the end, as `CLAUDE.md` asks.
- The real proof is the `Mobile E2E` run on this PR (steps 4 and 5). The shim proves only that nothing in the iOS path calls `osascript`; it does not prove the runner has no permission, which is machine-side.
- `verify` for mobile does not apply: no screen changes.

## Risks

- **The headless simulator.** Today `expo run:ios` also opens Simulator.app. After this change the simulator boots without a window. The Maestro driver and the flows should not need one (`CLAUDE.md` already says the Mac mini's Simulator is headless), and step 2 starts from no window and no booted simulator to show it. A failure there is a plan change for you to decide.
- **`--device generic` is documented but new to this repo.** It builds the same Release app for the simulator. Step 2 compares the installed app's bundle id with the one the flows use (`com.thanhwoe.gop`) by running the flows.
- **A first build takes the same several minutes** as before, and the copy to `ios/e2e-app` adds a few seconds.
- **`--no-build` now boots a simulator** if none is booted. That is a change in behaviour, in the direction the flag was always meant to work.
- **Merge order.** This PR can merge on its own. #108 can only show a green iOS step after it takes this fix from `main` (step 5), so merge this first.
- **Rollback.** Revert the one commit. No data or config is touched.
