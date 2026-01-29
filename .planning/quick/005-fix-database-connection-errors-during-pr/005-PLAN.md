---
type: quick
task_id: "005"
directory: ".planning/quick/005-fix-database-connection-errors-during-pr"
autonomous: true
files_modified:
  - src/main.ts
---

# Quick Task 005: Fix Database Connection Errors During Preflight

## Problem

Preflight checks show "Database not connected" errors because the modal runs before ZoteroConnector completes initialization. The root cause is:

1. `ensureConnectorInitialized()` is fire-and-forget (doesn't await connection)
2. `PreflightModal` opens immediately after the fire-and-forget call
3. Preflight checks execute before database connection completes

## Solution

Replace the fire-and-forget `ensureConnectorInitialized()` call with `await ensureConnected()` before opening PreflightModal. This ensures the database is connected before preflight checks run.

## Context

@C:\1GitRepos\zotero-triage\src\main.ts
@C:\1GitRepos\zotero-triage\src\services\preflight-service.ts
@C:\1GitRepos\zotero-triage\src\ui\preflight-modal.ts

## Tasks

### Task 1: Make showSetupWizard async and await connection

**Files:** src/main.ts

**Action:**
1. Change `showSetupWizard()` signature from `private showSetupWizard(): void` to `private async showSetupWizard(): Promise<void>`
2. Replace `this.ensureConnectorInitialized();` call with `await this.ensureConnected();`
3. Wrap the `ensureConnected()` call in try-catch to handle connection errors gracefully
4. On connection error, show a notice and skip preflight (go straight to wizard with connection disabled state)

**Why this approach:**
- `ensureConnected()` already exists and properly waits for connection to complete
- `ensureConnectorInitialized()` was created as fire-and-forget wrapper because `showSetupWizard()` was sync
- Making `showSetupWizard()` async is appropriate since it already delays opening by 1000ms
- Graceful degradation ensures users can still see the wizard even if database connection fails

**Verify:**
1. Build succeeds: `npm run build`
2. No TypeScript errors
3. showSetupWizard is now async and awaits ensureConnected before creating PreflightModal

**Done:**
- showSetupWizard() is async
- Calls await ensureConnected() instead of ensureConnectorInitialized()
- Has try-catch for connection errors
- TypeScript compiles without errors

### Task 2: Update settings.ts to await connection before preflight

**Files:** src/settings.ts

**Action:**
1. Find both button handlers that call `this.plugin.ensureConnectorInitialized()` (reconfigure button ~line 191, "Re-run Setup Wizard" button ~line 249)
2. For each handler:
   - Check if handler is already async (if not, make it async)
   - Replace `this.plugin.ensureConnectorInitialized();` with `await this.plugin.ensureConnected();`
   - Wrap in try-catch to handle connection errors
   - On error, show notice and skip preflight (go straight to wizard)

**Why:**
- Same fix needed in settings panel where users manually trigger wizard
- Consistent error handling across all entry points

**Verify:**
1. Build succeeds: `npm run build`
2. Both button handlers are async and await ensureConnected
3. No TypeScript errors

**Done:**
- Settings panel button handlers updated
- Both locations await ensureConnected instead of ensureConnectorInitialized
- Consistent error handling with main.ts approach
- TypeScript compiles

### Task 3: Test connection flow and preflight checks

**Files:** N/A (manual testing)

**Action:**
1. Reload the plugin in Obsidian
2. Delete the profile data to trigger first-time setup: remove `.obsidian/plugins/zotero-triage/data.json` or clear the profile section
3. Open Obsidian and observe the preflight modal
4. Verify no "Database not connected" errors appear
5. Verify preflight checks complete successfully (trash count, duplicates count, groups check all show results)
6. Test the "Reconfigure Profile" button in settings to ensure it also works

**Why manual testing:**
- No automated tests exist for plugin initialization flow
- Preflight modal behavior requires visual confirmation
- Database connection timing is environment-dependent

**Verify:**
1. Preflight modal shows without "Database not connected" errors
2. All three checks (trash, duplicates, groups) complete with actual counts
3. Clicking "I Understand" proceeds to wizard
4. Settings panel "Reconfigure Profile" button also works without connection errors

**Done:**
- Manual testing confirms no connection errors
- Preflight checks show real data (not errors)
- Both entry points (auto-show + settings button) work correctly

## Success Criteria

- [ ] showSetupWizard() is async and awaits ensureConnected()
- [ ] Settings panel buttons await ensureConnected()
- [ ] Preflight modal displays without "Database not connected" errors
- [ ] All preflight checks complete successfully with actual data
- [ ] TypeScript compiles without errors
- [ ] Manual testing confirms fixes work for both entry points

## Notes

**Why not keep ensureConnectorInitialized()?**
- It was created as a workaround for sync contexts
- Now that we're making the calling contexts async, we can use the proper async `ensureConnected()` method
- This provides proper error handling and guarantees connection is ready

**Backward compatibility:**
- `ensureConnectorInitialized()` method can remain for other potential sync callers (none found in codebase currently)
- No breaking changes to public API

**Related quick task:**
- Task 004 fixed behavior when preflight *fails* (don't reopen onboarding)
- This task fixes why preflight was failing in the first place (database not connected)
