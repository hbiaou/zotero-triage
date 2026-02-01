---
phase: 15-content-extraction-&-classification-pipeline
plan: 03
subsystem: ui
tags: [classification, modal-ui, transcript-integration, reclassify-command]

# Dependency graph
requires:
  - phase: 15
    plan: 01
    provides: TranscriptExtractor for video transcript extraction
  - phase: 15
    plan: 02
    provides: DomainClassifier and classification types
  - phase: 14
    plan: 05
    provides: EvidenceExtractor service architecture
provides:
  - ClassificationModal for user domain override on low-confidence classifications
  - Evidence hierarchy with transcript extraction integration
  - Re-classification command for post-enrichment domain corrections
affects: [16-01, 16-02, accept-workflow, enrichment-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Modal pattern for user input with dropdown and callbacks
    - Graceful degradation in evidence extraction (transcript failure falls back to notes)
    - Command pattern for post-enrichment corrections
    - Frontmatter-based state management for re-classification

key-files:
  created:
    - src/ui/classification-modal.ts
    - src/commands/reclassify-command.ts
  modified:
    - src/services/evidence-extractor.ts
    - src/main.ts

key-decisions:
  - "Classification modal triggered when confidence < 0.70 (from 15-02 research)"
  - "Transcript extraction positioned between PDF fulltext and notes in evidence hierarchy"
  - "Re-classification command extracts Zotero item ID from note frontmatter"
  - "Domain guide collapsible to reduce modal clutter"

patterns-established:
  - "Modal with dropdown selection and callback handlers (onConfirm/onCancel)"
  - "Evidence extractor try/catch pattern for optional extraction sources"
  - "Command reads note frontmatter to determine item context"

# Metrics
duration: 3.5h (checkpoint paused after task completion)
completed: 2026-02-01
---

# Phase 15 Plan 03: Classification Modal & Evidence Integration Summary

**User domain override modal for low-confidence classifications with transcript-enhanced evidence hierarchy and post-enrichment re-classification command**

## Performance

- **Duration:** ~3.5 hours (with checkpoint pause)
- **Started:** 2026-02-01T07:38:09Z
- **Completed:** 2026-02-01T11:15:58Z (checkpoint approved 2026-02-01T10:43:38Z)
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Classification override modal with domain dropdown and collapsible help text
- Video transcript extraction integrated into evidence hierarchy between PDF fulltext and notes
- Re-classification command for correcting domain assignments after enrichment
- Full user control over classification decisions via modal and command palette

## Task Commits

Each task was committed atomically:

1. **Task 1: Create classification override modal UI** - `097fc02` (feat)
2. **Task 2: Update evidence extractor to support video transcripts** - `58da119` (feat) *[Note: Committed as part of 15-04 but implemented for 15-03]*
3. **Task 3: Implement re-classification command** - `acafa9d`, `2a3b5f3` (feat + fix)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/ui/classification-modal.ts` - ClassificationModal with domain dropdown, confidence display, reasoning, domain guide, and action buttons
- `src/services/evidence-extractor.ts` - Added transcript extraction step between PDF fulltext and notes with graceful fallback
- `src/commands/reclassify-command.ts` - ReclassifyCommand for post-enrichment domain changes with frontmatter integration
- `src/main.ts` - Registered reclassify-item command with active note detection and item ID extraction

## Decisions Made

**Classification modal threshold (0.70):**
- Trigger modal when `result.confidence < 0.70 && !result.isHardOverride`
- Follows research from Phase 15-02 (industry standard 0.60-0.75 range)
- Users only see modal when classification is uncertain

**Transcript as FullText level:**
- Video transcripts return `level: 'FullText'` not a separate level
- Per Phase 15 research: transcript quality equivalent to fulltext for enrichment
- Source tracking uses `video_transcript_${platform}` to distinguish from PDF fulltext

**Evidence extraction order:**
1. PDF fulltext (primary)
2. Video transcript (primary - NEW)
3. Zotero notes (secondary)
4. Abstract (tertiary)
5. Metadata only (insufficient)

**Re-classification workflow:**
- Command reads current domain from note frontmatter (knowledge_domain field)
- Re-classifies item with fresh evidence extraction
- Shows ClassificationModal with new suggested domain
- Updates frontmatter on confirmation
- Phase 16 integration point: Queue for re-enrichment with new template (TODO)

**Domain guide collapsible:**
- Reduces modal clutter for users who know the domains
- Provides definitions for first-time users:
  - Academic: Research papers, textbooks, scholarly articles
  - Software: Programming code, library docs, dev tools
  - Farming: Agriculture, crop science, farming practices
  - General: News, blogs, miscellaneous content

**Error handling:**
- Transcript extraction failures logged but don't throw (graceful degradation to notes/abstract)
- Re-classification handles missing notes, invalid frontmatter, classification errors
- User feedback via Obsidian Notice API

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Transcript extractor integration done in plan 15-04 commit**
- **Found during:** Task 2 execution review
- **Issue:** Evidence extractor transcript support was needed for plan 15-03 but committed as part of 15-04
- **Fix:** Transcript integration already present in codebase (commit 58da119)
- **Files modified:** src/services/evidence-extractor.ts
- **Verification:** TypeScript compilation succeeds, TranscriptExtractor imported correctly
- **Committed in:** 58da119 (tagged as 15-04 but implements 15-03 Task 2)

**2. [Rule 1 - Bug] Fix ZoteroItem import in reclassify-command**
- **Found during:** Task 3 TypeScript compilation
- **Issue:** ZoteroItem imported from wrong module, type mismatch with NoteGenerator expectations
- **Fix:** Corrected import to `from '../db/zotero-connector'` to match NoteGenerator's type
- **Files modified:** src/commands/reclassify-command.ts
- **Verification:** TypeScript compilation succeeds
- **Committed in:** 2a3b5f3 (fix commit)

---

**Total deviations:** 2 auto-fixed (1 blocking cross-plan dependency, 1 import bug)
**Impact on plan:** Both fixes necessary for correct operation. Transcript integration already implemented, just attributed to different plan number.

## Issues Encountered

**Cross-plan work attribution:**
- Transcript extraction integration (Task 2) was implemented and committed during plan 15-04 execution
- This is normal for wave-based execution where multiple plans progress in parallel
- Evidence extractor now correctly includes transcript extraction between PDF and notes steps

**Command integration complexity:**
- Re-classification command requires:
  1. Active note detection
  2. Frontmatter parsing (zotero_item_id extraction)
  3. Database lookup (load full ZoteroItem)
  4. Fresh evidence extraction
  5. Classification with modal interaction
  6. Frontmatter update
  7. Future: re-enrichment queue (Phase 16)
- Implemented fully except re-enrichment queue (deferred to Phase 16)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 16 (Accept Workflow Integration):**
- ClassificationModal ready to display on low-confidence classifications
- Trigger: `if (result.confidence < 0.70 && !result.isHardOverride) { show modal }`
- Evidence extractor provides transcript-enhanced evidence for classification
- Re-classification command enables domain corrections after enrichment

**Integration points for Phase 16:**
1. Accept workflow calls `classifier.classify(item, evidence)`
2. Check confidence threshold to trigger ClassificationModal
3. User selects domain via modal (or accepts suggestion)
4. Domain selection determines enrichment template
5. Re-classification command queues re-enrichment (TODO: implement queue integration)

**Blockers/Dependencies:**
- None - classification UI and evidence integration complete
- Re-enrichment queue integration deferred to Phase 16 (Accept workflow owns queue management)

## Technical Details

**ClassificationModal (226 lines):**
- Constructor: `(app, item, suggestedClassification, onConfirm, onCancel)`
- onOpen(): Builds modal UI with item info, suggestion, dropdown, guide, buttons
- Domain dropdown pre-selected with suggested domain
- Collapsible domain guide with definitions
- Action buttons: "Continue with {domain}" (mod-cta), "Cancel"
- Callbacks fire on user action, modal closes

**Evidence Extractor Transcript Integration:**
- Try/catch around transcript extraction (position 2 in hierarchy)
- Falls back to notes/abstract on TranscriptExtractionError
- Returns FullText level with `video_transcript_{platform}` source
- Token estimation from transcript word count (consistent with Phase 14 pattern)

**ReclassifyCommand (197 lines):**
- execute(item): Re-classify and update frontmatter
- Workflow:
  1. Read note file and parse frontmatter
  2. Extract current knowledge_domain
  3. Extract evidence via EvidenceExtractor
  4. Classify via DomainClassifier
  5. Show ClassificationModal with new suggestion
  6. Update frontmatter on confirmation
  7. Show success/error notice
- Error cases: Note not found, invalid frontmatter, classification failure

**Main.ts Command Registration:**
- Command ID: `reclassify-item`
- Command name: "Re-classify item domain"
- Gets active note from workspace
- Extracts zotero_item_id from frontmatter
- Loads ZoteroItem from database
- Executes ReclassifyCommand.execute(item)
- Graceful handling of non-literature-notes

## Known Limitations

**1. Re-enrichment queue not implemented:**
- Re-classification updates domain in frontmatter
- Does NOT trigger re-enrichment automatically yet
- Phase 16 will implement queue management and re-enrichment trigger
- User must manually delete/recreate note to re-enrich with new template

**2. No classification history:**
- Frontmatter only stores current domain (knowledge_domain field)
- Does not track classification changes over time
- Cannot show "was Academic, now Software" history
- Could add classification_history array in future if needed

**3. Modal cannot be dismissed by clicking outside:**
- Obsidian Modal pattern requires explicit button click
- Users must click Cancel to dismiss (cannot click backdrop)
- Standard Obsidian behavior, not a bug

**4. Transcript extraction in evidence hierarchy not configurable:**
- Transcripts always positioned between PDF and notes
- Some users may prefer notes over transcripts
- Fixed hierarchy per Phase 15 research recommendations
- Could make configurable in plugin settings if user feedback requests it

## Commits

1. **097fc02** - feat(15-03): create classification override modal UI
   - ClassificationModal with domain dropdown and action buttons
   - Displays item info, suggested domain with confidence, reasoning
   - Collapsible domain guide with domain definitions
   - Accessibility: labels, ARIA roles
   - Files: src/ui/classification-modal.ts

2. **58da119** - feat(15-04): add enrichment queue states to registry
   - [15-03 Task 2] Updated evidence extractor with transcript extraction
   - Added TranscriptExtractor as constructor dependency
   - Transcript extraction positioned between PDF fulltext and notes
   - Graceful fallback on extraction failure
   - Files: src/services/evidence-extractor.ts (among others)

3. **acafa9d** - feat(15-03): implement re-classification command
   - ReclassifyCommand class for post-enrichment domain changes
   - Loads current domain from note frontmatter
   - Re-classifies with DomainClassifier and fresh evidence
   - Shows ClassificationModal for user override
   - Updates frontmatter with new knowledge_domain
   - Registered reclassify-item command in plugin
   - Files: src/commands/reclassify-command.ts, src/main.ts

4. **2a3b5f3** - fix(15-03): correct ZoteroItem import in reclassify-command
   - Fixed import path to match NoteGenerator type expectations
   - Files: src/commands/reclassify-command.ts

---

**Duration:** 3.5 hours (with checkpoint pause)
**Tasks Completed:** 3/3
**Lines of Code:** ~423 (modal: 226, reclassify: 197, main registration: ~78, evidence-extractor updates: ~60)
**Dependencies:** Phase 15-01 (TranscriptExtractor), Phase 15-02 (DomainClassifier), Phase 14-05 (EvidenceExtractor)
**Next:** Phase 15-04 (Diagnostic Notes & Deferred Queue) - Already complete
**Next Major Phase:** Phase 16 (Accept Workflow Integration)
