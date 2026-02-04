/**
 * Enrichment Service
 *
 * Core enrichment engine that transforms Zotero items into enriched literature notes
 * using LLM-powered content generation with evidence-based template population.
 *
 * Workflow:
 * 1. Extract evidence using EvidenceExtractor (PDF, transcripts, notes, abstract)
 * 2. Get domain-specific template based on classification
 * 3. Build LLM prompt with evidence-only constraints
 * 4. Call AIService for content generation (2-minute timeout)
 * 5. Parse and validate LLM response
 * 6. Return EnrichmentResult with enriched markdown
 *
 * Anti-hallucination measures:
 * - Explicit "evidence-only" system instructions
 * - "N/A - insufficient evidence" placeholder for missing sections
 * - Verbatim quote preservation for key claims and methods
 * - Evidence hierarchy enforcement via EvidenceExtractor.canEnrich()
 *
 * Usage:
 * ```typescript
 * const service = new EnrichmentService(aiService, evidenceExtractor, domainClassifier, app);
 * const classification = await domainClassifier.classify(item, evidence);
 * const result = await service.enrich(item, classification);
 * await vault.create(notePath, result.content);
 * ```
 */

import type { App } from 'obsidian';
import type { AIService } from './ai-service';
import type { EvidenceExtractor } from './evidence-extractor';
import type { DomainClassifier } from '../classification/domain-classifier';
import type { ZoteroItem, EnrichmentResult } from '../types';
import type { ClassificationResult } from '../classification/types';
import type { EvidenceExtraction } from '../ai/types';
import { getDomainTemplate } from '../notes/templates';
import {
  EnrichmentTimeoutError,
  EnrichmentAPIError,
  EnrichmentParseError,
} from '../types';
import { AIServiceError } from '../ai/types';

/**
 * Enrichment timeout threshold in milliseconds (2 minutes)
 */
const ENRICHMENT_TIMEOUT_MS = 300000;

/**
 * Maximum evidence content to include in prompt (30k characters)
 * Prevents token limit overflow for large PDFs
 */
const MAX_EVIDENCE_LENGTH = 30000;

/**
 * EnrichmentService
 *
 * Main service for enriching Zotero items with LLM-generated content.
 * Integrates evidence extraction, domain classification, and AI completion.
 */
export class EnrichmentService {
  private aiService: AIService;
  private evidenceExtractor: EvidenceExtractor;
  private domainClassifier: DomainClassifier;
  private app: App;

  /**
   * Create enrichment service
   *
   * @param aiService - AIService instance for LLM completion
   * @param evidenceExtractor - EvidenceExtractor for content extraction
   * @param domainClassifier - DomainClassifier for domain detection
   * @param app - Obsidian App instance for vault access
   */
  constructor(
    aiService: AIService,
    evidenceExtractor: EvidenceExtractor,
    domainClassifier: DomainClassifier,
    app: App
  ) {
    this.aiService = aiService;
    this.evidenceExtractor = evidenceExtractor;
    this.domainClassifier = domainClassifier;
    this.app = app;
  }

  /**
   * Enrich a Zotero item with LLM-generated content
   *
   * Main enrichment workflow:
   * 1. Extract evidence (PDF/notes/abstract)
   * 2. Check evidence sufficiency via canEnrich()
   * 3. Get domain template
   * 4. Build evidence-constrained prompt
   * 5. Call LLM with 2-minute timeout
   * 6. Parse and validate response
   * 7. Return EnrichmentResult
   *
   * @param item - Zotero item to enrich
   * @param classification - Domain classification result
   * @returns Promise resolving to enrichment result
   * @throws EnrichmentTimeoutError if LLM exceeds 2 minutes
   * @throws EnrichmentAPIError if LLM API fails
   * @throws EnrichmentParseError if response invalid
   */
  async enrich(
    item: ZoteroItem,
    classification: ClassificationResult,
    evidence: EvidenceExtraction
  ): Promise<EnrichmentResult> {
    // Step 1: Use provided evidence (optimized)
    // evidence is now passed in to avoid re-extraction loop

    // Step 2: Check evidence sufficiency (enforce hierarchy)
    if (!this.evidenceExtractor.canEnrich(evidence)) {
      throw new EnrichmentAPIError(
        item.itemID,
        `Insufficient evidence for enrichment. Level: ${evidence.level}. ` +
        'FullText or Notes required.'
      );
    }

    // Step 3: Get domain template
    const template = getDomainTemplate(classification.domain, item);

    // Step 4: Build LLM prompt
    const prompt = this.buildEnrichmentPrompt(item, evidence, template, classification);

    // Step 5: Call LLM with timeout
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new EnrichmentTimeoutError(
              item.itemID,
              `Enrichment exceeded ${ENRICHMENT_TIMEOUT_MS / 1000}s timeout`
            )
          );
        }, ENRICHMENT_TIMEOUT_MS);
      });

      const completionPromise = this.aiService.complete({
        systemPrompt: this.getSystemPrompt(),
        prompt,
        temperature: 0.7, // Balanced creativity for note writing
        maxTokens: 4096, // Sufficient for full literature note
        model: this.aiService.getCurrentModel() || 'gemini-3-flash-preview',
      });

      const response = await Promise.race([completionPromise, timeoutPromise]);

      // Step 6: Parse and validate response
      const { content, metadata } = this.parseEnrichmentResponse(
        response.content,
        item.itemID
      );

      // Step 7: Return EnrichmentResult
      return {
        content,
        metadata,
        evidenceUsed: {
          level: evidence.level,
          sources: evidence.sources,
        },
        enrichedAt: new Date().toISOString(),
        modelUsed: response.model,
        tokenCount: response.tokensUsed.input + response.tokensUsed.output,
      };
    } catch (error) {
      // Handle timeout separately
      if (error instanceof EnrichmentTimeoutError) {
        throw error;
      }

      // Handle AI service errors
      if (error instanceof AIServiceError) {
        throw new EnrichmentAPIError(
          item.itemID,
          `AI service failed: ${error.message}`,
          error
        );
      }

      // Handle parse errors
      if (error instanceof EnrichmentParseError) {
        throw error;
      }

      // Unknown error
      throw new EnrichmentAPIError(
        item.itemID,
        `Enrichment failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get system prompt for enrichment
   *
   * Provides anti-hallucination instructions and output format constraints.
   *
   * @returns System prompt string
   * @private
   */
  private getSystemPrompt(): string {
    return `You are a literature note enrichment assistant. Your task is to fill template sections using ONLY the provided evidence from the source material.

CRITICAL INSTRUCTIONS:
1. Use ONLY information explicitly stated in the evidence
2. For sections without supporting evidence, write "N/A - insufficient evidence"
3. Preserve verbatim quotes for key claims, methods, and results
4. Use mixed style: verbatim quotes for important claims, paraphrasing for context
5. Do NOT add your own interpretations or external knowledge
6. Do NOT infer information not present in the evidence
7. When evidence conflicts, prioritize PDF fulltext over notes
8. Do NOT correct the spelling of technical terms, proper names, or unique jargon (e.g. if the source says 'ClawdBot', do NOT change it to 'ClaudeBot')

OUTPUT FORMAT:
- Return valid Markdown with YAML frontmatter
- Frontmatter format: ---\\nkey: value\\n...\\n---
- CRITICAL: You must include "note_type: literature-note" in frontmatter
- NO code blocks wrapping the output
- NO emojis in the content
- Generate 6-8 relevant tags at the end (single line format)`;
  }

  /**
   * Build enrichment prompt with evidence and template
   *
   * Constructs comprehensive prompt including:
   * - Item metadata (title, authors, year, type)
   * - Evidence content (fulltext/notes/abstract)
   * - Template structure to fill
   * - Specific instructions
   *
   * @param item - Zotero item
   * @param evidence - Extracted evidence
   * @param template - Domain template
   * @param classification - Domain classification
   * @returns Formatted prompt string
   * @private
   */
  private buildEnrichmentPrompt(
    item: ZoteroItem,
    evidence: EvidenceExtraction,
    template: string,
    classification: ClassificationResult
  ): string {
    const evidenceLevelDescription = this.evidenceExtractor.getEvidenceDescription(
      evidence.level,
      evidence.sources
    );

    // Truncate evidence to prevent token overflow
    const evidenceContent =
      evidence.content.length > MAX_EVIDENCE_LENGTH
        ? evidence.content.substring(0, MAX_EVIDENCE_LENGTH) + '\n\n[Content truncated...]'
        : evidence.content;

    // Format authors for display
    const authorsDisplay = item.authors.length > 0
      ? item.authors.join(', ')
      : 'Unknown';

    const prompt = `You are enriching a literature note for: "${item.title}"

EVIDENCE AVAILABLE:
${evidenceLevelDescription}

${evidence.level === 'FullText' ? `FULL TEXT:\n${evidenceContent}\n` : ''}
${evidence.level === 'Notes' ? `NOTES:\n${evidenceContent}\n` : ''}
${evidence.level === 'Abstract' ? `ABSTRACT:\n${evidenceContent}\n` : ''}

TEMPLATE TO FILL (${classification.domain} domain):
${template}

METADATA:
Title: ${item.title}
Authors: ${authorsDisplay}
Year: ${item.year || 'Unknown'}
Type: ${item.itemType}
${item.journal ? `Journal: ${item.journal}` : ''}
${item.url ? `URL: ${item.url}` : ''}

INSTRUCTIONS:
1. Fill each template section using ONLY the evidence above
2. Use "N/A - insufficient evidence" for sections without supporting text
3. Preserve verbatim quotes for key claims, methods, and results
4. Use mixed style: quotes for claims, paraphrasing for context
5. Generate 6-8 relevant tags at the end (single line)
6. Output format: YAML frontmatter (---\\nkey: value\\n---) followed by markdown body
7. NO code blocks wrapping the output
8. NO emojis in the content

Generate the enriched literature note now.`;

    return prompt;
  }

  /**
   * Parse and validate LLM enrichment response
   *
   * Extracts markdown content, validates basic structure (frontmatter + body),
   * and parses YAML frontmatter into metadata object.
   *
   * @param content - Raw LLM response
   * @param itemId - Item ID for error tracking
   * @returns Parsed content and metadata
   * @throws EnrichmentParseError if response invalid
   * @private
   */
  private parseEnrichmentResponse(
    content: string,
    itemId: number
  ): { content: string; metadata: Record<string, any> } {
    try {
      // Remove code block wrapping if LLM added it despite instructions
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```markdown')) {
        cleanContent = cleanContent.replace(/^```markdown\n/, '').replace(/\n```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      // Validate has frontmatter
      if (!cleanContent.startsWith('---')) {
        throw new EnrichmentParseError(
          itemId,
          'Invalid response: Missing YAML frontmatter. Content must start with ---'
        );
      }

      // Extract frontmatter
      const frontmatterMatch = cleanContent.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        throw new EnrichmentParseError(
          itemId,
          'Invalid response: Malformed YAML frontmatter. Expected ---\\nfields\\n---'
        );
      }

      const frontmatterText = frontmatterMatch[1];

      // Validate has body after frontmatter
      const bodyStartIndex = cleanContent.indexOf('---', 3) + 3;
      const body = cleanContent.substring(bodyStartIndex).trim();

      if (body.length < 50) {
        throw new EnrichmentParseError(
          itemId,
          'Invalid response: Note body too short (< 50 characters). Content generation incomplete.'
        );
      }

      // Parse YAML frontmatter (simple key-value extraction)
      const metadata = this.parseYamlFrontmatter(frontmatterText);

      return {
        content: cleanContent,
        metadata,
      };
    } catch (error) {
      if (error instanceof EnrichmentParseError) {
        throw error;
      }

      throw new EnrichmentParseError(
        itemId,
        `Failed to parse enrichment response: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parse YAML frontmatter into key-value object
   *
   * Simple parser for basic YAML structure. Handles:
   * - Single-line values: key: value
   * - Multi-line values: key: >\n  value
   * - Array values: key:\n  - item1\n  - item2
   *
   * @param yamlText - YAML frontmatter text (without --- delimiters)
   * @returns Parsed metadata object
   * @private
   */
  private parseYamlFrontmatter(yamlText: string): Record<string, any> {
    const metadata: Record<string, any> = {};
    const lines = yamlText.split('\n');

    let currentKey: string | null = null;
    let currentValue: string[] = [];
    let isMultiline = false;
    let isArray = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines
      if (line.trim() === '') {
        continue;
      }

      // Check if this is a key-value line
      if (line.match(/^[a-zA-Z_][a-zA-Z0-9_-]*:/)) {
        // Save previous key if exists
        if (currentKey) {
          metadata[currentKey] = isArray
            ? currentValue
            : currentValue.join(' ').trim();
        }

        // Parse new key
        const colonIndex = line.indexOf(':');
        currentKey = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();

        // Check for multiline or array
        if (value === '>') {
          isMultiline = true;
          isArray = false;
          currentValue = [];
        } else if (value === '' || value === '[]') {
          // Array or empty value
          isMultiline = false;
          isArray = value === '';
          currentValue = [];
        } else {
          // Simple value
          isMultiline = false;
          isArray = false;
          currentValue = [value];
        }
      } else if (currentKey) {
        // Continuation line (array item or multiline value)
        if (line.trim().startsWith('-')) {
          // Array item
          isArray = true;
          const item = line.trim().substring(1).trim();
          // Remove quotes if present
          const unquoted = item.replace(/^["']|["']$/g, '');
          currentValue.push(unquoted);
        } else {
          // Multiline value
          currentValue.push(line.trim());
        }
      }
    }

    // Save last key
    if (currentKey) {
      metadata[currentKey] = isArray
        ? currentValue
        : currentValue.join(' ').trim();
    }

    return metadata;
  }
}
