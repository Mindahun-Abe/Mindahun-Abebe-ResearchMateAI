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

