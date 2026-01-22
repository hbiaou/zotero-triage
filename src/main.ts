import { Plugin } from 'obsidian';
import * as path from 'path';
import { ZotBridgeSettings, DEFAULT_SETTINGS } from './types';
import { ZotBridgeSettingTab } from './settings';
import { ZoteroConnector } from './db/zotero-connector';
import { RegistryService } from './registry/registry-service';

/**
 * ZotBridge Plugin
 *
 * Progressive Zotero-Obsidian bridge for sustainable literature processing.
 * Provides an "Inbox-to-Vault" pipeline that forces batch-based processing
 * with strict quality gates.
 */
export default class ZotBridgePlugin extends Plugin {
  settings: ZotBridgeSettings = DEFAULT_SETTINGS;
  connector!: ZoteroConnector;
  registry!: RegistryService;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize connector with plugin directory path (for WASM file location)
    const pluginDir = this.getPluginDir();
    this.connector = new ZoteroConnector(pluginDir);

    // Initialize registry service
    this.registry = new RegistryService(this);
    await this.registry.load();

    // Add settings tab
    this.addSettingTab(new ZotBridgeSettingTab(this.app, this));

    console.log('ZotBridge plugin loaded', {
      dbPath: this.settings.zoteroDbPath || '(not configured)',
      outputFolder: this.settings.outputFolder,
      registryEntries: Object.keys((await this.loadData())?.registry?.entries || {}).length
    });
  }

  async onunload(): Promise<void> {
    // Flush registry to ensure all pending saves complete
    if (this.registry) {
      await this.registry.flush();
    }

    // Close database connection if open
    if (this.connector) {
      this.connector.close();
    }

    console.log('ZotBridge plugin unloaded');
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Get the plugin directory path.
   * Used for locating the sql-wasm.wasm file.
   *
   * @returns Absolute path to the plugin directory
   */
  getPluginDir(): string {
    // Get vault base path - use FileSystemAdapter's basePath
    const adapter = this.app.vault.adapter;
    const basePath = (adapter as { basePath?: string }).basePath;

    if (!basePath) {
      // Fallback: try to get from manifest dir (relative path)
      console.warn('ZotBridge: Could not determine vault base path');
      return '';
    }

    // Construct full path to plugin directory
    return path.join(basePath, '.obsidian', 'plugins', this.manifest.id);
  }
}
