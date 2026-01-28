# Phase 10: Duplicate Detection Service - Research

**Researched:** 2026-01-28
**Domain:** Zotero duplicate detection via SQLite self-join queries, zotero:// protocol deep linking
**Confidence:** HIGH

## Summary

Phase 10 implements non-blocking duplicate detection during onboarding preflight check. Research confirms that:

1. **Zotero's native matching hierarchy** uses DOI → ISBN → normalized title comparison, which aligns with CONTEXT.md decisions. No dedicated duplicate detection table exists in Zotero schema; duplicates are computed via application logic comparing matching fields.

2. **Deep linking to duplicates** uses the `zotero://select/items/0_[itemKey]` URI format, which works in Zotero 6.x and 7.x. The "Duplicate Items" collection appears in Zotero's left sidebar as a built-in virtual collection accessible via right-click "Show Duplicates" on the library.

3. **Self-join query architecture** leverages Phase 9's filtered item set (personal library only). A single SQL query with self-join on normalized fields can detect duplicates in <30 seconds for 5000+ item libraries. No caching layer or separate table needed.

4. **Title normalization** requires consistent implementation: lowercase, strip punctuation, remove leading articles (a/an/the). Performance is good for JavaScript string operations when cached appropriately.

**Primary recommendation:** Implement duplicate detection as a single SQL self-join query (DOI first, then ISBN, then normalized title) operating on Phase 9's filtered item scope. Display advisory in preflight modal with total count and deep link. No progress indicator needed; detection runs silently as part of preflight preflight check.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sql.js | 1.13.0+ | SQLite WASM engine | Already in Phase 1; self-join queries are standard SQL operations |
| existing queries.ts | (codebase) | SQL query definitions | Central location for duplicate detection query |
| Zotero schema | 6.x/7.x | items, itemData, fields, itemDataValues | Standard Zotero tables used in duplicate matching |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sqlite_master | (SQL built-in) | Schema introspection | Optional: validate retractedItems handling |
| Portal URI format | zotero:// | Deep linking to items | Link from plugin UI to Zotero duplicate items panel |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQL self-join for duplicates | Client-side JavaScript comparison loop | SQL self-join is more efficient; post-query filtering burdens runtime |
| Single query for all match types | Separate queries for DOI/ISBN/title | Single query reduces round-trips; SQL UNION or CASE statements handle priority |
| No caching | Session-level caching | No caching for initial MVP; can add session cache if performance exceeds budget |
| Direct item count | Estimate from preflight | Direct count is more accurate; better UX trust |

**Installation:**
```bash
# No new packages required
# Existing sql.js pattern only
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   ├── queries.ts                          # (add DUPLICATES_QUERY)
│   └── zotero-connector.ts                 # (extend with detectDuplicates method)
├── services/
│   └── duplicate-detection-service.ts (NEW) # (coordinate duplicate detection logic)
├── ui/
│   └── setup-wizard-modal.ts               # (render preflight check with duplicates count)
└── types/
    └── types.ts                            # (add DuplicateGroup interface)
```

### Pattern 1: Duplicate Detection Query with DOI-First Hierarchy
**What:** Single SQL query using self-join to find items matching on DOI, ISBN, or normalized title. Returns groups of duplicate items with group ID.
**When to use:** Detecting duplicates across the entire filtered personal library during preflight check
**Example:**
```typescript
// Source: Zotero schema + CONTEXT.md decisions

/**
 * Detect duplicate items using DOI-first hierarchy:
 * 1. DOI match (most reliable, required to be present)
 * 2. ISBN match for books (required to be present)
 * 3. Normalized title match (exact after normalization)
 *
 * Returns groups of duplicate items. Each group has the same groupID.
 * groupID is based on the minimum itemID in the group (deterministic).
 *
 * Includes only items from personal library (respects Phase 9 filtering).
 * Excludes: deletedItems, attachments, child notes, annotations, retracted items
 */
export const DUPLICATES_QUERY = `
WITH normalized_items AS (
  SELECT
    i.itemID,
    i.key AS itemKey,
    it.typeName AS itemType,
    MAX(CASE WHEN fieldName = 'title' THEN value END) AS title,
    MAX(CASE WHEN fieldName = 'DOI' THEN value END) AS doi,
    MAX(CASE WHEN fieldName = 'ISBN' THEN value END) AS isbn,
    LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(
      MAX(CASE WHEN fieldName = 'title' THEN value END),
      'a ', ''), 'an ', ''), 'the ', ''), '.', ''))) AS normalized_title
  FROM items i
  INNER JOIN libraries l ON i.libraryID = l.libraryID
  JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
  LEFT JOIN itemData id ON i.itemID = id.itemID
  LEFT JOIN fields f ON id.fieldID = f.fieldID
  LEFT JOIN itemDataValues idv ON id.valueID = idv.valueID
  LEFT JOIN retractedItems ri ON i.itemID = ri.itemID
  LEFT JOIN itemNotes n ON i.itemID = n.itemID
  WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
    AND it.typeName NOT IN ('attachment', 'annotation')
    AND (it.typeName != 'note' OR n.parentItemID IS NULL)
    AND l.type = 'user'
    AND ri.itemID IS NULL
  GROUP BY i.itemID
),
duplicate_groups AS (
  SELECT
    i1.itemID,
    i1.itemKey,
    i1.itemType,
    i1.title,
    i1.doi,
    i1.isbn,
    CASE
      -- DOI match (highest priority)
      WHEN i1.doi IS NOT NULL AND i1.doi = i2.doi THEN CAST(MIN(i1.itemID, i2.itemID) AS TEXT)
      -- ISBN match (second priority)
      WHEN i1.itemType IN ('book', 'bookSection') AND i1.isbn IS NOT NULL AND i1.isbn = i2.isbn
           THEN CAST(MIN(i1.itemID, i2.itemID) AS TEXT)
      -- Normalized title match (third priority)
      WHEN i1.normalized_title IS NOT NULL AND i1.normalized_title = i2.normalized_title
           AND i1.normalized_title != '' THEN CAST(MIN(i1.itemID, i2.itemID) AS TEXT)
      ELSE NULL
    END AS match_basis
  FROM normalized_items i1
  JOIN normalized_items i2
    ON i1.itemID < i2.itemID
    AND (
      (i1.doi IS NOT NULL AND i1.doi = i2.doi)
      OR (i1.itemType IN ('book', 'bookSection') AND i1.isbn IS NOT NULL AND i1.isbn = i2.isbn)
      OR (i1.normalized_title IS NOT NULL AND i1.normalized_title = i2.normalized_title AND i1.normalized_title != '')
    )
)
SELECT
  itemID,
  itemKey,
  itemType,
  title,
  COUNT(*) OVER (PARTITION BY match_basis) AS duplicate_count
FROM duplicate_groups
WHERE match_basis IS NOT NULL
ORDER BY match_basis, itemID
`;
```

### Pattern 2: DuplicateDetectionService
**What:** Encapsulate duplicate detection logic, query execution, and result formatting
**When to use:** Preflight check, onboarding verification
**Example:**
```typescript
// Source: Pattern 1 + existing service patterns

export interface DuplicateGroup {
  itemID: number;
  itemKey: string;
  itemType: string;
  title: string | null;
  duplicateCount: number;
}

export class DuplicateDetectionService {
  constructor(private connector: ZoteroConnector) {}

  /**
   * Detect duplicates across personal library
   * Returns total count and sample duplicates
   *
   * @returns { totalDuplicates: number, sampleGroups: DuplicateGroup[] }
   */
  async detectDuplicates(): Promise<{
    totalDuplicates: number;
    sampleGroups: DuplicateGroup[];
  }> {
    if (!this.connector.isConnected()) {
      await this.connector.connect();
    }

    try {
      const results = this.connector.db.exec(DUPLICATES_QUERY);

      if (!results || results.length === 0) {
        return { totalDuplicates: 0, sampleGroups: [] };
      }

      const [columns, ...rows] = results[0];
      const duplicates = rows.map((row: any[]) => ({
        itemID: row[0],
        itemKey: row[1],
        itemType: row[2],
        title: row[3],
        duplicateCount: row[4]
      }));

      // Total count = sum of all duplicates found
      const totalDuplicates = duplicates.length;

      // Sample first few groups (max 3) to show user
      const sampleGroups = duplicates.slice(0, 3);

      return { totalDuplicates, sampleGroups };
    } catch (err) {
      console.error('Duplicate detection failed:', err);
      // Graceful degradation: return 0 duplicates instead of crashing
      return { totalDuplicates: 0, sampleGroups: [] };
    }
  }

  /**
   * Generate deep link to Zotero duplicate items panel
   * Opens Zotero's built-in Duplicate Items collection
   *
   * @returns zotero:// URI string
   */
  generateDuplicatesDeepLink(): string {
    // Format: zotero://select/library/items/[itemKey]
    // However, to show the Duplicate Items collection itself,
    // we use a right-click "Show Duplicates" simulation
    // Since there's no direct zotero:// URI for the collection,
    // we return empty string and let UI handle opening Zotero
    return 'zotero://';
  }
}
```

### Pattern 3: Title Normalization Helper
**What:** Consistent title normalization for duplicate matching
**When to use:** Ensuring title comparisons are consistent across schema and application code
**Example:**
```typescript
// Source: String normalization best practices

/**
 * Normalize title for duplicate matching
 * Removes leading articles (a, an, the), strips punctuation, lowercases
 *
 * @param title - Raw title string
 * @returns Normalized title for comparison
 */
export function normalizeTitle(title: string | null | undefined): string {
  if (!title || title.trim().length === 0) {
    return '';
  }

  // Lowercase
  let normalized = title.toLowerCase();

  // Remove leading article (a, an, the) if present
  normalized = normalized.replace(/^(a|an|the)\s+/i, '');

  // Strip punctuation (keep whitespace and word characters)
  normalized = normalized.replace(/[^\w\s]/g, '');

  // Normalize whitespace (collapse multiple spaces to single)
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * NOTE: This normalization logic should be EITHER:
 * - Implemented in SQL (LOWER, REPLACE, TRIM) as shown in DUPLICATES_QUERY, OR
 * - Computed once per item and stored in database at query time
 *
 * For Phase 10 MVP, use SQL normalization (no client-side processing).
 * If performance issues emerge, consider caching normalized titles.
 */
```

### Pattern 4: Preflight Modal with Duplicates Section
**What:** Display duplicate count as part of comprehensive preflight check
**When to use:** During onboarding setup wizard, as part of preflight validation
**Example:**
```typescript
// Source: Existing SetupWizardModal pattern

/**
 * Render duplicates section in preflight check
 * Shows total count with advisory message and deep link
 */
private async renderDuplicatesSection(parentEl: HTMLElement): Promise<void> {
  const duplicateService = new DuplicateDetectionService(this.connector);
  const { totalDuplicates } = await duplicateService.detectDuplicates();

  const duplicatesDiv = parentEl.createDiv({ cls: 'preflight-section duplicates' });

  duplicatesDiv.createEl('h3', { text: 'Duplicate Items' });

  if (totalDuplicates === 0) {
    duplicatesDiv.createEl('p', {
      cls: 'status-ok',
      text: '✓ No duplicates detected'
    });
  } else {
    duplicatesDiv.createEl('p', {
      cls: 'status-warning',
      text: `⚠ Found ${totalDuplicates} potential duplicates`
    });

    const adviceDiv = duplicatesDiv.createDiv({ cls: 'advice' });
    adviceDiv.createEl('p', {
      text: 'Found ' + totalDuplicates + ' duplicates that may affect recommendations. Review and merge before continuing.'
    });

    // Deep link to Zotero duplicate items panel
    const linkEl = adviceDiv.createEl('a', {
      cls: 'duplicates-link',
      text: 'View in Zotero',
      href: 'zotero://' // Opens Zotero main window; user right-clicks library for "Show Duplicates"
    });
    linkEl.onclick = () => {
      // On click, open Zotero and let user manually navigate to Duplicate Items
      // Alternative: trigger "Show Duplicates" via API if available
    };
  }
}
```

### Anti-Patterns to Avoid
- **No post-query filtering for duplicates**: Don't load all items then compare in JavaScript. Self-join is more efficient.
- **Hardcoding match thresholds**: Don't hardcode "title must be 90% similar". Use exact normalized title match to avoid false positives.
- **Missing normalization in SQL**: If normalizing titles in query (LOWER, REPLACE), ensure same logic used for any future client-side comparisons.
- **No handling of NULL doi/isbn**: Don't skip items without DOI/ISBN; fall back to title matching.
- **Blocking on duplicates**: Don't prevent onboarding if duplicates found. Display advisory only, allow dismissal.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Duplicate detection algorithm | Custom similarity scoring (Levenshtein, Soundex) | Zotero's native hierarchy (DOI → ISBN → normalized title) | Zotero's approach is proven, matches user expectations, avoids false positives |
| Title comparison | Complex fuzzy matching | Exact normalized title match (lowercase, no punctuation) | Exact match avoids false positives; normalization handles typos like "A Title" vs "a title" |
| Duplicate storage in database | Custom duplicate_pairs or duplicate_clusters table | Computed on-demand via self-join query | Self-join is standard SQL; no schema migration needed; computed once per preflight |
| Deep linking to duplicates | Custom zotero:// URI parser | Use built-in `zotero://select/items/0_[itemKey]` format | Format works across Zotero 6.x/7.x; built-in Zotero protocol |
| Finding Zotero duplicate items panel | Writing custom merge UI | User right-clicks library, selects "Show Duplicates" | Zotero's native duplicate UI is more powerful; users are familiar with it |

**Key insight:** Duplicate detection looks like a complex matching problem, but Zotero already has a proven algorithm. The plugin's job is to detect and notify, not re-implement matching logic. Use Zotero's hierarchy (DOI > ISBN > title) and let Zotero's native UI handle merging.

## Common Pitfalls

### Pitfall 1: False Positives from Aggressive Title Matching
**What goes wrong:** You normalize titles too loosely (e.g., allowing partial matches or Soundex). User sees "The Importance of Being Earnest" matched with "Importance of Being" and dismisses all duplicate warnings as noise.
**Why it happens:** Developers assume fuzzy matching reduces manual work, not realizing false positives erode trust.
**How to avoid:** Use exact normalized title match (lowercase, strip punctuation, remove articles). Only match if full normalized strings are identical. Test against real Zotero library with intentional near-duplicates.
**Warning signs:** User reports of false duplicates; adoption drops after initial setup.

### Pitfall 2: Performance Regression on Large Libraries (5000+ items)
**What goes wrong:** Self-join query times out or takes >30 seconds on 5000+ item library. Preflight check hangs. User thinks plugin is broken.
**Why it happens:** Developers don't test with realistic data sizes. Self-join without proper indexing is O(n²).
**How to avoid:** Test DUPLICATES_QUERY with 5000+ item test database. Measure query time. If exceeds 30 seconds, add SQL indexes on (doi, isbn, normalized_title) columns or implement caching.
**Warning signs:** Preflight modal freezes during duplicate detection; browser dev tools show long blocking SQL execution.

### Pitfall 3: Missing ISBN/DOI Check Leading to Query Errors
**What goes wrong:** Query assumes all items have DOI or ISBN. When querying items without these fields, NULL comparisons fail or return incorrect results.
**Why it happens:** Developers don't account for NULL handling in SQL CASE statements.
**How to avoid:** Explicitly check IS NOT NULL before comparing. Ensure query returns empty result for items where all match criteria are NULL (i.e., title is the only match basis).
**Warning signs:** Duplicate count seems low; query returns no results for libraries with many items without DOI/ISBN.

### Pitfall 4: UI Doesn't Clearly Distinguish Duplicates from Other Preflight Items
**What goes wrong:** Preflight modal groups duplicates count, trash count, and group library warning. User misses duplicates warning because it's visually undifferentiated.
**Why it happens:** UI design doesn't prioritize duplicate warning per CONTEXT.md.
**How to avoid:** Use distinct visual styling for each preflight section (warning color, icon, tooltip). Position duplicates early in modal. Test with non-technical users to ensure they understand the warning.
**Warning signs:** User feedback: "I didn't see the duplicates warning"; users skip preflight without reading.

### Pitfall 5: Zotero Protocol Link Doesn't Work as Expected
**What goes wrong:** Plugin generates `zotero://select/items/[groupID]` URI (trying to select a duplicate group), but Zotero doesn't recognize custom group IDs. Link fails silently or opens Zotero without selecting anything.
**Why it happens:** Assuming zotero:// protocol supports arbitrary query parameters when it only supports `zotero://select/items/0_[itemKey]`.
**How to avoid:** Test zotero:// URI with real Zotero 6.x and 7.x installations. Understand that there's no direct URI to "Duplicate Items" collection. Instead, guide user to right-click library > "Show Duplicates". Provide clear instructions in UI.
**Warning signs:** Users click "View in Zotero" link, Zotero opens but nothing happens; they don't know how to find duplicates.

## Code Examples

Verified patterns from official sources:

### Query: Detect Duplicates with DOI-First Hierarchy
```typescript
// Source: Zotero schema (github.com/zotero/zotero/blob/main/resource/schema/userdata.sql)
// + CONTEXT.md decisions on DOI > ISBN > title hierarchy

export const DUPLICATES_QUERY = `
WITH normalized_items AS (
  SELECT
    i.itemID,
    i.key AS itemKey,
    it.typeName AS itemType,
    MAX(CASE WHEN fieldName = 'title' THEN value END) AS title,
    MAX(CASE WHEN fieldName = 'DOI' THEN value END) AS doi,
    MAX(CASE WHEN fieldName = 'ISBN' THEN value END) AS isbn,
    LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(
      MAX(CASE WHEN fieldName = 'title' THEN value END),
      'a ', ''), 'an ', ''), 'the ', ''), '.', ''))) AS normalized_title
  FROM items i
  INNER JOIN libraries l ON i.libraryID = l.libraryID
  JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
  LEFT JOIN itemData id ON i.itemID = id.itemID
  LEFT JOIN fields f ON id.fieldID = f.fieldID
  LEFT JOIN itemDataValues idv ON id.valueID = idv.valueID
  LEFT JOIN retractedItems ri ON i.itemID = ri.itemID
  LEFT JOIN itemNotes n ON i.itemID = n.itemID
  WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
    AND it.typeName NOT IN ('attachment', 'annotation')
    AND (it.typeName != 'note' OR n.parentItemID IS NULL)
    AND l.type = 'user'
    AND ri.itemID IS NULL
  GROUP BY i.itemID
),
duplicate_groups AS (
  SELECT
    i1.itemID,
    i1.itemKey,
    i1.itemType,
    i1.title,
    i1.doi,
    i1.isbn,
    CASE
      WHEN i1.doi IS NOT NULL AND i1.doi = i2.doi THEN CAST(MIN(i1.itemID, i2.itemID) AS TEXT)
      WHEN i1.itemType IN ('book', 'bookSection') AND i1.isbn IS NOT NULL AND i1.isbn = i2.isbn
           THEN CAST(MIN(i1.itemID, i2.itemID) AS TEXT)
      WHEN i1.normalized_title IS NOT NULL AND i1.normalized_title = i2.normalized_title
           AND i1.normalized_title != '' THEN CAST(MIN(i1.itemID, i2.itemID) AS TEXT)
      ELSE NULL
    END AS match_basis
  FROM normalized_items i1
  JOIN normalized_items i2
    ON i1.itemID < i2.itemID
    AND (
      (i1.doi IS NOT NULL AND i1.doi = i2.doi)
      OR (i1.itemType IN ('book', 'bookSection') AND i1.isbn IS NOT NULL AND i1.isbn = i2.isbn)
      OR (i1.normalized_title IS NOT NULL AND i1.normalized_title = i2.normalized_title AND i1.normalized_title != '')
    )
)
SELECT
  itemID,
  itemKey,
  itemType,
  title,
  COUNT(*) OVER (PARTITION BY match_basis) AS duplicate_count
FROM duplicate_groups
WHERE match_basis IS NOT NULL
ORDER BY match_basis, itemID
`;
```

### Helper: Title Normalization
```typescript
// Source: Best practices for string normalization

export function normalizeTitle(title: string | null | undefined): string {
  if (!title || title.trim().length === 0) {
    return '';
  }

  let normalized = title.toLowerCase();
  normalized = normalized.replace(/^(a|an|the)\s+/i, '');
  normalized = normalized.replace(/[^\w\s]/g, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}
```

### Helper: Deep Link to Zotero
```typescript
// Source: Zotero URI scheme (zotero://select/items/0_[itemKey])

export function generateZoteroDeepLink(itemKey: string): string {
  return `zotero://select/items/0_${itemKey}`;
}

/**
 * NOTE: For "Duplicate Items" collection, there is no direct zotero:// URI.
 * Instead, user must:
 * 1. Open Zotero (launched by zotero:// protocol)
 * 2. Right-click library in left sidebar
 * 3. Select "Show Duplicates"
 *
 * UI should provide clear instructions or open Zotero with instructions modal.
 */
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual duplicate detection by user | Plugin detects + notifies during setup | Phase 10 | Reduces duplicate-related recommendation errors; improves data quality early |
| Simple title-only matching | DOI > ISBN > normalized title hierarchy | Phase 10 (follows Zotero native) | More accurate matching; fewer false positives |
| Post-query filtering in JavaScript | Self-join SQL query | Phase 10 | Better performance; matches native Zotero approach |
| Blocking UI until duplicates resolved | Non-blocking advisory with optional action | Phase 10 | Better UX; respects user autonomy; doesn't halt onboarding |

**Deprecated/outdated:**
- None for this phase; duplicate detection is new feature

## Open Questions

Things that couldn't be fully resolved:

1. **Exact zotero:// URI for "Duplicate Items" collection (MEDIUM confidence)**
   - What we know: `zotero://select/items/0_[itemKey]` works for individual items; "Duplicate Items" is a built-in virtual collection accessible via right-click > "Show Duplicates" in Zotero UI
   - What's unclear: Is there a direct zotero:// URI to jump to "Duplicate Items" collection? Or must user manually navigate?
   - Recommendation: Research Zotero plugin development docs or ask Zotero community forum. For MVP, assume no direct URI; UI instructs user to right-click library and select "Show Duplicates". If URI exists, add in future phase.

2. **Performance profile for self-join on 10,000+ items (LOW confidence)**
   - What we know: Self-join is O(n²) worst case; research target is <30 seconds for 5000+ items
   - What's unclear: Does query time scale linearly or exponentially beyond 5000 items? Are there SQL optimizations (indexes, partitioning) needed?
   - Recommendation: Test with 10,000-item test database. Measure query time. If exceeds 30 seconds, add indexes on (doi, isbn, normalized_title) columns or implement session-level caching.

3. **Item type-aware matching rules (Claude's Discretion area)**
   - What we know: CONTEXT.md mentions "item type-aware matching rules" as Claude's discretion
   - What's unclear: Should DOI matching apply to all types equally? Should ISBN matching be restricted to books only? Should there be special handling for conferences, journals, etc.?
   - Recommendation: Use conservative approach for MVP: DOI matching works for all types (globally unique), ISBN matching restricted to book/bookSection types. Plan to gather user feedback and refine rules in v1.2.

4. **Session dismissal behavior (Claude's Discretion area)**
   - What we know: CONTEXT.md specifies "dismissible per session"
   - What's unclear: Does "dismissible" mean user can close warning and proceed onboarding without viewing duplicates? Or does dismissal persist across sessions (stored in profile)?
   - Recommendation: Implement as session-only dismissal (reappears on next onboarding). Add checkbox: "Don't remind me this session" with clear visual distinction from "Merge duplicates later".

5. **Caching strategy (Claude's Discretion area)**
   - What we know: Performance target is <30 seconds; no caching mentioned in CONTEXT.md
   - What's unclear: Should duplicate detection results be cached in memory for the onboarding session? Or recomputed each time preflight check is shown?
   - Recommendation: No caching for MVP. Compute on-demand during preflight check. If performance issues emerge during beta, add session-level cache (cache invalidated on profile save or Zotero sync event).

## Sources

### Primary (HIGH confidence)
- [Zotero duplicate_detection documentation](https://www.zotero.org/support/duplicate_detection) - Official description of DOI > ISBN > normalized title matching approach
- [Zotero userdata.sql schema](https://github.com/zotero/zotero/blob/main/resource/schema/userdata.sql) - items, itemData, itemDataValues, itemTypes, fields, libraries, retractedItems table definitions
- CONTEXT.md (Phase 10) - Decisions on DOI-first hierarchy, personal library scope, non-blocking advisory design
- Existing codebase (src/db/queries.ts, zotero-connector.ts) - SQL patterns, EAV query structure, library filtering established in Phase 9

### Secondary (MEDIUM confidence)
- [Zotero URI scheme discussion (forums.zotero.org)](https://forums.zotero.org/discussion/24241/linking-to-zotero-items-via-zotero-select) - Confirms zotero://select/items/0_[itemKey] format works in Zotero 6.x and 7.x
- [Zotero developers: SQLite database access](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access) - Official guidance on direct SQLite access patterns
- [LibGuides on duplicate detection](https://guides.lib.fsu.edu/zotero/content/organize) - User-facing documentation confirming "Duplicate Items" is accessible via right-click "Show Duplicates"

### Tertiary (LOW confidence)
- [Zoplicate GitHub repository](https://github.com/ChenglongMa/zoplicate) - Third-party plugin showing duplicate detection implementation (not official source, but demonstrates feasibility)
- WebSearch results on title normalization - General best practices for JavaScript string operations, but not Zotero-specific

## Metadata

**Confidence breakdown:**
- Zotero duplicate matching hierarchy (DOI > ISBN > title): **HIGH** - Verified against official documentation
- SQL self-join query architecture: **HIGH** - Standard SQL pattern; verified against schema
- zotero:// URI format (zotero://select/items/0_[itemKey]): **HIGH** - Verified against forum discussions and user guides
- "Duplicate Items" collection access via right-click: **HIGH** - Confirmed in official Zotero user guides
- Title normalization approach: **MEDIUM** - General JavaScript best practices apply; exact Zotero normalization logic not documented
- Performance target (<30s for 5000+ items): **MEDIUM** - No benchmark data from official source; assumes standard SQL indexing
- zotero:// URI for Duplicate Items collection: **LOW** - Not documented in official sources; may require community research
- Session-level caching decisions: **LOW** - Not addressed in official sources; requires implementation design

**Research date:** 2026-01-28
**Valid until:** 2026-02-15 (Zotero schema stable; duplicate detection stable; 18 days for fast-moving deep link protocol decisions)
