# Security Policy

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately using [GitHub's private vulnerability reporting](https://github.com/kumarsomeshunos/hisaab/security/advisories/new). This keeps the details confidential until a fix is available.

Include as much of the following as possible:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Affected versions / components
- Suggested fix (optional)

We aim to acknowledge reports within 48 hours and resolve confirmed vulnerabilities within 14 days.

## Supported Versions

Only the latest commit on `main` is supported. There are no versioned releases with backport support at this time.

## Security Architecture

See [ARCHITECTURE.md — Auth Flow](./ARCHITECTURE.md) for details on session management, OTP security, rate limiting, and HTTP security headers.

## Disclosure Policy

Once a fix is released, we will:

1. Publish a GitHub Security Advisory describing the vulnerability
2. Credit the reporter (unless they prefer anonymity)
