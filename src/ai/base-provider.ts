/**
 * Base AI Provider
 *
 * Abstract base class providing shared implementation for all AI providers.
 * Handles HTTP communication, error mapping, initialization, and credential validation.
 *
 * Subclasses need only implement provider-specific request/response format methods.
 */

import type {
  ProviderID,
  AIModel,
  AIRequest,
  AIResponse,
  AIProvider,
} from './types';
import { AIServiceError } from './types';
import { SUPPORTED_MODELS } from './models';
import { requestUrl } from 'obsidian';

/**
 * Abstract base provider class
 *
 * Provides shared implementation for:
 * - HTTP request/response handling
 * - Error mapping with retry logic
 * - Credential validation
 * - Initialization flow
 *
 * Subclasses must implement:
 * - buildRequestBody: Format provider-specific request
 * - parseResponse: Parse provider-specific response
 * - getHeaders: Provide authentication headers
 */
export abstract class BaseAIProvider implements AIProvider {
  public readonly providerId: ProviderID;
  public readonly models: AIModel[];
  protected apiKey: string | null = null;
  protected abstract readonly baseUrl: string;

  constructor(providerId: ProviderID) {
    this.providerId = providerId;
    this.models = SUPPORTED_MODELS[providerId] || [];

    if (this.models.length === 0) {
      console.warn(
        `[BaseAIProvider] No models found for provider: ${providerId}`
      );
    }
  }

  /**
   * Initialize the provider with API credentials
   *
   * @param apiKey - API key for authentication
   * @throws AIServiceError if credentials are invalid
   */
  async initialize(apiKey: string): Promise<void> {
    this.apiKey = apiKey;

    // Validate credentials by making a test request
    const isValid = await this.validateCredentials();
    if (!isValid) {
      this.apiKey = null; // Clear invalid key
      throw new AIServiceError(
        `Invalid API key for provider: ${this.providerId}`,
        this.providerId,
        {
          statusCode: 401,
          isRetryable: false,
        }
      );
    }
  }

  /**
   * Complete an AI request
   *
   * @param request - AI request parameters
   * @returns Promise resolving to AI response
   * @throws AIServiceError on failure
   */
  async complete(request: AIRequest): Promise<AIResponse> {
    // Ensure provider is initialized
    if (!this.apiKey) {
      throw new AIServiceError(
        `Provider ${this.providerId} not initialized. Call initialize() first.`,
        this.providerId,
        {
          statusCode: 401,
          isRetryable: false,
        }
      );
    }

    try {
      // Build provider-specific request body
      const requestBody = this.buildRequestBody(request);

      // Make HTTP request using Obsidian's requestUrl to bypass CORS
      const response = await requestUrl({
        url: this.baseUrl,
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
        throw: false, // Don't throw on non-200 status
      });

      // Handle HTTP errors
      if (response.status < 200 || response.status >= 300) {
        await this.handleHttpError(response);
      }

      // Parse response body (requestUrl returns json directly)
      const responseData = response.json;

      // Parse provider-specific response format
      const aiResponse = this.parseResponse(responseData);

      return aiResponse;
    } catch (error) {
      // Re-throw AIServiceError as-is
      if (error instanceof AIServiceError) {
        throw error;
      }

      // Wrap other errors
      if (error instanceof Error) {
        throw new AIServiceError(
          `Request failed: ${error.message}`,
          this.providerId,
          {
            isRetryable: this.isNetworkError(error),
          }
        );
      }

      // Unknown error type
      throw new AIServiceError(
        'Unknown error during request',
        this.providerId,
        {
          isRetryable: false,
        }
      );
    }
  }

  /**
   * Validate API credentials
   *
   * Makes a lightweight API call to verify credentials work.
   * Default implementation tries to complete a minimal request.
   * Subclasses can override for provider-specific validation.
   *
   * @returns Promise resolving to true if valid, false otherwise
   */
  async validateCredentials(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      // Attempt a minimal completion request
      await this.complete({
        prompt: 'test',
        model: this.models[0]?.id || 'test',
        maxTokens: 5,
      });
      return true;
    } catch (error) {
      // Credentials are invalid if we get 401/403
      if (error instanceof AIServiceError) {
        return error.statusCode !== 401 && error.statusCode !== 403;
      }
      return false;
    }
  }

  /**
   * Build provider-specific request body
   *
   * @param request - AI request parameters
   * @returns Provider-specific request body object
   */
  protected abstract buildRequestBody(request: AIRequest): unknown;

  /**
   * Parse provider-specific response into standard AIResponse
   *
   * @param response - Raw provider response
   * @returns Standardized AI response
   * @throws AIServiceError if response cannot be parsed
   */
  protected abstract parseResponse(response: unknown): AIResponse;

  /**
   * Get HTTP headers for requests
   *
   * Must include authentication headers (API key, bearer token, etc.)
   *
   * @returns HTTP headers object
   */
  protected abstract getHeaders(): Record<string, string>;

  /**
   * Handle HTTP error responses
   *
   * Maps HTTP status codes to AIServiceError with retry metadata.
   *
   * @param response - requestUrl response object
   * @throws AIServiceError with appropriate retry metadata
   */
  private async handleHttpError(response: {
    status: number;
    headers: Record<string, string>;
    json?: unknown;
    text?: string;
  }): Promise<never> {
    const status = response.status;
    let errorMessage = `HTTP ${status}`;

    // Try to extract error message from response body
    try {
      const errorBody = response.json as {
        error?: { message?: string };
        message?: string;
      };
      if (errorBody?.error?.message) {
        errorMessage = errorBody.error.message;
      } else if (errorBody?.message) {
        errorMessage = errorBody.message;
      }
    } catch {
      // Ignore JSON parse errors, use default message
    }

    // Map status codes to retry behavior
    const errorOptions: {
      statusCode: number;
      isRetryable: boolean;
      retryAfterSeconds?: number;
    } = {
      statusCode: status,
      isRetryable: false,
    };

    if (status === 401 || status === 403) {
      // Authentication errors - not retryable
      errorOptions.isRetryable = false;
      errorMessage = `Authentication failed: ${errorMessage}`;
    } else if (status === 429) {
      // Rate limiting - retryable with backoff
      errorOptions.isRetryable = true;
      const retryAfter = response.headers['retry-after'];
      if (retryAfter) {
        errorOptions.retryAfterSeconds = parseInt(retryAfter, 10);
      } else {
        errorOptions.retryAfterSeconds = 60; // Default 1 minute
      }
      errorMessage = `Rate limit exceeded: ${errorMessage}`;
    } else if (status >= 500 && status < 600) {
      // Server errors - retryable
      errorOptions.isRetryable = true;
      errorOptions.retryAfterSeconds = 5; // Retry after 5 seconds
      errorMessage = `Server error: ${errorMessage}`;
    } else if (status >= 400 && status < 500) {
      // Client errors (except auth/rate limit) - not retryable
      errorOptions.isRetryable = false;
      errorMessage = `Client error: ${errorMessage}`;
    }

    throw new AIServiceError(errorMessage, this.providerId, errorOptions);
  }

  /**
   * Check if error is a network error (retryable)
   *
   * @param error - Error object
   * @returns True if network error, false otherwise
   */
  private isNetworkError(error: Error): boolean {
    // Common network error indicators
    const networkErrorMessages = [
      'network',
      'fetch',
      'timeout',
      'connection',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
    ];

    const message = error.message.toLowerCase();
    return networkErrorMessages.some((keyword) => message.includes(keyword));
  }
}
