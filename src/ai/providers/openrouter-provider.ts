/**
 * OpenRouter Provider
 *
 * Implementation for OpenRouter's unified API.
 * Provides access to multiple models through OpenAI-compatible format.
 */

import { BaseAIProvider } from '../base-provider';
import type { AIRequest, AIResponse } from '../types';
import { AIServiceError } from '../types';
import { registerProvider } from '../provider-factory';

/**
 * OpenRouter API provider implementation
 *
 * Uses OpenAI-compatible Chat Completions format.
 * Requires HTTP-Referer and X-Title headers for tracking.
 */
export class OpenRouterProvider extends BaseAIProvider {
  protected readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor() {
    super('openrouter');
  }

  /**
   * Build OpenRouter request body
   *
   * OpenRouter uses OpenAI-compatible format:
   * {
   *   "model": "anthropic/claude-sonnet-4-5",
   *   "messages": [
   *     {"role": "system", "content": "..."},
   *     {"role": "user", "content": "..."}
   *   ],
   *   "temperature": 0.7,
   *   "max_tokens": 4096
   * }
   */
  protected buildRequestBody(request: AIRequest): unknown {
    const messages: Array<{ role: string; content: string }> = [];

    // Add system message if provided
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    // Add user message
    messages.push({
      role: 'user',
      content: request.prompt,
    });

    return {
      model: request.model,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    };
  }

  /**
   * Parse OpenRouter response into standard AIResponse format
   *
   * OpenRouter uses OpenAI-compatible response structure:
   * {
   *   "choices": [
   *     {
   *       "message": {"role": "assistant", "content": "..."},
   *       "finish_reason": "stop"
   *     }
   *   ],
   *   "usage": {
   *     "prompt_tokens": 123,
   *     "completion_tokens": 456
   *   },
   *   "model": "anthropic/claude-sonnet-4-5"
   * }
   */
  protected parseResponse(response: unknown): AIResponse {
    const data = response as {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
      model?: string;
    };

    // Validate response structure
    if (!data.choices || data.choices.length === 0) {
      throw new AIServiceError(
        'Invalid OpenRouter response: missing choices',
        this.providerId,
        { isRetryable: false }
      );
    }

    const choice = data.choices[0];
    const content = choice.message?.content;

    if (!content) {
      throw new AIServiceError(
        'Invalid OpenRouter response: missing content',
        this.providerId,
        { isRetryable: false }
      );
    }

    // Map finish_reason to standard format (same as OpenAI)
    let finishReason: 'stop' | 'max_tokens' | 'error' = 'stop';
    if (choice.finish_reason === 'length') {
      finishReason = 'max_tokens';
    } else if (
      choice.finish_reason !== 'stop' &&
      choice.finish_reason !== null
    ) {
      finishReason = 'error';
    }

    return {
      content,
      tokensUsed: {
        input: data.usage?.prompt_tokens ?? 0,
        output: data.usage?.completion_tokens ?? 0,
      },
      provider: this.providerId,
      model: data.model ?? 'unknown',
      finishReason,
      rawResponse: response,
    };
  }

  /**
   * Get HTTP headers for OpenRouter API requests
   *
   * Includes:
   * - Authorization: Bearer token
   * - HTTP-Referer: Required for tracking (GitHub repo URL)
   * - X-Title: Required for tracking (plugin name)
   * - Content-Type: application/json
   */
  protected getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/zotero-triage',
      'X-Title': 'Zotero Triage',
    };
  }

  /**
   * Validate OpenRouter API credentials
   *
   * Calls /api/v1/models endpoint to verify API key works.
   */
  async validateCredentials(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

// Auto-register with provider factory
registerProvider('openrouter', () => new OpenRouterProvider());
