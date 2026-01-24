/**
 * Keyword Extraction Utility
 *
 * Provides frequency-based keyword extraction from text (titles, abstracts).
 * Uses simple tokenization, stopword filtering, and frequency counting.
 * Suitable for academic paper text analysis.
 */

/**
 * Common English stopwords to filter out
 * These are high-frequency words that carry little semantic meaning
 */
const STOPWORDS = new Set([
  // Articles
  'the', 'a', 'an',
  // Conjunctions
  'and', 'or', 'but', 'nor', 'yet', 'so',
  // Prepositions
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'by', 'about',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'among', 'under', 'over',
  // Pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their', 'this',
  'that', 'these', 'those', 'who', 'which', 'what', 'where', 'when', 'why', 'how',
  // Verbs (common forms)
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'must', 'can', 'shall',
  // Other common words
  'not', 'no', 'yes', 'if', 'then', 'than', 'such', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'any', 'all', 'very', 'much', 'many',
  'including', 'without', 'within', 'since', 'via', 'per'
]);

/**
 * Options for keyword extraction
 */
export interface KeywordExtractionOptions {
  /** Minimum word length to consider (default: 4) */
  minLength?: number;
  /** Maximum number of keywords to return (default: 10) */
  maxKeywords?: number;
}

/**
 * Extract keywords from text using frequency-based approach
 *
 * Algorithm:
 * 1. Lowercase and tokenize (split on whitespace/punctuation)
 * 2. Filter stopwords
 * 3. Filter by minimum length
 * 4. Count frequency of each term
 * 5. Return top N terms by frequency
 *
 * @param text - Text to extract keywords from (title, abstract, etc.)
 * @param options - Extraction options
 * @returns Array of keywords sorted by frequency (most frequent first)
 */
export function extractKeywords(
  text: string,
  options: KeywordExtractionOptions = {}
): string[] {
  const { minLength = 4, maxKeywords = 10 } = options;

  // Handle empty or null input
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Step 1: Lowercase and tokenize
  // Remove punctuation except hyphens (to preserve compound terms like "machine-learning")
  // Then split on whitespace
  const normalized = text.toLowerCase();
  const tokens = normalized
    .replace(/[^\w\s-]/g, ' ') // Replace non-word chars (except hyphen) with space
    .split(/\s+/)              // Split on whitespace
    .filter(token => token.length > 0);

  // Step 2-3: Filter stopwords and short words, handle hyphenated terms
  const validTokens: string[] = [];
  for (const token of tokens) {
    // Split hyphenated terms and process each part
    const parts = token.split('-').filter(p => p.length >= minLength);

    for (const part of parts) {
      if (!STOPWORDS.has(part) && part.length >= minLength) {
        // Only keep alphabetic terms (filter out pure numbers)
        if (/[a-z]/.test(part)) {
          validTokens.push(part);
        }
      }
    }
  }

  // Handle edge case: single word
  if (validTokens.length === 1) {
    return validTokens;
  }

  // Step 4: Count frequency
  const frequency = new Map<string, number>();
  for (const token of validTokens) {
    frequency.set(token, (frequency.get(token) || 0) + 1);
  }

  // Step 5: Sort by frequency and return top N
  const sortedKeywords = Array.from(frequency.entries())
    .sort((a, b) => {
      // Sort by frequency descending
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      // If same frequency, sort alphabetically for consistency
      return a[0].localeCompare(b[0]);
    })
    .slice(0, maxKeywords)
    .map(entry => entry[0]);

  return sortedKeywords;
}

/**
 * Extract keywords from multiple text sources and merge results
 * Useful for extracting from title + abstract together
 *
 * @param texts - Array of text strings to process
 * @param options - Extraction options
 * @returns Merged and deduplicated keywords
 */
export function extractKeywordsFromMultiple(
  texts: (string | null)[],
  options: KeywordExtractionOptions = {}
): string[] {
  // Combine all non-null texts
  const combined = texts
    .filter(t => t !== null && t !== undefined)
    .join(' ');

  return extractKeywords(combined, options);
}
