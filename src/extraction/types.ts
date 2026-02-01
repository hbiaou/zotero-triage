/**
 * Video Transcript Extraction Type Definitions
 *
 * Defines types for video platform detection, transcript extraction,
 * and error handling for automatic and manual transcript sources.
 */

/**
 * Supported video platforms for transcript extraction
 *
 * - youtube: Automatic extraction via youtube-transcript package
 * - vimeo: Manual transcript input required
 * - manual: User-provided transcript (platform unknown)
 * - unsupported: Platform detected but no extraction method available
 */
export type TranscriptPlatform = 'youtube' | 'vimeo' | 'manual' | 'unsupported';

/**
 * Transcript extraction result
 *
 * Contains extracted transcript text with metadata about the source,
 * word count, and language detection results.
 */
export interface TranscriptExtraction {
  /** Platform the transcript was extracted from */
  platform: TranscriptPlatform;
  /** Raw transcript text content */
  transcript: string;
  /** Word count for token estimation */
  wordCount: number;
  /** Detected or specified language code (ISO 639-1, e.g., 'en', 'es') */
  language?: string;
  /** How the transcript was obtained */
  source: 'auto' | 'manual';
  /** Source URL (video URL or empty string for manual input) */
  sourceUrl: string;
}

/**
 * Transcript extraction error
 *
 * Custom error class for transcript extraction failures.
 * Indicates whether manual transcript input is required as fallback.
 *
 * Usage:
 * ```typescript
 * if (error.requiresManualInput) {
 *   // Show manual transcript input modal
 *   const modal = new TranscriptModal(...);
 *   modal.open();
 * }
 * ```
 */
export class TranscriptExtractionError extends Error {
  /** Platform identifier where extraction failed */
  public platform: string;
  /** Whether manual transcript paste is required to proceed */
  public requiresManualInput: boolean;

  constructor(
    message: string,
    platform: string,
    options: {
      requiresManualInput?: boolean;
    } = {}
  ) {
    super(message);
    this.name = 'TranscriptExtractionError';
    this.platform = platform;
    this.requiresManualInput = options.requiresManualInput ?? false;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TranscriptExtractionError);
    }
  }
}
