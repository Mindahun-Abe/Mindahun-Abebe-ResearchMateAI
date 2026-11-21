import React, { useState } from 'react';
import {
  EligibilityCriterion,
  GeographicScaleTier,
  LiteratureReviewTypeId,
  ProtocolStandardType,
  ResearchQuestion,
  ReviewFrameworkType,
  ReviewProject,
} from '../types';
import {
  FRAMEWORK_DEFINITIONS,
  getFrameworkDefinition,
  getReviewTypeDefinition,
  PROTOCOL_STANDARD_DEFINITIONS,
  REVIEW_TYPE_DEFINITIONS,
} from '../utils/protocolFrameworks';
import { GEOGRAPHIC_SCALE_TIERS } from '../utils/geographicSensing';
import {
  AlertCircle,
  BookOpen,
  Check,
  Compass,
  Database,
  FileText,
  FolderEdit,
  HelpCircle,
  Layers,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';

interface CreateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (project: ReviewProject) => void;
  existingFolderNames?: string[];
}

function sanitizeFolderNameInput(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);
}

export const CreateReviewModal: React.FC<CreateReviewModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
  existingFolderNames = [],
}) => {
  // Pure manual blank state - all inputs start empty with descriptive placeholders (NOT auto-filled)
  const [title, setTitle] = useState('');
  const [databaseFolderName, setDatabaseFolderName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [scope, setScope] = useState('');
  const [methodologyFocus, setMethodologyFocus] = useState('');
  const [geographicEligibility, setGeographicEligibility] = useState('');
  const [geographicTargetScale, setGeographicTargetScale] = useState<GeographicScaleTier | 'any'>('any');
  const [publicationYears, setPublicationYears] = useState('');
  const [articleTypes, setArticleTypes] = useState('');

  // Protocol & Framework selectors
  const [frameworkType, setFrameworkType] = useState<ReviewFrameworkType>('PICOC');
  const [reviewType, setReviewType] = useState<LiteratureReviewTypeId>('slr');
  const [protocolStandard, setProtocolStandard] = useState<ProtocolStandardType>('standard_slr');

  // Dynamic framework fields (empty placeholders)
  const [frameworkFields, setFrameworkFields] = useState<Record<string, string>>({});

  // Search query & guidance
  const [booleanQuery, setBooleanQuery] = useState('');
  const [uncertainGuidance, setUncertainGuidance] = useState('');

  // Research Questions (starts with empty placeholder)
  const [researchQuestions, setResearchQuestions] = useState<ResearchQuestion[]>([
    {
      code: 'RQ1',
      question: '',
      mainEvidenceToCollect: '',
    },
  ]);

  // Eligibility criteria (starts with 1 empty placeholder row)
  const [criteria, setCriteria] = useState<EligibilityCriterion[]>([
    {
      id: 'crit-1',
      dimension: '',
      includeRule: '',
      excludeRule: '',
      category: 'inclusion',
    },
  ]);

  const [error, setError] = useState('');

  if (!isOpen) return null;

  // Clear all fields back to blank placeholders
  const handleClearAll = () => {
    setTitle('');
    setDatabaseFolderName('');
    setSubtitle('');
    setDiscipline('');
    setScope('');
    setMethodologyFocus('');
    setGeographicEligibility('');
    setGeographicTargetScale('any');
    setPublicationYears('');
    setArticleTypes('');
    setFrameworkType('PICOC');
    setReviewType('slr');
    setProtocolStandard('standard_slr');
    setFrameworkFields({});
    setBooleanQuery('');
    setUncertainGuidance('');
    setResearchQuestions([
      {
        code: 'RQ1',
        question: '',
        mainEvidenceToCollect: '',
      },
    ]);
    setCriteria([
      {
        id: 'crit-1',
        dimension: '',
        includeRule: '',
        excludeRule: '',
        category: 'inclusion',
      },
    ]);
    setError('');
  };

  const handleAddRq = () => {
    setResearchQuestions([
      ...researchQuestions,
      {
        code: `RQ${researchQuestions.length + 1}`,
        question: '',
        mainEvidenceToCollect: '',
      },
    ]);
  };

  const handleUpdateRq = (index: number, field: keyof ResearchQuestion, val: string) => {
    const updated = [...researchQuestions];
    updated[index] = { ...updated[index], [field]: val };
    setResearchQuestions(updated);
  };

  const handleRemoveRq = (index: number) => {
    if (researchQuestions.length <= 1) return;
    setResearchQuestions(researchQuestions.filter((_, i) => i !== index));
  };

  const handleAddCriterion = () => {
    setCriteria([
      ...criteria,
      {
        id: `crit-${Date.now()}`,
        dimension: '',
        includeRule: '',
        excludeRule: '',
        category: 'inclusion',
      },
    ]);
  };

  const handleUpdateCriterion = (index: number, field: keyof EligibilityCriterion, val: string) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: val };
    setCriteria(updated);
  };

  const handleRemoveCriterion = (index: number) => {
    if (criteria.length <= 1) return;
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  const sanitizedFolderPreview = sanitizeFolderNameInput(databaseFolderName);
  const folderNameCollision = Boolean(
    sanitizedFolderPreview &&
      existingFolderNames.some(
        (existing) => existing.toLowerCase() === sanitizedFolderPreview.toLowerCase()
      )
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a Research Review Title (or enter a title in the placeholder box).');
      return;
    }

    const customFolder = sanitizeFolderNameInput(databaseFolderName);
    if (databaseFolderName.trim() && !customFolder) {
      setError('Database Folder Name must include letters or numbers (e.g., my_review_db_2026).');
      return;
    }
    if (
      customFolder &&
      existingFolderNames.some((existing) => existing.toLowerCase() === customFolder.toLowerCase())
    ) {
      setError(`Database folder "${customFolder}" already exists. Please choose a different folder name.`);
      return;
    }

    const activeFw = getFrameworkDefinition(frameworkType);
    const activeRev = getReviewTypeDefinition(reviewType);
    const activeStd = PROTOCOL_STANDARD_DEFINITIONS[protocolStandard];

    const syncedPicoc = {
      population: 'Target subject or problem domain',
      intervention: 'Technology, exposure, concept, or intervention under review',
      comparison: 'Baseline, control, mechanism, or alternative approach',
      outcome: 'Synthesized findings, evaluation, or performance metrics',
      context: 'Operational, geographic, or empirical research setting',
    };

    const cleanedFrameworkFields: Record<string, string> = {};
    activeFw.fields.forEach((f) => {
      const val = (frameworkFields[f.key] || '').trim();
      if (val) {
        cleanedFrameworkFields[f.key] = val;
        if (f.picocSyncKey) {
          syncedPicoc[f.picocSyncKey] = val;
        }
      }
    });

    const projectId = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newProject: ReviewProject = {
      id: projectId,
      title: title.trim(),
      ...(customFolder
        ? {
            databaseFolderName: customFolder,
            databaseFolderPath: `database/reviews/${customFolder}`,
          }
        : {}),
      subtitle: subtitle.trim() || `${activeRev.name} (${activeFw.name} Protocol)`,
      scope: scope.trim() || `${title.trim()} synthesis`,
      discipline: discipline.trim() || 'Interdisciplinary Studies',
      methodologyFocus: methodologyFocus.trim() || `${activeRev.name} · ${activeStd.label}`,
      geographicEligibility: geographicEligibility.trim() || 'Global',
      geographicTargetScale,
      publicationYears: publicationYears.trim() || 'All Years',
      articleTypes: articleTypes.trim() || 'Peer-reviewed empirical studies',
      frameworkType,
      frameworkFields: cleanedFrameworkFields,
      reviewType,
      protocolStandard,
      picoc: syncedPicoc,
      researchQuestions: researchQuestions.filter((rq) => rq.question.trim().length > 0).length > 0
        ? researchQuestions.filter((rq) => rq.question.trim().length > 0)
        : [
            {
              code: 'RQ1',
              question: `What are the primary methodologies and outcomes in ${title.trim()}?`,
              mainEvidenceToCollect: 'Study characteristics, intervention types, and reported metrics',
            },
          ],
      inclusionCriteria: criteria.filter((c) => c.dimension.trim().length > 0).length > 0
        ? criteria.filter((c) => c.dimension.trim().length > 0)
        : [
            {
              id: 'crit-default-1',
              dimension: 'Focus',
              includeRule: `Directly investigates ${title.trim()}`,
              excludeRule: 'Unrelated topic or non-empirical editorial',
              category: 'inclusion',
            },
          ],
      standardExclusionReasons: [
        'Methodology: Non-empirical paper, editorial, opinion, or narrative review without original data',
        'Intervention: Does not evaluate the primary technology or intervention under review',
        'Language / Format: Incomplete text, retracted paper, or inaccessible report',
        'Duplicate / Out of Scope: Outside predefined PICOC boundaries or publication year window',
      ],
      uncertainCasesGuidance:
        uncertainGuidance.trim() ||
        'Flag for second reviewer consensus if title/abstract mentions related methods but lacks explicit performance metrics.',
      booleanQuery:
        booleanQuery.trim() ||
        `("${title.trim().split(' ').slice(0, 3).join(' ')}") AND ("review" OR "evaluation" OR "analysis")`,
      articles: [], // Starts completely clean with 0 articles in its own partitioned database folder
    };

    onCreateProject(newProject);
    handleClearAll();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-slate-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-teal-500 text-white rounded-xl shadow-md">
              <Compass className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <span>New Research Review (Manual Blank Insertion)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Clean Placeholders · Not Auto-Filled
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Create a brand-new systematic literature review protocol from scratch. All inputs start empty with instructional placeholders.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClearAll}
              className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
              title="Reset all inputs back to empty placeholders"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Placeholders</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {error && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-2xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Review Title & Subtitle */}
          <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
            <h4 className="text-white font-bold text-xs flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              <span>1. Research Review Title & Scope (Manual Entry)</span>
            </h4>

            {/* Editable Partitioned Storage Database Folder Name */}
            <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/50 space-y-2.5 text-[11px]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span>Dedicated Partitioned Database Folder Name (Editable)</span>
                  </span>
                  <span className="text-slate-400 block mt-0.5">
                    Customize your own database folder name rather than using the Review Title by default. Starts with <strong className="text-emerald-400">0 articles</strong> and keeps all existing folders untouched.
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] text-teal-400 truncate max-w-xs shrink-0">
                  database/reviews/{sanitizedFolderPreview || 'review-db-...'}/articles.json
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <FolderEdit className="w-3.5 h-3.5 text-teal-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Type custom database folder name (e.g., gully_uav_2026, clinical-meta-v1) — leave blank for auto-ID..."
                    value={databaseFolderName}
                    onChange={(e) => {
                      setDatabaseFolderName(e.target.value);
                      if (error) setError('');
                    }}
                    className={`w-full bg-slate-900 border rounded-xl pl-8 pr-3 py-2 text-xs text-white font-mono placeholder:font-sans placeholder:text-slate-500 focus:outline-none ${
                      folderNameCollision
                        ? 'border-rose-500 focus:border-rose-400'
                        : 'border-slate-700 focus:border-teal-500'
                    }`}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const tag = `study-db-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6)}`;
                      setDatabaseFolderName(tag);
                      if (error) setError('');
                    }}
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 text-[11px] font-semibold cursor-pointer transition"
                    title="Generate a unique non-title database folder name"
                  >
                    Suggest Folder Name
                  </button>
                  <button
                    type="button"
                    disabled={!title.trim()}
                    onClick={() => {
                      const slugFromTitle = sanitizeFolderNameInput(title.toLowerCase().slice(0, 48));
                      if (slugFromTitle) {
                        setDatabaseFolderName(slugFromTitle);
                        if (error) setError('');
                      }
                    }}
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium cursor-pointer transition disabled:opacity-40"
                    title="Optionally derive folder name from your Review Title"
                  >
                    Use Title
                  </button>
                </div>
              </div>

              {folderNameCollision && (
                <p className="text-[11px] text-rose-400 font-semibold">
                  A database folder named &ldquo;{sanitizedFolderPreview}&rdquo; already exists. Please enter a unique folder name.
                </p>
              )}
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Research Review Title <span className="text-indigo-400 font-normal">(Empty by default — type your custom title)</span>
              </label>
              <input
                type="text"
                placeholder="Enter research review title (e.g., Systematic Review on Microplastics in Freshwater Ecosystems)..."
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError('');
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Focus / Subtitle Integration</label>
                <input
                  type="text"
                  placeholder="Enter review subtitle, focus, or PRISMA protocol scope..."
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Academic Discipline</label>
                <input
                  type="text"
                  placeholder="e.g., Environmental Science, Computer Science, Agronomy, Public Health..."
                  value={discipline}
                  onChange={(e) => setDiscipline(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Scope & Theoretical Motivation</label>
              <textarea
                rows={2}
                placeholder="Brief description of the research review scope, problem domain, and theoretical motivation..."
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Section 2: Framework Type, Review Type & Methodological Boundaries */}
          <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
            <h4 className="text-white font-bold text-xs flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <Layers className="w-4 h-4 text-teal-400" />
              <span>2. Framework Type, Literature Review Type &amp; Protocol Boundaries</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Framework Type</label>
                <select
                  value={frameworkType}
                  onChange={(e) => setFrameworkType(e.target.value as ReviewFrameworkType)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {FRAMEWORK_DEFINITIONS.map((fw) => (
                    <option key={fw.id} value={fw.id}>
                      {fw.name} — {fw.mainApplication}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Literature Review Type</label>
                <select
                  value={reviewType}
                  onChange={(e) => {
                    const nextId = e.target.value as LiteratureReviewTypeId;
                    setReviewType(nextId);
                    const def = getReviewTypeDefinition(nextId);
                    setProtocolStandard(def.defaultProtocolStandard);
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-teal-500 cursor-pointer"
                >
                  {REVIEW_TYPE_DEFINITIONS.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.number}. {rt.name} — {rt.mainPurpose}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-semibold text-slate-400">Protocol Standard:</span>
              {(Object.keys(PROTOCOL_STANDARD_DEFINITIONS) as ProtocolStandardType[]).map((stdKey) => {
                const stdDef = PROTOCOL_STANDARD_DEFINITIONS[stdKey];
                return (
                  <button
                    key={stdKey}
                    type="button"
                    onClick={() => setProtocolStandard(stdKey)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                      protocolStandard === stdKey
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {stdDef.shortBadge}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Methodology Focus</label>
                <input
                  type="text"
                  placeholder="e.g., PRISMA 2020 Systematic Review, PRISMA-ScR..."
                  value={methodologyFocus}
                  onChange={(e) => setMethodologyFocus(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Geographic Eligibility &amp; Scale</label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    placeholder="e.g., Global, Africa, Ethiopia, Amhara Region, North Gondar Zone, Mecha Woreda, Debre Mawi Watershed..."
                    value={geographicEligibility}
                    onChange={(e) => setGeographicEligibility(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <select
                    value={geographicTargetScale}
                    onChange={(e) => setGeographicTargetScale(e.target.value as GeographicScaleTier | 'any')}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-teal-300 focus:outline-none focus:border-teal-500 cursor-pointer"
                  >
                    <option value="any">Scale: Auto / Hierarchical Containment</option>
                    {GEOGRAPHIC_SCALE_TIERS.filter((t) => t.tier !== 'unspecified').map((t) => (
                      <option key={t.tier} value={t.tier}>
                        {t.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Publication Years</label>
                <input
                  type="text"
                  placeholder="e.g., 2018 – 2026..."
                  value={publicationYears}
                  onChange={(e) => setPublicationYears(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Eligible Article Types</label>
                <input
                  type="text"
                  placeholder="e.g., Peer-reviewed empirical journal articles..."
                  value={articleTypes}
                  onChange={(e) => setArticleTypes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Dynamic Selected Framework Scoping Fields */}
          <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
              <h4 className="text-white font-bold text-xs flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-400" />
                <span>3. {getFrameworkDefinition(frameworkType).fullTitle}</span>
              </h4>
              <span className="text-[10px] text-slate-400">
                {getFrameworkDefinition(frameworkType).mainApplication}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {getFrameworkDefinition(frameworkType).fields.map((field) => (
                <div key={field.key} className={field.fullWidth ? 'md:col-span-2' : ''}>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {field.title} ({field.badge})
                  </label>
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={frameworkFields[field.key] || ''}
                    onChange={(e) =>
                      setFrameworkFields({
                        ...frameworkFields,
                        [field.key]: e.target.value,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Boolean Search Query */}
          <div className="space-y-2 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
            <h4 className="text-white font-bold text-xs flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span>4. Electronic Database Boolean Search String</span>
            </h4>
            <textarea
              rows={2}
              placeholder="e.g., ('microplastics' OR 'nanoplastics') AND ('freshwater' OR 'river') AND ('spectroscopy' OR 'detection')..."
              value={booleanQuery}
              onChange={(e) => setBooleanQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white font-mono text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Section 5: Systematic Research Questions */}
          <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-white font-bold text-xs flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-indigo-400" />
                <span>5. Systematic Research Questions ({researchQuestions.length})</span>
              </h4>
              <button
                type="button"
                onClick={handleAddRq}
                className="px-2.5 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question</span>
              </button>
            </div>

            <div className="space-y-2">
              {researchQuestions.map((rq, idx) => (
                <div key={idx} className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-indigo-300 font-bold">{rq.code}</span>
                    {researchQuestions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRq(idx)}
                        className="text-slate-500 hover:text-rose-400 text-xs cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Enter research question text (e.g., What are the prevailing sensor modalities...)"
                    value={rq.question}
                    onChange={(e) => handleUpdateRq(idx, 'question', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white placeholder:text-slate-500 text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Evidence to collect (e.g., Reported sensor payloads, ground sampling distance, and detection accuracy)"
                    value={rq.mainEvidenceToCollect}
                    onChange={(e) => handleUpdateRq(idx, 'mainEvidenceToCollect', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1 text-slate-300 placeholder:text-slate-500 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Section 6: Initial Eligibility Criteria */}
          <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-white font-bold text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>6. Inclusion & Exclusion Criteria Matrix ({criteria.length})</span>
              </h4>
              <button
                type="button"
                onClick={handleAddCriterion}
                className="px-2.5 py-1 bg-teal-600/80 hover:bg-teal-600 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Criterion</span>
              </button>
            </div>

            <div className="space-y-2">
              {criteria.map((crit, idx) => (
                <div key={crit.id} className="p-3 bg-slate-900 rounded-xl border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Dimension / Aspect</label>
                    <input
                      type="text"
                      placeholder="e.g. Platform, Sensor, Method..."
                      value={crit.dimension}
                      onChange={(e) => handleUpdateCriterion(idx, 'dimension', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-white placeholder:text-slate-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-emerald-400 block mb-1">Inclusion Rule</label>
                    <input
                      type="text"
                      placeholder="e.g. Must evaluate empirical field observations..."
                      value={crit.includeRule}
                      onChange={(e) => handleUpdateCriterion(idx, 'includeRule', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-white placeholder:text-slate-500 text-xs"
                    />
                  </div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-rose-400 block">Exclusion Rule</label>
                      {criteria.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCriterion(idx)}
                          className="text-slate-500 hover:text-rose-400 text-[10px] cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. Purely laboratory or simulation study..."
                      value={crit.excludeRule}
                      onChange={(e) => handleUpdateCriterion(idx, 'excludeRule', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-white placeholder:text-slate-500 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Submit Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={handleClearAll}
              className="text-slate-400 hover:text-white text-xs underline cursor-pointer"
            >
              Clear all fields (Start with empty placeholders)
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-teal-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold shadow-lg transition inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Review &amp; Partition Database</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
