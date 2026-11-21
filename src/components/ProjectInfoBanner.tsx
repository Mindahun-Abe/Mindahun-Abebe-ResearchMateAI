import React, { useState, useEffect } from 'react';
import { GeographicScaleTier, ReviewProject } from '../types';
import { Sparkles, Edit3, Check, Copy, BookOpen, Globe, Calendar, FileText, Cpu, AlertCircle, Database } from 'lucide-react';
import { apiService } from '../services/apiService';
import {
  getActiveFrameworkFieldEntries,
  getFrameworkDefinition,
  getProtocolStandardDefinition,
  getReviewTypeDefinition,
} from '../utils/protocolFrameworks';
import { GEOGRAPHIC_SCALE_TIERS } from '../utils/geographicSensing';

interface ProjectInfoBannerProps {
  project: ReviewProject;
  onUpdateProject: (updated: ReviewProject) => Promise<ReviewProject | void> | void;
  onSwitchProject: (projectId: string) => void;
  onCreateNewReview?: () => void;
}

export const ProjectInfoBanner: React.FC<ProjectInfoBannerProps> = ({
  project,
  onUpdateProject,
  onSwitchProject,
  onCreateNewReview,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTopicInput, setAiTopicInput] = useState('');
  const [aiDisciplineInput, setAiDisciplineInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Editable local state (always stays synced to active review partition)
  const [title, setTitle] = useState(project.title);
  const [databaseFolderName, setDatabaseFolderName] = useState(project.databaseFolderName || '');
  const [subtitle, setSubtitle] = useState(project.subtitle);
  const [scope, setScope] = useState(project.scope || '');
  const [methodology, setMethodology] = useState(project.methodologyFocus);
  const [geographic, setGeographic] = useState(project.geographicEligibility);
  const [geographicScale, setGeographicScale] = useState<GeographicScaleTier | 'any'>(
    project.geographicTargetScale || 'any'
  );
  const [years, setYears] = useState(project.publicationYears);
  const [articleTypes, setArticleTypes] = useState(project.articleTypes);
  const [discipline, setDiscipline] = useState(project.discipline);

  useEffect(() => {
    setTitle(project.title);
    setDatabaseFolderName(project.databaseFolderName || '');
    setSubtitle(project.subtitle);
    setScope(project.scope || '');
    setMethodology(project.methodologyFocus);
    setGeographic(project.geographicEligibility);
    setGeographicScale(project.geographicTargetScale || 'any');
    setYears(project.publicationYears);
    setArticleTypes(project.articleTypes);
    setDiscipline(project.discipline);
    setEditError('');
    setIsEditing(false);
  }, [
    project.id,
    project.title,
    project.databaseFolderName,
    project.subtitle,
    project.scope,
    project.methodologyFocus,
    project.geographicEligibility,
    project.geographicTargetScale,
    project.publicationYears,
    project.articleTypes,
    project.discipline,
  ]);

  const handleClearEditFields = () => {
    setTitle('');
    setDatabaseFolderName('');
    setSubtitle('');
    setScope('');
    setMethodology('');
    setGeographic('');
    setGeographicScale('any');
    setYears('');
    setArticleTypes('');
    setDiscipline('');
    setEditError('');
  };

  const handleSave = async () => {
    const cleanedFolder = databaseFolderName
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 80);

    if (databaseFolderName.trim() && !cleanedFolder) {
      setEditError('Database Folder Name must include letters or numbers (e.g., my_review_db).');
      return;
    }

    setIsSavingEdit(true);
    setEditError('');
    try {
      await onUpdateProject({
        ...project,
        title: title.trim() || 'Untitled Systematic Review',
        ...(cleanedFolder
          ? {
              databaseFolderName: cleanedFolder,
              databaseFolderPath: `database/reviews/${cleanedFolder}`,
            }
          : {}),
        subtitle: subtitle.trim() || 'Systematic Review Protocol',
        scope: scope.trim() || `${title.trim() || 'Review'} synthesis`,
        methodologyFocus: methodology.trim() || 'PRISMA 2020 Systematic Review',
        geographicEligibility: geographic.trim() || 'Global',
        geographicTargetScale: geographicScale,
        publicationYears: years.trim() || 'All Years',
        articleTypes: articleTypes.trim() || 'Peer-reviewed research',
        discipline: discipline.trim() || 'Interdisciplinary Studies',
      });
      setIsEditing(false);
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update review database details.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const activeFramework = getFrameworkDefinition(project.frameworkType);
  const activeReviewType = getReviewTypeDefinition(project.reviewType);
  const activeProtocolStd = getProtocolStandardDefinition(project);
  const activeFrameworkEntries = getActiveFrameworkFieldEntries(project);

  const copyFormattedProjectInfo = () => {
    const frameworkLines = activeFrameworkEntries
      .map((entry) => `- ${entry.label}: ${entry.value || 'Not specified'}`)
      .join('\n');

    const formatted = `RESEARCH PROJECT SPECIFICATION (${activeFramework.name} · ${activeReviewType.name} · ${activeProtocolStd.label})
=====================================================
Topic / Title: ${project.title}
Subtitle / Focus: ${project.subtitle}
Framework Type: ${activeFramework.fullTitle}
Literature Review Type: ${activeReviewType.number}. ${activeReviewType.name}
Protocol Standard: ${activeProtocolStd.label}
Discipline: ${project.discipline}
Methodology Focus: ${project.methodologyFocus}
Geographic Eligibility: ${project.geographicEligibility}
Publication Years: ${project.publicationYears}
Article Types: ${project.articleTypes}

${activeFramework.fullTitle}:
${frameworkLines}

Boolean Search Query:
${project.booleanQuery}
=====================================================`;

    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleAiGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiTopicInput.trim()) return;

    setIsGenerating(true);
    setErrorMsg('');
    try {
      const generated = await apiService.generatePicocSpec(aiTopicInput, aiDisciplineInput);
      
      const updated: ReviewProject = {
        ...project,
        id: project.id,
        title: generated.recommendedTitle || aiTopicInput,
        subtitle: `Systematic literature review protocol on ${aiTopicInput}`,
        scope: `${aiTopicInput} research synthesis`,
        discipline: aiDisciplineInput || 'Interdisciplinary Studies',
        methodologyFocus: 'Systematic literature review, empirical validation, comparative metrics',
        geographicEligibility: 'Global research studies',
        publicationYears: '2016 – 2026',
        articleTypes: 'Peer-reviewed original research',
        picoc: generated.picoc || project.picoc,
        researchQuestions: generated.researchQuestions || project.researchQuestions,
        inclusionCriteria: (generated.inclusionCriteria || []).map((inc: any, idx: number) => ({
          id: `ai-inc-${idx + 1}`,
          dimension: inc.criterion || `Criterion ${idx + 1}`,
          includeRule: inc.includeRule || '',
          excludeRule: inc.excludeRule || '',
          category: 'inclusion',
        })),
        standardExclusionReasons: generated.standardExclusionReasons || project.standardExclusionReasons,
        uncertainCasesGuidance: generated.uncertainCasesGuidance || project.uncertainCasesGuidance,
        booleanQuery: generated.suggestedBooleanQuery || project.booleanQuery,
      };

      onUpdateProject(updated);
      setShowAiModal(false);
      setAiTopicInput('');
      setAiDisciplineInput('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate specification with AI.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 text-slate-100 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {activeFramework.name} · {activeReviewType.name}
            </span>
            <span className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              {activeProtocolStd.shortBadge}
            </span>
            <span
              className="px-2.5 py-1 text-[11px] font-mono rounded-md bg-teal-500/15 text-teal-300 border border-teal-500/30 inline-flex items-center gap-1.5 max-w-full truncate"
              title={`Active Partitioned Database: ${project.databaseFolderPath || `database/reviews/${project.id}`}/articles.json`}
            >
              <Database className="w-3 h-3 shrink-0 text-teal-400" />
              <span className="truncate">
                Partition: /{project.databaseFolderName || project.id} · {project.articles.length} articles
              </span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onCreateNewReview && (
              <button
                onClick={onCreateNewReview}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-indigo-600 via-teal-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white rounded-lg shadow-sm transition-all cursor-pointer"
                title="Create brand new research review with empty placeholders"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>+ New Review (Manual Blank)</span>
              </button>
            )}

            <button
              onClick={() => setShowAiModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition cursor-pointer"
              title="Generate SLR protocol for any new research topic"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              <span>AI Protocol</span>
            </button>

            <button
              onClick={copyFormattedProjectInfo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition cursor-pointer"
              title="Copy complete project details to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>

            <button
              onClick={() => setIsEditing(!isEditing)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg transition cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Cancel Edit' : 'Edit Details'}</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        {isEditing ? (
          <div className="mt-4 space-y-4 bg-slate-800/60 p-4 rounded-xl border border-slate-700 text-xs">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
              <span className="font-bold text-white text-xs">Edit Research Review Details (Placeholders active)</span>
              <button
                type="button"
                onClick={handleClearEditFields}
                className="text-indigo-400 hover:text-indigo-300 text-xs underline cursor-pointer"
              >
                Clear all fields (Reset to empty placeholders)
              </button>
            </div>

            {editError && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-700/70 text-rose-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Review Topic / Title <span className="text-slate-400 font-normal">(Empty placeholder — type custom title)</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter research review title (e.g., Systematic Review on Microplastics in Freshwater Ecosystems)..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Database Folder Name <span className="text-teal-400 font-normal">(database/reviews/&lt;folder&gt;)</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter custom database folder name (e.g., microplastics_freshwater_db)..."
                  value={databaseFolderName}
                  onChange={(e) => {
                    setDatabaseFolderName(e.target.value);
                    if (editError) setEditError('');
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-teal-300 font-mono placeholder:font-sans placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Focus / Subtitle Integration</label>
                <input
                  type="text"
                  placeholder="Enter review focus, subtitle, or PRISMA protocol scope..."
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Academic Discipline</label>
                <input
                  type="text"
                  placeholder="e.g., Remote Sensing, Agronomy, Public Health, Computer Science..."
                  value={discipline}
                  onChange={(e) => setDiscipline(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Scope &amp; Theoretical Motivation</label>
              <input
                type="text"
                placeholder="Brief description of the review scope, boundaries, and motivation..."
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Methodology</label>
                <input
                  type="text"
                  placeholder="e.g., PRISMA 2020 Systematic Review, Meta-analysis..."
                  value={methodology}
                  onChange={(e) => setMethodology(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Geographic Eligibility &amp; Spatial Scale
                </label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    placeholder="e.g., Global, East Africa, Ethiopia, Amhara Region, North Gondar Zone, Mecha Woreda, Debre Mawi Watershed..."
                    value={geographic}
                    onChange={(e) => setGeographic(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <select
                    value={geographicScale}
                    onChange={(e) => setGeographicScale(e.target.value as GeographicScaleTier | 'any')}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-teal-300 focus:outline-none focus:border-teal-500 cursor-pointer"
                  >
                    <option value="any">Scale: Auto / Hierarchical Containment</option>
                    {GEOGRAPHIC_SCALE_TIERS.filter((t) => t.tier !== 'unspecified').map((t) => (
                      <option key={t.tier} value={t.tier}>
                        Scale: {t.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Publication Years</label>
                <input
                  type="text"
                  placeholder="e.g., 2018 – 2026..."
                  value={years}
                  onChange={(e) => setYears(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Article Types</label>
                <input
                  type="text"
                  placeholder="e.g., Peer-reviewed empirical journal articles..."
                  value={articleTypes}
                  onChange={(e) => setArticleTypes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-700">
              <button
                type="button"
                onClick={handleClearEditFields}
                className="text-slate-400 hover:text-white text-xs underline cursor-pointer"
              >
                Clear all fields
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditError('');
                    setIsEditing(false);
                  }}
                  className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={handleSave}
                  className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">
              {project.title}
            </h1>
            {project.subtitle && (
              <p className="text-xs sm:text-sm text-slate-300 mt-1 line-clamp-2">
                <span className="font-semibold text-slate-200">Focus: </span>
                {project.subtitle}
              </p>
            )}

            {/* Universal Structured Metadata Grid */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-slate-800 text-xs">
              <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 font-medium mb-0.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Methodology</span>
                </div>
                <div className="text-slate-200 font-semibold truncate" title={project.methodologyFocus}>
                  {project.methodologyFocus || 'Systematic Review & Meta-analysis'}
                </div>
              </div>

              <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between gap-1 text-slate-400 font-medium mb-0.5">
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-teal-400" />
                    <span>Geographic Eligibility</span>
                  </span>
                  {project.geographicTargetScale && project.geographicTargetScale !== 'any' && (
                    <span className="px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 text-[9px] font-mono uppercase">
                      {project.geographicTargetScale}
                    </span>
                  )}
                </div>
                <div className="text-slate-200 font-semibold truncate" title={project.geographicEligibility}>
                  {project.geographicEligibility || 'Global studies'}
                </div>
              </div>

              <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 font-medium mb-0.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>Publication Years</span>
                </div>
                <div className="text-slate-200 font-semibold truncate">
                  {project.publicationYears || '2015 – 2026'}
                </div>
              </div>

              <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 font-medium mb-0.5">
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  <span>Article Types</span>
                </div>
                <div className="text-slate-200 font-semibold truncate" title={project.articleTypes}>
                  {project.articleTypes || 'Peer-reviewed original research'}
                </div>
              </div>

              <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800 col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1.5 text-slate-400 font-medium mb-0.5">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" />
                  <span>Discipline</span>
                </div>
                <div className="text-slate-200 font-semibold truncate" title={project.discipline}>
                  {project.discipline || 'Interdisciplinary'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Topic Generator Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-teal-500/20 text-teal-300 rounded-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">AI SLR Protocol Generator</h3>
                  <p className="text-xs text-slate-400">Generate PICOC, RQ1-RQ7, and Screening Criteria for any field</p>
                </div>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="text-slate-400 hover:text-white text-lg font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAiGenerate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Research Topic or Working Title <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g., Gully erosion susceptibility mapping using machine learning and deep learning in highland catchments"
                  value={aiTopicInput}
                  onChange={(e) => setAiTopicInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-teal-500 placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Discipline / Field of Study
                </label>
                <input
                  type="text"
                  placeholder="e.g., Geomorphology, Remote Sensing, Precision Agriculture, Oncology"
                  value={aiDisciplineInput}
                  onChange={(e) => setAiDisciplineInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 placeholder:text-slate-500"
                />
              </div>

              <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
                <p className="font-semibold text-teal-300 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> What will be generated:
                </p>
                <ul className="list-disc list-inside text-slate-400 space-y-0.5 pl-1">
                  <li>Full PICOC definition based on Booth et al. (2016)</li>
                  <li>7 Systematic Research Questions (RQ1 to RQ7 with evidence tables)</li>
                  <li>Explicit inclusion and exclusion criteria matrix</li>
                  <li>Standard exclusion reasons & uncertain cases guidance</li>
                  <li>Tailored multi-database Boolean search string</li>
                </ul>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-950/50 border border-rose-800 p-2.5 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-lg"
                  disabled={isGenerating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGenerating || !aiTopicInput.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-lg shadow-md disabled:opacity-50 transition"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Generating SLR Protocol...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Protocol</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
