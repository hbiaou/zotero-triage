/**
 * Template functions for literature note generation
 *
 * Provides YAML frontmatter generation and formatting utilities
 * for creating structured literature notes from Zotero items.
 */

import type { ZoteroItem } from '../db/zotero-connector';

/**
 * Escape a string for safe YAML output.
 *
 * - Returns empty string for null/undefined
 * - Wraps in double quotes if contains special characters
 * - Escapes internal quotes and backslashes
 *
 * @param str - String to escape
 * @returns YAML-safe string
 */
export function escapeYaml(str: string | null | undefined): string {
  if (str === null || str === undefined) {
    return '';
  }

  // Check if string needs quoting
  const needsQuoting =
    str.includes(':') ||
    str.includes('#') ||
    str.includes('"') ||
    str.includes("'") ||
    str.includes('\n') ||
    str.includes('\r') ||
    str.startsWith(' ') ||
    str.startsWith('\t') ||
    str.endsWith(' ') ||
    str.endsWith('\t') ||
    str.startsWith('-') ||
    str.startsWith('[') ||
    str.startsWith('{') ||
    str.startsWith('*') ||
    str.startsWith('&') ||
    str.startsWith('!') ||
    str.startsWith('|') ||
    str.startsWith('>') ||
    str.startsWith('%') ||
    str.startsWith('@') ||
    str.startsWith('`') ||
    str === 'true' ||
    str === 'false' ||
    str === 'null' ||
    str === 'yes' ||
    str === 'no' ||
    /^\d/.test(str);

  if (!needsQuoting) {
    return str;
  }

  // Escape backslashes first, then double quotes
  const escaped = str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  return `"${escaped}"`;
}

/**
 * Format an array of authors for YAML list format.
 *
 * @param authors - Array of author names
 * @returns YAML formatted author list
 */
export function formatAuthorsYaml(authors: string[]): string {
  if (!authors || authors.length === 0) {
    return '  - "Unknown"';
  }

  return authors
    .map(author => {
      // Always quote author names to handle special characters
      const escaped = author
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
      return `  - "${escaped}"`;
    })
    .join('\n');
}

/**
 * Format an array of tags for YAML list format.
 *
 * @param tags - Array of tag names
 * @returns YAML formatted tag list, or empty string if no tags
 */
export function formatTagsYaml(tags: string[]): string {
  if (!tags || tags.length === 0) {
    return '';
  }

  return tags
    .map(tag => {
      const escaped = tag
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
      return `  - "${escaped}"`;
    })
    .join('\n');
}

/**
 * Format abstract for YAML block scalar.
 *
 * Uses the folded style (>) for multiline text.
 *
 * @param abstract - Abstract text
 * @returns YAML formatted abstract block
 */
export function formatAbstractYaml(abstract: string | null): string {
  if (!abstract) {
    return '';
  }

  // Normalize whitespace and indent each line for block scalar
  const lines = abstract
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => `  ${line.trim()}`)
    .join('\n');

  return `>\n${lines}`;
}

/**
 * Generate YAML frontmatter for a Zotero item.
 *
 * Creates a complete frontmatter block with all available metadata.
 *
 * @param item - Zotero item to generate frontmatter for
 * @returns Complete YAML frontmatter string including delimiters
 */
export function generateFrontmatter(item: ZoteroItem): string {
  const createdDate = new Date().toISOString().split('T')[0];
  const zoteroLink = `zotero://select/items/0_${item.itemKey}`;

  const lines: string[] = [
    '---',
    `title: ${escapeYaml(item.title)}`,
    'authors:',
    formatAuthorsYaml(item.authors),
    `year: ${escapeYaml(item.year || 'Unknown')}`,
    `doi: ${escapeYaml(item.doi)}`,
    `journal: ${escapeYaml(item.journal)}`,
    `volume: ${escapeYaml(item.volume)}`,
    `pages: ${escapeYaml(item.pages)}`,
    `item-type: ${escapeYaml(item.itemType)}`,
    `zotero-key: ${item.itemKey}`,
    `zotero-link: ${zoteroLink}`,
    `pdf-path: ${escapeYaml(item.pdfPath)}`,
  ];

  // Add tags if present
  if (item.tags && item.tags.length > 0) {
    lines.push('tags:');
    lines.push(formatTagsYaml(item.tags));
  } else {
    lines.push('tags: []');
  }

  // Add abstract with block scalar formatting
  if (item.abstract) {
    lines.push(`abstract: ${formatAbstractYaml(item.abstract)}`);
  } else {
    lines.push('abstract: ""');
  }

  lines.push(`created: ${createdDate}`);
  lines.push('status: unread');
  lines.push('---');

  return lines.join('\n');
}

/**
 * Generate the note body template.
 *
 * Provides structured headings for user to fill in.
 *
 * @returns Markdown note body template
 */
export function generateNoteBody(): string {
  return `
## Summary



## Key Points

-

## Notes



## Quotes

`;
}
