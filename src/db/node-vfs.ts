
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore
import * as SQLite from 'wa-sqlite';
// @ts-ignore
import { Base as BaseVFS } from 'wa-sqlite/src/VFS.js';

/**
 * Simple LRU Page Cache for NodeVFS
 * 
 * Caches 4KB pages from SQLite database reads to reduce syscall overhead.
 * Default: 12500 pages = 50MB cache (12500 * 4096 bytes)
 */
class PageCache {
    private cache: Map<string, Buffer> = new Map();
    private maxPages: number;

    constructor(maxPages: number = 12500) {
        this.maxPages = maxPages;
    }

    private makeKey(fileId: number, offset: number, length: number): string {
        return `${fileId}:${offset}:${length}`;
    }

    get(fileId: number, offset: number, length: number): Buffer | undefined {
        const key = this.makeKey(fileId, offset, length);
        const value = this.cache.get(key);
        if (value) {
            // Move to end for LRU (delete and re-add)
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    set(fileId: number, offset: number, length: number, data: Buffer): void {
        const key = this.makeKey(fileId, offset, length);
        // Evict oldest if at capacity
        if (this.cache.size >= this.maxPages && !this.cache.has(key)) {
            const oldest = this.cache.keys().next().value;
            if (oldest) this.cache.delete(oldest);
        }
        this.cache.set(key, data);
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}

/**
 * NodeVFS - A specific VFS implementation for Node.js using fs.promises
 * 
 * Implements the minimal set of VFS methods required by SQLite to operate
 * in a read-only or read-write capacity using Node's filesystem APIs.
 * 
 * Features:
 * - LRU page cache for read operations (50MB default)
 * - Reusable buffer pool to reduce GC pressure
 * 
 * Based on the reference MinimalVFS from wa-sqlite.
 */
export class NodeVFS extends BaseVFS {
    name: string = 'node-vfs';

    // Map of fileId -> file descriptor
    private openFiles: Map<number, { fd: number, path: string, flags: number, isTemp?: boolean }> = new Map();

    // Page cache for read optimization
    private pageCache: PageCache = new PageCache();

    // Reusable buffer pool (reduces GC pressure)
    private bufferPool: Map<number, Buffer> = new Map();

    constructor() {
        super();
    }

    /**
     * Open a file
     * @param name - Path to the file (null for temporary files)
     * @param fileId - ID assigned by SQLite for this file handle
     * @param flags - implementation specific flags
     * @param pOutFlags - DataView to write output flags
     * @returns SQLITE_OK or error code
     */
    xOpen(name: string | null, fileId: number, flags: number, pOutFlags: DataView): number {
        // console.log(`[NodeVFS] xOpen called: name=${name}, fileId=${fileId}, flags=${flags}`);

        try {
            let filePath: string;
            let fsFlags: string;
            let isTemp = false;

            if (name === null) {
                // Temporary file - create in system temp directory
                const os = require('os');
                const tempDir = os.tmpdir();
                filePath = path.join(tempDir, `sqlite_temp_${fileId}_${Date.now()}.tmp`);
                fsFlags = 'w+'; // Create and read/write
                isTemp = true;
                console.log(`[NodeVFS] Creating temp file: ${filePath}`);
            } else {
                filePath = name;

                if (flags & SQLite.SQLITE_OPEN_READWRITE) {
                    fsFlags = 'r+';
                } else if (flags & SQLite.SQLITE_OPEN_READONLY) {
                    fsFlags = 'r';
                } else {
                    fsFlags = 'r';
                }
            }

            const fd = fs.openSync(filePath, fsFlags);
            this.openFiles.set(fileId, { fd, path: filePath, flags, isTemp });

            pOutFlags.setInt32(0, flags, true);

            return SQLite.SQLITE_OK;
        } catch (err: any) {
            console.error(`[NodeVFS] xOpen failed for ${name}:`, err);
            return SQLite.SQLITE_CANTOPEN;
        }
    }

    /**
     * Close a file
     */
    xClose(fileId: number): number {
        const file = this.openFiles.get(fileId);
        if (file) {
            try {
                fs.closeSync(file.fd);

                // Delete temporary files after closing
                if (file.isTemp) {
                    try {
                        fs.unlinkSync(file.path);
                        console.log(`[NodeVFS] Deleted temp file: ${file.path}`);
                    } catch (unlinkErr) {
                        console.warn(`[NodeVFS] Failed to delete temp file: ${file.path}`, unlinkErr);
                    }
                }

                this.openFiles.delete(fileId);
                return SQLite.SQLITE_OK;
            } catch (err) {
                console.error(`[NodeVFS] xClose failed for fileId ${fileId}:`, err);
                return SQLite.SQLITE_IOERR_CLOSE;
            }
        }
        return SQLite.SQLITE_OK;
    }

    /**
     * Get or create a reusable buffer of the given size
     */
    private getBuffer(size: number): Buffer {
        let buffer = this.bufferPool.get(size);
        if (!buffer) {
            buffer = Buffer.alloc(size);
            // Only cache common page sizes (4KB, 8KB, 16KB, etc.)
            if (size === 4096 || size === 8192 || size === 16384 || size === 32768) {
                this.bufferPool.set(size, buffer);
            }
        }
        return buffer;
    }

    /**
     * Read from a file
     * @param fileId - File handle ID
     * @param pData - Uint8Array to write data into (from wa-sqlite)
     * @param iOfst - Offset in the file to read from
     * @returns SQLITE_OK or error code
     */
    xRead(fileId: number, pData: Uint8Array, iOfst: number): number {
        const file = this.openFiles.get(fileId);
        if (!file) return SQLite.SQLITE_IOERR_READ;

        try {
            const iAmt = pData.length;
            const offset = Number(iOfst);

            // Check page cache first
            const cached = this.pageCache.get(fileId, offset, iAmt);
            if (cached) {
                pData.set(cached);
                return SQLite.SQLITE_OK;
            }

            // Cache miss - read from disk
            const buffer = this.getBuffer(iAmt);
            const bytesRead = fs.readSync(file.fd, buffer, 0, iAmt, offset);

            // Copy to pData
            pData.set(buffer.subarray(0, bytesRead));

            if (bytesRead < iAmt) {
                // Zero fill the rest
                pData.fill(0, bytesRead);
                return SQLite.SQLITE_IOERR_SHORT_READ;
            }

            // Store in cache (only full reads)
            this.pageCache.set(fileId, offset, iAmt, Buffer.from(buffer.subarray(0, bytesRead)));

            return SQLite.SQLITE_OK;
        } catch (err) {
            console.error(`[NodeVFS] xRead failed:`, err);
            return SQLite.SQLITE_IOERR_READ;
        }
    }

    /**
     * Write to a file
     * @param fileId - File handle ID
     * @param pData - Uint8Array containing data to write (from wa-sqlite)
     * @param iOfst - Offset in the file to write to
     * @returns SQLITE_OK or error code
     */
    xWrite(fileId: number, pData: Uint8Array, iOfst: number): number {
        const file = this.openFiles.get(fileId);
        if (!file) return SQLite.SQLITE_IOERR_WRITE;

        try {
            const iAmt = pData.length;
            const bytesWritten = fs.writeSync(file.fd, pData, 0, iAmt, Number(iOfst));

            if (bytesWritten !== iAmt) {
                return SQLite.SQLITE_IOERR_WRITE;
            }

            return SQLite.SQLITE_OK;
        } catch (err) {
            console.error(`[NodeVFS] xWrite failed:`, err);
            return SQLite.SQLITE_IOERR_WRITE;
        }
    }

    /**
     * Truncate a file
     */
    xTruncate(fileId: number, size: number): number {
        const file = this.openFiles.get(fileId);
        if (!file) return SQLite.SQLITE_IOERR_TRUNCATE;

        try {
            fs.ftruncateSync(file.fd, size);
            return SQLite.SQLITE_OK;
        } catch (err) {
            return SQLite.SQLITE_IOERR_TRUNCATE;
        }
    }

    /**
     * Sync a file
     */
    xSync(fileId: number, flags: number): number {
        const file = this.openFiles.get(fileId);
        if (!file) return SQLite.SQLITE_IOERR_FSYNC;

        try {
            fs.fsyncSync(file.fd);
            return SQLite.SQLITE_OK;
        } catch (err) {
            return SQLite.SQLITE_IOERR_FSYNC;
        }
    }

    /**
     * File size
     * @param fileId - File handle ID
     * @param pSize64 - DataView to write the 64-bit file size
     * @returns SQLITE_OK or error code
     */
    xFileSize(fileId: number, pSize64: DataView): number {
        const file = this.openFiles.get(fileId);
        if (!file) return SQLite.SQLITE_IOERR_FSTAT;

        try {
            const stats = fs.fstatSync(file.fd);
            const size = BigInt(stats.size);
            pSize64.setBigInt64(0, size, true);
            return SQLite.SQLITE_OK;
        } catch (err) {
            return SQLite.SQLITE_IOERR_FSTAT;
        }
    }

    /**
      * Lock/Unlock - Minimal implementation for single-process read-only usually ignores these
      * but for WAL we might need stubbing.
      */
    xLock(fileId: number, lock: number): number {
        return SQLite.SQLITE_OK;
    }

    xUnlock(fileId: number, lock: number): number {
        return SQLite.SQLITE_OK;
    }

    /**
     * Check reserved lock
     * @param fileId - File handle ID
     * @param pResOut - DataView to write the result
     * @returns SQLITE_OK
     */
    xCheckReservedLock(fileId: number, pResOut: DataView): number {
        pResOut.setInt32(0, 0, true);
        return SQLite.SQLITE_OK;
    }
    xFileControl(fileId: number, op: number, pArg: DataView): number {
        return SQLite.SQLITE_NOTFOUND;
    }
    xDeviceCharacteristics(fileId: number): number {
        return SQLite.SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN;
    }

    // VFS Methods

    /**
     * Check file access
     * @param name - File path
     * @param flags - Access flags
     * @param pResOut - DataView to write the result
     * @returns SQLITE_OK
     */
    xAccess(name: string, flags: number, pResOut: DataView): number {
        try {
            fs.accessSync(name);
            pResOut.setInt32(0, 1, true); // Exists
        } catch {
            pResOut.setInt32(0, 0, true); // Does not exist
        }
        return SQLite.SQLITE_OK;
    }

    /**
     * Get full pathname (not needed for this VFS, paths are absolute)
     * Since wa-sqlite doesn't pass a buffer for xFullPathname in base VFS,
     * this is often not called or handled differently.
     * We'll keep a basic implementation.
     */
    // xFullPathname is not in the base VFS signatures, so we can remove it
    // or keep it if the VFS registration expects it.
    // For now, remove it as it uses heap8 which we removed.
}
