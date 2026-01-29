# Phase 12: Settings Persistence & UI Polish - Research

**Researched:** 2026-01-29
**Domain:** Obsidian plugin settings persistence, modal-based reconfiguration UI patterns, immediate application patterns
**Confidence:** HIGH

## Summary

Phase 12 connects recommendation settings configured in the onboarding wizard to the persistent settings panel, enabling users to reconfigure preferences without re-running the full wizard. The phase implements immediate application of settings changes (no explicit Save button) following established Obsidian plugin patterns, along with high-impact operations (like library changes) that trigger validation warnings.

Key findings:
- **Obsidian settings persistence**: `saveSettings()` persists plugin data to disk immediately; `saveData(this.settings)` is the standard pattern used throughout the codebase
- **Immediate application pattern**: Settings changes are applied immediately via `onChange` callbacks in `PluginSettingTab`, with each change automatically saved
- **Modal pattern for reconfiguration**: Users access reconfiguration through buttons in settings panel that open modals/wizards
- **High-impact operation warnings**: Library changes warrant confirmation dialogs (user may lose scoped data) but then apply immediately
- **Settings persistence scope**: All recommendation preferences (`relevanceVsDiversity`, `recencyBoost`, library selection) are stored in `plugin.settings` which persists to plugin data.json

**Primary recommendation:** Implement immediate-application pattern for all settings using existing `onChange` callbacks; leverage existing `PreflightModal` pattern for library change confirmation; persist preference selections alongside existing `userProfile` in settings; provide targeted reconfiguration buttons (Reconfigure Profile, Reconfigure Library) that reopen relevant wizard steps with pre-populated user selections.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Obsidian API (PluginSettingTab) | latest | Settings panel UI with immediate persistence | Official Obsidian plugin API; already used in settings.ts for all configuration UI |
| Obsidian API (Modal) | latest | Dialog for warning acknowledgment and reconfiguration | Official Obsidian plugin API; established pattern in SetupWizardModal and PreflightModal |
| Zotero Triage settings system | existing | Persist preferences to plugin data via saveSettings() | Existing pattern: `plugin.saveSettings()` writes to `plugin.settings` → disk |
| lodash.debounce | 4.0.8 | Debounce rapid setting changes (optional for non-critical settings) | Already in package.json; ProfileService uses 2000ms debounce |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Obsidian API (Notice) | latest | Toast notifications for status feedback | Confirm settings applied, warn about cascading changes |
| DuplicateDetectionService | Phase 10 | Duplicate count detection for preflight | Reuse for library change warning modal |
| SetupWizardModal | existing | Multi-step wizard for profile configuration | Extend or reuse steps for targeted reconfiguration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Immediate application (onChange) | Explicit Save button | Immediate: matches Obsidian best practice, users expect live updates; Save button: adds friction, users may forget to save |
| Warning modal before library change | Immediate application | Warning: high-impact operation justifies confirmation; immediate: risky without user awareness of profile reset |
| Targeted reconfigure buttons (Profile, Library) | Single "Reconfigure Everything" button | Targeted: users can change one aspect; unified: simpler UI but forces re-selection of settings they didn't want to change |
| Store library selection in settings | Store in profile only | Settings: persists across profile resets, user-scoped; profile: lost when profile is recreated |

**Installation:**
```bash
# No new packages required
# Use existing Obsidian API + debounce + ZoteroConnector
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── settings.ts                          # (extend with library selector, preference display)
├── types.ts                             # (optional: add libraryFilter field to ZoteroTriageSettings)
├── ui/
│   ├── setup-wizard-modal.ts            # (extend with pre-population of existing selections)
│   ├── reconfigure-library-modal.ts     # (NEW: targeted library reconfiguration)
│   ├── profile-editor.ts                # (existing: embed in settings for preferences display)
│   └── library-change-warning-modal.ts  # (NEW: warning before library change applies)
├── profile/
│   └── profile-service.ts               # (extend with library filter association)
└── main.ts                              # (settings load/save already implemented)
```

### Pattern 1: Immediate Application via onChange in PluginSettingTab
**What:** Each setting change is immediately persisted via `onChange` handler
**When to use:** All non-destructive preference changes (relevanceVsDiversity, recencyBoost, library selection without change)
**Example:**
```typescript
// Source: Obsidian plugin best practices + existing settings.ts pattern
new Setting(containerEl)
  .setName('Relevance vs Diversity')
  .setDesc('Balance between highest-scoring vs diverse results (0=pure relevance, 1=maximum diversity)')
  .addSlider(slider => slider
    .setLimits(0, 1, 0.1)
    .setValue(this.plugin.settings.userProfile?.relevanceVsDiversity ?? 0)
    .setDynamicTooltip()
    .onChange(async (value) => {
      // Update preference immediately
      if (this.plugin.settings.userProfile) {
        this.plugin.settings.userProfile.relevanceVsDiversity = value;
        this.plugin.settings.userProfile.updatedAt = Date.now();
        await this.plugin.saveSettings();
      }
    }));
```

### Pattern 2: Library Selector with Change Warning
**What:** Dropdown showing available personal libraries; selecting a different library triggers confirmation modal
**When to use:** Library filter selection that impacts profile scope and item visibility
**Example flow:**
```typescript
// In settings.ts: Library selector dropdown
new Setting(containerEl)
  .setName('Library Filter')
  .setDesc('Select which Zotero library to analyze (personal libraries only)')
  .addDropdown(dropdown => dropdown
    .addOptions(this.libraryOptions) // Map of libraryID: libraryName
    .setValue(this.plugin.settings.libraryFilter || 'default')
    .onChange(async (selectedLibraryId) => {
      const currentLibrary = this.plugin.settings.libraryFilter || 'default';

      if (selectedLibraryId !== currentLibrary) {
        // High-impact change - show confirmation
        new LibraryChangeWarningModal(
          this.app,
          currentLibrary,
          selectedLibraryId,
          async (confirmed) => {
            if (confirmed) {
              // Apply change and reinitialize profile
              this.plugin.settings.libraryFilter = selectedLibraryId;
              await this.plugin.saveSettings();

              // Trigger profile re-initialization (async, non-blocking)
              this.reinitializeProfileForNewLibrary(selectedLibraryId);

              new Notice('Library changed. Profile will be reinitialized on next profile operation.');
              this.display(); // Refresh settings panel
            } else {
              // User cancelled - revert dropdown to previous value
              this.display();
            }
          }
        );
      }
    }));
```

### Pattern 3: Reconfigure Profile Button with Seed Paper Pre-population
**What:** Button in settings that opens SetupWizardModal with existing seed papers pre-selected
**When to use:** User wants to change recommendation preferences (relevanceVsDiversity, recencyBoost) without changing seed papers
**Example:**
```typescript
// In settings.ts: Add Reconfigure Profile button
profileStatus.addButton(button => button
  .setButtonText('Reconfigure Profile Preferences')
  .onClick(async () => {
    const wizard = new SetupWizardModal(
      this.app,
      this.plugin,
      async (newProfile) => {
        // Update profile with new preferences, keep existing seed papers
        const existingProfile = this.plugin.settings.userProfile;
        if (existingProfile) {
          existingProfile.relevanceVsDiversity = newProfile.relevanceVsDiversity;
          existingProfile.recencyBoost = newProfile.recencyBoost;
          existingProfile.updatedAt = Date.now();
          await this.plugin.saveSettings();
          new Notice('Profile preferences updated');
          this.display();
        }
      }
    );

    // Pre-populate wizard with existing selections
    wizard.preselectSeedPapers(this.plugin.settings.userProfile?.seedPaperIds || []);
    wizard.preselectPreferences(this.plugin.settings.userProfile?.relevanceVsDiversity ?? 0);
    wizard.open();
  }));
```

### Pattern 4: Settings Persistence Scope
**What:** Distinguish between profile-scoped data (seed papers, signal weights) and user-scoped preferences (library filter, relevance setting)
**When to use:** Deciding what should be stored in settings vs. profile
**Guideline:**
- **In settings (user-scoped, survives profile reset)**: `libraryFilter`, `relevanceVsDiversity`, `recencyBoost`
- **In profile (profile-scoped, resets with profile)**: `seedPaperIds`, `tags`, `authors`, `keywords`

```typescript
// types.ts extension
export interface ZoteroTriageSettings {
  // ... existing fields
  userProfile: UserProfile | null;         // Profile-scoped: seed papers, signal weights
  libraryFilter: string;                   // User-scoped: personal library selection
  relevanceVsDiversity: number;            // User-scoped: recommendation balance preference
  recencyBoost: boolean;                   // User-scoped: include recent papers boost
}
```

### Anti-Patterns to Avoid
- **Debouncing profile changes**: Profile updates should be immediate to prevent losing user work; only debounce non-critical analytics
- **Silent failures on high-impact changes**: Library changes and profile resets should always notify user
- **Saving preferences only on wizard completion**: User might close plugin between settings changes; use immediate onChange saves
- **Storing user preferences in profile**: Preferences should survive profile reset (re-initialization with new seeds)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persistence mechanism for settings | Custom JSON file saving | Obsidian's `saveData(settings)` API | Already handles versioning, migration, plugin data lifecycle |
| Modal confirmation for destructive actions | Custom alert dialogs | Obsidian Modal API (established pattern) | PreflightModal already demonstrates this; Modal provides proper styling + event handling |
| Immediate UI feedback on setting changes | Manual state management | Obsidian's `onChange` callback + `this.display()` refresh | Built into Setting/PluginSettingTab; triggers reactive UI updates |
| Library dropdown with options | Custom select HTML | Obsidian's `DropdownComponent` in Settings | Official API with proper styling; integrates with plugin settings architecture |
| Debouncing rapid preference changes | Manual setTimeout tracking | lodash.debounce (already in package.json) | ProfileService uses this; prevents excessive disk writes |

**Key insight:** Obsidian plugins have standardized patterns for immediate application, modal confirmation, and data persistence. Building custom solutions duplicates work and breaks consistency with Obsidian conventions.

## Common Pitfalls

### Pitfall 1: Library Change Doesn't Persist Profile Association
**What goes wrong:** User changes library, but profile remains tied to old library scope. On next app restart, profile operates on wrong library.
**Why it happens:** Library filter stored separately from profile; developer forgets to mark profile as "dirty" after library change
**How to avoid:** Always update profile `updatedAt` timestamp when library changes; consider adding optional `libraryId` field to profile to document which library it was initialized from
**Warning signs:** Profile recommendations suddenly include items from all libraries, or miss expected items after library change

### Pitfall 2: Abandoning Immediate Application Pattern
**What goes wrong:** Developer adds explicit "Save" button to settings panel. Users change settings, forget to save, restart app, and lose changes. Creates surprise and frustration.
**Why it happens:** Misunderstanding that Obsidian pattern expects immediate saves; conflating settings with form-based config screens
**How to avoid:** Always save via `onChange` callbacks, never require explicit save button; use Notices to confirm saves if feedback needed
**Warning signs:** User reports: "I changed the setting but it didn't save" or "I closed settings and my changes were gone"

### Pitfall 3: Modal for Non-Destructive Changes
**What goes wrong:** Opening confirmation modal for every small preference change (recencyBoost toggle, relevance slider). Users get modal fatigue and click through warnings.
**Why it happens:** Overestimating severity of settings changes; conflating all user confirmations as equal
**How to avoid:** Reserve modals for high-impact operations only (library changes, profile reset). Use immediate application + Notices for preference tweaks.
**Warning signs:** Users report modal appearing too often, or start ignoring warnings

### Pitfall 4: Profile State Display Confusion
**What goes wrong:** Showing profile metadata (seed count, creation date) as editable fields. Users click them expecting to edit, but they're read-only.
**Why it happens:** Not clearly distinguishing display vs. edit modes in UI
**How to avoid:** Use visual distinction for read-only fields (greyed out, info icon, or separate "Profile Info" section). Only show editable controls for reconfigurable settings.
**Warning signs:** Users click on display fields expecting to edit; profile state appears inconsistent

### Pitfall 5: Missing Library Change Side Effects
**What goes wrong:** Library changes apply immediately, but profile isn't reinitialized. Recommendation engine scores against old library scope.
**Why it happens:** Not cascading library change through dependent systems
**How to avoid:** Document cascade: library change → re-initialization required → trigger profile reinit with warning modal → new batch uses new library scope
**Warning signs:** Recommendations don't match new library; users see items that should be filtered out

## Code Examples

Verified patterns from official sources and existing codebase:

### Settings Panel with Immediate Application
```typescript
// Source: Obsidian PluginSettingTab pattern + Phase 1 existing settings.ts
export class ZoteroTriageSettingTab extends PluginSettingTab {
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Recommendation Preferences Section
    containerEl.createEl('h2', { text: 'Recommendation Preferences' });

    // Relevance vs Diversity preference (immediate application)
    new Setting(containerEl)
      .setName('Relevance vs Diversity')
      .setDesc('0 = highest-scoring only, 1 = diverse across signal types')
      .addSlider(slider => slider
        .setLimits(0, 1, 0.1)
        .setValue(this.plugin.settings.userProfile?.relevanceVsDiversity ?? 0)
        .setDynamicTooltip()
        .onChange(async (value) => {
          if (this.plugin.settings.userProfile) {
            this.plugin.settings.userProfile.relevanceVsDiversity = value;
            this.plugin.settings.userProfile.updatedAt = Date.now();
            await this.plugin.saveSettings();
          }
        }));

    // Recency Boost preference (toggle with immediate application)
    new Setting(containerEl)
      .setName('Boost Recent Publications')
      .setDesc('Include recent publications higher in recommendations')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.userProfile?.recencyBoost ?? true)
        .onChange(async (value) => {
          if (this.plugin.settings.userProfile) {
            this.plugin.settings.userProfile.recencyBoost = value;
            this.plugin.settings.userProfile.updatedAt = Date.now();
            await this.plugin.saveSettings();
            new Notice(value ? 'Recent boost enabled' : 'Recent boost disabled');
          }
        }));
  }
}
```

### Library Change Warning Modal
```typescript
// Source: PreflightModal pattern (Phase 11) + Obsidian Modal API
export class LibraryChangeWarningModal extends Modal {
  private onDecision: (confirmed: boolean) => void;
  private currentLibrary: string;
  private newLibrary: string;

  constructor(
    app: App,
    currentLibrary: string,
    newLibrary: string,
    onDecision: (confirmed: boolean) => void
  ) {
    super(app);
    this.currentLibrary = currentLibrary;
    this.newLibrary = newLibrary;
    this.onDecision = onDecision;
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText('Change Library?');

    contentEl.createEl('p', {
      text: 'Changing your library selection will reset your research profile. Your processing history will be preserved, but profile preferences will be reinitialized.'
    });

    contentEl.createDiv({ cls: 'modal-button-container' }, div => {
      new Setting(div)
        .addButton(btn => btn
          .setButtonText('Cancel')
          .onClick(() => {
            this.onDecision(false);
            this.close();
          }))
        .addButton(btn => btn
          .setButtonText('Change Library')
          .setCta()
          .onClick(() => {
            this.onDecision(true);
            this.close();
          }));
    });
  }

  onClose(): void {
    // Modal cleanup handled by Obsidian
  }
}
```

### Extending SetupWizardModal for Reconfiguration
```typescript
// Source: Existing SetupWizardModal pattern in codebase
export class SetupWizardModal extends Modal {
  private preselectSeedIds: string[] = [];
  private preselectRelevance: number = 0;

  /**
   * Pre-populate wizard with existing selections
   * Used for reconfiguration flows where user keeps seed papers but changes preferences
   */
  preselectSeedPapers(seedIds: string[]): void {
    this.preselectSeedIds = seedIds;
  }

  preselectPreferences(relevance: number): void {
    this.preselectRelevance = relevance;
  }

  private renderSeedPapersStep(stepContent: HTMLElement): void {
    // ... existing step rendering code
    // Use preselectSeedIds if provided to pre-check existing selections
    const picker = new SeedPaperPicker(
      this.app,
      this.connector,
      this.preselectSeedIds, // Pass pre-selection
      (selectedIds) => {
        this.wizardData.seedPaperIds = selectedIds;
        this.advanceStep();
      }
    );
    picker.display(stepContent);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Explicit Save button in settings | Immediate onChange saves | Obsidian standard best practice (2022+) | Users expect live settings; explicit save button is now considered anti-pattern in modern Obsidian plugins |
| Single reconfigure modal for all changes | Targeted reconfigure buttons (Profile, Library) | CONTEXT.md Phase 12 decision | Users can change one aspect without re-selecting everything; improves UX for partial reconfigurations |
| Library changes apply silently | Library changes with warning modal | CONTEXT.md Phase 12 decision | Users understand profile-scoped impact; prevents surprising behavior changes |
| Profile stored in settings only | Profile + user-scoped preferences in settings | Phase 4+ design evolution | Separates persistent preferences from profile-scoped state; survives profile reset |

**Deprecated/outdated:**
- Modal-free settings (Obsidian now recommends modal for high-impact confirmations, per Phase 11 preflight pattern)
- Manual state management for settings (Obsidian Plugin API handles this standardly)

## Open Questions

1. **Library selector implementation details**
   - What we know: Phase 9 research confirms personal library filtering via `libraries.type = 'user'` in SQL
   - What's unclear: Whether to show library names (from Zotero) or generic "Personal Library 1/2" labels; how many personal libraries can users have?
   - Recommendation: Query libraries table to get actual names if available; fall back to generic labels. MVP supports single personal library selection; multi-select deferred.

2. **Profile reinitialization timing**
   - What we know: CONTEXT.md says library change triggers re-init warning, but doesn't specify automatic vs. manual
   - What's unclear: Should profile reinit happen immediately after library change, or only on next batch generation?
   - Recommendation: Mark profile as "dirty" on library change (shown in UI), trigger reinit only when user next generates batch. Prevents forced wait on library change.

3. **Preference preservation across profile resets**
   - What we know: User-scoped settings should survive profile reset
   - What's unclear: Does "recencyBoost" apply globally or per-profile? If user changes library and profile resets, do they see same recencyBoost?
   - Recommendation: Store in settings (user-scoped), not profile. All profiles under a library use same recencyBoost preference.

4. **Reconfiguration granularity**
   - What we know: CONTEXT.md marks this as Claude's discretion
   - What's unclear: Should "Reconfigure Profile" button re-run full wizard or skip database step?
   - Recommendation: Full wizard re-run (steps: preferences → seed papers). Database path shouldn't change mid-session. Keep it simple.

## Sources

### Primary (HIGH confidence)
- [Obsidian PluginSettingTab API](https://docs.obsidian.md/Reference/TypeScript+API/PluginSettingTab) — Settings panel UI pattern with onChange immediate persistence
- [Obsidian Modal API](https://docs.obsidian.md/Plugins/User+interface/Modals) — Modal dialog base class for warning confirmations
- [Obsidian saveData/loadData](https://docs.obsidian.md/Reference/TypeScript+API/Plugin/saveData) — Plugin data persistence mechanism
- **Existing codebase** — settings.ts (immediate onChange saves), PreflightModal pattern (Phase 11), ProfileService (profile persistence)

### Secondary (MEDIUM confidence)
- [designdebt.club: Refreshing your modal or settings tab in Obsidian](https://designdebt.club/refreshing-your-modal-or-settings-tab-in-obsidian/) — Best practices for modal UI refresh patterns
- [marcusolsson.github.io: Obsidian Plugin Developer Docs](https://marcusolsson.github.io/obsidian-plugin-docs/user-interface/settings) — Settings UI patterns and component best practices
- [Save Settings with DropdownComponent - Obsidian Forum](https://forum.obsidian.md/t/save-settings-with-dropdowncomponent/24337) — Dropdown component with onChange persistence pattern
- Phase 9 RESEARCH.md — Library filtering via SQL (`libraries.type = 'user'`)
- Phase 11 RESEARCH.md — Modal pattern for health check warnings without blocking progression

### Tertiary (LOW confidence)
- Obsidian Forum discussions on settings management (may reflect older patterns or edge cases, not primary design decisions)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Obsidian plugin API patterns are well-documented and established in existing codebase
- Architecture: HIGH — PluginSettingTab and Modal patterns are official Obsidian recommendations; existing code demonstrates these patterns
- Pitfalls: MEDIUM-HIGH — Inferred from Phase 11 research (modal patterns) and settings.ts experience; library-specific pitfalls (Pitfall 5) based on CONTEXT.md coupling decision
- Code examples: HIGH — Adapted from existing codebase (settings.ts, PreflightModal) and official Obsidian API documentation

**Research date:** 2026-01-29
**Valid until:** 2026-02-28 (30 days — stable domain, no rapid API changes expected)

**Notes:**
- Phase 12 extends Phase 11's modal pattern (PreflightModal) for library change warnings
- Phase 12 builds on Phase 4's profile initialization (SetupWizardModal reuse for reconfiguration)
- All persistence uses existing `plugin.saveSettings()` mechanism from Phase 1
- Settings panel UI extends existing patterns from settings.ts (Phase 1+)
