---
phase: quick-003
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - styles.css
  - src/ui/seed-paper-picker.ts
  - src/ui/setup-wizard-modal.ts
autonomous: true

must_haves:
  truths:
    - "Wizard modal displays without horizontal scrollbar at all viewport widths"
    - "User can type in search input in seed picker within wizard"
    - "Search filtering works in real-time as user types"
  artifacts:
    - path: "styles.css"
      provides: "Modal max-width constraints preventing horizontal overflow"
      contains: ".modal.zotero-triage-wizard"
    - path: "src/ui/seed-paper-picker.ts"
      provides: "Search input value persistence across re-renders"
      contains: "this.searchInput.value = this.searchQuery"
  key_links:
    - from: "styles.css"
      to: "SetupWizardModal DOM"
      via: ".modal.zotero-triage-wizard CSS selector"
      pattern: "\\.modal\\.zotero-triage-wizard"
    - from: "SeedPaperPicker"
      to: "searchInput DOM element"
      via: "value restoration after render"
      pattern: "searchInput\\.value.*searchQuery"
---

<objective>
Fix wizard modal sizing and search input functionality in the triage setup wizard.

Purpose: Resolve two critical UX issues preventing users from completing onboarding workflow - horizontal scrollbar making content difficult to access and non-functional search preventing efficient seed paper selection.

Output: Responsive wizard modal without horizontal scroll, functional search input that accepts typing and filters in real-time.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

# Prior work on modal sizing and search
@.planning/phases/08-ux-enhancements-(progress-&-validation)/08-03-SUMMARY.md

# Files needing fixes
@styles.css
@src/ui/seed-paper-picker.ts
@src/ui/setup-wizard-modal.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix wizard modal sizing to prevent horizontal scroll</name>
  <files>
    styles.css
  </files>
  <action>
    The current CSS rule `.zotero-triage-wizard` (line 431) targets the modal content div but not the actual modal element itself. The modal wrapper needs responsive sizing.

    Investigation shows Obsidian Modal adds `.modal` class to the outer modal container. The wizard adds `.zotero-triage-wizard` class to contentEl (inside the modal).

    Fix:
    1. Add new CSS rule BEFORE line 431: `.modal.zotero-triage-wizard { max-width: 90vw !important; width: 90vw; }`
    2. This targets the modal wrapper itself (which has both `.modal` and `.zotero-triage-wizard` classes when our modal is open)
    3. Use !important to override Obsidian's default modal sizing
    4. Keep existing `.zotero-triage-wizard` rule for content area styling

    Why this pattern: Obsidian Modal class structure is `.modal` (wrapper) -> `.modal-content` -> our contentEl. We need to constrain the wrapper, not just contentEl.
  </action>
  <verify>
    1. Read styles.css and confirm new rule exists before line 431
    2. Grep for pattern `\\.modal\\.zotero-triage-wizard.*max-width.*90vw`
  </verify>
  <done>
    CSS rule `.modal.zotero-triage-wizard` exists targeting modal wrapper with max-width: 90vw and !important override
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix search input value persistence in seed picker</name>
  <files>
    src/ui/seed-paper-picker.ts
  </files>
  <action>
    The search input is recreated on every render (lines 158-162 in renderSearchFilter method) but value restoration happens BEFORE the input event listener is attached (lines 165-167).

    Current problem:
    - Line 165-167: Restores value if searchQuery exists
    - But this happens during creation, not after re-render from user typing
    - When user types, input event fires, searchQuery updates, applyFilters() calls render(), which recreates input WITHOUT the typed value

    Fix in renderSearchFilter() method (after line 172):
    ```typescript
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.applyFilters();
    });

    // NEW: Force value restoration after event listener attached
    // This ensures value persists across re-renders triggered by typing
    if (this.searchInput && this.searchQuery) {
      this.searchInput.value = this.searchQuery;
    }
    ```

    Why: The searchQuery state is preserved across renders, but the DOM element is new. Must explicitly sync DOM element value from state EVERY render, not just conditionally on initial creation.
  </action>
  <verify>
    1. Read src/ui/seed-paper-picker.ts and confirm value restoration happens after event listener (after line 172)
    2. Grep for pattern `this\.searchInput\.value.*this\.searchQuery` in the file
    3. Verify it appears AFTER the addEventListener block
  </verify>
  <done>
    Search input value is restored from this.searchQuery state after event listener attachment, ensuring typed text survives component re-renders
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Fixed wizard modal responsive sizing (max-width: 90vw on modal wrapper) and search input value persistence (restore from state after every render).
  </what-built>
  <how-to-verify>
    1. Start Obsidian and trigger setup wizard (you may need to reset plugin settings or use dev tools)
    2. Navigate to Step 3 (Seed Papers selection)
    3. **Test modal sizing:**
       - Check for horizontal scrollbar at bottom of modal
       - Resize window to narrow width (800px, 1024px)
       - Modal should scale responsively without horizontal scroll
    4. **Test search input:**
       - Click in search input field at top of seed picker
       - Type a few characters (e.g., "machine")
       - Verify text appears in input as you type
       - Verify paper list filters in real-time showing matching results
       - Type more characters, verify filtering continues to work
    5. **Test interaction:**
       - With search query active, click a paper to select it
       - Verify search input still contains your query after selection
       - Verify paper list still shows filtered results
  </how-to-verify>
  <resume-signal>
    Type "approved" if both issues are fixed (no horizontal scroll, search input accepts typing), or describe any remaining issues.
  </resume-signal>
</task>

</tasks>

<verification>
- Wizard modal displays at 90vw max-width without horizontal scrollbar
- Search input in seed picker accepts keyboard input
- Filtering works in real-time as user types
- Search query persists when user selects papers (doesn't clear on re-render)
</verification>

<success_criteria>
- Modal sizing: `.modal.zotero-triage-wizard` CSS rule constrains modal wrapper to 90vw
- Search input: Value restored from this.searchQuery state after every render
- User can complete onboarding workflow without UI frustration
- Search filtering enables efficient seed paper selection from large libraries
</success_criteria>

<output>
After completion, create `.planning/quick/003-1-the-issue-with-the-triage-setup-wizard/003-SUMMARY.md`
</output>
