/**
 * Media Utility Functions
 * =======================
 * 
 * Helper functions for working with media files.
 * Includes file type detection, extension mapping, etc.
 */

/**
 * Media type categories
 */
export type MediaType = "video" | "audio" | "image" | "gif" | "document" | "other";

/**
 * Extension to MIME type mapping
 */
export const MIME_TYPES: Record<string, string> = {
  // Video
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".3gp": "video/3gpp",
  ".ts": "video/mp2t",
  ".mts": "video/mp2t",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".wma": "audio/x-ms-wma",
  ".opus": "audio/opus",
  // Image
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".tiff": "image/tiff",
  ".ico": "image/x-icon",
  // GIF
  ".gif": "image/gif",
  // Document
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".epub": "application/epub+zip",
  ".mobi": "application/x-mobipocket-ebook",
};

/**
 * Extension to media type mapping
 */
export const EXTENSION_TO_TYPE: Record<string, MediaType> = {
  // Video
  ".mp4": "video",
  ".mkv": "video",
  ".avi": "video",
  ".mov": "video",
  ".wmv": "video",
  ".flv": "video",
  ".webm": "video",
  ".m4v": "video",
  ".mpeg": "video",
  ".mpg": "video",
  ".3gp": "video",
  ".ts": "video",
  ".mts": "video",
  // Audio
  ".mp3": "audio",
  ".wav": "audio",
  ".flac": "audio",
  ".aac": "audio",
  ".ogg": "audio",
  ".m4a": "audio",
  ".wma": "audio",
  ".opus": "audio",
  // Image
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".webp": "image",
  ".bmp": "image",
  ".svg": "image",
  ".tiff": "image",
  ".ico": "image",
  // GIF (separate category)
  ".gif": "gif",
  // Document
  ".pdf": "document",
  ".doc": "document",
  ".docx": "document",
  ".epub": "document",
  ".mobi": "document",
};

/**
 * Supported file extensions for scanning
 */
export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_TO_TYPE);

/**
 * Get the media type for a file extension
 */
export function getMediaType(extension: string): MediaType {
  const ext = extension.toLowerCase().startsWith(".") 
    ? extension.toLowerCase() 
    : `.${extension.toLowerCase()}`;
  return EXTENSION_TO_TYPE[ext] || "other";
}

/**
 * Get the MIME type for a file extension
 */
export function getMimeType(extension: string): string {
  const ext = extension.toLowerCase().startsWith(".") 
    ? extension.toLowerCase() 
    : `.${extension.toLowerCase()}`;
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Check if a file extension is supported
 */
export function isSupportedExtension(extension: string): boolean {
  const ext = extension.toLowerCase().startsWith(".") 
    ? extension.toLowerCase() 
    : `.${extension.toLowerCase()}`;
  return ext in EXTENSION_TO_TYPE;
}

/**
 * Get file extension from filename
 */
export function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Get filename without extension
 */
export function getBasename(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return filename;
  return filename.slice(0, lastDot);
}

/**
 * Parse a filename to extract potential metadata
 * Handles common naming patterns like:
 * - "Movie Name (2020).mp4"
 * - "Artist - Album - Track.mp3"
 * - "Show.S01E02.Episode.Title.mkv"
 */
export interface ParsedFilename {
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  artist?: string;
  album?: string;
}

export function parseFilename(filename: string): ParsedFilename {
  const basename = getBasename(filename);
  const result: ParsedFilename = { title: basename };
  
  // Try to extract year from parentheses: "Movie Name (2020)"
  const yearMatch = basename.match(/\((\d{4})\)/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[1], 10);
    result.title = basename.replace(/\s*\(\d{4}\)\s*/, " ").trim();
  }
  
  // Try to extract year from end: "Movie Name 2020"
  if (!result.year) {
    const yearEndMatch = basename.match(/\s(\d{4})$/);
    if (yearEndMatch) {
      const year = parseInt(yearEndMatch[1], 10);
      if (year >= 1900 && year <= new Date().getFullYear() + 1) {
        result.year = year;
        result.title = basename.replace(/\s\d{4}$/, "").trim();
      }
    }
  }
  
  // Try to extract TV show season/episode: "Show.S01E02" or "Show S01E02"
  const tvMatch = basename.match(/[.\s]S(\d{1,2})E(\d{1,2})/i);
  if (tvMatch) {
    result.season = parseInt(tvMatch[1], 10);
    result.episode = parseInt(tvMatch[2], 10);
    result.title = basename.slice(0, basename.indexOf(tvMatch[0])).replace(/[._]/g, " ").trim();
  }
  
  // Try to extract artist/album from "Artist - Album - Track" pattern
  const parts = basename.split(" - ");
  if (parts.length >= 2) {
    result.artist = parts[0].trim();
    if (parts.length >= 3) {
      result.album = parts[1].trim();
      result.title = parts.slice(2).join(" - ").trim();
    } else {
      result.title = parts[1].trim();
    }
  }
  
  // Clean up title
  result.title = result.title
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  return result;
}
