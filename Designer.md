# ARE Store View — Designer.md

## Purpose

Canonical design specification for the ARE storefront and repository-discovery experience.

Product:
ARE — Another Revision Engineering Scripts with Evidence

Primary user job:
Discover, inspect, understand, purchase, and reuse real GitHub automation without losing provenance.

Design principle:
Evidence → Comprehension → Choice → Action → Receipt

The storefront should feel like a precision engineering instrument, not a generic AI dashboard or template marketplace.

## 1. Visual direction

Atmosphere: technical, confident, sparse, tactile, forensic.

Density: 6/10.
Variance: 7/10.
Motion: 5/10.

The visual language combines a dark engineering lab with an editorial product catalog. Information should feel deliberate and inspectable.

The user must immediately understand:
1. what is being sold,
2. what real repository evidence backs it,
3. what the next action will do.

Marketing copy never outranks provenance.

## 2. Color system

Use one consistent dark-neutral palette across the entire store.

Deep Instrument Canvas — #080B0A
Global background. Never pure black.

Instrument Panel — #101512
Elevated surfaces and product containers.

Structural Line — #29322D
1px separators and boundaries.

Primary Ink — #F0F4F1
Headings, product names and critical values.

Muted Evidence Text — #94A19A
Metadata, descriptions and secondary information.

Signal Accent — #D9FF6B
Primary CTA, active selection, focus ring and portable state.

Evidence Amber — #F0B95E
Evidence labels and review-required states.

Human-Control Mint — #8BE7BD
Secondary safety/approval state only.

Rules:
- No purple or blue neon AI aesthetic.
- No neon glows around controls.
- No gradient headline treatment.
- No meaning conveyed by color alone.
- Status always has a text label.
- Prefer borders, spacing and typography over heavy shadows.

## 3. Typography

Display:
Space Grotesk. Tight tracking, confident weight hierarchy.

Body:
IBM Plex Sans. Comfortable line height and readable measure.

Technical:
IBM Plex Mono. Git SHAs, revision IDs, paths, timestamps, manifests and technical counts.

Recommended scale:
- Display XL: clamp(3rem, 7vw, 6.5rem)
- Display: clamp(2.2rem, 4.5vw, 4rem)
- H2: 2rem
- H3: 1.35rem
- Body Large: 1.125rem
- Body: 1rem
- Meta: 0.75rem
- Evidence Mono: 0.75rem

Generic serif fonts are not used in the software interface.

## 4. Store information architecture

Primary navigation:
- ARE
- Discover
- Products
- Method
- Shop Admin

Desktop uses a compact horizontal navigation.
Mobile uses a compact menu and keeps Discover easy to reach.

Store View sections:
1. Hero
2. Live Product Catalog
3. Evidence Method
4. Trust / Provenance
5. Footer

The catalog is the core content surface. Methodology exists to support the user's decision.

## 5. Hero

Desktop layout is asymmetric.

Left side:
- engineering eyebrow
- concise proposition
- supporting explanation
- one primary CTA

Right side:
- evidence/instrument panel
- repository revision
- candidate count
- selected artifact count
- manifest state

Canonical message:
Package the work. Prove what travels.

Primary CTA:
Start repository discovery

Never introduce a competing primary CTA.
Never add filler scroll prompts or fake urgency.

## 6. Live product catalog

Catalog data is live and state-driven.

Only published products appear in the public catalog.
Drafts remain owner-visible.
Archived products are retained but removed from new discovery.

Product card anatomy:
1. source repository eyebrow
2. product title
3. concise value proposition
4. provenance strip
5. feature/tool chips
6. price
7. explicit action

Provenance strip example:
SOURCE REVISION · 7 FILES · ARE PORTABILITY V2

The evidence line should remain visible without hover.

Avoid a generic three-column equal-card wall. Use an asymmetric two-column layout on desktop where practical and one column on mobile.

Empty state:
No published automation products yet.
Then give one clear action to start discovery.

## 7. Product detail view

Product detail is a trust page, not only a sales page.

Desktop:
- left: identity, description, evidence, capabilities
- right: price and primary purchase/download action

Always expose:
- source repository
- source revision
- selected artifact count
- portability result
- rule version
- package identifier
- installation guide

Where appropriate, expose exact artifact paths and blob SHAs.

Evidence hierarchy:
1. revision
2. paths
3. blob SHAs
4. portability findings
5. capabilities
6. marketing copy

## 8. Purchase and download

Before purchase:
- explicit price
- exact package contents
- provenance statement
- clear license/usage expectations
- no hidden fees
- no fake urgency

After purchase:
- real package download
- manifest or evidence reference
- source revision
- installation guide
- concise success state

Never show a success message that is not backed by a real package or receipt.

## 9. Discovery flow

Canonical task flow:

Connect GitHub
→ Select repository
→ Confirm analysis
→ Complete inventory
→ Inspect candidates
→ Select artifacts
→ Build evidence archive
→ Edit product
→ Save draft
→ Publish

Every repository change resets:
- selected repository
- scan result
- artifact selection
- generated package
- manifest
- generated metadata
- OneUp configuration

No previous product state may leak into the next session.

## 10. Repository inventory view

The discovery interface must expose real inventory readback.

Show:
- Git tree revision
- total blobs
- workflow candidates
- script candidates
- excluded generated/vendor paths
- portable candidates
- review-required candidates

Each candidate has:
- actual repository path
- blob SHA
- source revision
- kind
- size
- portability state
- portability reasons
- detected tools
- detected features

Never generate an artifact without a real source path and source SHA.

Never cap candidates to a synthetic top-three list.

## 11. Evidence archive

Primary action:
Build evidence archive

Microcopy:
Packages only the selected files from the exact scanned revision and verifies each expected blob SHA before creating the archive.

If the source changed:
- stop packaging
- show expected SHA
- show actual SHA
- require a fresh scan

Do not silently refresh and continue.

Manifest format:
ARE-PACKAGE-V2

## 12. OneUp Today marketing

OneUp is an external agent capability.

Default mode:
Drafts for review

Automatic outbound sending is a separate authority boundary.

Marketing card shows:
- OneUp product ID
- OneUp campaign ID
- marketing status
- mode
- cadence
- target terms
- target description
- last synchronization/readback
- approval state

Consent patterns:
Connection Card:
show connection status, granted scope, last-used state, pause and revoke.

Scoped Grant:
GitHub read access is separate from write access.
Marketing configuration is separate from outbound send authority.

Action Preview:
before an outbound action show exact platform, target, message, campaign, product and mode.

Consent Memory:
default to one action or one session.
Do not silently convert review mode into standing send authority.

Action Receipt:
store action, time, product, mode, actor, external ID and result.

## 13. Admin Store View

Admin is operational, not promotional.

Primary columns:
Product, Status, Source Revision, Package, Marketing, Updated

Actions:
Edit
Preview
Publish / Unpublish
Open OneUp configuration
View action receipts

Publishing requires an explicit user action.

Automatic marketing permission is never implied by publishing a product.

## 14. Responsive behaviour

Breakpoints:
- under 768px: mobile single column
- 768–1100px: compact tablet/small desktop
- above 1100px: full editorial desktop

Mobile rules:
- no horizontal overflow
- all interactive targets at least 44px
- product cards become full width
- evidence metadata wraps naturally
- repository and revision remain visible without hover
- filters collapse cleanly
- navigation becomes compact
- no sticky overlay may obstruct the primary content

Never use fixed viewport height for critical full-screen layouts. Prefer dynamic viewport units.

## 15. Interaction and motion

Motion communicates state rather than decoration.

Button press:
1px tactile translation.

Card interaction:
subtle transform and border emphasis.

Catalog loading:
layout-matched skeletons, not generic spinners.

List entrance:
light staggered reveal.

Success:
brief explicit confirmation.

Error:
inline explanation next to the affected action.

Animate transform and opacity only.
Respect prefers-reduced-motion.
No custom cursor.
No endless decorative motion.

## 16. Accessibility

Design for WCAG-oriented accessibility from the start.

Requirements:
- readable contrast
- visible keyboard focus
- semantic heading order
- labels above inputs
- errors attached to controls
- status changes announced politely
- keyboard-accessible dialogs
- no color-only status
- no hold-to-confirm
- 44px touch target minimum

Consent dialogs:
- alert/dialog semantics
- focus trapped
- initial focus on the least-destructive action
- Escape exits safely
- consequences explained in plain language

## 17. Performance

- CSS Grid for page geometry.
- Avoid percentage-based layout hacks.
- Animate transform and opacity.
- Lazy-load non-critical imagery.
- Keep cards content-first.
- Avoid large decorative filters and effects.
- Maintain responsive interaction on mid-range mobile hardware.

## 18. UX writing

Voice:
precise, direct, engineering-literate.

Prefer:
Source revision verified.
7 files selected.
3 require adaptation review.
Build evidence archive.
Publish product.

Avoid:
Next-gen.
Seamless.
Unleash.
Elevate.
Revolutionary.
Fake customer counts.
Fake reviews.
Invented quality percentages.
Vague AI hype.

## 19. Anti-patterns

NEVER:
- use purple/blue neon AI styling
- use pure black
- use generic centered SaaS hero layouts
- use equal three-card feature rows as the main composition
- hide provenance below marketing copy
- invent repository files
- invent package evidence
- pre-authorize automatic outbound marketing
- visually favor permanent authority
- store GitHub or OneUp secrets in client code
- silently reuse a previous repository selection
- show a successful purchase without a real package/receipt
- use dark patterns such as fake urgency or confirm-shaming

## 20. Research-informed notes

Research inputs considered for the interaction model include:
- Intervenability as a Design Requirement for Autonomy and Oversight within Human-Centered AI, 2026
- Human-Centered Explainability in Interactive Information Systems: A Survey, 2025
- Actionable AI: Enabling Non Experts to Understand and Configure AI Systems, 2025

Commerce design references also emphasize structured product data and visible trust information, while agentic commerce examples separate discovery, delegated authority and auditability.

These are design inputs, not templates to copy.

## 21. Design QA checklist

Store:
- [ ] one primary hero CTA
- [ ] published catalog is live-data driven
- [ ] drafts stay private
- [ ] evidence appears before marketing copy
- [ ] price and package contents are explicit

Discovery:
- [ ] repository change clears old state
- [ ] inventory counts are visible
- [ ] every candidate has path and SHA
- [ ] package validates the scanned revision

Consent:
- [ ] access scope is explicit
- [ ] OneUp status is explicit
- [ ] draft-for-review is default
- [ ] automatic sending is separate
- [ ] consequential actions create receipts

Mobile:
- [ ] no horizontal scrolling
- [ ] 44px minimum target
- [ ] keyboard order is logical
- [ ] focus remains visible

Visual:
- [ ] one coherent dark-neutral palette
- [ ] one primary accent
- [ ] Space Grotesk / IBM Plex Sans / IBM Plex Mono
- [ ] no neon glow
- [ ] no generic AI copy

## 22. Source-of-truth rule

Implementation and this document must not drift silently.

If the Store View changes materially:
1. update Designer.md,
2. update the implementation,
3. run the relevant UI/functional checks,
4. retain evidence of the change.

The permanent ARE interaction model is:

Evidence → Comprehension → Choice → Action → Receipt
