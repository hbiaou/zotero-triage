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
import { ProfileInitializer } from './profile/profile-initializer';
import { SetupWizardModal } from './ui/setup-wizard-modal';
import { extractKeywordsFromMultiple } from './profile/keyword-extractor';
import { MemoryMonitor } from './performance/memory-monitor';
import { ConnectionError } from './error/app-error';

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
  private connectorInitialized = false;
  registry!: RegistryService;
  noteGenerator!: NoteGenerator;
  batchService!: BatchService;
  sessionTracker!: SessionTracker;
  validationService!: ValidationService;
  profileService!: ProfileService;
  recommendationEngine!: RecommendationEngine;
  adaptiveLearner!: AdaptiveLearner;
  profileInitializer!: ProfileInitializer;
  private memoryMonitor: MemoryMonitor;

  async onload(): Promise<void> {
    // Start memory monitoring in dev mode
    this.memoryMonitor = new MemoryMonitor();
    if (this.isDev()) {
      this.memoryMonitor.start();
    }

    await this.loadSettings();

    // Initialize connector WITHOUT connecting to database (lazy initialization)
    const pluginDir = this.getPluginDir();
    this.connector = new ZoteroConnector(pluginDir);
    // DO NOT call connector.connect() here - deferred until first use

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

    // Initialize profile initializer
    this.profileInitializer = new ProfileInitializer(
      this.connector,
      this.profileService,
      extractKeywordsFromMultiple
    );

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

    if (this.isDev()) {
      this.memoryMonitor.check('after onload');
    }

    // Check for first-time setup (show wizard if no profile)
    if (!this.profileService.hasProfile()) {
      // Delay wizard slightly to allow UI to fully load
      setTimeout(() => {
        this.showSetupWizard();
      }, 1000);
    }
  }

  /**
   * Ensure database connection established before first use
   * Called by TriageView before first database operation
   */
  async ensureConnected(): Promise<void> {
    if (this.connectorInitialized) {
      return;
    }

    if (!this.settings.zoteroDbPath) {
      throw new ConnectionError(
        'Zotero database path not configured. Please configure in settings.',
        'No database path in settings'
      );
    }

    try {
      await this.connector.connect(this.settings.zoteroDbPath);
      this.connectorInitialized = true;

      if (this.isDev()) {
        this.memoryMonitor.check('after database connection');
      }
    } catch (err) {
      throw new ConnectionError(
        'Failed to connect to Zotero database.',
        err instanceof Error ? err.message : String(err)
      );
    }
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
    if (this.connectorInitialized && this.connector) {
      this.connector.close();
    }

    if (this.isDev()) {
      console.log(`[MemoryMonitor] Final: ${this.memoryMonitor.summary()}`);
    }

    console.log('ZotBridge plugin unloaded');
  }

  /**
   * Check if running in development mode
   */
  private isDev(): boolean {
    // Check if NODE_ENV is set to development
    return process.env.NODE_ENV === 'development';
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
      // Ensure database connected before first access
      await this.ensureConnected();

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
   * Show the setup wizard modal
   * Used for first-time configuration or manual re-runs
   */
  private showSetupWizard(): void {
    const wizard = new SetupWizardModal(
      this.app,
      this,
      async (wizardData) => {
        // Initialize profile from wizard data
        await this.profileInitializer.initializeProfile(
          wizardData.seedPaperIds,
          {
            relevanceVsDiversity: wizardData.relevanceVsDiversity,
            recencyBoost: wizardData.recencyBoost
          }
        );
        new Notice('Setup complete! Your profile is ready.');
      },
      () => {
        // User skipped wizard
        new Notice('Setup skipped. Configure manually via settings.');
      }
    );
    wizard.open();
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
