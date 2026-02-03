/**
 * AI Service Orchestrator
 *
 * Unified entry point for all AI operations. Combines provider abstraction,
 * resilience patterns, and fallback logic into a single service.
 *
 * Responsibilities:
 * - Provider selection and initialization
 * - Resilient API calls with circuit breaker and retry
 * - Fallback to secondary providers on failure
 * - Configuration management
 */

import type { App } from 'obsidian';
import type {
  ProviderID,
  AIRequest,
  AIResponse,
} from '../ai/types';
import { AIServiceError } from '../ai/types';
import type { BaseAIProvider } from '../ai/base-provider';
import { ProviderFactoryClass } from '../ai/provider-factory';
import type { SecretStorageService } from './secret-storage';
import { ResilienceService } from './resilience';

/**
 * AI service configuration
 */
export interface AIServiceConfig {
  /** Currently selected provider (null if not configured) */
  selectedProvider: ProviderID | null;
  /** Currently selected model ID (null if not configured) */
  selectedModel: string | null;
  /** Fallback provider order (try in sequence on failure) */
  fallbackOrder: ProviderID[];
}

/**
 * Default models for each provider (used during fallback)
 */
const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20240620',
  google: 'gemini-1.5-pro',
  openrouter: 'openai/gpt-4o-mini', // Safe default, low cost
};

/**
 * AI Service orchestrator
 *
 * Main entry point for all AI operations. Abstracts provider selection,
 * resilience, and fallback logic from consumers.
 */
export class AIService {
  private readonly app: App;
  private readonly secretStorage: SecretStorageService;
  private readonly providerFactory: ProviderFactoryClass;
  private readonly resilience: ResilienceService;
  private config: AIServiceConfig;
  private currentProvider: BaseAIProvider | null = null;

  constructor(app: App, secretStorage: SecretStorageService) {
    this.app = app;
    this.secretStorage = secretStorage;
    this.providerFactory = new ProviderFactoryClass(secretStorage);
    this.resilience = new ResilienceService();
    this.config = {
      selectedProvider: null,
      selectedModel: null,
      fallbackOrder: [],
    };
  }

  /**
   * Initialize the AI service with configuration
   *
   * @param config - Service configuration with provider and model selection
   */
  async initialize(config: AIServiceConfig): Promise<void> {
    this.config = config;

    // If a provider is selected, try to load it
    if (config.selectedProvider) {
      await this.loadProvider(config.selectedProvider);
    }
  }

  /**
   * Complete an AI request with resilience and fallback
   *
   * Attempts to use the primary provider, falling back to configured
   * alternatives on failure. All calls are wrapped with circuit breaker
   * and exponential backoff retry logic.
   *
   * @param request - AI request parameters
   * @returns Promise resolving to AI response
   * @throws AIServiceError if all providers fail or none configured
   */
  async complete(request: AIRequest): Promise<AIResponse> {
    // Ensure provider is loaded
    if (!this.currentProvider) {
      if (!this.config.selectedProvider) {
        throw new AIServiceError(
          'No AI provider configured. Please configure a provider in settings.',
          'openai', // Default for error typing
          {
            statusCode: 400,
            isRetryable: false,
          }
        );
      }

      // Try to load the selected provider
      const loaded = await this.loadProvider(this.config.selectedProvider);
      if (!loaded) {
        throw new AIServiceError(
          `Failed to load provider: ${this.config.selectedProvider}. Check API key configuration.`,
          this.config.selectedProvider,
          {
            statusCode: 401,
            isRetryable: false,
          }
        );
      }
    }

    // Primary provider attempt
    try {
      const response = await this.resilience.execute(
        this.currentProvider.providerId,
        () => this.currentProvider!.complete(request)
      );
      return response;
    } catch (primaryError) {
      // Try fallback providers if configured
      if (this.config.fallbackOrder.length > 0) {
        return await this.tryFallbackProviders(request, primaryError);
      }

      // No fallback configured - re-throw original error
      throw primaryError;
    }
  }

  /**
   * Attempt fallback providers in configured order
   *
   * @param request - AI request parameters
   * @param primaryError - Error from primary provider
   * @returns Promise resolving to AI response from fallback provider
   * @throws Original error if all fallbacks fail
   */
  private async tryFallbackProviders(
    request: AIRequest,
    primaryError: unknown
  ): Promise<AIResponse> {
    for (const fallbackProviderId of this.config.fallbackOrder) {
      // Skip if no API key configured
      if (!this.secretStorage.hasAPIKey(fallbackProviderId)) {
        console.warn(
          `[AIService] Skipping fallback provider ${fallbackProviderId}: No API key configured`
        );
        continue;
      }

      // Skip if same as primary provider (already failed)
      if (fallbackProviderId === this.config.selectedProvider) {
        continue;
      }

      try {
        // Load fallback provider
        const fallbackProvider = await this.providerFactory.getProvider(
          fallbackProviderId
        );

        if (!fallbackProvider) {
          console.warn(
            `[AIService] Skipping fallback provider ${fallbackProviderId}: Failed to load`
          );
          continue;
        }

        // Attempt completion with fallback
        // CRITICAL: Must use a model compatible with the fallback provider
        // We cannot use the primary provider's model ID
        const fallbackRequest = {
          ...request,
          model: DEFAULT_MODELS[fallbackProviderId] || request.model
        };

        const response = await this.resilience.execute(
          fallbackProviderId,
          () => fallbackProvider.complete(fallbackRequest)
        );

        console.log(
          `[AIService] Fallback to ${fallbackProviderId} succeeded after primary provider failure`
        );

        return response;
      } catch (fallbackError) {
        console.warn(
          `[AIService] Fallback provider ${fallbackProviderId} failed:`,
          fallbackError
        );
        // Continue to next fallback
      }
    }

    // All fallbacks failed - throw original error
    throw primaryError;
  }

  /**
   * Load a provider by ID
   *
   * Retrieves API key from secret storage and initializes the provider.
   *
   * @param providerId - Provider identifier
   * @returns Promise resolving to true if loaded, false on failure
   */
  async loadProvider(providerId: ProviderID): Promise<boolean> {
    try {
      const provider = await this.providerFactory.getProvider(providerId);

      if (!provider) {
        console.error(
          `[AIService] Failed to load provider ${providerId}: No API key or provider not registered`
        );
        return false;
      }

      this.currentProvider = provider;
      return true;
    } catch (error) {
      console.error(`[AIService] Failed to load provider ${providerId}:`, error);
      return false;
    }
  }

  /**
   * Test a provider with a given API key
   *
   * Creates a temporary provider instance and validates credentials
   * without storing the key or changing current provider.
   *
   * @param providerId - Provider identifier
   * @param apiKey - API key to test
   * @returns Promise resolving to true if valid, false otherwise
   */
  async testProvider(providerId: ProviderID, apiKey: string): Promise<boolean> {
    try {
      // Create temporary provider instance
      const { createProvider } = await import('../ai/provider-factory');
      const tempProvider = await createProvider(providerId, apiKey);

      // Validate credentials (createProvider already validates during init)
      return tempProvider !== null;
    } catch (error) {
      console.warn(`[AIService] Provider test failed for ${providerId}:`, error);
      return false;
    }
  }

  /**
   * Get list of providers with API keys configured
   *
   * @returns Promise resolving to array of configured provider IDs
   */
  async getConfiguredProviders(): Promise<ProviderID[]> {
    return await this.providerFactory.getConfiguredProviders();
  }

  /**
   * Get currently selected provider ID
   *
   * @returns Provider ID or null if not configured
   */
  getCurrentProvider(): ProviderID | null {
    return this.config.selectedProvider;
  }

  /**
   * Get currently selected model ID
   *
   * @returns Model ID or null if not configured
   */
  getCurrentModel(): string | null {
    return this.config.selectedModel;
  }

  /**
   * Check if service is ready to handle requests
   *
   * @returns True if a provider is loaded and ready
   */
  isReady(): boolean {
    return this.currentProvider !== null;
  }
}
