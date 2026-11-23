import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {
  Article,
  PrismaHistoricalLog,
  PrismaReconciliationReport,
  ProjectBackupManifest,
  ReconciliationOperationRecord,
  RecoveryPreviewSummary,
  RecoveryStagingBatch,
  ReviewProject,
  ScannedDiskPdf,
} from '../types';
import { normalizeValidDoi } from '../utils/citationFormatter';
import { parseDatabaseExportToStagingBatch } from '../utils/multiDatabaseParser';
import {
  applyApprovedReconciliation,
  buildPrismaReconciliationReport,
  computeRecoveryPreview,
  generateRecoveryDeliverables,
  RecoveryApprovalPayload,
  RecoveryDeliverableBundle,
} from '../utils/recoveryEngine';
import {
  backfillArticleLegacyFields,
  computeSha256,
  getPdfsDirectory,
  isValidPdfBuffer,
} from './pdfVaultService';

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeJsonAtomicSync(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function safeReadJsonSync<T = any>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw || !raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function resolveSafeSubpath(rootDir: string, ...segments: string[]): string | null {
  const resolvedRoot = path.resolve(rootDir);
  const candidate = path.resolve(resolvedRoot, ...segments);
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return candidate;
}

export function getRecoveryDir(folderPath: string): string {
  return path.resolve(folderPath, 'recovery');
}

export function getBackupsDir(folderPath: string): string {
  return path.resolve(folderPath, 'backups');
}

export interface ExtractedPdfSignals {
  extractedDoi?: string;
  extractedTitle?: string;
  extractedYear?: number;
  extractedTextSample: string;
  textExtractedOk: boolean;
  textExtractionFailed: boolean;
}

function decodePdfLiteralStrings(raw: string): string {
  const collected: string[] = [];
  const tjMatches = raw.matchAll(/\(([^()\\]{2,300}|(?:\\.|[^()]){2,300})\)\s*(?:Tj|TJ)/g);
  for (const m of tjMatches) {
    const cleaned = m[1]
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/[^\x20-\x7E\u00A0-\u024F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 2) {
      collected.push(cleaned);
    }
    if (collected.length >= 160) break;
  }
  if (collected.length > 0) {
    return collected.join(' ');
  }
  // Fallback plain ASCII spans inside decompressed/uncompressed PDF text
  return raw
    .replace(/[^\x20-\x7E\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractPdfSignalsFromDiskBuffer(
  buf: Buffer,
  fallbackFilename?: string
): ExtractedPdfSignals {
  if (!isValidPdfBuffer(buf)) {
    return {
      extractedTextSample: '',
      textExtractedOk: false,
      textExtractionFailed: true,
    };
  }

  const latin = buf.toString('latin1');
  const textChunks: string[] = [];

  // Extract PDF /Title metadata if present
  let infoTitle: string | undefined;
  const titleMetaMatch = latin.match(/\/Title\s*\(([^()\\]{4,300}|(?:\\.|[^()]){4,300})\)/);
  if (titleMetaMatch?.[1]) {
    const candidate = titleMetaMatch[1]
      .replace(/\\([()\\])/g, '$1')
      .replace(/[^\x20-\x7E\u00A0-\u024F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (candidate.length >= 6 && !/^(microsoft word|untitled|acrobat|latex)/i.test(candidate)) {
      infoTitle = candidate;
    }
  }

  // Decompress FlateDecode streams safely (bounded)
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamCount = 0;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(latin)) !== null && streamCount < 24) {
    streamCount++;
    const rawStreamStr = match[1];
    if (!rawStreamStr || rawStreamStr.length > 2_000_000) continue;
    const rawBytes = Buffer.from(rawStreamStr, 'latin1');
    let inflatedStr = '';
    try {
      const inflated = zlib.inflateSync(rawBytes);
      inflatedStr = inflated.toString('latin1');
    } catch {
      inflatedStr = rawStreamStr;
    }
    const decoded = decodePdfLiteralStrings(inflatedStr);
    if (decoded && decoded.length > 10) {
      textChunks.push(decoded);
    }
  }

  // Also scan direct uncompressed PDF strings near top
  const headText = decodePdfLiteralStrings(latin.slice(0, Math.min(latin.length, 300_000)));
  if (headText && textChunks.length === 0) {
    textChunks.push(headText);
  }

  const combinedText = textChunks.join(' ').replace(/\s+/g, ' ').trim();
  const alphaWords = (combinedText.match(/[A-Za-z]{3,}/g) || []).length;
  const hasRealContent = combinedText.length >= 160 && alphaWords >= 18;

  // Extract DOI from combined text or full raw latin buffer
  const doiMatch =
    combinedText.match(/\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/) ||
    latin.slice(0, 400_000).match(/\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/);
  const extractedDoi = doiMatch ? normalizeValidDoi(doiMatch[1]) || undefined : undefined;

  // Extract year
  let extractedYear: number | undefined;
  const yearMatch = combinedText.match(/\b(19[89]\d|20[0-2]\d|2030)\b/);
  if (yearMatch) {
    const parsedYear = parseInt(yearMatch[1], 10);
    if (parsedYear >= 1980 && parsedYear <= 2035) extractedYear = parsedYear;
  }

  // Derive candidate title from /Title info dict, or leading readable sentence, or filename stem
  let extractedTitle = infoTitle;
  if (!extractedTitle && combinedText.length >= 25) {
    const cleanedLead = combinedText
      .replace(/^(doi:\s*\S+|https?:\/\/\S+|journal of [^\n.]{3,50})/i, '')
      .trim();
    const firstSentence = cleanedLead.split(/[.;]\s+|\n/)[0]?.trim() || '';
    if (firstSentence.length >= 16 && firstSentence.length <= 220) {
      extractedTitle = firstSentence;
    }
  }
  if (!extractedTitle && fallbackFilename) {
    const stem = path
      .basename(fallbackFilename, path.extname(fallbackFilename))
      .replace(/[_-]+/g, ' ')
      .trim();
    if (stem.length >= 10) extractedTitle = stem;
  }

  return {
    extractedDoi,
    extractedTitle,
    extractedYear,
    extractedTextSample: combinedText.slice(0, 1600),
    textExtractedOk: hasRealContent,
    textExtractionFailed: !hasRealContent,
  };
}

export function scanProjectDiskPdfs(folderPath: string, articles: Article[]): ScannedDiskPdf[] {
  const pdfsDir = getPdfsDirectory(folderPath);
  if (!fs.existsSync(pdfsDir)) return [];

  const entries = fs.readdirSync(pdfsDir, { withFileTypes: true });
  const articleByPath = new Map<string, Article>();
  const articleByStored = new Map<string, Article>();
  const articleByHash = new Map<string, Article>();

  for (const art of articles) {
    const rel = art.pdfStorage?.file_path || art.file_path;
    const stored = art.pdfStorage?.stored_filename || art.stored_filename;
    const hash = art.pdfStorage?.file_hash || art.file_hash;
    if (rel) articleByPath.set(rel.replace(/\\/g, '/').toLowerCase(), art);
    if (stored) articleByStored.set(stored.toLowerCase(), art);
    if (hash) articleByHash.set(hash.toLowerCase(), art);
  }

  const results: ScannedDiskPdf[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.includes('.tmp.')) continue;
    const lower = entry.name.toLowerCase();
    if (!lower.endsWith('.pdf')) continue;

    const absPath = resolveSafeSubpath(pdfsDir, entry.name);
    if (!absPath || !fs.existsSync(absPath)) continue;

    let buf: Buffer;
    try {
      buf = fs.readFileSync(absPath);
    } catch {
      continue;
    }

    const fileHash = computeSha256(buf);
    const relPath = `pdfs/${entry.name}`;
    const linked =
      articleByPath.get(relPath.toLowerCase()) ||
      articleByStored.get(entry.name.toLowerCase()) ||
      articleByHash.get(fileHash.toLowerCase());

    const originalFilename =
      linked?.original_filename || linked?.pdfStorage?.original_filename || linked?.sourceFileName || entry.name;

    const signals = extractPdfSignalsFromDiskBuffer(buf, originalFilename);
    const accessible = isValidPdfBuffer(buf);

    // If linked article already has stored readable fullText or pages, respect that too
    const linkedHasFullText = Boolean(
      linked?.fullText &&
        linked.fullText.trim().length > 180 &&
        !/%PDF-\d|\/FlateDecode/i.test(linked.fullText.slice(0, 400))
    );

    results.push({
      storedFilename: entry.name,
      originalFilename,
      relativePath: relPath,
      fileHash,
      fileSize: buf.length,
      linkedArticleId: linked?.id,
      extractedDoi: signals.extractedDoi,
      extractedTitle: signals.extractedTitle,
      extractedYear: signals.extractedYear,
      extractedTextSample: signals.extractedTextSample,
      textExtractedOk: signals.textExtractedOk || linkedHasFullText,
      textExtractionFailed: accessible ? !(signals.textExtractedOk || linkedHasFullText) : true,
    });
  }

  return results;
}

export function readStagingBatches(folderPath: string): RecoveryStagingBatch[] {
  const file = path.join(getRecoveryDir(folderPath), 'staging_batches.json');
  const data = safeReadJsonSync<RecoveryStagingBatch[]>(file);
  return Array.isArray(data) ? data : [];
}

export function writeStagingBatches(folderPath: string, batches: RecoveryStagingBatch[]) {
  const file = path.join(getRecoveryDir(folderPath), 'staging_batches.json');
  writeJsonAtomicSync(file, batches);
}

export function readRecoveryAuditLog(folderPath: string): ReconciliationOperationRecord[] {
  const file = path.join(getRecoveryDir(folderPath), 'audit_log.json');
  const data = safeReadJsonSync<ReconciliationOperationRecord[]>(file);
  return Array.isArray(data) ? data : [];
}

export function writeRecoveryAuditLog(folderPath: string, records: ReconciliationOperationRecord[]) {
  const file = path.join(getRecoveryDir(folderPath), 'audit_log.json');
  writeJsonAtomicSync(file, records);
}

export function readPrismaHistoricalLog(folderPath: string): PrismaHistoricalLog | undefined {
  const file = path.join(getRecoveryDir(folderPath), 'prisma_historical_log.json');
  const data = safeReadJsonSync<PrismaHistoricalLog>(file);
  return data && typeof data === 'object' ? data : undefined;
}

export function writePrismaHistoricalLog(folderPath: string, log: PrismaHistoricalLog) {
  const file = path.join(getRecoveryDir(folderPath), 'prisma_historical_log.json');
  writeJsonAtomicSync(file, log);
}

export function listProjectBackups(folderPath: string): ProjectBackupManifest[] {
  const backupsDir = getBackupsDir(folderPath);
  if (!fs.existsSync(backupsDir)) return [];

  const entries = fs.readdirSync(backupsDir, { withFileTypes: true });
  const manifests: ProjectBackupManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = resolveSafeSubpath(backupsDir, entry.name, 'backup_manifest.json');
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    const m = safeReadJsonSync<ProjectBackupManifest>(manifestPath);
    if (m && m.backupId) {
      manifests.push(m);
    }
  }

  return manifests.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

const SNAPSHOT_JSON_FILES = [
  'project.json',
  'articles.json',
  'workbench_state.json',
  'protocol_vault.json',
  'sources_manifest.json',
  'deleted_online_articles.json',
  'database.partition.json',
];

export function createFullProjectBackup(params: {
  folderPath: string;
  projectId: string;
  reason: string;
  createdBy?: string;
}): ProjectBackupManifest {
  const { folderPath, projectId, reason, createdBy = 'Researcher' } = params;
  const backupsDir = getBackupsDir(folderPath);
  ensureDir(backupsDir);

  const backupId = `bkp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const snapshotDir = resolveSafeSubpath(backupsDir, backupId);
  if (!snapshotDir) {
    throw new Error('Rejected unsafe backup snapshot path.');
  }
  ensureDir(snapshotDir);

  const copiedJsonFiles: string[] = [];
  for (const fname of SNAPSHOT_JSON_FILES) {
    const src = resolveSafeSubpath(folderPath, fname);
    const dst = resolveSafeSubpath(snapshotDir, fname);
    if (src && dst && fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      copiedJsonFiles.push(fname);
    }
  }

  // Copy recovery dir state too (audit log + historical log + staging batches)
  const recoverySrc = getRecoveryDir(folderPath);
  if (fs.existsSync(recoverySrc)) {
    const recoverySnap = resolveSafeSubpath(snapshotDir, 'recovery');
    if (recoverySnap) {
      ensureDir(recoverySnap);
      for (const rf of ['staging_batches.json', 'audit_log.json', 'prisma_historical_log.json']) {
        const s = resolveSafeSubpath(recoverySrc, rf);
        const d = resolveSafeSubpath(recoverySnap, rf);
        if (s && d && fs.existsSync(s)) {
          fs.copyFileSync(s, d);
        }
      }
    }
  }

  const articles: Article[] =
    safeReadJsonSync<Article[]>(path.join(folderPath, 'articles.json')) || [];
  const projectMeta = safeReadJsonSync<any>(path.join(folderPath, 'project.json')) || {};

  // Record SHA-256 + original filename of every disk PDF (binary PDF files remain untouched on disk)
  const pdfsDir = getPdfsDirectory(folderPath);
  const pdfHashes: ProjectBackupManifest['pdfHashes'] = [];
  if (fs.existsSync(pdfsDir)) {
    const pdfEntries = fs.readdirSync(pdfsDir, { withFileTypes: true });
    for (const entry of pdfEntries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.pdf')) continue;
      const p = resolveSafeSubpath(pdfsDir, entry.name);
      if (!p || !fs.existsSync(p)) continue;
      const buf = fs.readFileSync(p);
      const hash = computeSha256(buf);
      const linked = articles.find(
        (a) =>
          a.stored_filename === entry.name ||
          a.pdfStorage?.stored_filename === entry.name ||
          a.file_hash === hash
      );
      pdfHashes.push({
        storedFilename: entry.name,
        originalFilename:
          linked?.original_filename || linked?.pdfStorage?.original_filename || entry.name,
        fileHash: hash,
        fileSize: buf.length,
      });
    }
  }

  const manifest: ProjectBackupManifest = {
    backupId,
    projectId,
    projectTitle: String(projectMeta.title || projectId),
    createdAt: new Date().toISOString(),
    reason: `${reason} (by ${createdBy})`,
    articlesCount: articles.length,
    diskPdfCount: pdfHashes.length,
    backupFolderPath: `backups/${backupId}`,
    pdfHashes,
  };

  writeJsonAtomicSync(path.join(snapshotDir, 'backup_manifest.json'), manifest);
  return manifest;
}

export function rollbackProjectFromBackup(params: {
  folderPath: string;
  projectId: string;
  backupId: string;
  actor?: string;
}): {
  safetyBackup: ProjectBackupManifest;
  restoredManifest: ProjectBackupManifest;
  restoredArticles: Article[];
  restoredProjectMeta: any;
  restoredWorkbenchState: any;
  intactPdfFilesCount: number;
  auditLog: ReconciliationOperationRecord[];
} {
  const { folderPath, projectId, backupId, actor = 'Researcher' } = params;
  const backupsDir = getBackupsDir(folderPath);
  const targetSnapDir = resolveSafeSubpath(backupsDir, backupId);
  if (!targetSnapDir || !fs.existsSync(targetSnapDir)) {
    throw new Error(`Backup snapshot "${backupId}" was not found.`);
  }

  const manifestPath = resolveSafeSubpath(targetSnapDir, 'backup_manifest.json');
  const restoredManifest = manifestPath ? safeReadJsonSync<ProjectBackupManifest>(manifestPath) : null;
  if (!restoredManifest) {
    throw new Error(`Backup manifest for "${backupId}" is missing or unreadable.`);
  }

  // Mandatory safety snapshot before rolling back
  const safetyBackup = createFullProjectBackup({
    folderPath,
    projectId,
    reason: `Pre-rollback safety snapshot before restoring ${backupId}`,
    createdBy: actor,
  });

  // Restore JSON files atomically (never deleting or overwriting disk PDF binaries)
  for (const fname of SNAPSHOT_JSON_FILES) {
    const snapFile = resolveSafeSubpath(targetSnapDir, fname);
    const liveFile = resolveSafeSubpath(folderPath, fname);
    if (snapFile && liveFile && fs.existsSync(snapFile)) {
      const content = fs.readFileSync(snapFile, 'utf-8');
      const tmp = `${liveFile}.rollback.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, content, 'utf-8');
      fs.renameSync(tmp, liveFile);
    }
  }

  // Mark audit log entries created from/after this backup as rolled back (preserving the audit history!)
  const nowIso = new Date().toISOString();
  const auditLog = readRecoveryAuditLog(folderPath).map((entry) =>
    entry.backupId === backupId && !entry.rolledBackAt
      ? { ...entry, rolledBackAt: nowIso, rolledBackBy: actor }
      : entry
  );
  writeRecoveryAuditLog(folderPath, auditLog);

  const rawArticles: Article[] =
    safeReadJsonSync<Article[]>(path.join(folderPath, 'articles.json')) || [];
  const restoredArticles = rawArticles.map((a) => backfillArticleLegacyFields(a, folderPath));
  writeJsonAtomicSync(path.join(folderPath, 'articles.json'), restoredArticles);

  const restoredProjectMeta = safeReadJsonSync<any>(path.join(folderPath, 'project.json'));
  const restoredWorkbenchState = safeReadJsonSync<any>(path.join(folderPath, 'workbench_state.json'));

  const pdfsDir = getPdfsDirectory(folderPath);
  const intactPdfFilesCount = fs.existsSync(pdfsDir)
    ? fs.readdirSync(pdfsDir).filter((f) => f.toLowerCase().endsWith('.pdf')).length
    : 0;

  return {
    safetyBackup,
    restoredManifest,
    restoredArticles,
    restoredProjectMeta,
    restoredWorkbenchState,
    intactPdfFilesCount,
    auditLog,
  };
}

export function assembleProjectFromFolder(folderPath: string): ReviewProject {
  const projectMeta = safeReadJsonSync<any>(path.join(folderPath, 'project.json'));
  if (!projectMeta || !projectMeta.id) {
    throw new Error('Project metadata file (project.json) is missing or invalid.');
  }
  const rawArticles: Article[] =
    safeReadJsonSync<Article[]>(path.join(folderPath, 'articles.json')) || [];
  const articles = rawArticles.map((a) => backfillArticleLegacyFields(a, folderPath));
  const workbenchState = safeReadJsonSync<any>(path.join(folderPath, 'workbench_state.json'));
  const historicalLog = readPrismaHistoricalLog(folderPath);

  const mergedWorkbench = workbenchState
    ? {
        ...workbenchState,
        ...(historicalLog
          ? {
              recovery: {
                ...(workbenchState.recovery || {}),
                prismaHistoricalLog: historicalLog,
              },
            }
          : {}),
      }
    : historicalLog
    ? { recovery: { prismaHistoricalLog: historicalLog } }
    : projectMeta.workbenchState;

  return {
    ...projectMeta,
    articles,
    ...(mergedWorkbench ? { workbenchState: mergedWorkbench } : {}),
  };
}

export function getFullRecoveryState(params: {
  folderPath: string;
  project: ReviewProject;
  overrideHistoricalLog?: PrismaHistoricalLog;
}): {
  stagingBatches: RecoveryStagingBatch[];
  backups: ProjectBackupManifest[];
  scannedPdfs: ScannedDiskPdf[];
  historicalLog?: PrismaHistoricalLog;
  auditLog: ReconciliationOperationRecord[];
  preview: RecoveryPreviewSummary;
  deliverables: RecoveryDeliverableBundle;
} {
  const { folderPath, project, overrideHistoricalLog } = params;
  const stagingBatches = readStagingBatches(folderPath);
  const backups = listProjectBackups(folderPath);
  const scannedPdfs = scanProjectDiskPdfs(folderPath, project.articles || []);
  const persistedHistorical = readPrismaHistoricalLog(folderPath);
  const historicalLog =
    overrideHistoricalLog || persistedHistorical || project.workbenchState?.recovery?.prismaHistoricalLog;
  const auditLog = readRecoveryAuditLog(folderPath);

  const preview = computeRecoveryPreview({
    project,
    stagingBatches,
    scannedPdfs,
    historicalLog,
  });

  const deliverables = generateRecoveryDeliverables({
    project,
    preview,
    stagingBatches,
    backups,
    auditLog,
  });

  return {
    stagingBatches,
    backups,
    scannedPdfs,
    historicalLog,
    auditLog,
    preview,
    deliverables,
  };
}

export async function stageDatabaseExportOnServer(params: {
  folderPath: string;
  project: ReviewProject;
  exportFilename: string;
  databaseName: string;
  searchBatchId?: string;
  searchDate?: string;
  textContent?: string;
  binaryBase64?: string;
}): Promise<{
  batch: RecoveryStagingBatch;
  state: ReturnType<typeof getFullRecoveryState>;
}> {
  const {
    folderPath,
    project,
    exportFilename,
    databaseName,
    searchBatchId,
    searchDate,
    textContent,
    binaryBase64,
  } = params;

  const binaryBuffer =
    binaryBase64 && typeof binaryBase64 === 'string'
      ? Buffer.from(binaryBase64.replace(/^data:[^;]+;base64,/, ''), 'base64').buffer
      : undefined;

  const batch = await parseDatabaseExportToStagingBatch({
    exportFilename,
    databaseName,
    searchBatchId,
    searchDate,
    textContent,
    binaryBuffer,
  });

  const existing = readStagingBatches(folderPath);
  const next = [...existing, batch];
  writeStagingBatches(folderPath, next);

  const state = getFullRecoveryState({ folderPath, project });
  return { batch, state };
}

export function updateStagedBatchVerification(params: {
  folderPath: string;
  project: ReviewProject;
  batchId: string;
  databaseName?: string;
  searchBatchId?: string;
  searchDate?: string;
}): {
  updatedBatch: RecoveryStagingBatch;
  state: ReturnType<typeof getFullRecoveryState>;
} {
  const { folderPath, project, batchId, databaseName, searchBatchId, searchDate } = params;
  const existing = readStagingBatches(folderPath);
  const idx = existing.findIndex((b) => b.batchId === batchId);
  if (idx < 0) {
    throw new Error(`Staged batch "${batchId}" was not found.`);
  }

  const prev = existing[idx];
  const cleanDb = databaseName?.trim();
  const isVerifiedDb =
    Boolean(cleanDb) &&
    !/^unspecified database/i.test(cleanDb!) &&
    cleanDb!.toLowerCase() !== 'unknown';

  const updatedBatch: RecoveryStagingBatch = {
    ...prev,
    ...(cleanDb ? { databaseName: cleanDb, databaseVerified: isVerifiedDb } : {}),
    ...(searchBatchId?.trim() ? { searchBatchId: searchBatchId.trim() } : {}),
    ...(searchDate !== undefined ? { searchDate: searchDate.trim() || undefined } : {}),
    records: prev.records.map((r) => ({
      ...r,
      ...(cleanDb ? { databaseName: cleanDb, databaseVerified: isVerifiedDb } : {}),
      ...(searchBatchId?.trim() ? { searchBatchId: searchBatchId.trim() } : {}),
      ...(searchDate !== undefined ? { searchDate: searchDate.trim() || undefined } : {}),
    })),
  };

  existing[idx] = updatedBatch;
  writeStagingBatches(folderPath, existing);

  const state = getFullRecoveryState({ folderPath, project });
  return { updatedBatch, state };
}

export function applyServerReconciliation(params: {
  folderPath: string;
  project: ReviewProject;
  approval: RecoveryApprovalPayload;
}): {
  backupManifest: ProjectBackupManifest;
  operationRecord: ReconciliationOperationRecord;
  updatedProject: ReviewProject;
  prismaReport: PrismaReconciliationReport;
  state: ReturnType<typeof getFullRecoveryState>;
} {
  const { folderPath, project, approval } = params;

  // MANDATORY PRE-RECONCILIATION BACKUP (ALWAYS enforced before touching live records)
  const backupManifest = createFullProjectBackup({
    folderPath,
    projectId: project.id,
    reason: 'Mandatory pre-reconciliation backup snapshot',
    createdBy: approval.appliedBy || 'Researcher',
  });

  const stagingBatches = readStagingBatches(folderPath);
  const scannedPdfs = scanProjectDiskPdfs(folderPath, project.articles || []);
  const persistedHist = readPrismaHistoricalLog(folderPath);

  const resolvedApproval: RecoveryApprovalPayload = {
    ...approval,
    prismaHistoricalLog:
      approval.prismaHistoricalLog ||
      persistedHist ||
      project.workbenchState?.recovery?.prismaHistoricalLog,
  };

  if (resolvedApproval.prismaHistoricalLog) {
    writePrismaHistoricalLog(folderPath, resolvedApproval.prismaHistoricalLog);
  }

  const preview = computeRecoveryPreview({
    project,
    stagingBatches,
    scannedPdfs,
    historicalLog: resolvedApproval.prismaHistoricalLog,
  });

  const { updatedProject, operationRecord, prismaReport } = applyApprovedReconciliation({
    project,
    preview,
    stagingBatches,
    scannedPdfs,
    backupId: backupManifest.backupId,
    approval: resolvedApproval,
  });

  // Backfill legacy/storage metadata safely without touching original filenames or binary content
  const backfilledArticles = updatedProject.articles.map((a) =>
    backfillArticleLegacyFields(a, folderPath)
  );
  const finalProject: ReviewProject = {
    ...updatedProject,
    articles: backfilledArticles,
  };

  // Persist atomically to partitioned folder
  const { articles: artsOnly, workbenchState: wsOnly, ...projectMeta } = finalProject as any;
  writeJsonAtomicSync(path.join(folderPath, 'project.json'), {
    ...projectMeta,
    articleCount: backfilledArticles.length,
    updatedAt: finalProject.updatedAt,
  });
  writeJsonAtomicSync(path.join(folderPath, 'articles.json'), backfilledArticles);
  if (wsOnly) {
    writeJsonAtomicSync(path.join(folderPath, 'workbench_state.json'), wsOnly);
  }

  // Update sources_manifest.json safely
  writeJsonAtomicSync(path.join(folderPath, 'sources_manifest.json'), {
    reviewId: finalProject.id,
    reviewTitle: finalProject.title,
    databaseFolderName: path.basename(folderPath),
    importedFiles: Array.from(
      new Set(
        backfilledArticles
          .map((a) => a.original_filename || a.sourceFileName || a.title)
          .filter(Boolean)
      )
    ),
    stagedDatabaseBatches: stagingBatches.map((b) => ({
      batchId: b.batchId,
      databaseName: b.databaseName,
      exportFilename: b.exportFilename,
      exportFormat: b.exportFormat,
      recordsCount: b.recordsCount,
      databaseVerified: b.databaseVerified,
    })),
    totalArticles: backfilledArticles.length,
    lastSavedAt: finalProject.updatedAt,
  });

  // Append immutable recovery audit log record
  const existingLog = readRecoveryAuditLog(folderPath);
  const nextLog = [operationRecord, ...existingLog];
  writeRecoveryAuditLog(folderPath, nextLog);

  const state = getFullRecoveryState({
    folderPath,
    project: finalProject,
    overrideHistoricalLog: resolvedApproval.prismaHistoricalLog,
  });

  return {
    backupManifest,
    operationRecord,
    updatedProject: finalProject,
    prismaReport,
    state,
  };
}
