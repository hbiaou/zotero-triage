/**
 * Validation Service for Quality Gates
 *
 * Validates Zotero items against configurable quality gate rules using Zod schemas.
 * Per RESEARCH.md Pattern 2: Service with structured error formatting.
 *
 * VALIDATION FLOW:
 * 1. triage-view.ts (lines 157-175): When batch loads, validates all items if qualityGate.enabled
 *    - Shows aggregated Notice: "Validation: 2x Missing doi, 1x Missing abstract"
 * 2. triage-card.ts (line 95): Changes button text to "Accept Anyway" if validation failed
 * 3. triage-view.ts (lines 460-478): On Accept click, re-validates and shows OverrideConfirmModal if invalid
 *    - Modal lists specific missing fields for the item
 *    - User can confirm override or cancel import
 * 4. This service (lines 42-78): Returns early with valid:true if !config.enabled
 * 5. schemas.ts: Hardcoded Zod schemas define required fields (not configurable per item)
 *
 * CURRENT BEHAVIOR:
 * - If qualityGate.enabled = false → all items pass validation (no warnings, normal Accept button)
 * - If qualityGate.enabled = true → items validated against hardcoded schemas
 *   - Valid items: normal "Accept" button, no modal
 *   - Invalid items: "Accept Anyway" button, OverrideConfirmModal on click showing missing fields
 *
 * TESTING VALIDATION:
 * To verify quality gates are working:
 * 1. Enable "Block incomplete items" toggle in settings
 * 2. In Zotero, temporarily remove DOI from one journal article (creates invalid item)
 * 3. Generate batch in Triage view until that item appears
 * 4. Verify validation Notice appears at batch load: "Validation: 1x Missing doi"
 * 5. Verify item card shows "Accept Anyway" button (not "Accept")
 * 6. Click "Accept Anyway" → verify OverrideConfirmModal appears with "DOI" in missing fields list
 * 7. After testing, restore DOI in Zotero
 */

import { ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { ITEM_TYPE_SCHEMAS } from './schemas';
import type { ValidationResult, QualityGateConfig, ValidationError } from './types';
import type { ZoteroItem } from '../db/zotero-connector';
import { getErrorContext } from '../error/error-handler';

/**
 * ValidationService class
 *
 * Orchestrates validation of Zotero items against per-item-type schemas.
 * Returns structured validation results with human-readable error messages.
 */
export class ValidationService {
  /**
   * Create a new ValidationService
   *
   * @param config - Quality gate configuration from plugin settings
   */
  constructor(private config: QualityGateConfig) { }

  /**
   * Validate a Zotero item against its item type schema
   *
   * Flow:
   * 1. Check if quality gates are enabled
   * 2. Get schema for item type
   * 3. Validate item against schema
   * 4. Format errors if validation fails
   * 5. Extract missing field names
   *
   * NOTE: Validation rules are defined in hardcoded Zod schemas (schemas.ts), not
   * dynamically from config.rules.requiredFields. The config only controls whether
   * validation is enabled/disabled via config.enabled. This is intentional - the
   * schemas represent research-backed minimum viable metadata requirements.
   *
   * @param item - Zotero item to validate
   * @returns ValidationResult with valid flag, errors, and missing fields
   */
  validate(item: ZoteroItem): ValidationResult {
    try {
      // If quality gates are disabled, all items pass
      if (!this.config.enabled) {
        return {
          valid: true,
          errors: [],
          warnings: [],
          missingFields: []
        };
      }

      // Get schema for this item type
      // Convert itemType to lowercase key (e.g., "journalArticle" -> "journalarticle")
      const itemTypeKey = item.itemType.toLowerCase().replace(/\s+/g, '');
      const schema = ITEM_TYPE_SCHEMAS[itemTypeKey];

      // If no schema exists for this item type, consider it valid
      // (unknown types are allowed through)
      if (!schema) {
        return {
          valid: true,
          errors: [],
          warnings: [],
          missingFields: []
        };
      }

      // Validate item against schema using safeParse
      // safeParse returns { success: boolean, data?, error? }
      const result = schema.safeParse(item);

      if (result.success) {
        return {
          valid: true,
          errors: [],
          warnings: [],
          missingFields: []
        };
      }

      // Validation failed - format errors for display
      const zodError = result.error as ZodError;

      // Use zod-validation-error v3 to generate user-friendly error messages
      const validationError = fromZodError(zodError, {
        prefix: null,
        prefixSeparator: '',
        issueSeparator: '\n'
      });
      const errorMessage = validationError.toString();

      // Split into individual error strings and map to ValidationError objects
      const errors = errorMessage
        .split('\n')
        .filter(e => e.trim().length > 0)
        .map((msg): ValidationError => ({
          type: 'schema',
          severity: 'error',
          message: msg
        }));

      // Extract missing field names from ZodError issues
      // Filter for 'too_small' (array/string too short) and 'invalid_type' (null/undefined)
      const missingFields = zodError.issues
        .filter(issue =>
          issue.code === 'too_small' ||
          issue.code === 'invalid_type'
        )
        .map(issue => {
          // issue.path is an array like ['fieldName'] or ['nested', 'field']
          const fieldPath = issue.path.join('.');
          return fieldPath || 'unknown';
        })
        .filter((field): field is string => field.length > 0);

      // Remove duplicates from missing fields
      const uniqueMissingFields = [...new Set(missingFields)];

      return {
        valid: false,
        errors,
        warnings: [],
        missingFields: uniqueMissingFields
      };
    } catch (err) {
      const context = getErrorContext(err);
      console.error('[ValidationService]', context.message, context.technicalDetails);
      // Return validation failure rather than throwing
      return {
        valid: false,
        errors: [{
          type: 'schema',
          severity: 'error',
          message: context.message
        }],
        warnings: [],
        missingFields: []
      };
    }
  }

  /**
   * Update the quality gate configuration
   *
   * Allows updating validation rules at runtime.
   *
   * @param config - New quality gate configuration
   */
  updateConfig(config: QualityGateConfig): void {
    this.config = config;
  }

  /**
   * Get the current quality gate configuration
   *
   * @returns Current configuration
   */
  getConfig(): QualityGateConfig {
    return this.config;
  }
}
