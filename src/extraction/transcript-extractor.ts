/**
 * Transcript Extraction Orchestrator
 *
 * Coordinates video transcript extraction across multiple platforms.
 * Automatically fetches transcripts from supported platforms (YouTube)
 * and throws errors for unsupported platforms to trigger manual input flow.
 */

import type { TranscriptExtraction, TranscriptPlatform } from './types';
import { TranscriptExtractionError } from './types';
import { YouTubeService } from './youtube-service';

/**
 * Transcript extraction orchestrator
 *
 * Central service for extracting video transcripts from URLs.
 * Detects platform, delegates to appropriate service, and handles fallback
 * to manual transcript input when automatic extraction fails.
 *
 * Usage:
 * ```typescript
 * const extractor = new TranscriptExtractor(new YouTubeService());
 * try {
 *   const extraction = await extractor.extractTranscript(videoUrl);
 *   console.log(`Got ${extraction.wordCount} words from ${extraction.platform}`);
 * } catch (err) {
 *   if (err instanceof TranscriptExtractionError && err.requiresManualInput) {
 *     // Show manual input modal
 *     const modal = new TranscriptModal(app, item, onConfirm, onCancel);
 *     modal.open();
 *   }
 * }
 * ```
 */
export class TranscriptExtractor {
  private youtubeService: YouTubeService;

  /**
   * Create transcript extractor
   *
   * @param youtubeService - YouTube transcript service
   */
  constructor(youtubeService: YouTubeService) {
    this.youtubeService = youtubeService;
  }

  /**
   * Detect video platform from URL
   *
   * Analyzes URL to determine which platform it belongs to.
   * Used to route extraction to appropriate service.
   *
   * @param url - Video URL to analyze
   * @returns Platform identifier
   */
  private detectPlatform(url: string): TranscriptPlatform {
    if (!url) {
      return 'unsupported';
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // YouTube detection (youtube.com, www.youtube.com, m.youtube.com, youtu.be)
      if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
        return 'youtube';
      }

      // Vimeo detection
      if (hostname.includes('vimeo.com')) {
        return 'vimeo';
      }

      // Unknown platform
      return 'unsupported';
    } catch {
      // Invalid URL
      return 'unsupported';
    }
  }

  /**
   * Extract transcript from video URL
   *
   * Automatically fetches transcript for supported platforms.
   * Throws TranscriptExtractionError for unsupported platforms or failures.
   *
   * Supported platforms:
   * - YouTube: Automatic via youtube-transcript package
   * - Vimeo: Manual input required (throws error)
   * - Others: Manual input required (throws error)
   *
   * @param url - Video URL
   * @returns Promise resolving to transcript extraction
   * @throws TranscriptExtractionError with requiresManualInput flag
   */
  async extractTranscript(url: string): Promise<TranscriptExtraction> {
    const platform = this.detectPlatform(url);

    switch (platform) {
      case 'youtube':
        // Delegate to YouTube service
        return await this.youtubeService.fetchTranscript(url);

      case 'vimeo':
        // Vimeo doesn't provide automatic transcript API
        throw new TranscriptExtractionError(
          'Vimeo transcripts must be manually provided. Please paste the transcript from Vimeo or skip enrichment.',
          'vimeo',
          { requiresManualInput: true }
        );

      case 'unsupported':
        // Platform not recognized or URL invalid
        throw new TranscriptExtractionError(
          'Platform not supported for automatic transcript extraction. Please paste transcript manually or skip enrichment.',
          'unsupported',
          { requiresManualInput: true }
        );

      default:
        // Exhaustive check - should never reach here
        throw new TranscriptExtractionError(
          `Unknown platform: ${platform}`,
          platform,
          { requiresManualInput: true }
        );
    }
  }

  /**
   * Create manual transcript extraction result
   *
   * Used when user provides transcript via manual input modal.
   * Calculates word count and creates properly typed extraction.
   *
   * @param transcript - User-provided transcript text
   * @param sourceUrl - Original video URL (optional)
   * @returns Transcript extraction with source='manual'
   */
  createManualExtraction(transcript: string, sourceUrl: string = ''): TranscriptExtraction {
    const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;

    return {
      platform: 'manual',
      transcript,
      wordCount,
      language: undefined, // Unknown for manual input
      source: 'manual',
      sourceUrl
    };
  }
}
