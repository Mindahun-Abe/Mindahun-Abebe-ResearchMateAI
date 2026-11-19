import React, { useRef, useState } from 'react';
import {
  Check,
  Database,
  FilePlus2,
  History,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ModuleQaRescanRecord, ReviewProject, WorkbenchModuleId } from '../types';

export interface AutoSaveStatusInfo {
  state: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt?: string;
  label?: string;
  error?: string;
}

export type DeleteArticlesModeOption = 'excluded' | 'uncertain' | 'duplicates' | 'unscreened';

export interface ModuleWorkbenchControlsProps {
  project: ReviewProject;
  moduleId: WorkbenchModuleId;
  moduleLabel: string;
  autoSaveStatus?: AutoSaveStatusInfo;
  resetFieldsLabel?: string;
  deleteModes?: DeleteArticlesModeOption[];
  compact?: boolean;
  onResetModule?: (params: {
    target: WorkbenchModuleId;
    resetArticleFields?: boolean;
    deleteArticlesMode?: 'none' | 'excluded' | 'uncertain' | 'unscreened' | 'duplicates';
  }) => Promise<any>;
  onResetLocalView?: () => void;
  onAddDataFiles?: (
    files: FileList,
    options?: { autoScreen?: boolean; rescanQuery?: string; moduleId?: WorkbenchModuleId }
  ) => Promise<{ addedCount: number }>;
  onOpenBulkImporter?: () => void;
  onRescanQueryQA?: (
    moduleId: WorkbenchModuleId,
    query: string,
    applyScreeningUpdates: boolean
  ) => Promise<{ record: ModuleQaRescanRecord; updatedCount?: number }>;
  onDeleteQaEntry?: (moduleId: WorkbenchModuleId, recordId: string) => void;
}

function formatClockTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const ModuleWorkbenchControls: React.FC<ModuleWorkbenchControlsProps> = ({
  project,
  moduleId,
  moduleLabel,
  autoSaveStatus,
  resetFieldsLabel,
  deleteModes = ['excluded', 'uncertain'],
  compact = false,
  onResetModule,
  onResetLocalView,
  onAddDataFiles,
  onOpenBulkImporter,
  onRescanQueryQA,
  onDeleteQaEntry,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [autoScreenAdded, setAutoScreenAdded] = useState(true);
  const [postAddQuery, setPostAddQuery] = useState('');
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  const [showQaDrawer, setShowQaDrawer] = useState(false);
  const [qaQuery, setQaQuery] = useState('');
  const [applyScreeningFromQa, setApplyScreeningFromQa] = useState(false);
  const [isRescanningQa, setIsRescanningQa] = useState(false);
  const [qaError, setQaError] = useState('');

  const [showResetDrawer, setShowResetDrawer] = useState(false);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const [actionBanner, setActionBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const savedQaHistory: ModuleQaRescanRecord[] = project.workbenchState?.qaRescans?.[moduleId] || [];
  const moduleLastSaved =
    project.workbenchState?.moduleLastSavedAt?.[moduleId] ||
    (moduleId === 'briefing' ? project.workbenchState?.briefing?.updatedAt : undefined) ||
    (moduleId === 'proposal' ? project.workbenchState?.proposal?.updatedAt : undefined) ||
    (moduleId === 'export' ? project.workbenchState?.exportConfig?.updatedAt : undefined) ||
    (moduleId === 'batch_screener' ? project.workbenchState?.batchScreener?.lastRunAt : undefined) ||
    project.workbenchState?.lastAutoSavedAt;

  const displayTime = formatClockTime(autoSaveStatus?.lastSavedAt || moduleLastSaved);

  const showToast = (type: 'success' | 'error', text: string) => {
    setActionBanner({ type, text });
    setTimeout(() => {
      setActionBanner((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !onAddDataFiles) return;
    setIsUploadingFiles(true);
    try {
      const res = await onAddDataFiles(files, {
        autoScreen: autoScreenAdded,
        rescanQuery: postAddQuery.trim() || undefined,
        moduleId,
      });
      showToast(
        'success',
        `Added ${res.addedCount} record(s) from ${files.length} file(s) and auto-saved${
          postAddQuery.trim() ? ' + rescanned with Query Q&A' : ''
        }.`
      );
      setPostAddQuery('');
      setShowAddDrawer(false);
    } catch (err: any) {
      showToast('error', err?.message || 'Could not parse uploaded data file(s).');
    } finally {
      setIsUploadingFiles(false);
      e.target.value = '';
    }
  };

  const handleRunQaRescan = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const targetQuery = (overrideQuery ?? qaQuery).trim();
    if (!targetQuery || !onRescanQueryQA) return;
    setIsRescanningQa(true);
    setQaError('');
    try {
      const res = await onRescanQueryQA(moduleId, targetQuery, applyScreeningFromQa);
      setQaQuery('');
      showToast(
        'success',
        `Q&A rescan matched ${res.record.matchedCount}/${res.record.totalScanned} studies and auto-saved.`
      );
    } catch (err: any) {
      setQaError(err?.message || 'Failed to rescan corpus with Query Q&A.');
    } finally {
      setIsRescanningQa(false);
    }
  };

  const executeResetAction = async (
    actionKey: string,
    params: {
      resetArticleFields?: boolean;
      deleteArticlesMode?: 'none' | 'excluded' | 'uncertain' | 'unscreened' | 'duplicates';
    }
  ) => {
    if (pendingConfirmAction !== actionKey) {
      setPendingConfirmAction(actionKey);
      return;
    }
    setIsResetting(true);
    setPendingConfirmAction(null);
    try {
      if (onResetModule) {
        const res = await onResetModule({
          target: moduleId,
          resetArticleFields: params.resetArticleFields,
          deleteArticlesMode: params.deleteArticlesMode || 'none',
        });
        if (!params.deleteArticlesMode || params.deleteArticlesMode === 'none') {
          onResetLocalView?.();
        }
        const removedMsg =
          res?.removedCount && res.removedCount > 0
            ? ` Removed ${res.removedCount} article(s) (deleted online DB files isolated in Archive).`
            : '';
        showToast('success', `${moduleLabel} reset & auto-saved.${removedMsg}`);
      } else {
        onResetLocalView?.();
        showToast('success', `${moduleLabel} cleared.`);
      }
      setShowResetDrawer(false);
    } catch (err: any) {
      showToast('error', err?.message || `Failed to reset ${moduleLabel}.`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className={`bg-slate-900/95 border border-slate-800 rounded-2xl ${compact ? 'p-3' : 'p-3.5'} space-y-2.5 text-xs`}>
      {/* Compact Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
            {autoSaveStatus?.state === 'saving' ? (
              <Loader2 className="w-3.5 h-3.5 text-teal-400 animate-spin" />
            ) : autoSaveStatus?.state === 'error' ? (
              <X className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="font-semibold text-slate-200 whitespace-nowrap">
              {autoSaveStatus?.state === 'saving'
                ? 'Auto-saving...'
                : autoSaveStatus?.state === 'error'
                ? 'Save Warning'
                : 'Auto-Save Active'}
            </span>
            {displayTime && (
              <span className="text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap">
                · {displayTime}
              </span>
            )}
          </div>

          <span className="text-[11px] text-slate-400 hidden sm:inline">
            {moduleLabel} · {savedQaHistory.length} Q&amp;A scan{savedQaHistory.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onAddDataFiles && (
            <button
              type="button"
              onClick={() => {
                setShowAddDrawer((v) => !v);
                setShowQaDrawer(false);
                setShowResetDrawer(false);
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                showAddDrawer
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <FilePlus2 className="w-3.5 h-3.5 text-teal-400" />
              <span>Add Data File</span>
            </button>
          )}

          {onRescanQueryQA && (
            <button
              type="button"
              onClick={() => {
                setShowQaDrawer((v) => !v);
                setShowAddDrawer(false);
                setShowResetDrawer(false);
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                showQaDrawer
                  ? 'bg-teal-600 border-teal-500 text-white'
                  : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <MessageSquareText className="w-3.5 h-3.5 text-teal-400" />
              <span>Rescan with Query Q&amp;A</span>
              {savedQaHistory.length > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono text-teal-300 tabular-nums">
                  {savedQaHistory.length}
                </span>
              )}
            </button>
          )}

          {(onResetModule || onResetLocalView) && (
            <button
              type="button"
              onClick={() => {
                setShowResetDrawer((v) => !v);
                setPendingConfirmAction(null);
                setShowAddDrawer(false);
                setShowQaDrawer(false);
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                showResetDrawer
                  ? 'bg-rose-600 border-rose-500 text-white'
                  : 'bg-slate-950 hover:bg-rose-950/60 border-slate-700 hover:border-rose-700/70 text-slate-300 hover:text-rose-200'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete / Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {actionBanner && (
        <div
          className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            actionBanner.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-200'
              : 'bg-rose-950/60 border-rose-700/60 text-rose-200'
          }`}
        >
          <span>{actionBanner.text}</span>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            className="text-slate-400 hover:text-white p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Drawer 1: Direct Data File Upload + Optional Auto-Screen / Q&A Rescan */}
      {showAddDrawer && onAddDataFiles && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-teal-400" />
                <span>Add Data Files Directly into "{project.title}"</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Supports PDF, RIS, BibTeX (.bib), CSV/TSV, JSON, PubMed (.nbib), EndNote (.enw/.xml), or TXT/Markdown.
              </p>
            </div>
            {onOpenBulkImporter && (
              <button
                type="button"
                onClick={onOpenBulkImporter}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-200 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open Full Bulk / Online Importer
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 items-center">
            <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoScreenAdded}
                onChange={(e) => setAutoScreenAdded(e.target.checked)}
                className="rounded border-slate-600 bg-slate-900 text-teal-500 focus:ring-teal-500"
              />
              <span>Auto-screen newly added records against PICOC &amp; Eligibility Criteria</span>
            </label>

            <input
              type="text"
              value={postAddQuery}
              onChange={(e) => setPostAddQuery(e.target.value)}
              placeholder="Optional: Query Q&A rescan prompt to run right after adding..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.ris,.bib,.bibtex,.csv,.tsv,.txt,.md,.json,.enw,.nbib,.ciw,.xml"
              onChange={handleFilesSelected}
              className="hidden"
            />
            <button
              type="button"
              disabled={isUploadingFiles}
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              {isUploadingFiles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{isUploadingFiles ? 'Parsing & Saving Files...' : 'Choose Data File(s) & Auto-Save'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Drawer 2: Rescan Corpus with Query Q&A + Auto-Saved History */}
      {showQaDrawer && onRescanQueryQA && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <span>Rescan {moduleLabel} with Query Q&amp;A (Auto-Saved)</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Scans all active non-duplicate articles in "{project.title}" and persists cited Q&amp;A findings into workbench storage.
              </p>
            </div>
          </div>

          <form onSubmit={(e) => void handleRunQaRescan(e)} className="space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={qaQuery}
                  onChange={(e) => setQaQuery(e.target.value)}
                  placeholder="Ask a focused research or eligibility question across active studies..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>
              <button
                type="submit"
                disabled={isRescanningQa || !qaQuery.trim()}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                {isRescanningQa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{isRescanningQa ? 'Rescanning...' : 'Run Q&A Rescan'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applyScreeningFromQa}
                  onChange={(e) => setApplyScreeningFromQa(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-900 text-teal-500 focus:ring-teal-500"
                />
                <span>Update AI screening suggestions &amp; relevance rationale on matched articles</span>
              </label>

              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  'Which studies report operational latency or turnaround metrics?',
                  'Identify spatial validation or cross-site leakage findings',
                  'Compare algorithms, sensors, and accuracy benchmarks',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={isRescanningQa}
                    onClick={() => void handleRunQaRescan(undefined, preset)}
                    className="px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-300 cursor-pointer"
                  >
                    {preset.slice(0, 42)}...
                  </button>
                ))}
              </div>
            </div>

            {qaError && (
              <p className="text-[11px] text-rose-400">{qaError}</p>
            )}
          </form>

          {/* Auto-Saved Q&A History for this module */}
          {savedQaHistory.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800/80 max-h-72 overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300 inline-flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-teal-400" />
                  Saved Query Q&amp;A Rescans ({savedQaHistory.length})
                </span>
              </div>
              {savedQaHistory.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-semibold text-teal-300 text-xs">{rec.query}</p>
                      <p className="text-[10px] text-slate-500 font-mono tabular-nums">
                        Matched {rec.matchedCount}/{rec.totalScanned} studies · {rec.engine || 'grounded'} · {formatClockTime(rec.createdAt)}
                        {rec.rescanDecisionsApplied ? ' · Screening Updated' : ''}
                      </p>
                    </div>
                    {onDeleteQaEntry && (
                      <button
                        type="button"
                        onClick={() => onDeleteQaEntry(moduleId, rec.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded cursor-pointer shrink-0"
                        title="Delete this Q&A scan record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-950/70 rounded-md p-2 border border-slate-800/80">
                    {rec.answer}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Drawer 3: Inline 2-Step Delete / Reset */}
      {showResetDrawer && (
        <div className="bg-slate-950 border border-rose-800/50 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-rose-200 text-xs flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                <span>Delete or Reset Options — {moduleLabel}</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Click any action once to arm confirmation, then click again to apply and auto-save to disk.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowResetDrawer(false);
                setPendingConfirmAction(null);
              }}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isResetting}
              onClick={() => void executeResetAction('reset_state', { resetArticleFields: false, deleteArticlesMode: 'none' })}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer whitespace-nowrap shrink-0 ${
                pendingConfirmAction === 'reset_state'
                  ? 'bg-amber-600 border-amber-500 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              {pendingConfirmAction === 'reset_state'
                ? 'Confirm Clear Saved State & Q&A?'
                : `Reset Saved ${moduleLabel} Output & Q&A`}
            </button>

            {resetFieldsLabel && onResetModule && (
              <button
                type="button"
                disabled={isResetting}
                onClick={() => void executeResetAction('reset_fields', { resetArticleFields: true, deleteArticlesMode: 'none' })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer whitespace-nowrap shrink-0 ${
                  pendingConfirmAction === 'reset_fields'
                    ? 'bg-rose-600 border-rose-500 text-white'
                    : 'bg-slate-900 hover:bg-rose-950/60 border-rose-800/50 text-rose-200'
                }`}
              >
                {pendingConfirmAction === 'reset_fields' ? `Confirm ${resetFieldsLabel}?` : resetFieldsLabel}
              </button>
            )}

            {onResetModule &&
              deleteModes.map((mode) => {
                const count =
                  mode === 'excluded'
                    ? project.articles.filter((a) => a.decision === 'exclude').length
                    : mode === 'uncertain'
                    ? project.articles.filter((a) => a.decision === 'uncertain').length
                    : mode === 'duplicates'
                    ? project.articles.filter((a) => a.isDuplicate).length
                    : project.articles.filter((a) => a.decision === 'unscreened').length;
                const labelMap: Record<DeleteArticlesModeOption, string> = {
                  excluded: `Delete Excluded (${count})`,
                  uncertain: `Delete Uncertain (${count})`,
                  duplicates: `Delete Duplicates (${count})`,
                  unscreened: `Delete Unscreened (${count})`,
                };
                const key = `delete_${mode}`;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={isResetting || count === 0}
                    onClick={() => void executeResetAction(key, { deleteArticlesMode: mode })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 ${
                      pendingConfirmAction === key
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-slate-900 hover:bg-rose-950/60 border-rose-800/50 text-rose-300'
                    }`}
                  >
                    {pendingConfirmAction === key ? `Confirm ${labelMap[mode]}?` : labelMap[mode]}
                  </button>
                );
              })}
          </div>
          <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
            <Database className="w-3 h-3 text-slate-500" />
            <span>Deleted online database articles move to the Deleted Online Archive (excluded from Library &amp; Screener unless manually restored).</span>
          </p>
        </div>
      )}
    </div>
  );
};
