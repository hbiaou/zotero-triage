/**
 * TriageView - Card-based dashboard for reviewing Zotero items
 *
 * Provides an interactive UI for batch processing items with Accept/Reject/Defer actions.
 * Each action includes an undo option displayed as a toast notification.
 */

import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type ZotBridgePlugin from '../main';
import type { ZoteroItem, RegistryState } from '../types';
import type { Batch } from '../batch/types';
import { createTriageCard } from './triage-card';
import { showUndoNotice } from './undo-notice';
import { renderStatsPanel } from './stats-panel';

export const TRIAGE_VIEW_TYPE = 'zotbridge-triage';

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
  private plugin: ZotBridgePlugin;
  private currentBatch: Batch | null = null;
  private processedCount: number = 0;
  private totalZoteroItems: number = 0;

  constructor(leaf: WorkspaceLeaf, plugin: ZotBridgePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return TRIAGE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'ZotBridge Triage';
  }

  getIcon(): string {
    return 'inbox';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('zotbridge-triage-container');

    // Check if database is configured
    if (!this.plugin.settings.zoteroDbPath) {
      container.createDiv({
        cls: 'zotbridge-empty-state',
        text: 'Please configure Zotero database path in settings'
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
    try {
      // Ensure items are loaded
      if (!this.plugin.connector.itemsLoaded) {
        new Notice('Loading Zotero library...', 0);
        await this.plugin.connector.connect(this.plugin.settings.zoteroDbPath);
        new Notice('Library loaded');
      }

      // Store total item count
      this.totalZoteroItems = this.plugin.connector.getCachedItems().length;

      // Generate batch
      const batch = await this.plugin.batchService.generateBatch({
        size: this.plugin.settings.batchSize,
        includeDeferred: false
      });

      if (batch.items.length === 0) {
        new Notice('No unprocessed items available');
        return;
      }

      // Store batch and reset processed count
      this.currentBatch = batch;
      this.processedCount = 0;

      // Render the batch
      this.refresh();

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to generate batch: ${message}`);
      console.error('Batch generation error:', err);
    }
  }

  /**
   * Render the empty state with "Generate Batch" button
   */
  private renderEmptyState(container: HTMLElement): void {
    container.empty();

    const emptyState = container.createDiv({ cls: 'zotbridge-empty-state' });
    emptyState.createEl('h3', { text: 'ZotBridge Triage' });
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

    // Render cards
    const cardContainer = container.createDiv({ cls: 'zotbridge-card-list' });
    for (const item of this.currentBatch.items) {
      createTriageCard(cardContainer, {
        item,
        onAccept: (item) => this.handleAccept(item),
        onReject: (item) => this.handleReject(item),
        onDefer: (item) => this.handleDefer(item)
      });
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
   * Render the batch complete state
   */
  private renderBatchComplete(container: HTMLElement): void {
    container.empty();

    const completeState = container.createDiv({ cls: 'batch-complete' });
    completeState.createEl('h3', { text: 'Batch Complete!' });
    completeState.createEl('p', {
      text: `You processed ${this.processedCount} items.`
    });

    const newBatchBtn = completeState.createEl('button', {
      cls: 'mod-cta',
      text: 'Generate New Batch'
    });
    newBatchBtn.addEventListener('click', () => this.generateAndShowBatch());
  }

  /**
   * Render progress indicator
   */
  private renderProgressBar(container: HTMLElement): void {
    if (!this.currentBatch) return;

    const progressSection = container.createDiv({ cls: 'zotbridge-progress' });

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
   * Handle Accept action - create note and mark imported
   */
  private async handleAccept(item: ZoteroItem): Promise<void> {
    const previousState = this.plugin.registry.getState(item.itemID);

    try {
      // Create the note
      await this.plugin.noteGenerator.createNote(item);

      // Mark as imported
      this.plugin.registry.markState(item.itemID, 'imported');

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
