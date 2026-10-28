# Góp

Split group expenses and see who owes whom. A pnpm + Turborepo monorepo with an API, a web app and a mobile app.

## Quick start

Requires Node 24, pnpm 11 and Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm db:up
pnpm dev
```

- API: http://localhost:3001/health
- Web: http://localhost:3000
- Mobile: press `i` (iOS Simulator) or `a` (Android emulator) in the Expo terminal

See [CLAUDE.md](CLAUDE.md) for the layout, commands and rules, and [REVIEW.md](REVIEW.md) for the review checklist.
