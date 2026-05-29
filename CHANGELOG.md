# Changelog

All notable changes to Dutch are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## [Unreleased]

## [0.1.0] — 2026-05-29

Initial open source release.

### Added

- Email OTP authentication — no passwords, no OAuth; OTPs expire in 10 minutes with 3-attempt lockout
- Friends management — add by username or email, symmetric friendship model
- Groups — named sets of members with shared expense tracking
- Guest contacts — include non-app participants by name/phone without requiring an account
- Expense creation with 6 split modes: equal, exact, percentage, shares, item-based, and adjustment
- Settlements and net balance tracking across friends and groups
- Expense media attachments — images and PDFs via Cloudflare R2
- Expense comments
- Activity feed — full audit log of all mutations (expenses added, settled, etc.)
- Custom expense categories per user
- UPI deep links for one-tap payments (India-focused)
- Offline-first PWA — IndexedDB mutation queue syncs automatically on reconnect
- Background Sync support on Chrome and Android (falls back to `online` event on Safari/iOS)
- Installable as a PWA on iOS, Android, and desktop
- Vercel Analytics integration
- HTTP security headers: CSP, HSTS (2-year), X-Frame-Options: DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- Session token hashing — SHA-256 hash stored in DB; raw token stays in cookie only
- IP-based rate limiting on all auth endpoints and user search
- SEO: Open Graph image, per-page title templates, robots.txt, sitemap.xml
