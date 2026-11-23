import fs from 'fs';
import path from 'path';
import {
  Article,
  ReviewProject,
  ScreeningConsistencyReport,
  ScreeningDecision,
  ScreeningDecisionRecord,
  ScreeningRunRecord,
  ScreeningStageType,
  WorkbenchState,
} from '../types';
import {
  applyManualScreeningDecision,
  articleToScreeningDecisionRecord,
  computeProtocolCriteriaDescriptor,
  DeterministicEvalOutput,
  executeDeterministicBatchScreening,
  investigateScreeningDiscrepancies,
  reconcileScreeningLedger,
  sortArticlesDeterministically,
} from '../utils/deterministicScreeningEngine';

// Per-project async queue mutex to guarantee serialized, race-free concurrent execution
const projectLocks = new Map<string, Promise<void>>();

export async function withProjectScreeningLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const prev = projectLocks.get(projectId) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => next);
  projectLocks.set(projectId, chained);

  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (projectLocks.get(projectId) === chained) {
      projectLocks.delete(projectId);
    }
  }
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeJsonAtomicSync(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function safeReadJsonSync<T = any>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw || !raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function resolveSafeSubpath(rootDir: string, ...segments: string[]): string | null {
  const resolvedRoot = path.resolve(rootDir);
  const candidate = path.resolve(resolvedRoot, ...segments);
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return candidate;
}

export function getScreeningDir(folderPath: string): string {
  return path.resolve(folderPath, 'screening');
}

function getLedgerPath(folderPath: string): string {
  return resolveSafeSubpath(folderPath, 'screening', 'decisions_ledger.json')!;
}

function getRunsPath(folderPath: string): string {
  return resolveSafeSubpath(folderPath, 'screening', 'screening_runs.json')!;
}

function getCheckpointPath(folderPath: string): string {
  return resolveSafeSubpath(folderPath, 'screening', 'active_checkpoint.json')!;
}

export function createPreScreeningBackupIfNeeded(
  folderPath: string,
  projectId: string,
  reason = 'Pre-deterministic-screening safety snapshot'
): string | null {
  try {
    const backupDir = resolveSafeSubpath(folderPath, 'backups');
    if (!backupDir) return null;
    ensureDir(backupDir);

    const existingBackups = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('screening_backup_') && f.endsWith('.json'));

    // Avoid spamming backups within 5 minutes unless forced
    if (existingBackups.length > 0) {
      const latestFile = existingBackups.sort().reverse()[0];
      const stat = fs.statSync(path.join(backupDir, latestFile));
      if (Date.now() - stat.mtimeMs < 5 * 60 * 1000) {
        return path.join(backupDir, latestFile);
      }
    }

    const articles = safeReadJsonSync<Article[]>(path.join(folderPath, 'articles.json')) || [];
    const workbench = safeReadJsonSync<WorkbenchState>(path.join(folderPath, 'workbench_state.json')) || {};
    const projectMeta = safeReadJsonSync<Record<string, any>>(path.join(folderPath, 'project.json')) || {};
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = resolveSafeSubpath(backupDir, `screening_backup_${stamp}.json`);
    if (!outPath) return null;

    writeJsonAtomicSync(outPath, {
      projectId,
      createdAt: new Date().toISOString(),
      reason,
      articleCount: articles.length,
      projectMeta,
      workbenchState: workbench,
      articles,
    });
    return outPath;
  } catch {
    return null;
  }
}

function loadProjectBundle(folderPath: string, fallbackProjectId: string): {
  project: ReviewProject;
  articles: Article[];
  workbenchState: WorkbenchState;
  runs: ScreeningRunRecord[];
  ledger: ScreeningDecisionRecord[];
} {
  const meta = safeReadJsonSync<Record<string, any>>(path.join(folderPath, 'project.json')) || {};
  const articles = safeReadJsonSync<Article[]>(path.join(folderPath, 'articles.json')) || [];
  const workbenchState = safeReadJsonSync<WorkbenchState>(path.join(folderPath, 'workbench_state.json')) || {};
  const persistedRuns = safeReadJsonSync<ScreeningRunRecord[]>(getRunsPath(folderPath));
  const runs = Array.isArray(persistedRuns)
    ? persistedRuns
    : Array.isArray(workbenchState?.batchScreener?.runs)
    ? workbenchState.batchScreener!.runs!
    : [];

  const project: ReviewProject = {
    id: meta.id || fallbackProjectId,
    title: meta.title || 'Untitled Review',
    subtitle: meta.subtitle || '',
    scope: meta.scope || '',
    discipline: meta.discipline || '',
    publicationYears: meta.publicationYears || '',
    articleTypes: meta.articleTypes || '',
    geographicEligibility: meta.geographicEligibility || '',
    geographicTargetScale: meta.geographicTargetScale || 'any',
    geographicSelections: meta.geographicSelections,
    studyAreaBoundary: meta.studyAreaBoundary,
    methodologyFocus: meta.methodologyFocus || '',
    frameworkType: meta.frameworkType,
    frameworkFields: meta.frameworkFields,
    reviewType: meta.reviewType,
    protocolStandard: meta.protocolStandard,
    picoc: meta.picoc || { population: '', intervention: '', comparison: '', outcome: '', context: '' },
    researchQuestions: Array.isArray(meta.researchQuestions) ? meta.researchQuestions : [],
    inclusionCriteria: Array.isArray(meta.inclusionCriteria) ? meta.inclusionCriteria : [],
    standardExclusionReasons: Array.isArray(meta.standardExclusionReasons) ? meta.standardExclusionReasons : [],
    uncertainCasesGuidance: meta.uncertainCasesGuidance || '',
    booleanQuery: meta.booleanQuery || '',
    booleanDatabaseQueries: meta.booleanDatabaseQueries,
    protocolSchemaVersion: meta.protocolSchemaVersion,
    protocolUpdatedAt: meta.protocolUpdatedAt,
    articles,
    workbenchState: {
      ...workbenchState,
      batchScreener: {
        ...(workbenchState.batchScreener || {}),
        runs,
      },
    },
  };

  const persistedLedger = safeReadJsonSync<ScreeningDecisionRecord[]>(getLedgerPath(folderPath));
  const ledger = upsertLedgerFromArticles(articles, project, persistedLedger || []);

  return { project, articles, workbenchState, runs, ledger };
}

export function upsertLedgerFromArticles(
  articles: Article[],
  project: ReviewProject,
  existingLedger: ScreeningDecisionRecord[] = []
): ScreeningDecisionRecord[] {
  // Key uniquely by record_id to enforce zero duplicate screening decision rows per unique study
  const byKey = new Map<string, ScreeningDecisionRecord>();
  for (const row of existingLedger) {
    if (row?.record_id) {
      byKey.set(row.record_id, row);
    }
  }
  const sorted = sortArticlesDeterministically(articles);
  for (const art of sorted) {
    if (!art?.id) continue;
    const prev = byKey.get(art.id);
    const nextRec = articleToScreeningDecisionRecord(art, project);
    if (prev && prev.decision_history.length > nextRec.decision_history.length) {
      nextRec.decision_history = prev.decision_history;
    }
    byKey.set(art.id, nextRec);
  }
  // Remove stale rows for articles that no longer exist in articles.json
  const activeIds = new Set(sorted.map((a) => a.id));
  return Array.from(byKey.values())
    .filter((r) => activeIds.has(r.record_id))
    .sort((a, b) => a.record_id.localeCompare(b.record_id));
}

function persistProjectScreeningBundle(params: {
  folderPath: string;
  project: ReviewProject;
  articles: Article[];
  workbenchState: WorkbenchState;
  runs: ScreeningRunRecord[];
  consistencyReport: ScreeningConsistencyReport;
  lastStatsOverride?: {
    processed: number;
    total: number;
    included: number;
    excluded: number;
    uncertain: number;
    speed: number;
    elapsedSeconds: number;
  };
}) {
  const { folderPath, project, articles, workbenchState, runs, consistencyReport, lastStatsOverride } = params;
  const nowIso = new Date().toISOString();
  ensureDir(getScreeningDir(folderPath));

  const nextLedger = upsertLedgerFromArticles(articles, project, safeReadJsonSync<ScreeningDecisionRecord[]>(getLedgerPath(folderPath)) || []);
  writeJsonAtomicSync(path.join(folderPath, 'articles.json'), articles);
  writeJsonAtomicSync(getLedgerPath(folderPath), nextLedger);
  writeJsonAtomicSync(getRunsPath(folderPath), runs.slice(0, 40));

  const counts = consistencyReport.authoritativeCounts;
  const syncedStats = lastStatsOverride || {
    processed: counts.screenedRecords,
    total: counts.uniqueRecords,
    included: counts.includedStudies,
    excluded: counts.excludedAtTitleAbstract + counts.excludedAtFullText + counts.reportsNotRetrieved,
    uncertain: counts.uncertainRecords,
    speed: workbenchState.batchScreener?.lastStats?.speed || 0,
    elapsedSeconds: workbenchState.batchScreener?.lastStats?.elapsedSeconds || 0,
  };

  const nextWs: WorkbenchState = {
    ...workbenchState,
    lastAutoSavedAt: nowIso,
    lastSavedModule: 'batch_screener',
    batchScreener: {
      ...(workbenchState.batchScreener || {}),
      lastStats: syncedStats,
      lastRunAt: runs[0]?.completedAt || runs[0]?.timestamp || workbenchState.batchScreener?.lastRunAt || nowIso,
      runs: runs.slice(0, 40),
      activeCriteriaHash: consistencyReport.criteriaHash,
      activeProtocolVersion: consistencyReport.protocolVersion,
      lastConsistencyStatus: consistencyReport.consistencyStatus,
      lastSyncAt: nowIso,
    },
  };
  writeJsonAtomicSync(path.join(folderPath, 'workbench_state.json'), nextWs);

  return { nextLedger, nextWs };
}

export function getScreeningStateForFolder(folderPath: string, projectId: string): {
  ledger: ScreeningDecisionRecord[];
  runs: ScreeningRunRecord[];
  consistencyReport: ScreeningConsistencyReport;
  interruptedCheckpoint: { runId: string; processedIds: string[]; mode: string; timestamp: string } | null;
} {
  const { project, runs, ledger } = loadProjectBundle(folderPath, projectId);
  const consistencyReport = investigateScreeningDiscrepancies(project, runs);
  const interruptedCheckpoint = safeReadJsonSync<any>(getCheckpointPath(folderPath));
  return {
    ledger,
    runs,
    consistencyReport,
    interruptedCheckpoint: interruptedCheckpoint && interruptedCheckpoint.status === 'interrupted' ? interruptedCheckpoint : null,
  };
}

export async function runServerBatchScreening(params: {
  folderPath: string;
  projectId: string;
  mode: 'incremental' | 'rescreen';
  targetStage?: ScreeningStageType;
  batchSize?: number;
  confirmReplaceDecisions?: boolean;
  preserveManualOverrides?: boolean;
  simulateInterruptAfter?: number;
  evaluator: (article: Article, project: ReviewProject) => DeterministicEvalOutput;
  mergeInsights?: (existing: Article['extractedData'], res: DeterministicEvalOutput) => Article['extractedData'];
}): Promise<{
  requiresConfirmation: boolean;
  proposedReevaluations: any[];
  articles: Article[];
  runs: ScreeningRunRecord[];
  runRecord: ScreeningRunRecord;
  ledger: ScreeningDecisionRecord[];
  workbenchState: WorkbenchState;
  consistencyReport: ScreeningConsistencyReport;
}> {
  return withProjectScreeningLock(params.projectId, async () => {
    const { folderPath, projectId, mode } = params;
    createPreScreeningBackupIfNeeded(folderPath, projectId, `Pre-${mode} batch screening`);
    const { project, articles, workbenchState, runs } = loadProjectBundle(folderPath, projectId);
    const proto = computeProtocolCriteriaDescriptor(project);

    // Handle simulated or prior interrupted run checkpoint cleanly
    if (params.simulateInterruptAfter && params.simulateInterruptAfter > 0) {
      const sorted = sortArticlesDeterministically(articles);
      const partialSlice = sorted.slice(0, params.simulateInterruptAfter);
      const remainingSlice = sorted.slice(params.simulateInterruptAfter);

      const partialResult = await executeDeterministicBatchScreening({
        articles: partialSlice,
        project,
        mode,
        targetStage: params.targetStage || 'final_included',
        batchSize: params.batchSize || 64,
        confirmReplaceDecisions: true,
        preserveManualOverrides: params.preserveManualOverrides ?? true,
        evaluator: params.evaluator,
        mergeInsights: params.mergeInsights,
      });

      const mergedPartialArticles = [...partialResult.updatedArticles, ...remainingSlice];
      const interruptedRun: ScreeningRunRecord = {
        ...partialResult.runRecord,
        status: 'interrupted',
        processingErrors: ['Simulated interruption during batch checkpoint'],
      };
      const nextRuns = [interruptedRun, ...runs.filter((r) => r.runId !== interruptedRun.runId)];
      const nextProj: ReviewProject = { ...project, articles: mergedPartialArticles };
      const consistencyReport = investigateScreeningDiscrepancies(nextProj, nextRuns);

      writeJsonAtomicSync(getCheckpointPath(folderPath), {
        runId: interruptedRun.runId,
        mode,
        status: 'interrupted',
        timestamp: interruptedRun.timestamp,
        processedIds: partialSlice.map((a) => a.id),
      });

      const { nextLedger, nextWs } = persistProjectScreeningBundle({
        folderPath,
        project: nextProj,
        articles: mergedPartialArticles,
        workbenchState,
        runs: nextRuns,
        consistencyReport,
      });

      return {
        requiresConfirmation: false,
        proposedReevaluations: [],
        articles: mergedPartialArticles,
        runs: nextRuns,
        runRecord: interruptedRun,
        ledger: nextLedger,
        workbenchState: nextWs,
        consistencyReport,
      };
    }

    const result = await executeDeterministicBatchScreening({
      articles,
      project,
      mode,
      targetStage: params.targetStage || 'final_included',
      batchSize: params.batchSize || 150,
      confirmReplaceDecisions: params.confirmReplaceDecisions,
      preserveManualOverrides: params.preserveManualOverrides ?? true,
      evaluator: params.evaluator,
      mergeInsights: params.mergeInsights,
    });

    if (result.requiresConfirmation) {
      const report = investigateScreeningDiscrepancies(project, runs);
      return {
        requiresConfirmation: true,
        proposedReevaluations: result.proposedReevaluations,
        articles,
        runs,
        runRecord: result.runRecord,
        ledger: upsertLedgerFromArticles(articles, project),
        workbenchState,
        consistencyReport: report,
      };
    }

    // Clear any stale interrupted checkpoint upon clean completion
    const checkpointFile = getCheckpointPath(folderPath);
    if (fs.existsSync(checkpointFile)) {
      try {
        fs.unlinkSync(checkpointFile);
      } catch {}
    }

    const nextRuns = [result.runRecord, ...runs.filter((r) => r.runId !== result.runRecord.runId)];
    const nextProj: ReviewProject = { ...project, articles: result.updatedArticles };
    const consistencyReport = investigateScreeningDiscrepancies(nextProj, nextRuns);
    const counts = consistencyReport.authoritativeCounts;

    const syncedStats = {
      processed: counts.screenedRecords,
      total: counts.uniqueRecords,
      included: counts.includedStudies,
      excluded: counts.excludedAtTitleAbstract + counts.excludedAtFullText + counts.reportsNotRetrieved,
      uncertain: counts.uncertainRecords,
      speed: result.runRecord.elapsedSeconds && result.runRecord.elapsedSeconds > 0
        ? Math.round(result.runRecord.totalRecordsProcessed / result.runRecord.elapsedSeconds)
        : result.runRecord.totalRecordsProcessed,
      elapsedSeconds: result.runRecord.elapsedSeconds || 0.1,
    };

    const { nextLedger, nextWs } = persistProjectScreeningBundle({
      folderPath,
      project: nextProj,
      articles: result.updatedArticles,
      workbenchState: {
        ...workbenchState,
        batchScreener: {
          ...(workbenchState.batchScreener || {}),
          activeCriteriaHash: proto.criteriaHash,
          activeProtocolVersion: proto.protocolVersion,
        },
      },
      runs: nextRuns,
      consistencyReport,
      lastStatsOverride: syncedStats,
    });

    return {
      requiresConfirmation: false,
      proposedReevaluations: [],
      articles: result.updatedArticles,
      runs: nextRuns,
      runRecord: result.runRecord,
      ledger: nextLedger,
      workbenchState: nextWs,
      consistencyReport,
    };
  });
}

export async function saveServerManualScreeningDecision(params: {
  folderPath: string;
  projectId: string;
  articleId: string;
  decision: ScreeningDecision;
  screeningStage?: ScreeningStageType;
  reason?: string;
  reviewerNotes?: string;
  clearManualOverride?: boolean;
}): Promise<{
  article: Article | null;
  articles: Article[];
  ledger: ScreeningDecisionRecord[];
  workbenchState: WorkbenchState;
  consistencyReport: ScreeningConsistencyReport;
}> {
  return withProjectScreeningLock(params.projectId, async () => {
    const { folderPath, projectId, articleId } = params;
    const { project, articles, workbenchState, runs } = loadProjectBundle(folderPath, projectId);
    let updatedTarget: Article | null = null;

    const nextArticles = articles.map((art) => {
      if (art.id !== articleId) return art;
      updatedTarget = applyManualScreeningDecision(art, project, {
        decision: params.decision,
        screeningStage: params.screeningStage,
        reason: params.reason,
        reviewerNotes: params.reviewerNotes,
        clearManualOverride: params.clearManualOverride,
      });
      return updatedTarget;
    });

    const nextProj: ReviewProject = { ...project, articles: nextArticles };
    const consistencyReport = investigateScreeningDiscrepancies(nextProj, runs);
    const { nextLedger, nextWs } = persistProjectScreeningBundle({
      folderPath,
      project: nextProj,
      articles: nextArticles,
      workbenchState,
      runs,
      consistencyReport,
    });

    return {
      article: updatedTarget,
      articles: nextArticles,
      ledger: nextLedger,
      workbenchState: nextWs,
      consistencyReport,
    };
  });
}

export async function reconcileServerScreening(params: {
  folderPath: string;
  projectId: string;
  clearModifiedFlagsOnly?: boolean;
}): Promise<{
  fixedCount: number;
  articles: Article[];
  runs: ScreeningRunRecord[];
  ledger: ScreeningDecisionRecord[];
  workbenchState: WorkbenchState;
  consistencyReport: ScreeningConsistencyReport;
}> {
  return withProjectScreeningLock(params.projectId, async () => {
    const { folderPath, projectId } = params;
    createPreScreeningBackupIfNeeded(folderPath, projectId, 'Pre-PRISMA screening ledger reconciliation');
    const { project, workbenchState, runs } = loadProjectBundle(folderPath, projectId);
    const { updatedArticles, fixedCount } = reconcileScreeningLedger(project, {
      clearModifiedFlagsOnly: params.clearModifiedFlagsOnly,
    });

    // Clear any interrupted checkpoint flags on runs when reconciling
    const cleanedRuns = runs.map((r) =>
      r.status === 'interrupted' || r.status === 'running' ? { ...r, status: 'completed' as const } : r
    );
    const checkpointFile = getCheckpointPath(folderPath);
    if (fs.existsSync(checkpointFile)) {
      try {
        fs.unlinkSync(checkpointFile);
      } catch {}
    }

    const nextProj: ReviewProject = { ...project, articles: updatedArticles };
    const consistencyReport = investigateScreeningDiscrepancies(nextProj, cleanedRuns);

    const { nextLedger, nextWs } = persistProjectScreeningBundle({
      folderPath,
      project: nextProj,
      articles: updatedArticles,
      workbenchState,
      runs: cleanedRuns,
      consistencyReport,
    });

    return {
      fixedCount,
      articles: updatedArticles,
      runs: cleanedRuns,
      ledger: nextLedger,
      workbenchState: nextWs,
      consistencyReport,
    };
  });
}
