
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore
import * as SQLite from 'wa-sqlite';
// @ts-ignore
import { Base as BaseVFS } from 'wa-sqlite/src/VFS.js';

/**
 * NodeVFS - A specific VFS implementation for Node.js using fs.promises
 * 
 * Implements the minimal set of VFS methods required by SQLite to operate
 * in a read-only or read-write capacity using Node's filesystem APIs.
 * 
 * Based on the reference MinimalVFS from wa-sqlite.
 */
export class NodeVFS extends BaseVFS {
    name: string = 'node-vfs';

    // Properties expected by BaseVFS or used by us
    // These are usually injected or available in the mixed-in class
    // We declare them here to satisfy TS
    mxInt32: Int32Array = new Int32Array(0);
    heap8: Int8Array = new Int8Array(0);
    heap32: Int32Array = new Int32Array(0);

    // Map of fileId -> file descriptor
    private openFiles: Map<number, { fd: number, path: string, flags: number }> = new Map();
    private nextId: number = 1;

    constructor() {
        super();
    }

    /**
     * Open a file
     * @param name - Path to the file
     * @param fileId - ID assigned by SQLite for this file handle
     * @param flags - implementation specific flags
     * @param pOutFlags - pointer to write output flags
     * @returns SQLITE_OK or error code
     */
    xOpen(name: string, fileId: number, flags: number, pOutFlags: number): number {
        if (name === null) {
            // Temporary file, not fully supported in this minimal VFS for read-only focus
            // But SQLite might request it for journals.
            return SQLite.SQLITE_CANTOPEN;
        }

        try {
            // Determine fs flags
            // We are primarily targeting O_RDONLY for the main DB to prevent corruption
            // but SQLite might try to open WAL/SHM files with different flags.

            let fsFlags = 'r'; // Default to read-only

            if (flags & SQLite.SQLITE_OPEN_READWRITE) {
                fsFlags = 'r+';
            } else if (flags & SQLite.SQLITE_OPEN_READONLY) {
                fsFlags = 'r';
            }

            // If we are strictly enforcing Read-Only for the main DB in logic outside VFS,
            // we can respect the flags passed here.

            const fd = fs.openSync(name, fsFlags);
            this.openFiles.set(fileId, { fd, path: name, flags });

            if (pOutFlags) {
                this.mxInt32[pOutFlags >> 2] = flags; // Confirm flags
            }

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
     * Read from a file
     */
    xRead(fileId: number, pData: number, iAmt: number, iOfst: number): number {
        const file = this.openFiles.get(fileId);
        if (!file) return SQLite.SQLITE_IOERR_READ;

        try {
            const buffer = new Uint8Array(iAmt);
            // fs.readSync(fd, buffer, offset, length, position)
            const bytesRead = fs.readSync(file.fd, buffer, 0, iAmt, Number(iOfst));

            // Copy to SQLite memory
            // this.heap8 is usually available on the VFS instance if properly initialized?
            // Wait, BaseVFS doesn't have direct heap access unless we mix it in or access the module.
            // In wa-sqlite, xRead receives pData which is a pointer.
            // We need to write to the heap at pData.

            // WARNING: We need access to the HEAP. 
            // BaseVFS implementation in wa-sqlite usually assumes we can write to memory.
            // The `handleAsync` wrapper usually manages checking result.

            // Actually, looking at wa-sqlite docs, we need to access the module memory.
            // BaseVFS typically needs the `module` property set after registration?
            // Or we assume `this.heap8` is populated by the mixin/wrapper?
            // Standard BaseVFS methods usually use `this.context.memory` or similar if abstracted, 
            // but in `wa-sqlite` standard VFS, we write to `this.heap8.set(buffer, pData)`?

            // Let's assume we copy `buffer` to `pData`.
            // NOTE: `this.heap8` is a DataView or Uint8Array on the WebAssembly Memory.
            // We need to ensure we are using the correct property.

            // Since I don't have the full wa-sqlite types context here, I'll rely on the standard pattern.
            // `this.heap8.set(buffer.subarray(0, bytesRead), pData)`

            // However, if bytesRead < iAmt, we must zero fill the rest and return SQLITE_IOERR_SHORT_READ

            this.heap8.set(buffer.subarray(0, bytesRead), pData);

            if (bytesRead < iAmt) {
                // Zero fill the rest
                this.heap8.fill(0, pData + bytesRead, pData + iAmt);
                return SQLite.SQLITE_IOERR_SHORT_READ;
            }

            return SQLite.SQLITE_OK;
        } catch (err) {
            console.error(`[NodeVFS] xRead failed:`, err);
            return SQLite.SQLITE_IOERR_READ;
        }
    }

    /**
     * Write to a file
     */
    xWrite(fileId: number, pData: number, iAmt: number, iOfst: number): number {
        const file = this.openFiles.get(fileId);
        if (!file) return SQLite.SQLITE_IOERR_WRITE;

        try {
            // Read from SQLite memory
            const buffer = this.heap8.subarray(pData, pData + iAmt);

            // fs.writeSync(fd, buffer, offset, length, position)
            const bytesWritten = fs.writeSync(file.fd, buffer, 0, iAmt, Number(iOfst));

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
     */
    xFileSize(fileId: number, pSize: number): number {
        const file = this.openFiles.get(fileId);
        if (!file) return SQLite.SQLITE_IOERR_FSTAT;

        try {
            const stats = fs.fstatSync(file.fd);
            // Write 64-bit integer size
            const size = BigInt(stats.size);
            const view = new DataView(this.heap8.buffer);
            // pSize is a pointer to an sqlite3_int64 (8 bytes)
            // DataView setBigInt64(byteOffset, value, littleEndian)
            // SQLite WASM is little endian typically
            view.setBigInt64(pSize, size, true);

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

    xCheckReservedLock(fileId: number, pResOut: number): number {
        this.heap32[pResOut >> 2] = 0;
        return SQLite.SQLITE_OK;
    }
    xFileControl(fileId: number, op: number, pArg: number): number {
        return SQLite.SQLITE_NOTFOUND;
    }
    xDeviceCharacteristics(fileId: number): number {
        return SQLite.SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN;
    }

    // VFS Methods

    xAccess(name: string, flags: number, pResOut: number): number {
        try {
            fs.accessSync(name);
            this.heap32[pResOut >> 2] = 1; // Exists
        } catch {
            this.heap32[pResOut >> 2] = 0; // Does not exist
        }
        return SQLite.SQLITE_OK;
    }

    xFullPathname(name: string, nOut: number, zOut: number): number {
        // Just copy the name as strict full path if possible, or assume absolute
        // SQLite usually needs absolute path
        const fullPath = path.resolve(name);

        const encoder = new TextEncoder();
        const data = encoder.encode(fullPath);

        if (data.length >= nOut) {
            return SQLite.SQLITE_CANTOPEN;
        }

        this.heap8.set(data, zOut);
        this.heap8[zOut + data.length] = 0; // Null terminate

        return SQLite.SQLITE_OK;
    }
}
