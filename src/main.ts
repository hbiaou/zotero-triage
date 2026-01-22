import { Plugin } from 'obsidian';
import { ZotBridgeSettings, DEFAULT_SETTINGS } from './types';

/**
 * ZotBridge Plugin
 *
 * Progressive Zotero-Obsidian bridge for sustainable literature processing.
 * Provides an "Inbox-to-Vault" pipeline that forces batch-based processing
 * with strict quality gates.
 */
export default class ZotBridgePlugin extends Plugin {
  settings: ZotBridgeSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    console.log('ZotBridge plugin loaded');
  }

  onunload(): void {
    console.log('ZotBridge plugin unloaded');
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
