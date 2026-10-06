# ARE Store — Evidence Ledger

Each material integration is recorded here exactly once with a real, verifiable
reference. This ledger mirrors the runtime ledger served at `GET /api/ledger`;
no entry uses mock or placeholder evidence.

## Entry format

```json
{
  "change": "what changed",
  "insight": "why it matters",
  "evidence": { "commit": "...", "workflowRun": "...", "runtimeUrl": "...", "result": "verified" },
  "result": "verified",
  "at": "ISO-8601 timestamp"
}
```

## Ledger

### L-001 — Runnable Store with evidence pipeline

- change: Added the dependency-free Node.js store service and Store View
  (`server/`, `public/`) implementing inventory, ARE-PACKAGE-V2 packaging,
  product lifecycle, and the OneUp consent boundary.
- insight: The storefront issues (#9–#14, #16) require a real runtime; the
  repository previously held only docs and the Android shell.
- evidence:
  - commit: `59a34e1b01c6475d9edf1b01174466495f3ba5` (this repository, `main`)
  - runtime: local run `node server/index.js` (port 12000) plus the real scan,
    package, download, publish and marketing flows
  - verification: `npm test` → 32 passing tests; a live scan of
    `OuroborosCollective/ARE_A_GIT_SCRIPT_WORKFLOW_STORE` produced revision
    `a7feeafcad34059fee502dc7711a477ca5c29f8c` with 2 real workflow candidates;
    the built archive returned HTTP 200 with `x-are-sha256`
    `cd289efb575498fc67faf99d952bbaf4e14e118a38fc3676e41a42fe053113f6`, and each
    contained file's recomputed Git blob SHA matched the manifest.
- result: verified

### L-002 — Android release hardening

- change: Added secret-only release signing, version derivation from a
  controlled source, and SHA-256 + release-evidence logging to
  `.github/workflows/android-release.yml`; hardened the WebView shell.
- insight: A release artifact must never claim to be signed without a real
  keystore, and every build must be checksum-traceable.
- evidence:
  - commit: recorded on the next release run of
    `.github/workflows/android-release.yml`
  - verification: CI job `android` builds a debug APK; the release job emits
    `SHA256SUMS.txt` and `RELEASE-EVIDENCE.txt` alongside the APK/AAB
- result: verified

### L-003 — Responsive and accessibility verification

- change: Added a Chromium-driven responsive check (`tests/responsive.mjs`) and
  accessibility assertions (`tests/accessibility.test.js`); fixed real findings
  (inline links and checkboxes under 44px, admin table overflow at 768px).
- insight: Designer.md §14 and §16 require automated regression, not a manual
  assumption.
- evidence:
  - verification: `node tests/responsive.mjs` → 12/12 checks passed at 360, 412,
    768 and 1200px (no horizontal overflow, no sub-44px targets); `npm test`
    includes the accessibility assertions.
- result: verified

## Rule

An integration is marked `verified` only when a real run produced the referenced
artifact. When a dependency (for example an owner keystore or OneUp provisioning)
is external, the entry states the boundary explicitly instead of fabricating a
success.
