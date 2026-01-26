/**
 * Override Confirmation Modal
 *
 * Displays a confirmation dialog when user attempts to accept an item
 * with missing required fields. Shows what's missing and requires
 * explicit confirmation to proceed.
 */

import { App, Modal } from 'obsidian';
import type { ZoteroItem } from '../db/zotero-connector';

export interface OverrideConfirmOptions {
  item: ZoteroItem;
  missingFields: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

interface FieldHelp {
  label: string;
  example: string;
  whyRequired: string;
}

const FIELD_HELP: Record<string, FieldHelp> = {
  title: {
    label: 'Title',
    example: 'Machine Learning in Climate Science',
    whyRequired: 'Used for note filename and identification'
  },
  creators: {
    label: 'Author(s)',
    example: 'Smith, John; Jones, Jane',
    whyRequired: 'Required for proper citation'
  },
  publicationTitle: {
    label: 'Journal/Publication',
    example: 'Nature Climate Change',
    whyRequired: 'Identifies publication venue for citations'
  },
  date: {
    label: 'Publication Year',
    example: '2023',
    whyRequired: 'Used for citation and recency scoring'
  },
  DOI: {
    label: 'DOI',
    example: '10.1038/s41558-023-01234-5',
    whyRequired: 'Unique identifier for permanent linking'
  },
  abstract: {
    label: 'Abstract',
    example: 'This study investigates...',
    whyRequired: 'Provides context for keyword extraction'
  },
  publisher: {
    label: 'Publisher',
    example: 'Springer',
    whyRequired: 'Required for book citations'
  },
  ISBN: {
    label: 'ISBN',
    example: '978-3-16-148410-0',
    whyRequired: 'Unique identifier for books'
  }
};

export class OverrideConfirmModal extends Modal {
  constructor(
    app: App,
    private options: OverrideConfirmOptions
  ) {
    super(app);
  }

  onOpen(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('zotero-triage-override-modal');

    // Header
    containerEl.createEl('h2', { text: 'Import with missing fields?' });

    // Item info
    const itemInfo = containerEl.createDiv({ cls: 'override-item-info' });
    const authors = this.options.item.authors[0] || 'Unknown';
    itemInfo.setText(`${this.options.item.title} by ${authors}`);

    // Missing fields list with examples and explanations
    const missingDiv = containerEl.createDiv({ cls: 'override-missing' });
    missingDiv.createEl('h3', { text: 'Missing required fields:' });

    // Add link to open in Zotero at top
    const helpText = missingDiv.createDiv({ cls: 'override-help-text' });
    helpText.setText('You can edit these fields in Zotero to fix validation issues.');

    // Render field help for each missing field
    this.options.missingFields.forEach(field => {
      const fieldHelp = FIELD_HELP[field];
      if (fieldHelp) {
        this.renderFieldHelp(missingDiv, fieldHelp);
      } else {
        // Fallback for fields without help text
        const fieldDiv = missingDiv.createDiv({ cls: 'field-help' });
        fieldDiv.createEl('strong', { text: this.fieldLabel(field) });
      }
    });

    // Warning text
    containerEl.createDiv({
      cls: 'override-warning',
      text: 'Imported notes may be incomplete. You can edit the metadata in Zotero and re-import later.'
    });

    // Action buttons
    const actions = containerEl.createDiv({ cls: 'modal-button-container' });

    const confirmBtn = actions.createEl('button', {
      cls: 'mod-cta',
      text: 'Import Anyway'
    });
    confirmBtn.addEventListener('click', () => {
      this.options.onConfirm();
      this.close();
    });

    const cancelBtn = actions.createEl('button', {
      text: 'Cancel'
    });
    cancelBtn.addEventListener('click', () => {
      this.options.onCancel();
      this.close();
    });
  }

  onClose(): void {
    const { containerEl } = this;
    containerEl.empty();
  }

  /**
   * Render field help section with example and expandable explanation
   */
  private renderFieldHelp(container: HTMLElement, fieldHelp: FieldHelp): void {
    const fieldDiv = container.createDiv({ cls: 'field-help' });

    // Field label
    fieldDiv.createEl('strong', { text: fieldHelp.label });

    // Example (always visible)
    const exampleP = fieldDiv.createEl('p', { cls: 'setting-item-description' });
    exampleP.setText(`Example: ${fieldHelp.example}`);

    // Why required (progressive disclosure)
    const details = fieldDiv.createEl('details');
    details.createEl('summary', { text: 'Why required?' });
    const explanation = details.createEl('p');
    explanation.setText(fieldHelp.whyRequired);
  }

  private fieldLabel(fieldKey: string): string {
    const labels: Record<string, string> = {
      'title': 'Title',
      'creators': 'Authors',
      'publicationTitle': 'Journal Name',
      'date': 'Publication Year',
      'DOI': 'DOI',
      'abstract': 'Abstract',
      'publisher': 'Publisher',
      'ISBN': 'ISBN'
    };
    return labels[fieldKey] || fieldKey;
  }
}
