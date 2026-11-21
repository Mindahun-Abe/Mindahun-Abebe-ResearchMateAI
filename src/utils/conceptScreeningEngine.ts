import type { Article, ReviewProject } from '../types';
import { getActiveFrameworkFieldEntries } from './protocolFrameworks';

const PHRASE_BREAK_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'as',
  'into', 'onto', 'upon', 'across', 'within', 'without', 'through', 'via', 'using',
  'based', 'and', 'or', 'nor', 'but', 'vs', 'versus', 'over', 'under', 'between',
  'among', 'against', 'during', 'before', 'after', 'around', 'about', 'that', 'which',
  'this', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'may', 'might', 'must',
  'should', 'will', 'would', 'their', 'its', 'our', 'we', 'they', 'such', 'all', 'any',
  'each', 'every', 'other', 'more', 'most', 'only', 'also', 'well', 'both', 'either',
  'include', 'including', 'included', 'exclude', 'excluding', 'excluded', 'studies',
  'study', 'paper', 'papers', 'article', 'articles', 'review', 'systematic',
  'scoping', 'meta-analysis', 'research', 'conducted', 'carried', 'performed',
  'evaluated', 'assessed', 'investigated', 'empirical', 'original',
]);

// Words that are far too broad/ambiguous across disciplines to justify inclusion on their own
// unless paired with the compound target anchor phrase (e.g., "gully" + "erosion").
export const GENERIC_SINGLE_MODIFIER_WORDS = new Set([
  'erosion', 'susceptibility', 'vulnerability', 'hazard', 'risk', 'mapping', 'map', 'maps',
  'modeling', 'modelling', 'model', 'models', 'factor', 'factors', 'conditioning', 'variable',
  'variables', 'parameter', 'parameters', 'feature', 'features', 'predictor', 'predictors',
  'validation', 'accuracy', 'performance', 'metric', 'metrics', 'evaluation', 'assessment',
  'prediction', 'predicting', 'classification', 'detection', 'segmentation', 'monitoring',
  'analysis', 'analytics', 'approach', 'approaches', 'technique', 'techniques', 'method',
  'methods', 'methodology', 'framework', 'application', 'applications', 'system', 'systems',
  'machine', 'learning', 'deep', 'artificial', 'intelligence', 'algorithm', 'algorithms',
  'network', 'networks', 'ensemble', 'hybrid', 'statistical', 'spatial', 'geospatial',
  'remote', 'sensing', 'gis', 'data', 'dataset', 'datasets', 'field', 'soil', 'water',
  'land', 'surface', 'area', 'region', 'study', 'basin', 'watershed', 'catchment',
  'clinical', 'patient', 'patients', 'hospital', 'health', 'disease', 'treatment',
  'outcome', 'outcomes', 'effect', 'effects', 'impact', 'impacts', 'score', 'index',
  'roc', 'auc', 'training', 'testing', 'cross', 'sample', 'samples', 'survey',
]);

export interface PhraseRuleMatchResult {
  matchedPhrases: string[];
  matchedSpecificTokens: string[];
  matchedGenericTokens: string[];
  phrasesRequiredCount: number;
  phraseMatchRatio: number;
  isMatched: boolean;
  reason: string;
}

export interface IntegratedConceptAlignment {
  disciplineProfile: string;
  targetCasePhrases: string[];
  matchedCasePhrases: string[];
  missingCaseAnchors: string[];
  caseAnchorMatched: boolean;
  confounderTopicsDetected: string[];
  conditioningFactors: string[];
  analyticalModels: string[];
  validationMetrics: string[];
  applicationOutcomes: string[];
  integratedScore: number; // 0-100 across Case + Factors + Models + Validation
  pillarsMatchedCount: number; // 0-4
  isOffTopicCaseMismatch: boolean;
  offTopicReason: string;
  integratedSummary: string;
  evidenceQuote: string;
}

function splitCamelCaseText(text: string): string {
  return (text || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_]+/g, ' ');
}

function normalizeText(text: string): string {
  return splitCamelCaseText(text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9.\s/-]+/g, ' ')
    .replace(/[-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stemToken(token: string): string {
  if (token.length <= 4) return token;
  if (token.endsWith('ies') && token.length > 5) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ing') && token.length > 6) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 5) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 4) return token.slice(0, -1);
  return token;
}

function splitIntoCleanSentences(rawText: string): string[] {
  if (!rawText) return [];
  return rawText
    .replace(/\r?\n+/g, '. ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
}

/**
 * Extract interconnected 2-to-4 word concept phrases and distinctive single tokens from any text.
 * E.g. "Gully Erosion Susceptibility Mapping using Random Forest" ->
 * phrases: ["gully erosion susceptibility", "gully erosion", "erosion susceptibility", "random forest"]
 */
export function extractConceptPhrasesAndTokens(rawText: string): {
  phrases: string[];
  specificTokens: string[];
  genericTokens: string[];
} {
  const clean = normalizeText(rawText);
  if (!clean) return { phrases: [], specificTokens: [], genericTokens: [] };

  const words = clean.split(/\s+/).filter(Boolean);
  const phrases: string[] = [];
  const specificTokens: string[] = [];
  const genericTokens: string[] = [];

  // Build contiguous runs of content words split at PHRASE_BREAK_WORDS
  let currentRun: string[] = [];
  const runs: string[][] = [];
  for (const w of words) {
    if (PHRASE_BREAK_WORDS.has(w) || w.length < 2) {
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
    } else {
      currentRun.push(w);
    }
  }
  if (currentRun.length > 0) runs.push(currentRun);

  for (const run of runs) {
    // Emit 2-gram and 3-gram phrases from each noun/concept run
    if (run.length >= 3) {
      for (let i = 0; i <= run.length - 3; i++) {
        const tri = run.slice(i, i + 3).join(' ');
        if (tri.length >= 7) phrases.push(tri);
      }
    }
    if (run.length >= 2) {
      for (let i = 0; i <= run.length - 2; i++) {
        const bi = run.slice(i, i + 2).join(' ');
        if (bi.length >= 5) phrases.push(bi);
      }
    }
    for (const tok of run) {
      if (tok.length < 3) continue;
      if (GENERIC_SINGLE_MODIFIER_WORDS.has(tok) || GENERIC_SINGLE_MODIFIER_WORDS.has(stemToken(tok))) {
        genericTokens.push(tok);
      } else {
        specificTokens.push(tok);
      }
    }
  }

  return {
    phrases: Array.from(new Set(phrases)),
    specificTokens: Array.from(new Set(specificTokens)),
    genericTokens: Array.from(new Set(genericTokens)),
  };
}

/**
 * Checks if a multi-word phrase matches either contiguously OR with all constituent words
 * interconnected within a tight proximity window inside the same sentence (e.g. "susceptibility to gully erosion").
 */
export function matchInterconnectedPhraseInSentences(
  phrase: string,
  normalizedFullText: string,
  normalizedSentences: string[]
): boolean {
  const pClean = normalizeText(phrase);
  if (!pClean) return false;
  if (normalizedFullText.includes(pClean)) return true;

  const pTokens = pClean.split(/\s+/).filter((w) => w.length >= 2 && !PHRASE_BREAK_WORDS.has(w));
  if (pTokens.length < 2) return normalizedFullText.includes(pClean);

  const stems = pTokens.map(stemToken);

  for (const sent of normalizedSentences) {
    const sentWords = sent.split(/\s+/).filter(Boolean);
    if (sentWords.length < pTokens.length) continue;
    const sentStems = sentWords.map(stemToken);

    // Check if every phrase stem occurs within a proximity window of at most 7 words inside this sentence
    const positions: number[][] = stems.map((st) => {
      const idxs: number[] = [];
      for (let i = 0; i < sentStems.length; i++) {
        if (sentStems[i] === st || (st.length >= 4 && sentStems[i].startsWith(st)) || (sentStems[i].length >= 4 && st.startsWith(sentStems[i]))) {
          idxs.push(i);
        }
      }
      return idxs;
    });

    if (positions.some((arr) => arr.length === 0)) continue;

    // Check compact span across token positions
    if (positions.length === 2) {
      for (const a of positions[0]) {
        for (const b of positions[1]) {
          if (Math.abs(a - b) <= 6) return true;
        }
      }
    } else {
      const firstMin = Math.min(...positions.map((arr) => arr[0]));
      const allWithinWindow = positions.every((arr) => arr.some((p) => p - firstMin <= 9));
      if (allWithinWindow) return true;
    }
  }

  return false;
}

/**
 * Evaluates a single Inclusion Criterion or Framework Dimension against an article using
 * interconnected phrases + domain-specific anchor tokens (blocking single generic modifier false positives).
 */
export function evaluateRuleWithPhraseInterconnection(
  ruleText: string,
  articleNormalizedText: string,
  articleNormalizedSentences: string[]
): PhraseRuleMatchResult {
  const { phrases, specificTokens, genericTokens } = extractConceptPhrasesAndTokens(ruleText);

  if (phrases.length === 0 && specificTokens.length === 0 && genericTokens.length === 0) {
    return {
      matchedPhrases: [],
      matchedSpecificTokens: [],
      matchedGenericTokens: [],
      phrasesRequiredCount: 0,
      phraseMatchRatio: 0,
      isMatched: false,
      reason: '',
    };
  }

  const matchedPhrases = phrases.filter((ph) =>
    matchInterconnectedPhraseInSentences(ph, articleNormalizedText, articleNormalizedSentences)
  );
  const matchedSpecificTokens = specificTokens.filter((t) => {
    const st = stemToken(t);
    return (
      new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(articleNormalizedText) ||
      (st.length >= 4 && new RegExp(`\\b${st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(articleNormalizedText))
    );
  });
  const matchedGenericTokens = genericTokens.filter((t) =>
    new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(articleNormalizedText)
  );

  // Determine if match is genuine & interconnected rather than a single accidental generic word
  let isMatched = false;
  let reason = '';

  if (matchedPhrases.length > 0) {
    isMatched = true;
    reason = `Matches interconnected phrase(s): "${matchedPhrases.slice(0, 3).join('", "')}"`;
  } else if (specificTokens.length > 0) {
    // Require specific distinctive anchor token(s) to match; if multiple specific tokens exist, prefer >= 1 distinctive hit
    // alongside at least 2 total domain terms when phrases failed
    if (matchedSpecificTokens.length >= 2 || (matchedSpecificTokens.length === 1 && (specificTokens.length <= 2 || matchedGenericTokens.length >= 1))) {
      isMatched = true;
      reason = `Matches anchored term(s): "${[...matchedSpecificTokens, ...matchedGenericTokens].slice(0, 4).join(', ')}"`;
    }
  } else if (phrases.length === 0 && matchedGenericTokens.length >= Math.min(2, genericTokens.length)) {
    isMatched = true;
    reason = `Matches terms: "${matchedGenericTokens.slice(0, 3).join(', ')}"`;
  } else if (phrases.length > 0 && matchedGenericTokens.length >= Math.max(2, Math.ceil(genericTokens.length * 0.6)) && matchedSpecificTokens.length === 0 && specificTokens.length === 0) {
    isMatched = true;
    reason = `Matches terms: "${matchedGenericTokens.slice(0, 3).join(', ')}"`;
  }

  const phraseMatchRatio =
    phrases.length > 0
      ? matchedPhrases.length / phrases.length
      : specificTokens.length > 0
      ? matchedSpecificTokens.length / specificTokens.length
      : 0;

  return {
    matchedPhrases,
    matchedSpecificTokens,
    matchedGenericTokens,
    phrasesRequiredCount: phrases.length,
    phraseMatchRatio,
    isMatched,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Discipline-Adaptive 4-Pillar Integrated Extraction:
//   [1. Suspected Case Phrase] + [2. Conditioning Factors / Inputs] +
//   [3. Analytical Models / Methods] + [4. Validation & Application]
// ---------------------------------------------------------------------------

interface PatternCatalogEntry {
  label: string;
  regex: RegExp;
}

const CONDITIONING_FACTORS_CATALOG: PatternCatalogEntry[] = [
  // Geomorphology, Terrain, Hydrology & Gully / Hazard Factors
  { label: 'Slope / Slope Angle', regex: /\bslope(?:\s+(?:angle|gradient|degree|steepness))?\b/i },
  { label: 'Aspect', regex: /\b(?:slope\s+)?aspect\b/i },
  { label: 'Curvature (Plan/Profile)', regex: /\b(?:plan|profile|general|total)?\s*curvature\b/i },
  { label: 'Elevation / DEM', regex: /\b(?:elevation|altitude|DEM|digital\s+elevation\s+model)\b/i },
  { label: 'TWI (Topographic Wetness Index)', regex: /\b(?:TWI|topographic\s+wetness\s+index)\b/i },
  { label: 'SPI (Stream Power Index)', regex: /\b(?:SPI|stream\s+power\s+index)\b/i },
  { label: 'TRI / TPI (Roughness / Position)', regex: /\b(?:TRI|TPI|terrain\s+ruggedness|topographic\s+position\s+index)\b/i },
  { label: 'LS-Factor (Slope Length/Steepness)', regex: /\b(?:LS[- ]factor|slope\s+length)\b/i },
  { label: 'Drainage Density', regex: /\bdrainage\s+density\b/i },
  { label: 'Distance to Stream / River', regex: /\bdistance\s+(?:to|from)\s+(?:streams?|rivers?|drainage|channels?)\b/i },
  { label: 'Distance to Road / Fault', regex: /\bdistance\s+(?:to|from)\s+(?:roads?|faults?|lineaments?)\b/i },
  { label: 'Rainfall / Precipitation', regex: /\b(?:rainfall|precipitation|erosivity)\b/i },
  { label: 'LULC (Land Use / Land Cover)', regex: /\b(?:LULC|land\s+use(?:\/|\s+and\s+)land\s+cover|land\s+cover)\b/i },
  { label: 'NDVI / Vegetation Index', regex: /\b(?:NDVI|NDWI|SAVI|EVI|NDRE|CWSI|vegetation\s+cover)\b/i },
  { label: 'Soil Type / Texture / Organic Matter', regex: /\b(?:soil\s+(?:type|texture|properties|erodibility|moisture|organic\s+carbon)|clay\s+content)\b/i },
  { label: 'Lithology / Geology / Lineament', regex: /\b(?:lithology|geology|geological|lineament\s+density|geomorphology)\b/i },
  { label: 'Multicollinearity (VIF / Tolerance)', regex: /\b(?:VIF|variance\s+inflation\s+factor|multicollinearity|tolerance)\b/i },
  // UAV / Remote Sensing / Agronomy Factors
  { label: 'Multispectral / Thermal / Hyperspectral', regex: /\b(?:multispectral|hyperspectral|thermal\s+infrared|RGB|LiDAR|SAR|UAV\s+imagery)\b/i },
  { label: 'Spatial Resolution / GSD', regex: /\b(?:GSD|ground\s+sampling\s+distance|spatial\s+resolution|pixel\s+size)\b/i },
  // Clinical / Biomedical / Social Covariates
  { label: 'Demographic / Socioeconomic Covariates', regex: /\b(?:socioeconomic|household\s+income|education\s+level|age|BMI|comorbidit(?:y|ies)|wealth\s+index)\b/i },
  { label: 'Clinical / Environmental Risk Factors', regex: /\b(?:risk\s+factors?|biomarkers?|exposure\s+variables?|conditioning\s+factors?|explanatory\s+variables?|covariates?|independent\s+variables?)\b/i },
];

const ANALYTICAL_MODELS_CATALOG: PatternCatalogEntry[] = [
  // Machine Learning & Deep Learning
  { label: 'Random Forest (RF)', regex: /\b(?:Random\s+Forest|RF\s+model)\b/i },
  { label: 'XGBoost', regex: /\bXGBoost|Extreme\s+Gradient\s+Boosting\b/i },
  { label: 'LightGBM', regex: /\bLightGBM\b/i },
  { label: 'CatBoost', regex: /\bCatBoost\b/i },
  { label: 'Gradient Boosting (GBM/GBDT)', regex: /\b(?:Gradient\s+Boosting|GBM|GBDT|BRT|Boosted\s+Regression\s+Trees?)\b/i },
  { label: 'SVM (Support Vector Machine)', regex: /\b(?:Support\s+Vector\s+Machine|SVM|SVR)\b/i },
  { label: 'ANN / MLP (Neural Network)', regex: /\b(?:Artificial\s+Neural\s+Network|ANN|MLP|Multilayer\s+Perceptron)\b/i },
  { label: 'CNN / Deep Learning (U-Net/ResNet/YOLO)', regex: /\b(?:CNN|Convolutional\s+Neural\s+Network|Deep\s+Learning|U-Net|ResNet|DenseNet|YOLOv?\d*|Transformer)\b/i },
  { label: 'MaxEnt (Maximum Entropy)', regex: /\bMaxEnt|Maximum\s+Entropy\b/i },
  { label: 'CART / Decision Tree', regex: /\b(?:CART|Decision\s+Tree|J48|C5\.0)\b/i },
  { label: 'Naive Bayes / k-NN / AdaBoost / Bagging', regex: /\b(?:Naive\s+Bayes|k-?NN|K-Nearest\s+Neighbor|AdaBoost|Bagging|Stacking\s+Ensemble|Ensemble\s+Model)\b/i },
  // Bivariate / Geospatial / Statistical Susceptibility Models
  { label: 'Frequency Ratio (FR)', regex: /\bFrequency\s+Ratio\b|\bFR\s+model\b/i },
  { label: 'Weight of Evidence (WoE)', regex: /\bWeights?\s+of\s+Evidence\b|\bWoE\b/i },
  { label: 'Information Value (IV)', regex: /\bInformation\s+Value\b/i },
  { label: 'Index of Entropy (IoE)', regex: /\bIndex\s+of\s+Entropy\b|\bIoE\b/i },
  { label: 'Certainty Factor (CF)', regex: /\bCertainty\s+Factor\b/i },
  { label: 'Evidential Belief Function (EBF)', regex: /\bEvidential\s+Belief\s+Function\b|\bEBF\b/i },
  { label: 'AHP (Analytical Hierarchy Process)', regex: /\b(?:AHP|Analytic(?:al)?\s+Hierarchy\s+Process)\b/i },
  { label: 'Fuzzy Logic / ANFIS', regex: /\b(?:Fuzzy\s+Logic|ANFIS|Fuzzy[- ]AHP)\b/i },
  { label: 'Logistic Regression / GAM / GLM', regex: /\b(?:Logistic\s+Regression|Generalized\s+Additive\s+Model|GAM|GLM|Multivariate\s+Regression|Cox\s+Proportional)\b/i },
  { label: 'Physical / Hydrological Model (RUSLE/SWAT/WEPP)', regex: /\b(?:RUSLE|USLE|SWAT|WEPP|WaTEM|LISEM)\b/i },
];

const VALIDATION_METRICS_CATALOG: PatternCatalogEntry[] = [
  { label: 'ROC-AUC / AUC', regex: /\b(?:ROC[- ]?AUC|AUC[- ]?ROC|area\s+under\s+(?:the\s+)?(?:ROC\s+)?curve|AUROC)\b/i },
  { label: 'Overall Accuracy / Kappa', regex: /\b(?:overall\s+accuracy|accuracy\s*(?:of|=|:)?\s*\d|Cohen['’]?s?\s+kappa|kappa\s+(?:coefficient|index))\b/i },
  { label: 'F1-Score / Precision / Recall', regex: /\b(?:F1[- ]?score|precision\s+and\s+recall|sensitivity\s+and\s+specificity|IOU|mAP)\b/i },
  { label: 'RMSE / MAE / R²', regex: /\b(?:RMSE|MAE|R\^?2|R²|NSE|Nash[- ]Sutcliffe)\b/i },
  { label: 'Cross-Validation / Spatial CV', regex: /\b(?:\d+-?fold\s+cross[- ]?validation|cross[- ]?validation|spatial\s+cross[- ]?validation|leave-one-out)\b/i },
  { label: 'Train/Test Inventory Split', regex: /\b(?:training\s+and\s+(?:testing|validation)\s+(?:sets?|datasets?|samples?)|70\/30|80\/20|confusion\s+matrix)\b/i },
  { label: 'Field Inventory / RTK-GPS / Ground Truth', regex: /\b(?:gully\s+inventory|field\s+(?:survey|inventory|validation|verification)|RTK[- ]?GPS|Google\s+Earth\s+interpretation|ground[- ]?truth)\b/i },
  { label: 'Success & Prediction Rate Curves', regex: /\b(?:success\s+rate|prediction\s+rate)\s+(?:curve|AUC)\b/i },
  { label: 'SHAP / Feature Importance', regex: /\b(?:SHAP|feature\s+importance|relative\s+importance|Information\s+Gain|Gini\s+importance)\b/i },
];

const APPLICATION_OUTCOMES_CATALOG: PatternCatalogEntry[] = [
  { label: 'Susceptibility Map / Zonation', regex: /\b(?:susceptibility\s+(?:map|mapping|zonation|index|classes)|very\s+high\s+susceptibility)\b/i },
  { label: 'Hazard / Risk Mapping', regex: /\b(?:hazard\s+(?:map|mapping|assessment)|risk\s+(?:map|mapping|zonation))\b/i },
  { label: 'Soil & Water Conservation / Management', regex: /\b(?:soil\s+(?:and\s+water\s+)?conservation|watershed\s+management|land\s+management|rehabilitation|mitigation|prioritization)\b/i },
  { label: 'Early Warning / Decision Support', regex: /\b(?:early\s+warning|decision\s+support|monitoring\s+system|real[- ]time\s+detection)\b/i },
  { label: 'Clinical Diagnosis / Treatment Optimization', regex: /\b(?:clinical\s+diagnosis|diagnostic\s+accuracy|treatment\s+outcome|prognosis|screening\s+program)\b/i },
];

// Sibling / confounder compound topics to guard against false word overlap (e.g. "landslide susceptibility" != "gully erosion susceptibility")
const KNOWN_DISTINCT_HAZARD_OR_CASE_PHRASES: Array<{ phrase: string; anchorWord: string }> = [
  { phrase: 'gully erosion', anchorWord: 'gully' },
  { phrase: 'gully susceptibility', anchorWord: 'gully' },
  { phrase: 'landslide susceptibility', anchorWord: 'landslide' },
  { phrase: 'flood susceptibility', anchorWord: 'flood' },
  { phrase: 'flash flood', anchorWord: 'flood' },
  { phrase: 'wildfire susceptibility', anchorWord: 'wildfire' },
  { phrase: 'forest fire', anchorWord: 'fire' },
  { phrase: 'groundwater potential', anchorWord: 'groundwater' },
  { phrase: 'coastal erosion', anchorWord: 'coastal' },
  { phrase: 'wind erosion', anchorWord: 'wind' },
  { phrase: 'dental erosion', anchorWord: 'dental' },
  { phrase: 'tooth erosion', anchorWord: 'tooth' },
  { phrase: 'antibiotic susceptibility', anchorWord: 'antibiotic' },
  { phrase: 'antimicrobial susceptibility', anchorWord: 'antimicrobial' },
  { phrase: 'crop water stress', anchorWord: 'crop' },
  { phrase: 'malaria prevalence', anchorWord: 'malaria' },
  { phrase: 'soil organic carbon', anchorWord: 'carbon' },
];

function extractCoreCaseAnchorsAndPhrases(project: ReviewProject): {
  targetCasePhrases: string[];
  requiredAnchors: string[];
} {
  const frameworkEntries = getActiveFrameworkFieldEntries(project);
  const populationOrFocus = [
    project.title || '',
    project.picoc?.population || '',
    project.frameworkFields?.population || '',
    project.frameworkFields?.phenomenon || '',
    project.frameworkFields?.problem || '',
    project.frameworkFields?.exposure || '',
    ...frameworkEntries
      .filter((e) => !['context', 'setting', 'comparison'].includes(e.key))
      .slice(0, 2)
      .map((e) => e.value),
  ]
    .filter(Boolean)
    .join('. ');

  const { phrases, specificTokens } = extractConceptPhrasesAndTokens(populationOrFocus);

  // Extract core title/population phrases first (highest priority target phrases)
  const titleParsed = extractConceptPhrasesAndTokens(
    `${project.title || ''}. ${project.picoc?.population || project.frameworkFields?.population || project.frameworkFields?.phenomenon || ''}`
  );

  // Prioritize compound target phrases found in Title/Population that carry distinctive anchor words
  const orderedPhrases = Array.from(
    new Set([
      ...titleParsed.phrases.filter((ph) =>
        ph.split(/\s+/).some((w) => !GENERIC_SINGLE_MODIFIER_WORDS.has(w) && !GENERIC_SINGLE_MODIFIER_WORDS.has(stemToken(w)))
      ),
      ...phrases.filter((ph) =>
        ph.split(/\s+/).some((w) => !GENERIC_SINGLE_MODIFIER_WORDS.has(w) && !GENERIC_SINGLE_MODIFIER_WORDS.has(stemToken(w)))
      ),
    ])
  ).slice(0, 8);

  // Determine the distinctive anchor words from the primary Title/Population (excluding country names like Ethiopia)
  const titleLower = normalizeText(`${project.title || ''} ${project.picoc?.population || ''}`);
  const requiredAnchors: string[] = [];

  for (const known of KNOWN_DISTINCT_HAZARD_OR_CASE_PHRASES) {
    if (titleLower.includes(known.phrase) || titleLower.includes(known.anchorWord)) {
      requiredAnchors.push(known.anchorWord);
    }
  }

  if (requiredAnchors.length === 0) {
    // Dynamically pick top distinctive subject words from title + population (filtering generic methodology/geo noise)
    const geoNoise = new Set(['ethiopia', 'ethiopian', 'africa', 'african', 'global', 'china', 'brazil', 'iran', 'highlands', 'watershed']);
    for (const tok of titleParsed.specificTokens) {
      if (!geoNoise.has(tok) && tok.length >= 4) {
        requiredAnchors.push(tok);
      }
    }
  }

  return {
    targetCasePhrases: orderedPhrases.length > 0 ? orderedPhrases : specificTokens.slice(0, 5),
    requiredAnchors: Array.from(new Set(requiredAnchors)).slice(0, 4),
  };
}

function getArticleFullCombinedText(article: Article): string {
  const pagesText = Array.isArray(article.pages)
    ? article.pages.map((p) => p?.content || '').join(' ')
    : '';
  // Exclude synthetic screening/geographic verification notes & c.relevance commentary so prior review titles never contaminate topic matching
  const citText = Array.isArray(article.evidenceCitations)
    ? article.evidenceCitations
        .filter(
          (c) =>
            !/geographic\s+verification\s+needed|abstract\s*\/\s*eligibility\s+check|title\s*&\s*filename\s+screening/i.test(
              c.section || ''
            )
        )
        .map((c) => c.quote || '')
        .join(' ')
    : '';
  return splitCamelCaseText(
    [
      article.title || '',
      article.abstract || '',
      article.fullText || '',
      pagesText,
      citText,
      article.extractedData?.algorithm || '',
      article.extractedData?.sensor || '',
      article.extractedData?.groundTruth || '',
      article.extractedData?.metrics || '',
      article.extractedData?.keyFindings || '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}

export function evaluateIntegratedConceptAlignment(
  article: Article,
  project: ReviewProject
): IntegratedConceptAlignment {
  const rawCombined = getArticleFullCombinedText(article);
  const normalizedText = normalizeText(rawCombined);
  const rawSentences = splitIntoCleanSentences(rawCombined);
  const normalizedSentences = rawSentences.map(normalizeText).filter(Boolean);

  const disciplineProfile = project.discipline?.trim() || 'Systematic Review';
  const { targetCasePhrases, requiredAnchors } = extractCoreCaseAnchorsAndPhrases(project);

  // 1. Evaluate Interconnected Suspected Case / Core Phenomenon
  const matchedCasePhrases = targetCasePhrases.filter((ph) =>
    matchInterconnectedPhraseInSentences(ph, normalizedText, normalizedSentences)
  );

  // Check each distinctive required anchor (e.g., "gully" -> allows "gully" / "gullies")
  const matchedAnchors: string[] = [];
  const missingCaseAnchors: string[] = [];
  for (const anchor of requiredAnchors) {
    const stem = stemToken(anchor);
    const rx =
      anchor === 'gully'
        ? /\b(gull(?:y|ies)|ephemeral\s+gull(?:y|ies)|gully[- ]erosion|gully\s+headcut)\b/i
        : new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z]*\\b`, 'i');
    if (rx.test(rawCombined)) {
      matchedAnchors.push(anchor);
    } else {
      missingCaseAnchors.push(anchor);
    }
  }

  // Also detect explicit sibling confounders when core target phrase didn't match
  const confounderTopicsDetected: string[] = [];
  for (const known of KNOWN_DISTINCT_HAZARD_OR_CASE_PHRASES) {
    const isTargetKnown = targetCasePhrases.some((tp) => tp.includes(known.anchorWord)) || requiredAnchors.includes(known.anchorWord);
    if (!isTargetKnown && normalizedText.includes(known.phrase)) {
      confounderTopicsDetected.push(known.phrase);
    }
  }

  const caseAnchorMatched =
    matchedCasePhrases.length > 0 ||
    (requiredAnchors.length > 0 && matchedAnchors.length > 0 && matchedCasePhrases.length === 0 && targetCasePhrases.length === 0) ||
    (requiredAnchors.length > 0 && matchedAnchors.length === requiredAnchors.length);

  // Special semantic guard for compound hazard/disease cases like "gully erosion susceptibility":
  // If protocol requires "gully", then even if "erosion" or "susceptibility" matched, missing "gully" means NOT the case!
  const strictCaseMatched =
    requiredAnchors.length > 0
      ? matchedAnchors.length > 0 && (matchedCasePhrases.length > 0 || matchedAnchors.length >= Math.min(2, requiredAnchors.length) || requiredAnchors.some((a) => KNOWN_DISTINCT_HAZARD_OR_CASE_PHRASES.some((k) => k.anchorWord === a)))
      : matchedCasePhrases.length > 0;

  // 2. Extract Conditioning Factors / Inputs
  const conditioningFactors = CONDITIONING_FACTORS_CATALOG.filter((item) => item.regex.test(rawCombined)).map(
    (item) => item.label
  );

  // 3. Extract Analytical Models / Methods
  const analyticalModels = ANALYTICAL_MODELS_CATALOG.filter((item) => item.regex.test(rawCombined)).map(
    (item) => item.label
  );

  // 4. Extract Validation & Quantitative Metrics
  const validationMetrics = VALIDATION_METRICS_CATALOG.filter((item) => item.regex.test(rawCombined)).map(
    (item) => item.label
  );

  // 5. Extract Application Outcomes
  const applicationOutcomes = APPLICATION_OUTCOMES_CATALOG.filter((item) => item.regex.test(rawCombined)).map(
    (item) => item.label
  );

  // Check if the paper has enough text to make a reliable off-topic determination (avoid excluding tiny filename-only stubs)
  const hasSubstantiveText = normalizedText.length >= 45;
  const hasAnyProtocolScope = targetCasePhrases.length > 0 || requiredAnchors.length > 0;

  const isOffTopicCaseMismatch = Boolean(
    hasSubstantiveText &&
      hasAnyProtocolScope &&
      !strictCaseMatched &&
      (missingCaseAnchors.length > 0 || confounderTopicsDetected.length > 0)
  );

  let offTopicReason = '';
  if (isOffTopicCaseMismatch) {
    const targetDisplay = targetCasePhrases[0] || requiredAnchors.join(' + ');
    if (confounderTopicsDetected.length > 0) {
      offTopicReason = `Off-Topic / Case Mismatch: Paper addresses "${confounderTopicsDetected.slice(0, 2).join(', ')}" rather than interconnected target case "${targetDisplay}".`;
    } else {
      offTopicReason = `Off-Topic / Case Mismatch: Missing interconnected target concept "${targetDisplay}" (missing anchor: ${missingCaseAnchors.slice(0, 2).join(', ')}). Single-word matches alone do not qualify.`;
    }
  }

  let pillarsMatchedCount = 0;
  if (strictCaseMatched) pillarsMatchedCount++;
  if (conditioningFactors.length > 0) pillarsMatchedCount++;
  if (analyticalModels.length > 0) pillarsMatchedCount++;
  if (validationMetrics.length > 0 || applicationOutcomes.length > 0) pillarsMatchedCount++;

  const integratedScore = Math.min(
    100,
    (strictCaseMatched ? 40 : 0) +
      Math.min(20, conditioningFactors.length * 4) +
      Math.min(20, analyticalModels.length * 8) +
      Math.min(20, (validationMetrics.length + applicationOutcomes.length) * 6)
  );

  const evidenceSentence =
    rawSentences.find((s) => {
      const sNorm = normalizeText(s);
      return (
        matchedCasePhrases.some((ph) => sNorm.includes(ph)) ||
        (matchedAnchors.length > 0 && new RegExp(`\\b${stemToken(matchedAnchors[0])}`, 'i').test(s))
      );
    }) ||
    rawSentences[0] ||
    (article.title || '');

  const summaryParts: string[] = [];
  summaryParts.push(
    `Case: ${strictCaseMatched ? (matchedCasePhrases[0] || matchedAnchors.join(', ')) : `Not matched (needs ${targetCasePhrases[0] || requiredAnchors.join(', ')})`}`
  );
  if (conditioningFactors.length > 0) {
    summaryParts.push(`Factors (${conditioningFactors.length}): ${conditioningFactors.slice(0, 4).join(', ')}`);
  }
  if (analyticalModels.length > 0) {
    summaryParts.push(`Models (${analyticalModels.length}): ${analyticalModels.slice(0, 3).join(', ')}`);
  }
  if (validationMetrics.length > 0) {
    summaryParts.push(`Validation: ${validationMetrics.slice(0, 3).join(', ')}`);
  }
  if (applicationOutcomes.length > 0) {
    summaryParts.push(`Application: ${applicationOutcomes.slice(0, 2).join(', ')}`);
  }

  return {
    disciplineProfile,
    targetCasePhrases,
    matchedCasePhrases,
    missingCaseAnchors,
    caseAnchorMatched: strictCaseMatched,
    confounderTopicsDetected,
    conditioningFactors,
    analyticalModels,
    validationMetrics,
    applicationOutcomes,
    integratedScore,
    pillarsMatchedCount,
    isOffTopicCaseMismatch,
    offTopicReason,
    integratedSummary: summaryParts.join(' | '),
    evidenceQuote: evidenceSentence.slice(0, 220),
  };
}
