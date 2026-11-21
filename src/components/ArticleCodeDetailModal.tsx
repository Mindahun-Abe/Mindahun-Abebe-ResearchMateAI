import React, { useEffect, useState } from 'react';
import { Article, PaperAccessStatus, ReviewProject } from '../types';
import {
  ArticleMatrixAnalysis,
  DATABASE_PROVENANCE_OPTIONS,
  PrismaDiagnosticCode,
} from '../utils/slrDetectionEngine';
import {
  getFrameworkDefinition,
  getProtocolStandardDefinition,
  getReviewTypeDefinition,
} from '../utils/protocolFrameworks';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  Download,
  Edit3,
  ExternalLink,
  FileCheck2,
  Globe,
  Layers,
  MapPin,
  Save,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiService } from '../services/apiService';

interface ArticleCodeDetailModalProps {
  project: ReviewProject;
  article: Article | null;
  analysis: ArticleMatrixAnalysis | null;
  onClose: () => void;
  onUpdateArticle: (updated: Article) => void;
  onSavedToast?: (msg: string) => void;
  onNavigateToScreening?: (articleId: string) => void;
}

export const ArticleCodeDetailModal: React.FC<ArticleCodeDetailModalProps> = ({
  project,
  article,
  analysis,
  onClose,
  onUpdateArticle,
  onSavedToast,
  onNavigateToScreening,
}) => {
  const [notesDraft, setNotesDraft] = useState('');
  const [customDb, setCustomDb] = useState('');
  const [isEditingRecord, setIsEditingRecord] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editAuthors, setEditAuthors] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editJournal, setEditJournal] = useState('');
  const [editDoi, setEditDoi] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editPdfUrl, setEditPdfUrl] = useState('');
  const [editPublisher, setEditPublisher] = useState('');
  const [editAbstract, setEditAbstract] = useState('');

  useEffect(() => {
    if (!article || !analysis) return;
    setNotesDraft(article.codeAnalysisNotes || '');
    const db = analysis.sourceProvenance.database || article.sourceDatabase || 'Other';
    setCustomDb(DATABASE_PROVENANCE_OPTIONS.includes(db as any) ? '' : db);
    setEditTitle(article.title || '');
    setEditAuthors((article.authors || []).join(', '));
    setEditYear(String(article.year || ''));
    setEditJournal(article.journal || '');
    setEditDoi(article.doi || '');
    setEditUrl(article.url || '');
    setEditPdfUrl(article.pdfUrl || article.openAccessUrl || '');
    setEditPublisher(article.publisher || '');
    setEditAbstract(article.abstract || '');
    setIsEditingRecord(false);
  }, [article?.id, analysis?.sourceProvenance.database]);

  if (!article || !analysis) return null;

  const { paperType, sourceProvenance, extracted, codeDetailAnalysis, prismaDiagnostics, geographicAssessment } = analysis;
  const activeFramework = getFrameworkDefinition(project.frameworkType);
  const activeReviewType = getReviewTypeDefinition(project.reviewType);
  const activeProtocolStd = getProtocolStandardDefinition(project);

  const handleTogglePrismaFlag = (code: PrismaDiagnosticCode, currentlyDetected: boolean) => {
    const existing = new Set(article.prismaExclusionFlags || []);
    if (currentlyDetected) {
      // Clear it manually
      existing.delete(code);
      existing.add(`clear:${code}`);
    } else {
      // Force-flag it manually
      existing.delete(`clear:${code}`);
      existing.add(code);
    }
    onUpdateArticle({
      ...article,
      prismaExclusionFlags: Array.from(existing),
    });
  };

  const handleApplyExclusionFromFlags = () => {
    const detected = prismaDiagnostics.flags.filter((f) => f.detected);
    if (detected.length === 0) return;
    const reasonSummary = detected
      .map((f) => (f.notPrimarySubLabel ? `${f.shortLabel} (${f.notPrimarySubLabel})` : f.shortLabel))
      .join('; ');
    onUpdateArticle({
      ...article,
      decision: 'exclude',
      screeningStage: article.screeningStage === 'title_abstract' ? 'title_abstract' : 'excluded',
      decisionReason: reasonSummary,
      prismaExclusionFlags: detected.map((f) => f.code),
    });
    onSavedToast?.(`Marked excluded with PRISMA diagnostics: ${reasonSummary}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 inline-flex items-center gap-1">
                <Code2 className="w-3 h-3" />
                Protocol Coding &amp; Detail Analysis
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  paperType.category === 'Review'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                }`}
              >
                {paperType.category} · {paperType.subType}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Protocol Alignment: {codeDetailAnalysis.protocolAlignmentScore}%
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  prismaDiagnostics.detectedCodes.length > 0
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {prismaDiagnostics.detectedCodes.length > 0
                  ? `${prismaDiagnostics.detectedCodes.length} PRISMA Exclusion Flag(s)`
                  : 'Passes 8 PRISMA Checks'}
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white leading-snug">{article.title}</h3>
            <p className="text-[11px] text-slate-400">
              {article.authors?.join(', ')} ({article.year}) · <span className="italic">{article.journal}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsEditingRecord((v) => !v)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white inline-flex items-center gap-1.5 transition cursor-pointer"
              title="Edit and update stored article metadata in the database"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditingRecord ? 'Cancel Edit' : 'Edit Record'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {isEditingRecord && (
            <div className="bg-slate-950 border border-indigo-700/70 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-indigo-300 text-xs uppercase tracking-wider">
                  Update Stored Article Database Record
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const parsedYear = Number.parseInt(editYear, 10);
                    onUpdateArticle({
                      ...article,
                      title: editTitle.trim() || article.title,
                      authors: editAuthors
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      year: Number.isFinite(parsedYear) ? parsedYear : article.year,
                      journal: editJournal.trim(),
                      doi: editDoi.trim(),
                      url: editUrl.trim(),
                      pdfUrl: editPdfUrl.trim() || undefined,
                      openAccessUrl: editPdfUrl.trim() || article.openAccessUrl,
                      publisher: editPublisher.trim() || undefined,
                      abstract: editAbstract.trim(),
                    });
                    setIsEditingRecord(false);
                    onSavedToast?.('Updated article record in partitioned database.');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Database Update</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">Article Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Authors (comma-separated)</label>
                  <input
                    type="text"
                    value={editAuthors}
                    onChange={(e) => setEditAuthors(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Year</label>
                    <input
                      type="number"
                      value={editYear}
                      onChange={(e) => setEditYear(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">DOI</label>
                    <input
                      type="text"
                      value={editDoi}
                      onChange={(e) => setEditDoi(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Journal / Venue</label>
                  <input
                    type="text"
                    value={editJournal}
                    onChange={(e) => setEditJournal(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Publisher</label>
                  <input
                    type="text"
                    value={editPublisher}
                    onChange={(e) => setEditPublisher(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Article Landing URL</label>
                  <input
                    type="text"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">PDF / Open-Access URL</label>
                  <input
                    type="text"
                    value={editPdfUrl}
                    onChange={(e) => setEditPdfUrl(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">Abstract</label>
                  <textarea
                    rows={3}
                    value={editAbstract}
                    onChange={(e) => setEditAbstract(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}
          {/* Row 0: PRISMA 2020 Protocol Eligibility & 8-Point Exclusion Diagnostics */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {prismaDiagnostics.detectedCodes.length > 0 ? (
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                )}
                <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                  PRISMA 2020 8-Point Screening &amp; Exclusion Diagnostics ({project.discipline || 'Active SLR'})
                </h4>
              </div>

              {prismaDiagnostics.detectedCodes.length > 0 && article.decision !== 'exclude' && (
                <button
                  onClick={handleApplyExclusionFromFlags}
                  className="px-2.5 py-1 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Mark Excluded with Detected Reasons</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {prismaDiagnostics.flags.map((flag) => (
                <div
                  key={flag.code}
                  className={`p-3 rounded-xl border transition flex flex-col justify-between gap-1.5 ${
                    flag.detected
                      ? 'bg-rose-950/30 border-rose-700/70'
                      : 'bg-slate-900/90 border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            flag.detected
                              ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {flag.detected ? 'Flagged' : 'Passed'}
                        </span>
                        <span className="font-semibold text-white text-[11px]">{flag.shortLabel}</span>
                        {flag.notPrimarySubLabel && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono">
                            {flag.notPrimarySubLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300">{flag.reason}</p>
                    </div>
                    <button
                      onClick={() => handleTogglePrismaFlag(flag.code, flag.detected)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700 shrink-0 cursor-pointer"
                      title="Toggle flag override"
                    >
                      {flag.detected ? 'Clear' : 'Flag'}
                    </button>
                  </div>
                  {flag.evidenceSnippet && (
                    <p className="text-[10px] text-slate-400 italic border-t border-slate-800/70 pt-1 truncate" title={flag.evidenceSnippet}>
                      Evidence: {flag.evidenceSnippet}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Multi-Scale Geographic Sensing & Interpretive Outcome */}
            <div
              className={`p-3 rounded-xl border space-y-2 ${
                geographicAssessment.isEligible
                  ? 'bg-teal-950/25 border-teal-800/50'
                  : 'bg-rose-950/30 border-rose-700/60'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-teal-400" />
                  <span>Multi-Scale Geographic Eligibility &amp; Spatial Hierarchy</span>
                </span>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    Scale: {geographicAssessment.detectedScaleLabel}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border font-bold ${
                      geographicAssessment.isEligible
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {geographicAssessment.verdictLabel}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-200">{geographicAssessment.interpretiveSummary}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                {(
                  [
                    ['Watershed', geographicAssessment.hierarchy.watershed],
                    ['Woreda', geographicAssessment.hierarchy.woreda],
                    ['Zonal', geographicAssessment.hierarchy.zonal],
                    ['Regional', geographicAssessment.hierarchy.regional],
                    ['Country', geographicAssessment.hierarchy.country],
                    ['Continental', geographicAssessment.hierarchy.continental],
                    ['Global', geographicAssessment.hierarchy.global],
                  ] as Array<[string, string[] | undefined]>
                )
                  .filter(([, list]) => list && list.length > 0)
                  .map(([tierLabel, list]) => (
                    <span
                      key={tierLabel}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono"
                    >
                      <MapPin className="w-2.5 h-2.5 text-teal-400" />
                      <span>
                        <strong className="text-teal-300">{tierLabel}:</strong> {list!.join(', ')}
                      </span>
                    </span>
                  ))}
              </div>
            </div>
          </div>

          {/* Row 1: Paper Type Detection + Database Provenance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-cyan-400" />
                  Original Research vs Review Detection
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {paperType.confidence}% confidence
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    onUpdateArticle({
                      ...article,
                      paperCategory: 'Original Research',
                      paperSubType: 'Original Empirical Research',
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    paperType.category === 'Original Research'
                      ? 'bg-cyan-600 text-white border-cyan-500'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  Original Research
                </button>
                <button
                  onClick={() =>
                    onUpdateArticle({
                      ...article,
                      paperCategory: 'Review',
                      paperSubType: 'Systematic / Literature Review',
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    paperType.category === 'Review'
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  Review Paper
                </button>
              </div>
              <ul className="space-y-1 text-[11px] text-slate-400 pt-1">
                {paperType.indicators.map((ind, idx) => (
                  <li key={idx}>• {ind}</li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-indigo-400" />
                  Where Article Was Found (Optional)
                </span>
                <span className="text-[10px] text-slate-500">{sourceProvenance.detectedFrom}</span>
              </div>
              <select
                value={
                  DATABASE_PROVENANCE_OPTIONS.includes(sourceProvenance.database as any)
                    ? sourceProvenance.database
                    : 'Other'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'Other') {
                    onUpdateArticle({ ...article, sourceDatabase: customDb.trim() || 'Other' });
                  } else {
                    setCustomDb('');
                    onUpdateArticle({ ...article, sourceDatabase: val });
                  }
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {DATABASE_PROVENANCE_OPTIONS.map((db) => (
                  <option key={db} value={db}>
                    {db}
                  </option>
                ))}
              </select>
              {(!DATABASE_PROVENANCE_OPTIONS.includes(sourceProvenance.database as any) ||
                sourceProvenance.database === 'Other') && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customDb}
                    onChange={(e) => setCustomDb(e.target.value)}
                    placeholder="Optional custom database name..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <button
                    onClick={() =>
                      onUpdateArticle({
                        ...article,
                        sourceDatabase: customDb.trim() || 'Other',
                      })
                    }
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Set
                  </button>
                </div>
              )}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-amber-400" />
                    PRISMA Retrieval / PDF Accessibility Status
                  </span>
                  <select
                    value={article.accessStatus || (article.pdfUrl || article.openAccessUrl || article.fullText ? 'downloadable' : 'needs_institution_confirmation')}
                    onChange={(e) => {
                      const nextStatus = e.target.value as PaperAccessStatus;
                      onUpdateArticle({
                        ...article,
                        accessStatus: nextStatus,
                        institutionConfirmed: nextStatus === 'downloadable' ? article.institutionConfirmed : false,
                      });
                    }}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-white cursor-pointer"
                  >
                    <option value="downloadable">Downloadable / Retrieved PDF</option>
                    <option value="needs_institution_confirmation">Needs Institutional Confirmation</option>
                    <option value="not_accessible">Not Accessible (Report Not Retrieved)</option>
                    <option value="abstract_only">Abstract Only</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-amber-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(article.institutionConfirmed)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        onUpdateArticle({
                          ...article,
                          institutionConfirmed: checked,
                          accessStatus: checked ? 'downloadable' : 'needs_institution_confirmation',
                        });
                      }}
                      className="rounded accent-amber-500 cursor-pointer"
                    />
                    <span>Institutional access confirmed (PRISMA full text retrieved)</span>
                  </label>

                  <div className="flex items-center gap-2">
                    {(article.pdfUrl || article.openAccessUrl) && (
                      <a
                        href={apiService.getProxyPdfDownloadUrl(article.pdfUrl || article.openAccessUrl || '', article.title)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] px-2 py-0.5 rounded bg-emerald-600/90 hover:bg-emerald-500 text-white inline-flex items-center gap-1 font-semibold"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download PDF</span>
                      </a>
                    )}
                    {article.doi && (
                      <a
                        href={article.url || `https://doi.org/${article.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-indigo-400 hover:underline inline-flex items-center gap-1 font-mono"
                      >
                        <span>DOI: {article.doi}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Technical & Code Detail Analysis */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-purple-400" />
              Code, Software, Hardware &amp; Quantitative Parameter Extraction
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-[11px]">
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Software / Code Frameworks</span>
                <span className="text-purple-300 font-semibold">
                  {codeDetailAnalysis.softwareFrameworks.join(', ') ||
                    extracted.softwareTools ||
                    'Not explicitly named in text'}
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Code / Data Repository Links</span>
                <span className="text-cyan-300 font-mono break-all">
                  {codeDetailAnalysis.repositoriesAndLinks.join(' | ') ||
                    extracted.codeRepository ||
                    'No repository URL detected'}
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Hardware / Edge Compute</span>
                <span className="text-emerald-300 font-semibold">
                  {codeDetailAnalysis.hardwareAndCompute.join(', ') ||
                    extracted.hardwareCompute ||
                    'Standard offline / unspecified'}
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Analytical Models / Algorithms</span>
                <span className="text-indigo-300 font-semibold">
                  {extracted.algorithm || 'Not specified'}
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Hyperparameters &amp; Experimental Specs</span>
                <span className="text-slate-200">
                  {codeDetailAnalysis.hyperparametersAndSpecs.join(' · ') ||
                    [extracted.sampleSize, extracted.gsd].filter(Boolean).join(' · ') ||
                    'Not specified'}
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Quantitative Metrics &amp; Region</span>
                <span className="text-emerald-300 font-mono">
                  {[extracted.metrics, extracted.geographicRegion].filter(Boolean).join(' | ') ||
                    'Pending extraction'}
                </span>
              </div>
            </div>

            {codeDetailAnalysis.quantitativeSnippets.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Detected Quantitative Findings &amp; Benchmark Sentences:
                </span>
                {codeDetailAnalysis.quantitativeSnippets.map((snip, i) => (
                  <p key={i} className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 text-[11px] text-slate-300">
                    • {snip}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Row 3: Protocol Framework & Criteria Coding */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-400" />
                {activeFramework.name} Framework &amp; Protocol Coding
              </h4>
              <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold">
                {activeReviewType.name} · {activeProtocolStd.shortBadge}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {codeDetailAnalysis.matchedPicoc.map((p) => (
                <div key={p.dimension} className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-300 text-[11px]">{activeFramework.name} · {p.dimension}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {p.matchedTerms.length > 0 ? p.matchedTerms.join(', ') : 'No direct keyword match'}
                    </span>
                  </div>
                  {p.evidenceSnippet && (
                    <p className="text-[11px] text-slate-300 italic">"{p.evidenceSnippet}"</p>
                  )}
                </div>
              ))}
            </div>

            {codeDetailAnalysis.criteriaCoding.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Protocol Dimension</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Detected Terms</th>
                      <th className="py-2 px-3">Evidence Extract</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {codeDetailAnalysis.criteriaCoding.map((row, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-semibold text-white">{row.dimension}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.status === 'Aligned'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : row.status === 'Partial'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-300">{row.extractedValue}</td>
                        <td className="py-2 px-3 text-slate-400 italic">{row.evidenceQuote || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {codeDetailAnalysis.matchedResearchQuestions.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Research Questions (RQ) Mapping:
                </span>
                {codeDetailAnalysis.matchedResearchQuestions.map((rq) => (
                  <div key={rq.code} className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">
                        <span className="text-indigo-400 font-mono mr-1.5">{rq.code}</span>
                        {rq.question}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-950 text-emerald-300 font-mono text-[10px] shrink-0">
                        {rq.relevanceScore}%
                      </span>
                    </div>
                    {rq.evidenceSnippet && (
                      <p className="text-[11px] text-slate-400 italic">Evidence: "{rq.evidenceSnippet}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Row 4: Editable Code & Synthesis Notes */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span>Reviewer Coding &amp; Detail Analysis Notes (Saved to Review Partition)</span>
            </label>
            <textarea
              rows={3}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Record custom coding notes, parameter observations, equations, or verification comments for this article..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          {onNavigateToScreening ? (
            <button
              onClick={() => {
                const id = article.id;
                onClose();
                onNavigateToScreening(id);
              }}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Open in Screening Workbench
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onUpdateArticle({
                  ...article,
                  sourceDatabase: sourceProvenance.database,
                  paperCategory: paperType.category,
                  paperSubType: paperType.subType,
                  extractedData: extracted,
                  codeAnalysisNotes: notesDraft,
                  prismaExclusionFlags:
                    article.prismaExclusionFlags ?? prismaDiagnostics.detectedCodes,
                });
                onSavedToast?.(`Saved coded analysis & notes for "${article.title.slice(0, 42)}..."`);
                onClose();
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Apply Detected Coding &amp; Save Notes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
