---
phase: 14-ai-service-layer-and-evidence-foundation
plan: 02
subsystem: ai
tags: [ai, provider-abstraction, factory-pattern, model-catalog, http, error-handling, typescript]

# Dependency graph
requires:
  - phase: 14-01
    provides: AI type system and SecretStorageService for credential management
provides:
  - Model catalog with pricing metadata for all 4 providers (13 models)
  - BaseAIProvider abstract class with shared HTTP logic and error mapping
  - Provider factory for runtime provider creation and registration
  - Integration with SecretStorageService for automatic key retrieval
affects: [14-03-provider-implementations, 14-04-ai-service-orchestration, 15-content-enrichment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Factory pattern for provider registration and instantiation"
    - "Abstract base class with template method pattern"
    - "HTTP error mapping with retry metadata (401/403 non-retryable, 429/5xx retryable)"
    - "Dual interface design (functional + OOP) for flexibility"

key-files:
  created:
    - src/ai/models.ts
    - src/ai/base-provider.ts
    - src/ai/provider-factory.ts
  modified: []

key-decisions:
  - "Default model: gemini-3-flash-preview (Google Gemini 3 Flash)"
  - "Factory pattern with self-registration for providers"
  - "Error retry strategy: 401/403 non-retryable, 429 retryable with backoff, 5xx retryable"
  - "Dual factory interface: functional (createProvider) + OOP (ProviderFactoryClass)"

patterns-established:
  - "Provider registration: registerProvider(id, factory) at module load"
  - "Retry metadata in AIServiceError: isRetryable + retryAfterSeconds"
  - "Model catalog structure: Record<ProviderID, AIModel[]>"
  - "Template method pattern: abstract buildRequestBody/parseResponse, concrete complete()"

# Metrics
duration: 65min
completed: 2026-01-31
---

# Phase 14 Plan 02: Provider Abstraction Layer Summary

**Provider abstraction with base class, factory pattern, and 13-model catalog across OpenAI, Google, Anthropic, OpenRouter**

## Performance

- **Duration:** 65 min
- **Started:** 2026-01-31T16:24:50Z
- **Completed:** 2026-01-31T17:30:03Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Complete model catalog with 13 models across 4 providers including pricing metadata
- Abstract base provider class that handles all HTTP communication and error mapping
- Factory pattern enabling runtime provider selection and self-registration
- Integration with SecretStorageService for automatic credential retrieval

## Task Commits

Each task was committed atomically:

1. **Task 1: Create model catalog with supported models** - `1734bc4` (feat)
2. **Task 2: Create base provider abstract class** - `5cb51f5` (feat)
3. **Task 3: Create provider factory** - `05d3aa2` (feat)

## Files Created/Modified
- `src/ai/models.ts` - Model catalog with SUPPORTED_MODELS for all 4 providers, helper functions (getModelsForProvider, getDefaultModel, findModel, getModelById)
- `src/ai/base-provider.ts` - BaseAIProvider abstract class with initialize, complete, validateCredentials; error mapping with retry logic
- `src/ai/provider-factory.ts` - Provider registration and creation with dual interface (functional createProvider + OOP ProviderFactoryClass)

## Decisions Made

**1. Default model: gemini-3-flash-preview**
- Rationale: Per CONTEXT.md decision, Google Gemini 3 Flash is the default for all enrichment operations
- Impact: getDefaultModel() returns this model, used as system-wide default

**2. Factory pattern with self-registration**
- Rationale: Allows providers to register themselves when imported, enabling clean separation and runtime provider selection
- Impact: Provider implementations will call registerProvider() at module load time

**3. Error retry strategy**
- Rationale: Different HTTP errors have different retry characteristics (auth failures permanent, rate limits temporary)
- Impact: AIServiceError includes isRetryable and retryAfterSeconds for intelligent retry logic
- Mapping: 401/403 non-retryable, 429 retryable with backoff from header, 5xx retryable after 5s, network errors retryable

**4. Dual factory interface**
- Rationale: Functional interface (createProvider) for explicit API key, OOP interface (ProviderFactoryClass) for secret storage integration
- Impact: Services can choose appropriate interface based on their context (e.g., settings UI uses functional, enrichment service uses OOP)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation proceeded smoothly with clear type definitions from Plan 14-01.

## User Setup Required

None - no external service configuration required. Provider implementations will be added in Plan 14-03.

## Next Phase Readiness

**Ready for:**
- Plan 14-03: Provider implementations can extend BaseAIProvider and register via registerProvider()
- Plan 14-04: AI service orchestration can use ProviderFactoryClass with SecretStorageService
- Future enrichment features can use getDefaultModel() for consistent model selection

**Blockers/Concerns:**
None. Abstraction layer complete and ready for concrete provider implementations.

**Architecture established:**
- Template method pattern for provider implementations (only need buildRequestBody/parseResponse/getHeaders)
- Factory pattern with registry for runtime provider selection
- Smart error handling with retry metadata for resilient API calls
- Model catalog with pricing data for cost estimation UI

---
*Phase: 14-ai-service-layer-and-evidence-foundation*
*Completed: 2026-01-31*
