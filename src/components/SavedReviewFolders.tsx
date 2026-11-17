import React, { useState } from 'react';
import { ReviewProject } from '../types';
import {
  FolderOpen,
  FolderPlus,
  Database,
  Save,
  Trash2,
  BookOpen,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Layers,
  X,
} from 'lucide-react';

interface SavedReviewFoldersProps {
  projects: ReviewProject[];
  currentProjectId: string;
  onSwitchProject: (projectId: string) => void;
  onOpenProjectLibrary: (projectId: string) => void;
  onCreateNewReview: () => void;
  onSaveFolderChanges: (projectId: string) => Promise<{
    totalInSubLibrary: number;
    savedAt?: string;
    databaseFolderPath?: string;
  }>;
  onDeleteProjectFolder: (projectId: string) => Promise<{
    success: boolean;
    deletedFolderPath?: string;
  }>;
  onOpenAddFilesForProject: (projectId: string) => void;
}

export const SavedReviewFolders: React.FC<SavedReviewFoldersProps> = ({
  projects,
  currentProjectId,
  onSwitchProject,
  onOpenProjectLibrary,
  onCreateNewReview,
  onSaveFolderChanges,
  onDeleteProjectFolder,
  onOpenAddFilesForProject,
}) => {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
    path?: string;
  } | null>(null);

  const handleSaveSingleFolder = async (proj: ReviewProject) => {
    setSavingId(proj.id);
    try {
      const res = await onSaveFolderChanges(proj.id);
      setStatusBanner({
        type: 'success',
        message: `Saved folder "${proj.title}" (${res.totalInSubLibrary} article(s) preserved in partition).`,
        path: res.databaseFolderPath || proj.databaseFolderPath || `database/reviews/${proj.id}`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        message: err?.message || `Failed to save folder "${proj.title}".`,
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleConfirmDelete = async (proj: ReviewProject) => {
    setDeletingId(proj.id);
    try {
      const res = await onDeleteProjectFolder(proj.id);
      setConfirmDeleteId(null);
      setStatusBanner({
        type: 'success',
        message: `Deleted folder "${proj.title}" permanently.`,
        path: res.deletedFolderPath || proj.databaseFolderPath,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        message: err?.message || `Failed to delete folder "${proj.title}".`,
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-indigo-900/60 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-teal-500/15 text-teal-300 border border-teal-500/30">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
              <span>Isolated Per-Review Database Partitions · Auto-Clear Disabled</span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>Saved Review Folders ({projects.length})</span>
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Every systematic review is stored separately in its own partitioned database folder (
              <span className="font-mono text-teal-400">database/reviews/&lt;review-slug&gt;/articles.json</span>
              ). Creating a new review creates a brand-new partition and never clears or overwrites existing saved folders.
            </p>
          </div>

          <button
            type="button"
            onClick={onCreateNewReview}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-teal-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white text-xs font-bold shadow-md transition inline-flex items-center gap-2 cursor-pointer shrink-0 self-start md:self-center"
          >
            <FolderPlus className="w-4 h-4" />
            <span>+ New Review (Create Partition)</span>
          </button>
        </div>

        {statusBanner && (
          <div
            className={`mt-4 px-4 py-3 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
              statusBanner.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-200'
                : 'bg-rose-950/50 border-rose-700/60 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {statusBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-semibold truncate">{statusBanner.message}</p>
                {statusBanner.path && (
                  <p className="text-[10px] font-mono text-slate-400 truncate">
                    Partition Path: {statusBanner.path}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Separate Cards Grid for Each Saved Review Folder */}
      {projects.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
          <FolderOpen className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">No Saved Review Folders Yet</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Create your first systematic review to allocate a dedicated database partition folder on disk.
          </p>
          <button
            type="button"
            onClick={onCreateNewReview}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Create First Review Partition</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((proj) => {
            const isActive = proj.id === currentProjectId;
            const folderArticles = (proj.articles || []).filter(
              (a) => !a.projectId || a.projectId === proj.id
            );
            const includedCount = folderArticles.filter((a) => a.decision === 'include').length;
            const unscreenedCount = folderArticles.filter(
              (a) => a.decision === 'unscreened' && !a.isDuplicate
            ).length;
            const folderRelPath =
              proj.databaseFolderPath || `database/reviews/${proj.databaseFolderName || proj.id}`;
            const isConfirmingDelete = confirmDeleteId === proj.id;

            return (
              <div
                key={proj.id}
                className={`bg-slate-900 rounded-2xl border p-5 flex flex-col justify-between gap-4 transition shadow-md ${
                  isActive
                    ? 'border-indigo-500/80 ring-1 ring-indigo-500/40'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider">
                            Active Review
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-semibold">
                          {proj.discipline || 'Interdisciplinary'}
                        </span>
                        {proj.publicationYears && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-950 text-slate-400 border border-slate-800 text-[10px] font-mono">
                            {proj.publicationYears}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">
                        {proj.title || 'Untitled Research Review'}
                      </h3>
                      {proj.subtitle && (
                        <p className="text-[11px] text-slate-400 line-clamp-1">{proj.subtitle}</p>
                      )}
                    </div>

                    <div className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-center shrink-0">
                      <div className="text-base font-extrabold text-teal-400 font-mono leading-none">
                        {folderArticles.length}
                      </div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">
                        Articles
                      </div>
                    </div>
                  </div>

                  {/* Dedicated Partition Path */}
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/90 space-y-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-teal-400 font-mono truncate">
                      <Database className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate" title={`${folderRelPath}/articles.json`}>
                        {folderRelPath}/articles.json
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="w-3 h-3 text-emerald-400" />
                        Included: <strong className="text-emerald-300">{includedCount}</strong>
                      </span>
                      <span>
                        Unscreened: <strong className="text-amber-300">{unscreenedCount}</strong>
                      </span>
                      {proj.updatedAt && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          Saved {new Date(proj.updatedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Per-Folder Explicit Actions */}
                {isConfirmingDelete ? (
                  <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-700/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-rose-200 font-semibold">
                      Permanently delete this folder &amp; all {folderArticles.length} article(s)?
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === proj.id}
                        onClick={() => handleConfirmDelete(proj)}
                        className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer disabled:opacity-50"
                      >
                        {deletingId === proj.id ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSwitchProject(proj.id);
                          onOpenProjectLibrary(proj.id);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Open Library</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenAddFilesForProject(proj.id)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <Upload className="w-3.5 h-3.5 text-teal-400" />
                        <span>Add Files</span>
                      </button>

                      <button
                        type="button"
                        disabled={savingId === proj.id}
                        onClick={() => handleSaveSingleFolder(proj)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-200 border border-emerald-700/60 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                        title="Save this review folder & partition files to disk"
                      >
                        <Save className={`w-3.5 h-3.5 text-emerald-400 ${savingId === proj.id ? 'animate-pulse' : ''}`} />
                        <span>{savingId === proj.id ? 'Saving...' : 'Save Folder'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(proj.id)}
                      className="p-2 rounded-xl bg-slate-950 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-800 cursor-pointer transition"
                      title="Delete this review folder (requires confirmation)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
