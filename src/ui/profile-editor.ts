/**
 * ProfileEditor - Settings UI for viewing and editing user profile
 *
 * Provides interface for:
 * - Viewing profile overview and statistics
 * - Displaying top signals (tags, authors, keywords) with weights
 * - Manually adding/removing signals
 * - Adjusting signal weights
 * - Configuring recommendation preferences
 */

import { Setting } from 'obsidian';
import type { ProfileService } from '../profile/profile-service';

/** Weight adjustment increment/decrement value */
const WEIGHT_DELTA = 0.5;

/** Number of top signals to display per type */
const TOP_SIGNALS_LIMIT = 10;

/** ProfileEditor manages the profile editing UI */
export class ProfileEditor {
  private container: HTMLElement;
  private profileService: ProfileService;
  private onProfileChange: () => void;

  /**
   * Create a new ProfileEditor
   * @param container - HTML container element
   * @param profileService - Service for profile access
   * @param onProfileChange - Callback triggered after profile updates
   */
  constructor(
    container: HTMLElement,
    profileService: ProfileService,
    onProfileChange: () => void
  ) {
    this.container = container;
    this.profileService = profileService;
    this.onProfileChange = onProfileChange;

    this.render();
  }

  /**
   * Render the profile editor UI
   */
  private render(): void {
    this.container.empty();
    this.container.addClass('profile-editor');

    const profile = this.profileService.getProfile();
    if (!profile) {
      this.container.createEl('p', {
        text: 'No profile configured',
        cls: 'setting-item-description'
      });
      return;
    }

    // Section 1: Profile Overview
    this.renderOverview();

    // Section 2: Top Tags
    this.renderSignalSection('tag', 'Tags', profile.tags);

    // Section 3: Top Authors
    this.renderSignalSection('author', 'Authors', profile.authors);

    // Section 4: Top Keywords
    this.renderSignalSection('keyword', 'Keywords', profile.keywords);

    // Section 5: Preferences
    this.renderPreferences();
  }

  /**
   * Render profile overview section
   */
  private renderOverview(): void {
    const profile = this.profileService.getProfile();
    if (!profile) return;

    const section = this.container.createDiv({ cls: 'profile-section' });
    section.createEl('h3', { text: 'Profile Overview' });

    // Statistics
    const stats = section.createDiv({ cls: 'profile-stats' });
    stats.createEl('span', {
      text: `Based on ${profile.seedPaperIds.length} seed papers`
    });
    stats.createEl('span', {
      text: `${profile.tags.size} tags, ${profile.authors.size} authors, ${profile.keywords.size} keywords`
    });

    // Dates
    const createdDate = new Date(profile.createdAt).toLocaleDateString();
    const updatedDate = new Date(profile.updatedAt).toLocaleDateString();

    const dates = section.createDiv({ cls: 'profile-stats' });
    dates.createEl('span', { text: `Created: ${createdDate}` });
    dates.createEl('span', { text: `Last updated: ${updatedDate}` });
  }

  /**
   * Render a signal section (tags, authors, or keywords)
   */
  private renderSignalSection(
    type: 'tag' | 'author' | 'keyword',
    title: string,
    signalMap: Map<string, number>
  ): void {
    const section = this.container.createDiv({ cls: 'profile-section' });
    section.createEl('h3', { text: `Top ${title}` });

    // Get top signals sorted by weight
    const topSignals = this.profileService.getTopSignals(type, TOP_SIGNALS_LIMIT);

    if (topSignals.length === 0) {
      section.createEl('p', {
        text: `No ${title.toLowerCase()} in profile`,
        cls: 'setting-item-description'
      });
      return;
    }

    // Create table
    const table = section.createEl('table', { cls: 'profile-table' });

    // Table header
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    headerRow.createEl('th', { text: title === 'Authors' ? 'Author' : title.slice(0, -1) });
    headerRow.createEl('th', { text: 'Weight' });
    headerRow.createEl('th', { text: 'Actions' });

    // Table body
    const tbody = table.createEl('tbody');
    topSignals.forEach(signal => {
      this.renderSignalRow(tbody, signal.type, signal.value, signal.weight);
    });

    // Add signal button
    const addContainer = section.createDiv({ cls: 'profile-add-signal' });
    const input = addContainer.createEl('input', {
      type: 'text',
      placeholder: `Add ${type}...`
    });

    const addBtn = addContainer.createEl('button', { text: 'Add' });
    addBtn.addEventListener('click', () => {
      const value = input.value.trim();
      if (value) {
        this.profileService.addSignal({
          type,
          value,
          weight: 1.0,
          source: 'seed'
        });
        input.value = '';
        this.onProfileChange();
        this.render(); // Refresh UI
      }
    });

    // Note for keywords
    if (type === 'keyword') {
      section.createEl('p', {
        text: 'Keywords are automatically extracted from titles and abstracts',
        cls: 'setting-item-description'
      });
    }
  }

  /**
   * Render a single signal row in table
   */
  private renderSignalRow(
    tbody: HTMLElement,
    type: 'tag' | 'author' | 'keyword',
    value: string,
    weight: number
  ): void {
    const row = tbody.createEl('tr');

    // Signal value
    row.createEl('td', { text: value });

    // Weight display
    const weightCell = row.createEl('td');
    weightCell.createEl('span', {
      text: weight.toFixed(1),
      cls: 'weight-display'
    });

    // Actions
    const actionsCell = row.createEl('td', { cls: 'actions' });

    // Decrement button
    const decrementBtn = actionsCell.createEl('button', { text: '−' });
    decrementBtn.addEventListener('click', () => {
      this.profileService.adjustWeight(type, value, -WEIGHT_DELTA);
      this.onProfileChange();
      this.render();
    });

    // Increment button
    const incrementBtn = actionsCell.createEl('button', { text: '+' });
    incrementBtn.addEventListener('click', () => {
      this.profileService.adjustWeight(type, value, WEIGHT_DELTA);
      this.onProfileChange();
      this.render();
    });

    // Remove button
    const removeBtn = actionsCell.createEl('button', { text: 'Remove' });
    removeBtn.addEventListener('click', () => {
      this.profileService.removeSignal(type, value);
      this.onProfileChange();
      this.render();
    });
  }

  /**
   * Render preferences section
   */
  private renderPreferences(): void {
    const profile = this.profileService.getProfile();
    if (!profile) return;

    const section = this.container.createDiv({ cls: 'profile-section' });
    section.createEl('h3', { text: 'Recommendation Preferences' });

    // Relevance vs Diversity slider
    new Setting(section)
      .setName('Relevance vs Diversity')
      .setDesc('0 = Pure relevance, 1 = Balanced diversity')
      .addSlider(slider => slider
        .setLimits(0, 1, 0.1)
        .setValue(profile.relevanceVsDiversity)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.profileService.updateProfile({ relevanceVsDiversity: value });
          this.onProfileChange();
        }));

    // Recency boost toggle
    new Setting(section)
      .setName('Recency Boost')
      .setDesc('Prioritize papers published in the last 3 years')
      .addToggle(toggle => toggle
        .setValue(profile.recencyBoost)
        .onChange(async (value) => {
          this.profileService.updateProfile({ recencyBoost: value });
          this.onProfileChange();
        }));
  }
}
