/**
 * Domain Hints - Item Type to Domain Mapping
 *
 * Provides hard classification overrides based on Zotero item types.
 * Certain item types (journalArticle, book, thesis, etc.) always map to
 * Academic domain regardless of content, because their structural nature
 * definitionally indicates scholarly work.
 *
 * Other item types (webpage, videoRecording, blogPost, etc.) allow soft
 * classification via LLM-based content analysis, as they can span multiple
 * domains (software documentation, farming blog, news article, etc.).
 *
 * Decision rationale per Phase 15 context:
 * - Item type is the strongest signal for classification
 * - Scholarly publication types have formal structure and peer review
 * - Web-based types require content analysis to determine domain
 */

import type { Domain } from './types';

/**
 * Hard overrides mapping Zotero item types to domains
 *
 * Item types mapped here bypass LLM-based content classification and
 * always return the specified domain with confidence = 1.0.
 *
 * Rationale for Academic mappings:
 * - journalArticle: Peer-reviewed scholarly publication
 * - book: Published academic or technical monograph
 * - bookSection: Chapter in academic or technical book
 * - thesis: Graduate research thesis or dissertation
 * - report: Technical report, white paper, research brief
 * - conferencePaper: Peer-reviewed conference proceedings
 *
 * Item types NOT mapped (allow soft classification):
 * - webpage: Can be software docs, farming blog, news, etc.
 * - videoRecording: Can be tutorial, research talk, farming how-to, etc.
 * - blogPost: Domain varies by content
 * - forumPost: Domain varies by content
 * - podcast: Domain varies by content
 * - presentation: Domain varies by content (unless from conference)
 * - document: Generic document, needs content analysis
 * - attachment: Not a standalone item
 *
 * Reference: Zotero item types from src/types.ts (ZoteroItem.itemType)
 */
export const DOMAIN_HINTS: Record<string, Domain | undefined> = {
  // Scholarly publication types → Academic (hard override)
  'journalArticle': 'Academic',
  'book': 'Academic',
  'bookSection': 'Academic',
  'thesis': 'Academic',
  'report': 'Academic',
  'conferencePaper': 'Academic',

  // Other types → undefined (soft classification via LLM)
  'webpage': undefined,
  'videoRecording': undefined,
  'blogPost': undefined,
  'forumPost': undefined,
  'podcast': undefined,
  'presentation': undefined,
  'document': undefined,
  'magazineArticle': undefined,
  'newspaperArticle': undefined,
};

/**
 * Get domain from item type if hard override exists
 *
 * Checks if the given Zotero item type has a hard classification override.
 * Returns the domain if override exists, null if content-based classification
 * is required.
 *
 * @param itemType - Zotero item type (e.g., 'journalArticle', 'webpage')
 * @returns Domain if hard override exists, null if soft classification needed
 *
 * @example
 * ```typescript
 * const domain1 = getDomainFromItemType('journalArticle');
 * // Returns: 'Academic' (hard override)
 *
 * const domain2 = getDomainFromItemType('webpage');
 * // Returns: null (requires content analysis)
 * ```
 */
export function getDomainFromItemType(itemType: string): Domain | null {
  const domain = DOMAIN_HINTS[itemType];
  return domain ?? null;
}

/**
 * Check if item type forces Academic domain classification
 *
 * Helper function to quickly determine if an item type is a scholarly
 * publication that bypasses content-based classification.
 *
 * @param itemType - Zotero item type
 * @returns True if item type forces Academic domain
 *
 * @example
 * ```typescript
 * if (isAcademicItemType(item.itemType)) {
 *   // Skip LLM classification, use Academic template
 *   return { domain: 'Academic', confidence: 1.0, isHardOverride: true };
 * }
 * ```
 */
export function isAcademicItemType(itemType: string): boolean {
  return getDomainFromItemType(itemType) === 'Academic';
}

/**
 * Check if item type requires content-based classification
 *
 * Inverse of hard override check. Returns true if LLM-based content
 * analysis is needed to determine domain.
 *
 * @param itemType - Zotero item type
 * @returns True if LLM classification required
 *
 * @example
 * ```typescript
 * if (requiresContentClassification(item.itemType)) {
 *   // Analyze title, abstract, evidence content via LLM
 *   const result = await classifyByContent(item, evidence);
 *   return result;
 * }
 * ```
 */
export function requiresContentClassification(itemType: string): boolean {
  return getDomainFromItemType(itemType) === null;
}
