<p align="center">
  <img src="public/icons/icon-192.png" width="72" height="72" alt="Dutch logo" />
</p>

<h1 align="center">Dutch</h1>

<p align="center">
  Split expenses with friends — simple, fast, fair.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PWA-offline--first-purple" alt="PWA" />
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fkumarsomeshunos%2Fhisaab&env=DATABASE_URL,RESEND_API_KEY,FROM_EMAIL,NEXT_PUBLIC_APP_URL&envDescription=Required%20environment%20variables&envLink=https%3A%2F%2Fgithub.com%2Fkumarsomeshunos%2Fhisaab%23environment-variables"><img src="https://vercel.com/button" alt="Deploy with Vercel" /></a>
</p>

---

Dutch is an open-source Progressive Web App for splitting expenses with friends and groups. Track shared costs, settle debts, and stay organized — with an offline-first, mobile-first experience that installs on any device.

## Features

- **Email OTP auth** — no passwords, no OAuth; sign in with a 6-digit code
- **Friends and groups** — add friends directly or create named groups for trips, households, etc.
- **Guest contacts** — include people who don't have an account by name or phone number
- **6 split modes** — equal, exact amounts, percentage, shares, item-based, and adjustment
- **Settlements** — record payments and track net balances across all relationships
- **Media attachments** — attach receipts and documents to expenses (images, PDFs)
- **Activity feed** — full audit log of all changes
- **Offline-first** — create and edit expenses while offline; mutations sync automatically when reconnected
- **Installable PWA** — add to home screen on iOS, Android, or desktop; works like a native app
- **UPI deep links** — one-tap payment links for Indian users

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| Language | TypeScript 5 |
| Database | [Neon](https://neon.tech) (serverless PostgreSQL) + [Drizzle ORM](https://orm.drizzle.team) |
| Auth | Email OTP via [Resend](https://resend.com) |
| Media storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| PWA | [next-pwa](https://github.com/shadowwalker/next-pwa) + custom Background Sync worker |
| Offline queue | IndexedDB via [idb](https://github.com/jakearchibald/idb) |
| Deployment | [Vercel](https://vercel.com) |

## Getting Started

### Prerequisites

- Node.js 20+
- npm (yarn and pnpm are not supported)
- A [Neon](https://neon.tech) database (free tier works)
- A [Resend](https://resend.com) account (optional — OTPs are logged to console if omitted)

### 1. Clone and install

```bash
git clone https://github.com/kumarsomeshunos/hisaab.git
cd hisaab
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` — see [Environment Variables](#environment-variables) below.

### 3. Apply the database schema

```bash
npm run db:push
```

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** If `RESEND_API_KEY` is not set, OTPs are printed to the console rather than emailed. This is the easiest way to get started locally.

> **Turbopack:** `next-pwa` is incompatible with Turbopack. Always use `npm run dev` and `npm run build` — never call `next dev` or `next build` directly.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `RESEND_API_KEY` | No* | Resend API key — OTPs log to console if unset |
| `FROM_EMAIL` | No* | Verified sender address (required if using Resend) |
| `NEXT_PUBLIC_APP_URL` | Yes | Canonical URL, no trailing slash (e.g. `https://yourdomain.com`) |
| `CLOUDFLARE_R2_ACCOUNT_ID` | No | Cloudflare account ID (for media uploads) |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | No | R2 API token with Object Read & Write |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | No | R2 API secret |
| `CLOUDFLARE_R2_BUCKET` | No | R2 bucket name |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | No | Public R2 URL (e.g. `https://pub-xxxx.r2.dev`) |

Media uploads (R2) are optional. The app works fully without them — the attachment UI is simply hidden.

## Database

Dutch uses [Drizzle ORM](https://orm.drizzle.team) with Neon. Schema changes are applied directly (no migration files needed for development):

```bash
npm run db:push      # Sync schema to the database
npm run db:generate  # Generate migration SQL files
npm run db:studio    # Open Drizzle Studio at localhost:5555
```

## Deployment

### One-click (Vercel)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fkumarsomeshunos%2Fhisaab&env=DATABASE_URL,RESEND_API_KEY,FROM_EMAIL,NEXT_PUBLIC_APP_URL&envDescription=Required%20environment%20variables&envLink=https%3A%2F%2Fgithub.com%2Fkumarsomeshunos%2Fhisaab%23environment-variables)

### Manual

1. Fork the repository
2. Connect the fork to Vercel (or another Node.js host)
3. Set all required environment variables in the hosting dashboard
4. Deploy — the build command is `npm run build` and the output directory is `.next/`

The service worker and offline sync are automatically enabled in production builds. They are disabled in development by design.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed breakdown of:

- Data models (13 database tables)
- Full API surface (~35 routes)
- Auth flow (email OTP, session hashing, rate limiting)
- File structure
- Offline architecture (mutation queue, sync engine)
- Dependencies and env vars

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, coding conventions, and PR process.

## License

MIT — see [LICENSE](LICENSE).
