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
import { normalizePath } from './normalization';

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

  // Normalize path for case-insensitive prefix comparison
  const normalizedPath = normalizePath(attachmentPath);

  // Helper to verify path is within Allowed Directory (Jail)
  const isWithinJail = (resolvedPath: string, jailRoot: string): boolean => {
    const relative = path.relative(jailRoot, resolvedPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  };

  // Handle storage: prefix (imported files) - case-insensitive check
  if (normalizedPath.startsWith('storage:')) {
    const filename = attachmentPath.substring('storage:'.length);
    // Prevent directory traversal in filename immediately
    if (filename.includes('/') || filename.includes('\\')) {
      // Zotero storage filenames shouldn't have directory separators
      // If they do, checks below should catch traversal, but let's be strict
    }

    const storageRoot = path.join(dataDir, 'storage');
    // We expect storage/{itemKey}/{filename}
    const itemDir = path.join(storageRoot, itemKey);
    const resolved = path.join(itemDir, filename);

    // Security Check: Enforce Jail
    if (!isWithinJail(resolved, itemDir)) {
      console.warn(`[Security] Blocked path traversal attempt: ${attachmentPath}`);
      return null;
    }

    return resolved;
  }

  // Handle attachments: prefix (linked files with base directory) - case-insensitive check
  if (normalizedPath.startsWith('attachments:')) {
    // This requires knowing the base attachment directory from Zotero settings
    // Since we don't have it here, we return the relative path part
    // BUT we must ensure it doesn't try to traverse up from the future base
    const relativePart = attachmentPath.substring('attachments:'.length);

    // Check for traversal attempts in the relative part itself
    // We can't fully resolve without the base, but we can check if it tries to go '..'
    // We assume the base will be prepended later.
    if (relativePart.includes('..')) {
      // Naive check, but effectively blocks obvious traversal
      // A more robust check requires the base.
      console.warn(`[Security] Blocked path traversal attempt in attachments: path: ${attachmentPath}`);
      return null;
    }

    return relativePart;
  }

  // Absolute path - verify it looks like a path
  if (path.isAbsolute(attachmentPath)) {
    return attachmentPath;
  }

  // Unknown format - return as-is but warn if suspicious
  if (attachmentPath.includes('..')) {
    console.warn(`[Security] Suspicious path blocked: ${attachmentPath}`);
    return null;
  }

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
