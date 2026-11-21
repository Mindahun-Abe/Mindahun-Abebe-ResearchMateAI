export type ScreeningDecision = 'unscreened' | 'include' | 'exclude' | 'uncertain';

export type AppraisalRating = 'Yes' | 'Partial' | 'No' | 'Unclear';

export interface PageCitation {
  id: string;
  pageNumber: number;
  section: string;
  quote: string;
  relevance: string;
}

export interface AppraisalItem {
  id: number;
  category: 'Study design' | 'Sensor and acquisition' | 'Model validation' | 'Operational readiness';
  item: string;
  rating: AppraisalRating;
  notes?: string;
}

export type GeographicScaleTier =
  | 'global'
  | 'continental'
  | 'country'
  | 'regional'
  | 'zonal'
  | 'woreda'
  | 'watershed'
  | 'unspecified';

export type GeographicEligibilityVerdict =
  | 'eligible_exact_match'
  | 'eligible_subscale_contained'
  | 'eligible_global_scope'
  | 'out_of_area_mismatch'
  | 'scale_broader_than_target'
  | 'unspecified_study_area';

export interface ArticleGeographicHierarchy {
  global?: string[];
  continental?: string[];
  country?: string[];
  regional?: string[];
  zonal?: string[];
  woreda?: string[];
  watershed?: string[];
}

export interface ArticleGeographicAssessment {
  detectedScale: GeographicScaleTier;
  detectedScaleLabel: string;
  detectedPlaces: string[];
  primaryPlaceLabel: string;
  hierarchy: ArticleGeographicHierarchy;
  targetScale: GeographicScaleTier | 'any';
  targetTerms: string[];
  verdict: GeographicEligibilityVerdict;
  verdictLabel: string;
  isEligible: boolean;
  confidence: number;
  interpretiveSummary: string;
  evidenceSnippet: string;
}

export interface ArticleExtractedData {
  platform?: string;
  sensor?: string;
  gsd?: string;
  altitude?: string;
  spectralBands?: string;
  algorithm?: string;
  latency?: string;
  latencyReported?: boolean;
  groundTruth?: string;
  spatialLeakageAddressed?: boolean;
  metrics?: string;
  geographicRegion?: string;
  geographicScale?: GeographicScaleTier;
  geographicVerdict?: GeographicEligibilityVerdict;
  geographicInterpretation?: string;
  geographicHierarchy?: ArticleGeographicHierarchy;
  sampleSize?: string;
  studyType?: string;
  keyFindings?: string;
  effectSizeOrAccuracy?: string;
  limitations?: string;
  softwareTools?: string;
  codeRepository?: string;
  hardwareCompute?: string;
  protocolAlignmentScore?: number;
  matchedPicocSummary?: string;
  codedVariables?: Record<string, string>;
}

export type DatabaseProvenance =
  | 'Scopus'
  | 'Web of Science'
  | 'IEEE Xplore'
  | 'ScienceDirect'
  | 'CAB Abstracts'
  | 'Google Scholar'
  | 'Manual'
  | 'Crossref'
  | 'PubMed'
  | 'Europe PMC'
  | 'DOAJ'
  | 'arXiv'
  | 'OpenAlex'
  | 'Semantic Scholar'
  | 'MDPI'
  | 'MDM'
  | 'Springer'
  | 'Wiley'
  | 'Other'
  | string;

export type PaperAccessStatus =
  | 'downloadable'
  | 'needs_institution_confirmation'
  | 'not_accessible'
  | 'abstract_only';

export interface Article {
  id: string;
  projectId?: string;
  sourceFileName?: string;
  doi?: string;
  title: string;
  authors: string[];
  year: number;
  journal: string;
  abstract: string;
  fullText?: string;
  pages?: { pageNumber: number; content: string }[];
  sourceDatabase: DatabaseProvenance;
  url?: string;
  volume?: string;
  issue?: string;
  pagesStr?: string;
  publisher?: string;
  citationsCount?: number;
  openAccessUrl?: string;
  pdfUrl?: string;
  accessStatus?: PaperAccessStatus;
  accessNotes?: string;
  institutionConfirmed?: boolean;
  retrievedAt?: string;
  isDuplicate?: boolean;
  duplicateOfId?: string;
  duplicateMatchedDatabases?: string[];
  duplicateNote?: string;
  searchBatchId?: string;
  searchQueryUsed?: string;
  isStarred?: boolean;
  priority?: 'low' | 'medium' | 'high';
  screeningStage: 'title_abstract' | 'full_text' | 'final_included' | 'excluded';
  decision: ScreeningDecision;
  decisionReason?: string;
  reviewerNotes?: string;
  screeningNotes?: string;
  aiSuggestedDecision?: ScreeningDecision;
  aiConfidence?: number;
  aiReason?: string;
  evidenceCitations: PageCitation[];
  appraisalWorksheet?: AppraisalItem[];
  appraisalScore?: number; // count of Yes
  riskOfBiasAssessment?: 'Low' | 'Moderate' | 'High' | 'Critical';
  extractedData?: ArticleExtractedData;
  includedInQuantitativeSynthesis?: boolean;
  paperCategory?: 'Original Research' | 'Review';
  paperSubType?: string;
  codeAnalysisNotes?: string;
  prismaExclusionFlags?: string[];
}

export interface PicocFramework {
  population: string;
  intervention: string;
  comparison: string;
  outcome: string;
  context: string;
}

export interface EligibilityCriterion {
  id: string;
  dimension: string; // e.g. "Platform", "Sensor", "Method", "Latency"
  includeRule: string;
  excludeRule: string;
  category: 'inclusion' | 'exclusion';
}

export interface ResearchQuestion {
  code: string; // "RQ1"
  question: string;
  mainEvidenceToCollect: string;
}

export type ReviewFrameworkType =
  | 'PICOC'
  | 'PICO'
  | 'PECO'
  | 'PCC'
  | 'SPIDER'
  | 'SPICE'
  | 'PICOS'
  | 'CIMO';

export type LiteratureReviewTypeId =
  | 'narrative'
  | 'slr'
  | 'scoping'
  | 'meta_analysis'
  | 'meta_synthesis'
  | 'integrative'
  | 'critical'
  | 'rapid'
  | 'umbrella'
  | 'mapping'
  | 'bibliometric'
  | 'realist'
  | 'overview'
  | 'state_of_the_art'
  | 'theoretical'
  | 'methodological';

export type ProtocolStandardType =
  | 'standard_slr'
  | 'scoping_review'
  | 'meta_analysis';

export interface ReviewProject {
  id: string;
  databaseFolderName?: string;
  databaseFolderPath?: string;
  updatedAt?: string;
  title: string;
  subtitle: string;
  scope: string;
  discipline: string;
  publicationYears: string;
  articleTypes: string;
  geographicEligibility: string;
  geographicTargetScale?: GeographicScaleTier | 'any';
  methodologyFocus: string;
  frameworkType?: ReviewFrameworkType;
  frameworkFields?: Record<string, string>;
  reviewType?: LiteratureReviewTypeId;
  protocolStandard?: ProtocolStandardType;
  picoc: PicocFramework;
  researchQuestions: ResearchQuestion[];
  inclusionCriteria: EligibilityCriterion[];
  standardExclusionReasons: string[];
  uncertainCasesGuidance: string;
  booleanQuery: string;
  articles: Article[];
  workbenchState?: WorkbenchState;
}

export type WorkbenchModuleId =
  | 'batch_screener'
  | 'picoc'
  | 'protocol_builder'
  | 'duplicates'
  | 'title_screening'
  | 'screening'
  | 'extraction'
  | 'appraisal'
  | 'prisma'
  | 'results'
  | 'quant_synthesis'
  | 'briefing'
  | 'proposal'
  | 'export';

export type QuantEffectMeasure = 'SMD' | 'MD' | 'OR' | 'RR' | 'COR' | 'PROP';
export type QuantModelType = 'random' | 'fixed';
export type QuantTauEstimator = 'DL' | 'REML' | 'PM';
export type QuantEligibilityStatus =
  | 'eligible'
  | 'excluded_incompatible'
  | 'excluded_incomplete'
  | 'excluded_duplicate_cluster'
  | 'excluded_manual'
  | 'excluded_review_type'
  | 'pending';

export interface QuantRawNumericalInput {
  mean1?: number | null;
  sd1?: number | null;
  n1?: number | null;
  mean2?: number | null;
  sd2?: number | null;
  n2?: number | null;
  events1?: number | null;
  total1?: number | null;
  events2?: number | null;
  total2?: number | null;
  r?: number | null;
  n?: number | null;
  events?: number | null;
  total?: number | null;
  effectSize?: number | null;
  se?: number | null;
  variance?: number | null;
  ciLow?: number | null;
  ciHigh?: number | null;
  totalSampleSize?: number | null;
  isNaturalScaleRatio?: boolean;
  isRawCorrelation?: boolean;
}

export interface QuantStudyExtractionRecord {
  id: string;
  projectId: string;
  articleId: string;
  studyLabel?: string;
  title?: string;
  authors?: string[];
  year?: number;
  studyClusterId: string;
  outcomeType: string;
  outcomeLabel: string;
  effectMeasure: QuantEffectMeasure;
  subgroup: string;
  moderatorYear?: number | null;
  moderatorQuality?: number | null;
  moderatorSampleSize?: number | null;
  studyDesign?: string;
  units?: string;
  originalData: QuantRawNumericalInput;
  effectSize?: number | null;
  se?: number | null;
  variance?: number | null;
  ciLow?: number | null;
  ciHigh?: number | null;
  displayEffect?: number | null;
  displayCiLow?: number | null;
  displayCiHigh?: number | null;
  weightFe?: number | null;
  weightRe?: number | null;
  activeWeight?: number | null;
  continuityCorrected?: boolean;
  extractionStatus: 'pending' | 'awaiting_numerical_entry' | 'extracted' | 'verified';
  verifiedBy?: string;
  pdfPageNumbers?: string;
  supportingEvidence?: string;
  eligibilityStatus: QuantEligibilityStatus;
  eligibilityOverride?: 'auto' | 'approved' | 'excluded';
  eligibilityReasons?: string[];
  checksPassed?: string[];
  doubleCountGuardNote?: string;
  source?: string;
  updatedAt?: string;
}

export interface QuantMetaConfig {
  effectMeasure: QuantEffectMeasure;
  modelType: QuantModelType;
  estimator: QuantTauEstimator;
  targetOutcomeType: string;
  targetUnits?: string;
  subgroupBy: 'subgroup' | 'studyDesign' | 'effectMeasure';
  metaRegressionModerator: 'moderatorYear' | 'moderatorQuality' | 'moderatorSampleSize';
  allowedStudyDesign?: string;
  requireCompatibleStudyDesign?: boolean;
  allowSecondaryReviewPooling?: boolean;
}

export interface QuantPooledEstimateSummary {
  pooledEffect: number;
  se: number;
  ciLow: number;
  ciHigh: number;
  zStat: number;
  pValue: number;
  displayPooledEffect: number;
  displayCiLow: number;
  displayCiHigh: number;
}

export interface QuantDescriptiveSynthesis {
  counts: {
    totalIdentified: number;
    duplicatesRemoved: number;
    uniqueRecords: number;
    screened: number;
    excluded: number;
    uncertain: number;
    unscreened: number;
    included: number;
    includedOriginalResearch: number;
    includedReviews: number;
    includedOriginalPct: number;
    includedReviewPct: number;
    identifiedOriginalResearch: number;
    identifiedReviews: number;
  };
  publicationYearDistribution: Array<{
    year: string;
    count: number;
    originalCount: number;
    reviewCount: number;
    percentage: number;
  }>;
  countryDistribution: Array<{ label: string; count: number; percentage: number }>;
  continentDistribution: Array<{ label: string; count: number; percentage: number }>;
  researchDesignDistribution: Array<{ label: string; count: number; percentage: number }>;
  databaseIdentificationDistribution: Array<{ label: string; count: number; percentage: number }>;
  databaseIncludedDistribution: Array<{ label: string; count: number; percentage: number }>;
  sensorDistribution: Array<{ label: string; count: number; percentage: number }>;
  platformDistribution: Array<{ label: string; count: number; percentage: number }>;
  algorithmDistribution: Array<{
    algorithm: string;
    count: number;
    percentage: number;
    meanNormalizedScore: number | null;
    reportedScoreCount: number;
  }>;
  outcomeDistribution: Array<{ label: string; count: number; percentage: number }>;
  researchObjectiveContributions: Array<{
    code: string;
    question: string;
    mainEvidenceToCollect: string;
    count: number;
    percentage: number;
    contributingArticleIds: string[];
    contributingTitles: string[];
  }>;
  extractedMetricAggregates: Record<
    string,
    { count: number; min: number; max: number; mean: number; median: number }
  >;
  studyTraceRows: Array<{
    articleId: string;
    title: string;
    year: number;
    category: string;
    country: string;
    continent: string;
    design: string;
    database: string;
    sensor: string;
    platform: string;
    algorithm: string;
    outcomeType: string;
    appraisalScore?: number;
    riskOfBias: string;
  }>;
}

export interface QuantMetaAnalysisResult {
  pooledAvailable: boolean;
  reason?: string | null;
  k: number;
  effectMeasure: QuantEffectMeasure;
  modelType: QuantModelType;
  estimator: QuantTauEstimator;
  overall: (QuantPooledEstimateSummary & {
    k: number;
    effectMeasure: QuantEffectMeasure;
    modelType: QuantModelType;
    estimator: QuantTauEstimator;
    fixedEffect: QuantPooledEstimateSummary;
    randomEffects: QuantPooledEstimateSummary;
    heterogeneity: {
      qStat: number;
      qDf: number;
      qPvalue: number;
      i2: number;
      h2: number;
      tau2: number;
      tau: number;
      tau2DL: number;
    };
    predictionInterval: {
      low: number;
      high: number;
      displayLow: number;
      displayHigh: number;
    } | null;
    studies: QuantStudyExtractionRecord[];
  }) | null;
  subgroupAnalysis: {
    subgroupField: string;
    subgroups: Array<{
      subgroup: string;
      k: number;
      pooledEffect: number;
      ciLow: number;
      ciHigh: number;
      displayPooledEffect: number;
      displayCiLow: number;
      displayCiHigh: number;
      pValue: number;
      i2: number;
      tau2: number;
      qStat: number;
    }>;
    qBetween: number | null;
    dfBetween: number;
    pBetween: number | null;
  } | null;
  sensitivityAnalysis: Array<{
    omittedId: string;
    omittedArticleId: string;
    omittedLabel: string;
    kRemaining: number;
    pooledEffect: number;
    ciLow: number;
    ciHigh: number;
    displayPooledEffect: number;
    displayCiLow: number;
    displayCiHigh: number;
    i2: number;
    tau2: number;
    pValue: number;
  }>;
  metaRegression: {
    moderatorKey: string;
    k: number;
    intercept: number;
    slope: number;
    seSlope: number;
    seIntercept: number;
    zStat: number;
    pValue: number;
    qm: number;
    r2Analog: number;
    points: Array<{ x: number; y: number; weight: number; label: string }>;
  } | null;
  publicationBias: {
    eligible: boolean;
    k: number;
    eggerIntercept?: number;
    eggerSe?: number;
    eggerT?: number;
    eggerPvalue?: number;
    beggTau?: number;
    beggPvalue?: number;
    advisory: string;
  };
  influenceDiagnostics: Array<{
    id: string;
    articleId: string;
    studyLabel: string;
    hatWeight: number;
    standardizedResidual: number;
    cooksDistance: number;
    isOutlier: boolean;
    isInfluential: boolean;
  }>;
  outcomeStratified: Array<any>;
}

export interface QuantAnalysisResponse {
  success: boolean;
  runId: string;
  analysisDate: string;
  softwareVersion: string;
  descriptive: QuantDescriptiveSynthesis;
  records: QuantStudyExtractionRecord[];
  metaAnalysis: QuantMetaAnalysisResult;
  audit?: {
    runs: Array<any>;
    auditLog: Array<any>;
    migrations: Array<any>;
  };
}

export interface QualitativeThemeEntry {
  id: string;
  theme: string;
  researchQuestionCode: string;
  synthesisNarrative: string;
  supportingArticleIds: string[];
  evidenceQuotes: string[];
  updatedAt: string;
}

export interface QuantSynthesisSavedState {
  activeSynthesisMode?: 'qualitative' | 'quantitative';
  config?: QuantMetaConfig;
  lastRunId?: string;
  analysisDate?: string;
  softwareVersion?: string;
  lastDescriptive?: QuantDescriptiveSynthesis | null;
  lastMetaAnalysis?: QuantMetaAnalysisResult | null;
  studyRecords?: QuantStudyExtractionRecord[];
  qualitativeThemes?: QualitativeThemeEntry[];
  updatedAt?: string;
}

export interface BatchScreenerStatsSnapshot {
  processed: number;
  total: number;
  included: number;
  excluded: number;
  uncertain: number;
  speed: number;
  elapsedSeconds: number;
}

export interface BatchScreenerRunRecord extends BatchScreenerStatsSnapshot {
  runId: string;
  completedAt: string;
  mode: 'unscreened_only' | 'full_library' | 'qa_rescan' | 'benchmark' | 'newly_added_files';
  queryPrompt?: string;
}

export interface ModuleQaRescanRecord {
  id: string;
  moduleId: WorkbenchModuleId;
  query: string;
  answer: string;
  matchedArticleIds: string[];
  matchedTitles?: string[];
  matchedCount: number;
  totalScanned: number;
  rescanDecisionsApplied?: boolean;
  engine?: string;
  createdAt: string;
}

export interface BriefingChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  model?: string;
  citationStyle?: string;
  citedPaperCount?: number;
  responseMode?: string;
  timestamp: string;
}

export interface BriefingStudioSavedState {
  scopeMode?: 'included' | 'included_starred' | 'selected' | 'all';
  excludedPaperIds?: string[];
  citationStyle?: string;
  responseMode?: 'qa' | 'flexible_review' | 'rq_matrix' | 'methods_critique' | 'custom_outline';
  customOutline?: string;
  selectedModel?: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  chatHistory?: BriefingChatTurn[];
  podcastEpisode?: PodcastEpisode | null;
  updatedAt?: string;
}

export interface ProposalSavedState {
  activeTab?: 'proposal' | 'included_table';
  customInstructions?: string;
  proposal?: NotebookProposal | null;
  updatedAt?: string;
}

export interface ExportConfigSavedState {
  selectedFormat?: 'markdown' | 'word' | 'notebooklm';
  citationStyle?: string;
  citationSourceType?: string;
  includeAbstract?: boolean;
  includePicoc?: boolean;
  includeRqs?: boolean;
  includeCoreNineSections?: boolean;
  includePrismaCounts?: boolean;
  includeAppraisalMatrix?: boolean;
  includePageEvidence?: boolean;
  includeExtractionTable?: boolean;
  includeReferences?: boolean;
  updatedAt?: string;
}

export interface WorkbenchState {
  lastAutoSavedAt?: string;
  lastSavedModule?: WorkbenchModuleId;
  batchScreener?: {
    lastStats?: BatchScreenerStatsSnapshot | null;
    lastRunAt?: string;
    history?: BatchScreenerRunRecord[];
  };
  briefing?: BriefingStudioSavedState;
  proposal?: ProposalSavedState;
  exportConfig?: ExportConfigSavedState;
  quantSynthesis?: QuantSynthesisSavedState;
  protocolBuilder?: ProtocolBuilderSavedState;
  moduleNotes?: Record<string, string>;
  moduleLastSavedAt?: Record<string, string>;
  qaRescans?: Partial<Record<WorkbenchModuleId, ModuleQaRescanRecord[]>>;
}

export type ProtocolStatus =
  | 'draft'
  | 'under_review'
  | 'needs_revision'
  | 'approved'
  | 'superseded'
  | 'archived';

export type ProtocolValidationStatus =
  | 'passed'
  | 'warning'
  | 'needs_revision'
  | 'not_assessed';

export interface ProtocolTopicAnalysis {
  initialTopicInput: string;
  proposedTitle: string;
  discipline: string;
  domain: string;
  subdomain: string;
  focusAndScope: string;
  theoreticalMotivation: string;
  researchProblem: string;
  knowledgeGaps: string;
  knowledgeGapVerifiedByEvidence: boolean;
  geographicEligibility: string;
  publicationYearEligibility: string;
  eligibleStudyDesigns: string;
  eligiblePublicationTypes: string;
  targetPopulation: string;
  interventionOrFocus: string;
  comparisonBaseline: string;
  measurableOutcomes: string;
  contextAndConstraints: string;
  isPreliminaryAiSuggestion: boolean;
  approvedByResearcher: boolean;
}

export interface ProtocolReviewMethodAlternative {
  reviewType: LiteratureReviewTypeId;
  name: string;
  methodologicalGuidance: string;
  reportingGuideline: string;
  suitabilitySummary: string;
}

export interface ProtocolReviewMethodRecommendation {
  recommendedReviewType: LiteratureReviewTypeId;
  recommendedPrimaryFramework: ReviewFrameworkType;
  complementaryFrameworks: ReviewFrameworkType[];
  methodologicalGuidance: string;
  reportingGuideline: string;
  recommendedAppraisalRoleNote: string;
  justification: string;
  alternatives: ProtocolReviewMethodAlternative[];
  approvedByResearcher: boolean;
}

export interface ProtocolFrameworkComponentItem {
  id: string;
  frameworkId: ReviewFrameworkType;
  componentCode: string;
  componentName: string;
  definition: string;
  proposedContent: string;
  keywords: string[];
  synonyms: string[];
  inclusionImplications: string;
  exclusionImplications: string;
  correspondingRqCodes: string[];
  dataExtractionRequirements: string[];
  consistencyNotes: string[];
  status: 'pending' | 'approved' | 'locked';
}

export interface ProtocolObjectiveItem {
  code: string;
  statement: string;
  mappedRqCodes: string[];
  status: 'pending' | 'approved' | 'locked';
}

export interface ProtocolRqMapping {
  code: string;
  question: string;
  mappedFrameworkComponents: string[];
  mappedObjectives: string[];
  searchConcepts: string[];
  eligibilityRequirements: string;
  requiredExtractionVariables: string[];
  evidenceType: string;
  proposedSynthesisMethod: string;
  consistencyIssues: string[];
  status: 'pending' | 'approved' | 'locked';
}

export interface ProtocolEligibilityRow {
  id: string;
  criterion: string;
  inclusionRequirement: string;
  exclusionRequirement: string;
  guidance: string;
  status: 'pending' | 'approved' | 'locked';
}

export interface ProtocolDatabaseSearchStrategy {
  id: string;
  databaseName: string;
  searchPlatform: string;
  exactSearchString: string;
  searchFields: string;
  keywordsAndSynonyms: string[];
  searchFilters: string;
  publicationYearRestrictions: string;
  languageRestrictions: string;
  executionDate: string;
  actualRetrievalCount: number | null;
  strategyVersion: string;
  verificationStatus: 'draft' | 'validated' | 'verified_by_researcher';
  syntaxIssues: string[];
  alternativeStrategy: string;
  executedByResearcher: boolean;
}

export interface ProtocolMethodologySection {
  number: number;
  key: string;
  title: string;
  proposedContent: string;
  methodologicalJustification: string;
  requiredResearcherDecisions: string[];
  supportingReferences: string[];
  completionStatus: 'draft' | 'complete';
  approvalStatus: 'pending' | 'approved' | 'locked';
}

export interface ProtocolExtractionVariablePlan {
  id: string;
  rqCode: string;
  relatedObjective: string;
  variableName: string;
  definition: string;
  dataType: 'categorical' | 'numeric' | 'continuous' | 'binary' | 'text' | 'date';
  measurementUnits: string;
  expectedEvidenceSource: string;
  suggestedExtractionMethod: string;
  proposedSynthesisApproach: string;
  approved: boolean;
}

export interface ProtocolAppraisalPlanItem {
  id: string;
  studyDesign: string;
  recommendedInstrument: string;
  appraisalDomains: string[];
  assessmentCriteria: string[];
  scoringApproach: string;
  verificationStatus: 'planned' | 'verified_by_researcher';
  methodologicalJustification: string;
}

export interface ProtocolSynthesisPlan {
  qualitativeMethods: string[];
  quantitativeMethods: string[];
  metaAnalysisFeasibility: 'feasible' | 'conditional' | 'not_feasible';
  feasibilityChecks: {
    studyDesignCompatibility: string;
    outcomeComparability: string;
    effectSizeAvailability: string;
    statisticalDataAvailability: string;
    measurementConsistency: string;
    heterogeneityExpectation: string;
    expectedEligibleStudies: string;
    varianceAvailability: string;
  };
  feasibilityRationale: string;
  recommendedAlternatives: string[];
  narrativeSummary: string;
  approvedByResearcher: boolean;
}

export interface ProtocolPrismaChecklistItem {
  id: string;
  standard: 'PRISMA-2020' | 'PRISMA-S' | 'PRISMA-ScR';
  itemNumber: string;
  section: string;
  requirement: string;
  plannedProcedure: string;
  status: 'complete' | 'partial' | 'missing';
  warningNote: string;
}

export interface ProtocolValidationIssue {
  issueId: string;
  description: string;
  affectedSection: string;
  severity: 'high' | 'medium' | 'low';
  explanation: string;
  recommendedCorrection: string;
  potentialImpact: string;
  researcherDecision: 'pending' | 'accepted' | 'overridden' | 'deferred';
  resolutionStatus: ProtocolValidationStatus;
}

export interface ProtocolAmendmentRecord {
  id: string;
  versionNumber: string;
  modifiedSection: string;
  previousContent: string;
  revisedContent: string;
  reason: string;
  modifiedAt: string;
  responsibleUser: string;
  approvalStatus: 'pending_review' | 'approved';
  affectedArticleCount?: number;
}

export interface ProtocolVersionSnapshot {
  versionId: string;
  versionNumber: string;
  status: ProtocolStatus;
  createdAt: string;
  modifiedAt: string;
  author: string;
  frameworkType: ReviewFrameworkType;
  changeSummary: string;
  protocolData: Omit<SystematicReviewProtocol, 'versionHistory' | 'amendments'>;
}

export interface SystematicReviewProtocol {
  id: string;
  projectId: string;
  versionNumber: string;
  status: ProtocolStatus;
  activeStep: number;
  createdAt: string;
  updatedAt: string;
  author: string;
  changeSummary: string;
  lockedSections: string[];
  topicAnalysis: ProtocolTopicAnalysis;
  reviewMethodRecommendation: ProtocolReviewMethodRecommendation;
  frameworkComponents: ProtocolFrameworkComponentItem[];
  generalObjective: string;
  specificObjectives: ProtocolObjectiveItem[];
  rqMappings: ProtocolRqMapping[];
  eligibilityMatrix: ProtocolEligibilityRow[];
  standardizedExclusionReasons: string[];
  databaseSearchStrategies: ProtocolDatabaseSearchStrategy[];
  methodologySections: ProtocolMethodologySection[];
  extractionPlan: ProtocolExtractionVariablePlan[];
  appraisalPlan: ProtocolAppraisalPlanItem[];
  synthesisPlan: ProtocolSynthesisPlan;
  prismaChecklist: ProtocolPrismaChecklistItem[];
  validationIssues: ProtocolValidationIssue[];
  validationSummary: {
    status: ProtocolValidationStatus;
    consistencyRatio: number;
    passedCount: number;
    warningCount: number;
    needsRevisionCount: number;
    disclaimer: string;
    assessedAt: string;
  };
  downstreamImpactWarning?: {
    hasScreenedArticles: boolean;
    screenedCount: number;
    extractedCount: number;
    message: string;
    requiresResearcherReview: boolean;
    affectedRecords?: Array<{
      id: string;
      title: string;
      year?: number;
      decision?: string;
      reason: string;
    }>;
  };
  activatedAt?: string;
  activatedVersion?: string;
  versionHistory: ProtocolVersionSnapshot[];
  amendments: ProtocolAmendmentRecord[];
}

export interface ProtocolBuilderSavedState {
  activeProtocol?: SystematicReviewProtocol | null;
  lastValidatedAt?: string;
  updatedAt?: string;
}

export interface PrismaNumbers {
  recordsIdentified: number;
  databaseCounts: Record<string, number>;
  duplicatesRemoved: number;
  recordsScreened: number;
  excludedAtTitleAbstract: number;
  fullTextsAssessed: number;
  fullTextsExcluded: number;
  fullTextExclusionReasons: Record<string, number>;
  includedQualitative: number;
  includedQuantitative: number;
}

export interface SynthesisSection {
  number: number;
  title: string;
  markdownContent: string;
}

export interface NotebookProposal {
  title: string;
  executiveSummary: string;
  sections: SynthesisSection[];
  keyTakeaways: string[];
  citationIndex: {
    number: number;
    doi: string;
    citation: string;
    keyFindings: string;
  }[];
}

export interface PodcastDialogueTurn {
  speaker: 'Dr. Sarah (Methodologist)' | 'Dr. Alex (Domain Specialist)';
  text: string;
  topic?: string;
  citedStudyIndex?: number;
}

export interface PodcastEpisode {
  title: string;
  subtitle: string;
  durationEst: string;
  summary: string;
  script: PodcastDialogueTurn[];
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  timestamp: number;
  resultsCount: number;
  isPinned?: boolean;
  filters?: {
    stageFilter?: string;
    sourceFilter?: string;
  };
}

export interface DeletedOnlineArticleRecord {
  archiveId: string;
  projectId: string;
  article: Article;
  deletedAt: string;
  deletionMode?: string;
  reviewerInterestSelected?: boolean;
  reviewerInterestNote?: string;
}
