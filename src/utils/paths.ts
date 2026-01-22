/**
 * Cross-platform path utilities for Zotero database and file detection
 *
 * Zotero stores its database in OS-specific default locations:
 * - Windows: %USERPROFILE%\Zotero\zotero.sqlite
 * - macOS: ~/Zotero/zotero.sqlite
 * - Linux: ~/Zotero/zotero.sqlite or ~/.zotero/zotero/zotero.sqlite
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Platform type from process.platform
 */
type Platform = 'win32' | 'darwin' | 'linux' | string;

/**
 * Get default paths where Zotero database might be located.
 * Returns paths in order of likelihood for the current platform.
 *
 * @returns Array of possible database paths (may not exist)
 */
export function getDefaultPaths(): string[] {
  const home = os.homedir();
  const platform: Platform = process.platform;

  const paths: string[] = [];

  if (platform === 'win32') {
    // Windows: typically in user profile
    paths.push(path.join(home, 'Zotero', 'zotero.sqlite'));
    // Alternative location (portable install)
    paths.push(path.join(home, 'Documents', 'Zotero', 'zotero.sqlite'));
  } else if (platform === 'darwin') {
    // macOS: in user home
    paths.push(path.join(home, 'Zotero', 'zotero.sqlite'));
    // Legacy location
    paths.push(path.join(home, 'Library', 'Application Support', 'Zotero', 'zotero.sqlite'));
  } else {
    // Linux: two common locations
    paths.push(path.join(home, 'Zotero', 'zotero.sqlite'));
    paths.push(path.join(home, '.zotero', 'zotero', 'zotero.sqlite'));
    // Snap package location
    paths.push(path.join(home, 'snap', 'zotero-snap', 'common', 'Zotero', 'zotero.sqlite'));
  }

  return paths;
}

/**
 * Detect the Zotero database path by checking default locations.
 *
 * @returns Path to existing zotero.sqlite, or null if not found
 */
export function detectZoteroPath(): string | null {
  const possiblePaths = getDefaultPaths();

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // Ignore access errors, continue to next path
    }
  }

  return null;
}

/**
 * Get the Zotero data directory from a database path.
 * The data directory contains storage/ folder with attachments.
 *
 * @param dbPath - Full path to zotero.sqlite
 * @returns Directory containing the database
 */
export function getZoteroDataDir(dbPath: string): string {
  return path.dirname(dbPath);
}

/**
 * Attachment link modes from Zotero
 */
export enum LinkMode {
  ImportedFile = 0,
  ImportedURL = 1,
  LinkedFile = 2,
  LinkedURL = 3
}

/**
 * Resolve a PDF attachment path to its full filesystem path.
 *
 * Zotero stores attachment paths in different formats:
 * - "storage:filename.pdf" - File stored in storage/{itemKey}/
 * - "attachments:relative/path.pdf" - Relative to linked attachments base dir
 * - Absolute path - Direct filesystem path
 *
 * @param attachmentPath - Raw path from itemAttachments.path
 * @param dataDir - Zotero data directory (contains storage/)
 * @param itemKey - Zotero item key for storage path resolution
 * @returns Resolved full path, or null if unresolvable
 */
export function resolvePdfPath(
  attachmentPath: string | null,
  dataDir: string,
  itemKey: string
): string | null {
  if (!attachmentPath) {
    return null;
  }

  // Handle storage: prefix (imported files)
  if (attachmentPath.startsWith('storage:')) {
    const filename = attachmentPath.substring('storage:'.length);
    const resolved = path.join(dataDir, 'storage', itemKey, filename);

    // Verify file exists
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    // Return the path even if file doesn't exist - let caller handle
    return resolved;
  }

  // Handle attachments: prefix (linked files with base directory)
  if (attachmentPath.startsWith('attachments:')) {
    // This requires knowing the base attachment directory from Zotero settings
    // Return the relative path - caller may need to resolve further
    return attachmentPath.substring('attachments:'.length);
  }

  // Absolute path - verify it looks like a path
  if (path.isAbsolute(attachmentPath)) {
    return attachmentPath;
  }

  // Unknown format - return as-is
  return attachmentPath;
}

/**
 * Sanitize a string for use as a filename.
 * Removes or replaces characters that are invalid in filenames.
 *
 * @param name - Original filename or title
 * @param maxLength - Maximum length (default 100)
 * @returns Sanitized filename (without extension)
 */
export function sanitizeFilename(name: string, maxLength: number = 100): string {
  return name
    // Remove characters invalid on Windows and other systems
    .replace(/[<>:"/\\|?*]/g, '')
    // Replace newlines and tabs with spaces
    .replace(/[\r\n\t]/g, ' ')
    // Normalize multiple spaces to single space
    .replace(/\s+/g, ' ')
    // Trim whitespace
    .trim()
    // Limit length
    .slice(0, maxLength);
}

/**
 * Check if a path is accessible for reading.
 *
 * @param filepath - Path to check
 * @returns true if file exists and is readable
 */
export function isReadable(filepath: string): boolean {
  try {
    fs.accessSync(filepath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
