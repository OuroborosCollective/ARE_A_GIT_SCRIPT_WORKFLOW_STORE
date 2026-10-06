# ARE — A Git Script & Workflow Store

**Another Revision Engineering** — an evidence-first marketplace for reusable GitHub Actions, CI/CD workflows, deployment checks, repository automation, scripts, and developer tooling.

ARE discovers automation from real Git repositories, classifies portability, and packages the **exact selected source files** with their source revision and blob SHAs. Products are independently editable, publishable, and optionally connected to OneUp Today for Reddit discovery.

## What ARE sells

Reusable GitHub Actions workflows, CI/CD automation, deployment verification, release automation, repository maintenance scripts, evidence/provenance tooling, and developer automation that can be transferred between repositories.

## Evidence model

Every catalog artifact is bound to a GitHub repository, ref, concrete Git tree revision, concrete blob SHA per selected file, deterministic portability findings, and a machine-readable ARE manifest.

ARE does not invent a script because a product template expects one. No source path + source SHA means no sellable artifact.

## Store pipeline

`GitHub → complete inventory → classify → select → package → verify manifest → edit product → publish → optional OneUp campaign`

## Mobile app

This repository contains the AndroidX companion shell for the public ARE Store. GitHub Actions builds the APK and publishes a GitHub Release from `main` after CI validation. Release signing is fed only from a protected `android-release` environment; when no keystore secret is present the build stays unsigned and the release records `signed: false` plus SHA-256 checksums.

Canonical web store: https://are-agent-studio.hatchable.site

## Runnable store

The store is a dependency-free Node.js service. It serves the Store View from
`public/` and the JSON API from `server/`.

```bash
npm start        # http://localhost:3000
npm test         # regression suite (inventory, packaging, lifecycle, consent, HTTP e2e, a11y)
```

See `docs/DEPLOYMENT.md` for environment variables, the Docker image and the full
API surface. `docs/evidence/LEDGER.md` is the append-only evidence ledger.

### Runtime map

| Issue | Area | Implementation |
| --- | --- | --- |
| #9 | GitHub OAuth PKCE | `server/lib/auth.js`, `server/routes/github.js` |
| #10 | Product detail + receipt | `public/product.html` |
| #11 | ARE-PACKAGE-V2 + stale source | `server/lib/evidence.js`, `server/lib/packaging.js` |
| #12 | OneUp consent + receipts | `server/lib/marketing.js`, `public/admin.html` |
| #13 | Discovery inventory + reset | `server/lib/inventory.js`, `public/discover.js` |
| #14 | Product state machine | `server/lib/products.js`, `public/admin.html` |
| #15 | Signed Android release | `.github/workflows/android-release.yml`, `android/app/build.gradle` |
| #16 | Accessibility + responsive | `public/styles.css`, `tests/accessibility.test.js` |
| #17 | Evidence ledger | `server/lib/ledger.js`, `docs/evidence/LEDGER.md` |

## Search keywords

GitHub Actions · GitHub workflow · CI/CD · DevOps automation · deployment verification · release automation · repository automation · developer tooling · shell scripts · Node.js automation · Python automation · evidence · provenance · reproducible automation

## Security

Never commit GitHub tokens, OAuth credentials, OneUp credentials, payment secrets, signing keys, or private repository source. Use least-privilege credentials and keep secrets in GitHub/Hatchable secret storage.
