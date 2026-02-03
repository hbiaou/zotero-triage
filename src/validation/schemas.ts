/**
 * Zod Validation Schemas for Zotero Item Types and Enriched Notes
 *
 * Defines validation rules for:
 * 1. Different Zotero item types using Zod schemas (Phase 3)
 * 2. YAML frontmatter validation for enriched literature notes (Phase 16)
 * 3. Full enriched note structure validation (Phase 16)
 *
 * Per RESEARCH.md Pattern 1: Schema per item type with required fields.
 *
 * DESIGN NOTE: Required fields are intentionally hardcoded (not dynamically configurable).
 * This design decision is based on Phase 3 research findings that identified minimal
 * viable metadata for academic literature. Per-field configuration adds complexity
 * without clear user value, as users can override validation at triage time via
 * "Accept Anyway" button if needed for edge cases.
 */

import { z } from 'zod';
import type { Domain } from '../classification/types';
import type { EvidenceLevel } from '../ai/types';

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

// ============================================================================
// Phase 16: Enriched Note Validation Schemas
// ============================================================================

/**
 * YAML Frontmatter Schema for enriched literature notes
 *
 * Validates the YAML frontmatter structure inserted by AI enrichment.
 * Ensures all required metadata fields are present with correct types.
 *
 * Required fields:
 * - note_type: Always 'literature-note' for enriched notes
 * - zotero_item_type: Zotero item type (journalArticle, book, etc.)
 * - knowledge_domain: Classification domain (Academic, Software, Farming, General)
 * - evidence_level: Evidence hierarchy level (FullText, Transcript, Notes, Abstract, MetadataOnly)
 * - template_used: Template applied during enrichment (ACADEMIC, SOFTWARE, FARMING, GENERAL)
 * - date_processed: Processing date in YYYY-MM-DD format
 *
 * Optional fields:
 * - zotero_key: Zotero item key for linking
 * - doi: Digital Object Identifier
 * - url: Item URL
 * - confidence_score: Classification confidence (0.0-1.0)
 * - model_used: AI model identifier
 * - token_count: Token usage estimate
 *
 * Uses .passthrough() to allow additional custom fields for extensibility.
 */
export const YAMLFrontmatterSchema = z.object({
  note_type: z.literal('literature-note'),
  zotero_item_type: z.enum([
    'journalArticle',
    'book',
    'thesis',
    'webpage',
    'document',
    'videoRecording',
    'conferencePaper',
    'report',
    'bookSection',
    'manuscript',
    'preprint'
  ]),
  knowledge_domain: z.enum(['Academic', 'Software', 'Farming', 'General']),
  evidence_level: z.enum(['FullText', 'Transcript', 'Notes', 'Abstract', 'MetadataOnly']),
  template_used: z.enum(['ACADEMIC', 'SOFTWARE', 'FARMING', 'GENERAL']),
  date_processed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),

  // Optional fields
  zotero_key: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().url().optional(),
  confidence_score: z.number().min(0).max(1).optional(),
  model_used: z.string().optional(),
  token_count: z.number().int().positive().optional(),

  // Allow additional fields for extensibility
}).passthrough();

export type YAMLFrontmatter = z.infer<typeof YAMLFrontmatterSchema>;

/**
 * Enriched Note Schema
 *
 * Validates the full structure of an enriched note including:
 * - Frontmatter: Validated YAML metadata
 * - Body: Markdown content (minimum 100 characters)
 * - Structure: Presence of headings and tags
 */
export const EnrichedNoteSchema = z.object({
  frontmatter: YAMLFrontmatterSchema,
  body: z.string().min(100, 'Body must be at least 100 characters'),
  hasHeadings: z.boolean().default(true), // Verify markdown structure
  hasTags: z.boolean().default(true)      // Verify tags present
});

export type ValidatedNote = z.infer<typeof EnrichedNoteSchema>;

/**
 * Schema validation error
 *
 * Normalized error format for Zod validation failures.
 * Makes errors human-readable for logging and user display.
 */
export interface SchemaValidationError {
  field: string;
  message: string;
  received?: any;
  expected?: string;
}

/**
 * Format Zod errors into normalized error objects
 *
 * Converts Zod's internal error format into a simpler structure
 * suitable for logging and user-facing error messages.
 *
 * @param errors - Zod validation error object
 * @returns Array of normalized validation errors
 */
export function formatZodErrors(errors: z.ZodError): SchemaValidationError[] {
  return errors.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    received: err.code === 'invalid_type' ? (err as any).received : undefined,
    expected: err.code === 'invalid_type' ? (err as any).expected : undefined
  }));
}
