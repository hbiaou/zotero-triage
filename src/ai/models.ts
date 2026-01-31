/**
 * AI Model Catalog
 *
 * Comprehensive catalog of supported AI models across all providers
 * with metadata for UI display, cost estimation, and provider selection.
 */

import { AIModel, ProviderID } from './types';

/**
 * Supported models by provider
 *
 * Note: Prices are estimates based on provider pricing pages as of Jan 2026.
 * Actual costs may vary. Used for cost estimation UI only.
 */
export const SUPPORTED_MODELS: Record<ProviderID, AIModel[]> = {
  openai: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      providerId: 'openai',
      contextWindow: 128000,
      costPer1MInputTokens: 5.0,
      costPer1MOutputTokens: 15.0,
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      providerId: 'openai',
      contextWindow: 128000,
      costPer1MInputTokens: 10.0,
      costPer1MOutputTokens: 30.0,
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      providerId: 'openai',
      contextWindow: 16000,
      costPer1MInputTokens: 0.5,
      costPer1MOutputTokens: 1.5,
    },
  ],

  google: [
    {
      id: 'gemini-3-flash-preview',
      name: 'Gemini 3 Flash',
      providerId: 'google',
      contextWindow: 1000000,
      costPer1MInputTokens: 0.5,
      costPer1MOutputTokens: 3.0,
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      providerId: 'google',
      contextWindow: 1000000,
      costPer1MInputTokens: 0.075,
      costPer1MOutputTokens: 0.3,
    },
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      providerId: 'google',
      contextWindow: 2000000,
      costPer1MInputTokens: 1.25,
      costPer1MOutputTokens: 5.0,
    },
  ],

  anthropic: [
    {
      id: 'claude-sonnet-4-5-20250514',
      name: 'Claude Sonnet 4.5',
      providerId: 'anthropic',
      contextWindow: 200000,
      costPer1MInputTokens: 3.0,
      costPer1MOutputTokens: 15.0,
    },
    {
      id: 'claude-haiku-4-5-20250514',
      name: 'Claude Haiku 4.5',
      providerId: 'anthropic',
      contextWindow: 200000,
      costPer1MInputTokens: 0.8,
      costPer1MOutputTokens: 4.0,
    },
    {
      id: 'claude-opus-4-5-20250514',
      name: 'Claude Opus 4.5',
      providerId: 'anthropic',
      contextWindow: 200000,
      costPer1MInputTokens: 15.0,
      costPer1MOutputTokens: 75.0,
    },
  ],

  openrouter: [
    {
      id: 'moonshotai/kimi-k2.5',
      name: 'Kimi K2.5',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.14,
      costPer1MOutputTokens: 0.28,
    },
    {
      id: 'meta-llama/llama-3.1-70b-instruct',
      name: 'Llama 3.1 70B',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.35,
      costPer1MOutputTokens: 0.4,
    },
    {
      id: 'mistralai/mistral-large',
      name: 'Mistral Large',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 2.0,
      costPer1MOutputTokens: 6.0,
    },
  ],
};

/**
 * Get all models for a specific provider
 *
 * @param providerId - Provider identifier
 * @returns Array of models available from this provider
 */
export function getModelsForProvider(providerId: ProviderID): AIModel[] {
  return SUPPORTED_MODELS[providerId] || [];
}

/**
 * Get the default model for the system
 *
 * Per CONTEXT.md decision: Google Gemini 3 Flash is the default model
 * for all enrichment operations.
 *
 * @returns Default AI model (gemini-3-flash-preview)
 */
export function getDefaultModel(): AIModel {
  const defaultModel = SUPPORTED_MODELS.google.find(
    (m) => m.id === 'gemini-3-flash-preview'
  );

  if (!defaultModel) {
    throw new Error(
      'Default model (gemini-3-flash-preview) not found in catalog'
    );
  }

  return defaultModel;
}

/**
 * Find a model by ID across all providers
 *
 * @param modelId - Model identifier (e.g., "gpt-4o", "claude-sonnet-4-5-20250514")
 * @returns Model if found, undefined otherwise
 */
export function findModel(modelId: string): AIModel | undefined {
  for (const provider of Object.values(SUPPORTED_MODELS)) {
    const model = provider.find((m) => m.id === modelId);
    if (model) {
      return model;
    }
  }
  return undefined;
}

/**
 * Get a specific model from a specific provider
 *
 * @param providerId - Provider identifier
 * @param modelId - Model identifier
 * @returns Model if found, undefined otherwise
 */
export function getModelById(
  providerId: ProviderID,
  modelId: string
): AIModel | undefined {
  const models = SUPPORTED_MODELS[providerId];
  return models?.find((m) => m.id === modelId);
}
