# Plan: Docs: add A4, A5 and A7 rows to the #26 test matrix

Issue: #49 · Spec: [49.md](49.md) · Runs on: `cloud` · Status: waiting for gate 2

## Contracts

None. Docs only: no endpoint, schema, migration, workflow or code changes.

## Files

| File               | Change                                                                                                    | AC      |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ------- |
| `docs/specs/26.md` | Three rows, `A4`, `A5` and `A7`, after the `A3` row of the test matrix. Nothing else in the file changes. | 1, 2, 3 |
| `docs/specs/51.md` | AC 2's command loses the ` --` before the flags.                                                          | 4       |

## Steps

1. `cloud` · AC 1, 2, 3 · First run the three checks from the spec's matrix, `grep -n "^| A4 " docs/specs/26.md`, the same for `A5` and `A7`. Each finds nothing today, which is the failure. Then add the rows after the `A3` row (line 59), in the matrix's own columns, and format the file with `pnpm exec biome format --write docs/specs/26.md`. The rows, each with evidence I read on GitHub today:
   - `A4` · "A lock held past `E2E_LOCK_WAIT` fails the job with exit 75: run 41772975890 (PR #44, `E2E_LOCK_WAIT=15`): both e2e steps log "e2e-lock: still held after 15s" and exit 75" · `manual (PR run)` · `Mac mini`. In the job log of that run, lines 238 and 257 read "e2e-lock: still held after 15s by: sleep 400" and lines 243 and 262 read "Process completed with exit code 75".
   - `A5` · "`e2e:android` still runs after `e2e:ios` fails: run 41773441139 (PR #44, a flow broken on purpose): the iOS step failed, the Android step ran (not skipped), and the job failed" · `manual (PR run)` · `.github/workflows`. The run's job steps read "Maestro flows on iOS: failure", "Maestro flows on Android: failure", "Collect Maestro output: success".
   - `A7` · "The artifact is kept for 7 days: `retention-days: 7` in `mobile-e2e.yml`; the artifact of run 41773441139 expires 7 days after it was created (2026-11-04 to 2026-11-11)" · `manual (review)` · `.github/workflows`. The workflow has `retention-days: 7` at line 95, and the artifact `mobile-e2e-output` has `created_at` 2026-11-04T05:22:48Z and `expires_at` 2026-11-11T05:22:42Z.
   - Each new Test cell is at most 175 characters, under the widest existing cell (185), so Biome doesn't re-align the table. Done when the three greps each find one row, naming `E2E_LOCK_WAIT` and exit 75, `e2e:android` after an `e2e:ios` failure, and 7 days, and `git diff --numstat docs/specs/26.md` prints `3	0`.
   - Search run: `grep -n "^| A" docs/specs/26.md` finds only the `A3` row (line 59), and no `A4`, `A5` or `A7`. The `A<k>` labels are the Assumption numbers of that spec (A4 lock wait, A5 platform steps, A7 retention), and the issue asks for these three only, so `A6` (the `PATH` and Postgres start) and `A8` (how the criteria are checked) get no row.
2. `cloud` · AC 4 · First run the spec's two checks on `docs/specs/51.md`: `grep -c "test:e2e -- " docs/specs/51.md` prints 1 and should print 0, and `grep -n "test:e2e --repeat-each=10" docs/specs/51.md` finds nothing and should find AC 2. Then change line 16 from `test:e2e -- --repeat-each=10 e2e/groups.spec.ts` to `test:e2e --repeat-each=10 e2e/groups.spec.ts`, and format the file. Done when the first check prints 0 and the second matches line 16.
   - Search run: `grep -rn "test:e2e -- " docs README.md CLAUDE.md` finds `docs/specs/51.md:16` (the one to change), `docs/specs/51-plan.md:47` (quotes the wrong command on purpose, as what was run), `docs/specs/54-plan.md:28, 30, 37` (a merged plan written with the same form), and `docs/specs/49.md:38` (this spec's own check). `CLAUDE.md` already has the right form. Only `51.md:16` changes; see the question under Risks.
3. `cloud` · AC 1–4 (the spec's "touches nothing else" check) · Run `git diff --name-only origin/main...HEAD`: it must list exactly `docs/specs/26.md`, `docs/specs/51.md`, `docs/specs/49.md` and `docs/specs/49-plan.md`. Run `git diff --numstat origin/main...HEAD -- docs/specs/26.md docs/specs/51.md`: `26.md` shows `3 0` and `51.md` shows `1 1`. Done when both match. This maps to no new criterion; it is the spec's own "no workflow file, no other criterion" check, so the PR can show it.

## Verification

- `pnpm lint && pnpm typecheck && pnpm test` from the root after step 2. `pnpm lint` checks Markdown tables with Biome, which is how `26.md`'s table once failed it (#50).
- No `verify` for web, API or mobile, and no end-to-end run: no code changes. No screenshots.
- The PR carries the three `grep` results, the `--numstat` output and the run links.

## Risks

- **Question for the author (answer before `plan-ok`).** `docs/specs/54-plan.md` has the same wrong command, `test:e2e -- groups.spec.ts`, in three places (lines 28, 30 and 37), and `docs/specs/51-plan.md:47` quotes it as what was run. The spec's criterion 4 names only `51.md`, and its Out of scope lists every other file, so this plan leaves them. With `--`, pnpm 11 passes it on and Playwright reads `groups.spec.ts` as a file filter, so the plan's command runs everything instead of that file. Should `54-plan.md` be corrected too (a one-line follow-up issue, or a change to this spec)? `51-plan.md:47` should stay as it is, since it records what was run.
- **The spec's own table is malformed.** In `docs/specs/49.md` the matrix cells contain `|` inside the `grep` patterns (`^| A4 `), which splits the cells, so rows 1 to 4 render as broken columns. The checks themselves are valid and I use them as written. Fixing it is a spec change (`/factory-spec 49`: move the commands out of the table, or escape the pipes), not part of this plan.
- **Evidence ages.** The artifact of run 41773441139 expires on 2026-11-11, so it can't be downloaded after that. The row cites its `created_at` and `expires_at`, which GitHub keeps in the run's data after expiry. I did not download the artifact, so no row says what it holds; `api-android.log` in it comes from the #50 description only.
- **The table re-aligns if a cell grows.** Each new Test cell stays under the widest existing cell. If Biome still changes other lines, step 1's `--numstat` check fails and I shorten the cell.
- **Open pull requests.** None are open (`gh api repos/thanhwoe/pilot-app/pulls` returns no rows), so nothing else touches these files.
- **Rollback:** revert the PR. Nothing else depends on these rows.
