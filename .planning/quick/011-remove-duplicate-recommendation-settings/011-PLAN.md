---
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/profile-editor.ts
autonomous: true

must_haves:
  truths:
    - "User sees only ONE recommendation settings section in settings UI"
    - "Relevance vs Diversity and Recency Boost controls appear exactly once"
    - "Tag weight control remains accessible in main settings"
  artifacts:
    - path: "src/ui/profile-editor.ts"
      provides: "Profile editor without recommendation preferences duplicate"
      min_lines: 200
  key_links:
    - from: "src/settings.ts"
      to: "renderRecommendationSection()"
      via: "single source of recommendation settings"
      pattern: "renderRecommendationSection"
---

<objective>
Remove the duplicate "Recommendation Preferences" section from profile-editor.ts to eliminate UI confusion.

Purpose: Settings UI currently shows two sections with overlapping controls (Relevance vs Diversity appears twice, Recency Boost appears twice), creating confusion about which controls are authoritative.

Output: Clean settings UI with single "Recommendation Settings" section containing all recommendation controls.
</objective>

<execution_context>
@C:\Users\Biaou\.claude\get-shit-done\workflows\execute-plan.md
@C:\Users\Biaou\.claude\get-shit-done\templates\summary.md
</execution_context>

<context>
@C:\1GitRepos\zotero-triage\.planning\STATE.md
@C:\1GitRepos\zotero-triage\src\settings.ts
@C:\1GitRepos\zotero-triage\src\ui\profile-editor.ts

## Current Duplication

**settings.ts (lines 567-605)** - renderRecommendationSection():
- Relevance vs Diversity slider
- Recency boost toggle
- Tag weight slider

**profile-editor.ts (lines 233-263)** - renderPreferences():
- Relevance vs Diversity slider (duplicate)
- Recency Boost toggle (duplicate)

Profile editor is embedded in settings when profile exists (settings.ts line 370-378), causing both sections to appear.

## Resolution

Per Phase 12 Plan 01 decision: "Settings become single source of truth for recommendation preferences (not stored only in profile)"

Remove renderPreferences() section from profile-editor.ts since settings.ts already provides these controls.
</context>

<tasks>

<task type="auto">
  <name>Remove duplicate recommendation preferences from profile editor</name>
  <files>src/ui/profile-editor.ts</files>
  <action>
Remove the renderPreferences() method (lines 230-263) from ProfileEditor class.

Remove the call to this.renderPreferences() from the render() method (should be around line 76).

Keep only:
- renderSeedPapers() section
- renderKeywords() section

WHY: Phase 12 established settings.ts as single source of truth for recommendation preferences. The profile-editor should focus on profile-specific data (seed papers, extracted keywords), not duplicate global settings that already exist in settings.ts renderRecommendationSection().

DO NOT remove:
- renderSeedPapers() method or calls
- renderKeywords() method or calls
- Any profile data management logic
  </action>
  <verify>
1. Check that renderPreferences() method is completely removed
2. Check that this.renderPreferences() call is removed from render()
3. Build succeeds: npm run build
4. Verify profile-editor.ts still has renderSeedPapers() and renderKeywords()
  </verify>
  <done>
- renderPreferences() method deleted from profile-editor.ts
- this.renderPreferences() call removed from render() method
- Build passes without errors
- Profile editor retains seed papers and keywords sections
  </done>
</task>

</tasks>

<verification>
Manual verification after task completion:

1. Open Zotero Triage settings in Obsidian
2. Navigate to settings with profile configured
3. Verify only ONE "Recommendation Settings" section appears (from settings.ts)
4. Verify "Recommendation Preferences" duplicate section is gone
5. Verify Relevance vs Diversity and Recency Boost appear exactly once
6. Verify Tag weight control still present
7. Verify Profile Editor still shows seed papers and keywords sections
</verification>

<success_criteria>
- Only one recommendation settings section visible in settings UI
- Relevance vs Diversity appears once (in settings.ts section)
- Recency Boost appears once (in settings.ts section)
- Tag weight remains in settings.ts section
- Profile editor focuses on profile-specific data (seeds, keywords)
- No build errors
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/011-remove-duplicate-recommendation-settings/011-SUMMARY.md`
</output>
