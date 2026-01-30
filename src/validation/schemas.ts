/**
 * Zod Validation Schemas for Zotero Item Types
 *
 * Defines validation rules for different item types using Zod schemas.
 * Per RESEARCH.md Pattern 1: Schema per item type with required fields.
 *
 * DESIGN NOTE: Required fields are intentionally hardcoded (not dynamically configurable).
 * This design decision is based on Phase 3 research findings that identified minimal
 * viable metadata for academic literature. Per-field configuration adds complexity
 * without clear user value, as users can override validation at triage time via
 * "Accept Anyway" button if needed for edge cases.
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
 * Schema for video recording items
 *
 * Required fields per user requirement (quick-013):
 * - title: Video title
 * - url: Video URL (YouTube, Vimeo, etc.)
 *
 * Note: User also requires "at least one child note must exist" but this
 * cannot be validated at the schema level (requires database query for child items).
 * This validation should be handled at import time if needed in future.
 */
export const VideoRecordingSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  url: z.string().min(1, 'URL is required').nullable()
});

/**
 * Map of item types to their validation schemas
 *
 * Keys are lowercase item type identifiers from Zotero
 * (e.g., 'journalArticle', 'book', 'videoRecording')
 */
export const ITEM_TYPE_SCHEMAS: Record<string, z.ZodSchema> = {
  journalArticle: JournalArticleSchema,
  book: BookSchema,
  videoRecording: VideoRecordingSchema
};
