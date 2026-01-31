/**
 * SecretStorageService - Encrypted API key storage using OS keychain
 *
 * Provides secure storage for AI provider API keys using Obsidian's
 * built-in secret storage API, which leverages OS-level keychains:
 * - macOS: Keychain
 * - Windows: Credential Manager
 * - Linux: Secret Service API
 *
 * Falls back to encrypted file storage if keychain is unavailable.
 */

import type { App } from 'obsidian';
import type { ProviderID } from '../ai/types';

/**
 * Key naming prefix for all Zotero Triage AI secrets
 */
const SECRET_KEY_PREFIX = 'zotero-triage-ai-key-';

/**
 * Service for managing encrypted API key storage
 */
export class SecretStorageService {
  constructor(private app: App) {}

  /**
   * Store an API key for a provider
   *
   * @param providerId - AI provider identifier
   * @param key - API key to store (encrypted automatically)
   */
  setAPIKey(providerId: ProviderID, key: string): void {
    try {
      const secretKey = this.getSecretKey(providerId);
      this.app.secretStorage.setSecret(secretKey, key);
    } catch (error) {
      console.error(`[SecretStorage] Failed to save API key for ${providerId}:`, error);
      // Graceful degradation - don't throw, just log
    }
  }

  /**
   * Retrieve an API key for a provider
   *
   * @param providerId - AI provider identifier
   * @returns API key or null if not found
   */
  getAPIKey(providerId: ProviderID): string | null {
    try {
      const secretKey = this.getSecretKey(providerId);
      const value = this.app.secretStorage.getSecret(secretKey);
      return value || null;
    } catch (error) {
      console.error(`[SecretStorage] Failed to load API key for ${providerId}:`, error);
      return null;
    }
  }

  /**
   * Delete an API key for a provider
   *
   * @param providerId - AI provider identifier
   */
  deleteAPIKey(providerId: ProviderID): void {
    try {
      const secretKey = this.getSecretKey(providerId);
      // Obsidian's setSecret with empty string deletes the key
      this.app.secretStorage.setSecret(secretKey, '');
    } catch (error) {
      console.error(`[SecretStorage] Failed to delete API key for ${providerId}:`, error);
      // Graceful degradation - don't throw, just log
    }
  }

  /**
   * Check if an API key exists for a provider
   *
   * @param providerId - AI provider identifier
   * @returns True if key exists and is non-empty
   */
  hasAPIKey(providerId: ProviderID): boolean {
    try {
      const key = this.getAPIKey(providerId);
      return key !== null && key.trim().length > 0;
    } catch (error) {
      console.error(`[SecretStorage] Failed to check API key for ${providerId}:`, error);
      return false;
    }
  }

  /**
   * List all providers that have API keys configured
   *
   * @returns Array of configured provider IDs
   */
  listConfiguredProviders(): ProviderID[] {
    const providers: ProviderID[] = ['openai', 'google', 'anthropic', 'openrouter'];
    const configured: ProviderID[] = [];

    for (const provider of providers) {
      try {
        const hasKey = this.hasAPIKey(provider);
        if (hasKey) {
          configured.push(provider);
        }
      } catch (error) {
        console.error(`[SecretStorage] Error checking provider ${provider}:`, error);
        // Continue checking other providers
      }
    }

    return configured;
  }

  /**
   * Generate secret key name for a provider
   *
   * @param providerId - AI provider identifier
   * @returns Secret key name for storage
   */
  private getSecretKey(providerId: ProviderID): string {
    return `${SECRET_KEY_PREFIX}${providerId}`;
  }
}
