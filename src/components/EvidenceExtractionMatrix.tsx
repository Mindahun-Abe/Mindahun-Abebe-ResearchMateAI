import React, { useMemo, useState } from 'react';
import {
  Article,
  ArticleExtractedData,
  ModuleQaRescanRecord,
  ReviewProject,
  WorkbenchModuleId,
} from '../types';
import {
  analyzeArticleForMatrix,
  ArticleMatrixAnalysis,
  DATABASE_PROVENANCE_OPTIONS,
  deriveProtocolExtractionFocus,
} from '../utils/slrDetectionEngine';
import {
  FileSpreadsheet,
  Download,
  Sparkles,
  Edit2,
  Save,
  X,
  Search,
  Code2,
  Check,
} from 'lucide-react';
import { ArticleCodeDetailModal } from './ArticleCodeDetailModal';
import { AutoSaveStatusInfo, ModuleWorkbenchControls } from './ModuleWorkbenchControls';

interface EvidenceExtractionMatrixProps {
  project: ReviewProject;
  articles: Article[];
  onUpdateArticle: (article: Article) => void;
  onBatchUpdateArticles?: (updatedArticles: Article[]) => void;
  onNavigateToScreening?: (articleId: string) => void;
  onOpenQuantSynthesis?: () => void;
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

export const EvidenceExtractionMatrix: React.FC<EvidenceExtractionMatrixProps> = ({
  project,
  articles,
  onUpdateArticle,
  onBatchUpdateArticles,
  onNavigateToScreening,
  onOpenQuantSynthesis,
  autoSaveStatus,
  onResetWorkbenchModule,
  onDirectAddDataFiles,
  onRescanWithQueryQA,
  onDeleteQaEntry,
  onOpenBulkImporter,
}) => {
  const [filterMode, setFilterMode] = useState<'included' | 'all'>('included');
  const [paperTypeFilter, setPaperTypeFilter] = useState<'all' | 'Original Research' | 'Review'>('all');
  const [databaseFilter, setDatabaseFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<ArticleExtractedData>({});
  const [editSourceDb, setEditSourceDb] = useState<string>('Other');
  const [editPaperCategory, setEditPaperCategory] = useState<'Original Research' | 'Review'>('Original Research');

  // Code & Detail Analysis Modal state
  const [detailArticleId, setDetailArticleId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const protocolFocus = useMemo(() => deriveProtocolExtractionFocus(project), [project]);

  // Precompute live protocol-aware analysis for every non-duplicate article
  const analysisMap = useMemo(() => {
    const map = new Map<string, ArticleMatrixAnalysis>();
    for (const art of articles) {
      if (!art.isDuplicate) {
        map.set(art.id, analyzeArticleForMatrix(art, project));
      }
    }
    return map;
  }, [articles, project]);

  const availableDatabases = useMemo(() => {
    const set = new Set<string>();
    for (const art of articles) {
      if (art.isDuplicate) continue;
      const analysis = analysisMap.get(art.id);
      if (analysis?.sourceProvenance.database) {
        set.add(analysis.sourceProvenance.database);
      }
    }
    return Array.from(set).sort();
  }, [articles, analysisMap]);

  const paperTypeCounts = useMemo(() => {
    const scopeArts = articles.filter(
      (a) => !a.isDuplicate && (filterMode === 'all' || a.decision === 'include')
    );
    let original = 0;
    let review = 0;
    for (const art of scopeArts) {
      const cls = analysisMap.get(art.id)?.paperType.category || 'Original Research';
      if (cls === 'Review') review++;
      else original++;
    }
    return { original, review, total: scopeArts.length };
  }, [articles, filterMode, analysisMap]);

  const displayArticles = useMemo(() => {
    return articles.filter((art) => {
      if (art.isDuplicate) return false;
      if (filterMode === 'included' && art.decision !== 'include') return false;

      const analysis = analysisMap.get(art.id);
      const paperCat = analysis?.paperType.category || 'Original Research';
      const sourceDb = analysis?.sourceProvenance.database || art.sourceDatabase || 'Other';

      if (paperTypeFilter !== 'all' && paperCat !== paperTypeFilter) return false;
      if (databaseFilter !== 'all' && sourceDb !== databaseFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const ext = analysis?.extracted || art.extractedData || {};
        const haystack = [
          art.title,
          (art.authors || []).join(' '),
          art.journal,
          sourceDb,
          paperCat,
          ext.platform,
          ext.sensor,
          ext.algorithm,
          ext.softwareTools,
          ext.metrics,
          ext.geographicRegion,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [articles, filterMode, paperTypeFilter, databaseFilter, searchQuery, analysisMap]);

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4500);
  };

  // Run high-detection protocol-aware auto-extraction & save into articles
  const handleRunProtocolDeepDetection = () => {
    const targetIds = new Set(displayArticles.map((a) => a.id));
    if (targetIds.size === 0) return;

    const updatedAll = articles.map((art) => {
      if (!targetIds.has(art.id)) return art;
      const analysis = analyzeArticleForMatrix(art, project);
      return {
        ...art,
        sourceDatabase: analysis.sourceProvenance.database,
        paperCategory: analysis.paperType.category,
        paperSubType: analysis.paperType.subType,
        extractedData: analysis.extracted,
      };
    });

    if (onBatchUpdateArticles) {
      onBatchUpdateArticles(updatedAll);
    } else {
      updatedAll.forEach((art) => {
        if (targetIds.has(art.id)) onUpdateArticle(art);
      });
    }
    showToast(
      `Analyzed & coded ${targetIds.size} studies against "${protocolFocus.domainLabel}" protocol & PICOC criteria.`
    );
  };

  const handleStartEdit = (art: Article) => {
    const analysis = analysisMap.get(art.id);
    setEditingArticleId(art.id);
    setEditFormData({ ...(analysis?.extracted || art.extractedData || {}) });
    setEditSourceDb(analysis?.sourceProvenance.database || art.sourceDatabase || 'Other');
    setEditPaperCategory(analysis?.paperType.category || art.paperCategory || 'Original Research');
  };

  const handleSaveEdit = (art: Article) => {
    const updated: Article = {
      ...art,
      sourceDatabase: editSourceDb,
      paperCategory: editPaperCategory,
      extractedData: {
        ...editFormData,
        latencyReported: Boolean(editFormData.latency && editFormData.latency.trim() && editFormData.latency !== 'Not reported'),
      },
    };
    onUpdateArticle(updated);
    setEditingArticleId(null);
    showToast(`Saved extraction edits for "${art.title.slice(0, 45)}..."`);
  };

  const openDetailModal = (art: Article) => {
    setDetailArticleId(art.id);
  };

  const detailArticle = useMemo(
    () => articles.find((a) => a.id === detailArticleId) || null,
    [articles, detailArticleId]
  );
  const detailAnalysis = useMemo(
    () => (detailArticle ? analysisMap.get(detailArticle.id) || analyzeArticleForMatrix(detailArticle, project) : null),
    [detailArticle, analysisMap, project]
  );

  // Export extraction matrix to CSV
  const handleExportCsv = () => {
    const headers = [
      'Study ID',
      'Title',
      'Authors',
      'Year',
      'Journal',
      'DOI',
      'Paper Category (Original/Review)',
      'Paper Sub-Type',
      'Source Database',
      'Decision',
      'Protocol Alignment (%)',
      'Platform / System',
      'Sensor / Modality',
      'GSD / Spatial Scale',
      'Altitude / Context',
      'Algorithm / Model',
      'Turnaround Latency',
      'Latency Reported',
      'Spatial Leakage Addressed',
      'Ground Truth Method',
      'Accuracy Metrics',
      'Software & Code Tools',
      'Code Repository',
      'Hardware / Compute',
      'Geographic Region',
      'Sample Size',
      'Code Analysis Notes',
    ];

    const csvCell = (val: unknown) => `"${String(val ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;

    const rows = displayArticles.map((art) => {
      const analysis = analysisMap.get(art.id);
      const ext = analysis?.extracted || art.extractedData || {};
      const pType = analysis?.paperType;
      const src = analysis?.sourceProvenance.database || art.sourceDatabase || 'Other';

      return [
        csvCell(art.id),
        csvCell(art.title),
        csvCell((art.authors || []).join('; ')),
        csvCell(art.year),
        csvCell(art.journal),
        csvCell(art.doi || ''),
        csvCell(pType?.category || 'Original Research'),
        csvCell(pType?.subType || ''),
        csvCell(src),
        csvCell(art.decision),
        csvCell(ext.protocolAlignmentScore ?? analysis?.codeDetailAnalysis.protocolAlignmentScore ?? ''),
        csvCell(ext.platform || ''),
        csvCell(ext.sensor || ''),
        csvCell(ext.gsd || ''),
        csvCell(ext.altitude || ''),
        csvCell(ext.algorithm || ''),
        csvCell(ext.latency || 'Not reported'),
        csvCell(ext.latencyReported ? 'Yes' : 'No'),
        csvCell(ext.spatialLeakageAddressed ? 'Yes (Buffered)' : 'No / Random CV'),
        csvCell(ext.groundTruth || ''),
        csvCell(ext.metrics || ''),
        csvCell(ext.softwareTools || ''),
        csvCell(ext.codeRepository || ''),
        csvCell(ext.hardwareCompute || ''),
        csvCell(ext.geographicRegion || ''),
        csvCell(ext.sampleSize || ''),
        csvCell(art.codeAnalysisNotes || ''),
      ].join(',');
    });

    const csvContent = `\uFEFF${[headers.join(','), ...rows].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}-evidence-extraction-matrix.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${displayArticles.length} rows to Standardized Data Extraction Matrix CSV.`);
  };

  return (
    <div className="space-y-6">
      <ModuleWorkbenchControls
        project={project}
        moduleId="extraction"
        moduleLabel="Record Evidence & Extraction Matrix"
        autoSaveStatus={autoSaveStatus}
        resetFieldsLabel="Clear Extracted Data Fields"
        deleteModes={['excluded', 'uncertain']}
        onResetModule={onResetWorkbenchModule}
        onAddDataFiles={onDirectAddDataFiles}
        onOpenBulkImporter={onOpenBulkImporter}
        onRescanQueryQA={onRescanWithQueryQA}
        onDeleteQaEntry={onDeleteQaEntry}
      />
      {/* Header & Protocol Scope Focus */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
              <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
              <span>PRISMA 2020 Standardized Data Extraction Matrix</span>
            </div>
            <h2 className="text-xl font-bold text-white">Record Evidence, Protocol Coding &amp; Detail Analysis</h2>
            <p className="text-xs text-slate-400 max-w-2xl">
              Protocol-adaptive extraction detecting study parameters, paper type (Original Research vs Review), source database provenance, and code/technical implementation details tailored to this SLR.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setFilterMode('included')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  filterMode === 'included' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Included Studies ({articles.filter((a) => !a.isDuplicate && a.decision === 'include').length})
              </button>
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  filterMode === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                All Records ({articles.filter((a) => !a.isDuplicate).length})
              </button>
            </div>

            <button
              onClick={handleRunProtocolDeepDetection}
              disabled={displayArticles.length === 0}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Run high-detection protocol & code analysis across all visible records and save extracted data"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Detect &amp; Code All ({displayArticles.length})</span>
            </button>

            <button
              onClick={handleExportCsv}
              disabled={displayArticles.length === 0}
              className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Matrix CSV</span>
            </button>
            {onOpenQuantSynthesis && (
              <button
                type="button"
                onClick={onOpenQuantSynthesis}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                <span>Quantitative Synthesis / Meta-Analysis</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Protocol & Framework Focus Strip */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold text-[11px]">
                Protocol Profile: {protocolFocus.domainLabel}
              </span>
              <span className="text-[11px] text-slate-400">
                Focus: <strong className="text-slate-200">{project.methodologyFocus || project.discipline}</strong>
              </span>
              <span className="text-[11px] text-slate-500">·</span>
              <span className="text-[11px] text-emerald-300 font-mono">
                Original Research: {paperTypeCounts.original}
              </span>
              <span className="text-[11px] text-amber-300 font-mono">
                Review Papers: {paperTypeCounts.review}
              </span>
            </div>

            {statusMessage && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium">
                <Check className="w-3.5 h-3.5" />
                <span>{statusMessage}</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {protocolFocus.focusDimensions.slice(0, 8).map((dim) => (
              <span
                key={dim.key}
                className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] text-slate-300"
                title={dim.keywords.join(', ')}
              >
                <strong className="text-cyan-300">{dim.label}</strong>
                {dim.keywords.length > 0 ? `: ${dim.keywords.slice(0, 3).join(', ')}` : ''}
              </span>
            ))}
          </div>
          {project.workbenchState?.protocolBuilder?.activeProtocol?.extractionPlan &&
            project.workbenchState.protocolBuilder.activeProtocol.extractionPlan.length > 0 && (
              <div className="pt-1.5 border-t border-slate-800/80 text-[11px] text-teal-300">
                <b>Active Protocol v{project.workbenchState.protocolBuilder.activeProtocol.versionNumber} Planned Variables:</b>{' '}
                {project.workbenchState.protocolBuilder.activeProtocol.extractionPlan
                  .slice(0, 8)
                  .map((v) => `${v.variableName} (${v.rqCode})`)
                  .join(' · ')}
              </div>
            )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by title, platform, sensor, algorithm, software/code, region, or database..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={paperTypeFilter}
            onChange={(e) => setPaperTypeFilter(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Paper Types ({paperTypeCounts.total})</option>
            <option value="Original Research">Original Research ({paperTypeCounts.original})</option>
            <option value="Review">Review Papers ({paperTypeCounts.review})</option>
          </select>

          <select
            value={databaseFilter}
            onChange={(e) => setDatabaseFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Databases ({availableDatabases.length})</option>
            {availableDatabases.map((db) => (
              <option key={db} value={db}>
                Found in: {db}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto scrollbar-none">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider font-semibold">
                <th className="py-3 px-3">Study / Year</th>
                <th className="py-3 px-3">Paper Type</th>
                <th className="py-3 px-3">Database Found</th>
                <th className="py-3 px-3">Decision</th>
                <th className="py-3 px-3">Platform / Cohort</th>
                <th className="py-3 px-3">Sensor / Modality</th>
                <th className="py-3 px-3">GSD / Scale</th>
                <th className="py-3 px-3">Algorithm / Model</th>
                <th className="py-3 px-3">Latency</th>
                <th className="py-3 px-3">Metrics &amp; Code</th>
                <th className="py-3 px-3 text-right">Detail &amp; Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {displayArticles.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-xs text-slate-400">
                    No records match the active filters. Screen articles as Included or switch to All Records.
                  </td>
                </tr>
              ) : (
                displayArticles.map((art) => {
                  const isEditing = editingArticleId === art.id;
                  const analysis = analysisMap.get(art.id) || analyzeArticleForMatrix(art, project);
                  const ext = analysis.extracted;
                  const pType = analysis.paperType;
                  const sourceDb = analysis.sourceProvenance.database;

                  return (
                    <tr key={art.id} className="hover:bg-slate-950/40 transition group">
                      {/* Study Title & Year */}
                      <td className="py-3 px-3 max-w-[210px]">
                        <p className="font-semibold text-white truncate text-xs" title={art.title}>
                          {art.title}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {art.authors?.slice(0, 2).join(', ')} ({art.year}) · <span className="italic">{art.journal}</span>
                        </p>
                      </td>

                      {/* Paper Type: Original Research vs Review */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <select
                            value={editPaperCategory}
                            onChange={(e) => setEditPaperCategory(e.target.value as 'Original Research' | 'Review')}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                          >
                            <option value="Original Research">Original Research</option>
                            <option value="Review">Review</option>
                          </select>
                        ) : (
                          <div className="space-y-0.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                pType.category === 'Review'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              }`}
                              title={`${pType.subType} (${pType.confidence}% confidence)`}
                            >
                              {pType.category}
                            </span>
                            <span className="block text-[9px] text-slate-500 truncate max-w-[115px]" title={pType.subType}>
                              {pType.subType}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Database Provenance */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <select
                            value={editSourceDb}
                            onChange={(e) => setEditSourceDb(e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                          >
                            {DATABASE_PROVENANCE_OPTIONS.map((db) => (
                              <option key={db} value={db}>
                                {db}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-slate-300 border border-slate-800">
                            {sourceDb}
                          </span>
                        )}
                      </td>

                      {/* Decision */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            art.decision === 'include'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : art.decision === 'exclude'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {art.decision}
                        </span>
                      </td>

                      {/* Platform */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editFormData.platform || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, platform: e.target.value })}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs w-28"
                            placeholder="Platform / System"
                          />
                        ) : (
                          <span className="text-slate-300 font-mono text-[11px]">{ext.platform || '—'}</span>
                        )}
                      </td>

                      {/* Sensor */}
                      <td className="py-3 px-3 whitespace-nowrap max-w-[140px] truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editFormData.sensor || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, sensor: e.target.value })}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs w-28"
                            placeholder="Sensor / Modality"
                          />
                        ) : (
                          <span className="text-slate-300 text-[11px]" title={ext.sensor}>
                            {ext.sensor || '—'}
                          </span>
                        )}
                      </td>

                      {/* GSD / Alt */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editFormData.gsd || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, gsd: e.target.value })}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs w-20"
                            placeholder="e.g. 2.4 cm"
                          />
                        ) : (
                          <span className="text-slate-300 font-mono text-[11px]">{ext.gsd || ext.altitude || '—'}</span>
                        )}
                      </td>

                      {/* Algorithm */}
                      <td className="py-3 px-3 whitespace-nowrap max-w-[140px] truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editFormData.algorithm || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, algorithm: e.target.value })}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs w-28"
                            placeholder="Algorithm / Model"
                          />
                        ) : (
                          <span className="text-indigo-300 text-[11px] font-medium" title={ext.algorithm}>
                            {ext.algorithm || '—'}
                          </span>
                        )}
                      </td>

                      {/* Turnaround Latency */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editFormData.latency || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, latency: e.target.value })}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs w-24"
                            placeholder="e.g. 14 min"
                          />
                        ) : ext.latencyReported && ext.latency ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            {ext.latency}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Not reported</span>
                        )}
                      </td>

                      {/* Metrics, Alignment & Code Tools */}
                      <td className="py-3 px-3 max-w-[180px]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editFormData.metrics || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, metrics: e.target.value })}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs w-32"
                            placeholder="Metrics (R2, AUC...)"
                          />
                        ) : (
                          <div className="space-y-0.5">
                            <p className="text-slate-300 text-[11px] truncate" title={ext.metrics || ext.groundTruth}>
                              {ext.metrics || ext.groundTruth || '—'}
                            </p>
                            <div className="flex items-center gap-1">
                              <span className="px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-300 font-mono text-[9px] border border-indigo-500/20">
                                {analysis.codeDetailAnalysis.protocolAlignmentScore}% match
                              </span>
                              {ext.softwareTools && (
                                <span
                                  className="px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-300 font-mono text-[9px] border border-purple-500/20 truncate max-w-[90px]"
                                  title={ext.softwareTools}
                                >
                                  {ext.softwareTools}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveEdit(art)}
                              className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition cursor-pointer"
                              title="Save"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingArticleId(null)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openDetailModal(art)}
                              className="px-2.5 py-1 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                              title="Open Protocol Coding & Code Detail Analysis"
                            >
                              <Code2 className="w-3.5 h-3.5" />
                              <span>Code Analysis</span>
                            </button>
                            <button
                              onClick={() => handleStartEdit(art)}
                              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                              title="Inline edit extracted fields"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shared Code & Detail Analysis + PRISMA 8-Point Diagnostics Modal */}
      <ArticleCodeDetailModal
        project={project}
        article={detailArticle}
        analysis={detailAnalysis}
        onClose={() => setDetailArticleId(null)}
        onUpdateArticle={onUpdateArticle}
        onSavedToast={showToast}
        onNavigateToScreening={onNavigateToScreening}
      />
    </div>
  );
};
