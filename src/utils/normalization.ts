/**
 * Normalization utilities for cross-platform path and key comparisons
 *
 * Provides case-insensitive comparison utilities to prevent Linux-specific bugs
 * from case-sensitive file systems. Normalizes both file paths and Zotero item keys.
 */

/**
 * Normalize file path for case-insensitive comparison.
 * Converts to lowercase and normalizes path separators.
 *
 * @param filePath - Path to normalize
 * @returns Normalized path (lowercase, forward slashes)
 */
export function normalizePath(filePath: string): string {
  // Convert to lowercase for case-insensitive comparison
  // Normalize separators to forward slash (cross-platform)
  return filePath.toLowerCase().replace(/\\/g, '/');
}

/**
 * Normalize Zotero item key for case-insensitive comparison.
 * Keys are typically uppercase in DB but should be compared case-insensitively.
 *
 * @param key - Item key or ID (string or number)
 * @returns Normalized key string (lowercase)
 */
export function normalizeItemKey(key: string | number): string {
  return String(key).toLowerCase();
}

/**
 * Compare two file paths (case-insensitive, separator-agnostic).
 *
 * @param path1 - First path to compare
 * @param path2 - Second path to compare
 * @returns true if paths are equal (after normalization)
 */
export function pathsEqual(path1: string, path2: string): boolean {
  return normalizePath(path1) === normalizePath(path2);
}

/**
 * Compare two item keys (case-insensitive).
 *
 * @param key1 - First key to compare (string or number)
 * @param key2 - Second key to compare (string or number)
 * @returns true if keys are equal (after normalization)
 */
export function keysEqual(key1: string | number, key2: string | number): boolean {
  return normalizeItemKey(key1) === normalizeItemKey(key2);
}
