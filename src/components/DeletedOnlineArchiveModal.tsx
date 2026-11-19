import React, { useState, useEffect, useMemo } from 'react';
import { DeletedOnlineArticleRecord, Article } from '../types';
import { apiService } from '../services/apiService';
import {
  ArchiveRestore,
  Star,
  Trash2,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';

interface DeletedOnlineArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
  onRestoredArticles: (res: {
    restoredCount: number;
    restoredArticles: Article[];
    remainingArticles: Article[];
    remainingDeletedCount: number;
    databaseFolderPath?: string;
  }) => void;
  onCountChange?: (count: number) => void;
}

export const DeletedOnlineArchiveModal: React.FC<DeletedOnlineArchiveModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectTitle,
  onRestoredArticles,
  onCountChange,
}) => {
  const [items, setItems] = useState<DeletedOnlineArticleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterView, setFilterView] = useState<'all' | 'interest'>('all');
  const [restoreMode, setRestoreMode] = useState<'unscreened' | 'starred' | 'include'>('unscreened');
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadArchive = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await apiService.fetchDeletedOnlineArticles(projectId);
      const list = Array.isArray(res.items) ? res.items : [];
      setItems(list);
      onCountChange?.(list.length);
      setSelectedArchiveIds((prev) => {
        const valid = new Set(list.map((r) => r.archiveId));
        const next = new Set<string>();
        prev.forEach((id) => {
          if (valid.has(id)) next.add(id);
        });
        return next;
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to load deleted online files.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && projectId) {
      setFeedback(null);
      setConfirmPurge(false);
      void loadArchive();
    }
  }, [isOpen, projectId]);

  const interestCount = useMemo(
    () => items.filter((r) => Boolean(r.reviewerInterestSelected)).length,
    [items]
  );

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return items.filter((rec) => {
      if (filterView === 'interest' && !rec.reviewerInterestSelected) return false;
      if (!q) return true;
      const art = rec.article;
      return (
        (art.title || '').toLowerCase().includes(q) ||
        (art.doi || '').toLowerCase().includes(q) ||
        (art.sourceDatabase || '').toLowerCase().includes(q) ||
        (art.journal || '').toLowerCase().includes(q) ||
        (art.authors || []).some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [items, filterView, searchTerm]);

  const handleToggleInterest = async (rec: DeletedOnlineArticleRecord) => {
    const nextVal = !rec.reviewerInterestSelected;
    setItems((prev) =>
      prev.map((it) =>
        it.archiveId === rec.archiveId ? { ...it, reviewerInterestSelected: nextVal } : it
      )
    );
    try {
      const res = await apiService.updateDeletedOnlineInterest(projectId, {
        archiveIds: [rec.archiveId],
        reviewerInterestSelected: nextVal,
      });
      if (Array.isArray(res.items)) {
        setItems(res.items);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Could not update reviewer interest flag.' });
    }
  };

  const handleRestoreSelected = async () => {
    if (selectedArchiveIds.size === 0 || isProcessing) return;
    setIsProcessing(true);
    setFeedback(null);
    try {
      const archiveIds = Array.from(selectedArchiveIds);
      const res = await apiService.restoreDeletedOnlineArticles(projectId, {
        archiveIds,
        restoreMode,
      });
      setSelectedArchiveIds(new Set());
      onRestoredArticles({
        restoredCount: res.restoredCount,
        restoredArticles: res.restoredArticles,
        remainingArticles: res.remainingArticles,
        remainingDeletedCount: res.remainingDeletedCount,
        databaseFolderPath: res.databaseFolderPath,
      });
      await loadArchive();
      setFeedback({
        type: 'success',
        text: `Built ${res.restoredCount} deleted online database file(s) back into the active Article Library (${
          restoreMode === 'include'
            ? 'Included'
            : restoreMode === 'starred'
            ? 'Starred & ready for Fast Batch Screener'
            : 'Unscreened & ready for Fast Batch Screener'
        }).`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to build selected files back.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePurgeSelected = async () => {
    if (selectedArchiveIds.size === 0 || isProcessing) return;
    if (!confirmPurge) {
      setConfirmPurge(true);
      return;
    }
    setIsProcessing(true);
    setFeedback(null);
    try {
      const res = await apiService.purgeDeletedOnlineArticles(projectId, {
        archiveIds: Array.from(selectedArchiveIds),
      });
      setSelectedArchiveIds(new Set());
      setConfirmPurge(false);
      await loadArchive();
      setFeedback({
        type: 'success',
        text: `Permanently purged ${res.purgedCount} record(s) from the deleted archive.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to purge selected records.' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
              <ArchiveRestore className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-white text-base truncate">
                Deleted Online Database Files — Reviewer Interest &amp; Selective Restore
              </h3>
              <p className="text-xs text-slate-400 truncate">
                Review: <span className="text-slate-200 font-medium">{projectTitle}</span> · Stored separately from Article Library
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer shrink-0"
            title="Close deleted archive"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Strict Isolation Notice */}
        <div className="px-6 py-3 bg-slate-950/70 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-start sm:items-center gap-2 text-amber-200">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong>No Auto-Recovery:</strong> Deleted online database files stay strictly excluded from the{' '}
              <strong>Article Library</strong>, active PRISMA counts, and <strong>Fast Batch Screener</strong> unless you check and build them back below.
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-300 tabular-nums shrink-0">
            {items.length} Archived · {interestCount} Reviewer Interest
          </span>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`mx-6 mt-4 px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-200'
                : 'bg-rose-950/50 border-rose-700/60 text-rose-200'
            }`}
          >
            <span className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Filter & Selection Toolbar */}
        <div className="px-6 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter deleted online records..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="button"
              onClick={() => setFilterView('all')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer whitespace-nowrap shrink-0 transition ${
                filterView === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              All Deleted ({items.length})
            </button>

            <button
              type="button"
              onClick={() => setFilterView('interest')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 transition ${
                filterView === 'interest'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-950 text-amber-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Star className="w-3 h-3 fill-current" />
              <span>Reviewer Interest ({interestCount})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={filteredItems.length === 0}
              onClick={() => setSelectedArchiveIds(new Set(filteredItems.map((r) => r.archiveId)))}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-medium cursor-pointer whitespace-nowrap shrink-0"
            >
              Select All ({filteredItems.length})
            </button>
            <button
              type="button"
              disabled={interestCount === 0}
              onClick={() =>
                setSelectedArchiveIds(
                  new Set(items.filter((r) => r.reviewerInterestSelected).map((r) => r.archiveId))
                )
              }
              className="px-2.5 py-1.5 rounded-lg bg-amber-950/70 hover:bg-amber-900 disabled:opacity-40 text-amber-200 border border-amber-700/50 font-medium cursor-pointer whitespace-nowrap shrink-0"
            >
              Select Interest ({interestCount})
            </button>
            {selectedArchiveIds.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedArchiveIds(new Set());
                  setConfirmPurge(false);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 cursor-pointer whitespace-nowrap shrink-0"
              >
                Clear ({selectedArchiveIds.size})
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="p-6 overflow-y-auto flex-1 space-y-2.5">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading deleted online archive...</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
              <ArchiveRestore className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">
                {items.length === 0
                  ? 'No deleted online database files in this review partition'
                  : 'No deleted records match the active filter'}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                When online database articles are deleted from the Article Library, they are kept here outside the library and Fast Batch Screener so you can optionally mark reviewer interest or build them back later.
              </p>
            </div>
          ) : (
            filteredItems.map((rec) => {
              const art = rec.article;
              const isChecked = selectedArchiveIds.has(rec.archiveId);
              return (
                <div
                  key={rec.archiveId}
                  className={`p-3.5 rounded-xl border transition flex items-start gap-3 ${
                    isChecked
                      ? 'bg-teal-950/25 border-teal-500/60'
                      : rec.reviewerInterestSelected
                      ? 'bg-amber-950/15 border-amber-700/50'
                      : 'bg-slate-950/70 border-slate-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                      setConfirmPurge(false);
                      setSelectedArchiveIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(rec.archiveId)) next.delete(rec.archiveId);
                        else next.add(rec.archiveId);
                        return next;
                      });
                    }}
                    className="mt-1 rounded accent-teal-500 cursor-pointer shrink-0"
                  />

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                      <span className="text-indigo-300 font-semibold">{art.sourceDatabase}</span>
                      <span>·</span>
                      <span className="tabular-nums">{art.year}</span>
                      <span>·</span>
                      <span className="text-slate-500">
                        Deleted {new Date(rec.deletedAt).toLocaleString()}
                      </span>
                      {rec.reviewerInterestSelected && (
                        <span className="text-amber-300 font-sans font-semibold">★ Reviewer Interest</span>
                      )}
                    </div>

                    <h4 className="text-xs sm:text-sm font-bold text-white leading-snug">{art.title}</h4>
                    <p className="text-[11px] text-slate-400">
                      {(art.authors || []).slice(0, 4).join(', ')}
                      {(art.authors || []).length > 4 ? ' et al.' : ''} ·{' '}
                      <span className="italic text-slate-300">{art.journal}</span>
                      {art.doi && <span className="font-mono text-slate-500 ml-2">DOI: {art.doi}</span>}
                    </p>
                    {art.abstract && (
                      <p className="text-[11px] text-slate-500 line-clamp-2">{art.abstract}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleToggleInterest(rec)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 transition ${
                        rec.reviewerInterestSelected
                          ? 'bg-amber-600 text-white border-amber-500'
                          : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-slate-700'
                      }`}
                      title="Toggle reviewer interest bookmark (keeps item outside Article Library until restored)"
                    >
                      <Star className={`w-3 h-3 ${rec.reviewerInterestSelected ? 'fill-white' : ''}`} />
                      <span>{rec.reviewerInterestSelected ? 'Interested' : 'Mark Interest'}</span>
                    </button>

                    {(art.url || art.doi) && (
                      <a
                        href={art.url || `https://doi.org/${art.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open Link</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Restore / Purge Bar */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-slate-400 font-medium">When rebuilding back:</label>
            <select
              value={restoreMode}
              onChange={(e) => setRestoreMode(e.target.value as 'unscreened' | 'starred' | 'include')}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500 cursor-pointer"
            >
              <option value="unscreened">Add as Unscreened (for Fast Batch Screener)</option>
              <option value="starred">Add &amp; Mark Starred (★) for Screening</option>
              <option value="include">Add &amp; Include Directly in Review</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedArchiveIds.size === 0 || isProcessing}
              onClick={() => void handlePurgeSelected()}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 transition ${
                confirmPurge
                  ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500'
                  : 'bg-slate-900 hover:bg-rose-950/70 text-rose-300 border-rose-800/60'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                {confirmPurge
                  ? `Confirm Permanent Purge (${selectedArchiveIds.size})`
                  : `Purge Selected (${selectedArchiveIds.size})`}
              </span>
            </button>

            <button
              type="button"
              disabled={selectedArchiveIds.size === 0 || isProcessing}
              onClick={() => void handleRestoreSelected()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-md cursor-pointer whitespace-nowrap shrink-0 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                {isProcessing
                  ? 'Rebuilding...'
                  : `Build Selected Back to Library (${selectedArchiveIds.size})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
