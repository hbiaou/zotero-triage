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

    // Missing fields list
    const missingDiv = containerEl.createDiv({ cls: 'override-missing' });
    missingDiv.createEl('h3', { text: 'Missing required fields:' });
    const list = missingDiv.createEl('ul');
    this.options.missingFields.forEach(field => {
      // Convert field key to readable label
      const label = this.fieldLabel(field);
      list.createEl('li', { text: label });
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
