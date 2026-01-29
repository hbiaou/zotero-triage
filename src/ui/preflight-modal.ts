/**
 * PreflightModal - Library health check modal before onboarding
 *
 * Displays color-coded advisories for:
 * - Trash items (yellow warning)
 * - Duplicate items (red critical)
 * - Group libraries (blue info)
 *
 * Features:
 * - Sequential checks with progress updates
 * - 15-second timeout message for large libraries
 * - Skip button to bypass checks entirely
 * - "I Understand" acknowledgment to proceed
 * - Error bypass with "Continue Anyway" option
 */

import { App, Modal } from 'obsidian';
import { ZoteroConnector } from '../db/zotero-connector';
import { PreflightService, PreflightCheckResult } from '../services/preflight-service';
import { DuplicateDetectionService } from '../services/duplicate-detection-service';

/**
 * Modal for displaying preflight health check results
 */
export class PreflightModal extends Modal {
  private connector: ZoteroConnector;
  private duplicateDetectionService: DuplicateDetectionService;
  private onComplete: () => void;

  private checkStartTime: number = 0;
  private isChecking: boolean = false;
  private timeoutTimer: NodeJS.Timeout | null = null;
  private progressEl: HTMLElement | null = null;

  /**
   * Create PreflightModal
   *
   * @param app - Obsidian app instance
   * @param connector - ZoteroConnector for database access
   * @param duplicateDetectionService - Service for duplicate detection
   * @param onComplete - Callback when user completes preflight (skip or acknowledge)
   */
  constructor(
    app: App,
    connector: ZoteroConnector,
    duplicateDetectionService: DuplicateDetectionService,
    onComplete: () => void
  ) {
    super(app);
    this.connector = connector;
    this.duplicateDetectionService = duplicateDetectionService;
    this.onComplete = onComplete;
  }

  /**
   * Render modal and start preflight checks
   */
  async onOpen(): Promise<void> {
    const { contentEl, titleEl } = this;

    titleEl.setText('Library Health Check');
    contentEl.addClass('zotero-triage-preflight');

    // Create progress container
    this.progressEl = contentEl.createDiv({ cls: 'preflight-progress' });

    // Add skip button (top-right corner)
    const skipBtn = contentEl.createEl('button', {
      cls: 'preflight-skip-button',
      text: 'Skip Preflight'
    });
    skipBtn.addEventListener('click', () => {
      this.onComplete();
      this.close();
    });

    // Show initial progress message
    this.updateProgress('Checking library health...');

    // Start checks
    this.checkStartTime = Date.now();
    this.isChecking = true;

    // Set 15-second timeout for large libraries
    this.timeoutTimer = setTimeout(() => {
      this.showTimeoutMessage();
    }, 15000);

    try {
      await this.runPreflightChecks();
    } catch (err) {
      this.displayCatastrophicError(err as Error);
    } finally {
      this.isChecking = false;
      if (this.timeoutTimer) {
        clearTimeout(this.timeoutTimer);
        this.timeoutTimer = null;
      }
    }
  }

  /**
   * Override onClose to prevent Escape key dismissal during checks
   * and clean up timeout timer
   */
  onClose(): void {
    // Clear timeout timer if exists
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    super.onClose();
  }

  /**
   * Run preflight checks with progress callbacks
   */
  private async runPreflightChecks(): Promise<void> {
    const service = new PreflightService(this.connector, this.duplicateDetectionService);

    const result = await service.executePreflightChecks((message) => {
      this.updateProgress(message);
    });

    // Display results
    this.displayResults(result);
  }

  /**
   * Update progress message during checks
   */
  private updateProgress(message: string): void {
    if (this.progressEl) {
      this.progressEl.empty();

      // Add spinner
      const spinner = this.progressEl.createDiv({ cls: 'preflight-spinner' });

      // Add progress message
      this.progressEl.createDiv({
        cls: 'progress-message',
        text: message
      });
    }
  }

  /**
   * Show timeout message if checks take longer than 15 seconds
   */
  private showTimeoutMessage(): void {
    if (this.isChecking && this.progressEl) {
      const notice = this.progressEl.createDiv({
        cls: 'preflight-timeout-notice',
        text: 'Large library detected. This may take up to a minute...'
      });
    }
  }

  /**
   * Display preflight results with color-coded advisories
   */
  private displayResults(result: PreflightCheckResult): void {
    const { contentEl } = this;

    // Clear progress container
    if (this.progressEl) {
      this.progressEl.remove();
      this.progressEl = null;
    }

    // Create results container
    const resultsContainer = contentEl.createDiv({ cls: 'preflight-results' });

    // Advisory 1: Trash items (yellow warning)
    if (result.trashCount > 0) {
      this.createAdvisory(
        resultsContainer,
        'warning',
        `${result.trashCount} items in trash`,
        'Trash items may affect recommendation accuracy',
        'In Zotero, go to Trash collection to review and empty'
      );
    }

    // Advisory 2: Duplicate items (red critical)
    if (result.duplicateCount > 0) {
      this.createAdvisory(
        resultsContainer,
        'critical',
        `${result.duplicateCount} duplicate items detected`,
        'Duplicates can cause items to appear multiple times in batches',
        'In Zotero, go to Duplicate Items in left sidebar to merge'
      );
    }

    // Advisory 3: Group libraries (blue info)
    if (result.hasGroupLibraries) {
      this.createAdvisory(
        resultsContainer,
        'info',
        'Group libraries detected',
        'Group libraries automatically excluded from recommendations',
        null // No action needed
      );
    }

    // Display errors if any check failed
    if (result.trashError) {
      this.createErrorAdvisory(resultsContainer, 'Trash check failed', result.trashError);
    }
    if (result.duplicateError) {
      this.createErrorAdvisory(resultsContainer, 'Duplicate check failed', result.duplicateError);
    }
    if (result.groupLibrariesError) {
      this.createErrorAdvisory(resultsContainer, 'Group library check failed', result.groupLibrariesError);
    }

    // If no issues found
    if (result.trashCount === 0 && result.duplicateCount === 0 && !result.hasGroupLibraries &&
        !result.trashError && !result.duplicateError && !result.groupLibrariesError) {
      resultsContainer.createDiv({
        cls: 'preflight-all-clear',
        text: 'No issues detected. Your library looks healthy!'
      });
    }

    // Acknowledgment button
    const acknowledgeBtn = contentEl.createEl('button', {
      cls: 'mod-cta preflight-acknowledge-btn',
      text: 'I Understand'
    });
    acknowledgeBtn.addEventListener('click', () => {
      this.onComplete();
      this.close();
    });
  }

  /**
   * Create an advisory card with color-coded severity
   */
  private createAdvisory(
    container: HTMLElement,
    severity: 'critical' | 'warning' | 'info',
    count: string,
    message: string,
    action: string | null
  ): void {
    const advisory = container.createDiv({ cls: `preflight-advisory ${severity}` });

    // Icon (visual indicator based on severity)
    const icon = advisory.createDiv({ cls: 'advisory-icon' });
    if (severity === 'critical') {
      icon.setText('⚠');
    } else if (severity === 'warning') {
      icon.setText('⚡');
    } else {
      icon.setText('ℹ');
    }

    // Content
    const content = advisory.createDiv({ cls: 'advisory-content' });

    const countEl = content.createDiv({ cls: 'advisory-count' });
    countEl.setText(count);

    const messageEl = content.createDiv({ cls: 'advisory-message' });
    messageEl.setText(message);

    if (action) {
      const actionEl = content.createDiv({ cls: 'advisory-action' });
      actionEl.setText(action);
    }
  }

  /**
   * Create error advisory for failed checks
   */
  private createErrorAdvisory(container: HTMLElement, title: string, error: string): void {
    const advisory = container.createDiv({ cls: 'preflight-advisory error' });

    const icon = advisory.createDiv({ cls: 'advisory-icon' });
    icon.setText('❌');

    const content = advisory.createDiv({ cls: 'advisory-content' });

    const titleEl = content.createDiv({ cls: 'advisory-count' });
    titleEl.setText(title);

    const errorEl = content.createDiv({ cls: 'advisory-message' });
    errorEl.setText(error);
  }

  /**
   * Display catastrophic error with bypass option
   */
  private displayCatastrophicError(err: Error): void {
    const { contentEl } = this;

    // Clear all content
    contentEl.empty();

    // Error heading
    contentEl.createEl('h3', {
      text: 'Preflight Check Failed'
    });

    // Error message
    contentEl.createDiv({
      cls: 'preflight-error-message',
      text: err.message
    });

    // Bypass message
    contentEl.createDiv({
      cls: 'preflight-bypass-message',
      text: 'You can continue to onboarding without the health check.'
    });

    // Continue anyway button
    const continueBtn = contentEl.createEl('button', {
      cls: 'mod-cta',
      text: 'Continue Anyway'
    });
    continueBtn.addEventListener('click', () => {
      this.onComplete();
      this.close();
    });
  }
}
