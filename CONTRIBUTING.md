# Contributing to Dutch

Thank you for your interest in contributing! This document covers everything you need to get started.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). We are committed to providing a welcoming and inclusive environment for everyone.

## Ways to Contribute

- **Bug reports** — found something broken? [Open a bug report](.github/ISSUE_TEMPLATE/bug_report.md)
- **Feature requests** — have an idea? [Open a feature request](.github/ISSUE_TEMPLATE/feature_request.md)
- **Code** — fix a bug, implement a feature, or improve documentation
- **Design feedback** — critique the UI/UX and suggest improvements

## Development Setup

### Prerequisites

- **Node.js 20+** and **npm** (do not use yarn or pnpm)
- A [Neon](https://neon.tech) account for the database (free tier is sufficient)
- A [Resend](https://resend.com) account for email OTPs (optional — OTPs print to console if unset)
- A [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket for media uploads (optional — app works without it)

### Steps

1. **Fork and clone**
   ```bash
   git clone https://github.com/<your-username>/hisaab.git
   cd hisaab
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Fill in `.env.local`. At minimum you need `DATABASE_URL` and `NEXT_PUBLIC_APP_URL=http://localhost:3000`. See [Environment Variables](README.md#environment-variables) for the full list.

4. **Push the database schema**
   ```bash
   npm run db:push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/                 # Next.js App Router — pages and API routes
│   ├── api/             # API route handlers (all server-side logic lives here)
│   ├── auth/            # Sign-in and onboarding pages
│   ├── dashboard/       # Home page with balance summary
│   ├── expenses/        # Expense list and detail pages
│   ├── friends/         # Friends list and friend profile pages
│   ├── groups/          # Groups list and group detail pages
│   ├── activity/        # Activity feed
│   └── account/         # Profile and settings
├── components/
│   ├── expenses/        # Expense-specific components (form sheet, etc.)
│   ├── layout/          # Shell, nav, offline banner
│   └── ui/              # shadcn/ui primitives (do not modify directly)
├── lib/
│   ├── auth/            # Session management, OTP, rate limiting
│   ├── db/              # Drizzle ORM schema and client
│   └── offline/         # IndexedDB mutation queue and sync engine
├── worker/              # Custom service worker entry (Background Sync)
└── middleware.ts         # Auth guard — runs on every non-public request
```

For the full data model, API surface, and auth flow, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Important Constraints

### Always use `npm run dev`, not `next dev`

`next-pwa` is incompatible with Turbopack. The `dev` and `build` scripts already include `--webpack`. Never remove this flag or call `next dev` / `next build` directly.

### PWA requires a production build to test

The service worker is disabled in development. To test offline behaviour, caching, or background sync:

```bash
npm run build && npm start
```

### Currency is Indian Rupees (₹)

Dutch is focused on the Indian market. All monetary values are displayed as `₹X,XXX.XX`. Do not add multi-currency support without opening a discussion first.

### No new dependencies without justification

Adding a package is a deliberate decision. If your PR adds a dependency, explain why in the PR description and update the Dependencies table in `ARCHITECTURE.md`.

## Branch and PR Workflow

### Branch naming

| Prefix | Use for |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `chore/` | Tooling, deps, config |
| `refactor/` | Code changes with no behaviour change |

Example: `feat/multi-currency`, `fix/offline-sync-race`.

### Commit style

Use the **imperative mood** in the present tense:

- `Add expense comment feature`
- `Fix balance calculation for group settlements`
- Not: `Added`, `Fixes`, `Adding`

### PR checklist

Before opening a PR:

- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] `ARCHITECTURE.md` updated if you added routes, tables, dependencies, or env vars
- [ ] PR is focused — one logical change per PR (split unrelated fixes into separate PRs)
- [ ] PR description explains *why* the change is needed, not just what it does

## Design Language

Dutch follows **Apple Human Interface Guidelines** as its primary design reference. All UI decisions should feel at home on an iPhone or Mac. The full design system — typography weights, colour palette, spacing rules, iconography conventions, and patterns to avoid — is documented in [CLAUDE.md](CLAUDE.md).

The short version:
- Accent colour: Emerald `#10b981`
- Typography: `font-thin`/`font-light` for display, `font-medium` for active states
- Radius: `rounded-2xl` on cards
- Icons: Lucide, `strokeWidth={1.5}` at rest, `strokeWidth={2}` active
- No heavy shadows, no coloured borders, no emoji in UI

## Security

For security vulnerabilities, read [SECURITY.md](SECURITY.md) and **do not open a public issue** — use GitHub's private advisory reporting instead.
