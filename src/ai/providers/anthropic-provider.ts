/**
 * Anthropic Provider
 *
 * Implementation for Anthropic's Messages API (Claude models).
 * Supports Claude Sonnet 4.5, Claude Opus 4.5, and Claude Sonnet 3.5 models.
 */

import { BaseAIProvider } from '../base-provider';
import type { AIRequest, AIResponse } from '../types';
import { AIServiceError } from '../types';
import { registerProvider } from '../provider-factory';

/**
 * Anthropic API provider implementation
 *
 * Uses Messages API with system parameter and messages array.
 * Requires x-api-key header and anthropic-version header.
 */
export class AnthropicProvider extends BaseAIProvider {
  protected readonly baseUrl = 'https://api.anthropic.com/v1/messages';

  constructor() {
    super('anthropic');
  }

  /**
   * Build Anthropic-specific request body
   *
   * Format:
   * {
   *   "model": "claude-sonnet-4-5-20250929",
   *   "max_tokens": 4096,
   *   "system": "...",
   *   "messages": [
   *     {"role": "user", "content": "..."}
   *   ]
   * }
   */
  protected buildRequestBody(request: AIRequest): unknown {
    return {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.systemPrompt ?? 'You are a helpful assistant.',
      messages: [
        {
          role: 'user',
          content: request.prompt,
        },
      ],
      // Note: Anthropic doesn't support temperature in Messages API
      // Temperature is model-specific and set at model level
    };
  }

  /**
   * Parse Anthropic response into standard AIResponse format
   *
   * Anthropic response structure:
   * {
   *   "id": "msg_...",
   *   "type": "message",
   *   "role": "assistant",
   *   "content": [
   *     {"type": "text", "text": "..."}
   *   ],
   *   "model": "claude-sonnet-4-5-20250929",
   *   "stop_reason": "end_turn",
   *   "usage": {
   *     "input_tokens": 123,
   *     "output_tokens": 456
   *   }
   * }
   */
  protected parseResponse(response: unknown): AIResponse {
    const data = response as {
      content?: Array<{ type?: string; text?: string }>;
      stop_reason?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
      model?: string;
    };

    // Validate response structure
    if (!data.content || data.content.length === 0) {
      throw new AIServiceError(
        'Invalid Anthropic response: missing content',
        this.providerId,
        { isRetryable: false }
      );
    }

    // Find text content block
    const textBlock = data.content.find((block) => block.type === 'text');
    const content = textBlock?.text;

    if (!content) {
      throw new AIServiceError(
        'Invalid Anthropic response: missing text content',
        this.providerId,
        { isRetryable: false }
      );
    }

    // Map stop_reason to standard format
    // Anthropic uses: end_turn, max_tokens, stop_sequence, tool_use
    let finishReason: 'stop' | 'max_tokens' | 'error' = 'stop';
    if (data.stop_reason === 'max_tokens') {
      finishReason = 'max_tokens';
    } else if (
      data.stop_reason !== 'end_turn' &&
      data.stop_reason !== 'stop_sequence' &&
      data.stop_reason !== undefined
    ) {
      finishReason = 'error';
    }

    return {
      content,
      tokensUsed: {
        input: data.usage?.input_tokens ?? 0,
        output: data.usage?.output_tokens ?? 0,
      },
      provider: this.providerId,
      model: data.model ?? 'unknown',
      finishReason,
      rawResponse: response,
    };
  }

  /**
   * Get HTTP headers for Anthropic API requests
   *
   * Includes:
   * - x-api-key: API key authentication
   * - anthropic-version: API version (2023-06-01)
   * - Content-Type: application/json
   */
  protected getHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey || '',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Validate Anthropic API credentials
   *
   * Makes a minimal request to verify API key works.
   * Uses very low max_tokens to minimize cost.
   */
  async validateCredentials(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      // Use first available model for validation
      const testModel = this.models[0]?.id ?? 'claude-sonnet-4-5-20250929';

      await this.complete({
        prompt: 'test',
        model: testModel,
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
   * Override error handling to handle Anthropic-specific errors
   *
   * Note: Anthropic returns 529 for server overload (not retryable by design).
   * This is different from standard 5xx server errors.
   */
  async complete(request: AIRequest): Promise<AIResponse> {
    try {
      return await super.complete(request);
    } catch (error) {
      if (error instanceof AIServiceError && error.statusCode === 529) {
        // 529 is Anthropic's "overloaded" status - not retryable
        throw new AIServiceError(
          'Anthropic API is overloaded. Please try again later.',
          this.providerId,
          {
            statusCode: 529,
            isRetryable: false, // Override default 5xx retry behavior
          }
        );
      }
      throw error;
    }
  }
}

// Auto-register with provider factory
registerProvider('anthropic', () => new AnthropicProvider());
