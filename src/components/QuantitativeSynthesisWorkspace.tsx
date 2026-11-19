import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  Database,
  Download,
  Edit3,
  FileCode,
  FileDown,
  FileSpreadsheet,
  FileText,
  Filter,
  GitBranch,
  History,
  Layers,
  Loader2,
  Play,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  Article,
  ModuleQaRescanRecord,
  QualitativeThemeEntry,
  QuantAnalysisResponse,
  QuantEffectMeasure,
  QuantMetaConfig,
  QuantModelType,
  QuantStudyExtractionRecord,
  QuantTauEstimator,
  ReviewProject,
  WorkbenchModuleId,
  WorkbenchState,
} from '../types';
import { apiService } from '../services/apiService';
import { AutoSaveStatusInfo, ModuleWorkbenchControls } from './ModuleWorkbenchControls';

interface QuantitativeSynthesisWorkspaceProps {
  project: ReviewProject;
  articles: Article[];
  initialMode?: 'qualitative' | 'quantitative';
  onUpdateWorkbenchState?: (patch: Partial<WorkbenchState>, moduleId?: WorkbenchModuleId) => void;
  onSelectArticle?: (articleId: string) => void;
  onNavigateToModule?: (tab: string) => void;
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

const DEFAULT_CONFIG: QuantMetaConfig = {
  effectMeasure: 'SMD',
  modelType: 'random',
  estimator: 'DL',
  targetOutcomeType: 'all',
  targetUnits: '',
  subgroupBy: 'subgroup',
  metaRegressionModerator: 'moderatorYear',
  requireCompatibleStudyDesign: false,
  allowSecondaryReviewPooling: false,
};

const fmtNum = (val: number | null | undefined, digits = 3): string => {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return val.toFixed(digits);
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const csvCell = (val: unknown): string => `"${String(val ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;

const pdfSafe = (val: unknown): string =>
  String(val ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF\r\n]/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim();

const getSlug = (project: ReviewProject): string =>
  (project.databaseFolderName || project.title || project.id || 'review')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'review';

export const QuantitativeSynthesisWorkspace: React.FC<QuantitativeSynthesisWorkspaceProps> = ({
  project,
  articles,
  initialMode,
  onUpdateWorkbenchState,
  onSelectArticle,
  onNavigateToModule,
  autoSaveStatus,
  onResetWorkbenchModule,
  onDirectAddDataFiles,
  onRescanWithQueryQA,
  onDeleteQaEntry,
  onOpenBulkImporter,
}) => {
  const savedQuant = project.workbenchState?.quantSynthesis;

  const [synthesisMode, setSynthesisMode] = useState<'qualitative' | 'quantitative'>(
    initialMode || savedQuant?.activeSynthesisMode || 'quantitative'
  );
  const [subTab, setSubTab] = useState<
    'descriptive' | 'eligibility' | 'meta' | 'visualizations' | 'audit'
  >('descriptive');
  const [searchQuery, setSearchQuery] = useState('');

  const [config, setConfig] = useState<QuantMetaConfig>(savedQuant?.config || DEFAULT_CONFIG);
  const [records, setRecords] = useState<QuantStudyExtractionRecord[]>(savedQuant?.studyRecords || []);
  const [analysisResult, setAnalysisResult] = useState<QuantAnalysisResponse | null>(
    savedQuant?.lastDescriptive && savedQuant?.lastMetaAnalysis
      ? {
          success: true,
          runId: savedQuant.lastRunId || 'cached',
          analysisDate: savedQuant.analysisDate || new Date().toISOString(),
          softwareVersion: savedQuant.softwareVersion || '1.0.0',
          descriptive: savedQuant.lastDescriptive,
          records: savedQuant.studyRecords || [],
          metaAnalysis: savedQuant.lastMetaAnalysis,
        }
      : null
  );
  const [auditData, setAuditData] = useState<{ runs: any[]; auditLog: any[]; migrations: any[] }>({
    runs: [],
    auditLog: [],
    migrations: [],
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Editing modal state for a study extraction record
  const [editingRecord, setEditingRecord] = useState<QuantStudyExtractionRecord | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);

  // Qualitative theme synthesis state
  const [qualThemes, setQualThemes] = useState<QualitativeThemeEntry[]>(savedQuant?.qualitativeThemes || []);
  const [newThemeTitle, setNewThemeTitle] = useState('');
  const [newThemeRq, setNewThemeRq] = useState(project.researchQuestions?.[0]?.code || 'RQ1');
  const [newThemeNarrative, setNewThemeNarrative] = useState('');
  const [newThemeArticleIds, setNewThemeArticleIds] = useState<string[]>([]);

  const datasetFileRef = useRef<HTMLInputElement | null>(null);
  const svgRefs = useRef<Record<string, SVGSVGElement | null>>({});

  useEffect(() => {
    if (initialMode) {
      setSynthesisMode(initialMode);
    }
  }, [initialMode]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage((prev) => (prev?.text === text ? null : prev));
    }, 6000);
  };

  // Load persisted SQLite state & run initial analysis on project change
  useEffect(() => {
    let active = true;
    const init = async () => {
      setIsLoading(true);
      try {
        const state = await apiService.loadQuantSynthesisState(project.id);
        if (!active) return;
        setAuditData({
          runs: state.runs || [],
          auditLog: state.auditLog || [],
          migrations: state.migrations || [],
        });
        const mergedRecords = state.records && state.records.length > 0 ? state.records : savedQuant?.studyRecords || [];
        setRecords(mergedRecords);

        // Run fresh Python analysis on mount so descriptive stats & eligibility are always synced to live articles
        const res = await apiService.runQuantSynthesisAnalysis({
          projectId: project.id,
          project,
          articles,
          config: savedQuant?.config || DEFAULT_CONFIG,
          records: mergedRecords,
        });
        if (!active) return;
        setAnalysisResult(res);
        setRecords(res.records);
        if (res.audit) setAuditData(res.audit);
      } catch (err: any) {
        if (active) showNotice('error', err?.message || 'Failed to initialize quantitative engine');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [project.id]);

  // Seed qualitative themes from included articles & RQs if empty
  useEffect(() => {
    if (qualThemes.length === 0) {
      const included = articles.filter((a) => !a.isDuplicate && a.decision === 'include');
      if (included.length > 0 && (project.researchQuestions || []).length > 0) {
        const seeded: QualitativeThemeEntry[] = (project.researchQuestions || []).map((rq, idx) => {
          const matching = included.slice(0, 8);
          return {
            id: `theme-seed-${idx + 1}`,
            theme: `${rq.code}: ${rq.mainEvidenceToCollect || 'Empirical Synthesis Theme'}`,
            researchQuestionCode: rq.code,
            synthesisNarrative: `Evidence across ${matching.length} included studies addressing "${rq.question}". Refine narrative synthesis directly below.`,
            supportingArticleIds: matching.map((m) => m.id),
            evidenceQuotes: matching
              .flatMap((m) => (m.evidenceCitations || []).slice(0, 1).map((c) => `[${m.authors?.[0] || 'Study'} ${m.year}, p.${c.pageNumber}] "${c.quote}"`))
              .slice(0, 4),
            updatedAt: new Date().toISOString(),
          };
        });
        setQualThemes(seeded);
      }
    }
  }, [project.id, articles.length]);

  const persistModeToWorkbench = (nextMode: 'qualitative' | 'quantitative', nextThemes?: QualitativeThemeEntry[]) => {
    onUpdateWorkbenchState?.(
      {
        quantSynthesis: {
          ...(project.workbenchState?.quantSynthesis || {}),
          activeSynthesisMode: nextMode,
          config,
          lastRunId: analysisResult?.runId,
          analysisDate: analysisResult?.analysisDate,
          softwareVersion: analysisResult?.softwareVersion,
          lastDescriptive: analysisResult?.descriptive || null,
          lastMetaAnalysis: analysisResult?.metaAnalysis || null,
          studyRecords: records,
          qualitativeThemes: nextThemes ?? qualThemes,
          updatedAt: new Date().toISOString(),
        },
      },
      'quant_synthesis'
    );
  };

  const handleModeSwitch = (mode: 'qualitative' | 'quantitative') => {
    setSynthesisMode(mode);
    persistModeToWorkbench(mode);
  };

  const handleRunAnalysis = async (overrideConfig?: QuantMetaConfig, overrideRecords?: QuantStudyExtractionRecord[]) => {
    const activeCfg = overrideConfig || config;
    const activeRecs = overrideRecords || records;
    setIsAnalyzing(true);
    try {
      const res = await apiService.runQuantSynthesisAnalysis({
        projectId: project.id,
        project,
        articles,
        config: activeCfg,
        records: activeRecs,
      });
      setAnalysisResult(res);
      setRecords(res.records);
      if (res.audit) setAuditData(res.audit);
      onUpdateWorkbenchState?.(
        {
          quantSynthesis: {
            ...(project.workbenchState?.quantSynthesis || {}),
            activeSynthesisMode: synthesisMode,
            config: activeCfg,
            lastRunId: res.runId,
            analysisDate: res.analysisDate,
            softwareVersion: res.softwareVersion,
            lastDescriptive: res.descriptive,
            lastMetaAnalysis: res.metaAnalysis,
            studyRecords: res.records,
            qualitativeThemes: qualThemes,
            updatedAt: new Date().toISOString(),
          },
        },
        'quant_synthesis'
      );
      showNotice(
        'success',
        res.metaAnalysis.pooledAvailable
          ? `Statistical synthesis completed (k=${res.metaAnalysis.k} eligible studies, ${res.metaAnalysis.effectMeasure}).`
          : `Descriptive synthesis updated (${res.descriptive.counts.included} included studies). ${res.metaAnalysis.reason || ''}`
      );
    } catch (err: any) {
      showNotice('error', err?.message || 'Statistical synthesis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleOverrideEligibility = async (
    rec: QuantStudyExtractionRecord,
    override: 'auto' | 'approved' | 'excluded'
  ) => {
    const updatedRec = { ...rec, eligibilityOverride: override };
    const nextRecords = records.map((r) => (r.id === rec.id ? updatedRec : r));
    setRecords(nextRecords);
    try {
      await apiService.saveQuantStudyRecord(project.id, updatedRec);
      await handleRunAnalysis(config, nextRecords);
    } catch (err: any) {
      showNotice('error', err?.message || 'Failed to update study eligibility override');
    }
  };

  const handleSaveEditedRecord = async () => {
    if (!editingRecord) return;
    setIsSavingRecord(true);
    try {
      const hasRaw = Object.values(editingRecord.originalData || {}).some(
        (v) => v !== null && v !== undefined && v !== ''
      );
      const cleaned: QuantStudyExtractionRecord = {
        ...editingRecord,
        extractionStatus: hasRaw
          ? editingRecord.verifiedBy
            ? 'verified'
            : 'extracted'
          : 'awaiting_numerical_entry',
      };
      await apiService.saveQuantStudyRecord(project.id, cleaned);
      const exists = records.some((r) => r.id === cleaned.id);
      const nextRecords = exists
        ? records.map((r) => (r.id === cleaned.id ? cleaned : r))
        : [...records, cleaned];
      setRecords(nextRecords);
      setEditingRecord(null);
      await handleRunAnalysis(config, nextRecords);
    } catch (err: any) {
      showNotice('error', err?.message || 'Failed to save numerical study record');
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleDatasetFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = apiService.parseQuantDatasetFile(text, project.id, config.effectMeasure);
      if (parsed.length === 0) {
        showNotice('error', 'No valid study rows detected in uploaded CSV/JSON file.');
        return;
      }
      const res = await apiService.importQuantDataset(project.id, parsed);
      setRecords(res.records);
      await handleRunAnalysis(config, res.records);
      showNotice('success', `Imported ${res.importedCount} quantitative study row(s) and re-assessed eligibility.`);
    } catch (err: any) {
      showNotice('error', err?.message || 'Failed to parse or import dataset file');
    } finally {
      if (datasetFileRef.current) datasetFileRef.current.value = '';
    }
  };

  const handleAddQualTheme = () => {
    if (!newThemeTitle.trim() || !newThemeNarrative.trim()) return;
    const entry: QualitativeThemeEntry = {
      id: `theme-${Date.now()}`,
      theme: newThemeTitle.trim(),
      researchQuestionCode: newThemeRq,
      synthesisNarrative: newThemeNarrative.trim(),
      supportingArticleIds: newThemeArticleIds,
      evidenceQuotes: [],
      updatedAt: new Date().toISOString(),
    };
    const next = [...qualThemes, entry];
    setQualThemes(next);
    persistModeToWorkbench(synthesisMode, next);
    setNewThemeTitle('');
    setNewThemeNarrative('');
    setNewThemeArticleIds([]);
  };

  const handleDeleteQualTheme = (id: string) => {
    const next = qualThemes.filter((t) => t.id !== id);
    setQualThemes(next);
    persistModeToWorkbench(synthesisMode, next);
  };

  // Filtered records & trace rows using search bar
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredRecords = useMemo(() => {
    if (!normalizedSearch) return records;
    return records.filter(
      (r) =>
        (r.studyLabel || '').toLowerCase().includes(normalizedSearch) ||
        (r.title || '').toLowerCase().includes(normalizedSearch) ||
        (r.subgroup || '').toLowerCase().includes(normalizedSearch) ||
        (r.outcomeLabel || '').toLowerCase().includes(normalizedSearch) ||
        (r.eligibilityStatus || '').toLowerCase().includes(normalizedSearch) ||
        (r.articleId || '').toLowerCase().includes(normalizedSearch)
    );
  }, [records, normalizedSearch]);

  const descriptive = analysisResult?.descriptive;
  const meta = analysisResult?.metaAnalysis;
  const overall = meta?.overall;
  const includedArticles = useMemo(
    () => articles.filter((a) => !a.isDuplicate && a.decision === 'include'),
    [articles]
  );

  // Download Helpers
  const triggerDownload = (content: string | Blob, filename: string, mimeType: string, label: string) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotice('success', `Downloaded ${label} (${filename})`);
  };

  const handleDownloadSvg = (chartKey: string, filename: string) => {
    const svg = svgRefs.current[chartKey];
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = '<?xml version="1.0" standalone="no"?>\n' + serializer.serializeToString(svg);
    triggerDownload(source, `${getSlug(project)}-${filename}.svg`, 'image/svg+xml;charset=utf-8', 'SVG Chart');
  };

  const handleExportCsv = () => {
    const headers = [
      'Record ID', 'Article ID', 'Study Label', 'Year', 'Cluster ID', 'Study Design',
      'Outcome Type', 'Outcome Label', 'Units', 'Subgroup', 'Effect Measure',
      'Effect Size (Model Scale)', 'SE', 'Variance', '95% CI Low', '95% CI High',
      'Display Effect', 'Display CI Low', 'Display CI High', 'FE Weight %', 'RE Weight %',
      'Eligibility Status', 'Override', 'Reasons', 'Extraction Status', 'Verified By', 'PDF Pages',
    ];
    const rows = records.map((r) => [
      csvCell(r.id), csvCell(r.articleId), csvCell(r.studyLabel), csvCell(r.year ?? ''),
      csvCell(r.studyClusterId), csvCell(r.studyDesign), csvCell(r.outcomeType),
      csvCell(r.outcomeLabel), csvCell(r.units), csvCell(r.subgroup), csvCell(r.effectMeasure),
      csvCell(r.effectSize ?? ''), csvCell(r.se ?? ''), csvCell(r.variance ?? ''),
      csvCell(r.ciLow ?? ''), csvCell(r.ciHigh ?? ''), csvCell(r.displayEffect ?? ''),
      csvCell(r.displayCiLow ?? ''), csvCell(r.displayCiHigh ?? ''),
      csvCell(r.weightFe ?? ''), csvCell(r.weightRe ?? ''),
      csvCell(r.eligibilityStatus), csvCell(r.eligibilityOverride || 'auto'),
      csvCell((r.eligibilityReasons || []).join(' | ')),
      csvCell(r.extractionStatus), csvCell(r.verifiedBy), csvCell(r.pdfPageNumbers),
    ]);
    const csv = '\uFEFF' + [headers.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(csv, `${getSlug(project)}-quantitative-extractions.csv`, 'text/csv;charset=utf-8', 'Study Extraction CSV');
  };

  const handleExportExcel = () => {
    const descRows = descriptive
      ? `<tr><th>Identified</th><td>${descriptive.counts.totalIdentified}</td><th>Duplicates</th><td>${descriptive.counts.duplicatesRemoved}</td></tr>
         <tr><th>Screened</th><td>${descriptive.counts.screened}</td><th>Excluded</th><td>${descriptive.counts.excluded}</td></tr>
         <tr><th>Included</th><td>${descriptive.counts.included}</td><th>Original Research %</th><td>${descriptive.counts.includedOriginalPct}%</td></tr>`
      : '';
    const metaRows = overall
      ? `<tr><th>Effect Measure</th><td>${overall.effectMeasure}</td><th>Model / Estimator</th><td>${overall.modelType} (${overall.estimator})</td></tr>
         <tr><th>Pooled Estimate (Display)</th><td>${fmtNum(overall.displayPooledEffect)}</td><th>95% CI</th><td>[${fmtNum(overall.displayCiLow)}, ${fmtNum(overall.displayCiHigh)}]</td></tr>
         <tr><th>Heterogeneity I² / Q / tau²</th><td colspan="3">${fmtNum(overall.heterogeneity.i2, 1)}% | Q=${fmtNum(overall.heterogeneity.qStat, 2)} (p=${fmtNum(overall.heterogeneity.qPvalue, 4)}) | tau²=${fmtNum(overall.heterogeneity.tau2, 4)}</td></tr>`
      : `<tr><td colspan="4">Pooled meta-analysis not performed: ${escapeHtml(meta?.reason || 'No eligible studies')}</td></tr>`;
    const studyRows = records
      .map(
        (r) => `<tr>
          <td>${escapeHtml(r.studyLabel)}</td>
          <td>${escapeHtml(r.articleId)}</td>
          <td>${escapeHtml(r.year)}</td>
          <td>${escapeHtml(r.studyClusterId)}</td>
          <td>${escapeHtml(r.effectMeasure)}</td>
          <td>${fmtNum(r.displayEffect)}</td>
          <td>[${fmtNum(r.displayCiLow)}, ${fmtNum(r.displayCiHigh)}]</td>
          <td>${fmtNum(r.se)}</td>
          <td>${escapeHtml(r.eligibilityStatus)}</td>
          <td>${escapeHtml((r.eligibilityReasons || []).join('; '))}</td>
          <td>${escapeHtml(r.pdfPageNumbers)}</td>
        </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Calibri,Arial,sans-serif;font-size:11pt;}
      table{border-collapse:collapse;width:100%;margin-bottom:16px;}
      th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;}
      th{background:#f1f5f9;font-weight:bold;}
    </style></head><body>
      <h2>ResearchMate AI Quantitative Synthesis & Meta-Analysis Report</h2>
      <p><b>Project:</b> ${escapeHtml(project.title)} | <b>Run ID:</b> ${escapeHtml(analysisResult?.runId)} | <b>Date:</b> ${escapeHtml(analysisResult?.analysisDate)}</p>
      <h3>1. PRISMA 2020 & Descriptive Quantitative Summary</h3>
      <table>${descRows}</table>
      <h3>2. Statistical Meta-Analysis Summary</h3>
      <table>${metaRows}</table>
      <h3>3. Study-Level Extraction & Eligibility Table</h3>
      <table><thead><tr><th>Study</th><th>Article ID</th><th>Year</th><th>Cluster</th><th>Measure</th><th>Effect</th><th>95% CI</th><th>SE</th><th>Eligibility</th><th>Decision Rationale</th><th>PDF Pages</th></tr></thead><tbody>${studyRows}</tbody></table>
    </body></html>`;
    triggerDownload(html, `${getSlug(project)}-quant-report.xls`, 'application/vnd.ms-excel;charset=utf-8', 'Excel Workbook');
  };

  const handleExportWord = () => {
    const rqRows = (descriptive?.researchObjectiveContributions || [])
      .map(
        (rq) =>
          `<tr><td><b>${escapeHtml(rq.code)}</b></td><td>${escapeHtml(rq.question)}</td><td>${rq.count} (${rq.percentage}%)</td><td>${escapeHtml(rq.contributingArticleIds.join(', '))}</td></tr>`
      )
      .join('');
    const subgroupRows = (meta?.subgroupAnalysis?.subgroups || [])
      .map(
        (s) =>
          `<tr><td>${escapeHtml(s.subgroup)}</td><td>${s.k}</td><td>${fmtNum(s.displayPooledEffect)}</td><td>[${fmtNum(s.displayCiLow)}, ${fmtNum(s.displayCiHigh)}]</td><td>${fmtNum(s.i2, 1)}%</td></tr>`
      )
      .join('');

    const docHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><title>Quantitative Synthesis Report</title>
      <style>body{font-family:'Times New Roman',serif;font-size:11pt;line-height:1.45;}h1,h2,h3{color:#0f172a;}table{border-collapse:collapse;width:100%;margin:10px 0;}th,td{border:1px solid #94a3b8;padding:6px;text-align:left;font-size:10pt;}th{background:#f8fafc;}</style></head>
      <body>
        <h1>Quantitative Synthesis & Statistical Meta-Analysis Report</h1>
        <p><b>Review Title:</b> ${escapeHtml(project.title)}<br/>
        <b>Framework:</b> ${escapeHtml(project.frameworkType || 'PICOC')} | <b>Review Type:</b> ${escapeHtml(project.reviewType || 'slr')}<br/>
        <b>Analysis Run:</b> ${escapeHtml(analysisResult?.runId)} | <b>Engine Version:</b> ${escapeHtml(analysisResult?.softwareVersion)} | <b>Date:</b> ${escapeHtml(analysisResult?.analysisDate)}</p>
        <h2>1. PRISMA 2020 & Descriptive Quantitative Synthesis</h2>
        ${
          descriptive
            ? `<p>Identified: <b>${descriptive.counts.totalIdentified}</b> | Duplicates Removed: <b>${descriptive.counts.duplicatesRemoved}</b> | Screened: <b>${descriptive.counts.screened}</b> | Excluded: <b>${descriptive.counts.excluded}</b> | Included: <b>${descriptive.counts.included}</b> (Original Research: ${descriptive.counts.includedOriginalResearch} [${descriptive.counts.includedOriginalPct}%], Reviews: ${descriptive.counts.includedReviews} [${descriptive.counts.includedReviewPct}%]).</p>`
            : ''
        }
        <h3>Research Objective Traceability</h3>
        <table><thead><tr><th>Objective</th><th>Question</th><th>Articles (%)</th><th>Contributing Article IDs</th></tr></thead><tbody>${rqRows}</tbody></table>
        <h2>2. Statistical Meta-Analysis & Heterogeneity</h2>
        ${
          overall
            ? `<p>Model: <b>${overall.modelType.toUpperCase()} (${overall.estimator})</b> on <b>k = ${overall.k}</b> independent study clusters using <b>${overall.effectMeasure}</b>.<br/>
               Pooled Estimate: <b>${fmtNum(overall.displayPooledEffect)}</b> (95% CI [${fmtNum(overall.displayCiLow)}, ${fmtNum(overall.displayCiHigh)}], z = ${fmtNum(overall.zStat)}, p = ${fmtNum(overall.pValue, 4)}).<br/>
               Heterogeneity: Cochran's Q = ${fmtNum(overall.heterogeneity.qStat)} (df = ${overall.heterogeneity.qDf}, p = ${fmtNum(overall.heterogeneity.qPvalue, 4)}), I² = ${fmtNum(overall.heterogeneity.i2, 1)}%, tau² = ${fmtNum(overall.heterogeneity.tau2, 4)}.</p>
               ${overall.predictionInterval ? `<p>95% Prediction Interval: [${fmtNum(overall.predictionInterval.displayLow)}, ${fmtNum(overall.predictionInterval.displayHigh)}]</p>` : ''}`
            : `<p>Meta-analysis not executed: ${escapeHtml(meta?.reason || 'Insufficient compatible studies.')}</p>`
        }
        ${
          subgroupRows
            ? `<h3>Subgroup Analysis (Q_between = ${fmtNum(meta?.subgroupAnalysis?.qBetween)}, p = ${fmtNum(meta?.subgroupAnalysis?.pBetween, 4)})</h3>
               <table><thead><tr><th>Subgroup</th><th>k</th><th>Pooled</th><th>95% CI</th><th>I²</th></tr></thead><tbody>${subgroupRows}</tbody></table>`
            : ''
        }
        <h2>3. Qualitative Thematic Synthesis</h2>
        ${qualThemes.map((t) => `<p><b>${escapeHtml(t.theme)}</b> (${escapeHtml(t.researchQuestionCode)}): ${escapeHtml(t.synthesisNarrative)}</p>`).join('')}
      </body></html>`;
    triggerDownload(docHtml, `${getSlug(project)}-quantitative-synthesis.doc`, 'application/msword;charset=utf-8', 'Word Report (.doc)');
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    let y = 44;
    const writeLine = (txt: string, bold = false, size = 10) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const wrapped = doc.splitTextToSize(pdfSafe(txt), 515);
      for (const line of wrapped) {
        if (y > 790) {
          doc.addPage();
          y = 44;
        }
        doc.text(line, 40, y);
        y += size + 4;
      }
    };

    writeLine('ResearchMate AI - Quantitative Synthesis & Meta-Analysis Report', true, 14);
    writeLine(`Project: ${project.title}`, true, 11);
    writeLine(`Run ID: ${analysisResult?.runId || 'N/A'} | Date: ${analysisResult?.analysisDate || ''} | Software v${analysisResult?.softwareVersion || '1.0.0'}`, false, 9);
    y += 8;

    if (descriptive) {
      writeLine('1. Descriptive Quantitative & PRISMA 2020 Synthesis', true, 12);
      writeLine(
        `Identified: ${descriptive.counts.totalIdentified} | Duplicates: ${descriptive.counts.duplicatesRemoved} | Screened: ${descriptive.counts.screened} | Excluded: ${descriptive.counts.excluded} | Included: ${descriptive.counts.included} (Original: ${descriptive.counts.includedOriginalResearch} / ${descriptive.counts.includedOriginalPct}%, Reviews: ${descriptive.counts.includedReviews} / ${descriptive.counts.includedReviewPct}%)`,
        false,
        10
      );
      y += 4;
      descriptive.researchObjectiveContributions.forEach((rq) => {
        writeLine(`${rq.code} (${rq.count} studies, ${rq.percentage}%): ${rq.question} | IDs: ${rq.contributingArticleIds.join(', ')}`, false, 9);
      });
      y += 8;
    }

    writeLine('2. Statistical Meta-Analysis & Heterogeneity', true, 12);
    if (overall) {
      writeLine(
        `Model: ${overall.modelType.toUpperCase()} (${overall.estimator}) | Measure: ${overall.effectMeasure} | k = ${overall.k} independent studies`,
        false,
        10
      );
      writeLine(
        `Pooled Effect = ${fmtNum(overall.displayPooledEffect)}, 95% CI [${fmtNum(overall.displayCiLow)}, ${fmtNum(overall.displayCiHigh)}], z = ${fmtNum(overall.zStat)}, p = ${fmtNum(overall.pValue, 4)}`,
        true,
        10
      );
      writeLine(
        `Heterogeneity: Q = ${fmtNum(overall.heterogeneity.qStat)} (df=${overall.heterogeneity.qDf}, p=${fmtNum(overall.heterogeneity.qPvalue, 4)}), I2 = ${fmtNum(overall.heterogeneity.i2, 1)}%, tau2 = ${fmtNum(overall.heterogeneity.tau2, 4)}`,
        false,
        9
      );
      if (overall.predictionInterval) {
        writeLine(`95% Prediction Interval: [${fmtNum(overall.predictionInterval.displayLow)}, ${fmtNum(overall.predictionInterval.displayHigh)}]`, false, 9);
      }
      y += 6;
      writeLine('Study-Level Forest Data:', true, 10);
      overall.studies.forEach((s) => {
        writeLine(`- ${s.studyLabel}: effect=${fmtNum(s.displayEffect)} [${fmtNum(s.displayCiLow)}, ${fmtNum(s.displayCiHigh)}], weightRE=${fmtNum(s.weightRe, 1)}%, pages=${s.pdfPageNumbers || 'N/A'}`, false, 8.5);
      });
    } else {
      writeLine(`Pooling withheld: ${meta?.reason || 'No compatible studies available.'}`, false, 10);
    }

    doc.save(`${getSlug(project)}-quantitative-synthesis.pdf`);
    showNotice('success', 'Downloaded Publication PDF Report.');
  };

  // Helper SVG Renderer helpers
  const renderHorizontalBarSvg = (
    chartKey: string,
    title: string,
    items: Array<{ label: string; value: number; extra?: string }>,
    barColor: string
  ) => {
    const slice = items.slice(0, 10);
    const maxVal = Math.max(...slice.map((i) => i.value), 1);
    const height = Math.max(160, slice.length * 28 + 50);
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h4>
          <button
            type="button"
            onClick={() => handleDownloadSvg(chartKey, chartKey)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-indigo-700 bg-slate-50 border border-slate-200 rounded-md whitespace-nowrap shrink-0"
          >
            <Download className="w-3 h-3" /> SVG
          </button>
        </div>
        {slice.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">No data available for chart.</p>
        ) : (
          <svg
            ref={(el) => { svgRefs.current[chartKey] = el; }}
            viewBox={`0 0 600 ${height}`}
            className="w-full h-auto"
          >
            <rect width="600" height={height} fill="#ffffff" />
            {slice.map((item, idx) => {
              const y = 24 + idx * 28;
              const barW = Math.round((item.value / maxVal) * 280);
              return (
                <g key={item.label}>
                  <text x="10" y={y + 14} fontSize="11" fill="#334155" fontFamily="Inter, sans-serif">
                    {item.label.length > 26 ? `${item.label.slice(0, 24)}...` : item.label}
                  </text>
                  <rect x="195" y={y + 2} width={Math.max(4, barW)} height="16" rx="3" fill={barColor} />
                  <text x={205 + Math.max(4, barW)} y={y + 14} fontSize="11" fill="#0f172a" fontFamily="monospace">
                    {item.value}{item.extra ? ` ${item.extra}` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    );
  };

  const renderForestPlotSvg = () => {
    if (!overall || overall.studies.length === 0) {
      return (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">Forest Plot Unavailable</p>
          <p className="text-xs text-slate-500 mt-1">{meta?.reason || 'Requires at least 2 eligible compatible studies.'}</p>
        </div>
      );
    }
    const studies = overall.studies;
    const isRatio = overall.effectMeasure === 'OR' || overall.effectMeasure === 'RR';
    const nullVal = isRatio ? 1 : overall.effectMeasure === 'PROP' ? 0.5 : 0;
    const allVals = [
      ...studies.flatMap((s) => [s.displayCiLow ?? 0, s.displayCiHigh ?? 0, s.displayEffect ?? 0]),
      overall.displayCiLow,
      overall.displayCiHigh,
      nullVal,
    ].filter((v) => Number.isFinite(v)) as number[];
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    const pad = (maxV - minV) * 0.12 || 0.5;
    const xMin = minV - pad;
    const xMax = maxV + pad;
    const xStart = 210;
    const xWidth = 240;
    const mapX = (v: number) => xStart + ((v - xMin) / (xMax - xMin || 1)) * xWidth;
    const height = Math.max(220, studies.length * 26 + 90);
    const nullX = mapX(nullVal);
    const pooledX = mapX(overall.displayPooledEffect);
    const pooledLoX = mapX(overall.displayCiLow);
    const pooledHiX = mapX(overall.displayCiHigh);
    const pooledY = 48 + studies.length * 26 + 14;

    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              1. Forest Plot ({overall.effectMeasure} · {overall.modelType.toUpperCase()} {overall.estimator})
            </h4>
            <p className="text-[11px] text-slate-500 font-mono">
              Pooled = {fmtNum(overall.displayPooledEffect)} [{fmtNum(overall.displayCiLow)}, {fmtNum(overall.displayCiHigh)}] · I² = {fmtNum(overall.heterogeneity.i2, 1)}%
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDownloadSvg('forest', 'forest-plot')}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:text-indigo-700 whitespace-nowrap shrink-0"
          >
            <Download className="w-3 h-3" /> Export SVG
          </button>
        </div>
        <svg ref={(el) => { svgRefs.current.forest = el; }} viewBox={`0 0 680 ${height}`} className="w-full h-auto">
          <rect width="680" height={height} fill="#ffffff" />
          <text x="12" y="24" fontSize="11" fontWeight="bold" fill="#1e293b">Study (Year)</text>
          <text x="330" y="24" fontSize="11" fontWeight="bold" fill="#1e293b" textAnchor="middle">Effect Size &amp; 95% CI</text>
          <text x="480" y="24" fontSize="11" fontWeight="bold" fill="#1e293b">Estimate [95% CI]</text>
          <text x="615" y="24" fontSize="11" fontWeight="bold" fill="#1e293b">Wt %</text>
          <line x1="12" y1="32" x2="665" y2="32" stroke="#cbd5e1" strokeWidth="1" />
          <line x1={nullX} y1="34" x2={nullX} y2={pooledY + 14} stroke="#94a3b8" strokeDasharray="4,3" strokeWidth="1" />
          {studies.map((s, idx) => {
            const y = 52 + idx * 26;
            const effX = mapX(s.displayEffect ?? 0);
            const loX = mapX(s.displayCiLow ?? 0);
            const hiX = mapX(s.displayCiHigh ?? 0);
            const wt = overall.modelType === 'fixed' ? (s.weightFe ?? 5) : (s.weightRe ?? 5);
            const sq = Math.max(5, Math.min(12, Math.sqrt(wt) * 1.4));
            return (
              <g key={s.id}>
                <text x="12" y={y + 4} fontSize="10.5" fill="#334155">
                  {(s.studyLabel || s.id).slice(0, 28)}
                </text>
                <line x1={loX} y1={y} x2={hiX} y2={y} stroke="#334155" strokeWidth="1.5" />
                <rect x={effX - sq / 2} y={y - sq / 2} width={sq} height={sq} fill="#1d4ed8" />
                <text x="480" y={y + 4} fontSize="10" fontFamily="monospace" fill="#0f172a">
                  {fmtNum(s.displayEffect, 2)} [{fmtNum(s.displayCiLow, 2)}, {fmtNum(s.displayCiHigh, 2)}]
                </text>
                <text x="615" y={y + 4} fontSize="10" fontFamily="monospace" fill="#475569">
                  {fmtNum(wt, 1)}%
                </text>
              </g>
            );
          })}
          <line x1="12" y1={pooledY - 12} x2="665" y2={pooledY - 12} stroke="#cbd5e1" strokeWidth="1" />
          <text x="12" y={pooledY + 4} fontSize="11" fontWeight="bold" fill="#0f172a">
            Pooled ({overall.modelType === 'fixed' ? 'FE' : 'RE'})
          </text>
          <polygon
            points={`${pooledLoX},${pooledY} ${pooledX},${pooledY - 7} ${pooledHiX},${pooledY} ${pooledX},${pooledY + 7}`}
            fill="#0f766e"
          />
          <text x="480" y={pooledY + 4} fontSize="10.5" fontWeight="bold" fontFamily="monospace" fill="#0f766e">
            {fmtNum(overall.displayPooledEffect, 2)} [{fmtNum(overall.displayCiLow, 2)}, {fmtNum(overall.displayCiHigh, 2)}]
          </text>
          <text x="615" y={pooledY + 4} fontSize="10" fontWeight="bold" fontFamily="monospace" fill="#0f172a">100.0%</text>
        </svg>
      </div>
    );
  };

  const renderFunnelPlotSvg = () => {
    if (!overall || overall.studies.length < 3) {
      return (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">Funnel Plot Requires k ≥ 3 Eligible Studies</p>
          <p className="text-xs text-slate-500 mt-1">Currently {overall?.studies.length || 0} eligible studies.</p>
        </div>
      );
    }
    const studies = overall.studies;
    const maxSe = Math.max(...studies.map((s) => s.se || 0.1), 0.2) * 1.15;
    const theta = overall.pooledEffect;
    const effs = studies.map((s) => s.effectSize || 0);
    const minE = Math.min(...effs, theta - 1.96 * maxSe);
    const maxE = Math.max(...effs, theta + 1.96 * maxSe);
    const mapX = (e: number) => 60 + ((e - minE) / (maxE - minE || 1)) * 480;
    const mapY = (se: number) => 30 + (se / maxSe) * 200;
    const apexX = mapX(theta);
    const botLeftX = mapX(theta - 1.96 * maxSe);
    const botRightX = mapX(theta + 1.96 * maxSe);

    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              2. Funnel Plot (SE vs Model Effect Size)
            </h4>
            <p className="text-[11px] text-slate-500">{meta?.publicationBias?.advisory}</p>
          </div>
          <button
            type="button"
            onClick={() => handleDownloadSvg('funnel', 'funnel-plot')}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:text-indigo-700 whitespace-nowrap shrink-0"
          >
            <Download className="w-3 h-3" /> Export SVG
          </button>
        </div>
        <svg ref={(el) => { svgRefs.current.funnel = el; }} viewBox="0 0 580 265" className="w-full h-auto">
          <rect width="580" height="265" fill="#ffffff" />
          <polygon points={`${apexX},30 ${botLeftX},230 ${botRightX},230`} fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="4,3" />
          <line x1={apexX} y1="30" x2={apexX} y2="230" stroke="#0f766e" strokeWidth="1.5" />
          <line x1="60" y1="230" x2="540" y2="230" stroke="#64748b" />
          <line x1="60" y1="30" x2="60" y2="230" stroke="#64748b" />
          <text x="300" y="254" fontSize="10.5" fill="#334155" textAnchor="middle">Effect Estimate ({overall.effectMeasure})</text>
          <text x="20" y="130" fontSize="10.5" fill="#334155" transform="rotate(-90 20 130)" textAnchor="middle">Standard Error (SE)</text>
          {studies.map((s) => (
            <g key={s.id}>
              <circle cx={mapX(s.effectSize ?? 0)} cy={mapY(s.se ?? 0.1)} r="4.5" fill="#2563eb" opacity="0.85" />
            </g>
          ))}
        </svg>
      </div>
    );
  };

  const renderSubgroupSvg = () => {
    const subs = meta?.subgroupAnalysis?.subgroups || [];
    if (subs.length === 0) {
      return (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">Subgroup Comparison Chart Unavailable</p>
          <p className="text-xs text-slate-500 mt-1">Assign compatible studies into subgroups to compare pooled subgroup effects.</p>
        </div>
      );
    }
    const vals = subs.flatMap((s) => [s.displayCiLow, s.displayCiHigh, s.displayPooledEffect]);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const pad = (maxV - minV) * 0.15 || 0.4;
    const lo = minV - pad;
    const hi = maxV + pad;
    const mapX = (v: number) => 200 + ((v - lo) / (hi - lo || 1)) * 280;
    const h = Math.max(150, subs.length * 36 + 60);
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            7. Subgroup Comparison ({meta?.subgroupAnalysis?.subgroupField})
          </h4>
          <button
            type="button"
            onClick={() => handleDownloadSvg('subgroup', 'subgroup-comparison')}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-md whitespace-nowrap shrink-0"
          >
            <Download className="w-3 h-3" /> SVG
          </button>
        </div>
        <svg ref={(el) => { svgRefs.current.subgroup = el; }} viewBox={`0 0 600 ${h}`} className="w-full h-auto">
          <rect width="600" height={h} fill="#ffffff" />
          {subs.map((s, idx) => {
            const y = 32 + idx * 34;
            return (
              <g key={s.subgroup}>
                <text x="12" y={y + 4} fontSize="11" fill="#1e293b">
                  {s.subgroup} (k={s.k})
                </text>
                <line x1={mapX(s.displayCiLow)} y1={y} x2={mapX(s.displayCiHigh)} y2={y} stroke="#475569" strokeWidth="2" />
                <circle cx={mapX(s.displayPooledEffect)} cy={y} r="5.5" fill="#0d9488" />
                <text x="495" y={y + 4} fontSize="10" fontFamily="monospace" fill="#0f172a">
                  {fmtNum(s.displayPooledEffect, 2)} (I² {fmtNum(s.i2, 0)}%)
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  const renderContributionMatrixSvg = () => {
    const rqs = descriptive?.researchObjectiveContributions || [];
    const studyRows = (descriptive?.studyTraceRows || []).slice(0, 12);
    if (rqs.length === 0 || studyRows.length === 0) {
      return (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">8. Study Contribution Matrix</p>
          <p className="text-xs text-slate-500 mt-1">Include studies and define Research Questions to render contribution cells.</p>
        </div>
      );
    }
    const colW = Math.min(80, Math.floor(340 / Math.max(rqs.length, 1)));
    const h = 60 + studyRows.length * 24;
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            8. Study Contribution Matrix (Included Studies × Objectives)
          </h4>
          <button
            type="button"
            onClick={() => handleDownloadSvg('matrix', 'study-contribution-matrix')}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-md whitespace-nowrap shrink-0"
          >
            <Download className="w-3 h-3" /> SVG
          </button>
        </div>
        <svg ref={(el) => { svgRefs.current.matrix = el; }} viewBox={`0 0 600 ${h}`} className="w-full h-auto">
          <rect width="600" height={h} fill="#ffffff" />
          {rqs.map((rq, cIdx) => (
            <text key={rq.code} x={230 + cIdx * colW + colW / 2} y="24" fontSize="11" fontWeight="bold" fill="#1e293b" textAnchor="middle">
              {rq.code}
            </text>
          ))}
          {studyRows.map((row, rIdx) => {
            const y = 40 + rIdx * 24;
            return (
              <g key={row.articleId}>
                <text x="10" y={y + 13} fontSize="10" fill="#334155">
                  {row.title.slice(0, 32)}
                </text>
                {rqs.map((rq, cIdx) => {
                  const hit = rq.contributingArticleIds.includes(row.articleId);
                  return (
                    <rect
                      key={`${row.articleId}-${rq.code}`}
                      x={230 + cIdx * colW + 8}
                      y={y + 2}
                      width={colW - 16}
                      height="16"
                      rx="3"
                      fill={hit ? '#0f766e' : '#f1f5f9'}
                      stroke="#cbd5e1"
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-14">
      {/* Header & Dual Synthesis Mode Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700">
              <BarChart3 className="w-4 h-4" /> Evidence Synthesis Engine
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
              {synthesisMode === 'quantitative'
                ? 'Quantitative Synthesis & Statistical Meta-Analysis'
                : 'Qualitative & Thematic Evidence Synthesis'}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Traceable statistical synthesis, compatibility verification, double-counting protection, and qualitative integration.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleModeSwitch('qualitative')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition whitespace-nowrap shrink-0 ${
                synthesisMode === 'qualitative'
                  ? 'bg-indigo-700 text-white border-indigo-700 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Qualitative Synthesis
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('quantitative')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition whitespace-nowrap shrink-0 ${
                synthesisMode === 'quantitative'
                  ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Quantitative Synthesis / Meta-Analysis
            </button>
          </div>
        </div>

        {/* Search Filter Bar + Module Workbench Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter synthesis records, outcomes, subgroups, or article IDs..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onNavigateToModule && (
              <button
                type="button"
                onClick={() => onNavigateToModule('results_synthesis')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <FileText className="w-3.5 h-3.5" /> Descriptive Summary Table
              </button>
            )}
            <input
              ref={datasetFileRef}
              type="file"
              accept=".csv,.tsv,.json"
              onChange={handleDatasetFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => datasetFileRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" /> Upload CSV / JSON Dataset
            </button>
          </div>
        </div>

        <ModuleWorkbenchControls
          project={project}
          moduleId="quant_synthesis"
          moduleLabel="Quantitative & Qualitative Synthesis"
          autoSaveStatus={autoSaveStatus}
          compact
          onResetModule={onResetWorkbenchModule}
          onAddDataFiles={onDirectAddDataFiles}
          onOpenBulkImporter={onOpenBulkImporter}
          onRescanQueryQA={onRescanWithQueryQA}
          onDeleteQaEntry={onDeleteQaEntry}
        />
      </div>

      {project.workbenchState?.protocolBuilder?.activeProtocol && (() => {
        const activeProto = project.workbenchState.protocolBuilder!.activeProtocol!;
        const feas = activeProto.synthesisPlan?.metaAnalysisFeasibility || 'conditional';
        return (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-bold text-slate-900">
                Active Protocol v{activeProto.versionNumber} ({activeProto.reviewMethodRecommendation.recommendedPrimaryFramework} · {activeProto.reviewMethodRecommendation.recommendedReviewType.toUpperCase()})
              </span>
              <span className="mx-2 text-slate-400">·</span>
              <span>
                Planned Meta-Analysis Feasibility:{' '}
                <b className={feas === 'not_feasible' ? 'text-amber-700' : 'text-emerald-700'}>
                  {feas.replace(/_/g, ' ').toUpperCase()}
                </b>
              </span>
              <p className="text-[11px] text-slate-600 mt-0.5">{activeProto.synthesisPlan?.feasibilityRationale}</p>
            </div>
            {onNavigateToModule && (
              <button
                type="button"
                onClick={() => onNavigateToModule('protocol_builder')}
                className="px-3 py-1.5 text-[11px] font-semibold bg-white border border-slate-300 rounded-lg hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                Open Protocol Spec
              </button>
            )}
          </div>
        );
      })()}

      {statusMessage && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-xs font-medium ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span className="flex items-center gap-2">
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {statusMessage.text}
          </span>
          <button type="button" onClick={() => setStatusMessage(null)} className="p-0.5 hover:opacity-70">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* QUALITATIVE SYNTHESIS WORKSPACE                              */}
      {/* ============================================================ */}
      {synthesisMode === 'qualitative' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Thematic & Narrative Synthesis Matrix ({qualThemes.length} Themes)
                </h3>
                <button
                  type="button"
                  onClick={handleExportWord}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 whitespace-nowrap shrink-0"
                >
                  <FileDown className="w-3.5 h-3.5" /> Export Word Synthesis
                </button>
              </div>
              <div className="space-y-3">
                {qualThemes.map((t) => (
                  <div key={t.id} className="border border-slate-200 rounded-lg p-4 space-y-2 bg-slate-50/60">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-bold font-mono text-indigo-700">{t.researchQuestionCode}</span>
                        <h4 className="text-sm font-bold text-slate-900">{t.theme}</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteQualTheme(t.id)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Remove theme"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <textarea
                      value={t.synthesisNarrative}
                      onChange={(e) => {
                        const next = qualThemes.map((item) =>
                          item.id === t.id ? { ...item, synthesisNarrative: e.target.value, updatedAt: new Date().toISOString() } : item
                        );
                        setQualThemes(next);
                        persistModeToWorkbench('qualitative', next);
                      }}
                      rows={3}
                      className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-md p-2.5 focus:outline-none focus:border-indigo-500"
                    />
                    {t.supportingArticleIds.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-slate-500">Contributing Articles:</span>
                        {t.supportingArticleIds.map((aid) => {
                          const art = includedArticles.find((a) => a.id === aid);
                          return (
                            <button
                              key={aid}
                              type="button"
                              onClick={() => onSelectArticle?.(aid)}
                              className="text-[11px] font-mono px-2 py-0.5 bg-white border border-slate-200 rounded text-indigo-700 hover:bg-indigo-50"
                            >
                              {art?.authors?.[0]?.split(',')[0] || aid} ({art?.year || 'N/A'})
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit">
              <h3 className="text-sm font-bold text-slate-900">Add Qualitative Theme</h3>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Research Question</label>
                <select
                  value={newThemeRq}
                  onChange={(e) => setNewThemeRq(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                >
                  {(project.researchQuestions || [{ code: 'RQ1' }, { code: 'RQ2' }, { code: 'RQ3' }]).map((rq) => (
                    <option key={rq.code} value={rq.code}>{rq.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Theme Label</label>
                <input
                  type="text"
                  value={newThemeTitle}
                  onChange={(e) => setNewThemeTitle(e.target.value)}
                  placeholder="e.g., Sensor calibration drift under cloud cover"
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Synthesis Narrative</label>
                <textarea
                  value={newThemeNarrative}
                  onChange={(e) => setNewThemeNarrative(e.target.value)}
                  rows={4}
                  placeholder="Summarize converging and diverging empirical evidence..."
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Link Supporting Included Articles ({newThemeArticleIds.length} selected)
                </label>
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
                  {includedArticles.map((art) => (
                    <label key={art.id} className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newThemeArticleIds.includes(art.id)}
                        onChange={(e) => {
                          setNewThemeArticleIds((prev) =>
                            e.target.checked ? [...prev, art.id] : prev.filter((id) => id !== art.id)
                          );
                        }}
                      />
                      <span className="truncate">{art.title}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddQualTheme}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" /> Add Theme to Synthesis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* QUANTITATIVE SYNTHESIS & META-ANALYSIS WORKSPACE             */}
      {/* ============================================================ */}
      {synthesisMode === 'quantitative' && (
        <div className="space-y-5">
          {/* Statistical Model Configuration Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Effect Measure</label>
                <select
                  value={config.effectMeasure}
                  onChange={(e) => setConfig({ ...config, effectMeasure: e.target.value as QuantEffectMeasure })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white font-semibold"
                >
                  <option value="SMD">SMD (Hedges' g)</option>
                  <option value="MD">Mean Difference (MD)</option>
                  <option value="OR">Odds Ratio (OR)</option>
                  <option value="RR">Risk Ratio (RR)</option>
                  <option value="COR">Correlation (Fisher's z)</option>
                  <option value="PROP">Proportion (Logit)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pooling Model</label>
                <select
                  value={config.modelType}
                  onChange={(e) => setConfig({ ...config, modelType: e.target.value as QuantModelType })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
                >
                  <option value="random">Random-Effects</option>
                  <option value="fixed">Fixed-Effect</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tau² Estimator</label>
                <select
                  value={config.estimator}
                  onChange={(e) => setConfig({ ...config, estimator: e.target.value as QuantTauEstimator })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
                >
                  <option value="DL">DerSimonian-Laird (DL)</option>
                  <option value="REML">Restricted ML (REML)</option>
                  <option value="PM">Paule-Mandel (PM)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Subgroup Dimension</label>
                <select
                  value={config.subgroupBy}
                  onChange={(e) => setConfig({ ...config, subgroupBy: e.target.value as any })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
                >
                  <option value="subgroup">Subgroup / Sensor</option>
                  <option value="studyDesign">Study Design</option>
                  <option value="effectMeasure">Effect Measure</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Meta-Regression</label>
                <select
                  value={config.metaRegressionModerator}
                  onChange={(e) => setConfig({ ...config, metaRegressionModerator: e.target.value as any })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
                >
                  <option value="moderatorYear">Publication Year</option>
                  <option value="moderatorQuality">Quality / Appraisal</option>
                  <option value="moderatorSampleSize">Sample Size (n)</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => handleRunAnalysis()}
                  disabled={isAnalyzing || isLoading}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Run Statistical Synthesis
                </button>
              </div>
            </div>

            {/* Sub-Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'descriptive', label: 'Descriptive Synthesis' },
                  { id: 'eligibility', label: `Eligibility & Numerical Input (${records.length})` },
                  { id: 'meta', label: 'Meta-Analysis & Advanced' },
                  { id: 'visualizations', label: '8 Visualizations' },
                  { id: 'audit', label: 'Audit Trail & Exports' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSubTab(t.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                      subTab === t.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100 whitespace-nowrap shrink-0"
                >
                  <FileDown className="w-3.5 h-3.5" /> PDF
                </button>
                <button
                  type="button"
                  onClick={handleExportWord}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 whitespace-nowrap shrink-0"
                >
                  <FileText className="w-3.5 h-3.5" /> Word
                </button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-teal-700 mx-auto" />
              <p className="text-xs text-slate-600 mt-2">Running SQLite migrations & Python statistical synthesis...</p>
            </div>
          ) : (
            <>
              {/* 1. DESCRIPTIVE QUANTITATIVE SYNTHESIS */}
              {subTab === 'descriptive' && descriptive && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {[
                      { label: 'Identified', val: descriptive.counts.totalIdentified },
                      { label: 'Duplicates', val: descriptive.counts.duplicatesRemoved },
                      { label: 'Screened', val: descriptive.counts.screened },
                      { label: 'Excluded', val: descriptive.counts.excluded },
                      { label: 'Included', val: descriptive.counts.included },
                      { label: 'Original Research', val: `${descriptive.counts.includedOriginalResearch} (${descriptive.counts.includedOriginalPct}%)` },
                      { label: 'Reviews', val: `${descriptive.counts.includedReviews} (${descriptive.counts.includedReviewPct}%)` },
                    ].map((kpi) => (
                      <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-3.5">
                        <div className="text-[11px] font-semibold text-slate-500">{kpi.label}</div>
                        <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">{kpi.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Research Objective Contribution Traceability */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      Research Objective Contribution & Article Traceability
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                            <th className="py-2 px-3">Code</th>
                            <th className="py-2 px-3">Research Question / Objective</th>
                            <th className="py-2 px-3 font-mono">Count (%)</th>
                            <th className="py-2 px-3">Traceable Contributing Studies</th>
                          </tr>
                        </thead>
                        <tbody>
                          {descriptive.researchObjectiveContributions.map((rq) => (
                            <tr key={rq.code} className="border-b border-slate-100">
                              <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{rq.code}</td>
                              <td className="py-2.5 px-3 text-slate-800">{rq.question}</td>
                              <td className="py-2.5 px-3 font-mono tabular-nums font-bold">
                                {rq.count} ({rq.percentage}%)
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex flex-wrap gap-1">
                                  {rq.contributingArticleIds.slice(0, 6).map((aid, idx) => (
                                    <button
                                      key={aid}
                                      type="button"
                                      onClick={() => onSelectArticle?.(aid)}
                                      className="text-[11px] px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-indigo-700 hover:bg-indigo-50"
                                      title={rq.contributingTitles[idx]}
                                    >
                                      {aid}
                                    </button>
                                  ))}
                                  {rq.contributingArticleIds.length > 6 && (
                                    <span className="text-[11px] text-slate-500">
                                      +{rq.contributingArticleIds.length - 6} more
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Distributions Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { title: 'Geographic / Country Distribution', rows: descriptive.countryDistribution },
                      { title: 'Research Design Distribution', rows: descriptive.researchDesignDistribution },
                      { title: 'Databases (Included Studies)', rows: descriptive.databaseIncludedDistribution },
                      { title: 'Sensors & Data Sources', rows: descriptive.sensorDistribution },
                      { title: 'Platforms & Systems', rows: descriptive.platformDistribution },
                      { title: 'Outcomes & Performance Types', rows: descriptive.outcomeDistribution },
                    ].map((blk) => (
                      <div key={blk.title} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">{blk.title}</h4>
                        <div className="space-y-1.5 max-h-52 overflow-y-auto">
                          {blk.rows.map((r) => (
                            <div key={r.label} className="flex items-center justify-between text-xs">
                              <span className="text-slate-700 truncate pr-2">{r.label}</span>
                              <span className="font-mono tabular-nums text-slate-900 font-semibold shrink-0">
                                {r.count} ({r.percentage}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. ELIGIBILITY ASSESSMENT & NUMERICAL EXTRACTION */}
              {subTab === 'eligibility' && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Automated Compatibility, Double-Counting Guard & Study Numerical Extraction
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Missing statistics are never fabricated. Inspect compatibility reasons, add verified raw numerical values, or override eligibility explicitly.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingRecord({
                          id: `qse-${project.id}-manual-${Date.now()}`,
                          projectId: project.id,
                          articleId: includedArticles[0]?.id || 'manual-study',
                          studyLabel: 'New Quantitative Study',
                          title: '',
                          year: new Date().getFullYear(),
                          studyClusterId: '',
                          outcomeType: 'primary_outcome',
                          outcomeLabel: 'Primary Outcome',
                          effectMeasure: config.effectMeasure,
                          subgroup: 'Unassigned',
                          studyDesign: 'Experimental Study',
                          units: '',
                          originalData: {},
                          extractionStatus: 'awaiting_numerical_entry',
                          eligibilityStatus: 'excluded_incomplete',
                          eligibilityOverride: 'auto',
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Outcome Row
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="py-2 px-3">Study / Article</th>
                          <th className="py-2 px-3">Cluster ID</th>
                          <th className="py-2 px-3">Measure &amp; Subgroup</th>
                          <th className="py-2 px-3 font-mono">Effect [95% CI]</th>
                          <th className="py-2 px-3">Compatibility Decision &amp; Rationale</th>
                          <th className="py-2 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecords.map((rec) => {
                          const isElig = rec.eligibilityStatus === 'eligible';
                          return (
                            <tr key={rec.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-slate-900">{rec.studyLabel || rec.id}</div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  {rec.articleId} · {rec.pdfPageNumbers ? `p.${rec.pdfPageNumbers}` : 'No page tag'}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                                {rec.studyClusterId || rec.articleId}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-slate-800">{rec.effectMeasure}</div>
                                <div className="text-[11px] text-slate-500">{rec.subgroup}</div>
                              </td>
                              <td className="py-2.5 px-3 font-mono tabular-nums">
                                {rec.displayEffect !== null && rec.displayEffect !== undefined ? (
                                  <span>
                                    {fmtNum(rec.displayEffect, 3)} [{fmtNum(rec.displayCiLow, 2)}, {fmtNum(rec.displayCiHigh, 2)}]
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Awaiting numbers</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 max-w-xs">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    isElig ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                                  }`}
                                >
                                  {rec.eligibilityStatus.replace(/_/g, ' ')}
                                </span>
                                <p className="text-[11px] text-slate-600 mt-1">
                                  {(rec.eligibilityReasons || rec.checksPassed || []).slice(0, 2).join(' · ')}
                                </p>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingRecord(rec)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-white border border-slate-300 rounded hover:bg-slate-50"
                                  >
                                    <Edit3 className="w-3 h-3" /> Numbers
                                  </button>
                                  {rec.eligibilityOverride !== 'approved' ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOverrideEligibility(rec, 'approved')}
                                      className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
                                    >
                                      Approve
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOverrideEligibility(rec, 'auto')}
                                      className="px-2 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded"
                                    >
                                      Auto
                                    </button>
                                  )}
                                  {rec.eligibilityOverride !== 'excluded' && (
                                    <button
                                      type="button"
                                      onClick={() => handleOverrideEligibility(rec, 'excluded')}
                                      className="px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100"
                                    >
                                      Exclude
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 3. META-ANALYSIS & ADVANCED MODELS */}
              {subTab === 'meta' && meta && (
                <div className="space-y-5">
                  {!meta.pooledAvailable || !overall ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                        <ShieldAlert className="w-5 h-5" /> Statistical Pooling Not Executed
                      </div>
                      <p className="text-xs text-amber-800">{meta.reason}</p>
                      <p className="text-xs text-amber-700">
                        Use the <b>Eligibility &amp; Numerical Input</b> tab to enter verified raw metrics (mean/SD/n, 2×2 events, correlations, or effect size + SE) or upload a CSV dataset.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                          <div className="text-[11px] font-bold uppercase text-slate-500">
                            Active Pooled Estimate ({overall.modelType.toUpperCase()} · {overall.estimator})
                          </div>
                          <div className="text-2xl font-bold font-mono tabular-nums text-teal-800 mt-1">
                            {fmtNum(overall.displayPooledEffect, 3)}
                          </div>
                          <div className="text-xs font-mono text-slate-600 mt-1">
                            95% CI [{fmtNum(overall.displayCiLow, 3)}, {fmtNum(overall.displayCiHigh, 3)}] · p={fmtNum(overall.pValue, 4)}
                          </div>
                          {overall.predictionInterval && (
                            <div className="text-[11px] font-mono text-indigo-700 mt-1.5">
                              95% Prediction Interval [{fmtNum(overall.predictionInterval.displayLow, 3)}, {fmtNum(overall.predictionInterval.displayHigh, 3)}]
                            </div>
                          )}
                        </div>

                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                          <div className="text-[11px] font-bold uppercase text-slate-500">
                            Heterogeneity &amp; Consistency
                          </div>
                          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                            I² = {fmtNum(overall.heterogeneity.i2, 1)}%
                          </div>
                          <div className="text-xs font-mono text-slate-600 mt-1">
                            Cochran's Q = {fmtNum(overall.heterogeneity.qStat, 2)} (df={overall.heterogeneity.qDf}, p={fmtNum(overall.heterogeneity.qPvalue, 4)})
                          </div>
                          <div className="text-[11px] font-mono text-slate-600 mt-1">
                            tau² = {fmtNum(overall.heterogeneity.tau2, 4)} · tau = {fmtNum(overall.heterogeneity.tau, 3)}
                          </div>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                          <div className="text-[11px] font-bold uppercase text-slate-500">
                            Fixed vs Random &amp; Publication Bias
                          </div>
                          <div className="text-xs font-mono text-slate-800 mt-1.5">
                            FE: {fmtNum(overall.fixedEffect.displayPooledEffect, 3)} [{fmtNum(overall.fixedEffect.displayCiLow, 2)}, {fmtNum(overall.fixedEffect.displayCiHigh, 2)}]
                          </div>
                          <div className="text-xs font-mono text-slate-800 mt-1">
                            RE: {fmtNum(overall.randomEffects.displayPooledEffect, 3)} [{fmtNum(overall.randomEffects.displayCiLow, 2)}, {fmtNum(overall.randomEffects.displayCiHigh, 2)}]
                          </div>
                          <div className="text-[11px] text-slate-600 mt-2">
                            {meta.publicationBias.eligible
                              ? `Egger p=${fmtNum(meta.publicationBias.eggerPvalue, 3)} · Begg p=${fmtNum(meta.publicationBias.beggPvalue, 3)}`
                              : meta.publicationBias.advisory}
                          </div>
                        </div>
                      </div>

                      {/* Subgroup, Sensitivity, Meta-Regression, Influence */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                            Subgroup Analysis (Q_between = {fmtNum(meta.subgroupAnalysis?.qBetween)}, p = {fmtNum(meta.subgroupAnalysis?.pBetween, 4)})
                          </h4>
                          <table className="w-full text-xs text-left">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500">
                                <th className="py-1.5">Subgroup</th>
                                <th className="py-1.5 font-mono">k</th>
                                <th className="py-1.5 font-mono">Pooled [95% CI]</th>
                                <th className="py-1.5 font-mono">I²</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(meta.subgroupAnalysis?.subgroups || []).map((s) => (
                                <tr key={s.subgroup} className="border-b border-slate-100">
                                  <td className="py-1.5 font-medium text-slate-800">{s.subgroup}</td>
                                  <td className="py-1.5 font-mono">{s.k}</td>
                                  <td className="py-1.5 font-mono">{fmtNum(s.displayPooledEffect, 2)} [{fmtNum(s.displayCiLow, 2)}, {fmtNum(s.displayCiHigh, 2)}]</td>
                                  <td className="py-1.5 font-mono">{fmtNum(s.i2, 1)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                            Leave-One-Out Sensitivity &amp; Influence Diagnostics
                          </h4>
                          <div className="max-h-56 overflow-y-auto">
                            <table className="w-full text-xs text-left">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-500">
                                  <th className="py-1.5">Omitted Study</th>
                                  <th className="py-1.5 font-mono">LOO Pooled</th>
                                  <th className="py-1.5 font-mono">LOO I²</th>
                                  <th className="py-1.5 font-mono">Cook's D / Flag</th>
                                </tr>
                              </thead>
                              <tbody>
                                {meta.sensitivityAnalysis.map((s) => {
                                  const inf = meta.influenceDiagnostics.find((d) => d.id === s.omittedId);
                                  return (
                                    <tr key={s.omittedId} className="border-b border-slate-100">
                                      <td className="py-1.5 text-slate-800">{s.omittedLabel}</td>
                                      <td className="py-1.5 font-mono">{fmtNum(s.displayPooledEffect, 3)}</td>
                                      <td className="py-1.5 font-mono">{fmtNum(s.i2, 1)}%</td>
                                      <td className="py-1.5 font-mono">
                                        {fmtNum(inf?.cooksDistance, 2)}{' '}
                                        {inf?.isOutlier || inf?.isInfluential ? (
                                          <span className="text-amber-700 font-bold">
                                            {inf.isOutlier ? 'Outlier' : 'Influential'}
                                          </span>
                                        ) : null}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      {meta.metaRegression && (
                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                            Weighted Meta-Regression ({meta.metaRegression.moderatorKey})
                          </h4>
                          <p className="text-xs font-mono text-slate-800 mt-1">
                            k={meta.metaRegression.k} · Slope={fmtNum(meta.metaRegression.slope, 4)} (SE={fmtNum(meta.metaRegression.seSlope, 4)}, z={fmtNum(meta.metaRegression.zStat, 2)}, p={fmtNum(meta.metaRegression.pValue, 4)}) · Q_M={fmtNum(meta.metaRegression.qm, 2)} · R² analog={fmtNum(meta.metaRegression.r2Analog, 1)}%
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 4. 8 PUBLICATION SVG VISUALIZATIONS */}
              {subTab === 'visualizations' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="lg:col-span-2">{renderForestPlotSvg()}</div>
                  {renderFunnelPlotSvg()}
                  {renderSubgroupSvg()}
                  {renderHorizontalBarSvg(
                    'years',
                    '3. Publication-Year Distribution',
                    (descriptive?.publicationYearDistribution || []).map((y) => ({
                      label: y.year,
                      value: y.count,
                      extra: `(Orig ${y.originalCount})`,
                    })),
                    '#0284c7'
                  )}
                  {renderHorizontalBarSvg(
                    'geo',
                    '4. Geographic / Country Distribution',
                    (descriptive?.countryDistribution || []).map((c) => ({
                      label: c.label,
                      value: c.count,
                      extra: `(${c.percentage}%)`,
                    })),
                    '#0f766e'
                  )}
                  {renderHorizontalBarSvg(
                    'algorithms',
                    '5. Algorithm Comparison Chart',
                    (descriptive?.algorithmDistribution || []).map((a) => ({
                      label: a.algorithm,
                      value: a.count,
                      extra: a.meanNormalizedScore !== null ? `(Mean ${a.meanNormalizedScore}%)` : '',
                    })),
                    '#4f46e5'
                  )}
                  {renderHorizontalBarSvg(
                    'outcomes',
                    '6. Outcome Distribution Chart',
                    (descriptive?.outcomeDistribution || []).map((o) => ({
                      label: o.label,
                      value: o.count,
                      extra: `(${o.percentage}%)`,
                    })),
                    '#b45309'
                  )}
                  <div className="lg:col-span-2">{renderContributionMatrixSvg()}</div>
                </div>
              )}

              {/* 5. AUDIT TRAIL & REPRODUCIBILITY */}
              {subTab === 'audit' && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        SQLite Evidence Traceability, Software Version &amp; Audit History
                      </h3>
                      <p className="text-xs text-slate-500">
                        Every statistical run, numerical edit, and compatibility override is recorded immutably in SQLite.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        triggerDownload(
                          JSON.stringify({ analysisResult, records, auditData }, null, 2),
                          `${getSlug(project)}-quant-audit.json`,
                          'application/json',
                          'Reproducibility Audit JSON'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      <FileCode className="w-3.5 h-3.5" /> Export Reproducibility JSON
                    </button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <h4 className="text-xs font-bold text-slate-700 uppercase">Statistical Analysis Runs</h4>
                      <div className="max-h-60 overflow-y-auto space-y-1.5">
                        {auditData.runs.map((run: any) => (
                          <div key={run.runId} className="text-xs bg-slate-50 rounded p-2 font-mono">
                            <div>{run.runId} · v{run.softwareVersion} · {run.effectMeasure} ({run.modelType}/{run.estimator})</div>
                            <div className="text-[11px] text-slate-500">
                              k={run.totalStudies} | Pooled={fmtNum(run.pooledEffect)} | I²={fmtNum(run.i2, 1)}% | {run.analysisDate}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <h4 className="text-xs font-bold text-slate-700 uppercase">Audit Trail Events</h4>
                      <div className="max-h-60 overflow-y-auto space-y-1.5">
                        {auditData.auditLog.map((ev: any) => (
                          <div key={ev.id} className="text-xs bg-slate-50 rounded p-2">
                            <span className="font-mono font-bold text-indigo-700">{ev.action}</span>{' '}
                            <span className="text-slate-500">by {ev.actor} · {ev.createdAt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* INLINE NUMERICAL EXTRACTION EDITOR MODAL */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Edit Study Numerical Data &amp; Compatibility Metadata
                </h3>
                <p className="text-xs text-slate-500">Enter exact reported values only (never fabricate missing statistics).</p>
              </div>
              <button type="button" onClick={() => setEditingRecord(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Study Label</label>
                <input
                  type="text"
                  value={editingRecord.studyLabel || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, studyLabel: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Independent Cluster ID (Double-Count Guard)</label>
                <input
                  type="text"
                  value={editingRecord.studyClusterId || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, studyClusterId: e.target.value })}
                  placeholder={editingRecord.articleId}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Effect Measure</label>
                <select
                  value={editingRecord.effectMeasure}
                  onChange={(e) => setEditingRecord({ ...editingRecord, effectMeasure: e.target.value as QuantEffectMeasure })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
                >
                  <option value="SMD">SMD</option>
                  <option value="MD">MD</option>
                  <option value="OR">OR</option>
                  <option value="RR">RR</option>
                  <option value="COR">COR</option>
                  <option value="PROP">PROP</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Subgroup / Outcome Label / Units</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    value={editingRecord.subgroup || ''}
                    onChange={(e) => setEditingRecord({ ...editingRecord, subgroup: e.target.value })}
                    placeholder="Subgroup"
                    className="border border-slate-200 rounded-lg px-2 py-1.5"
                  />
                  <input
                    type="text"
                    value={editingRecord.units || ''}
                    onChange={(e) => setEditingRecord({ ...editingRecord, units: e.target.value })}
                    placeholder="Units"
                    className="border border-slate-200 rounded-lg px-2 py-1.5"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5 text-xs">
              <div className="font-bold text-slate-700">Raw Statistical Inputs ({editingRecord.effectMeasure})</div>
              {(editingRecord.effectMeasure === 'SMD' || editingRecord.effectMeasure === 'MD') && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {(['mean1', 'sd1', 'n1', 'mean2', 'sd2', 'n2'] as const).map((k) => (
                    <div key={k}>
                      <label className="block text-[10px] font-mono text-slate-500">{k}</label>
                      <input
                        type="number"
                        step="any"
                        value={editingRecord.originalData[k] ?? ''}
                        onChange={(e) =>
                          setEditingRecord({
                            ...editingRecord,
                            originalData: {
                              ...editingRecord.originalData,
                              [k]: e.target.value === '' ? null : Number(e.target.value),
                            },
                          })
                        }
                        className="w-full border border-slate-200 rounded px-2 py-1 bg-white font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
              {(editingRecord.effectMeasure === 'OR' || editingRecord.effectMeasure === 'RR') && (
                <div className="grid grid-cols-4 gap-2">
                  {(['events1', 'total1', 'events2', 'total2'] as const).map((k) => (
                    <div key={k}>
                      <label className="block text-[10px] font-mono text-slate-500">{k}</label>
                      <input
                        type="number"
                        step="any"
                        value={editingRecord.originalData[k] ?? ''}
                        onChange={(e) =>
                          setEditingRecord({
                            ...editingRecord,
                            originalData: {
                              ...editingRecord.originalData,
                              [k]: e.target.value === '' ? null : Number(e.target.value),
                            },
                          })
                        }
                        className="w-full border border-slate-200 rounded px-2 py-1 bg-white font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
              {editingRecord.effectMeasure === 'COR' && (
                <div className="grid grid-cols-2 gap-2">
                  {(['r', 'n'] as const).map((k) => (
                    <div key={k}>
                      <label className="block text-[10px] font-mono text-slate-500">{k}</label>
                      <input
                        type="number"
                        step="any"
                        value={editingRecord.originalData[k] ?? ''}
                        onChange={(e) =>
                          setEditingRecord({
                            ...editingRecord,
                            originalData: {
                              ...editingRecord.originalData,
                              [k]: e.target.value === '' ? null : Number(e.target.value),
                            },
                          })
                        }
                        className="w-full border border-slate-200 rounded px-2 py-1 bg-white font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
              {editingRecord.effectMeasure === 'PROP' && (
                <div className="grid grid-cols-2 gap-2">
                  {(['events', 'total'] as const).map((k) => (
                    <div key={k}>
                      <label className="block text-[10px] font-mono text-slate-500">{k}</label>
                      <input
                        type="number"
                        step="any"
                        value={editingRecord.originalData[k] ?? ''}
                        onChange={(e) =>
                          setEditingRecord({
                            ...editingRecord,
                            originalData: {
                              ...editingRecord.originalData,
                              [k]: e.target.value === '' ? null : Number(e.target.value),
                            },
                          })
                        }
                        className="w-full border border-slate-200 rounded px-2 py-1 bg-white font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200">
                {(['effectSize', 'se', 'ciLow', 'ciHigh'] as const).map((k) => (
                  <div key={k}>
                    <label className="block text-[10px] font-mono text-slate-500">Or Direct {k}</label>
                    <input
                      type="number"
                      step="any"
                      value={editingRecord.originalData[k] ?? ''}
                      onChange={(e) =>
                        setEditingRecord({
                          ...editingRecord,
                          originalData: {
                            ...editingRecord.originalData,
                            [k]: e.target.value === '' ? null : Number(e.target.value),
                          },
                        })
                      }
                      className="w-full border border-slate-200 rounded px-2 py-1 bg-white font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">PDF Page Numbers</label>
                <input
                  type="text"
                  value={editingRecord.pdfPageNumbers || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, pdfPageNumbers: e.target.value })}
                  placeholder="e.g. 6, Table 3"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Verified By</label>
                <input
                  type="text"
                  value={editingRecord.verifiedBy || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, verifiedBy: e.target.value })}
                  placeholder="Researcher initials / name"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Supporting Evidence Quote</label>
                <input
                  type="text"
                  value={editingRecord.supportingEvidence || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, supportingEvidence: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditedRecord}
                disabled={isSavingRecord}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50"
              >
                {isSavingRecord ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save &amp; Re-Analyze
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
