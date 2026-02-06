/**
 * YouTube Transcript Extraction Service
 *
 * Provides automatic transcript fetching for YouTube videos.
 * Implements a robust scraper using YouTube's Internal Innertube API (Android Client).
 * This bypasses CAPTCHAs and consent screens often encountered with the web client.
 * Based on the verified implementation in obsidian-youtube-transcript.
 */

import { requestUrl } from 'obsidian';
import type { TranscriptExtraction } from './types';
import { TranscriptExtractionError } from './types';

interface TranscriptSegment {
  text: string;
  startTime: number;
}

// Public Android API Key for YouTube Internal API
const INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const INNERTUBE_PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;

// Android client context - less restricted than WEB client for transcript access
const INNERTUBE_ANDROID_CONTEXT = {
  client: {
    clientName: "ANDROID",
    clientVersion: "19.09.37",
    androidSdkVersion: 30,
    hl: "en",
    gl: "US",
  },
};

/**
 * YouTube video transcript extraction service
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
        // Handle embed URLs
        if (urlObj.pathname.startsWith('/embed/')) {
          return urlObj.pathname.split('/')[2];
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch player data from YouTube's InnerTube API using ANDROID client.
   * The ANDROID client is less restricted than WEB client for caption access.
   */
  private async fetchPlayerDataWithAndroidClient(videoId: string): Promise<any> {
    const context = {
      ...INNERTUBE_ANDROID_CONTEXT,
      client: {
        ...INNERTUBE_ANDROID_CONTEXT.client,
        hl: "en",
        gl: "US",
      },
    };

    const response = await requestUrl({
      url: INNERTUBE_PLAYER_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
      },
      body: JSON.stringify({
        context: context,
        videoId: videoId,
      }),
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to fetch video info: ${response.status}`);
    }

    const data = response.json;

    // Check playability status
    const playabilityStatus = data.playabilityStatus;
    if (playabilityStatus) {
      if (playabilityStatus.status === "ERROR") {
        throw new Error(playabilityStatus.reason || "Video unavailable");
      }
      if (playabilityStatus.status === "LOGIN_REQUIRED") {
        throw new Error("This video requires login to view");
      }
      if (playabilityStatus.status === "UNPLAYABLE") {
        throw new Error(playabilityStatus.reason || "Video is unplayable");
      }
    }

    return data;
  }

  /**
   * Fetch transcript for a YouTube video using the robust Android client method
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
      console.log(`[YouTubeService] Fetching player data for ${videoId}...`);
      const videoData = await this.fetchPlayerDataWithAndroidClient(videoId);

      const captionsRenderer = videoData?.captions?.playerCaptionsTracklistRenderer;
      const captionTracks = captionsRenderer?.captionTracks;

      if (!captionTracks || captionTracks.length === 0) {
        console.log("[YouTubeService] No caption tracks found.");
        throw new TranscriptExtractionError(
          'Video has no captions available.',
          'youtube',
          { requiresManualInput: true }
        );
      }

      console.log(`[YouTubeService] Found ${captionTracks.length} caption tracks.`);

      // Prioritize English
      const enTrack = captionTracks.find((t: any) => t.languageCode === 'en' || t.languageCode?.startsWith('en'));
      const selectedTrack = enTrack || captionTracks[0];
      const captionsUrl = selectedTrack.baseUrl;
      const langCode = selectedTrack.languageCode;

      if (!captionsUrl) {
        throw new TranscriptExtractionError(
          'Caption track found but has no URL.',
          'youtube',
          { requiresManualInput: true }
        );
      }

      console.log(`[YouTubeService] Fetching transcript from: ${captionsUrl}`);

      // Robust fetching with fallbacks
      const transcriptXml = await this.fetchTranscriptContent(captionsUrl, videoId, langCode);

      // Parse content
      const segments = this.parseTranscript(transcriptXml);

      if (segments.length === 0) {
        throw new TranscriptExtractionError(
          'Transcript parsed but contained no text.',
          'youtube',
          { requiresManualInput: true }
        );
      }

      // Formatting
      const transcriptText = segments.map(s => s.text).join(' ');

      // Basic formatting cleanup (remove double spaces, fix punctuation spacing)
      const cleanedText = transcriptText.replace(/\s+/g, ' ').replace(/ ([.!?])/g, '$1');

      const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;

      return {
        platform: 'youtube',
        transcript: cleanedText,
        wordCount,
        language: langCode || 'en',
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
        { requiresManualInput: true }
      );
    }
  }

  /**
   * Fetch the actual transcript content handling fallbacks for empty responses
   */
  private async fetchTranscriptContent(transcriptUrl: string, videoId: string, langCode: string): Promise<string> {
    const transcriptHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: `https://www.youtube.com/watch?v=${videoId}`,
      Accept:
        "text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8",
    };

    try {
      const response = await requestUrl({
        url: transcriptUrl,
        headers: transcriptHeaders
      });

      if (response.status >= 200 && response.status < 300 && response.text && response.text.trim()) {
        return response.text;
      }

      console.warn("[YouTubeService] Primary transcript URL returned empty/error. Trying fallbacks...");

    } catch (e) {
      console.warn("[YouTubeService] Primary fetch failed:", e);
    }

    // Fallback URLs
    const isAutoGenerated = transcriptUrl.includes("kind=asr") || transcriptUrl.includes("caps=asr");
    const fallbackUrls = [
      ...(isAutoGenerated
        ? [`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${langCode}&caps=asr&fmt=xml3`]
        : []),
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${langCode}&fmt=xml3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${langCode}&fmt=srv3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${langCode}`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${langCode}&fmt=ttml`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${langCode}&fmt=xml`,
    ];

    for (const fallbackUrl of fallbackUrls) {
      try {
        console.log(`[YouTubeService] Trying fallback: ${fallbackUrl}`);
        const response = await requestUrl({
          url: fallbackUrl,
          headers: transcriptHeaders
        });

        if (response.status >= 200 && response.status < 300 && response.text && response.text.trim()) {
          console.log("[YouTubeService] Fallback succeeded!");
          return response.text;
        }
      } catch (e) {
        console.warn(`[YouTubeService] Fallback ${fallbackUrl} failed:`, e);
      }
    }

    throw new Error("All transcript URL attempts returned empty response. YouTube may be blocking automated requests.");
  }


  /**
   * Parse transcript content (XML mostly)
   */
  private parseTranscript(transcriptXml: string): TranscriptSegment[] {
    // If it happens to be JSON (rare with these endpoints but possible)
    if (transcriptXml.trim().startsWith('{')) {
      return this.parseTranscriptJson(transcriptXml);
    }

    // Parse XML
    const segments: TranscriptSegment[] = [];
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(transcriptXml, "text/xml");

      const parserError = xmlDoc.querySelector("parsererror");
      if (parserError) {
        console.error("XML parsing error:", parserError.textContent);
      }

      // Try different tag names
      let textElements = xmlDoc.getElementsByTagName("text");
      if (textElements.length === 0) {
        textElements = xmlDoc.getElementsByTagName("transcript");
        if (textElements.length === 0) {
          textElements = xmlDoc.getElementsByTagName("p");
        }
      }

      // If still empty, try generic selector
      let allNodes = textElements.length > 0 ? Array.from(textElements) : Array.from(xmlDoc.querySelectorAll("*")).filter(n => n.children.length === 0 && n.textContent?.trim());

      for (let i = 0; i < allNodes.length; i++) {
        const element = allNodes[i] as Element;
        let text = element.textContent || "";

        if (text) {
          text = this.decodeHtmlEntities(text);
        }

        if (text && text.trim()) {
          const startAttr =
            element.getAttribute("start") ??
            element.getAttribute("t") ??
            element.getAttribute("begin");

          const startTime = startAttr ? parseFloat(startAttr) : -1;

          segments.push({
            text: text.trim(),
            startTime
          });
        }
      }

    } catch (e) {
      console.error('XML parsing failed', e);
    }

    // Force unit normalization (ms vs s)
    if (segments.length >= 2) {
      // Calculate median gap
      const gaps: number[] = [];
      for (let i = 1; i < segments.length; i++) {
        const a = segments[i - 1].startTime;
        const b = segments[i].startTime;
        if (a >= 0 && b >= 0) gaps.push(b - a);
      }

      if (gaps.length > 0) {
        const sorted = [...gaps].sort((x, y) => x - y);
        const medianGap = sorted[Math.floor(sorted.length / 2)]!;

        // If median gap is huge (> 5 minutes aka 300s), it's likely ms
        if (medianGap > 300) {
          // Convert all to seconds
          segments.forEach(s => { if (s.startTime >= 0) s.startTime /= 1000; });
        }
      }
    }

    return segments;
  }

  private parseTranscriptJson(json: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    try {
      const data = JSON.parse(json);
      if (data.events) {
        for (const event of data.events) {
          if (event.segs) {
            const text = event.segs.map((s: any) => s.utf8).join('').trim();
            if (text) {
              segments.push({
                text,
                startTime: (event.tStartMs || 0) / 1000
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("JSON parsing failed", e);
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
