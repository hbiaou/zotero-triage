/**
 * Zotero Triage Core Type Definitions
 *
 * Defines interfaces for plugin settings, Zotero items, and the processing registry.
 */

import type { QualityGateConfig } from './validation/types';
import type { UserProfile } from './profile/types';
import type { ProviderID, EvidenceLevel } from './ai/types';

/**
 * Plugin settings stored in data.json
 */
export interface ZoteroTriageSettings {
  /** Path to the Zotero SQLite database file */
  zoteroDbPath: string;
  /** Output folder for literature notes (relative to vault root) */
  outputFolder: string;
  /** Number of items per batch (1-20, default: 5) */
  batchSize: number;
  /** Quality gate validation configuration */
  qualityGate: QualityGateConfig;
  /** User profile for personalized recommendations (null if not configured) */
  userProfile: UserProfile | null;
  /**
   * Tag weight multiplier for recommendation scoring (0.0-3.0)
   * Default: 1.5 (between keywords and authors)
   * 0.0 = disable tag scoring, 3.0 = strong tag preference
   */
  tagWeight: number;
  /**
   * Relevance vs Diversity balance (0-1)
   * 0 = pure relevance (highest scored items)
   * 1 = maximum diversity (balanced across signal types)
   */
  relevanceVsDiversity: number;
  /** Whether to boost recent publications in recommendations */
  recencyBoost: boolean;
  /**
   * Library filter mode
   * 'personal' = user library only (excludes group libraries, feeds)
   * 'all' = all libraries (user + groups)
   */
  libraryFilterMode: 'personal' | 'all';
  /**
   * AI service configuration (null if not configured)
   */
  aiConfig: {
    /** Selected provider ID (null if not configured) */
    selectedProvider: ProviderID | null;
    /** Selected model ID within provider */
    selectedModel: string | null;
    /** Fallback provider order */
    fallbackOrder: ProviderID[];
  } | null;
}

import { DEFAULT_QUALITY_GATE_CONFIG } from './validation/types';

/**
 * Default settings applied on first plugin load
 */
export const DEFAULT_SETTINGS: ZoteroTriageSettings = {
  zoteroDbPath: '',
  outputFolder: '10_Literature',
  batchSize: 5,
  qualityGate: DEFAULT_QUALITY_GATE_CONFIG,
  userProfile: null,
  tagWeight: 1.5,  // Default from CONTEXT.md decision
  relevanceVsDiversity: 0,  // Pure relevance by default
  recencyBoost: true,  // Boost recent publications
  libraryFilterMode: 'personal',  // User library only
  aiConfig: null  // Not configured by default
};

/**
 * Represents a single item from the Zotero database
 */
export interface ZoteroItem {
  /** Zotero internal item ID */
  itemID: number;
  /** Zotero item key (used in URIs like zotero://select/items/0_KEY) */
  itemKey: string;
  /** Item title */
  title: string;
  /** List of authors in "Last, First" format */
  authors: string[];
  /** Publication year (extracted from date field) */
  year: string | null;
  /** Digital Object Identifier */
  doi: string | null;
  /** Journal/publication title */
  journal: string | null;
  /** Volume number */
  volume: string | null;
  /** Page range */
  pages: string | null;
  /** Abstract text */
  abstract: string | null;
  /** Publisher name (for books, reports, etc.) */
  publisher: string | null;
  /** ISBN identifier (for books) */
  isbn: string | null;
  /** URL (for web pages, video recordings, etc.) */
  url: string | null;
  /** Path to attached PDF file */
  pdfPath: string | null;
  /** Zotero item type (journalArticle, book, etc.) */
  itemType: string;
  /** ISO date when item was added to Zotero */
  dateAdded: string;
}

/**
 * Processing state for a single Zotero item
 *
 * State flow:
 * - unseen: Item not yet shown to user
 * - proposed: Item shown to user, awaiting accept/reject decision
 * - accepted: User accepted item, queued for import
 * - rejected: User rejected item
 * - deferred: User deferred item for later review
 * - imported: Item imported to Obsidian
 * - enriched: Item successfully enriched with AI-generated content
 * - enrichment_pending: Item queued for enrichment when evidence becomes available (deferred queue)
 * - enrichment_failed: Item failed enrichment after retries, requires manual intervention
 */
export type ProcessingState =
  | 'unseen'
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'deferred'
  | 'imported'
  | 'enriched'
  | 'enrichment_pending'
  | 'enrichment_failed';

/**
 * @deprecated Use ProcessingState instead
 */
export type RegistryState = ProcessingState;

/**
 * Registry entry tracking the state of a Zotero item
 */
export interface RegistryEntry {
  /** Current processing state */
  state: ProcessingState;
  /** Unix timestamp of last state change */
  timestamp: number;
  /**
   * Enrichment metadata (optional, only for enriched/pending/failed states)
   *
   * Tracks AI enrichment attempts and retry state for deferred queue.
   * Only populated when state is enriched, enrichment_pending, or enrichment_failed.
   */
  enrichmentMetadata?: {
    /** Evidence level available when enrichment was last attempted */
    evidenceLevel?: EvidenceLevel;
    /** Reason for pending state (what evidence is missing) */
    pendingReason?: string;
    /** Number of enrichment retry attempts (0 = first attempt) */
    retryCount?: number;
    /** Last retry timestamp (ISO 8601 format) */
    lastRetryTimestamp?: string;
    /** Knowledge domain classification ('Academic' | 'Software' | 'Farming' | 'General') */
    knowledge_domain?: string;
    /** Classification confidence score (0.0-1.0) */
    classification_confidence?: number;
    /** Template used for enrichment */
    template_used?: string;
  };
}

/**
 * Processing registry stored in plugin data
 * Tracks which items have been seen, proposed, accepted, rejected, or imported
 */
export interface Registry {
  /** Schema version for future migrations */
  version: number;
  /** Map of Zotero itemID (as string) to registry entry */
  entries: Record<string, RegistryEntry>;
  /** Unix timestamp of last modification */
  lastModified: number;
}

/**
 * Result of AI-powered enrichment for a Zotero item
 *
 * Contains the enriched literature note content with YAML frontmatter,
 * metadata about the enrichment process, and evidence sources used.
 */
export interface EnrichmentResult {
  /** Full markdown content with YAML frontmatter + body sections */
  content: string;
  /** Parsed YAML frontmatter as object */
  metadata: Record<string, any>;
  /** Evidence sources used during enrichment */
  evidenceUsed: {
    /** Evidence level achieved */
    level: EvidenceLevel;
    /** Source identifiers (e.g., ['pdf_fulltext'], ['zotero_notes']) */
    sources: string[];
  };
  /** ISO timestamp when enrichment completed */
  enrichedAt: string;
  /** AI model identifier used for enrichment */
  modelUsed: string;
  /** Estimated token count consumed (optional) */
  tokenCount?: number;
}

/**
 * Enrichment timeout error
 *
 * Thrown when LLM enrichment exceeds timeout threshold (2 minutes)
 */
export class EnrichmentTimeoutError extends Error {
  constructor(public itemId: number, message: string) {
    super(message);
    this.name = 'EnrichmentTimeoutError';
  }
}

/**
 * Enrichment API error
 *
 * Thrown when LLM API call fails (network, authentication, rate limit)
 */
export class EnrichmentAPIError extends Error {
  constructor(public itemId: number, message: string, public cause?: Error) {
    super(message);
    this.name = 'EnrichmentAPIError';
  }
}

/**
 * Enrichment parse error
 *
 * Thrown when LLM response cannot be parsed or validated
 */
export class EnrichmentParseError extends Error {
  constructor(public itemId: number, message: string) {
    super(message);
    this.name = 'EnrichmentParseError';
  }
}

/**
 * Context captured when enrichment fails at any stage
 *
 * Used to generate diagnostic stub notes with complete failure information.
 */
export interface FailureContext {
  /** Stage where enrichment failed */
  stage: 'classification' | 'extraction' | 'enrichment' | 'validation';
  /** Error that caused the failure */
  error: Error;
  /** Zotero item being processed */
  item: ZoteroItem;
  /** Classification result (if classification stage completed) */
  classification?: {
    domain: string;
    confidence: number;
  };
  /** Evidence extraction result (if extraction stage completed) */
  evidence?: {
    level: EvidenceLevel;
    sources: string[];
  };
  /** Partial enrichment output before validation failed */
  partialEnrichment?: string;
}

/**
 * Stub note structure for failed enrichments
 *
 * Contains minimal valid note with diagnostic information and retry guidance.
 */
export interface StubNote {
  /** Note title (from Zotero item) */
  title: string;
  /** Frontmatter metadata object */
  metadata: Record<string, any>;
  /** Diagnostic information for user */
  diagnostic: {
    /** Stage where failure occurred */
    stage_failed: string;
    /** Evidence level available at failure time */
    evidence_level: string;
    /** Full error stack trace */
    full_error?: string;
  };
  /** Note body content with diagnostic sections */
  content: string;
}
