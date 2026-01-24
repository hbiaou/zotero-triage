/**
 * Error Modal
 *
 * Displays user-friendly error messages with technical details and action buttons.
 * Used by error handling infrastructure to present ErrorContext to users.
 */

import { App, Modal, Setting } from 'obsidian';
import { ErrorContext } from '../error/error-handler';

export class ErrorModal extends Modal {
  constructor(
    app: App,
    private context: ErrorContext
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('zotbridge-error-modal');

    // Title
    contentEl.createEl('h2', { text: this.context.title });

    // Message
    contentEl.createEl('p', { text: this.context.message });

    // Technical details (collapsible)
    if (this.context.technicalDetails) {
      const detailsContainer = contentEl.createDiv('error-details');
      const toggle = detailsContainer.createEl('details');
      toggle.createEl('summary', { text: 'Technical Details' });
      const pre = toggle.createEl('pre');
      pre.textContent = this.context.technicalDetails;
    }

    // Action buttons
    const actionsDiv = contentEl.createDiv('modal-button-container');
    for (const actionDef of this.context.actions) {
      const btn = actionsDiv.createEl('button', { text: actionDef.label });
      btn.addEventListener('click', async () => {
        await actionDef.action();
        this.close();
      });
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
