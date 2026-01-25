---
created: 2026-01-25T12:23
title: Override modal field explanations
area: ui
files:
  - src/ui/override-modal.ts:76-81
---

## Problem

OverrideConfirmModal shows users which fields are missing when quality gates block import, but doesn't explain:
- WHY those fields are required
- HOW to fix them in Zotero
- WHAT the fields mean (for less technical users)

Current modal shows:
- Item title and author
- List of missing field names (e.g., "doi", "publicationTitle")
- "Open in Zotero" link
- "Import Anyway" / "Cancel" buttons

Context is minimal - users see field names but may not understand:
- Why DOI is important for academic papers
- How to add a DOI in Zotero
- What "publicationTitle" means (it's the journal name)

Identified during v1.0 milestone audit as minor UX improvement (non-blocking).

## Solution

Enhance override modal with explanatory text:

**Option 1: Field-specific help text**
Add explanation for each missing field:
```typescript
const FIELD_EXPLANATIONS = {
  doi: "Digital Object Identifier - unique ID for academic papers",
  publicationTitle: "Journal or publication name",
  date: "Publication year",
  // etc.
};
```
Show below missing fields list with icon and expandable help.

**Option 2: General guidance section**
Add guidance section above missing fields:
```
These fields help maintain high-quality literature notes. You can:
• Click "Open in Zotero" to add missing information
• Click "Import Anyway" to skip validation (not recommended)
• Click "Cancel" to defer this item and fix later
```

**Option 3: Hybrid**
Combine both - general guidance + field-specific tooltips on hover.

Recommendation: Start with Option 2 (simple, non-intrusive) and add Option 1 if user feedback requests more detail.
