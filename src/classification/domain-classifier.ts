/**
 * Domain Classifier Service
 *
 * Intelligent classification of Zotero items into Academic, Software, Farming,
 * or General domains using a two-tier approach:
 * 1. Hard overrides based on item type (journalArticle → Academic)
 * 2. LLM-based content analysis for unstructured types (webpage, video)
 *
 * Classification results include confidence scores to determine whether user
 * override modal should be displayed during Accept workflow.
 *
 * Usage:
 * ```typescript
 * const classifier = new DomainClassifier(aiService);
 * const result = await classifier.classify(item, evidence);
 *
 * if (result.confidence < 0.70 && !result.isHardOverride) {
 *   // Show override modal to user
 *   const confirmedDomain = await showClassificationModal(result);
 * }
 * ```
 */

import { z } from 'zod';
import type { AIService } from '../services/ai-service';
import type { ZoteroItem } from '../types';
import type { EvidenceExtraction } from '../ai/types';
import type { ClassificationResult, Domain } from './types';
import { getDomainFromItemType } from './domain-hints';

/**
 * Zod schema for validating LLM classification response
 *
 * Expected JSON format from LLM:
 * {
 *   "domain": "Academic" | "Software" | "Farming" | "General",
 *   "confidence": 0.85,
 *   "reasoning": "Title and abstract contain research methodology..."
 * }
 */
const ClassificationResponseSchema = z.object({
  domain: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

type ClassificationResponse = z.infer<typeof ClassificationResponseSchema>;

/**
 * Domain Classifier
 *
 * Main service for classifying Zotero items into domains.
 * Integrates hard overrides from item type and LLM-based content analysis.
 */
export class DomainClassifier {
  constructor(private aiService: AIService) {}

  /**
   * Classify a Zotero item into a domain category
   *
   * Classification strategy:
   * 1. Check for hard override based on item type (journalArticle → Academic)
   * 2. If no hard override, perform LLM-based content analysis
   * 3. Return classification result with confidence score
   *
   * @param item - Zotero item to classify
   * @param evidence - Extracted evidence (PDF, notes, abstract, or metadata)
   * @returns Promise resolving to classification result with domain and confidence
   *
   * @example
   * ```typescript
   * const result = await classifier.classify(item, evidence);
   * console.log(`Domain: ${result.domain}, Confidence: ${result.confidence}`);
   *
   * if (result.isHardOverride) {
   *   // Item type forced classification (e.g., journalArticle → Academic)
   *   console.log('Classification based on item type');
   * } else {
   *   // Content-based classification via LLM
   *   console.log(`Reasoning: ${result.reasoning}`);
   * }
   * ```
   */
  async classify(
    item: ZoteroItem,
    evidence: EvidenceExtraction
  ): Promise<ClassificationResult> {
    // Step 1: Check for hard override based on item type
    const hardDomain = getDomainFromItemType(item.itemType);
    if (hardDomain) {
      return {
        domain: hardDomain,
        confidence: 1.0, // Certain
        reasoning: `Item type "${item.itemType}" forces ${hardDomain} classification`,
        isHardOverride: true,
        sources: ['item_type'],
      };
    }

    // Step 2: Perform content-based classification via LLM
    const classification = await this.classifyByContent(item, evidence);

    return classification;
  }

  /**
   * Classify item by content analysis using LLM
   *
   * Builds a classification prompt with available metadata and evidence,
   * sends to LLM for analysis, and parses the structured JSON response.
   *
   * @param item - Zotero item to classify
   * @param evidence - Extracted evidence content
   * @returns Promise resolving to classification result
   *
   * @private
   */
  private async classifyByContent(
    item: ZoteroItem,
    evidence: EvidenceExtraction
  ): Promise<ClassificationResult> {
    const systemPrompt = `You are a domain classification expert. Classify items into EXACTLY ONE domain:

- Academic: Research papers, textbooks, scholarly articles, technical reports from universities or research institutions. Characterized by formal citations, peer review, academic methodology, and research findings.

- Software: Programming code, library documentation, developer tools, open source projects, API references, technical specifications. Characterized by code examples, technical implementations, software architecture, and engineering practices.

- Farming: Agriculture, crop science, farming practices, agronomy, permaculture, sustainable agriculture, horticulture. Characterized by agricultural terminology, crop management, field-based research, and farming techniques.

- General: News articles, blogs, news media, miscellaneous content that doesn't fit other domains. Used as fallback when content spans multiple domains or doesn't clearly belong to Academic, Software, or Farming.

Respond with JSON only: { "domain": "Domain", "confidence": 0.95, "reasoning": "Brief explanation" }

Confidence scoring:
- 0.90-1.0: Very confident, clear domain indicators
- 0.70-0.89: Confident, domain is clear but some ambiguity
- 0.40-0.69: Uncertain, multiple domains possible
- 0.0-0.39: Very uncertain, ambiguous content

Be conservative with confidence scores. When uncertain, lower the confidence.`;

    const userPrompt = this.buildClassificationPrompt(item, evidence);

    try {
      const response = await this.aiService.complete({
        systemPrompt,
        prompt: userPrompt,
        temperature: 0.3, // Low temperature for consistent classification
        maxTokens: 200,
        model: this.aiService.getCurrentModel() || 'gemini-3-flash-preview',
      });

      // Parse LLM response for domain + confidence
      const result = this.parseClassificationResponse(response.content);

      return {
        domain: result.domain,
        confidence: result.confidence,
        reasoning: result.reasoning,
        isHardOverride: false,
        sources: this.getSourcesList(item, evidence),
      };
    } catch (error) {
      // Fallback: Classify as General if LLM fails
      console.error('[DomainClassifier] LLM classification failed:', error);
      return {
        domain: 'General',
        confidence: 0.3, // Low confidence on fallback
        reasoning: `Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}. Defaulting to General.`,
        isHardOverride: false,
        sources: ['fallback'],
      };
    }
  }

  /**
   * Build classification prompt from item metadata and evidence
   *
   * Includes all available metadata (title, authors, year, tags) and
   * evidence content (abstract, fulltext excerpt, or notes).
   *
   * @param item - Zotero item
   * @param evidence - Extracted evidence
   * @returns Formatted prompt string for LLM
   *
   * @private
   */
  private buildClassificationPrompt(
    item: ZoteroItem,
    evidence: EvidenceExtraction
  ): string {
    let prompt = 'Classify this item:\n\n';

    // Include metadata
    prompt += `Title: ${item.title}\n`;

    if (item.authors.length > 0) {
      prompt += `Authors: ${item.authors.slice(0, 3).join(', ')}${item.authors.length > 3 ? ', ...' : ''}\n`;
    }

    prompt += `Item Type: ${item.itemType}\n`;
    prompt += `Year: ${item.year || 'unknown'}\n`;

    // Include abstract if available
    if (item.abstract) {
      const abstractExcerpt = item.abstract.substring(0, 500);
      prompt += `\nAbstract: ${abstractExcerpt}${item.abstract.length > 500 ? '...' : ''}\n`;
    }

    // Include evidence content based on level
    if (evidence.level === 'FullText' || evidence.level === 'Notes') {
      // Use first 1000 characters of fulltext or notes
      const contentExcerpt = evidence.content.substring(0, 1000);
      prompt += `\nContent excerpt (${evidence.level}): ${contentExcerpt}${evidence.content.length > 1000 ? '...' : ''}\n`;
    } else if (evidence.level === 'Abstract') {
      // Abstract already included above, note it as source
      prompt += `\n(Classification based on abstract only)\n`;
    } else if (evidence.level === 'MetadataOnly') {
      // Metadata-only classification
      prompt += `\n(Classification based on metadata only - limited information)\n`;
    }

    // Include journal if available (strong Academic signal)
    if (item.journal) {
      prompt += `\nJournal/Publisher: ${item.journal}\n`;
    }

    prompt += '\nProvide classification as JSON with domain, confidence (0-1), and reasoning.';

    return prompt;
  }

  /**
   * Parse LLM classification response
   *
   * Extracts JSON from LLM response text, validates with Zod schema,
   * normalizes domain name, and clamps confidence to 0.0-1.0 range.
   *
   * @param content - Raw LLM response text
   * @returns Parsed classification with domain, confidence, reasoning
   *
   * @private
   */
  private parseClassificationResponse(content: string): {
    domain: Domain;
    confidence: number;
    reasoning: string;
  } {
    try {
      // Extract JSON from response (LLM may add text around it)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate with Zod schema
      const validated = ClassificationResponseSchema.parse(parsed);

      // Normalize domain string (handle variations and synonyms)
      const domain = this.normalizeDomain(validated.domain);

      // Clamp confidence to 0.0-1.0 range
      const confidence = Math.min(1.0, Math.max(0.0, validated.confidence));

      return {
        domain,
        confidence,
        reasoning: validated.reasoning || 'No reasoning provided',
      };
    } catch (error) {
      // Fallback if parsing fails
      throw new Error(
        `Failed to parse classification response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Normalize domain string to canonical form
   *
   * Handles case variations and domain synonyms:
   * - "academic" / "research" / "scholarly" → "Academic"
   * - "software" / "code" / "programming" → "Software"
   * - "farming" / "agriculture" → "Farming"
   * - All others → "General"
   *
   * @param domain - Domain string from LLM (may be lowercase or synonym)
   * @returns Canonical Domain type
   *
   * @private
   */
  private normalizeDomain(domain: string): Domain {
    const normalized = domain.toLowerCase().trim();

    if (
      normalized.includes('academic') ||
      normalized.includes('research') ||
      normalized.includes('scholarly')
    ) {
      return 'Academic';
    }

    if (
      normalized.includes('software') ||
      normalized.includes('code') ||
      normalized.includes('programming')
    ) {
      return 'Software';
    }

    if (
      normalized.includes('farm') ||
      normalized.includes('agriculture') ||
      normalized.includes('agronomy')
    ) {
      return 'Farming';
    }

    return 'General';
  }

  /**
   * Build sources list for classification result
   *
   * Indicates which data was analyzed during classification.
   *
   * @param item - Zotero item
   * @param evidence - Evidence extraction
   * @returns Array of source names
   *
   * @private
   */
  private getSourcesList(
    item: ZoteroItem,
    evidence: EvidenceExtraction
  ): string[] {
    const sources: string[] = ['title'];

    if (item.abstract) {
      sources.push('abstract');
    }

    if (evidence.level === 'FullText') {
      sources.push('fulltext');
    } else if (evidence.level === 'Notes') {
      sources.push('notes');
    }

    if (item.journal) {
      sources.push('journal');
    }

    return sources;
  }
}
