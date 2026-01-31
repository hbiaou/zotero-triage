/**
 * Google Provider
 *
 * Implementation for Google Generative AI API (Gemini models).
 * Supports Gemini 3 Flash (Preview), Gemini 1.5 Pro, Gemini 1.5 Flash models.
 */

import { BaseAIProvider } from '../base-provider';
import type { AIRequest, AIResponse } from '../types';
import { AIServiceError } from '../types';
import { registerProvider } from '../provider-factory';

/**
 * Google Generative AI provider implementation
 *
 * Uses generateContent endpoint with contents/systemInstruction structure.
 * Model name is part of URL, not request body.
 */
export class GoogleProvider extends BaseAIProvider {
  protected readonly baseUrl =
    'https://generativelanguage.googleapis.com/v1beta/models';

  constructor() {
    super('google');
  }

  /**
   * Build Google Generative AI request body
   *
   * Format:
   * {
   *   "contents": [
   *     {"role": "user", "parts": [{"text": "..."}]}
   *   ],
   *   "systemInstruction": {"parts": [{"text": "..."}]},
   *   "generationConfig": {
   *     "temperature": 0.7,
   *     "maxOutputTokens": 4096
   *   }
   * }
   */
  protected buildRequestBody(request: AIRequest): unknown {
    const body: {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      systemInstruction?: { parts: Array<{ text: string }> };
      generationConfig: {
        temperature: number;
        maxOutputTokens: number;
      };
    } = {
      contents: [
        {
          role: 'user',
          parts: [{ text: request.prompt }],
        },
      ],
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 4096,
      },
    };

    // Add system instruction if provided
    if (request.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: request.systemPrompt }],
      };
    }

    return body;
  }

  /**
   * Parse Google response into standard AIResponse format
   *
   * Google response structure:
   * {
   *   "candidates": [
   *     {
   *       "content": {
   *         "parts": [{"text": "..."}]
   *       },
   *       "finishReason": "STOP"
   *     }
   *   ],
   *   "usageMetadata": {
   *     "promptTokenCount": 123,
   *     "candidatesTokenCount": 456
   *   }
   * }
   */
  protected parseResponse(response: unknown): AIResponse {
    const data = response as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };

    // Validate response structure
    if (!data.candidates || data.candidates.length === 0) {
      throw new AIServiceError(
        'Invalid Google response: missing candidates',
        this.providerId,
        { isRetryable: false }
      );
    }

    const candidate = data.candidates[0];
    const content = candidate.content?.parts?.[0]?.text;

    if (!content) {
      throw new AIServiceError(
        'Invalid Google response: missing content',
        this.providerId,
        { isRetryable: false }
      );
    }

    // Map finishReason to standard format
    // Google uses: STOP, MAX_TOKENS, SAFETY, RECITATION, OTHER
    let finishReason: 'stop' | 'max_tokens' | 'error' = 'stop';
    if (candidate.finishReason === 'MAX_TOKENS') {
      finishReason = 'max_tokens';
    } else if (
      candidate.finishReason !== 'STOP' &&
      candidate.finishReason !== undefined
    ) {
      finishReason = 'error';
    }

    return {
      content,
      tokensUsed: {
        input: data.usageMetadata?.promptTokenCount ?? 0,
        output: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
      provider: this.providerId,
      model: 'unknown', // Google doesn't return model in response
      finishReason,
      rawResponse: response,
    };
  }

  /**
   * Get HTTP headers for Google API requests
   *
   * Google uses x-goog-api-key header for authentication
   */
  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey || '',
    };
  }

  /**
   * Complete request override to include model in URL
   *
   * Google API uses format: /models/{model}:generateContent
   * Model name must be in URL, not request body.
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

      // Build URL with model name
      const url = `${this.baseUrl}/${request.model}:generateContent`;

      // Make HTTP request
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      // Handle HTTP errors (use private method via any cast for access)
      if (!response.ok) {
        // Call parent's private handleHttpError via complete retry
        const errorData = await response.json().catch(() => ({}));
        throw new AIServiceError(
          `HTTP ${response.status}: ${response.statusText}`,
          this.providerId,
          {
            statusCode: response.status,
            isRetryable: response.status >= 500 || response.status === 429,
          }
        );
      }

      // Parse response body
      const responseData = await response.json();

      // Parse provider-specific response format
      const aiResponse = this.parseResponse(responseData);

      // Add model from request since Google doesn't return it
      return {
        ...aiResponse,
        model: request.model,
      };
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
            isRetryable: error.message.toLowerCase().includes('network'),
          }
        );
      }

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
   * Validate Google API credentials
   *
   * Calls /models endpoint to verify API key works.
   */
  async validateCredentials(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'GET',
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

// Auto-register with provider factory
registerProvider('google', () => new GoogleProvider());
