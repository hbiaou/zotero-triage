/**
 * ZotBridge Settings Tab
 *
 * Provides UI for configuring:
 * - Zotero database path (with auto-detect and test connection)
 * - Output folder for literature notes
 */

import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import * as fs from 'fs';
import { detectZoteroPath } from './utils/paths';
import type ZotBridgePlugin from './main';

/**
 * Settings tab for ZotBridge plugin configuration
 */
export class ZotBridgeSettingTab extends PluginSettingTab {
  plugin: ZotBridgePlugin;

  constructor(app: App, plugin: ZotBridgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h1', { text: 'ZotBridge Settings' });

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
  }

  /**
   * Display current connection status information
   */
  private displayConnectionStatus(containerEl: HTMLElement): void {
    const statusContainer = containerEl.createDiv({ cls: 'zotbridge-status' });

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
