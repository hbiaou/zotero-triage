---
phase: quick-012
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main.ts
  - src/settings.ts
autonomous: true

must_haves:
  truths:
    - "First-time users see no database connection warning before profile configuration"
    - "Database connection failures are silently handled when profile doesn't exist"
    - "Users with configured profiles still see database connection errors (for troubleshooting)"
  artifacts:
    - path: "src/main.ts"
      provides: "Silent error handling in showSetupWizard() when no profile exists"
      min_lines: 2
      pattern: "hasProfile.*Database connection failed"
    - path: "src/settings.ts"
      provides: "Silent error handling in both wizard button handlers"
      min_lines: 2
      pattern: "hasProfile.*Database connection failed"
  key_links:
    - from: "main.ts:showSetupWizard()"
      to: "profileService.hasProfile()"
      via: "conditional notice display"
      pattern: "hasProfile.*new Notice"
    - from: "settings.ts button handlers"
      to: "profileService.hasProfile()"
      via: "conditional notice display"
      pattern: "hasProfile.*new Notice"
---

<objective>
Suppress database connection warning when profile is not yet configured.

Purpose: First-time users should not see confusing database connection errors before they've had a chance to configure their Zotero database path. The warning "Database connection failed: Zotero database path not configured. Please configure in settings." is normal and expected for unconfigured users, but creates confusion and anxiety.

Output: Silent error handling for first-time users, while preserving error visibility for users with configured profiles (for troubleshooting).
</objective>

<execution_context>
@C:\Users\Biaou\.claude\get-shit-done\workflows\execute-plan.md
@C:\Users\Biaou\.claude\get-shit-done\templates\summary.md
</execution_context>

<context>
@C:\1GitRepos\zotero-triage\.planning\PROJECT.md
@C:\1GitRepos\zotero-triage\.planning\STATE.md
@C:\1GitRepos\zotero-triage\src\main.ts
@C:\1GitRepos\zotero-triage\src\settings.ts
</context>

<tasks>

<task type="auto">
  <name>Add conditional notice logic for database connection failures</name>
  <files>
    src/main.ts
    src/settings.ts
  </files>
  <action>
Add conditional logic to suppress database connection notices when profile doesn't exist.

**Location 1: main.ts line 398** (in `showSetupWizard()` method)

Replace:
```typescript
} catch (err) {
  // Connection failed - show notice and skip preflight (go straight to wizard)
  const message = err instanceof Error ? err.message : String(err);
  new Notice(`Database connection failed: ${message}`);
  // Open wizard in disconnected state
  this.openSetupWizardAfterPreflight();
  return;
}
```

With:
```typescript
} catch (err) {
  // Connection failed - skip preflight (go straight to wizard)
  // Only show notice if profile exists (troubleshooting mode)
  // Silent for first-time users (profile not configured = expected state)
  if (this.profileService.hasProfile()) {
    const message = err instanceof Error ? err.message : String(err);
    new Notice(`Database connection failed: ${message}`);
  }
  // Open wizard in disconnected state
  this.openSetupWizardAfterPreflight();
  return;
}
```

**Location 2: settings.ts line 196** (in "Run Setup Wizard" button handler)

Replace:
```typescript
} catch (err) {
  // Connection failed - show notice and skip preflight
  const message = err instanceof Error ? err.message : String(err);
  new Notice(`Database connection failed: ${message}`);
  // Open wizard in disconnected state
```

With:
```typescript
} catch (err) {
  // Connection failed - skip preflight
  // Only show notice if profile exists (troubleshooting mode)
  if (profileService?.hasProfile()) {
    const message = err instanceof Error ? err.message : String(err);
    new Notice(`Database connection failed: ${message}`);
  }
  // Open wizard in disconnected state
```

**Location 3: settings.ts line 283** (in "Reconfigure Profile" button handler)

Replace:
```typescript
} catch (err) {
  // Connection failed - show notice and skip preflight
  const message = err instanceof Error ? err.message : String(err);
  new Notice(`Database connection failed: ${message}`);
  // Open wizard in disconnected state
```

With:
```typescript
} catch (err) {
  // Connection failed - skip preflight
  // Only show notice if profile exists (troubleshooting mode)
  if (profileService?.hasProfile()) {
    const message = err instanceof Error ? err.message : String(err);
    new Notice(`Database connection failed: ${message}`);
  }
  // Open wizard in disconnected state
```

**Why this approach:**
- First-time users (no profile) get silent, smooth onboarding experience
- Users with configured profiles see errors for troubleshooting
- Preserves existing error handling flow (skip preflight, open wizard)
- No new methods or complexity - just conditional notice display
  </action>
  <verify>
1. Build the plugin: `npm run build`
2. Grep for the updated pattern: `grep -n "hasProfile.*Database connection failed" src/main.ts src/settings.ts`
3. Verify all three locations now check `hasProfile()` before showing Notice
4. Test: Delete zoteroDbPath from settings, reload plugin - should see NO database error notice before wizard opens
  </verify>
  <done>
- All three catch blocks check `hasProfile()` before displaying Notice
- First-time users (no profile) see no database connection warning
- Users with profiles still see connection errors for troubleshooting
- Build completes successfully with no TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. **Code pattern verification:**
   ```bash
   grep -A2 -B2 "hasProfile.*Database connection failed" src/main.ts src/settings.ts
   ```
   Should find all three locations with conditional notice logic

2. **Build verification:**
   ```bash
   npm run build
   ```
   Should complete without errors

3. **Manual test (first-time user simulation):**
   - Open Obsidian developer console
   - Check current settings: `app.plugins.plugins['zotero-triage'].settings`
   - Remove zoteroDbPath: `app.plugins.plugins['zotero-triage'].settings.zoteroDbPath = ''`
   - Save: `await app.plugins.plugins['zotero-triage'].saveSettings()`
   - Remove profile: `app.plugins.plugins['zotero-triage'].profileService.profile = null`
   - Trigger wizard: `await app.plugins.plugins['zotero-triage'].showSetupWizard()`
   - Expected: Wizard opens with NO error notice displayed

4. **Existing profile test:**
   - With configured profile and valid database path
   - Temporarily break database path in settings
   - Trigger wizard
   - Expected: Notice DOES appear (troubleshooting mode)
</verification>

<success_criteria>
- [ ] main.ts line ~398 has conditional notice logic checking `hasProfile()`
- [ ] settings.ts line ~196 has conditional notice logic checking `hasProfile()`
- [ ] settings.ts line ~283 has conditional notice logic checking `hasProfile()`
- [ ] Build succeeds with no TypeScript errors
- [ ] First-time users (no profile) see no database connection warning
- [ ] Users with existing profiles still see connection errors
- [ ] Comments updated to reflect "troubleshooting mode" rationale
</success_criteria>

<output>
After completion, create `.planning/quick/012-suppress-database-connection-warning-whe/012-SUMMARY.md`
</output>
