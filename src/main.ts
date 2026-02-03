import { Plugin, Notice, Modal } from 'obsidian';
import * as path from 'path';
import { ZoteroTriageSettings, DEFAULT_SETTINGS } from './types';
import { ZoteroTriageSettingTab } from './settings';
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
import { PreflightModal } from './ui/preflight-modal';
import { DuplicateDetectionService } from './services/duplicate-detection-service';
import './ai/providers'; // Side-effect: registers all AI providers
import { SecretStorageService } from './services/secret-storage';
import { AIService } from './services/ai-service';
import { EvidenceExtractor } from './services/evidence-extractor';
import { TranscriptExtractor } from './extraction/transcript-extractor';
import { YouTubeService } from './extraction/youtube-service';
import { DomainClassifier } from './classification/domain-classifier';
import { ReclassifyCommand } from './commands/reclassify-command';
import { DiagnosticNoteService } from './services/diagnostic-note-service';
import { EnrichmentService } from './services/enrichment-service';
import { OutputValidator } from './validation/output-validator';
import { EnrichmentOrchestrator } from './orchestration/enrichment-orchestrator';
import { StubNoteGenerator } from './error-recovery/stub-note-generator';
import { RetryQueue } from './error-recovery/retry-queue';

/**
 * Zotero Triage Plugin
 *
 * Progressive Zotero-Obsidian bridge for sustainable literature processing.
 * Provides an "Inbox-to-Vault" pipeline that forces batch-based processing
 * with strict quality gates.
 */
export default class ZoteroTriagePlugin extends Plugin {
  // Deep clone DEFAULT_SETTINGS to avoid any reference issues
  settings: ZoteroTriageSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
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
  secretStorage!: SecretStorageService;
  aiService!: AIService;
  evidenceExtractor!: EvidenceExtractor;
  domainClassifier!: DomainClassifier;
  reclassifyCommand!: ReclassifyCommand;
  diagnosticNoteService!: DiagnosticNoteService;
  enrichmentService!: EnrichmentService;
  outputValidator!: OutputValidator;
  enrichmentOrchestrator!: EnrichmentOrchestrator;
  stubNoteGenerator!: StubNoteGenerator;
  retryQueue!: RetryQueue;

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
      this.connector,
      this.settings
    );

    // Initialize adaptive learner
    this.adaptiveLearner = new AdaptiveLearner(this.profileService);

    // Initialize profile initializer
    this.profileInitializer = new ProfileInitializer(
      this,
      this.connector,
      this.profileService,
      extractKeywordsFromMultiple
    );

    // Initialize session tracker
    this.sessionTracker = new SessionTracker();

    // Initialize validation service
    this.validationService = new ValidationService(this.settings.qualityGate);

    // Initialize AI services (needed for classification)
    this.secretStorage = new SecretStorageService(this.app);
    this.aiService = new AIService(this.app, this.secretStorage);

    // Initialize AI config from settings
    if (this.settings.aiConfig) {
      await this.aiService.initialize(this.settings.aiConfig);
    }

    // Initialize transcript extraction services
    const youtubeService = new YouTubeService();
    const transcriptExtractor = new TranscriptExtractor(youtubeService);

    // Initialize evidence extractor (needs Zotero data path)
    // Always initialize it - it will handle missing path gracefully
    const zoteroDataPath = this.getZoteroDataPath();
    console.log('[Main] Initializing EvidenceExtractor with Zotero data path:', zoteroDataPath || '(not configured)');
    this.evidenceExtractor = new EvidenceExtractor(
      this.connector,
      zoteroDataPath || '', // Provide empty string if no path configured yet
      transcriptExtractor
    );

    // Initialize domain classifier for Phase 15
    this.domainClassifier = new DomainClassifier(this.aiService);

    // Initialize diagnostic note service for Phase 15
    this.diagnosticNoteService = new DiagnosticNoteService();

    // Initialize enrichment services for Phase 16 (after AI services available)
    // Note: These are initialized even if evidenceExtractor is not available yet
    // Services will handle missing dependencies gracefully
    this.enrichmentService = new EnrichmentService(
      this.aiService,
      this.evidenceExtractor,
      this.domainClassifier,
      this.app
    );

    this.outputValidator = new OutputValidator(this.aiService);

    this.enrichmentOrchestrator = new EnrichmentOrchestrator(
      this.app,
      this.domainClassifier,
      this.evidenceExtractor,
      this.enrichmentService,
      this.outputValidator,
      this.settings.outputFolder
    );

    this.stubNoteGenerator = new StubNoteGenerator(this.app);

    this.retryQueue = new RetryQueue(this.app);
    await this.retryQueue.load(); // Load queue from disk

    // Initialize batch service with recommendation support and classification
    this.batchService = new BatchService(
      this.connector,
      this.registry,
      this.profileService,
      this.recommendationEngine,
      this.adaptiveLearner,
      this.domainClassifier,
      this.evidenceExtractor,
      this.app
    );

    // Initialize re-classify command
    // Note: Initialized even if evidenceExtractor not available yet
    // Command will check for availability when executed
    this.reclassifyCommand = new ReclassifyCommand(
      this.app,
      this,
      this.domainClassifier,
      this.evidenceExtractor
    );

    // Register triage view
    this.registerView(
      TRIAGE_VIEW_TYPE,
      (leaf) => new TriageView(leaf, this)
    );

    // Add settings tab
    this.addSettingTab(new ZoteroTriageSettingTab(this.app, this));

    // Register commands
    this.addCommand({
      id: 'zotero-triage-import-item',
      name: 'Import Zotero item',
      callback: () => this.handleImportCommand()
    });

    // Command to open triage view
    this.addCommand({
      id: 'zotero-triage-open-triage',
      name: 'Open triage dashboard',
      callback: () => this.activateTriageView()
    });

    // Command: Re-enrich Note (manual retry for failed enrichments)
    this.addCommand({
      id: 'reenrich-note',
      name: 'Re-enrich Note',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || !activeFile.path.startsWith(this.settings.outputFolder)) {
          return false; // Only available for notes in output folder
        }

        if (!checking) {
          this.reenrichNote(activeFile.path);
        }
        return true;
      }
    });

    // Command to re-classify item domain
    this.addCommand({
      id: 'reclassify-item',
      name: 'Re-classify item domain',
      callback: async () => {
        // Get current active note
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
          new Notice('No active note');
          return;
        }

        // Determine ZoteroItem from note frontmatter or registry lookup
        // For now, show a notice that this requires an active literature note
        try {
          // Read file content to extract item info from frontmatter
          const content = await this.app.vault.read(activeFile);
          const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
          const match = content.match(frontmatterRegex);

          if (!match) {
            new Notice('Active note does not have frontmatter (not a literature note)');
            return;
          }

          const frontmatter = match[1];
          const itemIDMatch = frontmatter.match(/zotero_item_id:\s*(\d+)/);

          if (!itemIDMatch) {
            new Notice('Active note is not a Zotero literature note');
            return;
          }

          const itemID = parseInt(itemIDMatch[1], 10);

          // Ensure database connection
          await this.ensureConnected();

          // Load the item from database
          const items = await this.connector.loadItems();
          const item = items.find(i => i.itemID === itemID);

          if (!item) {
            new Notice('Zotero item not found in database');
            return;
          }

          // Execute re-classify command
          if (this.reclassifyCommand) {
            await this.reclassifyCommand.execute(item);
          } else {
            new Notice('Re-classify command not initialized (evidence extractor required)');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          new Notice(`Failed to re-classify: ${message}`);
          console.error('[Main] Re-classify command failed:', error);
        }
      }
    });

    // Ribbon icon for quick access
    this.addRibbonIcon('inbox', 'Zotero Triage', () => {
      this.activateTriageView();
    });

    console.log('Zotero Triage plugin loaded', {
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

      // Refresh evidence extractor's storage path now that database is connected
      // This ensures custom storage locations are detected
      if (this.evidenceExtractor) {
        console.log('[Main] Refreshing evidence extractor storage path after database connection');
        await this.evidenceExtractor.refreshStoragePath();
      }

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

  /**
   * Synchronously ensure connector is initialized (for non-async contexts)
   * Triggers connection if not already connected
   */
  ensureConnectorInitialized(): void {
    // If already initialized, nothing to do
    if (this.connectorInitialized) {
      return;
    }

    // Trigger connection asynchronously (don't wait)
    // PreflightModal will handle connection errors gracefully
    this.ensureConnected().catch(err => {
      console.error('Failed to connect to database:', err);
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
    if (this.connectorInitialized && this.connector) {
      this.connector.close();
    }

    if (this.isDev()) {
      console.log(`[MemoryMonitor] Final: ${this.memoryMonitor.summary()}`);
    }

    console.log('Zotero Triage plugin unloaded');
  }

  /**
   * Check if running in development mode
   */
  private isDev(): boolean {
    // Check if NODE_ENV is set to development
    return process.env.NODE_ENV === 'development';
  }

  async loadSettings(): Promise<void> {
    const loadedData = await this.loadData();
    console.log('[Main] Raw data loaded from data.json:', JSON.stringify(loadedData, null, 2));

    // Simple spread merge - more predictable for flat/shallow settings
    // Loaded data overwrites defaults, no complex deep merge issues
    this.settings = { ...DEFAULT_SETTINGS, ...loadedData };

    console.log('[Main] Settings after merge with defaults:', JSON.stringify(this.settings, null, 2));
    console.log('[Main] Settings loaded:', {
      zoteroDbPath: this.settings.zoteroDbPath || '(not configured)',
      zoteroDbPathType: typeof this.settings.zoteroDbPath,
      zoteroDbPathLength: this.settings.zoteroDbPath?.length,
      outputFolder: this.settings.outputFolder,
      hasAiConfig: !!this.settings.aiConfig
    });
  }

  async saveSettings(): Promise<void> {
    console.log('[Main] Saving settings to data.json:', JSON.stringify(this.settings, null, 2));
    await this.saveData(this.settings);
    console.log('[Main] Settings saved successfully');

    // Verify save by reading back
    const verifyData = await this.loadData();
    console.log('[Main] Verification - data read back after save:', JSON.stringify(verifyData, null, 2));
    if (verifyData?.zoteroDbPath !== this.settings.zoteroDbPath) {
      console.error('[Main] ERROR: zoteroDbPath mismatch after save!', {
        expected: this.settings.zoteroDbPath,
        actual: verifyData?.zoteroDbPath
      });
    }

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
      console.warn('Zotero Triage: Could not determine vault base path');
      return '';
    }

    // Construct full path to plugin directory
    return path.join(basePath, '.obsidian', 'plugins', this.manifest.id);
  }

  /**
   * Get Zotero data directory path from database path
   *
   * @returns Zotero data directory or null if not configured
   */
  private getZoteroDataPath(): string | null {
    console.log('[Main] getZoteroDataPath called, current settings:', {
      zoteroDbPath: this.settings.zoteroDbPath,
      zoteroDbPathType: typeof this.settings.zoteroDbPath,
      zoteroDbPathLength: this.settings.zoteroDbPath?.length,
      settingsObject: this.settings
    });

    // Extract data directory from database path
    // e.g., /Users/x/Zotero/zotero.sqlite -> /Users/x/Zotero
    if (!this.settings.zoteroDbPath || this.settings.zoteroDbPath.trim() === '') {
      console.log('[Main] No Zotero database path configured in settings');
      return null;
    }
    const dataPath = path.dirname(this.settings.zoteroDbPath);
    console.log('[Main] Zotero data path derived from db path:', {
      dbPath: this.settings.zoteroDbPath,
      dataPath: dataPath
    });
    return dataPath;
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
   * Re-enrich an existing note (manual retry)
   * Used for stub notes or notes needing updated content
   */
  async reenrichNote(notePath: string): Promise<void> {
    try {
      // Read existing note to extract Zotero item ID
      const content = await this.app.vault.adapter.read(notePath);

      // Parse frontmatter to get zotero_key
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        new Notice('❌ Could not find frontmatter in note');
        return;
      }

      const frontmatter = frontmatterMatch[1];
      const keyMatch = frontmatter.match(/zotero_key:\s*"?([^"\n]+)"?/);
      if (!keyMatch) {
        new Notice('❌ No zotero_key found in note frontmatter');
        return;
      }

      const zoteroKey = keyMatch[1];

      // Find item in connector by key
      await this.ensureConnected();
      const item = this.connector.items.find(i => i.key === zoteroKey);
      if (!item) {
        new Notice('❌ Could not find Zotero item with key: ' + zoteroKey);
        return;
      }

      // Show confirmation modal
      const confirmed = await new Promise<boolean>((resolve) => {
        const modal = new Modal(this.app);
        modal.titleEl.setText('Re-enrich Note');
        modal.contentEl.createEl('p', {
          text: `Re-enrich "${item.title}"? This will replace the existing note content.`
        });

        const buttonContainer = modal.contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.createEl('button', { text: 'Cancel' })
          .addEventListener('click', () => {
            modal.close();
            resolve(false);
          });
        buttonContainer.createEl('button', { text: 'Re-enrich', cls: 'mod-cta' })
          .addEventListener('click', () => {
            modal.close();
            resolve(true);
          });

        modal.open();
      });

      if (!confirmed) {
        return;
      }

      // Delete existing note
      await this.app.vault.adapter.remove(notePath);

      // Run enrichment orchestration
      const result = await this.enrichmentOrchestrator.orchestrate(item);

      if (result.success) {
        new Notice(`✅ Note re-enriched: ${result.notePath}`);

        // Update registry
        this.registry.markState(item.itemID, 'imported');

        // Remove from retry queue if present
        const queuedItems = this.retryQueue.findByItemId(item.itemID);
        for (const queued of queuedItems) {
          await this.retryQueue.dequeue(queued.id);
        }

        // Open new note
        const file = this.app.vault.getAbstractFileByPath(result.notePath!);
        if (file) {
          await this.app.workspace.getLeaf().openFile(file as any);
        }

      } else {
        // Re-enrichment failed - create new stub
        const failureContext = {
          stage: result.stage as any,
          error: result.error!,
          item
        };

        const stubNote = this.stubNoteGenerator.createStubNote(failureContext);
        const stubPath = await this.stubNoteGenerator.saveStubNote(
          stubNote,
          this.settings.outputFolder
        );

        // Update retry queue attempt count
        const queuedItems = this.retryQueue.findByItemId(item.itemID);
        if (queuedItems.length > 0) {
          await this.retryQueue.updateRetryAttempt(queuedItems[0].id);
        } else {
          // Add to queue if not already present
          await this.retryQueue.enqueue({
            itemId: item.itemID,
            itemKey: item.key || '',
            itemTitle: item.title || 'Untitled',
            notePath: stubPath,
            failureStage: result.stage,
            failureReason: result.error!.message
          });
        }

        new Notice(`⚠️ Re-enrichment failed - stub note updated`, 5000);
      }

    } catch (error) {
      console.error('Re-enrich error:', error);
      new Notice(`❌ Re-enrichment error: ${(error as Error).message}`);
    }
  }

  /**
   * Show the setup wizard modal
   * Used for first-time configuration or manual re-runs
   */
  private async showSetupWizard(): Promise<void> {
    // Guard: Don't show wizard if profile already exists
    // This prevents reopening wizard when users with existing profiles
    // encounter database errors and click "I Understand" on preflight modal
    if (this.profileService.hasProfile()) {
      return;
    }

    // Ensure database connection is established before preflight checks
    try {
      await this.ensureConnected();
    } catch (err) {
      // Connection failed - skip preflight (go straight to wizard)
      // Only show notice if profile exists (troubleshooting mode)
      // Silent for first-time users (profile not configured = expected state)
      if (this.profileService.hasProfile()) {
        const message = err instanceof Error ? err.message : String(err);
        new Notice(`Database connection failed: ${message}`);
      }
      // Open wizard in disconnected state
      this.openSetupWizardAfterPreflight();
      return;
    }

    // Create duplicate detection service (needed by PreflightModal)
    const duplicateService = new DuplicateDetectionService(this.connector);

    // Show preflight modal BEFORE wizard
    const preflight = new PreflightModal(
      this.app,
      this.connector,
      duplicateService,
      () => {
        // onComplete callback: open wizard after preflight acknowledged
        this.openSetupWizardAfterPreflight();
      }
    );

    preflight.open();
  }

  /**
   * Open setup wizard after preflight check acknowledged.
   * Extracted to separate method for clarity and reusability.
   */
  private openSetupWizardAfterPreflight(): void {
    const wizard = new SetupWizardModal(
      this.app,
      this,
      async (seedPaperIds) => {
        // Initialize profile from seed papers
        // Preferences are already saved to settings by wizard
        await this.profileInitializer.initializeProfile(seedPaperIds);
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
