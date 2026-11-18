import React, { useState, useEffect } from 'react';
import { Article, ReviewProject, DatabaseProvenance } from '../types';
import {
  Upload,
  Files,
  Globe,
  Sparkles,
  Check,
  AlertCircle,
  X,
  FileCheck2,
  RefreshCw,
  Plus,
  BookOpen,
  CheckCircle2,
  ArrowRight,
  ListPlus,
  Layers,
  FileText,
  RotateCcw,
  Trash2,
  CheckSquare,
  Square,
} from 'lucide-react';
import { apiService, evaluateArticleClient } from '../services/apiService';
import {
  classifyPaperType,
  DATABASE_PROVENANCE_OPTIONS,
  detectArticleSourceDatabase,
} from '../utils/slrDetectionEngine';
import { FastOnlineSearchPanel } from './FastOnlineSearchPanel';

interface UploadedFileRecord {
  id: string;
  fileName: string;
  articleIds: string[];
  committed: boolean;
}

interface AddArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddArticle: (article: Article, targetProjectId?: string) => void;
  onAddMultipleArticles?: (articles: Article[], options?: { keepOpen?: boolean; targetProjectId?: string }) => void;
  onDeleteArticlesByIds?: (articleIds: string[], targetProjectId?: string) => Promise<void> | void;
  onClearFolderArticles?: (targetProjectId?: string) => Promise<void> | void;
  project?: ReviewProject;
  allProjects?: ReviewProject[];
  onSwitchProject?: (projectId: string) => void;
  onCreateNewReview?: () => void;
  initialTab?: 'manual' | 'bulk_local' | 'online';
}

const makeUniqueId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

// Extract basic PDF title/DOI hints from raw PDF bytes when online lookup is skipped or offline
async function extractLocalPdfHints(file: File): Promise<{ titleHint?: string; doiHint?: string; snippet?: string }> {
  try {
    const slice = file.slice(0, Math.min(file.size, 262144)); // first 256KB for speed
    const raw = await slice.text();
    const doiMatch = raw.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
    const titleMeta = raw.match(/\/Title\s*\(([^)]{4,180})\)/i);
    const printable = raw
      .replace(/[^\x20-\x7E\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 450);
    return {
      doiHint: doiMatch ? doiMatch[0].replace(/[)>.,;]+$/, '') : undefined,
      titleHint: titleMeta ? titleMeta[1].trim() : undefined,
      snippet: printable.length > 40 ? printable : undefined,
    };
  } catch {
    return {};
  }
}

// Extract basic title/DOI/snippet hints from plain-text manuscript files (.txt, .md)
async function extractLocalTextHints(file: File): Promise<{ titleHint?: string; doiHint?: string; snippet?: string }> {
  try {
    const slice = file.slice(0, Math.min(file.size, 65536));
    const raw = await slice.text();
    const doiMatch = raw.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 10 && l.length <= 180 && !/^https?:\/\//i.test(l));
    const printable = raw.replace(/\s+/g, ' ').trim().slice(0, 450);
    return {
      doiHint: doiMatch ? doiMatch[0].replace(/[)>.,;]+$/, '') : undefined,
      titleHint: lines[0] || undefined,
      snippet: printable.length > 40 ? printable : undefined,
    };
  } catch {
    return {};
  }
}

interface StagedLocalFile {
  id: string;
  file: File;
  selected: boolean;
}

export const AddArticleModal: React.FC<AddArticleModalProps> = ({
  isOpen,
  onClose,
  onAddArticle,
  onAddMultipleArticles,
  onDeleteArticlesByIds,
  onClearFolderArticles,
  project,
  allProjects = [],
  onSwitchProject,
  onCreateNewReview,
  initialTab = 'manual',
}) => {
  // Support manual insertion with empty placeholders as well as bulk
  const [activeTab, setActiveTab] = useState<'manual' | 'bulk_local' | 'online'>(initialTab);
  const [selectedTargetId, setSelectedTargetId] = useState<string>(project?.id || '');

  const targetProject =
    allProjects.find((p) => p.id === selectedTargetId) || project;

  // Bulk Local Files & File Names State (Explicit file selection only — no folder auto-import, no auto-inclusion)
  const [batchText, setBatchText] = useState('');
  const [stagedLocalFiles, setStagedLocalFiles] = useState<StagedLocalFile[]>([]);
  const [uploadedFileRecords, setUploadedFileRecords] = useState<UploadedFileRecord[]>([]);
  const [checkedFileIds, setCheckedFileIds] = useState<Set<string>>(new Set());
  const [confirmClearFolder, setConfirmClearFolder] = useState(false);
  const [resolvedArticles, setResolvedArticles] = useState<Article[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const [enrichFromWeb, setEnrichFromWeb] = useState(true);
  const [autoStreamToLibrary, setAutoStreamToLibrary] = useState(true);
  const [screenByEligibilityOnImport, setScreenByEligibilityOnImport] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({
    processed: 0,
    total: 0,
    streamedCount: 0,
    elapsedSeconds: 0,
  });
  const pauseRef = React.useRef(false);
  const cancelRef = React.useRef(false);
  const addFileInputRef = React.useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (project?.id && !isProcessing) {
      setSelectedTargetId(project.id);
    }
  }, [project?.id, isOpen, isProcessing]);

  // Always cancel any active upload and clear stale selection history when closing or switching review folders
  useEffect(() => {
    cancelRef.current = true;
    pauseRef.current = false;
    setIsPaused(false);
    setIsProcessing(false);
    setStagedLocalFiles([]);
    setUploadedFileRecords([]);
    setCheckedFileIds(new Set());
    setConfirmClearFolder(false);
    setResolvedArticles([]);
    setProcessStatus('');
    setBulkProgress({ processed: 0, total: 0, streamedCount: 0, elapsedSeconds: 0 });
  }, [isOpen, targetProject?.id]);

  // Keep file queue synced with active library articles so deleted items never remain as ghost entries
  useEffect(() => {
    const existingIds = new Set((targetProject?.articles || []).map((a) => a.id));
    setUploadedFileRecords((prev) =>
      prev.filter((rec) => !rec.committed || rec.articleIds.some((id) => existingIds.has(id)))
    );
  }, [targetProject?.articles]);

  const [bulkSourceDatabase, setBulkSourceDatabase] = useState<string>('auto');
  const [bulkCustomDatabase, setBulkCustomDatabase] = useState('');
  const [manualCustomDatabase, setManualCustomDatabase] = useState('');

  // Manual Paper Insertion State: ALL fields start completely empty with clear placeholders (NOT auto-filled)
  const [manualTitle, setManualTitle] = useState('');
  const [manualAuthors, setManualAuthors] = useState('');
  const [manualYear, setManualYear] = useState('');
  const [manualJournal, setManualJournal] = useState('');
  const [manualDoi, setManualDoi] = useState('');
  const [manualDatabase, setManualDatabase] = useState<DatabaseProvenance>('Manual');
  const [manualAbstract, setManualAbstract] = useState('');
  const [manualFullText, setManualFullText] = useState('');
  const [manualPlatform, setManualPlatform] = useState('');
  const [manualSensor, setManualSensor] = useState('');
  const [manualGsd, setManualGsd] = useState('');
  const [manualLatency, setManualLatency] = useState('');
  const [manualMetrics, setManualMetrics] = useState('');
  const [pureManualMode, setPureManualMode] = useState(true); // Keep unscreened, do not auto-fill or auto-screen
  const [keepOpenAfterAdd, setKeepOpenAfterAdd] = useState(false);
  const [manualSuccessMsg, setManualSuccessMsg] = useState('');
  const [manualError, setManualError] = useState('');

  if (!isOpen) return null;

  // Helper: NEVER auto-include articles on upload/import — all newly uploaded items remain 'unscreened'
  // Automatically stamps Paper Type (Original Research vs Review) and optional/detected Database Provenance
  const applyAutoScreening = (art: Article, projOverride?: ReviewProject): Article => {
    const activeProj = projOverride || targetProject;
    const pType = classifyPaperType(art);
    const resolvedDb =
      bulkSourceDatabase === 'Other'
        ? bulkCustomDatabase.trim() || 'Other'
        : bulkSourceDatabase !== 'auto'
        ? bulkSourceDatabase
        : detectArticleSourceDatabase(art).database;

    const stamped: Article = {
      ...art,
      projectId: activeProj?.id || art.projectId,
      sourceDatabase: resolvedDb || art.sourceDatabase || 'Other',
      paperCategory: art.paperCategory || pType.category,
      paperSubType: art.paperSubType || pType.subType,
      decision: 'unscreened',
      screeningStage: 'title_abstract',
    };
    if (!activeProj || !screenByEligibilityOnImport) return stamped;
    const evalRes = evaluateArticleClient(stamped, activeProj);
    return {
      ...stamped,
      decision: 'unscreened',
      screeningStage: 'title_abstract',
      aiSuggestedDecision: evalRes.decision,
      aiConfidence: evalRes.confidenceScore,
      aiReason: evalRes.primaryReason,
    };
  };

  // Step 1: Stage picked internal/local files for explicit selection (never auto-upload or auto-include!)
  const handleStagePickedFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files).map((file) => ({
      id: makeUniqueId('stfile'),
      file,
      selected: false, // Must be explicitly selected by user before upload
    }));
    setStagedLocalFiles((prev) => {
      const existingKeys = new Set(prev.map((item) => `${item.file.name}::${item.file.size}`));
      const uniquePicked = picked.filter((item) => !existingKeys.has(`${item.file.name}::${item.file.size}`));
      return [...prev, ...uniquePicked];
    });
  };

  const handleToggleStagedFile = (id: string) => {
    setStagedLocalFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleSelectAllStagedFiles = (selected: boolean) => {
    setStagedLocalFiles((prev) => prev.map((item) => ({ ...item, selected })));
  };

  // Step 2: Upload ONLY user-selected internal files into targetProject's partitioned database
  const handleUploadSelectedFiles = async () => {
    const chosen = stagedLocalFiles.filter((item) => item.selected);
    if (chosen.length === 0) return;

    const lockedProject = targetProject;
    const lockedProjectId = lockedProject?.id;
    const fileArray = chosen.map((item) => item.file);
    const chosenIds = new Set(chosen.map((item) => item.id));
    pauseRef.current = false;
    cancelRef.current = false;
    setIsPaused(false);
    setIsProcessing(true);

    const startTime = performance.now();
    const totalFiles = fileArray.length;
    let processedCount = 0;
    let streamedTotal = 0;
    let pendingStreamChunk: Article[] = [];
    const CHUNK_FLUSH_SIZE = 20;

    setBulkProgress({
      processed: 0,
      total: totalFiles,
      streamedCount: 0,
      elapsedSeconds: 0,
    });
    setProcessStatus(
      `Importing ${totalFiles} local file(s) into "${lockedProject?.title || 'Partitioned Library'}"...`
    );

    const elapsedTimer = window.setInterval(() => {
      setBulkProgress((prev) => ({
        ...prev,
        elapsedSeconds: Math.floor((performance.now() - startTime) / 1000),
      }));
    }, 500);

    const flushStreamChunk = (force = false) => {
      if (cancelRef.current || !autoStreamToLibrary || !onAddMultipleArticles) return;
      if (pendingStreamChunk.length >= CHUNK_FLUSH_SIZE || (force && pendingStreamChunk.length > 0)) {
        const chunkToCommit = [...pendingStreamChunk];
        pendingStreamChunk = [];
        streamedTotal += chunkToCommit.length;
        onAddMultipleArticles(chunkToCommit, { keepOpen: true, targetProjectId: lockedProjectId });
        setBulkProgress((prev) => ({ ...prev, streamedCount: streamedTotal }));
      }
    };

    const processSingleFile = async (file: File): Promise<Article[]> => {
      const baseMeta = {
        projectId: lockedProjectId,
        sourceFileName: file.name,
      };

      // 1. Direct bibliography / structured text files (.bib, .ris, .csv, .tsv, .txt, .json, .enw, .nbib, .ciw)
      if (file.name.match(/\.(bib|ris|csv|tsv|txt|json|enw|nbib|ciw|xml)$/i)) {
        try {
          const content = await file.text();
          const parsed = parseBibliographyText(content, file.name);
          if (parsed.length > 0) {
            return parsed.map((a) => ({ ...a, ...baseMeta }));
          }
        } catch (e) {
          console.warn(`Bibliography parse fallback for ${file.name}:`, e);
        }
      }

      // 2. For PDFs or plain-text manuscripts, extract filename/header hints cleanly first
      let doiHint: string | undefined;
      let titleHint: string | undefined;
      let snippetHint: string | undefined;
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.pdf')) {
        const hints = await extractLocalPdfHints(file);
        doiHint = hints.doiHint;
        titleHint = hints.titleHint;
        snippetHint = hints.snippet;
      } else if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
        const hints = await extractLocalTextHints(file);
        doiHint = hints.doiHint;
        titleHint = hints.titleHint;
        snippetHint = hints.snippet;
      }

      // 3. Optional bounded web metadata enrichment (strict 3.5s timeout so queue NEVER hangs)
      if (enrichFromWeb) {
        try {
          const enriched = await apiService.autoSyncMetadata(
            {
              filename: file.name,
              title: titleHint,
              doi: doiHint,
            },
            3500
          );
          if (enriched && enriched.title) {
            return [
              {
                ...baseMeta,
                id: makeUniqueId('art-file'),
                title: enriched.title,
                authors: enriched.authors || ['Author Unknown'],
                year: enriched.year || new Date().getFullYear(),
                journal: enriched.journal || 'Academic Publication',
                doi: enriched.doi || doiHint || undefined,
                abstract: enriched.abstract || snippetHint || `Extracted from local file: ${file.name}.`,
                sourceDatabase: enriched.sourceDatabase || 'Manual',
                url: enriched.url,
                citationsCount: enriched.citationsCount,
                screeningStage: 'title_abstract',
                decision: 'unscreened',
                evidenceCitations: [],
              },
            ];
          }
        } catch {
          // Proceed cleanly with local filename/content entry so NO file is ever dropped
        }
      }

      // 4. Guaranteed local inclusion from filename + extracted hints (never drops a file)
      const cleanTitle =
        titleHint ||
        file.name
          .replace(/\.[a-zA-Z0-9]+$/, '')
          .replace(/[_-]+/g, ' ')
          .replace(/^[\d\s]+/, '')
          .trim();

      const yearMatch = file.name.match(/\b(19\d{2}|20\d{2})\b/);

      return [
        {
          ...baseMeta,
          id: makeUniqueId('art-local'),
          title: cleanTitle || file.name,
          authors: ['Author pending sync'],
          year: yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear(),
          journal: 'Local Source File',
          doi: doiHint || undefined,
          abstract: snippetHint
            ? `Imported local file (${file.name}). Content excerpt: ${snippetHint}`
            : `Imported from local drive file: ${file.name}. Ready for eligibility screening.`,
          sourceDatabase: 'Manual',
          screeningStage: 'title_abstract',
          decision: 'unscreened',
          evidenceCitations: [],
        },
      ];
    };

    // Process in concurrent worker batches (concurrency 4) — runs as long as needed until 100% finished
    const CONCURRENCY = enrichFromWeb ? 4 : 16;
    let cursor = 0;

    const worker = async () => {
      while (cursor < totalFiles && !cancelRef.current) {
        while (pauseRef.current && !cancelRef.current) {
          await new Promise((r) => setTimeout(r, 150));
        }
        if (cancelRef.current) break;

        const currentIndex = cursor++;
        if (currentIndex >= totalFiles) break;

        const file = fileArray[currentIndex];
        const items = await processSingleFile(file);
        if (cancelRef.current) break;
        const screenedItems = items.map((item) => applyAutoScreening(item, lockedProject));
        const fileRecId = makeUniqueId('frec');

        setUploadedFileRecords((prev) => [
          {
            id: fileRecId,
            fileName: file.name,
            articleIds: screenedItems.map((a) => a.id),
            committed: Boolean(autoStreamToLibrary && onAddMultipleArticles),
          },
          ...prev,
        ]);

        processedCount++;
        setProcessStatus(
          `Adding (${processedCount}/${totalFiles}): "${file.name}"`
        );
        setBulkProgress((prev) => ({
          ...prev,
          processed: processedCount,
          elapsedSeconds: Math.floor((performance.now() - startTime) / 1000),
        }));

        if (autoStreamToLibrary && onAddMultipleArticles) {
          pendingStreamChunk.push(...screenedItems);
          flushStreamChunk(false);
        } else {
          setResolvedArticles((prev) => [...prev, ...screenedItems]);
        }

        // Yield periodically to keep browser UI responsive on huge imports
        if (currentIndex % 10 === 0) {
          await new Promise((r) => setTimeout(r, 4));
        }
      }
    };

    try {
      const workerCount = Math.min(CONCURRENCY, totalFiles);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      if (!cancelRef.current) {
        flushStreamChunk(true);
      } else {
        pendingStreamChunk = [];
      }
    } finally {
      window.clearInterval(elapsedTimer);
    }

    const totalElapsed = Math.floor((performance.now() - startTime) / 1000);
    setBulkProgress((prev) => ({
      ...prev,
      processed: processedCount,
      streamedCount: streamedTotal,
      elapsedSeconds: totalElapsed,
    }));
    setIsProcessing(false);
    if (cancelRef.current) {
      setProcessStatus(`Stopped after processing ${processedCount}/${totalFiles} selected files.`);
    } else if (autoStreamToLibrary) {
      setStagedLocalFiles((prev) => prev.filter((item) => !chosenIds.has(item.id)));
      setProcessStatus(
        `Added ${streamedTotal} unscreened record(s) from ${processedCount} selected file(s) to "${lockedProject?.title || 'Sub-Library'}" in ${totalElapsed}s.`
      );
    } else {
      setStagedLocalFiles((prev) => prev.filter((item) => !chosenIds.has(item.id)));
      setProcessStatus('');
    }
  };

  // Checkbox handlers for uploaded files & library cleanup
  const handleToggleFileCheck = (id: string) => {
    setCheckedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAllFilesCheck = () => {
    if (checkedFileIds.size === uploadedFileRecords.length && uploadedFileRecords.length > 0) {
      setCheckedFileIds(new Set());
    } else {
      setCheckedFileIds(new Set(uploadedFileRecords.map((r) => r.id)));
    }
  };

  const handleDeleteCheckedFiles = async () => {
    if (checkedFileIds.size === 0) return;
    cancelRef.current = true;
    pauseRef.current = false;
    setIsPaused(false);
    setIsProcessing(false);

    const toRemove = uploadedFileRecords.filter((r) => checkedFileIds.has(r.id));
    const committedIds = toRemove.filter((r) => r.committed).flatMap((r) => r.articleIds);
    const stagedIds = new Set(toRemove.filter((r) => !r.committed).flatMap((r) => r.articleIds));

    if (committedIds.length > 0 && onDeleteArticlesByIds) {
      await onDeleteArticlesByIds(committedIds, targetProject?.id);
    }
    if (stagedIds.size > 0) {
      setResolvedArticles((prev) => prev.filter((a) => !stagedIds.has(a.id)));
    }
    setUploadedFileRecords((prev) => prev.filter((r) => !checkedFileIds.has(r.id)));
    setCheckedFileIds(new Set());
    setProcessStatus(`Permanently deleted ${toRemove.length} checked file(s) from "${targetProject?.title || 'Library'}".`);
  };

  const handleClearAllFiles = async () => {
    cancelRef.current = true;
    pauseRef.current = false;
    setIsPaused(false);
    setIsProcessing(false);

    const committedIds = uploadedFileRecords.filter((r) => r.committed).flatMap((r) => r.articleIds);
    if (onClearFolderArticles && targetProject?.id) {
      await onClearFolderArticles(targetProject.id);
    } else if (committedIds.length > 0 && onDeleteArticlesByIds) {
      await onDeleteArticlesByIds(committedIds, targetProject?.id);
    }
    setStagedLocalFiles([]);
    setUploadedFileRecords([]);
    setCheckedFileIds(new Set());
    setConfirmClearFolder(false);
    setResolvedArticles([]);
    setBulkProgress({ processed: 0, total: 0, streamedCount: 0, elapsedSeconds: 0 });
    setProcessStatus(`Cleared all files for "${targetProject?.title || 'Library'}".`);
  };

  // 2. Process pasted raw text or file names / titles (bounded timeout, zero drops)
  const handleProcessPastedText = async () => {
    if (!batchText.trim()) return;
    const lockedProject = targetProject;
    const lockedProjectId = lockedProject?.id;
    setIsProcessing(true);
    setProcessStatus('Parsing bibliographic lines and file names...');

    const parsedDirect = parseBibliographyText(batchText);
    if (parsedDirect.length > 0) {
      const screened = parsedDirect.map((a) => applyAutoScreening({ ...a, projectId: lockedProjectId }, lockedProject));
      if (autoStreamToLibrary && onAddMultipleArticles) {
        onAddMultipleArticles(screened, { keepOpen: true, targetProjectId: lockedProjectId });
      } else {
        setResolvedArticles((prev) => [...prev, ...screened]);
      }
      setBatchText('');
      setIsProcessing(false);
      setProcessStatus(`Added ${screened.length} parsed entries to sub-library.`);
      return;
    }

    const lines = batchText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 3);

    const autoSynced: Article[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      setProcessStatus(`Auto-syncing metadata (${i + 1}/${lines.length}): "${line.slice(0, 40)}..."`);

      if (enrichFromWeb) {
        try {
          const enriched = await apiService.autoSyncMetadata(
            {
              filename: line.endsWith('.pdf') ? line : undefined,
              title: !line.endsWith('.pdf') ? line : undefined,
              doi: line.includes('10.') ? line : undefined,
            },
            3500
          );

          if (enriched && enriched.title) {
            autoSynced.push({
              id: makeUniqueId('art-sync'),
              projectId: lockedProjectId,
              sourceFileName: line,
              title: enriched.title,
              authors: enriched.authors || ['Author Unknown'],
              year: enriched.year || 2024,
              journal: enriched.journal || 'Academic Publication',
              doi: enriched.doi || undefined,
              abstract: enriched.abstract || 'Synchronized from online repository.',
              sourceDatabase: enriched.sourceDatabase || 'Crossref',
              url: enriched.url,
              citationsCount: enriched.citationsCount,
              screeningStage: 'title_abstract',
              decision: 'unscreened',
              evidenceCitations: [],
            });
            continue;
          }
        } catch {
          // Fallback cleanly below
        }
      }

      const clean = line
        .replace(/\.(pdf|docx|doc|txt)$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();

      autoSynced.push({
        id: makeUniqueId('art-raw'),
        projectId: lockedProjectId,
        sourceFileName: line,
        title: clean || line,
        authors: ['Author pending sync'],
        year: 2024,
        journal: 'Scientific Paper',
        abstract: `Extracted from title/file name query: "${line}".`,
        sourceDatabase: 'Manual',
        screeningStage: 'title_abstract',
        decision: 'unscreened',
        evidenceCitations: [],
      });
    }

    const screened = autoSynced.map((art) => applyAutoScreening(art, lockedProject));
    if (autoStreamToLibrary && onAddMultipleArticles) {
      onAddMultipleArticles(screened, { keepOpen: true, targetProjectId: lockedProjectId });
      setProcessStatus(`Added ${screened.length} records to "${lockedProject?.title || 'Sub-Library'}".`);
    } else {
      setResolvedArticles((prev) => [...prev, ...screened]);
      setProcessStatus('');
    }
    setBatchText('');
    setIsProcessing(false);
  };

  // RFC-compliant CSV line splitter honoring quoted commas
  const splitCsvLine = (line: string, delimiter: string): string[] => {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return out;
  };

  // Helper: parse raw BibTeX, RIS, NBIB, CSV/TSV, or JSON
  const parseBibliographyText = (raw: string, sourceFileName?: string): Article[] => {
    const results: Article[] = [];
    if (!raw || raw.trim().length < 5) return results;

    // 1. Check JSON array
    if (raw.trim().startsWith('[') && raw.trim().endsWith(']')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.title) {
              results.push({
                id: item.id || makeUniqueId('art-json'),
                projectId: project?.id,
                sourceFileName,
                title: item.title,
                authors: Array.isArray(item.authors) ? item.authors : [item.authors || 'Unknown'],
                year: Number(item.year) || new Date().getFullYear(),
                journal: item.journal || 'Academic Publication',
                doi: item.doi || undefined,
                abstract: item.abstract || 'Imported via JSON dataset.',
                sourceDatabase: item.sourceDatabase || 'Manual',
                screeningStage: item.screeningStage || 'title_abstract',
                decision: item.decision || 'unscreened',
                evidenceCitations: item.evidenceCitations || [],
              });
            }
          }
          if (results.length > 0) return results;
        }
      } catch {}
    }

    // 2. Check BibTeX
    if (raw.includes('@article') || raw.includes('@inproceedings') || raw.includes('@misc') || raw.includes('@techreport') || raw.includes('@book')) {
      const entries = raw.split(/@(?=article|inproceedings|misc|phdthesis|techreport|book|incollection)/i).filter((s) => s.trim().length > 10);
      for (const entry of entries) {
        const titleMatch = entry.match(/title\s*=\s*[{"]([^}"]+)[}"]/i);
        const authorMatch = entry.match(/author\s*=\s*[{"]([^}"]+)[}"]/i);
        const yearMatch = entry.match(/year\s*=\s*[{"]?(\d{4})[}"]?/i);
        const journalMatch = entry.match(/(journal|booktitle)\s*=\s*[{"]([^}"]+)[}"]/i);
        const doiMatch = entry.match(/doi\s*=\s*[{"]([^}"]+)[}"]/i);
        const abstractMatch = entry.match(/abstract\s*=\s*[{"]([^}"]+)[}"]/i);

        if (titleMatch) {
          const authorStr = authorMatch ? authorMatch[1] : 'Unknown Author';
          const auths = authorStr.split(/\s+and\s+/i).map((a) => a.trim());
          results.push({
            id: makeUniqueId('art-bib'),
            projectId: project?.id,
            sourceFileName,
            title: titleMatch[1].replace(/[\n\r]+/g, ' ').trim(),
            authors: auths.length > 0 ? auths : [authorStr],
            year: yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear(),
            journal: journalMatch ? journalMatch[2].trim() : 'Scientific Journal',
            doi: doiMatch ? doiMatch[1].trim() : undefined,
            abstract: abstractMatch ? abstractMatch[1].replace(/[\n\r]+/g, ' ').trim() : 'Abstract imported via BibTeX bibliography.',
            sourceDatabase: 'Manual',
            screeningStage: 'title_abstract',
            decision: 'unscreened',
            evidenceCitations: [],
          });
        }
      }
      if (results.length > 0) return results;
    }

    // 3. Check RIS
    if (raw.includes('TY  -') || raw.includes('TI  -')) {
      const records = raw.split(/ER\s+-/i).filter((s) => s.trim().length > 10);
      for (const rec of records) {
        const lines = rec.split('\n');
        let t = '';
        const a: string[] = [];
        let y = new Date().getFullYear();
        let j = '';
        let d = '';
        let ab = '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('TI  -') || trimmed.startsWith('T1  -')) t = trimmed.slice(5).trim();
          if (trimmed.startsWith('AU  -') || trimmed.startsWith('A1  -')) a.push(trimmed.slice(5).trim());
          if (trimmed.startsWith('PY  -') || trimmed.startsWith('Y1  -')) {
            const ym = trimmed.match(/\d{4}/);
            if (ym) y = parseInt(ym[0], 10);
          }
          if (trimmed.startsWith('JO  -') || trimmed.startsWith('JF  -') || trimmed.startsWith('T2  -')) j = trimmed.slice(5).trim();
          if (trimmed.startsWith('DO  -')) d = trimmed.slice(5).trim();
          if (trimmed.startsWith('AB  -') || trimmed.startsWith('N2  -')) ab = trimmed.slice(5).trim();
        }

        if (t) {
          results.push({
            id: makeUniqueId('art-ris'),
            projectId: project?.id,
            sourceFileName,
            title: t,
            authors: a.length > 0 ? a : ['Unknown Author'],
            year: y,
            journal: j || 'Academic Publication',
            doi: d || undefined,
            abstract: ab || 'Abstract imported via RIS reference format.',
            sourceDatabase: 'Manual',
            screeningStage: 'title_abstract',
            decision: 'unscreened',
            evidenceCitations: [],
          });
        }
      }
      if (results.length > 0) return results;
    }

    // 4. Header-aware RFC CSV / TSV parser (ONLY for .csv/.tsv files OR genuine tabular exports with valid bib headers)
    // Never line-split prose .txt manuscripts on commas!
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return results;

    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
    const headerColsRaw = splitCsvLine(firstLine, delimiter);
    const headerCols = headerColsRaw.map((h) => h.toLowerCase().trim());
    const looksLikeHeaderCols =
      headerColsRaw.length >= 2 &&
      headerColsRaw.every((col) => col.length > 0 && col.length <= 60);
    const hasTitleHeader = headerCols.some(
      (h) =>
        h === 'title' ||
        h === 'ti' ||
        h === 'document title' ||
        h === 'article title' ||
        h === 'paper title' ||
        h === 'publication title'
    );
    const hasOtherBibHeader = headerCols.some((h) =>
      ['author', 'authors', 'au', 'year', 'publication year', 'py', 'doi', 'journal', 'source title', 'abstract'].includes(h)
    );
    const hasHeader =
      lines.length > 1 && looksLikeHeaderCols && (hasTitleHeader || hasOtherBibHeader);
    const isExplicitCsvOrTsv = Boolean(sourceFileName && /\.(csv|tsv)$/i.test(sourceFileName));

    if (!isExplicitCsvOrTsv && !hasHeader) {
      return results;
    }

    const findCol = (names: string[]) => headerCols.findIndex((h) => names.some((n) => h === n || h.includes(n)));
    const titleIdx = hasHeader ? Math.max(0, findCol(['title', 'document title', 'article title', 'ti'])) : 0;
    const authorIdx = hasHeader ? findCol(['author', 'authors', 'au']) : 1;
    const yearIdx = hasHeader ? findCol(['year', 'publication year', 'py']) : 2;
    const journalIdx = hasHeader ? findCol(['journal', 'source title', 'venue', 'publication title', 'booktitle']) : 3;
    const doiIdx = hasHeader ? findCol(['doi']) : 4;
    const abstractIdx = hasHeader ? findCol(['abstract', 'summary']) : 5;
    const dbIdx = hasHeader ? findCol(['database', 'source database', 'source']) : -1;

    const startRow = hasHeader ? 1 : 0;
    for (let i = startRow; i < lines.length; i++) {
      const parts = splitCsvLine(lines[i], delimiter);
      const rawTitle = parts[titleIdx] || parts[0] || '';
      if (rawTitle && rawTitle.length > 3 && parts.length >= 2) {
        const authorsRaw = authorIdx >= 0 ? parts[authorIdx] : '';
        const yearRaw = yearIdx >= 0 ? parts[yearIdx] : '';
        const parsedYear = parseInt((yearRaw || '').match(/\d{4}/)?.[0] || '', 10);
        results.push({
          id: makeUniqueId('art-csv'),
          projectId: project?.id,
          sourceFileName,
          title: rawTitle,
          authors: authorsRaw ? authorsRaw.split(/[;|]/).map((s) => s.trim()).filter(Boolean) : ['Author Unknown'],
          year: !isNaN(parsedYear) ? parsedYear : new Date().getFullYear(),
          journal: (journalIdx >= 0 && parts[journalIdx]) || 'Journal Article',
          doi: (doiIdx >= 0 && parts[doiIdx]) || undefined,
          abstract: (abstractIdx >= 0 && parts[abstractIdx]) || 'Imported bibliographic record.',
          sourceDatabase: (dbIdx >= 0 && parts[dbIdx]) || 'Manual',
          screeningStage: 'title_abstract',
          decision: 'unscreened',
          evidenceCitations: [],
        });
      }
    }

    return results;
  };

  // 4. Commit resolved articles from Bulk Local
  const handleImportResolvedBulk = () => {
    if (resolvedArticles.length === 0) return;
    const lockedProjectId = targetProject?.id;

    if (onAddMultipleArticles) {
      onAddMultipleArticles(resolvedArticles, { targetProjectId: lockedProjectId });
    } else {
      resolvedArticles.forEach((a) => onAddArticle(a, lockedProjectId));
    }
    setResolvedArticles([]);
    onClose();
  };

  // Clear manual fields back to blank placeholders
  const handleClearManual = () => {
    setManualTitle('');
    setManualAuthors('');
    setManualYear('');
    setManualJournal('');
    setManualDoi('');
    setManualDatabase('Manual');
    setManualAbstract('');
    setManualFullText('');
    setManualPlatform('');
    setManualSensor('');
    setManualGsd('');
    setManualLatency('');
    setManualMetrics('');
    setManualError('');
  };

  // Manual Paper Submit (with pure manual option)
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) {
      setManualError('Please enter a Research Paper Title (or type a title in the placeholder field).');
      return;
    }

    const lockedProject = targetProject;
    const lockedProjectId = lockedProject?.id;
    const effectiveManualDb =
      manualDatabase === 'Other' && manualCustomDatabase.trim()
        ? manualCustomDatabase.trim()
        : manualDatabase;
    const baseArt: Article = {
      id: makeUniqueId('art-manual'),
      projectId: lockedProjectId,
      title: manualTitle.trim(),
      authors: manualAuthors.trim()
        ? manualAuthors.split(/;|,/).map((s) => s.trim()).filter(Boolean)
        : ['Author Unknown'],
      year: parseInt(manualYear.trim()) || new Date().getFullYear(),
      journal: manualJournal.trim() || 'Academic Publication',
      doi: manualDoi.trim() || undefined,
      abstract: manualAbstract.trim() || 'Manual research paper entry.',
      fullText: manualFullText.trim() || undefined,
      sourceDatabase: effectiveManualDb,
      screeningStage: 'title_abstract',
      decision: 'unscreened',
      evidenceCitations: [],
      extractedData: {
        platform: manualPlatform.trim() || undefined,
        sensor: manualSensor.trim() || undefined,
        gsd: manualGsd.trim() || undefined,
        latency: manualLatency.trim() || undefined,
        latencyReported: !!manualLatency.trim(),
        metrics: manualMetrics.trim() || undefined,
      },
    };
    const pType = classifyPaperType(baseArt);
    const newArt: Article = {
      ...baseArt,
      paperCategory: pType.category,
      paperSubType: pType.subType,
    };

    const finalArt = pureManualMode ? newArt : applyAutoScreening(newArt, lockedProject);
    onAddArticle(finalArt, lockedProjectId);

    if (keepOpenAfterAdd) {
      handleClearManual();
      setManualSuccessMsg(`Successfully added "${newArt.title.slice(0, 45)}..." to "${lockedProject?.title || 'Review'}"!`);
      setTimeout(() => setManualSuccessMsg(''), 4000);
    } else {
      handleClearManual();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-3xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-slate-800">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-indigo-600 to-teal-500 text-white rounded-xl shadow-md">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <span>Research Paper Uploader & Manual Inserter</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Manual & Auto-Sync
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Insert single papers manually with clean empty placeholders, or import in bulk from local files and online academic databases.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation - Manual Paper Insertion is 1st tab */}
        <div className="flex items-center px-4 pt-2.5 bg-slate-950/80 border-b border-slate-800 gap-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-2 border-b-2 cursor-pointer shrink-0 ${
              activeTab === 'manual'
                ? 'text-indigo-400 border-indigo-500 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <FileText className="w-4 h-4 text-indigo-400" />
            <span>Manual Paper Insertion (Blank Placeholders)</span>
          </button>

          <button
            onClick={() => setActiveTab('bulk_local')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-2 border-b-2 cursor-pointer shrink-0 ${
              activeTab === 'bulk_local'
                ? 'text-teal-400 border-teal-500 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Files className="w-4 h-4 text-teal-400" />
            <span>Select Local Files & File Names (Bulk)</span>
          </button>

          <button
            onClick={() => setActiveTab('online')}
            className={`px-3 py-2 text-xs font-medium rounded-t-xl transition flex items-center gap-1.5 border-b-2 cursor-pointer shrink-0 ${
              activeTab === 'online'
                ? 'text-purple-400 border-purple-500 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-purple-400" />
            <span>Online Multi-Search (6+ DBs · PDF &amp; Related)</span>
          </button>
        </div>

        {/* Persistent Target Partitioned Review Database Selector (Applies to Manual, Bulk Local & Online Tabs) */}
        <div className="px-6 py-3 bg-slate-950/90 border-b border-slate-800 space-y-2 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
                Target Partitioned Article Library &amp; Storing Database (1 Independent DB per Review)
              </span>
              <p className="text-[11px] text-slate-400">
                Files and papers added here are stored ONLY in the selected review&apos;s isolated database—never mixed into other reviews.
              </p>
            </div>
            {onCreateNewReview && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  onClose();
                  onCreateNewReview();
                }}
                className="px-3 py-1.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-[11px] inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ New Partitioned Review DB</span>
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            {allProjects.length > 0 ? (
              <select
                value={targetProject?.id || ''}
                disabled={isProcessing}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedTargetId(nextId);
                  if (onSwitchProject) onSwitchProject(nextId);
                }}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {allProjects.map((proj) => {
                  const cnt = (proj.articles || []).filter((a) => !a.projectId || a.projectId === proj.id).length;
                  return (
                    <option key={proj.id} value={proj.id}>
                      {proj.title || 'Untitled Review'} ({cnt} articles in partition)
                    </option>
                  );
                })}
              </select>
            ) : (
              <p className="font-bold text-white truncate text-xs flex-1">{targetProject?.title || 'Active Review'}</p>
            )}

            <span className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] shrink-0">
              {targetProject?.articles?.length || 0} articles in partition
            </span>
          </div>

          <p className="font-mono text-[10px] text-teal-400 truncate">
            Storing Database: {targetProject?.databaseFolderPath || `database/reviews/${targetProject?.id || 'review'}`}/articles.json
          </p>
        </div>

        {/* TAB 1: BULK LOCAL FILES & FILE NAMES (CONTINUOUS UNBOUNDED UPLOADER) */}
        {activeTab === 'bulk_local' && (
          <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">

            {/* Bulk Import Controls (No auto-inclusion) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950/70 p-3 rounded-2xl border border-slate-800 text-[11px]">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoStreamToLibrary}
                  onChange={(e) => setAutoStreamToLibrary(e.target.checked)}
                  className="rounded accent-teal-500 cursor-pointer"
                />
                <span>
                  <strong className="text-white">Stream Selected Files:</strong> Save selected files in batches
                </span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={screenByEligibilityOnImport}
                  onChange={(e) => setScreenByEligibilityOnImport(e.target.checked)}
                  className="rounded accent-indigo-500 cursor-pointer"
                />
                <span>
                  <strong className="text-white">Attach Eligibility Hint:</strong> Advisory only (stays Unscreened)
                </span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enrichFromWeb}
                  onChange={(e) => setEnrichFromWeb(e.target.checked)}
                  className="rounded accent-purple-500 cursor-pointer"
                />
                <span>
                  <strong className="text-white">Auto-Sync Metadata:</strong> Bounded web lookup (never stalls)
                </span>
              </label>

              <div className="sm:col-span-3 flex flex-col gap-2 pt-2 border-t border-slate-800/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-slate-400">
                    <strong className="text-slate-200">Where Articles Were Found (Optional):</strong> Assign database source (incl. Google Scholar or custom) or auto-detect
                  </span>
                  <select
                    value={bulkSourceDatabase}
                    onChange={(e) => setBulkSourceDatabase(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-[11px] text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="auto">Auto-Detect (URL / DOI / File)</option>
                    {DATABASE_PROVENANCE_OPTIONS.map((db) => (
                      <option key={db} value={db}>
                        {db === 'Other' ? 'Other (Write Custom Database Name)...' : db}
                      </option>
                    ))}
                  </select>
                </div>
                {bulkSourceDatabase === 'Other' && (
                  <input
                    type="text"
                    placeholder="Write custom database name (e.g. ResearchGate, AGRIS, CORE, Institutional Repo)..."
                    value={bulkCustomDatabase}
                    onChange={(e) => setBulkCustomDatabase(e.target.value)}
                    className="w-full bg-slate-900 border border-indigo-600/60 rounded-xl px-3 py-1.5 text-[11px] text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                  />
                )}
              </div>
            </div>

            {/* File Selection Dropzone (Individual/Multi-File Selection ONLY — Folder Auto-Import Disabled) */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleStagePickedFiles(e.dataTransfer.files);
              }}
              className={`border-2 border-dashed rounded-3xl p-5 text-center transition ${
                dragActive
                  ? 'border-indigo-400 bg-indigo-950/40 ring-4 ring-indigo-500/20'
                  : 'border-slate-700 bg-slate-950/60 hover:border-slate-600'
              }`}
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-indigo-400" />
              <p className="text-white font-bold text-sm mb-1">
                Select Specific Local File(s) to Stage for Upload
              </p>
              <p className="text-slate-400 text-xs mb-3 max-w-lg mx-auto">
                Folder auto-importing is disabled. Pick specific files from your drive, check the exact files you want to upload, and every selected file enters this partition as <strong>Unscreened</strong> (no auto-inclusion).
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <label className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white rounded-xl font-bold cursor-pointer inline-flex items-center gap-2 shadow-md">
                  <Upload className="w-4 h-4" />
                  <span>Select File(s) from Drive</span>
                  <input
                    ref={addFileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.bib,.ris,.csv,.tsv,.txt,.json,.enw,.nbib,.ciw,.xml,.md,.doc,.docx"
                    onChange={(e) => {
                      handleStagePickedFiles(e.target.files);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Staged Local Files Selection Checklist (User must explicitly select which files to upload) */}
            {stagedLocalFiles.length > 0 && (
              <div className="p-4 bg-slate-950 border border-indigo-800/60 rounded-2xl space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const allSelected = stagedLocalFiles.every((f) => f.selected);
                        handleSelectAllStagedFiles(!allSelected);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 inline-flex items-center gap-1.5 cursor-pointer font-semibold"
                    >
                      {stagedLocalFiles.every((f) => f.selected) ? (
                        <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>
                        {stagedLocalFiles.every((f) => f.selected) ? 'Deselect All' : 'Select All'} ({stagedLocalFiles.length})
                      </span>
                    </button>
                    <span className="text-slate-400 text-[11px]">
                      {stagedLocalFiles.filter((f) => f.selected).length} of {stagedLocalFiles.length} file(s) selected
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isProcessing || stagedLocalFiles.filter((f) => f.selected).length === 0}
                      onClick={handleUploadSelectedFiles}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer transition shadow-sm"
                    >
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>Upload Selected ({stagedLocalFiles.filter((f) => f.selected).length})</span>
                    </button>

                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setStagedLocalFiles([])}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 font-semibold cursor-pointer transition"
                    >
                      Clear Queue
                    </button>
                  </div>
                </div>

                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {stagedLocalFiles.slice(0, 200).map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition ${
                        item.selected
                          ? 'bg-indigo-950/40 border-indigo-500/60 text-white'
                          : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => handleToggleStagedFile(item.id)}
                          className="rounded accent-indigo-500 cursor-pointer shrink-0"
                        />
                        <span className="font-mono text-[11px] truncate">{item.file.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {(item.file.size / 1024).toFixed(1)} KB
                      </span>
                    </label>
                  ))}
                  {stagedLocalFiles.length > 200 && (
                    <p className="text-[10px] text-slate-400 text-center py-1">
                      Showing first 200 of {stagedLocalFiles.length} staged files. Use Select All to include all {stagedLocalFiles.length} files.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Checkbox File Manager for Uploaded / Library Files (Add New File, Delete Checked, Clear File) */}
            {(uploadedFileRecords.length > 0 || (targetProject?.articles?.length || 0) > 0) && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {uploadedFileRecords.length > 0 && (
                      <button
                        type="button"
                        onClick={handleToggleAllFilesCheck}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 inline-flex items-center gap-1.5 cursor-pointer font-semibold"
                      >
                        {checkedFileIds.size === uploadedFileRecords.length && uploadedFileRecords.length > 0 ? (
                          <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span>
                          Select All ({uploadedFileRecords.length})
                        </span>
                      </button>
                    )}
                    <span className="text-slate-400 text-[11px]">
                      {targetProject?.articles?.length || 0} file(s) currently in library folder
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addFileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add New File</span>
                    </button>

                    <button
                      type="button"
                      disabled={checkedFileIds.size === 0 || isProcessing}
                      onClick={handleDeleteCheckedFiles}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Checked ({checkedFileIds.size})</span>
                    </button>

                    {confirmClearFolder ? (
                      <div className="inline-flex items-center gap-1.5 bg-rose-950/70 border border-rose-700/80 rounded-lg px-2 py-1">
                        <span className="text-[11px] font-semibold text-rose-200">Clear all?</span>
                        <button
                          type="button"
                          onClick={handleClearAllFiles}
                          className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] cursor-pointer"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClearFolder(false)}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] cursor-pointer"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isProcessing || (uploadedFileRecords.length === 0 && (targetProject?.articles?.length || 0) === 0)}
                        onClick={() => setConfirmClearFolder(true)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-200 hover:text-rose-300 border border-slate-700 hover:border-rose-700/60 disabled:opacity-40 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Clear Folder Files</span>
                      </button>
                    )}
                  </div>
                </div>

                {uploadedFileRecords.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {uploadedFileRecords.slice(0, 150).map((rec) => {
                      const isChecked = checkedFileIds.has(rec.id);
                      return (
                        <label
                          key={rec.id}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition ${
                            isChecked
                              ? 'bg-rose-950/30 border-rose-500/60 text-white'
                              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleFileCheck(rec.id)}
                              className="rounded accent-rose-500 cursor-pointer shrink-0"
                            />
                            <span className="font-mono text-[11px] truncate">{rec.fileName}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            {rec.articleIds.length} record(s)
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Live Continuous Upload Progress Bar (never aborts on >60s) */}
            {(isProcessing || bulkProgress.total > 0) && (
              <div className="p-4 bg-slate-950 border border-teal-800/60 rounded-2xl space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-teal-300 flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 text-teal-400 shrink-0 ${isProcessing && !isPaused ? 'animate-spin' : ''}`} />
                    <span className="truncate max-w-md">{processStatus}</span>
                  </span>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-slate-300">
                      {bulkProgress.processed} / {bulkProgress.total} files
                    </span>
                    <span className="text-amber-300">({bulkProgress.elapsedSeconds}s elapsed)</span>
                    {isProcessing && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            pauseRef.current = !pauseRef.current;
                            setIsPaused(pauseRef.current);
                          }}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 cursor-pointer"
                        >
                          {isPaused ? 'Resume' : 'Pause'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            cancelRef.current = true;
                          }}
                          className="px-2 py-0.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 cursor-pointer"
                        >
                          Stop
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-teal-500 to-emerald-400 transition-all duration-200"
                    style={{
                      width: `${bulkProgress.total > 0 ? Math.round((bulkProgress.processed / bulkProgress.total) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Paste File Names or Article Titles */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-slate-300 font-bold text-xs flex items-center gap-1.5">
                  <ListPlus className="w-4 h-4 text-indigo-400" />
                  <span>Or Paste Article File Names or Titles (1 per line)</span>
                </label>
              </div>

              <textarea
                rows={3}
                placeholder="Paste list of filenames like '2023_smith_drone_stress.pdf' or titles or DOIs..."
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleProcessPastedText}
                  disabled={isProcessing || !batchText.trim()}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl font-bold transition inline-flex items-center gap-1.5 text-xs shadow-sm cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>Import & Screen Pasted Names</span>
                </button>
              </div>
            </div>

            {/* Resolved Articles Preview (when auto-stream is disabled or manually queued) */}
            {resolvedArticles.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{resolvedArticles.length} Staged Articles Ready (Screened Against Eligibility Criteria)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setResolvedArticles([])}
                    className="text-slate-400 hover:text-rose-400 text-[11px] cursor-pointer"
                  >
                    Clear List
                  </button>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {resolvedArticles.slice(0, 100).map((art) => (
                    <div
                      key={art.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2 py-0.2 rounded text-[10px] font-bold uppercase ${
                              art.decision === 'include'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : art.decision === 'exclude'
                                ? 'bg-rose-500/20 text-rose-300'
                                : art.decision === 'uncertain'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            Eligibility: {art.decision}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-indigo-300">
                            {art.sourceDatabase}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">{art.year}</span>
                        </div>
                        <p className="font-semibold text-white truncate text-xs">{art.title}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {art.authors?.slice(0, 3).join(', ')} — <span className="italic">{art.journal}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                  {resolvedArticles.length > 100 && (
                    <p className="text-center text-[11px] text-slate-400 py-1">
                      ...and {resolvedArticles.length - 100} additional staged articles ready to commit.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Bottom Actions: Add New File / Delete / Clear (removed "streamed to" backup text & Done/Close button) */}
            {resolvedArticles.length > 0 && (
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleImportResolvedBulk}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-md transition inline-flex items-center gap-2 cursor-pointer text-xs"
                >
                  <FileCheck2 className="w-4 h-4" />
                  <span>Add {resolvedArticles.length} Staged File(s) to Library</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: FAST ONLINE MULTI-SEARCH, DOWNLOAD & PRISMA RETRIEVAL RECORDER */}
        {activeTab === 'online' && (
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 text-xs">
            <FastOnlineSearchPanel
              project={targetProject}
              targetProjectId={targetProject?.id}
              onAddArticles={(articles, options) => {
                const lockedProjectId = options?.targetProjectId || targetProject?.id;
                if (onAddMultipleArticles) {
                  onAddMultipleArticles(articles, {
                    keepOpen: options?.keepOpen ?? true,
                    targetProjectId: lockedProjectId,
                  });
                } else {
                  articles.forEach((a) => onAddArticle(a, lockedProjectId));
                }
              }}
              onClose={onClose}
              compact
            />
          </div>
        )}

        {/* TAB: MANUAL PAPER INSERTION (CLEAN PLACEHOLDERS, NOT AUTO-FILLED) */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
            {manualSuccessMsg && (
              <div className="p-3 bg-emerald-950/50 border border-emerald-800 rounded-2xl text-emerald-300 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{manualSuccessMsg}</span>
                </div>
              </div>
            )}

            {manualError && (
              <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-2xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{manualError}</span>
              </div>
            )}

            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  Manual Research Paper Insertion
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  All fields start completely empty with instructional placeholders (not auto-filled). Type or paste your study metadata.
                </p>
              </div>

              <button
                type="button"
                onClick={handleClearManual}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition cursor-pointer self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5"
                title="Reset all inputs back to empty placeholders"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Placeholders</span>
              </button>
            </div>

            {/* Research Paper Title */}
            <div>
              <label className="block text-slate-200 font-bold mb-1">
                Research Paper Title * <span className="text-slate-400 font-normal">(Empty placeholder — type paper title)</span>
              </label>
              <input
                type="text"
                placeholder="Enter research paper title (e.g., Deep Learning-Based UAV Multispectral Weed Detection in Maize)..."
                value={manualTitle}
                onChange={(e) => {
                  setManualTitle(e.target.value);
                  if (manualError) setManualError('');
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>

            {/* Authors & Publication Year */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-slate-300 font-semibold mb-1">
                  Authors <span className="text-slate-400 font-normal">(comma or semicolon separated)</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter authors (e.g., Ramirez, J., Santos, C., Alvarez, M.)..."
                  value={manualAuthors}
                  onChange={(e) => setManualAuthors(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Publication Year <span className="text-slate-400 font-normal">(Leave blank or enter year)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2025"
                  value={manualYear}
                  onChange={(e) => setManualYear(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Journal & DOI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Journal / Conference Name</label>
                <input
                  type="text"
                  placeholder="Enter journal or conference (e.g., Remote Sensing of Environment, IEEE TGRS)..."
                  value={manualJournal}
                  onChange={(e) => setManualJournal(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">DOI Identifier (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 10.1016/j.rse.2023.113456"
                  value={manualDoi}
                  onChange={(e) => setManualDoi(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Database Provenance (Optional) */}
            <div className="space-y-2">
              <label className="block text-slate-300 font-semibold mb-1">
                Where Article Was Found <span className="text-slate-400 font-normal">(Optional Database Provenance)</span>
              </label>
              <select
                value={manualDatabase}
                onChange={(e) => setManualDatabase(e.target.value as DatabaseProvenance)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="Manual">Manual Entry (Optional / Unspecified)</option>
                <option value="Google Scholar">Google Scholar</option>
                <option value="Scopus">Scopus</option>
                <option value="PubMed">PubMed</option>
                <option value="ScienceDirect">ScienceDirect</option>
                <option value="MDM">MDM</option>
                <option value="MDPI">MDPI</option>
                <option value="Web of Science">Web of Science</option>
                <option value="IEEE Xplore">IEEE Xplore</option>
                <option value="arXiv">arXiv</option>
                <option value="OpenAlex">OpenAlex</option>
                <option value="CAB Abstracts">CAB Abstracts</option>
                <option value="Springer">Springer</option>
                <option value="Wiley">Wiley</option>
                <option value="Other">Other (Specify optionally)</option>
              </select>
              {manualDatabase === 'Other' && (
                <input
                  type="text"
                  placeholder="Optional custom database name (e.g. ResearchGate, CORE, ERIC)..."
                  value={manualCustomDatabase}
                  onChange={(e) => setManualCustomDatabase(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>

            {/* Abstract */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Article Abstract <span className="text-slate-400 font-normal">(Optional — paste abstract text)</span>
              </label>
              <textarea
                rows={3}
                placeholder="Paste or type article abstract text here..."
                value={manualAbstract}
                onChange={(e) => setManualAbstract(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Methodology Notes */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Full Text / Key Methodology Notes <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                rows={2}
                placeholder="Paste key methodology notes, flight parameters, experimental setup, sample sizes, or findings..."
                value={manualFullText}
                onChange={(e) => setManualFullText(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Optional Extracted Parameters */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-2">
              <label className="block text-slate-300 font-semibold text-xs">
                Extraction Parameters <span className="text-slate-500 font-normal">(Optional — all blank placeholders)</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Platform</label>
                  <input
                    type="text"
                    placeholder="e.g. DJI Matrice 300"
                    value={manualPlatform}
                    onChange={(e) => setManualPlatform(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white placeholder:text-slate-500 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Sensor</label>
                  <input
                    type="text"
                    placeholder="e.g. RedEdge-P"
                    value={manualSensor}
                    onChange={(e) => setManualSensor(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white placeholder:text-slate-500 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Latency</label>
                  <input
                    type="text"
                    placeholder="e.g. 14.2 min"
                    value={manualLatency}
                    onChange={(e) => setManualLatency(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white placeholder:text-slate-500 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">GSD / Resolution</label>
                  <input
                    type="text"
                    placeholder="e.g. 2.5 cm/px"
                    value={manualGsd}
                    onChange={(e) => setManualGsd(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white placeholder:text-slate-500 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Mode toggles */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pureManualMode}
                  onChange={(e) => setPureManualMode(e.target.checked)}
                  className="rounded accent-indigo-600 cursor-pointer"
                />
                <span>
                  <strong className="text-white">Pure Manual Insertion:</strong> Keep unscreened without auto-evaluating or auto-filling
                </span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepOpenAfterAdd}
                  onChange={(e) => setKeepOpenAfterAdd(e.target.checked)}
                  className="rounded accent-indigo-600 cursor-pointer"
                />
                <span>Insert another paper after adding</span>
              </label>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleClearManual}
                className="text-slate-400 hover:text-white text-xs underline cursor-pointer"
              >
                Reset to blank placeholders
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white font-bold shadow-md transition inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Insert Research Paper (Manual)</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
