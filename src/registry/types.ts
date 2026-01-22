/**
 * Registry Type Definitions
 *
 * Re-exports and extends registry types for the state persistence module.
 */

// Re-export core registry types from main types module
export type { RegistryState, RegistryEntry, Registry } from '../types';

/**
 * Statistics for registry state distribution
 */
export interface RegistryStats {
  /** Total number of entries in registry */
  total: number;
  /** Items not yet seen/processed */
  unseen: number;
  /** Items proposed in current batch */
  proposed: number;
  /** Items accepted by user */
  accepted: number;
  /** Items rejected by user */
  rejected: number;
  /** Items successfully imported to vault */
  imported: number;
}
