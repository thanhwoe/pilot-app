# Góp

Split group expenses and see who owes whom. A pnpm + Turborepo monorepo with an API, a web app and a mobile app.

## Quick start

Requires Node 24, pnpm 11 and Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # then set AUTH_SECRET: openssl rand -base64 32
pnpm db:up
pnpm --filter @gop/api db:migrate
pnpm dev
```

Sign-in codes are written to the API log. With `RESEND_API_KEY` set in `apps/api/.env`, they go by email instead, from `onboarding@resend.dev`, which Resend delivers only to the key owner's own address. To open `next dev` from a phone on the same network, set `ALLOWED_DEV_ORIGINS` to the host name or address the phone uses (comma-separated, no scheme or port).

- API: http://localhost:3001/health
- Web: http://localhost:3000 (sends you to `/sign-in`; enter your email, then the code from the API log, or from your email when `RESEND_API_KEY` is set)
- Mobile: press `i` (iOS Simulator) or `a` (Android emulator) in the Expo terminal; sign in with your email and the code from the API log (or your email when `RESEND_API_KEY` is set)

See [CLAUDE.md](CLAUDE.md) for the layout, commands and rules, and [REVIEW.md](REVIEW.md) for the review checklist.
