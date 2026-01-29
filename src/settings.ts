/**
 * Zotero Triage Settings Tab
 *
 * Provides UI for configuring:
 * - Zotero database path (with auto-detect and test connection)
 * - Output folder for literature notes
 * - Batch settings
 * - Quality gates
 * - Research profile (with wizard and editor)
 */

import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import * as fs from 'fs';
import { detectZoteroPath } from './utils/paths';
import { SetupWizardModal } from './ui/setup-wizard-modal';
import { ProfileEditor } from './ui/profile-editor';
import { ProfileInitializer } from './profile/profile-initializer';
import { extractKeywordsFromMultiple } from './profile/keyword-extractor';
import type ZoteroTriagePlugin from './main';
import { PreflightModal } from './ui/preflight-modal';
import { DuplicateDetectionService } from './services/duplicate-detection-service';

/**
 * Settings tab for Zotero Triage plugin configuration
 */
export class ZoteroTriageSettingTab extends PluginSettingTab {
  plugin: ZoteroTriagePlugin;

  constructor(app: App, plugin: ZoteroTriagePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h1', { text: 'Zotero Triage Settings' });

    // Database Path Section
    containerEl.createEl('h2', { text: 'Zotero Database' });

    new Setting(containerEl)
      .setName('Zotero Database Path')
      .setDesc('Path to your zotero.sqlite file')
      .addText(text => text
        .setPlaceholder('C:\\Users\\...\\Zotero\\zotero.sqlite')
        .setValue(this.plugin.settings.zoteroDbPath)
        .onChange(async (value) => {
          this.plugin.settings.zoteroDbPath = value;
          await this.plugin.saveSettings();
        }));

    // Auto-detect and Browse buttons
    new Setting(containerEl)
      .setName('Database Detection')
      .setDesc('Auto-detect Zotero database location or browse manually')
      .addButton(button => button
        .setButtonText('Auto-detect')
        .onClick(async () => {
          const detectedPath = detectZoteroPath();
          if (detectedPath) {
            this.plugin.settings.zoteroDbPath = detectedPath;
            await this.plugin.saveSettings();
            new Notice(`Database found: ${detectedPath}`);
            this.display(); // Refresh to show new path
          } else {
            new Notice('Could not auto-detect. Please set path manually.');
          }
        }))
      .addButton(button => button
        .setButtonText('Browse')
        .onClick(async () => {
          // Use Electron's dialog if available
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { remote } = require('@electron/remote');
            const result = await remote.dialog.showOpenDialog({
              title: 'Select Zotero Database',
              filters: [
                { name: 'SQLite Database', extensions: ['sqlite'] }
              ],
              properties: ['openFile']
            });
            if (!result.canceled && result.filePaths.length > 0) {
              this.plugin.settings.zoteroDbPath = result.filePaths[0];
              await this.plugin.saveSettings();
              this.display();
            }
          } catch {
            // Fallback: electron remote not available
            new Notice('File browser not available. Please enter the path manually.');
          }
        }));

    // Test Connection Section
    new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Verify database access and check item count')
      .addButton(button => button
        .setButtonText('Test Connection')
        .setCta()
        .onClick(async () => {
          const dbPath = this.plugin.settings.zoteroDbPath;

          if (!dbPath) {
            new Notice('Please set the database path first.');
            return;
          }

          if (!fs.existsSync(dbPath)) {
            new Notice(`Database file not found: ${dbPath}`);
            return;
          }

          try {
            button.setDisabled(true);
            button.setButtonText('Testing...');

            const result = await this.plugin.connector.testConnection(dbPath);

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

    // Connection Status Display
    this.displayConnectionStatus(containerEl);

    // Output Folder Section
    containerEl.createEl('h2', { text: 'Output Settings' });

    new Setting(containerEl)
      .setName('Output Folder')
      .setDesc('Folder for literature notes (relative to vault root)')
      .addText(text => text
        .setPlaceholder('10_Literature')
        .setValue(this.plugin.settings.outputFolder)
        .onChange(async (value) => {
          this.plugin.settings.outputFolder = value;
          await this.plugin.saveSettings();
        }));

    // Batch Settings Section
    containerEl.createEl('h2', { text: 'Batch Settings' });

    new Setting(containerEl)
      .setName('Batch Size')
      .setDesc('Number of items per batch (default: 5)')
      .addSlider(slider => slider
        .setLimits(1, 20, 1)
        .setValue(this.plugin.settings.batchSize)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.batchSize = value;
          await this.plugin.saveSettings();
        }));

    // Recommendation Settings Section
    containerEl.createEl('h2', { text: 'Recommendation Settings' });

    new Setting(containerEl)
      .setName('Tag weight')
      .setDesc('Importance of tag matches in recommendations (0.0 = disabled, 3.0 = very important)')
      .addSlider(slider => slider
        .setLimits(0, 3.0, 0.1)
        .setValue(this.plugin.settings.tagWeight)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.tagWeight = value;
          await this.plugin.saveSettings();
        }));

    // Quality Gates Section
    containerEl.createEl('h2', { text: 'Quality Gates' });

    containerEl.createDiv({
      cls: 'setting-item-description',
      text: 'Configure validation rules to ensure imported items have complete metadata.'
    });

    new Setting(containerEl)
      .setName('Block incomplete items')
      .setDesc('Prevent import if required fields are missing (can be overridden during triage)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.qualityGate.enabled)
        .onChange(async (value) => {
          this.plugin.settings.qualityGate.enabled = value;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h3', { text: 'Required Fields by Type' });

    // Journal Article fields
    const journalSection = containerEl.createDiv({ cls: 'quality-gate-section' });
    journalSection.createEl('h4', { text: 'Journal Article' });

    const journalFields = [
      { key: 'title', label: 'Title' },
      { key: 'creators', label: 'Authors' },
      { key: 'publicationTitle', label: 'Journal Name' },
      { key: 'date', label: 'Publication Year' },
      { key: 'DOI', label: 'DOI' },
      { key: 'abstract', label: 'Abstract' }
    ];

    journalFields.forEach(field => {
      const rule = this.plugin.settings.qualityGate.rules.journalArticle;
      const isRequired = rule.requiredFields.includes(field.key);

      new Setting(journalSection)
        .setName(field.label)
        .addToggle(toggle => toggle
          .setValue(isRequired)
          .onChange(async (value) => {
            if (value) {
              if (!rule.requiredFields.includes(field.key)) {
                rule.requiredFields.push(field.key);
              }
            } else {
              rule.requiredFields = rule.requiredFields.filter(f => f !== field.key);
            }
            await this.plugin.saveSettings();
          }));
    });

    // Book fields
    const bookSection = containerEl.createDiv({ cls: 'quality-gate-section' });
    bookSection.createEl('h4', { text: 'Book' });

    const bookFields = [
      { key: 'title', label: 'Title' },
      { key: 'creators', label: 'Authors/Editors' },
      { key: 'date', label: 'Publication Year' },
      { key: 'publisher', label: 'Publisher' },
      { key: 'ISBN', label: 'ISBN' }
    ];

    bookFields.forEach(field => {
      const rule = this.plugin.settings.qualityGate.rules.book;
      const isRequired = rule.requiredFields.includes(field.key);

      new Setting(bookSection)
        .setName(field.label)
        .addToggle(toggle => toggle
          .setValue(isRequired)
          .onChange(async (value) => {
            if (value) {
              if (!rule.requiredFields.includes(field.key)) {
                rule.requiredFields.push(field.key);
              }
            } else {
              rule.requiredFields = rule.requiredFields.filter(f => f !== field.key);
            }
            await this.plugin.saveSettings();
          }));
    });

    // Research Profile Section
    containerEl.createEl('h2', { text: 'Research Profile' });

    const profileService = (this.plugin as any).profileService;

    if (!profileService) {
      containerEl.createDiv({
        cls: 'setting-item-description',
        text: 'Profile service not initialized'
      });
    } else if (!profileService.hasProfile()) {
      // No profile configured - show wizard button
      const profileStatus = new Setting(containerEl)
        .setName('Profile Status')
        .setDesc('No profile configured — using date-based batch generation');

      profileStatus.addButton(button => button
        .setButtonText('Run Setup Wizard')
        .setCta()
        .onClick(async () => {
          // Check that connector has items loaded
          if (!(this.plugin as any).connector.itemsLoaded) {
            new Notice('Please configure database and load items first');
            return;
          }

          // Ensure connector initialized
          this.plugin.ensureConnectorInitialized();

          // Create duplicate service
          const duplicateService = new DuplicateDetectionService(this.plugin.connector);

          // Show preflight first
          const preflight = new PreflightModal(
            this.app,
            this.plugin.connector,
            duplicateService,
            () => {
              // Open wizard after preflight acknowledged
              const profileInitializer = new ProfileInitializer(
                (this.plugin as any).connector,
                profileService,
                extractKeywordsFromMultiple
              );

              const wizard = new SetupWizardModal(
                this.app,
                this.plugin,
                async (profile) => {
                  await profileInitializer.initializeProfile(profile.seedPaperIds, profile.preferences);
                  new Notice('Profile created successfully');
                  this.display(); // Refresh settings
                },
                () => {
                  new Notice('Setup skipped — you can configure manually later');
                }
              );
              wizard.open();
            }
          );
          preflight.open();
        }));
    } else {
      // Profile exists - show management buttons and editor
      const profile = profileService.getProfile();
      const seedCount = profile ? profile.seedPaperIds.length : 0;

      const profileStatus = new Setting(containerEl)
        .setName('Profile Status')
        .setDesc(`Profile configured with ${seedCount} seed papers`);

      profileStatus.addButton(button => button
        .setButtonText('Re-run Wizard')
        .onClick(async () => {
          // Check that connector has items loaded
          if (!(this.plugin as any).connector.itemsLoaded) {
            new Notice('Please configure database and load items first');
            return;
          }

          // Ensure connector initialized
          this.plugin.ensureConnectorInitialized();

          // Create duplicate service
          const duplicateService = new DuplicateDetectionService(this.plugin.connector);

          // Show preflight first
          const preflight = new PreflightModal(
            this.app,
            this.plugin.connector,
            duplicateService,
            () => {
              // Open wizard after preflight acknowledged
              const profileInitializer = new ProfileInitializer(
                (this.plugin as any).connector,
                profileService,
                extractKeywordsFromMultiple
              );

              const wizard = new SetupWizardModal(
                this.app,
                this.plugin,
                async (newProfile) => {
                  // Clear existing profile first
                  profileService.clearProfile();

                  // Initialize new profile
                  await profileInitializer.initializeProfile(
                    newProfile.seedPaperIds,
                    newProfile.preferences
                  );

                  new Notice('Profile updated successfully');
                  this.display(); // Refresh settings
                },
                () => {
                  new Notice('Wizard cancelled');
                }
              );
              wizard.open();
            }
          );
          preflight.open();
        }));

      profileStatus.addButton(button => button
        .setButtonText('Clear Profile')
        .setWarning()
        .onClick(async () => {
          if (confirm('This will delete your profile and reset to date-based batch generation. Continue?')) {
            profileService.clearProfile();
            await this.plugin.saveSettings();
            new Notice('Profile cleared');
            this.display(); // Refresh settings
          }
        }));

      // Embed ProfileEditor component
      const editorContainer = containerEl.createDiv({ cls: 'profile-editor-container' });
      new ProfileEditor(
        editorContainer,
        profileService,
        () => {
          // onProfileChange callback
          this.plugin.saveSettings();
        }
      );
    }
  }

  /**
   * Display current connection status information
   */
  private displayConnectionStatus(containerEl: HTMLElement): void {
    const statusContainer = containerEl.createDiv({ cls: 'zotero-triage-status' });

    const dbPath = this.plugin.settings.zoteroDbPath;

    if (!dbPath) {
      statusContainer.createEl('p', {
        text: 'Status: No database configured',
        cls: 'setting-item-description'
      });
      return;
    }

    const fileExists = fs.existsSync(dbPath);

    if (!fileExists) {
      statusContainer.createEl('p', {
        text: 'Status: Database file not found',
        cls: 'setting-item-description'
      });
      return;
    }

    statusContainer.createEl('p', {
      text: 'Status: Database file found. Click "Test Connection" to verify access.',
      cls: 'setting-item-description'
    });
  }
}
