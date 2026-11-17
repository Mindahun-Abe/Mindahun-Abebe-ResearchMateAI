import {
  LiteratureReviewTypeId,
  PicocFramework,
  ProtocolStandardType,
  ReviewFrameworkType,
  ReviewProject,
} from '../types';

export interface FrameworkFieldDef {
  key: string;
  badge: string;
  title: string;
  prompt: string;
  placeholder: string;
  badgeBgClass: string;
  focusBorderClass: string;
  picocSyncKey?: keyof PicocFramework;
  fullWidth?: boolean;
}

export interface FrameworkDefinition {
  id: ReviewFrameworkType;
  name: string;
  fullTitle: string;
  mainApplication: string;
  reference: string;
  fields: FrameworkFieldDef[];
}

export interface ReviewTypeDefinition {
  number: number;
  id: LiteratureReviewTypeId;
  name: string;
  mainPurpose: string;
  defaultFramework: ReviewFrameworkType;
  defaultProtocolStandard: ProtocolStandardType;
  reportingGuideline: string;
}

export interface ProtocolStandardDefinition {
  id: ProtocolStandardType;
  label: string;
  shortBadge: string;
  guideline: string;
  description: string;
}

export const PROTOCOL_STANDARD_DEFINITIONS: Record<
  ProtocolStandardType,
  ProtocolStandardDefinition
> = {
  standard_slr: {
    id: 'standard_slr',
    label: 'Standard SLR Protocol',
    shortBadge: 'Standard SLR Protocol',
    guideline: 'PRISMA 2020',
    description:
      'Structured systematic identification, explicit inclusion/exclusion screening, critical quality appraisal, and reproducible evidence synthesis.',
  },
  scoping_review: {
    id: 'scoping_review',
    label: 'Scoping Review Protocol (PRISMA-ScR)',
    shortBadge: 'Scoping Review Protocol',
    guideline: 'PRISMA-ScR / JBI',
    description:
      'Broad evidence mapping, conceptual charting, coverage assessment, and knowledge-gap identification across heterogeneous study designs.',
  },
  meta_analysis: {
    id: 'meta_analysis',
    label: 'Meta-Analysis Protocol (Quantitative)',
    shortBadge: 'Meta-Analysis Protocol',
    guideline: 'PRISMA 2020 + Effect Pooling',
    description:
      'Statistical combination of quantitative results (effect sizes, AUC, RMSE, F1, heterogeneity, and subgroup variance) across comparable empirical studies.',
  },
};

export const FRAMEWORK_DEFINITIONS: FrameworkDefinition[] = [
  {
    id: 'PICOC',
    name: 'PICOC',
    fullTitle: 'PICOC Framework (Booth et al., 2016)',
    mainApplication:
      'Systematic reviews in software engineering, technology, and applied research.',
    reference: 'Booth et al., 2016 / Kitchenham',
    fields: [
      {
        key: 'population',
        badge: 'P',
        title: 'Population / Target Problem',
        prompt: 'Who or what target entity, system, crop, or cohort is being investigated?',
        placeholder: 'Target population, software system, crop, watershed, or cohort...',
        badgeBgClass: 'bg-indigo-600',
        focusBorderClass: 'focus:border-indigo-500',
        picocSyncKey: 'population',
      },
      {
        key: 'intervention',
        badge: 'I',
        title: 'Intervention / Technology / Model',
        prompt: 'Which platform, technology, algorithm, tool, or methodology is evaluated?',
        placeholder: 'Software tool, sensor payload, ML model, or intervention...',
        badgeBgClass: 'bg-teal-600',
        focusBorderClass: 'focus:border-teal-500',
        picocSyncKey: 'intervention',
      },
      {
        key: 'comparison',
        badge: 'C',
        title: 'Comparison / Baseline',
        prompt: 'What alternative method, baseline, or control is contrasted?',
        placeholder: 'Alternative algorithm, standard baseline, or control...',
        badgeBgClass: 'bg-amber-600',
        focusBorderClass: 'focus:border-amber-500',
        picocSyncKey: 'comparison',
      },
      {
        key: 'outcome',
        badge: 'O',
        title: 'Outcome / Measured Metrics',
        prompt: 'What quantitative metrics, latency, accuracy, or empirical effects are extracted?',
        placeholder: 'Accuracy, F1-score, AUC-ROC, latency, reliability metrics...',
        badgeBgClass: 'bg-emerald-600',
        focusBorderClass: 'focus:border-emerald-500',
        picocSyncKey: 'outcome',
      },
      {
        key: 'context',
        badge: 'C',
        title: 'Context / Setting & Constraints',
        prompt: 'What operational, environmental, organizational, or technical setting applies?',
        placeholder: 'Operational deployment setting, geography, hardware or domain context...',
        badgeBgClass: 'bg-purple-600',
        focusBorderClass: 'focus:border-purple-500',
        picocSyncKey: 'context',
        fullWidth: true,
      },
    ],
  },
  {
    id: 'PICO',
    name: 'PICO',
    fullTitle: 'PICO Clinical & Intervention Framework',
    mainApplication: 'Clinical and intervention-focused systematic reviews.',
    reference: 'Cochrane / Richardson et al.',
    fields: [
      {
        key: 'population',
        badge: 'P',
        title: 'Patient / Population / Clinical Problem',
        prompt: 'Who are the patients, age group, clinical condition, or target population?',
        placeholder: 'Patient group, clinical diagnosis, age/sex demographics...',
        badgeBgClass: 'bg-indigo-600',
        focusBorderClass: 'focus:border-indigo-500',
        picocSyncKey: 'population',
      },
      {
        key: 'intervention',
        badge: 'I',
        title: 'Intervention / Treatment / Therapy',
        prompt: 'Which clinical treatment, drug, diagnostic test, or therapy is evaluated?',
        placeholder: 'Therapeutic intervention, dosage, surgical procedure, or diagnostic tool...',
        badgeBgClass: 'bg-teal-600',
        focusBorderClass: 'focus:border-teal-500',
        picocSyncKey: 'intervention',
      },
      {
        key: 'comparison',
        badge: 'C',
        title: 'Comparison / Control / Standard of Care',
        prompt: 'What placebo, standard care, or alternative clinical intervention is compared?',
        placeholder: 'Placebo, standard care, or alternative therapy...',
        badgeBgClass: 'bg-amber-600',
        focusBorderClass: 'focus:border-amber-500',
        picocSyncKey: 'comparison',
      },
      {
        key: 'outcome',
        badge: 'O',
        title: 'Outcome / Clinical Endpoints',
        prompt: 'What mortality, morbidity, symptom relief, safety, or biomarker outcomes matter?',
        placeholder: 'Primary clinical endpoints, survival, adverse events, quality of life...',
        badgeBgClass: 'bg-emerald-600',
        focusBorderClass: 'focus:border-emerald-500',
        picocSyncKey: 'outcome',
      },
    ],
  },
  {
    id: 'PECO',
    name: 'PECO',
    fullTitle: 'PECO Exposure & Environmental Framework',
    mainApplication: 'Environmental, epidemiological, and exposure-related reviews.',
    reference: 'Morgan et al., 2018 / OHAT',
    fields: [
      {
        key: 'population',
        badge: 'P',
        title: 'Population / Species / Ecosystem',
        prompt: 'Which human cohort, species, watershed, or ecosystem is exposed?',
        placeholder: 'Human cohort, agricultural soil, freshwater ecosystem, or community...',
        badgeBgClass: 'bg-indigo-600',
        focusBorderClass: 'focus:border-indigo-500',
        picocSyncKey: 'population',
      },
      {
        key: 'exposure',
        badge: 'E',
        title: 'Exposure / Environmental Agent / Risk Factor',
        prompt: 'Which pollutant, climate stressor, chemical, or environmental agent is studied?',
        placeholder: 'Pollutant concentration, microplastics, heat stress, runoff, pathogen...',
        badgeBgClass: 'bg-teal-600',
        focusBorderClass: 'focus:border-teal-500',
        picocSyncKey: 'intervention',
      },
      {
        key: 'comparator',
        badge: 'C',
        title: 'Comparator / Unexposed or Baseline Level',
        prompt: 'What unexposed reference group, lower dose, or baseline condition is compared?',
        placeholder: 'Unexposed control group, reference site, or pre-exposure baseline...',
        badgeBgClass: 'bg-amber-600',
        focusBorderClass: 'focus:border-amber-500',
        picocSyncKey: 'comparison',
      },
      {
        key: 'outcome',
        badge: 'O',
        title: 'Outcome / Health or Ecological Response',
        prompt: 'What health risk, incidence rate, biodiversity shift, or degradation outcome occurs?',
        placeholder: 'Odds ratio, relative risk, erosion rate, toxicity, or disease incidence...',
        badgeBgClass: 'bg-emerald-600',
        focusBorderClass: 'focus:border-emerald-500',
        picocSyncKey: 'outcome',
      },
    ],
  },
  {
    id: 'PCC',
    name: 'PCC',
    fullTitle: 'PCC Scoping Review Framework (JBI)',
    mainApplication: 'Scoping reviews: Population, Concept, Context.',
    reference: 'Joanna Briggs Institute (JBI) / PRISMA-ScR',
    fields: [
      {
        key: 'population',
        badge: 'P',
        title: 'Population / Participants',
        prompt: 'What characteristics define the population, subjects, or systems mapped?',
        placeholder: 'Target population, stakeholders, systems, or geographic entities...',
        badgeBgClass: 'bg-indigo-600',
        focusBorderClass: 'focus:border-indigo-500',
        picocSyncKey: 'population',
      },
      {
        key: 'concept',
        badge: 'C',
        title: 'Concept / Core Phenomenon',
        prompt: 'What core concept, technology, practice, or phenomenon is being mapped?',
        placeholder: 'Core concepts, interventions, analytical approaches, or practices...',
        badgeBgClass: 'bg-teal-600',
        focusBorderClass: 'focus:border-teal-500',
        picocSyncKey: 'intervention',
      },
      {
        key: 'context',
        badge: 'C',
        title: 'Context / Geographic, Cultural & Temporal Setting',
        prompt: 'What geographical, institutional, cultural, or operational contexts bound the map?',
        placeholder: 'Geographic region, discipline setting, time period, or operational context...',
        badgeBgClass: 'bg-purple-600',
        focusBorderClass: 'focus:border-purple-500',
        picocSyncKey: 'context',
        fullWidth: true,
      },
    ],
  },
  {
    id: 'SPIDER',
    name: 'SPIDER',
    fullTitle: 'SPIDER Qualitative & Mixed-Methods Framework',
    mainApplication: 'Qualitative and mixed-methods evidence synthesis.',
    reference: 'Cooke et al., 2012',
    fields: [
      {
        key: 'sample',
        badge: 'S',
        title: 'Sample (Participant / Case Group)',
        prompt: 'Which smaller, purposive qualitative sample or stakeholder cohort is studied?',
        placeholder: 'Farmers, clinicians, engineers, focus group participants...',
        badgeBgClass: 'bg-indigo-600',
        focusBorderClass: 'focus:border-indigo-500',
        picocSyncKey: 'population',
      },
      {
        key: 'phenomenon',
        badge: 'PI',
        title: 'Phenomenon of Interest',
        prompt: 'How and why do participants experience a behavior, decision, or intervention?',
        placeholder: 'Adoption barriers, lived experience, perception of technology/care...',
        badgeBgClass: 'bg-teal-600',
        focusBorderClass: 'focus:border-teal-500',
        picocSyncKey: 'intervention',
      },
      {
        key: 'design',
        badge: 'D',
        title: 'Design (Data Collection Strategy)',
        prompt: 'Which qualitative or mixed methods (interviews, focus groups, ethnography, survey) qualify?',
        placeholder: 'Semi-structured interviews, focus groups, case study, mixed-methods...',
        badgeBgClass: 'bg-amber-600',
        focusBorderClass: 'focus:border-amber-500',
        picocSyncKey: 'comparison',
      },
      {
        key: 'evaluation',
        badge: 'E',
        title: 'Evaluation (Views, Themes & Outcomes)',
        prompt: 'What subjective views, themes, attitudes, or synthesized experiences are evaluated?',
        placeholder: 'Thematic experiences, trust, usability perceptions, behavioral determinants...',
        badgeBgClass: 'bg-emerald-600',
        focusBorderClass: 'focus:border-emerald-500',
        picocSyncKey: 'outcome',
      },
      {
        key: 'researchType',
        badge: 'R',
        title: 'Research Type',
        prompt: 'Are Qualitative, Quantitative, or Mixed-Methods studies eligible?',
        placeholder: 'Qualitative, Mixed-Methods, or Qualitative + Survey synthesis...',
        badgeBgClass: 'bg-purple-600',
        focusBorderClass: 'focus:border-purple-500',
        picocSyncKey: 'context',
        fullWidth: true,
      },
    ],
  },
  {
    id: 'SPICE',
    name: 'SPICE',
    fullTitle: 'SPICE Service & Policy Evaluation Framework',
    mainApplication: 'Service evaluation and policy-related research.',
    reference: 'Booth, 2006',
    fields: [
      {
        key: 'setting',
        badge: 'S',
        title: 'Setting (Service or Policy Context)',
        prompt: 'Where is the service, institution, or public policy delivered?',
        placeholder: 'Public agencies, hospitals, extension services, municipal settings...',
        badgeBgClass: 'bg-purple-600',
        focusBorderClass: 'focus:border-purple-500',
        picocSyncKey: 'context',
      },
      {
        key: 'perspective',
        badge: 'P',
        title: 'Perspective (Stakeholders / Beneficiaries)',
        prompt: 'From whose perspective (users, policymakers, practitioners) is the service judged?',
        placeholder: 'Policymakers, service users, practitioners, rural smallholders...',
        badgeBgClass: 'bg-indigo-600',
        focusBorderClass: 'focus:border-indigo-500',
        picocSyncKey: 'population',
      },
      {
        key: 'intervention',
        badge: 'I',
        title: 'Intervention / Program / Policy',
        prompt: 'Which service model, policy reform, or program is being evaluated?',
        placeholder: 'Policy intervention, digital service rollout, governance framework...',
        badgeBgClass: 'bg-teal-600',
        focusBorderClass: 'focus:border-teal-500',
        picocSyncKey: 'intervention',
      },
      {
        key: 'comparison',
        badge: 'C',
        title: 'Comparison / Alternative Policy or Pre-Reform',
        prompt: 'What prior service model, control jurisdiction, or baseline policy is compared?',
        placeholder: 'Previous policy baseline, usual service delivery, or comparison region...',
        badgeBgClass: 'bg-amber-600',
        focusBorderClass: 'focus:border-amber-500',
        picocSyncKey: 'comparison',
      },
      {
        key: 'evaluation',
        badge: 'E',
        title: 'Evaluation (Effectiveness, Cost & Equity Outcomes)',
        prompt: 'With what metrics or criteria is policy/service success evaluated?',
        placeholder: 'Cost-effectiveness, equity, uptake rate, policy compliance, satisfaction...',
        badgeBgClass: 'bg-emerald-600',
        focusBorderClass: 'focus:border-emerald-500',
        picocSyncKey: 'outcome',
        fullWidth: true,
      },
    ],
  },
  {
    id: 'PICOS',
    name: 'PICOS',
    fullTitle: 'PICOS Study-Design Explicit Framework',
    mainApplication: 'Systematic reviews incorporating study design as a criterion.',
    reference: 'PRISMA-P / Centre for Reviews and Dissemination',
    fields: [
      {
        key: 'population',
        badge: 'P',
        title: 'Population / Target Cohort',
        prompt: 'What population, sample, or target domain defines eligible studies?',
        placeholder: 'Target participants, cohorts, crops, or environmental domains...',
        badgeBgClass: 'bg-indigo-600',
        focusBorderClass: 'focus:border-indigo-500',
        picocSyncKey: 'population',
      },
      {
        key: 'intervention',
        badge: 'I',
        title: 'Intervention / Exposure / Method',
        prompt: 'What intervention, diagnostic, or modeling pipeline is investigated?',
        placeholder: 'Intervention, treatment, sensor-model pipeline, or management method...',
        badgeBgClass: 'bg-teal-600',
        focusBorderClass: 'focus:border-teal-500',
        picocSyncKey: 'intervention',
      },
      {
        key: 'comparison',
        badge: 'C',
        title: 'Comparison / Reference Standard',
        prompt: 'What comparator, control group, or benchmark model is required?',
        placeholder: 'Control group, gold-standard baseline, or competing architecture...',
        badgeBgClass: 'bg-amber-600',
        focusBorderClass: 'focus:border-amber-500',
        picocSyncKey: 'comparison',
      },
      {
        key: 'outcome',
        badge: 'O',
        title: 'Outcome / Quantitative & Qualitative Endpoints',
        prompt: 'Which primary and secondary outcomes are extracted?',
        placeholder: 'Effect sizes, AUC, RMSE, F1, turnaround time, clinical endpoints...',
        badgeBgClass: 'bg-emerald-600',
        focusBorderClass: 'focus:border-emerald-500',
        picocSyncKey: 'outcome',
      },
      {
        key: 'studyDesign',
        badge: 'S',
        title: 'Study Design (Explicit Design Eligibility)',
        prompt: 'Which empirical study designs (RCTs, cohort, field trials, cross-sectional) qualify?',
        placeholder: 'RCTs, prospective cohorts, controlled field experiments, benchmark trials...',
        badgeBgClass: 'bg-purple-600',
        focusBorderClass: 'focus:border-purple-500',
        picocSyncKey: 'context',
        fullWidth: true,
      },
    ],
  },
  {
    id: 'CIMO',
    name: 'CIMO',
    fullTitle: 'CIMO Context-Intervention-Mechanism-Outcome Framework',
    mainApplication:
      'Management and organizational research: Context, Intervention, Mechanism, Outcome.',
    reference: 'Denyer et al., 2008',
    fields: [
      {
        key: 'context',
        badge: 'C',
        title: 'Context (Organizational & Institutional Setting)',
        prompt: 'Which organizational types, industries, or external conditions apply?',
        placeholder: 'SMEs, public enterprises, supply chains, project teams, regional markets...',
        badgeBgClass: 'bg-purple-600',
        focusBorderClass: 'focus:border-purple-500',
        picocSyncKey: 'context',
      },
      {
        key: 'intervention',
        badge: 'I',
        title: 'Intervention (Management Action / System)',
        prompt: 'What managerial action, organizational practice, or system is introduced?',
        placeholder: 'Governance reform, agile practice, incentive scheme, AI workflow...',
        badgeBgClass: 'bg-teal-600',
        focusBorderClass: 'focus:border-teal-500',
        picocSyncKey: 'intervention',
      },
      {
        key: 'mechanism',
        badge: 'M',
        title: 'Mechanism (Generative Process / Causal Pathway)',
        prompt: 'By what behavioral, structural, or causal mechanism does the intervention act?',
        placeholder: 'Trust building, knowledge sharing, accountability, coordination efficiency...',
        badgeBgClass: 'bg-amber-600',
        focusBorderClass: 'focus:border-amber-500',
        picocSyncKey: 'comparison',
      },
      {
        key: 'outcome',
        badge: 'O',
        title: 'Outcome (Organizational Performance & Impact)',
        prompt: 'What intended and unintended organizational outcomes are observed?',
        placeholder: 'Productivity, ROI, innovation rate, employee retention, risk reduction...',
        badgeBgClass: 'bg-emerald-600',
        focusBorderClass: 'focus:border-emerald-500',
        picocSyncKey: 'outcome',
      },
    ],
  },
];

export const REVIEW_TYPE_DEFINITIONS: ReviewTypeDefinition[] = [
  {
    number: 1,
    id: 'narrative',
    name: 'Narrative (Traditional) Review',
    mainPurpose: 'Provides a descriptive overview and discussion of existing literature.',
    defaultFramework: 'PICOC',
    defaultProtocolStandard: 'standard_slr',
    reportingGuideline: 'SANRA / Descriptive Synthesis',
  },
  {
    number: 2,
    id: 'slr',
    name: 'Systematic Literature Review (SLR)',
    mainPurpose:
      'Uses a predefined, transparent, and reproducible method to identify, select, evaluate, and synthesize studies.',
    defaultFramework: 'PICOC',
    defaultProtocolStandard: 'standard_slr',
    reportingGuideline: 'PRISMA 2020',
  },
  {
    number: 3,
    id: 'scoping',
    name: 'Scoping Review',
    mainPurpose:
      'Maps the available evidence, research coverage, concepts, and knowledge gaps within a broad topic.',
    defaultFramework: 'PCC',
    defaultProtocolStandard: 'scoping_review',
    reportingGuideline: 'PRISMA-ScR (Tricco et al., 2018)',
  },
  {
    number: 4,
    id: 'meta_analysis',
    name: 'Meta-analysis',
    mainPurpose: 'Statistically combines quantitative results from multiple comparable studies.',
    defaultFramework: 'PICO',
    defaultProtocolStandard: 'meta_analysis',
    reportingGuideline: 'PRISMA 2020 + Quantitative Effect Synthesis',
  },
  {
    number: 5,
    id: 'meta_synthesis',
    name: 'Systematic Review with Meta-synthesis',
    mainPurpose:
      'Integrates qualitative findings from multiple studies to develop broader interpretations.',
    defaultFramework: 'SPIDER',
    defaultProtocolStandard: 'standard_slr',
    reportingGuideline: 'ENTREQ / PRISMA Qualitative Synthesis',
  },
  {
    number: 6,
    id: 'integrative',
    name: 'Integrative Review',
    mainPurpose:
      'Combines evidence from different research designs, including quantitative and qualitative studies.',
    defaultFramework: 'PICOS',
    defaultProtocolStandard: 'standard_slr',
    reportingGuideline: 'Whittemore & Knafl / PRISMA',
  },
  {
    number: 7,
    id: 'critical',
    name: 'Critical Review',
    mainPurpose:
      'Critically evaluates theories, methods, assumptions, and limitations in existing research.',
    defaultFramework: 'PICOC',
    defaultProtocolStandard: 'standard_slr',
    reportingGuideline: 'SALSA Critical Appraisal Framework',
  },
  {
    number: 8,
    id: 'rapid',
    name: 'Rapid Review',
    mainPurpose:
      'Uses an accelerated systematic approach to synthesize evidence within a limited timeframe.',
    defaultFramework: 'PICO',
    defaultProtocolStandard: 'standard_slr',
    reportingGuideline: 'Cochrane Rapid Reviews / PRISMA',
  },
  {
    number: 9,
    id: 'umbrella',
    name: 'Umbrella Review',
    mainPurpose:
      'Synthesizes findings from existing systematic reviews and meta-analyses.',
    defaultFramework: 'PICOS',
    defaultProtocolStandard: 'meta_analysis',
    reportingGuideline: 'PRIOR / JBI Umbrella Review',
  },
  {
    number: 10,
    id: 'mapping',
    name: 'Mapping Review (Evidence Map)',
    mainPurpose:
      'Categorizes and visually maps research evidence, topics, methods, and gaps.',
    defaultFramework: 'PCC',
    defaultProtocolStandard: 'scoping_review',
    reportingGuideline: 'ROSES / Evidence Gap Mapping',
  },
  {
    number: 11,
    id: 'bibliometric',
    name: 'Bibliometric Review',
    mainPurpose:
      'Uses quantitative publication and citation analysis to identify research trends, influential authors, and collaboration networks.',
    defaultFramework: 'PCC',
    defaultProtocolStandard: 'scoping_review',
    reportingGuideline: 'BIBLIO / PRISMA-ScR',
  },
  {
    number: 12,
    id: 'realist',
    name: 'Realist Review',
    mainPurpose:
      'Examines how, why, for whom, and under what circumstances interventions work.',
    defaultFramework: 'CIMO',
    defaultProtocolStandard: 'standard_slr',
    reportingGuideline: 'RAMESES Realist Synthesis',
  },
  {
    number: 13,
    id: 'overview',
    name: 'Overview of Reviews',
    mainPurpose:
      'Summarizes evidence from multiple reviews addressing related research questions.',
    defaultFramework: 'PICO',
    defaultProtocolStandard: 'standard_slr',
    reportingGuideline: 'PRIOR / Cochrane Overview',
  },
  {
    number: 14,
    id: 'state_of_the_art',
    name: 'State-of-the-Art Review',
    mainPurpose:
      'Examines the latest developments, emerging technologies, and current research directions.',
    defaultFramework: 'PICOC',
    defaultProtocolStandard: 'scoping_review',
    reportingGuideline: 'SotA / PRISMA 2020',
  },
  {
    number: 15,
    id: 'theoretical',
    name: 'Theoretical Review',
    mainPurpose: 'Examines and synthesizes theories, models, and conceptual frameworks.',
    defaultFramework: 'CIMO',
    defaultProtocolStandard: 'standard_slr',
    reportingGuideline: 'Conceptual / Theory Synthesis',
  },
  {
    number: 16,
    id: 'methodological',
    name: 'Methodological Review',
    mainPurpose:
      'Evaluates research methods, analytical techniques, and methodological developments.',
    defaultFramework: 'PICOS',
    defaultProtocolStandard: 'standard_slr',
    reportingGuideline: 'PRISMA Methodology Assessment',
  },
];

export function getFrameworkDefinition(
  frameworkType?: ReviewFrameworkType
): FrameworkDefinition {
  return (
    FRAMEWORK_DEFINITIONS.find((f) => f.id === frameworkType) ||
    FRAMEWORK_DEFINITIONS[0]
  );
}

export function getReviewTypeDefinition(
  reviewTypeId?: LiteratureReviewTypeId
): ReviewTypeDefinition {
  return (
    REVIEW_TYPE_DEFINITIONS.find((r) => r.id === reviewTypeId) ||
    REVIEW_TYPE_DEFINITIONS[1] // Systematic Literature Review (SLR)
  );
}

export function getProtocolStandardDefinition(
  project: Partial<ReviewProject>
): ProtocolStandardDefinition {
  if (project.protocolStandard && PROTOCOL_STANDARD_DEFINITIONS[project.protocolStandard]) {
    return PROTOCOL_STANDARD_DEFINITIONS[project.protocolStandard];
  }
  const revDef = getReviewTypeDefinition(project.reviewType);
  return PROTOCOL_STANDARD_DEFINITIONS[revDef.defaultProtocolStandard];
}

export function getFrameworkFieldValue(
  project: Pick<ReviewProject, 'frameworkType' | 'frameworkFields' | 'picoc'>,
  field: FrameworkFieldDef
): string {
  const customVal = project.frameworkFields?.[field.key];
  if (customVal !== undefined) return customVal;
  if (field.picocSyncKey && project.picoc) {
    return project.picoc[field.picocSyncKey] || '';
  }
  return '';
}

export function getActiveFrameworkFieldEntries(
  project: Pick<ReviewProject, 'frameworkType' | 'frameworkFields' | 'picoc'>
): { key: string; badge: string; label: string; value: string; badgeBgClass: string }[] {
  const fw = getFrameworkDefinition(project.frameworkType);
  return fw.fields.map((field) => ({
    key: field.key,
    badge: field.badge,
    label: field.title,
    value: getFrameworkFieldValue(project, field),
    badgeBgClass: field.badgeBgClass,
  }));
}
