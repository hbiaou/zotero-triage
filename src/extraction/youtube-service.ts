/**
 * YouTube Transcript Extraction Service
 *
 * Provides automatic transcript fetching for YouTube videos using
 * the youtube-transcript package. Handles URL detection, transcript
 * parsing, and error mapping to TranscriptExtractionError.
 */

import { YoutubeTranscript } from 'youtube-transcript';
import type { TranscriptExtraction } from './types';
import { TranscriptExtractionError } from './types';

/**
 * YouTube video transcript extraction service
 *
 * Stateless service for fetching transcripts from YouTube videos.
 * Supports both youtube.com and youtu.be URL formats.
 *
 * Usage:
 * ```typescript
 * const service = new YouTubeService();
 * if (service.detectYouTubeUrl(url)) {
 *   const extraction = await service.fetchTranscript(url);
 *   console.log(`Transcript: ${extraction.transcript.slice(0, 100)}...`);
 * }
 * ```
 */
export class YouTubeService {
  /**
   * Detect if URL is a YouTube video
   *
   * Supports both standard and short URL formats:
   * - https://www.youtube.com/watch?v=VIDEO_ID
   * - https://youtu.be/VIDEO_ID
   * - https://m.youtube.com/watch?v=VIDEO_ID
   *
   * @param url - URL to check
   * @returns True if URL is a YouTube video URL
   */
  detectYouTubeUrl(url: string): boolean {
    if (!url) {
      return false;
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Match youtube.com, www.youtube.com, m.youtube.com
      if (hostname.includes('youtube.com')) {
        return true;
      }

      // Match youtu.be
      if (hostname === 'youtu.be') {
        return true;
      }

      return false;
    } catch {
      // Invalid URL
      return false;
    }
  }

  /**
   * Fetch transcript for a YouTube video
   *
   * Automatically extracts transcript from YouTube's caption data.
   * Handles multiple languages (prefers English if available).
   *
   * @param url - YouTube video URL
   * @returns Promise resolving to transcript extraction
   * @throws TranscriptExtractionError if transcript unavailable or API fails
   */
  async fetchTranscript(url: string): Promise<TranscriptExtraction> {
    try {
      // Fetch transcript segments from YouTube
      const segments = await YoutubeTranscript.fetchTranscript(url);

      if (!segments || segments.length === 0) {
        throw new TranscriptExtractionError(
          'Video has no captions available',
          'youtube',
          { requiresManualInput: true }
        );
      }

      // Extract text from segments and join with spaces
      const transcriptText = segments
        .map(segment => segment.text)
        .join(' ');

      // Calculate word count for token estimation
      const wordCount = transcriptText.split(/\s+/).filter(w => w.length > 0).length;

      return {
        platform: 'youtube',
        transcript: transcriptText,
        wordCount,
        language: segments[0]?.lang || 'en', // Default to English
        source: 'auto',
        sourceUrl: url
      };
    } catch (err) {
      // If already a TranscriptExtractionError, re-throw
      if (err instanceof TranscriptExtractionError) {
        throw err;
      }

      // Map other errors to TranscriptExtractionError
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Failed to fetch YouTube transcript for ${url}: ${errorMessage}`);

      // Determine if manual input should be suggested
      const requiresManualInput = this.shouldSuggestManualInput(errorMessage);

      throw new TranscriptExtractionError(
        `YouTube transcript extraction failed: ${errorMessage}`,
        'youtube',
        { requiresManualInput }
      );
    }
  }

  /**
   * Determine if error should suggest manual transcript input
   *
   * Some errors indicate transcript is simply unavailable (suggest manual input).
   * Others indicate API issues (don't suggest manual input, may be temporary).
   *
   * @param errorMessage - Error message from youtube-transcript
   * @returns True if manual input should be suggested
   */
  private shouldSuggestManualInput(errorMessage: string): boolean {
    const lowerError = errorMessage.toLowerCase();

    // Captions disabled or not available - manual input helpful
    if (lowerError.includes('no caption') ||
        lowerError.includes('disabled') ||
        lowerError.includes('not available')) {
      return true;
    }

    // Network or API errors - may be temporary, don't suggest manual input
    if (lowerError.includes('network') ||
        lowerError.includes('timeout') ||
        lowerError.includes('api')) {
      return false;
    }

    // Default: suggest manual input (conservative approach)
    return true;
  }
}
