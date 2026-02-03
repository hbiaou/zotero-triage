# v1.1 Research Summary: Tag Extraction & UX Polish

**Project:** Zotero Triage Plugin v1.1 Enhancement Phase
**Research Date:** 2026-01-25
**Focus:** Common mistakes when adding tag extraction and UX polish to existing system
**Overall Confidence:** MEDIUM-HIGH

---

## Executive Summary

Adding tag extraction and UX polish (progress indicators, warning messages, override modal help text) to the v1.0 system introduces new integration risks that the v1.0 research didn't anticipate. The v1.0 system successfully handles 5000+ items with chunked processing and state persistence. v1.1 risks are orthogonal: **tag schema variations breaking recommendation scoring**, **progress UI causing jank**, and **notification spam blocking UI access**.

Key finding: **v1.1 should NOT treat tags as critical to v1.1 MVP**. Tag extraction is working code (already implemented in codebase), but integration with the recommendation engine and proper NULL handling are where mistakes will happen. UX polish (notices, modals, progress) has well-documented pitfalls in Obsidian ecosystem; following proven patterns prevents issues.

**Recommended approach:** Implement defensively (assume tags can be NULL/empty), test aggressively with real user libraries (especially Zotero 7), throttle UI updates, and aggregate notices.

---

## Key Findings by Feature

### Tag Extraction

**Status:** Already implemented in `ZoteroConnector.ts` with `ITEM_TAGS_QUERY`

**Critical Risk:** Null/empty tag results silently break recommendation scoring
- `ZoteroItem.tags` assumed to always populate (current type definition)
- `LEFT JOIN` in query can return NULL values if schema varies
- Recommendation engine will fail to score on tag similarity with empty tags
- Error is silent: "Recommendations seem based only on recency"

**Mitigation (MUST DO):**
1. Implement explicit NULL handling in tag query results
2. Test with real Zotero 7 libraries (annotation tags present)
3. Filter out `custom-color-*` and `highlight-*` tags (Zotero 7 auto-tags)
4. Document that tags are optional and empty tags are valid

**Secondary Risk:** Annotation tags polluting results
- Zotero 7 introduced annotation tags (highlight colors, emphasis)
- ITEM_TAGS_QUERY returns all tags without filtering
- Result: "machine-learning" tag mixed with "custom-color-1"
- User confusion: "I didn't tag this with colors"

**Mitigation:** Filter annotation tags in SQL query or post-query validation

---

### Progress Tracking UI

**Status:** `ProgressTracker` implemented with persistent Notice (timeout=0)

**Critical Risk:** DOM updates every item (5000 calls) cause UI jank
- Calling `Notice.setMessage()` triggers DOM reflow/repaint
- 5000 updates in seconds = unresponsiveness defeating the purpose
- Users report: "Progress indicator makes it slower"

**Mitigation (MUST DO):**
1. Throttle updates to max 2/second (500ms minimum interval)
2. Batch progress updates to every 100 items instead of every item
3. Cache progress bar strings to avoid 5000 string allocations

**Secondary Risk:** Memory leaks from persistent notice
- Persistent notice (timeout=0) kept in DOM, repeatedly updated
- String allocations in `formatMessage()` not garbage collected
- Memory grows 50MB+ during 5000-item batch
- After 2-3 batches: Obsidian appears to "leak memory"

**Mitigation:**
1. Explicitly cleanup notice in `complete()` and `error()`
2. Reuse/cache message strings instead of creating new ones
3. Consider non-persistent notice pattern (auto-dismiss + re-show)
4. Monitor memory during testing with DevTools

---

### Warning Messages & Notices

**Status:** Multiple sources of notices (tag extraction, profile init, validation errors)

**Critical Risk:** Notice spam blocks UI access
- v1.1 adds validation warnings during batch processing
- Override modal triggers warnings for missing fields
- 5+ notices stacking on screen simultaneously
- Users can't access top bar, disable warnings

**Mitigation (MUST DO):**
1. Aggregate warnings instead of per-item notices
2. Show one summary notice instead of 5 individual ones
3. Implement notice deduplication
4. Never use timeout=0 (infinite) for warnings, only for user prompts

**Specific examples:**
- BAD: "Warning: Item #42 missing DOI" + "Warning: Item #43 missing author" + "Warning: Item #44 missing journal"
- GOOD: "Validation issues: 45x missing DOI, 23x missing author, 12x missing journal"

---

### Override Modal Help Text

**Status:** v1.1 adds help text explaining required fields

**Critical Risk:** Help text creates cognitive overload
- Attempt to be helpful backfires: 500+ characters per field
- Modal becomes wall of text instead of actionable form
- Users scroll past without reading
- Accessibility issue: screen readers read huge wall of text

**Mitigation (MUST DO):**
1. Keep help to 1-2 sentences maximum
2. Use example format instead of explanation
3. Use progressive disclosure (expandable/tooltip help)
4. Link to external docs instead of embedding text

**Specific examples:**
- BAD: "The DOI is a unique identifier for published articles. It's required because citations without DOIs are harder to track..."
- GOOD: "Example: 10.1234/example" or "DOI (e.g., 10.1234/example) — optional if Year provided"

---

## Implementation Priorities

### Phase 1.1a (Week 1): Defensive Tag Extraction
- [ ] Add NULL handling to tag query results
- [ ] Filter annotation tags (custom-color-*, highlight-*)
- [ ] Update type definitions to reflect optional tags
- [ ] Test with real Zotero 7 library containing annotation tags

**Risk if skipped:** Tag scoring breaks silently

### Phase 1.1b (Week 1): Progress UI Throttling
- [ ] Implement update throttling (500ms minimum interval)
- [ ] Batch progress updates to 100-item chunks
- [ ] Add performance monitoring to ProgressTracker
- [ ] Test with 5000-item simulation to verify no jank

**Risk if skipped:** UI becomes unresponsive during batch processing

### Phase 1.1c (Week 2): Notice Aggregation
- [ ] Create NoticeManager with deduplication
- [ ] Aggregate validation warnings into summary
- [ ] Set appropriate timeouts (5000ms, not 0)
- [ ] Add settings to control notice verbosity

**Risk if skipped:** Notice spam complaints, users disable warnings

### Phase 1.1d (Week 2): Modal Simplification
- [ ] Reduce help text to 1-2 sentences per field
- [ ] Use examples instead of explanations
- [ ] Implement progressive disclosure for advanced help
- [ ] Accessibility audit: screen reader test

**Risk if skipped:** Modal marked as confusing/unhelpful

---

## What NOT to Do in v1.1

These are tempting features that introduce more pitfalls than value:

1. **Don't show progress per item.** Throttle to 100-item batches.
2. **Don't use persistent notices (timeout=0) for warnings.** Only for user prompts.
3. **Don't embed long explanations in modals.** Link to docs instead.
4. **Don't extract tags without NULL handling.** Test with edge cases.
5. **Don't skip annotation tag filtering.** Zotero 7 will have them.

---

## Testing Checklist for v1.1

Before release, verify in this order:

**Tag Extraction:**
- [ ] Load library with 0 tags (empty array)
- [ ] Load library with 100+ tags per item
- [ ] Load Zotero 7 database with annotation tags
- [ ] Verify recommendation scoring works with incomplete tags
- [ ] Check memory usage during tag extraction

**Progress UI:**
- [ ] Simulate 5000-item batch, watch for jank
- [ ] Verify UI remains responsive during updates
- [ ] Monitor memory growth (< 50MB delta)
- [ ] Test error paths (progress notice cleaned up)
- [ ] Test cancellation (operation stops cleanly)

**Notices & Modals:**
- [ ] Run full workflow, count notices (should be < 5)
- [ ] Verify duplicate notices don't stack
- [ ] Test accessibility: read modal aloud with screen reader
- [ ] Verify modal text comprehensible in < 30 seconds
- [ ] Check that help text doesn't scroll

---

## Handoff to Phase Planning

This research informs phase structure and implementation details:

1. **Week 1 focus:** Get tag extraction and progress UI right (most complex)
2. **Week 2 focus:** Fix notice spam and modal UX (lower complexity but high impact)
3. **All weeks:** Test with real Zotero 7 libraries (annotation tags) and large datasets (5000 items)

**Risk matrix:**
- **High risk, high value:** Tag extraction (breaks silently if wrong)
- **High risk, high value:** Progress UI throttling (breaks UX if wrong)
- **Medium risk, high value:** Notice aggregation (improves UX significantly)
- **Medium risk, medium value:** Modal simplification (nice-to-have UX improvement)

**Estimated effort:**
- Tag extraction: 2-3 days (testing is the bulk)
- Progress UI: 1-2 days
- Notices: 1 day
- Modal: 1 day
- **Total: 5-7 days for full v1.1 polish**

---

## Gaps Needing Phase-Specific Research

During v1.1 implementation, these questions will need deeper investigation:

1. **Tag schema in production Zotero databases:** What other tag patterns exist beyond custom-color-* and highlight-*?
2. **Annotation tag migration:** Will Zotero 6.x users upgrading to 7.x see annotation tags retroactively?
3. **Obsidian Notice memory:** Is the memory issue from DOM or from Notice internal state?
4. **Progress update frequency sweet spot:** Is 500ms too conservative? Could 250ms be safe?

These can be answered during implementation with real user databases and DevTools monitoring.

---

## Sources

**Tag Extraction:**
- [Zotero SQLite Schema](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)
- [Forum: Finding tags in SQLite](https://forums.zotero.org/discussion/62962/finding-the-tags-of-an-item-in-zotero-sqlite)
- [Zotero Annotation Tags](https://forums.zotero.org/discussion/100496/annotation-tags-in-zotero-sqlite-database)

**Obsidian UI Performance:**
- [Obsidian Notice API](https://docs.obsidian.md/Reference/TypeScript+API/Notice)
- [Memory Leaks in Plugins](https://forum.obsidian.md/t/memory-leak-after-turning-off-plugin/48567)
- [Notice Spam Issues](https://forum.obsidian.md/t/obsidian-sync-lots-of-message-notifications-almost-every-5-seconds/79563)

**Accessibility & UX:**
- [W3C Modal Dialog Guidelines](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/)
- [Modal UX Best Practices](https://www.eleken.co/blog-posts/modal-ux)
- [Accessible Modals with ARIA](https://www.a11y-collective.com/blog/modal-accessibility/)

---

## Next Steps

1. **Review with team** - Ensure pitfalls resonate with implementation concerns
2. **Adjust priorities** - If resource-constrained, defer "Modal simplification" to post-v1.1
3. **Create tasks** - Create GitHub issues for each mitigation with test acceptance criteria
4. **Start implementation** - Begin with tag extraction (most complex) and progress UI (most critical)

**Target release:** 2026-02-22 (4 weeks from now)

---

*Research completed: 2026-01-25*
*Status: Ready for phase planning*
