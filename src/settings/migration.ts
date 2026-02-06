import { DEFAULT_SETTINGS, ZoteroTriageSettings } from '../types';

/**
 * Current settings schema version
 * Increment this whenever the settings structure changes in a way that requires migration
 */
export const SETTINGS_VERSION = 1;

/**
 * Migrates settings from older versions to the current version.
 * 
 * @param data - Raw data loaded from data.json
 * @returns Migrated settings object matching the current schema
 */
export function migrateSettings(data: any): ZoteroTriageSettings {
    // Deep copy defaults to ensure we have a valid base
    const result = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    // If no data, return defaults (already set)
    if (!data) {
        console.log('[Settings] No data found, using defaults (v1)');
        return result;
    }

    // Determine version (default to 0 if missing)
    const currentVersion = data.version || 0;

    // If version matches, just merge data on top of defaults
    // We use the same logic as deepMerge but specific to our known structure if needed
    // For now, we'll let the main validation logic handle strict type checking
    if (currentVersion === SETTINGS_VERSION) {
        return { ...result, ...data };
    }

    console.log(`[Settings] Migrating from version ${currentVersion} to ${SETTINGS_VERSION}`);

    // Migration Chain
    let migratedData = data;

    if (currentVersion === 0) {
        migratedData = migrateV0toV1(migratedData);
    }

    // Future migrations:
    // if (currentVersion <= 1) {
    //   migratedData = migrateV1toV2(migratedData);
    // }

    // Final merge with defaults to ensure all fields exist
    return { ...result, ...migratedData, version: SETTINGS_VERSION };
}

/**
 * Migration from v0 (unversioned) to v1
 * - Adds 'version' field
 * - Ensures all required fields exist (handled by final merge, but we can do specific transforms here)
 * - Cleans up potential "junk" fields if necessary
 */
function migrateV0toV1(data: any): any {
    console.log('[Settings] Running migration v0 -> v1');

    // v0 data is basically the same structure but without version
    // We explicitly return it, the 'version' field will be added by the main migration function
    // If there were field renames, we would do them here.
    // Example: if 'maxItems' became 'batchSize'
    // if (data.maxItems && !data.batchSize) { data.batchSize = data.maxItems; }

    return data;
}
