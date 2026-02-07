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

const PROVIDER_DOCS: Record<ProviderID, string> = {
  openai: 'https://platform.openai.com/docs/models',
  google: 'https://ai.google.dev/gemini-api/docs/models',
  anthropic: 'https://platform.claude.com/docs/en/about-claude/models/overview',
  openrouter: 'https://openrouter.ai/models',
};

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

    // Privacy Notice
    const privacyDiv = this.containerEl.createDiv({ cls: 'usage-scenario-notice' });
    privacyDiv.style.marginBottom = '20px';
    privacyDiv.style.backgroundColor = 'var(--background-secondary-alt)';
    privacyDiv.style.border = '1px solid var(--background-modifier-border)';
    privacyDiv.style.borderRadius = 'var(--radius-m)';
    privacyDiv.style.padding = '12px';

    const privacyHeader = privacyDiv.createDiv({ cls: 'privacy-notice-header' });
    privacyHeader.style.display = 'flex';
    privacyHeader.style.alignItems = 'center';
    privacyHeader.style.marginBottom = '8px';
    privacyHeader.style.fontWeight = 'bold';
    privacyHeader.createSpan({ text: '🔒 Privacy Notice' });

    privacyDiv.createEl('span', {
      text: 'When using AI enrichment, the text of your PDF attachments and Zotero notes will be sent to the selected AI provider (e.g., OpenAI, Anthropic, Google). Please review their privacy policies regarding data handling using the links below.'
    });

    // Provider configuration sections
    this.renderProviderSection('openai', 'OpenAI');
    if (this.secretStorage.hasAPIKey('openai')) {
      this.renderCustomModelManager('openai', 3);
    }

    this.renderProviderSection('google', 'Google AI');
    if (this.secretStorage.hasAPIKey('google')) {
      this.renderCustomModelManager('google', 3);
    }

    this.renderProviderSection('anthropic', 'Anthropic');
    if (this.secretStorage.hasAPIKey('anthropic')) {
      this.renderCustomModelManager('anthropic', 3);
    }

    this.renderProviderSection('openrouter', 'OpenRouter');
    if (this.secretStorage.hasAPIKey('openrouter')) {
      this.renderCustomModelManager('openrouter', 5);
    }

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

    const descFragment = document.createDocumentFragment();
    descFragment.append(statusText);
    descFragment.append(document.createElement('br'));

    const link = document.createElement('a');
    link.href = PROVIDER_DOCS[providerId];
    link.text = 'View available models';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.fontSize = '0.85em';
    descFragment.append(link);

    // Provider header with status
    new Setting(this.containerEl)
      .setName(displayName)
      .setDesc(descFragment)
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
   * Render custom model manager for a provider
   */
  private renderCustomModelManager(providerId: ProviderID, limit: number): void {
    const customModels = this.plugin.settings.aiConfig?.customModels?.[providerId] || [];

    // Container for custom models
    const container = this.containerEl.createDiv({ cls: 'custom-models-container' });
    container.style.marginLeft = '2em';
    container.style.marginBottom = '1em';
    container.style.borderLeft = '2px solid var(--background-modifier-border)';
    container.style.paddingLeft = '1em';

    container.createEl('h4', { text: 'Custom Models' });
    const p = container.createEl('p', {
      text: `Add up to ${limit} custom model IDs (e.g., "gpt-4-32k").`,
      cls: 'setting-item-description'
    });
    p.style.marginBottom = '0.5em';

    // List existing models
    if (customModels.length > 0) {
      const list = container.createEl('ul');
      list.style.margin = '0';
      list.style.paddingLeft = '1.5em';

      customModels.forEach(modelId => {
        const li = list.createEl('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.marginBottom = '4px';

        li.createSpan({ text: modelId });

        const removeBtn = li.createEl('button', { text: 'Remove' });
        removeBtn.style.marginLeft = '10px';
        removeBtn.style.fontSize = '0.8em';
        removeBtn.style.padding = '2px 6px';
        removeBtn.addEventListener('click', async () => {
          await this.removeCustomModel(providerId, modelId);
        });
      });
    }

    // Add new model input
    if (customModels.length < limit) {
      const addContainer = container.createDiv();
      addContainer.style.display = 'flex';
      addContainer.style.gap = '8px';
      addContainer.style.marginTop = '8px';

      const input = addContainer.createEl('input', { type: 'text', placeholder: 'Model ID' });
      const addBtn = addContainer.createEl('button', { text: 'Add' });
      addBtn.addEventListener('click', async () => {
        const modelId = input.value.trim();
        if (modelId) {
          await this.addCustomModel(providerId, modelId);
        }
      });
    }
  }

  /**
   * Add a custom model
   */
  private async addCustomModel(providerId: ProviderID, modelId: string): Promise<void> {
    if (!this.plugin.settings.aiConfig) {
      this.plugin.settings.aiConfig = {
        selectedProvider: null,
        selectedModel: null,
        fallbackOrder: [],
        customModels: {}
      };
    }

    if (!this.plugin.settings.aiConfig.customModels) {
      this.plugin.settings.aiConfig.customModels = {};
    }

    if (!this.plugin.settings.aiConfig.customModels[providerId]) {
      this.plugin.settings.aiConfig.customModels[providerId] = [];
    }

    const list = this.plugin.settings.aiConfig.customModels[providerId]!;
    if (!list.includes(modelId)) {
      list.push(modelId);
      await this.plugin.saveSettings();
      this.render(); // Re-render to show new model
    }
  }

  /**
   * Remove a custom model
   */
  private async removeCustomModel(providerId: ProviderID, modelId: string): Promise<void> {
    if (this.plugin.settings.aiConfig?.customModels?.[providerId]) {
      this.plugin.settings.aiConfig.customModels[providerId] =
        this.plugin.settings.aiConfig.customModels[providerId]!.filter(id => id !== modelId);

      await this.plugin.saveSettings();
      this.render(); // Re-render
    }
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
      const customModels = this.plugin.settings.aiConfig?.customModels?.[providerId] || [];
      const models = getModelsForProvider(providerId, customModels);
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

      // Check standard models
      for (const providerId of Object.keys(SUPPORTED_MODELS) as ProviderID[]) {
        const models = SUPPORTED_MODELS[providerId];
        if (models.some((m) => m.id === modelId)) {
          selectedProvider = providerId;
          break;
        }
      }

      // Check custom models if not found
      if (!selectedProvider && this.plugin.settings.aiConfig?.customModels) {
        for (const [providerId, models] of Object.entries(this.plugin.settings.aiConfig.customModels)) {
          if (models && models.includes(modelId)) {
            selectedProvider = providerId as ProviderID;
            break;
          }
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

            // Enforce preferred default order: OpenRouter, OpenAI, Anthropic, Google
            const preferredOrder: ProviderID[] = ['openrouter', 'openai', 'anthropic', 'google'];

            // Filter configured providers based on preference
            const defaults = preferredOrder.filter(p =>
              configuredProviders.includes(p) &&
              p !== this.plugin.settings.aiConfig?.selectedProvider
            );

            // Add any remaining configured providers that weren't in preferred list
            const others = configuredProviders.filter(p =>
              !defaults.includes(p) &&
              p !== this.plugin.settings.aiConfig?.selectedProvider
            );

            this.plugin.settings.aiConfig.fallbackOrder = [...defaults, ...others];
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
