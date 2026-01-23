import { Notice } from 'obsidian';

export interface UndoNoticeOptions {
  message: string;
  onUndo: () => void;
  timeout?: number; // Default 3000ms per CONTEXT.md
}

export function showUndoNotice(options: UndoNoticeOptions): Notice {
  const { message, onUndo, timeout = 3000 } = options;

  const fragment = document.createDocumentFragment();
  const container = fragment.createDiv();
  container.createSpan({ text: message + ' ' });
  const undoBtn = container.createEl('a', {
    text: 'Undo',
    cls: 'zotbridge-undo-link'
  });
  undoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    onUndo();
    notice.hide();
  });

  const notice = new Notice(fragment, timeout);
  return notice;
}
