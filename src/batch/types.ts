/**
 * Batch Type Definitions
 *
 * Defines interfaces for batch generation and configuration.
 */

import type { ZoteroItem } from '../types';

/**
 * Options for batch generation
 */
export interface BatchOptions {
  /** Number of items to include in the batch */
  size: number;
  /** Whether to include deferred items when insufficient unprocessed items exist */
  includeDeferred?: boolean;
}

/**
 * Generated batch of items ready for triage
 */
export interface Batch {
  /** Items included in this batch */
  items: ZoteroItem[];
  /** Unix timestamp when batch was generated */
  generatedAt: number;
  /** Whether this batch includes any deferred items */
  includesDeferred: boolean;
}
