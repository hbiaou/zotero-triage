---
phase: "01-foundation"
plan: "03"
subsystem: "core"
tags: ["settings", "registry", "persistence", "ui"]

dependency_graph:
  requires:
    - "01-01: project scaffold"
    - "01-02: database connector"
  provides:
    - "Settings tab for Zotero database configuration"
    - "Registry service for item state persistence"
    - "Full plugin initialization with all components wired"
  affects:
    - "01-04: batch proposal UI will use registry"
    - "02-*: batch workflow will use registry state"

tech_stack:
  added:
    - "lodash.debounce for save throttling"
  patterns:
    - "PluginSettingTab for settings UI"
    - "Debounced persistence for registry"
    - "Lazy initialization pattern in onload"

key_files:
  created:
    - "src/settings.ts"
    - "src/registry/types.ts"
    - "src/registry/registry-service.ts"
  modified:
    - "src/main.ts"
    - "tsconfig.json"

decisions:
  - id: "01-03-01"
    decision: "Use Electron remote dialog for file browsing with fallback"
    rationale: "Provides native file picker when available, graceful degradation otherwise"
  - id: "01-03-02"
    decision: "2000ms debounce delay for registry saves"
    rationale: "Balance between data safety and disk I/O efficiency"
  - id: "01-03-03"
    decision: "Registry stores data alongside settings in plugin data.json"
    rationale: "Simpler than separate file, uses Obsidian's built-in persistence"

metrics:
  duration: "7 min"
  completed: "2026-01-22"
---

# Phase 01 Plan 03: Settings and Registry Summary

Settings tab with database path auto-detect/test connection, and RegistryService with debounced persistence via Obsidian's saveData.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Create PluginSettingTab for configuration | 1dd5fc9 | Done |
| 2 | Create RegistryService for state persistence | 7e32c53 | Done |
| 3 | Wire settings and registry into main plugin | 59844d1 | Done |

## What Was Built

### ZotBridgeSettingTab (src/settings.ts)

Settings tab providing:

- **Database Path Setting**: Text input for Zotero database path
- **Auto-detect Button**: Uses `detectZoteroPath()` to find standard locations
- **Browse Button**: Electron dialog fallback for manual selection
- **Test Connection Button**: Validates database access, shows item count and schema version
- **Output Folder Setting**: Configurable folder for literature notes
- **Connection Status Display**: Shows current configuration state

### RegistryService (src/registry/registry-service.ts)

State persistence service providing:

- **load()**: Load registry from plugin data on startup
- **getState(itemId)**: Get processing state for an item
- **markState(itemId, state)**: Update state with debounced save
- **isImported(itemId)**: Quick check for import status
- **getStats()**: Count items by state (unseen/proposed/accepted/rejected/imported)
- **getEntriesByState(state)**: Filter item IDs by state
- **flush()**: Immediate save for clean shutdown

### Main Plugin Integration (src/main.ts)

Updated onload/onunload:

- Initializes ZoteroConnector with plugin directory path
- Initializes RegistryService and loads stored data
- Registers settings tab
- Flushes registry and closes connector on unload
- Added `getPluginDir()` helper for WASM file location

## Technical Details

### Registry Data Structure

```typescript
interface Registry {
  version: 1,
  entries: Record<string, {
    state: 'unseen' | 'proposed' | 'accepted' | 'rejected' | 'imported',
    timestamp: number
  }>,
  lastModified: number
}
```

### Persistence Strategy

- Registry stored in Obsidian's plugin data.json
- Debounced saves (2000ms) to reduce disk I/O
- Immediate flush on plugin unload
- Merges with existing data to preserve settings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed tsconfig.json sourceMap conflict**
- **Found during:** Task 2 verification
- **Issue:** `sourceMap: true` conflicts with `inlineSourceMap: true`
- **Fix:** Removed redundant `sourceMap` option
- **Files modified:** tsconfig.json
- **Commit:** 7e32c53

## Verification Results

1. `npm run build` compiles all files without errors
2. Settings tab code creates UI elements correctly
3. Auto-detect calls `detectZoteroPath` from utils/paths
4. Test connection validates database and reports results
5. RegistryService uses debounced `plugin.saveData`
6. Main plugin initializes all components in onload

## Files Changed

```
src/settings.ts          (176 lines) - Settings tab implementation
src/registry/types.ts     (24 lines) - Registry type definitions
src/registry/registry-service.ts (156 lines) - State persistence service
src/main.ts              (83 lines) - Plugin wiring
tsconfig.json            (-1 line) - Fix sourceMap conflict
```

## Next Phase Readiness

Phase 1 Plan 4 (Batch Proposal UI) can now:
- Access registry to check/update item states
- Use connector to load Zotero items
- Read output folder from settings

Remaining work for Phase 1:
- 01-04: Batch proposal modal UI
