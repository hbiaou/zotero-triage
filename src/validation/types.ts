/**
 * Validation Type Definitions
 *
 * Defines interfaces for validation results and quality gate configuration.
 */

/**
 * Result of validating a Zotero item against quality gates
 */
export interface ValidationResult {
  /** Whether the item passes validation */
  valid: boolean;
  /** Human-readable error messages */
  errors: string[];
  /** List of field names that are missing or invalid */
  missingFields: string[];
}

/**
 * Configuration for quality gate validation rules
 */
export interface QualityGateConfig {
  /** Whether quality gates are enabled (blocks incomplete items) */
  enabled: boolean;
  /** Per-item-type validation rules */
  rules: Record<string, {
    /** Display name of the item type */
    itemType: string;
    /** List of field names that are required */
    requiredFields: string[];
  }>;
}

/**
 * Default quality gate configuration
 *
 * Per CONTEXT.md:
 * - Journal articles require: DOI, year, journal, authors, title
 * - Books require: ISBN, year, publisher, authors, title
 */
export const DEFAULT_QUALITY_GATE_CONFIG: QualityGateConfig = {
  enabled: true,
  rules: {
    journalArticle: {
      itemType: 'Journal Article',
      requiredFields: ['title', 'creators', 'publicationTitle', 'date', 'DOI']
    },
    book: {
      itemType: 'Book',
      requiredFields: ['title', 'creators', 'date', 'publisher']
    }
  }
};
