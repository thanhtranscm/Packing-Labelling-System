# Website review — 2026-10-05

Scope: both WSV and CTC; PO state across import/generate/reimport/clear/delete/latest; size schema changes and linked box/carton/wrapping/stuffing mappings; Master Data inheritance/version coverage; Excel purchase/production templates; comparison and historical images; database writes, roles, history and complete backups.

Corrections:
- Workspace revision update and audit insert now commit atomically. Concurrent saves cannot overwrite a newer revision; audit failures roll back the write.
- Duplicate PO/month/material identifiers, invalid numeric material quantities and malformed workspace structures are rejected. Deleted months are removed from current material/image coverage.
- Empty month lists show an empty state for month-dependent pages.
- New monthly imports retain their original uploaded Excel files, in addition to parsed source quantities and provenance.
- Detailed history is limited to owner/admin so normal users cannot obtain hidden-month PO details or the authorized-user list through audit records.
- User access changes record old/new role, name and active state in both workspace histories.
- History shows more readable field/PO/version details and can load beyond the first 200 entries.

Performance:
- Excel helpers load with the portal so newly published versions cannot leave an open page requesting a removed Excel chunk. PDF vendor imports remain separate.
- History requests run when the history panel opens, with short caching and cursor paging; the company/id index supports queries.
- PO status/filter/selection lookup, draft comparisons and missing-reference scans reuse stable results.
- Fixed-size image previews load as they approach the viewport.
- ZIP data streams file by file instead of buffering every upload in memory.

Validation: 13 PO-state cases, 40 size/import/Excel cases using original WSV 132-PO and CTC 25-PO workbooks, 13 material/import cases, 5 reference Excel layout cases, 22 Master Data/reference cases, 16 server/backup integration cases, plus audit-summary and PO-details/PDF assertions. The backup test extracts the ZIP, verifies stored bytes and source SHA-256, and executes the generated restore SQL into a new SQLite database. The backup guards test owner/admin/user/signed-out access, stale data/code, missing files, and storage pagination beyond 1000 files.

Limits: automated integration tests use local SQLite and simulated storage/identity; they are not a full provider failover drill. Browser automation was unavailable because the required browser-control skill is not installed. No live user records were rewritten for testing. Performance improvements are supported by smaller initial client code and reduced repeated work; real-device latency and very large production datasets have not been benchmarked. A new host still requires authentication registration, persistent resource bindings and provider-managed secrets. Files imported before original-file retention may lack their original bytes; parsed saved POs and existing generated versions are preserved. This review does not guarantee the absence of every possible defect.

Run `node scripts/prepare-backup-source.mjs`, then `node scripts/check-po-state.mjs`, `node scripts/check-size-settings.mjs`, `node scripts/check-master.mjs`, `node scripts/check-template.mjs`, `node scripts/check-materials.mjs`, `node scripts/check-server.mjs`, `node scripts/check-extra.mjs`, and the TypeScript/build checks. Reference workbooks are included in `test-fixtures/` so these checks can be reproduced from source.zip.

## Follow-up review — 2026-10-06

- PO Control and Production Materials share uppercase PO text, a common header baseline, and matching left alignment for QTY. Filter options reuse a memoized set rather than sorting every column on selection.
- History opens in loading state and revalidates on every opening. Loading is visible even when cached rows remain, including older-history paging.
- Processing can paint before synchronous generation work begins. PO detail tables and processed results reuse calculations across unrelated UI updates.
- Dense grids use shrinkable columns. Versions, filenames, user rows, PO summary fields, comparison selectors and processed PO rows wrap at narrow widths instead of spilling out of panels.
- TypeScript and all reproducible business/server/export checks rerun for this review. No browser/device rendering or real-device latency measurements were available; visual conclusions are based on supplied screenshots and layout rules, not an exhaustive browser verification.

## Import correction — merged subtotal rows

The source importer previously treated a merged TOTAL model label repeated across PO identity columns as an order. Regression workbooks now reproduce this layout for WSV and CTC, including a real PO after the subtotal. Summary rows are excluded before PO/quantity parsing. Existing active order/latest projections are reconciled with an atomic audited write. Original imports, generated-file bytes, run history and generated quantities remain preserved; affected saved versions receive an explicit warning requiring reimport/regeneration. Calculation rejects summary rows as a further guard. Earlier passing import fixtures did not cover merged subtotal rows.

## Final regression review — 2026-10-06

Confirmed operating rules: Cancelled is an informational month status and does not lock actions. Missing images are reported but do not prevent Excel generation.

Additional corrections:
- External Excel versions match the selected month's saved size profiles, not the global table alone. WSV split rows match factory PO as well as ON PO/SKU/country/MOS.
- Production files with a combined material sheet are read once; their hidden Special/Card sheets cannot double-count the same quantities. Packaging item codes survive import. Invalid negative/non-numeric quantities and formulas without cached values are rejected.
- Imported paper totals are shown as file-wide aggregates, never attributed to the first PO. External packaging required quantities are marked unavailable rather than presented as reconstructed facts. Original native snapshots keep their exact required/purchase quantities.
- Unsaved settings/workspace drafts require a discard confirmation before changing context. Failed country/workspace saves keep their dialog open. New countries preserve a single default material version. Month year/month inputs must be integers and duplicate month periods/prefixes are blocked.
- Empty carton/box material codes are blocked when saving settings. Async history paging cannot append into a newer query, and backup status requests cannot overwrite a newer refresh. Repeated action clicks are locked while processing.
- Exact Monthly settings note removed in both languages.

Validation includes the existing PO-state, source-import, material/reference, template, size-linkage, server/auth/history/backup suites plus eight export/import round-trip cases covering WSV/CTC × purchase/production × standard/month-specific size tables, split POs, combined-sheet materials, paper aggregates and malformed quantities. Browser rendering and real-device performance remain unverified because the required browser-control capability is unavailable. This is a bounded regression review, not proof against every possible input or device failure. External Excel does not contain native historical image/version assignments or original required packaging quantities.

Run `node scripts/check-export-roundtrip.mjs` in addition to the previous validation commands.

## Standard image and version inheritance

Standard version codes now own shared images, reuse conditions and image month assignments for every matching country version (normalized code, including different row numbers). Workspace reads project the shared images and writes enforce them; calculations resolve Standard directly. Shared country image controls link to Standard. Missing-image chips route shared codes to Standard. Subscribed replacement rows receive newly added Standard versions and their months, while explicit private-version months retain priority. Saved export/comparison snapshots remain unchanged. Template export, material/import regressions (15), backend checks and TypeScript validated.

## Image upload month defaults and filename feedback

New material images apply to the selected month when version coverage permits and the month has no existing image. Existing assignments are not overwritten: conflicts open explicit month selection. Unassigned existing images offer a saved apply-to-current-month action when unoccupied. Filename format is validated even before month application; filename/date mismatch warnings are visible below the name in both image surfaces. Nine focused helper regressions and TypeScript validated.

## Complete Standard reconciliation

Workspace reads reconcile current Standard subscriptions and save changed projections atomically for administrators with audit. Writes enforce full Standard synchronization before validating persisted output. All existing Standard rows receive one-time unambiguous filename-to-month assignment (one calendar period, one eligible version, one image, no occupied month); ambiguous files remain explicit. Subsequent deliberate clearing is preserved by the revision marker. Current missing-image warnings use all saved material references and current shared Standard image availability, including later deletion; historical snapshots remain unchanged. Added migration/idempotency/ambiguity/live-warning regressions; material/import (18), template (5), server/backup (17), TypeScript and build checked.

## Workspace navigation and history display

Workspace button labels remain fixed WSV/CTC during asynchronous switches; duplicate switches are blocked while loading, comparison/search selection state is cleared, and processed detail components are keyed by company. Administrator history first pages prefetch after workspace load/revision changes. Opening history displays cached rows immediately and refreshes in background; uncached filters still show loading. Request deduplication includes revision, older request results cannot overwrite newer cached revisions, and pagination waits for the initial refresh. TypeScript/build validated; actual browser latency remains unmeasured.
