/**
 * Deep merge utility for settings objects
 * 
 * recursively merges source object into target object.
 * - Objects are merged recursively
 * - Arrays are replaced (not concatenated) to avoid duplicates
 * - Primitives are replaced
 */
export function deepMerge(target: any, source: any): any {
    // If source is null/undefined, nothing to merge, return target (defaults)
    if (source === null || source === undefined) {
        return target;
    }

    // If target is null/undefined, just return source
    if (target === null || target === undefined) {
        return source;
    }

    if (typeof target !== 'object' || typeof source !== 'object') {
        return source;
    }

    if (Array.isArray(target) || Array.isArray(source)) {
        // For settings, we usually want to replace arrays entirely rather than merging them
        // This prevents duplicate entries when loading settings
        return Array.isArray(source) ? source : target;
    }

    const output = { ...target };

    for (const key of Object.keys(source)) {
        if (source[key] instanceof Object && key in target) {
            output[key] = deepMerge(target[key], source[key]);
        } else {
            output[key] = source[key];
        }
    }

    return output;
}
