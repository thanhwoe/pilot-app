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

Sign-in codes are written to the API log; no email is sent yet.

- API: http://localhost:3001/health
- Web: http://localhost:3000 (sends you to `/sign-in`; enter your email, then the code from the API log)
- Mobile: press `i` (iOS Simulator) or `a` (Android emulator) in the Expo terminal; sign in with your email and the code from the API log

See [CLAUDE.md](CLAUDE.md) for the layout, commands and rules, and [REVIEW.md](REVIEW.md) for the review checklist.

<!-- throwaway: evidence for #74 AC 2 -->
