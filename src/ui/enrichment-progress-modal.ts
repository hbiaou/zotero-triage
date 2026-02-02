/**
 * Enrichment Progress Modal
 *
 * Blocking progress modal for real-time enrichment feedback during pipeline execution.
 * Shows animated progress bar, percentage, and status text updated by orchestrator.
 *
 * Features:
 * - Progress bar with color transitions (blue → green as progress increases)
 * - Percentage display (0% → 100%)
 * - Status text for current stage operation
 * - Error state visualization (red progress bar, error message)
 * - Obsidian theme-compatible CSS variables
 *
 * Usage:
 * ```typescript
 * const modal = new EnrichmentProgressModal(app);
 * modal.open();
 * modal.updateProgress(25, 'Extracting evidence...');
 * modal.updateProgress(50, 'Generating content...');
 * modal.updateProgress(100, 'Complete!');
 * setTimeout(() => modal.close(), 1000);
 * ```
 *
 * Error handling:
 * ```typescript
 * modal.showError('Enrichment timed out after 2 minutes');
 * setTimeout(() => modal.close(), 3000);
 * ```
 */

import { Modal, App } from 'obsidian';

/**
 * Enrichment Progress Modal
 *
 * Displays real-time progress feedback during enrichment pipeline.
 * Modal is blocking - user cannot interact with Obsidian while enrichment runs.
 */
export class EnrichmentProgressModal extends Modal {
  private progressBar: HTMLElement | null = null;
  private statusText: HTMLElement | null = null;
  private percentText: HTMLElement | null = null;

  constructor(app: App) {
    super(app);
  }

  /**
   * Called when modal opens
   *
   * Creates modal UI structure with progress bar, percentage, and status text.
   * Adds inline styles for theming.
   */
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('zotero-triage-enrichment-modal');

    // Modal title
    contentEl.createEl('h2', { text: '🔄 Enriching Literature Note' });

    // Progress container
    const progressContainer = contentEl.createDiv({ cls: 'progress-container' });

    // Progress bar
    const progressBarContainer = progressContainer.createDiv({ cls: 'progress-bar-container' });
    this.progressBar = progressBarContainer.createDiv({ cls: 'progress-bar-fill' });
    this.progressBar.style.width = '0%';

    // Percent text
    this.percentText = progressContainer.createDiv({
      cls: 'progress-percent',
      text: '0%',
    });

    // Status text
    this.statusText = progressContainer.createDiv({
      cls: 'progress-status',
      text: 'Initializing...',
    });

    // Add styles inline
    this.addStyles();
  }

  /**
   * Called when modal closes
   *
   * Cleans up modal content.
   */
  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * Update progress bar and status text
   *
   * Updates progress bar width, color, percentage display, and status message.
   * Color transitions: blue → green as progress increases.
   *
   * @param percent - Progress percentage (0-100)
   * @param status - Status message to display
   */
  updateProgress(percent: number, status: string): void {
    if (this.progressBar) {
      this.progressBar.style.width = `${percent}%`;

      // Color progression: blue → green as progress increases
      if (percent < 50) {
        this.progressBar.style.backgroundColor = 'var(--interactive-accent)';
      } else if (percent < 90) {
        this.progressBar.style.backgroundColor = 'var(--color-blue)';
      } else {
        this.progressBar.style.backgroundColor = 'var(--color-green)';
      }
    }

    if (this.percentText) {
      this.percentText.textContent = `${percent}%`;
    }

    if (this.statusText) {
      this.statusText.textContent = status;
    }
  }

  /**
   * Show error state in modal
   *
   * Sets progress bar to 100% width with red color.
   * Displays error message and error icon.
   *
   * @param message - Error message to display
   */
  showError(message: string): void {
    if (this.progressBar) {
      this.progressBar.style.backgroundColor = 'var(--color-red)';
      this.progressBar.style.width = '100%';
    }

    if (this.percentText) {
      this.percentText.textContent = '❌';
    }

    if (this.statusText) {
      this.statusText.textContent = `Error: ${message}`;
      this.statusText.style.color = 'var(--color-red)';
    }
  }

  /**
   * Add inline styles for progress modal
   *
   * Injects CSS styles into document head.
   * Uses Obsidian CSS variables for theme compatibility.
   */
  private addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .zotero-triage-enrichment-modal {
        padding: 2em;
        min-width: 400px;
      }

      .zotero-triage-enrichment-modal h2 {
        margin-bottom: 1.5em;
        text-align: center;
      }

      .progress-container {
        display: flex;
        flex-direction: column;
        gap: 1em;
      }

      .progress-bar-container {
        width: 100%;
        height: 30px;
        background-color: var(--background-modifier-border);
        border-radius: 4px;
        overflow: hidden;
      }

      .progress-bar-fill {
        height: 100%;
        background-color: var(--interactive-accent);
        transition: width 0.3s ease, background-color 0.3s ease;
      }

      .progress-percent {
        text-align: center;
        font-size: 1.2em;
        font-weight: bold;
      }

      .progress-status {
        text-align: center;
        color: var(--text-muted);
        font-size: 0.9em;
      }
    `;

    document.head.appendChild(style);
  }
}
