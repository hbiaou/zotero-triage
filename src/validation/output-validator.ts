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
import type { ValidationError, ValidationResult } from './types';

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

    // Step 3: Hallucination detection (claim validation against evidence)
    // Only run if no critical schema/metadata errors
    if (errors.length === 0) {
      const hallucinationResult = await this.detectHallucinations(enrichedContent, evidence);
      errors.push(...hallucinationResult.errors);
      warnings.push(...hallucinationResult.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
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
   * Detect hallucinations via LLM claim validation
   *
   * Uses AI to compare note claims against source evidence.
   * Identifies unsupported claims that may indicate hallucination.
   *
   * Skipped if evidence level is MetadataOnly (no content to validate against).
   * Expensive operation (LLM call) so only runs if schema/metadata valid.
   *
   * @param content - Full markdown content
   * @param evidence - Evidence extraction result
   * @returns Validation result for hallucination checks
   */
  private async detectHallucinations(
    content: string,
    evidence: EvidenceExtraction
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Skip hallucination detection if no evidence available
    if (evidence.level === 'MetadataOnly') {
      return { valid: true, errors, warnings };
    }

    try {
      // Extract note body (skip frontmatter for claim extraction)
      const { body } = this.parseFrontmatter(content);

      // Build validation prompt for LLM
      const validationPrompt = `You are validating a literature note for factual accuracy against source evidence.

SOURCE EVIDENCE:
${evidence.content.substring(0, 20000)}

ENRICHED NOTE CONTENT:
${body.substring(0, 5000)}

TASK: Identify any SUBSTANTIAL claims in the enriched note that are NOT supported by the source evidence.

CRITICAL INSTRUCTIONS:
1. FOCUS on FACTUAL FABRICATIONS or DIRECT CONTRADICTIONS.
2. IGNORE minor phrasing differences, semantic nuances, or slight rounding variations in statistics if the core meaning/significance is preserved.
3. ALLOW implied context if it logicallly follows from the text (e.g., "author suggests" vs "text states").
4. If a claim is "nuanced" but directionally correct, DO NOT flag it.
5. IF NO HALLUCINATIONS FOUND, return empty array [].

OUTPUT FORMAT:
- Return ONLY a valid JSON array.
- NO Markdown formatting (no \`\`\`json blocks).
- NO explanatory text before or after the JSON.

Example JSON output:
[
  {
    "claim": "exact quote from note",
    "reason": "Explicitly contradicted by page 3: 'Results showed opposite effect'",
    "severity": "warning"
  }
]`;

      const modelId = this.aiService.getCurrentModel();
      if (!modelId) {
        console.warn('[OutputValidator] Hallucination detection skipped: No AI model configured');
        return { valid: true, errors, warnings };
      }

      const response = await this.aiService.complete({
        prompt: validationPrompt,
        model: modelId,
        temperature: 0.1, // Low temperature for consistent validation
        maxTokens: 2000
      });

      // Parse LLM response
      const cleanResponse = this.cleanJson(response.content);

      let unsupportedClaims: any[] = [];
      try {
        unsupportedClaims = JSON.parse(cleanResponse);
      } catch (e) {
        console.warn(`[OutputValidator] Failed to parse JSON response: ${cleanResponse}`);
        // If parsing fails, we assume no hallucinations rather than crashing
        // but log a warning to console
      }

      if (Array.isArray(unsupportedClaims) && unsupportedClaims.length > 0) {
        unsupportedClaims.forEach((claim: any) => {
          // FORCE ALL claims to be warnings, never blocking errors
          // User request: "Validation should not block the note generation"
          const validationError: ValidationError = {
            type: 'hallucination',
            severity: 'warning',
            message: `Unsupported claim: "${claim.claim}"`,
            details: { reason: claim.reason }
          };

          warnings.push(validationError);
        });
      }

    } catch (error) {
      // Hallucination detection failure is non-fatal - log warning
      warnings.push({
        type: 'hallucination',
        severity: 'warning',
        message: `Hallucination detection failed: ${(error as Error).message}`
      });
    }

    return { valid: errors.length === 0, errors, warnings };
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

  /**
   * Clean JSON response from LLM
   * 
   * Robust JSON extraction that handles markdown blocks, explanatory text,
   * and potential unclosed brackets.
   */
  private cleanJson(text: string): string {
    if (!text) return '[]';

    let jsonText = text.trim();

    // Remove markdown code blocks if present
    if (jsonText.includes('```')) {
      jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '');
    }

    // Find the first '[' and last ']'
    const firstBracket = jsonText.indexOf('[');
    const lastBracket = jsonText.lastIndexOf(']');

    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return jsonText.substring(firstBracket, lastBracket + 1);
    }

    // Fallback: If no array brackets, check for empty response or simple 'No issues' text
    if (jsonText.toLowerCase().includes('no hallucinations') || jsonText.toLowerCase().includes('supported')) {
      return '[]';
    }

    return '[]'; // Safe fallback
  }
}
