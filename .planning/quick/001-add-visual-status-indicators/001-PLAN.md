---
type: quick
plan: 001
wave: 1
depends_on: []
files_modified:
  - src/ui/triage-card.ts
  - styles.css
autonomous: true

must_haves:
  truths:
    - User can visually distinguish Accept/Defer/Reject status on triage cards
    - Status indicators appear immediately when user clicks action button
    - Visual feedback persists until card is removed from batch
  artifacts:
    - path: src/ui/triage-card.ts
      provides: Status badge rendering in card header
      exports: ["createTriageCard", "updateCardStatus"]
    - path: styles.css
      provides: Visual styling for status badges
      contains: ".status-badge"
  key_links:
    - from: src/ui/triage-view.ts
      to: src/ui/triage-card.ts
      via: "call updateCardStatus after registry.markState"
      pattern: "updateCardStatus.*itemID"
---

<objective>
Add visual status indicators (Accept/Defer/Reject badges) to triage cards so users can see at a glance which items they've processed in the current batch.

Purpose: Improve batch processing workflow by providing immediate visual feedback when users triage items, reducing cognitive load during processing sessions.

Output: Status badges appear on cards after user actions, persisting until batch completion or undo.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

Current implementation:
- Triage cards render with action buttons (Accept/Defer/Reject)
- Actions update registry state and increment processedCount
- Cards remain visible until batch completion (processedCount >= items.length)
- No visual feedback on cards to show which items have been processed

Registry states: 'unseen' | 'proposed' | 'accepted' | 'rejected' | 'deferred' | 'imported'

Existing UI pattern: Validation warnings show in card header as badges
</context>

<tasks>

<task type="auto">
  <name>Add status badge rendering to triage cards</name>
  <files>
    src/ui/triage-card.ts
    styles.css
  </files>
  <action>
Create updateCardStatus function that adds/updates status badge in card header:

1. In src/ui/triage-card.ts:
   - Export new function: `updateCardStatus(card: HTMLElement, state: RegistryState)`
   - Function locates .triage-card-header element in the card
   - Removes any existing .status-badge element
   - For states 'accepted', 'rejected', 'deferred': creates new .status-badge span
   - Badge text: 'Accepted' (green), 'Deferred' (neutral), 'Rejected' (red)
   - Badge uses status-specific CSS classes: .status-badge-accepted, .status-badge-deferred, .status-badge-rejected
   - For other states (unseen, proposed, imported): no badge rendered

2. Add data-item-id attribute to card element in createTriageCard:
   - Store item.itemID as data attribute: `card.dataset.itemId = String(item.itemID)`
   - Enables easy card lookup in triage-view

3. In styles.css (after .validation-warning-badge section):
   - .status-badge: Base styles (inline-block, padding 4px 10px, border-radius 4px, font-size 0.75em, font-weight 500, margin-left 8px)
   - .status-badge-accepted: background var(--interactive-success), color white
   - .status-badge-deferred: background var(--background-modifier-border), color var(--text-muted)
   - .status-badge-rejected: background var(--text-error), color white

Why this approach: Reuses existing badge pattern from validation warnings, minimal UI disruption, visually distinct from item-type-badge.
  </action>
  <verify>
1. Read src/ui/triage-card.ts and confirm updateCardStatus function exists and exports
2. Read styles.css and confirm .status-badge styles exist
3. Verify data-item-id attribute added to card element
  </verify>
  <done>
updateCardStatus function exported from triage-card.ts, status badge CSS classes defined, cards have data-item-id attribute for lookup
  </done>
</task>

<task type="auto">
  <name>Wire status updates into triage view actions</name>
  <files>
    src/ui/triage-view.ts
  </files>
  <action>
Update handleAccept, handleReject, handleDefer methods to show status badges:

1. Import updateCardStatus at top of file:
   `import { createTriageCard, updateCardStatus } from './triage-card';`

2. In performAccept (after registry.markState call):
   - Locate card element: `const card = this.containerEl.querySelector(\`[data-item-id="${item.itemID}"]\`) as HTMLElement`
   - If card exists: call `updateCardStatus(card, 'accepted')`

3. In handleReject (after registry.markState call):
   - Locate card element same way
   - If card exists: call `updateCardStatus(card, 'rejected')`

4. In handleDefer (after registry.markState call):
   - Locate card element same way
   - If card exists: call `updateCardStatus(card, 'deferred')`

5. In undoAction (after registry.markState revert):
   - Locate card element: `const card = this.containerEl.querySelector(\`[data-item-id="${undoState.itemId}"]\`) as HTMLElement`
   - If card exists: call `updateCardStatus(card, undoState.previousState)` to remove badge

Why querySelector approach: Cards remain in DOM until batch completion, simple direct DOM manipulation without full re-render.
  </action>
  <verify>
1. Read src/ui/triage-view.ts and confirm updateCardStatus imported and called in all action handlers
2. Verify undo action clears status badges by passing previousState
3. Check that card lookups use data-item-id attribute
  </verify>
  <done>
Action handlers call updateCardStatus after registry updates, status badges appear/disappear based on current registry state, undo removes badges correctly
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Visual status indicators (badges) that appear on triage cards when users Accept/Defer/Reject items during batch processing
  </what-built>
  <how-to-verify>
1. Start Obsidian with the plugin enabled
2. Open ZotBridge Triage view (ribbon icon or command palette)
3. Click "Generate Batch" to load items
4. Test each action and verify visual feedback:
   - Click "Accept" on first item → Green "Accepted" badge appears in card header
   - Click "Defer" on second item → Gray "Deferred" badge appears
   - Click "Reject" on third item → Red "Rejected" badge appears
5. Test undo functionality:
   - Wait for undo toast to appear after any action
   - Click "Undo" → Badge should disappear from card
6. Verify badge positioning:
   - Badges should appear next to item type badge in header
   - Should not overlap with validation warning badges (if any)
   - Should use theme colors (test in light/dark themes if possible)

Expected: Status badges provide immediate, color-coded visual feedback showing which items have been processed in the current batch
  </how-to-verify>
  <resume-signal>
Type "approved" if status indicators work correctly, or describe any issues with positioning, colors, or behavior
  </resume-signal>
</task>

</tasks>

<verification>
Overall checks:
- [ ] Status badges render correctly for all three states (accepted/deferred/rejected)
- [ ] Badges use appropriate colors (green/gray/red)
- [ ] updateCardStatus function properly handles state transitions
- [ ] Undo action correctly removes status badges
- [ ] No TypeScript compilation errors
- [ ] Styles use Obsidian CSS variables for theme compatibility
</verification>

<success_criteria>
1. User clicks Accept/Defer/Reject and sees immediate badge feedback on card
2. Badge colors match action semantics (green=accepted, gray=deferred, red=rejected)
3. Undo removes badges by restoring previous state (typically removing badge)
4. Badges coexist with validation warnings without layout issues
5. Implementation uses existing card header badge pattern for consistency
</success_criteria>

<output>
After completion, create `.planning/quick/001-add-visual-status-indicators/001-SUMMARY.md`
</output>
