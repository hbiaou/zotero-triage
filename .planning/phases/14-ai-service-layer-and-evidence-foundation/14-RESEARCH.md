# Phase 14: AI Service Layer & Evidence Foundation - Research

**Researched:** 2026-01-31
**Domain:** AI provider abstraction, secret management, evidence extraction, resilience patterns
**Confidence:** HIGH for core patterns; MEDIUM for Obsidian SecretStorage API details; LOW for implementation specifics

## Summary

Phase 14 establishes the foundational infrastructure for all AI-powered enrichment features in v2.0. Research confirms three critical domains:

1. **API Provider Abstraction Pattern** - The standard approach uses a unified interface layer that abstracts provider-specific APIs (OpenAI, Google, Anthropic, OpenRouter). Multi-provider orchestration is industry standard, with most gateways adopting OpenAI's API format as the contract.

2. **Secret Storage** - Obsidian 1.11.4+ (Jan 2026) provides official SecretStorage API for cross-platform encrypted key management (macOS Keychain, Windows Credential Manager, Linux Secret Service). This is the standard recommendation for Obsidian plugins.

3. **Resilience Architecture** - Exponential backoff with jitter + circuit breaker pattern is the established stack. Token bucket rate limiting (not fixed windows) is universal across all major AI providers.

4. **Evidence Hierarchy** - Zotero stores fulltext in `.zotero-ft-cache` files in storage folders; notes are accessible via API; fallback to abstract/metadata is necessary for queuing metadata-only items.

**Primary recommendation:** Implement a unified `AIProvider` interface with concrete implementations (OpenAI, Google, Anthropic, OpenRouter), use Obsidian's SecretStorage for key management, and apply exponential backoff with circuit breaker for resilience. Build evidence hierarchy as (PDF fulltext → notes → abstract → metadata-only).

## Standard Stack

### AI Provider APIs (Current 2026)

| Provider | Model(s) | API Contract | Rate Limit Pattern | Priority |
|----------|----------|--------------|-------------------|----------|
| **Google** | Gemini 3 Flash (gemini-3-flash-preview) | REST JSON, OpenAI-compatible available via OpenRouter | Token bucket: input/output TPM + RPM | HIGH - default per phase context |
| **OpenAI** | GPT-4o, GPT-4 Turbo, o1 | REST JSON, native OpenAI format | Token bucket: TPM (combined input/output) + RPM | HIGH - industry standard |
| **Anthropic** | Claude Opus 4.5, Claude Sonnet 4.5, Claude Haiku 4.5 | REST JSON, `retry-after` headers on 429 | Token bucket: uncached ITPM + OTPM + RPM, prompt caching benefits | HIGH - cache-aware limits unique advantage |
| **OpenRouter** | 30+ models including Moonshot Kimi K2.5 | OpenAI-compatible REST JSON | Unified interface over underlying providers | MEDIUM - aggregator, not primary |

**Default Model:** `gemini-3-flash-preview` (Google AI Studio). Pricing: $0.50/M input tokens, $3/M output tokens.

### Secret Storage

| Solution | Platform Coverage | Status | Confidence | Notes |
|----------|------------------|--------|-----------|-------|
| **Obsidian SecretStorage API** | macOS Keychain, Windows Credential Manager, Linux Secret Service | Stable (v1.11.4+, Jan 2026) | HIGH | Official, cross-platform, shared across plugins |
| libsodium.js | Browser-compatible | Stable | MEDIUM | Fallback if SecretStorage unavailable, 310KB (min+gz) |
| Electron/Node keytar | Electron apps | Stable | LOW - not Obsidian context | Only if non-Obsidian wrapper needed |

**Primary choice: Obsidian SecretStorage API** - handles all OS-specific complexity, integrates with OS keychain/credential managers automatically.

### Resilience & Retry Patterns

| Pattern | Implementation | Current Standard | Why Use |
|---------|----------------|------------------|---------|
| **Exponential Backoff** | baseDelay * (2 ^ attempt) | Basedelay 1s, max 30s, cap at 3 retries | Prevents cascade failures; respects provider recovery time |
| **Jitter** | baseDelay * (1 + random(0-1)) | Always include randomness in backoff | Prevents "thundering herd" (many clients retrying in sync) |
| **Circuit Breaker** | Count consecutive failures, open after threshold | Threshold: 5 consecutive failures OR rate-based | Stops hammering failing service, auto-recovery with half-open state |
| **Rate Limit Awareness** | Read `retry-after` header (all providers) | Always use provider's explicit retry-after | Anthropic: critical advantage, super accurate timing |

**Installation (existing in package.json):**
```bash
npm install lodash.debounce zod  # Already present
npm install node-fetch pino-http # For future HTTP client if needed
```

### Evidence Extraction

| Source | Priority | Query Method | Cache | Availability |
|--------|----------|--------------|-------|--------------|
| **PDF Fulltext** | 1 (Primary) | Zotero .zotero-ft-cache files in storage/{8char}/ | File system cache | When PDFs attached in Zotero |
| **Notes** | 2 (Secondary) | Zotero Web API v3, direct SQLite query to `items` table notes field | In-memory, 10min TTL | Always (even empty notes exist) |
| **Abstract** | 3 (Tertiary) | SQLite `itemData` table with `fieldID=116` (abstract field) | Schema-cached | Metadata only, may be empty |
| **Metadata** | 4 (Metadata-Only) | SQLite `items` table title + creators | Always available | Last resort, insufficient for enrichment |

**Cache structure:** `.zotero-ft-cache` files are plaintext in Zotero storage directories; filename pattern: `{8-char-folder}/.zotero-ft-cache`

## Architecture Patterns

### Recommended Project Structure

```
src/
├── ai/                          # AI provider abstraction layer
│   ├── providers/               # Concrete provider implementations
│   │   ├── openai-provider.ts
│   │   ├── google-provider.ts
│   │   ├── anthropic-provider.ts
│   │   └── openrouter-provider.ts
│   ├── base-provider.ts         # Abstract interface/base class
│   ├── provider-factory.ts      # Factory for creating providers
│   └── types.ts                 # Shared types (AIModel, APIResponse, etc.)
│
├── services/
│   ├── ai-service.ts            # Orchestrates provider selection, fallback, rate limiting
│   ├── evidence-extractor.ts    # Evidence hierarchy: PDF → notes → abstract → metadata
│   ├── secret-storage.ts        # Obsidian SecretStorage wrapper
│   └── resilience.ts            # Exponential backoff, circuit breaker, queue retry
│
├── settings.ts                  # Extended to include AI Service section
└── ui/
    └── ai-service-settings-modal.ts  # API key config UI
```

### Pattern 1: Provider Abstraction Layer (Multi-Provider Orchestration)

**What:** Unified interface allowing providers to be swapped without changing consumer code. Consumers call abstract `AIProvider.complete(prompt, options)` regardless of backend.

**When to use:** Essential for Phase 14. All downstream enrichment phases (15+) depend on this abstraction to support user-selected provider switching.

**Standard approach (2026):**
```typescript
// Source: Entrio LLM Abstraction Layer, continuedev/continue reference architecture
export interface AIProvider {
  readonly providerId: string;
  readonly models: AIModel[];

  complete(request: {
    prompt: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  }): Promise<AIResponse>;

  validateCredentials(): Promise<boolean>;
  getUsageQuota?(): Promise<QuotaInfo>;
}

export interface AIResponse {
  content: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  provider: string;
  model: string;
  finishReason: 'stop' | 'max_tokens' | 'error';
}
```

**Key insight:** Don't inherit from a base class if simple interface suffices. Each provider (OpenAI, Google, Anthropic, OpenRouter) is a separate module with dedicated error handling for provider-specific status codes.

### Pattern 2: Evidence Hierarchy Extraction

**What:** Enforces priority order: PDF fulltext preferred, notes acceptable, abstract/metadata-only queued for later. Each document is tagged with evidence level in YAML frontmatter.

**When to use:** Phase 14. Downstream phases check evidence level to decide enrichment strategy.

**Standard approach:**
```typescript
// Source: Zotero data structure patterns, evidence quality frameworks
export interface EvidenceExtraction {
  level: 'FullText' | 'Notes' | 'Abstract' | 'MetadataOnly';
  content: string;
  sources: string[]; // e.g., ["pdf", "notes"], ["abstract"], ["title"]
}

// Evidence hierarchy enforced in extraction service
async extractEvidence(itemId: string): Promise<EvidenceExtraction> {
  // 1. Try PDF fulltext from .zotero-ft-cache
  const pdfText = await this.extractPDFFulltext(itemId);
  if (pdfText && pdfText.trim().length > MIN_CONTENT_LENGTH) {
    return { level: 'FullText', content: pdfText, sources: ['pdf'] };
  }

  // 2. Fall back to notes + highlights
  const notesText = await this.extractZoteroNotes(itemId);
  if (notesText && notesText.trim().length > MIN_CONTENT_LENGTH) {
    return { level: 'Notes', content: notesText, sources: ['notes'] };
  }

  // 3. Fall back to abstract
  const abstractText = await this.extractAbstract(itemId);
  if (abstractText && abstractText.trim().length > MIN_CONTENT_LENGTH) {
    return { level: 'Abstract', content: abstractText, sources: ['abstract'] };
  }

  // 4. Queue metadata-only items (insufficient evidence)
  return { level: 'MetadataOnly', content: '', sources: ['metadata'] };
}
```

### Pattern 3: Resilience - Exponential Backoff + Circuit Breaker

**What:** Automatic retry with exponential delay + jitter, circuit breaker to stop retry storms on persistent failures.

**When to use:** Every AI API call. Required by AI-06 and AI-10 in phase requirements.

**Standard approach (2026):**
```typescript
// Source: AWS Builders Library, Medium 2025-2026 consensus
export interface RetryConfig {
  maxRetries: number;           // 3 attempts total
  baseDelayMs: number;          // Start at 1000ms
  maxDelayMs: number;           // Cap at 30000ms
  backoffMultiplier: number;    // Exponential: 2x per retry
  jitterFraction: number;       // 0.1 = 10% random variation
  useRetryAfterHeader: boolean; // Prefer provider's explicit retry-after
}

export interface CircuitBreakerConfig {
  failureThreshold: number;     // 5 consecutive failures
  successThreshold: number;     // 2 successes to close circuit
  timeout: number;              // 60s before attempting half-open
}

// Implementation pattern
async callAIWithResilience(
  provider: AIProvider,
  request: AIRequest
): Promise<AIResponse> {
  const circuit = this.getOrCreateCircuit(provider.providerId);

  if (circuit.isOpen()) {
    if (circuit.isHalfOpen()) {
      // Try one request to recover
      try {
        return await this.executeWithRetry(provider, request);
      } catch {
        circuit.recordFailure();
        throw new Error('Circuit breaker open, service unavailable');
      }
    }
    throw new Error('Circuit breaker open');
  }

  try {
    const result = await this.executeWithRetry(provider, request);
    circuit.recordSuccess();
    return result;
  } catch (error) {
    circuit.recordFailure();
    throw error;
  }
}

private async executeWithRetry(
  provider: AIProvider,
  request: AIRequest
): Promise<AIResponse> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
    try {
      return await provider.complete(request);
    } catch (error) {
      lastError = error as Error;

      if (attempt < this.config.maxRetries - 1) {
        const delay = this.calculateBackoff(attempt);
        await this.sleep(delay);
      }
    }
  }

  throw lastError;
}

private calculateBackoff(attempt: number): number {
  const exponential = this.config.baseDelayMs * Math.pow(
    this.config.backoffMultiplier,
    attempt
  );
  const capped = Math.min(exponential, this.config.maxDelayMs);
  const jitter = capped * (0.5 + Math.random()); // ±50% jitter
  return Math.round(jitter);
}
```

### Pattern 4: Secret Storage - Obsidian Integration

**What:** Wrapper around Obsidian's SecretStorage API that handles platform-specific keychain/credential manager storage transparently.

**When to use:** Any plugin storing API keys, tokens, or sensitive credentials.

**Standard approach (as of Obsidian 1.11.4, Jan 2026):**
```typescript
// Source: Obsidian SecretStorage API (official)
// https://docs.obsidian.md/ and Obsidian plugin examples

import { App, SecretStorage } from 'obsidian';

export class AIKeyVaultService {
  constructor(
    private app: App,
    private vault: SecretStorage
  ) {}

  async setAPIKey(provider: string, key: string): Promise<void> {
    const secretId = `ai-api-key-${provider}`;
    await this.vault.setPassword(secretId, key);
  }

  async getAPIKey(provider: string): Promise<string | null> {
    const secretId = `ai-api-key-${provider}`;
    return await this.vault.getPassword(secretId);
  }

  async deleteAPIKey(provider: string): Promise<void> {
    const secretId = `ai-api-key-${provider}`;
    await this.vault.removePassword(secretId);
  }

  async listConfiguredProviders(): Promise<string[]> {
    // Iterate vault to find all 'ai-api-key-*' entries
    const providers = [];
    // Implementation depends on Obsidian vault iteration API
    return providers;
  }
}
```

## Don't Hand-Roll

Problems that look simple but have existing, essential solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API key storage encryption | Custom crypto in localStorage | Obsidian SecretStorage API | OS keychains handle platform differences (macOS, Windows, Linux); custom crypto in browser is cryptographically weak |
| Provider abstraction | One-off provider implementations | Unified interface + factory pattern | Provider APIs change; abstraction prevents rewrites downstream. Multi-provider support requires centralized error mapping |
| Rate limit handling | Naive retry loops | Exponential backoff + jitter + circuit breaker | Naive retries cause cascade failures. Jitter prevents thundering herd. Circuit breaker prevents hammering dead services. |
| Token bucket simulation | Manual epoch tracking | Use provider's `retry-after` header + understood token bucket algorithm | Providers are accurate; guessing is wrong. Token bucket != fixed windows |
| PDF extraction | Custom PDF.js wrapper | Zotero cache files + PDF.js fallback | Zotero already extracts and caches. Reinventing OCR/parsing is expensive |
| Evidence scoring | Ad-hoc rule engine | Structured hierarchy (PDF > Notes > Abstract > Metadata) | Consistent scoring enables downstream tasks (queuing, fallback strategy). Ad-hoc rules are unmaintainable |

**Key insight:** The AI integration layer is where many plugins fail—they implement per-provider logic, hardcode API details, and lack resilience. This phase's abstraction prevents all of that.

## Common Pitfalls

### Pitfall 1: Hardcoding Provider-Specific Error Codes

**What goes wrong:** OpenAI returns 429 for rate limits; Anthropic returns 529 for server overload (not user's fault). Without provider-specific error mapping, you retry forever on non-retryable errors.

**Why it happens:** Developers assume all providers use HTTP status codes uniformly. They don't.

**How to avoid:**
- Create provider-specific error handler interface: `interface ErrorHandler { isRetryable(error): boolean; }`
- Each provider implements its own handler mapping status codes to retry strategy
- Document provider-specific behaviors in code comments

**Warning signs:**
- Same retry logic for all providers
- Blindly retrying all 429 errors without checking provider context
- Anthropic's 529 treated same as 429

### Pitfall 2: Assuming SecretStorage is Available on All Obsidian Versions

**What goes wrong:** SecretStorage API landed in Obsidian 1.11.4 (Jan 2026). Older versions don't have it. Plugin breaks on older Obsidian.

**Why it happens:** API is new; developers don't know it's not universal yet.

**How to avoid:**
- Detect Obsidian version at startup: `app.vault.adapter.getName()`
- Graceful fallback if SecretStorage unavailable (localStorage with warning, or libsodium.js)
- Document minimum Obsidian version in manifest (>= 1.11.4)

**Warning signs:**
- Plugin crashes on older Obsidian installations
- Settings tab shows errors about SecretStorage not found
- Test only on latest Obsidian version

### Pitfall 3: Evidence Hierarchy Without Minimum Length Threshold

**What goes wrong:** Notes field exists but is empty; abstract is one sentence; neither has enough content for enrichment. You proceed with insufficient evidence, sending garbage to LLM.

**Why it happens:** Checking `if (notes)` instead of `if (notes && notes.trim().length > MIN_LENGTH)`.

**How to avoid:**
- Define minimum content length: e.g., `MIN_EVIDENCE_LENGTH = 100 chars`
- Always check both existence and minimum length
- Queue items with insufficient evidence instead of enriching with metadata-only

**Warning signs:**
- LLM outputs generic/hallucinated content for some items
- You see notes-level enrichment happening on metadata-only items
- Evidence level log shows "Notes" but content is 1-2 words

### Pitfall 4: Token Bucket Rate Limiting Misunderstanding

**What goes wrong:** You think you have 1000 RPM = "I can send 1000 requests at the start of each minute." Reality: token bucket refills continuously at ~16.7 req/sec (for 1000 RPM). Burst 100 requests in 1 second and you've used your budget.

**Why it happens:** Developers confuse token bucket (continuous refill) with fixed windows (reset at interval).

**How to avoid:**
- Understand token bucket: your capacity continuously refills up to limit, not reset at minute boundaries
- Use provider's rate limit headers to track remaining quota in real-time
- Space requests evenly; don't batch burst
- Test with actual API not local mock

**Warning signs:**
- You hit rate limits before expected time
- Burst of requests triggers 429 even though average is under limit
- Response headers show 0 remaining quota unexpectedly

### Pitfall 5: Circuit Breaker Threshold Too Low

**What goes wrong:** Circuit breaker opens after 2 failures (transient network hiccup), stops all requests, users see "service unavailable" while provider is actually fine.

**Why it happens:** Defensive thinking: "open early to prevent cascade." Too defensive = false positives.

**How to avoid:**
- Use threshold of 5+ consecutive failures (transient glitches rarely exceed 2 in a row)
- Implement half-open state: circuit allows probe request before fully closing
- Use timeouts: even if threshold not met, try recovery after 60s
- Log circuit state changes so you can observe in production

**Warning signs:**
- Circuit breaker triggers on single transient error
- Users report intermittent "service unavailable" during normal operation
- Logs show rapid open/close cycling

### Pitfall 6: Zotero Cache Staleness Not Handled

**What goes wrong:** You read a `.zotero-ft-cache` file, but it's 2 months old and the PDF was updated in Zotero but not re-indexed. You extract old content.

**Why it happens:** `.zotero-ft-cache` is user-driven (Zotero re-indexes only if user opens PDF in Zotero). No automatic refresh.

**How to avoid:**
- Check cache file mtime vs item update timestamp in Zotero database
- If cache is stale, fall back to notes instead (don't use stale PDF)
- Document this behavior: "PDF fulltext may be stale if user hasn't opened it in Zotero recently"
- Optionally: trigger Zotero re-index via plugin communication (if API available)

**Warning signs:**
- Enrichment differs for old vs newly-added items
- Users report "it used old PDF content"
- PDF cache file dates are months old

## Code Examples

### Setting up AI Service with Provider Abstraction

```typescript
// Source: Multi-provider LLM orchestration patterns, continuedev/continue
// File: src/ai/base-provider.ts

export interface AIModel {
  id: string;
  name: string;
  contextWindow: number;
  costPer1MInputTokens: number;
  costPer1MOutputTokens: number;
}

export interface AIResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  provider: string;
  model: string;
  finishReason: 'stop' | 'max_tokens' | 'error';
  rawResponse?: unknown;
}

export abstract class BaseAIProvider {
  readonly providerId: string;
  readonly models: AIModel[];
  protected apiKey: string | null = null;

  abstract complete(request: {
    prompt: string;
    model: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<AIResponse>;

  abstract validateCredentials(): Promise<boolean>;

  async initialize(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
    const isValid = await this.validateCredentials();
    if (!isValid) {
      throw new Error(`Invalid API key for ${this.providerId}`);
    }
  }
}
```

### Evidence Extraction with Hierarchy

```typescript
// Source: Zotero data structure + evidence quality frameworks
// File: src/services/evidence-extractor.ts

const MIN_EVIDENCE_LENGTH = 100; // chars

export async class EvidenceExtractor {
  async extract(item: ZoteroItem): Promise<EvidenceExtraction> {
    // 1. Try PDF fulltext from cache
    const pdfContent = await this.extractPDFFulltext(item);
    if (this.isValidEvidence(pdfContent)) {
      return {
        level: 'FullText',
        content: pdfContent,
        sources: ['pdf_fulltext']
      };
    }

    // 2. Try Zotero notes
    const notesContent = await this.extractZoteroNotes(item);
    if (this.isValidEvidence(notesContent)) {
      return {
        level: 'Notes',
        content: notesContent,
        sources: ['zotero_notes']
      };
    }

    // 3. Try abstract from metadata
    const abstractContent = await this.extractAbstract(item);
    if (this.isValidEvidence(abstractContent)) {
      return {
        level: 'Abstract',
        content: abstractContent,
        sources: ['abstract']
      };
    }

    // 4. Metadata only (insufficient - queue for later)
    return {
      level: 'MetadataOnly',
      content: '',
      sources: ['metadata']
    };
  }

  private async extractPDFFulltext(item: ZoteroItem): Promise<string> {
    try {
      // Try Zotero cache first
      const cachePath = await this.locateCacheFile(item.key);
      if (cachePath) {
        const cached = await fs.promises.readFile(cachePath, 'utf-8');
        return cached;
      }
    } catch (error) {
      // Fall through to other methods
    }
    return '';
  }

  private async extractZoteroNotes(item: ZoteroItem): Promise<string> {
    // Query Zotero database for notes associated with item
    const notes = await this.db.query(`
      SELECT note FROM items WHERE parentID = ? AND itemTypeID = ?
    `, [item.id, NOTE_ITEM_TYPE]);

    return notes.map(n => n.note).join('\n\n');
  }

  private async extractAbstract(item: ZoteroItem): Promise<string> {
    const abstract = await this.db.query(`
      SELECT value FROM itemData id
      JOIN itemDataValues idv ON id.valueID = idv.valueID
      WHERE id.itemID = ? AND id.fieldID = ?
    `, [item.id, ABSTRACT_FIELD_ID]); // fieldID 116 = abstract

    return abstract[0]?.value || '';
  }

  private isValidEvidence(content: string): boolean {
    return content && content.trim().length >= MIN_EVIDENCE_LENGTH;
  }
}
```

### Resilience with Exponential Backoff + Circuit Breaker

```typescript
// Source: AWS Builders Library, exponential backoff + jitter patterns
// File: src/services/resilience.ts

export class ResilientAIService {
  private circuits = new Map<string, CircuitBreaker>();

  async callAI(
    provider: BaseAIProvider,
    request: AICompleteRequest
  ): Promise<AIResponse> {
    const circuit = this.getCircuit(provider.providerId);

    if (circuit.isOpen() && !circuit.isHalfOpen()) {
      throw new Error(`Circuit breaker open for ${provider.providerId}`);
    }

    try {
      const response = await this.executeWithRetry(provider, request);
      circuit.recordSuccess();
      return response;
    } catch (error) {
      circuit.recordFailure();
      throw error;
    }
  }

  private async executeWithRetry(
    provider: BaseAIProvider,
    request: AICompleteRequest
  ): Promise<AIResponse> {
    const config = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterFraction: 0.1
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
      try {
        return await provider.complete(request);
      } catch (error) {
        lastError = error as Error;

        if (this.isRetryable(error, provider) && attempt < config.maxRetries - 1) {
          const retryAfter = this.extractRetryAfter(error);
          const delay = retryAfter
            ? retryAfter * 1000
            : this.calculateExponentialBackoff(attempt, config);

          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Max retries exhausted');
  }

  private calculateExponentialBackoff(attempt: number, config: any): number {
    const exponential = config.baseDelayMs * Math.pow(
      config.backoffMultiplier,
      attempt
    );
    const capped = Math.min(exponential, config.maxDelayMs);
    const jitter = capped * (0.5 + Math.random());
    return Math.round(jitter);
  }

  private isRetryable(error: any, provider: BaseAIProvider): boolean {
    // Provider-specific error mapping
    if (provider.providerId === 'anthropic') {
      return error.status === 429; // Rate limit only
      // Do NOT retry 529 (server overload, not user's fault)
    }

    if (provider.providerId === 'openai') {
      return error.status === 429 || error.status === 500;
    }

    return error.status >= 500; // Default: retry server errors
  }

  private extractRetryAfter(error: any): number | null {
    // All major providers include 'retry-after' header in 429/429-like responses
    return error.headers?.['retry-after']
      ? parseInt(error.headers['retry-after'], 10)
      : null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getCircuit(providerId: string): CircuitBreaker {
    if (!this.circuits.has(providerId)) {
      this.circuits.set(providerId, new CircuitBreaker({
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000 // 60s before half-open
      }));
    }
    return this.circuits.get(providerId)!;
  }
}

class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;

  constructor(private config: any) {}

  isOpen(): boolean {
    if (this.state === 'open') {
      // Check if timeout expired for recovery
      if (Date.now() - this.lastFailureTime > this.config.timeout) {
        this.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  isHalfOpen(): boolean {
    return this.state === 'half-open';
  }

  recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'closed';
        this.successCount = 0;
      }
    }
  }

  recordFailure(): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }
}
```

## State of the Art

| Aspect | Old Approach | Current Approach (2026) | When Changed | Impact |
|--------|--------------|------------------------|--------------|--------|
| Secret storage | localStorage or hardcoded env | Obsidian SecretStorage API (v1.11.4) | Jan 2026 | Cross-platform, secure by default, shared secrets across plugins |
| Rate limiting | Naive retry loops | Token bucket + exponential backoff + circuit breaker | 2024-2025 | Prevents cascade failures, respects provider limits |
| Provider abstraction | Hardcoded per-provider logic | Unified interface + factory + error mapping | 2024-2025 | Enables provider switching without code changes |
| Evidence hierarchy | Ad-hoc checking | Structured levels (FullText → Notes → Abstract → Metadata) | 2025 | Enables queuing, fallback strategy, consistent scoring |
| Rate limit headers | Ignored, assumed fixed windows | Always read `retry-after` + understand token bucket | 2025 | Anthropic advantage: cache-aware ITPM excludes cached tokens |

**Deprecated/outdated:**
- **Hardcoded API endpoints** (pre-2024): Providers change endpoints; discovery via marketplace is better
- **Single provider support** (pre-2024): Users need fallback; multi-provider is standard
- **Basic retry (sleep+loop)** (pre-2024): Doesn't consider jitter or circuit breaker; causes cascades
- **localStorage for secrets** (pre-2026): Weak cryptography; OS keychains are standard now

## Open Questions

1. **API Key Validation Approach**
   - What we know: Phase context marks this as "Claude's discretion" (test button, automatic, or on-demand)
   - What's unclear: Whether Obsidian SecretStorage has a built-in "test connection" feature
   - Recommendation: Implement explicit test button in settings (e.g., small API call to retrieve model list). Don't validate on first use (would block workflow). Don't rely on automatic background validation (UX unclear).
   - Status: LOW confidence on best UX pattern; needs design input

2. **Provider Fallback Order Configuration**
   - What we know: Phase context specifies "user defines fallback order" but doesn't specify UI/UX
   - What's unclear: Drag-to-reorder vs dropdown menu vs input field vs priority numbers
   - Recommendation: Drag-to-reorder list (Obsidian plugins commonly use this pattern). Alternatives noted as future work.
   - Status: MEDIUM confidence; needs UX review

3. **Zotero Cache Staleness Detection**
   - What we know: `.zotero-ft-cache` files exist; Zotero re-indexes on-demand
   - What's unclear: Can plugin reliably detect when cache is stale without querying Zotero app directly
   - Recommendation: Compare cache file mtime with item's dateModified in SQLite. If cache > 1 month old, treat as stale.
   - Status: MEDIUM confidence; needs Zotero API exploration in Phase 14 tasks

4. **Circuit Breaker Threshold Tuning**
   - What we know: 5 consecutive failures is industry standard; half-open state with probe is recommended
   - What's unclear: Whether plugin should track circuit per provider or per (provider, model) pair
   - Recommendation: Per-provider is simpler (Phase 14); per-model tracking deferred to future optimization
   - Status: HIGH confidence on approach; implementation detail deferred

5. **Hallucination Prevention vs Detection**
   - What we know: Evidence hierarchy (PDF > notes > abstract) and structured output validation are patterns
   - What's unclear: Whether Phase 14 should include hallucination detection (token-level analysis, fact checking) or defer to Phase 15+
   - Recommendation: Phase 14 establishes evidence foundation and basic output validation (JSON schema). Hallucination detection deferred to enrichment phases where use case is clearer.
   - Status: LOW confidence; needs feature scope clarification

## Sources

### Primary (HIGH confidence)

- **Anthropic Rate Limits & Retry Headers**: https://platform.claude.com/docs/en/api/rate-limits — Official docs covering token bucket, RPM/ITPM/OTPM limits, retry-after header, cache-aware limits (Jan 2026)
- **Obsidian SecretStorage API**: https://obsidian.md/changelog/2026-01-07-desktop-v1.11.4/ — Official release notes confirming SecretStorage API in v1.11.4 (Jan 2026)
- **Google Gemini 3 Flash**: https://ai.google.dev/gemini-api/docs/models — Official model identifier (gemini-3-flash-preview), pricing ($0.50/$3 per 1M tokens)
- **OpenAI Rate Limits**: https://platform.openai.com/docs/guides/rate-limits — Official docs on RPM/TPM, exponential backoff guidance
- **Zotero Data Structure**: https://www.zotero.org/support/zotero_data — Official docs on `.zotero-ft-cache` files, storage folder structure, SQLite database

### Secondary (MEDIUM confidence)

- **Multi-Provider LLM Orchestration (2026)**: https://dev.to/ash_dubai/multi-provider-llm-orchestration-in-production-a-2026-guide-1g10 — DEV Community 2026 guide on provider abstraction patterns, unified interfaces
- **Circuit Breaker Pattern**: https://medium.com/@usama19026/building-resilient-applications-circuit-breaker-pattern-with-exponential-backoff-fc14ba0a0beb — Medium 2025 on circuit breaker + exponential backoff specifics
- **OpenRouter API**: https://openrouter.ai/moonshotai/kimi-k2.5 — Confirms Moonshot Kimi K2.5 availability via OpenRouter, OpenAI-compatible interface
- **Zotero SQLite Queries**: https://gist.github.com/fractaledmind/8807970 — Community-maintained SQLite queries for Zotero database structure (notes, metadata tables)

### Tertiary (LOW confidence)

- **Obsidian SecretStorage Details**: https://forum.obsidian.md/t/cross-platform-secure-storage-for-secrets-and-tokens-that-can-be-syncd/100716 — Forum discussion on SecretStorage API (implementation details not officially documented yet)
- **Hallucination Detection Framework**: https://arxiv.org/pdf/2601.09929 — Academic paper on hallucination detection (emerging research, not production-standard yet)
- **PDF.js vs PDFium Performance**: https://www.nutrient.io/blog/why-pdfium-is-a-trusted-platform-for-pdf-rendering/ — Blog post on PDF rendering libraries (text extraction performance not definitively benchmarked for plugin context)

## Metadata

**Confidence breakdown:**
- **Standard Stack (Providers/APIs)**: HIGH — Official documentation current as of Jan 2026; APIs stable for 2+ years
- **Secret Storage (Obsidian)**: HIGH — Official API in released version (1.11.4); implementation documented
- **Resilience Patterns**: HIGH — Multi-source agreement (AWS, Google, industry consensus); proven in production systems
- **Evidence Extraction**: MEDIUM — Zotero data structure well-documented; cache staleness handling requires Phase 14 exploration
- **Circuit Breaker Specifics**: MEDIUM — Pattern well-understood; threshold tuning requires production metrics
- **Hallucination Prevention**: LOW — Emerging area; Phase 14 role unclear; defer to downstream phases

**Research date:** 2026-01-31
**Valid until:** 2026-02-28 (30 days; expires when Phase 15+ research occurs as those will refine AI service patterns)
**Next review trigger:** When Phase 15 enrichment phases begin (will reveal whether evidence hierarchy and hallucination prevention need updates)
