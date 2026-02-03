/**
 * OpenAI Provider
 *
 * Implementation for OpenAI's Chat Completions API.
 * Supports GPT-4o, GPT-4o-mini, and o1-preview models.
 */

import { BaseAIProvider } from '../base-provider';
import type { AIRequest, AIResponse, ProviderID } from '../types';
import { AIServiceError } from '../types';
import { registerProvider } from '../provider-factory';
import { requestUrl } from 'obsidian';

/**
 * OpenAI API provider implementation
 *
 * Uses Chat Completions API format with system/user message structure.
 * Supports temperature, max_tokens, and other standard parameters.
 */
export class OpenAIProvider extends BaseAIProvider {
  protected readonly baseUrl = 'https://api.openai.com/v1/chat/completions';

  constructor() {
    super('openai');
  }

  /**
   * Build OpenAI-specific request body
   *
   * Format:
   * {
   *   "model": "gpt-4o",
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
   * Parse OpenAI response into standard AIResponse format
   *
   * OpenAI response structure:
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
   *   }
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
        'Invalid OpenAI response: missing choices',
        this.providerId,
        { isRetryable: false }
      );
    }

    const choice = data.choices[0];
    const content = choice.message?.content;

    if (!content) {
      throw new AIServiceError(
        'Invalid OpenAI response: missing content',
        this.providerId,
        { isRetryable: false }
      );
    }

    // Map finish_reason to standard format
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
   * Get HTTP headers for OpenAI API requests
   *
   * Includes:
   * - Authorization: Bearer token
   * - Content-Type: application/json
   */
  protected getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Validate OpenAI API credentials
   *
   * Calls /v1/models endpoint to verify API key works.
   * Lighter weight than a full completion request.
   */
  async validateCredentials(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await requestUrl({
        url: 'https://api.openai.com/v1/models',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        throw: false,
      });

      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    }
  }
}

// Auto-register with provider factory
registerProvider('openai', () => new OpenAIProvider());
