/**
 * Evidence Extraction Service
 *
 * Implements evidence hierarchy for AI enrichment:
 * 1. PDF fulltext (primary) - Extracted from Zotero's .zotero-ft-cache
 * 2. Video transcripts (primary) - Extracted from YouTube URLs when available
 * 3. Zotero notes (secondary) - User annotations and highlights
 * 4. Abstract (tertiary) - Paper abstract from metadata
 * 5. Metadata only (insufficient) - No content available
 *
 * Determines what evidence is available for each item and returns
 * appropriate content for AI analysis.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ZoteroConnector } from '../db/zotero-connector';
import type { EvidenceLevel, EvidenceExtraction } from '../ai/types';
import type { ZoteroItem } from '../types';
import { TranscriptExtractor } from '../extraction/transcript-extractor';
import { TranscriptExtractionError } from '../extraction/types';

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
  private customStoragePath: string | null = null;
  private transcriptExtractor: TranscriptExtractor;

  /**
   * Create evidence extractor
   * @param connector - ZoteroConnector instance for database queries
   * @param zoteroDataPath - Path to Zotero data directory (derived from database path)
   * @param transcriptExtractor - TranscriptExtractor instance for video transcript extraction
   */
  constructor(
    connector: ZoteroConnector,
    zoteroDataPath: string,
    transcriptExtractor: TranscriptExtractor
  ) {
    this.connector = connector;
    this.zoteroDataPath = zoteroDataPath;
    this.transcriptExtractor = transcriptExtractor;

    // Initialize custom storage path asynchronously
    this.initializeStoragePath();
  }

  /**
   * Initialize storage path by querying Zotero database for custom location
   * This runs asynchronously after construction
   */
  private async initializeStoragePath(): Promise<void> {
    try {
      if (this.connector.isConnected) {
        this.customStoragePath = await this.connector.getCustomStoragePath();
        if (this.customStoragePath) {
          console.log('[EvidenceExtractor] Using custom storage location:', this.customStoragePath);
        } else {
          console.log('[EvidenceExtractor] Using default storage location:', path.join(this.zoteroDataPath, 'storage'));
        }
      } else {
        console.log('[EvidenceExtractor] Database not connected yet, will use default storage path');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[EvidenceExtractor] Failed to query custom storage path:', errorMessage);
      // Continue with default path
    }
  }

  /**
   * Refresh storage path configuration
   * Call this after database connection is established to ensure custom storage path is loaded
   */
  async refreshStoragePath(): Promise<void> {
    await this.initializeStoragePath();
  }

  /**
   * Get the storage base directory (custom or default)
   * @returns Base directory for Zotero storage
   */
  private getStorageBasePath(): string {
    // Use custom path if configured, otherwise use default
    return this.customStoragePath || path.join(this.zoteroDataPath, 'storage');
  }

  /**
   * Extract PDF fulltext from Zotero cache
   *
   * Zotero indexes PDFs and stores plaintext in .zotero-ft-cache files.
   * This is the highest quality evidence source.
   *
   * IMPORTANT: The cache file is stored in the ATTACHMENT's storage directory,
   * not the parent item's directory. We need to query for attachment keys.
   *
   * @param itemID - Zotero database item ID (used to find attachments)
   * @returns PDF fulltext or empty string if unavailable
   */
  private async extractPDFFulltext(itemID: number): Promise<string> {
    // Skip if Zotero data path not configured (null, undefined, or empty string)
    if (!this.zoteroDataPath || this.zoteroDataPath.trim() === '') {
      console.log(`[EvidenceExtractor] PDF extraction skipped: No Zotero data path configured (path: ${this.zoteroDataPath})`);
      return '';
    }

    try {
      // Query for PDF attachments and their keys
      const query = `
        SELECT
          i.key AS attachmentKey,
          ia.itemID,
          ia.linkMode
        FROM itemAttachments ia
        JOIN items i ON ia.itemID = i.itemID
        WHERE ia.parentItemID = ?
          AND ia.contentType = 'application/pdf'
          AND ia.linkMode IN (0, 1)
      `;

      const result = await this.connector.query(query, [itemID]);

      console.log(`[EvidenceExtractor] Found ${result?.length || 0} PDF attachments for itemID ${itemID}`);

      if (!result || result.length === 0) {
        console.log(`[EvidenceExtractor] No PDF attachments found for itemID ${itemID}`);
        return '';
      }

      // Try each attachment until we find one with cached fulltext
      for (const row of result) {
        const attachmentKey = row.attachmentKey as string;
        const linkMode = row.linkMode as number;

        console.log(`[EvidenceExtractor] Checking attachment ${attachmentKey} (linkMode: ${linkMode})`);

        // Locate storage directory for this attachment
        const storageDir = this.locateStorageDir(attachmentKey);
        if (!storageDir) {
          console.log(`[EvidenceExtractor] Storage directory not found for attachment ${attachmentKey}`);
          continue;
        }

        console.log(`[EvidenceExtractor] Storage directory found: ${storageDir}`);

        // Check for Zotero's fulltext cache file
        const cachePath = path.join(storageDir, '.zotero-ft-cache');
        console.log(`[EvidenceExtractor] Checking cache path: ${cachePath}`);

        if (!fs.existsSync(cachePath)) {
          console.log(`[EvidenceExtractor] Cache file does not exist at: ${cachePath}`);
          continue;
        }

        console.log(`[EvidenceExtractor] Cache file exists, reading content...`);

        // Read cached fulltext
        const content = await fs.promises.readFile(cachePath, 'utf-8');
        const contentLength = content.length;

        console.log(`[EvidenceExtractor] Successfully read ${contentLength} characters from cache`);

        if (contentLength > 0) {
          return content;
        } else {
          console.log(`[EvidenceExtractor] Cache file is empty`);
        }
      }

      console.log(`[EvidenceExtractor] No valid fulltext cache found for any attachment`);
      return '';
    } catch (err) {
      // Log error but don't throw - graceful degradation to next evidence level
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[EvidenceExtractor] Failed to extract PDF fulltext for itemID ${itemID}: ${errorMessage}`);
      return '';
    }
  }

  /**
   * Locate Zotero storage directory for an item
   *
   * Supports both default storage (dataDir/storage/KEY) and custom storage locations.
   * Custom storage paths can be absolute or relative.
   *
   * @param itemKey - Zotero item key (8-character identifier)
   * @returns Storage directory path or null if doesn't exist
   */
  private locateStorageDir(itemKey: string): string | null {
    // Get base storage path (custom or default)
    const storageBasePath = this.getStorageBasePath();
    const storagePath = path.join(storageBasePath, itemKey);

    console.log(`[EvidenceExtractor] Looking for storage directory:`, {
      itemKey,
      storageBasePath,
      fullPath: storagePath
    });

    if (fs.existsSync(storagePath) && fs.statSync(storagePath).isDirectory()) {
      console.log(`[EvidenceExtractor] Storage directory found: ${storagePath}`);
      return storagePath;
    }

    console.log(`[EvidenceExtractor] Storage directory not found: ${storagePath}`);
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
        WHERE itemNotes.parentItemID = ?
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
    return !!(content && content.trim().length >= MIN_EVIDENCE_LENGTH);
  }

  /**
   * Extract evidence for an item following hierarchy
   *
   * Evidence hierarchy (EXTRACT-04 updated for Phase 15):
   * 1. PDF fulltext (primary) - Best quality, high token cost
   * 2. Video transcript (primary) - Equivalent to fulltext, medium token cost
   * 3. Zotero notes (secondary) - Good quality, low token cost
   * 4. Abstract (tertiary) - Limited quality, very low cost
   * 5. Metadata only (insufficient) - No content for enrichment
   *
   * @param item - Zotero item to extract evidence for
   * @returns Evidence extraction result with level and content
   */
  async extract(item: ZoteroItem): Promise<EvidenceExtraction> {
    // 1. Try PDF fulltext (primary)
    console.log(`[EvidenceExtractor] Extracting evidence for item ${item.itemKey} (itemID: ${item.itemID})`);
    const pdfContent = await this.extractPDFFulltext(item.itemID);
    if (this.isValidEvidence(pdfContent)) {
      console.log(`[EvidenceExtractor] Valid PDF fulltext found (${pdfContent.length} chars)`);
      return {
        level: 'FullText',
        content: pdfContent,
        sources: ['pdf_fulltext'],
        tokenEstimate: this.estimateTokens(pdfContent)
      };
    }

    // 2. Try video transcript (primary - equivalent quality to fulltext per Phase 15 research)
    if (item.url) {
      try {
        const transcript = await this.transcriptExtractor.extractTranscript(item.url);
        if (this.isValidEvidence(transcript.transcript)) {
          return {
            level: 'FullText', // Transcript quality equivalent to FullText per research
            content: transcript.transcript,
            sources: [`video_transcript_${transcript.platform}`],
            tokenEstimate: this.estimateTokens(transcript.transcript)
          };
        }
      } catch (error) {
        // Transcript extraction failed; log and fall through to next level
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`[EvidenceExtractor] Transcript extraction failed for ${item.itemKey}: ${errorMessage}`);
        // Don't throw - graceful degradation to notes/abstract
      }
    }

    // 3. Try Zotero notes (secondary)
    const notesContent = await this.extractNotes(item.itemID);
    if (this.isValidEvidence(notesContent)) {
      return {
        level: 'Notes',
        content: notesContent,
        sources: ['zotero_notes'],
        tokenEstimate: this.estimateTokens(notesContent)
      };
    }

    // 4. Try abstract (tertiary)
    const abstractContent = await this.extractAbstract(item.itemID);
    if (this.isValidEvidence(abstractContent)) {
      return {
        level: 'Abstract',
        content: abstractContent,
        sources: ['abstract'],
        tokenEstimate: this.estimateTokens(abstractContent)
      };
    }

    // 5. Metadata only (insufficient for enrichment)
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
   * Updated to account for transcript sources in Phase 15.
   *
   * @param level - Evidence level
   * @param sources - Evidence sources (to distinguish PDF vs transcript for FullText)
   * @returns Human-readable description
   */
  getEvidenceDescription(level: EvidenceLevel, sources?: string[]): string {
    switch (level) {
      case 'FullText':
        // Check if source is transcript vs PDF
        if (sources && sources.some(s => s.startsWith('video_transcript_'))) {
          return 'Video transcript extracted';
        }
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
