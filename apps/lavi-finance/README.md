# Lavi Finance — Telegram GAS Mirror

This directory contains the public, credential-free mirror of the Lavi Finance Telegram Google Apps Script backend.

- Source: `backend/telegram.gs`
- Integrity: `backend/telegram.gs.sha256`
- Runtime credentials, allowed chat IDs, webhook keys, and other secrets are stored only in Apps Script Script Properties and are not committed here.
- GitHub Actions validates SHA-256 integrity, JavaScript syntax, required feature markers, and accidental credential literals.
- This mirror is informational/source-control only. It does **not** deploy to the production Apps Script project.

Canonical application repository: `baska-pro/lavi-finance`.
