import { Modal, App, Setting, Notice } from 'obsidian';
import type { ZoteroItem } from '../types';

/**
 * Modal for manual transcript input
 * reference: EXTRACT-04
 */
export class TranscriptInputModal extends Modal {
    private item: ZoteroItem;
    private onConfirm: (transcript: string) => void;
    private onCancel: () => void;
    private transcriptText = '';

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

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('transcript-input-modal');

        contentEl.createEl('h2', { text: 'Manual Transcript Required' });

        contentEl.createEl('div', {
            cls: 'modal-description',
            text: `Automatic transcript extraction failed for "${this.item.title}". Please paste the transcript below to proceed with full enrichment, or cancel to fall back to other evidence (Notes/Abstract).`
        });

        const textarea = contentEl.createEl('textarea', {
            cls: 'transcript-input-area',
            attr: {
                rows: '10',
                placeholder: 'Paste transcript text here...'
            }
        });

        // Make textarea full width and add some styling
        textarea.style.width = '100%';
        textarea.style.resize = 'vertical';
        textarea.style.marginTop = '1em';
        textarea.style.marginBottom = '1em';
        textarea.style.padding = '0.5em';

        textarea.addEventListener('input', (e) => {
            this.transcriptText = (e.target as HTMLTextAreaElement).value;
        });

        const buttonContainer = contentEl.createDiv('modal-button-container');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';

        new Setting(buttonContainer)
            .addButton(btn => btn
                .setButtonText('Skip (Use Fallbacks)')
                .onClick(() => {
                    this.close();
                    this.onCancel();
                }))
            .addButton(btn => btn
                .setButtonText('Process Transcript')
                .setCta()
                .onClick(() => {
                    if (this.transcriptText.trim().length < 50) {
                        new Notice('Transcript is too short. Please paste valid content.');
                        return;
                    }
                    this.close();
                    this.onConfirm(this.transcriptText);
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
