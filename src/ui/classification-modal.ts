/**
 * Classification Override Modal
 *
 * Displays modal UI for user override of low-confidence domain classifications.
 * Shown when confidence < 0.70 during Accept workflow to allow user correction
 * before applying domain-specific enrichment templates.
 *
 * Features:
 * - Displays item info (title, type)
 * - Shows classification suggestion with confidence and reasoning
 * - Provides domain selector dropdown
 * - Includes collapsible domain guide
 * - Action buttons for confirmation or cancellation
 */

import { Modal, App, Notice } from 'obsidian';
import type { ZoteroItem } from '../types';
import type { ClassificationResult, Domain } from '../classification/types';

/**
 * Modal for user override of low-confidence domain classifications
 *
 * Usage:
 * ```typescript
 * const modal = new ClassificationModal(
 *   app,
 *   item,
 *   classificationResult,
 *   (selectedDomain) => {
 *     console.log('User selected:', selectedDomain);
 *     // Proceed with enrichment using selected domain
 *   },
 *   () => {
 *     console.log('User cancelled classification');
 *     // Abort enrichment
 *   }
 * );
 * modal.open();
 * ```
 */
export class ClassificationModal extends Modal {
  private item: ZoteroItem;
  private suggested: ClassificationResult;
  private onConfirm: (domain: Domain) => void;
  private onCancel: () => void;
  private selectedDomain: Domain;

  /**
   * Create classification override modal
   *
   * @param app - Obsidian app instance
   * @param item - Zotero item being classified
   * @param suggested - Suggested classification result from DomainClassifier
   * @param onConfirm - Callback invoked when user confirms domain selection
   * @param onCancel - Callback invoked when user cancels classification
   */
  constructor(
    app: App,
    item: ZoteroItem,
    suggested: ClassificationResult,
    onConfirm: (domain: Domain) => void,
    onCancel: () => void
  ) {
    super(app);
    this.item = item;
    this.suggested = suggested;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.selectedDomain = suggested.domain; // Pre-select suggested domain
  }

  /**
   * Render modal content on open
   */
  onOpen(): void {
    const { contentEl } = this;

    // Clear previous content and add CSS class
    contentEl.empty();
    contentEl.addClass('zotero-triage-classification-modal');

    // Header
    contentEl.createEl('h2', { text: 'Classify Item Into Domain' });

    // Item info section
    const itemInfoEl = contentEl.createDiv('classification-item-info');
    itemInfoEl.createEl('div', {
      text: this.item.title,
      cls: 'classification-item-title',
    });
    itemInfoEl.createEl('div', {
      text: `Item type: ${this.item.itemType}`,
      cls: 'classification-item-type',
    });

    // Classification suggestion section
    const suggestionEl = contentEl.createDiv('classification-suggestion');
    const confidencePercent = Math.round(this.suggested.confidence * 100);
    suggestionEl.createEl('div', {
      text: `Suggested domain: ${this.suggested.domain} (${confidencePercent}% confidence)`,
      cls: 'classification-confidence',
    });
    suggestionEl.createEl('div', {
      text: this.suggested.reasoning,
      cls: 'classification-reasoning',
    });

    // Domain selector dropdown
    const selectorContainer = contentEl.createDiv('classification-selector');
    selectorContainer.createEl('label', {
      text: 'Domain:',
      cls: 'classification-label',
      attr: { for: 'domain-select' },
    });

    const selectEl = selectorContainer.createEl('select', {
      cls: 'dropdown',
      attr: {
        id: 'domain-select',
        'aria-label': 'Select domain category',
      },
    });

    // Add domain options
    const domains: Domain[] = ['Academic', 'Software', 'Farming', 'General'];
    for (const domain of domains) {
      const optionEl = selectEl.createEl('option', {
        text: domain,
        value: domain,
      });
      if (domain === this.selectedDomain) {
        optionEl.selected = true;
      }
    }

    // Handle domain selection changes
    selectEl.addEventListener('change', (event) => {
      const target = event.target as HTMLSelectElement;
      this.selectedDomain = target.value as Domain;
    });

    // Domain guide (collapsible)
    const guideEl = contentEl.createEl('details', {
      cls: 'classification-guide',
    });
    guideEl.createEl('summary', { text: 'What does each domain mean?' });

    const guideContent = guideEl.createDiv('classification-guide-content');

    const domainDefinitions = [
      {
        domain: 'Academic',
        description:
          'Research papers, textbooks, scholarly articles, technical reports from universities or research institutions.',
      },
      {
        domain: 'Software',
        description:
          'Programming code, library documentation, developer tools, open source projects, API references.',
      },
      {
        domain: 'Farming',
        description:
          'Agriculture, crop science, farming practices, agronomy, permaculture, sustainable agriculture.',
      },
      {
        domain: 'General',
        description:
          'News articles, blogs, miscellaneous content that does not fit into other specific domains.',
      },
    ];

    for (const def of domainDefinitions) {
      const defEl = guideContent.createDiv('classification-domain-def');
      defEl.createEl('strong', { text: `${def.domain}: ` });
      defEl.createEl('span', { text: def.description });
    }

    // Action buttons
    const buttonContainer = contentEl.createDiv('modal-button-container');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '8px';
    buttonContainer.style.marginTop = '20px';

    // Continue button (primary/CTA)
    const continueButton = buttonContainer.createEl('button', {
      text: `Continue with ${this.selectedDomain}`,
      cls: 'mod-cta',
      attr: {
        'aria-label': `Continue classification with ${this.selectedDomain} domain`,
      },
    });
    continueButton.addEventListener('click', () => {
      this.onConfirm(this.selectedDomain);
      this.close();
    });

    // Update button text when selection changes
    selectEl.addEventListener('change', () => {
      continueButton.textContent = `Continue with ${this.selectedDomain}`;
      continueButton.setAttribute(
        'aria-label',
        `Continue classification with ${this.selectedDomain} domain`
      );
    });

    // Cancel button (secondary)
    const cancelButton = buttonContainer.createEl('button', {
      text: 'Cancel',
      attr: { 'aria-label': 'Cancel classification' },
    });
    cancelButton.addEventListener('click', () => {
      this.onCancel();
      this.close();
    });
  }

  /**
   * Clean up modal content on close
   */
  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
