import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Article,
  OnlineSearchSession,
  PaperAccessStatus,
  ReviewProject,
} from '../types';
import { apiService } from '../services/apiService';
import { classifyPaperType, detectArticleSourceDatabase } from '../utils/slrDetectionEngine';
import {
  isPlaceholderVenue,
  sanitizeAuthorsList,
  validateArticleMetadata,
} from '../utils/citationFormatter';
import {
  AlertCircle,
  BookOpen,
  Building2,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  GitFork,
  Globe,
  History,
  Link2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

export type OnlineSearchDatabaseOption =
  | 'all'
  | 'google_scholar'
  | 'openalex'
  | 'crossref'
  | 'pubmed'
  | 'europepmc'
  | 'doaj'
  | 'semantic_scholar'
  | 'arxiv'
  | 'custom';

export type OnlineSearchFieldOption =
  | 'all_fields'
  | 'keywords'
  | 'title'
  | 'doi'
  | 'abstract'
  | 'author'
  | 'boolean'
  | 'related';

interface OnlineResultItem {
  id: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  title: string;
  authors: string[];
  year: number;
  journal: string;
  publisher?: string;
  abstract: string;
  sourceDatabase: string;
  citationsCount?: number;
  isOpenAccess?: boolean;
  openAccessUrl?: string;
  pdfUrl?: string;
  url?: string;
  accessStatus: PaperAccessStatus;
  accessNotes?: string;
  institutionConfirmed?: boolean;
  relatedNote?: string;
  isCrossDbDuplicate?: boolean;
  duplicateMatchedDatabases?: string[];
  duplicateNote?: string;
}

interface StagedSelectionEntry {
  item: OnlineResultItem;
  batchId: string;
  queryUsed: string;
}

interface FastOnlineSearchPanelProps {
  project?: ReviewProject;
  targetProjectId?: string;
  onAddArticles: (articles: Article[], options?: { keepOpen?: boolean; targetProjectId?: string }) => void;
  onSyncProjectAfterImport?: (
    projectId: string,
    articles: Article[],
    sessions: OnlineSearchSession[]
  ) => void;
  onRecordSearchHistory?: (query: string, resultsCount: number) => void;
  onClose?: () => void;
  compact?: boolean;
}

const makeUniqueId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const ONLINE_DATABASE_OPTIONS: { value: OnlineSearchDatabaseOption; label: string; short: string }[] = [
  {
    value: 'all',
    label: 'All Online Databases (Parallel Search + Cross-DB Duplicate Detection)',
    short: 'All Online DBs',
  },
  {
    value: 'google_scholar',
    label: 'Google Scholar (Scholarly Citation & Multi-Type Index)',
    short: 'Google Scholar',
  },
  {
    value: 'pubmed',
    label: 'PubMed / MEDLINE (NCBI Live E-utilities)',
    short: 'PubMed',
  },
  {
    value: 'europepmc',
    label: 'Europe PMC (Open-Access Biomedical & Life Sciences)',
    short: 'Europe PMC',
  },
  {
    value: 'crossref',
    label: 'Crossref (Global DOI & Publisher Registry)',
    short: 'Crossref',
  },
  {
    value: 'openalex',
    label: 'OpenAlex / OpenAIRE Research Graph',
    short: 'OpenAlex',
  },
  {
    value: 'doaj',
    label: 'DOAJ (Directory of Open Access Journals)',
    short: 'DOAJ',
  },
  {
    value: 'semantic_scholar',
    label: 'Semantic Scholar (AI Citation Graph)',
    short: 'Semantic Scholar',
  },
  {
    value: 'arxiv',
    label: 'arXiv (Open-Access Preprints & Direct PDFs)',
    short: 'arXiv',
  },
  {
    value: 'custom',
    label: 'Write Custom Database Name (Scopus, Web of Science, ScienceDirect, IEEE Xplore, Springer, Wiley, MDPI...)',
    short: 'Custom DB',
  },
];

const SUGGESTED_CUSTOM_DATABASES = [
  'Scopus',
  'Web of Science',
  'ScienceDirect',
  'IEEE Xplore',
  'Springer',
  'Wiley',
  'MDPI',
  'CAB Abstracts',
  'AGRIS',
  'CORE',
  'ERIC',
  'DOAJ',
];

export const SEARCH_BY_OPTIONS: { value: OnlineSearchFieldOption; label: string; placeholder: string }[] = [
  {
    value: 'all_fields',
    label: 'Keywords & All Fields',
    placeholder: 'Search keywords across all online databases (e.g. UAV crop water stress thermal)...',
  },
  {
    value: 'keywords',
    label: 'Topic Keywords',
    placeholder: 'Enter topic keywords (e.g. gully erosion susceptibility machine learning)...',
  },
  {
    value: 'title',
    label: 'Article Title',
    placeholder: 'Search by exact or partial paper title...',
  },
  {
    value: 'doi',
    label: 'DOI Identifier',
    placeholder: 'Enter DOI (e.g. 10.1016/j.compag.2023.107892 or https://doi.org/...)',
  },
  {
    value: 'abstract',
    label: 'Abstract Text',
    placeholder: 'Search terms specifically within article abstracts...',
  },
  {
    value: 'author',
    label: 'Author Name(s)',
    placeholder: 'Search by author surname or full name (e.g. Zhang, Smith)...',
  },
  {
    value: 'boolean',
    label: 'Boolean Query (AND / OR)',
    placeholder: 'e.g. ("UAV" OR "drone") AND ("crop stress" OR "water stress")',
  },
  {
    value: 'related',
    label: 'Related Articles (Citation & Topic Graph)',
    placeholder: 'Enter seed paper title, topic, or DOI to discover related articles...',
  },
];

export const FastOnlineSearchPanel: React.FC<FastOnlineSearchPanelProps> = ({
  project,
  targetProjectId,
  onAddArticles,
  onSyncProjectAfterImport,
  onRecordSearchHistory,
  onClose,
  compact = false,
}) => {
  const [query, setQuery] = useState('');
  const [database, setDatabase] = useState<string>('all');
  const [customDbInput, setCustomDbInput] = useState('');
  const [savedCustomDatabases, setSavedCustomDatabases] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('slr_custom_database_sources');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [showWriteDbInput, setShowWriteDbInput] = useState(false);
  const [searchBy, setSearchBy] = useState<OnlineSearchFieldOption>('all_fields');
  // 0 means "All Available (No Limit)" -> fetches up to 1,000 per batch with instant "Fetch More / All Remaining" pagination
  const [rowsLimit, setRowsLimit] = useState<number>(0);
  // Strict per-database default (false) so each database returns its own distinct result set
  const [broadWebSearch, setBroadWebSearch] = useState<boolean>(false);
  // Retain checked selections across multiple searches before final checkbox confirmation
  const [retainCheckedAcrossSearches, setRetainCheckedAcrossSearches] = useState<boolean>(true);
  const [stagedCheckedMap, setStagedCheckedMap] = useState<Record<string, StagedSelectionEntry>>({});
  const masterCheckboxRef = useRef<HTMLInputElement | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [results, setResults] = useState<OnlineResultItem[]>([]);
  const [visibleDisplayLimit, setVisibleDisplayLimit] = useState<number>(100);
  const [accessFilter, setAccessFilter] = useState<
    'all' | 'downloadable' | 'needs_institution_confirmation' | 'not_accessible'
  >('all');
  const [errorMsg, setErrorMsg] = useState('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string>('');
  const [activeSearchMeta, setActiveSearchMeta] = useState<{
    apiDb: string;
    customName: string;
    query: string;
    searchBy: OnlineSearchFieldOption;
    databaseLabel: string;
  } | null>(null);
  const [searchMeta, setSearchMeta] = useState<{
    total: number;
    totalAvailable: number;
    uniqueCount: number;
    crossDbDuplicateCount: number;
    hasMore: boolean;
    nextOffset: number;
    elapsedMs?: number;
    cached?: boolean;
    sourceStats?: Record<string, number>;
    totalHitsBySource?: Record<string, number>;
  } | null>(null);
  const [searchSessions, setSearchSessions] = useState<OnlineSearchSession[]>(
    () => project?.onlineSearchSessions || []
  );
  const [alsoLogToHistory, setAlsoLogToHistory] = useState(true);
  const [fetchingItemId, setFetchingItemId] = useState<string | null>(null);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [batchImportProgress, setBatchImportProgress] = useState<{
    done: number;
    total: number;
    mode: 'metadata' | 'verify_pdf';
  } | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());

  const effectiveProjectId = targetProjectId || project?.id || '';

  useEffect(() => {
    setSearchSessions(project?.onlineSearchSessions || []);
    if (!effectiveProjectId) return;
    apiService
      .fetchOnlineSearchSessions(effectiveProjectId)
      .then((res) => {
        if (Array.isArray(res.sessions)) {
          setSearchSessions(res.sessions);
        }
      })
      .catch(() => {});
  }, [effectiveProjectId, project?.onlineSearchSessions]);

  const stagedEntries = useMemo(() => Object.values(stagedCheckedMap), [stagedCheckedMap]);
  const stagedIdsSet = useMemo(() => new Set(Object.keys(stagedCheckedMap)), [stagedCheckedMap]);
  const currentSearchCheckedCount = useMemo(
    () => results.filter((r) => stagedIdsSet.has(r.id)).length,
    [results, stagedIdsSet]
  );

  const activeFieldMeta = useMemo(
    () => SEARCH_BY_OPTIONS.find((o) => o.value === searchBy) || SEARCH_BY_OPTIONS[0],
    [searchBy]
  );

  // Map existing library articles by DOI & normalized title to spot cross-DB duplicates immediately
  const existingLibraryByKey = useMemo(() => {
    const map = new Map<string, Article>();
    (project?.articles || []).forEach((a) => {
      if (a.doi) {
        const dk = `doi:${a.doi.toLowerCase().trim()}`;
        if (!map.has(dk)) map.set(dk, a);
      }
      if (a.title) {
        const tk = `title:${a.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        if (tk.length > 18 && !map.has(tk)) map.set(tk, a);
      }
    });
    return map;
  }, [project?.articles]);

  const findExistingMatch = (item: OnlineResultItem): Article | undefined => {
    const doiKey = item.doi ? `doi:${item.doi.toLowerCase().trim()}` : '';
    const titleKey = `title:${(item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    return (
      (doiKey ? existingLibraryByKey.get(doiKey) : undefined) ||
      (titleKey.length > 18 ? existingLibraryByKey.get(titleKey) : undefined)
    );
  };

  const isAlreadyInLibrary = (item: OnlineResultItem) => {
    const doiKey = item.doi ? `doi:${item.doi.toLowerCase().trim()}` : '';
    const titleKey = `title:${(item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    return (
      Boolean(findExistingMatch(item)) ||
      (doiKey && addedKeys.has(doiKey)) ||
      (titleKey.length > 18 && addedKeys.has(titleKey))
    );
  };

  const saveCustomDatabaseOption = (name: string) => {
    const cleaned = name.trim();
    if (!cleaned) return '';
    const updated = Array.from(new Set([cleaned, ...savedCustomDatabases])).slice(0, 20);
    setSavedCustomDatabases(updated);
    try {
      localStorage.setItem('slr_custom_database_sources', JSON.stringify(updated));
    } catch {}
    setDatabase(`custom:${cleaned}`);
    setCustomDbInput('');
    setShowWriteDbInput(false);
    return cleaned;
  };

  const resolvedCustomDbLabel = useMemo(() => {
    if (database.startsWith('custom:')) return database.slice('custom:'.length).trim();
    if (database === 'custom') return customDbInput.trim();
    if (database === 'google_scholar') return 'Google Scholar';
    return '';
  }, [database, customDbInput]);

  const sendChunkedToLibrary = (articles: Article[]) => {
    const targetId = targetProjectId || project?.id;
    const chunkSize = 250;
    for (let i = 0; i < articles.length; i += chunkSize) {
      onAddArticles(articles.slice(i, i + chunkSize), {
        keepOpen: true,
        targetProjectId: targetId,
      });
    }
  };

  const runSearch = async (
    overrideQuery?: string,
    overrideDb?: string,
    overrideSearchBy?: OnlineSearchFieldOption
  ) => {
    const q = (overrideQuery ?? query).trim();
    const rawDb = overrideDb ?? database;
    const sb = overrideSearchBy ?? searchBy;
    if (!q) return;

    let apiDb = rawDb;
    let customName = '';
    if (rawDb.startsWith('custom:')) {
      customName = rawDb.slice('custom:'.length).trim();
      apiDb = 'custom';
    } else if (rawDb === 'custom') {
      customName = customDbInput.trim();
      if (customName) {
        saveCustomDatabaseOption(customName);
      }
      apiDb = 'custom';
    }

    const dbLabel =
      customName ||
      ONLINE_DATABASE_OPTIONS.find((o) => o.value === rawDb)?.short ||
      rawDb;
    const batchId = makeUniqueId('search-batch');
    setActiveBatchId(batchId);
    setActiveSearchMeta({
      apiDb,
      customName,
      query: q,
      searchBy: sb,
      databaseLabel: dbLabel,
    });

    setIsSearching(true);
    setErrorMsg('');
    setStatusBanner(null);
    setVisibleDisplayLimit(100);

    try {
      const resp = await apiService.searchOnlineDatabasesRich({
        query: q,
        database: apiDb,
        customDatabase: customName || undefined,
        searchBy: sb,
        rows: rowsLimit === 0 ? 1000 : rowsLimit,
        offset: 0,
        fetchAll: rowsLimit === 0,
        broadWebSearch,
        includeRelated: sb === 'related' || broadWebSearch,
        preserveCrossDbDuplicates: true,
      });

      const normalized: OnlineResultItem[] = (resp.items || []).map((it: any) => ({
        ...it,
        accessStatus:
          it.accessStatus ||
          (it.pdfUrl || it.openAccessUrl ? 'downloadable' : 'needs_institution_confirmation'),
      }));

      setResults(normalized);
      setAccessFilter('all');
      if (!retainCheckedAcrossSearches) {
        setStagedCheckedMap({});
      }
      const totalAvail = resp.totalAvailable ?? normalized.length;
      const crossDupes = resp.crossDbDuplicateCount ?? normalized.filter((r) => r.isCrossDbDuplicate).length;
      const withinUnique = resp.uniqueCount ?? Math.max(0, normalized.length - crossDupes);
      setSearchMeta({
        total: normalized.length,
        totalAvailable: totalAvail,
        uniqueCount: withinUnique,
        crossDbDuplicateCount: crossDupes,
        hasMore: Boolean(resp.hasMore),
        nextOffset: resp.nextOffset ?? normalized.length,
        elapsedMs: resp.elapsedMs,
        cached: resp.cached,
        sourceStats: resp.sourceStats || {},
        totalHitsBySource: resp.totalHitsBySource || {},
      });

      const nowIso = new Date().toISOString();
      const sessionEntry: OnlineSearchSession = {
        id: batchId,
        database: apiDb,
        databaseLabel: dbLabel,
        query: q,
        searchBy: sb,
        externalReportedCount: totalAvail,
        actuallyRetrievedCount: normalized.length,
        withinSessionUniqueCount: withinUnique,
        withinSessionDuplicateCount: crossDupes,
        successfullySavedCount: 0,
        existingLibraryMatchedCount: 0,
        duplicateEventsRemovedCount: 0,
        hasMore: Boolean(resp.hasMore),
        nextOffset: resp.nextOffset ?? normalized.length,
        sourceStats: resp.sourceStats || {},
        totalHitsBySource: resp.totalHitsBySource || {},
        retrievedAt: nowIso,
        updatedAt: nowIso,
        importEvents: [],
      };

      if (normalized.length === 0) {
        setErrorMsg(`No papers found in "${dbLabel}" for that query. Try broader keywords or another database.`);
      } else {
        if (alsoLogToHistory && onRecordSearchHistory) {
          onRecordSearchHistory(`[Online:${dbLabel}/${sb}] ${q}`, normalized.length);
        }
        setStatusBanner(
          `Loaded ${normalized.length} papers from ${dbLabel} (${totalAvail.toLocaleString()} total reported in DB). Select checkboxes below or Fetch All Remaining, then confirm to record into Article Library.`
        );
      }

      setSearchSessions((prev) => [sessionEntry, ...prev.filter((s) => s.id !== batchId).slice(0, 59)]);
      if (effectiveProjectId) {
        apiService
          .saveOnlineSearchSession(effectiveProjectId, sessionEntry)
          .then((saved) => {
            if (Array.isArray(saved.sessions)) {
              setSearchSessions(saved.sessions);
              onSyncProjectAfterImport?.(
                effectiveProjectId,
                project?.articles || [],
                saved.sessions
              );
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Online search failed. Check connection and try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleDeleteSearchSession = async (sessionId: string) => {
    const remainingLocal = searchSessions.filter((s) => s.id !== sessionId);
    setSearchSessions(remainingLocal);
    if (activeBatchId === sessionId) {
      setActiveBatchId('');
    }
    if (effectiveProjectId) {
      try {
        const res = await apiService.deleteOnlineSearchSession(effectiveProjectId, sessionId);
        const nextSessions = Array.isArray(res.sessions) ? res.sessions : remainingLocal;
        setSearchSessions(nextSessions);
        onSyncProjectAfterImport?.(
          effectiveProjectId,
          project?.articles || [],
          nextSessions
        );
      } catch {
        onSyncProjectAfterImport?.(
          effectiveProjectId,
          project?.articles || [],
          remainingLocal
        );
      }
    }
    setStatusBanner('Deleted saved Separate Database Search record.');
  };

  const handleClearAllSearchSessions = async () => {
    setSearchSessions([]);
    setActiveBatchId('');
    if (effectiveProjectId) {
      try {
        const res = await apiService.clearOnlineSearchSessions(effectiveProjectId);
        const nextSessions = Array.isArray(res.sessions) ? res.sessions : [];
        setSearchSessions(nextSessions);
        onSyncProjectAfterImport?.(
          effectiveProjectId,
          project?.articles || [],
          nextSessions
        );
      } catch {
        onSyncProjectAfterImport?.(effectiveProjectId, project?.articles || [], []);
      }
    }
    setStatusBanner('Cleared all saved Separate Database Search records for this review.');
  };

  const handleLoadMoreResults = async (loadAllRemaining = false) => {
    if (!activeSearchMeta || !searchMeta?.hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    setErrorMsg('');
    try {
      let currentOffset = searchMeta.nextOffset;
      const accumulated: OnlineResultItem[] = [];
      let latestResp: any = null;
      const maxLoops = loadAllRemaining ? 25 : 1;

      for (let i = 0; i < maxLoops; i++) {
        const resp = await apiService.searchOnlineDatabasesRich({
          query: activeSearchMeta.query,
          database: activeSearchMeta.apiDb,
          customDatabase: activeSearchMeta.customName || undefined,
          searchBy: activeSearchMeta.searchBy,
          rows: 500,
          offset: currentOffset,
          fetchAll: false,
          broadWebSearch,
          includeRelated: activeSearchMeta.searchBy === 'related' || broadWebSearch,
          preserveCrossDbDuplicates: true,
        });
        latestResp = resp;
        const batch: OnlineResultItem[] = (resp.items || []).map((it: any) => ({
          ...it,
          accessStatus:
            it.accessStatus ||
            (it.pdfUrl || it.openAccessUrl ? 'downloadable' : 'needs_institution_confirmation'),
        }));
        accumulated.push(...batch);
        if (!resp.hasMore || batch.length === 0) break;
        currentOffset = resp.nextOffset ?? currentOffset + batch.length;
      }

      if (accumulated.length > 0) {
        const existingIds = new Set(results.map((r) => r.id));
        const uniqueNew = accumulated.filter((it) => !existingIds.has(it.id));
        const merged = [...results, ...uniqueNew];
        const mergedDupes = merged.filter((r) => r.isCrossDbDuplicate).length;
        const mergedUnique = Math.max(0, merged.length - mergedDupes);
        const nextTotalAvail = latestResp?.totalAvailable || searchMeta.totalAvailable;
        const nextHasMore = Boolean(latestResp?.hasMore);
        const nextOffset = latestResp?.nextOffset ?? searchMeta.nextOffset + uniqueNew.length;

        setResults(merged);
        setSearchMeta((prev) =>
          prev
            ? {
                ...prev,
                total: merged.length,
                totalAvailable: nextTotalAvail,
                crossDbDuplicateCount: mergedDupes,
                uniqueCount: mergedUnique,
                hasMore: nextHasMore,
                nextOffset,
              }
            : prev
        );

        const nowIso = new Date().toISOString();
        const existingSess = searchSessions.find((s) => s.id === activeBatchId);
        const updatedSession: OnlineSearchSession = existingSess
          ? {
              ...existingSess,
              externalReportedCount: nextTotalAvail,
              actuallyRetrievedCount: merged.length,
              withinSessionUniqueCount: mergedUnique,
              withinSessionDuplicateCount: mergedDupes,
              hasMore: nextHasMore,
              nextOffset,
              updatedAt: nowIso,
            }
          : {
              id: activeBatchId || makeUniqueId('search-batch'),
              database: activeSearchMeta.apiDb,
              databaseLabel: activeSearchMeta.databaseLabel,
              query: activeSearchMeta.query,
              searchBy: activeSearchMeta.searchBy,
              externalReportedCount: nextTotalAvail,
              actuallyRetrievedCount: merged.length,
              withinSessionUniqueCount: mergedUnique,
              withinSessionDuplicateCount: mergedDupes,
              successfullySavedCount: 0,
              existingLibraryMatchedCount: 0,
              duplicateEventsRemovedCount: 0,
              hasMore: nextHasMore,
              nextOffset,
              retrievedAt: nowIso,
              updatedAt: nowIso,
              importEvents: [],
            };

        setSearchSessions((prev) =>
          prev.some((s) => s.id === updatedSession.id)
            ? prev.map((s) => (s.id === updatedSession.id ? updatedSession : s))
            : [updatedSession, ...prev]
        );
        if (effectiveProjectId) {
          apiService
            .saveOnlineSearchSession(effectiveProjectId, updatedSession)
            .then((saved) => {
              if (Array.isArray(saved.sessions)) {
                setSearchSessions(saved.sessions);
              }
            })
            .catch(() => {});
        }
        setStatusBanner(
          `Loaded +${uniqueNew.length} additional papers from ${activeSearchMeta.databaseLabel} (total ${merged.length} retrieved).`
        );
      } else {
        setSearchMeta((prev) => (prev ? { ...prev, hasMore: false } : prev));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load additional results.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch();
  };

  const handleFindRelatedForPaper = (item: OnlineResultItem) => {
    const seed = item.doi ? item.doi : item.title;
    setQuery(seed);
    setSearchBy('related');
    void runSearch(seed, database, 'related');
  };

  const handleChangeResultAccessStatus = (
    itemId: string,
    nextStatus: PaperAccessStatus,
    extra?: { institutionConfirmed?: boolean; accessNotes?: string; pdfUrl?: string }
  ) => {
    setResults((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              accessStatus: nextStatus,
              institutionConfirmed:
                extra?.institutionConfirmed !== undefined ? extra.institutionConfirmed : it.institutionConfirmed,
              accessNotes: extra?.accessNotes !== undefined ? extra.accessNotes : it.accessNotes,
              pdfUrl: extra?.pdfUrl !== undefined ? extra.pdfUrl : it.pdfUrl,
            }
          : it
      )
    );
  };

  const buildArticleFromOnlineItem = (
    item: OnlineResultItem,
    extra?: { fullText?: string; pages?: { pageNumber: number; content: string }[]; resolvedPdfUrl?: string },
    batchIdOverride?: string,
    queryOverride?: string
  ): Article => {
    const detected = detectArticleSourceDatabase({
      id: item.id,
      title: item.title,
      authors: item.authors,
      year: item.year,
      journal: item.journal,
      abstract: item.abstract,
      doi: item.doi,
      url: item.url,
      openAccessUrl: item.openAccessUrl,
      publisher: item.publisher,
      sourceDatabase: item.sourceDatabase,
      screeningStage: 'title_abstract',
      decision: 'unscreened',
      evidenceCitations: [],
    });

    const resolvedPdf = extra?.resolvedPdfUrl || item.pdfUrl || item.openAccessUrl || '';
    const accessStatus = item.accessStatus;
    const isNotAccessible = accessStatus === 'not_accessible';
    const isAbstractOnly = accessStatus === 'abstract_only';

    const prismaFlags: string[] = [];
    if (isNotAccessible) prismaFlags.push('not_accessible');
    if (isAbstractOnly) prismaFlags.push('abstract_only');

    const cleanAuthors = sanitizeAuthorsList(item.authors || []);
    const cleanJournal = isPlaceholderVenue(item.journal) ? '' : item.journal || '';
    const nowIso = new Date().toISOString();

    const base: Article = {
      id: makeUniqueId('art-online'),
      projectId: targetProjectId || project?.id,
      intakeSource: 'online_db',
      importedAt: nowIso,
      title: item.title,
      authors: cleanAuthors,
      year: item.year || undefined,
      journal: cleanJournal,
      volume: (item as any).volume || undefined,
      issue: (item as any).issue || undefined,
      pagesStr: (item as any).pagesStr || undefined,
      publisher: item.publisher,
      doi: item.doi || undefined,
      abstract: item.abstract || 'Abstract retrieved from online bibliographic database.',
      fullText: extra?.fullText,
      pages:
        extra?.pages && extra.pages.length > 0
          ? extra.pages
          : item.abstract
          ? [{ pageNumber: 1, content: `Title: ${item.title}\n\nAbstract:\n${item.abstract}` }]
          : undefined,
      sourceDatabase:
        item.sourceDatabase || resolvedCustomDbLabel || detected.database || 'Crossref',
      url: item.url || (item.doi ? `https://doi.org/${item.doi}` : ''),
      openAccessUrl: item.openAccessUrl || resolvedPdf || undefined,
      pdfUrl: resolvedPdf || undefined,
      accessStatus,
      accessNotes: item.accessNotes,
      institutionConfirmed: Boolean(item.institutionConfirmed),
      retrievedAt: nowIso,
      citationsCount: item.citationsCount,
      isDuplicate: false,
      duplicateMatchedDatabases: item.duplicateMatchedDatabases,
      duplicateNote: item.duplicateNote,
      searchBatchId: batchIdOverride || activeBatchId || undefined,
      searchQueryUsed: queryOverride || activeSearchMeta?.query || query || undefined,
      screeningStage: 'title_abstract',
      decision: 'unscreened',
      evidenceCitations: [],
      prismaExclusionFlags: prismaFlags.length > 0 ? prismaFlags : undefined,
      screeningNotes:
        accessStatus === 'needs_institution_confirmation' && !item.institutionConfirmed
          ? 'PRISMA Retrieval Note: Institutional access confirmation pending to download full PDF.'
          : accessStatus === 'not_accessible'
          ? 'PRISMA Retrieval Note: Recorded as Not Accessible / Report Not Retrieved.'
          : undefined,
    };

    const pType = classifyPaperType(base);
    return {
      ...base,
      paperCategory: pType.category,
      paperSubType: pType.subType,
      citationVerificationStatus: validateArticleMetadata(base).verificationStatus,
    };
  };

  const markItemAdded = (item: OnlineResultItem) => {
    setAddedKeys((prev) => {
      const next = new Set(prev);
      if (item.doi) next.add(`doi:${item.doi.toLowerCase().trim()}`);
      if (item.title) next.add(`title:${item.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
      return next;
    });
  };

  // Direct PDF browser download via server proxy (avoids CORS issues and verifies %PDF)
  const handleDownloadPdfFile = async (item: OnlineResultItem) => {
    const candidate = item.pdfUrl || item.openAccessUrl;
    if (!candidate) {
      handleChangeResultAccessStatus(item.id, 'needs_institution_confirmation', {
        accessNotes: 'No open-access PDF URL indexed. Use publisher link or confirm institutional access.',
      });
      return;
    }

    setFetchingItemId(item.id);
    try {
      const proxyUrl = apiService.getProxyPdfDownloadUrl(candidate, item.title);
      const resp = await fetch(proxyUrl);
      const ctype = (resp.headers.get('content-type') || '').toLowerCase();
      if (resp.ok && ctype.includes('pdf')) {
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        const cleanName = item.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 55);
        link.download = `${cleanName || 'paper'}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
        handleChangeResultAccessStatus(item.id, 'downloadable', {
          accessNotes: 'Downloaded PDF file successfully.',
        });
        setStatusBanner(`Downloaded PDF for "${item.title.slice(0, 55)}..."`);
      } else {
        const errJson = await resp.json().catch(() => ({}));
        const nextStatus: PaperAccessStatus =
          errJson.accessStatus === 'not_accessible' ? 'not_accessible' : 'needs_institution_confirmation';
        handleChangeResultAccessStatus(item.id, nextStatus, {
          accessNotes: errJson.error || 'Direct PDF blocked; publisher/institutional access required.',
        });
        setStatusBanner(
          errJson.error ||
            'Publisher did not serve a direct PDF (requires institutional login). Status updated for PRISMA tracking.'
        );
      }
    } catch (err: any) {
      handleChangeResultAccessStatus(item.id, 'not_accessible', {
        accessNotes: err?.message || 'PDF download failed',
      });
    } finally {
      setFetchingItemId(null);
    }
  };

  // Verify accessibility / fetch full text + add single paper to library & PRISMA
  const handleAddSingleWithVerification = async (
    item: OnlineResultItem,
    forcedStatus?: PaperAccessStatus,
    tryFetchFullText: boolean = true
  ) => {
    setFetchingItemId(item.id);
    try {
      let currentItem = { ...item };
      let extractedFullText: string | undefined;
      let pages: { pageNumber: number; content: string }[] | undefined;
      let resolvedPdfUrl: string | undefined;

      if (forcedStatus) {
        currentItem = {
          ...currentItem,
          accessStatus: forcedStatus,
          accessNotes:
            forcedStatus === 'not_accessible'
              ? 'Recorded as Not Accessible / Report Not Retrieved per PRISMA 2020 guidelines.'
              : forcedStatus === 'needs_institution_confirmation'
              ? 'Recorded as Needs Institutional Confirmation for full-text retrieval.'
              : currentItem.accessNotes,
        };
      } else if (tryFetchFullText && (currentItem.pdfUrl || currentItem.openAccessUrl || currentItem.doi)) {
        const check = await apiService.verifyAndFetchPaperFullText({
          pdfUrl: currentItem.pdfUrl,
          openAccessUrl: currentItem.openAccessUrl,
          url: currentItem.url,
          doi: currentItem.doi,
          title: currentItem.title,
        });
        currentItem = {
          ...currentItem,
          accessStatus: check.accessStatus,
          accessNotes: check.reason || currentItem.accessNotes,
          pdfUrl: check.resolvedPdfUrl || currentItem.pdfUrl,
        };
        extractedFullText = check.extractedFullText;
        pages = check.pages;
        resolvedPdfUrl = check.resolvedPdfUrl;
      }

      handleChangeResultAccessStatus(item.id, currentItem.accessStatus, {
        accessNotes: currentItem.accessNotes,
        pdfUrl: currentItem.pdfUrl,
      });

      const art = buildArticleFromOnlineItem(currentItem, {
        fullText: extractedFullText,
        pages,
        resolvedPdfUrl,
      });

      if (effectiveProjectId) {
        try {
          const importRes = await apiService.importRetrievedArticles(effectiveProjectId, {
            sessionId: activeBatchId,
            mode: 'single',
            items: [art],
            batchId: activeBatchId,
            queryUsed: activeSearchMeta?.query || query || '',
            databaseLabel: currentItem.sourceDatabase || activeSearchMeta?.databaseLabel || '',
          });
          setSearchSessions(importRes.onlineSearchSessions || []);
          onSyncProjectAfterImport?.(
            effectiveProjectId,
            importRes.articles,
            importRes.onlineSearchSessions || []
          );
          markItemAdded(item);
          setStatusBanner(
            `Saved "${item.title.slice(0, 48)}..." into Article Library (Total Unique: ${importRes.counters.uniqueLibraryCount}).`
          );
          return;
        } catch {
          // Fallback to callback if backend partition not initialized
        }
      }

      onAddArticles([art], { keepOpen: true, targetProjectId: effectiveProjectId });
      markItemAdded(item);
      setStatusBanner(
        `Added "${item.title.slice(0, 48)}..." to Library [${currentItem.accessStatus.replace(/_/g, ' ')}].`
      );
    } finally {
      setFetchingItemId(null);
    }
  };

  const handleToggleItemSelection = (item: OnlineResultItem) => {
    setStagedCheckedMap((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = {
          item,
          batchId: activeBatchId,
          queryUsed: activeSearchMeta?.query || query || '',
        };
      }
      return next;
    });
  };

  const handleSelectItemsBatch = (targetList: OnlineResultItem[]) => {
    setStagedCheckedMap((prev) => {
      const next = { ...prev };
      for (const item of targetList) {
        next[item.id] = {
          item,
          batchId: activeBatchId,
          queryUsed: activeSearchMeta?.query || query || '',
        };
      }
      return next;
    });
  };

  const handleClearCurrentSearchSelection = () => {
    const currIds = new Set(results.map((r) => r.id));
    setStagedCheckedMap((prev) => {
      const next: Record<string, StagedSelectionEntry> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!currIds.has(k)) next[k] = v;
      }
      return next;
    });
  };

  // Direct bulk Add / Add & Extract checked selections via Workflow 3 Stage A Canonical Import
  const handleConfirmAndRecordStaged = async (fetchFullTextWherePossible: boolean) => {
    const entriesToRecord = stagedEntries;
    if (entriesToRecord.length === 0) return;

    const mode: 'metadata' | 'verify_pdf' = fetchFullTextWherePossible ? 'verify_pdf' : 'metadata';
    setIsBatchImporting(true);
    setBatchImportProgress({ done: 0, total: entriesToRecord.length, mode });
    try {
      const prepared: Article[] = [];

      if (fetchFullTextWherePossible) {
        const queue = [...entriesToRecord];
        let processedCount = 0;
        const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
          while (queue.length > 0) {
            const entry = queue.shift();
            if (!entry) break;
            const it = entry.item;
            let working = { ...it };
            let extractedFullText: string | undefined;
            let pages: { pageNumber: number; content: string }[] | undefined;
            let resolvedPdfUrl: string | undefined;

            if (it.pdfUrl || it.openAccessUrl || it.doi) {
              try {
                const check = await apiService.verifyAndFetchPaperFullText({
                  pdfUrl: it.pdfUrl,
                  openAccessUrl: it.openAccessUrl,
                  url: it.url,
                  doi: it.doi,
                  title: it.title,
                });
                working = {
                  ...working,
                  accessStatus: check.accessStatus,
                  accessNotes: check.reason || working.accessNotes,
                  pdfUrl: check.resolvedPdfUrl || working.pdfUrl,
                };
                extractedFullText = check.extractedFullText;
                pages = check.pages;
                resolvedPdfUrl = check.resolvedPdfUrl;
                handleChangeResultAccessStatus(it.id, working.accessStatus, {
                  accessNotes: working.accessNotes,
                  pdfUrl: working.pdfUrl,
                });
              } catch {
                // Keep metadata record even if remote PDF fetch/extraction fails
              }
            }

            prepared.push(
              buildArticleFromOnlineItem(
                working,
                {
                  fullText: extractedFullText,
                  pages,
                  resolvedPdfUrl,
                },
                entry.batchId,
                entry.queryUsed
              )
            );
            markItemAdded(it);
            processedCount += 1;
            setBatchImportProgress({ done: processedCount, total: entriesToRecord.length, mode });
          }
        });
        await Promise.all(workers);
      } else {
        for (const entry of entriesToRecord) {
          prepared.push(
            buildArticleFromOnlineItem(entry.item, undefined, entry.batchId, entry.queryUsed)
          );
          markItemAdded(entry.item);
        }
        setBatchImportProgress({ done: prepared.length, total: entriesToRecord.length, mode });
      }

      if (prepared.length > 0) {
        if (effectiveProjectId) {
          try {
            const CHUNK_SIZE = 250;
            let totalInserted = 0;
            let totalMatched = 0;
            let totalDupEvents = 0;
            let latestImportRes: Awaited<ReturnType<typeof apiService.importRetrievedArticles>> | null = null;

            for (let i = 0; i < prepared.length; i += CHUNK_SIZE) {
              const chunk = prepared.slice(i, i + CHUNK_SIZE);
              const importRes = await apiService.importRetrievedArticles(effectiveProjectId, {
                sessionId: activeBatchId || entriesToRecord[0]?.batchId || '',
                mode,
                items: chunk,
                batchId: activeBatchId,
                queryUsed: activeSearchMeta?.query || query || '',
                databaseLabel: activeSearchMeta?.databaseLabel || '',
              });
              latestImportRes = importRes;
              totalInserted += importRes.importSummary.uniqueInsertedCount;
              totalMatched += importRes.importSummary.existingMatchedCount;
              totalDupEvents += importRes.importSummary.duplicateEventsRemovedCount;
            }

            if (latestImportRes) {
              setSearchSessions(latestImportRes.onlineSearchSessions || []);
              onSyncProjectAfterImport?.(
                effectiveProjectId,
                latestImportRes.articles,
                latestImportRes.onlineSearchSessions || []
              );
              setStatusBanner(
                `Bulk Add Complete: ${totalInserted} new record(s) added, ${totalMatched} matched existing library, ${totalDupEvents} duplicate event(s) merged (Total Unique Library: ${latestImportRes.counters.uniqueLibraryCount}).`
              );
              setStagedCheckedMap({});
              return;
            }
          } catch {
            // Fall through to client handler if server folder endpoint unavailable
          }
        }

        sendChunkedToLibrary(prepared);
        const dlCount = prepared.filter((a) => a.accessStatus === 'downloadable').length;
        const instCount = prepared.filter((a) => a.accessStatus === 'needs_institution_confirmation').length;
        const notAccCount = prepared.filter(
          (a) => a.accessStatus === 'not_accessible' || a.accessStatus === 'abstract_only'
        ).length;
        setStatusBanner(
          `Added ${prepared.length} checked paper(s) to Article Library (${dlCount} Downloadable, ${instCount} Institutional Confirmation, ${notAccCount} Not Accessible / Abstract Only).`
        );
        setStagedCheckedMap({});
      }
    } finally {
      setIsBatchImporting(false);
      setBatchImportProgress(null);
    }
  };

  const accessCounts = useMemo(() => {
    return {
      all: results.length,
      downloadable: results.filter((r) => r.accessStatus === 'downloadable').length,
      needs_institution_confirmation: results.filter((r) => r.accessStatus === 'needs_institution_confirmation').length,
      not_accessible: results.filter((r) => r.accessStatus === 'not_accessible' || r.accessStatus === 'abstract_only').length,
    };
  }, [results]);

  const filteredResults = useMemo(() => {
    if (accessFilter === 'all') return results;
    if (accessFilter === 'not_accessible') {
      return results.filter((r) => r.accessStatus === 'not_accessible' || r.accessStatus === 'abstract_only');
    }
    return results.filter((r) => r.accessStatus === accessFilter);
  }, [results, accessFilter]);

  const unaddedFilteredResults = useMemo(
    () => filteredResults.filter((r) => !isAlreadyInLibrary(r)),
    [filteredResults, existingLibraryByKey, addedKeys]
  );

  const allFilteredChecked = useMemo(
    () => filteredResults.length > 0 && filteredResults.every((r) => stagedIdsSet.has(r.id)),
    [filteredResults, stagedIdsSet]
  );

  const someFilteredChecked = useMemo(
    () => filteredResults.some((r) => stagedIdsSet.has(r.id)),
    [filteredResults, stagedIdsSet]
  );

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = !allFilteredChecked && someFilteredChecked;
    }
  }, [allFilteredChecked, someFilteredChecked]);

  return (
    <div className="bg-slate-900 border border-teal-500/40 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-teal-600 to-indigo-600 text-white shrink-0 shadow-md">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
              <span>Fast Online Database Search, Paper Downloader &amp; PRISMA Retrieval Recorder</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-teal-500/15 text-teal-300 border border-teal-500/30">
                6+ Live Databases · Parallel
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Search by Keywords, Title, DOI, Abstract, Author, Boolean, or Related Articles. Download Open-Access PDFs or record Institutional Confirmation / Not Accessible status directly to PRISMA 2020.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition"
              title="Collapse fast search panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Fast Search Form: Database Dropdown + Search Method Selector + Query Input */}
      <form onSubmit={handleFormSubmit} className="space-y-2.5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
          {/* Database Source Dropdown (Optional Target Database + Google Scholar + Write Custom DB Name) */}
          <div className="lg:col-span-4 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Database Source (Optional)
              </label>
              <button
                type="button"
                onClick={() => setShowWriteDbInput((v) => !v)}
                className="text-[10px] font-semibold text-teal-400 hover:text-teal-300 cursor-pointer"
              >
                {showWriteDbInput || database === 'custom' ? 'Hide Custom Input' : '+ Write DB Name'}
              </button>
            </div>
            <select
              value={database}
              onChange={(e) => {
                const val = e.target.value;
                setDatabase(val);
                if (val === 'custom') {
                  setShowWriteDbInput(true);
                } else {
                  setShowWriteDbInput(false);
                }
              }}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-teal-500 cursor-pointer"
            >
              {ONLINE_DATABASE_OPTIONS.filter((o) => o.value !== 'custom').map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              {savedCustomDatabases.length > 0 && (
                <optgroup label="Custom Databases">
                  {savedCustomDatabases.map((cdb) => (
                    <option key={cdb} value={`custom:${cdb}`}>
                      {cdb} (Custom Database)
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="custom">Write Custom Database Name...</option>
            </select>

            {(showWriteDbInput || database === 'custom') && (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  list="slr-custom-db-suggestions"
                  value={customDbInput}
                  onChange={(e) => setCustomDbInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customDbInput.trim()) {
                      e.preventDefault();
                      saveCustomDatabaseOption(customDbInput);
                    }
                  }}
                  placeholder="Write database name (e.g. Scopus, Web of Science)..."
                  className="flex-1 bg-slate-950 border border-teal-600/60 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-400"
                />
                <datalist id="slr-custom-db-suggestions">
                  {SUGGESTED_CUSTOM_DATABASES.map((dbName) => (
                    <option key={dbName} value={dbName} />
                  ))}
                </datalist>
                <button
                  type="button"
                  disabled={!customDbInput.trim()}
                  onClick={() => saveCustomDatabaseOption(customDbInput)}
                  className="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer shrink-0"
                >
                  Add to List
                </button>
              </div>
            )}
          </div>

          {/* Search Method / Field Selector */}
          <div className="lg:col-span-3">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Search Method / Field
            </label>
            <select
              value={searchBy}
              onChange={(e) => setSearchBy(e.target.value as OnlineSearchFieldOption)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {SEARCH_BY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Query Input + Submit Button */}
          <div className="lg:col-span-5">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Search Query ({activeFieldMeta.label})
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={activeFieldMeta.placeholder}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-8 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-2 text-slate-500 hover:text-white p-0.5 cursor-pointer"
                    title="Clear query"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isSearching || !query.trim()}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-md cursor-pointer shrink-0 transition"
              >
                <Zap className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`} />
                <span>{isSearching ? 'Searching...' : 'Fast Search'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Protocol Quick-Fill Chips & Settings Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-400" /> Quick Seeds:
            </span>
            {project?.title && (
              <button
                type="button"
                onClick={() => {
                  const seed = project.title.split(':')[0].trim();
                  setQuery(seed);
                  setSearchBy('keywords');
                  void runSearch(seed, database, 'keywords');
                }}
                className="px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-indigo-300 border border-slate-800 cursor-pointer transition"
              >
                Review Topic
              </button>
            )}
            {project?.booleanQuery && (
              <button
                type="button"
                onClick={() => {
                  setQuery(project.booleanQuery);
                  setSearchBy('boolean');
                  void runSearch(project.booleanQuery, database, 'boolean');
                }}
                className="px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-teal-300 border border-slate-800 cursor-pointer transition"
              >
                Boolean Query
              </button>
            )}
            {(project?.picoc?.population || project?.picoc?.intervention) && (
              <button
                type="button"
                onClick={() => {
                  const picocTerms = `${project.picoc.population || ''} ${project.picoc.intervention || ''}`
                    .replace(/[^\w\s-]/g, ' ')
                    .split(/\s+/)
                    .filter((w) => w.length > 3)
                    .slice(0, 6)
                    .join(' ');
                  if (picocTerms) {
                    setQuery(picocTerms);
                    setSearchBy('keywords');
                    void runSearch(picocTerms, database, 'keywords');
                  }
                }}
                className="px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-emerald-300 border border-slate-800 cursor-pointer transition"
              >
                PICOC Keywords
              </button>
            )}
            <select
              value={rowsLimit}
              onChange={(e) => setRowsLimit(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2 py-0.5 text-[11px] cursor-pointer"
              title="Maximum results to fetch per search batch (0 = Fetch all available up to 1,000+ per batch with Load More)"
            >
              <option value={0}>All Available (No Limit)</option>
              <option value={100}>100 / Batch</option>
              <option value={250}>250 / Batch</option>
              <option value={500}>500 / Batch</option>
              <option value={1000}>1,000 / Batch</option>
            </select>
            {database === 'google_scholar' && query.trim() && (
              <a
                href={`https://scholar.google.com/scholar?q=${encodeURIComponent(query.trim())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-sky-300 border border-sky-700/50 inline-flex items-center gap-1 transition"
                title="Open this query directly in Google Scholar in a new tab"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open in Google Scholar</span>
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label
              className="inline-flex items-center gap-1.5 text-teal-300 cursor-pointer select-none"
              title="Off (Recommended): each database returns its own distinct search output. Turn On only to merge all databases on every search."
            >
              <input
                type="checkbox"
                checked={broadWebSearch}
                onChange={(e) => setBroadWebSearch(e.target.checked)}
                className="rounded accent-teal-500 cursor-pointer"
              />
              <span>Cross-Search All DBs Simultaneously</span>
            </label>

            <label
              className="inline-flex items-center gap-1.5 text-emerald-300 cursor-pointer select-none"
              title="Keep checked paper selections across multiple searches so you can compare results from other databases before final checkbox confirmation"
            >
              <input
                type="checkbox"
                checked={retainCheckedAcrossSearches}
                onChange={(e) => setRetainCheckedAcrossSearches(e.target.checked)}
                className="rounded accent-emerald-500 cursor-pointer"
              />
              <span>Hold Checked Selection Across Searches (Multi-Search Confirmation)</span>
            </label>

            {onRecordSearchHistory && (
              <label className="inline-flex items-center gap-1.5 text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={alsoLogToHistory}
                  onChange={(e) => setAlsoLogToHistory(e.target.checked)}
                  className="rounded accent-indigo-500 cursor-pointer"
                />
                <History className="w-3 h-3 text-indigo-400" />
                <span>Log Search History</span>
              </label>
            )}
          </div>
        </div>
      </form>

      {/* Separate Searches Recorded Strip (Persistent Per-Database Session Log) */}
      {searchSessions.length > 0 && (
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <GitFork className="w-3.5 h-3.5 text-teal-400" />
              Separate Database Searches ({searchSessions.length}) — Persisted Per Review Folder:
            </span>
            <button
              type="button"
              onClick={() => void handleClearAllSearchSessions()}
              className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-rose-950/70 text-rose-300 border border-rose-800/50 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer transition"
              title="Delete all saved Separate Database Search records for this review folder"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear All ({searchSessions.length})</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {searchSessions.map((sess) => (
              <div
                key={sess.id}
                className={`px-2.5 py-1 rounded-lg border flex items-center gap-2 ${
                  sess.id === activeBatchId
                    ? 'bg-teal-950/50 border-teal-500/60 text-teal-200'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                <span className="font-bold text-white">{sess.databaseLabel}</span>
                <span className="text-slate-400 truncate max-w-[130px]" title={sess.query}>
                  &quot;{sess.query}&quot;
                </span>
                <span className="font-mono text-cyan-300">
                  {sess.actuallyRetrievedCount.toLocaleString()}/{sess.externalReportedCount.toLocaleString()}
                </span>
                {sess.successfullySavedCount > 0 ? (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-[10px]">
                    Saved ({sess.successfullySavedCount})
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono text-[10px]">
                    Retrieved
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleDeleteSearchSession(sess.id)}
                  className="ml-0.5 p-0.5 rounded hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 cursor-pointer transition"
                  title={`Delete "${sess.databaseLabel}" search record`}
                  aria-label={`Delete ${sess.databaseLabel} search record`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 Independent Workflows & 6 Independent Counters Architecture Inspector */}
      {(() => {
        const activeSession =
          searchSessions.find((s) => s.id === activeBatchId) || searchSessions[0];
        const liveExistingOverlapCount = results.filter((r) => Boolean(findExistingMatch(r))).length;
        const c1ExtReported = activeSession?.externalReportedCount ?? searchMeta?.totalAvailable ?? 0;
        const c2ActuallyRetrieved =
          results.length > 0 ? results.length : activeSession?.actuallyRetrievedCount ?? 0;
        const c3SuccessfullySaved = activeSession?.successfullySavedCount ?? 0;
        const c4UniqueLibrary = project?.articles?.length || 0;
        const c5ExistingMatched =
          activeSession && activeSession.successfullySavedCount > 0
            ? activeSession.existingLibraryMatchedCount
            : liveExistingOverlapCount;
        const c6DuplicateEvents =
          activeSession && activeSession.successfullySavedCount > 0
            ? activeSession.duplicateEventsRemovedCount
            : searchMeta?.crossDbDuplicateCount ?? activeSession?.withinSessionDuplicateCount ?? 0;

        return (
          <div className="bg-slate-950 border border-teal-500/30 rounded-2xl p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <span className="font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-400" />
                <span>4 Independent Workflows &amp; 6 Independent Search Result Counters</span>
              </span>
              <span className="text-[10px] font-mono text-teal-300 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                PRISMA 2020 Read-Only Consumer
              </span>
            </div>

            {/* 4 Workflows Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
              <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <p className="font-bold text-indigo-300">1. Online Search Engine</p>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  Executes queries, translates parameters, connects to live databases without screening interference.
                </p>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <p className="font-bold text-teal-300">2. Record Retrieval Engine</p>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  Handles cursor/offset pagination, extracts bibliographic metadata, preserves original DB identifiers.
                </p>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <p className="font-bold text-emerald-300">3. Article Library Import</p>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  Persists unique records, associates PDFs, merges duplicates while preserving source provenance.
                </p>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <p className="font-bold text-amber-300">4. PRISMA 2020 Reporting</p>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  Downstream read-only consumer summarizing retrieval, duplicate removal, and screening attrition.
                </p>
              </div>
            </div>

            {/* 6 Independent Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1 font-mono text-[11px]">
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 text-center" title="Total hits reported by external database APIs">
                <span className="text-slate-400 block text-[10px]">1. Ext. Reported</span>
                <strong className="text-white text-sm tabular-nums">{c1ExtReported.toLocaleString()}</strong>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 text-center" title="Records actually retrieved into Workflow 2 staging">
                <span className="text-slate-400 block text-[10px]">2. Actually Retrieved</span>
                <strong className="text-cyan-300 text-sm tabular-nums">{c2ActuallyRetrieved.toLocaleString()}</strong>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 text-center" title="Records persisted by Workflow 3 import for this session">
                <span className="text-slate-400 block text-[10px]">3. Successfully Saved</span>
                <strong className="text-teal-300 text-sm tabular-nums">{c3SuccessfullySaved.toLocaleString()}</strong>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 text-center" title="Unique canonical articles in active Article Library">
                <span className="text-slate-400 block text-[10px]">4. Unique Library</span>
                <strong className="text-emerald-300 text-sm tabular-nums">{c4UniqueLibrary.toLocaleString()}</strong>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 text-center" title="Retrieved records matching articles already present in Article Library">
                <span className="text-slate-400 block text-[10px]">5. Existing Library</span>
                <strong className="text-indigo-300 text-sm tabular-nums">{c5ExistingMatched.toLocaleString()}</strong>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 text-center" title="Duplicate events consolidated via Stage A provenance merge">
                <span className="text-slate-400 block text-[10px]">6. Duplicate Events</span>
                <strong className="text-amber-300 text-sm tabular-nums">{c6DuplicateEvents.toLocaleString()}</strong>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Status / Feedback Banners */}
      {statusBanner && (
        <div className="px-3.5 py-2.5 rounded-xl bg-emerald-950/50 border border-emerald-700/60 text-emerald-200 text-xs flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusBanner}</span>
          </span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="px-3.5 py-2.5 rounded-xl bg-rose-950/40 border border-rose-800/70 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {results.length === 0 && stagedEntries.length > 0 && (
        <div className="bg-indigo-950/35 border border-indigo-500/50 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-200 font-semibold">
            {stagedEntries.length} checked paper(s) held from earlier search(es) ready to add to Library.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isBatchImporting}
              onClick={() => void handleConfirmAndRecordStaged(false)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>
                {batchImportProgress?.mode === 'metadata'
                  ? `Adding ${batchImportProgress.done}/${batchImportProgress.total}...`
                  : `Add Checked (${stagedEntries.length}) to Library`}
              </span>
            </button>
            <button
              type="button"
              disabled={isBatchImporting}
              onClick={() => void handleConfirmAndRecordStaged(true)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className={`w-3.5 h-3.5 ${isBatchImporting ? 'animate-bounce' : ''}`} />
              <span>
                {batchImportProgress?.mode === 'verify_pdf'
                  ? `Extracting ${batchImportProgress.done}/${batchImportProgress.total}...`
                  : `Add & Extract Checked (${stagedEntries.length})`}
              </span>
            </button>
            <button
              type="button"
              disabled={isBatchImporting}
              onClick={() => setStagedCheckedMap({})}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 disabled:opacity-40 text-rose-300 border border-rose-800/50 text-[11px] cursor-pointer whitespace-nowrap shrink-0"
            >
              Clear Checked
            </button>
          </div>
        </div>
      )}

      {/* Results Header, Timing, Access Filters & Batch Import Bar */}
      {results.length > 0 && (
        <div className="space-y-3 pt-1">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-white">
                  {results.length.toLocaleString()} Loaded
                  {searchMeta?.totalAvailable && searchMeta.totalAvailable > results.length
                    ? ` of ${searchMeta.totalAvailable.toLocaleString()} Available in Database`
                    : ` (All ${searchMeta?.totalAvailable?.toLocaleString() || results.length} Matching Records)`}
                </span>
                {searchMeta && searchMeta.crossDbDuplicateCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[10px]">
                    {searchMeta.crossDbDuplicateCount} Cross-DB Duplicates Detected (PRISMA)
                  </span>
                )}
                {searchMeta?.elapsedMs !== undefined && (
                  <span className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 font-mono text-[10px]">
                    {(searchMeta.elapsedMs / 1000).toFixed(2)}s {searchMeta.cached ? '(Instant Cache)' : ''}
                  </span>
                )}
                {searchMeta?.sourceStats &&
                  Object.entries(searchMeta.sourceStats)
                    .filter(([, count]) => count > 0)
                    .map(([src, count]) => {
                      const totalForSrc = searchMeta.totalHitsBySource?.[src];
                      return (
                        <span
                          key={src}
                          className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300"
                        >
                          {src}: {count.toLocaleString()}
                          {totalForSrc && totalForSrc > count ? ` / ${totalForSrc.toLocaleString()}` : ''}
                        </span>
                      );
                    })}
                {searchMeta?.hasMore && (
                  <>
                    <button
                      type="button"
                      disabled={isLoadingMore}
                      onClick={() => handleLoadMoreResults(false)}
                      className="px-2.5 py-0.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingMore ? 'animate-spin' : ''}`} />
                      <span>{isLoadingMore ? 'Loading...' : 'Load Next +500'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isLoadingMore}
                      onClick={() => handleLoadMoreResults(true)}
                      className="px-2.5 py-0.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white text-[10px] font-bold cursor-pointer transition"
                    >
                      Fetch All Remaining
                    </button>
                  </>
                )}
              </div>

              {/* PRISMA Accessibility Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                <span className="text-slate-500 flex items-center gap-1 mr-1">
                  <Filter className="w-3 h-3" /> PRISMA Access:
                </span>
                {[
                  { id: 'all' as const, label: `All (${accessCounts.all})`, cls: 'bg-indigo-600 text-white' },
                  {
                    id: 'downloadable' as const,
                    label: `Downloadable PDF (${accessCounts.downloadable})`,
                    cls: 'bg-emerald-600 text-white',
                  },
                  {
                    id: 'needs_institution_confirmation' as const,
                    label: `Needs Institution (${accessCounts.needs_institution_confirmation})`,
                    cls: 'bg-amber-600 text-white',
                  },
                  {
                    id: 'not_accessible' as const,
                    label: `Not Accessible / Abstract (${accessCounts.not_accessible})`,
                    cls: 'bg-rose-600 text-white',
                  },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setAccessFilter(f.id)}
                    className={`px-2 py-0.5 rounded-lg font-semibold transition cursor-pointer ${
                      accessFilter === f.id
                        ? f.cls
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bulk Checkbox Selection & Direct Add to Library Actions */}
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <label
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0 select-none border border-slate-700"
                title="Check or uncheck all filtered results in this search"
              >
                <input
                  ref={masterCheckboxRef}
                  type="checkbox"
                  checked={allFilteredChecked}
                  onChange={() => {
                    if (allFilteredChecked) {
                      handleClearCurrentSearchSelection();
                    } else {
                      handleSelectItemsBatch(filteredResults);
                    }
                  }}
                  className="rounded accent-teal-500 cursor-pointer"
                />
                <span>Select All ({filteredResults.length})</span>
              </label>
              <button
                type="button"
                disabled={unaddedFilteredResults.length === 0}
                onClick={() => handleSelectItemsBatch(unaddedFilteredResults)}
                className="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 disabled:opacity-40 text-cyan-200 border border-cyan-700/60 text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                title="Check only articles not yet in Article Library"
              >
                Select Unadded ({unaddedFilteredResults.length})
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSelectItemsBatch(results.filter((r) => r.accessStatus === 'downloadable'))
                }
                className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                Select Downloadable ({accessCounts.downloadable})
              </button>
              {currentSearchCheckedCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearCurrentSearchSelection}
                  className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 text-[11px] cursor-pointer whitespace-nowrap shrink-0"
                >
                  Uncheck Current ({currentSearchCheckedCount})
                </button>
              )}
              {stagedEntries.length > 0 && (
                <button
                  type="button"
                  disabled={isBatchImporting}
                  onClick={() => setStagedCheckedMap({})}
                  className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-rose-950/60 disabled:opacity-40 text-rose-300 border border-rose-800/50 text-[11px] cursor-pointer whitespace-nowrap shrink-0"
                >
                  Clear Checked ({stagedEntries.length})
                </button>
              )}
              <button
                type="button"
                disabled={stagedEntries.length === 0 || isBatchImporting}
                onClick={() => void handleConfirmAndRecordStaged(false)}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition shadow-sm"
                title="Directly add all checked records to Article Library (metadata & provenance)"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {batchImportProgress?.mode === 'metadata'
                    ? `Adding ${batchImportProgress.done}/${batchImportProgress.total}...`
                    : `Add Checked (${stagedEntries.length}) to Library`}
                </span>
              </button>
              <button
                type="button"
                disabled={stagedEntries.length === 0 || isBatchImporting}
                onClick={() => void handleConfirmAndRecordStaged(true)}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 transition"
                title="Verify PDFs, extract full text where available, and add all checked articles to Library"
              >
                <Download className={`w-3.5 h-3.5 ${isBatchImporting ? 'animate-bounce' : ''}`} />
                <span>
                  {batchImportProgress?.mode === 'verify_pdf'
                    ? `Extracting ${batchImportProgress.done}/${batchImportProgress.total}...`
                    : `Add & Extract Checked (${stagedEntries.length})`}
                </span>
              </button>
            </div>
          </div>

          {batchImportProgress && (
            <div className="bg-teal-950/35 border border-teal-500/50 rounded-xl px-3.5 py-2 flex items-center justify-between gap-3 text-xs">
              <span className="text-teal-200 font-semibold">
                {batchImportProgress.mode === 'verify_pdf'
                  ? `Verifying PDFs & extracting full text for checked papers: ${batchImportProgress.done} / ${batchImportProgress.total}`
                  : `Saving checked papers to Article Library: ${batchImportProgress.done} / ${batchImportProgress.total}`}
              </span>
              <span className="text-teal-300 font-mono text-[11px] tabular-nums">
                {Math.round((batchImportProgress.done / Math.max(1, batchImportProgress.total)) * 100)}%
              </span>
            </div>
          )}

          {/* Results List (smooth slice rendering for large datasets while All Actions operate on full loaded set) */}
          <div className={`${compact ? 'max-h-80' : 'max-h-[440px]'} overflow-y-auto space-y-2 pr-1`}>
            {filteredResults.slice(0, visibleDisplayLimit).map((item) => {
              const isSelected = stagedIdsSet.has(item.id);
              const existingLibMatch = findExistingMatch(item);
              const inLibrary = isAlreadyInLibrary(item);
              const isCrossDbOverlapWithLibrary =
                Boolean(existingLibMatch) &&
                (existingLibMatch?.sourceDatabase || '').toLowerCase() !==
                  (item.sourceDatabase || '').toLowerCase();
              const isFetching = fetchingItemId === item.id;
              const hasPdfLink = Boolean(item.pdfUrl || item.openAccessUrl);

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border transition space-y-2 ${
                    isSelected
                      ? 'bg-indigo-950/30 border-indigo-500/70 ring-1 ring-indigo-500/30'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleItemSelection(item)}
                      className="mt-1 rounded accent-teal-500 cursor-pointer shrink-0"
                    />

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-indigo-300">
                          {item.sourceDatabase}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300">
                          {item.year}
                        </span>
                        {item.citationsCount !== undefined && item.citationsCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-cyan-300">
                            {item.citationsCount} citations
                          </span>
                        )}

                        {/* PRISMA Access / Downloadability Status Badge */}
                        {item.accessStatus === 'downloadable' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <FileCheck2 className="w-3 h-3" /> Downloadable PDF (OA)
                          </span>
                        )}
                        {item.accessStatus === 'needs_institution_confirmation' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <Building2 className="w-3 h-3" />
                            {item.institutionConfirmed
                              ? 'Institution Access Confirmed'
                              : 'Needs Institutional Confirmation'}
                          </span>
                        )}
                        {item.accessStatus === 'not_accessible' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <Lock className="w-3 h-3" /> Not Accessible (PRISMA Recorded)
                          </span>
                        )}
                        {item.accessStatus === 'abstract_only' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                            <FileText className="w-3 h-3" /> Abstract Only
                          </span>
                        )}

                        {(item.isCrossDbDuplicate || isCrossDbOverlapWithLibrary) && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            title={
                              item.duplicateNote ||
                              `Also found in ${existingLibMatch?.sourceDatabase}. Stage A import merges source provenance onto 1 canonical record.`
                            }
                          >
                            <GitFork className="w-3 h-3" />
                            Cross-DB Overlap (Also in{' '}
                            {isCrossDbOverlapWithLibrary
                              ? existingLibMatch?.sourceDatabase
                              : (item.duplicateMatchedDatabases || [])
                                  .filter((d) => d !== item.sourceDatabase)
                                  .join(', ') || 'Other DB'}
                            )
                          </span>
                        )}

                        {item.relatedNote && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            {item.relatedNote}
                          </span>
                        )}

                        {inLibrary && !isCrossDbOverlapWithLibrary && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                            <CheckCircle2 className="w-3 h-3" /> In Library
                          </span>
                        )}
                      </div>

                      <h4 className="text-xs sm:text-sm font-bold text-white leading-snug">{item.title}</h4>
                      <p className="text-[11px] text-slate-400">
                        {(item.authors || []).slice(0, 4).join(', ')}
                        {(item.authors || []).length > 4 ? ' et al.' : ''} ·{' '}
                        <span className="italic text-slate-300">{item.journal}</span>
                        {item.doi && <span className="font-mono text-slate-500 ml-2">DOI: {item.doi}</span>}
                      </p>
                      <p className="text-[11px] text-slate-400 line-clamp-2">{item.abstract}</p>
                      {item.accessNotes && (
                        <p className="text-[10px] text-slate-500 italic">{item.accessNotes}</p>
                      )}
                    </div>
                  </div>

                  {/* Per-Paper Action Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 pl-7 border-t border-slate-800/70 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {hasPdfLink && (
                        <button
                          type="button"
                          disabled={isFetching}
                          onClick={() => handleDownloadPdfFile(item)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold inline-flex items-center gap-1 cursor-pointer transition"
                          title="Download Open-Access PDF file to your computer"
                        >
                          <Download className={`w-3 h-3 ${isFetching ? 'animate-bounce' : ''}`} />
                          <span>{isFetching ? 'Downloading...' : 'Download PDF'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isFetching}
                        onClick={() => handleAddSingleWithVerification(item, undefined, true)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold inline-flex items-center gap-1 cursor-pointer transition"
                        title="Verify accessibility, extract available PDF text, and add to Library & PRISMA"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{inLibrary ? 'Add Copy' : 'Add & Extract to Library'}</span>
                      </button>

                      {/* Institutional confirmation toggle & Not Accessible PRISMA recorder */}
                      <button
                        type="button"
                        onClick={() =>
                          handleChangeResultAccessStatus(item.id, 'needs_institution_confirmation', {
                            institutionConfirmed: !item.institutionConfirmed,
                            accessNotes: !item.institutionConfirmed
                              ? 'Institutional subscription access confirmed by researcher.'
                              : 'Requires institutional subscription confirmation to download PDF.',
                          })
                        }
                        className={`px-2 py-1 rounded-lg border font-medium inline-flex items-center gap-1 cursor-pointer transition ${
                          item.institutionConfirmed
                            ? 'bg-amber-600 text-white border-amber-500'
                            : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-amber-700/50'
                        }`}
                        title="Confirm or flag institutional access requirement per PRISMA 2020"
                      >
                        <Building2 className="w-3 h-3" />
                        <span>
                          {item.institutionConfirmed ? 'Institution Confirmed' : 'Inst. Confirm'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={isFetching}
                        onClick={() => handleAddSingleWithVerification(item, 'not_accessible', false)}
                        className="px-2 py-1 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-700/60 font-medium inline-flex items-center gap-1 cursor-pointer transition"
                        title="Record this paper in Library & PRISMA 2020 as Not Accessible (Reports not retrieved)"
                      >
                        <XCircle className="w-3 h-3 text-rose-400" />
                        <span>Record Not Accessible (PRISMA)</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleFindRelatedForPaper(item)}
                        className="px-2 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-900 text-purple-200 border border-purple-700/60 font-medium inline-flex items-center gap-1 cursor-pointer transition"
                        title="Find related articles using citation & topic graph"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>Find Related</span>
                      </button>

                      {(item.url || item.doi || item.openAccessUrl) && (
                        <a
                          href={item.openAccessUrl || item.url || `https://doi.org/${item.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 inline-flex items-center gap-1 transition"
                          title="Open publisher or institutional access page"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Open Source</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredResults.length > visibleDisplayLimit && (
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setVisibleDisplayLimit((v) => v + 150)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Show +150 More in View ({filteredResults.length - visibleDisplayLimit} remaining)
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleDisplayLimit(filteredResults.length)}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Render All {filteredResults.length} in List
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!isSearching && results.length === 0 && !errorMsg && (
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-teal-400 shrink-0" />
            <span>
              Choose an optional <strong>Database Source</strong> &amp; <strong>Search Method</strong> (Keywords, Title, DOI, Abstract, Authors, or Related Articles), then click <strong>Fast Search</strong>.
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 shrink-0">
            PRISMA 2020 Ready: Downloadable · Inst. Confirm · Not Accessible
          </span>
        </div>
      )}
    </div>
  );
};
