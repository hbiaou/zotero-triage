/**
 * SeedPaperPicker - Component for browsing and selecting seed papers
 *
 * Provides UI for selecting 5-15 papers to establish initial research profile.
 * Features year/type/tag filters, scrollable list, and selection tracking.
 */

import type { ZoteroConnector } from '../db/zotero-connector';
import type { ZoteroItem } from '../types';

/**
 * Selection change callback
 */
export type SelectionChangeCallback = (selectedIds: string[]) => void;

/**
 * SeedPaperPicker component for selecting seed papers
 */
export class SeedPaperPicker {
  private container: HTMLElement;
  private connector: ZoteroConnector;
  private onSelectionChange: SelectionChangeCallback;

  private allItems: ZoteroItem[] = [];
  private filteredItems: ZoteroItem[] = [];
  private selectedIds: Set<string> = new Set();

  // Filter state
  private yearFrom: string = '';
  private yearTo: string = '';
  private itemType: string = 'all';
  private tag: string = 'all';

  // Constants
  private readonly MIN_SELECTION = 5;
  private readonly MAX_SELECTION = 15;

  /**
   * Create a new SeedPaperPicker
   * @param container - HTML element to render into
   * @param connector - ZoteroConnector with loaded items
   * @param onSelectionChange - Callback when selection changes
   */
  constructor(
    container: HTMLElement,
    connector: ZoteroConnector,
    onSelectionChange: SelectionChangeCallback
  ) {
    this.container = container;
    this.connector = connector;
    this.onSelectionChange = onSelectionChange;

    this.initialize();
  }

  /**
   * Initialize the component
   */
  private initialize(): void {
    // Get all items from connector
    this.allItems = this.connector.getCachedItems();
    this.filteredItems = [...this.allItems];

    // Render UI
    this.render();
  }

  /**
   * Render the component
   */
  private render(): void {
    this.container.empty();
    this.container.addClass('seed-picker');

    // Render filters
    this.renderFilters();

    // Render paper list
    this.renderPaperList();

    // Render selection status
    this.renderStatus();
  }

  /**
   * Render filter controls
   */
  private renderFilters(): void {
    const filtersContainer = this.container.createDiv({ cls: 'seed-picker-filters' });

    // Year range filters
    const years = this.getAvailableYears();

    // From year
    const fromSelect = filtersContainer.createEl('select');
    fromSelect.createEl('option', { text: 'Year from', value: '' });
    years.forEach(year => {
      fromSelect.createEl('option', { text: year, value: year });
    });
    fromSelect.value = this.yearFrom;
    fromSelect.addEventListener('change', () => {
      this.yearFrom = fromSelect.value;
      this.applyFilters();
    });

    // To year
    const toSelect = filtersContainer.createEl('select');
    toSelect.createEl('option', { text: 'Year to', value: '' });
    years.forEach(year => {
      toSelect.createEl('option', { text: year, value: year });
    });
    toSelect.value = this.yearTo;
    toSelect.addEventListener('change', () => {
      this.yearTo = toSelect.value;
      this.applyFilters();
    });

    // Item type filter
    const typeSelect = filtersContainer.createEl('select');
    typeSelect.createEl('option', { text: 'All Types', value: 'all' });
    typeSelect.createEl('option', { text: 'Journal Article', value: 'journalArticle' });
    typeSelect.createEl('option', { text: 'Book', value: 'book' });
    typeSelect.createEl('option', { text: 'Conference Paper', value: 'conferencePaper' });
    typeSelect.value = this.itemType;
    typeSelect.addEventListener('change', () => {
      this.itemType = typeSelect.value;
      this.applyFilters();
    });

    // Tag filter
    const tags = this.getAvailableTags();
    const tagSelect = filtersContainer.createEl('select');
    tagSelect.createEl('option', { text: 'All Tags', value: 'all' });
    tags.forEach(tag => {
      tagSelect.createEl('option', { text: tag, value: tag });
    });
    tagSelect.value = this.tag;
    tagSelect.addEventListener('change', () => {
      this.tag = tagSelect.value;
      this.applyFilters();
    });
  }

  /**
   * Get available years from items
   */
  private getAvailableYears(): string[] {
    const years = new Set<string>();
    for (const item of this.allItems) {
      if (item.year) {
        years.add(item.year);
      }
    }
    return Array.from(years).sort().reverse();
  }

  /**
   * Get available tags from items
   */
  private getAvailableTags(): string[] {
    const tags = new Set<string>();
    for (const item of this.allItems) {
      if (item.tags) {
        for (const tag of item.tags) {
          tags.add(tag);
        }
      }
    }
    return Array.from(tags).sort();
  }

  /**
   * Apply filters to item list
   */
  private applyFilters(): void {
    this.filteredItems = this.allItems.filter(item => {
      // Year range filter
      if (this.yearFrom && item.year) {
        if (item.year < this.yearFrom) return false;
      }
      if (this.yearTo && item.year) {
        if (item.year > this.yearTo) return false;
      }

      // Item type filter
      if (this.itemType !== 'all') {
        if (item.itemType !== this.itemType) return false;
      }

      // Tag filter
      if (this.tag !== 'all') {
        if (!item.tags || !item.tags.includes(this.tag)) return false;
      }

      return true;
    });

    // Re-render paper list
    this.render();
  }

  /**
   * Render paper list
   */
  private renderPaperList(): void {
    const listContainer = this.container.createDiv({ cls: 'seed-picker-list' });

    if (this.filteredItems.length === 0) {
      listContainer.createDiv({
        cls: 'setting-item-description',
        text: 'No papers found with current filters'
      });
      return;
    }

    for (const item of this.filteredItems) {
      const itemId = String(item.itemID);
      const isSelected = this.selectedIds.has(itemId);
      const isMaxReached = this.selectedIds.size >= this.MAX_SELECTION && !isSelected;

      const paperDiv = listContainer.createDiv({ cls: 'seed-paper-item' });
      if (isSelected) {
        paperDiv.addClass('selected');
      }

      // Checkbox
      const checkbox = paperDiv.createEl('input', {
        type: 'checkbox'
      });
      checkbox.checked = isSelected;
      checkbox.disabled = isMaxReached;

      // Title and year
      const titleDiv = paperDiv.createDiv({ cls: 'seed-paper-title' });
      const displayTitle = `${isSelected ? '☑' : '☐'} ${item.title} (${item.year || 'n/a'})`;
      titleDiv.setText(displayTitle);

      // Authors
      const authorsDiv = paperDiv.createDiv({ cls: 'seed-paper-meta' });
      const authorsText = item.authors.length > 0
        ? item.authors.slice(0, 3).join(', ') + (item.authors.length > 3 ? ', ...' : '')
        : 'Unknown authors';
      authorsDiv.setText(authorsText);

      // Click handler (toggle selection)
      paperDiv.addEventListener('click', () => {
        if (isMaxReached) {
          return;
        }
        this.toggleSelection(itemId);
      });
    }
  }

  /**
   * Toggle selection of a paper
   */
  private toggleSelection(itemId: string): void {
    if (this.selectedIds.has(itemId)) {
      this.selectedIds.delete(itemId);
    } else {
      if (this.selectedIds.size >= this.MAX_SELECTION) {
        return; // Max reached
      }
      this.selectedIds.add(itemId);
    }

    // Notify callback
    this.onSelectionChange(Array.from(this.selectedIds));

    // Re-render to update UI
    this.render();
  }

  /**
   * Render selection status
   */
  private renderStatus(): void {
    const statusDiv = this.container.createDiv({ cls: 'seed-picker-status' });
    const count = this.selectedIds.size;
    const statusText = `${count} papers selected (min: ${this.MIN_SELECTION}, max: ${this.MAX_SELECTION})`;
    statusDiv.setText(statusText);
  }

  /**
   * Get selected paper IDs
   */
  getSelectedIds(): string[] {
    return Array.from(this.selectedIds);
  }
}
