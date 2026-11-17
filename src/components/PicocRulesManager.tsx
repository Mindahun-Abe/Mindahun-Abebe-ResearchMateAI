import React, { useState } from 'react';
import {
  EligibilityCriterion,
  LiteratureReviewTypeId,
  ProtocolStandardType,
  ResearchQuestion,
  ReviewFrameworkType,
  ReviewProject,
} from '../types';
import {
  FRAMEWORK_DEFINITIONS,
  FrameworkFieldDef,
  getFrameworkDefinition,
  getFrameworkFieldValue,
  getProtocolStandardDefinition,
  getReviewTypeDefinition,
  PROTOCOL_STANDARD_DEFINITIONS,
  REVIEW_TYPE_DEFINITIONS,
} from '../utils/protocolFrameworks';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Compass,
  Copy,
  Layers,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

interface PicocRulesManagerProps {
  project: ReviewProject;
  onUpdateProject: (updated: ReviewProject) => void;
  onAutoSyncScreening?: () => void;
}

export const PicocRulesManager: React.FC<PicocRulesManagerProps> = ({
  project,
  onUpdateProject,
  onAutoSyncScreening,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'picoc' | 'rq' | 'criteria' | 'exclusions' | 'query'>('picoc');
  const [copiedQuery, setCopiedQuery] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Criterion addition state
  const [newDimension, setNewDimension] = useState('');
  const [newIncludeRule, setNewIncludeRule] = useState('');
  const [newExcludeRule, setNewExcludeRule] = useState('');

  // Exclusion reason addition state
  const [newReason, setNewReason] = useState('');

  // RQ addition state
  const [newRqCode, setNewRqCode] = useState('RQ' + (project.researchQuestions.length + 1));
  const [newRqText, setNewRqText] = useState('');
  const [newRqEvidence, setNewRqEvidence] = useState('');

  const activeFramework = getFrameworkDefinition(project.frameworkType);
  const activeReviewType = getReviewTypeDefinition(project.reviewType);
  const activeProtocolStandard = getProtocolStandardDefinition(project);

  // Framework Type Dropdown handler
  const handleFrameworkTypeChange = (fwId: ReviewFrameworkType) => {
    const nextFw = getFrameworkDefinition(fwId);
    const nextFields: Record<string, string> = { ...(project.frameworkFields || {}) };
    nextFw.fields.forEach((f) => {
      if (nextFields[f.key] === undefined && f.picocSyncKey && project.picoc?.[f.picocSyncKey]) {
        nextFields[f.key] = project.picoc[f.picocSyncKey];
      }
    });
    onUpdateProject({
      ...project,
      frameworkType: fwId,
      frameworkFields: nextFields,
    });
  };

  // Literature Review Type Dropdown handler
  const handleReviewTypeChange = (revId: LiteratureReviewTypeId) => {
    const revDef = getReviewTypeDefinition(revId);
    onUpdateProject({
      ...project,
      reviewType: revId,
      protocolStandard: revDef.defaultProtocolStandard,
      methodologyFocus: `${revDef.name} (${revDef.reportingGuideline})`,
    });
  };

  // Independent Protocol Standard handler (SLR, Scoping Review, Meta-Analysis)
  const handleProtocolStandardChange = (std: ProtocolStandardType) => {
    const def = PROTOCOL_STANDARD_DEFINITIONS[std];
    onUpdateProject({
      ...project,
      protocolStandard: std,
      methodologyFocus: `${activeReviewType.name} · ${def.label}`,
    });
  };

  // Dynamic framework field change (persists in frameworkFields + syncs picoc fallback keys)
  const handleFrameworkFieldChange = (field: FrameworkFieldDef, value: string) => {
    const updatedFrameworkFields: Record<string, string> = {
      ...(project.frameworkFields || {}),
      [field.key]: value,
    };
    const updatedPicoc = { ...project.picoc };
    if (field.picocSyncKey) {
      updatedPicoc[field.picocSyncKey] = value;
    }

    onUpdateProject({
      ...project,
      frameworkType: activeFramework.id,
      frameworkFields: updatedFrameworkFields,
      picoc: updatedPicoc,
    });
  };

  const handleAddCriterion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDimension.trim() || !newIncludeRule.trim()) return;

    const newCrit: EligibilityCriterion = {
      id: 'crit-' + Date.now(),
      dimension: newDimension.trim(),
      includeRule: newIncludeRule.trim(),
      excludeRule: newExcludeRule.trim() || 'Opposing or non-compliant conditions',
      category: 'inclusion',
    };

    onUpdateProject({
      ...project,
      inclusionCriteria: [...project.inclusionCriteria, newCrit],
    });

    setNewDimension('');
    setNewIncludeRule('');
    setNewExcludeRule('');
  };

  const handleDeleteCriterion = (id: string) => {
    onUpdateProject({
      ...project,
      inclusionCriteria: project.inclusionCriteria.filter((c) => c.id !== id),
    });
  };

  const handleAddReason = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReason.trim()) return;
    onUpdateProject({
      ...project,
      standardExclusionReasons: [...project.standardExclusionReasons, newReason.trim()],
    });
    setNewReason('');
  };

  const handleDeleteReason = (index: number) => {
    const updated = [...project.standardExclusionReasons];
    updated.splice(index, 1);
    onUpdateProject({
      ...project,
      standardExclusionReasons: updated,
    });
  };

  const handleAddRq = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRqText.trim()) return;

    const rq: ResearchQuestion = {
      code: newRqCode || `RQ${project.researchQuestions.length + 1}`,
      question: newRqText.trim(),
      mainEvidenceToCollect: newRqEvidence.trim() || 'Methodological parameters and empirical results',
    };

    onUpdateProject({
      ...project,
      researchQuestions: [...project.researchQuestions, rq],
    });

    setNewRqCode('RQ' + (project.researchQuestions.length + 2));
    setNewRqText('');
    setNewRqEvidence('');
  };

  const handleDeleteRq = (index: number) => {
    const updated = [...project.researchQuestions];
    updated.splice(index, 1);
    onUpdateProject({
      ...project,
      researchQuestions: updated,
    });
  };

  const copyQuery = () => {
    navigator.clipboard.writeText(project.booleanQuery);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Protocol Action & Auto-Sync Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="font-bold text-white text-sm">Protocol &amp; Framework Configuration</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Select your discipline&apos;s Scoping Framework, Literature Review Type, and independent Protocol Standard to configure extraction, screening, and reporting for all {project.articles.length} articles.
            </p>
          </div>

          {onAutoSyncScreening && (
            <button
              onClick={() => {
                onAutoSyncScreening();
                setSyncFeedback(
                  `Successfully auto-screened ${project.articles.length} articles against ${activeFramework.name} (${activeReviewType.name}) criteria!`
                );
                setTimeout(() => setSyncFeedback(null), 3500);
              }}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-md transition inline-flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Auto-Sync Screening with Criteria</span>
            </button>
          )}
        </div>

        {/* 2 Primary Dropdowns: Framework Type & Review Type */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
          {/* Dropdown 1: Framework Type */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>1. Framework Type</span>
              </label>
              <span className="text-[10px] font-mono text-slate-400">{activeFramework.reference}</span>
            </div>
            <select
              value={activeFramework.id}
              onChange={(e) => handleFrameworkTypeChange(e.target.value as ReviewFrameworkType)}
              className="w-full bg-slate-900 border border-slate-700 hover:border-indigo-500 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {FRAMEWORK_DEFINITIONS.map((fw) => (
                <option key={fw.id} value={fw.id}>
                  {fw.name} — {fw.mainApplication}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 leading-snug">
              <strong className="text-slate-200">Main application:</strong> {activeFramework.mainApplication}
            </p>
          </div>

          {/* Dropdown 2: Literature Review Type */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-teal-300 uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                <span>2. Literature Review Type</span>
              </label>
              <span className="text-[10px] font-mono text-slate-400">{activeReviewType.reportingGuideline}</span>
            </div>
            <select
              value={activeReviewType.id}
              onChange={(e) => handleReviewTypeChange(e.target.value as LiteratureReviewTypeId)}
              className="w-full bg-slate-900 border border-slate-700 hover:border-teal-500 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-teal-500 cursor-pointer"
            >
              {REVIEW_TYPE_DEFINITIONS.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.number}. {rt.name} — {rt.mainPurpose}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 leading-snug">
              <strong className="text-slate-200">Main purpose:</strong> {activeReviewType.mainPurpose}
            </p>
          </div>
        </div>

        {/* Independent Protocol Standards Selector: Standard SLR, Scoping Review, Meta-Analysis */}
        <div className="bg-slate-950/90 p-3.5 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
              <span>Independent Protocol Standard Mode</span>
            </span>
            <p className="text-[11px] text-slate-400">{activeProtocolStandard.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {(Object.keys(PROTOCOL_STANDARD_DEFINITIONS) as ProtocolStandardType[]).map((stdKey) => {
              const stdDef = PROTOCOL_STANDARD_DEFINITIONS[stdKey];
              const isSelected = activeProtocolStandard.id === stdKey;
              return (
                <button
                  key={stdKey}
                  type="button"
                  onClick={() => handleProtocolStandardChange(stdKey)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                    isSelected
                      ? stdKey === 'scoping_review'
                        ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                        : stdKey === 'meta_analysis'
                        ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                        : 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                  }`}
                >
                  {stdDef.shortBadge}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {syncFeedback && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-900 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* Sub-tab navigation */}
      <div className="flex flex-wrap border-b border-slate-800 gap-2 pb-2">
        <button
          onClick={() => setActiveSubTab('picoc')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
            activeSubTab === 'picoc'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          1. {activeFramework.name} Framework · {activeReviewType.name}
        </button>

        <button
          onClick={() => setActiveSubTab('rq')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
            activeSubTab === 'rq'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          2. Systematic Research Questions ({project.researchQuestions.length})
        </button>

        <button
          onClick={() => setActiveSubTab('criteria')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
            activeSubTab === 'criteria'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          3. Eligibility Rules Matrix ({project.inclusionCriteria.length})
        </button>

        <button
          onClick={() => setActiveSubTab('exclusions')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
            activeSubTab === 'exclusions'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          4. Exclusion Reasons &amp; Uncertain Cases
        </button>

        <button
          onClick={() => setActiveSubTab('query')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
            activeSubTab === 'query'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          5. Multi-Database Boolean Strategy
        </button>
      </div>

      {/* 1. Dynamic Selected Framework Scoping Fields */}
      {activeSubTab === 'picoc' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <span>
                  {activeFramework.fullTitle} · {activeReviewType.name}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">
                <strong className="text-slate-200">{activeFramework.name}:</strong> {activeFramework.mainApplication}{' '}
                <strong className="text-slate-200">Review Purpose:</strong> {activeReviewType.mainPurpose}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <span className="text-xs font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full">
                {activeProtocolStandard.label}
              </span>
              <span className="text-xs font-mono bg-teal-500/10 text-teal-300 border border-teal-500/30 px-3 py-1 rounded-full">
                {activeReviewType.reportingGuideline}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeFramework.fields.map((field) => {
              const value = getFrameworkFieldValue(project, field);
              return (
                <div
                  key={`${activeFramework.id}-${field.key}`}
                  className={`bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 ${
                    field.fullWidth ? 'md:col-span-2' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-7 h-7 rounded-lg ${field.badgeBgClass} text-white text-xs font-bold flex items-center justify-center shrink-0`}
                    >
                      {field.badge}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        {field.title}
                      </h4>
                      <p className="text-[11px] text-slate-400">{field.prompt}</p>
                    </div>
                  </div>
                  <textarea
                    rows={field.fullWidth ? 2 : 3}
                    placeholder={field.placeholder}
                    value={value}
                    onChange={(e) => handleFrameworkFieldChange(field, e.target.value)}
                    className={`w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none ${field.focusBorderClass}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Research Questions */}
      {activeSubTab === 'rq' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">
                {activeReviewType.name} Research Questions
              </h3>
              <p className="text-xs text-slate-400">
                Structures your literature search, data extraction form, synthesis tables, and discussion under {activeFramework.name}.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 w-16">Code</th>
                  <th className="py-3 px-4">Research Question</th>
                  <th className="py-3 px-4">Main Evidence to Collect</th>
                  <th className="py-3 px-4 w-16 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/50">
                {project.researchQuestions.map((rq, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-bold text-indigo-400">{rq.code}</td>
                    <td className="py-3 px-4 font-medium text-white">{rq.question}</td>
                    <td className="py-3 px-4 text-slate-300">{rq.mainEvidenceToCollect}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteRq(idx)}
                        className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                        title="Delete question"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add RQ Form */}
          <form onSubmit={handleAddRq} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase">Add Research Question</h4>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-400 mb-1">Code</label>
                <input
                  type="text"
                  value={newRqCode}
                  onChange={(e) => setNewRqCode(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="block text-[11px] text-slate-400 mb-1">Question</label>
                <input
                  type="text"
                  placeholder="e.g., What evidence or mechanisms address the core review objective?"
                  value={newRqText}
                  onChange={(e) => setNewRqText(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="block text-[11px] text-slate-400 mb-1">Main Evidence to Collect</label>
                <input
                  type="text"
                  placeholder="e.g., Study design, population/sample, effect metrics, context..."
                  value={newRqEvidence}
                  onChange={(e) => setNewRqEvidence(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!newRqText.trim()}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Eligibility Rules Matrix */}
      {activeSubTab === 'criteria' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Explicit Eligibility Rules Matrix</h3>
              <p className="text-xs text-slate-400">
                Define operational inclusion and exclusion criteria before screening to eliminate selection bias.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {project.inclusionCriteria.map((crit) => (
              <div
                key={crit.id}
                className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="md:w-1/4">
                  <span className="font-bold text-white text-sm">{crit.dimension}</span>
                  <span className="block text-[11px] text-slate-500 font-mono">Dimension</span>
                </div>

                <div className="md:w-3/8 bg-emerald-950/20 border border-emerald-800/40 p-2.5 rounded-lg">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>Include Rule</span>
                  </div>
                  <p className="text-slate-200">{crit.includeRule}</p>
                </div>

                <div className="md:w-3/8 bg-rose-950/20 border border-rose-800/40 p-2.5 rounded-lg">
                  <div className="flex items-center gap-1.5 text-rose-400 font-semibold mb-1">
                    <X className="w-3.5 h-3.5" />
                    <span>Exclude Rule</span>
                  </div>
                  <p className="text-slate-200">{crit.excludeRule}</p>
                </div>

                <button
                  onClick={() => handleDeleteCriterion(crit.id)}
                  className="text-slate-500 hover:text-rose-400 p-1 self-end md:self-center cursor-pointer"
                  title="Delete criterion"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Add Criterion Form */}
          <form onSubmit={handleAddCriterion} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase">Add New Screening Dimension</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Dimension Name</label>
                <input
                  type="text"
                  placeholder="e.g., Study Design, Exposure, Setting, Outcome"
                  value={newDimension}
                  onChange={(e) => setNewDimension(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-emerald-400 mb-1">Explicit Inclusion Condition</label>
                <input
                  type="text"
                  placeholder="e.g., Reports empirical outcomes or target exposure measures"
                  value={newIncludeRule}
                  onChange={(e) => setNewIncludeRule(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-rose-400 mb-1">Explicit Exclusion Condition</label>
                <input
                  type="text"
                  placeholder="e.g., Non-primary editorial, conference abstract, or off-topic"
                  value={newExcludeRule}
                  onChange={(e) => setNewExcludeRule(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!newDimension.trim() || !newIncludeRule.trim()}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Criterion</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Exclusion Reasons & Uncertain Cases */}
      {activeSubTab === 'exclusions' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          {/* Uncertain cases guideline */}
          <div className="bg-amber-950/30 border border-amber-800/60 p-4 rounded-xl text-xs space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <AlertTriangle className="w-4 h-4" />
              <span>Uncertain Cases &amp; Dual-Review Arbitration Guidance</span>
            </div>
            <textarea
              rows={3}
              value={project.uncertainCasesGuidance}
              onChange={(e) =>
                onUpdateProject({
                  ...project,
                  uncertainCasesGuidance: e.target.value,
                })
              }
              className="w-full bg-slate-950/80 border border-amber-900/50 rounded-lg p-2.5 text-amber-100 text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Standard reasons list */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Standard Reasons for Exclusion (PRISMA Full-Text Reporting)
            </h4>
            <p className="text-xs text-slate-400">
              {activeReviewType.reportingGuideline} requires reporting the exact number of full-text studies excluded by predefined reasons.
            </p>

            <div className="space-y-2">
              {project.standardExclusionReasons.map((reason, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-[10px]">
                      {idx + 1}
                    </span>
                    <span>{reason}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteReason(idx)}
                    className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                    title="Remove reason"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add reason */}
            <form onSubmit={handleAddReason} className="flex gap-2 pt-2">
              <input
                type="text"
                placeholder="Add predefined exclusion reason (e.g., 'Validation: No comparator or insufficient sample')..."
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
              <button
                type="submit"
                disabled={!newReason.trim()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl disabled:opacity-50 cursor-pointer"
              >
                Add Reason
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. Boolean Search Query */}
      {activeSubTab === 'query' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Multi-Database Boolean Search Syntax</h3>
              <p className="text-xs text-slate-400">
                Adaptable query for Scopus, Web of Science, PubMed, ScienceDirect, IEEE Xplore, and Google Scholar.
              </p>
            </div>
            <button
              onClick={copyQuery}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              {copiedQuery ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedQuery ? 'Copied Search String' : 'Copy Query'}</span>
            </button>
          </div>

          <textarea
            rows={4}
            value={project.booleanQuery}
            onChange={(e) =>
              onUpdateProject({
                ...project,
                booleanQuery: e.target.value,
              })
            }
            className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-indigo-200 leading-relaxed focus:outline-none focus:border-indigo-500"
          />

          <div className="text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="font-semibold text-slate-300">Methodological Recommendation:</span>
            <p>
              Structure search blocks around your active <strong>{activeFramework.name}</strong> dimensions ({activeFramework.fields.map((f) => f.title.split(' ')[0]).join(', ')}) aligned to <strong>{activeReviewType.name}</strong> ({activeReviewType.reportingGuideline}). Save each database search export with timestamp and record counts to maintain provenance.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
