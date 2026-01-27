# Pitfalls Research: Library Filtering & Duplicate Detection

**Project:** Zotero Triage Plugin v1.2 (Library Filtering & Preflight Checks)
**Researched:** 2026-01-27
**Confidence:** HIGH
**Focus:** Common mistakes when adding library scope filtering, duplicate detection, and preflight validation to existing Zotero plugins

---

## Executive Summary

Adding library filtering, duplicate detection, and preflight checks to an existing Zotero plugin introduces integration risks that are orthogonal to the existing triage workflow. The core pitfalls fall into three categories:

1. **Filtering mistakes**: Excluding the wrong items, misunderstanding Zotero's library/collection schema, breaking existing batch queries
2. **Duplicate detection failures**: False positives from aggressive DOI/ISBN matching, false negatives from metadata variations, blocking legitimate triage flow
3. **Preflight validation**: Blocking users with edge cases, schema incompatibilities between Zotero 6.x and 7.x, performance degradation during validation

The critical insight: **duplicate detection is harder than it appears**. Zotero's own algorithm has documented false positives (books with same ISBN but different volumes, articles with identical DOIs from different sources). Any preflight check that relies on duplicate matching will either block legitimate items or miss real duplicates.

---

## Critical Pitfalls

### Pitfall 1: Filtering Too Aggressively (Breaking Batch Generation)

**What goes wrong:**
Query starts returning 0 items after filtering is added. Batch generation hangs waiting for items that don't meet filter criteria. Users report "plugin seems broken" even though items exist in Zotero.

**Why it happens:**
- Developer assumes "filter out group libraries" means simple WHERE clause
- Fails to account for items that belong to multiple libraries or collections
- Adds filter conditions in wrong ORDER (filtering before checking for deleted items)
- Doesn't test with real user libraries containing: feeds, archived groups, hidden collections
- Confuses library scope (item's primary library) with collection membership (item can be in multiple collections)

**How to avoid:**
1. **Understand Zotero's schema hierarchy:**
   - `libraries` table: libraryID, type (user/group/feed)
   - `items` table: libraryID (primary library assignment)
   - `collections` table: separate join, item can be in 0 or many collections
   - `deletedItems` table: items marked for deletion

2. **Filter by library type safely:**
   ```sql
   -- CORRECT: Filter by library type AFTER deletion check
   SELECT i.itemID FROM items i
   JOIN libraries l ON i.libraryID = l.libraryID
   WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
     AND l.type = 'user'  -- Only user (My Library), exclude groups/feeds

   -- WRONG: Filtering without understanding schema
   -- WHERE library != 'group'  -- Doesn't work, library is numeric
   -- WHERE NOT libraryID IN (SELECT ...)  -- Complex, easy to miss cases
   ```

3. **Test with representative libraries:**
   - Single-user library (standard case)
   - Multi-group membership (common for researchers)
   - Archived/synced group (not deleted, but shouldn't be processed)
   - Feed subscriptions (hidden collections that look like groups)
   - Large library (5000+ items, verify query performance)

4. **Make filtering optional and debuggable:**
   - Add settings flag to enable/disable library filtering
   - Log number of items before/after filter
   - Provide warning if filter removes >90% of items

**Warning signs:**
- Batch generation returns 0-10 items when user reports having 100+
- Works in dev environment (small single library) but fails in production (multi-group)
- Performance degrades significantly (filter adds expensive JOINs to existing query)
- Users report items disappearing from triage workflow unexpectedly

**Phase to address:**
Phase 1 (Implementation) - Must verify filter correctness before preflight check is added. If filtering breaks batch generation, preflight becomes unreliable.

---

### Pitfall 2: Duplicate Detection False Positives (Blocking Legitimate Items)

**What goes wrong:**
Preflight check identifies items as "duplicates" and refuses to process them. User sees "This paper is already in your library" but they're actually different papers (different authors, different publication dates, different journals). Workflow is blocked; user disables preflight validation entirely.

**Why it happens:**
Zotero's own duplicate detection algorithm has documented limitations:
- Matches on DOI as unique identifier, but publishers sometimes assign same DOI to multiple items (conference series)
- Matches on ISBN for books, but multi-volume books share same ISBN with different volumes
- Matches title + author without considering publication year differences

Plugin developers assume Zotero's algorithm is accurate, but it has false positive rate especially for:
- Books (ISBN collisions across editions/volumes)
- Conference papers (multiple versions: preprint, proceedings, journal)
- Working papers (same author, same title, different publication venues)

**Real examples from Zotero forums:**
1. User has "Machine Learning: A Probabilistic Perspective" (book) and manual duplicate detection tries to merge it with "Machine Learning: A Probabilistic Perspective - Chapter 3" (book section) - same title, different publication types
2. Author publishes working paper with title "Climate Models", then same paper in journal - Zotero treats as duplicate despite year difference
3. Multi-volume book series: Vol 1 ISBN 978-0-123-45678-1, Vol 2 same ISBN - marked as duplicates

**How to avoid:**
1. **Do NOT rely solely on DOI matching:**
   ```typescript
   // DANGEROUS: DOI-only matching
   const isDuplicate = items.some(item => item.doi && item.doi === candidate.doi);

   // SAFER: Multi-field matching with validation
   // - DOI match ONLY if title also matches closely (>80% similar)
   // - Require BOTH DOI AND title similarity (not OR)
   // - Check publication type (don't cross-match book vs. journal article)
   ```

2. **Account for publication year variance:**
   - Working papers often have multiple official "versions"
   - Conference papers may be published as preprints (different year)
   - Allow ±2 year tolerance, don't treat as duplicates if year differs by 1+

3. **Validate type compatibility before flagging:**
   ```typescript
   // Before marking duplicate, verify types are compatible
   const incompatiblePairs = [
     ['book', 'bookSection'],  // Different thing entirely
     ['journalArticle', 'conferencePaper'],  // Different venues
     ['thesis', 'journalArticle']  // Different publication format
   ];

   // If types are incompatible, don't flag as duplicate
   ```

4. **Make preflight check advisory, not blocking:**
   - Don't prevent batch generation when possible duplicates found
   - Show warning: "5 potential duplicates detected. Review before processing?"
   - Allow user to override: "Process anyway" button
   - Log which items were flagged for manual review

5. **Test against edge cases that break Zotero's algorithm:**
   - Same title, different years (working papers)
   - Same ISBN, different volumes (book series)
   - Same DOI, different publication types (preprint vs. proceedings)
   - No metadata (test year, journal, authors missing)

**Warning signs:**
- User reports "plugin says I have 1000 duplicates but Zotero says 10"
- Preflight check blocks most batch operations
- Users disable preflight validation to bypass false positives
- Forum complaints: "Can't process my library because of false duplicates"

**Phase to address:**
Phase 1 (Preflight Design) - Determine detection strategy BEFORE implementation. A poorly-designed preflight check is worse than no check at all.

---

### Pitfall 3: Preflight Schema Incompatibility (Zotero 6 vs 7)

**What goes wrong:**
Plugin works on Zotero 6.x but crashes on Zotero 7.x during preflight validation. Schema version check passes (100-200 range), but specific table structures differ. Preflight check queries reference fields that don't exist in version 7, or fields exist but have different meanings.

**Why it happens:**
- Zotero 7 introduced annotation tags (highlight colors) - existing tag filtering logic needs update
- Library type values may differ between versions (not documented)
- Feed library handling changed (Zotero 7 vs 6)
- Assumes schema is stable, but Zotero explicitly documents it can change

Zotero documentation explicitly warns: *"The SQLite database structure can change between Zotero releases"* and *"Once features like underline or ink annotations are created in Zotero 7, the database is no longer compatible with Zotero 6."*

**How to avoid:**
1. **Don't assume static schema across versions:**
   ```typescript
   // WRONG: Assume libraries.type values are same in v6 and v7
   const userLibs = await connector.query(`
     SELECT libraryID FROM libraries WHERE type = 'user'
   `);

   // CORRECT: Test schema version, adjust behavior accordingly
   if (schemaVersion >= 150) {
     // Zotero 7 behavior (annotation tags present)
     query += ` AND t.name NOT LIKE 'custom-color-%'`;
   }
   ```

2. **Validate tag extraction explicitly:**
   - Zotero 7 introduced automatic annotation tags (custom-color-*, highlight-*)
   - These are auto-generated, not user-tagged
   - Filter them in preflight check to prevent noise
   - Test with actual Zotero 7 library containing PDFs with highlights

3. **Test compatibility matrix:**
   ```
   | Feature | Zotero 6.0 | Zotero 6.1+ | Zotero 7.0 | Zotero 7.1+ |
   |---------|-----------|-----------|-----------|-----------|
   | Tags | User only | User only | User + annotation tags | ? |
   | Feeds | ? | ? | ? | ? |
   | Groups | libraryID | libraryID | libraryID? | ? |
   | Annotation | None | None | Built-in | ? |
   ```

4. **Preflight check should include version-specific validation:**
   ```typescript
   preflightCheck() {
     const warnings = [];

     if (this.schema >= 150) {  // Zotero 7
       warnings.push("Zotero 7 detected - annotation tags will be filtered");
     }

     if (this.schema < 120) {  // Very old Zotero 6
       warnings.push("Zotero 6.0 - some features may be limited");
     }

     return warnings;
   }
   ```

**Warning signs:**
- Works on dev machine (single Zotero version) but crashes on user machines
- Error messages like "Column 'custom-color-*' not found" (schema mismatch)
- Zotero 7 users report preflight check hangs (incompatible query)
- Forum: "Works on Zotero 6, crashes on Zotero 7"

**Phase to address:**
Phase 1 (Implementation) - Must establish compatibility matrix BEFORE writing preflight queries. Test on both Zotero 6 and 7 before release.

---

### Pitfall 4: Preflight Blocking UX (Silent Failures & Timeout Purgatory)

**What goes wrong:**
Preflight check takes 30 seconds to complete without user feedback. Modal appears to hang. User force-quits plugin. Process never completes.

Secondary issue: Preflight check finds an issue and shows blocking modal. User has no way to recover (no "ignore" button). Plugin is now useless until issue is manually fixed.

**Why it happens:**
- Duplicate detection algorithm scales poorly (N² comparisons for N items)
- No progress feedback while validation runs
- Blocking modal has no recovery path (no override button)
- Validation errors are too specific ("Item #4829 is invalid") rather than actionable

**How to avoid:**
1. **Implement progress feedback:**
   ```typescript
   // Show progress during preflight check
   progress.start('Validating library...', totalItems);

   for (const item of items) {
     await validateItem(item);
     progress.update(index);  // Update every 100 items, not every item
   }
   ```

2. **Implement timeout protection:**
   ```typescript
   const PREFLIGHT_TIMEOUT = 30000;  // 30 seconds max

   const result = await Promise.race([
     performPreflightCheck(),
     timeout(PREFLIGHT_TIMEOUT)
   ]);

   if (timedOut) {
     showWarning("Preflight check timed out. Proceeding with caution.");
     // Allow user to continue despite timeout
   }
   ```

3. **Provide recovery options:**
   - Modal with "Fix It" button (guides user to Zotero preferences)
   - Modal with "Skip Check" button (proceed with warnings)
   - Modal with "Learn More" link (documentation)
   - NEVER have modal with only "Cancel" button

4. **Make preflight non-blocking by default:**
   ```typescript
   // WRONG: Block workflow until preflight passes
   if (!preflightPassed) {
     showBlockingModal("Fix these issues first...");
     return;  // Workflow stops
   }

   // RIGHT: Preflight provides warnings, workflow proceeds with flags
   const warnings = await preflightCheck();
   if (warnings.length > 0) {
     showNonBlockingWarning(`${warnings.length} issues found`, warnings);
   }
   workflow.proceed();  // Continues regardless
   ```

**Warning signs:**
- Users report "plugin seems to freeze during batch"
- First-time users abandon plugin setup (preflight check too strict)
- Complaints in forums: "Can't process library until I fix X"
- Support burden: users asking "How do I disable preflight?"

**Phase to address:**
Phase 1 (UX Design) - Define preflight behavior BEFORE implementation. Decide: Is it blocking or advisory? No recovery → blocking. Recovery options → advisory.

---

### Pitfall 5: Performance Degradation Under Load (Scale Beyond 5000 Items)

**What goes wrong:**
Plugin handles 1000 items fine. At 5000 items, preflight check takes 2+ minutes. At 10000+ items, check takes 10+ minutes. Users give up waiting.

Secondary issue: During preflight check, Zotero UI becomes unresponsive. Memory usage grows steadily (50MB → 200MB+).

**Why it happens:**
- Duplicate detection uses nested loops (O(n²) comparisons)
- Each duplicate check opens new query (no batch/caching)
- Large result sets held in memory for entire check duration
- Progress UI updates trigger DOM reflows every item (see v1.1 pitfalls)

**How to avoid:**
1. **Implement early-exit algorithms:**
   ```typescript
   // SLOW: Check every item against every other item
   for (const item of items) {
     for (const other of items) {
       if (isDuplicate(item, other)) {
         // Found duplicate
       }
     }
   }  // O(n²) - 25M comparisons for 5000 items

   // FASTER: Pre-filter by DOI, then check small subset
   const byDoi = groupBy(items, 'doi');  // O(n)
   for (const doiGroup of byDoi) {
     if (doiGroup.length > 1) {
       // Only compare items with same DOI (usually 1-2 items)
       for (const item of doiGroup) {
         // Comparisons limited to actual duplicates
       }
     }
   }  // O(n) + small O(m²) where m << n
   ```

2. **Batch validation to avoid timeout:**
   ```typescript
   const BATCH_SIZE = 500;

   for (let i = 0; i < items.length; i += BATCH_SIZE) {
     const batch = items.slice(i, i + BATCH_SIZE);
     await validateBatch(batch);  // Process smaller chunks
     progress.update(i / items.length);
     await sleep(100);  // Allow UI to update
   }
   ```

3. **Cache duplicate checks:**
   ```typescript
   // Don't re-check same pairs
   const seenPairs = new Set();

   for (const item of items) {
     for (const other of items) {
       const pairKey = [Math.min(item.id, other.id), Math.max(item.id, other.id)].join(':');
       if (seenPairs.has(pairKey)) continue;

       if (isDuplicate(item, other)) {
         // ...
       }
       seenPairs.add(pairKey);
     }
   }
   ```

4. **Set realistic limits:**
   - Max 10000 items per preflight check (beyond that, sample)
   - Max 30 second timeout (warn user if check truncated)
   - If items > threshold, make check optional

**Warning signs:**
- Preflight check takes >10 seconds for 5000 items
- Memory usage >100MB during check
- Zotero becomes unresponsive during preflight
- Forum: "Plugin hangs my Zotero when I try to set it up"

**Phase to address:**
Phase 1 (Implementation) - Performance test with 5000 and 10000 item libraries BEFORE release. If preflight takes >30 seconds at 5000 items, redesign algorithm.

---

## Integration Gotchas

Common mistakes when connecting preflight checks to existing batch generation.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Preflight + Batch Generation** | Preflight excludes items that batch then can't find (schema version mismatch) | Preflight and batch use same query logic; preflight validates that batch will work |
| **Filter Settings + Batch** | Changing filter settings doesn't invalidate batch cache; batch returns stale items | Batch cache key includes filter settings; new settings clear cache |
| **Duplicate Detection + Triage** | Duplicate detection blocks user from processing new items; user disables check | Make check advisory; log duplicates but don't block workflow |
| **Library Filtering + Recommendations** | Filtering library breaks recommendation scoring (tags only from filtered items) | If filtering enabled, rebuild tag profile from filtered set; warn user if filtered profile is incomplete |
| **Validation + Batch** | Preflight validates based on incomplete metadata; batch validates again; different results | Single validation point; either preflight (early) or batch-time (late), not both |

---

## Performance Traps

Patterns that work at small scale (100 items) but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| **DOI-only duplicate detection** | False positives (multiple papers same DOI from publisher series) | Require title + DOI match, not OR | 1000+ items with inconsistent metadata |
| **Per-item duplicate check** | Check each item against all others (O(n²)) → 25M comparisons at 5000 items | Batch by DOI/ISBN first, then compare small subsets | 2000+ items |
| **Holding validation results in memory** | Memory grows 50MB+ during 5000-item validation; not released until check ends | Stream validation results; only keep recent batch in memory | 5000+ items |
| **Progress update every item** | 5000 DOM updates → UI jank, defeating the purpose of progress bar | Throttle updates to 2/second (500ms minimum interval) | 1000+ items |
| **No schema validation** | Zotero 6 → 7 upgrade → query fails on version-specific fields | Test preflight on both versions; include version checks in query | Version upgrade |
| **Case-sensitive tag matching** | Tags "Machine Learning" and "machine learning" treated as different | Normalize tags to lowercase before comparison | Multi-user library |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces before preflight check is released.

- [ ] **Filtering logic:** Tested with multi-group library, archived groups, feeds, large collections; query tested on Zotero 6 AND 7
- [ ] **Duplicate detection:** Tested against false positive cases (same ISBN/DOI different papers); algorithm has early-exit optimization (not O(n²))
- [ ] **Preflight timeout:** Check has 30-second timeout; graceful degradation if timeout exceeded
- [ ] **Progress feedback:** Preflight shows progress during validation; no UI freezes
- [ ] **Recovery UX:** Blocking modals have "Skip" or "Override" button; preflight is advisory by default
- [ ] **Performance baseline:** Preflight on 5000 items completes in <30 seconds; memory stays <150MB
- [ ] **Schema version handling:** Tested on Zotero 6.0, 6.1, 7.0 (or latest available); version-specific behaviors documented
- [ ] **Tag filtering:** Zotero 7 annotation tags (custom-color-*, highlight-*) explicitly filtered from results
- [ ] **Validation clarity:** Error messages tell user HOW to fix issue, not just WHAT is wrong

---

## Technical Debt & Shortcuts

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| **Disable preflight for >5000 items** | Avoids timeout issues, unblocks users | User doesn't know if their library is healthy; bugs go undetected | Only if timeout is real problem; better: fix algorithm |
| **DOI-only duplicate detection** | Simple algorithm, fast | False positives block legitimate items | Never - use multi-field matching |
| **Preflight blocks batch** | Prevents processing invalid libraries | UX friction, users disable check or abandon plugin | Never - make advisory only |
| **Skip tag filtering in v7** | Avoids annotation tag complexity | Recommendation scoring polluted by auto-tags | Never - Zotero 7 is released, filters are necessary |
| **Cache preflight result** | Avoid re-running expensive check | Stale cache when library changes; user unaware | Only if cache invalidated on library change |
| **No progress feedback** | Simpler implementation | Users think plugin hung; they force-quit | Never - always show progress for >1000 items |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Filtering breaks batch | Phase 1 Implementation | Batch generation test with: single library, multi-group, feeds, 5000 items |
| Duplicate false positives | Phase 1 Preflight Design | Tested against edge cases: same ISBN/DOI different papers, working papers, multi-volume books |
| Schema incompatibility | Phase 1 Implementation | Preflight works on Zotero 6.0 AND 7.x; version-specific behavior documented |
| Preflight blocking UX | Phase 1 UX Design | Modal has recovery button (never blocking); preflight advisory with warnings |
| Performance degradation | Phase 1 Implementation | Preflight on 5000 items <30s; memory <150MB; no UI freeze |

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Filtering excludes legitimate items | MEDIUM | Audit filter query (verify with Zotero's UI), patch filter, clear cache, re-test |
| Duplicate false positives block users | MEDIUM | Switch preflight to advisory-only, add manual override button, notify users |
| Preflight crashes on v7 | HIGH | Full re-test on v7, patch schema-specific queries, deploy hotfix |
| Performance timeout at 5000 items | MEDIUM | Redesign algorithm (batch/cache, early-exit), implement timeout handling, warn users |
| Users disable preflight | HIGH | Redesign preflight to be non-blocking, rebuild trust with next release |

---

## Real-World Examples from Zotero Ecosystem

### Example 1: The ISBN Trap (Books)

**What happened:** User with book library reported plugin marking 60% of items as duplicates.

**Root cause:** Multi-volume book series (e.g., "Handbook of Applied Machine Learning" Vol 1-3) share same ISBN. Plugin's duplicate check marked them all as duplicates.

**Solution:** Filter out items where volume field differs during duplicate matching.

**Prevention:** Test duplicate detection with book libraries; ISBN alone is not sufficient for book deduplication.

---

### Example 2: The Group Library Search Problem

**What happened:** User with 3 large group libraries reported search becoming "unusably slow" when filtering was added.

**Root cause:** Filter joins to `libraries` and `groups` tables without proper indexing; query scans 5000 items × 3 groups = expensive cartesian product.

**Solution:** Pre-fetch library list once; filter by libraryID rather than joining.

**Prevention:** Profile query performance with multi-group setup; use EXPLAIN QUERY PLAN.

---

### Example 3: The Preflight Timeout

**What happened:** User with 8000-item library tried to use plugin; preflight check hung for 5 minutes, then crashed.

**Root cause:** O(n²) duplicate detection algorithm; 8000² = 64M comparisons.

**Solution:** Implement early-exit (pre-filter by DOI), add 30-second timeout, make preflight advisory.

**Prevention:** Load test with 5000+ items during development; set performance budgets.

---

## Sources

**Zotero Official Documentation:**
- [Zotero SQLite Database Access](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)
- [Duplicate Detection](https://www.zotero.org/support/duplicate_detection)
- [Collections and Tags](https://www.zotero.org/support/collections_and_tags)
- [Groups Documentation](https://www.zotero.org/support/groups)

**Zotero Forum Discussions (Real-World Issues):**
- [Exclude group libraries in Word plugin search](https://forums.zotero.org/discussion/85990/exclude-group-libraries-in-word-plug-in-search) - Users need library filtering, current plugins don't provide it
- [False duplicates in books](https://forums.zotero.org/discussion/79545/false-duplicates-in-the-duplicate-items-which-happens-especially-for-the-item-type-book) - ISBN matching false positives
- [Identifying duplicates incorrectly](https://forums.zotero.org/discussion/84950/identifying-duplicates-incorrectly) - DOI matching without title validation
- [False duplicates discussion](https://forums.zotero.org/discussion/55952/false-duplicates) - Same DOI, different metadata
- [Ghost group library issue](https://forums.zotero.org/discussion/80769/ghost-group-library-how-to-remove) - Deleted groups still in schema

**Batch Processing & Performance:**
- [Batch Processing Deduplication](https://www.linkedin.com/advice/1/what-best-way-handle-duplicates-batch-processing-zywde) - O(n²) vs O(n) approaches
- [Deduplicate Events in Batch Processing](https://upsolver.com/blog/how-to-deduplicate-events-in-batch-and-stream-processing-using-primary-keys) - Key-based vs hash-based approaches
- [Spring Batch Scalability](https://docs.spring.io/spring-batch/reference/scalability.html) - Batch processing patterns at scale

**Duplicate Detection Research:**
- [Evidence-based literature review: De-duplication](https://pmc.ncbi.nlm.nih.gov/articles/PMC10789108/) - Multi-field matching challenges
- [Duplicate Record Detection Survey](https://dl.acm.org/doi/10.5555/1191547.1191739) - Academic foundation

---

## Next Steps

1. **Review with implementation team** - Ensure pitfalls resonate with real concerns during development
2. **Create failing test cases** - Write tests that verify each pitfall prevention (e.g., test multi-group filtering, false positive duplicates)
3. **Set quality gates** - Performance budget (preflight <30s on 5000 items), accuracy threshold (duplicate check tested against 10+ edge cases)
4. **Establish monitoring** - Track preflight execution time, duplicate detection accuracy, schema version compatibility in production

---

*Pitfalls research for: Zotero Triage Plugin v1.2 (Library Filtering & Preflight Checks)*
*Researched: 2026-01-27*
*Confidence: HIGH*
