import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { Article, ArticlePdfStorage } from '../types';
import { validateArticleMetadata } from '../utils/citationFormatter';

const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB per PDF

/**
 * Preserves spaces (including trailing/leading spaces in base name), punctuation
 * (`#`, `(`, `)`, `_`, `-`, `.`, `,`), multiple dots, and Unicode characters,
 * while removing directory traversal segments and control characters.
 */
export function sanitizeOriginalBasename(rawName?: string | null): string {
  if (!rawName || typeof rawName !== 'string') return 'document.pdf';
  // Drop control chars & CR/LF/NUL without trimming spaces in filename
  const stripped = rawName.replace(/[\x00-\x1F\x7F]/g, '');
  // Take only the basename if a path was provided
  const parts = stripped.split(/[\\/]/);
  let base = parts[parts.length - 1] ?? '';
  if (!base || base === '.' || base === '..' || !base.trim()) {
    return 'document.pdf';
  }
  // Remove leading/trailing NULs already gone; ensure not pure dots
  if (/^\.+$/.test(base)) {
    return 'document.pdf';
  }
  return base;
}

export function buildContentDispositionHeader(originalFilename: string, inline = false): string {
  const safeName = sanitizeOriginalBasename(originalFilename);
  // Fallback ASCII quoted filename: replace quotes/backslashes cleanly while keeping readability
  const asciiFallback = safeName
    .replace(/["\\]/g, '_')
    .replace(/[^\x20-\x7E]/g, '_');
  // RFC 5987 UTF-8 preserves exact characters (spaces, #, parentheses, Unicode, etc.)
  const rfc5987 = encodeURIComponent(safeName).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  const disp = inline ? 'inline' : 'attachment';
  return `${disp}; filename="${asciiFallback}"; filename*=UTF-8''${rfc5987}`;
}

export function getPdfsDirectory(folderPath: string): string {
  return path.resolve(folderPath, 'pdfs');
}

export function resolveSafePdfDiskPath(folderPath: string, storedOrRelativePath: string): string | null {
  if (!storedOrRelativePath || typeof storedOrRelativePath !== 'string') return null;
  const pdfsDir = getPdfsDirectory(folderPath);
  const relClean = storedOrRelativePath.replace(/^pdfs[\\/]/i, '');
  const candidate = path.resolve(pdfsDir, relClean);
  if (!candidate.startsWith(pdfsDir + path.sep)) {
    return null; // Reject path traversal
  }
  return candidate;
}

export function isValidPdfBuffer(buf: Buffer): boolean {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || buf.length > MAX_PDF_BYTES) {
    return false;
  }
  // Allow optional UTF-8 BOM or up to 16 leading whitespace bytes before %PDF-
  const head = buf.subarray(0, Math.min(buf.length, 32)).toString('ascii');
  return head.includes('%PDF-');
}

export function computeSha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Backward-compatible migration helper run on load/access without altering existing
 * bibliographic metadata, titles, IDs, screening decisions, or original filenames.
 */
export function backfillArticleLegacyFields(article: Article, folderPath: string): Article {
  if (!article || typeof article !== 'object') return article;

  const preservedOriginal =
    article.original_filename ||
    article.pdfStorage?.original_filename ||
    article.sourceFileName ||
    undefined;

  const candidatePath = article.pdfStorage?.file_path || article.file_path || article.pdfStorage?.stored_filename || article.stored_filename;
  const resolvedDisk = candidatePath ? resolveSafePdfDiskPath(folderPath, candidatePath) : null;
  const existsOnDisk = Boolean(resolvedDisk && fs.existsSync(resolvedDisk));

  const storageStatus: ArticlePdfStorage['storage_status'] = existsOnDisk
    ? 'stored_disk'
    : article.pdfUrl || article.openAccessUrl
    ? 'remote_only'
    : preservedOriginal
    ? 'missing_binary'
    : 'missing_binary';

  const pdfStorage: ArticlePdfStorage | undefined =
    preservedOriginal || existsOnDisk || article.pdfStorage
      ? {
          ...(article.pdfStorage || {}),
          original_filename: preservedOriginal || article.pdfStorage?.stored_filename || 'document.pdf',
          stored_filename: article.pdfStorage?.stored_filename || article.stored_filename,
          file_path: article.pdfStorage?.file_path || article.file_path,
          file_hash: article.pdfStorage?.file_hash || article.file_hash,
          file_size: article.pdfStorage?.file_size || article.file_size,
          mime_type: article.pdfStorage?.mime_type || article.mime_type || (existsOnDisk ? 'application/pdf' : undefined),
          storage_status: storageStatus,
        }
      : undefined;

  const citationStatus =
    article.citationVerificationStatus || validateArticleMetadata(article).verificationStatus;

  return {
    ...article,
    ...(preservedOriginal ? { original_filename: preservedOriginal } : {}),
    ...(pdfStorage ? { pdfStorage } : {}),
    citationVerificationStatus: citationStatus,
  };
}

/**
 * Stores an uploaded PDF buffer safely in `<folderPath>/pdfs/<storedFilename>`
 * while strictly keeping `original_filename` separate from `title`, `id`, and disk path.
 */
export function saveOriginalPdfBuffer(
  folderPath: string,
  article: Article,
  pdfBuffer: Buffer,
  rawOriginalFilename: string
): Article {
  if (!isValidPdfBuffer(pdfBuffer)) {
    throw new Error('Invalid PDF payload: file is empty, exceeds 50 MB, or lacks a %PDF- signature.');
  }

  const pdfsDir = getPdfsDirectory(folderPath);
  if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, { recursive: true });
  }

  const originalFilename = sanitizeOriginalBasename(
    rawOriginalFilename || article.original_filename || article.sourceFileName
  );
  const fileHash = computeSha256(pdfBuffer);
  const fileSize = pdfBuffer.length;
  const safeIdPart = (article.id || 'doc').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const extMatch = originalFilename.match(/(\.[a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '.pdf';
  const storedFilename = `${safeIdPart}-${fileHash.slice(0, 12)}${ext}`;
  const targetDiskPath = resolveSafePdfDiskPath(folderPath, storedFilename);
  if (!targetDiskPath) {
    throw new Error('Rejected unsafe PDF storage path.');
  }

  const tmpPath = `${targetDiskPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, pdfBuffer);
  fs.renameSync(tmpPath, targetDiskPath);

  const relFilePath = `pdfs/${storedFilename}`;
  const nowIso = new Date().toISOString();
  const pdfStorage: ArticlePdfStorage = {
    original_filename: originalFilename,
    stored_filename: storedFilename,
    file_path: relFilePath,
    file_hash: fileHash,
    file_size: fileSize,
    mime_type: 'application/pdf',
    uploaded_at: nowIso,
    storage_status: 'stored_disk',
  };

  return {
    ...article,
    original_filename: originalFilename,
    sourceFileName: originalFilename,
    stored_filename: storedFilename,
    file_path: relFilePath,
    file_hash: fileHash,
    file_size: fileSize,
    mime_type: 'application/pdf',
    pdfStorage,
    accessStatus: 'downloadable',
  };
}

export interface PdfReadVerificationResult {
  ok: boolean;
  status: 'stored_disk' | 'missing_binary' | 'hash_mismatch' | 'remote_fetch_failed';
  originalFilename: string;
  buffer?: Buffer;
  fileHash?: string;
  fileSize?: number;
  fetchedRemote?: boolean;
  updatedArticle?: Article;
  error?: string;
}

export async function verifyAndReadPdfForArticle(
  folderPath: string,
  article: Article,
  options?: { fetchRemoteIfMissing?: boolean }
): Promise<PdfReadVerificationResult> {
  const originalFilename = sanitizeOriginalBasename(
    article.original_filename ||
      article.pdfStorage?.original_filename ||
      article.sourceFileName ||
      `${(article.title || article.id || 'article').slice(0, 80)}.pdf`
  );

  const relOrStored =
    article.pdfStorage?.file_path ||
    article.file_path ||
    article.pdfStorage?.stored_filename ||
    article.stored_filename;

  if (relOrStored) {
    const diskPath = resolveSafePdfDiskPath(folderPath, relOrStored);
    if (diskPath && fs.existsSync(diskPath)) {
      const buf = fs.readFileSync(diskPath);
      const actualHash = computeSha256(buf);
      const expectedHash = article.pdfStorage?.file_hash || article.file_hash;
      if (expectedHash && expectedHash !== actualHash) {
        return {
          ok: false,
          status: 'hash_mismatch',
          originalFilename,
          error: `SHA-256 integrity mismatch for "${originalFilename}" (expected ${expectedHash.slice(0, 10)}, got ${actualHash.slice(0, 10)}).`,
        };
      }
      return {
        ok: true,
        status: 'stored_disk',
        originalFilename,
        buffer: buf,
        fileHash: actualHash,
        fileSize: buf.length,
      };
    }
  }

  // Optional remote OA retrieval + local vault caching when binary wasn't uploaded yet
  const candidateUrl = (article.pdfUrl || article.openAccessUrl || '').trim();
  if (options?.fetchRemoteIfMissing && candidateUrl && /^https?:\/\//i.test(candidateUrl)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const upstream = await fetch(candidateUrl, {
        headers: {
          'User-Agent': 'ResearchMateAI/2.0 (+https://researchmate.ai)',
          Accept: 'application/pdf,application/octet-stream,*/*',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (upstream.ok) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (isValidPdfBuffer(buf)) {
          const updatedArticle = saveOriginalPdfBuffer(folderPath, article, buf, originalFilename);
          return {
            ok: true,
            status: 'stored_disk',
            originalFilename,
            buffer: buf,
            fileHash: updatedArticle.file_hash,
            fileSize: buf.length,
            fetchedRemote: true,
            updatedArticle,
          };
        }
      }
      return {
        ok: false,
        status: 'remote_fetch_failed',
        originalFilename,
        error: `Remote source (${candidateUrl}) did not return a direct binary PDF (HTTP ${upstream.status}).`,
      };
    } catch (e: any) {
      return {
        ok: false,
        status: 'remote_fetch_failed',
        originalFilename,
        error: `Remote PDF retrieval failed: ${e?.message || 'network timeout'}`,
      };
    }
  }

  return {
    ok: false,
    status: 'missing_binary',
    originalFilename,
    error: candidateUrl
      ? 'PDF is only linked remotely and has not been downloaded/uploaded into local review storage yet.'
      : 'Original PDF binary file is missing from local review storage for this legacy/imported record.',
  };
}

/**
 * Resolves filename collisions cleanly inside a ZIP archive ONLY when two different
 * files share the exact same name (case-insensitive):
 *   First:  Study.pdf
 *   Second: Study (2).pdf
 *   Third:  Study (3).pdf
 */
export function resolveZipCollisionName(
  originalFilename: string,
  usedLowerNames: Set<string>
): string {
  const safeBase = sanitizeOriginalBasename(originalFilename);
  if (!usedLowerNames.has(safeBase.toLowerCase())) {
    usedLowerNames.add(safeBase.toLowerCase());
    return safeBase;
  }

  const extMatch = safeBase.match(/^(.*?)(\.[a-zA-Z0-9]+)$/);
  const stem = extMatch ? extMatch[1] : safeBase;
  const ext = extMatch ? extMatch[2] : '';

  let counter = 2;
  while (counter < 10000) {
    const candidate = `${stem} (${counter})${ext}`;
    if (!usedLowerNames.has(candidate.toLowerCase())) {
      usedLowerNames.add(candidate.toLowerCase());
      return candidate;
    }
    counter++;
  }
  const fallback = `${stem} (${Date.now()})${ext}`;
  usedLowerNames.add(fallback.toLowerCase());
  return fallback;
}

export interface BulkPdfExportItemSuccess {
  articleId: string;
  title: string;
  originalFilename: string;
  zipFilename: string;
  fileSize: number;
  fileHash: string;
  fetchedRemote?: boolean;
}

export interface BulkPdfExportItemFailure {
  articleId: string;
  title: string;
  originalFilename: string;
  status: string;
  reason: string;
}

export interface BulkPdfExportSummary {
  requestedCount: number;
  exportedCount: number;
  failedCount: number;
  exportedFiles: BulkPdfExportItemSuccess[];
  failedFiles: BulkPdfExportItemFailure[];
  updatedArticles: Article[];
}

export async function buildBulkPdfZipExport(
  folderPath: string,
  articles: Article[],
  articleIds: string[],
  options?: { fetchRemoteIfMissing?: boolean }
): Promise<{ zipBuffer: Buffer | null; summary: BulkPdfExportSummary }> {
  const targetIdSet = new Set(articleIds);
  const selected = articles.filter((a) => targetIdSet.has(a.id));

  const zip = new JSZip();
  const usedLowerNames = new Set<string>();
  const exportedFiles: BulkPdfExportItemSuccess[] = [];
  const failedFiles: BulkPdfExportItemFailure[] = [];
  const updatedById = new Map<string, Article>();

  for (const art of selected) {
    const check = await verifyAndReadPdfForArticle(folderPath, art, {
      fetchRemoteIfMissing: Boolean(options?.fetchRemoteIfMissing),
    });

    if (check.ok && check.buffer) {
      const zipFilename = resolveZipCollisionName(check.originalFilename, usedLowerNames);
      zip.file(zipFilename, check.buffer, { binary: true });
      exportedFiles.push({
        articleId: art.id,
        title: art.title,
        originalFilename: check.originalFilename,
        zipFilename,
        fileSize: check.fileSize || check.buffer.length,
        fileHash: check.fileHash || computeSha256(check.buffer),
        ...(check.fetchedRemote ? { fetchedRemote: true } : {}),
      });
      if (check.updatedArticle) {
        updatedById.set(art.id, check.updatedArticle);
      }
    } else {
      failedFiles.push({
        articleId: art.id,
        title: art.title,
        originalFilename: check.originalFilename,
        status: check.status,
        reason: check.error || 'PDF file could not be read or verified.',
      });
    }
  }

  let zipBuffer: Buffer | null = null;
  if (exportedFiles.length > 0) {
    zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  }

  const updatedArticles =
    updatedById.size > 0
      ? articles.map((a) => updatedById.get(a.id) || a)
      : articles;

  return {
    zipBuffer,
    summary: {
      requestedCount: selected.length,
      exportedCount: exportedFiles.length,
      failedCount: failedFiles.length,
      exportedFiles,
      failedFiles,
      updatedArticles,
    },
  };
}
