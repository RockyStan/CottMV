/**
 * Cache Cleanup Module
 * ====================
 * 
 * This module handles automatic cleanup of transcoded video cache.
 * It ensures the cache doesn't grow indefinitely by:
 * 
 * 1. Deleting files that have exceeded their TTL (time-to-live)
 * 2. Deleting oldest files when cache exceeds max size (LRU strategy)
 * 
 * The cleanup can be run:
 * - Manually via the admin UI
 * - Automatically on a schedule (e.g., every hour via cron)
 * - On-demand when adding new files to the cache
 * 
 * Key Concepts:
 * - TTL: Time-to-live - how long a cached file should be kept
 * - LRU: Least Recently Used - delete oldest accessed files first
 */

import { readdir, stat, unlink, rmdir } from "fs/promises";
import { join } from "path";

/**
 * Configuration for cache cleanup
 */
export interface CleanupConfig {
  /** Directory containing cached transcoded files */
  cacheDirectory: string;
  /** Maximum cache size in bytes */
  maxSizeBytes: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
}

/**
 * Information about a cached file
 */
interface CachedFile {
  /** Full path to the file */
  path: string;
  /** File size in bytes */
  size: number;
  /** Last access time (Unix timestamp) */
  accessTime: number;
  /** Last modification time (Unix timestamp) */
  modTime: number;
}

/**
 * Result of a cleanup operation
 */
export interface CleanupResult {
  /** Number of files deleted */
  filesDeleted: number;
  /** Total bytes freed */
  bytesFreed: number;
  /** Files deleted due to TTL expiry */
  expiredFiles: string[];
  /** Files deleted due to size limit (LRU) */
  lruFiles: string[];
  /** Any errors encountered */
  errors: string[];
}

/**
 * Get all files in a directory recursively
 * 
 * @param dir - Directory to scan
 * @returns Array of file information objects
 */
async function getAllFiles(dir: string): Promise<CachedFile[]> {
  const files: CachedFile[] = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively get files from subdirectories
        const subFiles = await getAllFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        try {
          const stats = await stat(fullPath);
          files.push({
            path: fullPath,
            size: stats.size,
            accessTime: stats.atimeMs,
            modTime: stats.mtimeMs,
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  
  return files;
}

/**
 * Delete a file safely
 * 
 * @param filePath - Path to the file to delete
 * @returns true if deleted successfully, false otherwise
 */
async function safeDelete(filePath: string): Promise<boolean> {
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up empty directories
 * 
 * After deleting files, we may have empty directories left over.
 * This function removes them to keep the cache directory tidy.
 * 
 * @param dir - Directory to check and potentially remove
 * @param rootDir - Root cache directory (won't be deleted)
 */
async function cleanEmptyDirs(dir: string, rootDir: string): Promise<void> {
  if (dir === rootDir) return;
  
  try {
    const entries = await readdir(dir);
    if (entries.length === 0) {
      await rmdir(dir);
      // Recursively check parent directory
      const parentDir = join(dir, "..");
      await cleanEmptyDirs(parentDir, rootDir);
    }
  } catch {
    // Directory doesn't exist or can't be removed
  }
}

/**
 * Run cache cleanup
 * 
 * This is the main cleanup function that:
 * 1. Scans the cache directory for all files
 * 2. Deletes files that have exceeded their TTL
 * 3. If still over size limit, deletes oldest files (LRU)
 * 
 * @param config - Cleanup configuration
 * @returns Result of the cleanup operation
 * 
 * @example
 * ```typescript
 * const result = await runCleanup({
 *   cacheDirectory: "./cache/transcoded",
 *   maxSizeBytes: 10 * 1024 * 1024 * 1024, // 10 GB
 *   ttlMs: 24 * 60 * 60 * 1000, // 24 hours
 * });
 * console.log(`Freed ${result.bytesFreed} bytes`);
 * ```
 */
export async function runCleanup(config: CleanupConfig): Promise<CleanupResult> {
  const result: CleanupResult = {
    filesDeleted: 0,
    bytesFreed: 0,
    expiredFiles: [],
    lruFiles: [],
    errors: [],
  };

  // Get all cached files
  const files = await getAllFiles(config.cacheDirectory);
  
  if (files.length === 0) {
    return result;
  }

  const now = Date.now();
  const remainingFiles: CachedFile[] = [];

  // Step 1: Delete expired files (TTL)
  for (const file of files) {
    const age = now - file.modTime;
    
    if (age > config.ttlMs) {
      // File has exceeded TTL
      const deleted = await safeDelete(file.path);
      if (deleted) {
        result.filesDeleted++;
        result.bytesFreed += file.size;
        result.expiredFiles.push(file.path);
      } else {
        result.errors.push(`Failed to delete expired file: ${file.path}`);
      }
    } else {
      remainingFiles.push(file);
    }
  }

  // Step 2: Check if we're still over the size limit
  let currentSize = remainingFiles.reduce((sum, f) => sum + f.size, 0);
  
  if (currentSize > config.maxSizeBytes) {
    // Sort by access time (oldest first) for LRU deletion
    remainingFiles.sort((a, b) => a.accessTime - b.accessTime);
    
    // Delete oldest files until we're under the limit
    for (const file of remainingFiles) {
      if (currentSize <= config.maxSizeBytes) {
        break;
      }
      
      const deleted = await safeDelete(file.path);
      if (deleted) {
        result.filesDeleted++;
        result.bytesFreed += file.size;
        result.lruFiles.push(file.path);
        currentSize -= file.size;
      } else {
        result.errors.push(`Failed to delete LRU file: ${file.path}`);
      }
    }
  }

  // Step 3: Clean up empty directories
  await cleanEmptyDirs(config.cacheDirectory, config.cacheDirectory);

  return result;
}

/**
 * Get current cache statistics
 * 
 * @param cacheDirectory - Directory to analyze
 * @returns Object with cache statistics
 */
export async function getCacheStats(cacheDirectory: string): Promise<{
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeGb: number;
  oldestFile: { path: string; age: number } | null;
  newestFile: { path: string; age: number } | null;
}> {
  const files = await getAllFiles(cacheDirectory);
  const now = Date.now();
  
  if (files.length === 0) {
    return {
      totalFiles: 0,
      totalSizeBytes: 0,
      totalSizeGb: 0,
      oldestFile: null,
      newestFile: null,
    };
  }

  const totalSizeBytes = files.reduce((sum, f) => sum + f.size, 0);
  
  // Find oldest and newest files
  let oldest: CachedFile | undefined = files[0];
  let newest: CachedFile | undefined = files[0];
  
  for (const file of files) {
    if (oldest && file.modTime < oldest.modTime) {
      oldest = file;
    }
    if (newest && file.modTime > newest.modTime) {
      newest = file;
    }
  }

  return {
    totalFiles: files.length,
    totalSizeBytes,
    totalSizeGb: Math.round((totalSizeBytes / (1024 * 1024 * 1024)) * 100) / 100,
    oldestFile: oldest ? {
      path: oldest.path,
      age: now - oldest.modTime,
    } : null,
    newestFile: newest ? {
      path: newest.path,
      age: now - newest.modTime,
    } : null,
  };
}

/**
 * Format bytes to human-readable string
 * 
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 GB")
 */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format milliseconds to human-readable duration
 * 
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "2 hours, 30 minutes")
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""}, ${hours % 24} hour${hours % 24 !== 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""}, ${minutes % 60} minute${minutes % 60 !== 1 ? "s" : ""}`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  }
  return `${seconds} second${seconds !== 1 ? "s" : ""}`;
}
