/**
 * AI Settings Tab Component
 *
 * Provides UI for configuring AI enrichment settings:
 * - API key management (encrypted storage)
 * - Provider selection
 * - Model selection
 * - Fallback configuration
 *
 * This is a component rendered within the main settings tab,
 * not a standalone PluginSettingTab.
 */

import { Setting, Notice, Modal, App } from 'obsidian';
import type ZoteroTriagePlugin from '../main';
import type { SecretStorageService } from '../services/secret-storage';
import type { AIService } from '../services/ai-service';
import type { ProviderID } from '../ai/types';
import { SUPPORTED_MODELS, getModelsForProvider } from '../ai/models';

/**
 * AI Settings Tab Component
 *
 * Manages AI provider configuration UI within the main settings tab.
 */
export class AISettingsTab {
  private readonly containerEl: HTMLElement;
  private readonly plugin: ZoteroTriagePlugin;
  private readonly secretStorage: SecretStorageService;
  private readonly aiService: AIService;

  // UI state
  private providerTestStatus: Map<ProviderID, string> = new Map();

  constructor(
    containerEl: HTMLElement,
    plugin: ZoteroTriagePlugin,
    secretStorage: SecretStorageService,
    aiService: AIService
  ) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.secretStorage = secretStorage;
    this.aiService = aiService;
  }

  /**
   * Render the AI settings section
   */
  render(): void {
    // Clear previous content to prevent duplication
    this.containerEl.empty();

    // Section header
    this.containerEl.createEl('h2', { text: 'AI Enrichment' });

    this.containerEl.createEl('p', {
      text: 'Configure AI providers for literature analysis and enrichment.',
      cls: 'setting-item-description',
    });

    // Provider configuration sections
    this.renderProviderSection('openai', 'OpenAI');
    this.renderProviderSection('google', 'Google AI');
    this.renderProviderSection('anthropic', 'Anthropic');
    this.renderProviderSection('openrouter', 'OpenRouter');

    // Model selection
    this.renderModelSelection();

    // Fallback configuration (optional, advanced)
    this.renderFallbackConfiguration();
  }

  /**
   * Render provider configuration section
   */
  private renderProviderSection(providerId: ProviderID, displayName: string): void {
    const isConfigured = this.secretStorage.hasAPIKey(providerId);
    const statusText = this.providerTestStatus.get(providerId) ||
                      (isConfigured ? '✓ Configured' : 'Not configured');

    // Provider header with status
    new Setting(this.containerEl)
      .setName(displayName)
      .setDesc(statusText)
      .addButton((button) =>
        button
          .setButtonText(isConfigured ? 'Reconfigure' : 'Configure')
          .onClick(() => this.showProviderConfig(providerId, displayName))
      )
      .addButton((button) =>
        button
          .setButtonText('Clear')
          .setDisabled(!isConfigured)
          .onClick(() => this.clearAPIKey(providerId, displayName))
      );
  }

  /**
   * Show provider API key configuration modal
   */
  private async showProviderConfig(providerId: ProviderID, displayName: string): Promise<void> {
    const currentKey = this.secretStorage.getAPIKey(providerId) || '';

    new APIKeyConfigModal(
      this.plugin.app,
      providerId,
      displayName,
      currentKey,
      this.aiService,
      this.secretStorage,
      this.providerTestStatus,
      () => this.render()
    ).open();
  }

  /**
   * Clear API key from storage
   */
  private async clearAPIKey(providerId: ProviderID, displayName: string): Promise<void> {
    try {
      this.secretStorage.deleteAPIKey(providerId);
      new Notice(`${displayName} API key cleared`);
      this.providerTestStatus.delete(providerId);
      this.render(); // Re-render to update UI
    } catch (error) {
      console.error(`[AISettingsTab] Failed to clear API key for ${providerId}:`, error);
      new Notice(`Failed to clear ${displayName} API key`);
    }
  }

  /**
   * Render model selection dropdown
   */
  private renderModelSelection(): void {
    const configuredProviders = this.secretStorage.listConfiguredProviders();

    // Build model options grouped by provider
    const modelOptions: Record<string, string> = {};

    for (const providerId of configuredProviders) {
      const models = getModelsForProvider(providerId);
      for (const model of models) {
        const label = `${model.name} (${providerId})`;
        modelOptions[model.id] = label;
      }
    }

    const currentModel = this.plugin.settings.aiConfig?.selectedModel || '';

    new Setting(this.containerEl)
      .setName('Default Model')
      .setDesc('Select the AI model to use for enrichment')
      .addDropdown((dropdown) => {
        // Add placeholder option
        dropdown.addOption('', 'Select a model...');

        // Add model options
        for (const [modelId, label] of Object.entries(modelOptions)) {
          dropdown.addOption(modelId, label);
        }

        dropdown.setValue(currentModel);
        dropdown.onChange(async (value) => {
          await this.saveModelSelection(value);
        });

        // Disable if no providers configured
        if (configuredProviders.length === 0) {
          dropdown.setDisabled(true);
        }
      });
  }

  /**
   * Save model selection to settings
   */
  private async saveModelSelection(modelId: string): Promise<void> {
    try {
      // Find the model to get its provider
      let selectedProvider: ProviderID | null = null;

      for (const providerId of Object.keys(SUPPORTED_MODELS) as ProviderID[]) {
        const models = SUPPORTED_MODELS[providerId];
        const model = models.find((m) => m.id === modelId);
        if (model) {
          selectedProvider = providerId;
          break;
        }
      }

      // Update settings
      if (!this.plugin.settings.aiConfig) {
        this.plugin.settings.aiConfig = {
          selectedProvider: null,
          selectedModel: null,
          fallbackOrder: [],
        };
      }

      this.plugin.settings.aiConfig.selectedModel = modelId || null;
      this.plugin.settings.aiConfig.selectedProvider = selectedProvider;

      await this.plugin.saveSettings();

      // Reinitialize AI service with new config
      if (this.plugin.settings.aiConfig) {
        await this.aiService.initialize(this.plugin.settings.aiConfig);
      }

      new Notice('Model selection saved');
    } catch (error) {
      console.error('[AISettingsTab] Failed to save model selection:', error);
      new Notice('Failed to save model selection');
    }
  }

  /**
   * Render fallback configuration section
   */
  private renderFallbackConfiguration(): void {
    const configuredProviders = this.secretStorage.listConfiguredProviders();

    if (configuredProviders.length < 2) {
      // No fallback needed with fewer than 2 providers
      return;
    }

    this.containerEl.createEl('h3', { text: 'Advanced: Fallback Configuration' });

    new Setting(this.containerEl)
      .setName('Enable Fallback')
      .setDesc('Automatically try alternative providers if the primary fails')
      .addToggle((toggle) => {
        const hasFallback = (this.plugin.settings.aiConfig?.fallbackOrder.length || 0) > 0;
        toggle.setValue(hasFallback);
        toggle.onChange(async (value) => {
          if (value) {
            // Enable fallback - set default order
            if (!this.plugin.settings.aiConfig) {
              this.plugin.settings.aiConfig = {
                selectedProvider: null,
                selectedModel: null,
                fallbackOrder: [],
              };
            }
            this.plugin.settings.aiConfig.fallbackOrder = configuredProviders.filter(
              (p) => p !== this.plugin.settings.aiConfig?.selectedProvider
            );
          } else {
            // Disable fallback
            if (this.plugin.settings.aiConfig) {
              this.plugin.settings.aiConfig.fallbackOrder = [];
            }
          }
          await this.plugin.saveSettings();
        });
      });
  }
}

/**
 * Modal for configuring provider API keys
 */
class APIKeyConfigModal extends Modal {
  private readonly providerId: ProviderID;
  private readonly displayName: string;
  private readonly currentKey: string;
  private readonly aiService: AIService;
  private readonly secretStorage: SecretStorageService;
  private readonly providerTestStatus: Map<ProviderID, string>;
  private readonly onSave: () => void;

  private apiKeyValue = '';

  constructor(
    app: App,
    providerId: ProviderID,
    displayName: string,
    currentKey: string,
    aiService: AIService,
    secretStorage: SecretStorageService,
    providerTestStatus: Map<ProviderID, string>,
    onSave: () => void
  ) {
    super(app);
    this.providerId = providerId;
    this.displayName = displayName;
    this.currentKey = currentKey;
    this.aiService = aiService;
    this.secretStorage = secretStorage;
    this.providerTestStatus = providerTestStatus;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: `Configure ${this.displayName}` });

    // API key input
    new Setting(contentEl)
      .setName('API Key')
      .setDesc('Enter your API key (stored securely)')
      .addText((text) => {
        text
          .setPlaceholder('sk-...')
          .setValue(this.currentKey ? '********' : '')
          .onChange((value) => {
            this.apiKeyValue = value;
          });
        text.inputEl.type = 'password';
      });

    // Action buttons
    const buttonContainer = contentEl.createDiv('modal-button-container');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '8px';
    buttonContainer.style.marginTop = '20px';

    // Test button
    const testButton = buttonContainer.createEl('button', { text: 'Test' });
    testButton.addEventListener('click', async () => {
      if (!this.apiKeyValue) {
        new Notice('Please enter an API key');
        return;
      }

      testButton.disabled = true;
      testButton.textContent = 'Testing...';
      this.providerTestStatus.set(this.providerId, 'Testing...');

      const isValid = await this.testAPIKey();

      if (isValid) {
        this.providerTestStatus.set(this.providerId, '✓ Valid');
        new Notice(`${this.displayName} API key is valid`);
      } else {
        this.providerTestStatus.set(this.providerId, '✗ Invalid');
        new Notice(`${this.displayName} API key is invalid`);
      }

      testButton.disabled = false;
      testButton.textContent = 'Test';
    });

    // Save button
    const saveButton = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveButton.addEventListener('click', async () => {
      if (!this.apiKeyValue) {
        new Notice('Please enter an API key');
        return;
      }

      await this.saveAPIKey();
      this.close();
      this.onSave(); // Re-render to update status
    });

    // Cancel button
    const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => {
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * Test API key validity
   */
  private async testAPIKey(): Promise<boolean> {
    try {
      return await this.aiService.testProvider(this.providerId, this.apiKeyValue);
    } catch (error) {
      console.error(`[APIKeyConfigModal] Test failed for ${this.providerId}:`, error);
      return false;
    }
  }

  /**
   * Save API key to secure storage
   */
  private async saveAPIKey(): Promise<void> {
    try {
      this.secretStorage.setAPIKey(this.providerId, this.apiKeyValue);
      new Notice(`${this.displayName} API key saved`);
      this.providerTestStatus.set(this.providerId, '✓ Configured');
    } catch (error) {
      console.error(`[APIKeyConfigModal] Failed to save API key for ${this.providerId}:`, error);
      new Notice(`Failed to save ${this.displayName} API key`);
    }
  }
}
