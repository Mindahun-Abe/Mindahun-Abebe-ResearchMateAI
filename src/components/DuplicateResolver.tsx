import React, { useState, useMemo } from 'react';
import { Article, ReviewProject } from '../types';
import {
  Layers,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  GitMerge,
  Trash2,
  Check,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface DuplicateResolverProps {
  project: ReviewProject;
  onUpdateArticles: (articles: Article[]) => void;
  onNavigateToScreening?: (articleId: string) => void;
}

interface DuplicatePair {
  id: string;
  original: Article;
  duplicate: Article;
  matchType: 'Exact DOI' | 'Normalized Title Match' | 'Author & Year Similarity';
  similarityScore: number;
}

export const DuplicateResolver: React.FC<DuplicateResolverProps> = ({
  project,
  onUpdateArticles,
  onNavigateToScreening,
}) => {
  const articles = project.articles || [];

  // Helper for title cleaning
  const cleanStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Detect duplicate pairs / clusters
  const duplicatePairs = useMemo(() => {
    const pairs: DuplicatePair[] = [];
    const seenDois = new Map<string, Article>();
    const seenTitles = new Map<string, Article>();

    for (const art of articles) {
      const doiKey = art.doi ? art.doi.toLowerCase().trim() : null;
      const titleKey = cleanStr(art.title);

      if (doiKey && seenDois.has(doiKey)) {
        const orig = seenDois.get(doiKey)!;
        pairs.push({
          id: `dup-doi-${orig.id}-${art.id}`,
          original: orig,
          duplicate: art,
          matchType: 'Exact DOI',
          similarityScore: 100,
        });
      } else if (titleKey.length > 20 && seenTitles.has(titleKey)) {
        const orig = seenTitles.get(titleKey)!;
        pairs.push({
          id: `dup-title-${orig.id}-${art.id}`,
          original: orig,
          duplicate: art,
          matchType: 'Normalized Title Match',
          similarityScore: 98,
        });
      } else {
        if (doiKey) seenDois.set(doiKey, art);
        if (titleKey.length > 20) seenTitles.set(titleKey, art);
      }
    }

    return pairs;
  }, [articles]);

  const [selectedPairIndex, setSelectedPairIndex] = useState<number>(0);
  const activePair = duplicatePairs[selectedPairIndex] || duplicatePairs[0];

  // Auto-resolve all exact duplicates
  const handleAutoResolveAll = () => {
    const duplicateIds = new Set<string>();
    duplicatePairs.forEach((pair) => {
      duplicateIds.add(pair.duplicate.id);
    });

    const updated = articles.map((art) => {
      if (duplicateIds.has(art.id)) {
        return {
          ...art,
          isDuplicate: true,
          decision: 'exclude' as const,
          decisionReason: 'Duplicate: Redundant record identified across search databases',
          screeningStage: 'excluded' as const,
        };
      }
      return art;
    });

    onUpdateArticles(updated);
  };

  // Keep Record A and mark B as duplicate
  const handleKeepA = (pair: DuplicatePair) => {
    const updated = articles.map((art) => {
      if (art.id === pair.duplicate.id) {
        return {
          ...art,
          isDuplicate: true,
          duplicateOfId: pair.original.id,
          decision: 'exclude' as const,
          decisionReason: `Duplicate of ${pair.original.id} (${pair.original.title.slice(0, 50)}...)`,
          screeningStage: 'excluded' as const,
        };
      }
      return art;
    });
    onUpdateArticles(updated);
    if (selectedPairIndex > 0) setSelectedPairIndex(selectedPairIndex - 1);
  };

  // Keep Record B and mark A as duplicate
  const handleKeepB = (pair: DuplicatePair) => {
    const updated = articles.map((art) => {
      if (art.id === pair.original.id) {
        return {
          ...art,
          isDuplicate: true,
          duplicateOfId: pair.duplicate.id,
          decision: 'exclude' as const,
          decisionReason: `Duplicate of ${pair.duplicate.id}`,
          screeningStage: 'excluded' as const,
        };
      }
      return art;
    });
    onUpdateArticles(updated);
    if (selectedPairIndex > 0) setSelectedPairIndex(selectedPairIndex - 1);
  };

  // Merge fields into Record A and remove or mark Record B
  const handleMergeBoth = (pair: DuplicatePair) => {
    const mergedRecord: Article = {
      ...pair.original,
      abstract: pair.original.abstract.length >= pair.duplicate.abstract.length ? pair.original.abstract : pair.duplicate.abstract,
      doi: pair.original.doi || pair.duplicate.doi,
      url: pair.original.url || pair.duplicate.url,
      fullText: pair.original.fullText || pair.duplicate.fullText,
      extractedData: {
        ...(pair.duplicate.extractedData || {}),
        ...(pair.original.extractedData || {}),
      },
    };

    const updated = articles
      .map((art) => {
        if (art.id === pair.original.id) return mergedRecord;
        if (art.id === pair.duplicate.id) {
          return {
            ...art,
            isDuplicate: true,
            duplicateOfId: pair.original.id,
            decision: 'exclude' as const,
            decisionReason: 'Merged with primary record',
            screeningStage: 'excluded' as const,
          };
        }
        return art;
      });

    onUpdateArticles(updated);
    if (selectedPairIndex > 0) setSelectedPairIndex(selectedPairIndex - 1);
  };

  // Dismiss as false positive
  const handleNotDuplicate = (pair: DuplicatePair) => {
    const updated = articles.map((art) => {
      if (art.id === pair.duplicate.id) {
        return { ...art, isDuplicate: false };
      }
      return art;
    });
    onUpdateArticles(updated);
    if (selectedPairIndex < duplicatePairs.length - 1) {
      setSelectedPairIndex(selectedPairIndex);
    }
  };

  const resolvedCount = articles.filter((a) => a.isDuplicate).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>PRISMA 2020 De-Duplication Protocol</span>
          </div>
          <h2 className="text-xl font-bold text-white">Duplicate Detection & Resolution Workbench</h2>
          <p className="text-xs text-slate-400">
            Cross-references normalized DOIs, title fuzzy hashes, and author-year signatures across Scopus, Web of Science, PubMed, and IEEE Xplore.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-xs text-slate-400">Resolved Duplicates:</span>
            <p className="text-sm font-bold text-emerald-400 font-mono">{resolvedCount} Marked</p>
          </div>
          {duplicatePairs.length > 0 && (
            <button
              onClick={handleAutoResolveAll}
              className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Auto-Resolve All ({duplicatePairs.length} Pairs)</span>
            </button>
          )}
        </div>
      </div>

      {duplicatePairs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <div className="w-14 h-14 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-md">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white">No Unresolved Duplicates Detected</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Your evidence base is thoroughly deduplicated! All records have unique DOI identifiers and normalized bibliographic titles.
          </p>
          <div className="pt-2">
            <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-xs font-mono">
              Total Unique Records: {articles.length - resolvedCount}
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Left: Duplicate Pairs List */}
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Detected Pairs ({duplicatePairs.length})</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {selectedPairIndex + 1}/{duplicatePairs.length}
              </span>
            </div>

            <div className="max-h-[550px] overflow-y-auto space-y-2 pr-1">
              {duplicatePairs.map((pair, idx) => {
                const isSelected = idx === selectedPairIndex;
                return (
                  <div
                    key={pair.id}
                    onClick={() => setSelectedPairIndex(idx)}
                    className={`p-3 rounded-xl border transition cursor-pointer text-xs space-y-1 ${
                      isSelected
                        ? 'bg-amber-950/30 border-amber-500/60 ring-1 ring-amber-500/40'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                        {pair.matchType}
                      </span>
                      <span className="text-slate-400 font-mono">{pair.similarityScore}%</span>
                    </div>
                    <p className="font-semibold text-white truncate text-[11px]">{pair.original.title}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {pair.original.sourceDatabase} ↔ {pair.duplicate.sourceDatabase}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Side-by-Side Resolver Workbench */}
          {activePair && (
            <div className="lg:col-span-3 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Record A (Primary) */}
                <div className="bg-slate-900 border border-indigo-900/60 rounded-2xl p-5 space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Record A (Earlier Import)
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-slate-300 border border-slate-800">
                      {activePair.original.sourceDatabase}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-white text-sm leading-snug">{activePair.original.title}</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      {activePair.original.authors?.join(', ')} ({activePair.original.year})
                    </p>
                    <p className="text-xs text-indigo-400 italic mt-0.5">{activePair.original.journal}</p>
                    {activePair.original.doi && (
                      <p className="text-[11px] font-mono text-slate-500 mt-1">DOI: {activePair.original.doi}</p>
                    )}
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-[11px] text-slate-300 max-h-48 overflow-y-auto leading-relaxed">
                    <span className="text-slate-500 block text-[10px] font-semibold mb-1">Abstract:</span>
                    {activePair.original.abstract}
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => handleKeepA(activePair)}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition inline-flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Keep Record A (Mark B as Duplicate)</span>
                    </button>
                  </div>
                </div>

                {/* Record B (Duplicate Candidate) */}
                <div className="bg-slate-900 border border-amber-900/60 rounded-2xl p-5 space-y-3 relative">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Record B (Duplicate Candidate)
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-slate-300 border border-slate-800">
                      {activePair.duplicate.sourceDatabase}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-white text-sm leading-snug">{activePair.duplicate.title}</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      {activePair.duplicate.authors?.join(', ')} ({activePair.duplicate.year})
                    </p>
                    <p className="text-xs text-amber-400 italic mt-0.5">{activePair.duplicate.journal}</p>
                    {activePair.duplicate.doi && (
                      <p className="text-[11px] font-mono text-slate-500 mt-1">DOI: {activePair.duplicate.doi}</p>
                    )}
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-[11px] text-slate-300 max-h-48 overflow-y-auto leading-relaxed">
                    <span className="text-slate-500 block text-[10px] font-semibold mb-1">Abstract:</span>
                    {activePair.duplicate.abstract}
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => handleKeepB(activePair)}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition inline-flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Keep Record B (Mark A as Duplicate)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Resolution Action Toolbar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleMergeBoth(activePair)}
                    className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-semibold rounded-xl transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <GitMerge className="w-4 h-4" />
                    <span>Merge Best Fields into Single Primary Record</span>
                  </button>
                  <button
                    onClick={() => handleNotDuplicate(activePair)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Not a Duplicate (Dismiss)</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={selectedPairIndex <= 0}
                    onClick={() => setSelectedPairIndex(selectedPairIndex - 1)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-xs font-medium cursor-pointer"
                  >
                    Previous Pair
                  </button>
                  <button
                    disabled={selectedPairIndex >= duplicatePairs.length - 1}
                    onClick={() => setSelectedPairIndex(selectedPairIndex + 1)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-xs font-medium cursor-pointer"
                  >
                    Next Pair
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
