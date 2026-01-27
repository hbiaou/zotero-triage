---
created: 2026-01-27T19:02:51Z
title: Implement library scope filter and preflight check
area: database
files:
  - src/data/zotero-db-service.ts
  - src/ui/onboarding/onboarding-wizard.ts
---

## Problem

The extension must strictly operate on the user's personal library to avoid polluting the triage workflow with shared group content, RSS feeds, or deleted items.

Currently, database queries may include:
- Group library items (shared collections)
- Feed items (RSS subscriptions)
- Deleted items (in Zotero Trash)
- Retracted items (Zotero 7+ feature)

Processing these items creates noise in the backlog and can lead to:
- Conflicting note states in shared libraries
- Processing items user doesn't control
- Performance degradation from deleted items

Additionally, duplicate items in Zotero create confusion during triage as they appear multiple times with potentially different metadata states.

## Solution

### 1. Database Query Constraints (Scope Filter)

Apply strict filtering when querying Zotero SQLite database:

**Target Only "My Library":**
- Filter items where `libraryID` corresponds to user's personal library
- In `libraries` table, select `libraryID` where `type = 'user'` (usually 1)
- Exclude all items where `libraryID` matches entries in `groups` or `feeds` tables

**Exclude Trash:**
- Exclude any item whose `itemID` exists in `deletedItems` table
- SQL: `AND itemID NOT IN (SELECT itemID FROM deletedItems)`

**Exclude Retracted Items (Zotero 7+):**
- Check if `retractedItems` table exists
- If present, exclude any `itemID` found within it

### 2. User Advisory (Pre-flight Check)

Before starting triage session (in Onboarding Wizard), display "Library Health Warning" step:

**Duplicate Check:**
- Advisory: "For the best experience, please resolve duplicate items in Zotero (Tools → Duplicate Items) before starting triage."
- Reasoning: Processing duplicates creates noise and can lead to conflicting note states

**Trash Warning:**
- If query detects high volume of items in Trash, show tip: "Items in your Zotero Trash are ignored by Triage. Empty your trash periodically to improve database performance."

**Implementation Note:**
- Do NOT auto-merge duplicates or empty trash programmatically
- Treat these as user-managed prerequisites (safe, non-destructive)
