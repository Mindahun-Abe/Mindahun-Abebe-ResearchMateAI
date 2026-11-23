import React, { useMemo, useState } from 'react';
import {
  Article,
  GeographicScaleTier,
  ModuleQaRescanRecord,
  ReviewProject,
  WorkbenchModuleId,
} from '../types';
import {
  analyzeArticleForMatrix,
  ArticleMatrixAnalysis,
  NOT_PRIMARY_SUBTYPE_LABELS,
  NotPrimarySubType,
  PRISMA_DIAGNOSTIC_CATEGORIES,
  PrismaDiagnosticCode,
} from '../utils/slrDetectionEngine';
import { summarizeProjectGeographicOutcomes } from '../utils/geographicSensing';
import {
  ArrowDown,
  Building2,
  Check,
  CheckCircle,
  Code2,
  Database,
  Download,
  Edit3,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  Filter,
  GitFork,
  Globe,
  History,
  Lock,
  MapPin,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { ArticleCodeDetailModal } from './ArticleCodeDetailModal';
import { AutoSaveStatusInfo, ModuleWorkbenchControls } from './ModuleWorkbenchControls';
import { GeographicEligibilitySelector } from './GeographicEligibilitySelector';

interface PrismaDiagramProps {
  project: ReviewProject;
  onUpdateProject?: (updated: ReviewProject) => void;
  onUpdateArticle?: (article: Article) => void;
  onOpenSynthesis?: (mode: 'qualitative' | 'quantitative') => void;
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
  onOpenRecovery?: () => void;
}

export const PrismaDiagram: React.FC<PrismaDiagramProps> = ({
  project,
  onUpdateProject,
  onUpdateArticle,
  onOpenSynthesis,
  autoSaveStatus,
  onResetWorkbenchModule,
  onDirectAddDataFiles,
  onRescanWithQueryQA,
  onDeleteQaEntry,
  onOpenBulkImporter,
  onOpenRecovery,
}) => {
  const [copiedText, setCopiedText] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedDiagnosticFilter, setSelectedDiagnosticFilter] = useState<
    'all' | 'flagged' | 'clean' | 'duplicates' | PrismaDiagnosticCode
  >('all');
  const [selectedNotPrimarySubFilter, setSelectedNotPrimarySubFilter] = useState<
    'all' | NotPrimarySubType
  >('all');
  const [selectedGeoTierFilter, setSelectedGeoTierFilter] = useState<
    'all' | GeographicScaleTier
  >('all');
  const [selectedProtocolFilter, setSelectedProtocolFilter] = useState<
    'all' | 'included' | 'excluded_archived' | 'needs_iteration' | 'has_iterations'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailArticleId, setDetailArticleId] = useState<string | null>(null);
  const [showGeoEditor, setShowGeoEditor] = useState(false);
  const [expandedIterationArticleId, setExpandedIterationArticleId] = useState<string | null>(null);
  const [iterationNoteDrafts, setIterationNoteDrafts] = useState<Record<string, string>>({});

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handlePrismaIterationAction = (
    art: Article,
    targetDecision: 'include' | 'exclude' | 'uncertain',
    prismaStatus: 'included' | 'excluded_archived' | 'needs_iteration',
    defaultReason: string
  ) => {
    if (!onUpdateArticle) return;
    const nowIso = new Date().toISOString();
    const prevList = Array.isArray(art.reviewIterations) ? art.reviewIterations : [];
    const customReason = (iterationNoteDrafts[art.id] || '').trim();
    const resolvedReason = customReason || defaultReason;
    const nextEntry = {
      id: `iter-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      iterationNumber: prevList.length + 1,
      timestamp: nowIso,
      actor: 'Reviewer (PRISMA Protocol)',
      previousDecision: art.decision,
      newDecision: targetDecision,
      prismaStatus,
      reason: resolvedReason,
      stage: targetDecision === 'include' ? 'final_included' : targetDecision === 'exclude' ? 'excluded' : 'full_text',
    };

    onUpdateArticle({
      ...art,
      decision: targetDecision,
      screeningStage:
        targetDecision === 'include'
          ? 'final_included'
          : targetDecision === 'exclude'
          ? 'excluded'
          : 'full_text',
      decisionReason: resolvedReason,
      prismaProtocolStatus: prismaStatus,
      lastReviewedIterationAt: nowIso,
      reviewIterations: [...prevList, nextEntry],
    });
    setIterationNoteDrafts((prev) => ({ ...prev, [art.id]: '' }));
    showToast(
      `Iteration #${nextEntry.iterationNumber} saved (data preserved): "${art.title.slice(0, 38)}..." → ${
        prismaStatus === 'included'
          ? 'Included in PRISMA'
          : prismaStatus === 'excluded_archived'
          ? 'Excluded in PRISMA (Preserved)'
          : 'Queued for Review Iteration'
      }`
    );
  };

  // Precompute protocol-adaptive analysis + 8-point PRISMA diagnostics for all project articles
  const analysisMap = useMemo(() => {
    const map = new Map<string, ArticleMatrixAnalysis>();
    for (const art of project.articles) {
      map.set(art.id, analyzeArticleForMatrix(art, project));
    }
    return map;
  }, [project]);

  const geoOutcomeSummary = useMemo(() => {
    const geoMap = new Map(
      Array.from(analysisMap.entries()).map(([id, analysis]) => [id, analysis.geographicAssessment])
    );
    return summarizeProjectGeographicOutcomes(project, geoMap);
  }, [project, analysisMap]);

  // Compute numbers from actual project articles with Original Research vs Review, Database Provenance, and 8 PRISMA Diagnostic checks
  const liveCounts = useMemo(() => {
    const totalIdentified = project.articles.length;
    const dbCounts: Record<string, number> = {};
    const includedDbCounts: Record<string, number> = {};
    let duplicates = 0;
    const duplicateOverlapPairs: Record<string, number> = {};
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

    // PRISMA 2020 Retrieval & Accessibility tracking
    let retrievalDownloadable = 0;
    let retrievalNeedsInstitution = 0;
    let retrievalInstitutionConfirmed = 0;
    let retrievalNotAccessible = 0;
    let retrievalAbstractOnly = 0;

    const articleById = new Map(project.articles.map((a) => [a.id, a]));

    for (const art of project.articles) {
      const analysis = analysisMap.get(art.id)!;
      const sourceDb = analysis.sourceProvenance.database || 'Other';
      const paperType = analysis.paperType.category;

      dbCounts[sourceDb] = (dbCounts[sourceDb] || 0) + 1;
      if (paperType === 'Review') identifiedReviews++;
      else identifiedOriginal++;

      if (art.isDuplicate) {
        duplicates++;
        const matchedDbs =
          Array.isArray(art.duplicateMatchedDatabases) && art.duplicateMatchedDatabases.length >= 2
            ? [...art.duplicateMatchedDatabases].sort().join(' ↔ ')
            : art.duplicateOfId && articleById.get(art.duplicateOfId)
            ? [articleById.get(art.duplicateOfId)!.sourceDatabase || 'Other', sourceDb].sort().join(' ↔ ')
            : `${sourceDb} (Duplicate)`;
        duplicateOverlapPairs[matchedDbs] = (duplicateOverlapPairs[matchedDbs] || 0) + 1;
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

        const isNotAccFlagged = diag.detectedCodes.includes('not_accessible');
        const isAbsOnlyFlagged = diag.detectedCodes.includes('abstract_only');
        const hasVerifiedDiskPdf = Boolean(
          art.pdfStorage?.storage_status === 'stored_disk' ||
            (art.file_path && art.pdfStorage?.storage_status !== 'missing_binary') ||
            art.fullTextStatusDetails?.pdfAccessible ||
            art.fullTextStatusDetails?.classification === 'pdf_attached_extraction_failed' ||
            art.fullTextStatusDetails?.classification === 'full_text_retrieved'
        );
        if (art.institutionConfirmed) {
          retrievalInstitutionConfirmed++;
          retrievalDownloadable++;
        } else if (hasVerifiedDiskPdf) {
          retrievalDownloadable++;
        } else if (art.accessStatus === 'not_accessible' || isNotAccFlagged) {
          if (art.accessStatus === 'needs_institution_confirmation') {
            retrievalNeedsInstitution++;
          } else {
            retrievalNotAccessible++;
          }
        } else if (art.accessStatus === 'needs_institution_confirmation') {
          retrievalNeedsInstitution++;
        } else if (art.accessStatus === 'abstract_only' || isAbsOnlyFlagged) {
          retrievalAbstractOnly++;
        } else if (
          art.accessStatus === 'downloadable' ||
          Boolean(art.fullText && art.fullText.trim().length > 150) ||
          Boolean(art.pdfUrl || art.openAccessUrl)
        ) {
          retrievalDownloadable++;
        } else {
          retrievalNeedsInstitution++;
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
      duplicateOverlapPairs,
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
      retrievalCounts: {
        downloadable: retrievalDownloadable,
        needsInstitution: retrievalNeedsInstitution,
        institutionConfirmed: retrievalInstitutionConfirmed,
        notAccessible: retrievalNotAccessible,
        abstractOnly: retrievalAbstractOnly,
      },
    };
  }, [project.articles, analysisMap]);

  const filteredAuditArticles = useMemo(() => {
    return project.articles.filter((art) => {
      if (selectedDiagnosticFilter === 'duplicates') {
        if (!art.isDuplicate) return false;
      } else if (art.isDuplicate) {
        return false;
      }

      const analysis = analysisMap.get(art.id)!;
      const diag = analysis.prismaDiagnostics;

      if (selectedDiagnosticFilter === 'flagged' && diag.detectedCodes.length === 0) return false;
      if (selectedDiagnosticFilter === 'clean' && diag.detectedCodes.length > 0) return false;
      if (
        selectedDiagnosticFilter !== 'all' &&
        selectedDiagnosticFilter !== 'flagged' &&
        selectedDiagnosticFilter !== 'clean' &&
        selectedDiagnosticFilter !== 'duplicates'
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

      if (
        selectedGeoTierFilter !== 'all' &&
        analysis.geographicAssessment.detectedScale !== selectedGeoTierFilter
      ) {
        return false;
      }

      if (selectedProtocolFilter !== 'all') {
        if (selectedProtocolFilter === 'included' && art.decision !== 'include') return false;
        if (selectedProtocolFilter === 'excluded_archived' && art.decision !== 'exclude') return false;
        if (
          selectedProtocolFilter === 'needs_iteration' &&
          art.decision !== 'uncertain' &&
          art.prismaProtocolStatus !== 'needs_iteration'
        ) {
          return false;
        }
        if (
          selectedProtocolFilter === 'has_iterations' &&
          !(Array.isArray(art.reviewIterations) && art.reviewIterations.length > 0)
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
          analysis.geographicAssessment.primaryPlaceLabel,
          analysis.geographicAssessment.detectedScaleLabel,
          analysis.geographicAssessment.interpretiveSummary,
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
    selectedGeoTierFilter,
    selectedProtocolFilter,
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

2. DUPLICATE REMOVAL (CROSS-DATABASE OVERLAP)
Duplicates removed prior to screening: n = ${liveCounts.duplicates}
${Object.entries(liveCounts.duplicateOverlapPairs)
  .map(([pair, cnt]) => `  - ${pair}: n = ${cnt}`)
  .join('\n') || '  - None recorded'}

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

3b. MULTI-SCALE GEOGRAPHIC ELIGIBILITY & SPATIAL SCALE REPORT
Target Scope: ${project.geographicEligibility || 'Global'} (Target Scale: ${project.geographicTargetScale || 'Auto-detected'})
Interpretive Outcome: ${geoOutcomeSummary.interpretiveHeadline}
${geoOutcomeSummary.interpretiveNarrative}
Spatial Scale Distribution (Globally -> Continental -> Country -> Regional -> Zonal -> Woreda -> Watershed):
${geoOutcomeSummary.tierBreakdown
  .map(
    (t) =>
      `  - ${t.shortLabel}: n = ${t.count} (${t.percentage}%) · Eligible: ${t.eligibleCount}, Flagged: ${t.mismatchCount}${
        t.topPlaces.length > 0 ? ` | Places: ${t.topPlaces.map((p) => `${p.name} (${p.count})`).join(', ')}` : ''
      }`
  )
  .join('\n')}

4. FULL-TEXT RETRIEVAL & ELIGIBILITY ASSESSMENT
Reports sought for retrieval: n = ${liveCounts.fullTextAssessed}
  - Downloadable / Retrieved Full Text: n = ${liveCounts.retrievalCounts.downloadable} (Institution Confirmed: n = ${liveCounts.retrievalCounts.institutionConfirmed})
  - Needs Institutional Confirmation: n = ${liveCounts.retrievalCounts.needsInstitution}
  - Reports Not Retrieved / Not Accessible: n = ${liveCounts.retrievalCounts.notAccessible}
  - Abstract-Only Records: n = ${liveCounts.retrievalCounts.abstractOnly}
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
      'Retrieval / Access Status',
      'Institution Confirmed',
      'Protocol Alignment (%)',
      'Not Relevant to Topic',
      'Not Primary Research',
      'Not Primary Sub-Type',
      'Not-English Language',
      'Wrong Study Area',
      'Detected Geographic Scale',
      'Detected Study Place / Hierarchy',
      'Geographic Eligibility Verdict',
      'Geographic Interpretive Outcome',
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
        const geo = analysis.geographicAssessment;
        const flagMap = Object.fromEntries(diag.flags.map((f) => [f.code, f.detected ? 'YES' : 'No']));
        const derivedAccessStatus = art.institutionConfirmed
          ? 'downloadable (institution_confirmed)'
          : art.accessStatus || (flagMap.not_accessible === 'YES' ? 'not_accessible' : flagMap.abstract_only === 'YES' ? 'abstract_only' : art.pdfUrl || art.openAccessUrl || art.fullText ? 'downloadable' : 'needs_institution_confirmation');
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
          csvCell(derivedAccessStatus),
          csvCell(art.institutionConfirmed ? 'YES' : 'No'),
          csvCell(analysis.codeDetailAnalysis.protocolAlignmentScore),
          csvCell(flagMap.not_relevant_topic),
          csvCell(flagMap.not_primary_research),
          csvCell(diag.notPrimarySubLabel || ''),
          csvCell(flagMap.not_english),
          csvCell(flagMap.wrong_study_area),
          csvCell(geo.detectedScaleLabel),
          csvCell(geo.primaryPlaceLabel),
          csvCell(geo.verdictLabel),
          csvCell(geo.interpretiveSummary),
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
      <ModuleWorkbenchControls
        project={project}
        moduleId="prisma"
        moduleLabel="PRISMA 2020 Flow & Diagnostics"
        autoSaveStatus={autoSaveStatus}
        resetFieldsLabel="Clear PRISMA Exclusion Flags"
        deleteModes={['excluded', 'duplicates', 'uncertain']}
        onResetModule={onResetWorkbenchModule}
        onAddDataFiles={onDirectAddDataFiles}
        onOpenBulkImporter={onOpenBulkImporter}
        onRescanQueryQA={onRescanWithQueryQA}
        onDeleteQaEntry={onDeleteQaEntry}
      />
      {project.workbenchState?.protocolBuilder?.activeProtocol && (() => {
        const activeProto = project.workbenchState.protocolBuilder!.activeProtocol!;
        const executedCount = (activeProto.databaseSearchStrategies || []).filter((s) => s.executedByResearcher).length;
        return (
          <div className="bg-indigo-950/60 border border-indigo-500/30 rounded-xl px-4 py-3 text-xs text-indigo-100 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-bold text-white">
                Protocol v{activeProto.versionNumber} ({activeProto.reviewMethodRecommendation.reportingGuideline})
              </span>
              <span className="mx-2 text-indigo-300">·</span>
              <span>
                Planned Search Databases: {(activeProto.databaseSearchStrategies || []).length} ({executedCount} researcher-executed)
              </span>
              <span className="mx-2 text-indigo-300">·</span>
              <span className="text-indigo-200">
                PRISMA flow counts below strictly reflect actual screened library records (never inferred from protocol).
              </span>
            </div>
          </div>
        );
      })()}
      {project.workbenchState?.recovery?.prismaHistoricalLog && (
        <div className="bg-slate-900 border border-teal-500/30 rounded-xl px-4 py-3 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-teal-300">
              Verified PRISMA Historical Log Linked
            </span>
            <span className="mx-2 text-slate-500">·</span>
            <span className="font-mono tabular-nums text-slate-300">
              Last Reconciled: {project.workbenchState.recovery.lastReconciledAt ? new Date(project.workbenchState.recovery.lastReconciledAt).toLocaleString() : 'Active'}
            </span>
            {(project.workbenchState.recovery.prismaHistoricalLog.verifiedByResearcher ||
              project.workbenchState.recovery.prismaHistoricalLog.lastVerifiedAt) && (
              <>
                <span className="mx-2 text-slate-500">·</span>
                <span className="text-emerald-300">
                  Confirmed by Researcher
                  {project.workbenchState.recovery.prismaHistoricalLog.lastVerifiedAt
                    ? ` (${new Date(project.workbenchState.recovery.prismaHistoricalLog.lastVerifiedAt).toLocaleDateString()})`
                    : ''}
                </span>
              </>
            )}
          </div>
          {onOpenRecovery && (
            <button
              type="button"
              onClick={onOpenRecovery}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-teal-300 font-semibold transition cursor-pointer"
            >
              Inspect Recovery &amp; PRISMA Reconciliation
            </button>
          )}
        </div>
      )}
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
          {onOpenRecovery && (
            <button
              type="button"
              onClick={onOpenRecovery}
              className="px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-teal-500/40 text-teal-300 rounded-lg transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Recover Provenance &amp; Reconcile PRISMA</span>
            </button>
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

              <div className="md:col-span-4 bg-amber-950/30 border border-amber-800/60 rounded-xl p-4 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">
                    Duplicates Removed
                  </span>
                  {liveCounts.duplicates > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDiagnosticFilter('duplicates');
                        setSelectedNotPrimarySubFilter('all');
                      }}
                      className="text-[10px] font-semibold text-amber-200 underline hover:text-white cursor-pointer"
                    >
                      Inspect Cases
                    </button>
                  )}
                </div>
                <p className="text-sm font-bold text-amber-400 font-mono">
                  n = {liveCounts.duplicates}
                </p>
                {Object.keys(liveCounts.duplicateOverlapPairs).length > 0 ? (
                  <div className="space-y-0.5 pt-1 border-t border-amber-900/40 text-[10px] text-amber-200/85">
                    {Object.entries(liveCounts.duplicateOverlapPairs).map(([pair, cnt]) => (
                      <div key={pair} className="flex justify-between gap-1">
                        <span className="truncate">{pair}</span>
                        <span className="font-mono font-bold shrink-0">n = {cnt}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-200/70 mt-1">
                    Cross-database duplicate records automatically tracked &amp; reported.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-center my-2 text-indigo-400">
              <ArrowDown className="w-5 h-5 animate-pulse" />
            </div>
          </div>

          {/* STAGE 3: TITLE AND ABSTRACT SCREENING + 8-POINT DIAGNOSTIC BREAKDOWN */}
          <div className="relative">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs space-y-2.5">
                <span className="font-bold text-white uppercase tracking-wider text-[11px] block">
                  Reports Sought for Full-Text Retrieval (PRISMA 2020)
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
                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800/80 text-[10px] font-mono">
                  <div className="px-2 py-1 rounded bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 flex justify-between">
                    <span>Downloadable PDF:</span>
                    <strong>n = {liveCounts.retrievalCounts.downloadable}</strong>
                  </div>
                  <div className="px-2 py-1 rounded bg-amber-950/40 border border-amber-800/50 text-amber-300 flex justify-between">
                    <span>Needs Inst. Confirm:</span>
                    <strong>n = {liveCounts.retrievalCounts.needsInstitution}</strong>
                  </div>
                  <div className="px-2 py-1 rounded bg-rose-950/40 border border-rose-800/50 text-rose-300 flex justify-between">
                    <span>Not Accessible:</span>
                    <strong>n = {liveCounts.retrievalCounts.notAccessible}</strong>
                  </div>
                  <div className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 flex justify-between">
                    <span>Abstract Only:</span>
                    <strong>n = {liveCounts.retrievalCounts.abstractOnly}</strong>
                  </div>
                </div>
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

              <div
                onClick={() => onOpenSynthesis?.('qualitative')}
                className={`bg-slate-950/80 p-3 rounded-lg border border-emerald-900/40 ${
                  onOpenSynthesis ? 'cursor-pointer hover:border-indigo-400/60 transition' : ''
                }`}
              >
                <span className="text-slate-400 block text-[11px]">Qualitative Synthesis</span>
                <span className="text-sm font-bold text-white font-mono">
                  n = {liveCounts.includedCount} Studies
                </span>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Extracted into evidence tables &amp; thematic matrix.
                </p>
              </div>

              <div
                onClick={() => onOpenSynthesis?.('quantitative')}
                className={`bg-slate-950/80 p-3 rounded-lg border border-emerald-900/40 ${
                  onOpenSynthesis ? 'cursor-pointer hover:border-teal-400/60 transition' : ''
                }`}
              >
                <span className="text-slate-400 block text-[11px]">Quantitative Synthesis / Meta-Analysis</span>
                <span className="text-sm font-bold text-white font-mono">
                  n = {
                    project.workbenchState?.quantSynthesis?.lastMetaAnalysis?.pooledAvailable
                      ? project.workbenchState.quantSynthesis.lastMetaAnalysis.k
                      : project.articles.filter((a) => a.includedInQuantitativeSynthesis).length
                  } Studies
                </span>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Comparable empirical metrics, forest/funnel plots &amp; FE/RE pooling.
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
            <button
              onClick={() => {
                setSelectedDiagnosticFilter('duplicates');
                setSelectedNotPrimarySubFilter('all');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold border transition cursor-pointer ${
                selectedDiagnosticFilter === 'duplicates'
                  ? 'bg-amber-600 text-white border-amber-500'
                  : 'bg-slate-950 text-amber-300 border-slate-800 hover:border-amber-500/50'
              }`}
            >
              Duplicates ({liveCounts.duplicates})
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

        {/* Multi-Scale Geographic Eligibility & Interpretive PRISMA Outcome Panel */}
        <div className="bg-slate-950 border border-teal-800/60 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Globe className="w-4 h-4 text-teal-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Multi-Scale Geographic Eligibility Sensing (PRISMA Spatial Report)
                </h4>
                <span className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 text-[10px] font-mono">
                  Target: {project.geographicEligibility || 'Global'}
                  {project.geographicTargetScale && project.geographicTargetScale !== 'any'
                    ? ` · ${project.geographicTargetScale.toUpperCase()} tier`
                    : ''}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {geoOutcomeSummary.interpretiveNarrative}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onUpdateProject && (
                <button
                  type="button"
                  onClick={() => setShowGeoEditor((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer border transition ${
                    showGeoEditor
                      ? 'bg-teal-600 text-white border-teal-500'
                      : 'bg-slate-900 hover:bg-slate-800 text-teal-300 border-teal-700/60'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{showGeoEditor ? 'Hide Area & Map Selector' : 'Select Area / Import Map'}</span>
                </button>
              )}
              {selectedGeoTierFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedGeoTierFilter('all')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 text-[11px] font-semibold cursor-pointer"
                >
                  Show All Spatial Scales
                </button>
              )}
            </div>
          </div>

          {showGeoEditor && onUpdateProject && (
            <div className="bg-slate-900/90 border border-teal-700/40 rounded-xl p-3.5">
              <GeographicEligibilitySelector
                compact
                geographicEligibility={project.geographicEligibility || ''}
                geographicTargetScale={project.geographicTargetScale || 'any'}
                geographicSelections={project.geographicSelections}
                studyAreaBoundary={project.studyAreaBoundary}
                onChange={(patch) =>
                  onUpdateProject({
                    ...project,
                    geographicEligibility: patch.geographicEligibility,
                    geographicTargetScale: patch.geographicTargetScale,
                    geographicSelections: patch.geographicSelections,
                    studyAreaBoundary: patch.studyAreaBoundary,
                  })
                }
              />
            </div>
          )}

          {/* Interpretive Verdict Summary Pills */}
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              Eligible Total: n = {geoOutcomeSummary.eligibleCount}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
              Sub-Scale Contained (Watershed/Woreda/Zonal/Regional): n = {geoOutcomeSummary.subscaleContainedCount}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
              Exact / Global Scope: n = {geoOutcomeSummary.exactMatchCount + geoOutcomeSummary.globalScopeCount}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300">
              Out-of-Area / Scale Mismatch: n = {geoOutcomeSummary.outOfAreaCount + geoOutcomeSummary.scaleMismatchCount}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
              Unspecified Locality: n = {geoOutcomeSummary.unspecifiedCount}
            </span>
          </div>

          {/* 8 Spatial Scale Tiers (Globally -> Continental -> Country -> Regional -> Zonal -> Woreda -> Watershed -> Unspecified) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {geoOutcomeSummary.tierBreakdown.map((tierItem) => {
              const isActive = selectedGeoTierFilter === tierItem.tier;
              return (
                <button
                  key={tierItem.tier}
                  type="button"
                  onClick={() =>
                    setSelectedGeoTierFilter(isActive ? 'all' : tierItem.tier)
                  }
                  className={`text-left p-2.5 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                    isActive
                      ? 'bg-teal-950/60 border-teal-400 ring-1 ring-teal-400/40'
                      : tierItem.count > 0
                      ? 'bg-slate-900 border-slate-700 hover:border-teal-500/60'
                      : 'bg-slate-900/40 border-slate-800/80 opacity-75 hover:opacity-100'
                  }`}
                  title={
                    tierItem.topPlaces.length > 0
                      ? `Detected ${tierItem.shortLabel} places: ${tierItem.topPlaces.map((p) => `${p.name} (${p.count})`).join(', ')}`
                      : tierItem.label
                  }
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-bold text-white truncate">
                      {tierItem.shortLabel}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                        tierItem.count > 0
                          ? 'bg-teal-500/20 text-teal-300'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {tierItem.count}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {tierItem.topPlaces.length > 0
                      ? tierItem.topPlaces
                          .slice(0, 2)
                          .map((p) => p.name)
                          .join(', ')
                      : `${tierItem.percentage}% of unique`}
                  </div>
                  {tierItem.mismatchCount > 0 && (
                    <span className="text-[9px] font-mono text-rose-300">
                      {tierItem.mismatchCount} flagged
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & PRISMA Protocol Iteration Filter Bar */}
        <div className="space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400 font-semibold mr-1">PRISMA Decision / Iteration:</span>
              {(
                [
                  { id: 'all', label: 'All Records' },
                  { id: 'included', label: 'PRISMA Included' },
                  { id: 'excluded_archived', label: 'PRISMA Excluded (Preserved)' },
                  { id: 'needs_iteration', label: 'Review Iteration / Uncertain' },
                  { id: 'has_iterations', label: 'Has Iteration Log' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedProtocolFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg font-semibold border transition cursor-pointer ${
                    selectedProtocolFilter === tab.id
                      ? 'bg-teal-600 text-white border-teal-500'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Showing {filteredAuditArticles.length} records (Non-destructive: excluded studies remain archived &amp; inspectable)
            </span>
          </div>

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
                  <th className="py-3 px-3">PRISMA Protocol &amp; Iterations</th>
                  <th className="py-3 px-3">PRISMA Retrieval / Access</th>
                  <th className="py-3 px-3">Detected PRISMA 8-Point Flags</th>
                  <th className="py-3 px-3">Protocol Fit</th>
                  <th className="py-3 px-3 text-right">Detail &amp; Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-950/40">
                {filteredAuditArticles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                      No records match the active PRISMA diagnostic filter.
                    </td>
                  </tr>
                ) : (
                  filteredAuditArticles.map((art) => {
                    const analysis = analysisMap.get(art.id)!;
                    const diag = analysis.prismaDiagnostics;
                    const detectedFlags = diag.flags.filter((f) => f.detected);
                    const effectiveAccess = art.institutionConfirmed
                      ? 'downloadable'
                      : art.accessStatus ||
                        (diag.detectedCodes.includes('not_accessible')
                          ? 'not_accessible'
                          : diag.detectedCodes.includes('abstract_only')
                          ? 'abstract_only'
                          : art.pdfUrl || art.openAccessUrl || art.fullText
                          ? 'downloadable'
                          : 'needs_institution_confirmation');

                    return (
                      <tr key={art.id} className="hover:bg-slate-950/80 transition">
                        <td className="py-3 px-3 max-w-[270px] space-y-1">
                          <p className="font-semibold text-white truncate" title={art.title}>
                            {art.title}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {art.authors?.slice(0, 2).join(', ')} ({art.year}) ·{' '}
                            <span className="italic">{art.journal}</span>
                          </p>
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                                analysis.geographicAssessment.isEligible
                                  ? 'bg-teal-500/10 text-teal-300 border-teal-500/30'
                                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              }`}
                              title={analysis.geographicAssessment.interpretiveSummary}
                            >
                              <MapPin className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate max-w-[190px]">
                                {analysis.geographicAssessment.detectedScaleLabel}:{' '}
                                {analysis.geographicAssessment.primaryPlaceLabel}
                              </span>
                            </span>
                          </div>
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

                        <td className="py-3 px-3 min-w-[230px]">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  art.decision === 'include'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : art.decision === 'exclude'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {art.decision === 'include'
                                  ? 'PRISMA Included'
                                  : art.decision === 'exclude'
                                  ? 'Excluded (Preserved)'
                                  : art.prismaProtocolStatus === 'needs_iteration'
                                  ? 'Review Iteration'
                                  : art.decision}
                              </span>
                              {Array.isArray(art.reviewIterations) && art.reviewIterations.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedIterationArticleId(
                                      expandedIterationArticleId === art.id ? null : art.id
                                    )
                                  }
                                  className="px-1.5 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono inline-flex items-center gap-1 cursor-pointer"
                                  title="Inspect review iteration history"
                                >
                                  <History className="w-2.5 h-2.5" />
                                  Iter #{art.reviewIterations.length}
                                </button>
                              )}
                            </div>

                            {onUpdateArticle && (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handlePrismaIterationAction(
                                        art,
                                        'include',
                                        'included',
                                        'Verified eligible & included in PRISMA protocol'
                                      )
                                    }
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition inline-flex items-center gap-0.5 ${
                                      art.decision === 'include'
                                        ? 'bg-emerald-600 text-white border-emerald-500'
                                        : 'bg-slate-900 hover:bg-emerald-950/60 text-emerald-300 border-slate-700'
                                    }`}
                                    title="Include in PRISMA Protocol"
                                  >
                                    <Check className="w-2.5 h-2.5" /> Include
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handlePrismaIterationAction(
                                        art,
                                        'exclude',
                                        'excluded_archived',
                                        diag.primaryExclusionSummary ||
                                          art.decisionReason ||
                                          'Excluded from PRISMA synthesis (data preserved)'
                                      )
                                    }
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition inline-flex items-center gap-0.5 ${
                                      art.decision === 'exclude'
                                        ? 'bg-rose-600 text-white border-rose-500'
                                        : 'bg-slate-900 hover:bg-rose-950/60 text-rose-300 border-slate-700'
                                    }`}
                                    title="Exclude in PRISMA (never deletes data)"
                                  >
                                    <XCircle className="w-2.5 h-2.5" /> Exclude
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handlePrismaIterationAction(
                                        art,
                                        'uncertain',
                                        'needs_iteration',
                                        'Flagged for next review iteration / team re-check'
                                      )
                                    }
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition inline-flex items-center gap-0.5 ${
                                      art.prismaProtocolStatus === 'needs_iteration' || art.decision === 'uncertain'
                                        ? 'bg-amber-600 text-white border-amber-500'
                                        : 'bg-slate-900 hover:bg-amber-950/60 text-amber-300 border-slate-700'
                                    }`}
                                    title="Send to Review Iteration rather than deleting"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5" /> Iterate
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={iterationNoteDrafts[art.id] || ''}
                                  onChange={(e) =>
                                    setIterationNoteDrafts((prev) => ({
                                      ...prev,
                                      [art.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Optional iteration / exclusion note..."
                                  className="w-full bg-slate-900/90 border border-slate-800 focus:border-indigo-500 rounded px-2 py-0.5 text-[10px] text-slate-200 placeholder:text-slate-600 focus:outline-none"
                                />
                              </div>
                            )}

                            {expandedIterationArticleId === art.id &&
                              Array.isArray(art.reviewIterations) &&
                              art.reviewIterations.length > 0 && (
                                <div className="bg-slate-900 border border-indigo-500/30 rounded-lg p-2 space-y-1 text-[10px]">
                                  <span className="font-bold text-indigo-300 block">
                                    Iteration Audit Log:
                                  </span>
                                  {art.reviewIterations
                                    .slice()
                                    .reverse()
                                    .map((it) => (
                                      <div key={it.id} className="border-t border-slate-800 pt-1 text-slate-300">
                                        <span className="font-mono text-teal-300">#{it.iterationNumber}</span>{' '}
                                        <span>
                                          {it.previousDecision} → <strong>{it.newDecision}</strong>
                                        </span>
                                        <p className="text-slate-400 truncate" title={it.reason}>
                                          {it.reason}
                                        </p>
                                      </div>
                                    ))}
                                </div>
                              )}
                          </div>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                effectiveAccess === 'downloadable'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : effectiveAccess === 'needs_institution_confirmation'
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  : effectiveAccess === 'not_accessible'
                                  ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {effectiveAccess === 'downloadable' && <FileCheck2 className="w-3 h-3" />}
                              {effectiveAccess === 'needs_institution_confirmation' && (
                                <Building2 className="w-3 h-3" />
                              )}
                              {effectiveAccess === 'not_accessible' && <Lock className="w-3 h-3" />}
                              <span>
                                {art.institutionConfirmed
                                  ? 'Inst. Confirmed'
                                  : effectiveAccess === 'downloadable'
                                  ? 'Downloadable PDF'
                                  : effectiveAccess === 'needs_institution_confirmation'
                                  ? 'Needs Inst. Confirm'
                                  : effectiveAccess === 'not_accessible'
                                  ? 'Not Accessible'
                                  : 'Abstract Only'}
                              </span>
                            </span>
                            {onUpdateArticle && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextConfirmed = !art.institutionConfirmed;
                                    onUpdateArticle({
                                      ...art,
                                      institutionConfirmed: nextConfirmed,
                                      accessStatus: nextConfirmed
                                        ? 'downloadable'
                                        : 'needs_institution_confirmation',
                                    });
                                    showToast(
                                      nextConfirmed
                                        ? `Confirmed institutional access for "${art.title.slice(0, 35)}..."`
                                        : `Reset institutional confirmation for "${art.title.slice(0, 35)}..."`
                                    );
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[10px] text-amber-300 border border-slate-800 cursor-pointer"
                                  title="Toggle institutional access confirmation for PRISMA 2020"
                                >
                                  {art.institutionConfirmed ? 'Undo Inst.' : 'Confirm Inst.'}
                                </button>
                                {(art.pdfUrl || art.openAccessUrl) && (
                                  <a
                                    href={art.pdfUrl || art.openAccessUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[10px] text-emerald-300 border border-slate-800 inline-flex items-center gap-0.5"
                                    title="Open PDF / Open-Access source"
                                  >
                                    <ExternalLink className="w-2.5 h-2.5" /> PDF
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
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
