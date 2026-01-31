/**
 * Provider Factory
 *
 * Factory pattern for creating AI provider instances by ID.
 * Providers register themselves on import, enabling runtime provider selection.
 *
 * Two interfaces:
 * 1. Functional: createProvider() for direct instantiation with API key
 * 2. OOP: ProviderFactory class for integration with SecretStorageService
 */

import type { ProviderID } from './types';
import type { BaseAIProvider } from './base-provider';
import type { SecretStorageService } from '../services/secret-storage';

/**
 * Provider factory function type
 */
type ProviderFactory = () => BaseAIProvider;

/**
 * Internal registry of provider factories
 *
 * Providers register themselves when their modules are imported.
 * Maps ProviderID -> factory function that creates provider instances.
 */
const providerRegistry = new Map<ProviderID, ProviderFactory>();

/**
 * Register a provider implementation
 *
 * Called by provider modules to register themselves with the factory.
 * Typically called at module initialization time.
 *
 * @param providerId - Provider identifier
 * @param factory - Factory function that creates provider instances
 *
 * @example
 * ```typescript
 * // In openai-provider.ts:
 * class OpenAIProvider extends BaseAIProvider { ... }
 *
 * // Register on module load
 * registerProvider('openai', () => new OpenAIProvider());
 * ```
 */
export function registerProvider(
  providerId: ProviderID,
  factory: ProviderFactory
): void {
  if (providerRegistry.has(providerId)) {
    console.warn(
      `[ProviderFactory] Provider ${providerId} is already registered. Overwriting.`
    );
  }
  providerRegistry.set(providerId, factory);
}

/**
 * Create and initialize a provider instance
 *
 * Functional interface for creating providers with explicit API key.
 *
 * @param providerId - Provider identifier
 * @param apiKey - API key for authentication
 * @returns Promise resolving to initialized provider
 * @throws Error if provider not registered
 * @throws AIServiceError if API key is invalid
 *
 * @example
 * ```typescript
 * const provider = await createProvider('openai', 'sk-...');
 * const response = await provider.complete({ prompt: 'Hello', model: 'gpt-4o' });
 * ```
 */
export async function createProvider(
  providerId: ProviderID,
  apiKey: string
): Promise<BaseAIProvider> {
  const factory = providerRegistry.get(providerId);

  if (!factory) {
    throw new Error(
      `Provider ${providerId} not registered. Available providers: ${Array.from(
        providerRegistry.keys()
      ).join(', ')}`
    );
  }

  // Create instance
  const provider = factory();

  // Initialize with API key (validates credentials)
  await provider.initialize(apiKey);

  return provider;
}

/**
 * Provider Factory Class
 *
 * OOP interface for creating providers with automatic API key retrieval
 * from SecretStorageService. Simplifies provider instantiation in services
 * that have access to secret storage.
 */
export class ProviderFactoryClass {
  constructor(private secretStorage: SecretStorageService) {}

  /**
   * Get a provider instance with credentials from secret storage
   *
   * @param providerId - Provider identifier
   * @returns Promise resolving to initialized provider, or null if no API key stored
   * @throws Error if provider not registered
   * @throws AIServiceError if stored API key is invalid
   */
  async getProvider(providerId: ProviderID): Promise<BaseAIProvider | null> {
    const apiKey = this.secretStorage.getAPIKey(providerId);

    if (!apiKey) {
      return null;
    }

    return createProvider(providerId, apiKey);
  }

  /**
   * Get list of providers with stored API keys
   *
   * Returns only providers that:
   * 1. Have API keys stored in secret storage
   * 2. Are registered in the provider registry
   *
   * @returns Promise resolving to array of configured provider IDs
   */
  async getConfiguredProviders(): Promise<ProviderID[]> {
    const storedProviders = this.secretStorage.listConfiguredProviders();

    // Filter to only registered providers
    return storedProviders.filter((providerId) =>
      this.isProviderRegistered(providerId)
    );
  }

  /**
   * Check if a provider implementation is registered
   *
   * @param providerId - Provider identifier
   * @returns True if provider is registered, false otherwise
   */
  isProviderRegistered(providerId: ProviderID): boolean {
    return providerRegistry.has(providerId);
  }

  /**
   * Get list of all registered provider IDs
   *
   * @returns Array of registered provider IDs
   */
  getRegisteredProviders(): ProviderID[] {
    return Array.from(providerRegistry.keys());
  }
}
