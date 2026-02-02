/**
 * Stub Note Generator
 *
 * Creates fallback literature notes when enrichment fails.
 * Stub notes contain:
 * - Minimal valid metadata from Zotero item
 * - Diagnostic information about failure
 * - Retry instructions for user
 * - Zotero deep link for immediate action
 */

import type { App } from 'obsidian';
import type { ZoteroItem, FailureContext, StubNote } from '../types';
import { escapeYaml } from '../notes/templates';

/**
 * Generates stub notes for failed enrichment attempts
 *
 * Stub notes prevent workflow breakage by providing immediate fallback
 * with enough context for manual completion or retry.
 */
export class StubNoteGenerator {
  constructor(private app: App) {}

  /**
   * Create stub note from failed enrichment context
   *
   * Stub contains:
   * - Basic metadata (title, authors, year, DOI, abstract)
   * - Diagnostic info (failure stage, error message, evidence level)
   * - Retry instructions (command palette, manual completion, batch retry)
   * - Zotero deep link for immediate access
   *
   * @param failureContext - Complete context of enrichment failure
   * @returns Stub note structure ready for formatting and saving
   */
  createStubNote(failureContext: FailureContext): StubNote {
    const { item, stage, error, classification, evidence } = failureContext;

    // Build frontmatter (minimal but valid)
    const frontmatter = {
      note_type: 'literature-note' as const,
      zotero_item_type: item.itemType,
      knowledge_domain: classification?.domain || 'General',
      evidence_level: evidence?.level || 'MetadataOnly',
      template_used: 'GENERAL', // Default for stubs
      date_processed: new Date().toISOString().split('T')[0],
      zotero_key: item.itemKey || undefined,
      doi: item.doi || undefined,
      status: 'stub',
      last_enrichment_attempt: new Date().toISOString(),
      failure_stage: stage,
      error_message: error.message
    };

    // Build minimal body content from available metadata
    let body = `# ${item.title || 'Untitled'}\n\n`;

    // Add authors if available
    if (item.authors && item.authors.length > 0) {
      const authors = item.authors.join(', ');
      body += `**Authors:** ${authors}\n\n`;
    }

    // Add publication year
    if (item.year) {
      body += `**Year:** ${item.year}\n\n`;
    }

    // Add DOI if available
    if (item.doi) {
      body += `**DOI:** ${item.doi}\n\n`;
    }

    // Add abstract if available
    if (item.abstract) {
      body += `## Abstract\n\n${item.abstract}\n\n`;
    }

    // Add diagnostic section
    body += `---\n\n`;
    body += `## 🛠️ Enrichment Status\n\n`;
    body += `**Status:** ⚠️ Enrichment Failed\n\n`;
    body += `**Failed at stage:** ${stage}\n\n`;
    body += `**Error:** ${error.message}\n\n`;
    body += `**Evidence available:** ${evidence?.level || 'Unknown'}\n\n`;
    body += `### What happened?\n\n`;

    // Stage-specific diagnostic messages
    switch (stage) {
      case 'classification':
        body += `Domain classification failed. The system couldn't determine whether this is Academic, Software, Farming, or General content.\n\n`;
        break;
      case 'extraction':
        body += `Evidence extraction failed. The system couldn't retrieve PDF text, notes, or transcript for enrichment.\n\n`;
        break;
      case 'enrichment':
        body += `AI enrichment failed. The LLM couldn't generate enriched content (timeout, API error, or content policy violation).\n\n`;
        break;
      case 'validation':
        body += `Output validation failed. The enriched content contained errors (invalid structure, metadata mismatch, or hallucinations).\n\n`;
        break;
    }

    body += `### What can you do?\n\n`;
    body += `1. **Retry enrichment** via command palette: "Zotero Triage: Re-enrich Note"\n`;
    body += `2. **Check the error** and verify evidence is available in Zotero (PDF attached, notes added)\n`;
    body += `3. **Manually complete** this note using the abstract above as a starting point\n`;
    body += `4. **Wait for batch retry** if this is a temporary API issue\n\n`;

    // Add Zotero deep link if key available
    if (item.itemKey) {
      body += `[Open in Zotero](zotero://select/library/items/${item.itemKey})\n\n`;
    }

    return {
      title: item.title || 'Untitled',
      metadata: frontmatter,
      diagnostic: {
        stage_failed: stage,
        evidence_level: evidence?.level || 'Unknown',
        full_error: error.stack
      },
      content: body
    };
  }

  /**
   * Format stub note as full Markdown with YAML frontmatter
   *
   * @param stub - Stub note structure
   * @returns Complete Markdown document with frontmatter and body
   */
  formatStubNote(stub: StubNote): string {
    // Build YAML frontmatter
    let yaml = '---\n';
    for (const [key, value] of Object.entries(stub.metadata)) {
      if (value !== undefined) {
        yaml += `${key}: ${escapeYaml(String(value))}\n`;
      }
    }
    yaml += '---\n\n';

    return yaml + stub.content;
  }

  /**
   * Save stub note to vault
   *
   * Creates output folder if it doesn't exist.
   * Handles filename conflicts by appending counter.
   * Returns path to created note for registry tracking.
   *
   * @param stub - Stub note structure to save
   * @param outputFolder - Vault-relative path to output folder
   * @returns Vault-relative path to created note
   */
  async saveStubNote(stub: StubNote, outputFolder: string): Promise<string> {
    // Ensure output folder exists
    const folder = this.app.vault.getAbstractFileByPath(outputFolder);
    if (!folder) {
      await this.app.vault.createFolder(outputFolder);
    }

    // Sanitize filename (remove invalid characters)
    const safeTitle = stub.title
      .replace(/[\\/:*?"<>|]/g, '-')
      .substring(0, 200); // Limit length

    const filePath = `${outputFolder}/${safeTitle}.md`;
    const content = this.formatStubNote(stub);

    // Check if file exists, append number if needed
    let finalPath = filePath;
    let counter = 1;
    while (await this.app.vault.adapter.exists(finalPath)) {
      finalPath = `${outputFolder}/${safeTitle} (${counter}).md`;
      counter++;
    }

    await this.app.vault.create(finalPath, content);
    return finalPath;
  }
}
