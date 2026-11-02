# Cloud sessions

A cloud session at claude.ai/code needs two things before it can run `pnpm lint && pnpm typecheck && pnpm test`: Node 24, which the image doesn't have, and Postgres for the API tests. Two scripts set them up.

| Script                                 | Runs                                                                                                                    | Does                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`setup.sh`](setup.sh)                 | Once per environment, as root, before Claude starts. Cached for about 7 days                                            | Installs Node 24 with corepack's pnpm, Playwright's Chromium and its system libraries, and pulls `postgres:18-alpine`                                                              |
| [`session-start.sh`](session-start.sh) | Every session start and resume, from the `SessionStart` hook in `.claude/settings.json`. Does nothing outside the cloud | Puts Node 24 on `PATH`, runs `pnpm install` when the lockfile or a manifest changed, and starts Postgres 18 in Docker. Falls back to the image's PostgreSQL 16 if Docker can't run |

`session-start.sh` ends with one status line that Claude sees, such as `Cloud session setup: node v24.x; dependencies up to date; Postgres 18 up in Docker.` A line with `MISSING`, `FAILED` or `NOT running` names what to fix. The full log is `/tmp/gop-session-start.log`.

## Set up the environment (once)

At claude.ai/code, open the environment selector, then edit the environment that pilot-app sessions use:

1. **Network access:** pick **Custom**, check **Also include default list of common package managers**, and add these domains:

   ```text
   nodejs.org
   cdn.playwright.dev
   playwright.download.prss.microsoft.com
   ```

   `nodejs.org` serves Node 24. The two Playwright hosts serve Chromium, so the web's end-to-end tests can run in the cloud too.
2. **Setup script:** paste the contents of [`setup.sh`](setup.sh), or load the file with **Choose file**.
3. Save, then start a new session. Its first message should show the status line above.

## Start each session with the repo attached

On the new-session screen, pick the repository `thanhwoe/pilot-app` and the environment `pilot-app` before you send the first message. The hook runs only when a session starts or resumes, so a repo added to a running session gets no hook. Node 24 is then off `PATH`, and Claude has to run `bash scripts/cloud/session-start.sh` by hand and prefix each command with `PATH=/opt/node24/bin:$PATH`.

When `setup.sh` changes in the repo, paste it into the environment again. The environment doesn't read the repo's copy.

## Limits

- `gh issue` and `gh pr` don't work in cloud sessions. The GitHub proxy rejects GraphQL, so use `gh api repos/<owner>/<repo>/...` (REST).
- The VM has about 4 CPUs, 16 GB of RAM and 30 GB of disk. Mobile builds, simulators and Maestro need the Mac mini.
