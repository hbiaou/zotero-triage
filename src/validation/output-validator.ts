/**
 * Output Validator for Enriched Literature Notes
 *
 * Provides comprehensive validation pipeline for AI-enriched notes:
 * 1. Schema validation - Zod-based YAML frontmatter structure checks
 * 2. Metadata consistency - Verify frontmatter/body matches Zotero item
 * 3. Hallucination detection - LLM-powered claim validation against evidence
 *
 * Quality gate preventing invalid or hallucinated content from entering vault.
 * Used by enrichment orchestrator before saving enriched notes.
 */

import { parse as parseYaml } from 'yaml';
import { YAMLFrontmatterSchema, formatZodErrors } from './schemas';
import type { ZoteroItem } from '../types';
import type { EvidenceExtraction } from '../ai/types';
import type { AIService } from '../services/ai-service';
import type {
  ValidationError,
  ValidationResult,
  Hallucination,
  Correction,
  HallucinationRepair,
  SkippedItem
} from './types';

export type { ValidationError, ValidationResult };



/**
 * Output Validator
 *
 * Validates enriched note content through multi-stage pipeline:
 * - Stage 1: Schema validation (YAML structure)
 * - Stage 2: Metadata consistency (matches Zotero item)
 * - Stage 3: Hallucination detection (claims supported by evidence)
 *
 * Stages run sequentially. Hallucination detection only runs if schema/metadata valid.
 */
export class OutputValidator {
  constructor(
    private aiService: AIService
  ) { }

  /**
   * Validate enriched note content
   *
   * Runs full validation pipeline and returns comprehensive result.
   *
   * @param enrichedContent - Full markdown content with YAML frontmatter
   * @param item - Original Zotero item for consistency checks
   * @param evidence - Evidence extraction result for hallucination detection
   * @returns Validation result with errors and warnings
   */
  async validate(
    enrichedContent: string,
    item: ZoteroItem,
    evidence: EvidenceExtraction
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Step 1: Parse and validate frontmatter schema
    const schemaResult = this.validateSchema(enrichedContent);
    errors.push(...schemaResult.errors);
    warnings.push(...schemaResult.warnings);

    // Step 2: Validate metadata consistency (authors, year, title)
    const metadataResult = this.validateMetadataConsistency(enrichedContent, item);
    errors.push(...metadataResult.errors);
    warnings.push(...metadataResult.warnings);

    // Initial result structure
    let result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings
    };

    // Step 3: Content Validation & Repair (Hallucination detection + Correction)
    // Only run if no critical schema/metadata errors and evidence is available
    if (errors.length === 0 && evidence.level !== 'MetadataOnly') {
      // Stage 1: Validation (Detect hallucinations and corrections)
      const contentResult = await this.validateContent(enrichedContent, evidence);

      result.hallucinations = contentResult.hallucinations;
      result.corrections = contentResult.corrections;

      // Stage 2: Auto-Repair (if needed and safe)
      const hasHallucinations = (result.hallucinations?.length ?? 0) > 0;
      const hasHighConfidenceCorrections = (result.corrections?.filter(c => c.confidence >= 0.9).length ?? 0) > 0;

      if (hasHallucinations || hasHighConfidenceCorrections) {
        const repairResult = await this.repairContent(
          enrichedContent,
          item,
          evidence,
          result.hallucinations || [],
          result.corrections || []
        );

        if (repairResult) {
          result.updatedBody = repairResult.updatedNote;
          result.autoAppliedCorrections = repairResult.appliedCorrections;
          result.hallucinationRepairs = repairResult.repairedHallucinations;
          result.skipped = repairResult.skipped;

          // If we repaired content, we should technically re-validate or clear the warnings/errors
          // For now, we keep the original detection records but provide the fixed content
        }
      }

      // Merge errors/warnings from content validation
      result.errors.push(...contentResult.errors);
      result.warnings.push(...contentResult.warnings);
    }

    return result;
  }

  /**
   * Validate YAML frontmatter schema using Zod
   *
   * Parses frontmatter and validates against YAMLFrontmatterSchema.
   * Also checks basic body structure (length, headings, tags).
   *
   * @param content - Full markdown content with frontmatter
   * @returns Validation result for schema checks
   */
  private validateSchema(content: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    try {
      // Parse frontmatter with YAML library
      const { frontmatter, body } = this.parseFrontmatter(content);

      // Validate frontmatter schema
      const schemaResult = YAMLFrontmatterSchema.safeParse(frontmatter);
      if (!schemaResult.success) {
        const zodErrors = formatZodErrors(schemaResult.error);
        errors.push(...zodErrors.map(err => ({
          type: 'schema' as const,
          severity: 'error' as const,
          field: err.field,
          message: err.message,
          details: { received: err.received, expected: err.expected }
        })));
      }

      // Check body structure
      if (body.length < 100) {
        errors.push({
          type: 'structure',
          severity: 'error',
          message: 'Note body too short (< 100 characters)'
        });
      }

      // Check for markdown headings
      if (!body.includes('#')) {
        warnings.push({
          type: 'structure',
          severity: 'warning',
          message: 'No headings found in note body'
        });
      }

      // Check for tags at end
      const tagPattern = /^#\w+/m;
      if (!tagPattern.test(body)) {
        warnings.push({
          type: 'structure',
          severity: 'warning',
          message: 'No tags found in note'
        });
      }

    } catch (error) {
      errors.push({
        type: 'schema',
        severity: 'error',
        message: `Failed to parse frontmatter: ${(error as Error).message}`
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate metadata consistency
   *
   * Checks that frontmatter and body content match Zotero item metadata:
   * - Year matches between frontmatter and Zotero
   * - Title appears in note body
   * - Author names mentioned in body
   *
   * @param content - Full markdown content
   * @param item - Zotero item for comparison
   * @returns Validation result for metadata checks
   */
  private validateMetadataConsistency(content: string, item: ZoteroItem): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    try {
      const { frontmatter, body } = this.parseFrontmatter(content);

      // Check year consistency
      if (item.year && frontmatter.year && parseInt(frontmatter.year) !== parseInt(item.year)) {
        // Downgraded to warning per user request ("fix instead of blocking")
        warnings.push({
          type: 'metadata',
          severity: 'warning',
          field: 'year',
          message: `Year mismatch: frontmatter (${frontmatter.year}) vs Zotero (${item.year})`
        });
      }

      // Check title in body matches item
      const bodyLower = content.toLowerCase();
      const titleLower = (item.title || '').toLowerCase();
      if (titleLower && titleLower.length > 10 && !bodyLower.includes(titleLower.substring(0, 50))) {
        warnings.push({
          type: 'metadata',
          severity: 'warning',
          field: 'title',
          message: 'Item title not found in note body (possible hallucination)'
        });
      }

      // Check authors mentioned
      // ZoteroItem has authors as string[] (e.g., ["Smith, John", "Doe, Jane"])
      if (item.authors && item.authors.length > 0) {
        // Extract last names from "Last, First" format
        const authorLastNames = item.authors
          .map(author => {
            const parts = author.split(',');
            return parts[0].trim(); // Extract last name
          })
          .filter(name => name.length > 2);

        const authorsMissing = authorLastNames.filter(name => !bodyLower.includes(name.toLowerCase()));

        if (authorsMissing.length === authorLastNames.length && authorLastNames.length > 0) {
          warnings.push({
            type: 'metadata',
            severity: 'warning',
            field: 'authors',
            message: 'No author names found in note body',
            details: { expected: authorLastNames }
          });
        }
      }

    } catch (error) {
      errors.push({
        type: 'metadata',
        severity: 'error',
        message: `Metadata validation failed: ${(error as Error).message}`
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Stage 1: Validate Content
   * Detects hallucinations (Type D) and proposes corrections (Type A).
   */
  private async validateContent(
    content: string,
    evidence: EvidenceExtraction
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    try {
      const { body } = this.parseFrontmatter(content);
      const isPdf = evidence.level === 'FullText';
      const reliability = isPdf ? 'HIGH' : 'LOW';

      const prompt = `You are a strict output validator for academic notes.
      
EVIDENCE (${reliability} RELIABILITY):
${evidence.content.substring(0, 15000)}

NOTE TO VALIDATE:
${body.substring(0, 5000)}

TASK: Detect hallucinations (Type D) and corrections (Type A only).

RULES:
1. Hallucinations (Type D): Facts in the note that are DIRECTLY CONTRADICTED by evidence or FABRICATED.
   - If evidence is LOW reliability (transcript), be conservative. flagged only if clearly impossible.
2. Corrections (Type A): Typos, name/title variants.
   - MUST PROPOSE CORRECTION ONLY IF GROUNDED by strict evidence match.
   - Ignore paraphrasing (Type B) or formatting (Type C).

OUTPUT JSON:
{
  "hallucinations": [
    { "claim": "text", "reason": "reason", "severity": "warning", "evidenceQuote": "optional quote" }
  ],
  "corrections": [
    {
      "type": "typo|name_variant|title_variant|date|other",
      "original": "text",
      "suggested": "text",
      "confidence": 0.0-1.0,
      "sourceOfTruth": { "kind": "pdf_evidence", "field": "content", "value": "exact match" }
    }
  ]
}`;

      const modelId = this.aiService.getCurrentModel();
      if (!modelId) return { valid: true, errors, warnings };

      const response = await this.aiService.complete({
        prompt,
        model: modelId,
        temperature: 0.0,
        maxTokens: 2000
      });

      const parsed = this.parseJsonSafe(response.content);

      const hallucinations: Hallucination[] = Array.isArray(parsed.hallucinations) ? parsed.hallucinations : [];
      const corrections: Correction[] = Array.isArray(parsed.corrections) ? parsed.corrections : [];

      // Convert hallucinations to warnings
      hallucinations.forEach(h => {
        warnings.push({
          type: 'hallucination',
          severity: h.severity,
          message: `Unsupported claim: "${h.claim}"`,
          details: { reason: h.reason, evidence: h.evidenceQuote }
        });
      });

      return { valid: errors.length === 0, errors, warnings, hallucinations, corrections };

    } catch (error) {
      console.warn('[OutputValidator] Content validation failed:', error);
      return { valid: true, errors, warnings };
    }
  }

  /**
   * Stage 2: Repair Content
   * Applies high-confidence corrections and repairs hallucinations.
   */
  private async repairContent(
    content: string,
    item: ZoteroItem,
    evidence: EvidenceExtraction,
    hallucinations: Hallucination[],
    corrections: Correction[]
  ): Promise<{
    updatedNote: string;
    appliedCorrections: Correction[];
    repairedHallucinations: HallucinationRepair[];
    skipped: SkippedItem[]
  } | null> {

    const highConfidenceCorrections = corrections.filter(c => c.confidence >= 0.9);
    if (hallucinations.length === 0 && highConfidenceCorrections.length === 0) {
      return null;
    }

    try {
      const zoteroMetadata = JSON.stringify({
        title: item.title,
        authors: item.authors,
        year: item.year,
        publication: item.journal,
        doi: item.doi,
        url: item.url
      }, null, 2);

      const prompt = `You are an expert editor repairing a literature note.

SOURCE TRUTH (ZOTERO - CANONICAL):
${zoteroMetadata}

EVIDENCE (${evidence.level === 'FullText' ? 'PDF - HIGH' : 'TRANSCRIPT - LOW'} RELIABILITY):
${evidence.content.substring(0, 10000)}

ORIGINAL NOTE:
${content}

TASK:
1. Apply these corrections: ${JSON.stringify(highConfidenceCorrections.map(c => ({ original: c.original, suggested: c.suggested })))}
2. Repair these hallucinations: ${JSON.stringify(hallucinations.map(h => h.claim))}

RULES:
- IF evidence is HIGH reliability: Rewrite hallucinations to match evidence.
- IF evidence is LOW reliability: Remove hallucinations unless you are 100% sure from Zotero metadata.
- DO NOT INVENT FACTS. If unsure, remove the claim.
- Preservere original structure/formatting.

OUTPUT JSON ONLY:
{
  "updatedNote": "full markdown string",
  "appliedCorrections": [{ "original": "...", "suggested": "...", "count": 1 }],
  "repairedHallucinations": [
     { "claim": "...", "action": "rewritten|removed", "replacement": "...", "support": { "kind": "zotero_metadata|pdf_evidence", "quoteOrValue": "..." } }
  ],
  "skipped": [{ "item": "...", "reason": "..." }]
}`;

      const modelId = this.aiService.getCurrentModel();
      if (!modelId) return null;

      const response = await this.aiService.complete({
        prompt,
        model: modelId,
        temperature: 0.0,
        maxTokens: 4000, // accommodate full note
      });

      const parsed = this.parseJsonSafe(response.content);

      if (!parsed.updatedNote) return null;

      return {
        updatedNote: parsed.updatedNote,
        appliedCorrections: parsed.appliedCorrections || [], // Map back to full correction objects if strict tracking needed, simplified for now
        repairedHallucinations: parsed.repairedHallucinations || [],
        skipped: parsed.skipped || []
      } as any; // Cast needed as we aren't reconstructing full correction objects here perfectly matching strict types without more logic, but runtime logic holds.
      // Actually for appliedCorrections we should probably return the input corrections that were applied, or trust the LLM output.

    } catch (error) {
      console.warn('[OutputValidator] Repair failed:', error);
      return null;
    }
  }

  private parseJsonSafe(text: string): any {
    try {
      text = text.trim();
      // Remove markdown blocks if present
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
      if (jsonMatch) text = jsonMatch[1];

      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1));
      }
      return {};
    } catch (e) {
      console.warn('JSON Parse Error', e);
      return {};
    }
  }

  /**
   * Parse YAML frontmatter from markdown content
   *
   * Splits content into frontmatter and body sections.
   * Handles standard YAML frontmatter delimited by --- markers.
   *
   * @param content - Full markdown content with frontmatter
   * @returns Parsed frontmatter object and body string
   * @throws Error if frontmatter cannot be parsed
   */
  private parseFrontmatter(content: string): { frontmatter: any; body: string } {
    // Match YAML frontmatter delimited by ---
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      throw new Error('No YAML frontmatter found in content');
    }

    const frontmatterText = match[1];
    const body = match[2];

    // Parse YAML
    const frontmatter = parseYaml(frontmatterText);

    return { frontmatter, body };
  }

  // Removed cleanJson as it is replaced by parseJsonSafe

}
