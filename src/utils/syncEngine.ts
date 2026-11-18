import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ReviewProject } from '../types';

export type SyncStatus = 'Synced' | 'Synchronizing' | 'Offline' | 'Sync Failed';

export interface OfflineSyncOperation {
  opId: string;
  projectId: string;
  opType: 'screen_decision' | 'update_project' | 'update_extraction';
  summary: string;
  timestamp: string;
  device: 'web' | 'android';
}

const QUEUE_KEY = 'researchmate_offline_sync_queue_v1';
const VERSIONS_KEY = 'researchmate_project_versions_v1';
const CACHE_KEY = 'researchmate_offline_projects_v1';

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
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(projects));
  } catch {}
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
