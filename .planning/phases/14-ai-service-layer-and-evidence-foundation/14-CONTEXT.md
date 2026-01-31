# Phase 14: AI Service Layer & Evidence Foundation - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the foundational AI provider abstraction layer with encrypted API key management, evidence extraction hierarchy (PDF → notes → abstract → metadata), and failure handling architecture. This establishes the plumbing that all enrichment features in later phases depend on.

</domain>

<decisions>
## Implementation Decisions

### API Key Management
- **Storage:** OS Keychain using Obsidian's SecretStorage API or libsodium.js (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Missing Keys Flow:** Automatically open settings page to API keys section when user attempts enrichment without configured keys
- **Setup Flow:** Claude's discretion on one-by-one entry vs guided wizard
- **Validation:** Claude's discretion on test button, automatic validation, or validation on first use

### Provider Selection
- **Default Provider:** Google Gemini 3 Flash (verify exact model name: gemini-3-flash from https://aistudio.google.com/models/gemini-3)
- **Model Selection:** Single global setting that applies to all enrichment operations
- **Supported Providers:** OpenAI, Google, Anthropic, OpenRouter (including Moonshot AI Kimi K2.5 via OpenRouter)
- **Fallback Strategy:** Automatically try next configured provider if primary fails (user defines fallback order in settings)
- **Provider Tracking:** Claude's discretion on whether to track provider usage for stats/billing

### Evidence Extraction
- **PDF Extraction:** Hybrid approach — try Zotero cache first, fall back to PDF.js if cache is empty or stale
- **Evidence Threshold:** Proceed with enrichment if either PDF fulltext (preferred) or at least notes are available. Queue metadata-only items.
- **Extraction Failure:** Claude's discretion on fallback strategy (immediate fallback to notes, notify+queue, or attempt OCR)
- **Evidence Display:** Both YAML frontmatter (evidence_level: FullText/Notes/Abstract) and visual indicator (badge/icon) showing evidence quality

### Failure Handling
- **Retry Strategy:** Claude's discretion on exponential backoff, fixed interval, or smart retry based on error type
- **Circuit Breaker:** Claude's discretion on threshold (e.g., 5 consecutive failures, rate-based, or no circuit breaker)
- **User Feedback:** Claude's discretion on notification approach (silent queue, toast, modal for critical failures)
- **Queue Recovery:** Claude's discretion on manual retry, auto-retry on restart, or scheduled retry

### Claude's Discretion
- API key setup flow (one-by-one vs wizard)
- API key validation approach (test button, automatic, or on-demand)
- Provider usage tracking for stats/billing
- PDF extraction failure handling (OCR, immediate fallback, notify+queue)
- Retry strategy specifics
- Circuit breaker implementation and thresholds
- User notification patterns for failures
- Queue recovery mechanism

</decisions>

<specifics>
## Specific Ideas

- **Default model:** Google Gemini 3 Flash — verify exact model name from https://aistudio.google.com/models/gemini-3
- **Model availability:** Include Moonshot AI Kimi K2.5 (moonshotai/kimi-k2.5) via OpenRouter provider in model selection list
- **Evidence hierarchy:** PDF fulltext is preferred, but notes are sufficient to proceed with enrichment. Abstract-only items get queued as metadata-only.
- **Provider fallback:** User defines fallback order (e.g., Google → Anthropic → OpenAI) in settings. System automatically tries next provider on failure.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-ai-service-layer-and-evidence-foundation*
*Context gathered: 2026-01-31*
