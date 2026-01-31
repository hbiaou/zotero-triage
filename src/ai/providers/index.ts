/**
 * AI Provider implementations
 *
 * Importing this module auto-registers all providers with the ProviderFactory.
 * Import once at application startup (e.g., in main.ts onload).
 *
 * Usage:
 * ```typescript
 * // In main.ts onload():
 * import './ai/providers'; // Auto-registers all providers
 *
 * // Later, create providers via factory:
 * const provider = await createProvider('openai', apiKey);
 * ```
 */

// Import providers for side-effect (auto-registration)
import './openai-provider';
import './google-provider';
import './anthropic-provider';
import './openrouter-provider';

// Re-export provider classes for type usage
export { OpenAIProvider } from './openai-provider';
export { GoogleProvider } from './google-provider';
export { AnthropicProvider } from './anthropic-provider';
export { OpenRouterProvider } from './openrouter-provider';
