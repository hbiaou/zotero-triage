/**
 * Zod Validation Schemas for Zotero Item Types
 *
 * Defines validation rules for different item types using Zod schemas.
 * Per RESEARCH.md Pattern 1: Schema per item type with required fields.
 */

import { z } from 'zod';

/**
 * Schema for journal article items
 *
 * Required fields per CONTEXT.md:
 * - title: Article title
 * - authors: At least one author
 * - journal: Journal name (maps to publicationTitle in Zotero)
 * - year: Publication year (extracted from date field)
 * - doi: Digital Object Identifier
 *
 * Note: Uses nullable() because Zotero fields can be null
 */
export const JournalArticleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  authors: z.array(z.string()).min(1, 'At least one author is required'),
  journal: z.string().min(1, 'Journal name is required').nullable(),
  year: z.string().min(1, 'Publication year is required').nullable(),
  doi: z.string().min(1, 'DOI is required').nullable(),
  // Optional fields that can be validated if present
  abstract: z.string().nullable().optional(),
  volume: z.string().nullable().optional(),
  pages: z.string().nullable().optional()
});

/**
 * Schema for book items
 *
 * Required fields per CONTEXT.md:
 * - title: Book title
 * - authors: At least one author or editor
 * - year: Publication year (extracted from date field)
 * - publisher: Publisher name
 *
 * Note: ISBN is optional per plan requirements
 */
export const BookSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  authors: z.array(z.string()).min(1, 'At least one author or editor is required'),
  year: z.string().min(1, 'Publication year is required').nullable(),
  publisher: z.string().min(1, 'Publisher is required').nullable(),
  // Optional fields that can be validated if present
  isbn: z.string().nullable().optional()
});

/**
 * Map of item types to their validation schemas
 *
 * Keys are lowercase item type identifiers from Zotero
 * (e.g., 'journalArticle', 'book')
 */
export const ITEM_TYPE_SCHEMAS: Record<string, z.ZodSchema> = {
  journalArticle: JournalArticleSchema,
  book: BookSchema
};
