/**
 * NoteGenerator - Creates literature notes from Zotero items
 *
 * Generates markdown files with YAML frontmatter containing rich metadata.
 * Handles file creation, folder management, and filename sanitization.
 */

import { App, TFile, TFolder } from 'obsidian';
import type { ZoteroItem } from '../db/zotero-connector';
import { generateFrontmatter, generateNoteBody } from './templates';

/**
 * Characters not allowed in filenames across platforms
 */
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/**
 * Maximum filename length (leaving room for extension and path)
 */
const MAX_FILENAME_LENGTH = 100;

/**
 * NoteGenerator creates literature notes from Zotero items
 */
export class NoteGenerator {
  private app: App;
  private outputFolder: string;

  /**
   * Create a new NoteGenerator
   *
   * @param app - Obsidian app instance
   * @param outputFolder - Folder path for created notes (relative to vault root)
   */
  constructor(app: App, outputFolder: string) {
    this.app = app;
    this.outputFolder = outputFolder;
  }

  /**
   * Update the output folder path.
   * Call this when settings change.
   *
   * @param folder - New output folder path
   */
  setOutputFolder(folder: string): void {
    this.outputFolder = folder;
  }

  /**
   * Create a literature note for a Zotero item.
   *
   * @param item - Zotero item to create note for
   * @returns The created TFile
   * @throws Error if file already exists or creation fails
   */
  async createNote(item: ZoteroItem): Promise<TFile> {
    const filePath = this.getFilePath(item);

    // Check if file already exists
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing) {
      throw new Error(`Note already exists: ${filePath}`);
    }

    // Ensure output folder exists
    await this.ensureFolder(this.outputFolder);

    // Generate content
    const content = this.generateContent(item);

    // Create the file
    const file = await this.app.vault.create(filePath, content);

    return file;
  }

  /**
   * Generate the full content for a literature note.
   *
   * @param item - Zotero item
   * @returns Complete markdown content (frontmatter + body)
   */
  generateContent(item: ZoteroItem): string {
    const frontmatter = generateFrontmatter(item);
    const body = generateNoteBody();

    return frontmatter + body;
  }

  /**
   * Preview the content that would be created for an item.
   * Same as generateContent but named for clarity in UI contexts.
   *
   * @param item - Zotero item
   * @returns Complete markdown content that would be created
   */
  previewContent(item: ZoteroItem): string {
    return this.generateContent(item);
  }

  /**
   * Get the file path where a note would be created.
   *
   * @param item - Zotero item
   * @returns Full path relative to vault root
   */
  getFilePath(item: ZoteroItem): string {
    const filename = this.sanitizeFilename(item.title);
    return `${this.outputFolder}/${filename}.md`;
  }

  /**
   * Sanitize a title for use as a filename.
   *
   * - Removes illegal characters
   * - Normalizes whitespace
   * - Limits length
   * - Handles empty result
   *
   * @param title - Title to sanitize
   * @returns Safe filename (without extension)
   */
  sanitizeFilename(title: string): string {
    if (!title) {
      return 'Untitled';
    }

    let filename = title
      // Remove illegal characters
      .replace(ILLEGAL_FILENAME_CHARS, '')
      // Replace multiple spaces/tabs with single space
      .replace(/\s+/g, ' ')
      // Trim leading/trailing whitespace
      .trim();

    // Limit length
    if (filename.length > MAX_FILENAME_LENGTH) {
      filename = filename.substring(0, MAX_FILENAME_LENGTH).trim();
    }

    // Handle empty result
    if (!filename) {
      return 'Untitled';
    }

    return filename;
  }

  /**
   * Ensure a folder exists, creating it and parents if needed.
   *
   * @param folderPath - Path to folder (relative to vault root)
   */
  async ensureFolder(folderPath: string): Promise<void> {
    if (!folderPath) {
      return;
    }

    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    if (existing instanceof TFolder) {
      return;
    }

    // Split path and create each level
    const parts = folderPath.split('/').filter(p => p.length > 0);
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      const folder = this.app.vault.getAbstractFileByPath(currentPath);
      if (!folder) {
        await this.app.vault.createFolder(currentPath);
      }
    }
  }
}
