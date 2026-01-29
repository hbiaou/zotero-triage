---
phase: quick-006
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/seed-paper-picker.ts
  - src/db/zotero-connector.ts
autonomous: true

must_haves:
  truths:
    - "Video Recording appears as filter option in seed picker dropdown"
    - "Video recordings with director/presenter creators show populated author field"
    - "Existing author/editor creator handling continues to work unchanged"
  artifacts:
    - path: "src/ui/seed-paper-picker.ts"
      provides: "Item type filter including videoRecording option"
      contains: "videoRecording"
    - path: "src/db/zotero-connector.ts"
      provides: "Creator type handling including director"
      contains: "director"
  key_links:
    - from: "src/ui/seed-paper-picker.ts"
      to: "videoRecording items in Zotero database"
      via: "item type filter dropdown"
      pattern: "videoRecording"
    - from: "src/db/zotero-connector.ts"
      to: "creatorType field in Zotero schema"
      via: "CREATORS_QUERY processing"
      pattern: "creatorType.*director"
---

<objective>
Add videoRecording support to item type filters and map video creator fields to author field.

Purpose: Enable users to filter and process video recordings (YouTube lectures, tutorials) in their Zotero library, ensuring creators (YouTube channels, presenters, directors) populate the author field correctly.

Output: Video Recording filter option in seed picker, enhanced creator type handling for video content.
</objective>

<execution_context>
@C:\Users\Biaou\.claude\get-shit-done\workflows\execute-plan.md
@C:\Users\Biaou\.claude\get-shit-done\templates\summary.md
</execution_context>

<context>
@.planning\PROJECT.md
@.planning\STATE.md

## Existing Pattern

The seed paper picker (src/ui/seed-paper-picker.ts) has an item type filter dropdown with hardcoded options: Journal Article, Book, Conference Paper.

Creator handling in src/db/zotero-connector.ts (lines 446-449) currently filters to only 'author' and 'editor' creator types, excluding other creator types like 'director', 'presenter', 'contributor' used by video recordings.

Zotero's videoRecording item type uses:
- director (primary creator type for videos)
- presenter (for lectures, tutorials)
- contributor (general creators)

## Current State

Database has 900+ videoRecording items (from tmp/extension_report.json verification).
Users can't filter to video recordings in seed selection.
Video recordings appear with empty author fields because director/presenter creators are filtered out.
</context>

<tasks>

<task type="auto">
  <name>Add videoRecording to item type filter dropdown</name>
  <files>src/ui/seed-paper-picker.ts</files>
  <action>
In renderFilters() method, after line 138 (conferencePaper option), add:

```typescript
typeSelect.createEl('option', { text: 'Video Recording', value: 'videoRecording' });
```

This adds videoRecording as the fourth option in the item type filter, enabling users to filter their library to video content (YouTube lectures, tutorials, recorded presentations).

Place it after conferencePaper to maintain alphabetical ordering of common academic item types.
  </action>
  <verify>
1. Read src/ui/seed-paper-picker.ts lines 133-143
2. Confirm videoRecording option exists after conferencePaper
3. Run: npm run build (should compile without errors)
  </verify>
  <done>Item type filter dropdown includes "Video Recording" option with value "videoRecording"</done>
</task>

<task type="auto">
  <name>Expand creator type handling for video recordings</name>
  <files>src/db/zotero-connector.ts</files>
  <action>
In loadItems() method, update the creator filtering logic (lines 446-449).

Current code:
```typescript
// Only include authors and editors, not translators etc.
if (creator.creatorType === 'author' || creator.creatorType === 'editor') {
  authors.push(formatCreator(creator));
}
```

Replace with:
```typescript
// Include primary creator types: author, editor (standard), director, presenter (videos)
if (creator.creatorType === 'author' ||
    creator.creatorType === 'editor' ||
    creator.creatorType === 'director' ||
    creator.creatorType === 'presenter') {
  authors.push(formatCreator(creator));
}
```

This maps video recording creators (director, presenter) to the authors array, ensuring YouTube channels and video instructors appear in the author field.

**Why these four types:**
- author: Standard for articles, books
- editor: Standard for edited volumes
- director: Zotero's primary creator for videoRecording items
- presenter: Used for lectures, tutorials, talks

**Why not contributor:** Too generic, applied to many item types for secondary roles (not primary creators).
  </action>
  <verify>
1. Read src/db/zotero-connector.ts lines 445-451
2. Confirm logic includes director and presenter creator types
3. Run: npm run build (should compile without errors)
4. Test: Filter to videoRecording in seed picker, verify items show populated author fields
  </verify>
  <done>Creator type handling expanded to include director and presenter, video recordings show populated author fields</done>
</task>

</tasks>

<verification>
1. Build compiles: `npm run build` exits 0
2. Seed picker UI shows "Video Recording" as filter option
3. Selecting "Video Recording" filter displays video items from library
4. Video recording items show creator names in author field (not empty)
5. Existing journal articles, books, conference papers continue to work unchanged
</verification>

<success_criteria>
- [ ] "Video Recording" appears in item type filter dropdown
- [ ] Filtering by videoRecording displays video items with populated author fields
- [ ] Director and presenter creator types mapped to authors array
- [ ] No TypeScript compilation errors
- [ ] Existing item type filters (journal, book, conference) unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/006-add-video-recording-support-to-item-type/006-SUMMARY.md`
</output>
