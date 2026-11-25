import React, { useState, useMemo, useEffect } from 'react';
import {
  Article,
  BatchScreenerRunRecord,
  ModuleQaRescanRecord,
  OnlineSearchSession,
  ProposedReevaluationItem,
  ReviewIterationEntry,
  ReviewProject,
  ScreeningConsistencyReport,
  ScreeningRunRecord,
  SearchHistoryEntry,
  WorkbenchModuleId,
  WorkbenchState,
} from '../types';
import {
  Search,
  Filter,
  Layers,
  Copy,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  FileCheck2,
  RefreshCw,
  Download,
  Zap,
  Clock,
  Sparkles,
  History,
  Star,
  RotateCcw,
  Check,
  Bookmark,
  FileText,
  X,
  ChevronDown,
  Upload,
  FolderOpen,
  FolderPlus,
  Save,
  CheckSquare,
  Square,
  Globe,
  Building2,
  Lock,
  BookOpenText,
  Maximize2,
  FileArchive,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { apiService, mergeScreeningInsightsIntoExtractedData } from '../services/apiService';
import { FastOnlineSearchPanel } from './FastOnlineSearchPanel';
import { NotebookStudioModal } from './NotebookStudioModal';
import { AutoSaveStatusInfo, ModuleWorkbenchControls } from './ModuleWorkbenchControls';
import { ScreeningConsistencyPanel } from './ScreeningConsistencyPanel';
import {
  applyManualScreeningDecision,
  computeAuthoritativePrismaCounts,
  reconcileScreeningLedger,
} from '../utils/deterministicScreeningEngine';
import {
  isRawPdfOrPlaceholderAbstract,
  resolveFullArticleAbstract,
} from '../utils/abstractDisplay';
import {
  applyMetadataCorrectionWithCitationSync,
  formatBibTexEntries,
  normalizeValidDoi,
  validateArticleMetadata,
} from '../utils/citationFormatter';

type BulkRemoveMode = 'ids' | 'all' | 'excluded' | 'duplicates' | 'uncertain' | 'unscreened' | 'delete_folder';

interface ArticleLibraryProps {
  project: ReviewProject;
  allProjects?: ReviewProject[];
  onSwitchProject?: (projectId: string) => void;
  onCreateNewReview?: () => void;
  onUpdateArticles: (articles: Article[]) => void;
  onBulkRemoveFromFolder?: (
    projectId: string,
    params: {
      articleIds?: string[];
      mode?: 'ids' | 'all' | 'excluded' | 'duplicates' | 'uncertain' | 'unscreened';
    }
  ) => Promise<{
    removedCount: number;
    deletedOnlineCount?: number;
    remainingCount: number;
    savedAt?: string;
    databaseFolderPath?: string;
  }>;
  onSyncProjectAfterOnlineImport?: (
    projectId: string,
    articles: Article[],
    sessions: OnlineSearchSession[]
  ) => void;
  onSaveFolderChanges?: (projectId: string) => Promise<{
    totalInSubLibrary: number;
    savedAt?: string;
    databaseFolderPath?: string;
  }>;
  onDeleteProjectFolder?: (projectId: string) => Promise<{
    success: boolean;
    deletedFolderPath?: string;
  }>;
  onSelectArticleForScreening: (articleId: string) => void;
  onOpenCrossrefModal: () => void;
  onOpenAddModal: () => void;
  onOpenManualPaperModal?: () => void;
  onAddMultipleArticles?: (articles: Article[], options?: { keepOpen?: boolean; targetProjectId?: string }) => void;
  initialStageFilter?: string;
  autoOpenBatchScreener?: boolean;
  onBatchScreenerOpened?: () => void;
  autoSaveStatus?: AutoSaveStatusInfo;
  onUpdateWorkbenchState?: (
    updater: Partial<WorkbenchState> | ((prev: WorkbenchState) => WorkbenchState),
    options?: { immediate?: boolean; moduleId?: WorkbenchModuleId; label?: string }
  ) => void;
  onResetWorkbenchModule?: (params: {
    target: WorkbenchModuleId;
    resetArticleFields?: boolean;
    deleteArticlesMode?: 'none' | 'excluded' | 'uncertain' | 'unscreened' | 'duplicates';
  }) => Promise<any>;
  onDirectAddDataFiles?: (
    files: FileList,
    options?: { autoScreen?: boolean; rescanQuery?: string; moduleId?: WorkbenchModuleId }
  ) => Promise<{ addedCount: number }>;
  onRescanWithQueryQA?: (
    moduleId: WorkbenchModuleId,
    query: string,
    applyScreeningUpdates: boolean
  ) => Promise<{ record: ModuleQaRescanRecord; updatedCount?: number }>;
  onDeleteQaEntry?: (moduleId: WorkbenchModuleId, recordId: string) => void;
  onAttachOriginalPdf?: (articleId: string, file: File, targetProjectId?: string) => Promise<Article | null>;
}

export const ArticleLibrary: React.FC<ArticleLibraryProps> = ({
  project,
  allProjects = [],
  onSwitchProject,
  onCreateNewReview,
  onUpdateArticles,
  onBulkRemoveFromFolder,
  onSyncProjectAfterOnlineImport,
  onSaveFolderChanges,
  onDeleteProjectFolder,
  onSelectArticleForScreening,
  onOpenCrossrefModal,
  onOpenAddModal,
  onOpenManualPaperModal,
  onAddMultipleArticles,
  initialStageFilter,
  autoOpenBatchScreener = false,
  onBatchScreenerOpened,
  autoSaveStatus,
  onUpdateWorkbenchState,
  onResetWorkbenchModule,
  onDirectAddDataFiles,
  onRescanWithQueryQA,
  onDeleteQaEntry,
  onAttachOriginalPdf,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>(initialStageFilter || 'all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showOnlineSearchPanel, setShowOnlineSearchPanel] = useState(false);
  const [showNotebookStudio, setShowNotebookStudio] = useState(false);
  const [syncingArticleId, setSyncingArticleId] = useState<string | null>(null);
  const [showFullAbstracts, setShowFullAbstracts] = useState<boolean>(true);
  const [isBatchEnrichingAbstracts, setIsBatchEnrichingAbstracts] = useState<boolean>(false);
  const [batchAbstractProgress, setBatchAbstractProgress] = useState<{
    done: number;
    total: number;
    resolved: number;
  }>({ done: 0, total: 0, resolved: 0 });
  const [visibleLimit, setVisibleLimit] = useState<number>(500);

  // Bulk Selection & Per-Folder Permanent Remover States
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkRemoveModal, setShowBulkRemoveModal] = useState(false);
  const [bulkRemoveTargetProjectId, setBulkRemoveTargetProjectId] = useState<string>(project.id);
  const [bulkRemoveMode, setBulkRemoveMode] = useState<BulkRemoveMode>('ids');
  const [isProcessingFolderAction, setIsProcessingFolderAction] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [pdfActionArticleId, setPdfActionArticleId] = useState<string | null>(null);
  const [zipExportReport, setZipExportReport] = useState<{
    zipArchiveFilename: string;
    requestedCount: number;
    exportedCount: number;
    failedCount: number;
    exportedFiles: Array<{
      articleId: string;
      title: string;
      originalFilename: string;
      zipFilename: string;
      fileSize?: number;
    }>;
    failedFiles: Array<{
      articleId: string;
      title: string;
      originalFilename?: string;
      status?: string;
      reason: string;
    }>;
    errorMessage?: string;
  } | null>(null);
  const [folderActionStatus, setFolderActionStatus] = useState<{
    type: 'success' | 'error';
    message: string;
    path?: string;
    timestamp?: string;
  } | null>(null);

  // Strict Sub-Library isolation guard: ensure only articles for the active Review Title appear here
  const subLibraryArticles = useMemo(
    () =>
      (project.articles || []).filter(
        (a) => !a.projectId || a.projectId === project.id
      ),
    [project.articles, project.id]
  );

  // Active Library Total Count breakdown across the 4 intake channels (sum === subLibraryArticles.length)
  const intakeBreakdown = useMemo(() => {
    let manualBlank = 0;
    let bulkImporter = 0;
    let onlineDb = 0;
    let doiOther = 0;
    for (const art of subLibraryArticles) {
      if (art.intakeSource === 'manual_blank' || art.id?.startsWith('art-manual')) {
        manualBlank++;
      } else if (
        art.intakeSource === 'online_db' ||
        art.id?.startsWith('art-online') ||
        Boolean(art.searchBatchId)
      ) {
        onlineDb++;
      } else if (
        art.intakeSource === 'bulk_importer' ||
        Boolean(art.sourceFileName)
      ) {
        bulkImporter++;
      } else {
        doiOther++;
      }
    }
    return {
      manualBlank,
      bulkImporter,
      onlineDb,
      doiOther,
      total: subLibraryArticles.length,
    };
  }, [subLibraryArticles]);

  useEffect(() => {
    setVisibleLimit(500);
  }, [project.id, stageFilter, sourceFilter, searchQuery]);

  // Clear selection when switching folders and prune IDs that no longer exist
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkRemoveTargetProjectId(project.id);
  }, [project.id]);

  useEffect(() => {
    const validIds = new Set(subLibraryArticles.map((a) => a.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [subLibraryArticles]);

  // Search History & Reproducibility Tracker States
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [copiedQueryId, setCopiedQueryId] = useState<string | null>(null);

  // Initialize search history from localStorage (never pre-seed sample/other-review queries)
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>(() => {
    try {
      const stored = localStorage.getItem(`slr_search_history_${project.id}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Could not read search history from localStorage', e);
    }
    return [];
  });

  const saveSearchHistory = (updated: SearchHistoryEntry[]) => {
    setSearchHistory(updated);
    try {
      localStorage.setItem(`slr_search_history_${project.id}`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save search history', e);
    }
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`slr_search_history_${project.id}`);
      if (stored) {
        setSearchHistory(JSON.parse(stored));
      } else {
        setSearchHistory([]);
      }
    } catch (e) {
      console.warn('Could not read search history for project', e);
      setSearchHistory([]);
    }
  }, [project.id]);

  const recordSearchQuery = (queryToRecord: string, matchCount?: number) => {
    const trimmed = queryToRecord.trim();
    if (!trimmed || trimmed.length < 2) return;

    const count = matchCount !== undefined ? matchCount : filteredArticles.length;
    const existingIdx = searchHistory.findIndex((h) => h.query.toLowerCase() === trimmed.toLowerCase());

    let updated: SearchHistoryEntry[];
    if (existingIdx >= 0) {
      const existing = searchHistory[existingIdx];
      const updatedItem: SearchHistoryEntry = {
        ...existing,
        timestamp: Date.now(),
        resultsCount: count,
      };
      updated = [updatedItem, ...searchHistory.filter((_, idx) => idx !== existingIdx)];
    } else {
      const newEntry: SearchHistoryEntry = {
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        query: trimmed,
        timestamp: Date.now(),
        resultsCount: count,
        isPinned: false,
        filters: {
          stageFilter,
          sourceFilter,
        },
      };
      updated = [newEntry, ...searchHistory.slice(0, 24)];
    }

    saveSearchHistory(updated);
  };

  const handleRerunQuery = (entry: SearchHistoryEntry) => {
    setSearchQuery(entry.query);
    if (entry.filters?.stageFilter) setStageFilter(entry.filters.stageFilter);
    if (entry.filters?.sourceFilter) setSourceFilter(entry.filters.sourceFilter);
    setShowHistoryDropdown(false);
  };

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = searchHistory.map((item) =>
      item.id === id ? { ...item, isPinned: !item.isPinned } : item
    );
    saveSearchHistory(updated);
  };

  const handleCopyQuery = (query: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(query);
    setCopiedQueryId(id);
    setTimeout(() => setCopiedQueryId(null), 1800);
  };

  const handleDeleteQuery = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = searchHistory.filter((item) => item.id !== id);
    saveSearchHistory(updated);
  };

  const handleClearHistory = () => {
    const pinned = searchHistory.filter((h) => h.isPinned);
    saveSearchHistory(pinned);
  };

  const handleExportSearchLog = () => {
    const headers = ['Search ID', 'Query String', 'Results Count', 'Timestamp (ISO)', 'Pinned'];
    const rows = searchHistory.map((h, idx) => [
      `#${idx + 1}`,
      `"${h.query.replace(/"/g, '""')}"`,
      h.resultsCount,
      new Date(h.timestamp).toISOString(),
      h.isPinned ? 'Yes' : 'No',
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}-search-history-log.csv`;
    link.click();
  };

  const formatRelativeTime = (ts: number) => {
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(ts).toLocaleDateString();
  };

  // High-Throughput Deterministic Fast Batch Screener States
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [isBatchScreening, setIsBatchScreening] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchSizeSetting, setBatchSizeSetting] = useState<number>(150);
  const [proposedReevaluations, setProposedReevaluations] = useState<ProposedReevaluationItem[] | null>(null);
  const [serverConsistencyReport, setServerConsistencyReport] = useState<ScreeningConsistencyReport | null>(null);
  const [serverRuns, setServerRuns] = useState<ScreeningRunRecord[] | null>(null);
  const [batchActionBanner, setBatchActionBanner] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (autoOpenBatchScreener) {
      setShowBatchModal(true);
      onBatchScreenerOpened?.();
    }
  }, [autoOpenBatchScreener, onBatchScreenerOpened]);

  const savedBatchState = project.workbenchState?.batchScreener;
  const authoritativeLiveCounts = useMemo(
    () => computeAuthoritativePrismaCounts(project, serverRuns || savedBatchState?.runs),
    [project, serverRuns, savedBatchState?.runs]
  );

  const [batchStats, setBatchStats] = useState<{
    processed: number;
    total: number;
    included: number;
    excluded: number;
    uncertain: number;
    speed: number;
    elapsedSeconds: number;
  }>(() =>
    savedBatchState?.lastStats
      ? savedBatchState.lastStats
      : {
          processed: authoritativeLiveCounts.screenedRecords,
          total: authoritativeLiveCounts.uniqueRecords,
          included: authoritativeLiveCounts.includedStudies,
          excluded:
            authoritativeLiveCounts.excludedAtTitleAbstract +
            authoritativeLiveCounts.excludedAtFullText +
            authoritativeLiveCounts.reportsNotRetrieved,
          uncertain: authoritativeLiveCounts.uncertainRecords,
          speed: 0,
          elapsedSeconds: 0,
        }
  );

  // Hydrate authoritative state whenever project changes or Batch Screener modal opens
  useEffect(() => {
    setBatchStats({
      processed: authoritativeLiveCounts.screenedRecords,
      total: authoritativeLiveCounts.uniqueRecords,
      included: authoritativeLiveCounts.includedStudies,
      excluded:
        authoritativeLiveCounts.excludedAtTitleAbstract +
        authoritativeLiveCounts.excludedAtFullText +
        authoritativeLiveCounts.reportsNotRetrieved,
      uncertain: authoritativeLiveCounts.uncertainRecords,
      speed: project.workbenchState?.batchScreener?.lastStats?.speed || 0,
      elapsedSeconds: project.workbenchState?.batchScreener?.lastStats?.elapsedSeconds || 0,
    });
  }, [project.id, authoritativeLiveCounts, project.workbenchState?.batchScreener?.lastRunAt]);

  useEffect(() => {
    if (!showBatchModal) return;
    let cancelled = false;
    apiService
      .fetchAuthoritativeScreeningState(project.id)
      .then((res) => {
        if (cancelled) return;
        setServerRuns(res.runs);
        setServerConsistencyReport(res.consistencyReport);
      })
      .catch(() => {
        // Offline / local fallback uses computeAuthoritativePrismaCounts + investigateScreeningDiscrepancies
      });
    return () => {
      cancelled = true;
    };
  }, [showBatchModal, project.id]);

  // Execute Deterministic Batch Screener (Mode A: incremental, Mode B: rescreen with confirmation)
  const handleExecuteBatchScreen = async (
    articlesToScreen: Article[],
    runMode: 'unscreened_only' | 'full_library' = 'full_library',
    confirmReplaceDecisions: boolean = false
  ) => {
    const engineMode = runMode === 'unscreened_only' ? 'incremental' : 'rescreen';
    setIsBatchScreening(true);
    setBatchProgress(15);
    setBatchActionBanner(null);
    const start = performance.now();

    try {
      // Primary path: Server-authoritative transaction with concurrency lock & atomic ledger persistence
      let serverRes: Awaited<ReturnType<typeof apiService.executeAuthoritativeBatchRun>> | null = null;
      try {
        serverRes = await apiService.executeAuthoritativeBatchRun(project.id, {
          mode: engineMode,
          targetStage: 'final_included',
          batchSize: batchSizeSetting,
          confirmReplaceDecisions,
          preserveManualOverrides: true,
        });
      } catch {
        serverRes = null;
      }

      if (serverRes) {
        if (serverRes.requiresConfirmation) {
          setProposedReevaluations(serverRes.proposedReevaluations);
          setServerConsistencyReport(serverRes.consistencyReport);
          setIsBatchScreening(false);
          setBatchProgress(0);
          return;
        }

        setProposedReevaluations(null);
        setServerRuns(serverRes.runs);
        setServerConsistencyReport(serverRes.consistencyReport);
        const c = serverRes.consistencyReport.authoritativeCounts;
        const elapsed = Number(((performance.now() - start) / 1000).toFixed(1));
        const finalSnapshot = {
          processed: c.screenedRecords,
          total: c.uniqueRecords,
          included: c.includedStudies,
          excluded: c.excludedAtTitleAbstract + c.excludedAtFullText + c.reportsNotRetrieved,
          uncertain: c.uncertainRecords,
          speed: serverRes.runRecord.totalRecordsProcessed > 0
            ? Math.round(serverRes.runRecord.totalRecordsProcessed / Math.max(elapsed, 0.05))
            : 0,
          elapsedSeconds: elapsed,
        };
        setBatchStats(finalSnapshot);
        setBatchProgress(100);
        onUpdateArticles(serverRes.articles);
        if (onUpdateWorkbenchState) {
          const nowIso = new Date().toISOString();
          const legacyRecord: BatchScreenerRunRecord = {
            ...finalSnapshot,
            runId: serverRes.runRecord.runId,
            completedAt: nowIso,
            mode: runMode,
          };
          onUpdateWorkbenchState(
            (prevWs) => ({
              ...prevWs,
              batchScreener: {
                ...serverRes!.workbenchState?.batchScreener,
                lastStats: finalSnapshot,
                lastRunAt: nowIso,
                runs: serverRes!.runs,
                history: [legacyRecord, ...(prevWs.batchScreener?.history || [])].slice(0, 15),
              },
            }),
            { immediate: true, moduleId: 'batch_screener', label: 'Deterministic Batch Screener' }
          );
        }
        setBatchActionBanner({
          type: 'success',
          text:
            engineMode === 'incremental'
              ? `Mode A (Incremental): ${serverRes.runRecord.newRecordsScreened} newly screened, ${serverRes.runRecord.existingDecisionsReused} unchanged decisions reused, ${serverRes.runRecord.manualOverridesPreserved} manual override(s) preserved. PRISMA Included = ${c.includedStudies}.`
              : `Mode B (Re-screen Confirmed): ${serverRes.runRecord.modifiedRecordsRescreened + serverRes.runRecord.newRecordsScreened} evaluated, ${serverRes.runRecord.manualOverridesPreserved} manual override(s) protected. PRISMA Included = ${c.includedStudies}.`,
        });
        setIsBatchScreening(false);
        return;
      }

      // Deterministic client fallback if project folder does not yet exist on server
      const clientRes = await apiService.runDeterministicBatchScreeningClient({
        articles: subLibraryArticles.length > 0 ? subLibraryArticles : articlesToScreen,
        project,
        mode: engineMode,
        targetStage: 'final_included',
        batchSize: batchSizeSetting,
        confirmReplaceDecisions,
        preserveManualOverrides: true,
        onProgress: (processed, total, stats) => {
          const elapsed = (performance.now() - start) / 1000;
          setBatchProgress(Math.round((processed / Math.max(total, 1)) * 100));
          setBatchStats({
            processed,
            total,
            included: stats.included,
            excluded: stats.excluded,
            uncertain: stats.uncertain,
            speed: Math.round(processed / Math.max(elapsed, 0.05)),
            elapsedSeconds: parseFloat(elapsed.toFixed(1)),
          });
        },
      });

      if (clientRes.requiresConfirmation) {
        setProposedReevaluations(clientRes.proposedReevaluations);
        setIsBatchScreening(false);
        setBatchProgress(0);
        return;
      }

      setProposedReevaluations(null);
      const nextProj: ReviewProject = { ...project, articles: clientRes.updatedArticles };
      const counts = computeAuthoritativePrismaCounts(nextProj, [clientRes.runRecord]);
      const finalSnapshot = {
        processed: counts.screenedRecords,
        total: counts.uniqueRecords,
        included: counts.includedStudies,
        excluded: counts.excludedAtTitleAbstract + counts.excludedAtFullText + counts.reportsNotRetrieved,
        uncertain: counts.uncertainRecords,
        speed: Math.round(counts.uniqueRecords / Math.max((performance.now() - start) / 1000, 0.05)),
        elapsedSeconds: Number(((performance.now() - start) / 1000).toFixed(1)),
      };
      setBatchStats(finalSnapshot);
      onUpdateArticles(clientRes.updatedArticles);
      if (onUpdateWorkbenchState) {
        const nowIso = new Date().toISOString();
        const record: BatchScreenerRunRecord = {
          ...finalSnapshot,
          runId: clientRes.runRecord.runId,
          completedAt: nowIso,
          mode: runMode,
        };
        onUpdateWorkbenchState(
          (prevWs) => ({
            ...prevWs,
            batchScreener: {
              lastStats: finalSnapshot,
              lastRunAt: nowIso,
              runs: [clientRes.runRecord, ...(prevWs.batchScreener?.runs || [])].slice(0, 30),
              history: [record, ...(prevWs.batchScreener?.history || [])].slice(0, 15),
            },
          }),
          { immediate: true, moduleId: 'batch_screener', label: 'Deterministic Batch Screener' }
        );
      }
    } finally {
      setIsBatchScreening(false);
    }
  };

  const handleReconcileScreening = async () => {
    setIsReconciling(true);
    setBatchActionBanner(null);
    try {
      try {
        const res = await apiService.reconcileAuthoritativeScreening(project.id);
        setServerRuns(res.runs);
        setServerConsistencyReport(res.consistencyReport);
        onUpdateArticles(res.articles);
        if (onUpdateWorkbenchState) {
          onUpdateWorkbenchState(
            () => res.workbenchState,
            { immediate: true, moduleId: 'batch_screener', label: 'PRISMA Consistency Sync' }
          );
        }
        setBatchActionBanner({
          type: 'success',
          text: `Reconciled ${res.fixedCount} record(s) and synchronized PRISMA 2020 (${res.consistencyReport.authoritativeCounts.includedStudies} included / ${res.consistencyReport.authoritativeCounts.uniqueRecords} unique).`,
        });
        return;
      } catch {
        const localRec = reconcileScreeningLedger(project);
        onUpdateArticles(localRec.updatedArticles);
        setServerConsistencyReport(localRec.report);
        setBatchActionBanner({
          type: 'success',
          text: `Synchronized ${localRec.fixedCount} record(s) locally with PRISMA 2020 (${localRec.report.authoritativeCounts.includedStudies} included).`,
        });
      }
    } finally {
      setIsReconciling(false);
    }
  };

  // High-Throughput Stress-Test Generator (Injects & Screens 10,000 articles deterministically)
  const handleStressTest10k = async (count: number = 10000) => {
    setIsBatchScreening(true);
    setBatchProgress(0);

    const generatedBatch: Article[] = [];
    const platforms = ['DJI Matrice 300 RTK', 'WingtraOne Fixed-Wing', 'SenseFly eBee', 'Autel EVO II Dual', 'Sentinel-2 Satellite', 'Landsat-8 Satellite'];
    const sensors = ['MicaSense RedEdge-P', 'FLIR Tau 2 Thermal', 'Zenmuse XT2', 'Hyperspectral VNIR', 'Sentinel-2 MSI (10m)'];
    const targets = ['Canopy Water Stress (CWSI)', 'Maize Foliar Nitrogen', 'Olive Peacock Spot', 'Vineyard Drought', 'Crop Vigor Index'];

    for (let i = 1; i <= count; i++) {
      const isSatellite = i % 4 === 0;
      const isReview = i % 9 === 0;
      const hasLatency = i % 5 === 0;

      const plat = isSatellite ? 'Sentinel-2 / Landsat' : platforms[i % platforms.length];
      const sens = isSatellite ? 'MSI 10-20m Spaceborne' : sensors[i % sensors.length];
      const target = targets[i % targets.length];

      generatedBatch.push({
        id: `bench-${i}-${Date.now()}`,
        doi: `10.1016/j.bench.${2020 + (i % 6)}.${100000 + i}`,
        title: isReview
          ? `Narrative Review on Precision Agriculture Technologies across Catchments (${i})`
          : isSatellite
          ? `Satellite-Only Regional Drought Monitoring with Sentinel-2 MSI Multi-Spectral Data (${i})`
          : `High-Resolution UAV Imaging for Micro-Scale ${target} with ${plat} (${i})`,
        authors: [`Researcher_${(i % 50) + 1}, A.`, `Author_${(i % 80) + 1}, B.`],
        year: 2018 + (i % 8),
        journal: isReview ? 'Annual Reviews in Agronomy' : isSatellite ? 'Remote Sensing Applications' : 'Computers and Electronics in Agriculture',
        sourceDatabase: (['Scopus', 'Web of Science', 'IEEE Xplore', 'ScienceDirect'] as const)[i % 4],
        abstract: isReview
          ? 'This narrative review of literature surveys recent commercial sensors and drone platforms without empirical field flight data.'
          : isSatellite
          ? 'We utilized satellite-only Sentinel-2 constellations at 10m spatial resolution. No UAV or drone platforms were deployed.'
          : `We deployed a ${plat} equipped with ${sens} flown at 45m AGL (GSD 2.8 cm/px) to detect ${target}. Handheld ground-truth validated readings (R2=0.89). Measured end-to-end turnaround latency was ${hasLatency ? '14.2 minutes' : '2.1 hours'}.`,
        screeningStage: 'title_abstract',
        decision: 'unscreened',
        evidenceCitations: [],
        extractedData: {
          platform: plat,
          sensor: sens,
          gsd: isSatellite ? '10 m' : '2.8 cm/pixel',
          latency: hasLatency ? '14.2 min' : 'Not reported',
          latencyReported: hasLatency,
        },
      });
    }

    const start = performance.now();
    const batchRes = await apiService.runDeterministicBatchScreeningClient({
      articles: generatedBatch,
      project,
      mode: 'incremental',
      targetStage: 'final_included',
      batchSize: 250,
      confirmReplaceDecisions: true,
      onProgress: (processed, total, stats) => {
        const elapsed = (performance.now() - start) / 1000;
        const currentSpeed = Math.round(processed / Math.max(elapsed, 0.05));
        setBatchProgress(Math.round((processed / total) * 100));
        setBatchStats({
          processed,
          total,
          included: stats.included,
          excluded: stats.excluded,
          uncertain: stats.uncertain,
          speed: currentSpeed,
          elapsedSeconds: parseFloat(elapsed.toFixed(1)),
        });
      },
    });

    const screenedBatch = batchRes.updatedArticles.map((art) => ({ ...art, projectId: project.id }));
    const mergedAll = [...subLibraryArticles, ...screenedBatch];
    const counts = computeAuthoritativePrismaCounts({ ...project, articles: mergedAll }, [batchRes.runRecord]);
    const finalSnapshot = {
      processed: counts.screenedRecords,
      total: counts.uniqueRecords,
      included: counts.includedStudies,
      excluded: counts.excludedAtTitleAbstract + counts.excludedAtFullText + counts.reportsNotRetrieved,
      uncertain: counts.uncertainRecords,
      speed: Math.round(count / Math.max((performance.now() - start) / 1000, 0.05)),
      elapsedSeconds: Number(((performance.now() - start) / 1000).toFixed(1)),
    };
    setBatchStats(finalSnapshot);
    onUpdateArticles(mergedAll);
    if (onUpdateWorkbenchState) {
      const nowIso = new Date().toISOString();
      const record: BatchScreenerRunRecord = {
        ...finalSnapshot,
        runId: batchRes.runRecord.runId,
        completedAt: nowIso,
        mode: 'benchmark',
      };
      onUpdateWorkbenchState(
        (prevWs) => ({
          ...prevWs,
          batchScreener: {
            lastStats: finalSnapshot,
            lastRunAt: nowIso,
            runs: [batchRes.runRecord, ...(prevWs.batchScreener?.runs || [])].slice(0, 30),
            history: [record, ...(prevWs.batchScreener?.history || [])].slice(0, 15),
          },
        }),
        { immediate: true, moduleId: 'batch_screener', label: 'Fast Batch Screener Benchmark' }
      );
    }
    setIsBatchScreening(false);
  };

  // Helper for title similarity
  const cleanStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Detect duplicates strictly inside active folder
  const duplicateClusters = useMemo(() => {
    const clusters: { original: Article; duplicates: Article[] }[] = [];
    const seenMap = new Map<string, Article>();

    for (const art of subLibraryArticles) {
      const doiKey = art.doi ? art.doi.toLowerCase().trim() : null;
      const titleKey = cleanStr(art.title);

      let matchedOriginal: Article | undefined;

      if (doiKey && seenMap.has(doiKey)) {
        matchedOriginal = seenMap.get(doiKey);
      } else if (titleKey.length > 15 && seenMap.has(titleKey)) {
        matchedOriginal = seenMap.get(titleKey);
      }

      if (matchedOriginal) {
        let cluster = clusters.find((c) => c.original.id === matchedOriginal!.id);
        if (!cluster) {
          cluster = { original: matchedOriginal, duplicates: [] };
          clusters.push(cluster);
        }
        cluster.duplicates.push(art);
      } else {
        if (doiKey) seenMap.set(doiKey, art);
        if (titleKey.length > 15) seenMap.set(titleKey, art);
      }
    }

    return clusters;
  }, [subLibraryArticles]);

  const totalDuplicatesCount = duplicateClusters.reduce(
    (sum, c) => sum + c.duplicates.length,
    0
  );

  // Auto-resolve duplicates by marking them as duplicates
  const handleAutoResolveDuplicates = () => {
    const duplicateIds = new Set<string>();
    duplicateClusters.forEach((c) => {
      c.duplicates.forEach((d) => duplicateIds.add(d.id));
    });

    const updated = subLibraryArticles.map((art) => {
      if (duplicateIds.has(art.id)) {
        return {
          ...art,
          isDuplicate: true,
          decision: 'exclude' as const,
          decisionReason: 'Duplicate: Redundant publication from multiple database imports',
          screeningStage: 'excluded' as const,
        };
      }
      return art;
    });

    onUpdateArticles(updated);
    setShowDuplicateModal(false);
  };

  // Filtered articles (strictly from active Review Title sub-library)
  const filteredArticles = useMemo(() => {
    return subLibraryArticles.filter((art) => {
      // search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = art.title.toLowerCase().includes(q);
        const matchesAuthor = art.authors.some((a) => a.toLowerCase().includes(q));
        const matchesDoi = art.doi?.toLowerCase().includes(q);
        const matchesAbstract = art.abstract?.toLowerCase().includes(q);
        const matchesJournal = art.journal?.toLowerCase().includes(q);
        const matchesFile = art.sourceFileName?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesAuthor && !matchesDoi && !matchesAbstract && !matchesJournal && !matchesFile) {
          return false;
        }
      }

      // stage filter
      if (stageFilter === 'starred' && !art.isStarred) return false;
      if (stageFilter === 'unscreened' && art.decision !== 'unscreened') return false;
      if (stageFilter === 'include' && art.decision !== 'include') return false;
      if (stageFilter === 'exclude' && art.decision !== 'exclude') return false;
      if (stageFilter === 'uncertain' && art.decision !== 'uncertain') return false;
      if (stageFilter === 'duplicate' && !art.isDuplicate) return false;
      if (
        stageFilter === 'prisma_included' &&
        art.prismaProtocolStatus !== 'included' &&
        art.decision !== 'include'
      ) {
        return false;
      }
      if (
        stageFilter === 'prisma_excluded' &&
        art.prismaProtocolStatus !== 'excluded_archived' &&
        !(art.decision === 'exclude' && !art.isDuplicate)
      ) {
        return false;
      }
      if (
        stageFilter === 'needs_iteration' &&
        art.prismaProtocolStatus !== 'needs_iteration' &&
        art.decision !== 'uncertain' &&
        (!art.reviewIterations || art.reviewIterations.length === 0)
      ) {
        return false;
      }

      // source filter
      if (sourceFilter !== 'all' && art.sourceDatabase !== sourceFilter) return false;

      // separate search batch filter
      if (batchFilter !== 'all' && art.searchBatchId !== batchFilter) return false;

      return true;
    });
  }, [subLibraryArticles, searchQuery, stageFilter, sourceFilter, batchFilter]);

  const handleToggleStar = (artId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = subLibraryArticles.map((a) =>
      a.id === artId ? { ...a, isStarred: !a.isStarred } : a
    );
    onUpdateArticles(updated);
  };

  const handlePrismaIterationAction = (
    artId: string,
    prismaStatus: 'included' | 'excluded_archived' | 'needs_iteration',
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const nowIso = new Date().toISOString();
    const nextDecision =
      prismaStatus === 'included'
        ? ('include' as const)
        : prismaStatus === 'excluded_archived'
        ? ('exclude' as const)
        : ('uncertain' as const);
    const nextStage =
      prismaStatus === 'included'
        ? ('final_included' as const)
        : prismaStatus === 'excluded_archived'
        ? ('excluded' as const)
        : ('full_text' as const);
    const reasonText =
      prismaStatus === 'included'
        ? 'Confirmed for PRISMA protocol inclusion via Library quick action'
        : prismaStatus === 'excluded_archived'
        ? 'Excluded in PRISMA protocol (data preserved in review database)'
        : 'Flagged for reviewer iteration / re-check (data preserved)';

    let affectedTitle = '';
    const updated = subLibraryArticles.map((a) => {
      if (a.id !== artId) return a;
      affectedTitle = a.title;
      const prevIterations = Array.isArray(a.reviewIterations) ? a.reviewIterations : [];
      const entry: ReviewIterationEntry = {
        id: `iter_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        iterationNumber: prevIterations.length + 1,
        timestamp: nowIso,
        actor: 'Reviewer',
        previousDecision: a.decision,
        newDecision: nextDecision,
        prismaStatus,
        reason: reasonText,
        stage: stageFilter === 'starred' ? 'Interesting / Starred' : 'Article Library',
      };
      const manualUpdated = applyManualScreeningDecision(a, project, {
        decision: nextDecision,
        screeningStage: nextStage,
        reason: reasonText,
      });
      return {
        ...manualUpdated,
        prismaProtocolStatus: prismaStatus,
        reviewIterations: [...prevIterations, entry],
        lastReviewedIterationAt: nowIso,
      };
    });

    onUpdateArticles(updated);
    setFolderActionStatus({
      type: 'success',
      message:
        prismaStatus === 'included'
          ? `Included "${affectedTitle.slice(0, 48)}" in PRISMA protocol (iteration saved).`
          : prismaStatus === 'excluded_archived'
          ? `Excluded "${affectedTitle.slice(0, 48)}" in PRISMA protocol (data kept safely in DB).`
          : `Flagged "${affectedTitle.slice(0, 48)}" for Review Iteration.`,
      timestamp: new Date().toLocaleTimeString(),
    });
  };

  const handleAutoSyncSingleArticle = async (art: Article, e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncingArticleId(art.id);
    try {
      const data = await apiService.autoSyncMetadata(
        {
          doi: art.doi,
          title: art.title,
          filename: art.sourceFileName,
        },
        6000
      );
      if (data) {
        const hasCleanSyncedAbs = Boolean(data.abstract && !isRawPdfOrPlaceholderAbstract(data.abstract));
        const updated = subLibraryArticles.map((a) => {
          if (a.id === art.id) {
            return applyMetadataCorrectionWithCitationSync(
              a,
              {
                title: data.title || a.title,
                authors: data.authors?.length ? data.authors : a.authors,
                year: data.year || a.year,
                journal: data.journal || a.journal,
                volume: data.volume || a.volume,
                issue: data.issue || a.issue,
                pagesStr: data.pagesStr || a.pagesStr,
                publisher: data.publisher || a.publisher,
                doi: data.doi || a.doi,
                abstract: hasCleanSyncedAbs ? data.abstract : a.abstract,
                sourceDatabase: data.sourceDatabase || a.sourceDatabase,
                url: data.url || a.url,
                openAccessUrl: data.openAccessUrl || a.openAccessUrl,
              },
              'crossref',
              'Metadata synchronized from external registry'
            );
          }
          return a;
        });
        onUpdateArticles(updated);
        setFolderActionStatus({
          type: hasCleanSyncedAbs ? 'success' : 'error',
          message: hasCleanSyncedAbs
            ? `Retrieved full abstract for "${(data.title || art.title).slice(0, 50)}".`
            : `Metadata synced for "${art.title.slice(0, 45)}", but source repository did not return an abstract.`,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
    } catch (err: any) {
      console.warn('Auto-sync single article failed:', err?.message);
      setFolderActionStatus({
        type: 'error',
        message: err?.message || 'Could not retrieve full abstract from online metadata.',
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setSyncingArticleId(null);
    }
  };

  const missingAbstractFilteredCount = useMemo(() => {
    return filteredArticles.filter((art) => resolveFullArticleAbstract(art).isPlaceholder).length;
  }, [filteredArticles]);

  const handleResolveMissingAbstractsInStatus = async () => {
    const targets = filteredArticles.filter((art) => resolveFullArticleAbstract(art).isPlaceholder);
    if (targets.length === 0 || isBatchEnrichingAbstracts) return;
    setIsBatchEnrichingAbstracts(true);
    setBatchAbstractProgress({ done: 0, total: targets.length, resolved: 0 });

    const enrichedById = new Map<string, any>();
    let cursor = 0;
    let done = 0;
    let resolved = 0;
    const CONCURRENCY = 4;

    const worker = async () => {
      while (cursor < targets.length) {
        const idx = cursor++;
        if (idx >= targets.length) break;
        const art = targets[idx];
        try {
          const data = await apiService.autoSyncMetadata(
            {
              doi: art.doi,
              title: art.title,
              filename: art.sourceFileName,
            },
            5500
          );
          if (data && data.abstract && !isRawPdfOrPlaceholderAbstract(data.abstract)) {
            enrichedById.set(art.id, data);
            resolved++;
          }
        } catch {
          // Skip unavailable metadata records cleanly
        } finally {
          done++;
          setBatchAbstractProgress({ done, total: targets.length, resolved });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()));

    if (enrichedById.size > 0) {
      const updated = subLibraryArticles.map((art) => {
        const data = enrichedById.get(art.id);
        if (!data) return art;
        return applyMetadataCorrectionWithCitationSync(
          art,
          {
            title: data.title || art.title,
            authors: data.authors?.length ? data.authors : art.authors,
            year: data.year || art.year,
            journal: data.journal || art.journal,
            volume: data.volume || art.volume,
            issue: data.issue || art.issue,
            pagesStr: data.pagesStr || art.pagesStr,
            publisher: data.publisher || art.publisher,
            doi: data.doi || art.doi,
            abstract: data.abstract,
            sourceDatabase: data.sourceDatabase || art.sourceDatabase,
            url: data.url || art.url,
            openAccessUrl: data.openAccessUrl || art.openAccessUrl,
          },
          'crossref',
          'Batch abstract and metadata enrichment'
        );
      });
      onUpdateArticles(updated);
    }

    setFolderActionStatus({
      type: resolved > 0 ? 'success' : 'error',
      message:
        resolved > 0
          ? `Resolved full original abstracts for ${resolved} of ${targets.length} papers in the current Status list and saved to disk.`
          : `Checked ${targets.length} papers; repositories did not return public abstracts for unparsed local files.`,
      timestamp: new Date().toLocaleTimeString(),
    });
    setIsBatchEnrichingAbstracts(false);
  };

  // Provenance counts (active folder only)
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const art of subLibraryArticles) {
      counts[art.sourceDatabase] = (counts[art.sourceDatabase] || 0) + 1;
    }
    return counts;
  }, [subLibraryArticles]);

  const searchBatchOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string; count: number }>();
    for (const art of subLibraryArticles) {
      if (!art.searchBatchId) continue;
      const existing = map.get(art.searchBatchId);
      if (existing) {
        existing.count++;
      } else {
        const qSnippet = (art.searchQueryUsed || 'Online Search').slice(0, 28);
        map.set(art.searchBatchId, {
          id: art.searchBatchId,
          label: `${art.sourceDatabase}: "${qSnippet}"`,
          count: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [subLibraryArticles]);

  const handleToggleSelectArticle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectVisible = () => {
    const visible = filteredArticles.slice(0, visibleLimit);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visible.forEach((a) => next.add(a.id));
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(new Set(filteredArticles.map((a) => a.id)));
  };

  const includedSubLibraryCount = useMemo(
    () => subLibraryArticles.filter((a) => !a.isDuplicate && a.decision === 'include').length,
    [subLibraryArticles]
  );

  const excludedSubLibraryCount = useMemo(
    () => subLibraryArticles.filter((a) => !a.isDuplicate && a.decision === 'exclude').length,
    [subLibraryArticles]
  );

  const handleSelectAllIncluded = () => {
    setSelectedIds(new Set(subLibraryArticles.filter((a) => !a.isDuplicate && a.decision === 'include').map((a) => a.id)));
  };

  const handleSelectAllExcluded = () => {
    setSelectedIds(new Set(subLibraryArticles.filter((a) => !a.isDuplicate && a.decision === 'exclude').map((a) => a.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleExportSelectedPdfsZip = async () => {
    if (selectedIds.size === 0 || isExportingZip) return;
    setIsExportingZip(true);
    setZipExportReport(null);
    const ids = Array.from(selectedIds);
    const archiveBase = `${project.databaseFolderName || project.id}-selected-pdfs.zip`;
    try {
      const res = await apiService.exportSelectedPdfsZip(project.id, ids, {
        archiveName: archiveBase,
        fetchRemoteIfMissing: false,
      });
      setZipExportReport({
        zipArchiveFilename: archiveBase,
        requestedCount: res.requestedCount,
        exportedCount: res.exportedCount,
        failedCount: res.failedCount,
        exportedFiles: res.exportedFiles || [],
        failedFiles: res.failedFiles || [],
        errorMessage: res.error,
      });
      setFolderActionStatus({
        type: res.failedCount > 0 && res.exportedCount === 0 ? 'error' : 'success',
        message:
          res.failedCount > 0
            ? `ZIP downloaded with ${res.exportedCount}/${res.requestedCount} original PDF(s). ${res.failedCount} could not be exported — inspect report below.`
            : `Packaged ${res.exportedCount} original PDF(s) into "${archiveBase}" preserving exact filenames.`,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err: any) {
      const summary = err?.summary;
      if (summary) {
        setZipExportReport({
          zipArchiveFilename: archiveBase,
          requestedCount: summary.requestedCount || ids.length,
          exportedCount: summary.readyCount || 0,
          failedCount: (summary.failedFiles || []).length || ids.length,
          exportedFiles: summary.readyFiles || [],
          failedFiles: summary.failedFiles || [],
          errorMessage: err?.message,
        });
      }
      setFolderActionStatus({
        type: 'error',
        message: err?.message || 'Bulk PDF ZIP export failed.',
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleOpenFolderBulkRemover = (targetProjId: string, preferredMode?: BulkRemoveMode) => {
    setBulkRemoveTargetProjectId(targetProjId);
    if (preferredMode) {
      setBulkRemoveMode(preferredMode);
    } else if (targetProjId === project.id && selectedIds.size > 0) {
      setBulkRemoveMode('ids');
    } else {
      setBulkRemoveMode('excluded');
    }
    setShowBulkRemoveModal(true);
  };

  const handleSaveActiveFolderChanges = async () => {
    setIsProcessingFolderAction(true);
    try {
      if (onSaveFolderChanges) {
        const res = await onSaveFolderChanges(project.id);
        setFolderActionStatus({
          type: 'success',
          message: `Saved ${res.totalInSubLibrary} records permanently to folder`,
          path: res.databaseFolderPath || project.databaseFolderPath || `database/reviews/${project.id}`,
          timestamp: new Date(res.savedAt || Date.now()).toLocaleTimeString(),
        });
      } else {
        onUpdateArticles(subLibraryArticles);
        setFolderActionStatus({
          type: 'success',
          message: `Saved ${subLibraryArticles.length} records to folder`,
          path: project.databaseFolderPath || `database/reviews/${project.id}`,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
    } catch (err: any) {
      setFolderActionStatus({
        type: 'error',
        message: err?.message || 'Failed to save folder changes to disk',
      });
    } finally {
      setIsProcessingFolderAction(false);
    }
  };

  const targetBulkProject = useMemo(() => {
    return allProjects.find((p) => p.id === bulkRemoveTargetProjectId) || project;
  }, [allProjects, bulkRemoveTargetProjectId, project]);

  const targetFolderStats = useMemo(() => {
    const arts = (targetBulkProject.articles || []).filter(
      (a) => !a.projectId || a.projectId === targetBulkProject.id
    );
    const isCurrentActive = targetBulkProject.id === project.id;
    return {
      total: arts.length,
      selected: isCurrentActive ? arts.filter((a) => selectedIds.has(a.id)).length : 0,
      excluded: arts.filter((a) => a.decision === 'exclude').length,
      duplicates: arts.filter((a) => Boolean(a.isDuplicate)).length,
      uncertain: arts.filter((a) => a.decision === 'uncertain').length,
      unscreened: arts.filter((a) => a.decision === 'unscreened').length,
    };
  }, [targetBulkProject, project.id, selectedIds]);

  const pendingRemovalCount = useMemo(() => {
    if (bulkRemoveMode === 'ids') return targetFolderStats.selected;
    if (bulkRemoveMode === 'excluded') return targetFolderStats.excluded;
    if (bulkRemoveMode === 'duplicates') return targetFolderStats.duplicates;
    if (bulkRemoveMode === 'uncertain') return targetFolderStats.uncertain;
    if (bulkRemoveMode === 'unscreened') return targetFolderStats.unscreened;
    if (bulkRemoveMode === 'all' || bulkRemoveMode === 'delete_folder') return targetFolderStats.total;
    return 0;
  }, [bulkRemoveMode, targetFolderStats]);

  const handleConfirmBulkPermanentRemove = async () => {
    setIsProcessingFolderAction(true);
    try {
      if (bulkRemoveMode === 'delete_folder') {
        if (onDeleteProjectFolder) {
          const res = await onDeleteProjectFolder(targetBulkProject.id);
          setFolderActionStatus({
            type: 'success',
            message: `Permanently deleted review folder "${targetBulkProject.title || targetBulkProject.id}"`,
            path: res.deletedFolderPath || targetBulkProject.databaseFolderPath,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
        setShowBulkRemoveModal(false);
        return;
      }

      const idsToRemove =
        bulkRemoveMode === 'ids' && targetBulkProject.id === project.id
          ? Array.from(selectedIds)
          : [];

      if (onBulkRemoveFromFolder) {
        const res = await onBulkRemoveFromFolder(targetBulkProject.id, {
          articleIds: idsToRemove,
          mode: bulkRemoveMode,
        });
        if (targetBulkProject.id === project.id) {
          setSelectedIds(new Set());
        }
        setFolderActionStatus({
          type: 'success',
          message: `Permanently removed ${res.removedCount} article(s) from "${targetBulkProject.title || targetBulkProject.id}" (${res.remainingCount} remaining)`,
          path: res.databaseFolderPath || targetBulkProject.databaseFolderPath,
          timestamp: new Date(res.savedAt || Date.now()).toLocaleTimeString(),
        });
      } else {
        // Fallback when callback isn't supplied
        const currentArts = targetBulkProject.id === project.id ? subLibraryArticles : targetBulkProject.articles;
        const idSet = new Set(idsToRemove);
        const remaining = currentArts.filter((a) => {
          if (bulkRemoveMode === 'all') return false;
          if (bulkRemoveMode === 'excluded') return a.decision !== 'exclude';
          if (bulkRemoveMode === 'duplicates') return !a.isDuplicate;
          if (bulkRemoveMode === 'uncertain') return a.decision !== 'uncertain';
          if (bulkRemoveMode === 'unscreened') return a.decision !== 'unscreened';
          return !idSet.has(a.id);
        });
        onUpdateArticles(remaining);
        setSelectedIds(new Set());
        setFolderActionStatus({
          type: 'success',
          message: `Removed ${currentArts.length - remaining.length} article(s) & saved changes`,
          path: targetBulkProject.databaseFolderPath,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      setShowBulkRemoveModal(false);
    } catch (err: any) {
      setFolderActionStatus({
        type: 'error',
        message: err?.message || 'Bulk removal failed',
      });
    } finally {
      setIsProcessingFolderAction(false);
    }
  };

  const handleDeleteArticle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onBulkRemoveFromFolder) {
      try {
        const res = await onBulkRemoveFromFolder(project.id, {
          articleIds: [id],
          mode: 'ids',
        });
        setFolderActionStatus({
          type: 'success',
          message: `Permanently removed 1 article (${res.remainingCount} remaining)`,
          path: res.databaseFolderPath || project.databaseFolderPath,
          timestamp: new Date(res.savedAt || Date.now()).toLocaleTimeString(),
        });
      } catch (err: any) {
        setFolderActionStatus({
          type: 'error',
          message: err?.message || 'Failed to delete article',
        });
      }
    } else {
      onUpdateArticles(subLibraryArticles.filter((a) => a.id !== id));
    }
  };

  const exportBibTex = () => {
    const bib = formatBibTexEntries(filteredArticles);
    const blob = new Blob([bib], { type: 'application/x-bibtex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}-articles.bib`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportCsv = () => {
    const headers = ['ID', 'Title', 'Authors', 'Year', 'Journal', 'DOI', 'Database', 'Decision', 'Reason', 'Latency'];
    const rows = filteredArticles.map((a) => [
      a.id,
      `"${a.title.replace(/"/g, '""')}"`,
      `"${a.authors.join('; ').replace(/"/g, '""')}"`,
      a.year,
      `"${a.journal.replace(/"/g, '""')}"`,
      a.doi || '',
      a.sourceDatabase,
      a.decision,
      `"${(a.decisionReason || '').replace(/"/g, '""')}"`,
      `"${a.extractedData?.latency || 'Not reported'}"`,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}-library.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Individual Sub-Library Folders per Review Title (Strict Isolation) */}
      <div className="bg-slate-900 border border-indigo-900/50 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shrink-0">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-white flex flex-wrap items-center gap-2">
                <span>Partitioned Article Library Databases (1 Independent Database per Review)</span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono">
                  {subLibraryArticles.length} articles in this review&apos;s partition
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Active Storing Database:{' '}
                <span className="font-mono text-teal-400">
                  {project.databaseFolderPath || `database/reviews/${project.id}`}/articles.json
                </span>{' '}
                — isolated for single-review analysis only.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenFolderBulkRemover(project.id)}
              className="px-3 py-1.5 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border border-rose-700/60 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
              title="Open Bulk Permanent Remover for any Review Title folder"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Bulk Remove in Folder</span>
            </button>

            <button
              type="button"
              onClick={handleSaveActiveFolderChanges}
              disabled={isProcessingFolderAction}
              className="px-3 py-1.5 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-200 border border-emerald-700/60 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
              title="Persist all current folder records and metadata permanently to disk"
            >
              <Save className={`w-3.5 h-3.5 text-emerald-400 ${isProcessingFolderAction ? 'animate-pulse' : ''}`} />
              <span>Save Changes</span>
            </button>

            {onCreateNewReview && (
              <button
                type="button"
                onClick={onCreateNewReview}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-800/50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>+ New Review Folder</span>
              </button>
            )}
          </div>
        </div>

        {/* Saved / Bulk Removal Confirmation Banner */}
        {folderActionStatus && (
          <div
            className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              folderActionStatus.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-200'
                : 'bg-rose-950/50 border-rose-700/60 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {folderActionStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-semibold truncate">{folderActionStatus.message}</p>
                {folderActionStatus.path && (
                  <p className="text-[10px] font-mono text-slate-400 truncate">
                    Disk Path: {folderActionStatus.path} {folderActionStatus.timestamp ? `· Saved at ${folderActionStatus.timestamp}` : ''}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFolderActionStatus(null)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white shrink-0 cursor-pointer"
              title="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {allProjects.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {allProjects.map((proj) => {
              const isActive = proj.id === project.id;
              const isolatedCount = (proj.articles || []).filter(
                (a) => !a.projectId || a.projectId === proj.id
              ).length;
              return (
                <div
                  key={proj.id}
                  onClick={() => onSwitchProject && onSwitchProject(proj.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSwitchProject && onSwitchProject(proj.id);
                    }
                  }}
                  className={`px-3 py-2 rounded-xl border text-left transition shrink-0 max-w-[285px] cursor-pointer flex items-center gap-2 ${
                    isActive
                      ? 'bg-indigo-600/20 border-indigo-500 text-white ring-1 ring-indigo-500/40'
                      : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                  title={`Open isolated sub-library for "${proj.title}" (${proj.databaseFolderPath || proj.id})`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                      <span className="truncate">{proj.title || 'Untitled Review'}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded font-mono text-[10px] shrink-0 ${
                          isActive ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        {isolatedCount}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5">
                      /{proj.databaseFolderName || proj.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenFolderBulkRemover(proj.id, isolatedCount > 0 ? 'excluded' : 'delete_folder');
                    }}
                    className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-700/60 transition shrink-0 cursor-pointer"
                    title={`Bulk permanently remove articles or delete folder "${proj.title || proj.id}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Duplicates Alert Banner */}
      {totalDuplicatesCount > 0 && (
        <div className="bg-amber-950/40 border border-amber-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">
                Duplicate Detection: {totalDuplicatesCount} Potential Duplicate Records Identified
              </p>
              <p className="text-amber-300/80 text-xs">
                Matched via exact DOI and normalized title-author cross-referencing across databases.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => setShowDuplicateModal(true)}
              className="px-3 py-1.5 bg-amber-600/80 hover:bg-amber-600 text-white rounded-lg font-semibold transition"
            >
              Review Clusters
            </button>
            <button
              onClick={handleAutoResolveDuplicates}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-medium transition"
            >
              Auto-Resolve
            </button>
          </div>
        </div>
      )}

      {/* One-Click Integration Banner for Articles Needing Strict Geo + 4-Pillar Re-Screening */}
      {(() => {
        const pendingUpgradeCount = subLibraryArticles.filter(
          (a) => !a.isDuplicate && a.extractedData?.conceptAlignmentScore === undefined
        ).length;
        if (pendingUpgradeCount === 0) return null;
        return (
          <div className="bg-indigo-950/40 border border-indigo-700/70 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-white text-xs sm:text-sm">
                  Strict Geographic &amp; 4-Pillar Concept Engine Ready ({pendingUpgradeCount} records pending)
                </p>
                <p className="text-indigo-200/80 text-[11px]">
                  Re-screen to enforce study-area boundaries, block isolated-word off-topic hits, and extract Case, Conditioning Factors, Models &amp; Validation.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isBatchScreening}
              onClick={() => {
                const targets = subLibraryArticles.filter((a) => !a.isDuplicate);
                if (targets.length > 0) {
                  handleExecuteBatchScreen(targets, 'full_library');
                }
              }}
              className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-xl font-bold inline-flex items-center gap-1.5 transition shrink-0 cursor-pointer shadow-sm"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isBatchScreening ? 'Re-Screening...' : 'Apply & Re-Screen All Now'}</span>
            </button>
          </div>
        );
      })()}

      {/* Control bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input with History Tracker */}
          <div className="relative flex-1">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by title, author, DOI, journal, or abstract keywords (press Enter to log)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    recordSearchQuery(searchQuery);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-28 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <div className="absolute right-2 flex items-center gap-1.5">
                {searchQuery.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 transition ${
                    showHistoryDropdown
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/80'
                  }`}
                  title="Search history tracker & reproducibility log"
                >
                  <History className="w-3 h-3 text-indigo-400" />
                  <span className="hidden sm:inline">History</span>
                  <span className="px-1 py-0.2 bg-slate-900 rounded text-[10px] text-indigo-300 font-mono">
                    {searchHistory.length}
                  </span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showHistoryDropdown ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Reproducible Search History Dropdown */}
            {showHistoryDropdown && (
              <div className="absolute left-0 top-full mt-2 w-full md:w-[600px] z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
                      <History className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Search History Tracker</span>
                        <span className="px-1.5 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800/60 rounded text-[10px] font-mono">
                          {searchHistory.length} queries
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Reproducible query strings for PRISMA methodology reporting
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleExportSearchLog}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-medium transition inline-flex items-center gap-1 cursor-pointer"
                      title="Export search query audit log as CSV"
                    >
                      <Download className="w-3 h-3 text-indigo-400" />
                      <span>Export Log</span>
                    </button>
                    {searchHistory.length > 0 && (
                      <button
                        onClick={handleClearHistory}
                        className="px-2 py-1 bg-slate-800/80 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 border border-slate-700/80 rounded-lg text-[11px] transition inline-flex items-center gap-1 cursor-pointer"
                        title="Clear all unpinned queries"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Clear</span>
                      </button>
                    )}
                    <button
                      onClick={() => setShowHistoryDropdown(false)}
                      className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Query List */}
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {searchHistory.length === 0 ? (
                    <div className="py-8 text-center text-slate-500 text-xs">
                      <History className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                      <p>No queries logged yet.</p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Type keywords and press Enter to save reproducible search strings.
                      </p>
                    </div>
                  ) : (
                    searchHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className={`group p-2.5 rounded-xl border transition flex items-start justify-between gap-3 ${
                          entry.isPinned
                            ? 'bg-amber-950/20 border-amber-900/40 hover:border-amber-700/60'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => handleTogglePin(entry.id, e)}
                              className={`p-1 rounded transition cursor-pointer ${
                                entry.isPinned
                                  ? 'text-amber-400 hover:text-amber-300'
                                  : 'text-slate-600 hover:text-slate-400'
                              }`}
                              title={entry.isPinned ? 'Unpin query' : 'Pin query to top'}
                            >
                              <Star className={`w-3.5 h-3.5 ${entry.isPinned ? 'fill-amber-400' : ''}`} />
                            </button>
                            <span className="font-mono text-xs text-indigo-300 font-medium truncate select-all">
                              "{entry.query}"
                            </span>
                          </div>
                          <div className="flex items-center gap-2 pl-6 text-[10px] text-slate-400">
                            <span className="px-1.5 py-0.2 bg-slate-900 text-emerald-400 border border-slate-800 rounded font-medium">
                              {entry.resultsCount} {entry.resultsCount === 1 ? 'match' : 'matches'}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5 text-slate-500" />
                              {formatRelativeTime(entry.timestamp)}
                            </span>
                            {entry.filters?.stageFilter && entry.filters.stageFilter !== 'all' && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500 capitalize">
                                  Status: {entry.filters.stageFilter}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Query Action Buttons */}
                        <div className="flex items-center gap-1 self-center">
                          <button
                            onClick={() => handleRerunQuery(entry)}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold transition inline-flex items-center gap-1 shadow-sm cursor-pointer"
                            title="Rerun this search query now"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Rerun</span>
                          </button>

                          <button
                            onClick={(e) => handleCopyQuery(entry.query, entry.id, e)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer"
                            title="Copy query string for PRISMA log"
                          >
                            {copiedQueryId === entry.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>

                          <button
                            onClick={(e) => handleDeleteQuery(entry.id, e)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title="Remove from history"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer Quick Loader */}
                <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <button
                    onClick={() => {
                      const bq = project.booleanQuery || '("UAV" OR "drone") AND ("crop stress")';
                      setSearchQuery(bq);
                      recordSearchQuery(bq);
                      setShowHistoryDropdown(false);
                    }}
                    className="text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1.5 hover:underline cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Load Project Boolean Search Query</span>
                  </button>
                  <span className="text-slate-500 text-[10px]">
                    Tip: Press Enter in search bar to record query
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {onOpenManualPaperModal && (
              <button
                onClick={onOpenManualPaperModal}
                className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 via-teal-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer"
                title="Manual Research Paper Insertion with blank placeholders"
              >
                <Plus className="w-4 h-4 text-amber-300" />
                <span>+ Add Paper (Manual Blank)</span>
              </button>
            )}

            <button
              onClick={onOpenCrossrefModal}
              className="px-3 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-semibold rounded-xl shadow-sm transition inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Lookup DOI (Crossref)</span>
            </button>

            <button
              onClick={() => setShowBatchModal(true)}
              className="px-3 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="Fast Batch Screener: screens active Article Library records cleanly without touching search"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>⚡ Fast Batch Screener</span>
            </button>

            <button
              type="button"
              onClick={() => setShowOnlineSearchPanel((v) => !v)}
              className={`px-3 py-2 text-xs font-bold rounded-xl shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer ${
                showOnlineSearchPanel
                  ? 'bg-teal-600 text-white ring-2 ring-teal-400/50'
                  : 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white'
              }`}
              title="Open Fast Online Database Search & Download Panel (All Online Databases)"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>+ Add from Online DBs</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showOnlineSearchPanel ? 'rotate-180' : ''}`} />
            </button>

            <button
              onClick={() => setShowNotebookStudio(true)}
              className="px-3 py-2 bg-gradient-to-r from-indigo-600 via-sky-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-sm transition inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="Open fullscreen NotebookLM PDF Exporter & Unconstrained Grounded Research Chat (https://notebook.google.com/)"
            >
              <BookOpenText className="w-3.5 h-3.5" />
              <span>Export to NotebookLM &amp; Chat ({subLibraryArticles.filter((a) => a.decision === 'include').length} Included)</span>
              <Maximize2 className="w-3 h-3 opacity-85" />
            </button>

            <button
              onClick={onOpenAddModal}
              className="px-3 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-xs font-semibold rounded-xl shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Bulk File Import & Online Database Search"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Bulk Importer</span>
            </button>

            <button
              onClick={exportBibTex}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5"
              title="Download BibTeX citation library"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">BibTeX</span>
            </button>

            <button
              onClick={exportCsv}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5"
              title="Download CSV table"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>

        {/* Quick-Rerun Search History Chips */}
        {searchHistory.length > 0 && (
          <div className="flex items-center gap-2 pt-1 text-xs overflow-x-auto pb-0.5">
            <span className="text-slate-500 font-medium text-[11px] flex items-center gap-1 shrink-0">
              <History className="w-3 h-3 text-indigo-400" /> Recent Searches:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {searchHistory.slice(0, 5).map((h) => {
                const isActive = searchQuery.toLowerCase().trim() === h.query.toLowerCase().trim();
                return (
                  <button
                    key={h.id}
                    onClick={() => handleRerunQuery(h)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition inline-flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                    title={`Rerun search: "${h.query}" (${h.resultsCount} matches) - click to filter`}
                  >
                    {h.isPinned ? (
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                    ) : (
                      <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                    )}
                    <span className="max-w-[170px] truncate font-mono text-[11px]">"{h.query}"</span>
                    <span
                      className={`px-1 py-0.2 rounded text-[10px] font-mono ${
                        isActive ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-900 text-emerald-400 border border-slate-800'
                      }`}
                    >
                      {h.resultsCount}
                    </span>
                  </button>
                );
              })}
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-white text-[11px] underline ml-auto shrink-0 cursor-pointer"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {/* Filter Badges & Database Breakdown */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 font-medium mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Status:
            </span>
            {[
              { id: 'all', label: `All (${subLibraryArticles.length})` },
              { id: 'starred', label: `★ Starred (${subLibraryArticles.filter((a) => a.isStarred).length})` },
              { id: 'unscreened', label: `Unscreened (${subLibraryArticles.filter((a) => !a.isDuplicate && a.decision === 'unscreened').length})` },
              { id: 'include', label: `Included (${subLibraryArticles.filter((a) => !a.isDuplicate && a.decision === 'include').length})` },
              { id: 'exclude', label: `Excluded (${subLibraryArticles.filter((a) => !a.isDuplicate && a.decision === 'exclude').length})` },
              { id: 'uncertain', label: `Uncertain (${subLibraryArticles.filter((a) => !a.isDuplicate && a.decision === 'uncertain').length})` },
              { id: 'prisma_included', label: `PRISMA Included (${subLibraryArticles.filter((a) => !a.isDuplicate && (a.prismaProtocolStatus === 'included' || a.decision === 'include')).length})` },
              { id: 'prisma_excluded', label: `PRISMA Excluded Saved (${subLibraryArticles.filter((a) => !a.isDuplicate && (a.prismaProtocolStatus === 'excluded_archived' || a.decision === 'exclude')).length})` },
              { id: 'needs_iteration', label: `Review Iteration (${subLibraryArticles.filter((a) => !a.isDuplicate && (a.prismaProtocolStatus === 'needs_iteration' || a.decision === 'uncertain' || (a.reviewIterations?.length || 0) > 0)).length})` },
              { id: 'duplicate', label: `Duplicates (${subLibraryArticles.filter((a) => a.isDuplicate).length})` },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStageFilter(st.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                  stageFilter === st.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Database Provenance, Full Abstract Display Control & Separate Search Batch Filters */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <button
              type="button"
              onClick={() => setShowFullAbstracts((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                showFullAbstracts
                  ? 'bg-teal-600/20 border-teal-500/50 text-teal-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle between displaying the full abstract of the original document or compact 3-line view"
            >
              <BookOpen className="w-3 h-3" />
              <span>{showFullAbstracts ? 'Full Abstracts: Expanded' : 'Full Abstracts: Compact'}</span>
            </button>

            {missingAbstractFilteredCount > 0 && (
              <button
                type="button"
                disabled={isBatchEnrichingAbstracts}
                onClick={handleResolveMissingAbstractsInStatus}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600/25 hover:bg-indigo-600/40 disabled:opacity-60 border border-indigo-500/50 text-indigo-200 transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums"
                title="Retrieve full original abstracts from Crossref, OpenAlex & Europe PMC for unparsed PDFs or missing abstracts in this Status list"
              >
                <RefreshCw className={`w-3 h-3 ${isBatchEnrichingAbstracts ? 'animate-spin' : ''}`} />
                <span>
                  {isBatchEnrichingAbstracts
                    ? `Resolving Abstracts (${batchAbstractProgress.done}/${batchAbstractProgress.total})...`
                    : `Fetch Missing Abstracts (${missingAbstractFilteredCount})`}
                </span>
              </button>
            )}

            {searchBatchOptions.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Search Run:</span>
                <select
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-teal-300 rounded-lg px-2 py-0.5 text-[11px] focus:outline-none max-w-[220px]"
                >
                  <option value="all">All Separate Searches ({subLibraryArticles.length})</option>
                  {searchBatchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} ({b.count})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <span className="text-slate-500">Source:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-0.5 text-[11px] focus:outline-none"
            >
              <option value="all">All Sources</option>
              {Object.entries(sourceCounts).map(([db, count]) => (
                <option key={db} value={db}>
                  {db} ({count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Library Total Count Formula Bar (Zero Auto-Recovery / Zero PRISMA Interference) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-slate-200">
              Active Library Total: <span className="font-mono text-emerald-300 tabular-nums">{intakeBreakdown.total}</span>
            </span>
            <span className="text-slate-600">=</span>
            <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-300 tabular-nums">
              Manual Blank <strong className="text-indigo-300 font-mono">{intakeBreakdown.manualBlank}</strong>
            </span>
            <span className="text-slate-600">+</span>
            <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-300 tabular-nums">
              Bulk Importer <strong className="text-violet-300 font-mono">{intakeBreakdown.bulkImporter}</strong>
            </span>
            <span className="text-slate-600">+</span>
            <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-300 tabular-nums">
              Online DBs <strong className="text-teal-300 font-mono">{intakeBreakdown.onlineDb}</strong>
            </span>
            <span className="text-slate-600">+</span>
            <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-300 tabular-nums">
              DOI / Other <strong className="text-amber-300 font-mono">{intakeBreakdown.doiOther}</strong>
            </span>
          </div>
          <span className="text-[10px] text-slate-500">
            Deletions are permanent · PRISMA reporting runs downstream without restricting intake
          </span>
        </div>
      </div>

      {/* Checkbox File Manager Bar for Active Library Folder (Bulk ZIP PDF Export, Selection, Delete) */}
      <div
        className={`rounded-2xl border p-3 flex flex-wrap items-center justify-between gap-2 text-xs transition ${
          selectedIds.size > 0
            ? 'bg-teal-950/25 border-teal-600/60 shadow-lg'
            : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {subLibraryArticles.length > 0 && (
            <>
              <label className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold inline-flex items-center gap-2 cursor-pointer transition select-none">
                <input
                  type="checkbox"
                  checked={filteredArticles.length > 0 && selectedIds.size === filteredArticles.length}
                  onChange={() => {
                    if (selectedIds.size === filteredArticles.length) handleClearSelection();
                    else handleSelectAllFiltered();
                  }}
                  className="rounded accent-teal-500 cursor-pointer"
                />
                <span>Select Filtered ({filteredArticles.length})</span>
              </label>

              <button
                type="button"
                onClick={handleSelectVisible}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium inline-flex items-center gap-1.5 cursor-pointer transition"
              >
                <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                <span>Select Visible ({Math.min(visibleLimit, filteredArticles.length)})</span>
              </button>

              {includedSubLibraryCount > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllIncluded}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 font-medium inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Select Included ({includedSubLibraryCount})</span>
                </button>
              )}

              {excludedSubLibraryCount > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllExcluded}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/50 text-rose-300 border border-rose-700/50 font-medium inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Select Excluded ({excludedSubLibraryCount})</span>
                </button>
              )}

              <span
                className={`px-2.5 py-1.5 rounded-lg font-mono font-bold tabular-nums border ${
                  selectedIds.size > 0
                    ? 'bg-teal-500/20 text-teal-200 border-teal-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                {selectedIds.size} Selected
              </span>

              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 font-medium cursor-pointer transition"
                >
                  Clear Selection
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={selectedIds.size === 0 || isExportingZip}
            onClick={handleExportSelectedPdfsZip}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-40 text-white font-bold shadow-sm inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap shrink-0"
            title="Package selected articles' exact original PDF bytes into a ZIP preserving every original filename"
          >
            <FileArchive className="w-3.5 h-3.5" />
            <span>
              {isExportingZip
                ? 'Packaging ZIP...'
                : `Export Selected PDFs (${selectedIds.size})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowOnlineSearchPanel((v) => !v)}
            className="px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
            title="Search all online databases by Keywords, Title, DOI, Abstract, Authors, or Related Articles"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Add File from Online DBs</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNotebookStudio(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition"
            title="Export included original PDFs & sources to notebook.google.com or chat in fullscreen"
          >
            <BookOpenText className="w-3.5 h-3.5" />
            <span>NotebookLM Export &amp; Chat</span>
            <Maximize2 className="w-3 h-3 opacity-85" />
          </button>

          <button
            type="button"
            onClick={onOpenAddModal}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New File</span>
          </button>

          <button
            type="button"
            disabled={selectedIds.size === 0 || isProcessingFolderAction}
            onClick={() => handleOpenFolderBulkRemover(project.id, 'ids')}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold shadow-sm inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete ({selectedIds.size})</span>
          </button>

          <button
            type="button"
            disabled={subLibraryArticles.length === 0 || isProcessingFolderAction}
            onClick={() => handleOpenFolderBulkRemover(project.id, 'all')}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/70 text-slate-200 hover:text-rose-300 border border-slate-700 hover:border-rose-700/60 disabled:opacity-40 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            <span>Clear File</span>
          </button>
        </div>
      </div>

      {/* Explicit Bulk PDF ZIP Export Report (Collisions + Missing/Failed Recovery) */}
      {zipExportReport && (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 text-xs space-y-3 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <FileArchive className="w-4 h-4 text-teal-400 shrink-0" />
              <span className="font-bold text-white">
                Bulk PDF ZIP Export Report — {zipExportReport.zipArchiveFilename}
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold tabular-nums">
                Exported: {zipExportReport.exportedCount}/{zipExportReport.requestedCount}
              </span>
              {zipExportReport.failedCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold tabular-nums">
                  Skipped/Failed: {zipExportReport.failedCount}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setZipExportReport(null)}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              title="Close export report"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {zipExportReport.errorMessage && (
            <p className="text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl px-3 py-2">
              {zipExportReport.errorMessage}
            </p>
          )}

          {zipExportReport.exportedFiles.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 block">
                Included Original PDFs ({zipExportReport.exportedFiles.length})
              </span>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {zipExportReport.exportedFiles.map((ef) => (
                  <div
                    key={ef.articleId}
                    className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5"
                  >
                    <span className="font-mono text-teal-200 truncate max-w-[360px]">
                      {ef.zipFilename}
                      {ef.zipFilename !== ef.originalFilename ? (
                        <span className="text-slate-400 ml-1">
                          (collision suffix from &quot;{ef.originalFilename}&quot;)
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate max-w-[260px]">
                      {ef.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {zipExportReport.failedFiles.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 block">
                Files Without Stored Original PDF Binary ({zipExportReport.failedFiles.length})
              </span>
              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                {zipExportReport.failedFiles.map((ff) => (
                  <div
                    key={ff.articleId}
                    className="flex flex-wrap items-center justify-between gap-2 bg-amber-950/20 border border-amber-500/30 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white truncate">{ff.title}</p>
                      <p className="text-[11px] text-amber-300/90">
                        {ff.status ? `${ff.status}: ` : ''}{ff.reason}
                      </p>
                    </div>
                    {onAttachOriginalPdf && (
                      <label className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0">
                        <Upload className="w-3 h-3" />
                        <span>Attach PDF</span>
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            const updated = await onAttachOriginalPdf(ff.articleId, file, project.id);
                            if (updated) {
                              setZipExportReport((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      failedFiles: prev.failedFiles.filter((x) => x.articleId !== ff.articleId),
                                      failedCount: Math.max(0, prev.failedCount - 1),
                                    }
                                  : null
                              );
                              setFolderActionStatus({
                                type: 'success',
                                message: `Attached "${updated.original_filename || file.name}" to vault. Ready for ZIP export.`,
                                timestamp: new Date().toLocaleTimeString(),
                              });
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsible Fast Online Database Search, PDF Downloader & PRISMA Retrieval Panel */}
      {showOnlineSearchPanel && (
        <FastOnlineSearchPanel
          project={project}
          targetProjectId={project.id}
          onAddArticles={(newArticles, opts) => {
            if (onAddMultipleArticles) {
              onAddMultipleArticles(newArticles, opts);
            } else {
              const existingIds = new Set(subLibraryArticles.map((a) => a.id));
              const dedupedNew = newArticles.filter((a) => !existingIds.has(a.id));
              onUpdateArticles([...dedupedNew, ...subLibraryArticles]);
            }
          }}
          onRecordSearchHistory={(q, count) => recordSearchQuery(q, count)}
          onSyncProjectAfterImport={onSyncProjectAfterOnlineImport}
          onClose={() => setShowOnlineSearchPanel(false)}
        />
      )}

      {/* Articles List / Grid */}
      <div className="space-y-3">
        {filteredArticles.length === 0 ? (
          <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400">
            <BookOpen className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-300">No matching articles found in this Review&apos;s Sub-Library</p>
            <p className="text-xs text-slate-500 mt-1">
              Each Review Title keeps an independent sub-library folder. Import local files or add papers to this Review Title.
            </p>
          </div>
        ) : (
          filteredArticles.slice(0, visibleLimit).map((art) => {
            const isSelected = selectedIds.has(art.id);
            return (
            <div
              key={art.id}
              onClick={() => onSelectArticleForScreening(art.id)}
              className={`group p-4 rounded-2xl border transition shadow-sm hover:shadow-md cursor-pointer relative ${
                isSelected
                  ? 'bg-rose-950/20 border-rose-500/70 ring-1 ring-rose-500/30'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => handleToggleSelectArticle(art.id, e)}
                    className={`mt-0.5 p-1 rounded-lg border transition shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-white hover:border-slate-500'
                    }`}
                    title={isSelected ? 'Deselect from bulk removal' : 'Select for bulk permanent removal'}
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                    {/* Decision pill */}
                    {art.decision === 'include' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" /> INCLUDED
                      </span>
                    )}
                    {art.decision === 'exclude' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        <XCircle className="w-3 h-3" /> EXCLUDED
                      </span>
                    )}
                    {art.decision === 'uncertain' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        <HelpCircle className="w-3 h-3" /> UNCERTAIN / REVIEW
                      </span>
                    )}
                    {art.decision === 'unscreened' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                        UNSCREENED
                      </span>
                    )}

                    {/* Duplicate pill */}
                    {art.isDuplicate && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        DUPLICATE
                      </span>
                    )}

                    {/* Provenance badge */}
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-950 text-slate-400 border border-slate-800">
                      {art.sourceDatabase}
                    </span>

                    {/* Latency badge if reported */}
                    {art.extractedData?.latencyReported && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        Latency: {art.extractedData.latency}
                      </span>
                    )}

                    {/* Critical appraisal score */}
                    {art.appraisalScore !== undefined && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Appraisal: {art.appraisalScore}/13
                      </span>
                    )}

                    {/* PRISMA 2020 Retrieval / Accessibility Status Badge */}
                    {art.accessStatus === 'downloadable' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <FileCheck2 className="w-3 h-3" /> Downloadable PDF
                      </span>
                    )}
                    {art.accessStatus === 'needs_institution_confirmation' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        <Building2 className="w-3 h-3" /> {art.institutionConfirmed ? 'Institution Confirmed' : 'Needs Institution Confirm'}
                      </span>
                    )}
                    {art.accessStatus === 'not_accessible' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        <Lock className="w-3 h-3" /> Not Accessible (PRISMA)
                      </span>
                    )}
                    {art.accessStatus === 'abstract_only' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        <FileText className="w-3 h-3" /> Abstract Only
                      </span>
                    )}

                    {/* APA Citation Verification Badge */}
                    {(() => {
                      const v = validateArticleMetadata(art);
                      return (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            v.verificationStatus === 'Verified'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : v.verificationStatus === 'Partially Verified'
                              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                              : v.verificationStatus === 'Needs Manual Review'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}
                          title={v.missingFields.length > 0 ? `Missing: ${v.missingFields.join(', ')}` : 'Bibliographic metadata verified for APA 7th'}
                        >
                          {v.verificationStatus === 'Verified' ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                          <span>{v.verificationStatus}</span>
                        </span>
                      );
                    })()}

                    {/* Exact Preserved Original Filename Pill */}
                    {(art.original_filename || art.sourceFileName) && (
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-950 text-teal-300 border border-slate-700 max-w-[230px] truncate"
                        title={`Original Filename: ${art.original_filename || art.sourceFileName}${art.pdfStorage?.storage_status === 'stored_disk' ? ' (Original PDF Vault Verified)' : ''}`}
                      >
                        {art.original_filename || art.sourceFileName}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-white group-hover:text-indigo-400 transition leading-snug pt-1">
                    {art.title}
                  </h3>

                  {(() => {
                    const v = validateArticleMetadata(art);
                    const authorsDisplay =
                      v.sanitized.authors.length > 0
                        ? `${v.sanitized.authors.slice(0, 4).join(', ')}${v.sanitized.authors.length > 4 ? ' et al.' : ''}`
                        : 'No author listed';
                    return (
                      <p className="text-xs text-slate-400">
                        {authorsDisplay} ({art.year || 'n.d.'})
                        {v.sanitized.journalOrSource ? (
                          <>
                            {' '}
                            · <span className="italic text-slate-300">{v.sanitized.journalOrSource}</span>
                          </>
                        ) : null}
                      </p>
                    );
                  })()}

                  {/* Full Abstract of Original Document for every listed Status category */}
                  {(() => {
                    const resolvedAbs = resolveFullArticleAbstract(art);
                    return (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 rounded-xl bg-slate-950/80 border border-slate-800/90 p-3 space-y-1.5 cursor-text"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                          <span className="font-semibold text-teal-300">
                            {resolvedAbs.source === 'original_doc_section'
                              ? 'Full Abstract (Extracted from Original Document)'
                              : 'Full Abstract (Original Record)'}
                          </span>
                          <div className="flex items-center gap-2">
                            {!resolvedAbs.isPlaceholder && (
                              <span className="font-mono tabular-nums text-slate-400">
                                {resolvedAbs.wordCount} words
                              </span>
                            )}
                            {resolvedAbs.isPlaceholder && (
                              <button
                                type="button"
                                disabled={syncingArticleId === art.id}
                                onClick={(e) => handleAutoSyncSingleArticle(art, e)}
                                className="px-2 py-0.5 rounded-md bg-indigo-600/25 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition"
                              >
                                <RefreshCw
                                  className={`w-3 h-3 ${syncingArticleId === art.id ? 'animate-spin' : ''}`}
                                />
                                <span>
                                  {syncingArticleId === art.id ? 'Fetching...' : 'Fetch Full Abstract'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>

                        {resolvedAbs.isPlaceholder ? (
                          <p className="text-xs text-amber-300/90 leading-relaxed">
                            {resolvedAbs.source === 'placeholder_pdf' && art.sourceFileName
                              ? `Compressed PDF import (${art.sourceFileName}) did not store plain-text abstract streams. Click "Fetch Full Abstract" or "Fetch Missing Abstracts" in the Status bar to retrieve the complete abstract.`
                              : resolvedAbs.text ||
                                'Full abstract text was not included in this import record. Click "Fetch Full Abstract" to retrieve it from Crossref, OpenAlex, or Europe PMC.'}
                          </p>
                        ) : (
                          <p
                            className={`text-xs text-slate-200 leading-relaxed whitespace-pre-line ${
                              showFullAbstracts ? '' : 'line-clamp-3'
                            }`}
                          >
                            {resolvedAbs.text}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Cross-DB duplicate or exclusion reason */}
                  {(art.duplicateNote || art.decisionReason) && (
                    <div className="pt-1 text-[11px] font-medium flex flex-wrap items-center gap-2">
                      {art.duplicateNote && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">
                          {art.duplicateNote}
                        </span>
                      )}
                      {art.decisionReason && (
                        <span className="text-rose-300/90 flex items-center gap-1">
                          <span className="font-semibold text-rose-400">Reason:</span> {art.decisionReason}
                        </span>
                      )}
                    </div>
                  )}

                    {/* Page evidence count */}
                  {art.evidenceCitations && art.evidenceCitations.length > 0 && (
                    <div className="pt-1 flex items-center gap-1.5 text-[11px] text-teal-400">
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>{art.evidenceCitations.length} Grounded Page-Level Evidence Citations Pinned</span>
                    </div>
                  )}

                  {/* PRISMA Protocol & Review Iteration Controls (Preserve Data) */}
                  <div className="pt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => handlePrismaIterationAction(art.id, 'included', e)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 border cursor-pointer transition ${
                        art.prismaProtocolStatus === 'included' || art.decision === 'include'
                          ? 'bg-emerald-600/25 border-emerald-500/60 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-emerald-600/50 hover:text-emerald-300'
                      }`}
                      title="Include in PRISMA Protocol and log iteration (no deletion)"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Include PRISMA</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handlePrismaIterationAction(art.id, 'excluded_archived', e)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 border cursor-pointer transition ${
                        art.prismaProtocolStatus === 'excluded_archived' ||
                        (art.decision === 'exclude' && !art.isDuplicate)
                          ? 'bg-rose-600/20 border-rose-500/50 text-rose-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-rose-600/50 hover:text-rose-300'
                      }`}
                      title="Exclude from PRISMA synthesis while preserving full record in database"
                    >
                      <XCircle className="w-3 h-3" />
                      <span>Exclude (Keep Data)</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handlePrismaIterationAction(art.id, 'needs_iteration', e)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 border cursor-pointer transition ${
                        art.prismaProtocolStatus === 'needs_iteration' || art.decision === 'uncertain'
                          ? 'bg-amber-600/25 border-amber-500/60 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-amber-600/50 hover:text-amber-300'
                      }`}
                      title="Flag for Review Iteration / Re-Check without deleting data"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Iterate</span>
                    </button>
                    {art.reviewIterations && art.reviewIterations.length > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-[10px] font-mono text-indigo-300">
                        Iter #{art.reviewIterations.length}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right actions */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pt-2 sm:pt-0">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 group-hover:translate-x-0.5 transition">
                    <span>Open Review</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => handleToggleStar(art.id, e)}
                      className={`p-1.5 rounded-lg transition ${
                        art.isStarred
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-950 text-slate-500 hover:text-amber-400'
                      }`}
                      title={art.isStarred ? 'Starred study' : 'Star this study'}
                    >
                      <Star className={`w-3.5 h-3.5 ${art.isStarred ? 'fill-amber-400' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleAutoSyncSingleArticle(art, e)}
                      disabled={syncingArticleId === art.id}
                      className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition"
                      title="Auto-Sync & Refresh Metadata from Online Databases"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingArticleId === art.id ? 'animate-spin text-indigo-400' : ''}`} />
                    </button>
                    {(art.pdfStorage?.storage_status === 'stored_disk' || art.file_path || art.pdfUrl || art.openAccessUrl) && (
                      <button
                        type="button"
                        disabled={pdfActionArticleId === art.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setPdfActionArticleId(art.id);
                          const hasDiskPdf = art.pdfStorage?.storage_status === 'stored_disk' || Boolean(art.file_path);
                          const origName = art.original_filename || art.sourceFileName || '';
                          try {
                            if (hasDiskPdf) {
                              const res = await apiService.downloadArticleOriginalPdf(project.id, art.id, origName || art.title);
                              setFolderActionStatus({
                                type: 'success',
                                message: `Exported exact original PDF "${res.filename}"`,
                                timestamp: new Date().toLocaleTimeString(),
                              });
                            } else {
                              const target = art.pdfUrl || art.openAccessUrl || '';
                              const url = apiService.getProxyPdfDownloadUrl(target, origName || art.title);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = origName || `${art.id}.pdf`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }
                          } catch (err: any) {
                            setFolderActionStatus({
                              type: 'error',
                              message: err?.message || 'Could not export original PDF.',
                              timestamp: new Date().toLocaleTimeString(),
                            });
                          } finally {
                            setPdfActionArticleId(null);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 disabled:opacity-40 text-emerald-300 border border-emerald-700/50 transition cursor-pointer"
                        title={
                          art.pdfStorage?.storage_status === 'stored_disk' || art.file_path
                            ? `Export exact original PDF (${art.original_filename || art.sourceFileName || 'original'})`
                            : 'Download PDF paper for PRISMA full-text review'
                        }
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onAttachOriginalPdf && (
                      <label
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-teal-300 border border-slate-800 transition cursor-pointer"
                        title={
                          art.pdfStorage?.storage_status === 'stored_disk'
                            ? `Replace original PDF (${art.original_filename || art.sourceFileName})`
                            : 'Attach original PDF file'
                        }
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            setPdfActionArticleId(art.id);
                            try {
                              const updated = await onAttachOriginalPdf(art.id, file, project.id);
                              if (updated) {
                                setFolderActionStatus({
                                  type: 'success',
                                  message: `Stored original PDF "${updated.original_filename || file.name}"`,
                                  timestamp: new Date().toLocaleTimeString(),
                                });
                              }
                            } catch (err: any) {
                              setFolderActionStatus({
                                type: 'error',
                                message: err?.message || 'Failed to upload PDF file.',
                                timestamp: new Date().toLocaleTimeString(),
                              });
                            } finally {
                              setPdfActionArticleId(null);
                            }
                          }}
                        />
                      </label>
                    )}
                    {normalizeValidDoi(art.doi) && (
                      <a
                        href={`https://doi.org/${normalizeValidDoi(art.doi)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                        title="Open DOI"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={(e) => handleDeleteArticle(art.id, e)}
                      className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-950 text-slate-500 hover:text-rose-400 transition"
                      title="Delete permanently from folder"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              </div>
            </div>
            );
          })
        )}

        {/* Pagination Footer for large bulk imports */}
        {filteredArticles.length > visibleLimit && (
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-400">
              Showing <strong className="text-white">{visibleLimit}</strong> of{' '}
              <strong className="text-white">{filteredArticles.length}</strong> articles in this sub-library
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVisibleLimit((v) => v + 150)}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer transition"
              >
                Load Next 150
              </button>
              <button
                type="button"
                onClick={() => setVisibleLimit(filteredArticles.length)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer transition"
              >
                Show All ({filteredArticles.length})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Duplicate Review Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">Duplicate Clusters Resolution</h3>
              </div>
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <p className="text-xs text-slate-300">
                PRISMA 2020 requires deduplicating records imported from Scopus, Web of Science, IEEE Xplore, and other databases while recording the deduplication method.
              </p>

              <div className="space-y-4">
                {duplicateClusters.map((cluster, idx) => (
                  <div key={idx} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                    <div className="border-b border-slate-800 pb-2">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                        Master Record ({cluster.original.sourceDatabase})
                      </span>
                      <h4 className="font-bold text-white text-xs">{cluster.original.title}</h4>
                      <p className="text-[11px] text-slate-400">
                        {cluster.original.authors.join(', ')} ({cluster.original.year}) · {cluster.original.doi}
                      </p>
                    </div>

                    <div className="space-y-2 pl-3 border-l-2 border-amber-600">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                        Duplicate Imports to Merge ({cluster.duplicates.length})
                      </span>
                      {cluster.duplicates.map((dup) => (
                        <div key={dup.id} className="text-xs text-slate-300">
                          <p className="font-semibold">{dup.title}</p>
                          <p className="text-[11px] text-slate-500">
                            Source: {dup.sourceDatabase} · DOI: {dup.doi || 'None'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex justify-between items-center">
              <span className="text-xs text-slate-400">{totalDuplicatesCount} records will be marked as duplicate</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDuplicateModal(false)}
                  className="px-4 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAutoResolveDuplicates}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow-sm"
                >
                  Merge All Duplicates
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* High-Throughput Deterministic Batch Screener & PRISMA Sync Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Fast Batch Screener (Deterministic High-Throughput Engine)
                  </h3>
                  <p className="text-xs text-slate-400">
                    SHA-256 fingerprint-locked reproducibility · Manual override protection · Synchronized with PRISMA 2020
                  </p>
                </div>
              </div>
              {!isBatchScreening && (
                <button
                  onClick={() => {
                    setProposedReevaluations(null);
                    setShowBatchModal(false);
                  }}
                  className="text-slate-400 hover:text-white text-lg cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <ModuleWorkbenchControls
              project={project}
              moduleId="batch_screener"
              moduleLabel="Fast Batch Screener"
              autoSaveStatus={autoSaveStatus}
              compact
              resetFieldsLabel="Reset Screening Decisions -> Unscreened"
              deleteModes={['excluded', 'uncertain', 'unscreened']}
              onResetModule={onResetWorkbenchModule}
              onResetLocalView={() => {
                setProposedReevaluations(null);
                setBatchStats({
                  processed: authoritativeLiveCounts.screenedRecords,
                  total: authoritativeLiveCounts.uniqueRecords,
                  included: authoritativeLiveCounts.includedStudies,
                  excluded:
                    authoritativeLiveCounts.excludedAtTitleAbstract +
                    authoritativeLiveCounts.excludedAtFullText +
                    authoritativeLiveCounts.reportsNotRetrieved,
                  uncertain: authoritativeLiveCounts.uncertainRecords,
                  speed: 0,
                  elapsedSeconds: 0,
                });
              }}
              onAddDataFiles={onDirectAddDataFiles}
              onOpenBulkImporter={() => {
                setShowBatchModal(false);
                onOpenAddModal();
              }}
              onRescanQueryQA={onRescanWithQueryQA}
              onDeleteQaEntry={onDeleteQaEntry}
            />

            {batchActionBanner && (
              <div
                className={`px-3.5 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 ${
                  batchActionBanner.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                    : batchActionBanner.type === 'warning'
                    ? 'bg-amber-950/40 border-amber-700/60 text-amber-200'
                    : 'bg-rose-950/40 border-rose-700/60 text-rose-200'
                }`}
              >
                <span>{batchActionBanner.text}</span>
                <button
                  type="button"
                  onClick={() => setBatchActionBanner(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Mode B Confirmation Dialog when finalized decisions would change */}
            {proposedReevaluations && proposedReevaluations.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/70 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-amber-200 text-sm flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>
                        Confirm New Evaluation (Mode B): {proposedReevaluations.length} Finalized Decision(s) Would Change
                      </span>
                    </h4>
                    <p className="text-[11px] text-amber-100/80 mt-0.5">
                      Existing finalized decisions and audit history are preserved until you explicitly confirm. Manual human overrides remain protected.
                    </p>
                  </div>
                </div>

                <div className="max-h-40 overflow-y-auto border border-amber-800/50 rounded-lg bg-slate-950/80 divide-y divide-slate-800/70">
                  {proposedReevaluations.slice(0, 25).map((item) => (
                    <div key={item.recordId} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white truncate">{item.title}</div>
                        <div className="font-mono text-[10px] text-slate-400">{item.recordId}</div>
                      </div>
                      <div className="font-mono text-[11px] shrink-0">
                        <span className="text-amber-300">{item.previousDecision}</span>
                        <span className="mx-1.5 text-slate-500">→</span>
                        <span className="text-emerald-300">{item.proposedDecision}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setProposedReevaluations(null)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
                  >
                    Keep Existing Decisions
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExecuteBatchScreen(subLibraryArticles, 'full_library', true)}
                    className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer"
                  >
                    Confirm &amp; Apply New Evaluation Run
                  </button>
                </div>
              </div>
            )}

            {/* Progress Bar & Live Stats when screening */}
            {isBatchScreening && (
              <div className="p-4 bg-slate-950 rounded-xl border border-teal-800/60 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-teal-300 flex items-center gap-1.5">
                    <Zap className="w-4 h-4" />
                    Deterministic Batch Processing (Locked Ordering + Checkpoints)...
                  </span>
                  <span className="font-mono text-white font-bold tabular-nums">{batchProgress}%</span>
                </div>

                <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full transition-all duration-150"
                    style={{ width: `${batchProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Screening Consistency & PRISMA 2020 Synchronization Dashboard */}
            <ScreeningConsistencyPanel
              project={project}
              runs={serverRuns || savedBatchState?.runs}
              serverReport={serverConsistencyReport}
              onReconcile={handleReconcileScreening}
              onSelectArticleForScreening={(artId) => {
                setShowBatchModal(false);
                onSelectArticleForScreening(artId);
              }}
              isBusy={isReconciling || isBatchScreening}
            />

            {/* Controls & Actions */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-slate-400 inline-flex items-center gap-1.5">
                  <span>Batch chunk size:</span>
                  <select
                    value={batchSizeSetting}
                    disabled={isBatchScreening}
                    onChange={(e) => setBatchSizeSetting(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono text-[11px]"
                  >
                    <option value={32}>32</option>
                    <option value={64}>64</option>
                    <option value={150}>150</option>
                    <option value={256}>256</option>
                  </select>
                </label>
                <button
                  type="button"
                  disabled={isBatchScreening}
                  onClick={() => handleStressTest10k(10000)}
                  className="px-3 py-2 text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xl disabled:opacity-50 transition whitespace-nowrap shrink-0 cursor-pointer"
                  title="Benchmark test: generate and screen 10,000 articles deterministically"
                >
                  ⚡ Benchmark 10,000 Articles
                </button>
                <button
                  type="button"
                  disabled={isBatchScreening}
                  onClick={() => handleStressTest10k(1000)}
                  className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl disabled:opacity-50 transition whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Screen 1,000 Sample Set
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isBatchScreening}
                  onClick={() => {
                    setProposedReevaluations(null);
                    setShowBatchModal(false);
                  }}
                  className="px-4 py-2 text-xs rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={isBatchScreening || authoritativeLiveCounts.uniqueRecords === 0}
                  onClick={() => handleExecuteBatchScreen(subLibraryArticles, 'unscreened_only', false)}
                  className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md disabled:opacity-40 transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  title="Mode A: Reuses unchanged decisions deterministically and screens only pending or modified records"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>
                    Mode A: Resume / Incremental ({authoritativeLiveCounts.pendingRecords} Pending)
                  </span>
                </button>
                <button
                  type="button"
                  disabled={isBatchScreening || authoritativeLiveCounts.uniqueRecords === 0}
                  onClick={() => handleExecuteBatchScreen(subLibraryArticles, 'full_library', false)}
                  className="px-5 py-2 text-xs font-bold bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-xl shadow-md disabled:opacity-50 transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  title="Mode B: Creates a new evaluation run and previews diffs before replacing finalized decisions"
                >
                  <Zap className="w-4 h-4" />
                  <span>Mode B: New Evaluation / Re-screen</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Folder Bulk Permanent Remover & Save Changes Modal */}
      {showBulkRemoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-rose-800/60 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Bulk Permanent Remover &amp; Save Changes
                  </h3>
                  <p className="text-xs text-slate-400">
                    Permanently erase articles from an isolated Review Title folder and save disk state
                  </p>
                </div>
              </div>
              {!isProcessingFolderAction && (
                <button
                  type="button"
                  onClick={() => setShowBulkRemoveModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Target Folder Selector */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  1. Select Target Sub-Library Folder
                </label>
                <select
                  value={targetBulkProject.id}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setBulkRemoveTargetProjectId(nextId);
                    if (nextId !== project.id && bulkRemoveMode === 'ids') {
                      setBulkRemoveMode('excluded');
                    }
                  }}
                  disabled={isProcessingFolderAction}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-rose-500"
                >
                  {(allProjects.length > 0 ? allProjects : [project]).map((proj) => {
                    const count = (proj.articles || []).filter(
                      (a) => !a.projectId || a.projectId === proj.id
                    ).length;
                    return (
                      <option key={proj.id} value={proj.id}>
                        {proj.title || 'Untitled Review'} ({count} articles) — /{proj.databaseFolderName || proj.id}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] font-mono text-teal-400">
                  Folder Path: {targetBulkProject.databaseFolderPath || `database/reviews/${targetBulkProject.id}`}
                </p>
              </div>

              {/* Removal Scope Options */}
              <div className="space-y-2">
                <label className="text-slate-300 font-semibold block">
                  2. Choose What to Permanently Remove from This Folder
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      id: 'ids' as BulkRemoveMode,
                      label: 'Selected Articles (Active Folder)',
                      count: targetFolderStats.selected,
                      disabled: targetBulkProject.id !== project.id || targetFolderStats.selected === 0,
                      hint: targetBulkProject.id !== project.id ? 'Switch to folder to use checkboxes' : 'Checkbox-selected records',
                    },
                    {
                      id: 'excluded' as BulkRemoveMode,
                      label: 'All Excluded Articles',
                      count: targetFolderStats.excluded,
                      disabled: targetFolderStats.excluded === 0,
                      hint: 'Articles marked EXCLUDED',
                    },
                    {
                      id: 'duplicates' as BulkRemoveMode,
                      label: 'All Duplicate Records',
                      count: targetFolderStats.duplicates,
                      disabled: targetFolderStats.duplicates === 0,
                      hint: 'Records flagged as duplicate',
                    },
                    {
                      id: 'uncertain' as BulkRemoveMode,
                      label: 'All Uncertain Articles',
                      count: targetFolderStats.uncertain,
                      disabled: targetFolderStats.uncertain === 0,
                      hint: 'Articles marked UNCERTAIN',
                    },
                    {
                      id: 'unscreened' as BulkRemoveMode,
                      label: 'All Unscreened Articles',
                      count: targetFolderStats.unscreened,
                      disabled: targetFolderStats.unscreened === 0,
                      hint: 'Pending unscreened imports',
                    },
                    {
                      id: 'all' as BulkRemoveMode,
                      label: 'Empty Entire Folder (All Articles)',
                      count: targetFolderStats.total,
                      disabled: targetFolderStats.total === 0,
                      hint: 'Keeps Review Title & PICOC rules',
                    },
                  ].map((opt) => {
                    const active = bulkRemoveMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={opt.disabled || isProcessingFolderAction}
                        onClick={() => setBulkRemoveMode(opt.id)}
                        className={`p-3 rounded-xl border text-left transition flex items-start justify-between gap-2 ${
                          active
                            ? 'bg-rose-950/50 border-rose-500 text-white ring-1 ring-rose-500/40'
                            : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                        } disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
                      >
                        <div>
                          <div className="font-semibold text-xs">{opt.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{opt.hint}</div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold shrink-0 ${
                            active ? 'bg-rose-600 text-white' : 'bg-slate-900 text-slate-300'
                          }`}
                        >
                          {opt.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {onDeleteProjectFolder && (allProjects.length > 1) && (
                  <button
                    type="button"
                    disabled={isProcessingFolderAction}
                    onClick={() => setBulkRemoveMode('delete_folder')}
                    className={`w-full p-3 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                      bulkRemoveMode === 'delete_folder'
                        ? 'bg-rose-950/80 border-rose-500 text-white ring-1 ring-rose-500/50'
                        : 'bg-slate-950/60 border-rose-900/40 text-rose-300 hover:border-rose-700'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-xs">Delete Entire Review Title Folder from Disk</div>
                      <div className="text-[10px] text-rose-300/70 mt-0.5">
                        Permanently removes {targetBulkProject.databaseFolderPath || targetBulkProject.id} (project.json, articles.json, sources_manifest.json)
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-rose-900/70 text-rose-200 shrink-0">
                      Entire Folder
                    </span>
                  </button>
                )}
              </div>

              {/* Permanent Deletion Warning Preview */}
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/70 flex items-start gap-2.5 text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    {bulkRemoveMode === 'delete_folder'
                      ? `Permanent Folder Deletion: "${targetBulkProject.title || targetBulkProject.id}" (${targetFolderStats.total} articles) will be erased from disk.`
                      : `${pendingRemovalCount} article(s) will be permanently removed from "${targetBulkProject.title || targetBulkProject.id}".`}
                  </p>
                  <p className="text-[11px] text-rose-200/80">
                    Changes are immediately saved to <span className="font-mono">articles.json</span> and{' '}
                    <span className="font-mono">sources_manifest.json</span> inside{' '}
                    <span className="font-mono">
                      {targetBulkProject.databaseFolderPath || `database/reviews/${targetBulkProject.id}`}
                    </span>
                    . Other review folders will not be affected.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                Remaining after removal:{' '}
                <strong className="text-white font-mono">
                  {bulkRemoveMode === 'delete_folder'
                    ? '0 (folder deleted)'
                    : Math.max(0, targetFolderStats.total - pendingRemovalCount)}
                </strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isProcessingFolderAction}
                  onClick={() => setShowBulkRemoveModal(false)}
                  className="px-4 py-2 text-xs rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    isProcessingFolderAction ||
                    (bulkRemoveMode !== 'delete_folder' && pendingRemovalCount === 0)
                  }
                  onClick={handleConfirmBulkPermanentRemove}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {isProcessingFolderAction
                      ? 'Removing & Saving...'
                      : bulkRemoveMode === 'delete_folder'
                      ? 'Delete Folder & Save Change'
                      : `Permanently Remove (${pendingRemovalCount}) & Save Change`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen NotebookLM Exporter & Grounded Research Chat */}
      <NotebookStudioModal
        isOpen={showNotebookStudio}
        onClose={() => setShowNotebookStudio(false)}
        project={project}
        articles={subLibraryArticles}
        preselectedIds={selectedIds}
        onUpdateArticles={onUpdateArticles}
      />
    </div>
  );
};
