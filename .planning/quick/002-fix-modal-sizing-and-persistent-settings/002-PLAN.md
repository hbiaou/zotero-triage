---
phase: quick-002
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - styles.css
  - src/ui/triage-view.ts
autonomous: true

must_haves:
  truths:
    - "Modal content is fully visible with scrolling when needed"
    - "Settings warning disappears after successful database configuration"
    - "Wizard and batch processing modals show all buttons and content"
  artifacts:
    - path: "styles.css"
      provides: "Modal scrolling and sizing rules"
      contains: ".modal-content"
    - path: "src/ui/triage-view.ts"
      provides: "Conditional rendering based on connection state"
      contains: "connector.itemsLoaded"
  key_links:
    - from: "styles.css"
      to: ".zotero-triage-wizard"
      via: "max-height and overflow-y rules"
      pattern: "max-height.*overflow-y"
    - from: "src/ui/triage-view.ts"
      to: "triage-view rendering"
      via: "connection state check"
      pattern: "connector\\.itemsLoaded"
---

<objective>
Fix modal content clipping and persistent settings warning.

Purpose: Improve UX by ensuring all modal content is accessible and status messages accurately reflect current state.
Output: Modals scroll properly when content overflows, settings warning only shows when database is not configured.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

# Related files
@src/ui/setup-wizard-modal.ts
@src/ui/triage-view.ts
@src/settings.ts
@styles.css
</context>

<tasks>

<task type="auto">
  <name>Fix modal sizing and scrolling</name>
  <files>styles.css</files>
  <action>
Add proper modal content sizing and overflow handling to prevent content clipping:

1. Add `.modal-content` rule (Obsidian's modal content wrapper):
   - `max-height: 80vh` - Prevent modal from exceeding viewport
   - `overflow-y: auto` - Enable scrolling when content overflows
   - `padding: 20px` - Consistent internal spacing

2. Update `.zotero-triage-wizard`:
   - Remove `min-height: 500px` (causes fixed height issues)
   - Keep `min-width: 600px` for horizontal sizing
   - Add `max-height: 80vh` for viewport-relative sizing

3. Update `.wizard-step-content`:
   - Change `min-height: 300px` to `min-height: 200px` (less aggressive)
   - Add `max-height: none` to allow natural sizing

Why: Current CSS forces fixed heights without overflow handling, causing buttons to be clipped when content exceeds container. Using vh units and overflow-y ensures all content is accessible via scrolling.
  </action>
  <verify>
1. Build plugin: `npm run build`
2. Visually inspect wizard modal (Settings → Run Setup Wizard)
3. Verify all steps show complete content and buttons are visible
4. Test scrolling works when content overflows
  </verify>
  <done>
- Wizard modal displays all content without clipping
- Buttons visible on all wizard steps
- Modal scrolls when content exceeds viewport height
  </done>
</task>

<task type="auto">
  <name>Fix persistent settings warning</name>
  <files>src/ui/triage-view.ts</files>
  <action>
Replace the database path check with a connection state check to accurately reflect when database is configured AND accessible:

In `onOpen()` method (lines 56-72):

CURRENT (incorrect):
```typescript
// Check if database is configured
if (!this.plugin.settings.zoteroDbPath) {
  container.createDiv({
    cls: 'zotero-triage-empty-state',
    text: 'Please configure Zotero database path in settings'
  });
  return;
}
```

REPLACE WITH (correct):
```typescript
// Check if database is configured and connected
if (!this.plugin.settings.zoteroDbPath || !this.plugin.connector.itemsLoaded) {
  const message = !this.plugin.settings.zoteroDbPath
    ? 'Please configure Zotero database path in settings'
    : 'Click "Generate Batch" to load items from Zotero';

  container.createDiv({
    cls: 'zotero-triage-empty-state',
    text: message
  });
  return;
}
```

Why: The current check only validates `zoteroDbPath` exists but doesn't verify the database is actually connected. This causes the warning to persist even after successful configuration. The connector's `itemsLoaded` property accurately reflects whether the database connection succeeded.
  </action>
  <verify>
1. Build plugin: `npm run build`
2. Reload Obsidian plugin
3. Open Triage view before configuring database → should show "Please configure..."
4. Configure database path in settings
5. Open Triage view again → should show "Click Generate Batch..." (not the settings warning)
  </verify>
  <done>
- Settings warning ("Please configure...") only shows when zoteroDbPath is empty
- After database configuration, view shows appropriate next-step message
- No persistent warning after successful configuration
  </done>
</task>

</tasks>

<verification>
**Manual testing:**
1. Fresh state: Verify settings warning shows when no database configured
2. Post-config: Verify warning disappears after database path set
3. Modal sizing: Open setup wizard, verify all content visible with scrolling
4. Batch modal: Generate batch, verify all buttons visible

**Edge cases:**
- Very long wizard content (many items in seed picker) → should scroll
- Short content → should not have unnecessary scrolling
</verification>

<success_criteria>
- [ ] Wizard modal shows all buttons and content (no clipping)
- [ ] Modal scrolls when content exceeds viewport height
- [ ] Settings warning only shows when zoteroDbPath is empty
- [ ] After database configuration, appropriate next-step message appears
- [ ] No visual regression in other modals (preview, override, error)
</success_criteria>

<output>
After completion, create `.planning/quick/002-fix-modal-sizing-and-persistent-settings/002-SUMMARY.md`
</output>
