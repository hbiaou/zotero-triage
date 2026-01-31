---
phase: 14-ai-service-layer-and-evidence-foundation
plan: 01
subsystem: ai
tags: [ai, types, encryption, keychain, obsidian-api, typescript]

# Dependency graph
requires:
  - phase: none
    provides: foundational types for AI service layer
provides:
  - AI provider type system (ProviderID, AIModel, AIRequest, AIResponse)
  - AIProvider interface for consistent provider implementation
  - EvidenceLevel hierarchy (FullText, Notes, Abstract, MetadataOnly)
  - SecretStorageService for encrypted API key management
affects: [14-02-provider-implementations, 14-03-ai-service-orchestration, 14-05-evidence-extraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Obsidian secretStorage API for OS keychain integration"
    - "Synchronous secret storage methods (not async)"
    - "Evidence hierarchy for progressive content extraction"
    - "AIServiceError with retry metadata"

key-files:
  created:
    - src/ai/types.ts
    - src/services/secret-storage.ts
  modified: []

key-decisions:
  - "Use Obsidian's secretStorage API instead of custom encryption library"
  - "Evidence hierarchy: FullText > Notes > Abstract > MetadataOnly"
  - "Synchronous secret storage methods (Obsidian API is sync, not async)"
  - "Graceful error handling in SecretStorageService (log, don't throw)"

patterns-established:
  - "ProviderID union type for compile-time provider validation"
  - "AIServiceError extends Error with providerId and retry metadata"
  - "Secret key naming: zotero-triage-ai-key-{providerId}"
  - "Cost tracking per model (costPer1MInputTokens, costPer1MOutputTokens)"

# Metrics
duration: 15min
completed: 2026-01-31
---

# Phase 14 Plan 01: AI Service Layer & Evidence Foundation Summary

**TypeScript type system for AI providers with encrypted OS keychain storage for API keys**

## Performance

- **Duration:** 15 min
- **Started:** 2026-01-31T13:46:39Z
- **Completed:** 2026-01-31T14:01:39Z (estimated)
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Complete AI type system with provider interfaces, request/response types, and evidence hierarchy
- Secure API key storage using Obsidian's secretStorage API (OS keychain integration)
- Foundation for all subsequent AI service layer implementations

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AI types and interfaces** - `5195c55` (feat)
2. **Task 2: Create SecretStorage service for encrypted API keys** - `82655c6` (feat)

## Files Created/Modified
- `src/ai/types.ts` - AI provider type system: ProviderID, AIModel, AIRequest/Response, AIProvider interface, EvidenceLevel hierarchy, AIServiceError
- `src/services/secret-storage.ts` - SecretStorageService for encrypted API key management using Obsidian secretStorage

## Decisions Made

**1. Use Obsidian's secretStorage API instead of custom encryption**
- Rationale: Obsidian provides `app.secretStorage` API that integrates with OS keychains (macOS Keychain, Windows Credential Manager, Linux Secret Service) with automatic fallback to encrypted file storage
- Impact: Simpler implementation, better OS integration, no need for libsodium.js

**2. Synchronous secret storage methods**
- Rationale: Obsidian's secretStorage API is synchronous, not async (setSecret/getSecret return immediately)
- Impact: Simpler calling code, no need for async/await in storage operations

**3. Evidence hierarchy: FullText > Notes > Abstract > MetadataOnly**
- Rationale: Establishes clear priority for content extraction - prefer highest quality source available
- Impact: All evidence extraction will follow this hierarchy for consistent quality

**4. Graceful error handling in SecretStorageService**
- Rationale: Storage failures shouldn't crash the plugin - log errors and return null/false
- Impact: Plugin remains functional even if keychain access fails temporarily

## Deviations from Plan

**Auto-fixed Issues**

**1. [Rule 3 - Blocking] Corrected Obsidian secret storage API usage**
- **Found during:** Task 2 (TypeScript compilation of secret-storage.ts)
- **Issue:** Plan specified `app.saveSecret()` and `app.loadSecret()` but Obsidian API is `app.secretStorage.setSecret()` and `app.secretStorage.getSecret()`
- **Fix:** Updated service to use correct `app.secretStorage` API with synchronous methods
- **Files modified:** src/services/secret-storage.ts
- **Verification:** TypeScript compilation succeeds with no errors
- **Committed in:** 82655c6 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking - API correction)
**Impact on plan:** Auto-fix necessary for correct Obsidian API usage. No scope creep.

## Issues Encountered

**Issue 1: Obsidian type definitions**
- Problem: Initial implementation used async methods based on plan specification, but Obsidian's actual API is synchronous
- Resolution: Verified against node_modules/obsidian/obsidian.d.ts to find correct API: `app.secretStorage.setSecret()`, `app.secretStorage.getSecret()`, `app.secretStorage.listSecrets()`
- Outcome: Correct synchronous implementation

## User Setup Required

None - no external service configuration required. API keys will be stored by users through plugin settings UI in future plans.

## Next Phase Readiness

**Ready for:**
- Plan 14-02: Provider implementations can import types from src/ai/types.ts
- Plan 14-03: AI service orchestration can use SecretStorageService for credential management
- Plan 14-05: Evidence extraction can use EvidenceLevel hierarchy

**Blockers/Concerns:**
None. Foundation is complete and verified.

**Architecture established:**
- Type-safe provider system with ProviderID union type
- Cost tracking per model for budget management
- Evidence hierarchy for progressive content extraction
- Secure credential storage with OS integration

---
*Phase: 14-ai-service-layer-and-evidence-foundation*
*Completed: 2026-01-31*
