/**
 * Manual Transcript Input Modal
 *
 * Provides UI for users to manually paste video transcripts when
 * automatic extraction fails or platform is unsupported.
 *
 * Features:
 * - Display item title and video URL for context
 * - Large textarea for transcript paste
 * - Character count indicator
 * - Save button (disabled when empty)
 * - Cancel button to skip enrichment
 * - Help text explaining why manual input is needed
 */

import { App, Modal } from 'obsidian';
import type { ZoteroItem } from '../types';

/**
 * Manual transcript input modal
 *
 * Shown when automatic transcript extraction fails or platform
 * is unsupported. Allows user to paste transcript manually.
 *
 * Usage:
 * ```typescript
 * const modal = new TranscriptModal(
 *   app,
 *   item,
 *   (transcript) => {
 *     console.log(`User provided ${transcript.length} chars`);
 *     proceedWithEnrichment(transcript);
 *   },
 *   () => {
 *     console.log('User cancelled - skip enrichment');
 *   }
 * );
 * modal.open();
 * ```
 */
export class TranscriptModal extends Modal {
  private item: ZoteroItem;
  private onConfirm: (transcript: string) => void;
  private onCancel: () => void;
  private textareaEl: HTMLTextAreaElement | null = null;
  private charCountEl: HTMLElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;

  /**
   * Create manual transcript input modal
   *
   * @param app - Obsidian app instance
   * @param item - Zotero item requiring transcript
   * @param onConfirm - Callback when user saves transcript
   * @param onCancel - Callback when user cancels
   */
  constructor(
    app: App,
    item: ZoteroItem,
    onConfirm: (transcript: string) => void,
    onCancel: () => void
  ) {
    super(app);
    this.item = item;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  /**
   * Render modal content
   */
  onOpen(): void {
    const { containerEl, titleEl } = this;

    titleEl.setText('Manual Transcript Input');
    containerEl.addClass('zotero-triage-transcript-modal');

    // Item context section
    const contextDiv = containerEl.createDiv({ cls: 'transcript-modal-context' });

    // Item title
    contextDiv.createEl('h3', { text: this.item.title });

    // Video URL (if available)
    if (this.item.url) {
      const urlDiv = contextDiv.createDiv({ cls: 'transcript-modal-url' });
      urlDiv.createEl('strong', { text: 'Video URL: ' });
      const urlLink = urlDiv.createEl('a', {
        text: this.item.url,
        href: this.item.url
      });
      urlLink.setAttribute('target', '_blank');
      urlLink.setAttribute('rel', 'noopener noreferrer');
    }

    // Help text explaining manual input
    const helpDiv = containerEl.createDiv({ cls: 'transcript-modal-help' });
    helpDiv.createEl('p', {
      text: 'Automatic transcript extraction not available. Please paste the transcript manually from the video platform, or cancel to skip enrichment.'
    });
    helpDiv.createEl('p', {
      cls: 'setting-item-description',
      text: 'Tip: Many video platforms provide transcripts or closed captions that can be copied. Look for "Show transcript" or "CC" options.'
    });

    // Textarea for transcript paste
    const textareaContainer = containerEl.createDiv({ cls: 'transcript-modal-textarea-container' });

    this.textareaEl = textareaContainer.createEl('textarea', {
      cls: 'transcript-modal-textarea',
      attr: {
        placeholder: 'Paste video transcript here...',
        rows: '12',
        'aria-label': 'Video transcript text'
      }
    });

    // Character count indicator
    this.charCountEl = textareaContainer.createDiv({
      cls: 'transcript-modal-char-count',
      text: '0 characters'
    });

    // Update character count on input
    this.textareaEl.addEventListener('input', () => {
      this.updateCharCount();
      this.updateSaveButtonState();
    });

    // Action buttons
    const actionsDiv = containerEl.createDiv({ cls: 'modal-button-container' });

    // Save button (disabled initially)
    this.saveBtn = actionsDiv.createEl('button', {
      cls: 'mod-cta',
      text: 'Save Transcript',
      attr: {
        disabled: 'true'
      }
    });
    this.saveBtn.addEventListener('click', () => {
      this.handleSave();
    });

    // Cancel button
    const cancelBtn = actionsDiv.createEl('button', {
      text: 'Cancel'
    });
    cancelBtn.addEventListener('click', () => {
      this.handleCancel();
    });

    // Focus textarea
    this.textareaEl.focus();
  }

  /**
   * Clean up modal content
   */
  onClose(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.textareaEl = null;
    this.charCountEl = null;
    this.saveBtn = null;
  }

  /**
   * Update character count indicator
   */
  private updateCharCount(): void {
    if (!this.textareaEl || !this.charCountEl) {
      return;
    }

    const charCount = this.textareaEl.value.length;
    const wordCount = this.textareaEl.value.split(/\s+/).filter(w => w.length > 0).length;

    this.charCountEl.setText(
      `${charCount.toLocaleString()} characters, ${wordCount.toLocaleString()} words`
    );
  }

  /**
   * Update save button state based on textarea content
   */
  private updateSaveButtonState(): void {
    if (!this.saveBtn || !this.textareaEl) {
      return;
    }

    const isEmpty = this.textareaEl.value.trim().length === 0;

    if (isEmpty) {
      this.saveBtn.setAttribute('disabled', 'true');
    } else {
      this.saveBtn.removeAttribute('disabled');
    }
  }

  /**
   * Handle save button click
   */
  private handleSave(): void {
    if (!this.textareaEl) {
      return;
    }

    const transcript = this.textareaEl.value.trim();

    if (transcript.length === 0) {
      return;
    }

    this.onConfirm(transcript);
    this.close();
  }

  /**
   * Handle cancel button click
   */
  private handleCancel(): void {
    this.onCancel();
    this.close();
  }
}
