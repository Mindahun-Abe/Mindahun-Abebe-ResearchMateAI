import { Article, ArticleExtractedData, ArticleGeographicAssessment, ReviewProject } from '../types';
import {
  getActiveFrameworkFieldEntries,
  getFrameworkDefinition,
  getReviewTypeDefinition,
} from './protocolFrameworks';
import { assessGeographicEligibility } from './geographicSensing';
import {
  evaluateIntegratedConceptAlignment,
  evaluateRuleWithPhraseInterconnection,
  IntegratedConceptAlignment,
} from './conceptScreeningEngine';

export const DATABASE_PROVENANCE_OPTIONS = [
  'Google Scholar',
  'Scopus',
  'PubMed',
  'ScienceDirect',
  'MDM',
  'MDPI',
  'Web of Science',
  'IEEE Xplore',
  'Crossref',
  'arXiv',
  'OpenAlex',
  'Semantic Scholar',
  'CAB Abstracts',
  'Springer',
  'Wiley',
  'Manual',
  'Other',
] as const;

export interface SourceProvenanceResult {
  database: string;
  detectedFrom: string;
  isExplicit: boolean;
}

export interface PaperClassificationResult {
  category: 'Original Research' | 'Review';
  subType: string;
  confidence: number;
  indicators: string[];
}

export interface ProtocolFocusDimension {
  key: string;
  label: string;
  keywords: string[];
  source: string;
}

export interface ProtocolExtractionFocus {
  domainLabel: string;
  focusDimensions: ProtocolFocusDimension[];
  protocolKeywords: string[];
}

export interface PicocMatchDetail {
  dimension: string;
  matchedTerms: string[];
  evidenceSnippet: string;
}

export interface ResearchQuestionMatchDetail {
  code: string;
  question: string;
  matchedTerms: string[];
  evidenceSnippet: string;
  relevanceScore: number;
}

export interface CriterionCodingRow {
  dimension: string;
  rule: string;
  status: 'Aligned' | 'Partial' | 'Not Evidenced';
  extractedValue: string;
  evidenceQuote: string;
}

export interface ArticleCodeDetailAnalysis {
  protocolAlignmentScore: number;
  matchedPicoc: PicocMatchDetail[];
  matchedResearchQuestions: ResearchQuestionMatchDetail[];
  criteriaCoding: CriterionCodingRow[];
  softwareFrameworks: string[];
  repositoriesAndLinks: string[];
  hardwareAndCompute: string[];
  hyperparametersAndSpecs: string[];
  quantitativeSnippets: string[];
}

export type PrismaDiagnosticCode =
  | 'not_relevant_topic'
  | 'not_primary_research'
  | 'not_english'
  | 'wrong_study_area'
  | 'not_accessible'
  | 'outside_publication_year'
  | 'abstract_only'
  | 'lack_clear_assessment';

export type NotPrimarySubType =
  | 'conference_abstract'
  | 'thesis'
  | 'review_article'
  | 'editorial_letter'
  | 'book_chapter';

export interface PrismaDiagnosticCategoryMeta {
  code: PrismaDiagnosticCode;
  label: string;
  shortLabel: string;
  description: string;
}

export const PRISMA_DIAGNOSTIC_CATEGORIES: PrismaDiagnosticCategoryMeta[] = [
  {
    code: 'not_relevant_topic',
    label: 'Not relevant to the topic',
    shortLabel: 'Not Relevant to Topic',
    description: 'Low or zero alignment with SLR protocol title, scope, and PICOC Population/Intervention terms.',
  },
  {
    code: 'not_primary_research',
    label: 'Not primary research (conference abstract, thesis, review articles, editorial letter, book chapter)',
    shortLabel: 'Not Primary Research',
    description: 'Secondary review, conference abstract, thesis/dissertation, editorial/letter, or book chapter.',
  },
  {
    code: 'not_english',
    label: 'Not-English language',
    shortLabel: 'Not-English Language',
    description: 'Non-English manuscript language, non-Latin script, or explicit non-English tag.',
  },
  {
    code: 'wrong_study_area',
    label: 'Wrong study area',
    shortLabel: 'Wrong Study Area',
    description: 'Geographic study area conflicts with protocol geographic eligibility or PICOC context.',
  },
  {
    code: 'not_accessible',
    label: 'Not accessible papers',
    shortLabel: 'Not Accessible',
    description: 'Full text behind paywall, broken link, retrieval failure, or zero text/URL access.',
  },
  {
    code: 'outside_publication_year',
    label: 'Outside publication year',
    shortLabel: 'Outside Pub. Year',
    description: 'Publication year falls outside the protocol eligible year window.',
  },
  {
    code: 'abstract_only',
    label: 'Abstract-only paper',
    shortLabel: 'Abstract Only',
    description: 'Only abstract available (meeting/conference abstract or missing full-text manuscript).',
  },
  {
    code: 'lack_clear_assessment',
    label: 'Lack of clear assessment to review title',
    shortLabel: 'Lack Clear Assessment',
    description: 'Lacks empirical outcome metrics, evaluation design, or RQ/title assessment aligned to SLR focus.',
  },
];

export const NOT_PRIMARY_SUBTYPE_LABELS: Record<NotPrimarySubType, string> = {
  conference_abstract: 'Conference Abstract',
  thesis: 'Thesis / Dissertation',
  review_article: 'Review Article',
  editorial_letter: 'Editorial / Letter',
  book_chapter: 'Book Chapter',
};

export interface PrismaDiagnosticFlag {
  code: PrismaDiagnosticCode;
  label: string;
  shortLabel: string;
  detected: boolean;
  isManualOverride?: boolean;
  confidence: number;
  reason: string;
  evidenceSnippet: string;
  notPrimarySubType?: NotPrimarySubType;
  notPrimarySubLabel?: string;
}

export interface PrismaExclusionDiagnostics {
  flags: PrismaDiagnosticFlag[];
  detectedCodes: PrismaDiagnosticCode[];
  notPrimarySubType?: NotPrimarySubType;
  notPrimarySubLabel?: string;
  overallEligibilityStatus: 'Passes Protocol Checks' | '1+ Exclusion Flags Detected';
  primaryExclusionSummary: string;
}

export interface ArticleMatrixAnalysis {
  paperType: PaperClassificationResult;
  sourceProvenance: SourceProvenanceResult;
  extracted: ArticleExtractedData;
  codeDetailAnalysis: ArticleCodeDetailAnalysis;
  prismaDiagnostics: PrismaExclusionDiagnostics;
  geographicAssessment: ArticleGeographicAssessment;
  conceptAlignment: IntegratedConceptAlignment;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'without', 'using',
  'based', 'only', 'study', 'studies', 'paper', 'papers', 'research', 'article',
  'articles', 'data', 'analysis', 'method', 'methods', 'review', 'empirical',
  'must', 'should', 'include', 'exclude', 'included', 'excluded', 'related',
  'between', 'across', 'within', 'under', 'over', 'such', 'other', 'more', 'than',
  'not', 'non', 'all', 'any', 'are', 'were', 'was', 'have', 'has', 'being',
  'which', 'their', 'these', 'those', 'both', 'each', 'also', 'when', 'where',
  'high', 'low', 'new', 'well', 'used', 'use', 'can', 'may', 'will', 'most',
]);

function extractTerms(text: string): string[] {
  if (!text) return [];
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    )
  );
}

function getSearchableCorpus(article: Article): string {
  const pagesText = (article.pages || []).map((p) => p.content || '').join(' ');
  const citationsText = (article.evidenceCitations || [])
    .map((c) => `${c.section || ''} ${c.quote || ''} ${c.relevance || ''}`)
    .join(' ');
  return [
    article.title || '',
    article.abstract || '',
    article.journal || '',
    article.fullText || '',
    pagesText,
    citationsText,
    article.extractedData?.keyFindings || '',
    article.extractedData?.metrics || '',
    article.extractedData?.algorithm || '',
    article.extractedData?.platform || '',
    article.extractedData?.sensor || '',
    article.extractedData?.groundTruth || '',
  ]
    .filter(Boolean)
    .join(' ');
}

function splitSentences(text: string): string[] {
  if (!text) return [];
  return text
    .replace(/\r?\n+/g, '. ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
}

function findBestSentenceForTerms(sentences: string[], terms: string[]): string {
  if (sentences.length === 0 || terms.length === 0) return '';
  let bestSentence = '';
  let bestScore = 0;
  for (const s of sentences) {
    const lower = s.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (lower.includes(t)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestSentence = s;
    }
  }
  return bestSentence.slice(0, 220);
}

/**
 * Detect or normalize where an article was found (Google Scholar, Scopus, PubMed, ScienceDirect, MDM, MDPI, etc.)
 */
export function detectArticleSourceDatabase(article: Article): SourceProvenanceResult {
  const rawDb = (article.sourceDatabase || '').trim();
  const rawLower = rawDb.toLowerCase();
  const doi = (article.doi || '').toLowerCase();
  const url = `${article.url || ''} ${article.openAccessUrl || ''}`.toLowerCase();
  const pubJournalFile = `${article.publisher || ''} ${article.journal || ''} ${article.sourceFileName || ''}`.toLowerCase();
  const headerSample = `${(article.fullText || '').slice(0, 1200)} ${(article.abstract || '').slice(0, 600)}`.toLowerCase();
  const combined = `${rawLower} ${url} ${pubJournalFile} ${headerSample}`;

  // Preserve explicit meaningful non-generic database assignment first
  const explicitNonGeneric =
    rawDb &&
    !['manual', 'unknown', 'other', 'local', 'import', 'auto', ''].includes(rawLower);

  if (explicitNonGeneric) {
    // Normalize common casing aliases while respecting explicit selection
    if (rawLower === 'google scholar' || rawLower === 'googlescholar') {
      return { database: 'Google Scholar', detectedFrom: 'Article metadata', isExplicit: true };
    }
    if (rawLower === 'scopus') {
      return { database: 'Scopus', detectedFrom: 'Article metadata', isExplicit: true };
    }
    if (rawLower === 'pubmed' || rawLower === 'medline') {
      return { database: 'PubMed', detectedFrom: 'Article metadata', isExplicit: true };
    }
    if (rawLower === 'sciencedirect' || rawLower === 'science direct') {
      return { database: 'ScienceDirect', detectedFrom: 'Article metadata', isExplicit: true };
    }
    if (rawLower === 'mdm') {
      return { database: 'MDM', detectedFrom: 'Article metadata', isExplicit: true };
    }
    if (rawLower === 'mdpi') {
      return { database: 'MDPI', detectedFrom: 'Article metadata', isExplicit: true };
    }
    return { database: rawDb, detectedFrom: 'Article metadata', isExplicit: true };
  }

  // Infer provenance from URL, DOI prefix, filename, publisher, or embedded header metadata
  if (url.includes('scholar.google') || pubJournalFile.includes('scholar') || headerSample.includes('google scholar')) {
    return { database: 'Google Scholar', detectedFrom: 'URL / filename signature', isExplicit: false };
  }
  if (url.includes('scopus.com') || pubJournalFile.includes('scopus') || headerSample.includes('scopus')) {
    return { database: 'Scopus', detectedFrom: 'URL / file signature', isExplicit: false };
  }
  if (
    url.includes('pubmed.ncbi') ||
    url.includes('ncbi.nlm.nih.gov') ||
    pubJournalFile.includes('pubmed') ||
    /\bpmid\s*[:#]?\s*\d+/i.test(headerSample)
  ) {
    return { database: 'PubMed', detectedFrom: 'PubMed URL / PMID', isExplicit: false };
  }
  if (
    url.includes('sciencedirect.com') ||
    doi.startsWith('10.1016/') ||
    pubJournalFile.includes('sciencedirect') ||
    pubJournalFile.includes('elsevier')
  ) {
    return { database: 'ScienceDirect', detectedFrom: 'Elsevier / ScienceDirect DOI or URL', isExplicit: false };
  }
  if (/\bmdm\b/i.test(pubJournalFile) || /\bmdm\b/i.test(url) || /\bsource\s*:\s*mdm\b/i.test(headerSample)) {
    return { database: 'MDM', detectedFrom: 'MDM tag / filename', isExplicit: false };
  }
  if (url.includes('mdpi.com') || doi.startsWith('10.3390/') || pubJournalFile.includes('mdpi')) {
    return { database: 'MDPI', detectedFrom: 'MDPI DOI (10.3390) / URL', isExplicit: false };
  }
  if (url.includes('webofscience') || pubJournalFile.includes('web of science') || pubJournalFile.includes('clarivate') || /\bwos\b/i.test(pubJournalFile)) {
    return { database: 'Web of Science', detectedFrom: 'WoS / Clarivate metadata', isExplicit: false };
  }
  if (url.includes('ieeexplore') || doi.startsWith('10.1109/') || pubJournalFile.includes('ieee')) {
    return { database: 'IEEE Xplore', detectedFrom: 'IEEE DOI / URL', isExplicit: false };
  }
  if (url.includes('arxiv.org') || doi.startsWith('10.48550/') || pubJournalFile.includes('arxiv')) {
    return { database: 'arXiv', detectedFrom: 'arXiv identifier', isExplicit: false };
  }
  if (url.includes('springer') || doi.startsWith('10.1007/') || doi.startsWith('10.1038/') || pubJournalFile.includes('springer')) {
    return { database: 'Springer', detectedFrom: 'Springer / Nature DOI', isExplicit: false };
  }
  if (url.includes('wiley') || doi.startsWith('10.1002/') || doi.startsWith('10.1111/') || pubJournalFile.includes('wiley')) {
    return { database: 'Wiley', detectedFrom: 'Wiley DOI', isExplicit: false };
  }
  if (combined.includes('openalex')) {
    return { database: 'OpenAlex', detectedFrom: 'OpenAlex metadata', isExplicit: false };
  }
  if (combined.includes('crossref')) {
    return { database: 'Crossref', detectedFrom: 'Crossref metadata', isExplicit: false };
  }

  return {
    database: rawDb || 'Other',
    detectedFrom: rawDb ? 'Manual / Other' : 'Unattributed source',
    isExplicit: Boolean(rawDb),
  };
}

/**
 * Classify whether an article is an Original Research paper or a Review paper
 */
export function classifyPaperType(article: Article): PaperClassificationResult {
  const title = (article.title || '').trim();
  const titleLower = title.toLowerCase();
  const abstractLower = (article.abstract || '').toLowerCase();
  const studyTypeLower = (article.extractedData?.studyType || '').toLowerCase();
  const journalLower = (article.journal || '').toLowerCase();
  const bodySample = (article.fullText || '').slice(0, 5000).toLowerCase();
  const text = `${titleLower} ${abstractLower} ${studyTypeLower} ${bodySample}`;

  const indicators: string[] = [];
  let reviewScore = 0;
  let originalScore = 0;

  // Explicit title-level review cues (strongest signal)
  if (/\bsystematic\s+(literature\s+)?review\b/i.test(titleLower)) {
    reviewScore += 6;
    indicators.push('Title states "Systematic Review"');
  }
  if (/\bmeta-?analysis\b/i.test(titleLower)) {
    reviewScore += 6;
    indicators.push('Title states "Meta-Analysis"');
  }
  if (/\bscoping\s+review\b|\bumbrella\s+review\b|\bnarrative\s+review\b|\bcritical\s+review\b|\bliterature\s+review\b|\bstate[- ]of[- ]the[- ]art\s+review\b|\bcomprehensive\s+review\b/i.test(titleLower)) {
    reviewScore += 6;
    indicators.push('Title explicitly identifies paper as a review');
  }
  if (/\b:\s*a\s+review\b|\ba\s+review\s+of\b|\breview\s+on\b|\breview\s+article\b/i.test(titleLower)) {
    reviewScore += 5;
    indicators.push('Title follows review-article phrasing ("A Review of/on...")');
  }
  if (/\bbibliometric\s+(analysis|review|study)\b/i.test(titleLower)) {
    reviewScore += 5;
    indicators.push('Title indicates bibliometric review');
  }

  // Abstract / Body review methodology cues
  if (/\b(this|present|our)\s+(systematic\s+|scoping\s+|narrative\s+|literature\s+)?review\b/i.test(abstractLower)) {
    reviewScore += 4;
    indicators.push('Abstract states "this review..."');
  }
  if (/\bprisma\b|\bpicoc\b|\bdatabases\s+(were\s+)?searched\b|\binclusion\s+and\s+exclusion\s+criteria\b/i.test(text)) {
    reviewScore += 3;
    indicators.push('Reports systematic search / PRISMA / eligibility synthesis');
  }
  if (studyTypeLower.includes('review') || studyTypeLower.includes('meta-analysis') || journalLower.includes('reviews')) {
    reviewScore += 3;
    indicators.push('Study type or review journal metadata indicates review');
  }

  // Original empirical / experimental / modeling research cues
  if (/\b(we\s+propose|we\s+developed|we\s+collected|we\s+conducted|we\s+evaluated|we\s+trained|we\s+measured|this\s+study\s+investigates|field\s+experiment|experimental\s+plot|field\s+trial|field\s+campaign)\b/i.test(abstractLower)) {
    originalScore += 4;
    indicators.push('Abstract describes original data collection, experiment, or model implementation');
  }
  if (/\b(study\s+area|sampling\s+sites?|ground[- ]truth|laboratory\s+analysis|cohort|patients?|participants?|randomized|controlled\s+trial|case\s+study)\b/i.test(text)) {
    originalScore += 3;
    indicators.push('Reports primary study area, cohort, sampling, or ground-truth measurements');
  }
  if (/\b(cross[- ]validation|training\s+(and\s+)?test(ing)?\s+set|rmse|mae|f1[- ]score|auc[- ]roc|r\^?2|overall\s+accuracy|p\s*<\s*0\.\d+)\b/i.test(text)) {
    originalScore += 3;
    indicators.push('Reports primary quantitative validation / performance metrics');
  }
  if (/\bn\s*=\s*\d+\s*(samples|plots|points|patients|participants|images|gullies|sites|trees|leaves)\b/i.test(text)) {
    originalScore += 3;
    indicators.push('Reports empirical sample count (n = ...)');
  }
  if (studyTypeLower.includes('original') || studyTypeLower.includes('empirical') || studyTypeLower.includes('experimental') || studyTypeLower.includes('field')) {
    originalScore += 3;
    indicators.push('Study type metadata states Original/Empirical research');
  }

  // Determine sub-type label
  let detectedCategory: 'Original Research' | 'Review' =
    reviewScore > originalScore && reviewScore >= 4 ? 'Review' : 'Original Research';

  if (article.paperCategory === 'Original Research' || article.paperCategory === 'Review') {
    detectedCategory = article.paperCategory;
  }

  let subType = article.paperSubType || '';
  if (!subType) {
    if (detectedCategory === 'Review') {
      if (/\bmeta-?analysis\b/i.test(text)) subType = 'Systematic Review & Meta-Analysis';
      else if (/\bsystematic\b|\bprisma\b/i.test(text)) subType = 'Systematic Literature Review';
      else if (/\bscoping\b/i.test(text)) subType = 'Scoping Review';
      else if (/\bbibliometric\b/i.test(text)) subType = 'Bibliometric Review';
      else subType = 'Narrative / Literature Review';
    } else {
      if (/\brandomized|clinical\s+trial|cohort\b/i.test(text)) subType = 'Original Clinical / Cohort Study';
      else if (/\bfield\s+(experiment|trial|survey|campaign)|plot|catchment\b/i.test(text)) subType = 'Original Field / Empirical Study';
      else if (/\bsimulation|benchmark|architecture|neural\s+network|deep\s+learning|algorithm\b/i.test(text)) subType = 'Original Experimental / Modeling Study';
      else subType = 'Original Empirical Research';
    }
  }

  const diff = Math.abs(reviewScore - originalScore);
  const confidence = Math.min(98, Math.max(62, 68 + diff * 6));

  if (indicators.length === 0) {
    indicators.push(
      detectedCategory === 'Review'
        ? 'Classified via secondary synthesis patterns'
        : 'Default primary research classification (no review markers detected)'
    );
  }

  return {
    category: detectedCategory,
    subType,
    confidence,
    indicators: indicators.slice(0, 4),
  };
}

/**
 * Derive adaptive extraction focus dimensions from ANY SLR's Protocol & Framework
 */
export function deriveProtocolExtractionFocus(project: ReviewProject): ProtocolExtractionFocus {
  const activeFw = getFrameworkDefinition(project.frameworkType);
  const activeRev = getReviewTypeDefinition(project.reviewType);
  const activeEntries = getActiveFrameworkFieldEntries(project);

  const scopeBundle = [
    project.title,
    project.subtitle,
    project.scope,
    project.discipline,
    project.methodologyFocus,
    activeFw.name,
    activeRev.name,
    ...activeEntries.map((e) => e.value),
  ]
    .filter(Boolean)
    .join(' ');

  const lower = scopeBundle.toLowerCase();

  let domainLabel = project.discipline
    ? `${project.discipline} · ${activeFw.name} (${activeRev.name})`
    : `${activeFw.name} · ${activeRev.name}`;
  if (/\buav|drone|unmanned\s+aerial|remote\s+sensing|multispectral|hyperspectral|crop\s+health\b/i.test(lower)) {
    domainLabel = `UAV Remote Sensing & Precision Monitoring (${activeFw.name} · ${activeRev.name})`;
  } else if (/\bgully|erosion|watershed|catchment|landslide|susceptibility|gis|dem\b/i.test(lower)) {
    domainLabel = `Geospatial & Environmental Modeling (${activeFw.name} · ${activeRev.name})`;
  } else if (/\bclinical|patient|medical|disease|biomed|therapy|diagnosis|hospital\b/i.test(lower)) {
    domainLabel = `Biomedical & Clinical Evidence (${activeFw.name} · ${activeRev.name})`;
  } else if (/\bsoftware|code|llm|machine\s+learning|deep\s+learning|cyber|iot\b/i.test(lower)) {
    domainLabel = `Computing, AI & Software Systems (${activeFw.name} · ${activeRev.name})`;
  }

  const focusDimensions: ProtocolFocusDimension[] = activeEntries.map((entry) => ({
    key: entry.key,
    label: `${entry.label} (${entry.badge})`,
    keywords: extractTerms(
      entry.key === 'context' || entry.key === 'setting'
        ? `${entry.value} ${project.geographicEligibility || ''}`
        : entry.value
    ),
    source: `${activeFw.name} ${entry.badge}`,
  }));

  (project.inclusionCriteria || []).forEach((crit, i) => {
    focusDimensions.push({
      key: `crit_${crit.id || i}`,
      label: crit.dimension,
      keywords: extractTerms(`${crit.dimension} ${crit.includeRule}`),
      source: 'Eligibility Protocol',
    });
  });

  const protocolKeywords = Array.from(
    new Set(
      [
        ...extractTerms(scopeBundle),
        ...(project.researchQuestions || []).flatMap((rq) => extractTerms(`${rq.question} ${rq.mainEvidenceToCollect}`)),
      ].slice(0, 60)
    )
  );

  return {
    domainLabel,
    focusDimensions,
    protocolKeywords,
  };
}

function matchFirstPattern(text: string, patterns: { regex: RegExp; label: string | ((m: RegExpMatchArray) => string) }[]): string {
  const hits: string[] = [];
  for (const p of patterns) {
    const m = text.match(p.regex);
    if (m) {
      const val = typeof p.label === 'function' ? p.label(m) : p.label;
      if (val && !hits.includes(val)) hits.push(val);
    }
  }
  return hits.slice(0, 3).join(', ');
}

/**
 * Full high-detection extraction + code/detail analysis for an included (or candidate) article
 */
export function analyzeArticleForMatrix(article: Article, project: ReviewProject): ArticleMatrixAnalysis {
  const corpus = getSearchableCorpus(article);
  const lower = corpus.toLowerCase();
  const sentences = splitSentences(corpus);

  const paperType = classifyPaperType(article);
  const sourceProvenance = detectArticleSourceDatabase(article);
  const protocolFocus = deriveProtocolExtractionFocus(project);

  // 1. Platform / System / Cohort Extraction
  const detectedPlatform =
    article.extractedData?.platform ||
    matchFirstPattern(corpus, [
      { regex: /\b(DJI\s+(?:Matrice|Mavic|Phantom|Inspire|Agras)\s*[A-Z0-9-]*)/i, label: (m) => m[1].trim() },
      { regex: /\b(WingtraOne|eBee\s*X|SenseFly|Parrot\s+Bluegrass|fixed-wing\s+UAV|quadcopter|hexacopter|octocopter|VTOL\s+UAV|UAV|UAS|RPAS)\b/i, label: (m) => m[1] },
      { regex: /\b(Sentinel-[12]|Landsat-[789]|MODIS|ALOS\s*PALSAR|PlanetScope|WorldView-[23]|SRTM)\b/i, label: (m) => m[1] },
      { regex: /\b(Jetson\s+(?:Nano|Xavier|Orin)|Raspberry\s+Pi|edge\s+computing\s+node|cloud\s+pipeline|GIS\s+framework)\b/i, label: (m) => m[1] },
      { regex: /\b(randomized\s+controlled\s+trial|multi-center\s+cohort|hospital\s+ICU|mobile\s+health\s+app)\b/i, label: (m) => m[1] },
    ]) ||
    '';

  // 2. Sensor / Modality / Data Source Extraction
  const detectedSensor =
    article.extractedData?.sensor ||
    matchFirstPattern(corpus, [
      { regex: /\b(MicaSense\s+(?:RedEdge|Altum)[A-Za-z0-9-]*|Parrot\s+Sequoia|Headwall\s+Nano|Resonon\s+Pika|FLIR\s+[A-Za-z0-9-]+)\b/i, label: (m) => m[1] },
      { regex: /\b(hyperspectral|multispectral|thermal\s+infrared|TIR|LiDAR|SAR|RGB|NIR|SWIR|fluorescence)\b/i, label: (m) => m[1] },
      { regex: /\b(DEM|digital\s+elevation\s+model|topographic\s+wetness\s+index|TWI|soil\s+samples?|climatic\s+stations?)\b/i, label: (m) => m[1] },
      { regex: /\b(MRI|CT\s+scan|ultrasound|ECG|EEG|genomic\s+sequencing|EHR|survey\s+questionnaire)\b/i, label: (m) => m[1] },
    ]) ||
    '';

  // 3. Spatial / Temporal Resolution (GSD / Scale) & Altitude
  const gsdMatch = corpus.match(/\b(\d+(?:\.\d+)?\s*(?:mm|cm|m|km)\s*(?:GSD|spatial\s+resolution|resolution|pixel\s+size))\b/i)
    || corpus.match(/\bGSD\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?\s*(?:mm|cm|m))\b/i);
  const detectedGsd = article.extractedData?.gsd || (gsdMatch ? gsdMatch[1].trim() : '');

  const altMatch = corpus.match(/\b(?:altitude|height|AGL)\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?\s*m(?:\s*AGL)?)\b/i);
  const detectedAltitude = article.extractedData?.altitude || (altMatch ? altMatch[1].trim() : '');

  // 4. Algorithm / Model / Analytical Method
  const detectedAlgorithm =
    article.extractedData?.algorithm ||
    matchFirstPattern(corpus, [
      { regex: /\b(XGBoost|LightGBM|CatBoost|Random\s+Forest|Gradient\s+Boosting|Support\s+Vector\s+Machine|SVM)\b/i, label: (m) => m[1] },
      { regex: /\b(YOLOv\d+|Vision\s+Transformer|ViT|Swin\s+Transformer|U-Net|ResNet-?\d*|DenseNet|EfficientNet|Mask\s+R-CNN|1D-?CNN|2D-?CNN|3D-?CNN|CNN|LSTM|GRU|GAN|GNN)\b/i, label: (m) => m[1] },
      { regex: /\b(NDVI|NDRE|CWSI|SAVI|EVI|PRI|vegetation\s+indic(?:es|ators))\b/i, label: (m) => m[1] },
      { regex: /\b(AHP|Analytical\s+Hierarchy\s+Process|Frequency\s+Ratio|Logistic\s+Regression|Cox\s+proportional|ANOVA|linear\s+regression|random[- ]effects\s+meta-analysis|Bayesian)\b/i, label: (m) => m[1] },
    ]) ||
    '';

  // 5. Latency / Turnaround Runtime
  const latencyMatch = corpus.match(
    /\b(\d+(?:\.\d+)?\s*(?:ms|milliseconds?|s|sec|seconds?|min|minutes?|h|hrs?|hours?)\s*(?:turnaround|latency|processing\s+time|inference|runtime|per\s+ha|end-to-end)?|\d+(?:\.\d+)?\s*fps)\b/i
  );
  const hasRealTimeMention = /\breal-time\b|\bedge\s+inference\b|\bon-board\s+processing\b/i.test(corpus);
  const detectedLatency =
    article.extractedData?.latency ||
    (latencyMatch ? latencyMatch[1].trim() : hasRealTimeMention ? 'Real-time (unspecified ms)' : '');
  const latencyReported = Boolean(
    article.extractedData?.latencyReported ||
      (detectedLatency && detectedLatency !== 'Not reported')
  );

  // 6. Quantitative Accuracy / Performance Metrics
  const metricMatches = Array.from(
    corpus.matchAll(
      /\b((?:R\^?2|R²|AUC(?:-ROC)?|F1(?:-score)?|RMSE|MAE|MSE|MAPE|IoU|mAP|OA|overall\s+accuracy|accuracy|precision|recall|sensitivity|specificity|kappa|p)\s*(?:=|of|:|<|>|≤|≥)?\s*\d+(?:\.\d+)?%?)/gi
    )
  ).map((m) => m[1].replace(/\s+/g, ' ').trim());
  const uniqueMetrics = Array.from(new Set(metricMatches)).slice(0, 4);
  const detectedMetrics = article.extractedData?.metrics || uniqueMetrics.join('; ');

  // 7. Ground Truth & Spatial Leakage Check
  const detectedGroundTruth =
    article.extractedData?.groundTruth ||
    matchFirstPattern(corpus, [
      { regex: /\b(SPAD|chlorophyll\s+meter|leaf\s+water\s+potential|stomatal\s+conductance|spectroradiometer|ASD\s+FieldSpec)\b/i, label: (m) => m[1] },
      { regex: /\b(RTK-?GPS|DGPS|field\s+inventory|gully\s+inventory|ground\s+survey|visual\s+inspection|expert\s+labeling)\b/i, label: (m) => m[1] },
      { regex: /\b(biopsy|histopathology|PCR|laboratory\s+assay|clinical\s+diagnosis|benchmark\s+dataset)\b/i, label: (m) => m[1] },
    ]) ||
    '';

  const spatialLeakageAddressed = Boolean(
    article.extractedData?.spatialLeakageAddressed ||
      /\b(spatial[- ]block|spatial\s+cross[- ]validation|leave-one-(?:site|field|catchment|farm)-out|spatial\s+buffer|independent\s+site|cross[- ]season\s+validation|external\s+validation)\b/i.test(lower)
  );

  // 8. Sample Size & Multi-Scale Geographic Region (Global -> Continental -> Country -> Regional -> Zonal -> Woreda -> Watershed)
  const sampleMatch = corpus.match(/\b(n\s*=\s*\d+(?:,\d{3})*|\d+(?:,\d{3})*\s*(?:plots|samples|images|polygons|gullies|catchments|patients|participants|farms|fields))\b/i);
  const detectedSampleSize = article.extractedData?.sampleSize || (sampleMatch ? sampleMatch[1].trim() : '');

  const geoAssessment = assessGeographicEligibility(article, project);
  const detectedRegion =
    article.extractedData?.geographicRegion ||
    (geoAssessment.detectedScale !== 'unspecified' ? geoAssessment.primaryPlaceLabel : '');

  // 9. Code, Software Tools, Repositories & Compute Detection
  const softwarePatterns = [
    'Python', 'PyTorch', 'TensorFlow', 'Keras', 'Scikit-learn', 'OpenCV', 'GDAL', 'Rasterio',
    'Google Earth Engine', 'GEE', 'QGIS', 'ArcGIS', 'Pix4D', 'Agisoft Metashape', 'OpenDroneMap',
    'MATLAB', 'R Studio', 'R statistical', 'SPSS', 'Stata', 'SAS', 'Docker', 'ONNX', 'TensorRT',
    'ROS', 'CUDA', 'Pandas', 'NumPy', 'GeoPandas', 'SHAP',
  ];
  const softwareFrameworks = softwarePatterns.filter((sw) => {
    const escaped = sw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(corpus);
  });

  const repoMatches = Array.from(
    corpus.matchAll(/https?:\/\/(?:github\.com|gitlab\.com|zenodo\.org|huggingface\.co|figshare\.com|osf\.io)\/[^\s)>\]"']+/gi)
  ).map((m) => m[0]);
  const repositoriesAndLinks = Array.from(new Set(repoMatches)).slice(0, 5);
  if (repositoriesAndLinks.length === 0 && /\b(github|code\s+is\s+available|open[- ]source\s+code|publicly\s+available\s+code)\b/i.test(corpus)) {
    repositoriesAndLinks.push('Code availability noted in manuscript text');
  }

  const hardwareMatches = Array.from(
    corpus.matchAll(/\b(NVIDIA\s+(?:RTX|GTX|A100|V100|T4|Jetson\s+[A-Za-z]+)\s*\d*|Jetson\s+(?:Nano|Xavier|Orin)|Intel\s+(?:Core|Xeon)\s*[A-Za-z0-9-]+|Edge\s+TPU|FPGA|Raspberry\s+Pi\s*\d*)\b/gi)
  ).map((m) => m[0].trim());
  const hardwareAndCompute = Array.from(new Set(hardwareMatches)).slice(0, 5);

  const hyperMatches = Array.from(
    corpus.matchAll(/\b(\d+-?fold\s+(?:cross[- ]validation|CV)|learning\s+rate\s*(?:of|=|:)?\s*[\d.e-]+|batch\s+size\s*(?:of|=|:)?\s*\d+|\d+\s*epochs?|\d+\s*trees|overlap\s*(?:of|=|:)?\s*\d+%)\b/gi)
  ).map((m) => m[0].trim());
  const hyperparametersAndSpecs = Array.from(new Set(hyperMatches)).slice(0, 6);

  // 10. Protocol Framework & Research Questions Alignment (Phrase-Interconnected + 4-Pillar Synthesis)
  const conceptAlignment = evaluateIntegratedConceptAlignment(article, project);
  const normCorpus = lower
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9.\s/-]+/g, ' ')
    .replace(/[-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normSentences = sentences.map((s) =>
    s
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9.\s/-]+/g, ' ')
      .replace(/[-/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

  const activeFramework = getFrameworkDefinition(project.frameworkType);
  const frameworkEntries = getActiveFrameworkFieldEntries(project);

  const matchedPicoc: PicocMatchDetail[] = frameworkEntries.map((entry) => {
    const isContextEntry = entry.key === 'context' || entry.key === 'setting';
    const rawText = isContextEntry
      ? `${entry.value} ${project.geographicEligibility || ''}`
      : entry.value;
    const ruleMatch = evaluateRuleWithPhraseInterconnection(rawText, normCorpus, normSentences);
    let matchedTerms = [...ruleMatch.matchedPhrases, ...ruleMatch.matchedSpecificTokens].slice(0, 6);
    if (matchedTerms.length === 0 && ruleMatch.isMatched) {
      matchedTerms = ruleMatch.matchedGenericTokens.slice(0, 6);
    }
    let evidenceSnippet = matchedTerms.length > 0 ? findBestSentenceForTerms(sentences, matchedTerms) : '';

    if (
      isContextEntry &&
      matchedTerms.length === 0 &&
      geoAssessment.detectedScale !== 'unspecified' &&
      geoAssessment.isEligible
    ) {
      matchedTerms = geoAssessment.detectedPlaces.slice(0, 4);
      evidenceSnippet = geoAssessment.interpretiveSummary;
    }

    return {
      dimension: `${entry.label} (${entry.badge})`,
      matchedTerms,
      evidenceSnippet,
    };
  });

  const matchedResearchQuestions: ResearchQuestionMatchDetail[] = (project.researchQuestions || []).map((rq) => {
    const rqRule = evaluateRuleWithPhraseInterconnection(
      `${rq.question} ${rq.mainEvidenceToCollect}`,
      normCorpus,
      normSentences
    );
    const terms = extractTerms(`${rq.question} ${rq.mainEvidenceToCollect}`);
    const matchedTerms = Array.from(
      new Set([...rqRule.matchedPhrases, ...rqRule.matchedSpecificTokens])
    ).slice(0, 6);
    const relevanceScore = rqRule.isMatched
      ? Math.min(100, Math.max(45, Math.round((matchedTerms.length / Math.max(1, Math.min(terms.length, 5))) * 100)))
      : 0;
    const evidenceSnippet = matchedTerms.length > 0 ? findBestSentenceForTerms(sentences, matchedTerms) : '';
    return {
      code: rq.code,
      question: rq.question,
      matchedTerms,
      evidenceSnippet,
      relevanceScore,
    };
  });

  const criteriaCoding: CriterionCodingRow[] = (project.inclusionCriteria || []).map((crit) => {
    const isGeoCrit = /\b(geo|geography|geographic|geographical|location|region|area|study\s*area|study\s*site|setting|context|country|countries|nation|zonal|woreda|watershed|catchment|basin|spatial|place)\b/i.test(
      `${crit.dimension} ${crit.includeRule} ${crit.excludeRule}`
    );
    if (isGeoCrit) {
      const status: CriterionCodingRow['status'] =
        geoAssessment.isEligible && geoAssessment.isGeographicConfirmed
          ? 'Aligned'
          : geoAssessment.isEligible
          ? 'Partial'
          : 'Not Evidenced';
      return {
        dimension: crit.dimension,
        rule: crit.includeRule,
        status,
        extractedValue:
          geoAssessment.detectedScale !== 'unspecified'
            ? `${geoAssessment.primaryPlaceLabel} (${geoAssessment.detectedScaleLabel}) — ${geoAssessment.verdictLabel}`
            : 'Study location unspecified',
        evidenceQuote: geoAssessment.evidenceSnippet || geoAssessment.interpretiveSummary,
      };
    }

    const ruleMatch = evaluateRuleWithPhraseInterconnection(
      `${crit.dimension} ${crit.includeRule}`,
      normCorpus,
      normSentences
    );
    const matched = [...ruleMatch.matchedPhrases, ...ruleMatch.matchedSpecificTokens];
    const status: CriterionCodingRow['status'] =
      ruleMatch.isMatched && (ruleMatch.matchedPhrases.length > 0 || matched.length >= 2)
        ? 'Aligned'
        : ruleMatch.isMatched
        ? 'Partial'
        : 'Not Evidenced';
    const evidenceQuote = matched.length > 0 ? findBestSentenceForTerms(sentences, matched) : '';
    return {
      dimension: crit.dimension,
      rule: crit.includeRule,
      status,
      extractedValue: matched.length > 0 ? matched.slice(0, 5).join(', ') : 'No interconnected phrase match',
      evidenceQuote,
    };
  });

  const picocHits = matchedPicoc.filter((p) => p.matchedTerms.length > 0).length;
  const rqHits = matchedResearchQuestions.filter((r) => r.matchedTerms.length > 0).length;
  const critHits = criteriaCoding.filter((c) => c.status !== 'Not Evidenced').length;
  const totalChecks = Math.max(matchedPicoc.length, 1) + Math.max(matchedResearchQuestions.length, 1) + Math.max(criteriaCoding.length, 1);
  const rawScore = Math.round(((picocHits + rqHits + critHits) / totalChecks) * 100);
  const protocolAlignmentScore = article.extractedData?.protocolAlignmentScore ?? Math.min(99, Math.max(20, rawScore + 18));

  const quantitativeSnippets = sentences
    .filter((s) => /\d+(?:\.\d+)?\s*(%|ms|min|cm|mm|m|km|fps|R2|R²|AUC|RMSE|F1)/i.test(s))
    .slice(0, 5);

  const softwareToolsStr = article.extractedData?.softwareTools || softwareFrameworks.join(', ');
  const codeRepoStr = article.extractedData?.codeRepository || repositoriesAndLinks.join(' | ');
  const hardwareStr = article.extractedData?.hardwareCompute || hardwareAndCompute.join(', ');

  const codedVariables: Record<string, string> = {
    ...(article.extractedData?.codedVariables || {}),
  };
  criteriaCoding.forEach((c) => {
    if (!codedVariables[c.dimension] && c.status !== 'Not Evidenced') {
      codedVariables[c.dimension] = `${c.status}: ${c.extractedValue}`;
    }
  });

  const extracted: ArticleExtractedData = {
    ...article.extractedData,
    studyType: article.extractedData?.studyType || `${paperType.category} (${paperType.subType})`,
    platform: detectedPlatform || article.extractedData?.platform,
    sensor: detectedSensor || article.extractedData?.sensor,
    gsd: detectedGsd || article.extractedData?.gsd,
    altitude: detectedAltitude || article.extractedData?.altitude,
    algorithm: detectedAlgorithm || conceptAlignment.analyticalModels.slice(0, 3).join(', ') || article.extractedData?.algorithm,
    latency: detectedLatency || article.extractedData?.latency,
    latencyReported,
    groundTruth: detectedGroundTruth || article.extractedData?.groundTruth,
    spatialLeakageAddressed,
    metrics: detectedMetrics || conceptAlignment.validationMetrics.slice(0, 3).join(', ') || article.extractedData?.metrics,
    geographicRegion: detectedRegion || article.extractedData?.geographicRegion,
    geographicScale: article.extractedData?.geographicScale || geoAssessment.detectedScale,
    geographicVerdict: geoAssessment.verdict,
    geographicInterpretation: geoAssessment.interpretiveSummary,
    geographicHierarchy: geoAssessment.hierarchy,
    geographicStudyEvidence: geoAssessment.evidenceSnippet || article.extractedData?.geographicStudyEvidence,
    sampleSize: detectedSampleSize || article.extractedData?.sampleSize,
    softwareTools: softwareToolsStr || undefined,
    codeRepository: codeRepoStr || undefined,
    hardwareCompute: hardwareStr || undefined,
    protocolAlignmentScore,
    matchedPicocSummary:
      article.extractedData?.matchedPicocSummary ||
      `${picocHits}/${matchedPicoc.length} ${activeFramework.name} · ${rqHits}/${matchedResearchQuestions.length || 0} RQs (${protocolFocus.domainLabel})`,
    codedVariables,
    suspectedCase:
      conceptAlignment.matchedCasePhrases[0] ||
      (conceptAlignment.caseAnchorMatched ? conceptAlignment.targetCasePhrases[0] : 'Case Not Matched'),
    conditioningFactors:
      conceptAlignment.conditioningFactors.length > 0
        ? conceptAlignment.conditioningFactors.slice(0, 6).join(', ')
        : undefined,
    analyticalModels:
      conceptAlignment.analyticalModels.length > 0
        ? conceptAlignment.analyticalModels.slice(0, 5).join(', ')
        : detectedAlgorithm || undefined,
    validationMetrics:
      conceptAlignment.validationMetrics.length > 0
        ? conceptAlignment.validationMetrics.slice(0, 4).join(', ')
        : detectedMetrics || undefined,
    integratedApplication:
      conceptAlignment.applicationOutcomes.length > 0
        ? conceptAlignment.applicationOutcomes.slice(0, 3).join(', ')
        : undefined,
    conceptAlignmentScore: conceptAlignment.integratedScore,
    integratedSummary: conceptAlignment.integratedSummary,
    keyFindings:
      article.extractedData?.keyFindings ||
      (quantitativeSnippets[0] ? quantitativeSnippets[0] : (article.abstract || '').slice(0, 240)),
  };

  const prismaDiagnostics = detectPrismaExclusionDiagnostics(
    article,
    project,
    paperType,
    {
      protocolAlignmentScore,
      matchedPicoc,
      matchedResearchQuestions,
      criteriaCoding,
      softwareFrameworks,
      repositoriesAndLinks,
      hardwareAndCompute,
      hyperparametersAndSpecs,
      quantitativeSnippets,
    },
    corpus,
    geoAssessment,
    conceptAlignment
  );

  return {
    paperType,
    sourceProvenance,
    extracted,
    codeDetailAnalysis: {
      protocolAlignmentScore,
      matchedPicoc,
      matchedResearchQuestions,
      criteriaCoding,
      softwareFrameworks,
      repositoriesAndLinks,
      hardwareAndCompute,
      hyperparametersAndSpecs,
      quantitativeSnippets,
    },
    prismaDiagnostics,
    geographicAssessment: geoAssessment,
    conceptAlignment,
  };
}

/**
 * Protocol-Adaptive PRISMA 2020 8-Point Diagnostic Detector:
 * Evaluates each paper against the active SLR's Protocol & Framework (title, scope, PICOC,
 * RQs, geographic eligibility, publication years, and eligibility criteria).
 */
export function detectPrismaExclusionDiagnostics(
  article: Article,
  project: ReviewProject,
  prePaperType?: PaperClassificationResult,
  preCodeDetail?: ArticleCodeDetailAnalysis,
  preCorpus?: string,
  preGeoAssessment?: ArticleGeographicAssessment,
  preConceptAlignment?: IntegratedConceptAlignment
): PrismaExclusionDiagnostics {
  const paperType = prePaperType || classifyPaperType(article);
  const corpus = preCorpus || getSearchableCorpus(article);
  const lower = corpus.toLowerCase();
  const titleLower = (article.title || '').toLowerCase();
  const abstractLower = (article.abstract || '').toLowerCase();
  const journalLower = (article.journal || '').toLowerCase();
  const reasonNotesLower = `${article.decisionReason || ''} ${article.screeningNotes || ''} ${article.reviewerNotes || ''}`.toLowerCase();
  const textSample = `${titleLower} ${abstractLower} ${journalLower} ${(article.sourceFileName || '').toLowerCase()} ${(article.fullText || '').slice(0, 2500).toLowerCase()}`;

  const manualFlags = new Set(article.prismaExclusionFlags || []);
  const applyOverride = (code: PrismaDiagnosticCode, autoDetected: boolean, autoReason: string, autoEvidence: string, autoConf: number) => {
    if (manualFlags.has(`clear:${code}`)) {
      return {
        detected: false,
        isManualOverride: true,
        confidence: 100,
        reason: 'Cleared manually by reviewer override',
        evidenceSnippet: '',
      };
    }
    if (manualFlags.has(code)) {
      return {
        detected: true,
        isManualOverride: true,
        confidence: 100,
        reason: autoDetected ? autoReason : 'Flagged manually by reviewer in PRISMA Audit',
        evidenceSnippet: autoEvidence || 'Reviewer-confirmed PRISMA diagnostic flag',
      };
    }
    return {
      detected: autoDetected,
      isManualOverride: false,
      confidence: autoConf,
      reason: autoReason,
      evidenceSnippet: autoEvidence,
    };
  };

  // --- 1. Not relevant to the topic (Interconnected compound-phrase check + case mismatch guard) ---
  const conceptAlign = preConceptAlignment || evaluateIntegratedConceptAlignment(article, project);
  const explicitOffTopic = /\b(not\s+relevant|off[- ]topic|out\s+of\s+scope|unrelated\s+(?:to\s+)?topic|outside\s+topic|wrong\s+topic|irrelevant|case\s+mismatch)\b/i.test(reasonNotesLower);
  const lowTopicOverlap =
    corpus.trim().length > 45 &&
    (conceptAlign.isOffTopicCaseMismatch ||
      (!conceptAlign.caseAnchorMatched && conceptAlign.targetCasePhrases.length > 0));
  const notRelDetected = explicitOffTopic || lowTopicOverlap;
  const notRelRes = applyOverride(
    'not_relevant_topic',
    notRelDetected,
    explicitOffTopic
      ? `Screening/decision reason notes off-topic scope`
      : conceptAlign.isOffTopicCaseMismatch
      ? conceptAlign.offTopicReason
      : lowTopicOverlap
      ? `Missing interconnected target phrase(s): ${conceptAlign.targetCasePhrases.slice(0, 3).join(', ')}`
      : `Aligned (${conceptAlign.pillarsMatchedCount}/4 concept pillars · ${conceptAlign.integratedScore}%): ${conceptAlign.matchedCasePhrases[0] || conceptAlign.targetCasePhrases[0] || 'Core focus matched'}`,
    explicitOffTopic
      ? (article.decisionReason || article.screeningNotes || '')
      : conceptAlign.integratedSummary || conceptAlign.evidenceQuote,
    explicitOffTopic ? 96 : lowTopicOverlap ? 91 : 90
  );

  // --- 2. Not primary research (conference abstract, thesis, review articles, editorial letter, book chapter) ---
  let subType: NotPrimarySubType | undefined;
  let notPrimaryEvidence = '';
  if (/\b(conference\s+abstract|meeting\s+abstract|symposium\s+abstract|poster\s+abstract|abstract\s+book|proceedings\s+abstract|extended\s+abstract|supplement\s+abstract)\b/i.test(`${textSample} ${reasonNotesLower}`)) {
    subType = 'conference_abstract';
    notPrimaryEvidence = 'Detected conference/meeting abstract phrasing in title, venue, or notes';
  } else if (/\b(phd\s+thesis|doctoral\s+(?:thesis|dissertation)|master'?s?\s+thesis|msc\s+thesis|bachelor'?s?\s+thesis|dissertation|thesis\s+submitted|proquest\s+dissertations)\b/i.test(`${textSample} ${reasonNotesLower}`)) {
    subType = 'thesis';
    notPrimaryEvidence = 'Detected thesis/dissertation signature';
  } else if (/\b(editorial|letter\s+to\s+the\s+editor|correspondence|commentary|viewpoint|erratum|corrigendum|retraction|book\s+review|perspective\s+letter)\b/i.test(`${titleLower} ${journalLower} ${reasonNotesLower}`)) {
    subType = 'editorial_letter';
    notPrimaryEvidence = 'Detected editorial, letter, commentary, or erratum publication type';
  } else if (/\b(book\s+chapter|in\s+book|edited\s+volume|chapter\s+\d+|encyclopedia\s+entry|handbook\s+of)\b/i.test(`${textSample} ${reasonNotesLower}`)) {
    subType = 'book_chapter';
    notPrimaryEvidence = 'Detected book chapter or handbook/encyclopedia entry';
  } else if (
    paperType.category === 'Review' ||
    /\b(review\s+article|narrative\s+review|systematic\s+review|meta-?analysis|scoping\s+review|literature\s+review|non-empirical\s+paper)\b/i.test(`${titleLower} ${reasonNotesLower}`)
  ) {
    subType = 'review_article';
    notPrimaryEvidence = paperType.indicators[0] || 'Detected secondary review/synthesis article';
  } else if (/\bnot\s+primary\s+research\b|\bsecondary\s+research\b|\bnon-empirical\b/i.test(reasonNotesLower)) {
    subType = 'review_article';
    notPrimaryEvidence = article.decisionReason || 'Flagged as non-primary research';
  }

  const notPrimaryDetected = Boolean(subType);
  const subTypeLabel = subType ? NOT_PRIMARY_SUBTYPE_LABELS[subType] : undefined;
  const notPrimaryRes = applyOverride(
    'not_primary_research',
    notPrimaryDetected,
    notPrimaryDetected
      ? `Classified as non-primary research (${subTypeLabel})`
      : `Primary / Original research (${paperType.subType})`,
    notPrimaryEvidence || (paperType.indicators[0] || ''),
    notPrimaryDetected ? Math.max(85, paperType.confidence) : paperType.confidence
  );

  // --- 3. Not-English language ---
  const explicitNonEnglish = /\b(not[- ]english|non[- ]english|not\s+in\s+english|foreign\s+language|language:\s*(?!english)[a-z]+|\[article\s+in\s+(?!english)[a-z]+\])\b/i.test(`${textSample} ${reasonNotesLower}`);
  const nonLatinRegex = /[\u4e00-\u9fff\u0400-\u04ff\u0600-\u06ff\u1200-\u137f\u0900-\u097f\u3040-\u30ff\uac00-\ud7af]/g;
  const titleAbstractRaw = `${article.title || ''} ${article.abstract || ''}`;
  const nonLatinMatches = titleAbstractRaw.match(nonLatinRegex) || [];
  const hasSignificantNonLatin = nonLatinMatches.length >= 6;
  const tokenWords = titleAbstractRaw.toLowerCase().split(/\s+/).filter(Boolean);
  const nonEnStopwords = new Set(['der', 'die', 'das', 'und', 'für', 'mit', 'les', 'des', 'une', 'pour', 'dans', 'avec', 'los', 'las', 'para', 'con', 'del', 'dos', 'com', 'não', 'della', 'degli', 'nel']);
  const enStopwords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'using', 'into']);
  const nonEnHits = tokenWords.filter((w) => nonEnStopwords.has(w)).length;
  const enHits = tokenWords.filter((w) => enStopwords.has(w)).length;
  const highForeignStopRatio = tokenWords.length >= 12 && nonEnHits >= 3 && nonEnHits > enHits;
  const notEnglishDetected = explicitNonEnglish || hasSignificantNonLatin || highForeignStopRatio;
  const notEngRes = applyOverride(
    'not_english',
    notEnglishDetected,
    explicitNonEnglish
      ? 'Non-English language explicitly indicated in metadata or notes'
      : hasSignificantNonLatin
      ? `Detected ${nonLatinMatches.length} non-Latin script characters in title/abstract`
      : highForeignStopRatio
      ? 'Detected predominantly non-English linguistic structure'
      : 'English language verified',
    explicitNonEnglish
      ? (article.decisionReason || 'Non-English indicator')
      : hasSignificantNonLatin
      ? titleAbstractRaw.slice(0, 120)
      : '',
    notEnglishDetected ? 94 : 92
  );

  // --- 4. Wrong study area (Multi-scale hierarchical sensing: Global -> Continental -> Country -> Regional -> Zonal -> Woreda -> Watershed) ---
  const geoAssessment = preGeoAssessment || assessGeographicEligibility(article, project);
  const wrongAreaDetected = !geoAssessment.isEligible;
  const wrongAreaEvidence = geoAssessment.evidenceSnippet
    ? `Scale: ${geoAssessment.detectedScaleLabel} | Verdict: ${geoAssessment.verdictLabel} | Places: ${geoAssessment.evidenceSnippet}`
    : `Scale: ${geoAssessment.detectedScaleLabel} | Verdict: ${geoAssessment.verdictLabel}`;
  const wrongAreaRes = applyOverride(
    'wrong_study_area',
    wrongAreaDetected,
    geoAssessment.interpretiveSummary,
    wrongAreaEvidence,
    geoAssessment.confidence
  );

  // --- 5. Not accessible papers (PRISMA 2020 Reports Sought vs Not Retrieved / Institution Confirmation) ---
  const hasAccessibleDiskPdf = Boolean(
    article.pdfStorage?.storage_status === 'stored_disk' ||
      (article.file_path && article.pdfStorage?.storage_status !== 'missing_binary') ||
      article.fullTextStatusDetails?.pdfAccessible ||
      article.fullTextStatusDetails?.classification === 'pdf_attached_extraction_failed' ||
      article.fullTextStatusDetails?.classification === 'full_text_retrieved'
  );
  const explicitInaccessible =
    !hasAccessibleDiskPdf &&
    /\b(not\s+accessible|inaccessible|paywall|behind\s+paywall|subscription\s+required|no\s+access|access\s+denied|unable\s+to\s+retrieve|full[- ]text\s+unavailable|cannot\s+retrieve|broken\s+link|not\s+retrievable|404\s+not\s+found)\b/i.test(
      `${reasonNotesLower} ${abstractLower} ${(article.accessNotes || '').toLowerCase()}`
    );
  const statusNotAccessible = !hasAccessibleDiskPdf && article.accessStatus === 'not_accessible';
  const statusNeedsInstUnconfirmed =
    !hasAccessibleDiskPdf &&
    article.accessStatus === 'needs_institution_confirmation' &&
    !article.institutionConfirmed &&
    !article.fullText?.trim() &&
    (!article.pages || article.pages.length === 0);
  const zeroContentAndLinks =
    !hasAccessibleDiskPdf &&
    !article.fullText?.trim() &&
    (!article.pages || article.pages.length === 0) &&
    !article.abstract?.trim() &&
    !article.url &&
    !article.openAccessUrl &&
    !article.pdfUrl &&
    !article.doi;
  const notAccessibleDetected =
    statusNotAccessible || statusNeedsInstUnconfirmed || explicitInaccessible || zeroContentAndLinks;
  const notAccRes = applyOverride(
    'not_accessible',
    notAccessibleDetected,
    hasAccessibleDiskPdf
      ? article.fullTextStatusDetails?.pdfTextExtractionFailed
        ? 'Accessible (PDF attached on disk; text extraction failed/unavailable)'
        : 'Accessible (verified PDF binary stored on disk)'
      : statusNotAccessible
      ? 'Recorded as Not Accessible / Reports Not Retrieved (PRISMA 2020 retrieval failure)'
      : statusNeedsInstUnconfirmed
      ? 'Requires institutional subscription confirmation to download full text (PRISMA 2020)'
      : explicitInaccessible
      ? 'Full-text manuscript marked inaccessible / behind paywall / unretrievable'
      : zeroContentAndLinks
      ? 'No full text, abstract, DOI, or URL available to access paper'
      : article.institutionConfirmed
      ? 'Accessible (Institutional access confirmed)'
      : article.accessStatus === 'downloadable' || article.pdfUrl || article.openAccessUrl
      ? 'Downloadable open-access PDF / link verified'
      : 'Accessible (metadata / DOI / text available)',
    article.accessNotes ||
      (explicitInaccessible ? (article.decisionReason || article.screeningNotes || '') : '') ||
      (article.pdfUrl || article.openAccessUrl || article.original_filename || ''),
    hasAccessibleDiskPdf
      ? 98
      : statusNotAccessible
      ? 98
      : statusNeedsInstUnconfirmed
      ? 92
      : explicitInaccessible
      ? 95
      : zeroContentAndLinks
      ? 82
      : 90
  );

  // --- 6. Outside publication year ---
  const yearMatches = (project.publicationYears || '').match(/\b(19\d{2}|20\d{2})\b/g) || [];
  const parsedYears = yearMatches.map((y) => parseInt(y, 10)).filter((y) => !isNaN(y));
  const currentYear = new Date().getFullYear();
  let minYear: number | null = null;
  let maxYear: number | null = null;
  if (parsedYears.length >= 2) {
    minYear = Math.min(...parsedYears);
    maxYear = Math.max(...parsedYears);
  } else if (parsedYears.length === 1) {
    minYear = parsedYears[0];
    maxYear = /\b(since|after|from|present|onward)\b/i.test(project.publicationYears || '')
      ? currentYear + 1
      : parsedYears[0];
  }
  const explicitOutYear = /\b(outside\s+publication\s+year|out\s+of\s+year|outside\s+date\s+range|publication\s+year\s+ineligible|too\s+old|pre-20)\b/i.test(reasonNotesLower);
  const numericOutYear = Boolean(
    article.year &&
      article.year >= 1900 &&
      minYear !== null &&
      maxYear !== null &&
      (article.year < minYear || article.year > maxYear)
  );
  const outYearDetected = explicitOutYear || numericOutYear;
  const outYearRes = applyOverride(
    'outside_publication_year',
    outYearDetected,
    numericOutYear
      ? `Published in ${article.year}, outside protocol range (${project.publicationYears})`
      : explicitOutYear
      ? 'Excluded due to publication year window'
      : `Within eligible window (${article.year || 'Publication year not specified'} vs ${project.publicationYears})`,
    numericOutYear ? `Article Year: ${article.year} | Protocol: ${project.publicationYears}` : '',
    numericOutYear ? 99 : explicitOutYear ? 95 : 98
  );

  // --- 7. Abstract-only paper (PDF w/ extraction failure MUST stay classified as full-text available) ---
  const hasAccessibleFullTextPdf = Boolean(
    hasAccessibleDiskPdf ||
      article.accessStatus === 'downloadable' ||
      Boolean(article.pdfUrl || article.openAccessUrl)
  );
  const explicitAbstractOnly =
    !hasAccessibleFullTextPdf &&
    (article.accessStatus === 'abstract_only' ||
      /\b(abstract[- ]only|only\s+abstract\s+available|no\s+full[- ]?text|conference\s+abstract\s+only|short\s+abstract|meeting\s+abstract)\b/i.test(
        `${textSample} ${reasonNotesLower}`
      ));
  const structuralAbstractOnly =
    !hasAccessibleFullTextPdf &&
    Boolean(article.abstract && article.abstract.trim().length > 25) &&
    !article.fullText?.trim() &&
    (!article.pages || article.pages.length === 0) &&
    article.decision !== 'include';
  const abstractOnlyDetected = explicitAbstractOnly || structuralAbstractOnly;
  const absOnlyRes = applyOverride(
    'abstract_only',
    abstractOnlyDetected,
    hasAccessibleDiskPdf && article.fullTextStatusDetails?.pdfTextExtractionFailed
      ? 'Full-text PDF attached & accessible on disk (text extraction failed; NOT abstract-only)'
      : explicitAbstractOnly
      ? 'Identified as an abstract-only record (no downloadable full paper)'
      : structuralAbstractOnly
      ? 'Only abstract text present (no full-text body, pages, or downloadable PDF attached)'
      : 'Full-text / downloadable PDF or page evidence present',
    hasAccessibleDiskPdf
      ? article.original_filename || article.file_path || ''
      : explicitAbstractOnly
      ? article.accessNotes || article.decisionReason || article.journal || ''
      : structuralAbstractOnly
      ? 'Abstract present without fullText, pages, or accessible PDF'
      : '',
    hasAccessibleDiskPdf ? 98 : explicitAbstractOnly ? 96 : structuralAbstractOnly ? 78 : 92
  );

  // --- 8. Lack of clear assessment to review title ---
  const rqHits = preCodeDetail
    ? preCodeDetail.matchedResearchQuestions.filter((r) => r.matchedTerms.length > 0).length
    : (project.researchQuestions || []).filter((rq) =>
        extractTerms(`${rq.question} ${rq.mainEvidenceToCollect}`).some((t) => lower.includes(t))
      ).length;
  const outcomeTerms = extractTerms(`${project.picoc?.outcome || ''} ${project.methodologyFocus || ''}`);
  const matchedOutcomeTerms = outcomeTerms.filter((t) => lower.includes(t));
  const hasEmpiricalAssessmentCues =
    /\b(accuracy|f1|auc|rmse|mae|r2|r²|precision|recall|sensitivity|specificity|latency|turnaround|evaluate|assessed|validation|cross-validation|experiment|benchmark|performance|comparison|susceptibility|detection)\b/i.test(lower) ||
    Boolean(article.extractedData?.metrics);
  const explicitLackAssessment = /\b(lack\s+of\s+(?:clear\s+)?assessment|no\s+clear\s+assessment|lacks?\s+empirical\s+assessment|insufficient\s+outcome|no\s+quantitative\s+assessment|does\s+not\s+assess)\b/i.test(reasonNotesLower);
  const weakAssessmentAlignment =
    corpus.trim().length > 45 &&
    rqHits === 0 &&
    matchedOutcomeTerms.length === 0 &&
    !hasEmpiricalAssessmentCues;
  const lackAssessDetected = explicitLackAssessment || weakAssessmentAlignment;
  const lackAssessRes = applyOverride(
    'lack_clear_assessment',
    lackAssessDetected,
    explicitLackAssessment
      ? 'Flagged for lacking clear empirical assessment aligned to review title'
      : weakAssessmentAlignment
      ? `No RQ alignment (0/${project.researchQuestions?.length || 0} RQs) and no outcome assessment metrics detected`
      : `Clear assessment evidenced (${rqHits}/${project.researchQuestions?.length || 0} RQs · ${matchedOutcomeTerms.length} outcome terms)`,
    weakAssessmentAlignment
      ? `Review title focus: ${project.title.slice(0, 90)}`
      : matchedOutcomeTerms.slice(0, 4).join(', '),
    explicitLackAssessment ? 95 : weakAssessmentAlignment ? 80 : 88
  );

  const metaByCode = Object.fromEntries(PRISMA_DIAGNOSTIC_CATEGORIES.map((c) => [c.code, c])) as Record<
    PrismaDiagnosticCode,
    PrismaDiagnosticCategoryMeta
  >;

  const flags: PrismaDiagnosticFlag[] = [
    {
      code: 'not_relevant_topic',
      label: metaByCode.not_relevant_topic.label,
      shortLabel: metaByCode.not_relevant_topic.shortLabel,
      ...notRelRes,
    },
    {
      code: 'not_primary_research',
      label: metaByCode.not_primary_research.label,
      shortLabel: metaByCode.not_primary_research.shortLabel,
      ...notPrimaryRes,
      notPrimarySubType: subType,
      notPrimarySubLabel: subTypeLabel,
    },
    {
      code: 'not_english',
      label: metaByCode.not_english.label,
      shortLabel: metaByCode.not_english.shortLabel,
      ...notEngRes,
    },
    {
      code: 'wrong_study_area',
      label: metaByCode.wrong_study_area.label,
      shortLabel: metaByCode.wrong_study_area.shortLabel,
      ...wrongAreaRes,
    },
    {
      code: 'not_accessible',
      label: metaByCode.not_accessible.label,
      shortLabel: metaByCode.not_accessible.shortLabel,
      ...notAccRes,
    },
    {
      code: 'outside_publication_year',
      label: metaByCode.outside_publication_year.label,
      shortLabel: metaByCode.outside_publication_year.shortLabel,
      ...outYearRes,
    },
    {
      code: 'abstract_only',
      label: metaByCode.abstract_only.label,
      shortLabel: metaByCode.abstract_only.shortLabel,
      ...absOnlyRes,
    },
    {
      code: 'lack_clear_assessment',
      label: metaByCode.lack_clear_assessment.label,
      shortLabel: metaByCode.lack_clear_assessment.shortLabel,
      ...lackAssessRes,
    },
  ];

  const detectedFlags = flags.filter((f) => f.detected);
  const detectedCodes = detectedFlags.map((f) => f.code);

  return {
    flags,
    detectedCodes,
    notPrimarySubType: subType,
    notPrimarySubLabel: subTypeLabel,
    overallEligibilityStatus:
      detectedFlags.length === 0 ? 'Passes Protocol Checks' : '1+ Exclusion Flags Detected',
    primaryExclusionSummary:
      detectedFlags.length > 0
        ? detectedFlags.map((f) => (f.notPrimarySubLabel ? `${f.shortLabel}: ${f.notPrimarySubLabel}` : f.shortLabel)).join(' · ')
        : 'All 8 PRISMA protocol checks passed',
  };
}
