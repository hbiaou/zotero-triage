/**
 * ItemSearchModal - Fuzzy search modal for Zotero items
 *
 * Extends Obsidian's FuzzySuggestModal to provide searchable
 * item selection with title, author, and year display.
 */

import { App, FuzzySuggestModal, FuzzyMatch } from 'obsidian';
import type { ZoteroItem } from '../db/zotero-connector';

/**
 * Callback when an item is selected
 */
export type ItemSelectCallback = (item: ZoteroItem) => void;

/**
 * ItemSearchModal provides fuzzy search for Zotero items
 */
export class ItemSearchModal extends FuzzySuggestModal<ZoteroItem> {
  private items: ZoteroItem[];
  private onSelect: ItemSelectCallback;

  /**
   * Create a new ItemSearchModal
   *
   * @param app - Obsidian app instance
   * @param items - Array of Zotero items to search
   * @param onSelect - Callback when item is selected
   */
  constructor(app: App, items: ZoteroItem[], onSelect: ItemSelectCallback) {
    super(app);
    this.items = items;
    this.onSelect = onSelect;

    // Set placeholder text
    this.setPlaceholder('Search by title or author...');
  }

  /**
   * Get all items for the fuzzy matcher
   */
  getItems(): ZoteroItem[] {
    return this.items;
  }

  /**
   * Get searchable text for an item.
   * Combines title, authors, and year for fuzzy matching.
   *
   * @param item - Zotero item
   * @returns Searchable text string
   */
  getItemText(item: ZoteroItem): string {
    const authorStr = item.authors.slice(0, 2).join(', ');
    const year = item.year || 'n.d.';

    return `${item.title} - ${authorStr} (${year})`;
  }

  /**
   * Render a suggestion item in the dropdown.
   *
   * @param match - Fuzzy match result
   * @param el - HTML element to render into
   */
  renderSuggestion(match: FuzzyMatch<ZoteroItem>, el: HTMLElement): void {
    const item = match.item;

    const container = el.createDiv({ cls: 'zotero-triage-suggestion' });

    // Title
    container.createDiv({
      cls: 'suggestion-title',
      text: item.title || 'Untitled'
    });

    // Metadata line: authors, year, type
    const authorStr = item.authors.length > 0
      ? item.authors.slice(0, 2).join(', ')
      : 'Unknown author';
    const authorSuffix = item.authors.length > 2 ? ' et al.' : '';
    const year = item.year || 'n.d.';
    const type = item.itemType || 'item';

    container.createEl('small', {
      cls: 'suggestion-meta',
      text: `${authorStr}${authorSuffix} (${year}) - ${type}`
    });
  }

  /**
   * Handle item selection.
   *
   * @param item - Selected Zotero item
   * @param evt - Mouse or keyboard event
   */
  onChooseItem(item: ZoteroItem, evt: MouseEvent | KeyboardEvent): void {
    this.onSelect(item);
  }
}
