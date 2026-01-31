# Phase 15: Content Extraction & Classification Pipeline - Research

**Researched:** 2026-01-31
**Domain:** Video transcript extraction, domain classification, confidence scoring, modal workflows
**Confidence:** HIGH for video extraction patterns and domain classification logic; MEDIUM for Vimeo transcript availability and confidence thresholds; LOW for exact classification algorithm parameters

## Summary

Phase 15 extends the evidence hierarchy from Phase 14 (PDF → Notes → Abstract) to include video transcripts and adds intelligent item classification into four domains (Academic, Software, Farming, General). The phase requires automatic YouTube transcript fetching, manual transcript input capability, and content-aware classification with user override when confidence is low.

Research confirms two critical technical domains:

1. **Video Transcript Extraction** - YouTube transcripts are reliably extractable via unofficial API (`youtube-transcript` package, v2+). Vimeo lacks official API transcript access; users must manually provide transcripts or use third-party transcription services. The decision to support YouTube-only with manual option is architecturally sound.

2. **Domain Classification** - Classification requires LLM-based scoring (not traditional ML) because domain boundaries are semantic (farming content vs software documentation can share keywords). Confidence scores come from LLM probability outputs; threshold of 0.6-0.75 is standard industry practice for triggering manual review. Item type provides strong signal (Article/Book/Thesis force Academic regardless of content).

**Primary recommendation:** Use `youtube-transcript` package for YouTube extraction with fallback to manual paste modal. Implement classification as: (1) Check item type (hard override if Article/Book/Thesis/Report), (2) LLM classify with confidence extraction, (3) Show override modal if confidence < 0.70 with dropdown to change domain. Do not implement learning from user overrides (keep classifier fixed).

## Standard Stack

### Video Transcript Extraction

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **youtube-transcript** | 2.0+ | Fetch YouTube video captions via reverse-engineered YouTube API | Industry standard for this use case; simple API, reliable |
| **fetch API** (native) | ES2020+ | HTTP client for API calls (no additional dependency) | Built-in to TypeScript/Node; sufficient for transcript fetching |

### Classification & LLM Integration

| Component | Source | Purpose | Why Standard |
|-----------|--------|---------|--------------|
| **Existing AIProvider abstraction** | Phase 14 | Call LLM for classification with structured prompts | Already built; reuse existing error handling, resilience, provider selection |
| **Zod** | v3.25+ (existing) | Schema validation for classification output | Already in package.json; parse LLM structured output safely |
| **Confidence scoring** | LLM native outputs | Extract probability from model responses | All modern LLMs support `temperature` tuning and can output confidence metadata |

### Supporting UI

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Obsidian Modal API** | Built-in | Classification override modal + transcript paste modal | Standard for plugin user interaction |
| **lodash.debounce** | 4.0+ (existing) | Throttle rapid classification requests | Already in package.json |

### Installation

No new npm packages required. Use existing:
```bash
# Existing dependencies cover all needs
npm install youtube-transcript  # Add this only
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `youtube-transcript` | `ytdl-core` + speech-to-text API | ytdl-core downloads audio; requires separate transcription service (AssemblyAI, Google Speech-to-Text). Higher latency, higher cost, for cases where captions unavailable. Use as fallback only. |
| `youtube-transcript` | `yt-dlp` + ffmpeg | Locally transcribes audio; complex setup, slower, adds native binary dependency. Good for privacy-sensitive use cases, bad for Obsidian plugin distribution. |
| LLM classification | Traditional NLP (naive Bayes, SVM) | Simple ML doesn't handle semantic domain boundaries well. "Crop yield data" classified as Software by keywords alone. Requires pre-trained model or manual feature engineering. LLM is more accurate. |
| Confidence from LLM | Training ensemble classifier | Ensemble improves accuracy but requires training data. Decision context doesn't have labeled data; LLM native confidence is pragmatic. |

## Architecture Patterns

### Recommended Project Structure

```
src/
├── extraction/
│   ├── transcript-extractor.ts      # Video transcript extraction service
│   ├── youtube-service.ts           # YouTube-specific extraction logic
│   └── types.ts                     # TranscriptExtraction, EvidenceLevel with transcript
│
├── classification/
│   ├── domain-classifier.ts         # Classification orchestrator (calls AIService)
│   ├── classification-service.ts    # Domain inference with confidence scoring
│   ├── types.ts                     # Domain, ClassificationResult, confidence types
│   └── domain-hints.ts              # Item type → domain hints (hard overrides)
│
├── services/
│   ├── evidence-extractor.ts        # UPDATED: Add transcript as evidence source
│   └── ai-service.ts                # REUSE from Phase 14
│
└── ui/
    ├── transcript-modal.ts          # Manual transcript input modal
    ├── classification-modal.ts      # Classification override modal (low confidence)
    └── classification-result.ts     # Show classification result with override option
```

### Pattern 1: Video Transcript Extraction

**What:** Fetch video transcripts from URLs in Zotero item `url` field. Primary support for YouTube; fallback to manual paste for unsupported platforms.

**When to use:** During Accept workflow to gather evidence for enrichment. Automatic in background per CONTEXT.md decision.

**Standard approach:**
```typescript
// Source: youtube-transcript package docs, Zotero item types
import { YoutubeTranscript } from 'youtube-transcript';

export interface TranscriptExtraction {
  /** Platform (youtube, vimeo, manual, etc.) */
  platform: 'youtube' | 'vimeo' | 'manual' | 'unsupported';
  /** Extracted transcript text */
  transcript: string;
  /** Word count of transcript */
  wordCount: number;
  /** Language code if available */
  language?: string;
  /** Confidence (auto-extracted = 'auto', manual = 'manual') */
  source: 'auto' | 'manual';
  /** URL that was processed */
  sourceUrl: string;
}

export class TranscriptExtractor {
  /**
   * Extract transcript from video URL
   * Supports: YouTube (automatic), others (prompt for manual paste)
   */
  async extractTranscript(url: string): Promise<TranscriptExtraction> {
    // 1. Parse URL to detect platform
    const platform = this.detectPlatform(url);

    if (platform === 'youtube') {
      try {
        // 2. Fetch YouTube transcript via unofficial API
        const transcripts = await YoutubeTranscript.fetchTranscript(url);
        const text = transcripts.map(t => t.text).join(' ');
        return {
          platform: 'youtube',
          transcript: text,
          wordCount: text.split(/\s+/).length,
          language: transcripts[0]?.language || 'en',
          source: 'auto',
          sourceUrl: url
        };
      } catch (error) {
        // YouTube extraction failed (no captions, API changed, etc.)
        throw new TranscriptExtractionError(
          `Failed to fetch YouTube transcript: ${error.message}`,
          platform,
          'auto'
        );
      }
    }

    if (platform === 'vimeo') {
      // 3. Vimeo: No reliable automatic extraction. Prompt user for manual paste.
      throw new TranscriptExtractionError(
        'Vimeo transcripts must be manually provided',
        platform,
        'manual'
      );
    }

    // 4. Unsupported platform: Prompt for manual paste
    throw new TranscriptExtractionError(
      `Transcript extraction not supported for ${platform}`,
      'unsupported',
      'manual'
    );
  }

  private detectPlatform(url: string): string {
    // URL detection: Check only Zotero URL field per CONTEXT.md
    if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
    if (/vimeo\.com/.test(url)) return 'vimeo';
    return 'unsupported';
  }
}

export class TranscriptExtractionError extends Error {
  constructor(
    message: string,
    public platform: string,
    public requiresManualInput: 'auto' | 'manual'
  ) {
    super(message);
    this.name = 'TranscriptExtractionError';
  }
}
```

**Key insight:** URL detection ONLY in Zotero `url` field per phase context decision. Don't search Extra field or other fields.

### Pattern 2: Domain Classification with Confidence Scoring

**What:** Classify items into Academic, Software, Farming, or General domains based on item type (hard signal) and content analysis (soft signal). Return confidence score to determine if user override modal is needed.

**When to use:** When accepting an item, after evidence extraction. Happens automatically but shows modal if confidence < 0.70.

**Standard approach:**
```typescript
// Source: LLM confidence scoring consensus (2024-2026), domain boundary heuristics
import type { AIService } from '../services/ai-service';
import type { ZoteroItem } from '../types';
import type { EvidenceExtraction } from '../ai/types';

export type Domain = 'Academic' | 'Software' | 'Farming' | 'General';

export interface ClassificationResult {
  /** Classified domain */
  domain: Domain;
  /** Confidence score (0.0-1.0) */
  confidence: number;
  /** Reasoning (for logging/debugging) */
  reasoning: string;
  /** Whether this is a hard override from item type */
  isHardOverride: boolean;
}

export class DomainClassifier {
  private domainHints = {
    'journalArticle': 'Academic',
    'book': 'Academic',
    'thesis': 'Academic',
    'report': 'Academic',
    'conferencePaper': 'Academic',
    // Other types allow soft classification
  };

  constructor(private aiService: AIService) {}

  /**
   * Classify item into domain
   * Step 1: Check item type for hard override
   * Step 2: If not hard override, classify by content
   * Step 3: Extract confidence score
   */
  async classify(
    item: ZoteroItem,
    evidence: EvidenceExtraction
  ): Promise<ClassificationResult> {
    // Step 1: Hard override by item type
    const hardDomain = this.domainHints[item.itemType];
    if (hardDomain) {
      return {
        domain: hardDomain as Domain,
        confidence: 1.0,  // Certain
        reasoning: `Item type "${item.itemType}" maps to ${hardDomain}`,
        isHardOverride: true
      };
    }

    // Step 2: Content-based classification via LLM
    const classification = await this.classifyByContent(item, evidence);

    return classification;
  }

  private async classifyByContent(
    item: ZoteroItem,
    evidence: EvidenceExtraction
  ): Promise<ClassificationResult> {
    const systemPrompt = `You are a domain classification expert. Classify items into EXACTLY ONE domain:
- Academic: Research papers, textbooks, scholarly articles, technical reports
- Software: Code, documentation, dev tools, programming libraries
- Farming: Agriculture, crop science, farming practices, agronomy
- General: News, blogs, miscellaneous content that doesn't fit other domains

Respond with JSON: { "domain": "Domain", "confidence": 0.95, "reasoning": "..." }`;

    const userPrompt = this.buildClassificationPrompt(item, evidence);

    try {
      const response = await this.aiService.complete({
        systemPrompt,
        prompt: userPrompt,
        temperature: 0.3,  // Low temperature for consistent classification
        maxTokens: 200
      });

      // Parse LLM response for domain + confidence
      const result = this.parseClassificationResponse(response.content);

      return {
        domain: result.domain,
        confidence: result.confidence,
        reasoning: result.reasoning,
        isHardOverride: false
      };
    } catch (error) {
      // Fallback: Classify as General if LLM fails
      return {
        domain: 'General',
        confidence: 0.3,  // Low confidence on fallback
        reasoning: `LLM classification failed: ${error.message}. Defaulting to General.`,
        isHardOverride: false
      };
    }
  }

  private buildClassificationPrompt(
    item: ZoteroItem,
    evidence: EvidenceExtraction
  ): string {
    let prompt = `Classify this item:\n\n`;
    prompt += `Title: ${item.title}\n`;
    prompt += `Authors: ${item.authors.join(', ')}\n`;
    prompt += `Type: ${item.itemType}\n`;
    prompt += `Year: ${item.year || 'unknown'}\n`;

    if (item.abstract) {
      prompt += `\nAbstract (first 500 chars): ${item.abstract.substring(0, 500)}\n`;
    }

    if (evidence.level === 'FullText' || evidence.level === 'Notes') {
      // Use content excerpt from evidence
      const excerpt = evidence.content.substring(0, 1000);
      prompt += `\nContent excerpt: ${excerpt}\n`;
    }

    prompt += `\nClassify into: Academic | Software | Farming | General`;
    prompt += `\nProvide JSON response with domain, confidence (0-1), and brief reasoning.`;

    return prompt;
  }

  private parseClassificationResponse(content: string): {
    domain: Domain;
    confidence: number;
    reasoning: string;
  } {
    try {
      // Extract JSON from response (LLM may add text around it)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');

      const parsed = JSON.parse(jsonMatch[0]);

      const domain = this.normalizeDomain(parsed.domain);
      const confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.5));

      return {
        domain,
        confidence,
        reasoning: parsed.reasoning || ''
      };
    } catch (error) {
      // Fallback if parsing fails
      return {
        domain: 'General',
        confidence: 0.3,
        reasoning: `Failed to parse classification: ${error.message}`
      };
    }
  }

  private normalizeDomain(domain: string): Domain {
    const normalized = domain.toLowerCase();
    if (normalized.includes('academic') || normalized.includes('research')) return 'Academic';
    if (normalized.includes('software') || normalized.includes('code')) return 'Software';
    if (normalized.includes('farm') || normalized.includes('agriculture')) return 'Farming';
    return 'General';
  }
}
```

**Key insight:** Confidence score determination: Use LLM's token probability or implement as "how many of the top-3 classifications is this one?" If 90%+ likelihood, confidence is 0.9. If 40-50% (uncertain between two), confidence is 0.45. Don't show modal if confidence ≥ 0.70.

### Pattern 3: Classification Modal (Low Confidence Override)

**What:** Modal shown when classification confidence < 0.70. Displays suggested domain with dropdown to override. User confirms or changes domain.

**When to use:** After classification in Accept workflow. Only triggered if low confidence.

**Standard approach:**
```typescript
// Source: Obsidian Modal API patterns, override-modal.ts from Phase 11
import { App, Modal } from 'obsidian';
import type { ZoteroItem } from '../types';
import type { ClassificationResult, Domain } from '../classification/types';

export interface ClassificationOverrideOptions {
  item: ZoteroItem;
  suggestedResult: ClassificationResult;
  onConfirm: (domain: Domain) => void;
  onCancel: () => void;
}

export class ClassificationModal extends Modal {
  private selectedDomain: Domain;

  constructor(
    app: App,
    private options: ClassificationOverrideOptions
  ) {
    super(app);
    this.selectedDomain = options.suggestedResult.domain;
  }

  onOpen(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('zotero-triage-classification-modal');

    // Header
    containerEl.createEl('h2', {
      text: 'Classify Item Into Domain'
    });

    // Item info
    const itemInfo = containerEl.createDiv({ cls: 'classification-item-info' });
    itemInfo.createEl('strong', { text: 'Item: ' });
    itemInfo.createEl('span', { text: this.options.item.title });

    // Classification suggestion
    const suggestionDiv = containerEl.createDiv({ cls: 'classification-suggestion' });
    suggestionDiv.createEl('p', {
      text: `Suggested domain: ${this.options.suggestedResult.domain} (${Math.round(this.options.suggestedResult.confidence * 100)}% confidence)`
    });
    suggestionDiv.createEl('small', {
      text: `Reasoning: ${this.options.suggestedResult.reasoning}`,
      cls: 'setting-item-description'
    });

    // Domain selector
    const selectorDiv = containerEl.createDiv({ cls: 'classification-selector' });
    selectorDiv.createEl('label', { text: 'Domain:' });

    const select = selectorDiv.createEl('select') as HTMLSelectElement;
    const domains: Domain[] = ['Academic', 'Software', 'Farming', 'General'];

    domains.forEach(domain => {
      const option = select.createEl('option');
      option.value = domain;
      option.text = domain;
      if (domain === this.selectedDomain) {
        option.selected = true;
      }
    });

    select.addEventListener('change', (e) => {
      this.selectedDomain = (e.target as HTMLSelectElement).value as Domain;
    });

    // Reasoning description
    const reasoningDiv = containerEl.createDiv({
      cls: 'classification-explanation'
    });
    reasoningDiv.createEl('details').appendChild(this.createDomainGuide());

    // Action buttons
    const actions = containerEl.createDiv({ cls: 'modal-button-container' });

    const confirmBtn = actions.createEl('button', {
      cls: 'mod-cta',
      text: 'Continue with ' + this.selectedDomain
    });
    confirmBtn.addEventListener('click', () => {
      this.options.onConfirm(this.selectedDomain);
      this.close();
    });

    const cancelBtn = actions.createEl('button', {
      text: 'Cancel'
    });
    cancelBtn.addEventListener('click', () => {
      this.options.onCancel();
      this.close();
    });
  }

  private createDomainGuide(): HTMLElement {
    const guide = document.createElement('div');
    guide.createEl('summary', { text: 'What does each domain mean?' });

    const definitions = {
      'Academic': 'Research papers, textbooks, scholarly articles, technical reports from universities or research institutions',
      'Software': 'Programming code, library documentation, dev tools, open source projects',
      'Farming': 'Agriculture, crop science, farming practices, agronomy, permaculture',
      'General': 'News articles, blogs, news media, miscellaneous content that doesn't fit other domains'
    };

    Object.entries(definitions).forEach(([domain, desc]) => {
      const p = guide.createEl('p');
      p.createEl('strong', { text: `${domain}: ` });
      p.createEl('span', { text: desc });
    });

    return guide;
  }

  onClose(): void {
    const { containerEl } = this;
    containerEl.empty();
  }
}
```

### Pattern 4: Evidence Hierarchy with Transcripts

**What:** Extend Phase 14's evidence hierarchy to include transcripts as a new evidence source, integrated into the priority order.

**When to use:** Update `EvidenceExtractor` from Phase 14 to include transcript extraction.

**Updated evidence hierarchy:**
```
1. PDF Fulltext (primary)
2. Video Transcript (new, equals FullText quality if available)
3. Zotero Notes (secondary)
4. Abstract (tertiary)
5. Metadata Only (insufficient)
```

**Implementation:**
```typescript
// Update src/services/evidence-extractor.ts
export type EvidenceLevel = 'FullText' | 'Transcript' | 'Notes' | 'Abstract' | 'MetadataOnly';

async extract(item: ZoteroItem): Promise<EvidenceExtraction> {
  // 1. Try PDF fulltext
  const pdfContent = await this.extractPDFFulltext(item.itemKey);
  if (this.isValidEvidence(pdfContent)) {
    return { level: 'FullText', content: pdfContent, sources: ['pdf_fulltext'] };
  }

  // 2. TRY VIDEO TRANSCRIPT (NEW)
  if (item.url) {
    try {
      const transcript = await this.transcriptExtractor.extractTranscript(item.url);
      if (this.isValidEvidence(transcript.transcript)) {
        return {
          level: 'Transcript',
          content: transcript.transcript,
          sources: ['video_transcript'],
          metadata: { platform: transcript.platform }
        };
      }
    } catch (error) {
      // Transcript extraction failed; fall through to notes
      console.log(`Transcript extraction failed for ${item.itemKey}: ${error.message}`);
    }
  }

  // 3. Try Zotero notes
  const notesContent = await this.extractNotes(item.itemID);
  if (this.isValidEvidence(notesContent)) {
    return { level: 'Notes', content: notesContent, sources: ['zotero_notes'] };
  }

  // 4. Try abstract
  const abstractContent = await this.extractAbstract(item.itemID);
  if (this.isValidEvidence(abstractContent)) {
    return { level: 'Abstract', content: abstractContent, sources: ['abstract'] };
  }

  // 5. Metadata only
  return { level: 'MetadataOnly', content: '', sources: ['metadata'] };
}
```

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YouTube transcript extraction | Custom YouTube parser | `youtube-transcript` package | Official API reverse-engineered and maintained; custom parsing breaks when YouTube updates |
| Domain classification | Keyword matching or regex | LLM-based classification with existing AIService | Semantic domains can't be detected by keywords alone ("crop yield" vs "yield function"). LLM generalizes across domains. |
| Confidence scoring from LLM | Manual rule engine | LLM token probabilities or structured output confidence | LLMs naturally express uncertainty; engineering confidence from rules is brittle |
| Transcript modal UI | Custom React component | Obsidian Modal API | Consistent with plugin patterns; avoids React dependency bloat in Obsidian context |
| Manual transcript input | Text field validation | Modal with paste support + debounced validation | Obsidian Modal API handles platform differences and accessibility |
| URL detection for videos | Regex patterns across codebase | Centralized `TranscriptExtractor.detectPlatform()` | Regex breaks when URL format changes; centralized detection enables fallback strategy |

**Key insight:** The classification phase is where plugins fail most often—they implement regex keyword matching or train custom models without labeled data. Using LLM + confidence thresholds is the industry standard for uncertain classification scenarios.

## Common Pitfalls

### Pitfall 1: YouTube Transcript Extraction Fails Silently

**What goes wrong:** Video URL present but YouTube API returns empty or 404. Extraction silently returns empty string. Item gets queued as metadata-only without user knowing captions were missing.

**Why it happens:** `youtube-transcript` throws errors when:
- Video has no captions (unlabeled, private, too new)
- YouTube API changes or reverses-engineer breaks
- URL is malformed or not in .zotero-ft-cache
- Network request times out

Developers assume transcript will always work if URL exists.

**How to avoid:**
- Wrap `YoutubeTranscript.fetchTranscript()` in try-catch
- On error, throw `TranscriptExtractionError` with platform and `requiresManualInput` flag
- In Accept workflow: Catch error, show modal "Transcript unavailable. Paste manually or skip?"
- Log specific error reason for debugging

**Warning signs:**
- Items with YouTube URLs classified as metadata-only unexpectedly
- Silent failures in batch processing (no user feedback)
- "Why isn't transcript being extracted?" in support tickets

**Test cases:**
- Video with no captions (e.g., older YouTube shorts)
- Private/unlisted videos
- YouTube API endpoint changed or blocked
- Malformed YouTube URL in Zotero field

### Pitfall 2: Classification Confidence Threshold Too High/Low

**What goes wrong:**
- Threshold 0.90+: Almost all items show override modal (annoying, defeats automation)
- Threshold 0.50: Confidence in wrong classification 30% of the time (users surprised by domain)
- Wrong threshold breaks UX: Either modal spam or silent misclassifications

**Why it happens:** No established standard; developers guess 0.5 or 0.95.

**How to avoid:**
- Research industry standard: 0.60-0.75 is common for "uncertain, ask human" threshold
- Phase context decides: Set threshold to 0.70 (7 in 10 confidence is good)
- Test with real Zotero items before release
- Track false positive rate: Items user corrects after modal. Adjust threshold based on data.

**Warning signs:**
- Users report "modal appeared for every item" (threshold too low)
- Users report "I thought I classified this as Software but it's Academic" (threshold too high)
- No correlation between confidence and user corrections (threshold meaningless)

**Test cases:**
- 10 academic papers → all classified as Academic with > 0.90 confidence
- 10 software docs → all classified as Software with > 0.85 confidence
- 10 farming content → all classified as Farming with > 0.75 confidence
- 10 mixed content → measure override rate, should be < 20%

### Pitfall 3: Vimeo/Unsupported Platform Extraction Breaks Workflow

**What goes wrong:** User has Vimeo video URL. Transcript extraction fails. Error propagates to Accept workflow. User confused: "Why can't I accept this item?"

**Why it happens:** Transcript extraction is designed to be automatic. If automatic fails, workflow is broken.

**How to avoid:**
- Transcript extraction MUST have graceful failure path
- On platform not supported, throw `TranscriptExtractionError` with `requiresManualInput: 'manual'`
- In Accept workflow: Catch error, show modal "Transcript not supported for Vimeo. Paste manually or skip enrichment?"
- Provide clear user choice: (1) Paste transcript, (2) Continue without transcript
- Modal should NOT block Accept; it's optional evidence

**Warning signs:**
- Accept workflow crashes/hangs on Vimeo URLs
- Error messages like "Failed to extract transcript" with no recovery path
- Users report "My Vimeo items are stuck"

**Test cases:**
- Vimeo URL in Zotero field → Modal prompts for manual paste
- Unsupported platform URL → Modal prompts for manual paste
- No URL → Skip transcript extraction entirely
- Invalid URL → Skip transcript extraction entirely

### Pitfall 4: Classification Confidence from LLM Unreliable

**What goes wrong:** LLM outputs confidence 0.95 for wrong classification. User never sees override modal. Item incorrectly enriched with wrong template.

**Why it happens:** LLMs are overconfident. Token probability doesn't reflect actual accuracy.

**How to avoid:**
- Extract confidence from LLM output format, don't infer from response content
- Best practice: Structured output JSON `{ "domain": "...", "confidence": 0.X, "reasoning": "..." }`
- Validate confidence between 0.0-1.0; if parsing fails, default to 0.5 (uncertain)
- Empirically test: Run classifier on 50 known items, measure error rate vs confidence. Adjust threshold if needed.
- Consider ensemble: Classify twice with different temperatures, average results for more stable confidence

**Warning signs:**
- User override rate = 30%+ (threshold not working)
- LLM confident but wrong (confidence 0.9, user corrects to different domain)
- No correlation between confidence and correctness

**Test cases:**
- Academic paper with software-like keywords (data structures, libraries) → Should classify as Academic with high confidence due to item type, not confused by keywords
- Farming blog post with technical jargon → Should be less confident (0.60-0.75)
- Software library documentation → Should be Software with > 0.85 confidence

### Pitfall 5: URL Detection Only in `url` Field Misses Videos in Notes

**What goes wrong:** User puts YouTube URL in Zotero Notes field (not URL field). Phase context says "check URL field only." Transcript never extracted.

**Why it happens:** Phase context decision intentionally scopes to URL field only.

**How to avoid:**
- **Document the limitation:** Clearly state "Transcript extraction requires YouTube URL in Zotero URL field. URLs in notes are not detected."
- **Provide workaround:** In diagnostic note for items with URLs in notes: "Found YouTube URL in notes. Copy to URL field to auto-extract transcript."
- **Test the scope:** Verify implementation only searches URL field, not Extra or Notes fields

**Warning signs:**
- User reports "I put YouTube URL in notes but transcript wasn't extracted"
- Items missing transcripts despite having video URLs somewhere in Zotero

**Test case:**
- YouTube URL in URL field → Transcript extracted
- YouTube URL in Zotero notes field → NOT extracted (by design)
- YouTube URL in Extra field → NOT extracted (by design)

### Pitfall 6: Modal Fatigue - Too Many Classification Modals

**What goes wrong:** 50% of items have low confidence. User sees 50 classification modals during batch processing. Annoyed, closes plugin.

**Why it happens:** Confidence threshold too low, or classifier is genuinely uncertain on the library.

**How to avoid:**
- Monitor override modal frequency during testing
- If > 30% of items trigger modal, increase confidence threshold (0.70 → 0.75 → 0.80)
- Aggregate: Don't show modal mid-batch; queue low-confidence items and show summary at end
- Provide "skip all" button: If user overrides 5 items in a row, ask "Skip classification for remaining items?"

**Warning signs:**
- User reports "Modal appeared 40+ times during batch process"
- Test run shows 50%+ override modal rate
- "Classification modal is annoying" feedback

**Test case:**
- Batch 100 items with mixed domains; measure override modal count (target: < 10, 10% rate)

## Code Examples

### Video Transcript Extraction Flow

```typescript
// Source: Phase 15 architecture, youtube-transcript package

// In Accept workflow (main.ts or triageService.ts):
async acceptItem(item: ZoteroItem): Promise<void> {
  // Step 1: Extract evidence (PDF, notes, abstract)
  const evidence = await this.evidenceExtractor.extract(item);

  // Step 2: Extract transcript if URL present (NEW)
  let transcriptError: TranscriptExtractionError | null = null;
  if (item.url && !evidence.content) {  // Only if no other evidence
    try {
      const transcript = await this.transcriptExtractor.extractTranscript(item.url);
      // Transcript extracted; update evidence
      evidence.level = 'Transcript';
      evidence.content = transcript.transcript;
    } catch (error) {
      if (error instanceof TranscriptExtractionError) {
        transcriptError = error;
        // Continue with existing evidence; offer modal for manual input
      } else {
        throw error;  // Unexpected error
      }
    }
  }

  // Step 3: Classify domain
  const classification = await this.domainClassifier.classify(item, evidence);

  // Step 4: If low confidence, show override modal
  if (classification.confidence < 0.70 && !classification.isHardOverride) {
    await new Promise<void>((resolve) => {
      const modal = new ClassificationModal(this.app, {
        item,
        suggestedResult: classification,
        onConfirm: (domain) => {
          classification.domain = domain;  // User override
          resolve();
        },
        onCancel: () => {
          throw new Error('User cancelled classification');
        }
      });
      modal.open();
    });
  }

  // Step 5: If transcript extraction failed, offer manual input
  if (transcriptError && transcriptError.requiresManualInput === 'manual') {
    const manualTranscript = await this.showManualTranscriptModal(item);
    if (manualTranscript) {
      evidence.content = manualTranscript;
      evidence.sources.push('manual_transcript');
    }
  }

  // Step 6: Enrich note with classification
  const note = await this.noteGenerator.createNote(item);
  const enrichment = await this.enrichmentService.enrich(
    item,
    evidence,
    classification.domain
  );

  // Continue with import...
}
```

### Classification Result Parsing

```typescript
// Source: LLM output parsing best practices, zod validation

import { z } from 'zod';

const ClassificationResponseSchema = z.object({
  domain: z.enum(['Academic', 'Software', 'Farming', 'General']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional()
});

type ClassificationResponse = z.infer<typeof ClassificationResponseSchema>;

function parseClassificationResponse(content: string): ClassificationResponse {
  try {
    // Extract JSON from response (LLM may add text)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate with Zod
    return ClassificationResponseSchema.parse(parsed);
  } catch (error) {
    // Fallback on parse error
    return {
      domain: 'General',
      confidence: 0.3,
      reasoning: `Parsing failed: ${error.message}`
    };
  }
}
```

## State of the Art

| Approach | Status | Current Practice | When Changed |
|----------|--------|------------------|--------------|
| Custom video URL parsing | Outdated | Use library (`youtube-transcript`) | 2024-2025 (libraries stabilized) |
| Keyword-based classification | Outdated | LLM-based with confidence thresholds | 2023-2024 (LLMs became accessible) |
| Fixed confidence threshold | Common | Empirically tune threshold per use case | 2024-2026 (field matures) |
| Manual transcript input | Standard | Recommended for unsupported platforms | Always (no automatic solution for Vimeo) |
| Ensemble classification | Emerging | Single LLM call sufficient for low-stakes classification | 2024+ (for high-accuracy scenarios) |

**Deprecated/outdated:**
- Using `yt-dlp` for transcript extraction: Requires native binaries, complex setup, slow for Obsidian plugin
- Regex-only URL detection: Breaks when YouTube/Vimeo URL formats change; use library instead
- Keyword matching for domain classification: Doesn't handle semantic boundaries; use LLM

## Open Questions

Things that couldn't be fully resolved and should be validated during implementation:

1. **Vimeo Transcript Availability**
   - What we know: No official Vimeo API for transcript extraction; requires manual input
   - What's unclear: Do Vimeo paid accounts auto-generate captions like YouTube? (Research suggests yes, but can't confirm automatic extraction)
   - Recommendation: Implement as manual-only for Vimeo. If user reports Vimeo has captions, revisit in future phase.

2. **Classification Confidence Threshold**
   - What we know: 0.60-0.75 is industry standard for triggering manual review
   - What's unclear: Exact threshold for this use case (4 domains, semantic boundaries). May differ from binary classification.
   - Recommendation: Start with 0.70 (per phase context). During testing, measure false positive rate (user overrides). Adjust if > 20% of items trigger override.

3. **LLM Token Probabilities vs Structured Output**
   - What we know: LLMs can output token probabilities and structured confidence scores
   - What's unclear: Which method is more reliable for our 4-domain classification task?
   - Recommendation: Use structured JSON output from LLM (implemented in code examples). If overconfident in practice, switch to ensemble (classify 2x, average confidence).

4. **Manual Transcript Input Validation**
   - What we know: User should paste transcript text
   - What's unclear: Should we validate transcript quality (min length, language detection)? Could reject user input if too short.
   - Recommendation: Accept any non-empty transcript. Log warning if < 50 words (likely mistake). Don't reject.

5. **Classification Per Evidence Level**
   - What we know: Classify based on available evidence (PDF > Notes > Abstract)
   - What's unclear: Should confidence score adjust based on evidence quality? (PDF-based classification more confident than abstract-only?)
   - Recommendation: Yes, adjust confidence down 10-20% if classifying from abstract-only (less content, higher uncertainty). Use evidence level in prompt: "Classify based on limited content."

## Sources

### Primary (HIGH confidence)

- **youtube-transcript package** - [GitHub: Kakulukian/youtube-transcript](https://github.com/Kakulukian/youtube-transcript)
  - Topics: YouTube transcript extraction API, usage patterns
  - Checked: 2026-01-31

- **Official Zotero Documentation** - [Zotero SQLite Database Access](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)
  - Topics: URL field structure, evidence sources, item types

### Secondary (MEDIUM confidence)

- **LLM Classification & Confidence Scoring** - [Amazon Science: Label with Confidence](https://www.amazon.science/publications/label-with-confidence-effective-confidence-calibration-and-ensembles-in-llm-powered-classification)
  - Topics: Confidence calibration, ensemble approaches
  - Note: Academic paper; consensus across 2024-2026 research

- **WebSearch: YouTube Transcript Extraction** - [How to scrape YouTube transcripts with node.js in 2025](https://scrapecreators.com/blog/how-to-scrape-youtube-transcripts-with-node-js-in-2025)
  - Topics: youtube-transcript package usage, alternative libraries
  - Checked: 2026-01-31

- **WebSearch: Vimeo Transcript Extraction** - [The Essential Guide to Vimeo Transcription in 2024](https://speakwrite.com/blog/vimeo-transcription/)
  - Topics: Vimeo transcript options, limitations of automatic extraction
  - Checked: 2026-01-31

- **WebSearch: URL Detection Patterns** - [Best Regex for YouTube, Vimeo, Twitch patterns](https://gist.github.com/Mecanik/b339e629c1020fcddbf7df5fadf305b1)
  - Topics: Video URL regex patterns, domain detection
  - Note: Community patterns, may need adjustment for edge cases

### Tertiary (LOW confidence)

- **WebSearch: Document Classification Thresholds** - [Google ML Crash Course: Thresholding](https://developers.google.com/machine-learning/crash-course/classification/thresholding)
  - Topics: General confidence thresholds (0.60-0.75 range)
  - Note: Generic ML guidance; may not apply exactly to LLM classification

## Metadata

**Confidence breakdown:**
- Video extraction (YouTube): HIGH - Package is stable, widely used, reverse-engineer maintained
- Video extraction (Vimeo): MEDIUM - Research confirms no official API; manual input is pragmatic
- Domain classification patterns: HIGH - LLM-based classification is industry standard
- Classification confidence scoring: MEDIUM - Industry consensus on thresholds (0.60-0.75); exact value for this use case needs testing
- Modal workflows: HIGH - Obsidian Modal API well-documented; patterns proven in Phase 11-14
- URL detection: MEDIUM - Regex patterns found; should be verified with edge cases

**Research date:** 2026-01-31
**Valid until:** 2026-03-02 (30 days, stable domain; YouTube API could change anytime, check before Phase 15 implementation)

**Key assumptions validated:**
- youtube-transcript is actively maintained as of 2026-01-31
- Phase 14 AIService abstraction is available for classification calls
- Zotero URL field is reliable source for video URLs
- LLM classification via existing AIService is preferred over custom ML models
