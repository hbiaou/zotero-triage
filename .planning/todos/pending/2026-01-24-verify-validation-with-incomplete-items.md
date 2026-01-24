---
created: 2026-01-24T09:31:28Z
title: Verify validation features with incomplete items
area: validation
files:
  - src/ui/triage-card.ts:29-87
  - src/ui/triage-view.ts:160-171
  - src/ui/override-modal.ts:1-196
  - src/validation/validation-service.ts
---

## Problem

Phase 3 validation system was tested during checkpoint but could not verify all features because user's Zotero library (10,770 items) has exceptionally complete metadata. All tested items passed validation with no missing fields.

Features implemented but not fully tested:
- Validation badges on triage cards showing missing field count
- Inline error list displaying which fields are missing
- "Accept Anyway" button appearing for invalid items
- Override confirmation modal with missing fields list
- "Open in Zotero" link (zotero://select protocol) for fixing metadata externally

Debug logs confirmed validation runs correctly (all items tested showed `valid: true, missingFields: [], errors: []`), but UI elements for invalid items never rendered because no invalid items were encountered.

User added abstract and ISBN to quality gate requirements, making gates even stricter.

## Solution

When incomplete items naturally appear in Zotero library (or for manual testing):

1. Find an item with missing required fields (DOI, journal, year, abstract, etc.)
2. Generate batch until incomplete item appears
3. Verify:
   - Card shows validation badge with count (e.g., "3 missing")
   - Card shows inline error list (up to 3 errors)
   - Accept button shows "Accept Anyway" instead of "Accept"
   - "→ Open in Zotero to fix" link appears
   - Clicking "Accept Anyway" triggers override modal
   - Modal shows item title, author, missing fields list
   - Modal has "Import Anyway" and "Cancel" buttons
   - Clicking Zotero link opens Zotero and selects item

OR create test case:
1. Temporarily remove DOI from one journal article in Zotero
2. Clear registry: `"registry": {"version": 1, "entries": {}, ...}`
3. Generate batches until test item appears
4. Test all validation UI features
5. Fix item metadata in Zotero

All validation code is implemented and functional per plan 03-02. Just needs manual verification with incomplete item.
