import React, { useMemo, useState } from 'react';
import { Article, ReviewProject } from '../types';
import {
  analyzeArticleForMatrix,
  ArticleMatrixAnalysis,
  NOT_PRIMARY_SUBTYPE_LABELS,
  NotPrimarySubType,
  PRISMA_DIAGNOSTIC_CATEGORIES,
  PrismaDiagnosticCode,
} from '../utils/slrDetectionEngine';
import {
  ArrowDown,
  Check,
  CheckCircle,
  Code2,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Filter,
  GitFork,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { ArticleCodeDetailModal } from './ArticleCodeDetailModal';

interface PrismaDiagramProps {
  project: ReviewProject;
  onUpdateArticle?: (article: Article) => void;
}

export const PrismaDiagram: React.FC<PrismaDiagramProps> = ({ project, onUpdateArticle }) => {
  const [copiedText, setCopiedText] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedDiagnosticFilter, setSelectedDiagnosticFilter] = useState<
    'all' | 'flagged' | 'clean' | PrismaDiagnosticCode
  >('all');
  const [selectedNotPrimarySubFilter, setSelectedNotPrimarySubFilter] = useState<
    'all' | NotPrimarySubType
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailArticleId, setDetailArticleId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Precompute protocol-adaptive analysis + 8-point PRISMA diagnostics for all project articles
  const analysisMap = useMemo(() => {
    const map = new Map<string, ArticleMatrixAnalysis>();
    for (const art of project.articles) {
      map.set(art.id, analyzeArticleForMatrix(art, project));
    }
    return map;
  }, [project]);

  // Compute numbers from actual project articles with Original Research vs Review, Database Provenance, and 8 PRISMA Diagnostic checks
  const liveCounts = useMemo(() => {
    const totalIdentified = project.articles.length;
    const dbCounts: Record<string, number> = {};
    const includedDbCounts: Record<string, number> = {};
    let duplicates = 0;
    let titleAbstractExcluded = 0;
    let fullTextAssessed = 0;
    let fullTextExcluded = 0;
    const exclusionReasonBreakdown: Record<string, number> = {};
    let includedCount = 0;

    let identifiedOriginal = 0;
    let identifiedReviews = 0;
    let screenedOriginal = 0;
    let screenedReviews = 0;
    let includedOriginal = 0;
    let includedReviews = 0;

    const diagnosticCounts: Record<PrismaDiagnosticCode, number> = {
      not_relevant_topic: 0,
      not_primary_research: 0,
      not_english: 0,
      wrong_study_area: 0,
      not_accessible: 0,
      outside_publication_year: 0,
      abstract_only: 0,
      lack_clear_assessment: 0,
    };

    const notPrimarySubCounts: Record<NotPrimarySubType, number> = {
      conference_abstract: 0,
      thesis: 0,
      review_article: 0,
      editorial_letter: 0,
      book_chapter: 0,
    };

    let anyFlaggedCount = 0;
    let cleanPassCount = 0;

    for (const art of project.articles) {
      const analysis = analysisMap.get(art.id)!;
      const sourceDb = analysis.sourceProvenance.database || 'Other';
      const paperType = analysis.paperType.category;

      dbCounts[sourceDb] = (dbCounts[sourceDb] || 0) + 1;
      if (paperType === 'Review') identifiedReviews++;
      else identifiedOriginal++;

      if (art.isDuplicate) {
        duplicates++;
      } else {
        if (paperType === 'Review') screenedReviews++;
        else screenedOriginal++;

        // Aggregate 8-point PRISMA screening diagnostics across non-duplicate screened articles
        const diag = analysis.prismaDiagnostics;
        if (diag.detectedCodes.length > 0) {
          anyFlaggedCount++;
          for (const code of diag.detectedCodes) {
            diagnosticCounts[code] = (diagnosticCounts[code] || 0) + 1;
          }
          if (diag.notPrimarySubType) {
            notPrimarySubCounts[diag.notPrimarySubType] =
              (notPrimarySubCounts[diag.notPrimarySubType] || 0) + 1;
          }
        } else {
          cleanPassCount++;
        }

        if (art.decision === 'exclude') {
          if (art.screeningStage === 'title_abstract') {
            titleAbstractExcluded++;
          } else {
            fullTextExcluded++;
            const reason = art.decisionReason || diag.primaryExclusionSummary || 'Eligibility criteria violation';
            exclusionReasonBreakdown[reason] = (exclusionReasonBreakdown[reason] || 0) + 1;
          }
        } else if (art.decision === 'include') {
          includedCount++;
          fullTextAssessed++;
          includedDbCounts[sourceDb] = (includedDbCounts[sourceDb] || 0) + 1;
          if (paperType === 'Review') includedReviews++;
          else includedOriginal++;
        } else {
          fullTextAssessed++;
        }
      }
    }

    const uniqueScreened = Math.max(0, totalIdentified - duplicates);

    return {
      totalIdentified,
      dbCounts,
      includedDbCounts,
      duplicates,
      uniqueScreened,
      titleAbstractExcluded,
      fullTextAssessed,
      fullTextExcluded,
      exclusionReasonBreakdown,
      includedCount,
      identifiedOriginal,
      identifiedReviews,
      screenedOriginal,
      screenedReviews,
      includedOriginal,
      includedReviews,
      diagnosticCounts,
      notPrimarySubCounts,
      anyFlaggedCount,
      cleanPassCount,
    };
  }, [project.articles, analysisMap]);

  const filteredAuditArticles = useMemo(() => {
    return project.articles.filter((art) => {
      if (art.isDuplicate) return false;
      const analysis = analysisMap.get(art.id)!;
      const diag = analysis.prismaDiagnostics;

      if (selectedDiagnosticFilter === 'flagged' && diag.detectedCodes.length === 0) return false;
      if (selectedDiagnosticFilter === 'clean' && diag.detectedCodes.length > 0) return false;
      if (
        selectedDiagnosticFilter !== 'all' &&
        selectedDiagnosticFilter !== 'flagged' &&
        selectedDiagnosticFilter !== 'clean'
      ) {
        if (!diag.detectedCodes.includes(selectedDiagnosticFilter)) return false;
        if (
          selectedDiagnosticFilter === 'not_primary_research' &&
          selectedNotPrimarySubFilter !== 'all' &&
          diag.notPrimarySubType !== selectedNotPrimarySubFilter
        ) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = [
          art.title,
          (art.authors || []).join(' '),
          art.journal,
          String(art.year),
          analysis.sourceProvenance.database,
          analysis.paperType.category,
          diag.primaryExclusionSummary,
          art.decisionReason || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    project.articles,
    analysisMap,
    selectedDiagnosticFilter,
    selectedNotPrimarySubFilter,
    searchQuery,
  ]);

  const detailArticle = useMemo(
    () => project.articles.find((a) => a.id === detailArticleId) || null,
    [project.articles, detailArticleId]
  );
  const detailAnalysis = useMemo(
    () => (detailArticle ? analysisMap.get(detailArticle.id) || null : null),
    [detailArticle, analysisMap]
  );

  const copyPrismaSummary = () => {
    const summary = `PRISMA 2020 FLOW DIAGRAM & DIAGNOSTIC REPORT
==================================================
Review: ${project.title}
Discipline / Focus: ${project.discipline} | ${project.methodologyFocus}
Eligible Years: ${project.publicationYears} | Geography: ${project.geographicEligibility}

1. IDENTIFICATION
Records identified from databases (n = ${liveCounts.totalIdentified}):
  - Paper Types Identified: Original Research (n = ${liveCounts.identifiedOriginal}) | Review Papers (n = ${liveCounts.identifiedReviews})
${Object.entries(liveCounts.dbCounts)
  .map(([db, count]) => `  - ${db}: n = ${count}`)
  .join('\n')}

2. DUPLICATE REMOVAL
Duplicates removed prior to screening: n = ${liveCounts.duplicates}

3. TITLE & ABSTRACT SCREENING + 8-POINT PROTOCOL DIAGNOSTICS
Records screened: n = ${liveCounts.uniqueScreened} (Original Research: n = ${liveCounts.screenedOriginal}, Reviews: n = ${liveCounts.screenedReviews})
Records excluded at screening: n = ${liveCounts.titleAbstractExcluded}
Protocol Screening Diagnostic Flags Detected (across unique records):
${PRISMA_DIAGNOSTIC_CATEGORIES.map((cat) => {
  const count = liveCounts.diagnosticCounts[cat.code] || 0;
  if (cat.code === 'not_primary_research') {
    const subs = (Object.keys(NOT_PRIMARY_SUBTYPE_LABELS) as NotPrimarySubType[])
      .map((s) => `${NOT_PRIMARY_SUBTYPE_LABELS[s]}: ${liveCounts.notPrimarySubCounts[s] || 0}`)
      .join(', ');
    return `  - ${cat.label}: n = ${count} (${subs})`;
  }
  return `  - ${cat.label}: n = ${count}`;
}).join('\n')}
Records passing all 8 protocol checks: n = ${liveCounts.cleanPassCount}

4. FULL-TEXT ELIGIBILITY ASSESSMENT
Reports sought for retrieval: n = ${liveCounts.fullTextAssessed}
Reports assessed for eligibility: n = ${liveCounts.fullTextAssessed}
Full-text exclusions with explicit reasons (n = ${liveCounts.fullTextExcluded}):
${Object.entries(liveCounts.exclusionReasonBreakdown)
  .map(([reason, count]) => `  - ${reason}: n = ${count}`)
  .join('\n') || '  - None recorded'}

5. INCLUDED IN THE SYSTEMATIC REVIEW
Total included studies: n = ${liveCounts.includedCount}
  - Original Research Papers Included: n = ${liveCounts.includedOriginal}
  - Review Papers Included: n = ${liveCounts.includedReviews}
  - Included Sources Breakdown: ${Object.entries(liveCounts.includedDbCounts).map(([db, c]) => `${db}: ${c}`).join(', ') || 'None'}
  - Studies included in qualitative synthesis: n = ${liveCounts.includedCount}
  - Studies included in quantitative synthesis: n = ${project.articles.filter((a) => a.includedInQuantitativeSynthesis).length}
==================================================`;

    navigator.clipboard.writeText(summary);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  const downloadPrismaAuditCsv = () => {
    const csvCell = (val: unknown) =>
      `"${String(val ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;

    const headers = [
      'Article ID',
      'Title',
      'Year',
      'Journal',
      'Paper Category',
      'Paper Sub-Type',
      'Database Found',
      'Screening Stage',
      'Decision',
      'Protocol Alignment (%)',
      'Not Relevant to Topic',
      'Not Primary Research',
      'Not Primary Sub-Type',
      'Not-English Language',
      'Wrong Study Area',
      'Not Accessible Paper',
      'Outside Publication Year',
      'Abstract-Only Paper',
      'Lack Clear Assessment to Title',
      'Diagnostic Summary',
      'Software / Code Tools',
      'Code Analysis Notes',
    ];

    const rows = project.articles
      .filter((a) => !a.isDuplicate)
      .map((art) => {
        const analysis = analysisMap.get(art.id)!;
        const diag = analysis.prismaDiagnostics;
        const flagMap = Object.fromEntries(diag.flags.map((f) => [f.code, f.detected ? 'YES' : 'No']));
        return [
          csvCell(art.id),
          csvCell(art.title),
          csvCell(art.year),
          csvCell(art.journal),
          csvCell(analysis.paperType.category),
          csvCell(analysis.paperType.subType),
          csvCell(analysis.sourceProvenance.database),
          csvCell(art.screeningStage),
          csvCell(art.decision),
          csvCell(analysis.codeDetailAnalysis.protocolAlignmentScore),
          csvCell(flagMap.not_relevant_topic),
          csvCell(flagMap.not_primary_research),
          csvCell(diag.notPrimarySubLabel || ''),
          csvCell(flagMap.not_english),
          csvCell(flagMap.wrong_study_area),
          csvCell(flagMap.not_accessible),
          csvCell(flagMap.outside_publication_year),
          csvCell(flagMap.abstract_only),
          csvCell(flagMap.lack_clear_assessment),
          csvCell(diag.primaryExclusionSummary),
          csvCell(analysis.extracted.softwareTools || ''),
          csvCell(art.codeAnalysisNotes || ''),
        ].join(',');
      });

    const csvContent = `\uFEFF${[headers.join(','), ...rows].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}-prisma-2020-diagnostics.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${rows.length} screened records to PRISMA 2020 Diagnostic CSV.`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <GitFork className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base sm:text-lg font-bold text-white">PRISMA 2020 Flow Diagram &amp; Screening Diagnostics</h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
              8-Point Protocol Detection Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Tracks database provenance, Original Research vs Review classification, and protocol-adaptive screening exclusions (topic relevance, non-primary research sub-types, non-English, study area, accessibility, year range, abstract-only, and title assessment) with per-article Code &amp; Detail Analysis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {statusMessage && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium">
              <Check className="w-3.5 h-3.5" />
              <span>{statusMessage}</span>
            </span>
          )}
          <button
            onClick={downloadPrismaAuditCsv}
            disabled={liveCounts.uniqueScreened === 0}
            className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export PRISMA Audit CSV</span>
          </button>
          <button
            onClick={copyPrismaSummary}
            className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{copiedText ? 'Copied Summary!' : 'Export PRISMA Counts'}</span>
          </button>
        </div>
      </div>

      {/* Visual PRISMA 2020 Chart */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-6 overflow-x-auto">
        <div className="min-w-[650px] max-w-3xl mx-auto space-y-5">
          {/* STAGE 1: IDENTIFICATION */}
          <div className="relative">
            <div className="bg-slate-900 border-2 border-indigo-500/80 rounded-xl p-4 text-xs shadow-md space-y-3">
              <div className="flex items-center justify-between font-bold text-white uppercase tracking-wider text-xs border-b border-slate-800 pb-2">
                <span className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  Identification: Database Searches &amp; Paper Classification
                </span>
                <span className="text-indigo-400 font-mono text-sm">
                  Total n = {liveCounts.totalIdentified}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-semibold font-mono">
                  Original Research Identified: n = {liveCounts.identifiedOriginal}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold font-mono">
                  Review Papers Identified: n = {liveCounts.identifiedReviews}
                </span>
              </div>

              <div>
                <p className="text-slate-300 font-medium mb-1">
                  Records identified by source database:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                  {Object.entries(liveCounts.dbCounts).map(([db, count]) => (
                    <div key={db} className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block">{db}</span>
                      <span className="font-bold text-white font-mono">n = {count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-center my-2 text-indigo-400">
              <ArrowDown className="w-5 h-5 animate-pulse" />
            </div>
          </div>

          {/* STAGE 2: DUPLICATE REMOVAL */}
          <div className="relative">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs">
                <span className="font-bold uppercase tracking-wider text-[11px] block text-slate-300 mb-1">
                  Records Screened by Title &amp; Abstract
                </span>
                <p className="text-sm font-bold text-emerald-400 font-mono">
                  n = {liveCounts.uniqueScreened}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Original Research: <strong className="text-cyan-300 font-mono">n = {liveCounts.screenedOriginal}</strong> · Reviews: <strong className="text-amber-300 font-mono">n = {liveCounts.screenedReviews}</strong>
                </p>
              </div>

              <div className="md:col-span-4 bg-amber-950/30 border border-amber-800/60 rounded-xl p-4 text-xs">
                <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px] block mb-1">
                  Duplicates Removed
                </span>
                <p className="text-sm font-bold text-amber-400 font-mono">
                  n = {liveCounts.duplicates}
                </p>
                <p className="text-[11px] text-amber-200/70 mt-1">
                  Cross-database duplicate records eliminated.
                </p>
              </div>
            </div>

            <div className="flex justify-center my-2 text-indigo-400">
              <ArrowDown className="w-5 h-5 animate-pulse" />
            </div>
          </div>

          {/* STAGE 3: TITLE AND ABSTRACT SCREENING + 8-POINT DIAGNOSTIC BREAKDOWN */}
          <div className="relative">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
                <span className="font-bold text-white uppercase tracking-wider text-[11px] block">
                  Reports Sought for Full-Text Retrieval
                </span>
                <p className="text-sm font-bold text-indigo-400 font-mono">
                  n = {liveCounts.fullTextAssessed}
                </p>
                <p className="text-[11px] text-slate-400">
                  Passed initial title/abstract screening ·{' '}
                  <span className="text-emerald-300 font-mono">
                    Clean on all 8 checks: n = {liveCounts.cleanPassCount}
                  </span>
                </p>
              </div>

              <div className="md:col-span-5 bg-rose-950/30 border border-rose-800/60 rounded-xl p-4 text-xs space-y-1.5">
                <div className="flex items-center justify-between border-b border-rose-900/50 pb-1">
                  <span className="font-bold text-rose-300 uppercase tracking-wider text-[11px]">
                    Excluded at Screening / Flagged
                  </span>
                  <span className="font-bold text-rose-400 font-mono">
                    n = {liveCounts.titleAbstractExcluded} excl. · {liveCounts.anyFlaggedCount} flagged
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-0.5 text-[10px] text-rose-200/90">
                  {PRISMA_DIAGNOSTIC_CATEGORIES.map((cat) => (
                    <div key={cat.code} className="flex justify-between gap-2">
                      <span className="truncate">{cat.shortLabel}</span>
                      <span className="font-mono font-bold shrink-0">
                        n = {liveCounts.diagnosticCounts[cat.code] || 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-center my-2 text-indigo-400">
              <ArrowDown className="w-5 h-5 animate-pulse" />
            </div>
          </div>

          {/* STAGE 4: FULL-TEXT ELIGIBILITY ASSESSMENT */}
          <div className="relative">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs">
                <span className="font-bold text-white uppercase tracking-wider text-[11px] block mb-1">
                  Full Texts Assessed for Eligibility
                </span>
                <p className="text-sm font-bold text-white font-mono">
                  n = {liveCounts.fullTextAssessed}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Screened against predefined PICOC, methodology, year window ({project.publicationYears}), and study area ({project.geographicEligibility}).
                </p>
              </div>

              <div className="md:col-span-5 bg-rose-950/30 border border-rose-800/60 rounded-xl p-4 text-xs space-y-1.5">
                <div className="flex items-center justify-between border-b border-rose-900/50 pb-1">
                  <span className="font-bold text-rose-300 uppercase tracking-wider text-[11px]">
                    Full-Text Exclusions
                  </span>
                  <span className="font-bold text-rose-400 font-mono">
                    n = {liveCounts.fullTextExcluded}
                  </span>
                </div>
                {Object.keys(liveCounts.exclusionReasonBreakdown).length > 0 ? (
                  <div className="space-y-1 pt-1">
                    {Object.entries(liveCounts.exclusionReasonBreakdown).map(([reason, count]) => (
                      <div key={reason} className="text-[11px] text-rose-200/90 flex justify-between">
                        <span className="truncate pr-2" title={reason}>
                          • {reason}
                        </span>
                        <span className="font-mono font-bold shrink-0">n = {count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-rose-300/60 italic">
                    Exclusions will list specific reasons here.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-center my-2 text-indigo-400">
              <ArrowDown className="w-5 h-5 animate-pulse" />
            </div>
          </div>

          {/* STAGE 5: INCLUDED STUDIES */}
          <div className="bg-gradient-to-r from-emerald-950/60 to-slate-900 border-2 border-emerald-500 rounded-xl p-5 text-xs shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-emerald-900/60 pb-2">
              <span className="flex items-center gap-2 text-sm font-bold text-emerald-300 uppercase tracking-wider">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                Included in the Systematic Review
              </span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                Total n = {liveCounts.includedCount}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-950/80 p-3 rounded-lg border border-emerald-900/40">
                <span className="text-slate-400 block text-[11px] flex items-center gap-1">
                  <FileCheck2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Paper Type Classification</span>
                </span>
                <div className="mt-1 space-y-0.5 font-mono">
                  <div className="flex justify-between text-cyan-300 font-bold">
                    <span>Original Research:</span>
                    <span>n = {liveCounts.includedOriginal}</span>
                  </div>
                  <div className="flex justify-between text-amber-300 font-bold">
                    <span>Review Papers:</span>
                    <span>n = {liveCounts.includedReviews}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-lg border border-emerald-900/40">
                <span className="text-slate-400 block text-[11px]">Qualitative Synthesis</span>
                <span className="text-sm font-bold text-white font-mono">
                  n = {liveCounts.includedCount} Studies
                </span>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Extracted into evidence tables &amp; critical appraisal matrix.
                </p>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-lg border border-emerald-900/40">
                <span className="text-slate-400 block text-[11px]">Quantitative Synthesis / Meta-Analysis</span>
                <span className="text-sm font-bold text-white font-mono">
                  n = {project.articles.filter((a) => a.includedInQuantitativeSynthesis).length} Studies
                </span>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Comparable empirical metrics &amp; benchmarks.
                </p>
              </div>
            </div>

            {Object.keys(liveCounts.includedDbCounts).length > 0 && (
              <div className="bg-slate-950/70 p-3 rounded-lg border border-emerald-900/40 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-slate-400 font-semibold">Included Studies Found In:</span>
                {Object.entries(liveCounts.includedDbCounts).map(([db, c]) => (
                  <span
                    key={db}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-300 font-mono"
                  >
                    {db}: n = {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 8-Point PRISMA Diagnostic Cards & Interactive Per-Article Screening Audit */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <h3 className="text-sm sm:text-base font-bold text-white">
                Protocol-Adaptive PRISMA Exclusion Diagnostics &amp; Code Detail Inspector
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Automatically screens every record against <strong className="text-slate-200">{project.title}</strong> ({project.publicationYears} · {project.geographicEligibility}). Click any category card below to filter records and inspect Code &amp; Detail Analysis.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => {
                setSelectedDiagnosticFilter('all');
                setSelectedNotPrimarySubFilter('all');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold border transition cursor-pointer ${
                selectedDiagnosticFilter === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              All Unique ({liveCounts.uniqueScreened})
            </button>
            <button
              onClick={() => {
                setSelectedDiagnosticFilter('flagged');
                setSelectedNotPrimarySubFilter('all');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold border transition cursor-pointer ${
                selectedDiagnosticFilter === 'flagged'
                  ? 'bg-rose-600 text-white border-rose-500'
                  : 'bg-slate-950 text-rose-300 border-slate-800 hover:border-rose-500/50'
              }`}
            >
              Flagged ({liveCounts.anyFlaggedCount})
            </button>
            <button
              onClick={() => {
                setSelectedDiagnosticFilter('clean');
                setSelectedNotPrimarySubFilter('all');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold border transition cursor-pointer ${
                selectedDiagnosticFilter === 'clean'
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-slate-950 text-emerald-300 border-slate-800 hover:border-emerald-500/50'
              }`}
            >
              Clean Pass ({liveCounts.cleanPassCount})
            </button>
          </div>
        </div>

        {/* 8 PRISMA Diagnostic Category Filter Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRISMA_DIAGNOSTIC_CATEGORIES.map((cat) => {
            const count = liveCounts.diagnosticCounts[cat.code] || 0;
            const active = selectedDiagnosticFilter === cat.code;
            return (
              <button
                key={cat.code}
                onClick={() => {
                  setSelectedDiagnosticFilter(active ? 'all' : cat.code);
                  setSelectedNotPrimarySubFilter('all');
                }}
                className={`text-left p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-2 ${
                  active
                    ? 'bg-rose-950/50 border-rose-500 ring-1 ring-rose-500/40'
                    : count > 0
                    ? 'bg-slate-950 border-rose-900/50 hover:border-rose-500/60'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-white leading-snug">{cat.shortLabel}</span>
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-xs font-bold shrink-0 ${
                      count > 0
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                    }`}
                  >
                    n = {count}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">{cat.description}</p>
              </button>
            );
          })}
        </div>

        {/* Non-Primary Research Sub-Type Breakdown Bar */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-bold text-amber-300 flex items-center gap-1.5 mr-1">
            <Filter className="w-3.5 h-3.5" />
            Not Primary Research Breakdown:
          </span>
          {(Object.keys(NOT_PRIMARY_SUBTYPE_LABELS) as NotPrimarySubType[]).map((subKey) => {
            const subCount = liveCounts.notPrimarySubCounts[subKey] || 0;
            const isSubActive =
              selectedDiagnosticFilter === 'not_primary_research' &&
              selectedNotPrimarySubFilter === subKey;
            return (
              <button
                key={subKey}
                onClick={() => {
                  if (isSubActive) {
                    setSelectedNotPrimarySubFilter('all');
                  } else {
                    setSelectedDiagnosticFilter('not_primary_research');
                    setSelectedNotPrimarySubFilter(subKey);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg font-mono transition border cursor-pointer ${
                  isSubActive
                    ? 'bg-amber-600 text-white border-amber-500'
                    : subCount > 0
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {NOT_PRIMARY_SUBTYPE_LABELS[subKey]}: n = {subCount}
              </button>
            );
          })}
        </div>

        {/* Search & Article Inspection Table */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter PRISMA records by title, author, year, database, or exclusion flag..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  <th className="py-3 px-3">Study / Year</th>
                  <th className="py-3 px-3">Type &amp; Database</th>
                  <th className="py-3 px-3">Decision / Stage</th>
                  <th className="py-3 px-3">Detected PRISMA 8-Point Flags</th>
                  <th className="py-3 px-3">Protocol Fit</th>
                  <th className="py-3 px-3 text-right">Detail &amp; Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-950/40">
                {filteredAuditArticles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                      No records match the active PRISMA diagnostic filter.
                    </td>
                  </tr>
                ) : (
                  filteredAuditArticles.map((art) => {
                    const analysis = analysisMap.get(art.id)!;
                    const diag = analysis.prismaDiagnostics;
                    const detectedFlags = diag.flags.filter((f) => f.detected);

                    return (
                      <tr key={art.id} className="hover:bg-slate-950/80 transition">
                        <td className="py-3 px-3 max-w-[260px]">
                          <p className="font-semibold text-white truncate" title={art.title}>
                            {art.title}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {art.authors?.slice(0, 2).join(', ')} ({art.year}) ·{' '}
                            <span className="italic">{art.journal}</span>
                          </p>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="space-y-1">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                analysis.paperType.category === 'Review'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              }`}
                            >
                              {analysis.paperType.category}
                            </span>
                            <span className="block text-[10px] text-slate-400 font-mono">
                              {analysis.sourceProvenance.database}
                            </span>
                          </div>
                        </td>

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
                          <span className="block text-[10px] text-slate-500 mt-0.5 font-mono">
                            {art.screeningStage}
                          </span>
                        </td>

                        <td className="py-3 px-3 max-w-[300px]">
                          {detectedFlags.length === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <ShieldCheck className="w-3 h-3" />
                              Passes all 8 protocol checks
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {detectedFlags.map((flag) => (
                                <span
                                  key={flag.code}
                                  title={flag.reason}
                                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                >
                                  {flag.notPrimarySubLabel
                                    ? `${flag.shortLabel}: ${flag.notPrimarySubLabel}`
                                    : flag.shortLabel}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono text-[10px] border border-indigo-500/20">
                            {analysis.codeDetailAnalysis.protocolAlignmentScore}% match
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => setDetailArticleId(art.id)}
                            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                          >
                            <Code2 className="w-3.5 h-3.5" />
                            <span>Code &amp; Detail Analysis</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Shared Code & Detail Analysis + PRISMA 8-Point Modal */}
      <ArticleCodeDetailModal
        project={project}
        article={detailArticle}
        analysis={detailAnalysis}
        onClose={() => setDetailArticleId(null)}
        onUpdateArticle={(updated) => {
          if (onUpdateArticle) {
            onUpdateArticle(updated);
          }
        }}
        onSavedToast={showToast}
      />
    </div>
  );
};
