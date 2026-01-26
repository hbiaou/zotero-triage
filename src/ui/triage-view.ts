/**
 * TriageView - Card-based dashboard for reviewing Zotero items
 *
 * Provides an interactive UI for batch processing items with Accept/Reject/Defer actions.
 * Each action includes an undo option displayed as a toast notification.
 */

import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type ZoteroTriagePlugin from '../main';
import type { ZoteroItem, RegistryState } from '../types';
import type { Batch } from '../batch/types';
import { createTriageCard, updateCardStatus } from './triage-card';
import { showUndoNotice } from './undo-notice';
import { renderStatsPanel } from './stats-panel';
import { OverrideConfirmModal } from './override-modal';
import { ProgressTracker } from '../performance/progress-tracker';
import { getErrorContext } from '../error/error-handler';
import { ErrorModal } from './error-modal';

export const TRIAGE_VIEW_TYPE = 'zotero-triage-view';

/**
 * Stores previous state for undo functionality
 */
interface UndoState {
  itemId: number;
  previousState: RegistryState;
}

/**
 * TriageView displays batches of items as cards with action buttons
 */
export class TriageView extends ItemView {
  private plugin: ZoteroTriagePlugin;
  private currentBatch: Batch | null = null;
  private processedCount: number = 0;
  private totalZoteroItems: number = 0;
  private searchQuery: string = '';
  private searchInput: HTMLInputElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ZoteroTriagePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return TRIAGE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Zotero Triage';
  }

  getIcon(): string {
    return 'inbox';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('zotero-triage-triage-container');

    // Check if database is configured and connected
    if (!this.plugin.settings.zoteroDbPath || !this.plugin.connector.itemsLoaded) {
      const message = !this.plugin.settings.zoteroDbPath
        ? 'Please configure Zotero database path in settings'
        : 'Click "Generate Batch" to load items from Zotero';

      container.createDiv({
        cls: 'zotero-triage-empty-state',
        text: message
      });
      return;
    }

    // Render initial empty state
    this.renderEmptyState(container);
  }

  async onClose(): Promise<void> {
    // Cleanup if needed
  }

  /**
   * Generate a new batch and display it
   */
  async generateAndShowBatch(): Promise<void> {
    const progress = new ProgressTracker();

    try {
      // Ensure database connected before first operation
      await this.plugin.ensureConnected();

      // Start progress tracking
      progress.start('Loading Zotero library...', 5000); // Estimate 5000 items

      // Load items with progress callback
      const items = await this.plugin.connector.loadItems((loaded, total) => {
        progress.update(loaded, `Loading items from database...`);
        // Update estimate if total differs
        if (total !== progress['state'].total) {
          progress['state'].total = total;
        }
      });

      // Verify items were loaded
      console.log('Zotero Triage DEBUG: Loaded', items.length, 'items from Zotero');

      if (items.length === 0) {
        progress.error('No items found in Zotero library');
        return;
      }

      // Store total item count
      this.totalZoteroItems = items.length;

      progress.update(items.length, 'Generating batch...');

      // DEBUG: Log connector and registry state
      console.log('Zotero Triage DEBUG: Total items in connector:', this.totalZoteroItems);
      const registryStats = this.plugin.registry.getStats();
      console.log('Zotero Triage DEBUG: Registry stats:', registryStats);
      console.log('Zotero Triage DEBUG: First 3 item states:',
        items.slice(0, 3).map(item => ({
          id: item.itemID,
          title: item.title.substring(0, 50),
          state: this.plugin.registry.getState(item.itemID)
        }))
      );

      // Generate batch
      const batch = await this.plugin.batchService.generateBatch({
        size: this.plugin.settings.batchSize,
        includeDeferred: false
      });

      // DEBUG: Log batch result
      console.log('Zotero Triage DEBUG: Batch generated with', batch.items.length, 'items');

      if (batch.items.length === 0) {
        progress.error('No unprocessed items available');
        return;
      }

      progress.complete(`Generated batch of ${batch.items.length} items`);

      // Store batch and reset processed count
      this.currentBatch = batch;
      this.processedCount = 0;

      // Render the batch
      this.refresh();

    } catch (err) {
      const context = getErrorContext(err as Error);
      progress.error(context.message);
      // Show error modal for detailed actions
      new ErrorModal(this.app, context).open();
    }
  }

  /**
   * Render the empty state with "Generate Batch" button
   */
  private renderEmptyState(container: HTMLElement): void {
    container.empty();

    const emptyState = container.createDiv({ cls: 'zotero-triage-empty-state' });
    emptyState.createEl('h3', { text: 'Zotero Triage' });
    emptyState.createEl('p', {
      text: 'Review and process items from your Zotero library in small batches.'
    });

    const generateBtn = emptyState.createEl('button', {
      cls: 'mod-cta',
      text: 'Generate Batch'
    });
    generateBtn.addEventListener('click', () => this.generateAndShowBatch());
  }

  /**
   * Render the current batch with progress and cards
   */
  private renderBatch(container: HTMLElement): void {
    container.empty();

    if (!this.currentBatch) {
      this.renderEmptyState(container);
      return;
    }

    // Check if batch is complete
    if (this.processedCount >= this.currentBatch.items.length) {
      this.renderBatchComplete(container);
      return;
    }

    // Render stats panel
    this.renderStatsPanel(container);

    // Render progress bar
    this.renderProgressBar(container);

    // Render search filter
    this.renderSearchFilter(container);

    // Render cards
    const cardContainer = container.createDiv({ cls: 'zotero-triage-card-list' });
    const displayedItems = this.filterItems(this.currentBatch.items);
    for (const item of displayedItems) {
      // Run validation
      const validationResult = this.plugin.validationService.validate(item);

      // DEBUG: Log validation results
      console.log('Zotero Triage DEBUG: Validation for', item.title.substring(0, 50), {
        itemType: item.itemType,
        valid: validationResult.valid,
        missingFields: validationResult.missingFields,
        errors: validationResult.errors
      });

      const card = createTriageCard(cardContainer, {
        item,
        validationResult,
        onAccept: (item) => this.handleAccept(item),
        onReject: (item) => this.handleReject(item),
        onDefer: (item) => this.handleDefer(item)
      });

      // Apply status badge if item was previously processed
      const state = this.plugin.registry.getState(item.itemID);
      if (state !== 'unseen' && state !== 'proposed') {
        // Map 'imported' state to 'accepted' for badge display
        const badgeState: RegistryState = state === 'imported' ? 'accepted' : state;
        updateCardStatus(card, badgeState);
      }
    }
  }

  /**
   * Render stats panel with library and session statistics
   */
  private renderStatsPanel(container: HTMLElement): void {
    renderStatsPanel(container, {
      registry: this.plugin.registry,
      sessionTracker: this.plugin.sessionTracker,
      totalZoteroItems: this.totalZoteroItems
    });
  }

  /**
   * Render search filter input
   */
  private renderSearchFilter(container: HTMLElement): void {
    const searchGroup = container.createDiv({ cls: 'triage-search' });

    this.searchInput = searchGroup.createEl('input', {
      type: 'text',
      cls: 'search-filter-input',
      placeholder: 'Search by author, title, or tag...'
    });

    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.refresh();
    });
  }

  /**
   * Filter items by search query
   */
  private filterItems(items: ZoteroItem[]): ZoteroItem[] {
    if (this.searchQuery.length === 0) {
      return items;
    }

    return items.filter(item => {
      const query = this.searchQuery;

      // Match against title
      if (item.title.toLowerCase().includes(query)) {
        return true;
      }

      // Match against authors
      if (item.authors.some(a => a.toLowerCase().includes(query))) {
        return true;
      }

      // Match against tags (if exist)
      if (item.tags?.some(t => t.toLowerCase().includes(query))) {
        return true;
      }

      return false;
    });
  }

  /**
   * Render the batch complete state
   */
  private renderBatchComplete(container: HTMLElement): void {
    this.handleBatchComplete();
  }

  /**
   * Handle batch completion with stats and next batch options
   */
  private handleBatchComplete(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('zotero-triage-triage-container');

    // Re-render stats panel
    this.renderStatsPanel(container);

    // Completion message
    const message = container.createDiv({ cls: 'batch-complete' });
    message.createEl('h3', { text: 'Batch Complete!' });
    message.createDiv({
      cls: 'batch-complete-text',
      text: 'Great progress! Ready for another batch?'
    });

    const actions = message.createDiv({ cls: 'batch-complete-actions' });

    // Check if more items available
    const hasMore = this.plugin.batchService.getUnprocessedCount() > 0 ||
                    this.plugin.batchService.getDeferredCount() > 0;

    if (hasMore) {
      const nextBtn = actions.createEl('button', {
        cls: 'mod-cta',
        text: 'Generate Next Batch'
      });
      nextBtn.addEventListener('click', async () => {
        await this.generateAndShowBatch();
      });
    } else {
      actions.createDiv({
        cls: 'batch-complete-text',
        text: 'No more items to process!'
      });
    }

    const laterBtn = actions.createEl('button', {
      text: 'Take a Break'
    });
    laterBtn.addEventListener('click', () => {
      this.plugin.app.workspace.detachLeavesOfType(TRIAGE_VIEW_TYPE);
    });
  }

  /**
   * Render progress indicator
   */
  private renderProgressBar(container: HTMLElement): void {
    if (!this.currentBatch) return;

    const progressSection = container.createDiv({ cls: 'zotero-triage-progress' });

    // Text indicator
    const progressText = progressSection.createDiv({ cls: 'progress-text' });
    progressText.setText(
      `Progress: ${this.processedCount}/${this.currentBatch.items.length} processed`
    );

    // Visual progress bar
    const progressBar = progressSection.createDiv({ cls: 'progress-bar' });
    const progressFill = progressBar.createDiv({ cls: 'progress-fill' });
    const percentage = (this.processedCount / this.currentBatch.items.length) * 100;
    progressFill.style.width = `${percentage}%`;
  }

  /**
   * Handle Accept action - check validation and show override modal if needed
   */
  private async handleAccept(item: ZoteroItem): Promise<void> {
    const previousState = this.plugin.registry.getState(item.itemID);

    // Run validation if quality gate is enabled
    if (this.plugin.settings.qualityGate.enabled) {
      const validationResult = this.plugin.validationService.validate(item);

      if (!validationResult.valid) {
        // Show override confirmation modal
        new OverrideConfirmModal(this.app, {
          item: item,
          missingFields: validationResult.missingFields,
          onConfirm: () => {
            // User confirmed override - proceed with import
            this.performAccept(item, previousState);
          },
          onCancel: () => {
            // User cancelled - do nothing
            new Notice('Import cancelled');
          }
        }).open();
        return;  // Exit early, wait for modal decision
      }
    }

    // Validation passed or disabled - proceed
    this.performAccept(item, previousState);
  }

  /**
   * Perform the actual import after validation check
   */
  private async performAccept(item: ZoteroItem, previousState: RegistryState): Promise<void> {
    try {
      // Create the note
      await this.plugin.noteGenerator.createNote(item);

      // Mark as imported
      this.plugin.registry.markState(item.itemID, 'imported');

      // Update status badge on card
      const card = this.containerEl.querySelector(`[data-item-id="${item.itemID}"]`) as HTMLElement;
      if (card) {
        updateCardStatus(card, 'accepted');
      }

      // Record accept for adaptive learning
      this.plugin.batchService.recordAccept(item);

      // Increment processed count
      this.processedCount++;

      // Record session action
      this.plugin.sessionTracker.recordAction('accepted');

      // Show undo notice
      showUndoNotice({
        message: 'Item accepted and note created.',
        onUndo: () => this.undoAction({ itemId: item.itemID, previousState }, 'accepted'),
        timeout: 3000
      });

      // Refresh view
      this.refresh();

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to create note: ${message}`);
      console.error('Accept action error:', err);
    }
  }

  /**
   * Handle Reject action - mark rejected
   */
  private handleReject(item: ZoteroItem): void {
    const previousState = this.plugin.registry.getState(item.itemID);

    // Mark as rejected
    this.plugin.registry.markState(item.itemID, 'rejected');

    // Update status badge on card
    const card = this.containerEl.querySelector(`[data-item-id="${item.itemID}"]`) as HTMLElement;
    if (card) {
      updateCardStatus(card, 'rejected');
    }

    // Record reject for adaptive learning
    this.plugin.batchService.recordReject(item);

    // Increment processed count
    this.processedCount++;

    // Record session action
    this.plugin.sessionTracker.recordAction('rejected');

    // Show undo notice
    showUndoNotice({
      message: 'Item rejected.',
      onUndo: () => this.undoAction({ itemId: item.itemID, previousState }, 'rejected'),
      timeout: 3000
    });

    // Refresh view
    this.refresh();
  }

  /**
   * Handle Defer action - mark deferred
   */
  private handleDefer(item: ZoteroItem): void {
    const previousState = this.plugin.registry.getState(item.itemID);

    // Mark as deferred
    this.plugin.registry.markState(item.itemID, 'deferred');

    // Update status badge on card
    const card = this.containerEl.querySelector(`[data-item-id="${item.itemID}"]`) as HTMLElement;
    if (card) {
      updateCardStatus(card, 'deferred');
    }

    // Increment processed count
    this.processedCount++;

    // Record session action
    this.plugin.sessionTracker.recordAction('deferred');

    // Show undo notice
    showUndoNotice({
      message: 'Item deferred.',
      onUndo: () => this.undoAction({ itemId: item.itemID, previousState }, 'deferred'),
      timeout: 3000
    });

    // Refresh view
    this.refresh();
  }

  /**
   * Undo the last action
   */
  private undoAction(undoState: UndoState, actionType: 'accepted' | 'rejected' | 'deferred'): void {
    // Revert registry state
    this.plugin.registry.markState(undoState.itemId, undoState.previousState);

    // Update status badge on card (remove badge by passing previous state)
    const card = this.containerEl.querySelector(`[data-item-id="${undoState.itemId}"]`) as HTMLElement;
    if (card) {
      updateCardStatus(card, undoState.previousState);
    }

    // Decrement processed count
    this.processedCount--;

    // Undo session action
    this.plugin.sessionTracker.undoAction(actionType);

    // Refresh view
    this.refresh();

    new Notice('Action undone');
  }

  /**
   * Refresh the view with current state
   */
  refresh(): void {
    const container = this.containerEl.children[1] as HTMLElement;

    if (!this.currentBatch) {
      this.renderEmptyState(container);
    } else {
      this.renderBatch(container);
    }
  }
}
