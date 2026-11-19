import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenText,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileDown,
  FileText,
  Info,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Pause,
  Play,
  Quote,
  Radio,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  Article,
  BriefingStudioSavedState,
  ModuleQaRescanRecord,
  PodcastEpisode,
  ReviewProject,
  WorkbenchModuleId,
} from '../types';
import { apiService } from '../services/apiService';
import {
  buildGroundedArticleTextSource,
  CitationStyleId,
  formatBibTexEntries,
  formatInlineCitation,
  formatReferenceString,
  RECOMMENDED_CITATION_STYLES,
} from '../utils/citationFormatter';
import { AutoSaveStatusInfo, ModuleWorkbenchControls } from './ModuleWorkbenchControls';

type CorpusScopeMode = 'included' | 'included_starred' | 'selected' | 'all';
type ResponseModeId = 'qa' | 'flexible_review' | 'rq_matrix' | 'methods_critique' | 'custom_outline';
type StudioPanelTab = 'chat' | 'audio';

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  model?: string;
  citationStyle?: CitationStyleId;
  citedPaperCount?: number;
  responseMode?: ResponseModeId;
  timestamp: string;
}

export interface ResearchBriefingModuleProps {
  project: ReviewProject;
  articles: Article[];
  preselectedIds?: Set<string>;
  onUpdateArticles?: (updated: Article[]) => void;
  initialFullscreen?: boolean;
  onCloseFullscreen?: () => void;
  autoSaveStatus?: AutoSaveStatusInfo;
  onSaveBriefingState?: (state: BriefingStudioSavedState, immediate?: boolean) => void;
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
  onOpenBulkImporter?: () => void;
}

function renderMarkdownBlock(md: string): React.ReactNode {
  const lines = (md || '').split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  const renderInline = (text: string, keyPrefix: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={`${keyPrefix}-b-${idx}`} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return (
          <em key={`${keyPrefix}-i-${idx}`} className="italic text-slate-200">
            {part.slice(1, -1)}
          </em>
        );
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code
            key={`${keyPrefix}-c-${idx}`}
            className="px-1.5 py-0.5 rounded bg-slate-800 text-teal-300 font-mono text-[12px]"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (linkMatch) {
        return (
          <a
            key={`${keyPrefix}-l-${idx}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 underline"
          >
            {linkMatch[1]}
          </a>
        );
      }
      return <React.Fragment key={`${keyPrefix}-t-${idx}`}>{part}</React.Fragment>;
    });
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
      const headerCells = trimmed
        .split('|')
        .map((c) => c.trim())
        .filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''));
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const rowCells = lines[i]
          .trim()
          .split('|')
          .map((c) => c.trim())
          .filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''));
        rows.push(rowCells);
        i++;
      }
      nodes.push(
        <div key={`tbl-${i}`} className="my-3 overflow-x-auto rounded-lg border border-slate-800">
          <table className="min-w-full text-left text-xs border-collapse">
            <thead className="bg-slate-900 text-slate-200 border-b border-slate-800">
              <tr>
                {headerCells.map((h, hIdx) => (
                  <th key={hIdx} className="px-3 py-2 font-semibold">
                    {renderInline(h, `th-${i}-${hIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-950/60">
              {rows.map((r, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-900/40">
                  {headerCells.map((_, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-slate-300 align-top">
                      {renderInline(r[cIdx] || '', `td-${i}-${rIdx}-${cIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (trimmed.startsWith('### ')) {
      nodes.push(
        <h4 key={`h3-${i}`} className="text-sm font-bold text-teal-300 mt-4 mb-1.5">
          {renderInline(trimmed.slice(4), `h3-${i}`)}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      nodes.push(
        <h3 key={`h2-${i}`} className="text-base font-bold text-white mt-5 mb-2 pb-1 border-b border-slate-800">
          {renderInline(trimmed.slice(3), `h2-${i}`)}
        </h3>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      nodes.push(
        <h2 key={`h1-${i}`} className="text-lg font-bold text-white mt-4 mb-2">
          {renderInline(trimmed.slice(2), `h1-${i}`)}
        </h2>
      );
      i++;
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 my-2 space-y-1 text-slate-200">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item, `li-${i}-${idx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 my-2 space-y-1 text-slate-200">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item, `oli-${i}-${idx}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    nodes.push(
      <p key={`p-${i}`} className="text-slate-200 leading-relaxed my-2">
        {renderInline(trimmed, `p-${i}`)}
      </p>
    );
    i++;
  }

  return <div className="text-sm space-y-0.5">{nodes}</div>;
}

export const ResearchBriefingModule: React.FC<ResearchBriefingModuleProps> = ({
  project,
  articles,
  preselectedIds,
  onUpdateArticles,
  initialFullscreen = false,
  onCloseFullscreen,
  autoSaveStatus,
  onSaveBriefingState,
  onResetWorkbenchModule,
  onDirectAddDataFiles,
  onRescanWithQueryQA,
  onDeleteQaEntry,
  onOpenBulkImporter,
}) => {
  const savedBriefing = project.workbenchState?.briefing;
  const includedList = useMemo(() => articles.filter((a) => a.decision === 'include'), [articles]);
  const includedOrStarredList = useMemo(
    () => articles.filter((a) => a.decision === 'include' || a.isStarred),
    [articles]
  );
  const selectedList = useMemo(
    () => (preselectedIds && preselectedIds.size > 0 ? articles.filter((a) => preselectedIds.has(a.id)) : []),
    [articles, preselectedIds]
  );

  const [isFullscreen, setIsFullscreen] = useState<boolean>(initialFullscreen);
  const [studioTab, setStudioTab] = useState<StudioPanelTab>('chat');
  const [mobileColumn, setMobileColumn] = useState<'sources' | 'workspace'>('workspace');

  const [scopeMode, setScopeMode] = useState<CorpusScopeMode>(() => {
    if (savedBriefing?.scopeMode) return savedBriefing.scopeMode;
    if (includedList.length > 0) return 'included';
    if (selectedList.length > 0) return 'selected';
    return 'all';
  });
  const [excludedPaperIds, setExcludedPaperIds] = useState<Set<string>>(
    () => new Set(savedBriefing?.excludedPaperIds || [])
  );
  const [citationStyle, setCitationStyle] = useState<CitationStyleId>(
    () => (savedBriefing?.citationStyle as CitationStyleId) || 'apa7'
  );
  const [responseMode, setResponseMode] = useState<ResponseModeId>(
    () => (savedBriefing?.responseMode as ResponseModeId) || 'qa'
  );
  const [customOutline, setCustomOutline] = useState<string>(() => savedBriefing?.customOutline || '');
  const [selectedModel, setSelectedModel] = useState<'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'>(
    () => savedBriefing?.selectedModel || 'gemini-4-hydrogen'
  );

  // Research Chat state (hydrated from workbench_state.json)
  const [inputPrompt, setInputPrompt] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>(() =>
    (savedBriefing?.chatHistory || []).map((t) => ({
      ...t,
      citationStyle: t.citationStyle as CitationStyleId | undefined,
      responseMode: t.responseMode as ResponseModeId | undefined,
    }))
  );
  const [isSending, setIsSending] = useState(false);
  const [keyMissingError, setKeyMissingError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  // Two-Host Audio Overview state (hydrated from workbench_state.json)
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [voiceNarrationEnabled, setVoiceNarrationEnabled] = useState<boolean>(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState<boolean>(false);
  const [podcastEpisode, setPodcastEpisode] = useState<PodcastEpisode | null>(
    () => savedBriefing?.podcastEpisode || null
  );

  // Export & full-text sync state
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isFetchingFullTexts, setIsFetchingFullTexts] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const hydratedProjectIdRef = useRef<string>(project.id);

  useEffect(() => {
    setIsFullscreen(initialFullscreen);
  }, [initialFullscreen]);

  // Hydrate persisted NotebookLM studio state when switching review folders
  useEffect(() => {
    if (hydratedProjectIdRef.current === project.id) return;
    hydratedProjectIdRef.current = project.id;
    const saved = project.workbenchState?.briefing;
    if (saved?.scopeMode) setScopeMode(saved.scopeMode);
    else if (includedList.length > 0) setScopeMode('included');
    else if (selectedList.length > 0) setScopeMode('selected');
    else setScopeMode('all');

    setExcludedPaperIds(new Set(saved?.excludedPaperIds || []));
    setCitationStyle((saved?.citationStyle as CitationStyleId) || 'apa7');
    setResponseMode((saved?.responseMode as ResponseModeId) || 'qa');
    setCustomOutline(saved?.customOutline || '');
    setSelectedModel(saved?.selectedModel || 'gemini-4-hydrogen');
    setChatHistory(
      (saved?.chatHistory || []).map((t) => ({
        ...t,
        citationStyle: t.citationStyle as CitationStyleId | undefined,
        responseMode: t.responseMode as ResponseModeId | undefined,
      }))
    );
    setPodcastEpisode(saved?.podcastEpisode || null);
    setIsPlaying(false);
    setCurrentTurnIndex(0);
    setExportStatus(null);
  }, [project.id, project.workbenchState?.briefing, includedList.length, selectedList.length]);

  const buildBriefingSnapshot = (overrides?: Partial<BriefingStudioSavedState>): BriefingStudioSavedState => ({
    scopeMode,
    excludedPaperIds: Array.from(excludedPaperIds),
    citationStyle,
    responseMode,
    customOutline,
    selectedModel,
    chatHistory,
    podcastEpisode,
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  // Auto-save studio settings & outline edits (debounced in App)
  const skipFirstAutoSaveRef = useRef(true);
  useEffect(() => {
    if (skipFirstAutoSaveRef.current) {
      skipFirstAutoSaveRef.current = false;
      return;
    }
    if (!onSaveBriefingState) return;
    onSaveBriefingState(buildBriefingSnapshot(), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMode, citationStyle, responseMode, customOutline, selectedModel, excludedPaperIds]);

  // Escape exits fullscreen mode
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onCloseFullscreen) onCloseFullscreen();
        else setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, onCloseFullscreen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isSending]);

  // Stop speech synthesis on unmount or pause
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (!isPlaying || !voiceNarrationEnabled) {
      window.speechSynthesis.cancel();
      return;
    }
    const turn = podcastEpisode?.script?.[currentTurnIndex];
    if (!turn) return;

    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(turn.text);
    utter.rate = playbackSpeed;
    utter.pitch = turn.speaker.includes('Sarah') ? 1.06 : 0.94;
    utter.onend = () => {
      setCurrentTurnIndex((prev) => {
        if (!podcastEpisode?.script || prev >= podcastEpisode.script.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    };
    window.speechSynthesis.speak(utter);

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [isPlaying, voiceNarrationEnabled, currentTurnIndex, podcastEpisode, playbackSpeed]);

  // Timer fallback when speech narration is off
  useEffect(() => {
    if (!isPlaying || voiceNarrationEnabled || !podcastEpisode?.script) return;
    const timer = setInterval(() => {
      setCurrentTurnIndex((prev) => {
        if (!podcastEpisode?.script || prev >= podcastEpisode.script.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 5000 / playbackSpeed);
    return () => clearInterval(timer);
  }, [isPlaying, voiceNarrationEnabled, podcastEpisode, playbackSpeed]);

  const scopedArticles = useMemo(() => {
    if (scopeMode === 'included') return includedList;
    if (scopeMode === 'included_starred') return includedOrStarredList;
    if (scopeMode === 'selected') return selectedList;
    return articles;
  }, [scopeMode, includedList, includedOrStarredList, selectedList, articles]);

  const activeArticles = useMemo(
    () => scopedArticles.filter((a) => !excludedPaperIds.has(a.id)),
    [scopedArticles, excludedPaperIds]
  );

  const pdfReadyCount = useMemo(
    () => activeArticles.filter((a) => Boolean(a.pdfUrl || a.openAccessUrl)).length,
    [activeArticles]
  );

  const fullTextReadyCount = useMemo(
    () => activeArticles.filter((a) => Boolean(a.fullText?.trim() || (a.pages && a.pages.length > 0))).length,
    [activeArticles]
  );

  const activeStyleMeta = useMemo(
    () => RECOMMENDED_CITATION_STYLES.find((s) => s.id === citationStyle) || RECOMMENDED_CITATION_STYLES[0],
    [citationStyle]
  );

  const markCopied = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2200);
  };

  const togglePaperActive = (id: string) => {
    setExcludedPaperIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleFullscreen = () => {
    if (isFullscreen && onCloseFullscreen) {
      onCloseFullscreen();
    } else {
      setIsFullscreen((v) => !v);
    }
  };

  const handleExportZip = async () => {
    if (activeArticles.length === 0) {
      setExportStatus('Select at least one paper in the corpus list before exporting.');
      return;
    }
    setIsExportingZip(true);
    setExportStatus('Fetching original PDFs & packaging NotebookLM archive...');
    try {
      const formattedReferences = activeArticles.map((art, idx) =>
        formatReferenceString(art, citationStyle, idx + 1)
      );

      const res = await fetch('/api/export/notebook-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: {
            id: project.id,
            title: project.title,
            subtitle: project.subtitle,
            scope: project.scope,
            picoc: project.picoc,
            researchQuestions: project.researchQuestions,
          },
          articles: activeArticles,
          citationStyle,
          includePdfs: true,
          formattedReferences,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Export failed (${res.status})`);
      }

      const pdfCount = res.headers.get('X-Export-Pdf-Count') || '0';
      const sourceCount = res.headers.get('X-Export-Source-Count') || String(activeArticles.length);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(project.id || 'review').replace(/[^a-zA-Z0-9_-]/g, '_')}-notebooklm-sources.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setExportStatus(
        `Exported ZIP: ${pdfCount} original PDF(s) + ${sourceCount} Markdown full-text sources + ${activeStyleMeta.shortLabel} references.`
      );
    } catch (err: any) {
      setExportStatus(`Export failed: ${err?.message || 'Unable to generate archive.'}`);
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleFetchMissingFullTexts = async () => {
    const candidates = activeArticles.filter(
      (a) => !a.fullText?.trim() && (!a.pages || a.pages.length === 0) && (a.pdfUrl || a.openAccessUrl || a.url || a.doi)
    );
    if (candidates.length === 0) {
      setFetchProgress('All active papers already contain extracted full text or lack resolvable links.');
      return;
    }

    setIsFetchingFullTexts(true);
    let updatedArticles = [...articles];
    let enriched = 0;

    try {
      for (let idx = 0; idx < candidates.length; idx++) {
        const target = candidates[idx];
        setFetchProgress(`Fetching PDF & extracting text ${idx + 1}/${candidates.length}: ${target.title.slice(0, 42)}...`);
        const res = await apiService.verifyAndFetchPaperFullText({
          pdfUrl: target.pdfUrl,
          openAccessUrl: target.openAccessUrl,
          url: target.url,
          doi: target.doi,
          title: target.title,
        });

        if (res.accessible && (res.extractedFullText || (res.pages && res.pages.length > 0))) {
          enriched++;
        }

        updatedArticles = updatedArticles.map((art) =>
          art.id === target.id
            ? {
                ...art,
                accessStatus: res.accessStatus,
                pdfUrl: res.resolvedPdfUrl || art.pdfUrl,
                fullText: res.extractedFullText || art.fullText,
                pages: res.pages && res.pages.length > 0 ? res.pages : art.pages,
                accessNotes: res.reason || art.accessNotes,
              }
            : art
        );
      }

      if (onUpdateArticles) {
        onUpdateArticles(updatedArticles);
      }
      setFetchProgress(`Completed full-text sync: ${enriched}/${candidates.length} paper PDFs extracted into corpus.`);
    } catch (err: any) {
      setFetchProgress(`Full-text fetch stopped: ${err?.message || 'Network error'}`);
    } finally {
      setIsFetchingFullTexts(false);
    }
  };

  const handleCopyCorpusForNotebookLM = async () => {
    if (activeArticles.length === 0) return;
    const promptHeader = inputPrompt.trim()
      ? `RESEARCH QUESTION / TASK:\n${inputPrompt.trim()}\n\nCITATION REQUIREMENT:\nCite strictly using ${activeStyleMeta.label} (${activeStyleMeta.inlineExample}) and end with a complete ${activeStyleMeta.shortLabel} References list. Do NOT limit to 9 sections.\n\n`
      : `CITATION REQUIREMENT:\nCite every claim using ${activeStyleMeta.label} (${activeStyleMeta.inlineExample}) and end with a complete ${activeStyleMeta.shortLabel} References list.\n\n`;

    const corpus = activeArticles
      .map((art, idx) => buildGroundedArticleTextSource(art, citationStyle, idx + 1))
      .join('\n\n---\n\n');

    await navigator.clipboard.writeText(`${promptHeader}# REVIEW: ${project.title}\n\n${corpus}`);
    markCopied('corpus');
  };

  const handleCopyBibliography = async () => {
    if (activeArticles.length === 0) return;
    const refs = activeArticles
      .map((art, idx) => formatReferenceString(art, citationStyle, idx + 1))
      .join('\n\n');
    await navigator.clipboard.writeText(refs);
    markCopied('bib');
  };

  const handleDownloadBibTex = () => {
    if (activeArticles.length === 0) return;
    const bib = formatBibTexEntries(activeArticles);
    const blob = new Blob([bib], { type: 'application/x-bibtex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.id || 'review').replace(/[^a-zA-Z0-9_-]/g, '_')}-references.bib`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = (turn: ChatTurn) => {
    const blob = new Blob([turn.text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research-synthesis-${turn.citationStyle || citationStyle}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const sendResearchMessage = async (overridePrompt?: string) => {
    const promptText = (overridePrompt ?? inputPrompt).trim();
    if (!promptText || isSending) return;
    if (activeArticles.length === 0) {
      setChatError('No active papers in scope. Include or select at least one paper in the left panel.');
      return;
    }

    setChatError(null);
    setKeyMissingError(null);
    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...chatHistory, userTurn];
    setChatHistory(nextHistory);
    if (!overridePrompt) setInputPrompt('');
    setIsSending(true);
    setStudioTab('chat');
    setMobileColumn('workspace');

    try {
      const res = await fetch('/api/gemini/research-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: promptText,
          history: chatHistory.map((h) => ({ role: h.role, text: h.text })),
          project: {
            id: project.id,
            title: project.title,
            subtitle: project.subtitle,
            scope: project.scope,
            picoc: project.picoc,
            researchQuestions: project.researchQuestions,
          },
          articles: activeArticles.slice(0, 45),
          citationStyle,
          responseMode,
          customOutline: responseMode === 'custom_outline' ? customOutline : '',
          model: selectedModel,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 503 && data.code === 'GEMINI_KEY_MISSING') {
        setKeyMissingError(
          data.error ||
            'Gemini API key is not configured on the server yet. Add GEMINI_API_KEY in Settings > Secrets for direct research chat, or export your PDFs ZIP to https://notebook.google.com/.'
        );
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || `Research chat failed (${res.status})`);
      }

      const modelTurn: ChatTurn = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: data.text || 'No synthesis returned.',
        model: data.model || selectedModel,
        citationStyle,
        citedPaperCount: data.citedPaperCount || activeArticles.length,
        responseMode,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const finalHistory = [...nextHistory, modelTurn];
      setChatHistory(finalHistory);
      onSaveBriefingState?.(buildBriefingSnapshot({ chatHistory: finalHistory }), true);
    } catch (err: any) {
      setChatError(err?.message || 'Failed to generate research response.');
    } finally {
      setIsSending(false);
    }
  };

  const handleGeneratePodcast = async () => {
    if (activeArticles.length === 0) return;
    setIsGeneratingPodcast(true);
    setStudioTab('audio');
    setMobileColumn('workspace');
    try {
      const data = await apiService.generatePodcastScript(project, activeArticles);
      if (data && data.script) {
        setPodcastEpisode(data);
        setCurrentTurnIndex(0);
        setIsPlaying(true);
        onSaveBriefingState?.(buildBriefingSnapshot({ podcastEpisode: data }), true);
      }
    } catch (e) {
      console.warn('Failed to generate podcast:', e);
    } finally {
      setIsGeneratingPodcast(false);
    }
  };

  const handleExportTranscript = () => {
    if (!podcastEpisode?.script) return;
    const refsBlock = activeArticles
      .map((art, idx) => formatReferenceString(art, citationStyle, idx + 1))
      .join('\n');
    const lines = [
      `# ${podcastEpisode.title}`,
      `## ${podcastEpisode.subtitle}`,
      `Estimated duration: ${podcastEpisode.durationEst}`,
      `\nSummary:\n${podcastEpisode.summary}\n`,
      `--- DIALOGUE TRANSCRIPT ---`,
      ...podcastEpisode.script.map(
        (t) => `\n[${t.speaker}] (${t.topic || 'Dialogue'}):\n"${t.text}"\n`
      ),
      `\n--- REFERENCES (${activeStyleMeta.label}) ---\n${refsBlock}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.id}-audio-overview-transcript.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const quickPrompts: Array<{ label: string; mode: ResponseModeId; prompt: string }> = [
    {
      label: 'Answer Research Questions',
      mode: 'rq_matrix',
      prompt: `Answer all research questions for "${project.title}" strictly using the ${activeArticles.length} active papers. Cite every empirical claim, sample size, sensor, and metric in ${activeStyleMeta.label} style and list limitations or missing evidence.`,
    },
    {
      label: 'Dynamic Review (Unconstrained Sections)',
      mode: 'flexible_review',
      prompt: `Write a publication-grade literature synthesis based purely on the themes, methods, outcomes, and disagreements present across the ${activeArticles.length} active papers. Organize headings naturally without limiting to 9 sections, include a comparative study matrix table, and format all inline citations and References in ${activeStyleMeta.label}.`,
    },
    {
      label: 'Compare Methods, Sensors & Accuracy',
      mode: 'methods_critique',
      prompt: `Create a detailed comparative table and technical analysis contrasting algorithms, sensors/platforms, ground-truth validation strategies, spatial/data leakage controls, and quantitative performance metrics across all active studies. Cite strictly in ${activeStyleMeta.label}.`,
    },
    {
      label: 'Identify Gaps & Conflicting Results',
      mode: 'qa',
      prompt: `Identify every contradiction, methodological flaw, operational latency gap, and under-studied region or edge case across these ${activeArticles.length} papers, supported by direct quotes/page evidence where available. Cite in ${activeStyleMeta.label}.`,
    },
  ];

  const shellClass = isFullscreen
    ? 'fixed inset-0 z-50 w-screen h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden'
    : 'w-full h-[calc(100vh-11rem)] min-h-[700px] bg-slate-950 text-slate-100 border border-slate-800 rounded-2xl flex flex-col overflow-hidden';

  return (
    <div
      role={isFullscreen ? 'dialog' : 'region'}
      aria-modal={isFullscreen ? true : undefined}
      aria-label="NotebookLM Studio and Two-Host Evidence Briefing"
      className={shellClass}
    >
      {/* Unified Single-Row Top Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/95 px-4 flex items-center justify-between gap-3 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-teal-500 flex items-center justify-center shrink-0">
            <BookOpenText className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white whitespace-nowrap">
                NotebookLM Studio &amp; Audio Briefing
              </h2>
              <span className="text-slate-600 hidden md:inline">·</span>
              <span className="text-xs text-slate-300 truncate max-w-[220px] hidden md:inline" title={project.title}>
                {project.title}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono tabular-nums whitespace-nowrap">
              {activeArticles.length} active papers · {pdfReadyCount} PDF links · {fullTextReadyCount} full-text extracted
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          {/* Primary Workspace Switcher: Grounded Research Chat vs Two-Host Audio Overview */}
          <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setStudioTab('chat')}
              className={`px-3 py-1 rounded-md font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                studioTab === 'chat' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Research Chat &amp; Review</span>
            </button>
            <button
              type="button"
              onClick={() => setStudioTab('audio')}
              className={`px-3 py-1 rounded-md font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                studioTab === 'audio' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Two-Host Audio Overview</span>
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <Quote className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <select
              value={citationStyle}
              onChange={(e) => setCitationStyle(e.target.value as CitationStyleId)}
              className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              title={activeStyleMeta.description}
            >
              {RECOMMENDED_CITATION_STYLES.map((st) => (
                <option key={st.id} value={st.id} className="bg-slate-900 text-slate-100">
                  {st.shortLabel} ({st.inlineExample})
                </option>
              ))}
            </select>
          </label>

          <a
            href="https://notebook.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
            title="Sign in or open Google NotebookLM workspace"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>notebook.google.com</span>
          </a>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Expand to Fullscreen'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-slate-300" />
                <span>{onCloseFullscreen ? 'Exit Fullscreen' : 'Collapse'}</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-teal-400" />
                <span>Fullscreen</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Auto-Save, Data File Add, Query Q&A Rescan & Reset Controls */}
      <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/90 shrink-0">
        <ModuleWorkbenchControls
          project={project}
          moduleId="briefing"
          moduleLabel="NotebookLM Studio & Audio Briefing"
          autoSaveStatus={autoSaveStatus}
          compact
          deleteModes={['excluded', 'uncertain']}
          onResetModule={onResetWorkbenchModule}
          onResetLocalView={() => {
            setChatHistory([]);
            setPodcastEpisode(null);
            setCustomOutline('');
            setIsPlaying(false);
            setCurrentTurnIndex(0);
          }}
          onAddDataFiles={onDirectAddDataFiles}
          onOpenBulkImporter={onOpenBulkImporter}
          onRescanQueryQA={onRescanWithQueryQA}
          onDeleteQaEntry={onDeleteQaEntry}
        />
      </div>

      {/* Mobile / Small Screen Tab Switcher */}
      <div className="lg:hidden grid grid-cols-3 border-b border-slate-800 bg-slate-900 shrink-0 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setMobileColumn('sources')}
          className={`py-2.5 text-center border-b-2 transition cursor-pointer ${
            mobileColumn === 'sources' ? 'border-teal-400 text-white' : 'border-transparent text-slate-400'
          }`}
        >
          Sources ({activeArticles.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileColumn('workspace');
            setStudioTab('chat');
          }}
          className={`py-2.5 text-center border-b-2 transition cursor-pointer ${
            mobileColumn === 'workspace' && studioTab === 'chat'
              ? 'border-indigo-400 text-white'
              : 'border-transparent text-slate-400'
          }`}
        >
          Research Chat
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileColumn('workspace');
            setStudioTab('audio');
          }}
          className={`py-2.5 text-center border-b-2 transition cursor-pointer ${
            mobileColumn === 'workspace' && studioTab === 'audio'
              ? 'border-indigo-400 text-white'
              : 'border-transparent text-slate-400'
          }`}
        >
          Audio Overview
        </button>
      </div>

      {/* Main Split Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Rail: Corpus Scope, Original PDF ZIP Export & Study List */}
        <aside
          className={`${
            mobileColumn === 'sources' ? 'flex' : 'hidden'
          } lg:flex w-full lg:w-[390px] xl:w-[415px] border-r border-slate-800 bg-slate-900/40 flex-col min-h-0 shrink-0`}
        >
          <div className="p-4 border-b border-slate-800 space-y-3 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-300">Paper Export &amp; Grounding Scope</span>
              <span className="text-[11px] font-mono tabular-nums text-teal-400">
                {activeArticles.length}/{scopedArticles.length} active
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              {[
                { id: 'included' as CorpusScopeMode, label: `Included Only (${includedList.length})` },
                { id: 'included_starred' as CorpusScopeMode, label: `Included + ★ (${includedOrStarredList.length})` },
                { id: 'selected' as CorpusScopeMode, label: `Checked (${selectedList.length})` },
                { id: 'all' as CorpusScopeMode, label: `All Library (${articles.length})` },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setScopeMode(opt.id);
                    setExcludedPaperIds(new Set());
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-left font-medium transition cursor-pointer ${
                    scopeMode === opt.id
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {scopeMode === 'included' && includedList.length === 0 && (
              <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-700/50 text-[11px] text-amber-200 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p>No papers are marked &ldquo;Included&rdquo; yet in this project.</p>
                  <button
                    type="button"
                    onClick={() => setScopeMode('all')}
                    className="text-amber-300 underline font-semibold cursor-pointer"
                  >
                    Switch to All Library ({articles.length} papers)
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleExportZip}
              disabled={isExportingZip || activeArticles.length === 0}
              className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-40 text-white text-xs font-bold shadow-md inline-flex items-center justify-center gap-2 cursor-pointer transition"
            >
              {isExportingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
              <span>Export Original PDFs + Sources (.zip)</span>
            </button>

            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={handleFetchMissingFullTexts}
                disabled={isFetchingFullTexts || activeArticles.length === 0}
                className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                {isFetchingFullTexts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-teal-400" />}
                <span>Fetch Full Texts</span>
              </button>

              <button
                type="button"
                onClick={handleCopyCorpusForNotebookLM}
                disabled={activeArticles.length === 0}
                className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                {copiedKey === 'corpus' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
                <span>{copiedKey === 'corpus' ? 'Copied Corpus' : 'Copy Corpus'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyBibliography}
                disabled={activeArticles.length === 0}
                className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                {copiedKey === 'bib' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Quote className="w-3.5 h-3.5 text-amber-400" />}
                <span>{copiedKey === 'bib' ? 'Copied Refs' : `Copy ${activeStyleMeta.shortLabel} Refs`}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadBibTex}
                disabled={activeArticles.length === 0}
                className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <FileDown className="w-3.5 h-3.5 text-slate-300" />
                <span>Download .bib</span>
              </button>
            </div>

            {exportStatus && (
              <div className="p-2.5 rounded-lg bg-slate-950 border border-teal-800/60 text-[11px] text-teal-200 leading-relaxed">
                {exportStatus}
              </div>
            )}
            {fetchProgress && (
              <div className="p-2.5 rounded-lg bg-slate-950 border border-indigo-800/60 text-[11px] text-indigo-200 leading-relaxed">
                {fetchProgress}
              </div>
            )}

            <div className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-800/80">
              Upload exported PDFs (<code className="text-slate-300">01_Original_PDFs/</code>) &amp; Markdown sources to{' '}
              <a
                href="https://notebook.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:underline font-medium"
              >
                notebook.google.com
              </a>{' '}
              or synthesize directly on the right.
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {scopedArticles.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                No papers match the selected corpus scope.
              </div>
            ) : (
              scopedArticles.map((art) => {
                const isChecked = !excludedPaperIds.has(art.id);
                const activeIdx = activeArticles.findIndex((a) => a.id === art.id);
                const pdfTarget = art.pdfUrl || art.openAccessUrl;
                const hasFullText = Boolean(art.fullText?.trim() || (art.pages && art.pages.length > 0));
                const leadAuthor = art.authors?.[0] || 'Unknown Author';

                return (
                  <div
                    key={art.id}
                    className={`p-2.5 rounded-xl border transition text-xs ${
                      isChecked
                        ? 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-950/30 border-slate-900 opacity-50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => togglePaperActive(art.id)}
                        className="mt-1 rounded accent-teal-500 cursor-pointer shrink-0"
                        aria-label={`Include ${art.title}`}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-semibold text-slate-100 leading-snug line-clamp-2">
                          {activeIdx >= 0 && (
                            <span className="font-mono text-teal-400 mr-1.5">
                              {formatInlineCitation(art, citationStyle, activeIdx + 1)}
                            </span>
                          )}
                          {art.title}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {leadAuthor} · {art.year || 'n.d.'} · {art.sourceDatabase || 'Library'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px]">
                          <span className={hasFullText ? 'text-emerald-400 font-medium' : pdfTarget ? 'text-teal-400' : 'text-slate-500'}>
                            {hasFullText ? 'Full Text Ready' : pdfTarget ? 'PDF Link Ready' : 'Abstract/Metadata'}
                          </span>
                          {pdfTarget && (
                            <a
                              href={apiService.getProxyPdfDownloadUrl(pdfTarget, art.title)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto text-indigo-400 hover:text-indigo-300 font-semibold inline-flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              <span>PDF</span>
                            </a>
                          )}
                          {!pdfTarget && art.doi && (
                            <a
                              href={`https://doi.org/${art.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto text-slate-400 hover:text-white inline-flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>DOI</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Main Workspace: Either Grounded Research Chat OR Two-Host Audio Overview */}
        <section
          className={`${
            mobileColumn === 'workspace' ? 'flex' : 'hidden'
          } lg:flex flex-1 flex-col min-w-0 min-h-0 bg-slate-950`}
        >
          {studioTab === 'chat' ? (
            <>
              {/* Mode, Model & Quick Prompts Bar */}
              <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/50 space-y-2.5 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {[
                      { id: 'qa' as ResponseModeId, label: 'Direct Q&A' },
                      { id: 'flexible_review' as ResponseModeId, label: 'Dynamic Review (No 9-Section Limit)' },
                      { id: 'rq_matrix' as ResponseModeId, label: 'RQ Evidence Matrix' },
                      { id: 'methods_critique' as ResponseModeId, label: 'Methods & Bias Critique' },
                      { id: 'custom_outline' as ResponseModeId, label: 'Custom Outline' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setResponseMode(m.id)}
                        className={`px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                          responseMode === m.id
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value as 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite')}
                      className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="gemini-4-hydrogen">Gemini 4 Hydrogen (Deep Synthesis)</option>
                      <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Fast)</option>
                    </select>

                    {chatHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setChatHistory([]);
                          setKeyMissingError(null);
                          setChatError(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Clear</span>
                      </button>
                    )}
                  </div>
                </div>

                {responseMode === 'custom_outline' && (
                  <input
                    type="text"
                    value={customOutline}
                    onChange={(e) => setCustomOutline(e.target.value)}
                    placeholder="Optional custom headings (e.g., 1. Sensor Architectures · 2. Validation Benchmarks · 3. Field Costs)"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                )}

                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  {quickPrompts.map((qp) => (
                    <button
                      key={qp.label}
                      type="button"
                      onClick={() => {
                        setResponseMode(qp.mode);
                        sendResearchMessage(qp.prompt);
                      }}
                      disabled={isSending || activeArticles.length === 0}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-white whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition"
                    >
                      <Sparkles className="w-3 h-3 text-teal-400" />
                      <span>{qp.label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleGeneratePodcast}
                    disabled={isGeneratingPodcast || activeArticles.length === 0}
                    className="px-2.5 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-700/60 text-[11px] text-indigo-200 whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition"
                  >
                    <Radio className="w-3 h-3 text-indigo-400" />
                    <span>Generate Two-Host Audio Overview</span>
                  </button>
                </div>
              </div>

              {/* Conversation Stream */}
              <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
                {chatHistory.length === 0 && !keyMissingError && (
                  <div className="max-w-3xl mx-auto py-6 space-y-5">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-teal-400">
                        Grounded Synthesis · {activeStyleMeta.label}
                      </p>
                      <h3 className="text-xl font-bold text-white">
                        Ask any research question, generate an unconstrained review, or launch the two-host audio overview
                      </h3>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        Synthesizes strictly from your {activeArticles.length} active papers (abstracts, extracted parameters, pinned page quotes, and extracted PDF text)—formatted in{' '}
                        <span className="text-slate-200 font-medium">{activeStyleMeta.label}</span> without any 9-section cap. Switch tabs anytime for the{' '}
                        <button
                          type="button"
                          onClick={() => setStudioTab('audio')}
                          className="text-indigo-400 hover:underline font-semibold cursor-pointer"
                        >
                          Two-Host Audio Overview
                        </button>{' '}
                        or export original PDFs to{' '}
                        <a
                          href="https://notebook.google.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:underline font-medium"
                        >
                          notebook.google.com
                        </a>
                        .
                      </p>
                    </div>

                    {project.researchQuestions && project.researchQuestions.length > 0 && (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
                        <p className="text-xs font-semibold text-slate-300">Click any Research Question to investigate:</p>
                        <div className="space-y-1.5">
                          {project.researchQuestions.map((rq) => (
                            <button
                              key={rq.code}
                              type="button"
                              onClick={() =>
                                sendResearchMessage(
                                  `${rq.code}: ${rq.question}\nCite all supporting and contradicting studies using ${activeStyleMeta.label}.`
                                )
                              }
                              disabled={activeArticles.length === 0 || isSending}
                              className="w-full text-left px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-xs text-slate-200 flex items-start gap-2 cursor-pointer transition"
                            >
                              <span className="font-mono font-bold text-teal-400 shrink-0">{rq.code}</span>
                              <span className="leading-relaxed">{rq.question}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {chatHistory.map((turn) => (
                  <div
                    key={turn.id}
                    className={`max-w-4xl mx-auto rounded-2xl border p-4 ${
                      turn.role === 'user'
                        ? 'bg-indigo-950/30 border-indigo-800/60 ml-8 sm:ml-16'
                        : 'bg-slate-900/70 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800/80 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-200">
                        {turn.role === 'user' ? 'Researcher Query' : 'Grounded Evidence Synthesis'}
                      </span>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        {turn.role === 'model' && (
                          <>
                            <span>{turn.citedPaperCount} papers</span>
                            <span>·</span>
                            <span>{(turn.citationStyle || citationStyle).toUpperCase()}</span>
                            <span>·</span>
                            <span>{turn.model}</span>
                          </>
                        )}
                        <span>{turn.timestamp}</span>
                      </div>
                    </div>

                    {turn.role === 'user' ? (
                      <p className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">{turn.text}</p>
                    ) : (
                      <>
                        {renderMarkdownBlock(turn.text)}
                        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(turn.text);
                              markCopied(turn.id);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition"
                          >
                            {copiedKey === turn.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedKey === turn.id ? 'Copied' : 'Copy Cited Text'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadMarkdown(turn)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition"
                          >
                            <FileText className="w-3.5 h-3.5 text-teal-400" />
                            <span>Download .md</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {isSending && (
                  <div className="max-w-4xl mx-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex items-center gap-3 text-xs text-slate-300">
                    <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                    <span>
                      Synthesizing response across {activeArticles.length} grounded papers using {activeStyleMeta.label}...
                    </span>
                  </div>
                )}

                {keyMissingError && (
                  <div className="max-w-4xl mx-auto rounded-2xl border border-amber-700/60 bg-amber-950/30 p-4 space-y-3 text-xs text-amber-100">
                    <div className="flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold text-amber-200">In-App Gemini Key Not Configured — Export Directly to NotebookLM</p>
                        <p className="text-amber-100/90 leading-relaxed">{keyMissingError}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleExportZip}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileArchive className="w-3.5 h-3.5" />
                        <span>Download PDFs + Sources ZIP</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyCorpusForNotebookLM}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedKey === 'corpus' ? 'Copied Prompt + Corpus!' : 'Copy Grounded Prompt + Corpus'}</span>
                      </button>
                      <a
                        href="https://notebook.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold inline-flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Continue in notebook.google.com</span>
                      </a>
                    </div>
                  </div>
                )}

                {chatError && (
                  <div className="max-w-4xl mx-auto rounded-xl border border-rose-800/70 bg-rose-950/40 p-3 text-xs text-rose-200">
                    {chatError}
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Sticky Composer */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendResearchMessage();
                }}
                className="p-4 border-t border-slate-800 bg-slate-900/80 shrink-0"
              >
                <div className="max-w-4xl mx-auto flex items-end gap-2.5">
                  <textarea
                    rows={2}
                    value={inputPrompt}
                    onChange={(e) => setInputPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendResearchMessage();
                      }
                    }}
                    placeholder={`Ask any research question or request a review synthesis across ${activeArticles.length} active papers (cited in ${activeStyleMeta.shortLabel}, no section limit)...`}
                    className="flex-1 resize-none rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={isSending || !inputPrompt.trim() || activeArticles.length === 0}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition shrink-0 h-[42px]"
                  >
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Ask / Synthesize</span>
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* Integrated Two-Host Evidence Briefing & Audio Overview */
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="max-w-4xl mx-auto space-y-5">
                {/* Audio Briefing Header Bar */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-indigo-400">
                      Two-Host Evidence Briefing · {activeArticles.length} Active Studies
                    </p>
                    <h3 className="text-lg font-bold text-white">
                      {podcastEpisode?.title || 'Interactive Audio Overview: Dr. Sarah & Dr. Alex'}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {podcastEpisode?.subtitle ||
                        'Synthesizes your selected corpus into a conversational scientific review between a Methodologist (Dr. Sarah) and a Domain Specialist (Dr. Alex).'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleGeneratePodcast}
                    disabled={isGeneratingPodcast || activeArticles.length === 0}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer shrink-0 transition"
                  >
                    <Sparkles className={`w-4 h-4 ${isGeneratingPodcast ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingPodcast ? 'Synthesizing Dialogue...' : 'Generate Audio Overview'}</span>
                  </button>
                </div>

                {/* Audio Player & Dialogue Stream */}
                {podcastEpisode?.script ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setIsPlaying(!isPlaying)}
                          className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition cursor-pointer shrink-0"
                          aria-label={isPlaying ? 'Pause audio overview' : 'Play audio overview'}
                        >
                          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                        </button>
                        <div>
                          <p className="text-xs font-bold text-white">
                            {podcastEpisode.script[currentTurnIndex]?.speaker}
                          </p>
                          <p className="text-[11px] text-teal-400 font-mono">
                            {podcastEpisode.script[currentTurnIndex]?.topic || 'Evidence Synthesis'} ·{' '}
                            <span className="tabular-nums">
                              Turn {currentTurnIndex + 1} / {podcastEpisode.script.length}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setVoiceNarrationEnabled((v) => !v)}
                          className={`px-2.5 py-1.5 rounded-lg border font-medium inline-flex items-center gap-1.5 cursor-pointer transition ${
                            voiceNarrationEnabled
                              ? 'bg-teal-600/20 border-teal-500 text-teal-200'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                          title="Toggle browser speech narration"
                        >
                          {voiceNarrationEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                          <span>{voiceNarrationEnabled ? 'Voice On' : 'Text Auto-Play'}</span>
                        </button>

                        <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                          {[1, 1.25, 1.5].map((spd) => (
                            <button
                              key={spd}
                              type="button"
                              onClick={() => setPlaybackSpeed(spd)}
                              className={`px-2 py-1 rounded-md font-mono font-semibold cursor-pointer transition ${
                                playbackSpeed === spd ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {spd}x
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setCurrentTurnIndex(0);
                            setIsPlaying(true);
                          }}
                          className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
                          title="Restart dialogue"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={handleExportTranscript}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Transcript (.md)</span>
                        </button>
                      </div>
                    </div>

                    {podcastEpisode.summary && (
                      <p className="text-xs text-slate-300 leading-relaxed">{podcastEpisode.summary}</p>
                    )}

                    <div className="space-y-2.5">
                      {podcastEpisode.script.map((turn, idx) => {
                        const isCurrent = idx === currentTurnIndex;
                        const isSarah = turn.speaker.includes('Sarah');
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              setCurrentTurnIndex(idx);
                              setIsPlaying(true);
                            }}
                            className={`p-4 rounded-xl border transition cursor-pointer ${
                              isCurrent
                                ? 'bg-indigo-950/35 border-indigo-500/80'
                                : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
                              <span className={`font-bold ${isSarah ? 'text-indigo-300' : 'text-teal-300'}`}>
                                {turn.speaker}
                              </span>
                              <span className="text-[11px] font-mono text-slate-500">
                                {turn.topic || `Segment ${idx + 1}`}
                              </span>
                            </div>
                            <p className="text-sm text-slate-200 leading-relaxed">&ldquo;{turn.text}&rdquo;</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center space-y-3">
                    <Radio className="w-8 h-8 mx-auto text-indigo-400" />
                    <h4 className="text-sm font-bold text-white">Ready to Synthesize Two-Host Evidence Briefing</h4>
                    <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                      Click &ldquo;Generate Audio Overview&rdquo; above to create an interactive scientific briefing across your {activeArticles.length} active papers, with optional browser voice playback and cited Markdown transcript download.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
