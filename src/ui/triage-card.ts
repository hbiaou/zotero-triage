/**
 * TriageCard - Visual card component for displaying Zotero items
 *
 * Renders item metadata with action buttons for Accept/Reject/Defer.
 */

import type { ZoteroItem } from '../types';

export interface TriageCardOptions {
  item: ZoteroItem;
  onAccept: (item: ZoteroItem) => void;
  onReject: (item: ZoteroItem) => void;
  onDefer: (item: ZoteroItem) => void;
}

/**
 * Create a triage card element for an item
 *
 * @param container - Parent element to append card to
 * @param options - Card configuration and callbacks
 * @returns Created card element
 */
export function createTriageCard(
  container: HTMLElement,
  options: TriageCardOptions
): HTMLElement {
  const { item, onAccept, onReject, onDefer } = options;

  const card = container.createDiv({ cls: 'zotbridge-triage-card' });

  // Header with item type badge
  const header = card.createDiv({ cls: 'triage-card-header' });
  header.createSpan({ cls: 'item-type-badge', text: item.itemType });

  // Title
  card.createEl('h3', {
    cls: 'triage-card-title',
    text: item.title || 'Untitled'
  });

  // Authors and year
  const meta = card.createDiv({ cls: 'triage-card-meta' });
  const authors = item.authors.length > 0
    ? item.authors.slice(0, 2).join(', ') + (item.authors.length > 2 ? ' et al.' : '')
    : 'Unknown author';
  meta.createSpan({ text: `${authors} (${item.year || 'n.d.'})` });

  // Abstract (truncated to 200 chars)
  if (item.abstract) {
    const abstractText = item.abstract.length > 200
      ? item.abstract.substring(0, 200) + '...'
      : item.abstract;
    card.createDiv({
      cls: 'triage-card-abstract',
      text: abstractText
    });
  }

  // Action buttons
  const actions = card.createDiv({ cls: 'triage-card-actions' });

  const acceptBtn = actions.createEl('button', {
    cls: 'triage-btn triage-btn-accept',
    text: 'Accept'
  });
  acceptBtn.addEventListener('click', () => onAccept(item));

  const deferBtn = actions.createEl('button', {
    cls: 'triage-btn triage-btn-defer',
    text: 'Defer'
  });
  deferBtn.addEventListener('click', () => onDefer(item));

  const rejectBtn = actions.createEl('button', {
    cls: 'triage-btn triage-btn-reject',
    text: 'Reject'
  });
  rejectBtn.addEventListener('click', () => onReject(item));

  return card;
}
