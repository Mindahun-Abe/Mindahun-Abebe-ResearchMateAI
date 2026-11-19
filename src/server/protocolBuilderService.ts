import type { GoogleGenAI } from '@google/genai';
import type {
  LiteratureReviewTypeId,
  ProtocolAppraisalPlanItem,
  ProtocolDatabaseSearchStrategy,
  ProtocolEligibilityRow,
  ProtocolExtractionVariablePlan,
  ProtocolFrameworkComponentItem,
  ProtocolMethodologySection,
  ProtocolObjectiveItem,
  ProtocolPrismaChecklistItem,
  ProtocolReviewMethodRecommendation,
  ProtocolRqMapping,
  ProtocolSynthesisPlan,
  ProtocolTopicAnalysis,
  ReviewFrameworkType,
  SystematicReviewProtocol,
} from '../types';

const DEFAULT_18_METHODOLOGY_TITLES: Array<{ key: string; title: string }> = [
  { key: 'title_abstract_rationale', title: '1. Protocol Title, Registration & Rationale' },
  { key: 'review_type_methodology', title: '2. Review Type, Reporting & Conduct Methodology' },
  { key: 'research_framework', title: '3. Conceptual & Question Formulation Framework' },
  { key: 'objectives_rqs', title: '4. General Objective, Specific Objectives & Research Questions' },
  { key: 'eligibility_criteria', title: '5. Inclusion & Exclusion Eligibility Criteria' },
  { key: 'information_sources', title: '6. Information Sources & Grey Literature Coverage' },
  { key: 'search_strategy', title: '7. Database-Specific Search Strategy & PRISMA-S Documentation' },
  { key: 'search_limits', title: '8. Date, Language & Publication Type Limits' },
  { key: 'deduplication_management', title: '9. Reference Management & Deduplication Workflow' },
  { key: 'screening_selection', title: '10. Two-Stage Screening & Conflict Resolution Procedure' },
  { key: 'prisma_flow_exclusion', title: '11. PRISMA 2020 Flow Tracking & Full-Text Exclusion Coding' },
  { key: 'data_extraction', title: '12. Structured Data Extraction & Variable Calibration' },
  { key: 'quality_appraisal', title: '13. Study-Design-Specific Quality Appraisal & Risk of Bias' },
  { key: 'qualitative_synthesis', title: '14. Qualitative, Thematic & SWiM Narrative Synthesis Plan' },
  { key: 'quantitative_synthesis', title: '15. Quantitative & Conditional Meta-Analysis Plan' },
  { key: 'bias_heterogeneity_sensitivity', title: '16. Heterogeneity, Subgroup, Sensitivity & Reporting Bias Assessment' },
  { key: 'amendments_governance', title: '17. Protocol Amendments, Versioning & Audit Governance' },
  { key: 'ethics_reproducibility', title: '18. Reproducibility, Data Availability & Methodological Limitations' },
];

interface TopicDomainProfile {
  discipline: string;
  subdomain: string;
  inferredReviewType: LiteratureReviewTypeId;
  inferredFramework: ReviewFrameworkType;
  complementaryFrameworks: ReviewFrameworkType[];
  methodologicalGuidance: string;
  reportingGuideline: string;
  includeGeoRef: boolean;
  eligibleDesigns: string;
  geographicDefault: string;
  targetPopulationHint: string;
  interventionHint: string;
  comparisonHint: string;
  outcomeHint: string;
  contextHint: string;
}

export function inferTopicDomainProfile(topicInput: string, project?: any): TopicDomainProfile {
  const text = `${topicInput || ''} ${project?.title || ''} ${project?.description || ''}`.toLowerCase();

  const wantsScoping =
    /\b(scoping|evidence map|mapping review|landscape|research trend|bibliometric)\b/.test(text);
  const wantsMeta =
    /\b(meta-analysis|meta analysis|pooled effect|odds ratio|hazard ratio|standardized mean difference|forest plot)\b/.test(text);
  const wantsQual =
    /\b(qualitative|perception|attitude|barrier|facilitator|lived experience|interview|focus group|meta-synthesis)\b/.test(text);
  const wantsPolicy =
    /\b(policy|governance|health service|extension service|public program|implementation cost)\b/.test(text);
  const wantsOrg =
    /\b(organization|management|leadership|firm|supply chain|workplace|sme)\b/.test(text);
  const wantsEnvExposure =
    /\b(exposure|pollutant|toxicity|microplastic|pesticide|heat stress|watershed|erosion|gully|geomorpholog|soil|climate)\b/.test(text);
  const wantsClinical =
    /\b(clinical|patient|randomized|rct|therapy|drug|placebo|diagnosis|hospital|disease treatment|cohort)\b/.test(text);
  const isGeoOrRs =
    /\b(uav|drone|remote sensing|multispectral|hyperspectral|lidar|satellite|geospatial|gis|geomorph|erosion|gully|soil|watershed|geology)\b/.test(text);

  let inferredReviewType: LiteratureReviewTypeId = 'slr';
  if (/\bbibliometric\b/.test(text)) inferredReviewType = 'bibliometric';
  else if (/\bmapping review|evidence map\b/.test(text)) inferredReviewType = 'mapping';
  else if (wantsScoping) inferredReviewType = 'scoping';
  else if (wantsMeta) inferredReviewType = 'meta_analysis';
  else if (wantsQual) inferredReviewType = 'meta_synthesis';
  else if (/\brealist\b/.test(text)) inferredReviewType = 'realist';
  else if (/\bintegrative\b/.test(text)) inferredReviewType = 'integrative';
  else if (/\brapid review\b/.test(text)) inferredReviewType = 'rapid';
  else if (/\bumbrella review|overview of reviews\b/.test(text)) inferredReviewType = 'umbrella';

  let inferredFramework: ReviewFrameworkType = 'PICOC';
  if (inferredReviewType === 'scoping' || inferredReviewType === 'mapping' || inferredReviewType === 'bibliometric') {
    inferredFramework = 'PCC';
  } else if (wantsQual || inferredReviewType === 'meta_synthesis') {
    inferredFramework = 'SPIDER';
  } else if (wantsPolicy) {
    inferredFramework = 'SPICE';
  } else if (wantsOrg || inferredReviewType === 'realist') {
    inferredFramework = 'CIMO';
  } else if (wantsClinical && !isGeoOrRs) {
    inferredFramework = 'PICO';
  } else if (wantsEnvExposure && !wantsClinical && !isGeoOrRs) {
    inferredFramework = 'PECO';
  }

  let discipline = project?.discipline || 'Interdisciplinary Applied Sciences & Engineering';
  let subdomain = project?.subdomain || 'Empirical Methods, Validation & Synthesis';
  if (isGeoOrRs) {
    discipline = 'Geospatial Remote Sensing, Earth & Agricultural Sciences';
    subdomain = 'Sensor Fusion, Spatial Modeling & Field Validation';
  } else if (wantsClinical) {
    discipline = 'Clinical Medicine, Health & Biomedical Sciences';
    subdomain = 'Clinical Interventions, Comparative Trials & Outcomes';
  } else if (wantsEnvExposure) {
    discipline = 'Environmental Health, Ecology & Earth Systems';
    subdomain = 'Exposure Assessment & Risk Modeling';
  } else if (wantsPolicy || wantsOrg) {
    discipline = 'Management, Public Policy & Organizational Research';
    subdomain = 'Service Evaluation, Governance & Implementation';
  } else if (/\b(software|deep learning|machine learning|neural|ai|llm|algorithm|computing)\b/.test(text)) {
    discipline = 'Computer Science & Software Engineering';
    subdomain = 'Empirical Benchmarking & Applied AI Systems';
  }

  const isScopingLike =
    inferredReviewType === 'scoping' ||
    inferredReviewType === 'mapping' ||
    inferredReviewType === 'bibliometric';

  const methodologicalGuidance = isScopingLike
    ? 'JBI Manual for Evidence Synthesis (Chapter 11: Scoping Reviews) & Arksey/O’Malley / Peters Conduct Framework'
    : wantsPolicy || wantsOrg
    ? 'Campbell Collaboration & JBI Evidence Synthesis Conduct Guidelines'
    : wantsClinical
    ? 'Cochrane Handbook for Systematic Reviews of Interventions (v6.4)'
    : 'Cochrane / Kitchenham & JBI Systematic Review Conduct Guidelines';

  const reportingGuideline = isScopingLike
    ? 'PRISMA-ScR (Tricco et al., 2018) & PRISMA-S (Search Reporting)'
    : wantsQual
    ? 'ENTREQ & PRISMA-S (Search Reporting)'
    : inferredReviewType === 'mapping'
    ? 'ROSES Evidence Mapping & PRISMA-S'
    : inferredReviewType === 'realist'
    ? 'RAMESES Realist Synthesis & PRISMA-S'
    : 'PRISMA 2020 (Page et al., 2021) & PRISMA-S (Rethlefsen et al., 2021)';

  return {
    discipline,
    subdomain,
    inferredReviewType,
    inferredFramework,
    complementaryFrameworks: inferredFramework === 'PICOC' ? ['PICO'] : ['PICOC'],
    methodologicalGuidance,
    reportingGuideline,
    includeGeoRef: isGeoOrRs || wantsEnvExposure,
    eligibleDesigns: isScopingLike
      ? 'Empirical quantitative, qualitative, mixed-methods, case reports, and technical evaluations'
      : wantsClinical
      ? 'Randomized controlled trials (RCTs), quasi-experimental studies, and prospective cohorts'
      : wantsQual
      ? 'Qualitative interviews, focus groups, ethnographic studies, and mixed-methods qualitative strands'
      : 'Primary empirical studies (experimental field/lab trials, comparative benchmarks, observational studies)',
    geographicDefault: 'Global (all regions eligible; study location coded separately from author affiliation)',
    targetPopulationHint: wantsClinical
      ? 'Target clinical cohorts or patient populations defined by condition and care setting'
      : isGeoOrRs
      ? 'Agricultural fields, watersheds, terrain units, or environmental study sites'
      : 'Primary target population, system, or empirical cohort examined in the literature',
    interventionHint: wantsEnvExposure && !wantsClinical
      ? 'Specified environmental exposure, stressor, or spatial risk factor'
      : 'Core technological, algorithmic, clinical, or methodological intervention under investigation',
    comparisonHint: isScopingLike
      ? 'Not required for broad scoping mapping (recorded inductively where studies report comparators)'
      : 'Conventional baselines, standard-of-care controls, or competing benchmark methods',
    outcomeHint: wantsQual
      ? 'Stakeholder perceptions, adoption barriers, thematic experiences, and behavioral mechanisms'
      : 'Measurable quantitative performance indicators (accuracy, F1, RMSE, MD/SMD, OR/RR) and uncertainty estimates',
    contextHint: isGeoOrRs
      ? 'Open-field, catchment, ecological, or multi-site operational sensing environments'
      : 'Real-world clinical, institutional, industrial, or geographical implementation contexts',
  };
}

function extractCoreConceptGroups(topicText: string, project?: any): string[][] {
  const clean: string = String(topicText || project?.title || 'systematic literature review').trim();
  const stop = new Set<string>([
    'systematic', 'review', 'literature', 'meta', 'analysis', 'scoping', 'mapping',
    'using', 'based', 'with', 'from', 'into', 'across', 'study', 'studies', 'effect',
    'effects', 'impact', 'evaluation', 'assessment', 'approach', 'methods', 'method',
    'their', 'role', 'toward', 'towards', 'between', 'among', 'during', 'under',
  ]);
  const words: string[] = Array.from(
    new Set<string>(
      clean
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length > 3 && !stop.has(w))
    )
  );
  const g1 = words.slice(0, 2);
  const g2 = words.slice(2, 4);
  const g3 = words.slice(4, 6);
  const groups = [g1, g2, g3].filter((g) => g.length > 0);
  if (groups.length === 0) {
    return [['evidence', 'empirical'], ['evaluation', 'intervention']];
  }
  return groups;
}

function buildBooleanBlock(terms: string[], wrapper?: string): string {
  const unique = Array.from(new Set(terms.map((t) => t.trim()).filter(Boolean)));
  if (unique.length === 0) return '';
  const inner = unique.map((t) => `"${t}"`).join(' OR ');
  return wrapper ? `${wrapper}(${inner})` : `(${inner})`;
}

export function buildDefaultSearchStrategies(
  topicInput: string,
  fwItems: ProtocolFrameworkComponentItem[],
  yearRange: string,
  includeGeoRef = false
): ProtocolDatabaseSearchStrategy[] {
  const fwConcepts = fwItems
    .filter((c) => (c.keywords.length > 0 || c.synonyms.length > 0) && ['P', 'I', 'O', 'E', 'C', 'Co', 'PI', 'S'].includes(c.componentCode))
    .slice(0, 3)
    .map((c) => [...c.keywords, ...c.synonyms].slice(0, 4));

  const fallbackGroups = extractCoreConceptGroups(topicInput);
  const groups = fwConcepts.length >= 2 ? fwConcepts : fallbackGroups;
  const flatSyns = Array.from(new Set(groups.flat())).slice(0, 12);

  const scopusExpr = `TITLE-ABS-KEY(${groups.map((g) => buildBooleanBlock(g)).join(' AND ')})`;
  const wosExpr = groups.map((g) => buildBooleanBlock(g, 'TS=')).join(' AND ');
  const pubmedExpr = groups
    .map((g) => `(${g.map((t) => `"${t}"[tiab]`).join(' OR ')})`)
    .join(' AND ');
  const ieeeExpr = groups.map((g) => buildBooleanBlock(g)).join(' AND ');
  const sdGroups = groups.slice(0, 3).map((g) => `(${g.slice(0, 2).map((t) => `"${t}"`).join(' OR ')})`);
  const sdExpr = sdGroups.join(' AND ');
  const gsExprRaw = groups.slice(0, 3).map((g) => `(${g.slice(0, 2).map((t) => `"${t}"`).join(' OR ')})`).join(' AND ');
  const gsExpr = gsExprRaw.length > 240 ? gsExprRaw.slice(0, 236).trim() : gsExprRaw;
  const georefExpr = groups.map((g) => buildBooleanBlock(g)).join(' AND ');
  const crossrefExpr = groups.slice(0, 3).map((g) => g.slice(0, 2).join(' ')).join(' ');

  const yearClean = yearRange || '2015-2026';

  const baseList: ProtocolDatabaseSearchStrategy[] = [
    {
      id: 'db-scopus',
      databaseName: 'Scopus',
      searchPlatform: 'Elsevier Scopus Advanced Search',
      exactSearchString: scopusExpr,
      searchFields: 'TITLE-ABS-KEY (Title, Abstract, Keywords)',
      keywordsAndSynonyms: flatSyns,
      searchFilters: `Document type: Article, Review, Conference Paper; Years: ${yearClean}`,
      publicationYearRestrictions: yearClean,
      languageRestrictions: 'English (adjustable in Step 7)',
      executionDate: '',
      actualRetrievalCount: null,
      strategyVersion: '1.0',
      verificationStatus: 'draft',
      syntaxIssues: [],
      alternativeStrategy: `TITLE-ABS(${groups.map((g) => buildBooleanBlock(g.slice(0, 2))).join(' AND ')})`,
      executedByResearcher: false,
    },
    {
      id: 'db-wos',
      databaseName: 'Web of Science',
      searchPlatform: 'Clarivate Web of Science Core Collection',
      exactSearchString: wosExpr,
      searchFields: 'TS= (Topic: Title, Abstract, Author Keywords, Keywords Plus)',
      keywordsAndSynonyms: flatSyns,
      searchFilters: `Core Collection; Years: ${yearClean}`,
      publicationYearRestrictions: yearClean,
      languageRestrictions: 'English',
      executionDate: '',
      actualRetrievalCount: null,
      strategyVersion: '1.0',
      verificationStatus: 'draft',
      syntaxIssues: [],
      alternativeStrategy: groups.map((g) => buildBooleanBlock(g.slice(0, 2), 'TI=')).join(' AND '),
      executedByResearcher: false,
    },
    {
      id: 'db-pubmed',
      databaseName: 'PubMed',
      searchPlatform: 'NCBI PubMed / MEDLINE',
      exactSearchString: pubmedExpr,
      searchFields: '[tiab] Title/Abstract (+ MeSH terms where applicable)',
      keywordsAndSynonyms: flatSyns,
      searchFilters: `Publication date filter: ${yearClean}`,
      publicationYearRestrictions: yearClean,
      languageRestrictions: 'English',
      executionDate: '',
      actualRetrievalCount: null,
      strategyVersion: '1.0',
      verificationStatus: 'draft',
      syntaxIssues: [],
      alternativeStrategy: groups.map((g) => `(${g.map((t) => `"${t}"[All Fields]`).join(' OR ')})`).join(' AND '),
      executedByResearcher: false,
    },
    {
      id: 'db-sciencedirect',
      databaseName: 'ScienceDirect',
      searchPlatform: 'Elsevier ScienceDirect (<= 8 Boolean connectors)',
      exactSearchString: sdExpr,
      searchFields: 'Title, Abstract or Author-Specified Keywords',
      keywordsAndSynonyms: flatSyns.slice(0, 6),
      searchFilters: `Research & Review Articles; Years: ${yearClean}`,
      publicationYearRestrictions: yearClean,
      languageRestrictions: 'English',
      executionDate: '',
      actualRetrievalCount: null,
      strategyVersion: '1.0',
      verificationStatus: 'draft',
      syntaxIssues: [],
      alternativeStrategy: sdGroups.slice(0, 2).join(' AND '),
      executedByResearcher: false,
    },
    {
      id: 'db-ieee',
      databaseName: 'IEEE Xplore',
      searchPlatform: 'IEEE Xplore Digital Library Command Search',
      exactSearchString: ieeeExpr,
      searchFields: 'All Metadata / Document Title & Abstract',
      keywordsAndSynonyms: flatSyns,
      searchFilters: `Journals & Conferences; Years: ${yearClean}`,
      publicationYearRestrictions: yearClean,
      languageRestrictions: 'English',
      executionDate: '',
      actualRetrievalCount: null,
      strategyVersion: '1.0',
      verificationStatus: 'draft',
      syntaxIssues: [],
      alternativeStrategy: groups.map((g) => buildBooleanBlock(g.slice(0, 2), '"Document Title":')).join(' AND '),
      executedByResearcher: false,
    },
    {
      id: 'db-crossref',
      databaseName: 'Crossref',
      searchPlatform: 'Crossref REST API / DOI Metadata Works Search',
      exactSearchString: crossrefExpr,
      searchFields: 'query.bibliographic (Title, Abstract, Container metadata)',
      keywordsAndSynonyms: flatSyns.slice(0, 8),
      searchFilters: `from-pub-date:${yearClean.split('-')[0] || '2015'}; type:journal-article`,
      publicationYearRestrictions: yearClean,
      languageRestrictions: 'All metadata languages (screen English)',
      executionDate: '',
      actualRetrievalCount: null,
      strategyVersion: '1.0',
      verificationStatus: 'draft',
      syntaxIssues: [],
      alternativeStrategy: groups.slice(0, 2).flat().join(' '),
      executedByResearcher: false,
    },
    {
      id: 'db-google-scholar',
      databaseName: 'Google Scholar',
      searchPlatform: 'Google Scholar (Grey Literature & Citation Tracking)',
      exactSearchString: gsExpr,
      searchFields: 'Full-text / Publish or Perish export (first 200-300 results)',
      keywordsAndSynonyms: flatSyns.slice(0, 6),
      searchFilters: `Custom year range: ${yearClean}; Exclude patents/citations if configured`,
      publicationYearRestrictions: yearClean,
      languageRestrictions: 'English',
      executionDate: '',
      actualRetrievalCount: null,
      strategyVersion: '1.0',
      verificationStatus: 'draft',
      syntaxIssues: [],
      alternativeStrategy: groups.slice(0, 2).map((g) => `"${g[0]}"`).join(' AND '),
      executedByResearcher: false,
    },
  ];

  if (includeGeoRef) {
    baseList.splice(5, 0, {
      id: 'db-georef',
      databaseName: 'GeoRef',
      searchPlatform: 'AGI GeoRef / GeoScienceWorld Earth & Geospatial Index',
      exactSearchString: georefExpr,
      searchFields: 'Subject / Title / Abstract / Geographic Descriptors',
      keywordsAndSynonyms: flatSyns,
      searchFilters: `Journal Articles & Technical Reports; Years: ${yearClean}`,
      publicationYearRestrictions: yearClean,
      languageRestrictions: 'English',
      executionDate: '',
      actualRetrievalCount: null,
      strategyVersion: '1.0',
      verificationStatus: 'draft',
      syntaxIssues: [],
      alternativeStrategy: groups.slice(0, 2).map((g) => buildBooleanBlock(g)).join(' AND '),
      executedByResearcher: false,
    });
  }

  return baseList;
}

export function inferFrameworkComponents(
  frameworkType: ReviewFrameworkType,
  topicAnalysis: ProtocolTopicAnalysis
): ProtocolFrameworkComponentItem[] {
  const concepts = extractCoreConceptGroups(topicAnalysis.initialTopicInput || topicAnalysis.proposedTitle);
  const g0 = concepts[0] || ['target population', 'cohort'];
  const g1 = concepts[1] || ['intervention', 'methodology'];
  const g2 = concepts[2] || ['performance', 'accuracy'];

  const templates: Record<ReviewFrameworkType, Array<{ code: string; name: string; def: string; content: string; kws: string[]; syns: string[]; rqs: string[]; ext: string[] }>> = {
    PICOC: [
      { code: 'P', name: 'Population / Target System', def: 'Target entity, system, crop, cohort, or domain investigated.', content: topicAnalysis.targetPopulation || `Entities and systems addressed in ${topicAnalysis.domain}`, kws: g0, syns: [`${g0[0] || 'target'} system`, `${g0[0] || 'study'} context`], rqs: ['RQ1'], ext: ['Target population/system', 'Geographic setting'] },
      { code: 'I', name: 'Intervention / Technology', def: 'Primary technology, algorithm, exposure, or workflow evaluated.', content: topicAnalysis.interventionOrFocus || 'Core methods, technologies, and workflows examined', kws: g1, syns: [`${g1[0] || 'method'} approach`, `${g1[0] || 'model'} pipeline`], rqs: ['RQ1', 'RQ2'], ext: ['Intervention/technology type', 'Methodological parameters'] },
      { code: 'C', name: 'Comparison / Baseline', def: 'Control group, benchmark baseline, or alternative methodology.', content: topicAnalysis.comparisonBaseline || 'Conventional baselines, alternative models, or control conditions', kws: ['baseline', 'benchmark'], syns: ['conventional method', 'control group'], rqs: ['RQ2'], ext: ['Comparator description'] },
      { code: 'O', name: 'Outcomes & Performance Metrics', def: 'Empirical metrics, accuracy, effect estimates, or diagnostic findings.', content: topicAnalysis.measurableOutcomes || 'Quantitative performance indicators and empirical outcomes', kws: g2, syns: ['accuracy', 'effectiveness'], rqs: ['RQ2', 'RQ3'], ext: ['Primary outcome measure', 'Quantitative variance/CI'] },
      { code: 'Co', name: 'Context / Application Setting', def: 'Operational, geographic, clinical, or industrial deployment environment.', content: topicAnalysis.contextAndConstraints || 'Field, clinical, or operational deployment environments', kws: ['operational', 'validation'], syns: ['real-world setting', 'deployment'], rqs: ['RQ1', 'RQ3'], ext: ['Study setting', 'Validation scale'] },
    ],
    PICO: [
      { code: 'P', name: 'Population / Problem', def: 'Target subjects or domain problem.', content: topicAnalysis.targetPopulation || 'Target study population', kws: g0, syns: ['cohort', 'subjects'], rqs: ['RQ1'], ext: ['Sample characteristics'] },
      { code: 'I', name: 'Intervention', def: 'Primary intervention or treatment.', content: topicAnalysis.interventionOrFocus || 'Primary intervention evaluated', kws: g1, syns: ['protocol', 'treatment'], rqs: ['RQ1', 'RQ2'], ext: ['Intervention details'] },
      { code: 'C', name: 'Comparator', def: 'Standard of care or control.', content: topicAnalysis.comparisonBaseline || 'Standard control or baseline', kws: ['control', 'baseline'], syns: ['placebo', 'standard practice'], rqs: ['RQ2'], ext: ['Comparator arm'] },
      { code: 'O', name: 'Outcome', def: 'Primary and secondary endpoints.', content: topicAnalysis.measurableOutcomes || 'Measured primary outcomes', kws: g2, syns: ['endpoint', 'effect size'], rqs: ['RQ2', 'RQ3'], ext: ['Outcome metric & SE'] },
    ],
    PECO: [
      { code: 'P', name: 'Population', def: 'Target exposed population or ecosystem.', content: topicAnalysis.targetPopulation || 'Exposed population/environment', kws: g0, syns: ['cohort', 'subjects'], rqs: ['RQ1'], ext: ['Population attributes'] },
      { code: 'E', name: 'Exposure', def: 'Environmental, technical, or behavioral exposure.', content: topicAnalysis.interventionOrFocus || 'Defined exposure level or factor', kws: g1, syns: ['factor', 'hazard'], rqs: ['RQ1', 'RQ2'], ext: ['Exposure level & unit'] },
      { code: 'C', name: 'Comparator', def: 'Unexposed or low-exposure reference group.', content: topicAnalysis.comparisonBaseline || 'Unexposed or baseline reference', kws: ['reference', 'unexposed'], syns: ['baseline', 'control'], rqs: ['RQ2'], ext: ['Reference condition'] },
      { code: 'O', name: 'Outcome', def: 'Observed response or risk estimate.', content: topicAnalysis.measurableOutcomes || 'Measured outcome response', kws: g2, syns: ['incidence', 'risk ratio'], rqs: ['RQ2', 'RQ3'], ext: ['Effect estimate & CI'] },
    ],
    PCC: [
      { code: 'P', name: 'Population', def: 'Target population, subjects, or systems.', content: topicAnalysis.targetPopulation || 'Target population or domain entities', kws: g0, syns: ['subjects', 'cohort'], rqs: ['RQ1'], ext: ['Population scope'] },
      { code: 'C', name: 'Concept', def: 'Core phenomenon, methodology, or construct mapped.', content: topicAnalysis.interventionOrFocus || 'Core scientific concept or technology', kws: g1, syns: ['methodology', 'construct'], rqs: ['RQ1', 'RQ2'], ext: ['Concept taxonomy'] },
      { code: 'Co', name: 'Context', def: 'Geographical, disciplinary, or operational context.', content: topicAnalysis.contextAndConstraints || 'Broad geographic and operational contexts', kws: ['context', 'application'], syns: ['setting', 'region'], rqs: ['RQ3'], ext: ['Geographic/domain context'] },
    ],
    SPIDER: [
      { code: 'S', name: 'Sample', def: 'Sample group or target domain.', content: topicAnalysis.targetPopulation || 'Target sample/participants', kws: g0, syns: ['participants', 'sample'], rqs: ['RQ1'], ext: ['Sample size & profile'] },
      { code: 'PI', name: 'Phenomenon of Interest', def: 'Core technology, practice, or experience.', content: topicAnalysis.interventionOrFocus || 'Core phenomenon investigated', kws: g1, syns: ['practice', 'experience'], rqs: ['RQ1', 'RQ2'], ext: ['Phenomenon attributes'] },
      { code: 'D', name: 'Design', def: 'Empirical, qualitative, or mixed study design.', content: topicAnalysis.eligibleStudyDesigns || 'Empirical, case, or experimental designs', kws: ['experimental', 'empirical'], syns: ['observational', 'case study'], rqs: ['RQ1'], ext: ['Study design'] },
      { code: 'E', name: 'Evaluation', def: 'Perceptions, performance, or thematic outcomes.', content: topicAnalysis.measurableOutcomes || 'Evaluated qualitative/quantitative findings', kws: g2, syns: ['evaluation', 'findings'], rqs: ['RQ2'], ext: ['Evaluative findings'] },
      { code: 'R', name: 'Research Type', def: 'Qualitative, quantitative, or mixed methods.', content: 'Qualitative and mixed-methods primary research', kws: ['qualitative', 'mixed-methods'], syns: ['interviews', 'focus groups'], rqs: ['RQ3'], ext: ['Research methodology'] },
    ],
    SPICE: [
      { code: 'S', name: 'Setting', def: 'Where the study or service occurs.', content: topicAnalysis.contextAndConstraints || 'Target operational setting', kws: ['setting', 'environment'], syns: ['context', 'site'], rqs: ['RQ1'], ext: ['Study setting'] },
      { code: 'P', name: 'Perspective', def: 'Stakeholders or end-users.', content: topicAnalysis.targetPopulation || 'Primary stakeholders or domain targets', kws: g0, syns: ['stakeholders', 'practitioners'], rqs: ['RQ1'], ext: ['Stakeholder perspective'] },
      { code: 'I', name: 'Intervention', def: 'Program, system, or practice.', content: topicAnalysis.interventionOrFocus || 'Evaluated intervention or tool', kws: g1, syns: ['system', 'practice'], rqs: ['RQ2'], ext: ['Intervention specification'] },
      { code: 'C', name: 'Comparison', def: 'Alternative condition.', content: topicAnalysis.comparisonBaseline || 'Alternative or baseline condition', kws: ['baseline', 'alternative'], syns: ['control', 'comparator'], rqs: ['RQ2'], ext: ['Comparison basis'] },
      { code: 'E', name: 'Evaluation', def: 'Success criteria and outcomes.', content: topicAnalysis.measurableOutcomes || 'Success metrics and outcomes', kws: g2, syns: ['metrics', 'impact'], rqs: ['RQ3'], ext: ['Evaluation metrics'] },
    ],
    PICOS: [
      { code: 'P', name: 'Population / Problem', def: 'Target subjects or domain problem.', content: topicAnalysis.targetPopulation || 'Target study population', kws: g0, syns: ['cohort', 'subjects'], rqs: ['RQ1'], ext: ['Sample characteristics'] },
      { code: 'I', name: 'Intervention', def: 'Primary intervention or method.', content: topicAnalysis.interventionOrFocus || 'Primary intervention evaluated', kws: g1, syns: ['protocol', 'approach'], rqs: ['RQ1', 'RQ2'], ext: ['Intervention details'] },
      { code: 'C', name: 'Comparison', def: 'Comparator or baseline.', content: topicAnalysis.comparisonBaseline || 'Standard control or baseline', kws: ['control', 'baseline'], syns: ['benchmark', 'comparator'], rqs: ['RQ2'], ext: ['Comparator arm'] },
      { code: 'O', name: 'Outcomes', def: 'Measured outcomes and variance.', content: topicAnalysis.measurableOutcomes || 'Measured primary outcomes', kws: g2, syns: ['endpoint', 'effect size'], rqs: ['RQ2', 'RQ3'], ext: ['Outcome metric & SE'] },
      { code: 'S', name: 'Study Design', def: 'Eligible empirical study designs.', content: topicAnalysis.eligibleStudyDesigns || 'RCTs, quasi-experimental, and comparative empirical designs', kws: ['experimental', 'comparative'], syns: ['observational', 'trial'], rqs: ['RQ1'], ext: ['Study design classification'] },
    ],
    CIMO: [
      { code: 'C', name: 'Context', def: 'Setting, domain, and constraints.', content: topicAnalysis.contextAndConstraints || 'Organizational or operational setting', kws: g0, syns: ['setting', 'environment'], rqs: ['RQ1'], ext: ['Contextual factors'] },
      { code: 'I', name: 'Intervention', def: 'Action, mechanism, or policy introduced.', content: topicAnalysis.interventionOrFocus || 'Primary intervention or mechanism', kws: g1, syns: ['mechanism', 'strategy'], rqs: ['RQ1', 'RQ2'], ext: ['Intervention features'] },
      { code: 'M', name: 'Mechanism', def: 'Underlying causal process explained.', content: 'Generative causal mechanisms explaining how and why the intervention works', kws: ['mechanism', 'causal'], syns: ['mediator', 'process'], rqs: ['RQ2'], ext: ['Identified mechanism'] },
      { code: 'O', name: 'Outcome', def: 'Observed effects and performance outcomes.', content: topicAnalysis.measurableOutcomes || 'Observed outcomes across contexts', kws: g2, syns: ['outcome', 'effect'], rqs: ['RQ3'], ext: ['Outcome measure'] },
    ],
  };

  const list = templates[frameworkType] || templates.PICOC;
  return list.map((item) => ({
    id: `fw-${frameworkType.toLowerCase()}-${item.code.toLowerCase()}`,
    frameworkId: frameworkType,
    componentCode: item.code,
    componentName: item.name,
    definition: item.def,
    proposedContent: item.content,
    keywords: item.kws,
    synonyms: item.syns,
    inclusionImplications: `Include studies explicitly addressing ${item.name.toLowerCase()} within the defined domain boundaries.`,
    exclusionImplications: `Exclude studies unrelated to the target ${item.name.toLowerCase()} or lacking methodological clarity.`,
    correspondingRqCodes: item.rqs,
    dataExtractionRequirements: item.ext,
    consistencyNotes: [],
    status: 'pending',
  }));
}

export function buildDeterministicProtocol(
  projectId: string,
  topicInput: string,
  project?: any,
  preferredReviewType?: LiteratureReviewTypeId,
  preferredFramework?: ReviewFrameworkType
): SystematicReviewProtocol {
  const now = new Date().toISOString();
  const cleanTopic = (topicInput || project?.title || 'Systematic Literature Review').trim();
  const domainProfile = inferTopicDomainProfile(cleanTopic, project);

  const reviewType: LiteratureReviewTypeId =
    preferredReviewType || project?.reviewType || domainProfile.inferredReviewType;
  const frameworkType: ReviewFrameworkType =
    preferredFramework ||
    project?.frameworkType ||
    (reviewType === 'scoping' || reviewType === 'mapping' || reviewType === 'bibliometric'
      ? 'PCC'
      : reviewType === 'meta_synthesis'
      ? 'SPIDER'
      : reviewType === 'realist' || reviewType === 'theoretical'
      ? 'CIMO'
      : domainProfile.inferredFramework);

  const isScoping = reviewType === 'scoping' || reviewType === 'mapping' || reviewType === 'bibliometric';
  const isMeta = reviewType === 'meta_analysis';

  const topicAnalysis: ProtocolTopicAnalysis = {
    initialTopicInput: cleanTopic,
    proposedTitle: `${cleanTopic}: A ${
      reviewType === 'scoping'
        ? 'Scoping Review'
        : reviewType === 'meta_analysis'
        ? 'Systematic Review and Meta-Analysis'
        : reviewType === 'mapping'
        ? 'Systematic Evidence Mapping Review'
        : 'Systematic Literature Review'
    } Protocol`,
    discipline: domainProfile.discipline,
    domain: project?.domain || cleanTopic,
    subdomain: domainProfile.subdomain,
    focusAndScope: `Synthesize peer-reviewed empirical evidence addressing ${cleanTopic}, including study contexts, methodological designs, comparator baselines, and reported outcomes.`,
    theoreticalMotivation: `Consolidate fragmented empirical findings on ${cleanTopic} using transparent, reproducible synthesis standards.`,
    researchProblem: `Primary studies on ${cleanTopic} vary substantially in experimental setup, baseline definitions, and reporting completeness, requiring structured methodological synthesis.`,
    knowledgeGaps: `Preliminary protocol-stage hypothesis: cross-context comparability, standardized reporting, and methodological heterogeneity remain under-synthesized (pending empirical literature search and screening verification).`,
    knowledgeGapVerifiedByEvidence: false,
    geographicEligibility: domainProfile.geographicDefault,
    publicationYearEligibility: '2015-2026',
    eligibleStudyDesigns: domainProfile.eligibleDesigns,
    eligiblePublicationTypes: 'Peer-reviewed journal articles and full-length peer-reviewed conference papers',
    targetPopulation: project?.picoc?.population || domainProfile.targetPopulationHint,
    interventionOrFocus: project?.picoc?.intervention || domainProfile.interventionHint,
    comparisonBaseline: project?.picoc?.comparison || domainProfile.comparisonHint,
    measurableOutcomes: project?.picoc?.outcome || domainProfile.outcomeHint,
    contextAndConstraints: project?.picoc?.context || domainProfile.contextHint,
    isPreliminaryAiSuggestion: true,
    approvedByResearcher: false,
  };

  const reviewMethodRecommendation: ProtocolReviewMethodRecommendation = {
    recommendedReviewType: reviewType,
    recommendedPrimaryFramework: frameworkType,
    complementaryFrameworks: domainProfile.complementaryFrameworks.filter((f) => f !== frameworkType),
    methodologicalGuidance: domainProfile.methodologicalGuidance,
    reportingGuideline: domainProfile.reportingGuideline,
    recommendedAppraisalRoleNote:
      'PRISMA governs transparent reporting (not study quality). Conduct methodology (Cochrane/JBI/Campbell) governs workflow rigor. Risk-of-bias/quality appraisal uses design-specific instruments (RoB 2, ROBINS-I, JBI, CASP, MMAT, QUADAS-2).',
    justification: isScoping
      ? `${reviewType.toUpperCase()} fits broad conceptual mapping, heterogeneity characterization, and evidence-gap identification using ${frameworkType}.`
      : `A structured ${reviewType.toUpperCase()} paired with ${frameworkType} ensures focused question formulation, reproducible screening, critical quality appraisal, and rigorous qualitative/quantitative synthesis.`,
    alternatives: [
      {
        reviewType: 'slr',
        name: 'Standard Systematic Literature Review (SLR)',
        methodologicalGuidance: 'Cochrane / Kitchenham SLR Guidelines',
        reportingGuideline: 'PRISMA 2020',
        suitabilitySummary: 'Best when answering focused comparative or performance questions with mandatory quality appraisal.',
      },
      {
        reviewType: 'scoping',
        name: 'Scoping Review (Evidence Mapping)',
        methodologicalGuidance: 'JBI Scoping Review Methodology (Peters et al.)',
        reportingGuideline: 'PRISMA-ScR',
        suitabilitySummary: 'Best when mapping emerging, heterogeneous literature without statistical pooling.',
      },
      {
        reviewType: 'meta_analysis',
        name: 'Systematic Review with Meta-Analysis',
        methodologicalGuidance: 'Cochrane Handbook / Borenstein et al.',
        reportingGuideline: 'PRISMA 2020',
        suitabilitySummary: 'Appropriate ONLY when sufficient studies share comparable outcomes, designs, and extractable variance estimates.',
      },
      {
        reviewType: 'integrative',
        name: 'Integrative / Mixed-Methods Review',
        methodologicalGuidance: 'JBI Mixed-Methods Synthesis (Convergent Segregated/Integrated)',
        reportingGuideline: 'PRISMA 2020',
        suitabilitySummary: 'Integrates quantitative effectiveness with qualitative contextual and implementation barriers.',
      },
    ],
    approvedByResearcher: false,
  };

  const frameworkComponents = inferFrameworkComponents(frameworkType, topicAnalysis);

  const specificObjectives: ProtocolObjectiveItem[] = [
    {
      code: 'SO1',
      statement: `Map study designs, temporal trends, geographic coverage, and target contexts across primary literature on ${cleanTopic}.`,
      mappedRqCodes: ['RQ1'],
      status: 'pending',
    },
    {
      code: 'SO2',
      statement: `Compare interventions, technologies, or analytical methods against baseline approaches and evaluate reported primary outcomes.`,
      mappedRqCodes: ['RQ2'],
      status: 'pending',
    },
    {
      code: 'SO3',
      statement: `Identify methodological limitations, risk-of-bias patterns, operational constraints, and verified evidence gaps.`,
      mappedRqCodes: ['RQ3'],
      status: 'pending',
    },
  ];

  const projectRqs = Array.isArray(project?.researchQuestions) && project.researchQuestions.length > 0 ? project.researchQuestions : null;
  const rqMappings: ProtocolRqMapping[] = projectRqs
    ? projectRqs.map((rq: any, idx: number) => ({
        code: rq.code || `RQ${idx + 1}`,
        question: rq.question || `Research question ${idx + 1} addressing ${cleanTopic}`,
        mappedFrameworkComponents: idx === 0
          ? [frameworkComponents[0]?.componentCode || 'P', frameworkComponents[frameworkComponents.length - 1]?.componentCode || 'Co']
          : frameworkComponents.slice(0, Math.min(3, frameworkComponents.length)).map((c) => c.componentCode),
        mappedObjectives: [`SO${Math.min(idx + 1, 3)}`],
        searchConcepts: frameworkComponents[idx % frameworkComponents.length]?.keywords || ['empirical', 'evidence'],
        eligibilityRequirements: 'Must provide empirical evidence aligned with study scope.',
        requiredExtractionVariables: [rq.mainEvidenceToCollect || `Primary Evidence for RQ${idx + 1}`],
        evidenceType: 'Peer-reviewed empirical evidence',
        proposedSynthesisMethod: idx === 1 && isMeta ? 'Descriptive synthesis & conditional meta-analysis' : 'Structured narrative & descriptive quantitative tabulation',
        consistencyIssues: [],
        status: 'pending',
      }))
    : [
        {
          code: 'RQ1',
          question: `What study designs, application contexts, and methodological approaches characterize empirical research on ${cleanTopic}?`,
          mappedFrameworkComponents: Array.from(new Set([frameworkComponents[0]?.componentCode || 'P', frameworkComponents[frameworkComponents.length - 1]?.componentCode || 'Co'])),
          mappedObjectives: ['SO1'],
          searchConcepts: frameworkComponents[0]?.keywords || ['population', 'context'],
          eligibilityRequirements: 'Original primary empirical studies within defined publication window.',
          requiredExtractionVariables: ['Study design', 'Publication year & country', 'Target context/system'],
          evidenceType: 'Bibliometric, design, and contextual metadata',
          proposedSynthesisMethod: 'Descriptive quantitative distribution & evidence mapping matrix',
          consistencyIssues: [],
          status: 'pending',
        },
        {
          code: 'RQ2',
          question: `How do primary interventions, models, or exposures perform relative to comparison baselines across reported quantitative and qualitative outcomes?`,
          mappedFrameworkComponents: frameworkComponents
            .filter((c) => ['I', 'E', 'C', 'O', 'PI', 'M'].includes(c.componentCode))
            .map((c) => c.componentCode),
          mappedObjectives: ['SO2'],
          searchConcepts: frameworkComponents[1]?.keywords || ['intervention', 'outcome'],
          eligibilityRequirements: 'Studies reporting explicit comparator or measurable validation outcome.',
          requiredExtractionVariables: ['Intervention/model configuration', 'Primary outcome metric', 'Sample size & variance/CI'],
          evidenceType: 'Comparative empirical outcomes and performance metrics',
          proposedSynthesisMethod: isMeta
            ? 'Conditional inverse-variance meta-analysis (if compatible) + SWiM narrative synthesis'
            : 'Structured comparative synthesis + descriptive quantitative distributions',
          consistencyIssues: [],
          status: 'pending',
        },
        {
          code: 'RQ3',
          question: `What methodological quality concerns, heterogeneity drivers, and implementation constraints limit current evidence on ${cleanTopic}?`,
          mappedFrameworkComponents: [frameworkComponents[frameworkComponents.length - 1]?.componentCode || 'Co'],
          mappedObjectives: ['SO3'],
          searchConcepts: ['limitation', 'validation', 'bias'],
          eligibilityRequirements: 'Included studies passing minimum screening eligibility.',
          requiredExtractionVariables: ['Appraisal risk-of-bias score', 'Reported limitations & edge cases'],
          evidenceType: 'Critical appraisal judgments and qualitative author-reported limitations',
          proposedSynthesisMethod: 'Thematic barrier/limitation synthesis stratified by quality tier',
          consistencyIssues: [],
          status: 'pending',
        },
      ];

  const eligibilityMatrix: ProtocolEligibilityRow[] = [
    {
      id: 'el-focus',
      criterion: 'Research Focus & Topical Scope',
      inclusionRequirement: `Directly investigates ${cleanTopic} within ${topicAnalysis.domain}`,
      exclusionRequirement: 'Peripheral mentions or tangential domains outside core review scope',
      guidance: 'Screen title, abstract, and keywords against the primary research problem.',
      status: 'pending',
    },
    {
      id: 'el-population',
      criterion: 'Population / Target System',
      inclusionRequirement: topicAnalysis.targetPopulation,
      exclusionRequirement: 'Ineligible cohorts, synthetic-only toy proxies lacking real target relevance, or wrong domain',
      guidance: `Follow the active ${frameworkType} framework population definition.`,
      status: 'pending',
    },
    {
      id: 'el-intervention',
      criterion: 'Intervention / Exposure / Technology',
      inclusionRequirement: topicAnalysis.interventionOrFocus,
      exclusionRequirement: 'Unrelated technologies, exposures, or comparator-only papers without focal mechanism',
      guidance: 'Align closely with primary framework intervention/exposure keywords.',
      status: 'pending',
    },
    {
      id: 'el-outcomes',
      criterion: 'Outcomes & Measurable Indicators',
      inclusionRequirement: `Reports empirical ${topicAnalysis.measurableOutcomes}`,
      exclusionRequirement: 'No empirical evaluation metrics, missing results section, or purely speculative claims',
      guidance: 'Do not exclude solely for non-significant results (avoids publication bias).',
      status: 'pending',
    },
    {
      id: 'el-geography',
      criterion: 'Geographic Scope',
      inclusionRequirement: topicAnalysis.geographicEligibility,
      exclusionRequirement: 'Only excluded if region falls outside explicitly bounded regional protocols',
      guidance: 'Record study location separately from author institutional country.',
      status: 'pending',
    },
    {
      id: 'el-year',
      criterion: 'Publication Period',
      inclusionRequirement: `Published within ${topicAnalysis.publicationYearEligibility}`,
      exclusionRequirement: 'Published in 2014 or earlier',
      guidance: 'Document seminal pre-cutoff background works in introduction without pooling into primary results.',
      status: 'pending',
    },
    {
      id: 'el-design',
      criterion: 'Study Design',
      inclusionRequirement: topicAnalysis.eligibleStudyDesigns,
      exclusionRequirement: 'Opinion pieces, editorials, narrative essays, conceptual notes without empirical methodology',
      guidance: 'Distinguish study design rigorously before selecting quality appraisal tools.',
      status: 'pending',
    },
    {
      id: 'el-pubtype',
      criterion: 'Publication Type (Original vs Review)',
      inclusionRequirement: topicAnalysis.eligiblePublicationTypes,
      exclusionRequirement: 'Secondary literature reviews (excluded from primary quantitative pool unless flagged for snowballing), editorials, patents',
      guidance: 'Classify original research vs secondary reviews explicitly in Extraction Matrix & PRISMA.',
      status: 'pending',
    },
    {
      id: 'el-language',
      criterion: 'Language',
      inclusionRequirement: 'English full text (or translated verified peer-reviewed edition)',
      exclusionRequirement: 'Non-English full texts when reliable translation is unavailable (log count explicitly)',
      guidance: 'Document language restrictions transparently under PRISMA Item 5 & 6.',
      status: 'pending',
    },
    {
      id: 'el-fulltext',
      criterion: 'Full-Text Availability',
      inclusionRequirement: 'Full-text PDF or archival manuscript retrievable for verification',
      exclusionRequirement: 'Abstract-only conference notes or irretrievable full texts after institutional search',
      guidance: 'Record retrieval failures under PRISMA "Reports not retrieved".',
      status: 'pending',
    },
  ];

  const standardizedExclusionReasons = [
    'Wrong research focus / out of scope',
    'Ineligible population, cohort, or study area',
    'Ineligible intervention, exposure, or technology',
    'Irrelevant or missing empirical outcome indicators',
    'Ineligible study design',
    'Wrong publication type (secondary review, editorial, abstract-only)',
    'Outside publication period',
    'Duplicate report / overlapping dataset (prevent double-counting)',
    'Full text unavailable after retrieval verification',
  ];

  const databaseSearchStrategies = buildDefaultSearchStrategies(
    cleanTopic,
    frameworkComponents,
    topicAnalysis.publicationYearEligibility,
    domainProfile.includeGeoRef
  );

  const methodologySections: ProtocolMethodologySection[] = DEFAULT_18_METHODOLOGY_TITLES.map((sec) => ({
    number: parseInt(sec.title.split('.')[0], 10) || 1,
    key: sec.key,
    title: sec.title,
    proposedContent:
      sec.key === 'title_abstract_rationale'
        ? `This protocol defines the systematic methodology for "${topicAnalysis.proposedTitle}". Rationale: ${topicAnalysis.theoreticalMotivation}`
        : sec.key === 'review_type_methodology'
        ? `Conduct methodology follows ${reviewMethodRecommendation.methodologicalGuidance}. Transparent reporting adheres to ${reviewMethodRecommendation.reportingGuideline}. Quality appraisal is executed separately with design-specific tools.`
        : sec.key === 'data_extraction'
        ? `Data will be extracted independently into structured evidence matrices linking each extracted variable directly to RQ1-RQ3 and source PDF page numbers. Missing numerical statistics will never be fabricated or guessed.`
        : sec.key === 'quantitative_synthesis'
        ? `Descriptive quantitative synthesis covers screening flow, study characteristics, and objective contribution percentages. Statistical meta-analysis (Fixed-Effect / Random-Effects DL/REML/PM) will only run if outcome comparability, independent clusters, and variance data are verified.`
        : `Standardized reproducible procedure for ${sec.title.replace(/^\d+\.\s*/, '')} tailored to ${reviewType.toUpperCase()} (${frameworkType}).`,
    methodologicalJustification: `Ensures transparency, auditability, and alignment with ${reviewMethodRecommendation.methodologicalGuidance} and ${reviewMethodRecommendation.reportingGuideline}.`,
    requiredResearcherDecisions: [
      'Confirm scope boundaries and threshold criteria before locking protocol.',
    ],
    supportingReferences: [
      'Page et al. (2021) PRISMA 2020 Statement (BMJ)',
      'Rethlefsen et al. (2021) PRISMA-S Extension',
      'Higgins et al. Cochrane Handbook for Systematic Reviews',
      'Booth et al. (2016) Framework Selection Guidance',
    ],
    completionStatus: 'complete',
    approvalStatus: 'pending',
  }));

  const extractionPlan: ProtocolExtractionVariablePlan[] = [
    {
      id: 'ext-study-design',
      rqCode: 'RQ1',
      relatedObjective: 'SO1',
      variableName: 'Study design',
      definition: 'Empirical design classification (RCT, quasi-experimental, observational, case, simulation)',
      dataType: 'categorical',
      measurementUnits: 'Nominal category',
      expectedEvidenceSource: 'Methods section',
      suggestedExtractionMethod: 'Structured picklist + verifier audit',
      proposedSynthesisApproach: 'Frequency & proportion distribution',
      approved: false,
    },
    {
      id: 'ext-year-country',
      rqCode: 'RQ1',
      relatedObjective: 'SO1',
      variableName: 'Publication year & country',
      definition: 'Publication year and geographic study location (not merely author affiliation if distinct)',
      dataType: 'categorical',
      measurementUnits: 'Year (YYYY) & ISO country',
      expectedEvidenceSource: 'Metadata & Study Area section',
      suggestedExtractionMethod: 'Dual extraction with PDF page verification',
      proposedSynthesisApproach: 'Temporal & geographic distribution charts',
      approved: false,
    },
    {
      id: 'ext-context-system',
      rqCode: 'RQ1',
      relatedObjective: 'SO1',
      variableName: 'Target context/system',
      definition: 'Target population, environment, or operational platform',
      dataType: 'text',
      measurementUnits: 'Structured taxonomy label',
      expectedEvidenceSource: 'Introduction & Methods',
      suggestedExtractionMethod: 'Thematic standardization',
      proposedSynthesisApproach: 'Evidence mapping matrix',
      approved: false,
    },
    {
      id: 'ext-intervention-cfg',
      rqCode: 'RQ2',
      relatedObjective: 'SO2',
      variableName: 'Intervention/model configuration',
      definition: 'Specific algorithm, sensor, treatment, or protocol parameters',
      dataType: 'text',
      measurementUnits: 'Parameter profile',
      expectedEvidenceSource: 'Methods / Experimental Setup',
      suggestedExtractionMethod: 'Structured coding sheet',
      proposedSynthesisApproach: 'Comparative taxonomy & subgroup variable',
      approved: false,
    },
    {
      id: 'ext-primary-outcome',
      rqCode: 'RQ2',
      relatedObjective: 'SO2',
      variableName: 'Primary outcome metric',
      definition: 'Reported accuracy, F1, RMSE, MD/SMD, OR/RR, or correlation estimate',
      dataType: 'numeric',
      measurementUnits: 'Study-specific metric & units',
      expectedEvidenceSource: 'Results tables & text',
      suggestedExtractionMethod: 'Exact numerical transcription with source page tag',
      proposedSynthesisApproach: 'Descriptive quantitative synthesis & conditional meta-analysis',
      approved: false,
    },
    {
      id: 'ext-variance-ci',
      rqCode: 'RQ2',
      relatedObjective: 'SO2',
      variableName: 'Sample size & variance/CI',
      definition: 'Group sample sizes (n1, n2), SD, SE, or 95% confidence interval for pooling eligibility',
      dataType: 'numeric',
      measurementUnits: 'Counts, SD/SE',
      expectedEvidenceSource: 'Results tables / supplementary files',
      suggestedExtractionMethod: 'Exact numeric entry; mark missing if unreported (never fabricate)',
      proposedSynthesisApproach: 'Inverse-variance eligibility screening',
      approved: false,
    },
    {
      id: 'ext-appraisal-tier',
      rqCode: 'RQ3',
      relatedObjective: 'SO3',
      variableName: 'Appraisal risk-of-bias score',
      definition: 'Design-specific critical appraisal judgment & overall quality tier',
      dataType: 'categorical',
      measurementUnits: 'Low / Moderate / High Risk',
      expectedEvidenceSource: 'Appraisal Worksheet module',
      suggestedExtractionMethod: 'Design-specific checklist scoring',
      proposedSynthesisApproach: 'Sensitivity analysis & quality stratification',
      approved: false,
    },
    {
      id: 'ext-limitations',
      rqCode: 'RQ3',
      relatedObjective: 'SO3',
      variableName: 'Reported limitations & edge cases',
      definition: 'Author-reported and reviewer-identified methodological or practical constraints',
      dataType: 'text',
      measurementUnits: 'Narrative codes',
      expectedEvidenceSource: 'Discussion & Limitations sections',
      suggestedExtractionMethod: 'Thematic coding with direct evidence quote',
      proposedSynthesisApproach: 'Narrative & thematic barrier synthesis',
      approved: false,
    },
  ];

  const appraisalPlan: ProtocolAppraisalPlanItem[] = [
    {
      id: 'app-rct',
      studyDesign: 'Randomized Controlled / Experimental Trials',
      recommendedInstrument: 'Cochrane RoB 2',
      appraisalDomains: ['Randomization process', 'Deviations from intended interventions', 'Missing outcome data', 'Outcome measurement', 'Selection of reported result'],
      assessmentCriteria: ['Allocation concealment', 'Blinded assessment', 'Intention-to-treat handling'],
      scoringApproach: 'Low / Some Concerns / High Risk of Bias',
      verificationStatus: 'planned',
      methodologicalJustification: 'Gold-standard domain-based risk-of-bias tool for randomized experiments.',
    },
    {
      id: 'app-nonrand',
      studyDesign: 'Quasi-Experimental & Observational Comparative Studies',
      recommendedInstrument: 'ROBINS-I / JBI Quasi-Experimental Checklist',
      appraisalDomains: ['Confounding', 'Participant/sample selection', 'Classification of interventions', 'Missing data', 'Outcome measurement'],
      assessmentCriteria: ['Baseline equivalence', 'Control for confounders', 'Independent validation split'],
      scoringApproach: 'Low / Moderate / Serious / Critical Risk',
      verificationStatus: 'planned',
      methodologicalJustification: 'Captures confounding and selection bias specific to non-randomized designs.',
    },
    {
      id: 'app-diag',
      studyDesign: 'Diagnostic / Classification / Prediction Models',
      recommendedInstrument: 'QUADAS-2 / PROBAST',
      appraisalDomains: ['Sample selection', 'Index test / feature pipeline', 'Reference ground truth', 'Flow, leakage & timing'],
      assessmentCriteria: ['No data leakage between train/test', 'Blind ground-truth verification', 'External site validation'],
      scoringApproach: 'Risk of Bias + Applicability Concerns',
      verificationStatus: 'planned',
      methodologicalJustification: 'Evaluates ground-truth validity and overfitting/leakage in diagnostic & ML models.',
    },
    {
      id: 'app-mixed',
      studyDesign: 'Qualitative & Mixed-Methods Studies',
      recommendedInstrument: 'MMAT (Mixed Methods Appraisal Tool) / CASP Qualitative',
      appraisalDomains: ['Qualitative coherence', 'Integration quality', 'Reflexivity & context transferability'],
      assessmentCriteria: ['Clear research question alignment', 'Transparent integration of strands'],
      scoringApproach: '5-criteria MMAT methodological rating',
      verificationStatus: 'planned',
      methodologicalJustification: 'Explicitly accommodates qualitative and mixed-methods designs without forcing quantitative bias criteria.',
    },
  ];

  const synthesisPlan: ProtocolSynthesisPlan = {
    qualitativeMethods: [
      'Structured Narrative Synthesis (SWiM Reporting Guidelines)',
      'Cross-study Thematic Matrix mapped to RQ1-RQ3',
      'Methodological Limitation & Evidence Gap Taxonomy',
    ],
    quantitativeMethods: [
      'PRISMA 2020 Flow & Exclusion Reason Counts',
      'Descriptive Study, Temporal, Geographic & Metric Distributions',
      ...(isScoping
        ? ['Evidence Mapping Cross-Tabulations (without statistical effect pooling)']
        : ['Inverse-Variance Meta-Analysis (Fixed-Effect & Random-Effects DL/REML/PM) when compatibility checks pass']),
    ],
    metaAnalysisFeasibility: isScoping ? 'not_feasible' : isMeta ? 'feasible' : 'conditional',
    feasibilityChecks: {
      studyDesignCompatibility: 'Requires separating randomized, observational, and cross-validation study designs before pooling.',
      outcomeComparability: 'Outcomes must share construct and metric scale (e.g., separate SMD, OR, RR, COR, and PROP models).',
      effectSizeAvailability: 'Check whether studies report group means/SDs, 2x2 counts, or directly computed effect estimates.',
      statisticalDataAvailability: 'Many applied studies report point accuracy without SD/SE or sample n; these enter descriptive synthesis only.',
      measurementConsistency: 'Units and evaluation granularity (e.g., per-plot vs per-pixel) must align.',
      heterogeneityExpectation: 'Anticipate substantial heterogeneity (evaluate I2, Cochran Q, tau2, and prediction intervals where k >= 3).',
      expectedEligibleStudies: 'Minimum k >= 2 compatible independent study clusters required before pooling.',
      varianceAvailability: 'Exact SE/variance must be verified or algebraically derived from CI/SD/n (never fabricated).',
    },
    feasibilityRationale: isScoping
      ? 'Scoping/mapping reviews aim to chart breadth of evidence rather than estimate a pooled statistical effect size.'
      : 'Meta-analysis is marked conditional/feasible subject to verified outcome comparability, independent study clusters, and extractable variance data.',
    recommendedAlternatives: [
      'Synthesis Without Meta-analysis (SWiM) structured narrative + vote-counting by direction of effect',
      'Albatross / Harvest & Box-Plot distribution summaries across comparable subgroups',
      'Descriptive quantitative frequency & RQ contribution synthesis',
    ],
    narrativeSummary: 'Synthesize descriptive distributions for all included studies first; conduct statistical pooling strictly on compatibility-verified independent subsets.',
    approvedByResearcher: false,
  };

  const prismaChecklist: ProtocolPrismaChecklistItem[] = [
    { id: 'p-1', standard: isScoping ? 'PRISMA-ScR' : 'PRISMA-2020', itemNumber: '1', section: 'Title', requirement: 'Identify the report as a systematic/scoping review protocol.', plannedProcedure: 'Defined in Step 1 Topic Analysis.', status: 'complete', warningNote: '' },
    { id: 'p-2', standard: isScoping ? 'PRISMA-ScR' : 'PRISMA-2020', itemNumber: '3-4', section: 'Rationale & Objectives', requirement: 'Describe rationale and explicit review questions aligned with framework.', plannedProcedure: 'Defined via Step 4-6 Framework & RQ Matrix.', status: 'complete', warningNote: '' },
    { id: 'p-3', standard: 'PRISMA-2020', itemNumber: '5', section: 'Eligibility Criteria', requirement: 'Specify inclusion and exclusion criteria and synthesis groupings.', plannedProcedure: 'Documented in Step 7 10-Point Eligibility Matrix.', status: 'complete', warningNote: '' },
    { id: 'p-4', standard: 'PRISMA-S', itemNumber: '6-7', section: 'Information Sources & Search', requirement: 'Specify all databases, dates, and exact database-specific search strings.', plannedProcedure: 'Documented in Step 8 Multi-Database Search Builder.', status: 'partial', warningNote: 'Update executionDate and actualRetrievalCount after running searches.' },
    { id: 'p-5', standard: 'PRISMA-2020', itemNumber: '8-10', section: 'Selection & Data Collection', requirement: 'Detail screening stages, extraction items, and automation tools.', plannedProcedure: 'Defined in Step 9-10 Methodology & Extraction Plan.', status: 'complete', warningNote: '' },
    { id: 'p-6', standard: 'PRISMA-2020', itemNumber: '11', section: 'Study Risk of Bias', requirement: 'Specify methods used to assess risk of bias in included studies.', plannedProcedure: 'Design-specific instruments planned in Step 11.', status: 'complete', warningNote: '' },
    { id: 'p-7', standard: 'PRISMA-2020', itemNumber: '12-15', section: 'Synthesis & Reporting Bias', requirement: 'Specify effect measures, pooling/narrative synthesis, heterogeneity, and bias checks.', plannedProcedure: 'Planned in Step 12-13 Synthesis & Feasibility.', status: 'complete', warningNote: '' },
    { id: 'p-8', standard: 'PRISMA-2020', itemNumber: '24', section: 'Registration & Amendments', requirement: 'Document registration status and explain any protocol amendments.', plannedProcedure: 'Tracked automatically in Step 15 Version & Amendment History.', status: 'complete', warningNote: '' },
  ];

  return {
    id: `prot-${projectId}`,
    projectId,
    versionNumber: '1.0',
    status: 'draft',
    activeStep: 1,
    createdAt: now,
    updatedAt: now,
    author: 'Researcher',
    changeSummary: 'Initial protocol draft generated from research topic',
    lockedSections: [],
    topicAnalysis,
    reviewMethodRecommendation,
    frameworkComponents,
    generalObjective: `Systematically identify, appraise, and synthesize peer-reviewed empirical evidence addressing ${cleanTopic}.`,
    specificObjectives,
    rqMappings,
    eligibilityMatrix,
    standardizedExclusionReasons,
    databaseSearchStrategies,
    methodologySections,
    extractionPlan,
    appraisalPlan,
    synthesisPlan,
    prismaChecklist,
    validationIssues: [],
    validationSummary: {
      status: 'not_assessed',
      consistencyRatio: 100,
      passedCount: 0,
      warningCount: 0,
      needsRevisionCount: 0,
      disclaimer:
        'Internal consistency indicator summarizing structural alignment checks; NOT a scientific quality score or substitute for expert methodological judgment.',
      assessedAt: now,
    },
    versionHistory: [],
    amendments: [],
  };
}

export async function enrichProtocolStepWithAi(
  ai: GoogleGenAI | null,
  protocol: SystematicReviewProtocol,
  targetStep: number | 'all',
  customInstruction?: string,
  project?: any
): Promise<{ protocol: SystematicReviewProtocol; engine: string }> {
  const locked = new Set(protocol.lockedSections || []);

  // Re-sync search strings cleanly when framework unlocked
  if ((targetStep === 8 || targetStep === 'all') && !locked.has('search_strategy')) {
    const profile = inferTopicDomainProfile(
      protocol.topicAnalysis.initialTopicInput || protocol.topicAnalysis.proposedTitle,
      project
    );
    const regenerated = buildDefaultSearchStrategies(
      protocol.topicAnalysis.initialTopicInput || protocol.topicAnalysis.proposedTitle,
      protocol.frameworkComponents,
      protocol.topicAnalysis.publicationYearEligibility,
      profile.includeGeoRef
    );
    // Preserve researcher execution counts/dates if already recorded!
    const existingByDb = new Map(
      protocol.databaseSearchStrategies.map((s) => [s.databaseName.toLowerCase(), s])
    );
    protocol.databaseSearchStrategies = regenerated.map((s) => {
      const prev = existingByDb.get(s.databaseName.toLowerCase());
      if (prev && prev.executedByResearcher) {
        return prev;
      }
      return s;
    });
  }

  if (!ai) {
    return { protocol, engine: 'deterministic-scientific-engine' };
  }

  try {
    const scopeDescription =
      targetStep === 'all'
        ? 'Refine topic analysis, review methodology justification, framework component content/synonyms, objectives/RQs, eligibility rules, extraction variables, and methodology section narratives to high academic quality.'
        : `Refine Step ${targetStep} of the systematic review protocol for publication-ready precision.`;

    const prompt = `You are a senior systematic review methodologist (Cochrane, JBI, PRISMA 2020, PRISMA-S, Booth et al. 2016).
Research Topic: "${protocol.topicAnalysis.initialTopicInput || project?.title || ''}"
Selected Review Type: "${protocol.reviewMethodRecommendation.recommendedReviewType}"
Selected Primary Framework: "${protocol.reviewMethodRecommendation.recommendedPrimaryFramework}"
Locked Sections (DO NOT MODIFY these): ${JSON.stringify(Array.from(locked))}
Task: ${scopeDescription}
${customInstruction ? `Researcher Note: ${customInstruction}` : ''}

STRICT RULES:
1. NEVER fabricate search retrieval hit counts, execution dates, DOIs, or empirical findings. Keep actualRetrievalCount null and executionDate "".
2. Clearly distinguish Reporting Guidelines (PRISMA 2020 / PRISMA-ScR / PRISMA-S) from Conduct Methodology (Cochrane, JBI, Kitchenham) and Quality Appraisal Tools (RoB 2, ROBINS-I, JBI, CASP, MMAT, QUADAS-2).
3. Treat any knowledge gap statement prior to screening as provisional (knowledgeGapVerifiedByEvidence: false).
4. Return ONLY valid JSON with optional top-level keys matching those unlocked sections you improved:
   - "topicAnalysis" (object with proposedTitle, discipline, domain, subdomain, focusAndScope, theoreticalMotivation, researchProblem, knowledgeGaps, targetPopulation, interventionOrFocus, comparisonBaseline, measurableOutcomes, contextAndConstraints)
   - "methodologicalJustification" (string justifying chosen reviewType & framework)
   - "generalObjective" (string)
   - "specificObjectives" (array of {code, statement, mappedRqCodes})
   - "rqMappings" (array of {code, question, mappedFrameworkComponents, mappedObjectives, searchConcepts, eligibilityRequirements, requiredExtractionVariables, evidenceType, proposedSynthesisMethod})
   - "frameworkComponents" (array matching existing componentCode with improved proposedContent, keywords, synonyms, inclusionImplications, exclusionImplications)
   - "methodologySummaryNotes" (object mapping section keys like "title_abstract_rationale", "screening_selection", "quality_appraisal", "quantitative_synthesis" to improved proposedContent strings)
   - "synthesisNarrative" (string summarizing synthesis strategy & feasibility guardrails).`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Protocol AI refinement timed out (8s)')), 8000)
    );
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      }),
      timeoutPromise,
    ]);

    const text = (response.text || '').trim();
    if (!text) return { protocol, engine: 'deterministic-scientific-engine' };
    const parsed = JSON.parse(text);

    const next = { ...protocol, updatedAt: new Date().toISOString() };

    if (parsed.topicAnalysis && !locked.has('topic_analysis') && (targetStep === 'all' || targetStep <= 2)) {
      next.topicAnalysis = {
        ...next.topicAnalysis,
        ...parsed.topicAnalysis,
        knowledgeGapVerifiedByEvidence: next.topicAnalysis.knowledgeGapVerifiedByEvidence,
        isPreliminaryAiSuggestion: true,
      };
    }

    if (parsed.methodologicalJustification && !locked.has('review_method') && (targetStep === 'all' || targetStep === 3)) {
      next.reviewMethodRecommendation = {
        ...next.reviewMethodRecommendation,
        justification: String(parsed.methodologicalJustification),
      };
    }

    if (Array.isArray(parsed.frameworkComponents) && !locked.has('framework') && (targetStep === 'all' || targetStep === 4)) {
      const byCode = new Map<string, any>(
        parsed.frameworkComponents.map((c: any) => [String(c.componentCode || '').toUpperCase(), c])
      );
      next.frameworkComponents = next.frameworkComponents.map((orig) => {
        if (orig.status === 'locked') return orig;
        const patch = byCode.get(orig.componentCode.toUpperCase());
        if (!patch) return orig;
        return {
          ...orig,
          proposedContent: patch.proposedContent || orig.proposedContent,
          keywords: Array.isArray(patch.keywords) && patch.keywords.length ? patch.keywords : orig.keywords,
          synonyms: Array.isArray(patch.synonyms) && patch.synonyms.length ? patch.synonyms : orig.synonyms,
          inclusionImplications: patch.inclusionImplications || orig.inclusionImplications,
          exclusionImplications: patch.exclusionImplications || orig.exclusionImplications,
        };
      });
    }

    if (parsed.generalObjective && !locked.has('objectives_rqs') && (targetStep === 'all' || targetStep === 5 || targetStep === 6)) {
      next.generalObjective = String(parsed.generalObjective);
    }

    if (Array.isArray(parsed.specificObjectives) && parsed.specificObjectives.length && !locked.has('objectives_rqs') && (targetStep === 'all' || targetStep === 5 || targetStep === 6)) {
      next.specificObjectives = parsed.specificObjectives.map((so: any, idx: number) => ({
        code: so.code || `SO${idx + 1}`,
        statement: so.statement || next.specificObjectives[idx]?.statement || '',
        mappedRqCodes: Array.isArray(so.mappedRqCodes) && so.mappedRqCodes.length ? so.mappedRqCodes : [`RQ${idx + 1}`],
        status: next.specificObjectives[idx]?.status === 'locked' ? 'locked' : 'pending',
      }));
    }

    if (Array.isArray(parsed.rqMappings) && parsed.rqMappings.length && !locked.has('objectives_rqs') && (targetStep === 'all' || targetStep === 6)) {
      next.rqMappings = parsed.rqMappings.map((rq: any, idx: number) => ({
        code: rq.code || `RQ${idx + 1}`,
        question: rq.question || next.rqMappings[idx]?.question || '',
        mappedFrameworkComponents: Array.isArray(rq.mappedFrameworkComponents) ? rq.mappedFrameworkComponents : ['P', 'I'],
        mappedObjectives: Array.isArray(rq.mappedObjectives) ? rq.mappedObjectives : [`SO${Math.min(idx + 1, 3)}`],
        searchConcepts: Array.isArray(rq.searchConcepts) ? rq.searchConcepts : ['empirical'],
        eligibilityRequirements: rq.eligibilityRequirements || 'Aligned primary studies',
        requiredExtractionVariables: Array.isArray(rq.requiredExtractionVariables) && rq.requiredExtractionVariables.length
          ? rq.requiredExtractionVariables
          : next.rqMappings[idx]?.requiredExtractionVariables || ['Primary outcome metric'],
        evidenceType: rq.evidenceType || 'Empirical evidence',
        proposedSynthesisMethod: rq.proposedSynthesisMethod || 'Structured narrative & descriptive quantitative synthesis',
        consistencyIssues: [],
        status: next.rqMappings[idx]?.status === 'locked' ? 'locked' : 'pending',
      }));
    }

    if (parsed.methodologySummaryNotes && typeof parsed.methodologySummaryNotes === 'object' && !locked.has('methodology_plan') && (targetStep === 'all' || targetStep === 9)) {
      next.methodologySections = next.methodologySections.map((sec) => {
        if (sec.approvalStatus === 'locked') return sec;
        const updatedText = parsed.methodologySummaryNotes[sec.key];
        return updatedText ? { ...sec, proposedContent: String(updatedText) } : sec;
      });
    }

    if (parsed.synthesisNarrative && !locked.has('synthesis_plan') && (targetStep === 'all' || targetStep === 12 || targetStep === 13)) {
      next.synthesisPlan = {
        ...next.synthesisPlan,
        narrativeSummary: String(parsed.synthesisNarrative),
      };
    }

    return { protocol: next, engine: 'gemini-4-hydrogen' };
  } catch (err) {
    console.warn('Protocol AI refinement fallback to deterministic engine:', (err as any)?.message);
    return { protocol, engine: 'deterministic-scientific-engine' };
  }
}
