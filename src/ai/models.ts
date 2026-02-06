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
      id: 'gpt-5-nano',
      name: 'gpt-5-nano',
      providerId: 'openai',
      contextWindow: 128000,
      costPer1MInputTokens: 0.05,
      costPer1MOutputTokens: 0.40,
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o mini',
      providerId: 'openai',
      contextWindow: 128000,
      costPer1MInputTokens: 0.15,
      costPer1MOutputTokens: 0.60,
    },
    {
      id: 'gpt-5-mini',
      name: 'GPT-5 Mini',
      providerId: 'openai',
      contextWindow: 128000,
      costPer1MInputTokens: 0.25,
      costPer1MOutputTokens: 2.00,
    },
    {
      id: 'gpt-5.1',
      name: 'gpt-5.1',
      providerId: 'openai',
      contextWindow: 128000,
      costPer1MInputTokens: 1.25,
      costPer1MOutputTokens: 10.00,
    },
    {
      id: 'gpt-5.2',
      name: 'gpt-5.2',
      providerId: 'openai',
      contextWindow: 128000,
      costPer1MInputTokens: 1.75,
      costPer1MOutputTokens: 14.00,
    },
  ],

  google: [
    {
      id: 'gemini-2.5-flash-lite',
      name: 'Gemini 2.5 Flash-Lite',
      providerId: 'google',
      contextWindow: 1000000,
      costPer1MInputTokens: 0.10,
      costPer1MOutputTokens: 0.40,
    },
    {
      id: 'gemini-2.5-flash',
      name: 'gemini-2.5-flash',
      providerId: 'google',
      contextWindow: 1000000,
      costPer1MInputTokens: 0.30,
      costPer1MOutputTokens: 2.50,
    },
    {
      id: 'gemini-3-flash-preview',
      name: 'Gemini 3 Flash Preview',
      providerId: 'google',
      contextWindow: 1000000,
      costPer1MInputTokens: 0.50,
      costPer1MOutputTokens: 3.00,
    },
  ],

  anthropic: [
    {
      id: 'claude-3-5-haiku',
      name: 'Claude 3.5 Haiku',
      providerId: 'anthropic',
      contextWindow: 200000,
      costPer1MInputTokens: 0.80,
      costPer1MOutputTokens: 4.00,
    },
    {
      id: 'claude-4-5-haiku',
      name: 'Claude 4.5 Haiku',
      providerId: 'anthropic',
      contextWindow: 200000,
      costPer1MInputTokens: 1.00,
      costPer1MOutputTokens: 5.00,
    },
    {
      id: 'claude-4-5-sonnet',
      name: 'Claude 4.5 Sonnet',
      providerId: 'anthropic',
      contextWindow: 200000,
      costPer1MInputTokens: 3.00,
      costPer1MOutputTokens: 15.00,
    },
  ],

  openrouter: [
    {
      id: 'nvidia/nemotron-3-nano-30b-a3b',
      name: 'nvidia/nemotron-3-nano-30b-a3b',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.05,
      costPer1MOutputTokens: 0.20,
    },
    {
      id: 'mistralai/devstral-2512',
      name: 'mistralai/devstral-2512',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.05,
      costPer1MOutputTokens: 0.22,
    },
    {
      id: 'openai/gpt-5-nano',
      name: 'openai/gpt-5-nano',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.05,
      costPer1MOutputTokens: 0.40,
    },
    {
      id: 'meta-llama/llama-4-scout',
      name: 'meta-llama/llama-4-scout',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.08,
      costPer1MOutputTokens: 0.30,
    },
    {
      id: 'xiaomi/mimo-v2-flash',
      name: 'xiaomi/mimo-v2-flash',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.09,
      costPer1MOutputTokens: 0.29,
    },
    {
      id: 'google/gemini-2.5-flash-lite',
      name: 'google/gemini-2.5-flash-lite',
      providerId: 'openrouter',
      contextWindow: 1000000,
      costPer1MInputTokens: 0.10,
      costPer1MOutputTokens: 0.40,
    },
    {
      id: 'qwen/qwen3-235b-a22b-thinking-2507',
      name: 'qwen/qwen3-235b-a22b-thinking-2507',
      providerId: 'openrouter',
      contextWindow: 32000,
      costPer1MInputTokens: 0.11,
      costPer1MOutputTokens: 0.60,
    },
    {
      id: 'essentialai/rnj-1-instruct',
      name: 'essentialai/rnj-1-instruct',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.15,
      costPer1MOutputTokens: 0.15,
    },
    {
      id: 'allenai/olmo-3.1-32b-think',
      name: 'allenai/olmo-3.1-32b-think',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.15,
      costPer1MOutputTokens: 0.50,
    },
    {
      id: 'openai/gpt-4o-mini',
      name: 'openai/gpt-4o-mini',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.15,
      costPer1MOutputTokens: 0.60,
    },
    {
      id: 'mistralai/ministral-14b-2512',
      name: 'mistralai/ministral-14b-2512',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.20,
      costPer1MOutputTokens: 0.20,
    },
    {
      id: 'openai/gpt-5-mini',
      name: 'openai/gpt-5-mini',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.25,
      costPer1MOutputTokens: 2.00,
    },
    {
      id: 'nex-agi/deepseek-v3.1-nex-n1',
      name: 'nex-agi/deepseek-v3.1-nex-n1',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.27,
      costPer1MOutputTokens: 1.00,
    },
    {
      id: 'google/gemini-2.5-flash',
      name: 'google/gemini-2.5-flash',
      providerId: 'openrouter',
      contextWindow: 1000000,
      costPer1MInputTokens: 0.30,
      costPer1MOutputTokens: 2.50,
    },
    {
      id: 'meta-llama/llama-3.1-70b-instruct',
      name: 'meta-llama/llama-3.1-70b-instruct',
      providerId: 'openrouter',
      contextWindow: 128000,
      costPer1MInputTokens: 0.40,
      costPer1MOutputTokens: 0.40,
    },
    {
      id: 'moonshotai/kimi-k2.5',
      name: 'moonshotai/kimi-k2.5',
      providerId: 'openrouter',
      contextWindow: 200000,
      costPer1MInputTokens: 0.45,
      costPer1MOutputTokens: 2.50,
    },
    {
      id: 'google/gemini-3-flash-preview',
      name: 'google/gemini-3-flash-preview',
      providerId: 'openrouter',
      contextWindow: 1000000,
      costPer1MInputTokens: 0.50,
      costPer1MOutputTokens: 3.00,
    },
  ],
};

/**
 * Get all models for a specific provider
 *
 * @param providerId - Provider identifier
 * @param customModels - Optional list of custom model IDs to include
 * @returns Array of models available from this provider
 */
export function getModelsForProvider(
  providerId: ProviderID,
  customModels: string[] = []
): AIModel[] {
  const supported = SUPPORTED_MODELS[providerId] || [];

  if (!customModels || customModels.length === 0) {
    return supported;
  }

  // Map custom model IDs to AIModel objects
  const customAIModels: AIModel[] = customModels.map((id) => ({
    id,
    name: `${id} (Custom)`,
    providerId,
    contextWindow: 128000, // Default assumption
    costPer1MInputTokens: 0, // Unknown
    costPer1MOutputTokens: 0, // Unknown
  }));

  // Combine and deduplicate by ID
  const allModels = [...supported, ...customAIModels];
  return Array.from(new Map(allModels.map((m) => [m.id, m])).values());
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
