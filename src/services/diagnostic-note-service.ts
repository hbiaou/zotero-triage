/**
 * Diagnostic Note Service
 *
 * Generates user-friendly diagnostic notes when evidence is insufficient
 * for AI enrichment. Provides actionable guidance and Zotero deep links
 * for users to add missing evidence.
 */

import type { ZoteroItem } from '../types';
import type { EvidenceExtraction } from '../ai/types';

/**
 * Diagnostic reason categorization
 *
 * Identifies why enrichment cannot proceed and guides
 * diagnostic note content generation.
 */
export type DiagnosticReason =
  | 'no_pdf'           // Item has notes but no PDF attachment
  | 'no_notes'         // Item has PDF but no user notes (rare case)
  | 'no_transcript'    // Video item has no transcript available
  | 'abstract_only'    // Only abstract available (not enough for enrichment)
  | 'metadata_only';   // No content at all (title/authors only)

/**
 * Diagnostic note service
 *
 * Stateless service for generating diagnostic notes when items
 * lack sufficient evidence for AI enrichment.
 */
export class DiagnosticNoteService {
  /**
   * Create diagnostic note for item with insufficient evidence
   *
   * Analyzes evidence extraction result to determine what's missing,
   * then generates tailored diagnostic note with actionable guidance.
   *
   * @param item - Zotero item that lacks sufficient evidence
   * @param evidence - Evidence extraction result showing what's available
   * @returns Markdown diagnostic note with YAML frontmatter
   */
  createDiagnosticNote(item: ZoteroItem, evidence: EvidenceExtraction): string {
    const reason = this.determineDiagnosticReason(item, evidence);
    const diagnosticNote = this.buildDiagnosticContent(item, evidence, reason);

    if (!this.validateDiagnosticNote(diagnosticNote)) {
      console.error('Generated invalid diagnostic note for item', item.itemKey);
      return this.createFallbackDiagnosticNote(item, evidence);
    }

    return diagnosticNote;
  }

  /**
   * Determine why enrichment cannot proceed
   *
   * @param item - Zotero item
   * @param evidence - Evidence extraction result
   * @returns Diagnostic reason category
   */
  private determineDiagnosticReason(
    item: ZoteroItem,
    evidence: EvidenceExtraction
  ): DiagnosticReason {
    // Video recording with no transcript
    if (evidence.level === 'MetadataOnly' && item.itemType === 'videoRecording') {
      return 'no_transcript';
    }

    // Metadata only (no abstract, no notes, no PDF)
    if (evidence.level === 'MetadataOnly') {
      return 'metadata_only';
    }

    // Abstract only (not sufficient for enrichment per CONTEXT.md)
    if (evidence.level === 'Abstract') {
      return 'abstract_only';
    }

    // Notes available but no PDF (user has annotated without fulltext)
    if (evidence.level === 'Notes' && evidence.sources.includes('zotero_notes')) {
      return 'no_pdf';
    }

    // Default to metadata_only if unclear
    return 'metadata_only';
  }

  /**
   * Build diagnostic note content with frontmatter and body
   *
   * @param item - Zotero item
   * @param evidence - Evidence extraction result
   * @param reason - Diagnostic reason
   * @returns Formatted markdown diagnostic note
   */
  private buildDiagnosticContent(
    item: ZoteroItem,
    evidence: EvidenceExtraction,
    reason: DiagnosticReason
  ): string {
    const dateChecked = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const zoteroLink = this.buildZoteroLink(item);
    const whatsMissing = this.getWhatsMissing(reason, evidence);
    const actionableGuidance = this.getActionableGuidance(reason);

    return `---
note_type: diagnostic
diagnostic_reason: ${reason}
zotero_key: ${item.itemKey}
evidence_level: ${evidence.level}
date_checked: ${dateChecked}
---

# Enrichment Not Possible

## What's Missing
${whatsMissing}

## What You Can Do
${actionableGuidance}

${zoteroLink}

---
*This item will be automatically retried when evidence is added to Zotero.*
`;
  }

  /**
   * Get description of what evidence is missing
   *
   * @param reason - Diagnostic reason
   * @param evidence - Evidence extraction result
   * @returns Human-readable description
   */
  private getWhatsMissing(reason: DiagnosticReason, evidence: EvidenceExtraction): string {
    switch (reason) {
      case 'no_pdf':
        return 'This item has notes but no PDF fulltext available. AI enrichment requires the complete paper text.';
      case 'no_notes':
        return 'This item has a PDF but no user notes or annotations.';
      case 'no_transcript':
        return 'This video recording has no transcript available. AI enrichment requires text content to analyze.';
      case 'abstract_only':
        return 'Only the abstract is available. AI enrichment requires fulltext or detailed notes for comprehensive analysis.';
      case 'metadata_only':
        return 'No content is available for this item (no PDF, notes, or abstract). AI enrichment requires text content.';
    }
  }

  /**
   * Get actionable guidance for user to resolve missing evidence
   *
   * @param reason - Diagnostic reason
   * @returns Step-by-step guidance
   */
  private getActionableGuidance(reason: DiagnosticReason): string {
    switch (reason) {
      case 'no_pdf':
        return `1. Open this item in Zotero
2. Right-click the item → **Add Attachment** → **Attach Stored Copy of File**
3. Select the PDF file
4. Zotero will automatically index the PDF
5. Accept this item again in Zotero Triage`;

      case 'no_notes':
        return `1. Open this item in Zotero
2. Read the PDF and create notes with your insights
3. Right-click the item → **Add Note**
4. Add your annotations, highlights, or summary
5. Accept this item again in Zotero Triage`;

      case 'no_transcript':
        return `**Option 1: Manual transcript** (recommended)
1. Visit the video platform (YouTube, Vimeo, etc.)
2. Copy the transcript (if available)
3. Open this item in Zotero → Right-click → **Add Note**
4. Paste the transcript into the note
5. Accept this item again in Zotero Triage

**Option 2: Skip enrichment**
- Reject this item if enrichment isn't needed
- Video metadata will still be available in your library`;

      case 'abstract_only':
        return `**For best enrichment quality:**
1. Add the PDF to Zotero (see instructions for no_pdf above)

**Or, if PDF unavailable:**
1. Open this item in Zotero → Right-click → **Add Note**
2. Add your own notes, highlights, or key points from the paper
3. Accept this item again in Zotero Triage

*Abstract-only enrichment is limited and may miss important context.*`;

      case 'metadata_only':
        return `1. Check if this item should have content:
   - Is it a paper, book chapter, or report? → Add PDF
   - Is it a blog post or web page? → Add URL or notes
   - Is it metadata-only by nature? → May not need enrichment

2. If content exists:
   - Open item in Zotero
   - Add PDF via **Add Attachment** → **Attach Stored Copy of File**
   - Or add abstract via item metadata panel
   - Accept this item again in Zotero Triage

3. If this is a citation-only item (no content available):
   - You may want to reject it or defer for later`;
    }
  }

  /**
   * Build Zotero deep link for item
   *
   * @param item - Zotero item
   * @returns Markdown link to open item in Zotero, or empty string if unavailable
   */
  private buildZoteroLink(item: ZoteroItem): string {
    if (!item.itemKey) {
      return '';
    }

    const deepLink = `zotero://select/library/items/${item.itemKey}`;
    return `[Open in Zotero](${deepLink})`;
  }

  /**
   * Validate diagnostic note contains required elements
   *
   * @param note - Generated diagnostic note
   * @returns True if valid, false otherwise
   */
  private validateDiagnosticNote(note: string): boolean {
    // Check for YAML frontmatter
    if (!note.startsWith('---')) return false;

    // Check required fields in frontmatter
    const requiredFields = [
      'note_type: diagnostic',
      'diagnostic_reason:',
      'evidence_level:',
      'date_checked:'
    ];
    for (const field of requiredFields) {
      if (!note.includes(field)) return false;
    }

    // Check for header
    if (!note.includes('# Enrichment Not Possible')) return false;

    // Check for actionable guidance section
    if (!note.includes('## What You Can Do')) return false;

    return true;
  }

  /**
   * Create minimal fallback diagnostic note when generation fails
   *
   * @param item - Zotero item
   * @param evidence - Evidence extraction result
   * @returns Minimal diagnostic note
   */
  private createFallbackDiagnosticNote(
    item: ZoteroItem,
    evidence: EvidenceExtraction
  ): string {
    const dateChecked = new Date().toISOString().split('T')[0];

    return `---
note_type: diagnostic
diagnostic_reason: metadata_only
zotero_key: ${item.itemKey}
evidence_level: ${evidence.level}
date_checked: ${dateChecked}
---

# Enrichment Not Possible

This item lacks sufficient content for AI enrichment.

Please add a PDF, notes, or abstract to this item in Zotero, then try again.

[Open in Zotero](zotero://select/library/items/${item.itemKey})
`;
  }
}
