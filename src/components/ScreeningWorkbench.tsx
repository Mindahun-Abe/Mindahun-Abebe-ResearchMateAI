import React, { useEffect, useRef, useState } from 'react';
import {
  Article,
  ModuleQaRescanRecord,
  PageCitation,
  ReviewProject,
  ScreeningDecision,
  WorkbenchModuleId,
} from '../types';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Pin,
  Trash2,
  BookOpen,
  AlertCircle,
  Layers,
  FileText,
  Clock,
  Compass,
  Check,
  X,
  Globe,
  MapPin,
  Download,
  Upload,
  Quote,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import {
  apiService,
  evaluateArticleClient,
  mergeScreeningInsightsIntoExtractedData,
} from '../services/apiService';
import { assessGeographicEligibility } from '../utils/geographicSensing';
import { evaluateIntegratedConceptAlignment } from '../utils/conceptScreeningEngine';
import { AutoSaveStatusInfo, ModuleWorkbenchControls } from './ModuleWorkbenchControls';
import {
  formatReferenceEntry,
  normalizeValidDoi,
  validateArticleMetadata,
} from '../utils/citationFormatter';
import { applyManualScreeningDecision } from '../utils/deterministicScreeningEngine';

interface ScreeningWorkbenchProps {
  project: ReviewProject;
  article: Article;
  onUpdateArticle: (updated: Article) => void;
  onSelectNext: () => void;
  onSelectPrev: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onBackToLibrary: () => void;
  autoSaveStatus?: AutoSaveStatusInfo;
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
  onAttachOriginalPdf?: (articleId: string, file: File, targetProjectId?: string) => Promise<Article | null>;
}

export const ScreeningWorkbench: React.FC<ScreeningWorkbenchProps> = ({
  project,
  article,
  onUpdateArticle,
  onSelectNext,
  onSelectPrev,
  hasPrev,
  hasNext,
  onBackToLibrary,
  autoSaveStatus,
  onResetWorkbenchModule,
  onDirectAddDataFiles,
  onRescanWithQueryQA,
  onDeleteQaEntry,
  onOpenBulkImporter,
  onAttachOriginalPdf,
}) => {
  const [activeView, setActiveView] = useState<'text' | 'pages' | 'appraisal'>('text');
  const [selectedPageNum, setSelectedPageNum] = useState<number>(1);
  const [isAiScreening, setIsAiScreening] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string>('');
  const [isPdfBusy, setIsPdfBusy] = useState<boolean>(false);
  const [pdfFeedback, setPdfFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pinning evidence citation state
  const [pinQuote, setPinQuote] = useState<string>('');
  const [pinSection, setPinSection] = useState<string>('Methodology');
  const [pinPage, setPinPage] = useState<number>(1);
  const [pinRelevance, setPinRelevance] = useState<string>('');
  const [isPinning, setIsPinning] = useState<boolean>(false);

  // Decision state (synchronized cleanly when switching articles + debounced notes auto-save)
  const [selectedReason, setSelectedReason] = useState<string>(
    article.decisionReason || project.standardExclusionReasons[0] || ''
  );
  const [reviewerNotes, setReviewerNotes] = useState<string>(article.reviewerNotes || '');
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const articleRef = useRef(article);
  articleRef.current = article;

  useEffect(() => {
    if (notesTimerRef.current) {
      clearTimeout(notesTimerRef.current);
      notesTimerRef.current = null;
    }
    setSelectedReason(article.decisionReason || project.standardExclusionReasons[0] || '');
    setReviewerNotes(article.reviewerNotes || '');
    setPdfFeedback(null);
  }, [article.id]);

  const handleNotesChangeAutoSave = (nextNotes: string) => {
    setReviewerNotes(nextNotes);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    const snapshotArticle = articleRef.current;
    notesTimerRef.current = setTimeout(() => {
      onUpdateArticle({
        ...snapshotArticle,
        reviewerNotes: nextNotes,
      });
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    };
  }, []);

  // Extract selected text from reader
  const handleTextSelection = () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 5) {
      setPinQuote(sel);
      setPinPage(selectedPageNum);
      setIsPinning(true);
    }
  };

  const handleSavePinCitation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinQuote.trim()) return;

    const newCitation: PageCitation = {
      id: 'cit-' + Date.now(),
      pageNumber: pinPage,
      section: pinSection || 'Evidence',
      quote: pinQuote.trim(),
      relevance: pinRelevance.trim() || 'Key empirical parameter for systematic review',
    };

    onUpdateArticle({
      ...article,
      evidenceCitations: [...(article.evidenceCitations || []), newCitation],
    });

    setPinQuote('');
    setPinRelevance('');
    setIsPinning(false);
  };

  const handleDeleteCitation = (citId: string) => {
    onUpdateArticle({
      ...article,
      evidenceCitations: (article.evidenceCitations || []).filter((c) => c.id !== citId),
    });
  };

  // Screening decision handlers (enforces human reviewer precedence + audit history)
  const handleDecision = (decision: ScreeningDecision, reason?: string) => {
    const isExcluded = decision === 'exclude';
    const isIncluded = decision === 'include';

    const updated = applyManualScreeningDecision(article, project, {
      decision,
      screeningStage: isIncluded ? 'final_included' : isExcluded ? 'excluded' : 'full_text',
      reason: isExcluded ? reason || selectedReason : undefined,
      reviewerNotes,
    });
    onUpdateArticle(updated);
  };

  // AI-assisted screening call (Fail-safe with instant client rule engine fallback)
  const handleRunAiScreen = async () => {
    if (!article) return;
    setIsAiScreening(true);
    setAiError('');
    try {
      let res: any;
      try {
        res = await apiService.screenArticle(article, project);
      } catch (networkErr) {
        console.warn('Network call failed, evaluating with local engine:', networkErr);
        res = evaluateArticleClient(article, project);
      }

      if (!res || !res.decision) {
        res = evaluateArticleClient(article, project);
      }

      onUpdateArticle({
        ...article,
        aiSuggestedDecision: res.decision,
        aiConfidence: res.confidenceScore,
        aiReason: res.primaryReason || res.detailedExplanation,
        extractedData: mergeScreeningInsightsIntoExtractedData(article.extractedData, res),
        // Append AI page evidence if found (replacing prior synthetic screening citations)
        evidenceCitations: [
          ...(article.evidenceCitations || []).filter(
            (c) =>
              !c.id?.startsWith('ai-ev-') &&
              !c.id?.startsWith('ev-batch-') &&
              !/geographic\s+verification\s+needed|abstract\s*\/\s*eligibility\s+check|title\s*&\s*filename\s+screening/i.test(
                c.section || ''
              )
          ),
          ...(res.pageEvidence || []).map((pe: any, idx: number) => ({
            id: 'ai-ev-' + Date.now() + '-' + idx,
            pageNumber: pe.pageNumber || 1,
            section: pe.sectionName || pe.section || 'Evidence',
            quote: pe.exactQuote || '',
            relevance: pe.relevance || 'Extracted by AI dual-reviewer',
          })),
        ],
      });
    } catch (err: any) {
      console.warn('Screening handled gracefully:', err);
    } finally {
      setIsAiScreening(false);
    }
  };

  const pages = article.pages && article.pages.length > 0
    ? article.pages
    : [
        {
          pageNumber: 1,
          content: `Title: ${article.title}\n\nAbstract:\n${article.abstract}\n\nFull text extracted sections:\n${article.fullText || 'No attached PDF text. Screen on title and abstract, or paste full text.'}`,
        },
      ];

  const currentPage = pages.find((p) => p.pageNumber === selectedPageNum) || pages[0];
  const cleanDoi = normalizeValidDoi(article.doi);
  const validation = validateArticleMetadata(article);
  const apaEntry = formatReferenceEntry(article, 0, 'apa7');
  const originalFilename = article.original_filename || article.sourceFileName || '';
  const hasDiskPdf = article.pdfStorage?.storage_status === 'stored_disk' || Boolean(article.file_path);
  const hasRemotePdf = Boolean(article.pdfUrl || article.openAccessUrl);

  return (
    <div className="space-y-4">
      <ModuleWorkbenchControls
        project={project}
        moduleId="screening"
        moduleLabel="Eligibility & Full-Text Screening"
        autoSaveStatus={autoSaveStatus}
        resetFieldsLabel="Reset Decisions & Notes -> Unscreened"
        deleteModes={['excluded', 'uncertain', 'unscreened']}
        compact
        onResetModule={onResetWorkbenchModule}
        onResetLocalView={() => setReviewerNotes('')}
        onAddDataFiles={onDirectAddDataFiles}
        onOpenBulkImporter={onOpenBulkImporter}
        onRescanQueryQA={onRescanWithQueryQA}
        onDeleteQaEntry={onDeleteQaEntry}
      />
      {project.workbenchState?.protocolBuilder?.activeProtocol && (() => {
        const activeProto = project.workbenchState.protocolBuilder!.activeProtocol!;
        return (
          <div className="bg-indigo-950/35 border border-indigo-500/30 rounded-xl px-4 py-2.5 text-xs space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold text-[10px] whitespace-nowrap shrink-0">
                  Active Protocol v{activeProto.versionNumber} ({activeProto.status})
                </span>
                <span className="text-slate-200 font-semibold">
                  {activeProto.reviewMethodRecommendation.recommendedPrimaryFramework} Eligibility Guidance
                </span>
              </div>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {activeProto.eligibilityMatrix.length} rules · {activeProto.standardizedExclusionReasons.length} standardized exclusion reasons
              </span>
            </div>
            {activeProto.standardizedExclusionReasons.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-slate-400 font-semibold">Quick-Select Exclusion Reason:</span>
                {activeProto.standardizedExclusionReasons.slice(0, 6).map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelectedReason(reason)}
                    className={`px-2 py-0.5 rounded text-[10px] border transition cursor-pointer ${
                      selectedReason === reason
                        ? 'bg-rose-500/20 text-rose-200 border-rose-500/40 font-semibold'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      {/* Top Navigation & Status Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onBackToLibrary}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Library</span>
                </button>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400 font-mono text-[11px] truncate max-w-[200px] sm:max-w-md">
                  {cleanDoi ? `DOI: ${cleanDoi}` : 'No valid DOI'}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">
                  {article.sourceDatabase}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                    validation.verificationStatus === 'Verified'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : validation.verificationStatus === 'Partially Verified'
                      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                      : validation.verificationStatus === 'Needs Manual Review'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {validation.verificationStatus === 'Verified' ? (
                    <ShieldCheck className="w-3 h-3" />
                  ) : (
                    <ShieldAlert className="w-3 h-3" />
                  )}
                  <span>APA: {validation.verificationStatus}</span>
                </span>
                {originalFilename && (
                  <span
                    className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-teal-300 font-mono text-[10px] max-w-[240px] truncate"
                    title={`Original PDF Filename: ${originalFilename}`}
                  >
                    PDF: {originalFilename}
                  </span>
                )}
              </div>

              {/* Original PDF Export / Attach + Prev / Next Article Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {(hasDiskPdf || hasRemotePdf) && (
                  <button
                    type="button"
                    disabled={isPdfBusy}
                    onClick={async () => {
                      setIsPdfBusy(true);
                      setPdfFeedback(null);
                      try {
                        if (hasDiskPdf) {
                          const res = await apiService.downloadArticleOriginalPdf(
                            project.id,
                            article.id,
                            originalFilename || article.title
                          );
                          setPdfFeedback({
                            type: 'success',
                            text: `Exported exact original PDF "${res.filename}"`,
                          });
                        } else {
                          const target = article.pdfUrl || article.openAccessUrl || '';
                          const url = apiService.getProxyPdfDownloadUrl(
                            target,
                            originalFilename || article.title
                          );
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = originalFilename || `${article.id}.pdf`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          setPdfFeedback({
                            type: 'success',
                            text: `Triggered PDF download (${originalFilename || article.title})`,
                          });
                        }
                      } catch (err: any) {
                        setPdfFeedback({
                          type: 'error',
                          text: err?.message || 'Original PDF download failed.',
                        });
                      } finally {
                        setIsPdfBusy(false);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-bold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                    title="Download exact original PDF bytes with preserved original filename"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{hasDiskPdf ? 'Export Original PDF' : 'Download PDF'}</span>
                  </button>
                )}

                {onAttachOriginalPdf && (
                  <label className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0">
                    <Upload className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{hasDiskPdf ? 'Replace PDF' : 'Attach Original PDF'}</span>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setIsPdfBusy(true);
                        setPdfFeedback(null);
                        try {
                          const updated = await onAttachOriginalPdf(article.id, file, project.id);
                          if (updated) {
                            setPdfFeedback({
                              type: 'success',
                              text: `Stored exact PDF "${updated.original_filename || file.name}"`,
                            });
                          }
                        } catch (err: any) {
                          setPdfFeedback({
                            type: 'error',
                            text: err?.message || 'Could not upload PDF file.',
                          });
                        } finally {
                          setIsPdfBusy(false);
                        }
                      }}
                    />
                  </label>
                )}

                <span className="text-slate-600 hidden sm:inline">|</span>

                <button
                  onClick={onSelectPrev}
                  disabled={!hasPrev}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition"
                  title="Previous article"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-slate-400 text-xs">Next / Prev</span>
                <button
                  onClick={onSelectNext}
                  disabled={!hasNext}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition"
                  title="Next article"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {pdfFeedback && (
              <div
                className={`px-4 py-2 rounded-xl border text-xs font-medium ${
                  pdfFeedback.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
              >
                {pdfFeedback.text}
              </div>
            )}

            {/* Main Dual-Pane Review Interface */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Pane (7 Cols): Article Reader & PDF Page Evidence */}
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                  {/* Header */}
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white leading-snug">
                      {article.title}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      {validation.sanitized.authors.length > 0
                        ? validation.sanitized.authors.join(', ')
                        : 'No author listed'}{' '}
                      ({article.year || 'n.d.'})
                      {validation.sanitized.journalOrSource ? (
                        <>
                          {' '}
                          · <span className="italic text-slate-300">{validation.sanitized.journalOrSource}</span>
                        </>
                      ) : null}
                    </p>
                    <div className="mt-2 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-300 flex items-start gap-2">
                      <Quote className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 block">
                          APA 7th Verified Reference
                        </span>
                        <p className="leading-relaxed text-slate-200 break-words">{apaEntry.citationText}</p>
                      </div>
                    </div>
                    {cleanDoi && (
                      <a
                        href={`https://doi.org/${cleanDoi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>https://doi.org/{cleanDoi}</span>
                      </a>
                    )}
                  </div>

            {/* View Mode Switcher */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 pt-2 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveView('text')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    activeView === 'text'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Abstract & Overview
                </button>
                <button
                  onClick={() => setActiveView('pages')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    activeView === 'pages'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Full Text ({pages.length} Pages)
                </button>
              </div>

              {activeView === 'pages' && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500">Page:</span>
                  <div className="flex items-center gap-1">
                    {pages.map((p) => (
                      <button
                        key={p.pageNumber}
                        onClick={() => setSelectedPageNum(p.pageNumber)}
                        className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[11px] transition ${
                          selectedPageNum === p.pageNumber
                            ? 'bg-teal-500 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {p.pageNumber}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Reader Content Body with Text Selection listener */}
            <div
              onMouseUp={handleTextSelection}
              className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans max-h-[460px] overflow-y-auto selection:bg-teal-500/30 selection:text-teal-200"
            >
              {activeView === 'text' ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px] mb-1">
                      Abstract
                    </h4>
                    <p className="text-slate-300 leading-relaxed">{article.abstract}</p>
                  </div>

                  {article.extractedData && (
                    <div className="pt-2 border-t border-slate-900">
                      <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-400" />
                        Extracted Extraction Data
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-slate-900/80 p-2 rounded-lg">
                          <span className="text-slate-500 block">Platform</span>
                          <span className="font-medium text-white">{article.extractedData.platform || 'N/A'}</span>
                        </div>
                        <div className="bg-slate-900/80 p-2 rounded-lg">
                          <span className="text-slate-500 block">Sensor</span>
                          <span className="font-medium text-white">{article.extractedData.sensor || 'N/A'}</span>
                        </div>
                        <div className="bg-slate-900/80 p-2 rounded-lg">
                          <span className="text-slate-500 block">GSD / Altitude</span>
                          <span className="font-medium text-white">{article.extractedData.gsd || 'N/A'} @ {article.extractedData.altitude || 'N/A'}</span>
                        </div>
                        <div className="bg-slate-900/80 p-2 rounded-lg">
                          <span className="text-slate-500 block">Measured Turnaround Latency</span>
                          <span className="font-medium text-teal-400">{article.extractedData.latency || 'Not reported'}</span>
                        </div>
                        <div className="bg-slate-900/80 p-2 rounded-lg col-span-2">
                          <span className="text-slate-500 block">Ground Truth Reference</span>
                          <span className="font-medium text-slate-200">{article.extractedData.groundTruth || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {article.fullText && (
                    <div className="pt-2 border-t border-slate-900">
                      <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px] mb-1">
                        Full Text Excerpt
                      </h4>
                      <p className="whitespace-pre-wrap text-slate-400">{article.fullText}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-teal-400 font-mono pb-1 border-b border-slate-900">
                    <span>Document View — Page {currentPage.pageNumber} of {pages.length}</span>
                    <span className="text-slate-500">Tip: Select any text to pin as evidence citation</span>
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">{currentPage.content}</div>
                </div>
              )}
            </div>

            {/* Pinned Evidence Citations List */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Pin className="w-3.5 h-3.5 text-teal-400" />
                  <span>PDF Page-Level Evidence Citations ({article.evidenceCitations?.length || 0})</span>
                </h4>
                <button
                  onClick={() => setIsPinning(!isPinning)}
                  className="text-xs text-teal-400 hover:text-teal-300 font-medium"
                >
                  {isPinning ? 'Close Form' : '+ Add Manual Citation'}
                </button>
              </div>

              {/* Pin Form */}
              {isPinning && (
                <form
                  onSubmit={handleSavePinCitation}
                  className="bg-slate-950 p-3 rounded-xl border border-teal-800/60 mb-3 space-y-2 text-xs"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-0.5">Page Number</label>
                      <input
                        type="number"
                        min={1}
                        value={pinPage}
                        onChange={(e) => setPinPage(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-0.5">Section Name</label>
                      <input
                        type="text"
                        placeholder="e.g. 2.2 Flight Planning"
                        value={pinSection}
                        onChange={(e) => setPinSection(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">Exact Quoted Evidence</label>
                    <textarea
                      rows={2}
                      required
                      placeholder="Quote from PDF/text..."
                      value={pinQuote}
                      onChange={(e) => setPinQuote(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">Relevance / Methodological Note</label>
                    <input
                      type="text"
                      placeholder="Why this satisfies or violates review criteria..."
                      value={pinRelevance}
                      onChange={(e) => setPinRelevance(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsPinning(false)}
                      className="px-2.5 py-1 text-[11px] rounded bg-slate-800 text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 text-[11px] font-semibold rounded bg-teal-600 hover:bg-teal-500 text-white"
                    >
                      Pin Citation
                    </button>
                  </div>
                </form>
              )}

              {/* Citations List */}
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {article.evidenceCitations && article.evidenceCitations.length > 0 ? (
                  article.evidenceCitations.map((cit) => (
                    <div
                      key={cit.id}
                      className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs space-y-1 relative group"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-teal-400">
                          [Page {cit.pageNumber} · {cit.section}]
                        </span>
                        <button
                          onClick={() => handleDeleteCitation(cit.id)}
                          className="text-slate-600 hover:text-rose-400 p-0.5 opacity-0 group-hover:opacity-100 transition"
                          title="Remove citation"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-slate-300 italic border-l-2 border-teal-500/50 pl-2">
                        "{cit.quote}"
                      </p>
                      {cit.relevance && (
                        <p className="text-[11px] text-slate-400">{cit.relevance}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    No evidence citations pinned yet. Highlight text above or click '+ Add Manual Citation'.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane (5 Cols): Dual-Review Decision Dock & AI Screener */}
        <div className="lg:col-span-5 space-y-4">
          {/* AI Dual-Reviewer Screener */}
          <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-900/60 rounded-2xl p-4 space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-xs">AI Dual-Reviewer Assistant</h3>
                  <p className="text-[11px] text-slate-400">Evaluates against PICOC and criteria</p>
                </div>
              </div>
              <button
                onClick={handleRunAiScreen}
                disabled={isAiScreening}
                className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50 transition inline-flex items-center gap-1.5"
              >
                {isAiScreening ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    <span>Run AI Screener</span>
                  </>
                )}
              </button>
            </div>

            {aiError && (
              <div className="text-[11px] text-rose-300 bg-rose-950/50 p-2 rounded-lg border border-rose-900">
                {aiError}
              </div>
            )}

            {article.aiSuggestedDecision && (
              <div className="bg-slate-950 p-3 rounded-xl border border-indigo-800/40 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 font-medium">Verdict:</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                        article.aiSuggestedDecision === 'include'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : article.aiSuggestedDecision === 'exclude'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {article.aiSuggestedDecision}
                    </span>
                  </div>
                  {article.aiConfidence && (
                    <span className="text-[11px] text-indigo-300 font-mono">
                      Confidence: {article.aiConfidence}%
                    </span>
                  )}
                </div>

                <p className="text-slate-300 text-xs leading-relaxed">{article.aiReason}</p>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => handleDecision(article.aiSuggestedDecision!, article.aiReason)}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] rounded-lg transition"
                  >
                    Accept AI Recommendation
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Explicit Screening Rules Checklist */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
              Eligibility Criteria Checklist
            </h3>

            <div className="space-y-2 text-xs max-h-48 overflow-y-auto">
              {project.inclusionCriteria.map((crit) => (
                <div key={crit.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="font-bold text-white text-[11px] block">{crit.dimension}</span>
                  <div className="text-[11px] text-emerald-400 mt-0.5">
                    <span className="font-semibold">Include: </span>
                    {crit.includeRule}
                  </div>
                  <div className="text-[11px] text-rose-400 mt-0.5">
                    <span className="font-semibold">Exclude: </span>
                    {crit.excludeRule}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Paper Study-Area Sensing & Location Connections */}
          {(() => {
            const geo = assessGeographicEligibility(article, project);
            return (
              <div
                className={`rounded-2xl p-4 border space-y-2 text-xs ${
                  !geo.isEligible
                    ? 'bg-rose-950/30 border-rose-700/70'
                    : geo.isStrictGeographicScope && !geo.isGeographicConfirmed
                    ? 'bg-amber-950/25 border-amber-700/60'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-teal-400" />
                    <span>Studied Place Sensing</span>
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      !geo.isEligible
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : geo.isStrictGeographicScope && !geo.isGeographicConfirmed
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {geo.verdictLabel}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300">
                  <span className="text-slate-400">Detected: </span>
                  <strong className="text-white">{geo.primaryPlaceLabel}</strong> ({geo.detectedScaleLabel})
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{geo.interpretiveSummary}</p>
                {geo.studyAreaConnections && geo.studyAreaConnections.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/80 max-h-36 overflow-y-auto">
                    {geo.studyAreaConnections.slice(0, 4).map((conn, idx) => (
                      <div key={idx} className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 text-[10px] space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-teal-300 inline-flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5" />
                            {conn.place} ({conn.sourcePart}{conn.pageNumber ? ` · p.${conn.pageNumber}` : ''})
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded uppercase font-bold ${
                              conn.alignment === 'conflict'
                                ? 'bg-rose-500/20 text-rose-300'
                                : conn.alignment === 'aligned'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {conn.role === 'primary_study_area' ? 'Study Site' : 'Mention'}
                          </span>
                        </div>
                        <p className="text-slate-400 italic">"{conn.quote}"</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* 4-Pillar Integrated Case, Factors, Models & Validation Check */}
          {(() => {
            const ca = evaluateIntegratedConceptAlignment(article, project);
            return (
              <div
                className={`rounded-2xl p-4 border space-y-2.5 text-xs ${
                  ca.isOffTopicCaseMismatch
                    ? 'bg-rose-950/30 border-rose-700/70'
                    : ca.caseAnchorMatched && ca.pillarsMatchedCount >= 2
                    ? 'bg-emerald-950/20 border-emerald-800/50'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>4-Pillar Case · Methods Check</span>
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${
                      ca.isOffTopicCaseMismatch
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : ca.caseAnchorMatched && ca.pillarsMatchedCount >= 2
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {ca.isOffTopicCaseMismatch
                      ? 'Case Mismatch'
                      : `${ca.pillarsMatchedCount}/4 Pillars (${ca.integratedScore}%)`}
                  </span>
                </div>

                {ca.isOffTopicCaseMismatch && ca.offTopicReason && (
                  <p className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-lg px-2.5 py-1.5">
                    {ca.offTopicReason}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Suspected Case</span>
                    <span className="font-semibold text-white">
                      {ca.matchedCasePhrases[0] || (ca.isOffTopicCaseMismatch ? 'Off-Topic' : ca.targetCasePhrases[0] || 'Not matched')}
                    </span>
                  </div>
                  <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Conditioning Factors</span>
                    <span className="font-semibold text-teal-300">
                      {ca.conditioningFactors.slice(0, 4).join(', ') || 'None detected'}
                    </span>
                  </div>
                  <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Analytical Models</span>
                    <span className="font-semibold text-indigo-300">
                      {ca.analyticalModels.slice(0, 4).join(', ') || 'None detected'}
                    </span>
                  </div>
                  <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Validation &amp; Application</span>
                    <span className="font-semibold text-emerald-300">
                      {[...ca.validationMetrics.slice(0, 2), ...ca.applicationOutcomes.slice(0, 1)].join(', ') || 'None detected'}
                    </span>
                  </div>
                </div>

                {ca.evidenceQuote && (
                  <p className="text-[10px] text-slate-400 italic border-l-2 border-indigo-500/40 pl-2">
                    "{ca.evidenceQuote}"
                  </p>
                )}
              </div>
            );
          })()}

          {/* Decision Controller Dock */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-sm">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider">
              Screening Decision & Action
            </h3>

            {/* Current Decision Badge & Manual Override Protection */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Current Status:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded uppercase text-[11px] ${
                    article.decision === 'include'
                      ? 'text-emerald-400 bg-emerald-500/20'
                      : article.decision === 'exclude'
                      ? 'text-rose-400 bg-rose-500/20'
                      : article.decision === 'uncertain'
                      ? 'text-amber-400 bg-amber-500/20'
                      : 'text-slate-400 bg-slate-800'
                  }`}
                >
                  {article.decision}
                </span>
              </div>
              {article.manualOverride && (
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold">
                    Manual Override Protected
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateArticle(
                        applyManualScreeningDecision(article, project, {
                          decision: article.decision,
                          screeningStage: article.screeningStage,
                          clearManualOverride: true,
                        })
                      )
                    }
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] border border-slate-700 transition cursor-pointer"
                    title="Allow automated Mode B re-screen to re-evaluate this article"
                  >
                    Unlock
                  </button>
                </div>
              )}
            </div>

            {/* Decision Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleDecision('include')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
                  article.decision === 'include'
                    ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                    : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 border border-emerald-800/60'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>INCLUDE</span>
              </button>

              <button
                onClick={() => handleDecision('uncertain')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
                  article.decision === 'uncertain'
                    ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                    : 'bg-amber-950/40 text-amber-300 hover:bg-amber-900/60 border border-amber-800/60'
                }`}
              >
                <HelpCircle className="w-4 h-4" />
                <span>UNCERTAIN</span>
              </button>

              <button
                onClick={() => handleDecision('exclude')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
                  article.decision === 'exclude'
                    ? 'bg-rose-600 text-white ring-2 ring-rose-400'
                    : 'bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 border border-rose-800/60'
                }`}
              >
                <X className="w-4 h-4" />
                <span>EXCLUDE</span>
              </button>
            </div>

            {/* Exclusion Reason Dropdown (if excluding) */}
            <div className="space-y-1.5 text-xs">
              <label className="block text-[11px] text-slate-400 font-semibold">
                Exclusion Reason (PRISMA 2020 reporting):
              </label>
              <select
                value={selectedReason}
                onChange={(e) => {
                  setSelectedReason(e.target.value);
                  if (article.decision === 'exclude') {
                    handleDecision('exclude', e.target.value);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl p-2 text-xs focus:outline-none focus:border-indigo-500"
              >
                {project.standardExclusionReasons.map((r, idx) => (
                  <option key={idx} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Reviewer Notes */}
            <div className="space-y-1.5 text-xs">
              <label className="block text-[11px] text-slate-400 font-semibold">
                Dual-Reviewer Notes & Consensus:
              </label>
              <textarea
                rows={2}
                placeholder="Add working notes on GSD, latency, ground truth, or uncertainty (auto-saves)..."
                value={reviewerNotes}
                onChange={(e) => handleNotesChangeAutoSave(e.target.value)}
                onBlur={() => {
                  if (notesTimerRef.current) {
                    clearTimeout(notesTimerRef.current);
                    notesTimerRef.current = null;
                  }
                  onUpdateArticle({
                    ...article,
                    reviewerNotes,
                  });
                }}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl p-2 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
