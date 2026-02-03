/**
 * AI Service Layer Type Definitions
 *
 * Defines interfaces for AI providers, models, requests, responses,
 * and evidence extraction hierarchy for literature analysis.
 */

/**
 * Supported AI provider identifiers
 */
export type ProviderID = 'openai' | 'google' | 'anthropic' | 'openrouter';

/**
 * AI model metadata and pricing information
 */
export interface AIModel {
  /** Model identifier (e.g., "gpt-4o", "gemini-3-flash-preview", "claude-sonnet-4-5") */
  id: string;
  /** Human-readable model name */
  name: string;
  /** Provider that hosts this model */
  providerId: ProviderID;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Cost per 1 million input tokens (USD) */
  costPer1MInputTokens: number;
  /** Cost per 1 million output tokens (USD) */
  costPer1MOutputTokens: number;
}

/**
 * Request to an AI provider for completion
 */
export interface AIRequest {
  /** User prompt/question */
  prompt: string;
  /** Model identifier to use */
  model: string;
  /** System prompt for context/instructions (optional) */
  systemPrompt?: string;
  /** Sampling temperature (0.0-1.0, default: 0.7) */
  temperature?: number;
  /** Maximum tokens to generate (default: 4096) */
  maxTokens?: number;
  /** Response format (Google-specific: "application/json" for JSON mode) */
  responseMimeType?: string;
  /** Response schema for controlled generation (Google-specific) */
  responseSchema?: {
    type: string;
    properties: Record<string, {
      type: string;
      enum?: string[];
      description?: string;
    }>;
    required?: string[];
  };
}

/**
 * Response from an AI provider
 */
export interface AIResponse {
  /** Generated text content */
  content: string;
  /** Token usage statistics */
  tokensUsed: {
    /** Input tokens consumed */
    input: number;
    /** Output tokens generated */
    output: number;
  };
  /** Provider that generated this response */
  provider: ProviderID;
  /** Model that generated this response */
  model: string;
  /** Reason completion finished */
  finishReason: 'stop' | 'max_tokens' | 'error';
  /** Raw provider response for debugging (optional) */
  rawResponse?: unknown;
}

/**
 * AI provider interface
 *
 * All provider implementations must implement this interface
 * for consistent integration with the AI service layer.
 */
export interface AIProvider {
  /** Unique provider identifier */
  readonly providerId: ProviderID;
  /** Models available from this provider */
  readonly models: AIModel[];
  /**
   * Complete a prompt request
   * @param request - Request parameters
   * @returns Promise resolving to AI response
   * @throws AIServiceError on failure
   */
  complete(request: AIRequest): Promise<AIResponse>;
  /**
   * Validate API credentials
   * @returns Promise resolving to true if credentials are valid
   */
  validateCredentials(): Promise<boolean>;
}

/**
 * Provider configuration
 *
 * Runtime configuration for a specific AI provider.
 * API keys are never persisted - loaded from secure storage at runtime.
 */
export interface ProviderConfig {
  /** Provider identifier */
  providerId: ProviderID;
  /** API key (runtime only, never persisted) */
  apiKey: string;
  /** Selected model ID to use by default */
  selectedModel: string;
  /** Fallback provider order if primary fails (optional) */
  fallbackOrder?: ProviderID[];
}

/**
 * Evidence level hierarchy for literature analysis
 *
 * Determines what content is available for AI analysis:
 * - FullText: Complete PDF text (highest quality, highest token cost)
 * - Notes: User annotations and highlights (medium quality, low cost)
 * - Abstract: Paper abstract only (low quality, very low cost)
 * - MetadataOnly: Title, authors, keywords (minimal quality, negligible cost)
 */
export type EvidenceLevel = 'FullText' | 'Notes' | 'Abstract' | 'MetadataOnly';

/**
 * Evidence extraction result
 *
 * Contains extracted content and metadata about sources and token estimates.
 */
export interface EvidenceExtraction {
  /** Evidence level achieved */
  level: EvidenceLevel;
  /** Extracted text content */
  content: string;
  /** Sources of evidence (e.g., ['pdf_fulltext'], ['zotero_notes'], ['abstract']) */
  sources: string[];
  /** Estimated token count for this content (optional) */
  tokenEstimate?: number;
}

/**
 * AI service error
 *
 * Custom error class for AI service failures with provider context
 * and retry metadata.
 */
export class AIServiceError extends Error {
  /** Provider that generated this error */
  public providerId: ProviderID;
  /** HTTP status code if applicable */
  public statusCode?: number;
  /** Whether this error is retryable */
  public isRetryable: boolean;
  /** Suggested retry delay in seconds (if retryable) */
  public retryAfterSeconds?: number;

  constructor(
    message: string,
    providerId: ProviderID,
    options: {
      statusCode?: number;
      isRetryable?: boolean;
      retryAfterSeconds?: number;
    } = {}
  ) {
    super(message);
    this.name = 'AIServiceError';
    this.providerId = providerId;
    this.statusCode = options.statusCode;
    this.isRetryable = options.isRetryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AIServiceError);
    }
  }
}
