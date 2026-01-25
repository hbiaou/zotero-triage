/**
 * TriageCard - Visual card component for displaying Zotero items
 *
 * Renders item metadata with action buttons for Accept/Reject/Defer.
 */

import type { ZoteroItem, RegistryState } from '../types';
import type { ValidationResult } from '../validation/types';

export interface TriageCardOptions {
  item: ZoteroItem;
  validationResult?: ValidationResult;
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
  const { item, validationResult, onAccept, onReject, onDefer } = options;

  const card = container.createDiv({ cls: 'zotbridge-triage-card' });
  card.dataset.itemId = String(item.itemID);

  // Header with item type badge
  const header = card.createDiv({ cls: 'triage-card-header' });
  header.createSpan({ cls: 'item-type-badge', text: item.itemType });

  // Validation badge if item has validation issues
  if (validationResult && !validationResult.valid) {
    const warningBadge = header.createSpan({
      cls: 'validation-warning-badge',
      text: `${validationResult.missingFields.length} missing`
    });
    warningBadge.title = validationResult.missingFields.join(', ');
  }

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

  // Validation errors section
  if (validationResult && !validationResult.valid) {
    const errorDiv = card.createDiv({ cls: 'triage-card-validation-errors' });
    errorDiv.createEl('strong', { text: 'Issues found:' });
    const list = errorDiv.createEl('ul');
    validationResult.errors.slice(0, 3).forEach(error => {
      list.createEl('li', { text: error });
    });

    // Link to fix in Zotero
    const fixLink = errorDiv.createEl('a', {
      cls: 'validation-fix-link',
      text: '→ Open in Zotero to fix'
    });
    fixLink.href = `zotero://select/items/0_${item.itemKey}`;
  }

  // Action buttons
  const actions = card.createDiv({ cls: 'triage-card-actions' });

  const acceptBtn = actions.createEl('button', {
    cls: validationResult && !validationResult.valid
      ? 'triage-btn triage-btn-accept-warning'
      : 'triage-btn triage-btn-accept',
    text: validationResult && !validationResult.valid ? 'Accept Anyway' : 'Accept'
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

/**
 * Update the status badge on a triage card
 *
 * @param card - The card element to update
 * @param state - The new registry state
 */
export function updateCardStatus(card: HTMLElement, state: RegistryState): void {
  const header = card.querySelector('.triage-card-header') as HTMLElement;
  if (!header) {
    console.log('ZotBridge BADGE ERROR: No header found');
    return;
  }

  // Remove any existing status badge
  const existingBadge = header.querySelector('.status-badge');
  if (existingBadge) {
    console.log('ZotBridge BADGE: Removing existing badge');
    existingBadge.remove();
  }

  // Only show badge for processed states
  if (state === 'accepted' || state === 'rejected' || state === 'deferred') {
    console.log('ZotBridge BADGE: Creating badge for state:', state);

    // Create badge using standard DOM API (Obsidian's createSpan might not work on querySelector result)
    const badge = document.createElement('span');
    badge.className = 'status-badge';

    // Set state-specific class and text
    if (state === 'accepted') {
      badge.classList.add('status-badge-accepted');
      badge.textContent = 'Accepted';
      console.log('ZotBridge BADGE: Accepted badge created, classes:', badge.className);
      console.log('ZotBridge BADGE: Accepted badge element:', badge);
      console.log('ZotBridge BADGE: Header element:', header);
    } else if (state === 'rejected') {
      badge.classList.add('status-badge-rejected');
      badge.textContent = 'Rejected';
      console.log('ZotBridge BADGE: Rejected badge created, classes:', badge.className);
    } else if (state === 'deferred') {
      badge.classList.add('status-badge-deferred');
      badge.textContent = 'Deferred';
      console.log('ZotBridge BADGE: Deferred badge created, classes:', badge.className);
    }

    console.log('ZotBridge BADGE: About to appendChild badge to header');
    header.appendChild(badge);
    console.log('ZotBridge BADGE: Badge appended successfully, header children:', header.children.length);
  } else {
    console.log('ZotBridge BADGE: Skipping badge for state:', state);
  }
}
