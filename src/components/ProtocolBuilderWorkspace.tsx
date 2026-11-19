import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  Article,
  LiteratureReviewTypeId,
  ModuleQaRescanRecord,
  ProtocolAmendmentRecord,
  ProtocolDatabaseSearchStrategy,
  ProtocolFrameworkComponentItem,
  ProtocolVersionSnapshot,
  ReviewFrameworkType,
  ReviewProject,
  SystematicReviewProtocol,
  WorkbenchModuleId,
} from '../types';
import { apiService } from '../services/apiService';
import {
  FRAMEWORK_DEFINITIONS,
  getFrameworkDefinition,
  REVIEW_TYPE_DEFINITIONS,
} from '../utils/protocolFrameworks';
import { AutoSaveStatusInfo, ModuleWorkbenchControls } from './ModuleWorkbenchControls';

interface ProtocolBuilderWorkspaceProps {
  project: ReviewProject;
  articles: Article[];
  onActivateProtocolInProject?: (updatedProject: ReviewProject, protocol: SystematicReviewProtocol) => void;
  onNavigateToModule?: (tab: string) => void;
  autoSaveStatus?: AutoSaveStatusInfo;
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

const STEPS: Array<{ step: number; shortTitle: string; fullTitle: string; lockKey?: string }> = [
  { step: 1, shortTitle: 'Topic Profile', fullTitle: '1. Initial Topic Input & Profile', lockKey: 'topic_analysis' },
  { step: 2, shortTitle: 'Scope & Gaps', fullTitle: '2. Scope, Problem & Provisional Gaps', lockKey: 'topic_analysis' },
  { step: 3, shortTitle: 'Method & Type', fullTitle: '3. Review Type & Conduct Methodology', lockKey: 'review_method' },
  { step: 4, shortTitle: 'Framework', fullTitle: '4. Research Framework Matrix', lockKey: 'framework' },
  { step: 5, shortTitle: 'Objectives', fullTitle: '5. General & Specific Objectives', lockKey: 'objectives_rqs' },
  { step: 6, shortTitle: 'RQs Mapping', fullTitle: '6. Research Questions & Coverage Matrix', lockKey: 'objectives_rqs' },
  { step: 7, shortTitle: 'Eligibility', fullTitle: '7. Inclusion / Exclusion Criteria & Reasons', lockKey: 'eligibility' },
  { step: 8, shortTitle: 'Search Strings', fullTitle: '8. Multi-Database Search Strategy Builder', lockKey: 'search_strategy' },
  { step: 9, shortTitle: '18-Section Plan', fullTitle: '9. Structured 18-Section Methodology Plan', lockKey: 'methodology_plan' },
  { step: 10, shortTitle: 'Extraction Map', fullTitle: '10. RQ-to-Extraction Variable Planning', lockKey: 'extraction_plan' },
  { step: 11, shortTitle: 'Appraisal Plan', fullTitle: '11. Design-Specific Quality Appraisal Plan', lockKey: 'appraisal_plan' },
  { step: 12, shortTitle: 'Synthesis Plan', fullTitle: '12. Qualitative & Quantitative Synthesis Plan', lockKey: 'synthesis_plan' },
  { step: 13, shortTitle: 'MA Feasibility', fullTitle: '13. Meta-Analysis Feasibility Assessment', lockKey: 'synthesis_plan' },
  { step: 14, shortTitle: 'Validation & PRISMA', fullTitle: '14. Validation Engine & PRISMA Checklist' },
  { step: 15, shortTitle: 'Versions & Approve', fullTitle: '15. Versioning, Approval & Amendments' },
  { step: 16, shortTitle: 'Activate & Export', fullTitle: '16. Activate in Project & Export Suite' },
];

const DATABASE_TEMPLATES: Record<string, { platform: string; fields: string; sample: string }> = {
  Scopus: { platform: 'Elsevier Scopus Advanced Search', fields: 'TITLE-ABS-KEY', sample: 'TITLE-ABS-KEY(("concept 1") AND ("concept 2"))' },
  'Web of Science': { platform: 'Clarivate Web of Science Core Collection', fields: 'TS= (Topic)', sample: 'TS=("concept 1") AND TS=("concept 2")' },
  PubMed: { platform: 'NCBI PubMed / MEDLINE', fields: '[tiab] / [MeSH]', sample: '("concept 1"[tiab]) AND ("concept 2"[tiab])' },
  ScienceDirect: { platform: 'Elsevier ScienceDirect (<= 8 connectors)', fields: 'Title, Abstract, Keywords', sample: '("concept 1") AND ("concept 2")' },
  'IEEE Xplore': { platform: 'IEEE Xplore Command Search', fields: 'All Metadata', sample: '("concept 1") AND ("concept 2")' },
  GeoRef: { platform: 'AGI GeoRef / GeoScienceWorld', fields: 'Subject / Title / Abstract', sample: '("concept 1") AND ("concept 2")' },
  Crossref: { platform: 'Crossref REST API / DOI Works', fields: 'query.bibliographic', sample: 'concept 1 concept 2' },
  'Google Scholar': { platform: 'Google Scholar (Grey Literature)', fields: 'Full-text (<256 chars)', sample: '("concept 1") AND ("concept 2")' },
};

const escapeHtml = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const csvCell = (v: unknown): string => `"${String(v ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;

const pdfSafe = (v: unknown): string =>
  String(v ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\xA1-\xFF\r\n]/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim();

export const ProtocolBuilderWorkspace: React.FC<ProtocolBuilderWorkspaceProps> = ({
  project,
  articles,
  onActivateProtocolInProject,
  onNavigateToModule,
  autoSaveStatus,
  onResetWorkbenchModule,
  onDirectAddDataFiles,
  onRescanWithQueryQA,
  onDeleteQaEntry,
  onOpenBulkImporter,
}) => {
  const [protocol, setProtocol] = useState<SystematicReviewProtocol | null>(
    project.workbenchState?.protocolBuilder?.activeProtocol || null
  );
  const [versions, setVersions] = useState<ProtocolVersionSnapshot[]>([]);
  const [amendments, setAmendments] = useState<ProtocolAmendmentRecord[]>([]);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [topicPromptInput, setTopicPromptInput] = useState<string>(project.title || '');
  const [customAiInstruction, setCustomAiInstruction] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [amendReason, setAmendReason] = useState<string>('');
  const [amendSection, setAmendSection] = useState<string>('Protocol Specification');
  const [approveSummary, setApproveSummary] = useState<string>('Researcher reviewed and approved protocol');
  const [compareVersionId, setCompareVersionId] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newDbChoice, setNewDbChoice] = useState<string>('GeoRef');

  const notify = (type: 'success' | 'error', text: string) => {
    setBanner({ type, text });
    setTimeout(() => {
      setBanner((prev) => (prev?.text === text ? null : prev));
    }, 6000);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const state = await apiService.loadProtocolState(project.id);
        if (!active) return;
        if (state.protocol) {
          setProtocol(state.protocol);
          setActiveStep(state.protocol.activeStep || 1);
          setTopicPromptInput(state.protocol.topicAnalysis?.initialTopicInput || project.title);
        }
        setVersions(state.versions || []);
        setAmendments(state.amendments || []);
      } catch (err: any) {
        if (active) notify('error', err?.message || 'Failed to load protocol builder state');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [project.id]);

  const handleGenerate = async (targetStep: number | 'all') => {
    setIsGenerating(true);
    try {
      const res = await apiService.generateProtocolStep({
        projectId: project.id,
        topicInput: topicPromptInput || project.title,
        targetStep,
        customInstruction: customAiInstruction,
        preferredReviewType: protocol?.reviewMethodRecommendation?.recommendedReviewType || project.reviewType,
        preferredFramework: protocol?.reviewMethodRecommendation?.recommendedPrimaryFramework || project.frameworkType,
        protocol,
        project,
        articles,
      });
      setProtocol(res.protocol);
      setVersions(res.versions || []);
      setAmendments(res.amendments || []);
      notify(
        'success',
        targetStep === 'all'
          ? `Full 16-step protocol generated (${res.engine}; locked sections preserved).`
          : `Step ${targetStep} refined (${res.engine}).`
      );
    } catch (err: any) {
      notify('error', err?.message || 'Protocol generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (withAmendment = false) => {
    if (!protocol) return;
    if (protocol.status === 'approved' && !withAmendment) {
      notify('error', 'Protocol is currently Approved & Locked. Enter an Amendment Reason in Step 15 before modifying.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await apiService.saveProtocol(
        project.id,
        { ...protocol, activeStep },
        articles,
        'Researcher',
        withAmendment && amendReason.trim()
          ? {
              modifiedSection: amendSection,
              previousContent: `Prior approved v${protocol.versionNumber}`,
              revisedContent: `Modified at step ${activeStep}`,
              reason: amendReason.trim(),
            }
          : null
      );
      setProtocol(res.protocol);
      setVersions(res.versions || []);
      setAmendments(res.amendments || []);
      if (withAmendment) setAmendReason('');
      notify('success', `Protocol v${res.protocol.versionNumber} validated & saved.`);
    } catch (err: any) {
      notify('error', err?.message || 'Failed to save protocol');
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidateOnly = async () => {
    if (!protocol) return;
    setIsSaving(true);
    try {
      const res = await apiService.validateProtocol(project.id, protocol, articles);
      setProtocol(res.protocol);
      notify(
        res.validationSummary.needsRevisionCount > 0 ? 'error' : 'success',
        `Validation completed: ${res.validationSummary.passedCount} passed, ${res.validationSummary.warningCount} warning(s), ${res.validationSummary.needsRevisionCount} needing revision.`
      );
    } catch (err: any) {
      notify('error', err?.message || 'Validation failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveAndLock = async () => {
    if (!protocol) return;
    setIsSaving(true);
    try {
      const res = await apiService.approveProtocol(
        project.id,
        protocol,
        articles,
        'Researcher',
        approveSummary || 'Researcher approved and locked protocol'
      );
      setProtocol(res.protocol);
      setVersions(res.versions || []);
      setAmendments(res.amendments || []);
      notify('success', `Protocol v${res.protocol.versionNumber} Approved, Snapshot Created & Locked.`);
    } catch (err: any) {
      notify('error', err?.message || 'Approval failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    setIsSaving(true);
    try {
      const res = await apiService.restoreProtocolVersion(project.id, versionId, 'Researcher');
      setProtocol(res.protocol);
      setVersions(res.versions || []);
      setAmendments(res.amendments || []);
      notify('success', `Restored snapshot as editable draft v${res.protocol.versionNumber}.`);
    } catch (err: any) {
      notify('error', err?.message || 'Restore failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivateInProject = async () => {
    if (!protocol) return;
    setIsSaving(true);
    try {
      const res = await apiService.activateProtocolInProject(project.id, protocol, 'Researcher');
      setProtocol(res.protocol);
      onActivateProtocolInProject?.(res.project, res.protocol);
      notify(
        'success',
        `Protocol v${res.protocol.versionNumber} activated across Screening, Extraction & Synthesis modules without altering prior screening decisions.`
      );
    } catch (err: any) {
      notify('error', err?.message || 'Failed to activate protocol in project');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSectionLock = (lockKey?: string) => {
    if (!protocol || !lockKey) return;
    const locked = new Set(protocol.lockedSections || []);
    if (locked.has(lockKey)) locked.delete(lockKey);
    else locked.add(lockKey);
    setProtocol({ ...protocol, lockedSections: Array.from(locked) });
  };

  const rebuildComponentsFromFramework = (fwId: ReviewFrameworkType) => {
    if (!protocol) return;
    const fwDef = getFrameworkDefinition(fwId);
    const nextComponents: ProtocolFrameworkComponentItem[] = fwDef.fields.map((field, idx) => ({
      id: `fw-${fwId.toLowerCase()}-${field.badge.toLowerCase()}-${idx}`,
      frameworkId: fwId,
      componentCode: field.badge === 'C' && field.key === 'context' ? 'Co' : field.badge,
      componentName: field.title,
      definition: field.prompt,
      proposedContent:
        (field.picocSyncKey && (protocol.topicAnalysis as any)[field.picocSyncKey === 'population' ? 'targetPopulation' : field.picocSyncKey === 'intervention' ? 'interventionOrFocus' : field.picocSyncKey === 'comparison' ? 'comparisonBaseline' : field.picocSyncKey === 'outcome' ? 'measurableOutcomes' : 'contextAndConstraints']) ||
        field.placeholder,
      keywords: [field.key],
      synonyms: [],
      inclusionImplications: `Include studies addressing ${field.title.toLowerCase()}.`,
      exclusionImplications: `Exclude studies outside ${field.title.toLowerCase()} scope.`,
      correspondingRqCodes: idx === 0 ? ['RQ1'] : ['RQ2'],
      dataExtractionRequirements: [field.title],
      consistencyNotes: [],
      status: 'pending',
    }));
    setProtocol({
      ...protocol,
      frameworkComponents: nextComponents,
    });
    notify('success', `Rebuilt Step 4 framework matrix for ${fwId}.`);
  };

  // Export Helpers
  const slug =
    (project.databaseFolderName || project.title || project.id || 'protocol')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'protocol';

  const triggerDownload = (content: string, filename: string, mime: string, label: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('success', `Exported ${label} (${filename})`);
  };

  const handleExportWord = () => {
    if (!protocol) return;
    const fwRows = protocol.frameworkComponents
      .map(
        (c) =>
          `<tr><td><b>${escapeHtml(c.componentCode)} — ${escapeHtml(c.componentName)}</b></td><td>${escapeHtml(c.proposedContent)}</td><td>${escapeHtml([...c.keywords, ...c.synonyms].join(', '))}</td><td>${escapeHtml(c.inclusionImplications)} / ${escapeHtml(c.exclusionImplications)}</td><td>${escapeHtml(c.correspondingRqCodes.join(', '))}</td></tr>`
      )
      .join('');
    const objRows = protocol.specificObjectives
      .map((o) => `<li><b>${escapeHtml(o.code)}:</b> ${escapeHtml(o.statement)} (RQs: ${escapeHtml(o.mappedRqCodes.join(', '))})</li>`)
      .join('');
    const rqRows = protocol.rqMappings
      .map(
        (r) =>
          `<tr><td><b>${escapeHtml(r.code)}</b></td><td>${escapeHtml(r.question)}</td><td>${escapeHtml(r.mappedFrameworkComponents.join(', '))}</td><td>${escapeHtml(r.requiredExtractionVariables.join(', '))}</td><td>${escapeHtml(r.proposedSynthesisMethod)}</td></tr>`
      )
      .join('');
    const elRows = protocol.eligibilityMatrix
      .map(
        (r) =>
          `<tr><td><b>${escapeHtml(r.criterion)}</b></td><td>${escapeHtml(r.inclusionRequirement)}</td><td>${escapeHtml(r.exclusionRequirement)}</td><td>${escapeHtml(r.guidance)}</td></tr>`
      )
      .join('');
    const dbRows = protocol.databaseSearchStrategies
      .map(
        (s) =>
          `<tr><td><b>${escapeHtml(s.databaseName)}</b><br/><i>${escapeHtml(s.searchPlatform)}</i></td><td><pre style="white-space:pre-wrap;font-family:Consolas,monospace;font-size:8.5pt;">${escapeHtml(s.exactSearchString)}</pre></td><td>${escapeHtml(s.publicationYearRestrictions)} · ${escapeHtml(s.languageRestrictions)}</td><td>${s.actualRetrievalCount !== null ? escapeHtml(`${s.actualRetrievalCount} (${s.executionDate || 'executed'})`) : 'Pending researcher execution'}</td></tr>`
      )
      .join('');
    const extRows = protocol.extractionPlan
      .map(
        (e) =>
          `<tr><td>${escapeHtml(e.rqCode)} / ${escapeHtml(e.relatedObjective)}</td><td><b>${escapeHtml(e.variableName)}</b></td><td>${escapeHtml(e.definition)}</td><td>${escapeHtml(e.dataType)} (${escapeHtml(e.measurementUnits)})</td><td>${escapeHtml(e.proposedSynthesisApproach)}</td></tr>`
      )
      .join('');
    const appRows = protocol.appraisalPlan
      .map(
        (a) =>
          `<tr><td><b>${escapeHtml(a.studyDesign)}</b></td><td>${escapeHtml(a.recommendedInstrument)}</td><td>${escapeHtml(a.appraisalDomains.join(', '))}</td><td>${escapeHtml(a.scoringApproach)}</td></tr>`
      )
      .join('');
    const methHtml = protocol.methodologySections
      .map(
        (m) =>
          `<h3>${escapeHtml(m.title)}</h3><p>${escapeHtml(m.proposedContent)}</p><p><i>Justification:</i> ${escapeHtml(m.methodologicalJustification)}<br/><i>Supporting References:</i> ${escapeHtml(m.supportingReferences.join('; '))}</p>`
      )
      .join('');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><title>${escapeHtml(protocol.topicAnalysis.proposedTitle)}</title>
      <style>body{font-family:'Times New Roman',serif;font-size:11pt;line-height:1.45;}h1,h2,h3{color:#0f172a;}table{border-collapse:collapse;width:100%;margin:10px 0;}th,td{border:1px solid #94a3b8;padding:6px;text-align:left;font-size:9.5pt;vertical-align:top;}th{background:#f1f5f9;}</style></head>
      <body>
        <h1>${escapeHtml(protocol.topicAnalysis.proposedTitle)}</h1>
        <p><b>Protocol ID:</b> ${escapeHtml(protocol.id)} | <b>Version:</b> v${escapeHtml(protocol.versionNumber)} | <b>Status:</b> ${escapeHtml(protocol.status.toUpperCase())} | <b>Author:</b> ${escapeHtml(protocol.author)}<br/>
        <b>Review Type:</b> ${escapeHtml(protocol.reviewMethodRecommendation.recommendedReviewType.toUpperCase())} | <b>Primary Framework:</b> ${escapeHtml(protocol.reviewMethodRecommendation.recommendedPrimaryFramework)}<br/>
        <b>Conduct Methodology:</b> ${escapeHtml(protocol.reviewMethodRecommendation.methodologicalGuidance)}<br/>
        <b>Reporting Guideline:</b> ${escapeHtml(protocol.reviewMethodRecommendation.reportingGuideline)}</p>
        <h2>1. Abstract / Protocol Summary &amp; Rationale</h2>
        <p><b>Discipline &amp; Scope:</b> ${escapeHtml(protocol.topicAnalysis.discipline)} — ${escapeHtml(protocol.topicAnalysis.focusAndScope)}</p>
        <p><b>Research Problem:</b> ${escapeHtml(protocol.topicAnalysis.researchProblem)}</p>
        <p><b>Knowledge Gap Status (${protocol.topicAnalysis.knowledgeGapVerifiedByEvidence ? 'Verified Against Literature' : 'Provisional AI Suggestion Pending Search'}):</b> ${escapeHtml(protocol.topicAnalysis.knowledgeGaps)}</p>
        <h2>2. Objectives</h2>
        <p><b>General Objective:</b> ${escapeHtml(protocol.generalObjective)}</p>
        <ul>${objRows}</ul>
        <h2>3. Research Framework Matrix</h2>
        <table><thead><tr><th>Component</th><th>Proposed Scope</th><th>Keywords &amp; Synonyms</th><th>Inclusion / Exclusion Implications</th><th>Mapped RQs</th></tr></thead><tbody>${fwRows}</tbody></table>
        <h2>4. Research Question &amp; Extraction Mapping</h2>
        <table><thead><tr><th>RQ</th><th>Question</th><th>Framework</th><th>Required Variables</th><th>Synthesis Approach</th></tr></thead><tbody>${rqRows}</tbody></table>
        <h2>5. Eligibility Criteria &amp; Standardized Full-Text Exclusion Reasons</h2>
        <table><thead><tr><th>Criterion</th><th>Inclusion</th><th>Exclusion</th><th>Guidance</th></tr></thead><tbody>${elRows}</tbody></table>
        <p><b>Standardized PRISMA Exclusion Reasons:</b> ${escapeHtml(protocol.standardizedExclusionReasons.join('; '))}</p>
        <h2>6. Database-Specific Search Strategies</h2>
        <table><thead><tr><th>Database</th><th>Exact Search String</th><th>Filters</th><th>Hits (Researcher Verified)</th></tr></thead><tbody>${dbRows}</tbody></table>
        <h2>7. Data Extraction Framework</h2>
        <table><thead><tr><th>RQ / Obj</th><th>Variable</th><th>Definition</th><th>Type &amp; Units</th><th>Synthesis</th></tr></thead><tbody>${extRows}</tbody></table>
        <h2>8. Quality Appraisal Plan</h2>
        <table><thead><tr><th>Study Design</th><th>Recommended Instrument</th><th>Domains</th><th>Scoring</th></tr></thead><tbody>${appRows}</tbody></table>
        <h2>9. Evidence Synthesis &amp; Meta-Analysis Feasibility Plan</h2>
        <p><b>Meta-Analysis Feasibility:</b> ${escapeHtml(protocol.synthesisPlan.metaAnalysisFeasibility.toUpperCase())} — ${escapeHtml(protocol.synthesisPlan.feasibilityRationale)}</p>
        <p><b>Synthesis Summary:</b> ${escapeHtml(protocol.synthesisPlan.narrativeSummary)}</p>
        <h2>10. Complete 18-Section Methodology Specification</h2>
        ${methHtml}
        <h2>11. Version, Amendment &amp; Validation Audit</h2>
        <p><b>Internal Consistency Indicator:</b> ${protocol.validationSummary.consistencyRatio}% (${protocol.validationSummary.disclaimer})</p>
        <p><b>Change Summary:</b> ${escapeHtml(protocol.changeSummary)} · <b>Recorded Amendments:</b> ${amendments.length}</p>
      </body></html>`;
    triggerDownload(html, `${slug}-protocol-v${protocol.versionNumber}.doc`, 'application/msword;charset=utf-8', 'Complete Word Protocol');
  };

  const handleExportPdf = () => {
    if (!protocol) return;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    let y = 44;
    const write = (txt: string, bold = false, size = 9.5) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(pdfSafe(txt), 515);
      for (const l of lines) {
        if (y > 790) {
          doc.addPage();
          y = 44;
        }
        doc.text(l, 40, y);
        y += size + 4;
      }
    };
    write(protocol.topicAnalysis.proposedTitle, true, 13);
    write(
      `Version ${protocol.versionNumber} (${protocol.status.toUpperCase()}) | Review Type: ${protocol.reviewMethodRecommendation.recommendedReviewType.toUpperCase()} | Framework: ${protocol.reviewMethodRecommendation.recommendedPrimaryFramework}`,
      false,
      8.5
    );
    write(
      `Conduct: ${protocol.reviewMethodRecommendation.methodologicalGuidance} | Reporting: ${protocol.reviewMethodRecommendation.reportingGuideline}`,
      false,
      8.5
    );
    y += 6;
    write('1. Rationale & Research Problem', true, 11);
    write(protocol.topicAnalysis.researchProblem);
    write(`Knowledge Gaps (${protocol.topicAnalysis.knowledgeGapVerifiedByEvidence ? 'Verified' : 'Provisional'}): ${protocol.topicAnalysis.knowledgeGaps}`);
    y += 5;
    write('2. General & Specific Objectives', true, 11);
    write(protocol.generalObjective);
    protocol.specificObjectives.forEach((so) => write(`${so.code}: ${so.statement} [RQs: ${so.mappedRqCodes.join(', ')}]`, false, 9));
    y += 5;
    write('3. Research Framework Components', true, 11);
    protocol.frameworkComponents.forEach((fc) =>
      write(`${fc.componentCode} (${fc.componentName}): ${fc.proposedContent} | Keywords: ${fc.keywords.join(', ')}`, false, 8.8)
    );
    y += 5;
    write('4. Research Questions & Extraction Mapping', true, 11);
    protocol.rqMappings.forEach((rq) =>
      write(`${rq.code}: ${rq.question} -> Variables: ${rq.requiredExtractionVariables.join(', ')} | Synthesis: ${rq.proposedSynthesisMethod}`, false, 8.8)
    );
    y += 5;
    write('5. Eligibility Criteria', true, 11);
    protocol.eligibilityMatrix.forEach((el) =>
      write(`${el.criterion}: IN [${el.inclusionRequirement}] | OUT [${el.exclusionRequirement}]`, false, 8.5)
    );
    y += 5;
    write('6. Database-Specific Search Strategies', true, 11);
    protocol.databaseSearchStrategies.forEach((s) =>
      write(`${s.databaseName} (${s.searchPlatform}): ${s.exactSearchString} [Hits: ${s.actualRetrievalCount ?? 'Pending execution'}]`, false, 8.2)
    );
    y += 5;
    write('7. Quality Appraisal Plan', true, 11);
    protocol.appraisalPlan.forEach((a) =>
      write(`${a.studyDesign}: ${a.recommendedInstrument} (${a.scoringApproach})`, false, 8.8)
    );
    y += 5;
    write('8. Synthesis & Meta-Analysis Feasibility', true, 11);
    write(`Feasibility: ${protocol.synthesisPlan.metaAnalysisFeasibility.toUpperCase()} - ${protocol.synthesisPlan.feasibilityRationale}`, false, 9);
    y += 5;
    write('9. Methodology Plan Overview (18 Sections)', true, 11);
    protocol.methodologySections.forEach((m) => write(`${m.title}: ${m.proposedContent}`, false, 8.3));
    y += 5;
    write('10. Version, Validation & Amendment Audit', true, 11);
    write(`Consistency Indicator: ${protocol.validationSummary.consistencyRatio}% | Amendments Logged: ${amendments.length} | Change Summary: ${protocol.changeSummary}`, false, 8.5);
    doc.save(`${slug}-protocol-v${protocol.versionNumber}.pdf`);
    notify('success', 'Exported Complete Protocol PDF.');
  };

  const handleExportExcel = () => {
    if (!protocol) return;
    const fwRows = protocol.frameworkComponents
      .map(
        (c) =>
          `<tr><td>${escapeHtml(c.componentCode)}</td><td>${escapeHtml(c.componentName)}</td><td>${escapeHtml(c.proposedContent)}</td><td>${escapeHtml(c.keywords.join(', '))}</td><td>${escapeHtml(c.synonyms.join(', '))}</td><td>${escapeHtml(c.correspondingRqCodes.join(', '))}</td></tr>`
      )
      .join('');
    const elRows = protocol.eligibilityMatrix
      .map(
        (e) =>
          `<tr><td>${escapeHtml(e.criterion)}</td><td>${escapeHtml(e.inclusionRequirement)}</td><td>${escapeHtml(e.exclusionRequirement)}</td><td>${escapeHtml(e.guidance)}</td><td>${escapeHtml(e.status)}</td></tr>`
      )
      .join('');
    const dbRows = protocol.databaseSearchStrategies
      .map(
        (s) =>
          `<tr><td>${escapeHtml(s.databaseName)}</td><td>${escapeHtml(s.searchPlatform)}</td><td>${escapeHtml(s.exactSearchString)}</td><td>${escapeHtml(s.publicationYearRestrictions)}</td><td>${s.actualRetrievalCount ?? 'Pending'}</td><td>${escapeHtml(s.executionDate || 'Pending')}</td></tr>`
      )
      .join('');
    const extRows = protocol.extractionPlan
      .map(
        (e) =>
          `<tr><td>${escapeHtml(e.rqCode)}</td><td>${escapeHtml(e.relatedObjective)}</td><td>${escapeHtml(e.variableName)}</td><td>${escapeHtml(e.definition)}</td><td>${escapeHtml(e.dataType)}</td><td>${escapeHtml(e.measurementUnits)}</td><td>${escapeHtml(e.proposedSynthesisApproach)}</td></tr>`
      )
      .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Calibri,sans-serif;}table{border-collapse:collapse;width:100%;margin-bottom:18px;}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;font-size:10pt;}th{background:#f1f5f9;}</style></head><body>
      <h2>Protocol Workbook: ${escapeHtml(protocol.topicAnalysis.proposedTitle)} (v${escapeHtml(protocol.versionNumber)})</h2>
      <h3>1. Research Framework Matrix</h3>
      <table><thead><tr><th>Code</th><th>Component</th><th>Proposed Scope</th><th>Keywords</th><th>Synonyms</th><th>RQs</th></tr></thead><tbody>${fwRows}</tbody></table>
      <h3>2. Eligibility Criteria Matrix</h3>
      <table><thead><tr><th>Criterion</th><th>Inclusion</th><th>Exclusion</th><th>Guidance</th><th>Status</th></tr></thead><tbody>${elRows}</tbody></table>
      <h3>3. Database Search Strings</h3>
      <table><thead><tr><th>Database</th><th>Platform</th><th>Search String</th><th>Years</th><th>Hits</th><th>Execution Date</th></tr></thead><tbody>${dbRows}</tbody></table>
      <h3>4. RQ-to-Extraction Plan Matrix</h3>
      <table><thead><tr><th>RQ</th><th>Objective</th><th>Variable</th><th>Definition</th><th>Type</th><th>Units</th><th>Synthesis</th></tr></thead><tbody>${extRows}</tbody></table>
    </body></html>`;
    triggerDownload(html, `${slug}-protocol-workbook-v${protocol.versionNumber}.xls`, 'application/vnd.ms-excel;charset=utf-8', 'Excel Protocol Workbook');
  };

  const handleExportExtractionCsv = () => {
    if (!protocol) return;
    const headers = ['RQ', 'Objective', 'Variable Name', 'Definition', 'Data Type', 'Units', 'Expected Source', 'Extraction Method', 'Synthesis Approach', 'Approved'];
    const rows = protocol.extractionPlan.map((e) => [
      csvCell(e.rqCode), csvCell(e.relatedObjective), csvCell(e.variableName), csvCell(e.definition),
      csvCell(e.dataType), csvCell(e.measurementUnits), csvCell(e.expectedEvidenceSource),
      csvCell(e.suggestedExtractionMethod), csvCell(e.proposedSynthesisApproach), csvCell(e.approved ? 'Yes' : 'No'),
    ]);
    triggerDownload('\uFEFF' + [headers.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\n'), `${slug}-extraction-framework.csv`, 'text/csv;charset=utf-8', 'Extraction Framework CSV');
  };

  const handleExportEligibilityCsv = () => {
    if (!protocol) return;
    const headers = ['Criterion', 'Inclusion Requirement', 'Exclusion Requirement', 'Guidance', 'Status'];
    const rows = protocol.eligibilityMatrix.map((e) => [
      csvCell(e.criterion), csvCell(e.inclusionRequirement), csvCell(e.exclusionRequirement), csvCell(e.guidance), csvCell(e.status),
    ]);
    triggerDownload('\uFEFF' + [headers.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\n'), `${slug}-eligibility-matrix.csv`, 'text/csv;charset=utf-8', 'Eligibility Matrix CSV');
  };

  const handleExportSearchStringsCsv = () => {
    if (!protocol) return;
    const headers = ['Database', 'Platform', 'Exact Search String', 'Search Fields', 'Years', 'Language', 'Execution Date', 'Actual Retrieval Hits', 'Status'];
    const rows = protocol.databaseSearchStrategies.map((s) => [
      csvCell(s.databaseName), csvCell(s.searchPlatform), csvCell(s.exactSearchString), csvCell(s.searchFields),
      csvCell(s.publicationYearRestrictions), csvCell(s.languageRestrictions), csvCell(s.executionDate),
      csvCell(s.actualRetrievalCount ?? ''), csvCell(s.verificationStatus),
    ]);
    triggerDownload('\uFEFF' + [headers.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\n'), `${slug}-database-search-strings.csv`, 'text/csv;charset=utf-8', 'Database Search Strings CSV');
  };

  const handleExportRqMatrixCsv = () => {
    if (!protocol) return;
    const headers = ['RQ Code', 'Research Question', 'Mapped Framework Components', 'Mapped Objectives', 'Required Extraction Variables', 'Evidence Type', 'Synthesis Method', 'Status'];
    const rows = protocol.rqMappings.map((r) => [
      csvCell(r.code), csvCell(r.question), csvCell(r.mappedFrameworkComponents.join('; ')),
      csvCell(r.mappedObjectives.join('; ')), csvCell(r.requiredExtractionVariables.join('; ')),
      csvCell(r.evidenceType), csvCell(r.proposedSynthesisMethod), csvCell(r.status),
    ]);
    triggerDownload('\uFEFF' + [headers.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\n'), `${slug}-rq-mapping-matrix.csv`, 'text/csv;charset=utf-8', 'RQ Mapping CSV');
  };

  const comparedSnapshot = useMemo(
    () => versions.find((v) => v.versionId === compareVersionId) || null,
    [versions, compareVersionId]
  );

  const currentStepMeta = STEPS.find((s) => s.step === activeStep) || STEPS[0];
  const isCurrentSectionLocked = Boolean(
    currentStepMeta.lockKey && protocol?.lockedSections?.includes(currentStepMeta.lockKey)
  );

  const addDatabaseStrategy = () => {
    if (!protocol) return;
    const tpl = DATABASE_TEMPLATES[newDbChoice] || {
      platform: `${newDbChoice} Scholarly Index`,
      fields: 'Title / Abstract / Keywords',
      sample: '("concept 1") AND ("concept 2")',
    };
    const nextItem: ProtocolDatabaseSearchStrategy = {
      id: `db-custom-${Date.now()}`,
      databaseName: newDbChoice,
      searchPlatform: tpl.platform,
      exactSearchString: tpl.sample,
      searchFields: tpl.fields,
      keywordsAndSynonyms: [],
      searchFilters: `Years: ${protocol.topicAnalysis.publicationYearEligibility}`,
      publicationYearRestrictions: protocol.topicAnalysis.publicationYearEligibility,
      languageRestrictions: 'English',
      executionDate: '',
      actualRetrievalCount: null,
      strategyVersion: '1.0',
      verificationStatus: 'draft',
      syntaxIssues: [],
      alternativeStrategy: '',
      executedByResearcher: false,
    };
    setProtocol({
      ...protocol,
      databaseSearchStrategies: [...protocol.databaseSearchStrategies, nextItem],
    });
  };

  return (
    <div className="space-y-5 pb-14">
      {/* Top Command Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
              <BookOpen className="w-4 h-4" />
              <span>16-Step Intelligent Systematic Review Protocol Builder</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {protocol?.topicAnalysis?.proposedTitle || project.title || 'New Systematic Review Protocol'}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
              <span className="font-mono font-semibold text-slate-900">
                v{protocol?.versionNumber || '1.0'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-indigo-700 capitalize">
                Status: {protocol?.status?.replace(/_/g, ' ') || 'not initialized'}
              </span>
              {protocol?.activatedVersion && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-emerald-700">
                    Active in Project (v{protocol.activatedVersion})
                  </span>
                </>
              )}
              {protocol?.validationSummary && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">
                    Consistency: {protocol.validationSummary.consistencyRatio}%
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleGenerate('all')}
              disabled={isGenerating || isLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {protocol ? 'Refine Full Protocol' : 'Generate Complete Protocol'}
            </button>
            {protocol && (
              <>
                <button
                  type="button"
                  onClick={() => handleSave(protocol.status === 'approved')}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {protocol.status === 'approved' ? 'Save Amendment' : 'Save & Validate'}
                </button>
                <button
                  type="button"
                  onClick={handleActivateInProject}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5" /> Activate in Project
                </button>
              </>
            )}
          </div>
        </div>

        {/* Topic Quick Input Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-3 border-t border-slate-100">
          <input
            type="text"
            value={topicPromptInput}
            onChange={(e) => setTopicPromptInput(e.target.value)}
            placeholder="Enter or refine your core research topic / title..."
            className="md:col-span-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
          />
          <input
            type="text"
            value={customAiInstruction}
            onChange={(e) => setCustomAiInstruction(e.target.value)}
            placeholder="Optional AI focus instruction (e.g., emphasize sensors & field trials)..."
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <ModuleWorkbenchControls
          project={project}
          moduleId="protocol_builder"
          moduleLabel="Intelligent Protocol Builder"
          autoSaveStatus={autoSaveStatus}
          compact
          onResetModule={onResetWorkbenchModule}
          onAddDataFiles={onDirectAddDataFiles}
          onOpenBulkImporter={onOpenBulkImporter}
          onRescanQueryQA={onRescanWithQueryQA}
          onDeleteQaEntry={onDeleteQaEntry}
        />
      </div>

      {banner && (
        <div
          className={`flex items-center justify-between gap-2 px-4 py-3 rounded-lg border text-xs font-medium ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span className="flex items-center gap-2">
            {banner.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {banner.text}
          </span>
          <button type="button" onClick={() => setBanner(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {protocol?.downstreamImpactWarning?.hasScreenedArticles && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 space-y-1.5">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <b>Downstream Safety Notice:</b> {protocol.downstreamImpactWarning.message}
            </span>
          </div>
          {protocol.downstreamImpactWarning.affectedRecords && protocol.downstreamImpactWarning.affectedRecords.length > 0 && (
            <div className="pl-6 text-[11px] text-amber-900">
              Potentially affected articles queued for researcher review:{' '}
              {protocol.downstreamImpactWarning.affectedRecords
                .slice(0, 4)
                .map((r) => `${r.title} (${r.reason})`)
                .join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* Main 16-Step Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Step Rail */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-3 h-fit space-y-1">
          <div className="text-[11px] font-bold text-slate-500 px-2 pb-1.5">
            Protocol Workflow (16 Steps)
          </div>
          {STEPS.map((s) => {
            const locked = Boolean(s.lockKey && protocol?.lockedSections?.includes(s.lockKey));
            const isActive = activeStep === s.step;
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => setActiveStep(s.step)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition ${
                  isActive
                    ? 'bg-indigo-700 text-white font-semibold'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="truncate whitespace-nowrap">
                  <span className="font-mono tabular-nums mr-1.5 opacity-75">{String(s.step).padStart(2, '0')}</span>
                  {s.shortTitle}
                </span>
                {locked && <Lock className="w-3 h-3 shrink-0 opacity-80" />}
              </button>
            );
          })}
        </div>

        {/* Right Active Step Panel */}
        <div className="lg:col-span-9 bg-white border border-slate-200 rounded-xl p-5 space-y-4 min-h-[540px]">
          {isLoading ? (
            <div className="py-16 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-700 mx-auto" />
              <p className="text-xs text-slate-500 mt-2">Loading protocol schema &amp; SQLite history...</p>
            </div>
          ) : !protocol ? (
            <div className="py-16 text-center space-y-3">
              <BookOpen className="w-8 h-8 text-indigo-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">Initialize Your 16-Step Systematic Review Protocol</h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Click <b>Generate Complete Protocol</b> above to analyze your research topic, recommend methodology, generate framework matrices, database search strings, and validation checks.
              </p>
            </div>
          ) : (
            <>
              {/* Step Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{currentStepMeta.fullTitle}</h3>
                  <p className="text-[11px] text-slate-500">
                    All edits remain non-destructive until approved &amp; activated in your project.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {currentStepMeta.lockKey && (
                    <button
                      type="button"
                      onClick={() => toggleSectionLock(currentStepMeta.lockKey)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap shrink-0 ${
                        isCurrentSectionLocked
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      {isCurrentSectionLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      {isCurrentSectionLocked ? 'Section Locked' : 'Lock Section'}
                    </button>
                  )}
                  {activeStep <= 13 && (
                    <button
                      type="button"
                      onClick={() => handleGenerate(activeStep)}
                      disabled={isGenerating || isCurrentSectionLocked}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Refine Step {activeStep}
                    </button>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={activeStep <= 1}
                      onClick={() => setActiveStep((s) => Math.max(1, s - 1))}
                      className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg disabled:opacity-40 whitespace-nowrap"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={activeStep >= 16}
                      onClick={() => setActiveStep((s) => Math.min(16, s + 1))}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg disabled:opacity-40 whitespace-nowrap"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>

              {/* STEP 1 & 2: TOPIC ANALYSIS */}
              {(activeStep === 1 || activeStep === 2) && (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span>
                      <b>Epistemic Distinction:</b> Knowledge gap statements prior to completed searching are labeled{' '}
                      <span className="font-semibold text-amber-800">
                        {protocol.topicAnalysis.knowledgeGapVerifiedByEvidence
                          ? 'Verified Against Evidence'
                          : 'Preliminary AI Suggestion (Pending Search Verification)'}
                      </span>
                    </span>
                    <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={protocol.topicAnalysis.knowledgeGapVerifiedByEvidence}
                        onChange={(e) =>
                          setProtocol({
                            ...protocol,
                            topicAnalysis: {
                              ...protocol.topicAnalysis,
                              knowledgeGapVerifiedByEvidence: e.target.checked,
                            },
                          })
                        }
                      />
                      Mark Knowledge Gap Verified
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {[
                      { k: 'proposedTitle', label: '1. Proposed Systematic Review Title', full: true },
                      { k: 'discipline', label: '2. Academic Discipline' },
                      { k: 'domain', label: '3. Research Domain' },
                      { k: 'subdomain', label: '4. Research Subdomain' },
                      { k: 'publicationYearEligibility', label: '9. Publication-Year Eligibility' },
                      { k: 'geographicEligibility', label: '8. Geographic Eligibility' },
                      { k: 'eligibleStudyDesigns', label: '10. Eligible Study Designs' },
                      { k: 'eligiblePublicationTypes', label: 'Eligible Publication Types' },
                      { k: 'targetPopulation', label: '11. Target Population / Problem' },
                      { k: 'interventionOrFocus', label: '12. Intervention / Exposure / Technology Focus' },
                      { k: 'comparisonBaseline', label: '13. Comparison / Baseline Conditions' },
                      { k: 'measurableOutcomes', label: '14. Outcomes & Measurable Indicators' },
                      { k: 'contextAndConstraints', label: '15. Context, Setting & Methodological Constraints', full: true },
                      { k: 'focusAndScope', label: '4b. Research Focus & Scope', textarea: true, full: true },
                      { k: 'theoreticalMotivation', label: '5. Theoretical & Conceptual Motivation', textarea: true, full: true },
                      { k: 'researchProblem', label: '6. Research Problem Statement', textarea: true, full: true },
                      { k: 'knowledgeGaps', label: '7. Knowledge Gaps & Research Justification', textarea: true, full: true },
                    ].map((f) => (
                      <div key={f.k} className={f.full ? 'md:col-span-2' : ''}>
                        <label className="block font-semibold text-slate-700 mb-1">{f.label}</label>
                        {f.textarea ? (
                          <textarea
                            rows={2}
                            value={(protocol.topicAnalysis as any)[f.k] || ''}
                            onChange={(e) =>
                              setProtocol({
                                ...protocol,
                                topicAnalysis: { ...protocol.topicAnalysis, [f.k]: e.target.value },
                              })
                            }
                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5"
                          />
                        ) : (
                          <input
                            type="text"
                            value={(protocol.topicAnalysis as any)[f.k] || ''}
                            onChange={(e) =>
                              setProtocol({
                                ...protocol,
                                topicAnalysis: { ...protocol.topicAnalysis, [f.k]: e.target.value },
                              })
                            }
                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 3: REVIEW TYPE & CONDUCT METHODOLOGY */}
              {activeStep === 3 && (
                <div className="space-y-4 text-xs">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-indigo-950">
                    <b>Methodological Separation Rule:</b> Reporting Guidelines (PRISMA 2020, PRISMA-ScR, PRISMA-S) govern transparent reporting,
                    Conduct Methodologies (Cochrane Handbook, JBI Manual, Campbell, Kitchenham) govern workflow rigor, and Quality Appraisal Tools
                    (RoB 2, ROBINS-I, JBI, CASP, MMAT, QUADAS-2) evaluate study bias independently.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Recommended Review Type</label>
                      <select
                        value={protocol.reviewMethodRecommendation.recommendedReviewType}
                        onChange={(e) =>
                          setProtocol({
                            ...protocol,
                            reviewMethodRecommendation: {
                              ...protocol.reviewMethodRecommendation,
                              recommendedReviewType: e.target.value as LiteratureReviewTypeId,
                            },
                          })
                        }
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white font-semibold"
                      >
                        {REVIEW_TYPE_DEFINITIONS.map((rt) => (
                          <option key={rt.id} value={rt.id}>
                            {rt.name} ({rt.reportingGuideline})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Primary Question Framework</label>
                      <div className="flex gap-2">
                        <select
                          value={protocol.reviewMethodRecommendation.recommendedPrimaryFramework}
                          onChange={(e) =>
                            setProtocol({
                              ...protocol,
                              reviewMethodRecommendation: {
                                ...protocol.reviewMethodRecommendation,
                                recommendedPrimaryFramework: e.target.value as ReviewFrameworkType,
                              },
                            })
                          }
                          className="flex-1 border border-slate-200 rounded-lg px-2.5 py-2 bg-white font-semibold"
                        >
                          {FRAMEWORK_DEFINITIONS.map((fw) => (
                            <option key={fw.id} value={fw.id}>
                              {fw.fullTitle}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => rebuildComponentsFromFramework(protocol.reviewMethodRecommendation.recommendedPrimaryFramework)}
                          className="px-3 py-1.5 border border-indigo-200 bg-indigo-50 text-indigo-800 rounded-lg font-semibold whitespace-nowrap shrink-0"
                        >
                          Sync Matrix
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Conduct Methodology Guidance</label>
                      <input
                        type="text"
                        value={protocol.reviewMethodRecommendation.methodologicalGuidance}
                        onChange={(e) =>
                          setProtocol({
                            ...protocol,
                            reviewMethodRecommendation: {
                              ...protocol.reviewMethodRecommendation,
                              methodologicalGuidance: e.target.value,
                            },
                          })
                        }
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Reporting Guideline Standard</label>
                      <input
                        type="text"
                        value={protocol.reviewMethodRecommendation.reportingGuideline}
                        onChange={(e) =>
                          setProtocol({
                            ...protocol,
                            reviewMethodRecommendation: {
                              ...protocol.reviewMethodRecommendation,
                              reportingGuideline: e.target.value,
                            },
                          })
                        }
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">Complementary Frameworks (Optional)</label>
                      <div className="flex flex-wrap gap-3">
                        {FRAMEWORK_DEFINITIONS.filter((f) => f.id !== protocol.reviewMethodRecommendation.recommendedPrimaryFramework).map((f) => {
                          const checked = protocol.reviewMethodRecommendation.complementaryFrameworks.includes(f.id);
                          return (
                            <label key={f.id} className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...protocol.reviewMethodRecommendation.complementaryFrameworks, f.id]
                                    : protocol.reviewMethodRecommendation.complementaryFrameworks.filter((x) => x !== f.id);
                                  setProtocol({
                                    ...protocol,
                                    reviewMethodRecommendation: {
                                      ...protocol.reviewMethodRecommendation,
                                      complementaryFrameworks: next,
                                    },
                                  });
                                }}
                              />
                              <span>{f.id}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">Methodological Justification</label>
                      <textarea
                        rows={2}
                        value={protocol.reviewMethodRecommendation.justification}
                        onChange={(e) =>
                          setProtocol({
                            ...protocol,
                            reviewMethodRecommendation: {
                              ...protocol.reviewMethodRecommendation,
                              justification: e.target.value,
                            },
                          })
                        }
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 mb-2">Compare Alternative Review Methodologies</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {protocol.reviewMethodRecommendation.alternatives.map((alt) => (
                        <div key={alt.reviewType} className="border border-slate-200 rounded-lg p-3 bg-slate-50 flex flex-col justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900">{alt.name}</div>
                            <div className="text-[11px] text-indigo-700 font-semibold">
                              {alt.methodologicalGuidance} · {alt.reportingGuideline}
                            </div>
                            <p className="text-[11px] text-slate-600 mt-1">{alt.suitabilitySummary}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setProtocol({
                                ...protocol,
                                reviewMethodRecommendation: {
                                  ...protocol.reviewMethodRecommendation,
                                  recommendedReviewType: alt.reviewType,
                                  methodologicalGuidance: alt.methodologicalGuidance,
                                  reportingGuideline: alt.reportingGuideline,
                                },
                              });
                              notify('success', `Applied ${alt.name} settings.`);
                            }}
                            className="self-start px-2.5 py-1 text-[11px] font-semibold border border-slate-300 bg-white rounded hover:bg-slate-100"
                          >
                            Apply This Alternative
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: RESEARCH FRAMEWORK MATRIX */}
              {activeStep === 4 && (
                <div className="space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-600">
                      Active Primary Framework: <b>{protocol.reviewMethodRecommendation.recommendedPrimaryFramework}</b>
                      {protocol.reviewMethodRecommendation.complementaryFrameworks.length > 0 &&
                        ` · Complementary: ${protocol.reviewMethodRecommendation.complementaryFrameworks.join(', ')}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setProtocol({
                          ...protocol,
                          frameworkComponents: [
                            ...protocol.frameworkComponents,
                            {
                              id: `fw-custom-${Date.now()}`,
                              frameworkId: protocol.reviewMethodRecommendation.recommendedPrimaryFramework,
                              componentCode: `C${protocol.frameworkComponents.length + 1}`,
                              componentName: 'Custom Framework Dimension',
                              definition: 'Researcher-defined supplementary boundary.',
                              proposedContent: '',
                              keywords: [],
                              synonyms: [],
                              inclusionImplications: '',
                              exclusionImplications: '',
                              correspondingRqCodes: ['RQ1'],
                              dataExtractionRequirements: [],
                              consistencyNotes: [],
                              status: 'pending',
                            },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-semibold"
                    >
                      <Plus className="w-3 h-3" /> Add Component
                    </button>
                  </div>
                  {protocol.frameworkComponents.map((comp, idx) => (
                    <div key={comp.id} className="border border-slate-200 rounded-lg p-3.5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-bold text-slate-900">
                          <span className="inline-block px-2 py-0.5 rounded bg-indigo-700 text-white font-mono mr-2">
                            {comp.componentCode}
                          </span>
                          {comp.componentName}
                          <span className="ml-2 font-normal text-slate-500">— {comp.definition}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={comp.status}
                            onChange={(e) => {
                              const next = [...protocol.frameworkComponents];
                              next[idx] = { ...comp, status: e.target.value as any };
                              setProtocol({ ...protocol, frameworkComponents: next });
                            }}
                            className="border border-slate-200 rounded px-2 py-0.5 text-[11px] bg-white"
                          >
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="locked">Locked</option>
                          </select>
                          {protocol.frameworkComponents.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setProtocol({
                                  ...protocol,
                                  frameworkComponents: protocol.frameworkComponents.filter((c) => c.id !== comp.id),
                                })
                              }
                              className="text-slate-400 hover:text-rose-600"
                              title="Remove component"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        value={comp.proposedContent}
                        onChange={(e) => {
                          const next = [...protocol.frameworkComponents];
                          next[idx] = { ...comp, proposedContent: e.target.value };
                          setProtocol({ ...protocol, frameworkComponents: next });
                        }}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5"
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Keywords (comma-separated)</label>
                          <input
                            type="text"
                            value={comp.keywords.join(', ')}
                            onChange={(e) => {
                              const next = [...protocol.frameworkComponents];
                              next[idx] = { ...comp, keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) };
                              setProtocol({ ...protocol, frameworkComponents: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Synonyms (comma-separated)</label>
                          <input
                            type="text"
                            value={comp.synonyms.join(', ')}
                            onChange={(e) => {
                              const next = [...protocol.frameworkComponents];
                              next[idx] = { ...comp, synonyms: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) };
                              setProtocol({ ...protocol, frameworkComponents: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Inclusion Implications</label>
                          <input
                            type="text"
                            value={comp.inclusionImplications}
                            onChange={(e) => {
                              const next = [...protocol.frameworkComponents];
                              next[idx] = { ...comp, inclusionImplications: e.target.value };
                              setProtocol({ ...protocol, frameworkComponents: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Exclusion Implications</label>
                          <input
                            type="text"
                            value={comp.exclusionImplications}
                            onChange={(e) => {
                              const next = [...protocol.frameworkComponents];
                              next[idx] = { ...comp, exclusionImplications: e.target.value };
                              setProtocol({ ...protocol, frameworkComponents: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Corresponding RQs (comma-separated)</label>
                          <input
                            type="text"
                            value={comp.correspondingRqCodes.join(', ')}
                            onChange={(e) => {
                              const next = [...protocol.frameworkComponents];
                              next[idx] = { ...comp, correspondingRqCodes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) };
                              setProtocol({ ...protocol, frameworkComponents: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Data Extraction Requirements</label>
                          <input
                            type="text"
                            value={comp.dataExtractionRequirements.join(', ')}
                            onChange={(e) => {
                              const next = [...protocol.frameworkComponents];
                              next[idx] = { ...comp, dataExtractionRequirements: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) };
                              setProtocol({ ...protocol, frameworkComponents: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* STEP 5 & 6: OBJECTIVES & RESEARCH QUESTIONS */}
              {(activeStep === 5 || activeStep === 6) && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">General Objective</label>
                    <textarea
                      rows={2}
                      value={protocol.generalObjective}
                      onChange={(e) => setProtocol({ ...protocol, generalObjective: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800">Specific Objectives ({protocol.specificObjectives.length})</h4>
                      <button
                        type="button"
                        onClick={() =>
                          setProtocol({
                            ...protocol,
                            specificObjectives: [
                              ...protocol.specificObjectives,
                              {
                                code: `SO${protocol.specificObjectives.length + 1}`,
                                statement: '',
                                mappedRqCodes: ['RQ1'],
                                status: 'pending',
                              },
                            ],
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded text-[11px] font-semibold"
                      >
                        <Plus className="w-3 h-3" /> Add Objective
                      </button>
                    </div>
                    {protocol.specificObjectives.map((so, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center border border-slate-200 rounded-lg p-2.5">
                        <input
                          type="text"
                          value={so.code}
                          onChange={(e) => {
                            const next = [...protocol.specificObjectives];
                            next[idx] = { ...so, code: e.target.value };
                            setProtocol({ ...protocol, specificObjectives: next });
                          }}
                          className="md:col-span-1 font-mono font-bold border border-slate-200 rounded px-2 py-1"
                        />
                        <input
                          type="text"
                          value={so.statement}
                          onChange={(e) => {
                            const next = [...protocol.specificObjectives];
                            next[idx] = { ...so, statement: e.target.value };
                            setProtocol({ ...protocol, specificObjectives: next });
                          }}
                          className="md:col-span-7 border border-slate-200 rounded px-2 py-1"
                        />
                        <input
                          type="text"
                          value={so.mappedRqCodes.join(', ')}
                          onChange={(e) => {
                            const next = [...protocol.specificObjectives];
                            next[idx] = {
                              ...so,
                              mappedRqCodes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                            };
                            setProtocol({ ...protocol, specificObjectives: next });
                          }}
                          placeholder="RQ1, RQ2"
                          className="md:col-span-3 font-mono border border-slate-200 rounded px-2 py-1"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setProtocol({
                              ...protocol,
                              specificObjectives: protocol.specificObjectives.filter((_, i) => i !== idx),
                            })
                          }
                          className="md:col-span-1 justify-self-end text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800">Research Questions Mapping Matrix ({protocol.rqMappings.length})</h4>
                      <button
                        type="button"
                        onClick={() =>
                          setProtocol({
                            ...protocol,
                            rqMappings: [
                              ...protocol.rqMappings,
                              {
                                code: `RQ${protocol.rqMappings.length + 1}`,
                                question: '',
                                mappedFrameworkComponents: ['P', 'I'],
                                mappedObjectives: ['SO1'],
                                searchConcepts: [],
                                eligibilityRequirements: '',
                                requiredExtractionVariables: [],
                                evidenceType: 'Empirical evidence',
                                proposedSynthesisMethod: 'Descriptive & narrative synthesis',
                                consistencyIssues: [],
                                status: 'pending',
                              },
                            ],
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[11px] font-semibold"
                      >
                        <Plus className="w-3 h-3" /> Add RQ
                      </button>
                    </div>
                    {protocol.rqMappings.map((rq, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={rq.code}
                            onChange={(e) => {
                              const next = [...protocol.rqMappings];
                              next[idx] = { ...rq, code: e.target.value };
                              setProtocol({ ...protocol, rqMappings: next });
                            }}
                            className="w-16 font-mono font-bold text-indigo-700 border border-slate-200 rounded px-2 py-1 bg-white"
                          />
                          <input
                            type="text"
                            value={rq.question}
                            onChange={(e) => {
                              const next = [...protocol.rqMappings];
                              next[idx] = { ...rq, question: e.target.value };
                              setProtocol({ ...protocol, rqMappings: next });
                            }}
                            className="flex-1 min-w-[240px] border border-slate-200 rounded px-2.5 py-1 bg-white font-medium"
                          />
                          <select
                            value={rq.status}
                            onChange={(e) => {
                              const next = [...protocol.rqMappings];
                              next[idx] = { ...rq, status: e.target.value as any };
                              setProtocol({ ...protocol, rqMappings: next });
                            }}
                            className="border border-slate-200 rounded px-2 py-1 bg-white text-[11px]"
                          >
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="locked">Locked</option>
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              setProtocol({
                                ...protocol,
                                rqMappings: protocol.rqMappings.filter((_, i) => i !== idx),
                              })
                            }
                            className="text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={rq.mappedFrameworkComponents.join(', ')}
                            onChange={(e) => {
                              const next = [...protocol.rqMappings];
                              next[idx] = { ...rq, mappedFrameworkComponents: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) };
                              setProtocol({ ...protocol, rqMappings: next });
                            }}
                            placeholder="Framework components (e.g., P, I, O)"
                            className="border border-slate-200 rounded px-2 py-1 bg-white font-mono"
                          />
                          <input
                            type="text"
                            value={rq.mappedObjectives.join(', ')}
                            onChange={(e) => {
                              const next = [...protocol.rqMappings];
                              next[idx] = { ...rq, mappedObjectives: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) };
                              setProtocol({ ...protocol, rqMappings: next });
                            }}
                            placeholder="Objectives (e.g., SO1)"
                            className="border border-slate-200 rounded px-2 py-1 bg-white font-mono"
                          />
                          <input
                            type="text"
                            value={rq.searchConcepts.join(', ')}
                            onChange={(e) => {
                              const next = [...protocol.rqMappings];
                              next[idx] = { ...rq, searchConcepts: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) };
                              setProtocol({ ...protocol, rqMappings: next });
                            }}
                            placeholder="Search concepts"
                            className="border border-slate-200 rounded px-2 py-1 bg-white"
                          />
                          <input
                            type="text"
                            value={rq.requiredExtractionVariables.join(', ')}
                            onChange={(e) => {
                              const next = [...protocol.rqMappings];
                              next[idx] = {
                                ...rq,
                                requiredExtractionVariables: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                              };
                              setProtocol({ ...protocol, rqMappings: next });
                            }}
                            placeholder="Required extraction variables"
                            className="border border-slate-200 rounded px-2 py-1 bg-white"
                          />
                          <input
                            type="text"
                            value={rq.evidenceType}
                            onChange={(e) => {
                              const next = [...protocol.rqMappings];
                              next[idx] = { ...rq, evidenceType: e.target.value };
                              setProtocol({ ...protocol, rqMappings: next });
                            }}
                            placeholder="Evidence type"
                            className="border border-slate-200 rounded px-2 py-1 bg-white"
                          />
                          <input
                            type="text"
                            value={rq.proposedSynthesisMethod}
                            onChange={(e) => {
                              const next = [...protocol.rqMappings];
                              next[idx] = { ...rq, proposedSynthesisMethod: e.target.value };
                              setProtocol({ ...protocol, rqMappings: next });
                            }}
                            placeholder="Synthesis method"
                            className="border border-slate-200 rounded px-2 py-1 bg-white"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 7: ELIGIBILITY CRITERIA */}
              {activeStep === 7 && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Standardized 10-Dimension Inclusion / Exclusion Eligibility Matrix</span>
                    <button
                      type="button"
                      onClick={() =>
                        setProtocol({
                          ...protocol,
                          eligibilityMatrix: [
                            ...protocol.eligibilityMatrix,
                            {
                              id: `el-custom-${Date.now()}`,
                              criterion: 'Custom Criterion',
                              inclusionRequirement: '',
                              exclusionRequirement: '',
                              guidance: '',
                              status: 'pending',
                            },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-semibold"
                    >
                      <Plus className="w-3 h-3" /> Add Criterion
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="py-2 px-2">Criterion</th>
                          <th className="py-2 px-2">Inclusion Requirement</th>
                          <th className="py-2 px-2">Exclusion Requirement</th>
                          <th className="py-2 px-2">Guidance &amp; Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {protocol.eligibilityMatrix.map((row, idx) => (
                          <tr key={row.id} className="border-b border-slate-100 align-top">
                            <td className="py-2 px-2 w-40">
                              <input
                                type="text"
                                value={row.criterion}
                                onChange={(e) => {
                                  const next = [...protocol.eligibilityMatrix];
                                  next[idx] = { ...row, criterion: e.target.value };
                                  setProtocol({ ...protocol, eligibilityMatrix: next });
                                }}
                                className="w-full border border-slate-200 rounded p-1 font-semibold"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <textarea
                                rows={2}
                                value={row.inclusionRequirement}
                                onChange={(e) => {
                                  const next = [...protocol.eligibilityMatrix];
                                  next[idx] = { ...row, inclusionRequirement: e.target.value };
                                  setProtocol({ ...protocol, eligibilityMatrix: next });
                                }}
                                className="w-full border border-slate-200 rounded p-1.5"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <textarea
                                rows={2}
                                value={row.exclusionRequirement}
                                onChange={(e) => {
                                  const next = [...protocol.eligibilityMatrix];
                                  next[idx] = { ...row, exclusionRequirement: e.target.value };
                                  setProtocol({ ...protocol, eligibilityMatrix: next });
                                }}
                                className="w-full border border-slate-200 rounded p-1.5"
                              />
                            </td>
                            <td className="py-2 px-2 w-48 space-y-1">
                              <input
                                type="text"
                                value={row.guidance}
                                onChange={(e) => {
                                  const next = [...protocol.eligibilityMatrix];
                                  next[idx] = { ...row, guidance: e.target.value };
                                  setProtocol({ ...protocol, eligibilityMatrix: next });
                                }}
                                placeholder="Reviewer guidance"
                                className="w-full border border-slate-200 rounded p-1 text-[11px]"
                              />
                              <div className="flex items-center gap-1">
                                <select
                                  value={row.status}
                                  onChange={(e) => {
                                    const next = [...protocol.eligibilityMatrix];
                                    next[idx] = { ...row, status: e.target.value as any };
                                    setProtocol({ ...protocol, eligibilityMatrix: next });
                                  }}
                                  className="flex-1 border border-slate-200 rounded p-1 text-[11px] bg-white"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="approved">Approved</option>
                                  <option value="locked">Locked</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setProtocol({
                                      ...protocol,
                                      eligibilityMatrix: protocol.eligibilityMatrix.filter((r) => r.id !== row.id),
                                    })
                                  }
                                  className="text-slate-400 hover:text-rose-600 p-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Standardized PRISMA Full-Text Exclusion Reasons (one per line)
                    </label>
                    <textarea
                      rows={5}
                      value={protocol.standardizedExclusionReasons.join('\n')}
                      onChange={(e) =>
                        setProtocol({
                          ...protocol,
                          standardizedExclusionReasons: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                        })
                      }
                      className="w-full border border-slate-200 rounded-lg p-2.5 font-mono"
                    />
                  </div>
                </div>
              )}

              {/* STEP 8: DATABASE SEARCH STRATEGIES */}
              {activeStep === 8 && (
                <div className="space-y-3 text-xs">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-slate-700">
                    <span>
                      <b>Integrity Rule:</b> Retrieval counts &amp; execution dates remain blank until you execute searches and log actual hits.
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        value={newDbChoice}
                        onChange={(e) => setNewDbChoice(e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1 bg-white font-semibold"
                      >
                        {Object.keys(DATABASE_TEMPLATES).map((db) => (
                          <option key={db} value={db}>{db}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={addDatabaseStrategy}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-700 text-white rounded font-semibold whitespace-nowrap"
                      >
                        <Plus className="w-3 h-3" /> Add Database
                      </button>
                      <button
                        type="button"
                        onClick={handleValidateOnly}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded font-semibold whitespace-nowrap"
                      >
                        <RefreshCw className="w-3 h-3" /> Validate Syntax
                      </button>
                    </div>
                  </div>
                  {protocol.databaseSearchStrategies.map((db, idx) => (
                    <div key={db.id} className="border border-slate-200 rounded-lg p-3.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-900">{db.databaseName}</span>{' '}
                          <span className="text-slate-500">({db.searchPlatform}) · {db.searchFields}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {db.alternativeStrategy && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...protocol.databaseSearchStrategies];
                                next[idx] = {
                                  ...db,
                                  exactSearchString: db.alternativeStrategy,
                                  alternativeStrategy: db.exactSearchString,
                                };
                                setProtocol({ ...protocol, databaseSearchStrategies: next });
                              }}
                              className="px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[11px] font-semibold"
                            >
                              Swap Alternative
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(db.exactSearchString);
                              setCopiedId(db.id);
                              setTimeout(() => setCopiedId(null), 1500);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-[11px] font-semibold"
                          >
                            {copiedId === db.id ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                            Copy
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setProtocol({
                                ...protocol,
                                databaseSearchStrategies: protocol.databaseSearchStrategies.filter((s) => s.id !== db.id),
                              })
                            }
                            className="text-slate-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        value={db.exactSearchString}
                        onChange={(e) => {
                          const next = [...protocol.databaseSearchStrategies];
                          next[idx] = { ...db, exactSearchString: e.target.value };
                          setProtocol({ ...protocol, databaseSearchStrategies: next });
                        }}
                        className="w-full border border-slate-200 rounded p-2 font-mono text-[11px]"
                      />
                      {db.syntaxIssues.length > 0 && (
                        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                          {db.syntaxIssues.join(' · ')}
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500">Execution Date</label>
                          <input
                            type="date"
                            value={db.executionDate}
                            onChange={(e) => {
                              const next = [...protocol.databaseSearchStrategies];
                              next[idx] = { ...db, executionDate: e.target.value, executedByResearcher: Boolean(e.target.value) };
                              setProtocol({ ...protocol, databaseSearchStrategies: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500">Actual Retrieval Hits</label>
                          <input
                            type="number"
                            min={0}
                            value={db.actualRetrievalCount ?? ''}
                            placeholder="Unexecuted"
                            onChange={(e) => {
                              const next = [...protocol.databaseSearchStrategies];
                              next[idx] = {
                                ...db,
                                actualRetrievalCount: e.target.value === '' ? null : Number(e.target.value),
                                executedByResearcher: e.target.value !== '',
                                verificationStatus: e.target.value !== '' ? 'verified_by_researcher' : db.verificationStatus,
                              };
                              setProtocol({ ...protocol, databaseSearchStrategies: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1 font-mono tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500">Year &amp; Language Limits</label>
                          <input
                            type="text"
                            value={`${db.publicationYearRestrictions} · ${db.languageRestrictions}`}
                            onChange={(e) => {
                              const [yr, lang] = e.target.value.split('·').map((x) => x.trim());
                              const next = [...protocol.databaseSearchStrategies];
                              next[idx] = { ...db, publicationYearRestrictions: yr || '', languageRestrictions: lang || 'English' };
                              setProtocol({ ...protocol, databaseSearchStrategies: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500">Search Filters</label>
                          <input
                            type="text"
                            value={db.searchFilters}
                            onChange={(e) => {
                              const next = [...protocol.databaseSearchStrategies];
                              next[idx] = { ...db, searchFilters: e.target.value };
                              setProtocol({ ...protocol, databaseSearchStrategies: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* STEP 9: 18-SECTION METHODOLOGY PLAN */}
              {activeStep === 9 && (
                <div className="space-y-3 text-xs max-h-[620px] overflow-y-auto pr-1">
                  {protocol.methodologySections.map((sec, idx) => (
                    <div key={sec.key} className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">{sec.title}</span>
                        <div className="flex items-center gap-2">
                          <select
                            value={sec.completionStatus}
                            onChange={(e) => {
                              const next = [...protocol.methodologySections];
                              next[idx] = { ...sec, completionStatus: e.target.value as any };
                              setProtocol({ ...protocol, methodologySections: next });
                            }}
                            className="border border-slate-200 rounded px-2 py-0.5 text-[11px] bg-white"
                          >
                            <option value="draft">Draft</option>
                            <option value="complete">Complete</option>
                          </select>
                          <select
                            value={sec.approvalStatus}
                            onChange={(e) => {
                              const next = [...protocol.methodologySections];
                              next[idx] = { ...sec, approvalStatus: e.target.value as any };
                              setProtocol({ ...protocol, methodologySections: next });
                            }}
                            className="border border-slate-200 rounded px-2 py-0.5 text-[11px] bg-white"
                          >
                            <option value="pending">Pending Review</option>
                            <option value="approved">Approved</option>
                            <option value="locked">Locked</option>
                          </select>
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        value={sec.proposedContent}
                        onChange={(e) => {
                          const next = [...protocol.methodologySections];
                          next[idx] = { ...sec, proposedContent: e.target.value };
                          setProtocol({ ...protocol, methodologySections: next });
                        }}
                        className="w-full border border-slate-200 rounded p-2"
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <label className="font-semibold text-slate-600">Methodological Justification</label>
                          <input
                            type="text"
                            value={sec.methodologicalJustification}
                            onChange={(e) => {
                              const next = [...protocol.methodologySections];
                              next[idx] = { ...sec, methodologicalJustification: e.target.value };
                              setProtocol({ ...protocol, methodologySections: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1 mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-600">Required Researcher Decisions (semicolon-separated)</label>
                          <input
                            type="text"
                            value={sec.requiredResearcherDecisions.join('; ')}
                            onChange={(e) => {
                              const next = [...protocol.methodologySections];
                              next[idx] = {
                                ...sec,
                                requiredResearcherDecisions: e.target.value.split(';').map((s) => s.trim()).filter(Boolean),
                              };
                              setProtocol({ ...protocol, methodologySections: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1 mt-0.5"
                          />
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        <b>Verified References:</b> {sec.supportingReferences.join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* STEP 10: EXTRACTION VARIABLE PLAN */}
              {activeStep === 10 && (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-600">
                      Extraction variables sync into your Evidence Extraction Matrix upon protocol activation without dropping existing study data.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setProtocol({
                          ...protocol,
                          extractionPlan: [
                            ...protocol.extractionPlan,
                            {
                              id: `ext-${Date.now()}`,
                              rqCode: 'RQ1',
                              relatedObjective: 'SO1',
                              variableName: 'New Extracted Variable',
                              definition: '',
                              dataType: 'text',
                              measurementUnits: '',
                              expectedEvidenceSource: 'Methods / Results',
                              suggestedExtractionMethod: 'Structured dual coding',
                              proposedSynthesisApproach: 'Descriptive summary',
                              approved: false,
                            },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-semibold"
                    >
                      <Plus className="w-3 h-3" /> Add Variable
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="py-2 px-2">RQ / Obj</th>
                          <th className="py-2 px-2">Variable &amp; Definition</th>
                          <th className="py-2 px-2">Type &amp; Units</th>
                          <th className="py-2 px-2">Source &amp; Synthesis</th>
                          <th className="py-2 px-2 text-right">Appr / Del</th>
                        </tr>
                      </thead>
                      <tbody>
                        {protocol.extractionPlan.map((v, idx) => (
                          <tr key={v.id} className="border-b border-slate-100 align-top">
                            <td className="py-2 px-2 w-24 space-y-1">
                              <input
                                type="text"
                                value={v.rqCode}
                                onChange={(e) => {
                                  const next = [...protocol.extractionPlan];
                                  next[idx] = { ...v, rqCode: e.target.value };
                                  setProtocol({ ...protocol, extractionPlan: next });
                                }}
                                className="w-full border border-slate-200 rounded px-1.5 py-1 font-mono font-bold text-indigo-700"
                              />
                              <input
                                type="text"
                                value={v.relatedObjective}
                                onChange={(e) => {
                                  const next = [...protocol.extractionPlan];
                                  next[idx] = { ...v, relatedObjective: e.target.value };
                                  setProtocol({ ...protocol, extractionPlan: next });
                                }}
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 font-mono text-[11px]"
                              />
                            </td>
                            <td className="py-2 px-2 space-y-1">
                              <input
                                type="text"
                                value={v.variableName}
                                onChange={(e) => {
                                  const next = [...protocol.extractionPlan];
                                  next[idx] = { ...v, variableName: e.target.value };
                                  setProtocol({ ...protocol, extractionPlan: next });
                                }}
                                className="w-full border border-slate-200 rounded px-2 py-1 font-semibold"
                              />
                              <input
                                type="text"
                                value={v.definition}
                                placeholder="Operational definition..."
                                onChange={(e) => {
                                  const next = [...protocol.extractionPlan];
                                  next[idx] = { ...v, definition: e.target.value };
                                  setProtocol({ ...protocol, extractionPlan: next });
                                }}
                                className="w-full border border-slate-200 rounded px-2 py-0.5 text-[11px]"
                              />
                            </td>
                            <td className="py-2 px-2 w-36 space-y-1">
                              <select
                                value={v.dataType}
                                onChange={(e) => {
                                  const next = [...protocol.extractionPlan];
                                  next[idx] = { ...v, dataType: e.target.value as any };
                                  setProtocol({ ...protocol, extractionPlan: next });
                                }}
                                className="w-full border border-slate-200 rounded px-1.5 py-1 bg-white font-mono text-[11px]"
                              >
                                <option value="categorical">categorical</option>
                                <option value="numeric">numeric</option>
                                <option value="continuous">continuous</option>
                                <option value="binary">binary</option>
                                <option value="text">text</option>
                                <option value="date">date</option>
                              </select>
                              <input
                                type="text"
                                value={v.measurementUnits}
                                placeholder="Units"
                                onChange={(e) => {
                                  const next = [...protocol.extractionPlan];
                                  next[idx] = { ...v, measurementUnits: e.target.value };
                                  setProtocol({ ...protocol, extractionPlan: next });
                                }}
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-[11px]"
                              />
                            </td>
                            <td className="py-2 px-2 space-y-1">
                              <input
                                type="text"
                                value={v.expectedEvidenceSource}
                                placeholder="Source section"
                                onChange={(e) => {
                                  const next = [...protocol.extractionPlan];
                                  next[idx] = { ...v, expectedEvidenceSource: e.target.value };
                                  setProtocol({ ...protocol, extractionPlan: next });
                                }}
                                className="w-full border border-slate-200 rounded px-2 py-0.5 text-[11px]"
                              />
                              <input
                                type="text"
                                value={v.proposedSynthesisApproach}
                                placeholder="Synthesis approach"
                                onChange={(e) => {
                                  const next = [...protocol.extractionPlan];
                                  next[idx] = { ...v, proposedSynthesisApproach: e.target.value };
                                  setProtocol({ ...protocol, extractionPlan: next });
                                }}
                                className="w-full border border-slate-200 rounded px-2 py-1"
                              />
                            </td>
                            <td className="py-2 px-2 text-right whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={v.approved}
                                title="Mark variable approved"
                                onChange={(e) => {
                                  const next = [...protocol.extractionPlan];
                                  next[idx] = { ...v, approved: e.target.checked };
                                  setProtocol({ ...protocol, extractionPlan: next });
                                }}
                                className="mr-2"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setProtocol({
                                    ...protocol,
                                    extractionPlan: protocol.extractionPlan.filter((x) => x.id !== v.id),
                                  })
                                }
                                className="text-slate-400 hover:text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5 inline" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* STEP 11: QUALITY APPRAISAL PLAN */}
              {activeStep === 11 && (
                <div className="space-y-3 text-xs">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-slate-700">
                    <span>
                      <b>Protocol Planning vs Completed Appraisal:</b> Map design-specific tools here; individual study bias scores remain separate in the Appraisal Worksheet.
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setProtocol({
                          ...protocol,
                          appraisalPlan: [
                            ...protocol.appraisalPlan,
                            {
                              id: `app-custom-${Date.now()}`,
                              studyDesign: 'Custom Study Design',
                              recommendedInstrument: 'JBI Checklist',
                              appraisalDomains: ['Sampling', 'Measurement', 'Analysis'],
                              assessmentCriteria: ['Transparent baseline reporting'],
                              scoringApproach: 'Yes / No / Unclear',
                              verificationStatus: 'planned',
                              methodologicalJustification: '',
                            },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-semibold"
                    >
                      <Plus className="w-3 h-3" /> Add Design Tool
                    </button>
                  </div>
                  {protocol.appraisalPlan.map((item, idx) => (
                    <div key={item.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <label className="block font-semibold text-slate-600 mb-1">Study Design Category</label>
                          <input
                            type="text"
                            value={item.studyDesign}
                            onChange={(e) => {
                              const next = [...protocol.appraisalPlan];
                              next[idx] = { ...item, studyDesign: e.target.value };
                              setProtocol({ ...protocol, appraisalPlan: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1 font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-600 mb-1">Recommended Instrument</label>
                          <input
                            type="text"
                            value={item.recommendedInstrument}
                            onChange={(e) => {
                              const next = [...protocol.appraisalPlan];
                              next[idx] = { ...item, recommendedInstrument: e.target.value };
                              setProtocol({ ...protocol, appraisalPlan: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1 font-bold text-indigo-800"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <label className="block font-semibold text-slate-600 mb-1">Verification</label>
                            <select
                              value={item.verificationStatus}
                              onChange={(e) => {
                                const next = [...protocol.appraisalPlan];
                                next[idx] = { ...item, verificationStatus: e.target.value as any };
                                setProtocol({ ...protocol, appraisalPlan: next });
                              }}
                              className="w-full border border-slate-200 rounded px-2 py-1 bg-white"
                            >
                              <option value="planned">Planned (Protocol)</option>
                              <option value="verified_by_researcher">Verified by Researcher</option>
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setProtocol({
                                ...protocol,
                                appraisalPlan: protocol.appraisalPlan.filter((x) => x.id !== item.id),
                              })
                            }
                            className="text-slate-400 hover:text-rose-600 p-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500">Appraisal Domains</label>
                          <input
                            type="text"
                            value={item.appraisalDomains.join(', ')}
                            onChange={(e) => {
                              const next = [...protocol.appraisalPlan];
                              next[idx] = { ...item, appraisalDomains: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) };
                              setProtocol({ ...protocol, appraisalPlan: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500">Scoring Approach</label>
                          <input
                            type="text"
                            value={item.scoringApproach}
                            onChange={(e) => {
                              const next = [...protocol.appraisalPlan];
                              next[idx] = { ...item, scoringApproach: e.target.value };
                              setProtocol({ ...protocol, appraisalPlan: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500">Methodological Justification</label>
                          <input
                            type="text"
                            value={item.methodologicalJustification}
                            onChange={(e) => {
                              const next = [...protocol.appraisalPlan];
                              next[idx] = { ...item, methodologicalJustification: e.target.value };
                              setProtocol({ ...protocol, appraisalPlan: next });
                            }}
                            className="w-full border border-slate-200 rounded px-2 py-1"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* STEP 12 & 13: SYNTHESIS & META-ANALYSIS FEASIBILITY */}
              {(activeStep === 12 || activeStep === 13) && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">Qualitative Synthesis Methods (one per line)</label>
                      <textarea
                        rows={4}
                        value={protocol.synthesisPlan.qualitativeMethods.join('\n')}
                        onChange={(e) =>
                          setProtocol({
                            ...protocol,
                            synthesisPlan: {
                              ...protocol.synthesisPlan,
                              qualitativeMethods: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                            },
                          })
                        }
                        className="w-full border border-slate-200 rounded-lg p-2"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">Quantitative Synthesis Methods (one per line)</label>
                      <textarea
                        rows={4}
                        value={protocol.synthesisPlan.quantitativeMethods.join('\n')}
                        onChange={(e) =>
                          setProtocol({
                            ...protocol,
                            synthesisPlan: {
                              ...protocol.synthesisPlan,
                              quantitativeMethods: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                            },
                          })
                        }
                        className="w-full border border-slate-200 rounded-lg p-2"
                      />
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg p-3.5 space-y-3 bg-slate-50/70">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-bold text-slate-900">Meta-Analysis Feasibility Assessment Guard</h4>
                      <select
                        value={protocol.synthesisPlan.metaAnalysisFeasibility}
                        onChange={(e) =>
                          setProtocol({
                            ...protocol,
                            synthesisPlan: {
                              ...protocol.synthesisPlan,
                              metaAnalysisFeasibility: e.target.value as any,
                            },
                          })
                        }
                        className="border border-slate-300 rounded px-2.5 py-1 bg-white font-bold"
                      >
                        <option value="feasible">Feasible (Verified Compatible Metrics &amp; Variance)</option>
                        <option value="conditional">Conditional (Assess Post-Extraction)</option>
                        <option value="not_feasible">Not Feasible (Use SWiM / Descriptive Synthesis)</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {Object.entries(protocol.synthesisPlan.feasibilityChecks).map(([k, val]) => (
                        <div key={k}>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">{k}</label>
                          <input
                            type="text"
                            value={val}
                            onChange={(e) =>
                              setProtocol({
                                ...protocol,
                                synthesisPlan: {
                                  ...protocol.synthesisPlan,
                                  feasibilityChecks: {
                                    ...protocol.synthesisPlan.feasibilityChecks,
                                    [k]: e.target.value,
                                  },
                                },
                              })
                            }
                            className="w-full border border-slate-200 rounded px-2 py-1 bg-white"
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Feasibility Rationale &amp; Alternative Synthesis Plan</label>
                      <textarea
                        rows={2}
                        value={protocol.synthesisPlan.feasibilityRationale}
                        onChange={(e) =>
                          setProtocol({
                            ...protocol,
                            synthesisPlan: {
                              ...protocol.synthesisPlan,
                              feasibilityRationale: e.target.value,
                            },
                          })
                        }
                        className="w-full border border-slate-200 rounded px-2 py-1 bg-white"
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={protocol.synthesisPlan.approvedByResearcher}
                        onChange={(e) =>
                          setProtocol({
                            ...protocol,
                            synthesisPlan: {
                              ...protocol.synthesisPlan,
                              approvedByResearcher: e.target.checked,
                            },
                          })
                        }
                      />
                      Researcher confirms synthesis plan &amp; pooling guardrails
                    </label>
                  </div>
                </div>
              )}

              {/* STEP 14: VALIDATION & PRISMA CHECKLIST */}
              {activeStep === 14 && (
                <div className="space-y-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div>
                      <div className="font-bold text-slate-900 tabular-nums">
                        Status: {protocol.validationSummary.status.toUpperCase()} · Consistency Indicator: {protocol.validationSummary.consistencyRatio}%
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">{protocol.validationSummary.disclaimer}</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleValidateOnly}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-700 text-white rounded-lg font-semibold whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Re-Run Validation Checks
                    </button>
                  </div>

                  {protocol.validationIssues.length === 0 ? (
                    <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
                      All automated cross-section alignment checks passed with zero unresolved issues.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {protocol.validationIssues.map((iss, idx) => (
                        <div key={iss.issueId} className="border border-slate-200 rounded-lg p-3 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-slate-900">
                              <span className="font-mono text-[11px] text-slate-500 mr-1.5">{iss.issueId}</span>
                              [{iss.severity.toUpperCase()}] {iss.description}
                            </span>
                            <select
                              value={iss.researcherDecision}
                              onChange={(e) => {
                                const next = [...protocol.validationIssues];
                                const dec = e.target.value as any;
                                next[idx] = {
                                  ...iss,
                                  researcherDecision: dec,
                                  resolutionStatus: dec === 'accepted' ? 'passed' : iss.resolutionStatus,
                                };
                                setProtocol({ ...protocol, validationIssues: next });
                              }}
                              className="border border-slate-300 rounded px-2 py-0.5 bg-white text-[11px]"
                            >
                              <option value="pending">Pending</option>
                              <option value="accepted">Resolved / Accepted</option>
                              <option value="overridden">Researcher Overridden</option>
                              <option value="deferred">Deferred</option>
                            </select>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            <b>Section:</b> {iss.affectedSection} · <b>Explanation:</b> {iss.explanation}
                          </p>
                          <p className="text-[11px] text-indigo-700">
                            <b>Recommended:</b> {iss.recommendedCorrection} · <b>Impact:</b> {iss.potentialImpact}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100">
                    <h4 className="font-bold text-slate-800 mb-2">PRISMA 2020 / PRISMA-S Protocol Checklist</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {protocol.prismaChecklist.map((item, idx) => (
                        <div key={item.id} className="border border-slate-200 rounded-lg p-2.5 space-y-1">
                          <div className="flex items-center justify-between gap-2 font-bold text-slate-800">
                            <span>{item.standard} #{item.itemNumber}: {item.section}</span>
                            <select
                              value={item.status}
                              onChange={(e) => {
                                const next = [...protocol.prismaChecklist];
                                next[idx] = { ...item, status: e.target.value as any };
                                setProtocol({ ...protocol, prismaChecklist: next });
                              }}
                              className="border border-slate-200 rounded px-1.5 py-0.5 text-[10px] bg-white"
                            >
                              <option value="complete">COMPLETE</option>
                              <option value="partial">PARTIAL</option>
                              <option value="missing">MISSING</option>
                            </select>
                          </div>
                          <p className="text-[11px] text-slate-600">{item.requirement}</p>
                          {item.warningNote && <p className="text-[11px] text-amber-700">{item.warningNote}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 15: VERSIONING, APPROVAL, AMENDMENTS & DIFF */}
              {activeStep === 15 && (
                <div className="space-y-4 text-xs">
                  {protocol.status !== 'approved' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
                      <span className="font-semibold text-slate-700">Protocol Workflow Status</span>
                      <select
                        value={protocol.status}
                        onChange={(e) => setProtocol({ ...protocol, status: e.target.value as any })}
                        className="border border-slate-300 rounded px-2.5 py-1 bg-white font-semibold"
                      >
                        <option value="draft">Draft</option>
                        <option value="under_review">Under Review</option>
                        <option value="needs_revision">Needs Revision</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-4 space-y-2.5">
                      <h4 className="font-bold text-emerald-950">Approve &amp; Lock Protocol Snapshot</h4>
                      <input
                        type="text"
                        value={approveSummary}
                        onChange={(e) => setApproveSummary(e.target.value)}
                        placeholder="Approval change summary..."
                        className="w-full border border-emerald-200 rounded px-2.5 py-1.5 bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleApproveAndLock}
                        disabled={isSaving}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 text-white rounded-lg font-bold hover:bg-emerald-800 whitespace-nowrap"
                      >
                        <ShieldCheck className="w-4 h-4" /> Approve &amp; Lock v{protocol.versionNumber}
                      </button>
                    </div>

                    <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-4 space-y-2">
                      <h4 className="font-bold text-amber-950">Log Formal Protocol Amendment</h4>
                      <input
                        type="text"
                        value={amendSection}
                        onChange={(e) => setAmendSection(e.target.value)}
                        placeholder="Modified Section (e.g., Search Strategy)"
                        className="w-full border border-amber-200 rounded px-2.5 py-1.5 bg-white"
                      />
                      <input
                        type="text"
                        value={amendReason}
                        onChange={(e) => setAmendReason(e.target.value)}
                        placeholder="Amendment rationale..."
                        className="w-full border border-amber-200 rounded px-2.5 py-1.5 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleSave(true)}
                        disabled={!amendReason.trim() || isSaving}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-700 text-white rounded-lg font-bold hover:bg-amber-800 disabled:opacity-50"
                      >
                        Save Minor Amendment &amp; Bump Version
                      </button>
                    </div>
                  </div>

                  {/* Version History & Field-by-Field Diff */}
                  <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                    <h4 className="font-bold text-slate-900">Version Snapshots ({versions.length})</h4>
                    {versions.length === 0 ? (
                      <p className="text-slate-500">No locked snapshots yet. Approve v1.0 above to create the first immutable baseline.</p>
                    ) : (
                      <div className="space-y-2">
                        {versions.map((v) => (
                          <div key={v.versionId} className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded p-2.5">
                            <div>
                              <span className="font-mono font-bold text-slate-900">v{v.versionNumber}</span>{' '}
                              <span className="text-[11px] font-semibold text-indigo-700 capitalize">({v.status})</span> · {v.changeSummary}
                              <div className="text-[11px] text-slate-500 font-mono tabular-nums">{v.createdAt} · by {v.author}</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setCompareVersionId(compareVersionId === v.versionId ? '' : v.versionId)}
                                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-semibold"
                              >
                                {compareVersionId === v.versionId ? 'Hide Diff' : 'Compare Field-by-Field'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRestoreVersion(v.versionId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-semibold"
                              >
                                <RotateCcw className="w-3 h-3" /> Restore Draft
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {comparedSnapshot && (
                      <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-900 text-white px-3 py-2 text-xs font-bold">
                          Field-by-Field Comparison: Snapshot v{comparedSnapshot.versionNumber} vs Current v{protocol.versionNumber}
                        </div>
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200">
                              <th className="py-1.5 px-2.5">Protocol Dimension</th>
                              <th className="py-1.5 px-2.5">Snapshot v{comparedSnapshot.versionNumber}</th>
                              <th className="py-1.5 px-2.5">Current v{protocol.versionNumber}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              ['Title', comparedSnapshot.protocolData.topicAnalysis?.proposedTitle, protocol.topicAnalysis.proposedTitle],
                              ['Review Type / Framework', `${comparedSnapshot.protocolData.reviewMethodRecommendation?.recommendedReviewType} / ${comparedSnapshot.protocolData.reviewMethodRecommendation?.recommendedPrimaryFramework}`, `${protocol.reviewMethodRecommendation.recommendedReviewType} / ${protocol.reviewMethodRecommendation.recommendedPrimaryFramework}`],
                              ['General Objective', comparedSnapshot.protocolData.generalObjective, protocol.generalObjective],
                              ['Specific Objectives / RQs', `${(comparedSnapshot.protocolData.specificObjectives || []).length} SOs / ${(comparedSnapshot.protocolData.rqMappings || []).length} RQs`, `${protocol.specificObjectives.length} SOs / ${protocol.rqMappings.length} RQs`],
                              ['Eligibility / Search / Variables', `${(comparedSnapshot.protocolData.eligibilityMatrix || []).length} rules / ${(comparedSnapshot.protocolData.databaseSearchStrategies || []).length} DBs / ${(comparedSnapshot.protocolData.extractionPlan || []).length} vars`, `${protocol.eligibilityMatrix.length} rules / ${protocol.databaseSearchStrategies.length} DBs / ${protocol.extractionPlan.length} vars`],
                              ['Meta-Analysis Feasibility', comparedSnapshot.protocolData.synthesisPlan?.metaAnalysisFeasibility, protocol.synthesisPlan.metaAnalysisFeasibility],
                            ].map(([label, oldVal, newVal]) => {
                              const changed = String(oldVal || '') !== String(newVal || '');
                              return (
                                <tr key={label} className={`border-b border-slate-100 ${changed ? 'bg-amber-50/70' : ''}`}>
                                  <td className="py-1.5 px-2.5 font-semibold">{label}</td>
                                  <td className="py-1.5 px-2.5 text-slate-600">{oldVal || '—'}</td>
                                  <td className="py-1.5 px-2.5 text-slate-900 font-medium">{newVal || '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {amendments.length > 0 && (
                    <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                      <h4 className="font-bold text-slate-900">Recorded Amendments ({amendments.length})</h4>
                      {amendments.map((a) => (
                        <div key={a.id} className="bg-slate-50 border border-slate-200 rounded p-2">
                          <span className="font-mono font-bold">v{a.versionNumber}</span> · <b>{a.modifiedSection}</b>: {a.reason}
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                            {a.modifiedAt} · Approval: {a.approvalStatus} · Potentially affected articles: {a.affectedArticleCount ?? 0}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 16: ACTIVATE & EXPORT SUITE */}
              {activeStep === 16 && (
                <div className="space-y-4 text-xs">
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-teal-950">Activate Protocol Across ResearchMate AI</h4>
                      <p className="text-xs text-teal-800 mt-0.5">
                        Syncs your approved PICOC/framework criteria, RQs, exclusion reasons, extraction schema, and primary Boolean search into the active project without altering prior screening decisions.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleActivateInProject}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-700 text-white rounded-lg font-bold hover:bg-teal-800 whitespace-nowrap shrink-0"
                    >
                      <Play className="w-4 h-4" /> Activate Protocol v{protocol.versionNumber}
                    </button>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-800 mb-2">Complete 18-Section Protocol Exports</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <button
                        type="button"
                        onClick={handleExportWord}
                        className="flex flex-col items-center gap-1.5 p-3 border border-indigo-200 bg-indigo-50/50 rounded-xl hover:bg-indigo-100 font-semibold text-indigo-900"
                      >
                        <FileText className="w-5 h-5" /> Word (.doc)
                      </button>
                      <button
                        type="button"
                        onClick={handleExportPdf}
                        className="flex flex-col items-center gap-1.5 p-3 border border-rose-200 bg-rose-50/50 rounded-xl hover:bg-rose-100 font-semibold text-rose-900"
                      >
                        <FileDown className="w-5 h-5" /> Full PDF (.pdf)
                      </button>
                      <button
                        type="button"
                        onClick={handleExportExcel}
                        className="flex flex-col items-center gap-1.5 p-3 border border-emerald-200 bg-emerald-50/50 rounded-xl hover:bg-emerald-100 font-semibold text-emerald-900"
                      >
                        <FileSpreadsheet className="w-5 h-5" /> Multi-Table Excel
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          triggerDownload(
                            JSON.stringify({ protocol, versions, amendments }, null, 2),
                            `${slug}-protocol-v${protocol.versionNumber}.json`,
                            'application/json',
                            'Protocol JSON'
                          )
                        }
                        className="flex flex-col items-center gap-1.5 p-3 border border-slate-200 bg-slate-50 rounded-xl hover:bg-slate-100 font-semibold text-slate-900"
                      >
                        <FileCode className="w-5 h-5" /> JSON Archive
                      </button>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-800 mb-2">Separate Matrix &amp; Strategy Exports (CSV)</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <button
                        type="button"
                        onClick={handleExportEligibilityCsv}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 font-semibold text-slate-800"
                      >
                        <Download className="w-4 h-4" /> Eligibility Matrix CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleExportSearchStringsCsv}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 font-semibold text-slate-800"
                      >
                        <Download className="w-4 h-4" /> Search Strings CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleExportRqMatrixCsv}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 font-semibold text-slate-800"
                      >
                        <Download className="w-4 h-4" /> RQ Mapping CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleExportExtractionCsv}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 font-semibold text-slate-800"
                      >
                        <Download className="w-4 h-4" /> Extraction Plan CSV
                      </button>
                    </div>
                  </div>

                  {onNavigateToModule && (
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                      <span className="font-semibold text-slate-600 self-center">Jump to Connected Modules:</span>
                      {[
                        { id: 'screening', label: 'Screening Workbench' },
                        { id: 'extraction', label: 'Evidence Extraction Matrix' },
                        { id: 'appraisal', label: 'Appraisal Worksheet' },
                        { id: 'prisma', label: 'PRISMA 2020 Flow' },
                        { id: 'quant_synthesis', label: 'Quantitative Synthesis & Meta-Analysis' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onNavigateToModule(m.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {m.label} <ArrowRight className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
