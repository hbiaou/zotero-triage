---
phase: quick-007
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/db/zotero-connector.ts
autonomous: true

must_haves:
  truths:
    - "Video recordings with creators in Zotero database show actual creator names (not 'Unknown authors')"
    - "Seed picker displays proper creator names for video recording items"
  artifacts:
    - path: "src/db/zotero-connector.ts"
      provides: "Creator type filtering logic"
      min_lines: 450
  key_links:
    - from: "src/db/zotero-connector.ts"
      to: "CREATORS_QUERY"
      via: "SQL query execution with creator type filtering"
      pattern: "creator\\.creatorType === '(author|editor|director|presenter)'"
---

<objective>
Debug and fix the "Unknown authors" issue for video recording items in the seed picker.

Purpose: Ensure video recordings (YouTube videos) display their actual creator information instead of "Unknown authors", improving usability of the seed picker for diverse item types.

Output: Video recordings display proper creator names based on actual Zotero database structure.
</objective>

<execution_context>
@C:\Users\Biaou\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\Biaou\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/db/zotero-connector.ts
@src/db/queries.ts
@src/ui/seed-paper-picker.ts

## Background
Quick task 006 added 'director' and 'presenter' to the creator type filter in zotero-connector.ts (lines 447-450), but video recordings still show "Unknown authors" in the seed picker. The issue is likely that:
1. Video recording items use different creator types than expected
2. The creator data is stored differently or in different fields
3. There may be additional creator types we haven't considered

The seed picker displays "Unknown authors" when `item.authors.length === 0` (seed-paper-picker.ts line 330).
</context>

<tasks>

<task type="auto">
  <name>Investigate actual creator types in Zotero database</name>
  <files>src/db/zotero-connector.ts</files>
  <action>
    Add temporary debug logging to the loadItems() method (around line 446) to investigate what creator types actually exist for videoRecording items:

    1. Before the creator type filtering, log ALL creators for videoRecording items:
       - Log creatorType for each creator found
       - Log whether the item is a videoRecording
       - Log the item title for identification

    2. This will reveal what creator types Zotero actually uses for video recordings

    3. Add a comment noting this is debug code for quick task 007

    Why: We need to see actual data to understand why creators aren't being captured. The 'director' and 'presenter' types may not be what Zotero uses, or there may be other types we need to include.
  </action>
  <verify>
    1. npm run dev (rebuild)
    2. Open Obsidian and reload the plugin
    3. Open the setup wizard and check the console output
    4. Console should show creator types for all video recording items
  </verify>
  <done>
    Debug logging active and showing actual creator types from database for video recordings
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Debug logging to reveal actual creator types in Zotero database</what-built>
  <how-to-verify>
    1. Open Obsidian Developer Tools (Ctrl+Shift+I)
    2. Go to Console tab
    3. Open the plugin's setup wizard (or trigger loadItems() however you prefer)
    4. Look for debug output showing:
       - Which items are videoRecording type
       - What creator types exist for those items (e.g., 'author', 'contributor', 'castMember', etc.)
       - Item titles to cross-reference with your Zotero library
    5. Report back what creator types are actually present for video recordings

    Examples to look for:
    - Is it using 'contributor' instead of 'presenter'?
    - Is it using 'castMember', 'producer', 'scriptwriter'?
    - Are there ANY creators at all, or is the field empty?
    - Could the channel name be in a different field (like 'seriesTitle' or 'extra')?
  </how-to-verify>
  <resume-signal>
    Report the actual creator types found. Format: "videoRecording items use: [list of creator types]" or "No creators found, channel name is in [field]" or "No creator data at all"
  </resume-signal>
</task>

<task type="auto">
  <name>Fix creator type filtering based on findings</name>
  <files>src/db/zotero-connector.ts</files>
  <action>
    Based on the debug findings from checkpoint:

    1. Update the creator type filtering logic (lines 447-450) to include the ACTUAL creator types used by Zotero for video recordings

    2. If creators don't exist but channel name is in a different field:
       - We'll need a different approach (extract from title, URL, or extra field)
       - This may require modifying how we populate the authors array for videoRecording items

    3. Remove the debug logging added in Task 1 (clean up temporary code)

    4. Add a comment explaining which creator types are included and why (referencing this quick task)

    Why: The fix depends entirely on what the database actually contains. We can't guess - we need real data from the checkpoint.
  </action>
  <verify>
    1. npm run dev (rebuild)
    2. Open Obsidian and reload plugin
    3. Open setup wizard
    4. Filter by "Video Recording" type
    5. Video recordings should show actual creator names instead of "Unknown authors"
  </verify>
  <done>
    Video recordings display proper creator information in seed picker (no more "Unknown authors")
  </done>
</task>

</tasks>

<verification>
1. Build completes without errors
2. Video recordings show creator names (not "Unknown authors") in seed picker
3. Other item types (journalArticle, book, etc.) still work correctly
4. No regressions in creator display for non-video items
</verification>

<success_criteria>
- Video recording items display actual creator names in the seed picker
- The fix is based on actual Zotero database structure (not assumptions)
- No debug code remains in production
- Code includes explanatory comments about video recording creator types
</success_criteria>

<output>
After completion, create `.planning/quick/007-debug-and-fix-unknown-authors-issue-for-/007-SUMMARY.md`
</output>
