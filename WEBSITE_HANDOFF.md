# Packing & Labelling Portal — handoff to another ChatGPT

## Purpose and scope

This is the complete source for the WSV/CTC Packing & Labelling Portal. It is a working application with server authentication, a database and file storage, not just a visual mockup. The source kit exports no current operational data. Rebuild the application using this source rather than guessing the original behaviour from screenshots.

Read `backup/README.md`, `package.json`, `.openai/hosting.json`, `lib/server.ts` and the SQL migrations first. The original project ID is removed. Create new project/storage/authentication resources and configure them for the new origin. Runtime credentials and login sessions must be recreated with the hosting provider. Initial seed/default data is included as part of the application; uploaded data and current user records are not.

## Main code map

| Area | Files to read |
| --- | --- |
| Navigation, language, screens, dialogs and action wiring | `app/portal.tsx`, `app/globals.css`, `app/layout.tsx` |
| Types, initial data, workspace bootstrap | `lib/model.ts`, `lib/bootstrap.ts`, `lib/seed.json` |
| Authentication and owner/admin/user permissions | `app/chatgpt-auth.ts`, `lib/server.ts`, `app/api/users/route.ts` |
| Workspace persistence, validation and concurrent saves | `app/api/workspace/route.ts`, `lib/workspace-store.ts`, `lib/workspace-validation.ts` |
| Import recognition, column mapping and PO cleanup | `lib/order-import.ts`, `app/import-mapping.tsx`, `lib/order-rows.ts`, `lib/po-state.ts` |
| Month/year/prefix sorting | `lib/month-order.ts` |
| Country master records, Standard reuse, versions | `lib/master-update.ts`, `lib/master-save.ts`, `lib/master-validation.ts`, `lib/material-state.ts` |
| Size and related packing settings | `lib/size-settings.ts` |
| Images and month application | `lib/image-application.ts`, `app/material-controls.tsx`, `app/material-image.tsx`, `lib/file-access.ts`, `app/api/files/route.ts` |
| PO details and search results | `lib/po-details.ts`, `app/po-information.tsx`, search handlers in `app/portal.tsx` |
| Buffer/month Excel generation and formatting | `lib/excel.ts`, `lib/template-export.ts`, `public/templates/` |
| Production materials export | `lib/production-export.ts` |
| Master data export | `lib/master-export.ts` |
| Comparison calculations, images and Excel/PDF reports | `lib/comparison.ts`, `lib/comparison-images.ts`, `lib/comparison-report.ts`, `app/comparison-images.tsx` |
| Audit/history storage | `lib/audit-summary.ts`, `app/api/history/route.ts` |
| Full backup vs source kit | `app/owner-backup.tsx`, `app/source-backup.tsx`, both `/api/backup` routes, `scripts/prepare-backup-source.mjs` |

## Rules to preserve when rebuilding or modifying

- Keep WSV and CTC separate. Use authenticated owner/admin/user checks on the server; hiding a button alone is not access control. Owner backup access is owner-only.
- Month visibility and PO import use narrow PATCH requests instead of sending the entire workspace. Visibility updates optimistically with rollback on failure; imports apply after acknowledgement. The server preserves unrelated fields, historical Excel snapshots and other months, validates current-month sizes/quantities, records audit history and commits with the same revision guard.
- Workspace saves use revisions to reject conflicting writes. Persist audit records with the successful change. Large workspace/audit/file content uses R2 storage; preserve references and access checks.
- Countries that share a Standard item code inherit Standard images and updates. Do not require duplicate uploads for each dependent country. Preserve Replace/Extra and Reuse logic implemented in the material/master modules.
- A NO. with one version applies across months without manual version-month selection. A NO. with multiple versions requires month ownership without silently taking a month from another version. Preserve exact month identity, including year and prefixes such as MID.
- Keep image application validation separate from version month application. Preserve filename/month mismatch highlighting and the implemented condition/status messages under images. Do not infer that an uploaded image automatically applies everywhere.
- EXGO files can omit years. Use the configured calendar/year logic; do not assign every month to the current calendar year. Retain month prefixes and numeric month/year display where implemented.
- Size changes must reconcile packing groups, stuffing and wrapping so deleted sizes cannot remain selected in dependent settings.
- Processed PO rows show factory PO, customer PO, country, MOS and QTY. QTY totals follow the current filters. PO Control totals only rows matching the latest generated run exactly, excluding new/unrun/changed-pending rows and archived cancellations; no total appears before any displayed row is generated. Published PO totals use the displayed published file rows.
- Cancelled POs are excluded from active totals/selection and displayed after active POs; preserve original source-file order within the respective groups.
- WSV source reports may contain repeated merged headers with blank SKU cells; recognize those by their factory/customer PO and TOTAL labels, never as real POs. Prefer the explicit Gender column over the separate US size-axis column; keep legacy US gender headers supported. Valid WSV factory POs may use ONST sample references or Loss percentage references instead of a customer PO number. The owner confirmed these rows must be imported with their original reference text and all quantities, while retaining SKU/country/MOS/size/TOTAL validation.
- Validate actual column values as well as import headers. Preserve the custom mapping confirmation path when a file format changes. Do not silently import an uncertain mapping.
- PO information and global search show the latest relevant buffer-file information. Comparison selects two saved file versions. Keep purchasing comparison based on buffered purchase quantities; do not reintroduce production Use quantities into that report.
- Preserve monthly Excel formatting. Width adjustment should reveal contents without redesigning templates or changing calculations. Preserve Production Materials EXGO and filename logic and Master Data all-country/all-version export.
- Save All concerns edited master records/NO./versions. Image uploads, confirmed image/version month application and Reuse have their own save behavior. Read the actual handlers before altering persistence.

## UI, notes and status conventions

- PO column filters (`app/column-filter.tsx`) support typing/pasting case-insensitive text, multiple values separated by lines/tabs/commas/semicolons, and selecting the matched results with Enter. All PO columns including QTY use the same filter; searching options alone must not change selected filters.
- Keep headings, checkboxes and controls aligned. Avoid unnecessary wrapping when text fits; allow long descriptions/item codes to wrap rather than clip. Preserve stable page position when switching sections, filtering images or opening dialogs.
- The bottom-right fullscreen control (`app/fullscreen-button.tsx`) uses the browser Fullscreen API on the document root, so dialogs and the rest of the app stay visible. It switches to Exit fullscreen while active and follows the fullscreenchange event when Esc is pressed.
- Image viewing overlays the current table instead of replacing it. Retain image loading/retry states and access checks.
- Keep brief action feedback with a visible background. Do not add redundant explanatory notes everywhere or restore the removed history panel merely because an audit API exists.
- Where an image filename does not match its applied month, show the filename in red. Keep meaningful image application reasons under the image. Month display uses the implemented numeric format, including prefixes where relevant.
- Preserve configured country/status color distinctions, latest/previous indicators and Show/Hide states from the source/CSS. Do not change business meanings based on a new visual design.
- Search Open Month highlights the selected PO once after that action; ordinary month navigation should not repeat the highlight.

## Verification and deployment

Install dependencies with the project's declared package manager. Apply the included migrations to the new database, provision the bucket, configure sign-in and check owner settings. Run TypeScript checks and the relevant scripts in `scripts/`; `scripts/check-server.mjs` exercises permissions, persistence, conflicts, files and backup integrity. Build with the supplied build scripts before publishing.

Check both companies: import a representative PO file, select a month, configure sizes/groups/buffer, edit master data, exercise Standard reuse and multi-version month selection, upload/apply an image, generate/download Excel, inspect PO/search details and compare two file versions. Also verify a user cannot perform admin/owner actions.

The code is the authority for exact formulas, three-condition image rules and edge cases. This guide is a map and a preservation checklist, not a replacement implementation. When requirements are unclear, inspect the cited modules and ask the owner before changing business rules. Keep downloaded source kits outside the original website.

### Monthly country / NO. purchase buffer
`month.settings.materialBuffer` stores sparse overrides keyed by normalized PO country then NO. (not image or item code). Missing entry inherits existing size/label/card sheet defaults; zero explicitly disables buffer. Same Country / NO. versions share the override, including standard code reuse. Only purchase calculation uses it; production passes buffer=false. Save all validates and persists the selected month. Immutable generated result/settings snapshots retain historical rates. Existing per-size Label and per-row Card rounding and Excel templates remain unchanged. Special-only definitions have no purchase quantities. Wrapping/stuffing/carton buffers retain their existing settings.

Countries without replacement/extra master materials share the `STANDARD` buffer key; special countries keep their own key (same classification as country master color). Monthly buffer selector shows only groups represented by active PO Control POs in that month, STANDARD first. Country-specific legacy overrides for standard-group countries remain stored but are not applied; STANDARD is the effective rate for those countries. Historical generated snapshots remain immutable. Both WSV and CTC use the same resolver/UI.

### PO Control → buffer → purchase Generate
Buffer country groups are derived ONLY from active `month.orders`, never published `latest` or historical runs. Clear Data makes the country list empty; deleting the last current PO for a group hides it without modifying immutable exports or deleting saved rates. The buffer editor appears only in Master Data. Importing/deleting/clearing PO Control immediately updates its available country groups. Save all uses the validated monthly save. Purchase Generate rejects unsaved settings/master drafts, empty/cleared control and stale/deleted/archived selections, and reads selected rows from current PO Control. Production usage remains independent of purchase buffers.

### Thailand ON-GX101 carton labels (WSV and CTC)
Confirmed requirement: ON-GX101 is 2 PCS per actual packed carton, not per pair. `isCartonLabel` recognizes Thailand + ON-GX101 code prefix, including full code descriptions. `qty_per_finish` holds labels/carton for this item and its editor is labeled Labels / Carton. `cartonCounts` shares the same six-pair, group and OWN-versus-Distributor rounding with Outer - Empty - Inner. Use actual cartons, NOT purchaseCartons (outer buffer). Multiply by labels/carton; then ceil once per PO using the existing material buffer resolver (country/NO override or Other Label fallback). Size columns partition that PO total deterministically; mixed cartons are counted only once. Production uses actual labels without purchase buffer. Descriptions carry [QTY BASIS: CARTON] in exports, PO details and master export; workbook format is untouched. Native historical snapshots are unchanged. External marked workbooks retain actual purchase cells; unbuffered required carton-label quantities are marked unknown when buffer is present, rather than incorrectly reconstructed as pairs × 2.

### User-editable material calculation basis
Country Master Data → Calculation basis opens a searchable Per pair / Per carton list of Country + NO. + all version codes. Checked items are stored as `item.quantityBasis='carton'`, unchecked as `'pair'`; the property applies to all versions of that country/NO and is validated server-side. Undefined legacy Thailand ON-GX101 defaults to carton until explicitly overridden; all other legacy items default to pair. The modal saves the master draft through the existing optimistic/audited master save. STANDARD sync preserves each existing country's explicit basis, so selecting one country does not silently select others. Shared calculation, carton rounding, purchase buffer, description marker, master export, production and comparison logic work for arbitrary user-selected carton items in both WSV/CTC, not only Thai labels. Reverting to pair removes the generated carton marker. Historical file snapshots remain unchanged.

Calculation basis now saves via PATCH operation `quantity-basis`: only changed item IDs and pair/carton values cross the network. Server validates role, IDs, duplicates and enum, checks the workspace revision, commits the immutable R2 snapshot plus focused audit under optimistic concurrency, and returns a compact acknowledgement. This operation does not sync/validate unrelated master edits or write pending drafts. The client merges only acknowledged basis fields, preserving other master drafts and month references. New unsaved NOs must be saved first. Storage still rewrites the current workspace object; this is not a per-item database migration.


## 2026-10-19 synchronization review
- Failed queued Reuse writes now restore the last acknowledged reuse/conditions, preserving unrelated unsaved Master Data edits, image months and new images.
- Processed PO selection is reconciled with the current published list. Deleted IDs cannot keep a stale selection count or details. Search text is indexed once per PO-list change; membership and bulk deselection use Sets.
- Regression checks: template/CTC format, 16 export round trips, 61 size/import, 37 material/import, master save/reconciliation, image ownership, 18 PO states, EXGO calendar, comparison Excel/PDF, server permissions/concurrent commits/backup and 20,000-PO local logic checks passed.
- This review did not perform browser visual QA or hosted concurrent-user load testing. Workspace historical snapshots remain part of full workspace reads and many writes; splitting history into lazy-loaded records remains a future architecture improvement. Do not delete historical data or R2 workspace snapshots without reference-aware retention rules.


## Per-image placement notes and Vietnamese wording (2026-10-20)
- Optional `image.note` (plain text, max 2000 characters) is edited only in Country Master Data > Image. Each image has its own Save note button enabled only for changed text. Saved through automaticMasterChanges: unrelated Master Data drafts remain unsaved. Users see text without editing controls.
- Standard image inheritance carries notes with the shared image; country-specific images keep independent notes. WSV and CTC use the same implementation. Empty text clears the note.
- PO Information (embedded and dialog) and its PDF show the note below the corresponding image. Existing published image references receive the current note only when both material code and image ID match; historical picture IDs and all saved quantities remain intact. A removed image keeps its historical snapshot note. No workbook export columns or formatting changed.
- Vietnamese PO tabs, headings, PDF button labels, overview, PO management and save messages use clearer wording. uiText translates display labels only; material codes, PO values and Excel/PDF business tables remain source data.
- Validation: master draft isolation, note add/clear, Standard propagation WSV/CTC, invalid note rejection, exact-ID historical note matching, PDF generation and Excel format regression. Browser visual QA is unavailable in this environment.

### Startup incident and reintroduction
Version 121 was rolled back to 120 after a user reported a loading screen. The exact production cause was not established; no claim of a confirmed root-cause fix should be made. Notes and Vietnamese wording are reintroduced with an independent inline startup recovery: after 20 seconds on the loading screen it offers a manual reload; early JS errors do likewise. Ready state cancels it. This never reloads automatically or changes data. `check-boot-recovery.mjs` validates its states; `check-client-links.mjs` links every built browser module and verifies chunk files/named exports. Neither is an actual browser hydration test.


## Country / NO. common image notes (2026-10-20)
- Optional item.imageNote is edited beside each Country / NO. heading in Image, with an independent dirty-aware Save button. The saved common note applies to every image/version under that item. Per-image note remains additive and independently editable.
- Save uses persisted workspace plus only item.imageNote, with rebaseMasterDraft to retain pending Master Data edits. Validation rejects non-text and over-2000-character values. No Excel export formatting/data changes.
- materialImageNote resolves own note first (including explicit empty), then the exact shared Standard version. PO calculation/detail images carry derived groupNote for display/PDF; historical picture IDs and quantities remain unchanged. UI renders common and individual notes as separate plain-text blocks.
- Checks cover common/individual coexistence, independent clearing, Standard/private version isolation, both companies, pending draft preservation, server persistence/validation, Excel regression, startup script and production module linking.


### Group note interaction fix
The common-note editor is now a sibling of an explicit show/hide button, outside any summary or toggle target. Only the Country / NO. button changes expandedGroups. The hidden image body stays mounted, preserving per-image note drafts. Typing, focus, selection, Enter/Space and saving within either note editor cannot trigger native details toggling. Browser interaction QA remains unavailable.

## Image grid and PO reopen latency (2026-10-20)
- Restored an explicit responsive horizontal grid on `.image-group-body > .image-grid`. Replaced obsolete five-track subgrid spans with self-sized cards; note/reuse fields no longer overlap or force a vertical list.
- Production logs showed cached image 304 responses taking approximately 0.7–3.9 seconds. The file API and authorization remain unchanged.
- PO Information and large previews opt into a page-local image cache: only successful image responses, 60-second TTL, deduplicated in-flight reads, 24 entries and 32 MiB active/32 MiB retired blob limits. Nothing is stored persistently or shared between sessions. Master image grids retain native lazy loading. First-time image loads still depend on network/server latency; only repeated loads within the short TTL bypass repeated requests.
- `check-image-memory.mjs` covers reuse, expiry, failed authorization and bounded entries; TypeScript/startup checks passed. Browser visual/network QA is unavailable.


### PO image print and shared image loading (2026-10-20)
PO Detail has independent image-only PDF export, selected PO IDs, landscape A3/A4. `lib/po-image-pdf.ts` uses only label/special/card rows of those IDs from the displayed detail result; duplicates collapse only for identical image ID and notes within a PO. All selected PO references fit on a single page using a measured adaptive grid; each PO owns a separate bordered rectangle with one PO/country heading and its own image grid; the grid wraps only within the PO rectangle. No month heading or repeated heading per image. Image aspect ratio is preserved. Includes common and individual notes, no purchase tables; fails rather than silently omitting missing/failed images. Long notes shrink to their measured reserved space, so images and text cannot overlap; dense selections necessarily print smaller. Existing detail PDF and all Excel exports unchanged.
All MaterialImage thumbnails now share the same page-local authorized blob cache as the enlarged viewer. Observer loads near visible images only; four requests at a time, five-minute TTL, unchanged bounded memory; fallback retries original URL if a cached blob fails. Nothing persisted, no server auth change. First-time network fetch can still take time. Tests: check-image-memory and check-po-image-pdf; sample A3/A4 rendered with Poppler for inspection.

PO Detail now uses poPrintGroups for the active label/special/card tab in both the main detail dialog and comparison version details. No item-code-only deduplication across POs. Shared Standard images appear separately for each PO; fetching an identical image is still deduplicated.

PO groups stack vertically, matching the existing website layout. PDF arranges all images of each PO horizontally in one row inside that PO rectangle; all PO rows fit the single landscape page. Dark blue-gray borders: PDF 0.65 mm, website 2 px. Website image grid behavior is unchanged.

### Workspace startup storage timeout (2026-10-21)
Production logs around 13:12–13:16 Bangkok: WSV GET /api/workspace returned 400 after 23–26 s, with 12–32 ms CPU. Three requests timed out in workspace content at 20 s. CTC content read took 13.1 s; WSV earlier read content in 114–167 ms. Evidence confirms storage-body latency, not CPU exhaustion; underlying provider cause/actual live snapshot byte size not established.
workspaceData now bounds each GET snapshot attempt as a whole (get + streaming body), cancels stalled body readers, retries one fresh read of the exact immutable storage key on timeout/transient transport errors (20 s then 30 s). No retry for absent data or malformed JSON, no stale fallback and no write retries. Logs snapshot size and attempt. Client GET deadline is 90 s to allow bounded server recovery. 33 server/backup checks include cancellation, same-key retry, two-attempt bound and malformed-JSON/inline behavior. Real provider slowdown not reproducible in local integration tests.

### General Information image zoom (2026-10-22)
General-only preview uses a 98vw × 94svh modal with a dedicated scrollable image canvas. Fit mode starts at full available area with original aspect ratio, wheel zoom anchors at pointer (non-passive wheel listener prevents browser page zoom), +/- buttons, fit reset and original-size button; drag pans scroll position and double-click toggles zoom. Zoom range 0.25–16x fitted size. Other PO/material previews unchanged. No new image requests when zoom changes. Geometry in lib/image-zoom.ts. Browser preview attempted but blocked by environment browser URL policy; do not claim interactive browser QA.

### Deep audit after General image zoom (2026-10-22)
Live DB read-only inspection: CTC revision 29 stored under CTC/workspace; WSV revision 351 under WSV/workspace. Recent successful logs: workspace GET 1.87–2.01 s, users ~0.31 s, image conditional requests 0.64–1.68 s. Error query returned crawler-only robots/sitemap 404s, no core API failures in that window. Not a concurrency load test or full live R2 content audit.
Found a stale-workspace UI risk: failed load after switching company could leave old ws visible under new company; root now blocks view/actions unless loadedCompany matches, General paste listener detaches while loading, and wsRef exposes only ready workspace. API GET supplies non-editable workspaceCompany provenance independently of editable display name. PUT checks marker mismatch and foreign WSV/CTC id/fileId/storageKey references recursively, including saved Excel snapshots. Successful PUT stamps company. Existing unmarked legacy payloads remain accepted if file references match to preserve compatibility. New bidirectional integration test verifies Standard code/image update leaves other workspace raw pointer/revision/audit untouched and mismatched marker / foreign image / foreign import rejected.
General thumbnails now use MaterialImage cache shared with enlarged view. Image fetch/body has 20s abort deadline to release bounded request queue; tests cover two-company same suffix isolation and 8 stalled reads releasing all queue slots. Original-size zoom control now allows the required ratio even outside default fit-relative bounds. check-materials harness import mapping repaired (was missing material-state .mjs rewrite; production module unchanged).
Audit validation: 34 server checks, 37 material/import, 61 size/import/Excel, 16 export round trips; other Master/Standard/version/reuse/calendar/PO/selection/comparison/PDF/cache/zoom/boot suites pass. 20k PO local status test ~584ms, not hosted/browser benchmark. Existing browser policy prevented interactive QA; no claim of end-to-end browser coverage or full live stored content verification.

### Workspace switch spinner restoration (2026-10-24)
Initial loading screen is only used when ws is absent. During later WSV/CTC switching, retain the existing portal underneath the usual processing-card spinner overlay; old portal is inert while loadedCompany mismatches company. The mismatch overlay stays outside that inert subtree. Failed loading shows retry/back-to-last-loaded controls in the overlay; data editing stays blocked. Existing save/company namespace guards remain.

### Single-PO print layout (2026-10-24)
For exactly one selected PO, the image-only PDF evaluates all grid column counts and selects the best image-area layout with measured notes. It no longer forces one row; six mixed labels in QA use 3×2. Each note starts 2 mm below its actual image edge, and the image-plus-note block is vertically centered in its cell. Multi-PO horizontal rows and website presentation unchanged. A3/A4 landscape still one page. Regression checks compare six mixed-aspect print area against the previous forced-row upper width; new area >1.5x; rendered A3/A4 fixtures inspected.

### Image PDF PO cap and completeness gate (2026-10-24)
Image-only PDF now caps each export at 3 distinct selected PO IDs. Both initial/effect-reset selections take the first three, count/max is visible, unchecked choices disable at the limit while checked choices can still be removed; functional state update prevents rapid extra selections. Shared validatePoImageSelection checks cap, stale PO IDs and missing images before font/image fetch and again in builder. A missing material blocks even if other images are available; message identifies PO/code. Fetch/decode failure still rejects export before doc.save. WSV/CTC and both PoInformation surfaces use the same components. Existing table-detail PDF unchanged. Tests cover 3 accepted/4 rejected before image loading, all/partial missing images and image-load rejection.
