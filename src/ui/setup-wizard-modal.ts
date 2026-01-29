/**
 * SetupWizardModal - Multi-step first-run setup wizard
 *
 * Guides users through:
 * 1. Zotero database path configuration
 * 2. Batch and recommendation preferences
 * 3. Seed paper selection for profile initialization
 */

import { App, Modal, Setting, Notice } from 'obsidian';
import * as fs from 'fs';
import { detectZoteroPath } from '../utils/paths';
import { SeedPaperPicker } from './seed-paper-picker';
import type ZoteroTriagePlugin from '../main';
import type { UserProfile } from '../profile/types';
import type { ZoteroConnector } from '../db/zotero-connector';

/**
 * Wizard step type
 */
type WizardStep = 'database' | 'preferences' | 'seed-papers';

/**
 * Wizard data collected across all steps
 */
interface WizardData {
  dbPath: string;
  preferences: {
    batchSize: number;
    qualityGateEnabled: boolean;
    relevanceVsDiversity: number;
    recencyBoost: boolean;
  };
  seedPaperIds: string[];
}

/**
 * SetupWizardModal provides first-run setup experience
 */
export class SetupWizardModal extends Modal {
  private plugin: ZoteroTriagePlugin;
  private connector: ZoteroConnector;
  private onComplete: (seedPaperIds: string[]) => void;
  private onSkip: () => void;
  private existingSeedIds?: string[];

  private currentStep: WizardStep = 'database';
  private wizardData: WizardData = {
    dbPath: '',
    preferences: {
      batchSize: 5,
      qualityGateEnabled: true,
      relevanceVsDiversity: 0,
      recencyBoost: true
    },
    seedPaperIds: []
  };

  private seedPicker: SeedPaperPicker | null = null;

  /**
   * Create a new SetupWizardModal
   * @param app - Obsidian app instance
   * @param plugin - Zotero Triage plugin instance
   * @param onComplete - Callback when wizard completes (receives seed paper IDs only)
   * @param onSkip - Callback when user skips wizard
   * @param existingSeedIds - Optional pre-selected seed paper IDs for reconfiguration
   */
  constructor(
    app: App,
    plugin: ZoteroTriagePlugin,
    onComplete: (seedPaperIds: string[]) => void,
    onSkip: () => void,
    existingSeedIds?: string[]
  ) {
    super(app);
    this.plugin = plugin;
    this.connector = plugin.connector;
    this.onComplete = onComplete;
    this.onSkip = onSkip;
    this.existingSeedIds = existingSeedIds;

    // Initialize with current settings if available
    this.wizardData.dbPath = plugin.settings.zoteroDbPath || '';
    this.wizardData.preferences.batchSize = plugin.settings.batchSize || 5;
    this.wizardData.preferences.qualityGateEnabled = plugin.settings.qualityGate?.enabled ?? true;
  }

  /**
   * Render the modal when opened
   */
  onOpen(): void {
    const { contentEl, titleEl } = this;

    titleEl.setText('Zotero Triage Setup Wizard');
    contentEl.addClass('zotero-triage-wizard');

    this.renderStep();
  }

  /**
   * Render the current step
   */
  private renderStep(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Progress indicator
    this.renderProgress();

    // Step content
    const stepContent = contentEl.createDiv({ cls: 'wizard-step-content' });

    switch (this.currentStep) {
      case 'database':
        this.renderDatabaseStep(stepContent);
        break;
      case 'preferences':
        this.renderPreferencesStep(stepContent);
        break;
      case 'seed-papers':
        this.renderSeedPapersStep(stepContent);
        break;
    }

    // Navigation
    this.renderNavigation();
  }

  /**
   * Render progress indicator
   */
  private renderProgress(): void {
    const { contentEl } = this;

    const progressContainer = contentEl.createDiv({ cls: 'wizard-progress' });

    const stepNumber = this.getStepNumber();
    progressContainer.createDiv({
      cls: 'progress-text',
      text: `Step ${stepNumber} of 3`
    });

    const progressBar = progressContainer.createDiv({ cls: 'progress-bar' });
    const progressFill = progressBar.createDiv({ cls: 'progress-fill' });
    progressFill.style.width = `${(stepNumber / 3) * 100}%`;
  }

  /**
   * Get step number (1-3)
   */
  private getStepNumber(): number {
    switch (this.currentStep) {
      case 'database': return 1;
      case 'preferences': return 2;
      case 'seed-papers': return 3;
    }
  }

  /**
   * Render database configuration step
   */
  private renderDatabaseStep(container: HTMLElement): void {
    container.createEl('h3', { text: 'Zotero Database' });
    container.createEl('p', {
      text: "We'll read your Zotero library to generate recommendations",
      cls: 'setting-item-description'
    });

    // Database path input
    new Setting(container)
      .setName('Database Path')
      .setDesc('Path to your zotero.sqlite file')
      .addText(text => text
        .setPlaceholder('C:\\Users\\...\\Zotero\\zotero.sqlite')
        .setValue(this.wizardData.dbPath)
        .onChange(value => {
          this.wizardData.dbPath = value;
        }));

    // Auto-detect button
    new Setting(container)
      .setName('Auto-detect')
      .setDesc('Automatically find your Zotero database')
      .addButton(button => button
        .setButtonText('Auto-detect')
        .onClick(() => {
          const detectedPath = detectZoteroPath();
          if (detectedPath) {
            this.wizardData.dbPath = detectedPath;
            new Notice(`Database found: ${detectedPath}`);
            this.renderStep(); // Refresh to show new path
          } else {
            new Notice('Could not auto-detect. Please set path manually.');
          }
        }));

    // Test connection button
    new Setting(container)
      .setName('Test Connection')
      .setDesc('Verify database access and check item count')
      .addButton(button => button
        .setButtonText('Test Connection')
        .setCta()
        .onClick(async () => {
          if (!this.wizardData.dbPath) {
            new Notice('Please set the database path first.');
            return;
          }

          if (!fs.existsSync(this.wizardData.dbPath)) {
            new Notice(`Database file not found: ${this.wizardData.dbPath}`);
            return;
          }

          try {
            button.setDisabled(true);
            button.setButtonText('Testing...');

            const result = await this.connector.testConnection(this.wizardData.dbPath);

            if (result.success) {
              new Notice(`Connection successful! Found ${result.itemCount} items (schema v${result.schemaVersion})`);
            } else {
              new Notice(`Connection failed: ${result.error}`);
            }
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            new Notice(`Connection failed: ${errorMessage}`);
          } finally {
            button.setDisabled(false);
            button.setButtonText('Test Connection');
          }
        }));
  }

  /**
   * Render preferences configuration step
   */
  private renderPreferencesStep(container: HTMLElement): void {
    container.createEl('h3', { text: 'Preferences' });
    container.createEl('p', {
      text: 'These preferences can be changed later in settings',
      cls: 'setting-item-description'
    });

    // Batch size slider
    new Setting(container)
      .setName('Batch Size')
      .setDesc('Number of items per batch (default: 5)')
      .addSlider(slider => slider
        .setLimits(1, 20, 1)
        .setValue(this.wizardData.preferences.batchSize)
        .setDynamicTooltip()
        .onChange(value => {
          this.wizardData.preferences.batchSize = value;
        }));

    // Quality gates toggle
    new Setting(container)
      .setName('Block incomplete items')
      .setDesc('Prevent import if required fields are missing (can be overridden during triage)')
      .addToggle(toggle => toggle
        .setValue(this.wizardData.preferences.qualityGateEnabled)
        .onChange(value => {
          this.wizardData.preferences.qualityGateEnabled = value;
        }));

    // Relevance vs Diversity slider
    const diversityValue = container.createDiv({ cls: 'setting-item-description' });
    diversityValue.setText(`Current: ${this.getRelevanceLabel(this.wizardData.preferences.relevanceVsDiversity)}`);

    new Setting(container)
      .setName('Relevance vs Diversity')
      .setDesc('Balance between pure relevance and diverse recommendations')
      .addSlider(slider => slider
        .setLimits(0, 1, 0.1)
        .setValue(this.wizardData.preferences.relevanceVsDiversity)
        .onChange(value => {
          this.wizardData.preferences.relevanceVsDiversity = value;
          diversityValue.setText(`Current: ${this.getRelevanceLabel(value)}`);
        }));

    // Recency boost toggle
    new Setting(container)
      .setName('Recency Boost')
      .setDesc('Boost recent publications in recommendations')
      .addToggle(toggle => toggle
        .setValue(this.wizardData.preferences.recencyBoost)
        .onChange(value => {
          this.wizardData.preferences.recencyBoost = value;
        }));
  }

  /**
   * Get label for relevance vs diversity value
   */
  private getRelevanceLabel(value: number): string {
    if (value === 0) return 'Pure Relevance';
    if (value === 1) return 'Balanced Diversity';
    return `${Math.round(value * 100)}% Diversity`;
  }

  /**
   * Render seed papers selection step
   */
  private renderSeedPapersStep(container: HTMLElement): void {
    container.createEl('h3', { text: 'Seed Papers' });
    container.createEl('p', {
      text: 'Select 5-15 papers that represent your current research interests',
      cls: 'setting-item-description'
    });

    // Selection count
    const countDiv = container.createDiv({
      cls: 'setting-item-description',
      text: this.getSelectionCountText()
    });

    // Seed paper picker component
    const pickerContainer = container.createDiv();
    this.seedPicker = new SeedPaperPicker(
      pickerContainer,
      this.connector,
      (selectedIds) => {
        this.wizardData.seedPaperIds = selectedIds;
        countDiv.setText(this.getSelectionCountText());
      },
      this.existingSeedIds // Pass pre-selected IDs for reconfiguration
    );
  }

  /**
   * Get selection count text
   */
  private getSelectionCountText(): string {
    const count = this.wizardData.seedPaperIds.length;
    return `${count} of 15 selected (min: 5 required)`;
  }

  /**
   * Render navigation buttons
   */
  private renderNavigation(): void {
    const { contentEl } = this;

    const navContainer = contentEl.createDiv({ cls: 'wizard-navigation' });

    // Left side: Skip button
    const skipBtn = navContainer.createEl('button', {
      cls: 'wizard-skip',
      text: 'Skip Setup'
    });
    skipBtn.addEventListener('click', () => {
      this.onSkip();
      this.close();
    });

    // Right side: Back/Next/Finish buttons
    const rightButtons = navContainer.createDiv({ cls: 'wizard-nav-right' });

    // Back button
    if (this.currentStep !== 'database') {
      const backBtn = rightButtons.createEl('button', { text: 'Back' });
      backBtn.addEventListener('click', () => {
        this.goBack();
      });
    }

    // Next or Finish button
    if (this.currentStep === 'seed-papers') {
      const finishBtn = rightButtons.createEl('button', {
        cls: 'mod-cta',
        text: 'Finish'
      });
      finishBtn.addEventListener('click', () => {
        this.finishWizard();
      });
    } else {
      const nextBtn = rightButtons.createEl('button', {
        cls: 'mod-cta',
        text: 'Next'
      });
      nextBtn.addEventListener('click', () => {
        this.goNext();
      });
    }
  }

  /**
   * Go to previous step
   */
  private goBack(): void {
    switch (this.currentStep) {
      case 'preferences':
        this.currentStep = 'database';
        break;
      case 'seed-papers':
        this.currentStep = 'preferences';
        break;
    }
    this.renderStep();
  }

  /**
   * Validate current step and go to next
   */
  private async goNext(): Promise<void> {
    // Validate current step
    if (!await this.validateCurrentStep()) {
      return;
    }

    // Advance to next step
    switch (this.currentStep) {
      case 'database':
        this.currentStep = 'preferences';
        break;
      case 'preferences':
        // Load items before showing seed picker
        await this.loadItemsForSeedSelection();
        this.currentStep = 'seed-papers';
        break;
    }
    this.renderStep();
  }

  /**
   * Validate current step
   */
  private async validateCurrentStep(): Promise<boolean> {
    switch (this.currentStep) {
      case 'database':
        if (!this.wizardData.dbPath) {
          new Notice('Please set the database path');
          return false;
        }
        if (!fs.existsSync(this.wizardData.dbPath)) {
          new Notice('Database file not found. Please check the path.');
          return false;
        }
        return true;

      case 'preferences':
        // No validation needed - all have defaults
        return true;

      case 'seed-papers':
        if (this.wizardData.seedPaperIds.length < 5) {
          new Notice('Please select at least 5 seed papers');
          return false;
        }
        return true;

      default:
        return true;
    }
  }

  /**
   * Load items for seed paper selection
   */
  private async loadItemsForSeedSelection(): Promise<void> {
    const notice = new Notice('Loading Zotero library...', 0);

    try {
      // Connect to database if not already connected
      if (!this.connector.itemsLoaded) {
        await this.connector.connect(this.wizardData.dbPath);
      }

      // Load items
      await this.connector.loadItems((loaded, total) => {
        notice.setMessage(`Loading items: ${loaded}/${total}`);
      });

      notice.hide();
    } catch (err) {
      notice.hide();
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to load Zotero library: ${message}`);
      throw err;
    }
  }

  /**
   * Complete the wizard
   */
  private async finishWizard(): Promise<void> {
    // Validate seed papers
    if (this.wizardData.seedPaperIds.length < 5) {
      new Notice('Please select at least 5 seed papers');
      return;
    }

    // Save database path and ALL preferences to plugin settings
    this.plugin.settings.zoteroDbPath = this.wizardData.dbPath;
    this.plugin.settings.batchSize = this.wizardData.preferences.batchSize;
    this.plugin.settings.qualityGate.enabled = this.wizardData.preferences.qualityGateEnabled;
    // Save recommendation preferences (NEW - these now persist to settings)
    this.plugin.settings.relevanceVsDiversity = this.wizardData.preferences.relevanceVsDiversity;
    this.plugin.settings.recencyBoost = this.wizardData.preferences.recencyBoost;
    await this.plugin.saveSettings();

    // Call completion callback with only seed paper IDs
    // Profile creation will read preferences from settings
    this.onComplete(this.wizardData.seedPaperIds);

    this.close();
  }

  /**
   * Clean up when modal closes
   */
  onClose(): void {
    this.contentEl.empty();
  }
}
