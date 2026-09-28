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

This repository contains the AndroidX companion shell for the public ARE Store. GitHub Actions builds the APK and publishes a GitHub Release from `main` after CI validation.

Canonical web store: https://are-agent-studio.hatchable.site

## Search keywords

GitHub Actions · GitHub workflow · CI/CD · DevOps automation · deployment verification · release automation · repository automation · developer tooling · shell scripts · Node.js automation · Python automation · evidence · provenance · reproducible automation

## Security

Never commit GitHub tokens, OAuth credentials, OneUp credentials, payment secrets, signing keys, or private repository source. Use least-privilege credentials and keep secrets in GitHub/Hatchable secret storage.
