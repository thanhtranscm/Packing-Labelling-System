# Confirmed requirements from supplied conversation histories

Reviewed sources: WSV TOTAL BALANCE.docx, PLS.pdf (64 pages), 1.xlsx,
Sub_material_2026_11_v1 (4).xlsx, Production_material_usage_2026_11.xlsx,
and exported master data for both companies. Earlier assistant claims are not
verification evidence. Later user corrections take precedence.

## PO state

- Initial import: Not Run; does not update generated-file change summary.
- Initial successful Generate: Processed; no New classification.
- From second Generate: New/Updated/Unchanged compare generated snapshots.
- Import alone must never change published PO detail, available count or cancellations.
- Imported rows identical to generated baseline: Unchanged; new/changed rows need Generate.
- Cancelled requires prior presence in a generated file and absence in a subsequent
  generated file. Removing a never-generated row must never create cancellation.
- Cancellations accumulate across Generate history. Reappearance restores a current
  status but retains cancellation history.
- Clear empties PO Control only while generated versions exist. It preserves files,
  published details and historical baseline. Clear plus no versions resets the month,
  including both operation orders (Clear then delete last / delete last then Clear).
- Clear and successful import/Generate remove all stale selections.
- Cancelled and previous-output-only rows cannot be selected for generation.
- Available and global search derive only from the selected latest output snapshot.
- Pending excludes cancellations and includes new or changed imported rows.
- User confirmed option 2: status comparisons use the chronological Generate events.
  Manually selecting an older file as Latest changes published detail/available/search
  only; it does not change the status comparison baseline for the next Generate.

## Master and image state

- WSV/CTC independent. Clipboard copy excludes images/month applications/history.
- Country + No contains independent code/description versions, with duplicate code
  checks, explicit deletion, and a separate display-at-No selection.
- One version exports for all months even with no images. Multiple versions require
  exactly one selected version for the export month, only for countries actually selected.
- Images have independent month applications. Multi-version images can only apply
  to months assigned to their own version; removing version months cleans image months.
- Final sheet selection is independent checkboxes for Label, Special, Card; none=disabled.
- Standard inheritance updates inherited data but never automatically inserts Standard
  versions into Replace entries. Add Standard explicitly adds an alternative version.
- User confirmed option 1: block a new Standard No that conflicts with existing
  country Extra No and list affected countries/No. Never merge or silently reindex.
- Image application grouped by Country + No; inherited Standard images listed once.
- Reuse conditions inform comparison only, never modify PO or month applications:
  no condition=green reusable; additional conditions=yellow conditional;
  any blocks-reuse condition=red not reusable.
- Missing images include all saved outputs, newest codes blue, old-only codes red;
  deduplicate and update immediately after image application. Clicking opens and briefly
  highlights the exact Country + No, with one-time navigation intent.

## File contracts

- Preserve reference fonts, fills, borders, merges, widths, hidden columns, freeze,
  print configuration and conditional formatting. Do not recreate a simplified layout.
- Purchase: six sheets Label/Special Label/Card/Outer/Wrapping/Stuffing.
- Production: first sheet Label - Special - Card; Special/Card hidden, other sheets
  retain original formatting. All buffers zero; no saved version or PO status changes.
- Label/Card: seven header rows, sizes begin W, total then blank EXGO DAY/RTD
  data with borders. Total row after final data; static values.
- Special Label: twenty columns, no size quantities; no bordered empty trailing rows.
- Outer: four header rows; source sizes, quantity total, ETD sourced EXGO MONTH;
  three groups means A:BB. Each material cluster includes its own total column.
  D and P:R hidden. TOTAL text under ETD. Preserve reference color rules.
- Dynamic sizes and group counts expand/contract corresponding template regions;
  do not change the remaining formatting.
- CTC factory PO optional, blank if absent, read/display/export when supplied.
  WSV factory PO required and shown separately from ON PO.
- Snapshot material/version/images/reuse rules/month coverage at Generate. Comparison
  reads snapshots including Special-only materials and removed codes; never recomputes
  old outputs using current Master Data.

## Access and other flows

- Protected owner emails from supplied configuration; no first-login admin grant.
- Owner alone edits names/roles. Inactive/deleted users blocked server-side.
- Active ordinary users read all published months in both workspaces and export usage.
- General Information: per-company cards, paste image from Excel, reorder/edit/delete,
  full image display, downloadable PDF; admin edits, user reads/downloads.
- Production Materials import is temporary, initially no PO selected; full filters and
  confirmed row deletions, no persisted PO/status/version changes.
- Mid/End workspaces independent; prefix editable after creation, month/year immutable.
- Reroute requires at least two output versions.
- Shared monthly Save covers buffer, packaging and size profiles. Persistent open/closed
  preferences, active tab and country across refresh, isolated by company.
- English/Vietnamese equivalents, centered operation/error/confirmation dialogs,
  consistent control sizing, no unsolicited subtitles or explanatory notes.

## Validation and current limits

PO status, Standard/Extra collision handling, selected material versions, snapshot
comparisons, actual WSV/CTC imports, and template export have passed 31 scripted
checks. TypeScript and production build passed. Template export preserves the supplied
style table, dynamic size/group columns, hidden columns, merges, totals, conditional
formatting, and the Special Label final-row bottom border.

Browser interaction and visual PDF verification remain outstanding. Some Vietnamese
labels and individual expanded-card preferences still need review. Historical uploaded
Excel versions cannot restore image/version snapshots absent from those files.

## October 5 interface refinements

Change History opens as a large dialog over the current page, with From/To date
filters in the visitor's timezone and Time/Activity/Change details/Administrator columns.
The country menu is opaque and anchored below its control. Standard is white;
Replace is red; Extra is green; Replace plus Extra is yellow. The complete desktop
portal, header and sidebar share a centered 1200px frame. Setting headers use a
blue background, stronger type and a left accent; paper sections have distinct titles.
