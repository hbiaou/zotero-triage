# Phase 6: Tag Infrastructure & Extraction - Research

**Researched:** 2026-01-25
**Domain:** SQLite tag extraction, schema integration, backward compatibility
**Confidence:** HIGH

## Summary

Phase 6 integrates tag extraction from Zotero's SQLite database into the plugin's data layer and establishes defensive NULL handling for schema variations. Research validates that tag extraction is partially implemented (ITEM_TAGS_QUERY exists in codebase), but the integration needs three key enhancements:

1. **Defensive NULL handling**: Current `ZoteroItem.tags` type assumes tags always populate; must handle schema variations where LEFT JOIN returns NULL
2. **Annotation tag filtering**: Zotero 7 auto-generates annotation tags (custom-color-*, highlight-*) that pollute user tags; must filter these
3. **Backward compatibility**: Existing v1.0 profiles without tags field must auto-migrate on first load with re-extraction

Key finding: Tag extraction success depends entirely on proper NULL handling—silent failures where tags remain empty despite being in database are more dangerous than complete extraction failure. The CONTEXT.md decisions provide clear constraints; this research focuses on implementation risks and verification patterns.

**Primary recommendation:** Implement defensive NULL handling with explicit validation, filter annotation tags in SQL query, auto-migrate v1.0 profiles on load, and test with real Zotero 7 libraries (which have annotation tags).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sql.js | 1.13.0+ | SQLite WASM; tag query execution | Already integrated in Phase 1; avoids native module issues |
| ZoteroConnector | (codebase) | Existing connector with ITEM_TAGS_QUERY | Already implements basic tag extraction; extend with NULL handling |
| ZoteroItem | (codebase) | Interface for item data | Must add tags field with proper typing (array of tag objects, optional) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sqlite_master | (SQL built-in) | Verify table existence | Check itemTags/tags tables exist before tag extraction |
| (none) | N/A | Tag type validation | Inherit from Zotero schema (type 0=user, type 1=auto) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Filter annotation tags in SQL | Filter in code post-query | SQL is cleaner, filters early, reduces memory |
| Store tags as string[] | Store as {name: string, type?: number}[] | Objects preserve type info for Phase 7; simpler array for now |
| Require tags field | Optional tags field | Optional is safer (backward compat); Phase 7 can require |
| Check sqlite_master first | Try/catch on query fail | Try/catch is simpler; explicit check is more robust |

**Installation:**
```bash
# No new packages required
# Extensions to existing pattern only
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   ├── zotero-connector.ts        # (extend with getItemTags, validation)
│   ├── queries.ts                 # (update ITEM_TAGS_QUERY with filters)
│   └── schema.ts                  # (add tag schema validation)
├── data/
│   └── zotero-item.ts             # (add tags field to interface)
└── utils/
    └── tag-validator.ts           # (new: tag NULL handling, filtering)
```

### Pattern 1: Defensive Tag Extraction with NULL Handling
**What:** Safely extract tags from itemTags table, handling schema variations where tags are NULL
**When to use:** Loading items from database; initialization; backward compatibility migration
**Example:**
```typescript
// Source: CONTEXT.md decisions + v1.1 research patterns

/**
 * Extract tags for an item with defensive NULL handling.
 * Filters out Zotero 7 auto-generated annotation tags.
 * Returns empty array if no tags (not an error condition).
 *
 * @param itemID - Database item ID
 * @returns Array of tag names (user-created only)
 */
async getItemTags(itemID: number): Promise<string[]> {
  try {
    const tagsResult = this.db!.exec(ITEM_TAGS_QUERY, [itemID]);
    const tags: string[] = [];

    // Defensive: verify result structure exists
    if (!tagsResult || tagsResult.length === 0) {
      return []; // No tags found (valid state)
    }

    // Defensive: verify values array
    if (!tagsResult[0].values || tagsResult[0].values.length === 0) {
      return []; // Empty result set (valid state)
    }

    // Process each tag row
    for (const tagRow of tagsResult[0].values) {
      // Defensive: verify row is array-like
      if (!Array.isArray(tagRow) || tagRow.length === 0) {
        console.warn(`Malformed tag row for item ${itemID}, skipping`);
        continue;
      }

      // Defensive: verify tagName is not NULL
      const tagName = tagRow[0];
      if (tagName === null || tagName === undefined) {
        console.debug(`NULL tag found for item ${itemID}, skipping`);
        continue;
      }

      if (typeof tagName !== 'string') {
        console.warn(`Non-string tag value for item ${itemID}: ${typeof tagName}`);
        continue;
      }

      // Normalize: trim whitespace
      const normalized = tagName.trim();
      if (normalized.length === 0) {
        continue; // Skip empty strings
      }

      tags.push(normalized);
    }

    return tags;
  } catch (err) {
    console.error(`Failed to extract tags for item ${itemID}:`, err);
    return []; // Graceful degradation on error
  }
}

/**
 * Validate tag schema integrity in database.
 * Called on first load to detect schema issues.
 */
async validateTagSchema(): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  try {
    // Check if itemTags table exists
    const tableExists = this.db!.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='itemTags'`
    );
    if (tableExists.length === 0) {
      issues.push('itemTags table not found');
      return { valid: false, issues };
    }

    // Check if tags table exists
    const tagsTableExists = this.db!.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='tags'`
    );
    if (tagsTableExists.length === 0) {
      issues.push('tags table not found');
      return { valid: false, issues };
    }

    // Check for orphaned itemTags (itemID not in items table)
    const orphaned = this.db!.exec(
      `SELECT COUNT(*) as count FROM itemTags it
       WHERE it.itemID NOT IN (SELECT itemID FROM items)`
    );
    if ((orphaned[0]?.values[0]?.[0] as number) > 0) {
      issues.push(`Found ${orphaned[0].values[0][0]} orphaned itemTags entries`);
    }

    return {
      valid: issues.length === 0,
      issues
    };
  } catch (err) {
    console.warn('Could not validate tag schema:', err);
    return {
      valid: false,
      issues: [`Schema validation failed: ${err instanceof Error ? err.message : String(err)}`]
    };
  }
}
```

### Pattern 2: Annotation Tag Filtering
**What:** Exclude Zotero 7 auto-generated annotation tags from user-facing tag arrays
**When to use:** During tag extraction; SQL query level is preferred for efficiency
**Example:**
```typescript
// Source: CONTEXT.md decisions + v1.1 implementation patterns

/**
 * Updated ITEM_TAGS_QUERY with annotation tag filtering.
 * Excludes Zotero 7 auto-generated tags:
 * - custom-color-* (highlight colors in PDF annotations)
 * - highlight-* (emphasis markers)
 * - annotation-* (reserved annotation prefix)
 * - _* (Zotero internal tags)
 */
export const ITEM_TAGS_QUERY = `
SELECT t.name
FROM itemTags it
JOIN tags t ON it.tagID = t.tagID
WHERE it.itemID = ?
  AND t.name NOT LIKE 'custom-color-%'
  AND t.name NOT LIKE 'highlight-%'
  AND t.name NOT LIKE 'annotation-%'
  AND t.name NOT LIKE '\_%' ESCAPE '\'
ORDER BY t.name
`;

/**
 * Tag filtering utility for post-query validation.
 * Provides failsafe filtering if SQL query misses edge cases.
 */
export function isAnnotationTag(tagName: string): boolean {
  if (!tagName || typeof tagName !== 'string') return false;

  const patterns = [
    /^custom-color-/i,    // Highlight colors: custom-color-1, custom-color-red
    /^highlight-/i,       // Emphasis: highlight-yellow, highlight-bold
    /^annotation-/i,      // Reserved: annotation-type, annotation-color
    /^_/i                 // Internal: _note, _system
  ];

  return patterns.some(pattern => pattern.test(tagName));
}

/**
 * Filter annotation tags from array.
 * Used as safeguard in code if SQL filtering fails.
 */
export function filterAnnotationTags(tags: string[]): string[] {
  return tags.filter(tag => !isAnnotationTag(tag));
}
```

### Pattern 3: Schema-Aware Tag Extraction
**What:** Detect schema version and apply version-specific extraction logic
**When to use:** Supporting multiple Zotero versions (currently Zotero 7+ only per CONTEXT.md)
**Example:**
```typescript
// Source: v1.0 schema detection pattern extended for tags

/**
 * Get tags with schema-version awareness.
 * Zotero 7 (schema >= 150) supports itemTags; earlier versions may not.
 */
async getItemTagsSafely(itemID: number, schemaVersion: number): Promise<string[]> {
  // Only support Zotero 7+ (schema 150+)
  if (schemaVersion < 150) {
    console.debug(`Schema version ${schemaVersion} may not support itemTags; skipping tag extraction`);
    return [];
  }

  // For Zotero 7+, proceed with extraction
  return await this.getItemTags(itemID);
}
```

### Pattern 4: Backward Compatibility Migration
**What:** Auto-migrate v1.0 profiles without tags on first v1.1 load
**When to use:** Profile initialization; first time profile is loaded after v1.1 upgrade
**Example:**
```typescript
// Source: CONTEXT.md decision "seamless upgrade"

/**
 * Check if profile needs tag migration.
 * v1.0 profiles don't have tags; v1.1 should re-extract on first load.
 */
function needsTagMigration(profile: Profile): boolean {
  // Profile exists (v1.0 or later)
  // But tags field is missing or empty
  return !('tags' in profile) || (Array.isArray(profile.tags) && profile.tags.length === 0);
}

/**
 * Migrate v1.0 profile to v1.1 with tag extraction.
 * Re-loads seed papers with tag extraction.
 */
async migrateProfile(profile: Profile, connector: ZoteroConnector): Promise<Profile> {
  if (!needsTagMigration(profile)) {
    return profile; // Already has tags
  }

  // Re-load seed papers with tag extraction
  const updatedItems: ZoteroItem[] = [];
  for (const seedItemID of profile.seedItemIDs) {
    const item = await connector.getItem(seedItemID);
    if (item) {
      updatedItems.push(item);
    }
  }

  // Extract tags from seed papers
  const seedTags = new Set<string>();
  for (const item of updatedItems) {
    item.tags.forEach(tag => seedTags.add(tag));
  }

  // Update profile with extracted tags
  return {
    ...profile,
    tags: Array.from(seedTags),
    lastUpdated: new Date().toISOString(),
    migrationVersion: '1.1' // Mark profile as migrated
  };
}
```

### Anti-Patterns to Avoid
- **Don't assume tags always populate:** Always check for NULL/empty results; items without tags are valid
- **Don't include annotation tags in user-facing arrays:** Filter at SQL level; post-query validation is fallback only
- **Don't treat tag extraction failure as critical:** Log and continue; tag extraction is enhancement, not core
- **Don't skip schema validation:** Check sqlite_master for table existence before querying
- **Don't migrate profiles silently:** Log migration events; users should know tags are being re-extracted

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tag NULL handling | Custom wrapper | Defensive null checks + validation | Prevents silent failures; explicit is better than implicit |
| Annotation tag filtering | Custom regex | SQL LIKE patterns in query | More efficient; filters early; cleaner separation |
| Tag schema validation | Ad-hoc checks | validateTagSchema() with itemTags/tags checks | Comprehensive; catches schema issues early |
| Tag type inference | Guess from name | Preserve type field from Zotero schema | Phase 7 may use type (0=user, 1=auto) for filtering |
| Profile migration | Manual re-extraction | migrateProfile() called on first v1.1 load | Seamless upgrade; users don't think about tags |

**Key insight:** Tag extraction looks simple ("just query itemTags table") but schema variations make it error-prone. NULL results silently break downstream recommendation scoring because code assumes tags exist. The defensive pattern (check every step) prevents this class of bug.

## Common Pitfalls

### Pitfall 1: NULL/Empty Tag Results Break Recommendation Scoring Silently
**What goes wrong:** Tag extraction returns empty arrays for items that have tags in database; recommendation scoring silently degrades without warning
**Why it happens:**
- Current ZoteroItem interface assumes tags always populate (no NULL check)
- LEFT JOIN in ITEM_TAGS_QUERY can return NULL values if schema varies
- Phase 7 recommendation engine relies on tags; empty tags = fallback to recency-only sorting
- Error is silent: "recommendations seem based only on recency" with no diagnostic

**How to avoid:**
1. Always check query result structure before accessing values
2. Handle NULL tag values explicitly (don't coerce to string)
3. Log when items have no tags (normal) vs. when extraction fails (error)
4. Test with real Zotero 7 libraries that have tags; mock data hides problems
5. In Phase 7, detect when tags are empty and log diagnostic message

**Warning signs:**
- Recommendation engine produces same results regardless of tags
- Users report "tags aren't being used" even though they tagged items
- Test data works, production data fails
- NULL values appear in debug logs

### Pitfall 2: Annotation Tags Pollute User Tag Arrays
**What goes wrong:** Zotero 7 auto-generated annotation tags (custom-color-*, highlight-*) appear in user-facing tag arrays, confusing users who didn't create them
**Why it happens:**
- v1.0 doesn't extract tags; v1.1 is first to extract
- ITEM_TAGS_QUERY returns all tags without filtering
- Zotero 7 stores annotation tags in same itemTags table as user tags
- No filtering logic implemented

**How to avoid:**
1. Filter annotation tags in SQL query (LIKE 'custom-color-%' NOT LIKE)
2. Post-query validation using isAnnotationTag() as safeguard
3. Test with Zotero 7 database containing highlight annotations
4. Document which tag patterns are excluded (in code comments)
5. Consider settings option to include/exclude annotation tags if needed

**Warning signs:**
- Tag arrays contain "custom-color-1", "highlight-yellow" (not user-created)
- Profile editor shows annotation tags mixed with real tags
- Recommendation scoring seems off with certain items
- User asks "where did these tags come from?"

### Pitfall 3: Schema Validation Not Checked Before Tag Extraction
**What goes wrong:** Plugin attempts tag extraction on database where itemTags/tags tables don't exist or are malformed; crashes or returns nothing
**Why it happens:**
- Zotero schema can vary between versions
- itemTags table may be missing in very old or corrupted databases
- No explicit table existence check before querying
- Query failure is treated as "no tags found" rather than "schema issue"

**How to avoid:**
1. Call validateTagSchema() on first database connection
2. Check sqlite_master for table existence before querying
3. Catch query failures and log as schema issue (not "no tags")
4. Document minimum Zotero version (7.0+ per CONTEXT.md)
5. Test with corrupted/incomplete databases

**Warning signs:**
- Query returns no results despite tags existing
- Error logs show "table not found"
- Plugin works with some Zotero databases but not others
- Schema validation returns issues list

### Pitfall 4: Backward Compatibility Broken for v1.0 Profiles
**What goes wrong:** Existing v1.0 profiles load without tags; v1.1 features that depend on tags fail silently
**Why it happens:**
- v1.0 profiles stored seed items but not extracted tags
- v1.1 adds tags field to ZoteroItem interface
- No migration logic to re-extract tags for existing profiles
- New code assumes tags exist (not backwards compatible)

**How to avoid:**
1. Implement needsTagMigration() check on profile load
2. Auto-call migrateProfile() for v1.0 profiles on first v1.1 load
3. Re-extract tags from seed papers during migration
4. Update profile lastUpdated and mark with migrationVersion
5. Log migration events so users see tags were re-extracted

**Warning signs:**
- Existing profiles have empty tags array
- v1.1 features skip items without tags
- User upgrades to v1.1, tags seem to disappear
- Profile metadata shows it's v1.0 (no migrationVersion)

## Code Examples

### Complete Tag Extraction Flow
```typescript
// Source: Defensive pattern + Zotero connector integration

/**
 * Load items with complete tag extraction, validation, and error handling.
 * Extends existing loadItems() to include tag safety checks.
 */
async loadItems(onProgress?: LoadProgressCallback): Promise<ZoteroItem[]> {
  return await retryWithBackoff(async () => {
    if (!this.db || !this.dbPath) {
      throw new Error('Database not connected. Call connect() first.');
    }

    // Validate schema before loading
    const schemaCheck = await this.validateTagSchema();
    if (!schemaCheck.valid) {
      console.warn('Tag schema validation issues:', schemaCheck.issues);
      // Continue anyway; tags are optional enhancement
    }

    // Get total count for progress reporting
    const countResult = this.db.exec(ITEM_COUNT_QUERY);
    const totalItems = countResult[0]?.values[0]?.[0] as number || 0;

    if (onProgress) {
      onProgress(0, totalItems);
    }

    // Execute main items query
    const itemsResult = this.db.exec(ITEMS_QUERY);
    if (itemsResult.length === 0) {
      this.items = [];
      this.isLoaded = true;
      return this.items;
    }

    const columns = itemsResult[0].columns;
    const rows = itemsResult[0].values;
    const colIndex = {
      itemID: columns.indexOf('itemID'),
      itemKey: columns.indexOf('itemKey'),
      dateAdded: columns.indexOf('dateAdded'),
      dateModified: columns.indexOf('dateModified'),
      itemType: columns.indexOf('itemType'),
      title: columns.indexOf('title'),
      doi: columns.indexOf('doi'),
      date: columns.indexOf('date'),
      journal: columns.indexOf('journal'),
      volume: columns.indexOf('volume'),
      issue: columns.indexOf('issue'),
      pages: columns.indexOf('pages'),
      abstract: columns.indexOf('abstract'),
      publisher: columns.indexOf('publisher'),
      isbn: columns.indexOf('isbn')
    };

    const dataDir = getZoteroDataDir(this.dbPath);
    const items: ZoteroItem[] = [];
    let loadedCount = 0;

    // Process items with tag extraction
    await processInChunks(
      rows,
      async (row) => {
        const itemID = row[colIndex.itemID] as number;
        const itemKey = row[colIndex.itemKey] as string;

        // Get tags with defensive NULL handling
        const tags = await this.getItemTags(itemID);

        const item: ZoteroItem = {
          itemID,
          itemKey,
          title: (row[colIndex.title] as string) || 'Untitled',
          authors: [], // (creators extraction omitted for brevity)
          year: parseYear(row[colIndex.date] as string | null),
          doi: row[colIndex.doi] as string | null,
          journal: row[colIndex.journal] as string | null,
          volume: row[colIndex.volume] as string | null,
          issue: row[colIndex.issue] as string | null,
          pages: row[colIndex.pages] as string | null,
          abstract: row[colIndex.abstract] as string | null,
          publisher: row[colIndex.publisher] as string | null,
          isbn: row[colIndex.isbn] as string | null,
          pdfPath: null, // (attachment extraction omitted)
          itemType: row[colIndex.itemType] as string,
          tags: tags, // Now includes defensive tag extraction
          collections: [], // (collection extraction omitted)
          dateAdded: row[colIndex.dateAdded] as string,
          dateModified: row[colIndex.dateModified] as string
        };

        items.push(item);
        loadedCount++;

        if (onProgress) {
          onProgress(loadedCount, totalItems);
        }
      },
      50
    );

    this.items = items;
    this.isLoaded = true;
    return this.items;
  }, {
    maxAttempts: 5,
    initialDelayMs: 100
  });
}
```

### Tag Field Update to ZoteroItem Interface
```typescript
// Source: CONTEXT.md data structure decision

/**
 * Updated ZoteroItem interface with tags field.
 * Tags are optional (many items won't have tags).
 * Contains user-created tags only (annotation tags filtered).
 */
export interface ZoteroItem {
  /** Unique item ID in database */
  itemID: number;
  /** Zotero item key (8-char identifier) */
  itemKey: string;
  /** Item title */
  title: string;
  /** List of authors (formatted strings) */
  authors: string[];
  /** Publication year (4-digit string) */
  year: string;
  /** DOI identifier (if available) */
  doi: string | null;
  /** Journal/publication name */
  journal: string | null;
  /** Volume number */
  volume: string | null;
  /** Issue number */
  issue: string | null;
  /** Page range */
  pages: string | null;
  /** Abstract text */
  abstract: string | null;
  /** Publisher name (for books, reports, etc.) */
  publisher: string | null;
  /** ISBN identifier (for books) */
  isbn: string | null;
  /** Full path to attached PDF (if available) */
  pdfPath: string | null;
  /** Item type (journalArticle, book, etc.) */
  itemType: string;
  /** User-created tags (Zotero 7+ annotation tags filtered) */
  tags: string[];
  /** Collections item belongs to */
  collections: string[];
  /** Date added to Zotero */
  dateAdded: string;
  /** Date last modified */
  dateModified: string;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No tag extraction | Extract tags from itemTags table | v1.1+ | Enables tag-based recommendations |
| Assume tags exist | Defensive NULL handling | v1.1+ | Prevents silent failures from schema variations |
| Include annotation tags | Filter out auto-generated tags | v1.1+ | Cleaner user experience; accurate tag data |
| Manual profile migration | Auto-migrate on first v1.1 load | v1.1+ | Seamless upgrade; users don't see data loss |
| No schema validation | Check itemTags/tags tables exist | v1.1+ | Catches schema issues early |

**Deprecated/outdated:**
- Assuming all database schemas are identical across Zotero versions: Schema variations exist; validate
- Treating tag extraction failure as fatal: Tags are enhancement, not core; graceful degradation required
- Including all tags without filtering: Zotero 7 annotation tags require filtering

## Open Questions

1. **What tag patterns does Zotero 7 actually use for annotations?**
   - What we know: custom-color-*, highlight-* patterns documented in v1.1 research
   - What's unclear: Are there other annotation tag prefixes we haven't discovered?
   - Recommendation: Test with real Zotero 7 databases; log any tag patterns starting with underscore or custom-*

2. **Should tags be required field or optional in ZoteroItem schema?**
   - What we know: CONTEXT.md marks this as Claude's discretion
   - What's unclear: Phase 7 will tags be required for recommendation scoring?
   - Recommendation: Make tags optional now; Phase 7 can require them if needed

3. **How should profile.tags be structured for Phase 7?**
   - What we know: CONTEXT.md suggests Map<string, number> frequency or top N array
   - What's unclear: Should we store tag frequency now or wait for Phase 7 to compute?
   - Recommendation: Extract and store tags as-is in v1.1; Phase 7 computes frequency

4. **Will Zotero 6.x users upgrading to 7.x see annotation tags retroactively?**
   - What we know: Annotation tags are new in Zotero 7
   - What's unclear: When user upgrades, do old items get annotation tags?
   - Recommendation: CONTEXT.md targets Zotero 7 only; assume annotation tags appear on new annotations

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/db/zotero-connector.ts`, `src/db/queries.ts` - Current tag extraction implementation
- CONTEXT.md Phase 6 decisions - Locked decisions on extraction strategy, filtering, compatibility
- v1.1 Research: `PITFALLS_V1_1.md`, `V1_1_IMPLEMENTATION_PATTERNS.md`, `V1_1_RESEARCH_SUMMARY.md` - Comprehensive pitfall analysis and code patterns
- [Zotero SQLite Database Access](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access) - Official documentation on read-only access

### Secondary (MEDIUM confidence)
- [Zotero Forums: Finding tags in SQLite](https://forums.zotero.org/discussion/62962/finding-the-tags-of-an-item-in-zotero-sqlite) - Community patterns for tag queries
- [Zotero Forums: Annotation Tags in SQLite](https://forums.zotero.org/discussion/100496/annotation-tags-in-zotero-sqlite-database) - User discussion of annotation tag storage (unresolved)
- [Exploring Zotero Data Model](https://gist.github.com/pchemguy/19fa69fb4e74ef0cca0026aa0dbf5f42) - Reverse-engineered schema documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Tag extraction already implemented; extensions are straightforward
- Architecture patterns: HIGH - Defensive NULL handling and filtering are proven patterns
- Pitfalls: HIGH - v1.1 research identified same risks; patterns tested
- Backward compatibility: HIGH - Migration pattern follows Phase 4 onboarding model

**Research date:** 2026-01-25
**Valid until:** 30 days (tag schema stable in Zotero 7; annotation patterns may evolve)

## Implementation Notes for Planner

**Task priority order:**

1. **Task 1: Update ITEM_TAGS_QUERY with annotation tag filtering** (1-2 hours)
   - Add WHERE clauses to exclude custom-color-*, highlight-*, annotation-*
   - Test with grep to find any existing annotation tag references in codebase
   - Update queries.ts documentation

2. **Task 2: Implement getItemTags() with defensive NULL handling** (2-3 hours)
   - Add explicit NULL/structure checks before accessing tagRow values
   - Handle empty result sets as valid (not error)
   - Log debug messages when tags are empty vs. extraction fails
   - Include in ZoteroConnector class

3. **Task 3: Add validateTagSchema() on database connect** (2 hours)
   - Check sqlite_master for itemTags and tags tables
   - Check for orphaned itemTags entries
   - Call during ZoteroConnector.connect()
   - Log issues but continue (tags are optional)

4. **Task 4: Update ZoteroItem interface with tags field** (30 minutes)
   - Change from current type (string[]) to required field
   - Update JSDoc comments explaining tags are user-created only
   - No breaking changes to existing fields

5. **Task 5: Implement profile migration for backward compatibility** (2-3 hours)
   - Add needsTagMigration() check
   - Add migrateProfile() that re-loads seed items
   - Extract and aggregate tags from seed papers
   - Call from profile initialization flow (Phase 4 code)

6. **Task 6: Test tag extraction with real Zotero 7 database** (3-4 hours)
   - Load test database with annotation tags
   - Verify filtering removes custom-color-*, highlight-*
   - Verify NULL handling doesn't crash
   - Verify empty result sets return []
   - Test profile migration on profile load

**Testing strategy:**

- Unit: Test getItemTags() with mock results (NULL, empty, annotation tags)
- Integration: Load real Zotero 7 database; verify tag count and filtering
- Migration: Load v1.0 profile; verify tags re-extracted on first v1.1 open
- Edge cases: Items with 0 tags, 100+ tags, only annotation tags
- Performance: Load 5000-item database; profile tag extraction time

**Phase dependencies:**
- Phase 1-5 must be complete before Phase 6 starts
- Phase 6 extends existing ZoteroConnector (Phase 1) and profile system (Phase 4)
- Phase 7 (tag-based recommendations) depends on Phase 6 completing with proper tags field
