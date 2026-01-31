/**
 * Evidence Extraction Service
 *
 * Implements evidence hierarchy for AI enrichment:
 * 1. PDF fulltext (primary) - Extracted from Zotero's .zotero-ft-cache
 * 2. Zotero notes (secondary) - User annotations and highlights
 * 3. Abstract (tertiary) - Paper abstract from metadata
 * 4. Metadata only (insufficient) - No content available
 *
 * Determines what evidence is available for each item and returns
 * appropriate content for AI analysis.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ZoteroConnector } from '../db/zotero-connector';
import type { EvidenceLevel, EvidenceExtraction } from '../ai/types';
import type { ZoteroItem } from '../types';

/**
 * Minimum characters required for valid evidence
 * Content shorter than this is considered insufficient
 */
const MIN_EVIDENCE_LENGTH = 100;

/**
 * Warn if cache is older than this many days
 * Stale cache may indicate outdated PDF extraction
 */
const STALE_CACHE_DAYS = 30;

/**
 * Evidence extraction service
 *
 * Enforces evidence hierarchy to determine best available
 * content source for AI enrichment.
 */
export class EvidenceExtractor {
  private connector: ZoteroConnector;
  private zoteroDataPath: string;

  /**
   * Create evidence extractor
   * @param connector - ZoteroConnector instance for database queries
   * @param zoteroDataPath - Path to Zotero data directory
   */
  constructor(connector: ZoteroConnector, zoteroDataPath: string) {
    this.connector = connector;
    this.zoteroDataPath = zoteroDataPath;
  }

  /**
   * Extract PDF fulltext from Zotero cache
   *
   * Zotero indexes PDFs and stores plaintext in .zotero-ft-cache files.
   * This is the highest quality evidence source.
   *
   * @param itemKey - Zotero item key (8-character identifier)
   * @returns PDF fulltext or empty string if unavailable
   */
  private async extractPDFFulltext(itemKey: string): Promise<string> {
    try {
      // Locate storage directory for this item
      const storageDir = this.locateStorageDir(itemKey);
      if (!storageDir) {
        return '';
      }

      // Check for Zotero's fulltext cache file
      const cachePath = path.join(storageDir, '.zotero-ft-cache');
      if (!fs.existsSync(cachePath)) {
        return '';
      }

      // Read cached fulltext
      const content = await fs.promises.readFile(cachePath, 'utf-8');
      return content;
    } catch (err) {
      // Log error but don't throw - graceful degradation to next evidence level
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Failed to extract PDF fulltext for ${itemKey}: ${errorMessage}`);
      return '';
    }
  }

  /**
   * Locate Zotero storage directory for an item
   *
   * @param itemKey - Zotero item key
   * @returns Storage directory path or null if doesn't exist
   */
  private locateStorageDir(itemKey: string): string | null {
    const storagePath = path.join(this.zoteroDataPath, 'storage', itemKey);

    if (fs.existsSync(storagePath) && fs.statSync(storagePath).isDirectory()) {
      return storagePath;
    }

    return null;
  }

  /**
   * Extract notes from Zotero database
   *
   * Queries child note items and combines their content.
   * Notes are HTML formatted in Zotero - we strip tags for plaintext.
   *
   * @param itemID - Zotero database item ID
   * @returns Combined notes plaintext or empty string
   */
  private async extractNotes(itemID: number): Promise<string> {
    try {
      // Query for child notes
      const query = `
        SELECT
          COALESCE(itemNotes.note, '') as note
        FROM items
        LEFT JOIN itemNotes ON items.itemID = itemNotes.itemID
        WHERE items.parentItemID = ?
          AND items.itemTypeID = (
            SELECT itemTypeID FROM itemTypes WHERE typeName = 'note'
          )
      `;

      const result = await this.connector.query(query, [itemID]);

      if (!result || result.length === 0) {
        return '';
      }

      // Combine all notes and strip HTML
      const notes = result
        .map(row => this.stripHtml(row.note as string))
        .filter(note => note.length > 0)
        .join('\n\n');

      return notes;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Failed to extract notes for item ${itemID}: ${errorMessage}`);
      return '';
    }
  }

  /**
   * Extract abstract from Zotero database
   *
   * Queries the itemData table for the abstractNote field.
   *
   * @param itemID - Zotero database item ID
   * @returns Abstract text or empty string
   */
  private async extractAbstract(itemID: number): Promise<string> {
    try {
      // Query for abstract field
      const query = `
        SELECT itemDataValues.value
        FROM itemData
        JOIN itemDataValues ON itemData.valueID = itemDataValues.valueID
        JOIN fields ON itemData.fieldID = fields.fieldID
        WHERE itemData.itemID = ?
          AND fields.fieldName = 'abstractNote'
      `;

      const result = await this.connector.query(query, [itemID]);

      if (!result || result.length === 0) {
        return '';
      }

      return (result[0].value as string) || '';
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Failed to extract abstract for item ${itemID}: ${errorMessage}`);
      return '';
    }
  }

  /**
   * Strip HTML tags and decode entities
   *
   * @param content - HTML content
   * @returns Plaintext content
   */
  private stripHtml(content: string): string {
    if (!content) {
      return '';
    }

    // Remove HTML tags
    let text = content.replace(/<[^>]*>/g, '');

    // Decode common HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Check if content is valid evidence
   *
   * @param content - Content to validate
   * @returns True if content meets minimum length requirement
   */
  private isValidEvidence(content: string): boolean {
    return content && content.trim().length >= MIN_EVIDENCE_LENGTH;
  }

  /**
   * Extract evidence for an item following hierarchy
   *
   * Evidence hierarchy (EXTRACT-04):
   * 1. PDF fulltext (primary) - Best quality, high token cost
   * 2. Zotero notes (secondary) - Good quality, low token cost
   * 3. Abstract (tertiary) - Limited quality, very low cost
   * 4. Metadata only (insufficient) - No content for enrichment
   *
   * @param item - Zotero item to extract evidence for
   * @returns Evidence extraction result with level and content
   */
  async extract(item: ZoteroItem): Promise<EvidenceExtraction> {
    // 1. Try PDF fulltext (primary)
    const pdfContent = await this.extractPDFFulltext(item.itemKey);
    if (this.isValidEvidence(pdfContent)) {
      return {
        level: 'FullText',
        content: pdfContent,
        sources: ['pdf_fulltext'],
        tokenEstimate: this.estimateTokens(pdfContent)
      };
    }

    // 2. Try Zotero notes (secondary)
    const notesContent = await this.extractNotes(item.itemID);
    if (this.isValidEvidence(notesContent)) {
      return {
        level: 'Notes',
        content: notesContent,
        sources: ['zotero_notes'],
        tokenEstimate: this.estimateTokens(notesContent)
      };
    }

    // 3. Try abstract (tertiary)
    const abstractContent = await this.extractAbstract(item.itemID);
    if (this.isValidEvidence(abstractContent)) {
      return {
        level: 'Abstract',
        content: abstractContent,
        sources: ['abstract'],
        tokenEstimate: this.estimateTokens(abstractContent)
      };
    }

    // 4. Metadata only (insufficient for enrichment)
    return {
      level: 'MetadataOnly',
      content: '',
      sources: ['metadata'],
      tokenEstimate: 0
    };
  }

  /**
   * Estimate token count for content
   *
   * Uses rough approximation: words / 0.75 (average tokens per word)
   * This is sufficient for cost estimation - exact tokenization happens at API level.
   *
   * @param content - Content to estimate tokens for
   * @returns Estimated token count
   */
  private estimateTokens(content: string): number {
    const words = content.trim().split(/\s+/).length;
    return Math.ceil(words / 0.75);
  }

  /**
   * Check if evidence is sufficient for enrichment
   *
   * Per CONTEXT.md decision: Proceed if FullText OR Notes available.
   * Abstract-only items are queued as metadata-only per phase context.
   *
   * @param evidence - Evidence extraction result
   * @returns True if evidence is sufficient for AI enrichment
   */
  canEnrich(evidence: EvidenceExtraction): boolean {
    return evidence.level === 'FullText' || evidence.level === 'Notes';
  }

  /**
   * Get human-readable description of evidence level
   *
   * Used for YAML frontmatter and user feedback.
   *
   * @param level - Evidence level
   * @returns Human-readable description
   */
  getEvidenceDescription(level: EvidenceLevel): string {
    switch (level) {
      case 'FullText':
        return 'PDF fulltext extracted';
      case 'Notes':
        return 'Zotero notes and annotations';
      case 'Abstract':
        return 'Abstract only (limited evidence)';
      case 'MetadataOnly':
        return 'No content available (queued)';
    }
  }
}
