import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Article,
  PrismaHistoricalLog,
  ProjectBackupManifest,
  ReconciliationOperationRecord,
  RecoveryPreviewSummary,
  RecoveryStagingBatch,
  ReviewProject,
  ScannedDiskPdf,
  WorkbenchModuleId,
} from '../types';
import { apiService } from '../services/apiService';
import { RecoveryDeliverableBundle } from '../utils/recoveryEngine';
import { AutoSaveStatusInfo, ModuleWorkbenchControls } from './ModuleWorkbenchControls';
import {
  AlertTriangle,
  ArchiveRestore,
  Check,
  CheckCircle2,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  GitFork,
  History,
  Layers,
  Link2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';

interface RecoveryReconciliationWorkspaceProps {
  project: ReviewProject;
  onProjectReplaced: (updatedProject: ReviewProject) => void;
  onNavigateTab?: (tabId: string) => void;
  autoSaveStatus?: AutoSaveStatusInfo;
  onResetWorkbenchModule?: (params: {
    target: WorkbenchModuleId;
    resetArticleFields?: boolean;
    deleteArticlesMode?: 'none' | 'excluded' | 'uncertain' | 'unscreened' | 'duplicates';
  }) => Promise<any>;
}

const KNOWN_DATABASE_OPTIONS = [
  'Scopus',
  'Web of Science',
  'PubMed',
  'ScienceDirect',
  'IEEE Xplore',
  'Google Scholar',
  'Crossref',
  'OpenAlex',
  'Semantic Scholar',
  'CAB Abstracts',
  'Springer',
  'Wiley',
  'MDPI',
  'arXiv',
  '',
];

type SubTabId = 'staging' | 'matching' | 'pdfs' | 'prisma' | 'deliverables';

export const RecoveryReconciliationWorkspace: React.FC<RecoveryReconciliationWorkspaceProps> = ({
  project,
  onProjectReplaced,
  onNavigateTab,
  autoSaveStatus,
  onResetWorkbenchModule,
}) => {
  const [subTab, setSubTab] = useState<SubTabId>('staging');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [stagingBatches, setStagingBatches] = useState<RecoveryStagingBatch[]>([]);
  const [backups, setBackups] = useState<ProjectBackupManifest[]>([]);
  const [scannedPdfs, setScannedPdfs] = useState<ScannedDiskPdf[]>([]);
  const [auditLog, setAuditLog] = useState<ReconciliationOperationRecord[]>([]);
  const [preview, setPreview] = useState<RecoveryPreviewSummary | null>(null);
  const [deliverables, setDeliverables] = useState<RecoveryDeliverableBundle | null>(null);

  // Multi-DB Upload Staging form state
  const [uploadDbName, setUploadDbName] = useState<string>('Scopus');
  const [customDbName, setCustomDbName] = useState<string>('');
  const [uploadBatchId, setUploadBatchId] = useState<string>('');
  const [uploadSearchDate, setUploadSearchDate] = useState<string>('');
  const [batchDbEdits, setBatchDbEdits] = useState<Record<string, string>>({});

  // Approval selections (never auto-mutating live records until researcher applies)
  const [approvedMatchIds, setApprovedMatchIds] = useState<Set<string>>(new Set());
  const [rejectedMatchIds, setRejectedMatchIds] = useState<Set<string>>(new Set());
  const [manualTargetByMatchId, setManualTargetByMatchId] = useState<Record<string, string>>({});
  const [addUnmatchedDbRecords, setAddUnmatchedDbRecords] = useState<boolean>(false);

  const [approvedPdfIds, setApprovedPdfIds] = useState<Set<string>>(new Set());
  const [rejectedPdfIds, setRejectedPdfIds] = useState<Set<string>>(new Set());
  const [allowReplacePdfIds, setAllowReplacePdfIds] = useState<Set<string>>(new Set());
  const [recalcFullText, setRecalcFullText] = useState<boolean>(true);
  const [matchFilter, setMatchFilter] = useState<'all' | 'high' | 'manual' | 'unmatched'>('all');

  // Rollback confirmation UI state
  const [selectedBackupId, setSelectedBackupId] = useState<string>('');
  const [confirmRollback, setConfirmRollback] = useState<boolean>(false);

  // PRISMA historical log draft
  const [historicalLogDraft, setHistoricalLogDraft] = useState<PrismaHistoricalLog>(
    () => ({ verifiedByResearcher: false, ...(project.workbenchState?.recovery?.prismaHistoricalLog || {}) })
  );
  const [activeDeliverableKey, setActiveDeliverableKey] = useState<
    | 'projectRecoveryReport'
    | 'databaseProvenanceReport'
    | 'duplicateResolutionReport'
    | 'pdfReconciliationReport'
    | 'abstractClassificationReport'
    | 'updatedPrismaReport'
    | 'screeningDiagnosticsReport'
    | 'recoveryAuditLogReport'
  >('projectRecoveryReport');

  const syncFromServerPayload = useCallback(
    (data: {
      stagingBatches: RecoveryStagingBatch[];
      backups: ProjectBackupManifest[];
      scannedPdfs: ScannedDiskPdf[];
      historicalLog?: PrismaHistoricalLog;
      auditLog: ReconciliationOperationRecord[];
      preview: RecoveryPreviewSummary;
      deliverables: RecoveryDeliverableBundle;
    }) => {
      setStagingBatches(data.stagingBatches || []);
      setBackups(data.backups || []);
      setScannedPdfs(data.scannedPdfs || []);
      setAuditLog(data.auditLog || []);
      setPreview(data.preview || null);
      setDeliverables(data.deliverables || null);
      if (data.historicalLog) {
        setHistoricalLogDraft(data.historicalLog);
      }
      if (data.backups?.length && !selectedBackupId) {
        setSelectedBackupId(data.backups[0].backupId);
      }
      // Pre-select high-confidence automatic matches for preview convenience (only on non-manual, non-replacing candidates)
      if (data.preview) {
        setApprovedMatchIds(
          new Set(
            data.preview.matches
              .filter((m) => m.targetArticleId && !m.requiresManualConfirmation)
              .map((m) => m.matchId)
          )
        );
        setApprovedPdfIds(
          new Set(
            data.preview.pdfMatches
              .filter(
                (p) =>
                  p.targetArticleId &&
                  !p.requiresManualConfirmation &&
                  !p.alreadyMatchingHash &&
                  !p.wouldReplaceExistingPdf
              )
              .map((p) => p.candidateId)
          )
        );
      }
    },
    [selectedBackupId]
  );

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.loadRecoveryState(project.id);
      syncFromServerPayload(res);
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Unable to load recovery state' });
    } finally {
      setLoading(false);
    }
  }, [project.id, syncFromServerPayload]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const handleCreateBackup = async () => {
    setBusyAction('backup');
    setBanner(null);
    try {
      const res = await apiService.createRecoveryBackup(
        project.id,
        'Researcher-initiated complete project snapshot',
        'Researcher'
      );
      syncFromServerPayload(res);
      setSelectedBackupId(res.manifest.backupId);
      setBanner({
        type: 'success',
        text: `Full backup "${res.manifest.backupId}" saved (${res.manifest.articlesCount} articles, ${res.manifest.diskPdfCount} PDF binaries verified).`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Backup creation failed' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRollback = async (backupIdToUse: string) => {
    if (!backupIdToUse) return;
    setBusyAction('rollback');
    setBanner(null);
    try {
      const res = await apiService.rollbackRecoveryBackup(project.id, backupIdToUse, 'Researcher');
      syncFromServerPayload(res);
      onProjectReplaced(res.project);
      setConfirmRollback(false);
      setBanner({
        type: 'success',
        text: `Rolled back to "${backupIdToUse}". ${res.restoredManifest.articlesCount} articles restored and ${res.intactPdfFilesCount} disk PDFs verified intact. Safety snapshot "${res.safetyBackup.backupId}" saved.`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Rollback failed' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleStageExportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusyAction('stage');
    setBanner(null);
    const chosenDb = (uploadDbName === '__custom__' ? customDbName : uploadDbName).trim();
    try {
      let lastRes: any = null;
      let totalStaged = 0;
      for (const file of Array.from(files)) {
        lastRes = await apiService.stageRecoveryExport({
          projectId: project.id,
          file,
          databaseName: chosenDb,
          searchBatchId: uploadBatchId.trim() || undefined,
          searchDate: uploadSearchDate.trim() || undefined,
        });
        totalStaged += lastRes.batch.recordsCount;
      }
      if (lastRes) {
        syncFromServerPayload(lastRes);
      }
      setBanner({
        type: 'success',
        text: `Staged ${files.length} database export file(s) (${totalStaged} bibliographic records). Live project records remain untouched until you approve and apply.`,
      });
      setSubTab('matching');
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to parse database export file' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmBatchDatabase = async (batchId: string) => {
    const dbVal = (batchDbEdits[batchId] || '').trim();
    if (!dbVal) return;
    setBusyAction(`batch-${batchId}`);
    try {
      const res = await apiService.updateRecoveryStagedBatch({
        projectId: project.id,
        batchId,
        databaseName: dbVal,
      });
      syncFromServerPayload(res);
      setBanner({ type: 'success', text: `Verified source database "${dbVal}" for staged batch.` });
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to confirm database source' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    setBusyAction(`del-${batchId}`);
    try {
      const res = await apiService.deleteRecoveryStagedBatch(project.id, batchId);
      syncFromServerPayload(res);
      setBanner({ type: 'info', text: `Removed staged batch ${batchId}.` });
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to remove batch' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveHistoricalLog = async () => {
    setBusyAction('prisma-log');
    setBanner(null);
    try {
      const res = await apiService.saveRecoveryPrismaLog(project.id, historicalLogDraft);
      syncFromServerPayload(res);
      onProjectReplaced(res.project);
      setBanner({
        type: 'success',
        text: 'Confirmed PRISMA 2020 historical log saved and consistency equations recalculated.',
      });
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to save PRISMA historical log' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleApplyApproved = async () => {
    setBusyAction('apply');
    setBanner(null);
    try {
      const res = await apiService.applyRecoveryReconciliation(project.id, {
        approvedMatchIds: Array.from(approvedMatchIds),
        rejectedMatchIds: Array.from(rejectedMatchIds),
        manualMatchAssignments: manualTargetByMatchId,
        addUnmatchedDatabaseRecords: addUnmatchedDbRecords,
        approvedPdfMatchIds: Array.from(approvedPdfIds),
        rejectedPdfMatchIds: Array.from(rejectedPdfIds),
        allowReplaceExistingPdfIds: Array.from(allowReplacePdfIds),
        recalculateFullTextAvailability: recalcFullText,
        prismaHistoricalLog: { ...historicalLogDraft, verifiedByResearcher: true },
        appliedBy: 'Researcher',
      });
      syncFromServerPayload(res);
      onProjectReplaced(res.project);
      setSelectedBackupId(res.backupManifest.backupId);
      setBanner({
        type: 'success',
        text: `Applied reconciliation cleanly! Auto-created pre-apply backup "${res.backupManifest.backupId}". Linked ${res.operationRecord.approvedMatchesApplied + res.operationRecord.manualMatchesApplied} DB provenance matches, ${res.operationRecord.pdfLinksApplied} PDFs, and reclassified ${res.operationRecord.fullTextReclassificationsApplied} full-text statuses. All screening decisions preserved.`,
      });
      setSubTab('deliverables');
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to apply approved changes' });
    } finally {
      setBusyAction(null);
    }
  };

  const triggerDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const filteredMatches = useMemo(() => {
    if (!preview) return [];
    return preview.matches.filter((m) => {
      if (matchFilter === 'high') return Boolean(m.targetArticleId && !m.requiresManualConfirmation);
      if (matchFilter === 'manual') return Boolean(m.targetArticleId && m.requiresManualConfirmation);
      if (matchFilter === 'unmatched') return !m.targetArticleId;
      return true;
    });
  }, [preview, matchFilter]);

  const sortedArticlesForSelect = useMemo(
    () =>
      [...(project.articles || [])].sort((a, b) =>
        (a.title || '').localeCompare(b.title || '')
      ),
    [project.articles]
  );

  const exportPrismaDiagnosticCsv = () => {
    if (!preview) return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;
    const headers = [
      'Article ID',
      'Title',
      'Current Decision',
      'Database Sources',
      'PDF Accessible',
      'Text Extraction Failed',
      'Full-Text Classification',
      'Change Notes',
    ];
    const transitionById = new Map(preview.fullTextTransitions.map((t) => [t.articleId, t]));
    const rows = project.articles.map((a) => {
      const tr = transitionById.get(a.id);
      const dbs = (a.databaseSourceRecords || [])
        .map((r) => `${r.databaseName}${r.databaseVerified ? '' : ' (Unverified)'}`)
        .join(' | ') || a.sourceDatabase || 'Other';
      return [
        esc(a.id),
        esc(a.title),
        esc(a.decision),
        esc(dbs),
        esc(tr?.newStatusDetails.pdfAccessible ? 'Yes' : 'No'),
        esc(tr?.newStatusDetails.pdfTextExtractionFailed ? 'Yes' : 'No'),
        esc(tr?.newStatusDetails.classificationLabel || a.fullTextStatusDetails?.classificationLabel || ''),
        esc(tr?.explanation || ''),
      ].join(',');
    });
    triggerDownload(
      `${project.id}-recovery-prisma-diagnostics.csv`,
      `\uFEFF${[headers.join(','), ...rows].join('\n')}`,
      'text/csv;charset=utf-8;'
    );
  };

  const exportWordDeliverable = () => {
    if (!deliverables) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${project.title} - Recovery Report</title><style>body{font-family:Calibri,Arial,sans-serif;line-height:1.5;max-width:860px;margin:32px auto;color:#111}h1,h2{color:#0f172a}pre{white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px}</style></head><body><h1>${project.title} — Project Recovery &amp; PRISMA 2020 Reconciliation</h1><pre>${deliverables.combinedMarkdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')}</pre></body></html>`;
    triggerDownload(`${project.id}-recovery-reconciliation-report.doc`, html, 'application/msword');
  };

  return (
    <div className="space-y-5">
      <ModuleWorkbenchControls
        project={project}
        moduleId="recovery"
        moduleLabel="Project Recovery & PRISMA 2020 Reconciliation"
        autoSaveStatus={autoSaveStatus}
        resetFieldsLabel="Clear Saved Historical Log"
        deleteModes={[]}
        onResetModule={onResetWorkbenchModule}
      />

      {/* Protection & Backup Control Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              <span className="font-semibold text-white text-base">
                Project Recovery, Multi-Database Provenance &amp; PRISMA 2020 Reconciliation
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-3xl">
              Restore original database provenance, match historical exports against existing PDFs and articles, correct abstract-only misclassifications, and reconcile PRISMA 2020 counts in a non-destructive staging area.
              <span className="text-slate-300 font-medium">
                {' '}Article IDs · Original PDFs &amp; Filenames · Screening Decisions · Exclusion Reasons · Audit History remain 100% protected.
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCreateBackup}
              disabled={busyAction !== null}
              className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
              <span>{busyAction === 'backup' ? 'Creating Backup...' : 'Create Complete Backup'}</span>
            </button>
            <button
              type="button"
              onClick={loadState}
              disabled={loading || busyAction !== null}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Preview</span>
            </button>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('prisma')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-300 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition"
              >
                <GitFork className="w-3.5 h-3.5" />
                <span>Open PRISMA Flow</span>
              </button>
            )}
          </div>
        </div>

        {/* Rollback Snapshot Bar */}
        <div className="border-t border-slate-800 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-300 font-mono tabular-nums">
            <span className="text-slate-400">Snapshots Available:</span>
            <span className="text-white font-semibold">{backups.length}</span>
            {backups[0] && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-teal-300">Latest: {backups[0].backupId}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">
                  {backups[0].articlesCount} articles · {backups[0].diskPdfCount} PDFs
                </span>
              </>
            )}
          </div>

          {backups.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedBackupId || backups[0]?.backupId || ''}
                onChange={(e) => {
                  setSelectedBackupId(e.target.value);
                  setConfirmRollback(false);
                }}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-mono"
              >
                {backups.map((b) => (
                  <option key={b.backupId} value={b.backupId}>
                    {b.backupId} ({new Date(b.createdAt).toLocaleString()} · {b.articlesCount} rec)
                  </option>
                ))}
              </select>
              {!confirmRollback ? (
                <button
                  type="button"
                  onClick={() => setConfirmRollback(true)}
                  disabled={busyAction !== null}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Rollback Snapshot</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRollback(selectedBackupId || backups[0].backupId)}
                    disabled={busyAction !== null}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer"
                  >
                    {busyAction === 'rollback' ? 'Restoring...' : 'Confirm Rollback (Safety Snapshot Auto-Saved)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRollback(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {banner && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            banner.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-200'
              : banner.type === 'error'
              ? 'bg-rose-950/60 border-rose-700/50 text-rose-200'
              : 'bg-slate-900 border-slate-700 text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 12-Metric Recovery Preview Dashboard */}
      {preview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            { label: 'Original Project Records', value: preview.originalProjectRecordCount, tone: 'text-white' },
            { label: 'Imported DB Records', value: preview.importedDatabaseRecordCount, tone: 'text-indigo-300' },
            { label: 'Identified Duplicates', value: preview.identifiedDuplicatesCount, tone: 'text-amber-300' },
            {
              label: 'Proposed DB Matches',
              value: `${preview.autoConfirmedMatchesCount} auto + ${preview.manualConfirmationMatchesCount} manual`,
              tone: 'text-teal-300',
            },
            { label: 'Unmatched DB Records', value: preview.unmatchedDatabaseRecordsCount, tone: 'text-slate-300' },
            { label: 'Existing PDFs Matched', value: preview.existingPdfsMatchedCount, tone: 'text-emerald-300' },
            { label: 'Unmatched PDFs (Pending)', value: preview.unmatchedPdfsCount, tone: 'text-amber-300' },
            { label: 'Articles Without PDFs', value: preview.articlesWithoutPdfsCount, tone: 'text-slate-300' },
            {
              label: 'Abstract-Only (Before → After)',
              value: `${preview.abstractOnlyBeforeCount} → ${preview.projectedAbstractOnlyAfterCount}`,
              tone: 'text-cyan-300',
            },
            {
              label: 'PDF Extract Fail (Full-Text)',
              value: preview.pdfWithExtractionFailureFullTextCount,
              tone: 'text-emerald-300',
            },
            {
              label: 'PRISMA Metrics Affected',
              value: preview.prismaPreview.unverifiedGaps.length > 0 ? `${preview.prismaPreview.unverifiedGaps.length} gaps` : 'Synced',
              tone: preview.prismaPreview.unverifiedGaps.length > 0 ? 'text-amber-300' : 'text-emerald-300',
            },
            { label: 'Screening Decisions Kept', value: preview.screeningRecordsAffectedCount, tone: 'text-white' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1"
            >
              <div className="text-[11px] text-slate-400 truncate" title={kpi.label}>
                {kpi.label}
              </div>
              <div className={`text-base font-bold font-mono tabular-nums ${kpi.tone}`}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sub-Tab Selector */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 pb-2 text-xs">
        {(
          [
            { id: 'staging', label: `1. Multi-DB Staging (${stagingBatches.length})` },
            { id: 'matching', label: `2. Record Matching & Duplicates (${preview?.matches.length || 0})` },
            { id: 'pdfs', label: `3. PDF Reconciliation & Full-Text (${scannedPdfs.length})` },
            { id: 'prisma', label: `4. PRISMA 2020 Historical Log & Equations` },
            { id: 'deliverables', label: `5. Deliverables & Audit Log (${auditLog.length})` },
          ] as { id: SubTabId; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
              subTab === tab.id
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Multi-Database Staging */}
      {subTab === 'staging' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Import Original Multi-Database Bibliographic Exports to Staging Area
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Supported formats: RIS (.ris), BibTeX (.bib), CSV/TSV (.csv/.tsv), Excel (.xlsx/.xls), EndNote (.enw/.xml), PubMed (.nbib), Web of Science (.ciw), JSON. Unverified sources are flagged rather than guessed.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Original Database Name
                </label>
                <select
                  value={uploadDbName}
                  onChange={(e) => setUploadDbName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100"
                >
                  {KNOWN_DATABASE_OPTIONS.map((db) => (
                    <option key={db || 'unverified'} value={db}>
                      {db || 'Unspecified (Flag for Confirmation)'}
                    </option>
                  ))}
                  <option value="__custom__">Other / Custom Database...</option>
                </select>
                {uploadDbName === '__custom__' && (
                  <input
                    type="text"
                    value={customDbName}
                    onChange={(e) => setCustomDbName(e.target.value)}
                    placeholder="Enter exact database name"
                    className="mt-1.5 w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                  />
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Search Batch ID (Optional)
                </label>
                <input
                  type="text"
                  value={uploadBatchId}
                  onChange={(e) => setUploadBatchId(e.target.value)}
                  placeholder="e.g., scopus-2024-search-01"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Search Date (Optional)
                </label>
                <input
                  type="date"
                  value={uploadSearchDate}
                  onChange={(e) => setUploadSearchDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100"
                />
              </div>

              <div className="flex items-end">
                <label className="w-full px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition">
                  <Upload className="w-4 h-4" />
                  <span>{busyAction === 'stage' ? 'Parsing Export...' : 'Select Export File(s)'}</span>
                  <input
                    type="file"
                    multiple
                    accept=".ris,.bib,.bibtex,.csv,.tsv,.xlsx,.xls,.enw,.xml,.nbib,.ciw,.json,.txt"
                    className="hidden"
                    onChange={(e) => {
                      void handleStageExportFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-white">Staged Database Batches</span>
              <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                {stagingBatches.length} batch(es) · {stagingBatches.reduce((s, b) => s + b.recordsCount, 0)} records
              </span>
            </div>
            {stagingBatches.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No database export batches staged yet. Upload your original RIS, BibTeX, CSV, Excel, EndNote, or PubMed exports above.
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {stagingBatches.map((batch) => (
                  <div
                    key={batch.batchId}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 font-semibold text-white">
                        <Database className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{batch.databaseName}</span>
                        <span className="text-slate-600">·</span>
                        <span className="font-mono text-slate-300">{batch.exportFilename}</span>
                        <span className="text-slate-600">·</span>
                        <span className="uppercase font-mono text-teal-300">{batch.exportFormat}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                        Batch {batch.batchId} · {batch.recordsCount} records · Search Date: {batch.searchDate || 'Not specified'} · Imported {new Date(batch.importedAt).toLocaleString()} ·{' '}
                        <span className={batch.databaseVerified ? 'text-emerald-400 font-semibold' : 'text-amber-300 font-semibold'}>
                          {batch.databaseVerified ? 'Verified Source' : 'Unverified Source — Confirmation Required'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!batch.databaseVerified && (
                        <>
                          <input
                            type="text"
                            value={batchDbEdits[batch.batchId] ?? ''}
                            onChange={(e) =>
                              setBatchDbEdits((prev) => ({ ...prev, [batch.batchId]: e.target.value }))
                            }
                            placeholder="Confirm database name..."
                            className="bg-slate-950 border border-amber-500/40 rounded-lg px-2 py-1 text-xs text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleConfirmBatchDatabase(batch.batchId)}
                            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            Verify Source
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteBatch(batch.batchId)}
                        disabled={busyAction !== null}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950 border border-slate-700 text-rose-300 text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Record Matching & Duplicates */}
      {subTab === 'matching' && preview && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `All (${preview.matches.length})` },
                  { id: 'high', label: `Auto High-Confidence (${preview.autoConfirmedMatchesCount})` },
                  { id: 'manual', label: `Manual Confirm (${preview.manualConfirmationMatchesCount})` },
                  { id: 'unmatched', label: `Unmatched DB (${preview.unmatchedDatabaseRecordsCount})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setMatchFilter(f.id)}
                  className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer ${
                    matchFilter === f.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addUnmatchedDbRecords}
                  onChange={(e) => setAddUnmatchedDbRecords(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-950"
                />
                <span>Import unmatched DB records as new unscreened articles</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const highIds = preview.matches
                    .filter((m) => m.targetArticleId && !m.requiresManualConfirmation)
                    .map((m) => m.matchId);
                  setApprovedMatchIds(new Set(highIds));
                  setRejectedMatchIds(new Set());
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-teal-300 font-semibold cursor-pointer"
              >
                Select All High-Confidence
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            {filteredMatches.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No records in this matching filter. Stage bibliographic exports in Tab 1 first.
              </div>
            ) : (
              <div className="divide-y divide-slate-800 max-h-[460px] overflow-y-auto">
                {filteredMatches.slice(0, 120).map((m) => {
                  const isApproved = approvedMatchIds.has(m.matchId) || Boolean(manualTargetByMatchId[m.matchId]);
                  const isRejected = rejectedMatchIds.has(m.matchId);
                  return (
                    <div key={m.matchId} className="p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-teal-300">{m.databaseName}</span>
                          <span className="text-slate-600">·</span>
                          <span className="font-mono text-slate-400 uppercase">{m.matchTier.replace(/_/g, ' ')}</span>
                          <span className="text-slate-600">·</span>
                          <span className="font-mono tabular-nums text-slate-300">
                            {Math.round(m.confidence * 100)}% match
                          </span>
                          {m.requiresManualConfirmation && (
                            <>
                              <span className="text-slate-600">·</span>
                              <span className="text-amber-300 font-semibold">Manual Confirmation Required</span>
                            </>
                          )}
                        </div>
                        <div className="font-medium text-white truncate">{m.stagedTitle}</div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {(m.stagedAuthors && m.stagedAuthors[0]) || 'Author n/a'} ({m.stagedYear || 'n.d.'})
                          {m.stagedDoi ? ` · DOI: ${m.stagedDoi}` : ''}
                          {m.targetArticleTitle ? ` → Target: [${m.targetArticleId}] ${m.targetArticleTitle}` : ' → No existing match'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <select
                          value={manualTargetByMatchId[m.matchId] ?? m.targetArticleId ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setManualTargetByMatchId((prev) => ({ ...prev, [m.matchId]: val }));
                            if (val) {
                              setRejectedMatchIds((prev) => {
                                const n = new Set(prev);
                                n.delete(m.matchId);
                                return n;
                              });
                            }
                          }}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200 max-w-[220px]"
                        >
                          <option value="">— No Existing Link —</option>
                          {sortedArticlesForSelect.map((a) => (
                            <option key={a.id} value={a.id}>
                              {(a.title || a.id).slice(0, 48)} ({a.year || 'n.d.'})
                            </option>
                          ))}
                        </select>

                        {(m.targetArticleId || manualTargetByMatchId[m.matchId]) && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setApprovedMatchIds((prev) => new Set(prev).add(m.matchId));
                                setRejectedMatchIds((prev) => {
                                  const n = new Set(prev);
                                  n.delete(m.matchId);
                                  return n;
                                });
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                                isApproved && !isRejected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              <Check className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectedMatchIds((prev) => new Set(prev).add(m.matchId));
                                setApprovedMatchIds((prev) => {
                                  const n = new Set(prev);
                                  n.delete(m.matchId);
                                  return n;
                                });
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                                isRejected
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Duplicate Provenance Groups (Many-to-One Preservation) */}
          {preview.duplicateGroups.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Duplicate Clusters (Many-to-One Provenance Preserved · Zero Double Screening)</span>
              </div>
              <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto text-xs">
                {preview.duplicateGroups.slice(0, 40).map((g) => (
                  <div key={g.clusterKey} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-200 font-medium truncate max-w-xl">{g.canonicalTitle}</span>
                    <span className="text-[11px] font-mono text-teal-300">
                      {g.databases.join(' · ')} ({g.stagedRecordIds.length} records → 1 canonical)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PDF Reconciliation & Full-Text Status */}
      {subTab === 'pdfs' && preview && (
        <div className="space-y-4">
          {/* Proposed PDF Links */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <FileCheck2 className="w-4 h-4 text-teal-400" />
                <span>Existing PDF Reconciliation Candidates (Existing PDFs Never Replaced Without Explicit Opt-In)</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {preview.pdfMatches.length} disk PDF(s) scanned
              </span>
            </div>

            {preview.pdfMatches.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No PDF files found in this review&apos;s local PDF vault yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-800 max-h-80 overflow-y-auto">
                {preview.pdfMatches.map((pm) => {
                  const isApp = approvedPdfIds.has(pm.candidateId);
                  const isRej = rejectedPdfIds.has(pm.candidateId);
                  const allowRep = allowReplacePdfIds.has(pm.candidateId);
                  return (
                    <div key={pm.candidateId} className="p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 font-semibold text-white">
                          <span className="font-mono text-teal-300">{pm.pdfOriginalFilename}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-400 font-mono uppercase">{pm.matchMethod.replace(/_/g, ' ')}</span>
                          <span className="text-slate-600">·</span>
                          <span className="font-mono tabular-nums text-slate-300">
                            {Math.round(pm.confidence * 100)}%
                          </span>
                          {pm.alreadyMatchingHash && (
                            <>
                              <span className="text-slate-600">·</span>
                              <span className="text-emerald-400">Already Linked (Exact SHA-256)</span>
                            </>
                          )}
                          {pm.textExtractionFailed && (
                            <>
                              <span className="text-slate-600">·</span>
                              <span className="text-cyan-300">Text Extraction Failed (Still Full-Text Available)</span>
                            </>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {pm.targetArticleTitle
                            ? `Article: [${pm.targetArticleId}] ${pm.targetArticleTitle}`
                            : 'Unmatched disk document — classified as unmatched_document (NOT abstract_only)'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {pm.wouldReplaceExistingPdf && (
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-amber-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allowRep}
                              onChange={(e) =>
                                setAllowReplacePdfIds((prev) => {
                                  const n = new Set(prev);
                                  if (e.target.checked) n.add(pm.candidateId);
                                  else n.delete(pm.candidateId);
                                  return n;
                                })
                              }
                            />
                            <span>Authorize Replace Existing PDF</span>
                          </label>
                        )}
                        {pm.targetArticleId && !pm.alreadyMatchingHash && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setApprovedPdfIds((prev) => new Set(prev).add(pm.candidateId));
                                setRejectedPdfIds((prev) => {
                                  const n = new Set(prev);
                                  n.delete(pm.candidateId);
                                  return n;
                                });
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                                isApp && !isRej ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              Approve Link
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectedPdfIds((prev) => new Set(prev).add(pm.candidateId));
                                setApprovedPdfIds((prev) => {
                                  const n = new Set(prev);
                                  n.delete(pm.candidateId);
                                  return n;
                                });
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                                isRej ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              Skip
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Unmatched Disk PDFs */}
          {preview.unmatchedPdfs.length > 0 && (
            <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 space-y-2 text-xs">
              <div className="font-bold text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Unmatched Disk PDFs ({preview.unmatchedPdfs.length}) — Classified as &quot;unmatched_document&quot; (Never Abstract-Only)</span>
              </div>
              <div className="divide-y divide-slate-800">
                {preview.unmatchedPdfs.map((u) => (
                  <div key={u.storedFilename} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-slate-200">{u.originalFilename}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {(u.fileSize / 1024).toFixed(1)} KB · SHA-256 {u.fileHash.slice(0, 12)}
                      {u.extractedDoi ? ` · DOI ${u.extractedDoi}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full-Text Availability Reclassification Preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-white">
                Full-Text Availability Correction Preview ({preview.fullTextTransitions.filter((t) => t.changed).length} reclassification(s))
              </span>
              <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={recalcFullText}
                  onChange={(e) => setRecalcFullText(e.target.checked)}
                />
                <span>Apply Full-Text Availability Recalculation on Save</span>
              </label>
            </div>
            <div className="divide-y divide-slate-800 max-h-64 overflow-y-auto">
              {preview.fullTextTransitions.slice(0, 60).map((t) => (
                <div key={t.articleId} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-slate-200 font-medium truncate">{t.title}</div>
                    <div className="text-[11px] text-slate-400">{t.explanation}</div>
                  </div>
                  <div className="shrink-0 font-mono text-[11px]">
                    <span className={t.changed ? 'text-emerald-300 font-semibold' : 'text-slate-400'}>
                      {t.newStatusDetails.classificationLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PRISMA 2020 Historical Log & Equations */}
      {subTab === 'prisma' && preview && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white">
                  PRISMA 2020 Historical Counts Verification (Never Auto-Fabricated)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Current disk PDFs ({preview.prismaPreview.distinctionSummary.currentDiskPdfCount}) never determine Reports Sought or Historical Screening counts. Confirm verified counts from your search logs below.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveHistoricalLog}
                disabled={busyAction !== null}
                className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
              >
                {busyAction === 'prisma-log' ? 'Saving Log...' : 'Save Confirmed PRISMA Log'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              {(
                [
                  { key: 'recordsScreened', label: 'Records Screened (Unique)' },
                  { key: 'recordsExcludedAtScreening', label: 'Excluded at Title/Abstract' },
                  { key: 'reportsSoughtForRetrieval', label: 'Reports Sought' },
                  { key: 'reportsNotRetrieved', label: 'Reports Not Retrieved' },
                  { key: 'reportsAssessedForEligibility', label: 'Reports Assessed (Full-Text)' },
                  { key: 'reportsExcludedAtEligibility', label: 'Excluded at Eligibility' },
                ] as const
              ).map((field) => (
                <div key={field.key}>
                  <label className="block text-[11px] text-slate-400 mb-1">{field.label}</label>
                  <input
                    type="number"
                    min={0}
                    value={historicalLogDraft[field.key] ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      setHistoricalLogDraft((prev) => ({
                        ...prev,
                        [field.key]: raw === '' ? undefined : Math.max(0, parseInt(raw, 10) || 0),
                      }));
                    }}
                    placeholder="Unverified"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 pt-4">
                <input
                  id="verify-prisma-hist"
                  type="checkbox"
                  checked={Boolean(historicalLogDraft.verifiedByResearcher)}
                  onChange={(e) =>
                    setHistoricalLogDraft((prev) => ({
                      ...prev,
                      verifiedByResearcher: e.target.checked,
                      lastVerifiedAt: e.target.checked ? new Date().toISOString() : prev.lastVerifiedAt,
                    }))
                  }
                />
                <label htmlFor="verify-prisma-hist" className="text-slate-200 cursor-pointer">
                  I confirm these historical PRISMA counts match original database search logs
                </label>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Historical Log Notes</label>
                <input
                  type="text"
                  value={historicalLogDraft.sourceNote || ''}
                  onChange={(e) =>
                    setHistoricalLogDraft((prev) => ({ ...prev, sourceNote: e.target.value }))
                  }
                  placeholder="Reference original search protocol or export archive..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Distinction Summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            {[
              { label: 'DB Identification Records', val: preview.prismaPreview.distinctionSummary.databaseIdentificationRecords },
              { label: 'Unique Deduplicated Records', val: preview.prismaPreview.distinctionSummary.uniqueDeduplicatedRecords },
              { label: 'Reports Sought / Assessed', val: preview.prismaPreview.distinctionSummary.reportsSoughtOrAssessed ?? 'Unverified' },
              { label: 'Reports Included', val: preview.prismaPreview.distinctionSummary.reportsIncluded },
              { label: 'Studies Included', val: preview.prismaPreview.distinctionSummary.studiesIncluded },
              { label: 'Current Disk PDFs', val: preview.prismaPreview.distinctionSummary.currentDiskPdfCount },
            ].map((d) => (
              <div key={d.label} className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[11px] text-slate-400">{d.label}</div>
                <div className="text-sm font-bold font-mono tabular-nums text-white mt-0.5">{d.val}</div>
              </div>
            ))}
          </div>

          {/* PRISMA Consistency Equations */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 text-xs font-bold text-white">
              PRISMA 2020 Automated Mathematical Consistency Checks
            </div>
            <div className="divide-y divide-slate-800 text-xs">
              {preview.prismaPreview.consistencyChecks.map((chk) => (
                <div key={chk.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">{chk.equationLabel}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{chk.explanation}</div>
                  </div>
                  <div className="shrink-0 font-mono text-[11px] tabular-nums">
                    <span
                      className={
                        chk.status === 'pass'
                          ? 'text-emerald-400 font-bold'
                          : chk.status === 'discrepancy'
                          ? 'text-rose-400 font-bold'
                          : 'text-amber-300 font-bold'
                      }
                    >
                      [{chk.status.toUpperCase()}] Expected: {chk.expectedValue ?? 'N/A'} · Actual: {chk.actualValue ?? 'N/A'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {preview.prismaPreview.unverifiedGaps.length > 0 && (
            <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 space-y-1.5 text-xs">
              <div className="font-bold text-amber-300">Unverified Historical Gaps (Researcher Confirmation Requested)</div>
              {preview.prismaPreview.unverifiedGaps.map((g, idx) => (
                <div key={idx} className="text-slate-300">
                  · {g}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: 8 Final Deliverables & Audit Log */}
      {subTab === 'deliverables' && deliverables && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  ['projectRecoveryReport', '1. Project Recovery'],
                  ['databaseProvenanceReport', '2. DB Provenance'],
                  ['duplicateResolutionReport', '3. Duplicate Resolution'],
                  ['pdfReconciliationReport', '4. PDF Reconciliation'],
                  ['abstractClassificationReport', '5. Abstract Correction'],
                  ['updatedPrismaReport', '6. Updated PRISMA'],
                  ['screeningDiagnosticsReport', '7. Screening Diagnostics'],
                  ['recoveryAuditLogReport', '8. Audit Log'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveDeliverableKey(key)}
                  className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer ${
                    activeDeliverableKey === key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() =>
                  triggerDownload(
                    `${project.id}-recovery-deliverables.md`,
                    deliverables.combinedMarkdown,
                    'text/markdown;charset=utf-8;'
                  )
                }
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Markdown</span>
              </button>
              <button
                type="button"
                onClick={exportWordDeliverable}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Word (.doc)</span>
              </button>
              <button
                type="button"
                onClick={exportPrismaDiagnosticCsv}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Diagnostics CSV</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  triggerDownload(
                    `${project.id}-recovery-bundle.json`,
                    JSON.stringify({ project, preview, stagingBatches, auditLog, deliverables }, null, 2),
                    'application/json;charset=utf-8;'
                  )
                }
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-teal-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>JSON Package</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
            <pre className="text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed max-h-[380px] overflow-y-auto">
              {deliverables[activeDeliverableKey]}
            </pre>
          </div>

          {/* Applied Audit History with Quick Rollback */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-white">
              <History className="w-4 h-4 text-teal-400" />
              <span>Reconciliation Audit Trail ({auditLog.length})</span>
            </div>
            {auditLog.length === 0 ? (
              <div className="text-slate-400">
                No reconciliation operations applied yet. All staging and previews are non-destructive until applied below.
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {auditLog.map((op) => (
                  <div key={op.reconciliationId} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-mono text-slate-200">
                        {op.reconciliationId} · Backup {op.backupId} · {new Date(op.appliedAt).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                        DB Matches: {op.approvedMatchesApplied + op.manualMatchesApplied} · PDFs Linked: {op.pdfLinksApplied} · Reclassified: {op.fullTextReclassificationsApplied} · AbstractOnly: {op.abstractOnlyBefore}→{op.abstractOnlyAfter}
                        {op.rolledBackAt ? ` · ROLLED BACK (${new Date(op.rolledBackAt).toLocaleString()})` : ''}
                      </div>
                    </div>
                    {!op.rolledBackAt && (
                      <button
                        type="button"
                        onClick={() => handleRollback(op.backupId)}
                        disabled={busyAction !== null}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 text-[11px] font-semibold cursor-pointer"
                      >
                        Rollback This Apply
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Persistent Safe Approval & Apply Bar */}
      <div className="bg-slate-900 border border-teal-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-300 space-y-0.5">
          <div className="font-semibold text-white">
            Safe Apply Queue (Mandatory Pre-Reconciliation Backup Enforced Automatically)
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
            DB Matches Approved: {approvedMatchIds.size + Object.values(manualTargetByMatchId).filter(Boolean).length} · PDF Links Approved: {approvedPdfIds.size} · Authorized PDF Replacements: {allowReplacePdfIds.size} · Full-Text Recalc: {recalcFullText ? 'Yes' : 'No'}
          </div>
        </div>

        <button
          type="button"
          onClick={handleApplyApproved}
          disabled={busyAction !== null || loading}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition shrink-0"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{busyAction === 'apply' ? 'Backing Up & Applying...' : 'Backup & Apply Approved Reconciliation'}</span>
        </button>
      </div>
    </div>
  );
};
