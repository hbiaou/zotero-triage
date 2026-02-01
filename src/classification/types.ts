/**
 * Domain Classification Type Definitions
 *
 * Defines types for domain classification of Zotero items into Academic, Software,
 * Farming, or General categories for template-based enrichment in the Accept workflow.
 *
 * Classification uses a two-tier approach:
 * 1. Hard overrides based on item type (journalArticle → Academic)
 * 2. Soft classification via LLM-based content analysis
 *
 * Confidence scores determine whether user override modal is displayed.
 */

/**
 * Supported domain categories for item classification
 *
 * - Academic: Research papers, textbooks, scholarly articles, technical reports from
 *   universities or research institutions. Characterized by formal citation structure,
 *   peer review, and academic methodology.
 *
 * - Software: Programming code, library documentation, developer tools, open source
 *   projects, API references, technical specifications. Characterized by code examples,
 *   technical implementations, and software engineering focus.
 *
 * - Farming: Agriculture, crop science, farming practices, agronomy, permaculture,
 *   sustainable agriculture. Characterized by agricultural terminology, crop management,
 *   and field-based research.
 *
 * - General: News articles, blogs, news media, miscellaneous content that doesn't fit
 *   other domains. Used as fallback when classification is uncertain or content spans
 *   multiple domains.
 */
export type Domain = 'Academic' | 'Software' | 'Farming' | 'General';

/**
 * Result of domain classification for a Zotero item
 *
 * Returned by DomainClassifier after analyzing item metadata and evidence content.
 * Used to determine which domain-specific template should enrich the item during
 * the Accept workflow.
 *
 * @example
 * ```typescript
 * const result: ClassificationResult = {
 *   domain: 'Academic',
 *   confidence: 0.95,
 *   reasoning: 'Item type "journalArticle" forces Academic classification',
 *   isHardOverride: true,
 *   sources: ['item_type']
 * };
 *
 * // Show override modal only if confidence < 0.70 and not a hard override
 * if (result.confidence < 0.70 && !result.isHardOverride) {
 *   await showClassificationModal(result);
 * }
 * ```
 */
export interface ClassificationResult {
  /**
   * Classified domain category
   *
   * Determines which enrichment template is applied to the item.
   */
  domain: Domain;

  /**
   * Confidence score for this classification (0.0-1.0)
   *
   * Interpretation guide:
   * - 1.0: Certain (hard override from item type)
   * - 0.85-0.99: High confidence (LLM classification with strong signal)
   * - 0.70-0.84: Medium confidence (LLM classification, proceed without override)
   * - 0.40-0.69: Low confidence (triggers user override modal per Phase 15 context)
   * - 0.0-0.39: Very low confidence (fallback classification, always show override)
   *
   * Threshold for override modal: < 0.70 per Phase 15 research
   *
   * Note: LLM-based classifications typically fall in 0.65-0.95 range depending on
   * content clarity. Hard overrides always return 1.0.
   */
  confidence: number;

  /**
   * Explanation of classification decision
   *
   * Used for debugging, logging, and displaying to user in override modal.
   * Should be human-readable and concise (1-2 sentences).
   *
   * Examples:
   * - "Item type 'journalArticle' maps to Academic"
   * - "Title and abstract contain farming terminology: crop yield, irrigation, soil"
   * - "Software documentation with code examples and API references"
   */
  reasoning: string;

  /**
   * Whether this classification was determined by item type (hard override)
   *
   * - true: Classification forced by item type (journalArticle, book, thesis, etc.)
   *   Always has confidence = 1.0. Override modal never shown.
   *
   * - false: Classification determined by content analysis via LLM.
   *   Confidence varies based on LLM assessment. Override modal shown if confidence < 0.70.
   *
   * Hard overrides take precedence because certain item types (scholarly publications)
   * are definitionally Academic regardless of content keywords.
   */
  isHardOverride: boolean;

  /**
   * Sources analyzed during classification
   *
   * Indicates what data was used to determine the domain.
   *
   * Possible values:
   * - ['item_type']: Hard override based on Zotero item type only
   * - ['title', 'abstract']: Soft classification from metadata fields
   * - ['title', 'abstract', 'fulltext']: Soft classification with full PDF content
   * - ['title', 'tags']: Soft classification from limited metadata
   *
   * Used for diagnostic logging and confidence adjustment (e.g., abstract-only
   * classifications may have lower confidence than fulltext-based).
   */
  sources: string[];
}
