import React from 'react';
import { ModuleQaRescanRecord, ReviewProject, WorkbenchModuleId } from '../types';
import { AutoSaveStatusInfo, ModuleWorkbenchControls } from './ModuleWorkbenchControls';
import { DocumentationDropdown } from './DocumentationDropdown';
import {
  Compass,
  FileSearch,
  ClipboardCheck,
  GitFork,
  FileText,
  FileDown,
  Layers,
  Star,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Database,
  Clock,
  Sparkles,
  BookOpen,
  Filter,
  Eye,
  Zap,
  Radio,
  FileSpreadsheet,
  Plus,
  HardDriveDownload,
  Upload,
  Check,
  ArchiveRestore,
} from 'lucide-react';

interface DashboardOverviewProps {
  project: ReviewProject;
  onNavigateTab: (tabId: string) => void;
  onSelectArticleForScreening: (articleId: string) => void;
  onToggleStarArticle: (articleId: string) => void;
  onOpenAddModal: () => void;
  onCreateNewReview?: () => void;
  onOpenManualPaperModal?: () => void;
  onOpenResearchSuite?: () => void;
  onOpenFastBatchScreener?: () => void;
  onOpenQuantSynthesis?: (mode: 'qualitative' | 'quantitative') => void;
  onBackupProject?: () => void;
  onRestoreProject?: (restored: ReviewProject) => void;
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
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  project,
  onNavigateTab,
  onSelectArticleForScreening,
  onToggleStarArticle,
  onOpenAddModal,
  onCreateNewReview,
  onOpenManualPaperModal,
  onOpenResearchSuite,
  onOpenFastBatchScreener,
  onOpenQuantSynthesis,
  onBackupProject,
  onRestoreProject,
  autoSaveStatus,
  onResetWorkbenchModule,
  onDirectAddDataFiles,
  onRescanWithQueryQA,
  onDeleteQaEntry,
}) => {
  const [backupBanner, setBackupBanner] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const articles = project.articles || [];
  const totalIdentified = articles.length;
  const duplicatesCount = articles.filter((a) => a.isDuplicate).length;
  const screenedCount = articles.filter((a) => a.decision !== 'unscreened').length;
  const includedCount = articles.filter((a) => a.decision === 'include').length;
  const excludedCount = articles.filter((a) => a.decision === 'exclude').length;
  const uncertainCount = articles.filter((a) => a.decision === 'uncertain').length;
  const appraisedCount = articles.filter((a) => a.appraisalScore !== undefined || (a.appraisalWorksheet && a.appraisalWorksheet.length > 0)).length;
  const starredArticles = articles.filter((a) => a.isStarred);
  const latencyReportedCount = articles.filter((a) => a.extractedData?.latencyReported || a.extractedData?.latency).length;

  // Funnel attrition calculation
  const uniqueRecords = Math.max(totalIdentified - duplicatesCount, 1);
  const inclusionRate = Math.round((includedCount / uniqueRecords) * 100);

  // Database provenance breakdown
  const dbCounts: Record<string, number> = {};
  articles.forEach((a) => {
    const db = a.sourceDatabase || 'Manual';
    dbCounts[db] = (dbCounts[db] || 0) + 1;
  });

  const workflowStages = [
    {
      id: 'picoc',
      label: 'Protocol & Framework',
      desc: 'Booth et al. (2016) PICOC scoping, RQ1–RQ7, boundary rules',
      icon: Compass,
      color: 'from-blue-600 to-indigo-600',
      badge: `${project.researchQuestions?.length || 6} RQs`,
    },
    {
      id: 'protocol_builder',
      label: '16-Step Intelligent Protocol Builder',
      desc: 'Topic analysis, framework matrix, multi-DB syntax check, PRISMA-S & versioning',
      icon: BookOpen,
      color: 'from-indigo-600 to-violet-600',
      badge: project.workbenchState?.protocolBuilder?.activeProtocol?.versionNumber
        ? `v${project.workbenchState.protocolBuilder.activeProtocol.versionNumber}`
        : '16 Steps',
    },
    {
      id: 'duplicates',
      label: 'Duplicate Detection & Resolution',
      desc: 'Automated DOI & title matching with side-by-side resolver',
      icon: Layers,
      color: 'from-amber-600 to-orange-600',
      badge: duplicatesCount > 0 ? `${duplicatesCount} Detected` : 'Clean',
    },
    {
      id: 'title_screening',
      label: 'Title Screening',
      desc: 'Rapid-fire triage with keyword highlights & hotkey decisions',
      icon: Eye,
      color: 'from-violet-600 to-purple-600',
      badge: `${screenedCount}/${articles.length} Done`,
    },
    {
      id: 'screening',
      label: 'Eligibility & Screening',
      desc: 'Full-text multi-criteria screening with pinned page citations',
      icon: FileSearch,
      color: 'from-teal-600 to-emerald-600',
      badge: `${includedCount} Included`,
    },
    {
      id: 'extraction',
      label: 'Record Evidence & Extraction',
      desc: 'Structured extraction matrix: platform, sensor, latency, metrics',
      icon: FileSpreadsheet,
      color: 'from-cyan-600 to-blue-600',
      badge: 'Data Matrix',
    },
    {
      id: 'appraisal',
      label: 'Quality Appraisal & Risk-of-Bias',
      desc: '13-point critical appraisal worksheet & traffic light radar',
      icon: ClipboardCheck,
      color: 'from-emerald-600 to-green-600',
      badge: `${appraisedCount} Appraised`,
    },
    {
      id: 'prisma',
      label: 'PRISMA 2020 Flow Diagram',
      desc: 'Page et al. (2021) 27-item interactive flow with live counts',
      icon: GitFork,
      color: 'from-pink-600 to-rose-600',
      badge: 'PRISMA 2020',
    },
    {
      id: 'recovery',
      label: 'Project Recovery & PRISMA Reconciliation',
      desc: 'Multi-DB provenance staging, PDF reconciliation, rollback & PRISMA historical recovery',
      icon: ArchiveRestore,
      color: 'from-teal-600 to-emerald-600',
      badge: project.workbenchState?.recovery?.lastReconciledAt ? 'Reconciled' : 'Recovery',
    },
    {
      id: 'results',
      label: 'Results for Included Studies',
      desc: 'Synthesis table, quantitative cross-tabulation & key findings',
      icon: TrendingUp,
      color: 'from-amber-500 to-emerald-500',
      badge: `${includedCount} Studies`,
    },
    {
      id: 'quant_synthesis',
      label: 'Quantitative Synthesis & Meta-Analysis',
      desc: 'Descriptive statistics, FE/RE models, heterogeneity, 8 SVG plots & SQLite audit',
      icon: Database,
      color: 'from-teal-600 to-cyan-600',
      badge: project.workbenchState?.quantSynthesis?.lastMetaAnalysis?.pooledAvailable
        ? `k=${project.workbenchState.quantSynthesis.lastMetaAnalysis.k} Pooled`
        : 'FE / RE Engine',
    },
    {
      id: 'briefing',
      label: 'NotebookLM Studio & Audio Briefing',
      desc: 'Export original PDFs to notebook.google.com, unconstrained cited chat & two-host audio overview',
      icon: Radio,
      color: 'from-indigo-600 to-teal-600',
      badge: 'Studio + Audio',
    },
    {
      id: 'proposal',
      label: 'Proposal & Manuscript Generator',
      desc: '9-part publication-ready proposal with PRISMA checklist',
      icon: FileText,
      color: 'from-blue-600 to-purple-600',
      badge: '9 Sections',
    },
    {
      id: 'export',
      label: 'Export & Backup Hub',
      desc: 'Full SLR backup bundle (.json), RIS, BibTeX, CSV & Word',
      icon: FileDown,
      color: 'from-slate-700 to-slate-800',
      badge: 'Full Backup',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-3xl p-6 relative shadow-xl">
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
          <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-20">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Systematic Literature Review (SLR) Command Center</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-700/50 tabular-nums">
                <Check className="w-3 h-3 text-emerald-400" />
                <span>
                  {autoSaveStatus?.state === 'saving'
                    ? 'Auto-Saving...'
                    : autoSaveStatus?.lastSavedAt
                    ? `Auto-Saved ${new Date(autoSaveStatus.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : project.workbenchState?.lastAutoSavedAt
                    ? `Saved ${new Date(project.workbenchState.lastAutoSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Auto-Save Ready'}
                </span>
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              {project.title}
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Standardized under the <span className="text-slate-200 font-semibold">PRISMA 2020 Statement</span> and Booth et al. (2016) PICOC scoping framework. Managing end-to-end evidence synthesis from electronic database retrieval to full-text extraction and meta-briefing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DocumentationDropdown
              onNavigateTab={onNavigateTab}
              onOpenAddModal={onOpenAddModal}
              onCreateNewReview={onCreateNewReview}
              onOpenFastBatchScreener={onOpenFastBatchScreener}
            />

            {onOpenResearchSuite && (
              <button
                onClick={onOpenResearchSuite}
                className="px-4 py-2.5 bg-gradient-to-r from-sky-600 via-indigo-600 to-emerald-600 hover:from-sky-500 hover:via-indigo-500 hover:to-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition inline-flex items-center gap-1.5 cursor-pointer"
                title="Open Cloud Sync, Gemini Chat & Search, Voice, Google Maps, Media Studio, 3D Field Scene, and Evidence Game"
              >
                <Sparkles className="w-4 h-4 text-amber-200" />
                <span>AI, Maps, 3D & Cloud Suite</span>
              </button>
            )}

            {onCreateNewReview && (
              <button
                onClick={onCreateNewReview}
                className="px-3.5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer"
                title="Create brand new research review with empty placeholders"
              >
                <Plus className="w-4 h-4 text-amber-300" />
                <span>+ New Review (Manual Blank)</span>
              </button>
            )}

            {onOpenManualPaperModal && (
              <button
                onClick={onOpenManualPaperModal}
                className="px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer"
                title="Insert research paper manually with blank placeholders"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Paper (Manual)</span>
              </button>
            )}

            <button
              onClick={onOpenAddModal}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>Bulk Import</span>
            </button>
            <button
              onClick={() => onNavigateTab('title_screening')}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Eye className="w-4 h-4 text-indigo-400" />
              <span>Title Screening</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onOpenFastBatchScreener) onOpenFastBatchScreener();
                else onNavigateTab('library');
              }}
              className="px-3.5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="Open High-Throughput Fast Batch Screener on active Article Library (excludes deleted online DB files)"
            >
              <Zap className="w-4 h-4" />
              <span>Fast Batch Screener</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('protocol_builder')}
              className="px-3.5 py-2.5 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-4 h-4" />
              <span>16-Step Protocol Builder</span>
            </button>

            <button
              type="button"
              onClick={() => (onOpenQuantSynthesis ? onOpenQuantSynthesis('qualitative') : onNavigateTab('quant_synthesis'))}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold rounded-xl border border-indigo-500/40 transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Layers className="w-4 h-4" />
              <span>Qualitative Synthesis</span>
            </button>

            <button
              type="button"
              onClick={() => (onOpenQuantSynthesis ? onOpenQuantSynthesis('quantitative') : onNavigateTab('quant_synthesis'))}
              className="px-3.5 py-2.5 bg-teal-700 hover:bg-teal-600 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <TrendingUp className="w-4 h-4" />
              <span>Quantitative Synthesis / Meta-Analysis</span>
            </button>

            {onBackupProject && (
              <button
                type="button"
                onClick={() => {
                  onBackupProject();
                  setBackupBanner({
                    type: 'success',
                    text: `Saved folder to disk & downloaded portable backup for "${project.title.slice(0, 40)}" (${articles.length} articles).`,
                  });
                  setTimeout(() => setBackupBanner(null), 5000);
                }}
                className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                title="Save all review changes to disk and download a complete portable SLR backup (.json)"
              >
                <HardDriveDownload className="w-4 h-4" />
                <span>Backup Review (.json)</span>
              </button>
            )}

            {onRestoreProject && (
              <label
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                title="Restore a previously saved ResearchMate SLR backup (.json)"
              >
                <Upload className="w-3.5 h-3.5 text-teal-400" />
                <span>Restore Backup</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      try {
                        const parsed = JSON.parse(String(ev.target?.result || ''));
                        const restoredProj = parsed.project || (parsed.articles && parsed.id ? parsed : null);
                        if (!restoredProj || !Array.isArray(restoredProj.articles)) {
                          throw new Error('Invalid SLR backup file format.');
                        }
                        onRestoreProject(restoredProj);
                        setBackupBanner({
                          type: 'success',
                          text: `Restored "${restoredProj.title}" (${restoredProj.articles.length} articles).`,
                        });
                      } catch (err: any) {
                        setBackupBanner({
                          type: 'error',
                          text: `Restore failed: ${err?.message || 'Corrupted backup JSON.'}`,
                        });
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {backupBanner && (
          <div
            className={`mt-3 relative z-10 px-3.5 py-2 rounded-xl border text-xs flex items-center gap-2 ${
              backupBanner.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-200'
                : 'bg-rose-950/60 border-rose-700/60 text-rose-200'
            }`}
          >
            {backupBanner.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{backupBanner.text}</span>
          </div>
        )}
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Identified</span>
            <Database className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <p className="text-2xl font-extrabold text-white font-mono">{totalIdentified}</p>
          <p className="text-[10px] text-slate-500">{Object.keys(dbCounts).length} search databases</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Duplicates</span>
            <Layers className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <p className="text-2xl font-extrabold text-amber-300 font-mono">{duplicatesCount}</p>
          <p className="text-[10px] text-slate-500">Auto-detected clusters</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Screened</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <p className="text-2xl font-extrabold text-white font-mono">{screenedCount}</p>
          <p className="text-[10px] text-purple-400 font-medium">
            {Math.round((screenedCount / Math.max(articles.length, 1)) * 100)}% progress
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Included</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-400 font-mono">{includedCount}</p>
          <p className="text-[10px] text-emerald-400/80 font-medium">{inclusionRate}% yield</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Appraised</span>
            <ClipboardCheck className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <p className="text-2xl font-extrabold text-cyan-300 font-mono">{appraisedCount}</p>
          <p className="text-[10px] text-slate-500">13-point critical check</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Latency Data</span>
            <Clock className="w-3.5 h-3.5 text-pink-400" />
          </div>
          <p className="text-2xl font-extrabold text-pink-300 font-mono">{latencyReportedCount}</p>
          <p className="text-[10px] text-slate-500">Turnaround reported</p>
        </div>
      </div>

      {/* Review Funnel & Attrition Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <span>PRISMA 2020 Review Funnel & Decision Distribution</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {includedCount} Included · {excludedCount} Excluded · {uncertainCount} Uncertain · {articles.length - screenedCount} Unscreened
          </span>
        </div>

        {/* Multi-segment Progress Bar */}
        <div className="h-4 bg-slate-950 rounded-full overflow-hidden flex ring-1 ring-slate-800">
          <div
            style={{ width: `${(includedCount / Math.max(articles.length, 1)) * 100}%` }}
            className="bg-emerald-500 h-full transition-all"
            title={`Included: ${includedCount}`}
          />
          <div
            style={{ width: `${(excludedCount / Math.max(articles.length, 1)) * 100}%` }}
            className="bg-rose-500/80 h-full transition-all"
            title={`Excluded: ${excludedCount}`}
          />
          <div
            style={{ width: `${(uncertainCount / Math.max(articles.length, 1)) * 100}%` }}
            className="bg-amber-500 h-full transition-all"
            title={`Uncertain: ${uncertainCount}`}
          />
          <div
            style={{ width: `${((articles.length - screenedCount) / Math.max(articles.length, 1)) * 100}%` }}
            className="bg-slate-700 h-full transition-all"
            title={`Unscreened: ${articles.length - screenedCount}`}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Included ({includedCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Excluded ({excludedCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Uncertain / Borderline ({uncertainCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-700" /> Unscreened ({articles.length - screenedCount})
          </span>
        </div>
      </div>

      {/* Interesting / Starred & Priority Studies Carousel */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
              <Star className="w-4 h-4 fill-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <span>Interesting & Priority Studies</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {starredArticles.length} Starred
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Key benchmark papers flagged for deep synthesis, audio overview, and manuscript discussion
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('library')}
            className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 hover:underline cursor-pointer"
          >
            <span>View All in Library</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {starredArticles.length === 0 ? (
          <div className="text-center py-8 bg-slate-950/60 border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
            <Star className="w-6 h-6 mx-auto mb-2 text-slate-600" />
            <p className="text-slate-300 font-semibold">No studies starred yet</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Click the star icon on any paper in the library or screening workbench to pin high-impact studies here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {starredArticles.map((art) => (
              <div
                key={art.id}
                onClick={() => onSelectArticleForScreening(art.id)}
                className="group bg-slate-950 border border-slate-800 hover:border-slate-700 p-3.5 rounded-2xl transition cursor-pointer flex flex-col justify-between gap-2.5 relative"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-400 border border-slate-800">
                      {art.sourceDatabase} · {art.year}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStarArticle(art.id);
                      }}
                      className="text-amber-400 hover:text-amber-300 p-1 rounded hover:bg-slate-800 transition cursor-pointer"
                      title="Unstar article"
                    >
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                    </button>
                  </div>
                  <h4 className="font-semibold text-white text-xs line-clamp-2 leading-snug group-hover:text-indigo-300 transition">
                    {art.title}
                  </h4>
                  <p className="text-[10px] text-slate-400 truncate">
                    {art.authors?.slice(0, 2).join(', ')} — <span className="italic">{art.journal}</span>
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-[10px]">
                  <span
                    className={`font-semibold capitalize ${
                      art.decision === 'include'
                        ? 'text-emerald-400'
                        : art.decision === 'exclude'
                        ? 'text-rose-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {art.decision}
                  </span>
                  <span className="text-slate-500 flex items-center gap-1 group-hover:text-slate-300">
                    <span>Screening</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Systematic Workflow Navigation Hub (Requested explicitly by user) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Compass className="w-4 h-4 text-teal-400" />
            <span>Core SLR Workflow Stages &amp; Scientific Workbench Modules</span>
          </h3>
          <span className="text-xs text-slate-400">
            11 Integrated Systematic Review Modules · Auto-Saved Per Module
          </span>
        </div>

        <ModuleWorkbenchControls
          project={project}
          moduleId="screening"
          moduleLabel="Core SLR Workbench"
          autoSaveStatus={autoSaveStatus}
          compact
          resetFieldsLabel="Reset All Decisions -> Unscreened"
          deleteModes={['excluded', 'uncertain', 'duplicates', 'unscreened']}
          onResetModule={onResetWorkbenchModule}
          onAddDataFiles={onDirectAddDataFiles}
          onOpenBulkImporter={onOpenAddModal}
          onRescanQueryQA={onRescanWithQueryQA}
          onDeleteQaEntry={onDeleteQaEntry}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {workflowStages.map((stage) => {
            const Icon = stage.icon;
            const modId = stage.id as WorkbenchModuleId;
            const modQaCount = project.workbenchState?.qaRescans?.[modId]?.length || 0;
            const modSavedAt =
              project.workbenchState?.moduleLastSavedAt?.[modId] ||
              (modId === 'briefing' ? project.workbenchState?.briefing?.updatedAt : undefined) ||
              (modId === 'proposal' ? project.workbenchState?.proposal?.updatedAt : undefined) ||
              (modId === 'export' ? project.workbenchState?.exportConfig?.updatedAt : undefined);
            return (
              <div
                key={stage.id}
                onClick={() => onNavigateTab(stage.id)}
                className="group bg-slate-900 border border-slate-800 hover:border-indigo-500/60 p-4 rounded-2xl transition shadow-sm hover:shadow-md cursor-pointer flex items-start gap-3.5"
              >
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${stage.color} flex items-center justify-center text-white shrink-0 shadow-md group-hover:scale-105 transition-transform`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="font-bold text-white text-xs group-hover:text-indigo-300 transition truncate">
                      {stage.label}
                    </h4>
                    <span className="px-1.5 py-0.2 rounded-md bg-slate-800 text-[10px] font-mono text-slate-300 shrink-0 tabular-nums">
                      {stage.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {stage.desc}
                  </p>
                  {(modSavedAt || modQaCount > 0) && (
                    <div className="flex items-center gap-2 pt-0.5 text-[10px] font-mono text-teal-400/90 tabular-nums">
                      {modSavedAt && (
                        <span>
                          Saved {new Date(modSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {modQaCount > 0 && (
                        <span>· {modQaCount} Q&amp;A scan{modQaCount === 1 ? '' : 's'}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Database Provenance & Turnaround Latency Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Database Provenance */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>Database Provenance Distribution</span>
            </h4>
            <span className="text-[11px] text-slate-500 font-mono">{articles.length} records</span>
          </div>

          <div className="space-y-2">
            {Object.entries(dbCounts).map(([db, count]) => {
              const pct = Math.round((count / Math.max(articles.length, 1)) * 100);
              return (
                <div key={db} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-300 font-medium">{db}</span>
                    <span className="text-slate-400 font-mono">{count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className="h-full bg-gradient-to-r from-indigo-500 to-teal-400 rounded-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Operational Latency & Validation Rigor */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-teal-400" />
              <span>Operational Latency & Spatial Leakage Controls</span>
            </h4>
            <span className="text-[11px] text-slate-500 font-mono">Benchmark KPI</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold">Turnaround Latency Reporting</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {latencyReportedCount}/{articles.length} ({Math.round((latencyReportedCount / Math.max(articles.length, 1)) * 100)}%)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Studies quantifying execution time from sensor flight acquisition to actionable canopy prescription maps.
              </p>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold">Spatial Leakage Protection</span>
                <span className="text-indigo-400 font-mono font-bold">RQ4 Enforced</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Spatial block cross-validation required to neutralize optimistic performance inflation caused by spatial autocorrelation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
