import React, { useState, useEffect } from 'react';
import {
  Article,
  ModuleQaRescanRecord,
  ReviewProject,
  ScreeningDecision,
  WorkbenchModuleId,
} from '../types';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Keyboard,
  Filter,
  Check,
  Star,
  Zap,
  Tag,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { apiService } from '../services/apiService';
import { AutoSaveStatusInfo, ModuleWorkbenchControls } from './ModuleWorkbenchControls';

interface TitleScreeningWorkbenchProps {
  project: ReviewProject;
  articles: Article[];
  onUpdateArticle: (article: Article) => void;
  onNavigateToFullText: (articleId: string) => void;
  onToggleStarArticle: (articleId: string) => void;
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
}

export const TitleScreeningWorkbench: React.FC<TitleScreeningWorkbenchProps> = ({
  project,
  articles,
  onUpdateArticle,
  onNavigateToFullText,
  onToggleStarArticle,
  autoSaveStatus,
  onResetWorkbenchModule,
  onDirectAddDataFiles,
  onRescanWithQueryQA,
  onDeleteQaEntry,
  onOpenBulkImporter,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<'all' | 'unscreened' | 'uncertain'>('unscreened');
  const [selectedExclusionReason, setSelectedExclusionReason] = useState<string>('');
  const [isAiScreening, setIsAiScreening] = useState(false);

  // Filtered candidate articles for title screening
  const candidateArticles = articles.filter((art) => {
    if (art.isDuplicate) return false;
    if (filterMode === 'unscreened') return art.decision === 'unscreened';
    if (filterMode === 'uncertain') return art.decision === 'uncertain';
    return true;
  });

  const activeArticle = candidateArticles[currentIndex] || candidateArticles[0] || articles[0];

  // Hotkey keyboard listener (I, E, U, ArrowLeft, ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is focused on an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (!activeArticle) return;

      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        handleMakeDecision('include');
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        handleMakeDecision('exclude');
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        handleMakeDecision('uncertain');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeArticle, currentIndex, candidateArticles.length]);

  const handleMakeDecision = (decision: ScreeningDecision, reason?: string) => {
    if (!activeArticle) return;
    const finalReason =
      reason || (decision === 'exclude' ? (selectedExclusionReason || project.standardExclusionReasons[0]) : undefined);

    const updated: Article = {
      ...activeArticle,
      decision,
      decisionReason: finalReason,
      screeningStage: decision === 'include' ? 'full_text' : decision === 'exclude' ? 'excluded' : 'title_abstract',
    };

    onUpdateArticle(updated);

    // Auto-advance
    if (currentIndex < candidateArticles.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < candidateArticles.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  // AI Assist recommendation
  const handleRunAiRecommendation = async () => {
    if (!activeArticle) return;
    setIsAiScreening(true);
    try {
      const result = await apiService.screenArticle(activeArticle, project);
      if (result) {
        const updated: Article = {
          ...activeArticle,
          aiSuggestedDecision: result.decision,
          aiConfidence: result.confidenceScore,
          aiReason: result.primaryReason,
        };
        onUpdateArticle(updated);
      }
    } catch (e) {
      console.warn('AI recommendation failed:', e);
    } finally {
      setIsAiScreening(false);
    }
  };

  // Keyword highlighting helper
  const renderHighlightedText = (text: string) => {
    if (!text) return null;
    const includeKeywords = ['uav', 'drone', 'unmanned', 'canopy', 'stress', 'thermal', 'multispectral', 'gsd', 'latency', 'machine learning', 'random forest', 'gully', 'erosion'];
    const excludeKeywords = ['satellite-only', 'sentinel-2', 'landsat', 'narrative review', 'scoping review', 'editorial', 'flume experiment', 'opinion'];

    const words = text.split(/(\s+)/);
    return words.map((word, i) => {
      const clean = word.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (includeKeywords.includes(clean)) {
        return (
          <mark key={i} className="bg-emerald-500/25 text-emerald-200 px-1 py-0.5 rounded font-semibold border-b border-emerald-500/50">
            {word}
          </mark>
        );
      }
      if (excludeKeywords.includes(clean)) {
        return (
          <mark key={i} className="bg-rose-500/25 text-rose-200 px-1 py-0.5 rounded font-semibold border-b border-rose-500/50">
            {word}
          </mark>
        );
      }
      return <span key={i}>{word}</span>;
    });
  };

  const screenedTotal = articles.filter((a) => a.decision !== 'unscreened' && !a.isDuplicate).length;
  const nonDuplicateTotal = articles.filter((a) => !a.isDuplicate).length;

  return (
    <div className="space-y-5">
      <ModuleWorkbenchControls
        project={project}
        moduleId="title_screening"
        moduleLabel="Title Screening Workbench"
        autoSaveStatus={autoSaveStatus}
        resetFieldsLabel="Reset Decisions -> Unscreened"
        deleteModes={['excluded', 'uncertain', 'unscreened']}
        onResetModule={onResetWorkbenchModule}
        onResetLocalView={() => setCurrentIndex(0)}
        onAddDataFiles={onDirectAddDataFiles}
        onOpenBulkImporter={onOpenBulkImporter}
        onRescanQueryQA={onRescanWithQueryQA}
        onDeleteQaEntry={onDeleteQaEntry}
      />
      {/* Top Controller */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-500/10 text-violet-300 border border-violet-500/30">
            <Keyboard className="w-3.5 h-3.5 text-violet-400" />
            <span>High-Speed Keyboard Triage (Hotkeys: I = Include, E = Exclude, U = Uncertain)</span>
          </div>
          <h2 className="text-xl font-bold text-white">Title & Abstract Screening Workbench</h2>
          <p className="text-xs text-slate-400">
            Rapid initial triage against predefined PICOC inclusion/exclusion criteria with automated keyword highlighting.
          </p>
        </div>

        {/* Progress & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <span className="text-[11px] text-slate-400">Screening Progress:</span>
            <p className="text-sm font-bold text-white font-mono">
              {screenedTotal} / {nonDuplicateTotal} ({Math.round((screenedTotal / Math.max(nonDuplicateTotal, 1)) * 100)}%)
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => {
                setFilterMode('unscreened');
                setCurrentIndex(0);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                filterMode === 'unscreened' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Unscreened ({articles.filter((a) => a.decision === 'unscreened' && !a.isDuplicate).length})
            </button>
            <button
              onClick={() => {
                setFilterMode('uncertain');
                setCurrentIndex(0);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                filterMode === 'uncertain' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Uncertain ({articles.filter((a) => a.decision === 'uncertain' && !a.isDuplicate).length})
            </button>
            <button
              onClick={() => {
                setFilterMode('all');
                setCurrentIndex(0);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                filterMode === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {candidateArticles.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">All Studies in this View Screened!</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            You have processed all candidate studies for this filter. Switch to "All" or proceed to Full-Text Eligibility.
          </p>
          <button
            onClick={() => onNavigateToFullText(articles[0]?.id || '')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <span>Proceed to Full-Text Screening</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : activeArticle && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
          {/* Article Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-slate-300 border border-slate-800">
                  {activeArticle.sourceDatabase} · {activeArticle.year}
                </span>

                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    activeArticle.decision === 'include'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : activeArticle.decision === 'exclude'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : activeArticle.decision === 'uncertain'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  Status: {activeArticle.decision}
                </span>

                {activeArticle.doi && (
                  <a
                    href={activeArticle.url || `https://doi.org/${activeArticle.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-slate-500 hover:text-indigo-400 font-mono inline-flex items-center gap-1"
                  >
                    <span>DOI: {activeArticle.doi}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-white leading-snug">
                {renderHighlightedText(activeArticle.title)}
              </h3>

              <p className="text-xs text-slate-400">
                <span className="text-slate-300 font-medium">{activeArticle.authors?.join(', ')}</span> ·{' '}
                <span className="italic text-indigo-300">{activeArticle.journal}</span>
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => onToggleStarArticle(activeArticle.id)}
                className={`p-2 rounded-xl border transition cursor-pointer ${
                  activeArticle.isStarred
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-amber-400'
                }`}
                title={activeArticle.isStarred ? 'Starred study' : 'Star this study'}
              >
                <Star className={`w-4 h-4 ${activeArticle.isStarred ? 'fill-amber-400' : ''}`} />
              </button>

              <button
                type="button"
                onClick={handleRunAiRecommendation}
                disabled={isAiScreening}
                className="px-3 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Sparkles className={`w-3.5 h-3.5 text-indigo-400 ${isAiScreening ? 'animate-spin' : ''}`} />
                <span>AI Recommendation</span>
              </button>
            </div>
          </div>

          {/* AI Recommendation Banner if available */}
          {activeArticle.aiSuggestedDecision && (
            <div className="p-3 bg-gradient-to-r from-indigo-950/60 to-purple-950/40 border border-indigo-800/70 rounded-2xl flex items-start gap-3 text-xs">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">AI Dual-Reviewer Assessment:</span>
                  <span
                    className={`px-2 py-0.2 rounded text-[10px] font-bold uppercase ${
                      activeArticle.aiSuggestedDecision === 'include'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : activeArticle.aiSuggestedDecision === 'exclude'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    Suggests {activeArticle.aiSuggestedDecision} ({activeArticle.aiConfidence}% confidence)
                  </span>
                </div>
                <p className="text-slate-300 text-[11px]">{activeArticle.aiReason}</p>
              </div>
            </div>
          )}

          {/* Abstract Body with highlighted keywords */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span>Abstract Text:</span>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Inclusion Keywords
                </span>
                <span className="inline-flex items-center gap-1 text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-400" /> Exclusion Triggers
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
              {renderHighlightedText(activeArticle.abstract)}
            </div>
          </div>

          {/* Exclusion Reason Quick Selector */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <span className="text-[11px] text-slate-400 font-semibold block">
              If Excluded, Standard Reason (PRISMA Requirement):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {project.standardExclusionReasons.map((reason, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedExclusionReason(reason)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] transition cursor-pointer text-left ${
                    selectedExclusionReason === reason
                      ? 'bg-rose-950/80 text-rose-200 border border-rose-700'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          {/* Big Decision Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-xl text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Prev (←)</span>
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={currentIndex >= candidateArticles.length - 1}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-xl text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Next (→)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleMakeDecision('exclude')}
                className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold rounded-xl transition inline-flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                <span>Exclude (E)</span>
              </button>

              <button
                type="button"
                onClick={() => handleMakeDecision('uncertain')}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-amber-600/80 hover:bg-amber-600 text-white font-semibold rounded-xl transition inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <HelpCircle className="w-4 h-4" />
                <span>Uncertain (U)</span>
              </button>

              <button
                type="button"
                onClick={() => handleMakeDecision('include')}
                className="flex-1 sm:flex-none px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl transition inline-flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Include (I)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
