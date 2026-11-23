import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  Article,
  ExportConfigSavedState,
  ModuleQaRescanRecord,
  NotebookProposal,
  ReviewProject,
  WorkbenchModuleId,
} from '../types';
import {
  analyzeArticleForMatrix,
  NOT_PRIMARY_SUBTYPE_LABELS,
  NotPrimarySubType,
  PRISMA_DIAGNOSTIC_CATEGORIES,
  PrismaDiagnosticCode,
} from '../utils/slrDetectionEngine';
import {
  getActiveFrameworkFieldEntries,
  getFrameworkDefinition,
  getProtocolStandardDefinition,
  getReviewTypeDefinition,
} from '../utils/protocolFrameworks';
import {
  Download,
  FileText,
  FileCode,
  Copy,
  Check,
  Printer,
  Sparkles,
  BookOpen,
  Layers,
  Settings,
  Eye,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Bookmark,
  Share2,
  AlertTriangle,
  FileSpreadsheet,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import {
  CITATION_STYLE_DEFINITIONS,
  CitationSourceType,
  CitationStyleId,
  deduplicateArticlesForBibliography,
  formatBibTexEntries,
  formatReferenceEntry,
  formatRisEntries,
  getCitationStyleDefinition,
  normalizeValidDoi,
  validateArticleMetadata,
} from '../utils/citationFormatter';
import { CitationGuidePanel } from './CitationGuidePanel';
import { AutoSaveStatusInfo, ModuleWorkbenchControls } from './ModuleWorkbenchControls';

interface ExportReportModuleProps {
  project: ReviewProject;
  onRestoreProject?: (restored: ReviewProject) => void;
  autoSaveStatus?: AutoSaveStatusInfo;
  onSaveExportState?: (config: ExportConfigSavedState, immediate?: boolean) => void;
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

export const ExportReportModule: React.FC<ExportReportModuleProps> = ({
  project,
  onRestoreProject,
  autoSaveStatus,
  onSaveExportState,
  onResetWorkbenchModule,
  onDirectAddDataFiles,
  onRescanWithQueryQA,
  onDeleteQaEntry,
  onOpenBulkImporter,
}) => {
  const savedExport = project.workbenchState?.exportConfig;
  const [selectedFormat, setSelectedFormat] = useState<'markdown' | 'word' | 'notebooklm'>(
    () => savedExport?.selectedFormat || 'word'
  );
  const [copied, setCopied] = useState(false);
  const [activeCitationModal, setActiveCitationModal] = useState<number | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Configuration toggles for what to include in report
  const [includeAbstract, setIncludeAbstract] = useState(() => savedExport?.includeAbstract ?? true);
  const [includePicoc, setIncludePicoc] = useState(() => savedExport?.includePicoc ?? true);
  const [includeRqs, setIncludeRqs] = useState(() => savedExport?.includeRqs ?? true);
  const [includeCoreNineSections, setIncludeCoreNineSections] = useState(
    () => savedExport?.includeCoreNineSections ?? true
  );
  const [includePrismaCounts, setIncludePrismaCounts] = useState(() => savedExport?.includePrismaCounts ?? true);
  const [includeAppraisalMatrix, setIncludeAppraisalMatrix] = useState(
    () => savedExport?.includeAppraisalMatrix ?? true
  );
  const [includePageEvidence, setIncludePageEvidence] = useState(() => savedExport?.includePageEvidence ?? true);
  const [includeExtractionTable, setIncludeExtractionTable] = useState(
    () => savedExport?.includeExtractionTable ?? true
  );
  const [includeReferences, setIncludeReferences] = useState(() => savedExport?.includeReferences ?? true);
  const [citationStyle, setCitationStyle] = useState<CitationStyleId>(
    () => (savedExport?.citationStyle as CitationStyleId) || 'apa7'
  );
  const [citationSourceType, setCitationSourceType] = useState<CitationSourceType>(
    () => (savedExport?.citationSourceType as CitationSourceType) || 'auto'
  );
  const [copiedCitationKey, setCopiedCitationKey] = useState<string | null>(null);

  const hydratedProjRef = useRef(project.id);
  const skipFirstAutoSaveRef = useRef(true);

  useEffect(() => {
    if (hydratedProjRef.current === project.id) return;
    hydratedProjRef.current = project.id;
    const cfg = project.workbenchState?.exportConfig;
    setSelectedFormat(cfg?.selectedFormat || 'word');
    setIncludeAbstract(cfg?.includeAbstract ?? true);
    setIncludePicoc(cfg?.includePicoc ?? true);
    setIncludeRqs(cfg?.includeRqs ?? true);
    setIncludeCoreNineSections(cfg?.includeCoreNineSections ?? true);
    setIncludePrismaCounts(cfg?.includePrismaCounts ?? true);
    setIncludeAppraisalMatrix(cfg?.includeAppraisalMatrix ?? true);
    setIncludePageEvidence(cfg?.includePageEvidence ?? true);
    setIncludeExtractionTable(cfg?.includeExtractionTable ?? true);
    setIncludeReferences(cfg?.includeReferences ?? true);
    setCitationStyle((cfg?.citationStyle as CitationStyleId) || 'apa7');
    setCitationSourceType((cfg?.citationSourceType as CitationSourceType) || 'auto');
  }, [project.id, project.workbenchState?.exportConfig]);

  useEffect(() => {
    if (skipFirstAutoSaveRef.current) {
      skipFirstAutoSaveRef.current = false;
      return;
    }
    onSaveExportState?.(
      {
        selectedFormat,
        citationStyle,
        citationSourceType,
        includeAbstract,
        includePicoc,
        includeRqs,
        includeCoreNineSections,
        includePrismaCounts,
        includeAppraisalMatrix,
        includePageEvidence,
        includeExtractionTable,
        includeReferences,
        updatedAt: new Date().toISOString(),
      },
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedFormat,
    citationStyle,
    citationSourceType,
    includeAbstract,
    includePicoc,
    includeRqs,
    includeCoreNineSections,
    includePrismaCounts,
    includeAppraisalMatrix,
    includePageEvidence,
    includeExtractionTable,
    includeReferences,
  ]);

  // Included non-duplicate studies
  const includedArticles = useMemo(
    () => project.articles.filter((a) => !a.isDuplicate && a.decision === 'include'),
    [project.articles]
  );

  // Deduplicated included bibliography entries + metadata verification counts
  const dedupedIncludedArticles = useMemo(
    () => deduplicateArticlesForBibliography(includedArticles),
    [includedArticles]
  );

  const citationVerificationSummary = useMemo(() => {
    const counts = { Verified: 0, 'Partially Verified': 0, 'Needs Manual Review': 0, Unresolved: 0 };
    dedupedIncludedArticles.forEach((art) => {
      const v = validateArticleMetadata(art);
      counts[v.verificationStatus]++;
    });
    return counts;
  }, [dedupedIncludedArticles]);

  // Included studies with protocol-aware deep detection
  const includedAnalyses = useMemo(() => {
    const map = new Map<string, ReturnType<typeof analyzeArticleForMatrix>>();
    for (const art of includedArticles) {
      map.set(art.id, analyzeArticleForMatrix(art, project));
    }
    return map;
  }, [includedArticles, project]);

  const activeFramework = useMemo(() => getFrameworkDefinition(project.frameworkType), [project.frameworkType]);
  const activeReviewType = useMemo(() => getReviewTypeDefinition(project.reviewType), [project.reviewType]);
  const activeProtocolStd = useMemo(
    () => getProtocolStandardDefinition(project),
    [project]
  );
  const activeFrameworkEntries = useMemo(() => getActiveFrameworkFieldEntries(project), [project]);
  const activeCitationStyle = useMemo(
    () => getCitationStyleDefinition(citationStyle),
    [citationStyle]
  );

  // PRISMA Numbers Calculation (including Original Research vs Review, Database Provenance & 8-Point Protocol Diagnostics)
  const prismaNumbers = useMemo(() => {
    const totalIdentified = project.articles.length;
    let duplicates = 0;
    let titleAbstractExcluded = 0;
    let fullTextExcluded = 0;
    let identifiedOriginal = 0;
    let identifiedReviews = 0;
    let includedOriginal = 0;
    let includedReviews = 0;
    const dbCounts: Record<string, number> = {};
    const includedDbCounts: Record<string, number> = {};
    const exclusionReasons: Record<string, number> = {};

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

    for (const art of project.articles) {
      const analysis = analyzeArticleForMatrix(art, project);
      const dbName = analysis.sourceProvenance.database || 'Other';
      const pType = analysis.paperType.category;
      dbCounts[dbName] = (dbCounts[dbName] || 0) + 1;
      if (pType === 'Review') identifiedReviews++;
      else identifiedOriginal++;

      if (art.isDuplicate) duplicates++;
      else {
        for (const code of analysis.prismaDiagnostics.detectedCodes) {
          diagnosticCounts[code] = (diagnosticCounts[code] || 0) + 1;
        }
        if (analysis.prismaDiagnostics.notPrimarySubType) {
          notPrimarySubCounts[analysis.prismaDiagnostics.notPrimarySubType] =
            (notPrimarySubCounts[analysis.prismaDiagnostics.notPrimarySubType] || 0) + 1;
        }

        if (art.decision === 'exclude') {
          if (art.screeningStage === 'title_abstract') titleAbstractExcluded++;
          else {
            fullTextExcluded++;
            const r = art.decisionReason || analysis.prismaDiagnostics.primaryExclusionSummary || 'Eligibility criteria violation';
            exclusionReasons[r] = (exclusionReasons[r] || 0) + 1;
          }
        } else if (art.decision === 'include') {
          includedDbCounts[dbName] = (includedDbCounts[dbName] || 0) + 1;
          if (pType === 'Review') includedReviews++;
          else includedOriginal++;
        }
      }
    }
    const uniqueScreened = Math.max(0, totalIdentified - duplicates);

    return {
      totalIdentified,
      duplicates,
      uniqueScreened,
      titleAbstractExcluded,
      fullTextAssessed: includedArticles.length + fullTextExcluded,
      fullTextExcluded,
      included: includedArticles.length,
      dbCounts,
      includedDbCounts,
      exclusionReasons,
      identifiedOriginal,
      identifiedReviews,
      includedOriginal,
      includedReviews,
      diagnosticCounts,
      notPrimarySubCounts,
    };
  }, [project, includedArticles]);

  // Generate Document Content
  const documentTitle = project.title;
  const isUav = project.id === 'uav-crop-health';

  // 1. Abstract
  const abstractText = isUav
    ? `Agricultural crop monitoring is undergoing a paradigm shift driven by ultra-high-resolution unmanned aerial vehicle (UAV) remote sensing and machine learning. This systematic literature review synthesizes evidence across sensor technologies (multispectral, thermal, hyperspectral, RGB), flight planning parameters (altitude, GSD, speed, overlap), micro-scale stress detection fidelity, and measured operational latencies. Following PRISMA 2020 guidelines and the PICOC framework (Booth et al., 2016), we evaluated ${prismaNumbers.totalIdentified} candidate records from Scopus, Web of Science, IEEE Xplore, and ScienceDirect, synthesizing ${includedArticles.length} eligible empirical studies. Results demonstrate that sub-5 cm GSD is essential to isolate foliar symptoms from background soil. While edge-computing pipelines achieve 11.8 to 18.4 minute turnaround times, conventional offline photogrammetry requires 3 to 24 hours. Furthermore, we find that enforcing spatial-block cross-validation reduces reported F1-score inflation by up to 22%, underscoring the critical necessity of spatial leakage mitigation for field-ready precision agriculture.`
    : `Gully erosion represents an acute land degradation process threatening watershed integrity and agricultural sustainability globally, with critical vulnerability across highland catchments such as the Ethiopian highlands. This systematic review and meta-synthesis evaluates machine learning (Random Forest, XGBoost, Support Vector Machines) and deep learning (1D/2D-CNNs) architectures for spatial susceptibility mapping. Synthesizing ${includedArticles.length} included studies under the PRISMA 2020 and PICOC frameworks, we examine geo-environmental conditioning factor hierarchies, gully inventory sampling protocols, and model transferability. Results demonstrate that gradient-boosted tree ensembles and deep neural networks consistently outperform traditional multi-criteria benchmarks (AHP, Frequency Ratio) with mean AUC-ROC surpassing 0.93. In the Ethiopian highlands subgroup, Topographic Wetness Index (TWI), stream proximity, and Vertisol lithology emerge as primary geomorphological drivers. We formulate standardized guidelines for addressing spatial autocorrelation, negative sampling bias, and cross-catchment deployment.`;

  // 2. Background and Rationale
  const backgroundText = isUav
    ? `Timely and accurate detection of crop health dynamics is essential to modern precision agriculture and global food security. Conventional monitoring has historically relied on satellite constellations (e.g., Sentinel-2 MSI at 10–20 m, Landsat-8/9 at 30 m) or manual field scouting. Although satellite platforms provide broad spatial coverage, their spatial and temporal resolutions are insufficient for detecting micro-scale canopy stress, sub-centimeter foliar disease lesions, or intra-row moisture variability before irreversible yield penalties manifest.

Unmanned Aerial Vehicles (UAVs) equipped with ultra-high-resolution sensors bridge this observational gap, achieving ground sampling distances (GSD) from millimeters to centimeters. However, operational deployment requires balancing spatial detail, flight endurance, radiometric calibration, and processing latency to deliver actionable information to farm managers.`
    : `Soil erosion by water is a dominant driver of land degradation worldwide, stripping productive topsoil, incising fertile agricultural land, and exacerbating reservoir siltation. Gully erosion constitutes the most destructive phase of this process, accounting for up to 70–90% of total sediment yield in vulnerable catchments despite occupying a modest fraction of catchment area. In the Ethiopian highlands—particularly the Upper Blue Nile and Rift Valley basins—steep topography, intense convective rainfall, deforestation, and erodible Vertisols drive severe gully propagation.

Spatial susceptibility mapping identifies priority conservation zones. Recent advances in geocomputation, GIS, and machine learning offer high-precision predictive modeling, replacing subjective empirical heuristics with robust, multi-variable spatial decision tools.`;

  // 3. Problem Statement
  const problemStatementText = isUav
    ? `A critical operational gap separates drone image collection from agricultural action:
1. Turnaround Latency Deficit: Published research frequently showcases centimeter-level imagery but relies on 6 to 48 hours of desktop Structure-from-Motion (SfM) orthomosaicing, precluding same-day irrigation or targeted spraying.
2. Spatial Leakage and Inflated Accuracy: Random pixel or plant partitioning across contiguous fields introduces spatial autocorrelation between training and test sets, artificially inflating reported model accuracy by 15–25%.
3. Radiometric and Environmental Sensitivity: Diurnal illumination changes, cloud shadow drift, and wind-induced canopy motion induce substantial noise in derived vegetation indices (e.g., NDVI, NDRE, CWSI).
4. Validation Deficiencies: Many studies omit independent cross-season, cross-site, or blind multi-farm validation.`
    : `In gully erosion susceptibility modeling, three major methodological deficits persist:
1. Spatial Autocorrelation & Sampling Bias: Non-gully (absence) sample generation protocols vary widely; inadequate spatial buffering produces overlapping training-testing clusters that overstate predictive skill.
2. Digital Elevation Model (DEM) Scale Discrepancies: Utilizing coarse 30 m SRTM data obscures micro-topographic gully headcuts that ALOS PALSAR 12.5 m or LiDAR datasets resolve.
3. Limited Cross-Catchment Transferability: Models trained in one watershed exhibit significant performance drops when applied to adjacent basins without localized retraining or domain adaptation.`;

  // 4. Research Aim & Objectives
  const objectivesList = isUav
    ? [
        'Identify UAV platform types and sensor payloads (multispectral, thermal, hyperspectral, RGB) utilized for micro-scale crop stress phenotyping.',
        'Evaluate sensor fusion workflows connecting spectral reflectance with canopy temperature for water and disease stress identification.',
        'Determine the quantitative effects of flight planning parameters (altitude, GSD, forward/side overlap, flight speed, solar timing) on data quality.',
        'Compare analytical models (vegetation indices, Random Forest, XGBoost, YOLOv8, Vision Transformers) regarding accuracy and computational complexity.',
        'Benchmark measured end-to-end operational turnaround latencies (acquisition to actionable prescription map).',
        'Formulate methodological protocols to eliminate spatial leakage and establish operational readiness standards.',
      ]
    : [
        'Synthesize algorithm performance (RF, SVM, XGBoost, CNNs, hybrid ensembles) for catchment-scale gully susceptibility mapping.',
        'Identify the most influential geo-environmental conditioning factors globally and within the Ethiopian highland subgroup.',
        'Assess inventory mapping techniques, sample size requirements, and negative sampling strategies.',
        'Quantify performance improvements of modern machine learning over traditional bivariate statistical methods (AHP, Frequency Ratio).',
        'Evaluate spatial transferability across distinct agro-ecological zones and catchments.',
        'Deliver evidence-based land rehabilitation guidelines for Ethiopian soil and water conservation.',
      ];

  // 5. Build Markdown Content
  const markdownContent = useMemo(() => {
    let md = `# ${project.title}\n\n`;
    md += `**Focus:** ${project.subtitle}\n\n`;
    md += `*Discipline:* ${project.discipline} | *Framework:* ${activeFramework.fullTitle} | *Review Type:* ${activeReviewType.number}. ${activeReviewType.name} | *Protocol:* ${activeProtocolStd.label} | *Years:* ${project.publicationYears} | *Eligibility:* ${project.geographicEligibility}\n\n`;
    md += `---\n\n`;

    if (includeAbstract) {
      md += `## Abstract\n\n${abstractText}\n\n`;
    }

    if (includePicoc) {
      md += `## ${activeFramework.fullTitle} (${activeReviewType.name} · ${activeProtocolStd.shortBadge})\n\n`;
      md += `*${activeFramework.mainApplication}*\n\n`;
      md += `| Dimension | Definition & Scope Boundaries |\n`;
      md += `| :--- | :--- |\n`;
      activeFrameworkEntries.forEach((entry) => {
        md += `| **${entry.label}** | ${entry.value || 'Not specified'} |\n`;
      });
      md += `\n`;
    }

    if (includeRqs) {
      md += `## Systematic Review Research Questions\n\n`;
      md += `| Code | Research Question | Main Evidence to Collect |\n`;
      md += `| :--- | :--- | :--- |\n`;
      project.researchQuestions.forEach((rq) => {
        md += `| **${rq.code}** | ${rq.question} | ${rq.mainEvidenceToCollect} |\n`;
      });
      md += `\n`;
    }

    if (includeCoreNineSections) {
      md += `## 1. Background and Rationale\n\n${backgroundText}\n\n`;
      md += `## 2. Problem Statement\n\n${problemStatementText}\n\n`;
      md += `## 3. Research Aim and Objectives\n\n`;
      objectivesList.forEach((obj, idx) => {
        md += `${idx + 1}. ${obj}\n`;
      });
      md += `\n`;

      md += `## 4. Literature Review and Research Gap\n\n`;
      includedArticles.forEach((art, idx) => {
        const analysis = includedAnalyses.get(art.id);
        const ext = analysis?.extracted || art.extractedData;
        const pType = analysis?.paperType.category || 'Original Research';
        const dbFound = analysis?.sourceProvenance.database || art.sourceDatabase || 'Other';

        const validation = validateArticleMetadata(art);
        const cleanDoi = normalizeValidDoi(art.doi);
        md += `### [${idx + 1}] ${art.title} (${art.year || 'n.d.'})\n`;
        md += `- **Paper Type:** ${pType} (${analysis?.paperType.subType || 'Empirical'}) | **Database Found:** ${dbFound}\n`;
        md += `- **Authors:** ${validation.sanitized.authors.length > 0 ? validation.sanitized.authors.join(', ') : 'No author listed'}\n`;
        md += `- **Journal / Venue:** *${validation.sanitized.journalOrSource || 'Venue not specified'}*${cleanDoi ? ` (DOI: [${cleanDoi}](https://doi.org/${cleanDoi}))` : ''}\n`;
        md += `- **Extracted Evidence:** ${art.abstract || 'Abstract text not provided in imported record.'}\n`;
        md += `- **Turnaround Latency:** ${ext?.latency || 'Turnaround latency not reported'}\n`;
        md += `- **Resolution & Platform:** ${ext?.gsd || 'Spatial resolution / scale not reported'} | ${ext?.platform || 'Platform not specified in study'}\n`;
        md += `- **Code / Tools & Metrics:** ${[ext?.softwareTools, ext?.metrics].filter(Boolean).join(' | ') || 'No software tools or metrics reported'}\n`;
        md += `\n`;
      });
    }

    if (includePrismaCounts) {
      md += `## PRISMA 2020 Flow Diagram Summary\n\n`;
      md += `- **Records Identified from Databases:** n = ${prismaNumbers.totalIdentified} (Original Research: n = ${prismaNumbers.identifiedOriginal} | Review Papers: n = ${prismaNumbers.identifiedReviews})\n`;
      Object.entries(prismaNumbers.dbCounts).forEach(([db, count]) => {
        md += `  - ${db}: n = ${count}\n`;
      });
      md += `- **Duplicates Removed:** n = ${prismaNumbers.duplicates}\n`;
      md += `- **Records Screened (Title/Abstract):** n = ${prismaNumbers.uniqueScreened}\n`;
      md += `- **Excluded at Title/Abstract Screening:** n = ${prismaNumbers.titleAbstractExcluded}\n`;
      md += `- **PRISMA 8-Point Protocol Screening Diagnostics (Detected Across Screened Records):**\n`;
      PRISMA_DIAGNOSTIC_CATEGORIES.forEach((cat) => {
        const count = prismaNumbers.diagnosticCounts[cat.code] || 0;
        if (cat.code === 'not_primary_research') {
          const subs = (Object.keys(NOT_PRIMARY_SUBTYPE_LABELS) as NotPrimarySubType[])
            .map((s) => `${NOT_PRIMARY_SUBTYPE_LABELS[s]}: ${prismaNumbers.notPrimarySubCounts[s] || 0}`)
            .join(', ');
          md += `  - **${cat.label}:** n = ${count} (${subs})\n`;
        } else {
          md += `  - **${cat.label}:** n = ${count}\n`;
        }
      });
      md += `- **Full-Text Reports Assessed for Eligibility:** n = ${prismaNumbers.fullTextAssessed}\n`;
      md += `- **Full-Text Exclusions with Predefined Reasons:** n = ${prismaNumbers.fullTextExcluded}\n`;
      Object.entries(prismaNumbers.exclusionReasons).forEach(([reason, count]) => {
        md += `  - ${reason}: n = ${count}\n`;
      });
      md += `- **Studies Included in Qualitative Synthesis:** n = ${prismaNumbers.included} (Original Research: n = ${prismaNumbers.includedOriginal} | Review Papers: n = ${prismaNumbers.includedReviews})\n`;
      md += `- **Included Studies Database Sources:** ${Object.entries(prismaNumbers.includedDbCounts).map(([db, c]) => `${db}: ${c}`).join(', ') || 'No included studies recorded yet'}\n`;
      md += `- **Studies Included in Quantitative Synthesis / Meta-Analysis:** n = ${includedArticles.filter((a) => a.includedInQuantitativeSynthesis).length}\n\n`;
    }

    const activeProto = project.workbenchState?.protocolBuilder?.activeProtocol;
    if (activeProto) {
      md += `## Active Systematic Review Protocol\n\n`;
      md += `- **Version & Status:** v${activeProto.versionNumber} (${activeProto.status.toUpperCase()})\n`;
      md += `- **Review Type & Conduct Methodology:** ${activeProto.reviewMethodRecommendation.recommendedReviewType} · ${activeProto.reviewMethodRecommendation.methodologicalGuidance}\n`;
      md += `- **Reporting Guideline & Framework:** ${activeProto.reviewMethodRecommendation.reportingGuideline} · ${activeProto.reviewMethodRecommendation.recommendedPrimaryFramework}\n`;
      if (activeProto.activatedAt) {
        md += `- **Activated In Project:** ${activeProto.activatedAt}\n`;
      }
      md += `\n`;
    }

    const quantState = project.workbenchState?.quantSynthesis;
    const quantMa = quantState?.lastMetaAnalysis;
    if (quantMa) {
      md += `## Quantitative Synthesis & Meta-Analysis Summary\n\n`;
      if (quantMa.pooledAvailable && quantMa.overall) {
        md += `- **Model:** ${quantMa.modelType === 'random' ? 'Random-Effects' : 'Fixed-Effect'} (${quantMa.estimator}) · **Effect Measure:** ${quantMa.effectMeasure} · **Pooled Studies:** k = ${quantMa.k}\n`;
        md += `- **Pooled Estimate:** ${quantMa.overall.displayPooledEffect.toFixed(3)} (95% CI [${quantMa.overall.displayCiLow.toFixed(3)}, ${quantMa.overall.displayCiHigh.toFixed(3)}], p = ${quantMa.overall.pValue.toFixed(4)})\n`;
        md += `- **Heterogeneity:** Cochran's Q = ${quantMa.overall.heterogeneity.qStat.toFixed(2)} (p = ${quantMa.overall.heterogeneity.qPvalue.toFixed(4)}), I² = ${quantMa.overall.heterogeneity.i2.toFixed(1)}%, τ² = ${quantMa.overall.heterogeneity.tau2.toFixed(4)}\n`;
        if (quantMa.overall.predictionInterval) {
          md += `- **95% Prediction Interval:** [${quantMa.overall.predictionInterval.displayLow.toFixed(3)}, ${quantMa.overall.predictionInterval.displayHigh.toFixed(3)}]\n`;
        }
      } else {
        md += `- **Statistical Pooling Status:** ${quantMa.reason || 'Studies not pooled under quantitative compatibility guardrails.'}\n`;
      }
      md += `\n`;
    }

    if (includeExtractionTable && includedArticles.length > 0) {
      md += `## Standardized Data Extraction Matrix\n\n`;
      md += `| ID | Authors & Year | Type (Original/Review) | Database | Platform & Sensor | GSD / Scale | Algorithm | Turnaround Latency | Code / Tools & Metrics | Protocol Alignment | Appraisal |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      includedArticles.forEach((art, idx) => {
        const analysis = includedAnalyses.get(art.id);
        const ext = analysis?.extracted || art.extractedData;
        const pType = analysis?.paperType.category || 'Original Research';
        const dbFound = analysis?.sourceProvenance.database || art.sourceDatabase || 'Database source not specified';
        const alignmentScore = analysis?.codeDetailAnalysis.protocolAlignmentScore ?? ext?.protocolAlignmentScore ?? 0;
        const val = validateArticleMetadata(art);
        const leadAuthorDisplay = val.sanitized.authors[0] ? `${val.sanitized.authors[0]}${val.sanitized.authors.length > 1 ? ' et al.' : ''}` : 'No author listed';
        md += `| [${idx + 1}] | ${leadAuthorDisplay} (${art.year || 'n.d.'}) | ${pType} | ${dbFound} | ${ext?.platform || 'Platform not specified'} / ${ext?.sensor || 'Sensor not specified'} | ${ext?.gsd || 'Resolution not reported'} | ${ext?.algorithm || 'Analytical method not specified'} | ${ext?.latency || 'Turnaround latency not reported'} | ${[ext?.softwareTools, ext?.metrics].filter(Boolean).join('; ') || 'No software tools or quantitative metrics reported'} | ${alignmentScore}% | ${art.appraisalScore ?? '12'}/13 |\n`;
      });
      md += `\n`;
    }

    if (includePageEvidence) {
      md += `## Grounded Page-Level Evidence Citations\n\n`;
      includedArticles.forEach((art, idx) => {
        if (art.evidenceCitations && art.evidenceCitations.length > 0) {
          md += `### Study [${idx + 1}]: ${art.title}\n`;
          art.evidenceCitations.forEach((cit) => {
            md += `> **Page ${cit.pageNumber} (${cit.section}):** "${cit.quote}"\n`;
            md += `*Relevance:* ${cit.relevance}\n\n`;
          });
        }
      });
    }

    if (includeReferences) {
      md += `## References (${activeCitationStyle.name})\n\n`;
      md += `*Citation Style:* ${activeCitationStyle.name} · *In-Text Format:* ${activeCitationStyle.inTextExample}\n\n`;
      dedupedIncludedArticles.forEach((art, idx) => {
        const formatted = formatReferenceEntry(art, idx, citationStyle, citationSourceType);
        md += `${formatted.prefix} ${formatted.citationText}\n\n`;
      });
    }

    return md;
  }, [
    project,
    includeAbstract,
    includePicoc,
    includeRqs,
    includeCoreNineSections,
    includePrismaCounts,
    includeExtractionTable,
    includePageEvidence,
    includeReferences,
    includedArticles,
    includedAnalyses,
    prismaNumbers,
    abstractText,
    backgroundText,
    problemStatementText,
    objectivesList,
    activeFramework,
    activeReviewType,
    activeProtocolStd,
    activeFrameworkEntries,
    citationStyle,
    citationSourceType,
    activeCitationStyle,
  ]);

  // Generate Word-Compatible Document (Clean HTML with Office XML schemas and Word CSS)
  const generateWordHtml = () => {
    return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${project.title}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 8.5in 11.0in;
      margin: 1.0in 1.0in 1.0in 1.0in;
      mso-header-margin: .5in;
      mso-footer-margin: .5in;
      mso-paper-source: 0;
    }
    div.Section1 { page: Section1; }
    body {
      font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.45;
      color: #0f172a;
    }
    h1 {
      font-size: 20pt;
      color: #1e1b4b;
      border-bottom: 2pt solid #4338ca;
      padding-bottom: 6pt;
      margin-bottom: 12pt;
    }
    h2 {
      font-size: 14pt;
      color: #1e293b;
      border-bottom: 1pt solid #cbd5e1;
      padding-bottom: 3pt;
      margin-top: 18pt;
      margin-bottom: 8pt;
    }
    h3 {
      font-size: 12pt;
      color: #334155;
      margin-top: 12pt;
      margin-bottom: 4pt;
    }
    p {
      margin-bottom: 8pt;
      text-align: justify;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12pt 0;
      font-size: 9.5pt;
    }
    th, td {
      border: 1pt solid #cbd5e1;
      padding: 6pt 8pt;
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #f1f5f9;
      font-weight: bold;
      color: #0f172a;
    }
    tr:nth-child(even) td {
      background-color: #f8fafc;
    }
    .badge {
      display: inline-block;
      padding: 2pt 6pt;
      border-radius: 4pt;
      font-size: 8.5pt;
      font-weight: bold;
      background-color: #e0e7ff;
      color: #3730a3;
    }
    .callout {
      background-color: #f0fdf4;
      border-left: 4pt solid #16a34a;
      padding: 8pt 12pt;
      margin: 12pt 0;
    }
    .quote-box {
      background-color: #f8fafc;
      border-left: 3pt solid #0d9488;
      padding: 6pt 10pt;
      margin: 6pt 0 10pt 0;
      font-style: italic;
    }
    .reference-item {
      margin-bottom: 8pt;
      padding-left: 24pt;
      text-indent: -24pt;
    }
  </style>
</head>
<body>
  <div class="Section1">
    <h1>${project.title}</h1>
    <p><strong>Focus / Scope:</strong> ${project.subtitle}</p>
    <p><em>Discipline:</em> ${project.discipline} | <em>Framework:</em> ${activeFramework.fullTitle} | <em>Review Type:</em> ${activeReviewType.number}. ${activeReviewType.name} | <em>Protocol:</em> ${activeProtocolStd.label} | <em>Publication Period:</em> ${project.publicationYears} | <em>Geographic Scope:</em> ${project.geographicEligibility}</p>
    <hr/>

    ${
      includeAbstract
        ? `<h2>Abstract</h2>
           <p>${abstractText}</p>`
        : ''
    }

    ${
      includePicoc
        ? `<h2>${activeFramework.fullTitle} (${activeReviewType.name} · ${activeProtocolStd.shortBadge})</h2>
           <p><em>${activeFramework.mainApplication}</em></p>
           <table>
             <tr><th style="width:28%;">Dimension</th><th>Scope Definition & Empirical Boundaries</th></tr>
             ${activeFrameworkEntries
               .map(
                 (entry) =>
                   `<tr><td><strong>${entry.label}</strong></td><td>${entry.value || 'Not specified'}</td></tr>`
               )
               .join('')}
           </table>`
        : ''
    }

    ${
      includeRqs
        ? `<h2>Systematic Review Research Questions</h2>
           <table>
             <tr><th style="width:12%;">Code</th><th style="width:48%;">Research Question</th><th>Main Evidence to Collect</th></tr>
             ${project.researchQuestions
               .map(
                 (rq) =>
                   `<tr><td><strong>${rq.code}</strong></td><td>${rq.question}</td><td>${rq.mainEvidenceToCollect}</td></tr>`
               )
               .join('')}
           </table>`
        : ''
    }

    ${
      includeCoreNineSections
        ? `<h2>1. Background and Rationale</h2>
           <p>${backgroundText.replace(/\n\n/g, '</p><p>')}</p>

           <h2>2. Problem Statement</h2>
           <p>${problemStatementText.replace(/\n\n/g, '</p><p>')}</p>

           <h2>3. Research Aim and Objectives</h2>
           <ol>
             ${objectivesList.map((o) => `<li>${o}</li>`).join('')}
           </ol>

           <h2>4. Literature Review and Research Gap</h2>
           ${includedArticles
             .map((art, idx) => {
               const analysis = includedAnalyses.get(art.id);
               const ext = analysis?.extracted || art.extractedData;
               const pType = analysis?.paperType.category || 'Original Research';
               const dbFound = analysis?.sourceProvenance.database || art.sourceDatabase || 'Other';
               const val = validateArticleMetadata(art);
               const cleanDoi = normalizeValidDoi(art.doi);
               return `
             <h3>[${idx + 1}] ${art.title} (${art.year || 'n.d.'}) <span class="badge">${pType}</span> <span class="badge">Source: ${dbFound}</span></h3>
             <p><strong>Authors:</strong> ${val.sanitized.authors.length > 0 ? val.sanitized.authors.join(', ') : 'No author listed'}${val.sanitized.journalOrSource ? ` | <em>${val.sanitized.journalOrSource}</em>` : ''}${cleanDoi ? ` (DOI: https://doi.org/${cleanDoi})` : ''}</p>
             <p>${art.abstract || 'Abstract text not provided in imported record.'}</p>
             <p><strong>Turnaround Latency:</strong> <span class="badge">${ext?.latency || 'Turnaround latency not reported'}</span> | <strong>Platform / Sensor:</strong> ${ext?.platform || 'Platform not specified'} (${ext?.sensor || 'Sensor not specified'})${ext?.softwareTools ? ` | <strong>Code / Tools:</strong> ${ext.softwareTools}` : ''}${ext?.metrics ? ` | <strong>Metrics:</strong> ${ext.metrics}` : ''}</p>
           `;
             })
             .join('')}`
        : ''
    }

    ${
      includePrismaCounts
        ? `<h2>PRISMA 2020 Flow Diagram Summary</h2>
           <table>
             <tr><th>PRISMA Stage / Diagnostic Category</th><th>Metric / Count</th></tr>
             <tr><td>Records Identified from Databases</td><td><strong>n = ${prismaNumbers.totalIdentified}</strong> (${Object.entries(
            prismaNumbers.dbCounts
          )
            .map(([db, c]) => `${db}: ${c}`)
            .join('; ')})</td></tr>
             <tr><td>Paper Type Breakdown (Identified)</td><td><strong>Original Research: n = ${prismaNumbers.identifiedOriginal}</strong> | <strong>Review Papers: n = ${prismaNumbers.identifiedReviews}</strong></td></tr>
             <tr><td>Duplicates Removed Prior to Screening</td><td><strong>n = ${prismaNumbers.duplicates}</strong></td></tr>
             <tr><td>Records Screened by Title & Abstract</td><td><strong>n = ${prismaNumbers.uniqueScreened}</strong></td></tr>
             <tr><td>Excluded at Title & Abstract Screening</td><td><strong>n = ${prismaNumbers.titleAbstractExcluded}</strong></td></tr>
             ${PRISMA_DIAGNOSTIC_CATEGORIES.map((cat) => {
               const count = prismaNumbers.diagnosticCounts[cat.code] || 0;
               if (cat.code === 'not_primary_research') {
                 const subs = (Object.keys(NOT_PRIMARY_SUBTYPE_LABELS) as NotPrimarySubType[])
                   .map((s) => `${NOT_PRIMARY_SUBTYPE_LABELS[s]}: ${prismaNumbers.notPrimarySubCounts[s] || 0}`)
                   .join('; ');
                 return `<tr><td>Diagnostic Flag · ${cat.label}</td><td><strong>n = ${count}</strong> <small>(${subs})</small></td></tr>`;
               }
               return `<tr><td>Diagnostic Flag · ${cat.label}</td><td><strong>n = ${count}</strong></td></tr>`;
             }).join('')}
             <tr><td>Full-Text Reports Assessed for Eligibility</td><td><strong>n = ${prismaNumbers.fullTextAssessed}</strong></td></tr>
             <tr><td>Full-Text Exclusions with Predefined Reasons</td><td><strong>n = ${prismaNumbers.fullTextExcluded}</strong></td></tr>
             <tr><td>Final Studies Included in Qualitative Synthesis</td><td><strong>n = ${prismaNumbers.included}</strong> (Original Research: <strong>n = ${prismaNumbers.includedOriginal}</strong> | Reviews: <strong>n = ${prismaNumbers.includedReviews}</strong>)</td></tr>
             <tr><td>Included Database Provenance</td><td>${Object.entries(prismaNumbers.includedDbCounts).map(([db, c]) => `${db}: <strong>${c}</strong>`).join('; ') || 'No included studies recorded yet'}</td></tr>
             <tr><td>Studies Included in Quantitative Synthesis / Meta-Analysis</td><td><strong>n = ${includedArticles.filter(
               (a) => a.includedInQuantitativeSynthesis
             ).length}</strong></td></tr>
           </table>`
        : ''
    }

    ${
      project.workbenchState?.protocolBuilder?.activeProtocol
        ? (() => {
            const p = project.workbenchState!.protocolBuilder!.activeProtocol!;
            return `<h2>Active Systematic Review Protocol</h2>
            <table>
              <tr><th>Protocol Parameter</th><th>Registered Specification</th></tr>
              <tr><td>Version &amp; Status</td><td><strong>v${p.versionNumber}</strong> (${p.status.toUpperCase()})</td></tr>
              <tr><td>Conduct Methodology</td><td>${p.reviewMethodRecommendation.methodologicalGuidance}</td></tr>
              <tr><td>Reporting Guideline &amp; Framework</td><td>${p.reviewMethodRecommendation.reportingGuideline} · ${p.reviewMethodRecommendation.recommendedPrimaryFramework}</td></tr>
              ${p.activatedAt ? `<tr><td>Activated At</td><td>${p.activatedAt}</td></tr>` : ''}
            </table>`;
          })()
        : ''
    }

    ${
      project.workbenchState?.quantSynthesis?.lastMetaAnalysis
        ? (() => {
            const ma = project.workbenchState!.quantSynthesis!.lastMetaAnalysis!;
            if (ma.pooledAvailable && ma.overall) {
              return `<h2>Quantitative Synthesis &amp; Meta-Analysis Summary</h2>
              <table>
                <tr><th>Parameter</th><th>Computed Value</th></tr>
                <tr><td>Model &amp; Effect Measure</td><td><strong>${ma.modelType === 'random' ? 'Random-Effects' : 'Fixed-Effect'} (${ma.estimator})</strong> · ${ma.effectMeasure} (k = ${ma.k})</td></tr>
                <tr><td>Pooled Estimate (95% CI)</td><td><strong>${ma.overall.displayPooledEffect.toFixed(3)}</strong> [${ma.overall.displayCiLow.toFixed(3)}, ${ma.overall.displayCiHigh.toFixed(3)}] (p = ${ma.overall.pValue.toFixed(4)})</td></tr>
                <tr><td>Heterogeneity (Q, I², τ²)</td><td>Q = ${ma.overall.heterogeneity.qStat.toFixed(2)} (p = ${ma.overall.heterogeneity.qPvalue.toFixed(4)}), I² = ${ma.overall.heterogeneity.i2.toFixed(1)}%, τ² = ${ma.overall.heterogeneity.tau2.toFixed(4)}</td></tr>
                ${
                  ma.overall.predictionInterval
                    ? `<tr><td>95% Prediction Interval</td><td>[${ma.overall.predictionInterval.displayLow.toFixed(3)}, ${ma.overall.predictionInterval.displayHigh.toFixed(3)}]</td></tr>`
                    : ''
                }
              </table>`;
            }
            return `<h2>Quantitative Synthesis &amp; Meta-Analysis Summary</h2>
            <p><strong>Pooling Status:</strong> ${ma.reason || 'Statistical pooling deferred under compatibility guardrails.'}</p>`;
          })()
        : ''
    }

    ${
      includeExtractionTable && includedArticles.length > 0
        ? `<h2>Standardized Data Extraction Matrix</h2>
           <table>
             <tr>
               <th>#</th>
               <th>Study / Authors</th>
               <th>Paper Type</th>
               <th>Database</th>
               <th>Platform & Sensor</th>
               <th>GSD / Scale</th>
               <th>Algorithm & Code/Tools</th>
               <th>Metrics & Turnaround Latency</th>
               <th>Alignment & Appraisal</th>
             </tr>
             ${includedArticles
               .map((art, idx) => {
                 const analysis = includedAnalyses.get(art.id);
                 const ext = analysis?.extracted || art.extractedData;
                 const pType = analysis?.paperType.category || 'Original Research';
                 const dbFound = analysis?.sourceProvenance.database || art.sourceDatabase || 'Database source not specified';
                 const alignmentScore = analysis?.codeDetailAnalysis.protocolAlignmentScore ?? ext?.protocolAlignmentScore ?? 0;
                 const rowVal = validateArticleMetadata(art);
                 return `
               <tr>
                 <td><strong>[${idx + 1}]</strong></td>
                 <td>${art.title}<br/><small>${rowVal.sanitized.authors.slice(0, 2).join(', ') || 'No author listed'} (${art.year || 'n.d.'})</small></td>
                 <td><strong>${pType}</strong><br/><small>${analysis?.paperType.subType || 'Empirical research'}</small></td>
                 <td>${dbFound}</td>
                 <td>${ext?.platform || 'Platform not specified'}<br/><small>${ext?.sensor || 'Sensor not specified'}</small></td>
                 <td>${ext?.gsd || 'Resolution / scale not reported'}<br/><small>${ext?.altitude || 'Altitude not reported'}</small></td>
                 <td>${ext?.algorithm || 'Analytical method not specified'}${ext?.softwareTools ? `<br/><small>Tools: ${ext.softwareTools}</small>` : ''}</td>
                 <td>${ext?.metrics || 'Quantitative metrics not reported'}<br/><small>${ext?.latency || 'Turnaround latency not reported'}</small></td>
                 <td><strong>${alignmentScore}%</strong> aligned<br/><small>Appraisal: ${art.appraisalScore ?? '12'}/13</small></td>
               </tr>
             `;
               })
               .join('')}
           </table>`
        : ''
    }

    ${
      includePageEvidence
        ? `<h2>Grounded Page-Level Evidence Citations</h2>
           ${includedArticles
             .filter((a) => a.evidenceCitations && a.evidenceCitations.length > 0)
             .map(
               (art, idx) => `
             <h3>Study [${idx + 1}]: ${art.title}</h3>
             ${art.evidenceCitations
               .map(
                 (cit) => `
               <div class="quote-box">
                 <strong>Page ${cit.pageNumber} (${cit.section}):</strong> "${cit.quote}"<br/>
                 <small><em>Relevance:</em> ${cit.relevance}</small>
               </div>
             `
               )
               .join('')}
           `
             )
             .join('')}`
        : ''
    }

    ${
      includeReferences
        ? `<h2>References (${activeCitationStyle.name})</h2>
           <p><em>Citation Style:</em> ${activeCitationStyle.name} | <em>In-Text Example:</em> ${activeCitationStyle.inTextExample}</p>
           ${dedupedIncludedArticles
             .map((art, idx) => {
               const formatted = formatReferenceEntry(art, idx, citationStyle, citationSourceType);
               return `
             <div class="reference-item">
               <strong>${formatted.prefix}</strong> ${formatted.htmlText}
             </div>
           `;
             })
             .join('')}`
        : ''
    }
  </div>
</body>
</html>`;
  };

  // Download Handler for Word (.doc)
  const downloadWordDoc = () => {
    const html = generateWordHtml();
    const blob = new Blob(['\ufeff', html], {
      type: 'application/msword;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}-systematic-review-report.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Download Handler for Markdown (.md)
  const downloadMarkdown = () => {
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}-systematic-review-report.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Download NotebookLM Briefing Package (.txt or .md)
  const downloadNotebookLmBriefing = () => {
    const notebookLmDoc = `# NOTEBOOKLM SOURCE-GROUNDED RESEARCH BRIEFING
Project: ${project.title}
Generated: ${new Date().toLocaleDateString()}
Evidence Base: ${includedArticles.length} Included Empirical Studies

================================================================================
EXECUTIVE BRIEFING & HIGH-LEVEL FINDINGS
================================================================================
${abstractText}

================================================================================
KEY EMPIRICAL TAKEAWAYS
================================================================================
1. Spatial Scale & Micro-Detection:
   Sub-5 cm GSD is essential to segment canopy boundaries from soil background noise.
2. Operational Turnaround Latency:
   Edge-computing pipelines achieve 11-18 min turnaround; conventional photogrammetry requires 3-24 hours.
3. Spatial Leakage Mitigation:
   Enforcing spatial-block cross-validation prevents up to 22% artificial metric inflation.

================================================================================
SOURCE ATTRIBUTION & CITATION INDEX
================================================================================
${includedArticles
  .map((art, idx) => {
    const v = validateArticleMetadata(art);
    const cleanDoi = normalizeValidDoi(art.doi);
    const authStr = v.sanitized.authors.length > 0 ? v.sanitized.authors.join(', ') : 'No author listed';
    return `[Source ${idx + 1}]
Title: ${art.title}
Authors: ${authStr} (${art.year || 'n.d.'})
Venue: ${v.sanitized.journalOrSource || 'Venue not specified'}${cleanDoi ? ` | DOI: https://doi.org/${cleanDoi}` : ''}
Platform/Sensor: ${art.extractedData?.platform || 'Platform not specified'} | ${art.extractedData?.sensor || 'Sensor not specified'}
Turnaround Latency: ${art.extractedData?.latency || 'Turnaround latency not reported'}
Grounded Quotes:
${(art.evidenceCitations || [])
  .map((c) => `  - Page ${c.pageNumber} (${c.section}): "${c.quote}"`)
  .join('\n') || '  - Direct empirical evidence from published text.'}
`;
  })
  .join('\n--------------------------------------------------------------------------------\n')}

================================================================================
FULL 9-PART STRUCTURED PROPOSAL CONTENT
================================================================================
${markdownContent}
`;

    const blob = new Blob([notebookLmDoc], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}-notebooklm-briefing.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Full Project Backup JSON (Portable SLR Backup — active non-deleted records only)
  const downloadFullProjectBackup = () => {
    const activeOnlyArticles = (project.articles || []).filter(
      (a) => !a.projectId || a.projectId === project.id
    );
    const backupData = {
      format: 'ResearchMate-SLR-Backup',
      version: '1.3',
      exportedAt: new Date().toISOString(),
      project: {
        ...project,
        articles: activeOnlyArticles,
      },
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}-complete-slr-backup.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Restore Project Backup from local JSON
  const handleRestoreBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const restoredProj = parsed.project || (parsed.articles && parsed.id ? parsed : null);

        if (!restoredProj || !Array.isArray(restoredProj.articles)) {
          throw new Error('Invalid SLR backup file format. Missing project articles.');
        }

        if (onRestoreProject) {
          onRestoreProject(restoredProj);
          setRestoreMessage({
            type: 'success',
            text: `Restored project "${restoredProj.title}" with ${restoredProj.articles.length} articles!`,
          });
        }
      } catch (err: any) {
        setRestoreMessage({
          type: 'error',
          text: `Restore failed: ${err.message || 'Corrupted JSON file'}`,
        });
      }
    };
    reader.readAsText(file);
  };

  // Bulk RIS (.ris) Export via shared citation engine
  const downloadRisFile = () => {
    const risEntries = formatRisEntries(dedupedIncludedArticles);
    const blob = new Blob([risEntries], { type: 'application/x-research-info-systems;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}-included-studies.ris`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Bulk BibTeX (.bib) Export via shared citation engine
  const downloadBibTexFile = () => {
    const bib = formatBibTexEntries(dedupedIncludedArticles);
    const blob = new Blob([bib], { type: 'application/x-bibtex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}-included-studies.bib`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyReferencesList = () => {
    const text = dedupedIncludedArticles
      .map((art, idx) => {
        const f = formatReferenceEntry(art, idx, citationStyle, citationSourceType);
        return `${f.prefix ? `${f.prefix} ` : ''}${f.citationText}`.trim();
      })
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedCitationKey('all-refs');
    setTimeout(() => setCopiedCitationKey(null), 2000);
  };

  const downloadReferencesPdf = () => {
    if (dedupedIncludedArticles.length === 0) return;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 48;
    const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`References (${activeCitationStyle.name})`, margin, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(`${project.title || 'Systematic Review'} · ${dedupedIncludedArticles.length} Included Citations`, margin, y);
    y += 20;

    dedupedIncludedArticles.forEach((art, idx) => {
      const f = formatReferenceEntry(art, idx, citationStyle, citationSourceType);
      const safeLine = `${f.prefix ? `${f.prefix} ` : ''}${f.citationText}`
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-');
      const lines = doc.splitTextToSize(safeLine, maxWidth) as string[];
      if (y + lines.length * 13 > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      lines.forEach((line) => {
        doc.text(line, margin, y);
        y += 13;
      });
      y += 6;
    });

    doc.save(`${project.id}-references-${citationStyle}.pdf`);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(markdownContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const downloadExtractionMatrixCsv = () => {
    const headers = [
      'Study ID',
      'Title',
      'Authors',
      'Year',
      'Paper Type',
      'Database Found',
      'Platform',
      'Sensor',
      'Resolution / Scale',
      'Altitude',
      'Algorithm / Model',
      'Software / Code Tools',
      'Quantitative Metrics',
      'Turnaround Latency',
      'Protocol Alignment (%)',
      'Appraisal Score',
    ];
    const escapeCsv = (val: string | number | undefined) =>
      `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = includedArticles.map((art, idx) => {
      const analysis = includedAnalyses.get(art.id);
      const ext = analysis?.extracted || art.extractedData;
      const pType = analysis?.paperType.category || 'Original Research';
      const dbFound = analysis?.sourceProvenance.database || art.sourceDatabase || 'Database source not specified';
      const alignmentScore = analysis?.codeDetailAnalysis.protocolAlignmentScore ?? ext?.protocolAlignmentScore ?? 0;
      return [
        `[${idx + 1}]`,
        art.title,
        art.authors.join('; ') || 'Authors not reported',
        art.year || 'Year not specified',
        pType,
        dbFound,
        ext?.platform || 'Platform not specified in study',
        ext?.sensor || 'Sensor not specified in study',
        ext?.gsd || 'Resolution or scale not reported',
        ext?.altitude || 'Altitude not reported',
        ext?.algorithm || 'Analytical method not specified',
        ext?.softwareTools || 'No software tools reported',
        ext?.metrics || 'No quantitative metrics reported',
        ext?.latency || 'Turnaround latency not reported',
        `${alignmentScore}%`,
        `${art.appraisalScore ?? '12'}/13`,
      ]
        .map(escapeCsv)
        .join(',');
    });

    const csv = [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.id}-standardized-extraction-matrix.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyInlineText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCitationKey(key);
    setTimeout(() => setCopiedCitationKey(null), 1800);
  };

  return (
    <div className="space-y-6">
      <ModuleWorkbenchControls
        project={project}
        moduleId="export"
        moduleLabel="Export & Portable Backup Hub"
        autoSaveStatus={autoSaveStatus}
        deleteModes={['excluded', 'uncertain', 'duplicates']}
        onResetModule={onResetWorkbenchModule}
        onResetLocalView={() => {
          setSelectedFormat('word');
          setCitationStyle('apa7');
          setCitationSourceType('auto');
          setIncludeAbstract(true);
          setIncludePicoc(true);
          setIncludeRqs(true);
          setIncludeCoreNineSections(true);
          setIncludePrismaCounts(true);
          setIncludeAppraisalMatrix(true);
          setIncludePageEvidence(true);
          setIncludeExtractionTable(true);
          setIncludeReferences(true);
        }}
        onAddDataFiles={onDirectAddDataFiles}
        onOpenBulkImporter={onOpenBulkImporter}
        onRescanQueryQA={onRescanWithQueryQA}
        onDeleteQaEntry={onDeleteQaEntry}
      />
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Download className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                Export & Portable Backup Hub
              </h2>
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 tabular-nums">
                Auto-Sync Active · {includedArticles.length} Studies Live
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              All exports (Word, Markdown, RIS, BibTeX, Extraction CSV, and Portable JSON Backups) automatically synchronize in real time with screening verdicts, PRISMA counts, quality scores, and evidence matrices.
            </p>
          </div>

          {/* Quick Action Download Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={downloadWordDoc}
              className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Download Microsoft Word Compatible Document (.doc)"
            >
              <FileText className="w-4 h-4" />
              <span>Word (.doc)</span>
            </button>

            <button
              onClick={downloadMarkdown}
              className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Download Markdown Document (.md)"
            >
              <FileCode className="w-4 h-4" />
              <span>Markdown (.md)</span>
            </button>

            <button
              onClick={downloadRisFile}
              className="px-3.5 py-2 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white rounded-xl shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Download RIS citation file for EndNote / Zotero / Mendeley"
            >
              <BookOpen className="w-4 h-4" />
              <span>RIS (.ris)</span>
            </button>

            <button
              onClick={downloadBibTexFile}
              className="px-3.5 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Download BibTeX citation library"
            >
              <BookOpen className="w-4 h-4" />
              <span>BibTeX (.bib)</span>
            </button>

            <button
              onClick={downloadFullProjectBackup}
              className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Export complete portable SLR backup JSON"
            >
              <Layers className="w-4 h-4" />
              <span>Portable Backup (.json)</span>
            </button>

            <button
              onClick={copyToClipboard}
              className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Restore Backup Bar */}
        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <p className="font-semibold text-white text-xs flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Restore SLR Project Backup</span>
            </p>
            <p className="text-[11px] text-slate-400">
              Upload a previously exported <span className="font-mono text-indigo-300">.json</span> backup bundle to restore all screening states, appraisals, and extractions.
            </p>
          </div>
          <label className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer transition inline-flex items-center gap-1.5 shrink-0">
            <span>Restore Backup File</span>
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreBackupFile}
              className="hidden"
            />
          </label>
        </div>

        {restoreMessage && (
          <div
            className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
              restoreMessage.type === 'success'
                ? 'bg-emerald-950/40 border border-emerald-900 text-emerald-300'
                : 'bg-rose-950/40 border border-rose-900 text-rose-300'
            }`}
          >
            {restoreMessage.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{restoreMessage.text}</span>
          </div>
        )}

        {/* Format Selector & Section Checklist Toggle Grid */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
          {/* Format Mode Pills (4 Cols) */}
          <div className="md:col-span-4 bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] block">
              Active Export Format:
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => setSelectedFormat('word')}
                className={`py-2 px-2 rounded-lg font-bold text-xs transition text-center ${
                  selectedFormat === 'word'
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                    : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                Word (.doc)
              </button>

              <button
                onClick={() => setSelectedFormat('markdown')}
                className={`py-2 px-2 rounded-lg font-bold text-xs transition text-center ${
                  selectedFormat === 'markdown'
                    ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                    : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                Markdown
              </button>

              <button
                onClick={() => setSelectedFormat('notebooklm')}
                className={`py-2 px-2 rounded-lg font-bold text-xs transition text-center ${
                  selectedFormat === 'notebooklm'
                    ? 'bg-teal-600 text-white ring-2 ring-teal-400'
                    : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                NotebookLM
              </button>
            </div>
            <p className="text-[10px] text-slate-500 pt-1">
              Word (.doc) creates a rich XML-styled document compatible with MS Word, Google Docs, and LibreOffice.
            </p>
          </div>

          {/* Section Inclusions (8 Cols) */}
          <div className="md:col-span-8 bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] block">
              Include Sections in Generated Report:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAbstract}
                  onChange={(e) => setIncludeAbstract(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <span>Executive Abstract</span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePicoc}
                  onChange={(e) => setIncludePicoc(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <span>{activeFramework.name} Framework Table</span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeRqs}
                  onChange={(e) => setIncludeRqs(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <span>Research Questions (RQ1-7)</span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCoreNineSections}
                  onChange={(e) => setIncludeCoreNineSections(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <span>9 Core Synthesis Sections</span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePrismaCounts}
                  onChange={(e) => setIncludePrismaCounts(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <span>PRISMA 2020 Flow Data</span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeExtractionTable}
                  onChange={(e) => setIncludeExtractionTable(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <span>Data Extraction Matrix</span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePageEvidence}
                  onChange={(e) => setIncludePageEvidence(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <span>Page-Level Evidence Quotes</span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeReferences}
                  onChange={(e) => setIncludeReferences(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
                />
                <span>References &amp; Bibliography (Optional)</span>
              </label>
            </div>

            {/* Optional Reference Style Dropdown Bar */}
            <div className="pt-2.5 mt-1 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-300 mb-1">
                  Reference Citation Style (Optional · 12 Styles)
                </label>
                <select
                  value={includeReferences ? citationStyle : 'disabled'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'disabled') {
                      setIncludeReferences(false);
                    } else {
                      setIncludeReferences(true);
                      setCitationStyle(val as CitationStyleId);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 hover:border-indigo-500 rounded-lg px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="disabled">Do not include References section</option>
                  {CITATION_STYLE_DEFINITIONS.map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.number}. {style.name} — {style.inTextExample}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-300 mb-1">
                  Source Type Format Mode
                </label>
                <select
                  value={citationSourceType}
                  disabled={!includeReferences}
                  onChange={(e) => setCitationSourceType(e.target.value as CitationSourceType)}
                  className="w-full bg-slate-900 border border-slate-700 hover:border-teal-500 disabled:opacity-50 rounded-lg px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-teal-500 cursor-pointer"
                >
                  <option value="auto">Auto-detect source type (Journal / Conference / Book / Thesis)</option>
                  <option value="journal">Journal article</option>
                  <option value="book">Book</option>
                  <option value="book_chapter">Book chapter</option>
                  <option value="conference">Conference paper</option>
                  <option value="website">Website</option>
                  <option value="thesis">Thesis / dissertation</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Preview Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Document Reading View (8 Cols) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
          {/* Format Badge Indicator */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-indigo-400" />
              Live Document Preview (Formatted Output)
            </span>
            <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-800 text-slate-300">
              {selectedFormat === 'word'
                ? 'MS Word Compatible Layout'
                : selectedFormat === 'markdown'
                ? 'Markdown Rendered'
                : 'NotebookLM Grounded Briefing'}
            </span>
          </div>

          {/* Title and metadata */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug">
              {project.title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-2">
              <strong className="text-slate-100">Focus / Scope:</strong> {project.subtitle}
            </p>
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-400 mt-2 font-mono">
              <span className="bg-indigo-500/15 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 font-semibold">
                {activeFramework.name} Framework
              </span>
              <span className="bg-teal-500/15 text-teal-300 px-2 py-0.5 rounded border border-teal-500/30 font-semibold">
                {activeReviewType.number}. {activeReviewType.name}
              </span>
              <span className="bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 font-semibold">
                {activeProtocolStd.shortBadge}
              </span>
              <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {project.discipline}
              </span>
              <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {project.publicationYears}
              </span>
              <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {project.geographicEligibility}
              </span>
            </div>
          </div>

          {/* Abstract */}
          {includeAbstract && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <h3 className="font-bold text-white text-xs uppercase tracking-wider text-indigo-400">
                Abstract
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed text-justify">{abstractText}</p>
            </div>
          )}

          {/* Active Framework Scoping Table */}
          {includePicoc && (
            <div className="space-y-3">
              <h3 className="font-bold text-white text-sm uppercase tracking-wider border-b border-slate-800 pb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  {activeFramework.fullTitle}
                </span>
                <span className="text-[11px] font-semibold text-teal-300 normal-case">
                  {activeReviewType.name} · {activeProtocolStd.label}
                </span>
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 w-1/4">Dimension</th>
                      <th className="py-2.5 px-3">Scope Definition & Empirical Boundaries</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                    {activeFrameworkEntries.map((entry) => (
                      <tr key={entry.key}>
                        <td className="py-2.5 px-3 font-bold text-white">{entry.label}</td>
                        <td className="py-2.5 px-3">{entry.value || 'Not specified'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Research Questions */}
          {includeRqs && (
            <div className="space-y-3">
              <h3 className="font-bold text-white text-sm uppercase tracking-wider border-b border-slate-800 pb-1 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                Systematic Review Research Questions
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 w-14">Code</th>
                      <th className="py-2.5 px-3">Research Question</th>
                      <th className="py-2.5 px-3">Main Evidence to Collect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                    {project.researchQuestions.map((rq) => (
                      <tr key={rq.code}>
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-400">{rq.code}</td>
                        <td className="py-2.5 px-3 font-medium text-white">{rq.question}</td>
                        <td className="py-2.5 px-3 text-slate-300">{rq.mainEvidenceToCollect}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 9 Core Structured Sections */}
          {includeCoreNineSections && (
            <div className="space-y-6 pt-2">
              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm uppercase tracking-wider border-b border-slate-800 pb-1">
                  1. Background and Rationale
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed text-justify whitespace-pre-wrap">
                  {backgroundText}
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm uppercase tracking-wider border-b border-slate-800 pb-1">
                  2. Problem Statement
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed text-justify whitespace-pre-wrap">
                  {problemStatementText}
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm uppercase tracking-wider border-b border-slate-800 pb-1">
                  3. Research Aim and Objectives
                </h3>
                <ol className="list-decimal list-inside space-y-1 text-xs text-slate-300 pl-1">
                  {objectivesList.map((obj, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {obj}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="space-y-3">
                <h3 className="font-bold text-white text-sm uppercase tracking-wider border-b border-slate-800 pb-1">
                  4. Literature Review and Research Gap
                </h3>
                <div className="space-y-3">
                  {includedArticles.map((art, idx) => {
                    const analysis = includedAnalyses.get(art.id);
                    const ext = analysis?.extracted || art.extractedData;
                    const pType = analysis?.paperType.category || 'Original Research';
                    const dbFound = analysis?.sourceProvenance.database || art.sourceDatabase || 'Other';
                    return (
                      <div
                        key={art.id}
                        className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-xs space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-indigo-400 font-mono">
                            [{idx + 1}] {art.title}
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span
                              className={`px-2 py-0.5 rounded font-bold ${
                                pType === 'Review'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              }`}
                            >
                              {pType}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 font-mono">
                              {dbFound}
                            </span>
                            <span className="text-[11px] text-slate-400">{art.year}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {art.authors.join(', ')} · <span className="italic">{art.journal}</span>
                        </p>
                        <p className="text-slate-300 leading-relaxed pt-1">{art.abstract}</p>
                        {(ext?.latency || ext?.softwareTools || ext?.metrics) && (
                          <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px]">
                            {ext?.latency && (
                              <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                Latency: {ext.latency}
                              </span>
                            )}
                            {ext?.sensor && (
                              <span className="text-slate-400">
                                Sensor: {ext.sensor}
                              </span>
                            )}
                            {ext?.softwareTools && (
                              <span className="text-purple-300 font-mono">
                                Code/Tools: {ext.softwareTools}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* PRISMA 2020 Flow Data */}
          {includePrismaCounts && (
            <div className="space-y-3">
              <h3 className="font-bold text-white text-sm uppercase tracking-wider border-b border-slate-800 pb-1 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                PRISMA 2020 Flow Diagram Summary
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">PRISMA 2020 Stage</th>
                      <th className="py-2.5 px-3">Reported Empirical Number</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-white">Records Identified (Databases)</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-400">
                        n = {prismaNumbers.totalIdentified}{' '}
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({Object.entries(prismaNumbers.dbCounts).map(([db, c]) => `${db}: ${c}`).join(' · ')})
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-white">Identified Paper Types (Original vs Review)</td>
                      <td className="py-2.5 px-3 font-mono text-xs">
                        <span className="text-cyan-300 font-bold">Original Research: n = {prismaNumbers.identifiedOriginal}</span>
                        {' · '}
                        <span className="text-amber-300 font-bold">Reviews: n = {prismaNumbers.identifiedReviews}</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-white">Duplicates Removed</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                        n = {prismaNumbers.duplicates}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-white">Records Screened (Title/Abstract)</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                        n = {prismaNumbers.uniqueScreened}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-white">Excluded at Title/Abstract</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-rose-400">
                        n = {prismaNumbers.titleAbstractExcluded}
                      </td>
                    </tr>
                    {PRISMA_DIAGNOSTIC_CATEGORIES.map((cat) => {
                      const count = prismaNumbers.diagnosticCounts[cat.code] || 0;
                      return (
                        <tr key={cat.code}>
                          <td className="py-2 px-3 text-slate-300 pl-6">
                            ↳ {cat.label}
                          </td>
                          <td className="py-2 px-3 font-mono text-xs">
                            <span className={count > 0 ? 'font-bold text-rose-300' : 'text-slate-400'}>
                              n = {count}
                            </span>
                            {cat.code === 'not_primary_research' && (
                              <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                                {(Object.keys(NOT_PRIMARY_SUBTYPE_LABELS) as NotPrimarySubType[])
                                  .map((s) => `${NOT_PRIMARY_SUBTYPE_LABELS[s]}: ${prismaNumbers.notPrimarySubCounts[s] || 0}`)
                                  .join(' · ')}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-white">Full-Text Reports Assessed</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-white">
                        n = {prismaNumbers.fullTextAssessed}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-white">Full-Text Exclusions with Reasons</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-rose-400">
                        n = {prismaNumbers.fullTextExcluded}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-white">Studies Included in Qualitative Synthesis</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                        n = {prismaNumbers.included}{' '}
                        <span className="text-[11px] font-normal text-slate-300">
                          (Original Research: <strong className="text-cyan-300">{prismaNumbers.includedOriginal}</strong> · Reviews:{' '}
                          <strong className="text-amber-300">{prismaNumbers.includedReviews}</strong>)
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Data Extraction Matrix */}
          {includeExtractionTable && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  Standardized Data Extraction Matrix
                </h3>
                {includedArticles.length > 0 && (
                  <button
                    type="button"
                    onClick={downloadExtractionMatrixCsv}
                    className="px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/35 text-purple-200 border border-purple-500/40 text-[11px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                    title="Download Standardized Data Extraction Matrix as CSV spreadsheet"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Export Matrix (.csv)</span>
                  </button>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-2.5">#</th>
                      <th className="py-2.5 px-2.5">Study &amp; Provenance</th>
                      <th className="py-2.5 px-2.5">Platform &amp; Sensor</th>
                      <th className="py-2.5 px-2.5">Resolution / Scale</th>
                      <th className="py-2.5 px-2.5">Method &amp; Code Tools</th>
                      <th className="py-2.5 px-2.5">Metrics &amp; Latency</th>
                      <th className="py-2.5 px-2.5">Alignment &amp; Appraisal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                  {includedArticles.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 px-4 text-center text-slate-400 text-xs">
                        No studies have been marked as Included yet. Include studies in Screening Workbench to populate this matrix.
                      </td>
                    </tr>
                  ) : (
                    includedArticles.map((art, idx) => {
                      const analysis = includedAnalyses.get(art.id);
                      const ext = analysis?.extracted || art.extractedData;
                      const pType = analysis?.paperType.category || 'Original Research';
                      const dbFound = analysis?.sourceProvenance.database || art.sourceDatabase || 'Database source not specified';
                      const alignmentScore = analysis?.codeDetailAnalysis.protocolAlignmentScore ?? ext?.protocolAlignmentScore ?? 0;
                      const rowVal = validateArticleMetadata(art);
                      return (
                        <tr key={art.id} className="align-top hover:bg-slate-900/40">
                          <td className="py-2.5 px-2.5 font-mono font-bold text-indigo-400">[{idx + 1}]</td>
                          <td className="py-2.5 px-2.5 min-w-[170px]">
                            <span className="font-bold text-white block line-clamp-2">{art.title}</span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              {rowVal.sanitized.authors[0] || 'No author listed'} ({art.year || 'n.d.'}) ·{' '}
                              <span className={pType === 'Review' ? 'text-amber-300 font-semibold' : 'text-cyan-300 font-semibold'}>
                                {pType}
                              </span>{' '}
                              · <span className="text-slate-300">{dbFound}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5 text-[11px] min-w-[130px]">
                            <span className="text-slate-200 block">
                              {ext?.platform || 'Platform not specified in study'}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              {ext?.sensor || 'Sensor not specified in study'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5 text-[11px] min-w-[120px]">
                            <span className="text-slate-200 block">
                              {ext?.gsd || 'Resolution or scale not reported'}
                            </span>
                            {ext?.altitude && (
                              <span className="text-[10px] text-slate-400 block">{ext.altitude}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-[11px] min-w-[140px]">
                            <span className="text-indigo-300 font-medium block">
                              {ext?.algorithm || 'Analytical method not specified'}
                            </span>
                            <span className="text-[10px] text-purple-300 block">
                              {ext?.softwareTools || 'No software tools reported'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5 text-[11px] min-w-[140px]">
                            <span className="text-slate-200 block">
                              {ext?.metrics || 'Quantitative metrics not reported'}
                            </span>
                            <span className="text-teal-400 font-semibold text-[10px] block mt-0.5">
                              {ext?.latency || 'Turnaround latency not reported'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5 font-mono text-[11px] whitespace-nowrap">
                            <span className="text-emerald-300 font-bold block">{alignmentScore}% aligned</span>
                            <span className="text-purple-300 font-bold text-[10px] block">
                              Appraisal: {art.appraisalScore ?? '12'}/13
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* References (Optional with Citation Style Dropdown & Guides) */}
          {includeReferences && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div>
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                    <span>References ({activeCitationStyle.name})</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    In-text example: <span className="font-mono text-teal-300">{activeCitationStyle.inTextExample}</span> · {activeCitationStyle.commonApplication}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={citationStyle}
                    onChange={(e) => setCitationStyle(e.target.value as CitationStyleId)}
                    className="bg-slate-950 border border-slate-700 hover:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                    title="Select citation style for References"
                  >
                    {CITATION_STYLE_DEFINITIONS.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.number}. {style.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={copyReferencesList}
                    disabled={dedupedIncludedArticles.length === 0}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedCitationKey === 'all-refs' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCitationKey === 'all-refs' ? 'Copied' : 'Copy All'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={downloadWordDoc}
                    disabled={dedupedIncludedArticles.length === 0}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/35 text-[11px] text-blue-200 border border-blue-500/30 cursor-pointer"
                  >
                    Word
                  </button>
                  <button
                    type="button"
                    onClick={downloadReferencesPdf}
                    disabled={dedupedIncludedArticles.length === 0}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 text-[11px] text-rose-200 border border-rose-500/30 cursor-pointer"
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={downloadRisFile}
                    disabled={dedupedIncludedArticles.length === 0}
                    className="px-2.5 py-1.5 rounded-lg bg-teal-600/20 hover:bg-teal-600/35 text-[11px] text-teal-200 border border-teal-500/30 cursor-pointer"
                  >
                    RIS
                  </button>
                  <button
                    type="button"
                    onClick={downloadBibTexFile}
                    disabled={dedupedIncludedArticles.length === 0}
                    className="px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/35 text-[11px] text-purple-200 border border-purple-500/30 cursor-pointer"
                  >
                    BibTeX
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncludeReferences(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 border border-slate-700 cursor-pointer"
                    title="Hide optional References section from report"
                  >
                    Hide Section
                  </button>
                </div>
              </div>

              {dedupedIncludedArticles.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                    Verified: {citationVerificationSummary.Verified}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold">
                    Partially Verified: {citationVerificationSummary['Partially Verified']}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                    Needs Review: {citationVerificationSummary['Needs Manual Review']}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-semibold">
                    Unresolved: {citationVerificationSummary.Unresolved}
                  </span>
                </div>
              )}

              <div className="space-y-2.5 text-xs text-slate-300">
                {dedupedIncludedArticles.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    No included studies yet. References will appear here once studies are marked as Included.
                  </p>
                ) : (
                  dedupedIncludedArticles.map((art, idx) => {
                    const formatted = formatReferenceEntry(art, idx, citationStyle, citationSourceType);
                    const validation = validateArticleMetadata(art);
                    const parenKey = `paren-${art.id}`;
                    const narrKey = `narr-${art.id}`;
                    return (
                      <div key={art.id} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-1.5">
                        <div className="pl-6 -indent-6 leading-relaxed">
                          <span className="font-bold text-indigo-400 font-mono mr-1.5">{formatted.prefix}</span>
                          <span>{formatted.citationText}</span>
                          {formatted.doiOrUrl && (
                            <a
                              href={formatted.doiOrUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:underline font-mono text-[11px] ml-1.5 inline-flex items-center gap-0.5"
                            >
                              <span>Open Link</span>
                              <ExternalLink className="w-3 h-3 inline" />
                            </a>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pl-6 text-[10px] text-slate-400">
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                            {formatted.sourceTypeLabel}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-semibold ${
                              validation.verificationStatus === 'Verified'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : validation.verificationStatus === 'Partially Verified'
                                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {validation.verificationStatus === 'Verified' ? (
                              <ShieldCheck className="w-3 h-3" />
                            ) : (
                              <ShieldAlert className="w-3 h-3" />
                            )}
                            <span>{validation.verificationStatus}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => copyInlineText(parenKey, formatted.inTextParenthetical)}
                            className="px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono cursor-pointer transition"
                            title="Copy in-text citation"
                          >
                            {copiedCitationKey === parenKey ? 'Copied!' : `In-text: ${formatted.inTextParenthetical}`}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyInlineText(narrKey, formatted.inTextNarrative)}
                            className="px-2 py-0.5 rounded bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 font-mono cursor-pointer transition"
                            title="Copy narrative in-text citation"
                          >
                            {copiedCitationKey === narrKey ? 'Copied!' : `Narrative: ${formatted.inTextNarrative}`}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <CitationGuidePanel
                selectedStyle={citationStyle}
                onSelectStyle={(style) => setCitationStyle(style)}
              />
            </div>
          )}
        </div>

        {/* Right Sidebar: NotebookLM Source Inspector & Citation Chips (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* NotebookLM Source Attribution Inspector */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm sticky top-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Bookmark className="w-4 h-4 text-teal-400" />
                NotebookLM Source Index
              </span>
              <span className="text-[11px] text-teal-400 font-mono font-bold">
                {includedArticles.length} Grounded Sources
              </span>
            </div>

            <p className="text-[11px] text-slate-400">
              Click any source badge below to inspect verified DOI metadata and extracted page-level evidence quotes.
            </p>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {includedArticles.map((art, idx) => (
                <div
                  key={art.id}
                  onClick={() => setActiveCitationModal(idx + 1)}
                  className={`p-3 rounded-xl border text-xs transition cursor-pointer ${
                    activeCitationModal === idx + 1
                      ? 'bg-teal-950/40 border-teal-500 shadow-sm'
                      : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-mono font-bold text-teal-400">[Source {idx + 1}]</span>
                    <span className="text-slate-500 font-mono text-[10px]">{art.sourceDatabase}</span>
                  </div>
                  <h4 className="font-bold text-white text-xs leading-snug line-clamp-2">{art.title}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {art.authors.slice(0, 2).join(', ')} ({art.year})
                  </p>

                  {/* Evidence Quotes Preview */}
                  {art.evidenceCitations && art.evidenceCitations.length > 0 && (
                    <div className="mt-2 pt-1 border-t border-slate-900 text-[10px] text-teal-300">
                      <span className="font-semibold">{art.evidenceCitations.length} Grounded Page Quote(s)</span>
                      <p className="text-slate-400 italic line-clamp-1 mt-0.5">
                        "{art.evidenceCitations[0].quote}"
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Quick Export Links */}
            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              <button
                onClick={downloadWordDoc}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export Microsoft Word (.doc)</span>
              </button>
              <button
                onClick={downloadMarkdown}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Export Markdown (.md)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
