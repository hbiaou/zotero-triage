/**
 * Re-classification Command
 *
 * Allows users to re-classify items post-enrichment and trigger re-enrichment
 * with a new domain template. Used when initial classification was incorrect
 * or user wants to try a different domain-specific template.
 *
 * Workflow:
 * 1. Load current classification from literature note frontmatter
 * 2. Re-classify item using DomainClassifier
 * 3. Show ClassificationModal for user override
 * 4. Update note frontmatter with new domain
 * 5. Queue for re-enrichment with new template (Phase 16 integration point)
 */

import { App, Notice } from 'obsidian';
import type ZoteroTriagePlugin from '../main';
import type { ZoteroItem } from '../types';
import type { DomainClassifier } from '../classification/domain-classifier';
import type { Domain } from '../classification/types';
import { ClassificationModal } from '../ui/classification-modal';
import { EvidenceExtractor } from '../services/evidence-extractor';

/**
 * Command for re-classifying items after initial enrichment
 *
 * Usage:
 * ```typescript
 * const command = new ReclassifyCommand(app, plugin, domainClassifier, evidenceExtractor);
 * await command.execute(item);
 * ```
 */
export class ReclassifyCommand {
  private app: App;
  private plugin: ZoteroTriagePlugin;
  private domainClassifier: DomainClassifier;
  private evidenceExtractor: EvidenceExtractor;

  /**
   * Create re-classification command
   *
   * @param app - Obsidian app instance
   * @param plugin - Plugin instance
   * @param domainClassifier - Domain classifier for re-classification
   * @param evidenceExtractor - Evidence extractor for content analysis
   */
  constructor(
    app: App,
    plugin: ZoteroTriagePlugin,
    domainClassifier: DomainClassifier,
    evidenceExtractor: EvidenceExtractor
  ) {
    this.app = app;
    this.plugin = plugin;
    this.domainClassifier = domainClassifier;
    this.evidenceExtractor = evidenceExtractor;
  }

  /**
   * Execute re-classification for an item
   *
   * @param item - Zotero item to re-classify
   */
  async execute(item: ZoteroItem): Promise<void> {
    try {
      // 1. Load current classification from note frontmatter
      const noteFile = await this.findNoteFile(item);
      if (!noteFile) {
        new Notice('Cannot re-classify - note not found');
        return;
      }

      const currentDomain = await this.getCurrentDomain(noteFile);

      // 2. Re-classify item using DomainClassifier
      const evidence = await this.evidenceExtractor.extract(item);
      const classificationResult = await this.domainClassifier.classify(item, evidence);

      // 3. Show ClassificationModal with current domain as context
      new ClassificationModal(
        this.app,
        item,
        classificationResult,
        async (selectedDomain: Domain) => {
          // 4. On confirm: Update note frontmatter with new domain
          await this.updateNoteDomain(noteFile, selectedDomain);

          // 5. Queue for re-enrichment with new template (Phase 16 integration point)
          // TODO: Integrate with enrichment queue when Phase 16 is implemented
          // For now, just update frontmatter and notify user

          new Notice(
            `Item re-classified as ${selectedDomain}. Re-enrichment will be available in Phase 16.`
          );
        },
        () => {
          // On cancel: No changes
          new Notice('Re-classification cancelled');
        }
      ).open();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[ReclassifyCommand] Re-classification failed:', error);
      new Notice(`Re-classification failed: ${message}`);
    }
  }

  /**
   * Find literature note file for a Zotero item
   *
   * @param item - Zotero item
   * @returns Note file or null if not found
   */
  private async findNoteFile(item: ZoteroItem): Promise<any> {
    // Use the note generator's path logic to find the file
    const filePath = this.plugin.noteGenerator.getFilePath(item);
    const file = this.app.vault.getFileByPath(filePath);

    return file; // Returns TFile or null
  }

  /**
   * Get current domain from note frontmatter
   *
   * @param file - Note file
   * @returns Current domain or null if not set
   */
  private async getCurrentDomain(file: any): Promise<Domain | null> {
    try {
      const content = await this.app.vault.read(file);

      // Parse YAML frontmatter
      const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
      const match = content.match(frontmatterRegex);

      if (!match) {
        return null;
      }

      const frontmatter = match[1];
      const domainMatch = frontmatter.match(/knowledge_domain:\s*(\w+)/);

      if (!domainMatch) {
        return null;
      }

      const domain = domainMatch[1] as Domain;
      return domain;
    } catch (error) {
      console.error('[ReclassifyCommand] Failed to parse frontmatter:', error);
      return null;
    }
  }

  /**
   * Update note frontmatter with new domain classification
   *
   * @param file - Note file
   * @param newDomain - New domain classification
   */
  private async updateNoteDomain(file: any, newDomain: Domain): Promise<void> {
    try {
      const content = await this.app.vault.read(file);

      // Parse and update YAML frontmatter
      const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
      const match = content.match(frontmatterRegex);

      if (!match) {
        throw new Error('No frontmatter found in note');
      }

      const frontmatter = match[1];
      let updatedFrontmatter = frontmatter;

      // Check if knowledge_domain exists
      if (frontmatter.includes('knowledge_domain:')) {
        // Replace existing domain
        updatedFrontmatter = frontmatter.replace(
          /knowledge_domain:\s*\w+/,
          `knowledge_domain: ${newDomain}`
        );
      } else {
        // Add knowledge_domain field
        updatedFrontmatter = frontmatter + `\nknowledge_domain: ${newDomain}`;
      }

      // Update content
      const updatedContent = content.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---`);

      await this.app.vault.modify(file, updatedContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update note frontmatter: ${message}`);
    }
  }
}
