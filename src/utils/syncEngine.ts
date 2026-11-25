import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Article, ReviewIterationEntry, ReviewProject, WorkbenchState } from '../types';
import {
  loadProtocolVaultMap,
  mergeProtocolSnapshotsPreservingData,
  saveAllProjectProtocolsToVault,
} from './protocolVault';

export type SyncStatus = 'Synced' | 'Synchronizing' | 'Offline' | 'Sync Failed';

export interface OfflineSyncOperation {
  opId: string;
  projectId: string;
  opType: 'screen_decision' | 'update_project' | 'update_extraction';
  summary: string;
  timestamp: string;
  device: 'web' | 'android';
}

export interface WorkspaceUiState {
  currentProjectId?: string;
  currentTab?: string;
  selectedArticleId?: string;
  deviceMode?: 'desktop' | 'mobile';
  updatedAt?: string;
}

const QUEUE_KEY = 'researchmate_offline_sync_queue_v1';
const VERSIONS_KEY = 'researchmate_project_versions_v1';
const CACHE_KEY = 'researchmate_offline_projects_v1';
const WORKSPACE_UI_KEY = 'researchmate_workspace_ui_v1';
const DELETED_TOMBSTONES_KEY = 'researchmate_deleted_article_ids_v1';

interface ProjectDeletionTombstones {
  deletedIds: Record<string, string>;
  clearedAllAt?: string;
}

function loadAllDeletionTombstones(): Record<string, ProjectDeletionTombstones> {
  try {
    const raw = localStorage.getItem(DELETED_TOMBSTONES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAllDeletionTombstones(map: Record<string, ProjectDeletionTombstones>) {
  try {
    localStorage.setItem(DELETED_TOMBSTONES_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function recordDeletedArticleIds(
  projectId: string,
  options: {
    articleIds?: string[];
    clearAll?: boolean;
    deletedAt?: string;
  }
) {
  if (!projectId) return;
  const nowIso = options.deletedAt || new Date().toISOString();
  const map = loadAllDeletionTombstones();
  const current: ProjectDeletionTombstones = map[projectId] || { deletedIds: {} };

  if (options.clearAll) {
    current.clearedAllAt = nowIso;
  }
  for (const id of options.articleIds || []) {
    if (id) current.deletedIds[id] = nowIso;
  }

  // Cap per-project tombstones to latest 5,000 entries to prevent storage bloat
  const entries = Object.entries(current.deletedIds);
  if (entries.length > 5000) {
    entries.sort((a, b) => new Date(a[1]).getTime() - new Date(b[1]).getTime());
    current.deletedIds = Object.fromEntries(entries.slice(-5000));
  }

  map[projectId] = current;
  saveAllDeletionTombstones(map);
}

export function clearProjectDeletionTombstones(projectId: string) {
  if (!projectId) return;
  const map = loadAllDeletionTombstones();
  if (map[projectId]) {
    delete map[projectId];
    saveAllDeletionTombstones(map);
  }
}

export function filterOutDeletedArticles(
  projectId: string,
  articles: Article[],
  snapshotUpdatedAt?: string
): Article[] {
  const list = Array.isArray(articles) ? articles : [];
  const map = loadAllDeletionTombstones();
  const tomb = map[projectId];
  if (!tomb) return list;

  const clearedMs = tomb.clearedAllAt ? new Date(tomb.clearedAllAt).getTime() : 0;
  const snapshotMs = snapshotUpdatedAt ? new Date(snapshotUpdatedAt).getTime() : 0;
  // If entire snapshot predates clearAll, no legacy article from it may survive
  if (clearedMs > 0 && snapshotMs > 0 && snapshotMs <= clearedMs) {
    return list.filter((art) => {
      const impMs = art?.importedAt
        ? new Date(art.importedAt).getTime()
        : art?.retrievedAt
        ? new Date(art.retrievedAt).getTime()
        : 0;
      return impMs > clearedMs && !tomb.deletedIds[art.id];
    });
  }

  return list.filter((art) => {
    if (!art?.id) return false;
    if (tomb.deletedIds[art.id]) return false;
    if (clearedMs > 0) {
      const impMs = art.importedAt
        ? new Date(art.importedAt).getTime()
        : art.retrievedAt
        ? new Date(art.retrievedAt).getTime()
        : 0;
      if (impMs > 0 && impMs <= clearedMs) return false;
    }
    return true;
  });
}

export function loadWorkspaceUiState(): WorkspaceUiState {
  try {
    const raw = localStorage.getItem(WORKSPACE_UI_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveWorkspaceUiState(state: WorkspaceUiState) {
  try {
    localStorage.setItem(
      WORKSPACE_UI_KEY,
      JSON.stringify({
        ...loadWorkspaceUiState(),
        ...state,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadOfflineQueue(): OfflineSyncOperation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(ops: OfflineSyncOperation[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops.slice(-200)));
  } catch {
    // Ignore storage quota errors
  }
}

export function enqueueOfflineSyncOp(
  projectId: string,
  opType: OfflineSyncOperation['opType'],
  summary: string,
  device: 'web' | 'android' = 'web'
): OfflineSyncOperation[] {
  const op: OfflineSyncOperation = {
    opId: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    opType,
    summary,
    timestamp: new Date().toISOString(),
    device,
  };
  const next = [...loadOfflineQueue(), op];
  saveOfflineQueue(next);
  return next;
}

export function getProjectVersions(): Record<string, number> {
  try {
    const raw = localStorage.getItem(VERSIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setProjectVersion(projectId: string, version: number) {
  try {
    const map = getProjectVersions();
    map[projectId] = version;
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(map));
  } catch {}
}

export function cacheProjectsOffline(projects: ReviewProject[]) {
  saveAllProjectProtocolsToVault(projects);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(projects));
  } catch {
    // Fallback if heavy fullText PDFs exceed browser 5MB localStorage quota: keep full protocol + lightweight articles
    try {
      const compact = projects.map((p) => ({
        ...p,
        articles: (p.articles || []).map(({ fullText: _ft, pages: _pg, ...rest }) => rest),
      }));
      localStorage.setItem(CACHE_KEY, JSON.stringify(compact));
    } catch {
      // Never leave an outdated stale 256+ article snapshot sitting in localStorage after deletions/updates
      try {
        localStorage.removeItem(CACHE_KEY);
        const shells = projects.map((p) => ({
          ...p,
          articles: [],
        }));
        localStorage.setItem(CACHE_KEY, JSON.stringify(shells));
      } catch {
        try {
          localStorage.removeItem(CACHE_KEY);
        } catch {}
      }
    }
  }
}

export function loadCachedOfflineProjects(): ReviewProject[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function countNonEmptyValues(obj?: Record<string, any> | null): number {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.values(obj).filter((v) => v !== undefined && v !== null && v !== '').length;
}

function mergeReviewIterations(
  a?: ReviewIterationEntry[],
  b?: ReviewIterationEntry[]
): ReviewIterationEntry[] | undefined {
  const combined = [...(a || []), ...(b || [])];
  if (combined.length === 0) return undefined;
  const byId = new Map<string, ReviewIterationEntry>();
  for (const entry of combined) {
    if (!entry || !entry.id) continue;
    byId.set(entry.id, entry);
  }
  return Array.from(byId.values())
    .sort((x, y) => new Date(x.timestamp || 0).getTime() - new Date(y.timestamp || 0).getTime())
    .map((entry, idx) => ({ ...entry, iterationNumber: idx + 1 }));
}

export function mergeArticleRecordsPreservingData(primary: Article, secondary: Article): Article {
  const pIterTime = primary.lastReviewedIterationAt
    ? new Date(primary.lastReviewedIterationAt).getTime()
    : 0;
  const sIterTime = secondary.lastReviewedIterationAt
    ? new Date(secondary.lastReviewedIterationAt).getTime()
    : 0;

  // Prefer whichever version has an explicit processed decision or newer iteration timestamp
  const primaryProcessed = primary.decision && primary.decision !== 'unscreened';
  const secondaryProcessed = secondary.decision && secondary.decision !== 'unscreened';
  const preferSecondaryDecision =
    sIterTime > pIterTime || (!primaryProcessed && secondaryProcessed);

  const citationMap = new Map<string, any>();
  for (const c of [...(secondary.evidenceCitations || []), ...(primary.evidenceCitations || [])]) {
    if (c?.id) citationMap.set(c.id, c);
  }

  const pExtractedCount = countNonEmptyValues(primary.extractedData as any);
  const sExtractedCount = countNonEmptyValues(secondary.extractedData as any);
  const mergedExtracted =
    sExtractedCount > pExtractedCount
      ? { ...(primary.extractedData || {}), ...(secondary.extractedData || {}) }
      : { ...(secondary.extractedData || {}), ...(primary.extractedData || {}) };

  const mergedAppraisal =
    (secondary.appraisalWorksheet?.length || 0) > (primary.appraisalWorksheet?.length || 0)
      ? secondary.appraisalWorksheet
      : primary.appraisalWorksheet;

  const mergedIterations = mergeReviewIterations(primary.reviewIterations, secondary.reviewIterations);
  const latestIterAt =
    sIterTime > pIterTime ? secondary.lastReviewedIterationAt : primary.lastReviewedIterationAt;

  return {
    ...secondary,
    ...primary,
    decision: preferSecondaryDecision ? secondary.decision : primary.decision,
    screeningStage: preferSecondaryDecision ? secondary.screeningStage : primary.screeningStage,
    decisionReason: preferSecondaryDecision
      ? secondary.decisionReason || primary.decisionReason
      : primary.decisionReason || secondary.decisionReason,
    prismaProtocolStatus: preferSecondaryDecision
      ? secondary.prismaProtocolStatus || primary.prismaProtocolStatus
      : primary.prismaProtocolStatus || secondary.prismaProtocolStatus,
    reviewerNotes: primary.reviewerNotes || secondary.reviewerNotes,
    screeningNotes: primary.screeningNotes || secondary.screeningNotes,
    codeAnalysisNotes: primary.codeAnalysisNotes || secondary.codeAnalysisNotes,
    isStarred: Boolean(primary.isStarred || secondary.isStarred),
    institutionConfirmed: Boolean(primary.institutionConfirmed || secondary.institutionConfirmed),
    appraisalScore:
      primary.appraisalScore !== undefined ? primary.appraisalScore : secondary.appraisalScore,
    appraisalWorksheet: mergedAppraisal,
    evidenceCitations: Array.from(citationMap.values()),
    extractedData: countNonEmptyValues(mergedExtracted) > 0 ? mergedExtracted : undefined,
    reviewIterations: mergedIterations,
    lastReviewedIterationAt: latestIterAt,
    prismaExclusionFlags: Array.from(
      new Set([...(primary.prismaExclusionFlags || []), ...(secondary.prismaExclusionFlags || [])])
    ),
  };
}

function mergeWorkbenchState(a?: WorkbenchState, b?: WorkbenchState): WorkbenchState | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  const aTime = a.lastAutoSavedAt ? new Date(a.lastAutoSavedAt).getTime() : 0;
  const bTime = b.lastAutoSavedAt ? new Date(b.lastAutoSavedAt).getTime() : 0;
  const newer = bTime > aTime ? b : a;
  const older = bTime > aTime ? a : b;

  const aTurns = a.geminiChat?.turns || [];
  const bTurns = b.geminiChat?.turns || [];
  const mergedChat = bTurns.length > aTurns.length ? b.geminiChat : a.geminiChat || b.geminiChat;

  return {
    ...older,
    ...newer,
    qaRescans: { ...(older.qaRescans || {}), ...(newer.qaRescans || {}) },
    moduleLastSavedAt: { ...(older.moduleLastSavedAt || {}), ...(newer.moduleLastSavedAt || {}) },
    geminiChat: mergedChat,
  };
}

/**
 * Merges projects across local server disk, browser localStorage cache, and signed-in cloud DB.
 * CRITICAL: Server disk article membership is ALWAYS authoritative for existing projects so
 * deleted articles are NEVER resurrected from stale localStorage or cloud snapshots upon refresh.
 */
export function mergeProjectsPreservingData(
  serverProjects: ReviewProject[],
  localCachedProjects: ReviewProject[] = [],
  cloudProjects: ReviewProject[] = []
): ReviewProject[] {
  const byId = new Map<string, ReviewProject>();
  const serverIds = new Set((serverProjects || []).filter((p) => p?.id).map((p) => p.id));

  const mergeTwoProjects = (
    existing: ReviewProject,
    incoming: ReviewProject,
    existingFromServer: boolean
  ): ReviewProject => {
    const existingUpdated = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    const incomingUpdated = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
    const newer = incomingUpdated > existingUpdated ? incoming : existing;
    const older = incomingUpdated > existingUpdated ? existing : incoming;

    // Never resurrect deleted articles from localCachedProjects or cloudProjects into an existing server project.
    // Only enrich screening/extraction state on articles that STILL exist in the authoritative pool.
    let finalArticles: Article[];
    if (existingFromServer) {
      const incomingById = new Map<string, Article>(
        filterOutDeletedArticles(existing.id, incoming.articles || [], incoming.updatedAt)
          .filter((a) => a?.id)
          .map((a) => [a.id, { ...a, projectId: existing.id }])
      );
      finalArticles = (existing.articles || []).map((serverArt) => {
        const secondary = incomingById.get(serverArt.id);
        return secondary
          ? mergeArticleRecordsPreservingData({ ...serverArt, projectId: existing.id }, secondary)
          : { ...serverArt, projectId: existing.id };
      });
    } else {
      // Both sources are offline/cloud (server absent): honor strictly the newer snapshot's membership, filtered by tombstones
      const olderFiltered = filterOutDeletedArticles(existing.id, older.articles || [], older.updatedAt);
      const newerFiltered = filterOutDeletedArticles(existing.id, newer.articles || [], newer.updatedAt);
      const olderMap = new Map<string, Article>(
        olderFiltered.filter((a) => a?.id).map((a) => [a.id, { ...a, projectId: existing.id }])
      );
      finalArticles = newerFiltered
        .filter((a) => a?.id)
        .map((art) => {
          const prev = olderMap.get(art.id);
          return prev
            ? mergeArticleRecordsPreservingData({ ...art, projectId: existing.id }, prev)
            : { ...art, projectId: existing.id };
        });
    }

    const mergedProtocol = mergeProtocolSnapshotsPreservingData(newer, older);

    return {
      ...older,
      ...newer,
      ...mergedProtocol,
      geographicSelections:
        mergedProtocol.geographicSelections ||
        (countNonEmptyValues(newer.geographicSelections as any) >=
        countNonEmptyValues(older.geographicSelections as any)
          ? newer.geographicSelections || older.geographicSelections
          : older.geographicSelections),
      studyAreaBoundary: mergedProtocol.studyAreaBoundary || newer.studyAreaBoundary || older.studyAreaBoundary,
      workbenchState: mergeWorkbenchState(older.workbenchState, newer.workbenchState),
      onlineSearchSessions: existingFromServer
        ? existing.onlineSearchSessions ?? incoming.onlineSearchSessions
        : newer.onlineSearchSessions ?? older.onlineSearchSessions,
      articles: finalArticles,
    };
  };

  // Ingest server projects first (authoritative disk article membership)
  for (const proj of serverProjects || []) {
    if (!proj || !proj.id) continue;
    const isolated = (proj.articles || [])
      .filter((a) => !a.projectId || a.projectId === proj.id)
      .map((a) => ({ ...a, projectId: proj.id }));
    byId.set(proj.id, { ...proj, articles: isolated });
  }

  // Reconcile local cache & cloud snapshots without resurrecting deleted articles
  for (const sourceList of [localCachedProjects, cloudProjects]) {
    for (const proj of sourceList || []) {
      if (!proj || !proj.id) continue;
      const filteredArts = filterOutDeletedArticles(
        proj.id,
        (proj.articles || [])
          .filter((a) => !a.projectId || a.projectId === proj.id)
          .map((a) => ({ ...a, projectId: proj.id })),
        proj.updatedAt
      );
      const normalizedProj: ReviewProject = {
        ...proj,
        articles: filteredArts,
      };
      const existing = byId.get(proj.id);
      if (existing) {
        byId.set(proj.id, mergeTwoProjects(existing, normalizedProj, serverIds.has(proj.id)));
      } else {
        byId.set(proj.id, normalizedProj);
      }
    }
  }

  // Reconcile against the dedicated lightweight local Protocol Vault (survives article quota limits & restarts)
  const vaultMap = loadProtocolVaultMap();
  for (const [projectId, proj] of byId.entries()) {
    const vaultSnap = vaultMap[projectId];
    if (!vaultSnap) continue;
    const reconciled = mergeProtocolSnapshotsPreservingData(proj, vaultSnap);
    byId.set(projectId, {
      ...proj,
      ...reconciled,
    });
  }

  return Array.from(byId.values());
}

export async function fetchCloudProjectsWithPayloads(token: string): Promise<ReviewProject[]> {
  if (!token) return [];
  const listRes = await fetch('/api/cloud/projects', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) return [];
  const listData = await listRes.json();
  const rows: Array<{ localProjectId: string; version?: number }> = Array.isArray(listData?.projects)
    ? listData.projects
    : [];
  if (rows.length === 0) return [];

  const loaded: ReviewProject[] = [];
  for (const row of rows) {
    if (!row?.localProjectId) continue;
    try {
      const detailRes = await fetch(
        `/api/cloud/projects/${encodeURIComponent(row.localProjectId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!detailRes.ok) continue;
      const detail = await detailRes.json();
      if (detail?.payload && detail.payload.id) {
        if (detail.version || row.version) {
          setProjectVersion(detail.payload.id, Number(detail.version || row.version || 1));
        }
        loaded.push(detail.payload as ReviewProject);
      }
    } catch {
      // Skip malformed/unreachable project record without blocking others
    }
  }
  return loaded;
}

export async function syncProjectToCloudBackend(params: {
  token: string;
  uid?: string;
  emailVerified?: boolean;
  project: ReviewProject;
  opId?: string;
  device?: 'web' | 'android';
}): Promise<{ version: number; conflictDetected: boolean }> {
  const versions = getProjectVersions();
  const clientVersion = versions[params.project.id] || 1;

  const res = await fetch('/api/cloud/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      opId: params.opId || `sync_${params.project.id}_${Date.now()}`,
      project: params.project,
      clientVersion,
      device: params.device || 'web',
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Cloud sync failed.');
  }

  const nextVersion = Number(data.version || clientVersion + 1);
  setProjectVersion(params.project.id, nextVersion);

  // Mirror header metadata into Firestore when verified
  if (params.uid && params.emailVerified) {
    try {
      const articles = params.project.articles || [];
      const includedCount = articles.filter((a) => a.decision === 'include').length;
      const cleanProjectId = params.project.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
      await setDoc(
        doc(db, 'users', params.uid, 'cloud_projects', cleanProjectId),
        {
          id: cleanProjectId,
          userId: params.uid,
          title: (params.project.title || 'Untitled Review').slice(0, 240),
          discipline: (params.project.discipline || 'Interdisciplinary').slice(0, 120),
          frameworkType: (params.project.frameworkType || 'PICOC').slice(0, 32),
          articleCount: articles.length,
          includedCount,
          version: nextVersion,
          lastSyncedDevice: params.device || 'web',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // Non-fatal: PostgreSQL cloud backup succeeded
    }
  }

  return {
    version: nextVersion,
    conflictDetected: Boolean(data.conflictDetected),
  };
}

export async function flushOfflineSyncQueue(params: {
  token: string;
  uid?: string;
  emailVerified?: boolean;
  projects: ReviewProject[];
  device?: 'web' | 'android';
}): Promise<{ flushed: number; remaining: OfflineSyncOperation[]; conflictCount: number }> {
  const queue = loadOfflineQueue();
  if (queue.length === 0) {
    return { flushed: 0, remaining: [], conflictCount: 0 };
  }

  const remaining: OfflineSyncOperation[] = [];
  let flushed = 0;
  let conflictCount = 0;

  // Group by projectId to avoid redundant uploads while honoring latest state
  const byProject = new Map<string, OfflineSyncOperation[]>();
  for (const op of queue) {
    const arr = byProject.get(op.projectId) || [];
    arr.push(op);
    byProject.set(op.projectId, arr);
  }

  for (const [projectId, ops] of byProject.entries()) {
    const targetProject = params.projects.find((p) => p.id === projectId);
    if (!targetProject) {
      flushed += ops.length;
      continue;
    }

    try {
      const latestOp = ops[ops.length - 1];
      const result = await syncProjectToCloudBackend({
        token: params.token,
        uid: params.uid,
        emailVerified: params.emailVerified,
        project: targetProject,
        opId: latestOp.opId,
        device: params.device || latestOp.device,
      });
      if (result.conflictDetected) conflictCount++;
      flushed += ops.length;
    } catch {
      remaining.push(...ops);
    }
  }

  saveOfflineQueue(remaining);
  return { flushed, remaining, conflictCount };
}
