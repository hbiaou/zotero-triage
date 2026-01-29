---
phase: quick-008
plan: "008"
type: execute
wave: 1
depends_on: []
files_modified:
  - src/profile/profile-initializer.ts
  - src/profile/profile-service.ts
autonomous: true

must_haves:
  truths:
    - "Profile persists immediately after onboarding completes"
    - "Profile signals (tags/authors/keywords) are saved to disk"
    - "Settings panel shows profile after completing wizard"
  artifacts:
    - path: "src/profile/profile-initializer.ts"
      provides: "Awaits profile save before returning"
      contains: "await this.profileService"
    - path: "src/profile/profile-service.ts"
      provides: "Immediate save method for critical operations"
      exports: ["updateProfileImmediate"]
  key_links:
    - from: "src/profile/profile-initializer.ts"
      to: "profileService.updateProfileImmediate()"
      via: "immediate save instead of debounced"
      pattern: "updateProfileImmediate"
---

<objective>
Fix profile not persisting after onboarding completion.

**Problem:** After completing the onboarding wizard, profile is created but signals (tags/authors/keywords) extracted from seed papers are lost because `updateProfile()` uses a debounced save (2-second delay). If the plugin unloads or user acts quickly, the debounced save never fires.

**Root cause:** `ProfileInitializer.initializeProfile()` line 97 calls `profileService.updateProfile(profile)` which triggers a debounced save, then returns immediately without waiting for the save to complete.

**Solution:** Add `updateProfileImmediate()` method to ProfileService for critical operations that must save synchronously, and use it in profile initialization.

Purpose: Ensure profile data persists reliably after onboarding
Output: Immediate profile persistence without relying on debounced saves
</objective>

<execution_context>
@C:\Users\Biaou\.claude\get-shit-done\workflows\execute-plan.md
@C:\Users\Biaou\.claude\get-shit-done\templates\summary.md
</execution_context>

<context>
@.planning\PROJECT.md
@.planning\STATE.md
@src\profile\profile-service.ts
@src\profile\profile-initializer.ts
@src\settings.ts

## Problem Analysis

**Current flow:**
1. Wizard completes → `finishWizard()` saves preferences to settings
2. Calls `onComplete(seedPaperIds)` callback
3. Callback invokes `profileInitializer.initializeProfile(seedPaperIds)`
4. `initializeProfile()` does:
   - Line 86-89: `profileService.createProfile()` - saves immediately ✓
   - Line 92-94: Mutates profile object (adds signals)
   - Line 97: `profileService.updateProfile(profile)` - debounced save ✗
   - Returns without awaiting the debounce

**Why it fails:**
- `updateProfile()` (line 123-142 in profile-service.ts) calls `this.debouncedSave()` which has a 2-second delay
- The delay is meant for frequent updates (like adaptive learning during triage)
- For critical one-time operations like profile initialization, debouncing is wrong
- If plugin unloads before 2 seconds, the save never happens

**Fix approach:**
- Add `updateProfileImmediate()` method that bypasses debounce
- Use it in `ProfileInitializer.initializeProfile()` for the signal update
- Keep existing `updateProfile()` for adaptive learning (where debouncing makes sense)
</context>

<tasks>

<task type="auto">
  <name>Add updateProfileImmediate() method to ProfileService</name>
  <files>src/profile/profile-service.ts</files>
  <action>
Add a new public method `updateProfileImmediate()` to ProfileService that updates the profile and saves immediately without debouncing.

Location: After line 142 (after existing `updateProfile()` method)

```typescript
/**
 * Update profile with partial updates (immediate save)
 * Use for critical operations that must persist immediately
 * For frequent updates during triage, use updateProfile() instead
 * @param updates - Partial profile data to merge
 */
async updateProfileImmediate(updates: Partial<UserProfile>): Promise<void> {
  const current = this.getProfile();
  if (!current) {
    throw new Error('Cannot update profile: no profile exists');
  }

  // Merge updates
  const updated: UserProfile = {
    ...current,
    ...updates,
    updatedAt: Date.now()
  };

  // Update settings
  const settings = (this.plugin as any).settings;
  settings.userProfile = this.serializeProfile(updated);

  // Immediate save (no debounce)
  await this.saveToSettings();
}
```

**Why this works:**
- Separate method makes intent clear (immediate vs debounced)
- Async signature allows caller to await completion
- Bypasses `debouncedSave()` and calls `saveToSettings()` directly
- Existing `updateProfile()` unchanged (adaptive learning still works)
  </action>
  <verify>
```bash
grep -A 20 "async updateProfileImmediate" src/profile/profile-service.ts
```
Should show the new method with `await this.saveToSettings()` call.
  </verify>
  <done>ProfileService has `updateProfileImmediate()` method that saves synchronously</done>
</task>

<task type="auto">
  <name>Use updateProfileImmediate() in ProfileInitializer</name>
  <files>src/profile/profile-initializer.ts</files>
  <action>
Replace the debounced `updateProfile()` call with `await updateProfileImmediate()` in the `initializeProfile()` method.

**Location:** Line 97 in src/profile/profile-initializer.ts

**Change:**
```typescript
// OLD (line 97):
this.profileService.updateProfile(profile);

// NEW:
await this.profileService.updateProfileImmediate(profile);
```

**Why this works:**
- `initializeProfile()` is already async
- Awaiting ensures save completes before returning
- onComplete callback in settings.ts already awaits `initializeProfile()`
- Profile signals now persist immediately after wizard completes

**Also update the comment above (line 96):**
```typescript
// OLD:
// Persist the updated profile

// NEW:
// Persist the updated profile immediately (critical operation)
```
  </action>
  <verify>
```bash
grep -B 2 -A 2 "updateProfileImmediate" src/profile/profile-initializer.ts
```
Should show `await this.profileService.updateProfileImmediate(profile);` at line 97.
  </verify>
  <done>ProfileInitializer awaits immediate save before returning</done>
</task>

<task type="auto">
  <name>Test profile persistence after onboarding</name>
  <files>src/profile/profile-service.ts, src/profile/profile-initializer.ts</files>
  <action>
Build the plugin and verify the fix works:

```bash
cd C:/1GitRepos/zotero-triage && npm run build
```

**Manual verification steps:**
1. Delete existing profile: Open Obsidian Dev Tools (Ctrl+Shift+I), run in console:
   ```javascript
   app.plugins.plugins['zotero-triage'].settings.userProfile = null;
   await app.plugins.plugins['zotero-triage'].saveSettings();
   ```
2. Reload plugin or restart Obsidian
3. Run setup wizard from settings → complete all 3 steps → select seed papers
4. Check settings panel immediately - should show "Profile configured with N seed papers" (not "No profile configured")
5. Restart Obsidian
6. Check settings panel again - profile should still be there

**Expected behavior:**
- ✓ Profile persists immediately after wizard completion
- ✓ Profile survives Obsidian restart
- ✓ Settings panel shows profile information (not "No profile configured")
- ✓ No need to run wizard again

**If profile still missing:**
- Check browser console for errors during profile initialization
- Verify `updateProfileImmediate()` is being called (add console.log if needed)
- Check that `saveSettings()` is actually writing to disk (Obsidian API issue?)
  </action>
  <verify>
After completing wizard and restarting Obsidian, run in Dev Tools console:
```javascript
app.plugins.plugins['zotero-triage'].profileService.hasProfile()
```
Should return `true`.
  </verify>
  <done>Profile persists after onboarding and survives restart</done>
</task>

</tasks>

<verification>
**Code verification:**
```bash
# Verify new method exists
grep -c "updateProfileImmediate" src/profile/profile-service.ts
# Should return 2 (method definition + JSDoc)

# Verify it's being used
grep -c "updateProfileImmediate" src/profile/profile-initializer.ts
# Should return 1
```

**Runtime verification:**
1. Complete onboarding wizard
2. Check settings panel shows "Profile configured with N seed papers"
3. Restart Obsidian
4. Check settings panel again - profile should persist
5. Dev console: `app.plugins.plugins['zotero-triage'].profileService.getProfile()` should return profile object with tags/authors/keywords
</verification>

<success_criteria>
- [ ] `updateProfileImmediate()` method added to ProfileService
- [ ] Method signature is async and returns Promise<void>
- [ ] Method calls `await this.saveToSettings()` directly (no debounce)
- [ ] ProfileInitializer uses `await updateProfileImmediate()` instead of `updateProfile()`
- [ ] Build succeeds without errors
- [ ] After completing wizard, settings panel shows profile exists
- [ ] After restarting Obsidian, profile still exists
- [ ] Profile contains tags, authors, and keywords from seed papers
</success_criteria>

<output>
After completion, create `.planning/quick/008-fix-profile-not-being-saved-after-comple/008-SUMMARY.md` following the standard summary template.
</output>
