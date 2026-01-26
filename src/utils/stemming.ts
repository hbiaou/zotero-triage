/**
 * Tag Normalization and Stemming Utilities
 *
 * Provides centralized tag normalization for consistent matching across:
 * - Profile initialization (extracting tags from seed papers)
 * - Recommendation scoring (matching item tags to profile)
 * - Adaptive learning (updating tag weights from feedback)
 */

/**
 * Simple suffix-based stemmer
 * Handles common English suffixes for basic stemming without external dependencies
 */
function simpleStemmer(word: string): string {
  // Common suffix removal rules (simplified Porter stemmer logic)
  const suffixes = [
    { pattern: /ies$/, replacement: 'y', minLength: 4 },
    { pattern: /es$/, replacement: '', minLength: 3 },
    { pattern: /s$/, replacement: '', minLength: 3 },
    { pattern: /ing$/, replacement: '', minLength: 4 },
    { pattern: /ed$/, replacement: '', minLength: 3 },
    { pattern: /ly$/, replacement: '', minLength: 4 },
    { pattern: /er$/, replacement: '', minLength: 3 },
    { pattern: /or$/, replacement: '', minLength: 3 },
  ];

  for (const { pattern, replacement, minLength } of suffixes) {
    if (word.length > minLength && pattern.test(word)) {
      return word.replace(pattern, replacement);
    }
  }

  return word;
}

/**
 * Normalize tag for matching with profile
 *
 * Algorithm:
 * 1. Lowercase for case-insensitive matching
 * 2. Trim whitespace
 * 3. Apply simple stemmer for linguistic normalization
 *    - 'networks' -> 'network'
 *    - 'running' -> 'run'
 *    - 'learning' -> 'learn'
 *
 * @param tag - Raw tag from item or user input
 * @returns Normalized tag suitable for matching
 */
export function normalizeTag(tag: string): string {
  if (!tag || typeof tag !== 'string') {
    return '';
  }

  // Step 1: Lowercase and trim
  const lowercased = tag.trim().toLowerCase();

  if (lowercased.length === 0) {
    return '';
  }

  // Step 2: Apply simple stemmer
  // Converts variations to base form for better matching
  const stemmed = simpleStemmer(lowercased);

  return stemmed;
}

/**
 * Filter noise tags (workflow metadata and annotation tags)
 *
 * Noise tags are non-content tags that shouldn't contribute to recommendations:
 * - Workflow tags: 'to-read', 'important', 'review', 'inbox', etc.
 * - Annotation tags: 'custom-color-*', 'highlight-*', 'annotation-*' (Phase 6)
 *
 * These tags are user workflow metadata, not research content signals.
 *
 * @param tag - Normalized tag to check
 * @returns true if tag is noise (should be filtered), false if content tag
 */
export function isNoiseTag(tag: string): boolean {
  // Workflow tags (exact match on normalized form)
  const workflowPatterns = [
    /^to-read$/,
    /^important$/,
    /^review$/,
    /^inbox$/,
    /^needs-processing$/,
    /^skip$/,
    /^archived$/,
    /^duplicate$/,
    /^wip$/,
    /^reading-list$/
  ];

  // Annotation tags (defensive: Phase 6 claims already filtered, but defense-in-depth)
  // Pattern: custom-color-*, highlight-*, annotation-*
  const annotationPatterns = [
    /^custom-color-/i,
    /^highlight-/i,
    /^annotation-/i
  ];

  // Check workflow patterns
  for (const pattern of workflowPatterns) {
    if (pattern.test(tag)) {
      return true;
    }
  }

  // Check annotation patterns
  for (const pattern of annotationPatterns) {
    if (pattern.test(tag)) {
      return true;
    }
  }

  return false;
}
