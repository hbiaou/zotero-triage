import * as fs from 'fs';
import * as path from 'path';
import type { ZoteroConnector } from '../db/zotero-connector';
import type { EvidenceLevel, EvidenceExtraction } from '../ai/types';
import type { ZoteroItem } from '../types';
import { normalizeItemKey } from '../utils/normalization';
import { TranscriptExtractor } from '../extraction/transcript-extractor';
import { TranscriptExtractionError } from '../extraction/types';
import { App } from 'obsidian';
import { TranscriptInputModal } from '../ui/transcript-input-modal';
import type { RegistryService } from '../registry/registry-service';

const TRANSCRIPT_SKIPPED = '__SKIPPED__';
const MIN_EVIDENCE_LENGTH = 100;
const STALE_CACHE_DAYS = 30;

export class EvidenceExtractor {
  private connector: ZoteroConnector;
  private zoteroDataPath: string;
  private customStoragePath: string | null = null;
  private transcriptExtractor: TranscriptExtractor;
  private registry: RegistryService;
  private app: App;

  // FIX: Static cache to persist manual transcripts across service re-instantiations during retries
  private static sessionTranscriptCache = new Map<number, string>();

  constructor(
    connector: ZoteroConnector,
    zoteroDataPath: string,
    transcriptExtractor: TranscriptExtractor,
    registry: RegistryService,
    app: App
  ) {
    this.connector = connector;
    this.zoteroDataPath = zoteroDataPath;
    this.transcriptExtractor = transcriptExtractor;
    this.registry = registry;
    this.app = app;
    this.initializeStoragePath();
  }

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
    }
  }

  async refreshStoragePath(): Promise<void> {
    await this.initializeStoragePath();
  }

  private getStorageBasePath(): string {
    return this.customStoragePath || path.join(this.zoteroDataPath, 'storage');
  }

  updateZoteroDataPath(path: string): void {
    const oldPath = this.zoteroDataPath;
    this.zoteroDataPath = path;
    console.log(`[EvidenceExtractor] Updated Zotero data path from '${oldPath}' to '${path}'`);
    this.refreshStoragePath().catch(err => {
      console.error('[EvidenceExtractor] Failed to refresh storage path after update:', err);
    });
  }

  private async extractPDFFulltext(itemID: number): Promise<string> {
    if (!this.zoteroDataPath || this.zoteroDataPath.trim() === '') {
      console.log(`[EvidenceExtractor] PDF extraction skipped: No Zotero data path configured (path: ${this.zoteroDataPath})`);
      return '';
    }

    try {
      const query = `
        SELECT
          i.key AS attachmentKey,
          ia.itemID,
          ia.linkMode
        FROM itemAttachments ia
        JOIN items i ON ia.itemID = i.itemID
        WHERE ia.parentItemID = ?
          AND ia.contentType = 'application/pdf'
          AND ia.linkMode IN (0, 1, 2)
      `;

      const result = await this.connector.queryObj(query, [itemID]);
      console.log(`[EvidenceExtractor] Found ${result?.length || 0} PDF attachments for itemID ${itemID}`);

      if (!result || result.length === 0) {
        console.log(`[EvidenceExtractor] No PDF attachments found for itemID ${itemID}`);
        return '';
      }

      for (const row of result) {
        const attachmentKey = row.attachmentKey as string;
        const storageDir = this.locateStorageDir(attachmentKey);
        if (!storageDir) continue;

        const cachePath = path.join(storageDir, '.zotero-ft-cache');
        if (!fs.existsSync(cachePath)) continue;

        const content = await fs.promises.readFile(cachePath, 'utf-8');
        if (content.length > 0) return content;
      }

      return '';
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[EvidenceExtractor] Failed to extract PDF fulltext for itemID ${itemID}: ${errorMessage}`);
      return '';
    }
  }

  private locateStorageDir(itemKey: string): string | null {
    const storageBasePath = this.getStorageBasePath();
    const storagePath = path.join(storageBasePath, itemKey);
    if (fs.existsSync(storagePath) && fs.statSync(storagePath).isDirectory()) {
      return storagePath;
    }
    return null;
  }

  private async extractNotes(itemID: number): Promise<string> {
    try {
      const query = `
        SELECT COALESCE(itemNotes.note, '') as note
        FROM items
        LEFT JOIN itemNotes ON items.itemID = itemNotes.itemID
        WHERE itemNotes.parentItemID = ?
          AND items.itemTypeID = (SELECT itemTypeID FROM itemTypes WHERE typeName = 'note')
      `;

      const result = await this.connector.queryObj(query, [itemID]);
      if (!result || result.length === 0) return '';

      return result
        .map(row => this.stripHtml(row.note as string))
        .filter(note => note.length > 0)
        .join('\n\n');
    } catch (err) {
      console.error(`Failed to extract notes for item ${itemID}: ${err}`);
      return '';
    }
  }

  private async extractAbstract(itemID: number): Promise<string> {
    try {
      const query = `
        SELECT itemDataValues.value
        FROM itemData
        JOIN itemDataValues ON itemData.valueID = itemDataValues.valueID
        JOIN fields ON itemData.fieldID = fields.fieldID
        WHERE itemData.itemID = ? AND fields.fieldName = 'abstractNote'
      `;
      const result = await this.connector.queryObj(query, [itemID]);
      return (result && result.length > 0) ? (result[0].value as string) : '';
    } catch (err) {
      console.error(`Failed to extract abstract for item ${itemID}: ${err}`);
      return '';
    }
  }

  private stripHtml(content: string): string {
    if (!content) return '';
    let text = content.replace(/<[^>]*>/g, '');
    text = text
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
    return text.replace(/\s+/g, ' ').trim();
  }

  private isValidEvidence(content: string): boolean {
    return !!(content && content.trim().length >= MIN_EVIDENCE_LENGTH);
  }

  async extract(item: ZoteroItem): Promise<EvidenceExtraction> {
    console.log(`[EvidenceExtractor] Extracting evidence for item ${item.itemKey} (itemID: ${item.itemID})`);

    // 1. Try PDF fulltext
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

    // 2. Try Zotero notes
    const notesContent = await this.extractNotes(item.itemID);
    const hasNotes = this.isValidEvidence(notesContent);

    // 3. Try video transcript
    let transcriptContent = '';
    let transcriptSource = '';

    // FIX: Check static session cache first
    const cachedSessionTranscript = EvidenceExtractor.sessionTranscriptCache.get(item.itemID);
    const registryManualTranscript = this.registry.getManualTranscript(item.itemID);

    if (cachedSessionTranscript) {
      if (cachedSessionTranscript === TRANSCRIPT_SKIPPED) {
        console.log('[EvidenceExtractor] Manual transcript was previously skipped (session cache)');
      } else {
        console.log('[EvidenceExtractor] Found cached manual transcript in session cache');
        transcriptContent = cachedSessionTranscript;
        transcriptSource = 'video_transcript_manual_cached';
      }
    } else if (registryManualTranscript) {
      if (registryManualTranscript === TRANSCRIPT_SKIPPED) {
        console.log('[EvidenceExtractor] Manual transcript was previously skipped (registry)');
      } else {
        console.log('[EvidenceExtractor] Found cached manual transcript in registry');
        transcriptContent = registryManualTranscript;
        transcriptSource = 'video_transcript_manual_cached';
      }
    } else if (item.url) {
      try {
        const transcript = await this.transcriptExtractor.extractTranscript(item.url);
        if (this.isValidEvidence(transcript.transcript)) {
          transcriptContent = transcript.transcript;
          transcriptSource = `video_transcript_${transcript.platform}`;
        }
      } catch (error) {
        if (error instanceof TranscriptExtractionError && error.requiresManualInput) {
          console.log(`[EvidenceExtractor] Transcript extraction failed asking for manual input: ${error.message}`);

          if (hasNotes) {
            console.log('[EvidenceExtractor] Skipping manual transcript prompt because valid Zotero notes exist');
          } else {
            console.log('[EvidenceExtractor] Requesting manual transcript from user...');
            const manualTranscript = await this.promptForManualTranscript(item);
            console.log(`[EvidenceExtractor] Manual transcript received (length: ${manualTranscript.length})`);

            if (this.isValidEvidence(manualTranscript)) {
              // FIX: Save to both registry and static session cache
              this.registry.saveManualTranscript(item.itemID, manualTranscript);
              EvidenceExtractor.sessionTranscriptCache.set(item.itemID, manualTranscript);

              transcriptContent = manualTranscript;
              transcriptSource = 'video_transcript_manual';
            } else {
              console.log('[EvidenceExtractor] User skipped manual transcript, saving skip state');
              this.registry.saveManualTranscript(item.itemID, TRANSCRIPT_SKIPPED);
              EvidenceExtractor.sessionTranscriptCache.set(item.itemID, TRANSCRIPT_SKIPPED);
            }
          }
        } else {
          console.log(`[EvidenceExtractor] Transcript extraction failed (non-recoverable): ${error}`);
        }
      }
    }

    // FIX: Force 'Transcript' evidence level for video recordings
    if (item.itemType === 'videoRecording') {
      console.log('[EvidenceExtractor] Item is videoRecording, forcing Transcript evidence level');

      // If we have transcript content (from any source), use it as primary
      if (transcriptContent) {
        let finalContent = transcriptContent;
        const sources = [transcriptSource];

        if (hasNotes) {
          finalContent += '\n\n--- ADDITIONAL NOTES FROM ZOTERO ---\n\n' + notesContent;
          sources.push('zotero_notes');
        }

        // If we found PDF content earlier, we might want to include it or just note it
        // For now, let's treat it as supplementary if needed, but primary is Transcript
        if (pdfContent && this.isValidEvidence(pdfContent)) {
          // We could concatenate or just log. For now, rely on transcript + notes.
          // Maybe add it if transcript is short? 
          // Stick to plan: Override evidence level.
        }

        return {
          level: 'Transcript',
          content: finalContent,
          sources: sources,
          tokenEstimate: this.estimateTokens(finalContent)
        };
      }

      // If no transcript but we have PDF (likely a transcript export), use PDF but label as Transcript
      if (pdfContent && this.isValidEvidence(pdfContent)) {
        return {
          level: 'Transcript', // Force Transcript level
          content: pdfContent,
          sources: ['pdf_fulltext_as_transcript'], // Distinct source label
          tokenEstimate: this.estimateTokens(pdfContent)
        };
      }
    }

    if (transcriptContent) {
      let finalContent = transcriptContent;
      const sources = [transcriptSource];
      // Determine correct evidence level for video content
      let evidenceLevel: 'Transcript' | 'Notes' = 'Transcript';
      if (hasNotes) {
        finalContent += '\n\n--- ADDITIONAL NOTES FROM ZOTERO ---\n\n' + notesContent;
        sources.push('zotero_notes');
        // When we have both transcript and notes, still use Transcript as primary
        // The sources array indicates both were used
      }
      return {
        level: evidenceLevel,
        content: finalContent,
        sources: sources,
        tokenEstimate: this.estimateTokens(finalContent)
      };
    }

    if (hasNotes) {
      return {
        level: 'Notes',
        content: notesContent,
        sources: ['zotero_notes'],
        tokenEstimate: this.estimateTokens(notesContent)
      };
    }

    const abstractContent = await this.extractAbstract(item.itemID);
    if (this.isValidEvidence(abstractContent)) {
      return {
        level: 'Abstract',
        content: abstractContent,
        sources: ['abstract'],
        tokenEstimate: this.estimateTokens(abstractContent)
      };
    }

    return {
      level: 'MetadataOnly',
      content: '',
      sources: ['metadata'],
      tokenEstimate: 0
    };
  }

  private estimateTokens(content: string): number {
    const words = content.trim().split(/\s+/).length;
    return Math.ceil(words / 0.75);
  }

  canEnrich(evidence: EvidenceExtraction): boolean {
    return evidence.level === 'FullText' || evidence.level === 'Transcript' || evidence.level === 'Notes';
  }

  getEvidenceDescription(level: EvidenceLevel, sources?: string[]): string {
    switch (level) {
      case 'FullText':
        return 'PDF fulltext extracted';
      case 'Transcript':
        if (sources && sources.some(s => s.includes('zotero_notes'))) {
          return 'Video transcript + notes';
        }
        return 'Video transcript extracted';
      case 'Notes':
        return 'Zotero notes and annotations';
      case 'Abstract':
        return 'Abstract only (limited evidence)';
      case 'MetadataOnly':
        return 'No content available (queued)';
    }
  }

  private pendingTranscriptPrompt: Promise<string> | null = null;

  private async promptForManualTranscript(item: ZoteroItem): Promise<string> {
    if (this.pendingTranscriptPrompt) {
      console.log('[EvidenceExtractor] Returning existing pending transcript prompt promise');
      return this.pendingTranscriptPrompt;
    }

    console.log('[EvidenceExtractor] Creating new pending transcript prompt promise');
    this.pendingTranscriptPrompt = new Promise<string>((resolve) => {
      const modal = new TranscriptInputModal(
        this.app,
        item,
        (transcript) => {
          console.log('[EvidenceExtractor] Modal confirmed with transcript');
          resolve(transcript);
        },
        () => {
          console.log('[EvidenceExtractor] Modal cancelled');
          resolve('');
        }
      );
      modal.open();
    });

    try {
      return await this.pendingTranscriptPrompt;
    } finally {
      console.log('[EvidenceExtractor] Clearing pending transcript prompt promise');
      this.pendingTranscriptPrompt = null;
    }
  }
}
