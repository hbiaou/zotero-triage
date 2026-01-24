import { Plugin, Notice } from 'obsidian';
import * as path from 'path';
import { ZotBridgeSettings, DEFAULT_SETTINGS } from './types';
import { ZotBridgeSettingTab } from './settings';
import { ZoteroConnector, ZoteroItem } from './db/zotero-connector';
import { RegistryService } from './registry/registry-service';
import { NoteGenerator } from './notes/note-generator';
import { BatchService } from './batch/batch-service';
import { SessionTracker } from './ui/session-tracker';
import { ItemSearchModal } from './ui/search-modal';
import { PreviewModal } from './ui/preview-modal';
import { TriageView, TRIAGE_VIEW_TYPE } from './ui/triage-view';
import { ValidationService } from './validation/validation-service';
import { ProfileService } from './profile/profile-service';
import { RecommendationEngine } from './recommendations/recommendation-engine';
import { AdaptiveLearner } from './recommendations/adaptive-learner';

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
  noteGenerator!: NoteGenerator;
  batchService!: BatchService;
  sessionTracker!: SessionTracker;
  validationService!: ValidationService;
  profileService!: ProfileService;
  recommendationEngine!: RecommendationEngine;
  adaptiveLearner!: AdaptiveLearner;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize connector with plugin directory path (for WASM file location)
    const pluginDir = this.getPluginDir();
    this.connector = new ZoteroConnector(pluginDir);

    // Initialize registry service
    this.registry = new RegistryService(this);
    await this.registry.load();

    // Initialize note generator
    this.noteGenerator = new NoteGenerator(this.app, this.settings.outputFolder);

    // Initialize profile service
    this.profileService = new ProfileService(this);

    // Initialize recommendation engine
    this.recommendationEngine = new RecommendationEngine(
      this.profileService,
      this.connector
    );

    // Initialize adaptive learner
    this.adaptiveLearner = new AdaptiveLearner(this.profileService);

    // Initialize batch service with recommendation support
    this.batchService = new BatchService(
      this.connector,
      this.registry,
      this.profileService,
      this.recommendationEngine,
      this.adaptiveLearner
    );

    // Initialize session tracker
    this.sessionTracker = new SessionTracker();

    // Initialize validation service
    this.validationService = new ValidationService(this.settings.qualityGate);

    // Register triage view
    this.registerView(
      TRIAGE_VIEW_TYPE,
      (leaf) => new TriageView(leaf, this)
    );

    // Add settings tab
    this.addSettingTab(new ZotBridgeSettingTab(this.app, this));

    // Register commands
    this.addCommand({
      id: 'zotbridge-import-item',
      name: 'Import Zotero item',
      callback: () => this.handleImportCommand()
    });

    // Command to open triage view
    this.addCommand({
      id: 'zotbridge-open-triage',
      name: 'Open triage dashboard',
      callback: () => this.activateTriageView()
    });

    // Ribbon icon for quick access
    this.addRibbonIcon('inbox', 'ZotBridge Triage', () => {
      this.activateTriageView();
    });

    console.log('ZotBridge plugin loaded', {
      dbPath: this.settings.zoteroDbPath || '(not configured)',
      outputFolder: this.settings.outputFolder,
      registryEntries: Object.keys((await this.loadData())?.registry?.entries || {}).length
    });
  }

  async onunload(): Promise<void> {
    // Detach triage views
    this.app.workspace.detachLeavesOfType(TRIAGE_VIEW_TYPE);

    // Flush registry to ensure all pending saves complete
    if (this.registry) {
      await this.registry.flush();
    }

    // Flush profile service to ensure all pending saves complete
    if (this.profileService) {
      await this.profileService.flush();
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
    // Update note generator with new settings
    if (this.noteGenerator) {
      this.noteGenerator.setOutputFolder(this.settings.outputFolder);
    }
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

  /**
   * Handle the "Import Zotero item" command.
   * Opens search modal to find and import a single item.
   */
  private async handleImportCommand(): Promise<void> {
    // Check database is configured
    if (!this.settings.zoteroDbPath) {
      new Notice('Please configure Zotero database path in settings');
      return;
    }

    // Load items with progress indication
    const items = await this.loadItemsWithProgress();
    if (!items || items.length === 0) {
      new Notice('No items found in Zotero database');
      return;
    }

    // Open search modal
    new ItemSearchModal(this.app, items, (selectedItem) => {
      this.showPreviewAndImport(selectedItem);
    }).open();
  }

  /**
   * Load items from Zotero database with progress notice.
   *
   * @returns Array of Zotero items, or null on error
   */
  private async loadItemsWithProgress(): Promise<ZoteroItem[] | null> {
    // Show initial notice
    const notice = new Notice('Loading Zotero library...', 0);

    try {
      // Connect to database if not already connected
      if (!this.connector.itemsLoaded) {
        await this.connector.connect(this.settings.zoteroDbPath);
      }

      // Load items with progress callback
      const items = await this.connector.loadItems((loaded, total) => {
        notice.setMessage(`Loading items: ${loaded}/${total}`);
      });

      // Close progress notice
      notice.hide();

      return items;
    } catch (err) {
      notice.hide();
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to load Zotero library: ${message}`);
      return null;
    }
  }

  /**
   * Show preview modal for an item and handle import.
   *
   * @param item - Selected Zotero item
   */
  private async showPreviewAndImport(item: ZoteroItem): Promise<void> {
    // Check if already imported
    if (this.registry.isImported(item.itemID)) {
      new Notice(`This item has already been imported: ${item.title}`);
      return;
    }

    // Generate preview content
    const previewContent = this.noteGenerator.previewContent(item);
    const filePath = this.noteGenerator.getFilePath(item);

    // Open preview modal
    new PreviewModal(
      this.app,
      item,
      previewContent,
      filePath,
      () => this.performImport(item)
    ).open();
  }

  /**
   * Perform the actual import of a Zotero item.
   *
   * @param item - Item to import
   */
  private async performImport(item: ZoteroItem): Promise<void> {
    try {
      // Create the note
      const file = await this.noteGenerator.createNote(item);

      // Mark as imported in registry
      this.registry.markState(item.itemID, 'imported');

      // Show success notice
      const shortTitle = item.title.length > 40
        ? item.title.substring(0, 40) + '...'
        : item.title;
      new Notice(`Note created: ${shortTitle}`);

      // Open the created file in editor
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('already exists')) {
        new Notice(`Note already exists: ${this.noteGenerator.getFilePath(item)}`);
      } else {
        new Notice(`Failed to create note: ${message}`);
      }
    }
  }

  /**
   * Activate the triage view in the right sidebar.
   * Detaches any existing instances first to avoid duplicates.
   */
  async activateTriageView(): Promise<void> {
    // Detach existing to avoid duplicates
    this.app.workspace.detachLeavesOfType(TRIAGE_VIEW_TYPE);

    // Open in right sidebar
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: TRIAGE_VIEW_TYPE,
        active: true,
      });
      this.app.workspace.revealLeaf(leaf);
    }
  }
}
