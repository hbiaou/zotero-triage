---
phase: quick-010
plan: "010"
type: execute
wave: 1
depends_on: []
files_modified:
  - src/profile/profile-initializer.ts
  - src/main.ts
  - src/settings.ts
autonomous: true

must_haves:
  truths:
    - "Users can complete onboarding wizard without TypeError"
    - "Profile initialization reads relevanceVsDiversity and recencyBoost from plugin settings"
    - "Setup wizard completes successfully and saves profile"
  artifacts:
    - path: "src/profile/profile-initializer.ts"
      provides: "ProfileInitializer with plugin reference"
      contains: "private plugin: Plugin"
    - path: "src/main.ts"
      provides: "ProfileInitializer instantiation with plugin"
      pattern: "new ProfileInitializer.*this"
    - path: "src/settings.ts"
      provides: "ProfileInitializer instantiation with plugin"
      pattern: "new ProfileInitializer.*this.plugin"
  key_links:
    - from: "src/profile/profile-initializer.ts"
      to: "plugin.settings"
      via: "direct plugin reference"
      pattern: "this\\.plugin\\.settings"
---

<objective>
Fix critical profile initialization error blocking onboarding completion by adding plugin reference to ProfileInitializer constructor.

Purpose: Users cannot complete onboarding because ProfileInitializer tries to access plugin settings via `(this.connector as any).plugin.settings`, but the chain is broken. The fix is to pass the plugin directly to ProfileInitializer instead of reaching through the connector.

Output: ProfileInitializer accepts plugin as constructor parameter and accesses settings directly.
</objective>

<execution_context>
@C:\Users\Biaou\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\Biaou\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/quick/008-fix-profile-not-being-saved-after-comple/008-SUMMARY.md

# Current broken code
@src/profile/profile-initializer.ts
@src/main.ts
@src/settings.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update ProfileInitializer constructor to accept plugin reference</name>
  <files>src/profile/profile-initializer.ts</files>
  <action>
**Problem:** ProfileInitializer.initializeProfile() fails at line 79 with "Cannot read properties of undefined (reading 'settings')" because it tries to access `(this.connector as any).plugin.settings`, but the plugin reference is not guaranteed to exist on the connector.

**Fix:** Refactor ProfileInitializer to accept the plugin as a constructor parameter instead of reaching through the connector.

**Changes to src/profile/profile-initializer.ts:**

1. Add plugin import at top:
```typescript
import { Plugin } from 'obsidian';
```

2. Add private plugin field to class (after line 19):
```typescript
private plugin: Plugin;
```

3. Update constructor signature (line 29-37) to accept plugin as first parameter:
```typescript
constructor(
  plugin: Plugin,
  connector: ZoteroConnector,
  profileService: ProfileService,
  keywordExtractor: typeof extractKeywordsFromMultiple
) {
  this.plugin = plugin;
  this.connector = connector;
  this.profileService = profileService;
  this.keywordExtractor = keywordExtractor;
}
```

4. Update JSDoc for constructor (lines 24-28) to document new plugin parameter:
```typescript
/**
 * Create a new ProfileInitializer
 * @param plugin - Obsidian plugin instance for accessing settings
 * @param connector - ZoteroConnector for fetching papers
 * @param profileService - ProfileService for persisting profiles
 * @param keywordExtractor - Function for extracting keywords
 */
```

5. Fix line 79 to use direct plugin reference instead of reaching through connector:
```typescript
// OLD (line 79):
const pluginSettings = (this.connector as any).plugin.settings;

// NEW:
const pluginSettings = (this.plugin as any).settings;
```

**Result:** ProfileInitializer now has direct access to plugin settings without fragile connector traversal.
  </action>
  <verify>
1. Build succeeds: `npm run build`
2. Grep confirms plugin field exists: `grep "private plugin: Plugin" src/profile/profile-initializer.ts`
3. Grep confirms constructor updated: `grep "plugin: Plugin," src/profile/profile-initializer.ts`
4. Grep confirms settings access fixed: `grep "this.plugin as any).settings" src/profile/profile-initializer.ts`
  </verify>
  <done>
- ProfileInitializer class has `private plugin: Plugin` field
- Constructor accepts `plugin` as first parameter
- Constructor JSDoc documents plugin parameter
- initializeProfile() reads settings from `this.plugin.settings` (not through connector)
- Build completes without TypeScript errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Update ProfileInitializer instantiation in main.ts and settings.ts</name>
  <files>src/main.ts, src/settings.ts</files>
  <action>
Update all ProfileInitializer constructor calls to pass `this` (plugin instance) as first parameter.

**Changes to src/main.ts:**

At line 82-86, update:
```typescript
// OLD:
this.profileInitializer = new ProfileInitializer(
  this.connector,
  this.profileService,
  extractKeywordsFromMultiple
);

// NEW:
this.profileInitializer = new ProfileInitializer(
  this,  // plugin reference
  this.connector,
  this.profileService,
  extractKeywordsFromMultiple
);
```

**Changes to src/settings.ts:**

There are 4 ProfileInitializer instantiations (lines 198, 230, 283, 322). Update all 4:

```typescript
// OLD pattern:
const profileInitializer = new ProfileInitializer(
  (this.plugin as any).connector,
  profileService,
  extractKeywordsFromMultiple
);

// NEW pattern:
const profileInitializer = new ProfileInitializer(
  this.plugin,  // plugin reference first
  (this.plugin as any).connector,
  profileService,
  extractKeywordsFromMultiple
);
```

**Result:** All 5 instantiation sites now pass plugin reference as first argument.
  </action>
  <verify>
1. Build succeeds: `npm run build`
2. Grep confirms main.ts updated: `grep -A 4 "new ProfileInitializer" src/main.ts | grep "this,"`
3. Grep confirms settings.ts updated (should find 4 matches): `grep -A 4 "new ProfileInitializer" src/settings.ts | grep "this.plugin," | wc -l` (should output 4)
  </verify>
  <done>
- main.ts passes `this` as first argument to ProfileInitializer constructor
- settings.ts passes `this.plugin` as first argument in all 4 instantiation sites
- Build completes without TypeScript errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Verify onboarding completion works</name>
  <files>None (verification only)</files>
  <action>
Build the plugin and verify the TypeError is fixed.

1. Run full build: `npm run build`
2. Check build output for errors
3. Verify ProfileInitializer constructor signature matches all call sites

**Expected:** Build succeeds with no errors, all ProfileInitializer instantiations correctly pass plugin reference.
  </action>
  <verify>
1. `npm run build` exits with code 0
2. No TypeScript compilation errors
3. `grep -c "new ProfileInitializer" src/main.ts` returns 1
4. `grep -c "new ProfileInitializer" src/settings.ts` returns 4
  </verify>
  <done>
- Build completes successfully
- All 5 ProfileInitializer instantiations pass correct parameters
- No TypeScript compilation errors
- Plugin ready to test onboarding flow (manual verification: complete wizard, verify no TypeError)
  </done>
</task>

</tasks>

<verification>
**Build verification:**
- `npm run build` succeeds without errors
- ProfileInitializer has plugin field and updated constructor
- All instantiation sites pass plugin as first argument

**Runtime verification (manual - documented for user):**
1. Reload plugin in Obsidian
2. Clear existing profile via Dev Tools: `app.plugins.plugins['zotero-triage'].profileService.clearProfile()`
3. Complete setup wizard with seed paper selection
4. Wizard should complete without TypeError
5. Settings should show "Profile configured with N seed papers"
6. Dev console should show profile exists: `app.plugins.plugins['zotero-triage'].profileService.getProfile()`
</verification>

<success_criteria>
- ProfileInitializer constructor accepts plugin as first parameter
- All 5 instantiation sites (1 in main.ts, 4 in settings.ts) updated
- Build completes without TypeScript errors
- initializeProfile() can access plugin.settings.relevanceVsDiversity and plugin.settings.recencyBoost
- No "Cannot read properties of undefined (reading 'settings')" error during onboarding
</success_criteria>

<output>
After completion, create `.planning/quick/010-fix-profile-initialization-error-cannot-/010-SUMMARY.md`
</output>
