import { App, Modal, Setting } from 'obsidian';
import { ZoteroItem } from '../types';

interface InsufficientDataModalOptions {
    item: ZoteroItem;
    onOpenInZotero: () => void;
    onDefer: () => void;
    onRetry: () => void;
    onCancel: () => void;
}

export class InsufficientDataModal extends Modal {
    private options: InsufficientDataModalOptions;

    constructor(app: App, options: InsufficientDataModalOptions) {
        super(app);
        this.options = options;
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        const { item } = this.options;

        titleEl.setText('Insufficient Evidence');
        contentEl.addClass('zotero-triage-modal');

        contentEl.createEl('p', {
            text: `The item "${item.title}" does not have enough evidence for generating a literature note.`,
            cls: 'modal-description'
        });

        const warningBox = contentEl.createDiv({ cls: 'zotero-triage-warning-box' });
        warningBox.createEl('strong', { text: 'Missing Requirements:' });
        const ul = warningBox.createEl('ul');
        ul.createEl('li', { text: 'Full Text PDF Attachment' });
        ul.createEl('li', { text: 'OR Zotero Notes/Annotations' });
        ul.createEl('li', { text: 'OR Video Transcript' });

        contentEl.createEl('p', {
            text: 'Please add the missing content in Zotero before proceeding, or defer this item for later.',
            cls: 'modal-help-text'
        });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        // Open in Zotero Button
        const zoteroBtn = buttonContainer.createEl('button', { text: 'Open in Zotero' });
        zoteroBtn.addEventListener('click', () => {
            this.options.onOpenInZotero();
        });

        // Defer Button
        const deferBtn = buttonContainer.createEl('button', { text: 'Defer Item' });
        deferBtn.addEventListener('click', () => {
            this.options.onDefer();
            this.close();
        });

        // Retry Button (Call to Action)
        const retryBtn = buttonContainer.createEl('button', {
            text: 'Retry Processing',
            cls: 'mod-cta'
        });
        retryBtn.addEventListener('click', () => {
            this.options.onRetry();
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
