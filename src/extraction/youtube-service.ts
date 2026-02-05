/**
 * YouTube Transcript Extraction Service
 *
 * Provides automatic transcript fetching for YouTube videos.
 * Implements a robust, dependency-free scraper that mimics the behavior
 * of successful plugins like YTranscript, using Obsidian's requestUrl
 * to bypass CORS and avoid heavy external dependencies.
 */

import { requestUrl } from 'obsidian';
import type { TranscriptExtraction } from './types';
import { TranscriptExtractionError } from './types';

interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

/**
 * YouTube video transcript extraction service
 *
 * Stateless service for fetching transcripts from YouTube videos.
 * Supports both youtube.com and youtu.be URL formats.
 */
export class YouTubeService {

  /**
   * Detect if URL is a YouTube video
   */
  detectYouTubeUrl(url: string): boolean {
    if (!url) return false;
    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname.toLowerCase();
      return host.includes('youtube.com') || host === 'youtu.be';
    } catch {
      return false;
    }
  }

  /**
   * Extract video ID from YouTube URL
   */
  private extractVideoId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname.toLowerCase();

      if (host === 'youtu.be') {
        return urlObj.pathname.slice(1);
      }
      if (host.includes('youtube.com')) {
        const v = urlObj.searchParams.get('v');
        if (v) return v;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch transcript for a YouTube video
   *
   * Orchestrates the extraction process:
   * 1. Fetch video page HTML
   * 2. Extract caption tracks data
   * 3. Fetch transcript XML/JSON
   * 4. Parse and return
   */
  async fetchTranscript(url: string): Promise<TranscriptExtraction> {
    const videoId = this.extractVideoId(url);

    if (!videoId) {
      throw new TranscriptExtractionError(
        'Could not extract video ID from URL',
        'youtube',
        { requiresManualInput: true }
      );
    }

    try {
      // Step 1: Fetch Video Page
      // We mimic a browser request to get the initial player response
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

      const videoPageResponse = await requestUrl({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        headers: {
          'User-Agent': userAgent,
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });

      const videoPageBody = videoPageResponse.text;
      const cookies = videoPageResponse.headers['set-cookie'] || videoPageResponse.headers['Set-Cookie'] || '';

      // Step 2: Extract Captions Data
      const captionsUrl = this.extractCaptionsUrl(videoPageBody);
      console.log('[YouTubeService] Extracted captions URL:', captionsUrl);

      if (!captionsUrl) {
        throw new TranscriptExtractionError(
          'Video has no captions available (or they are disabled).',
          'youtube',
          { requiresManualInput: true }
        );
      }

      // Step 3: Fetch Transcript Data
      // Force JSON3 format which is more reliable than XML
      // Pass cookies from video page request to maintain session context
      const transcriptResponse = await requestUrl({
        url: captionsUrl + '&fmt=json3',
        headers: {
          'User-Agent': userAgent,
          'Cookie': Array.isArray(cookies) ? cookies.join('; ') : cookies
        }
      });

      const transcriptBody = transcriptResponse.text;

      // Step 4: Parse Transcript
      if (transcriptResponse.status >= 400) {
        console.error(`[YouTubeService] Failed to fetch transcript. Status: ${transcriptResponse.status}`);
      }

      console.log(`[YouTubeService] Transcript body length: ${transcriptBody.length}`);
      if (transcriptBody.length < 500) {
        console.log(`[YouTubeService] Transcript body header: ${transcriptBody}`);
      }
      const segments = this.parseTranscriptJson(transcriptBody);
      // console.log(`[YouTubeService] Parsed ${segments.length} segments`);

      if (segments.length === 0) {
        throw new TranscriptExtractionError(
          'Transcript parsed but contained no text.',
          'youtube',
          { requiresManualInput: true }
        );
      }

      // Formatting
      // Join segments
      const transcriptText = segments.map(s => s.text).join(' ');
      const wordCount = transcriptText.split(/\s+/).filter(w => w.length > 0).length;

      return {
        platform: 'youtube',
        transcript: transcriptText,
        wordCount,
        language: 'en', // Defaulting to 'en' as we prioritize it in extraction
        source: 'auto',
        sourceUrl: url
      };

    } catch (err) {
      if (err instanceof TranscriptExtractionError) throw err;

      const msg = err instanceof Error ? err.message : String(err);
      console.error(`YouTube fetch failed: ${msg}`);

      throw new TranscriptExtractionError(
        `YouTube transcript extraction failed: ${msg}`,
        'youtube',
        { requiresManualInput: true } // Suggest manual input on scrape failure
      );
    }
  }

  /**
   * Extract the captions URL from the video page HTML.
   * Looks for 'captionTracks' inside the player response.
   */
  private extractCaptionsUrl(html: string): string | null {
    try {
      // Look for "captionTracks" in the HTML source
      // It's usually inside ytInitialPlayerResponse
      const splitHtml = html.split('"captionTracks":');

      if (splitHtml.length <= 1) {
        return null;
      }

      // Extract the array json
      const afterCaptions = splitHtml[1];
      const endBracketIndex = afterCaptions.indexOf(']');
      if (endBracketIndex === -1) return null;

      const jsonArrayString = afterCaptions.substring(0, endBracketIndex + 1);
      const tracks = JSON.parse(jsonArrayString);

      if (!Array.isArray(tracks) || tracks.length === 0) {
        return null;
      }

      // Prefer English, otherwise take the first one available
      // tracks usually have .languageCode
      const enTrack = tracks.find((t: any) => t.languageCode === 'en' || t.languageCode?.startsWith('en'));
      const selectedTrack = enTrack || tracks[0];

      return selectedTrack.baseUrl || null;
    } catch (e) {
      console.error('Error extracting captions URL', e);
      return null;
    }
  }

  /**
   * Parse XML transcript format.
   * Format is usually <text start="0" dur="2">Hello world</text>
   */
  private parseTranscriptXml(xml: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];

    // We use DOMParser available in the browser/electron environment
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const textNodes = doc.getElementsByTagName('text');

      for (let i = 0; i < textNodes.length; i++) {
        const node = textNodes[i];
        const text = node.textContent || '';
        const start = parseFloat(node.getAttribute('start') || '0');
        const duration = parseFloat(node.getAttribute('dur') || '0');

        if (text.trim()) {
          segments.push({
            text: text.trim(),
            start,
            duration
          });
        }
      }
    } catch (e) {
      console.error('XML parsing failed', e);
      // Fallback regex if DOMParser somehow fails
      const regex = /<text start="([\d.]+)" dur="([\d.]+)">([^<]+)<\/text>/g;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        segments.push({
          start: parseFloat(match[1]),
          duration: parseFloat(match[2]),
          text: match[3]
        });
      }
    }

    return segments;
  }

  /**
   * Parse JSON3 transcript format
   * {
   *   "events": [
   *     { "tStartMs": 0, "dDurationMs": 2000, "segs": [{ "utf8": "Hello" }] }
   *   ]
   * }
   */
  private parseTranscriptJson(json: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    try {
      const data = JSON.parse(json);
      if (!data.events) return [];

      for (const event of data.events) {
        if (!event.segs) continue;

        const segmentText = event.segs
          .map((seg: any) => seg.utf8)
          .join('')
          .replace(/\n/g, ' ')
          .trim();

        if (segmentText) {
          segments.push({
            text: segmentText,
            start: (event.tStartMs || 0) / 1000,
            duration: (event.dDurationMs || 0) / 1000
          });
        }
      }
    } catch (e) {
      console.error('JSON transcript parsing failed', e);
    }
    return segments;
  }

  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' '
    };
    return text.replace(/&[a-z0-9#]+;/gi, (entity) => {
      return entities[entity] || entity;
    });
  }
}
