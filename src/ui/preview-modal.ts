/**
 * PreviewModal - Note preview modal with confirm/cancel
 *
 * Shows a preview of the literature note that will be created,
 * with metadata summary and full content preview.
 */

import { App, Modal, Setting } from 'obsidian';
import type { ZoteroItem } from '../db/zotero-connector';

/**
 * Callback when user confirms import
 */
export type ConfirmCallback = () => void;

/**
 * Maximum title length before truncation
 */
const MAX_TITLE_LENGTH = 60;

/**
 * PreviewModal displays note preview with confirm/cancel actions
 */
export class PreviewModal extends Modal {
  private item: ZoteroItem;
  private previewContent: string;
  private filePath: string;
  private onConfirm: ConfirmCallback;
  private onBasicImport?: ConfirmCallback;
  private canEnrich: boolean;
  private previewExpanded: boolean = false;

  /**
   * Create a new PreviewModal
   *
   * @param app - Obsidian app instance
   * @param item - Zotero item being imported
   * @param previewContent - Full markdown content to preview
   * @param filePath - Path where note will be created
   * @param onConfirm - Callback when user confirms metadata-rich import (smart or basic)
   * @param canEnrich - Whether the item has sufficient data for AI enrichment
   * @param onBasicImport - Callback for explicit basic import when enrichment is available
   */
  constructor(
    app: App,
    item: ZoteroItem,
    previewContent: string,
    filePath: string,
    onConfirm: ConfirmCallback,
    canEnrich: boolean = false,
    onBasicImport?: ConfirmCallback
  ) {
    super(app);
    this.item = item;
    this.previewContent = previewContent;
    this.filePath = filePath;
    this.onConfirm = onConfirm;
    this.canEnrich = canEnrich;
    this.onBasicImport = onBasicImport;
  }

  /**
   * Render the modal content when opened
   */
  onOpen(): void {
    const { contentEl, titleEl } = this;

    // Set modal title
    const title = this.item.title || 'Untitled';
    const displayTitle = title.length > MAX_TITLE_LENGTH
      ? title.substring(0, MAX_TITLE_LENGTH) + '...'
      : title;
    titleEl.setText(`Import: ${displayTitle}`);

    // Main container
    const container = contentEl.createDiv({ cls: 'zotero-triage-preview-modal' });

    // Metadata summary section
    this.renderMetadataSummary(container);

    // Collapsible preview section
    this.renderPreviewSection(container);

    // File path indicator
    container.createDiv({
      cls: 'zotero-triage-filepath',
      text: `Will create: ${this.filePath}`
    });

    // Button row
    this.renderButtons(container);
  }

  /**
   * Render metadata summary section
   */
  private renderMetadataSummary(container: HTMLElement): void {
    const metadataSection = container.createDiv({ cls: 'zotero-triage-metadata' });

    // Authors
    const authors = this.item.authors.length > 0
      ? this.item.authors.join('; ')
      : 'Unknown';
    this.createMetadataRow(metadataSection, 'Authors', authors);

    // Year
    this.createMetadataRow(metadataSection, 'Year', this.item.year || 'Unknown');

    // Item type
    this.createMetadataRow(metadataSection, 'Type', this.item.itemType);

    // DOI (if present)
    if (this.item.doi) {
      this.createMetadataRow(metadataSection, 'DOI', this.item.doi);
    }

    // Journal (if present)
    if (this.item.journal) {
      this.createMetadataRow(metadataSection, 'Journal', this.item.journal);
    }

    // PDF (if present)
    if (this.item.pdfPath) {
      this.createMetadataRow(metadataSection, 'PDF', 'Attached');
    }

    // Tags (if present)
    if (this.item.tags && this.item.tags.length > 0) {
      this.createMetadataRow(metadataSection, 'Tags', this.item.tags.join(', '));
    }
  }

  /**
   * Create a metadata row with label and value
   */
  private createMetadataRow(
    container: HTMLElement,
    label: string,
    value: string
  ): void {
    const row = container.createDiv({ cls: 'zotero-triage-metadata-row' });
    row.createSpan({ cls: 'zotero-triage-metadata-label', text: `${label}:` });
    row.createSpan({ cls: 'zotero-triage-metadata-value', text: value });
  }

  /**
   * Render collapsible preview section
   */
  private renderPreviewSection(container: HTMLElement): void {
    const previewSection = container.createDiv({ cls: 'zotero-triage-preview-section' });

    // Toggle header
    const toggleHeader = previewSection.createDiv({
      cls: 'zotero-triage-preview-toggle'
    });

    const toggleIcon = toggleHeader.createSpan({
      cls: 'zotero-triage-toggle-icon',
      text: this.previewExpanded ? '\u25BC' : '\u25B6'
    });

    toggleHeader.createSpan({ text: ' Preview full note content' });

    // Preview content (hidden by default)
    const previewContent = previewSection.createDiv({
      cls: 'zotero-triage-preview-content'
    });
    previewContent.style.display = this.previewExpanded ? 'block' : 'none';

    // Code block for markdown preview
    const codeBlock = previewContent.createEl('pre', {
      cls: 'zotero-triage-preview-code'
    });
    codeBlock.createEl('code', {
      text: this.previewContent
    });

    // Toggle click handler
    toggleHeader.addEventListener('click', () => {
      this.previewExpanded = !this.previewExpanded;
      toggleIcon.setText(this.previewExpanded ? '\u25BC' : '\u25B6');
      previewContent.style.display = this.previewExpanded ? 'block' : 'none';
    });
  }

  /**
   * Render action buttons
   */
  private renderButtons(container: HTMLElement): void {
    const buttonRow = container.createDiv({ cls: 'zotero-triage-button-row' });

    // Primary Action Button (Enrich or Basic)
    const primaryLabel = this.canEnrich ? 'Generate Literature Note' : 'Create Note';
    const createBtn = buttonRow.createEl('button', {
      cls: 'mod-cta',
      text: primaryLabel
    });

    if (this.canEnrich) {
      createBtn.setAttribute('aria-label', 'Generates a rich AI-enriched literature note');
      createBtn.title = 'Generates a rich AI-enriched literature note from PDF/abstract';
    }

    createBtn.addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });

    // Secondary Action: Basic Import (only if enrichment is available)
    if (this.canEnrich && this.onBasicImport) {
      const basicBtn = buttonRow.createEl('button', {
        text: 'Create Basic Note',
        cls: 'zotero-triage-secondary-btn' // You might need to add this class or just use default
      });
      basicBtn.style.marginRight = 'auto'; // Push others to right if flex, or just spacing
      basicBtn.style.marginRight = '10px';

      basicBtn.title = 'Creates a standard markdown note without AI enrichment';
      basicBtn.addEventListener('click', () => {
        if (this.onBasicImport) this.onBasicImport();
        this.close();
      });
    }

    // Cancel button
    const cancelBtn = buttonRow.createEl('button', {
      text: 'Cancel'
    });
    cancelBtn.addEventListener('click', () => {
      this.close();
    });
  }

  /**
   * Clean up when modal closes
   */
  onClose(): void {
    this.contentEl.empty();
  }
}
