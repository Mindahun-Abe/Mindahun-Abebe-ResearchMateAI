import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ReviewProject, Article, WorkbenchModuleId, WorkbenchState, SystematicReviewProtocol } from './types';
import { Navbar } from './components/Navbar';
import { ProjectInfoBanner } from './components/ProjectInfoBanner';
import { DashboardOverview } from './components/DashboardOverview';
import { ArticleLibrary } from './components/ArticleLibrary';
import { PicocRulesManager } from './components/PicocRulesManager';
import { DuplicateResolver } from './components/DuplicateResolver';
import { TitleScreeningWorkbench } from './components/TitleScreeningWorkbench';
import { ScreeningWorkbench } from './components/ScreeningWorkbench';
import { EvidenceExtractionMatrix } from './components/EvidenceExtractionMatrix';
import { AppraisalWorksheet } from './components/AppraisalWorksheet';
import { PrismaDiagram } from './components/PrismaDiagram';
import { IncludedResultsSynthesis } from './components/IncludedResultsSynthesis';
import { ResearchBriefingModule } from './components/ResearchBriefingModule';
import { ProposalGenerator } from './components/ProposalGenerator';
import { ExportReportModule } from './components/ExportReportModule';
import { ProtocolBuilderWorkspace } from './components/ProtocolBuilderWorkspace';
import { QuantitativeSynthesisWorkspace } from './components/QuantitativeSynthesisWorkspace';
import { RecoveryReconciliationWorkspace } from './components/RecoveryReconciliationWorkspace';
import { CrossrefLookupModal } from './components/CrossrefLookupModal';
import { AddArticleModal } from './components/AddArticleModal';
import { CreateReviewModal } from './components/CreateReviewModal';
import { SavedReviewFolders } from './components/SavedReviewFolders';
import { ResearchSuiteModal } from './components/suite/ResearchSuiteModal';
import { LandingWebsite } from './components/commercial/LandingWebsite';
import { AccountBillingPortal } from './components/commercial/AccountBillingPortal';
import { AdminDashboard } from './components/commercial/AdminDashboard';
import { GeminiChatbotDrawer } from './components/GeminiChatbotDrawer';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AutoSaveStatusInfo } from './components/ModuleWorkbenchControls';
import { useAuth } from './contexts/AuthContext';
import {
  OfflineSyncOperation,
  SyncStatus,
  cacheProjectsOffline,
  enqueueOfflineSyncOp,
  fetchCloudProjectsWithPayloads,
  flushOfflineSyncQueue,
  loadCachedOfflineProjects,
  loadOfflineQueue,
  loadWorkspaceUiState,
  mergeProjectsPreservingData,
  saveWorkspaceUiState,
  syncProjectToCloudBackend,
} from './utils/syncEngine';
import {
  apiService,
  evaluateArticleClient,
  mergeScreeningInsightsIntoExtractedData,
} from './services/apiService';
import { parseLocalDataFilesWithOriginals } from './utils/localFileImporter';
import {
  appendLocalProtocolRevision,
  computeProtocolFingerprint,
  extractProtocolSnapshot,
  PROTOCOL_SCHEMA_VERSION,
  removeProjectProtocolFromVault,
  saveProjectProtocolToVault,
} from './utils/protocolVault';

type SurfaceView = 'workbench' | 'website' | 'billing' | 'admin';

function parseHashSurface(): { view: SurfaceView; section: 'overview' | 'pricing' | 'support' | 'legal' } {
  const hash = (window.location.hash || '').toLowerCase();
  if (hash.startsWith('#pricing')) return { view: 'website', section: 'pricing' };
  if (hash.startsWith('#website') || hash.startsWith('#home')) return { view: 'website', section: 'overview' };
  if (hash.startsWith('#support')) return { view: 'website', section: 'support' };
  if (hash.startsWith('#legal')) return { view: 'website', section: 'legal' };
  if (hash.startsWith('#billing')) return { view: 'billing', section: 'overview' };
  if (hash.startsWith('#admin')) return { view: 'admin', section: 'overview' };
  return { view: 'workbench', section: 'overview' };
}

export default function App() {
  const { user, idToken, refreshAccountOverview } = useAuth();
  const initialHash = parseHashSurface();
  const [surfaceView, setSurfaceView] = useState<SurfaceView>(initialHash.view);
  const [websiteSection, setWebsiteSection] = useState<'overview' | 'pricing' | 'support' | 'legal'>(
    initialHash.section
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'Offline' : 'Synced'
  );
  const [pendingOps, setPendingOps] = useState<OfflineSyncOperation[]>(() => loadOfflineQueue());
  const [activeAnnouncements, setActiveAnnouncements] = useState<
    { id: number; title: string; message: string; severity: string }[]
  >([]);

  const initialUiState = useMemo(() => loadWorkspaceUiState(), []);
  const [projects, setProjects] = useState<ReviewProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [currentProjectId, setCurrentProjectId] = useState<string>(
    initialUiState.currentProjectId || ''
  );
  const [currentTab, setCurrentTab] = useState<string>(initialUiState.currentTab || 'dashboard');
  const [selectedArticleId, setSelectedArticleId] = useState<string>(
    initialUiState.selectedArticleId || ''
  );
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>(
    initialUiState.deviceMode === 'mobile' ? 'mobile' : 'desktop'
  );

  useEffect(() => {
    saveWorkspaceUiState({
      currentProjectId,
      currentTab,
      selectedArticleId,
      deviceMode,
    });
  }, [currentProjectId, currentTab, selectedArticleId, deviceMode]);

  // Modal states
  const [isCrossrefOpen, setIsCrossrefOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isCreateReviewOpen, setIsCreateReviewOpen] = useState<boolean>(false);
  const [isResearchSuiteOpen, setIsResearchSuiteOpen] = useState<boolean>(false);
  const [suiteInitialTab, setSuiteInitialTab] = useState<'cloud' | 'gemini_chat_search'>('cloud');
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState<boolean>(false);
  const [addModalInitialTab, setAddModalInitialTab] = useState<'manual' | 'bulk_local' | 'online'>('manual');
  const [openBatchScreenerOnLibrary, setOpenBatchScreenerOnLibrary] = useState<boolean>(false);
  const [quantSynthesisMode, setQuantSynthesisMode] = useState<'qualitative' | 'quantitative'>('quantitative');
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatusInfo>({ state: 'idle' });
  const workbenchDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingWorkbenchPayloadsRef = useRef<Map<string, WorkbenchState>>(new Map());
  const projectDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingProjectPayloadsRef = useRef<Map<string, ReviewProject>>(new Map());
  const projectsRef = useRef<ReviewProject[]>(projects);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const flushPendingWorkbenchSaves = useCallback((projectIdFilter?: string) => {
    workbenchDebounceRef.current.forEach((timer, pid) => {
      if (projectIdFilter && pid !== projectIdFilter) return;
      clearTimeout(timer);
      workbenchDebounceRef.current.delete(pid);
      const pending = pendingWorkbenchPayloadsRef.current.get(pid);
      if (pending) {
        pendingWorkbenchPayloadsRef.current.delete(pid);
        apiService.saveWorkbenchState(pid, pending).catch(() => {});
      }
    });
  }, []);

  const flushPendingProjectSaves = useCallback(
    async (projectIdFilter?: string, keepalive = false): Promise<void> => {
      const promises: Promise<any>[] = [];
      projectDebounceRef.current.forEach((timer, pid) => {
        if (projectIdFilter && pid !== projectIdFilter) return;
        clearTimeout(timer);
        projectDebounceRef.current.delete(pid);
        const pending = pendingProjectPayloadsRef.current.get(pid);
        if (pending) {
          pendingProjectPayloadsRef.current.delete(pid);
          const snap = extractProtocolSnapshot(pending);
          if (keepalive) {
            apiService
              .saveProtocolVault(pid, {
                snapshot: snap,
                reason: 'Unload/restart emergency keepalive flush',
                source: 'auto',
                allowReplace: true,
                keepalive: true,
              })
              .catch(() => {});
          } else {
            promises.push(apiService.updateProjectFolder(pending).catch(() => {}));
          }
        }
      });
      if (promises.length > 0) {
        await Promise.all(promises);
      }
    },
    []
  );

  useEffect(() => {
    const handleBeforeUnload = () => {
      flushPendingWorkbenchSaves();
      flushPendingProjectSaves(undefined, true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingWorkbenchSaves();
        flushPendingProjectSaves(undefined, true);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushPendingWorkbenchSaves();
      flushPendingProjectSaves(undefined, true);
    };
  }, [flushPendingWorkbenchSaves, flushPendingProjectSaves]);

  const navigateSurface = (
    nextView: SurfaceView,
    section: 'overview' | 'pricing' | 'support' | 'legal' = 'overview'
  ) => {
    setSurfaceView(nextView);
    setWebsiteSection(section);
    window.location.hash = nextView === 'workbench' ? '#workbench' : `#${nextView}`;
  };

  useEffect(() => {
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  useEffect(() => {
    fetch('/api/announcements')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.announcements)) setActiveAnnouncements(d.announcements);
      })
      .catch(() => {});
  }, []);

  // Verify Chapa callback tx_ref if redirected back to #billing?tx_ref=...
  useEffect(() => {
    const hash = window.location.hash || '';
    const match = hash.match(/tx_ref=([^&]+)/);
    if (match && idToken) {
      const txRef = decodeURIComponent(match[1]);
      fetch(`/api/billing/chapa/verify/${encodeURIComponent(txRef)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      })
        .then((r) => {
          if (r.ok) {
            void refreshAccountOverview();
            window.location.hash = '#billing';
          }
        })
        .catch(() => {});
    }
  }, [idToken, refreshAccountOverview]);

  // Online / Offline connectivity listeners & automatic queue flush
  useEffect(() => {
    const handleOnline = async () => {
      if (idToken && projects.length > 0) {
        setSyncStatus('Synchronizing');
        const result = await flushOfflineSyncQueue({
          token: idToken,
          uid: user?.uid,
          emailVerified: user?.emailVerified,
          projects,
        });
        setPendingOps(result.remaining);
        setSyncStatus(result.remaining.length === 0 ? 'Synced' : 'Sync Failed');
      } else {
        setSyncStatus('Synced');
      }
    };
    const handleOffline = () => setSyncStatus('Offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [idToken, user?.uid, user?.emailVerified, projects]);

  // Active Project (strictly partitioned so only articles belonging to currentProject.id appear in single-review analysis)
  const rawCurrentProject = projects.find((p) => p.id === currentProjectId) || projects[0] || null;
  const isolatedCurrentProject: ReviewProject | null = useMemo(() => {
    if (!rawCurrentProject) return null;
    const targetId = rawCurrentProject.id;
    const isolatedArticles = (rawCurrentProject.articles || [])
      .filter((a) => !a.projectId || a.projectId === targetId)
      .map((a) => ({ ...a, projectId: targetId }));
    return {
      ...rawCurrentProject,
      articles: isolatedArticles,
    };
  }, [rawCurrentProject]);

  // Selected Article for Screening / Appraisal
  const selectedArticle = isolatedCurrentProject
    ? isolatedCurrentProject.articles.find((a) => a.id === selectedArticleId) ||
      isolatedCurrentProject.articles[0]
    : undefined;

  // Article index for Next / Prev navigation
  const currentIndex = isolatedCurrentProject
    ? isolatedCurrentProject.articles.findIndex((a) => a.id === selectedArticle?.id)
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = Boolean(
    isolatedCurrentProject && currentIndex >= 0 && currentIndex < isolatedCurrentProject.articles.length - 1
  );

  // Load persisted Review Partitioned Databases on mount (never auto-clears saved folders)
  const reloadProjectsFromDisk = () => {
    setIsLoadingProjects(true);
    setLoadError('');
    return apiService
      .fetchProjects()
      .then((serverProjects) => {
        const list = Array.isArray(serverProjects) ? serverProjects : [];
        const sanitized = list.map((proj) => ({
          ...proj,
          articles: (proj.articles || [])
            .filter((a) => !a.projectId || a.projectId === proj.id)
            .map((a) => ({ ...a, projectId: proj.id })),
        }));
        setProjects(sanitized);
        if (sanitized.length > 0) {
          setCurrentProjectId((prevId) => {
            const resolvedActive = sanitized.find((p) => p.id === prevId) || sanitized[0];
            setSelectedArticleId((prevArt) =>
              prevArt && resolvedActive.articles.some((a) => a.id === prevArt)
                ? prevArt
                : resolvedActive.articles[0]?.id || ''
            );
            return resolvedActive.id;
          });
        } else {
          setCurrentProjectId('');
          setSelectedArticleId('');
        }
      })
      .catch((err) => {
        console.warn('Could not load review folders:', err?.message);
        setLoadError(err?.message || 'Could not reach database server.');
      })
      .finally(() => {
        setIsLoadingProjects(false);
      });
  };

  useEffect(() => {
    let active = true;
    const savedUi = loadWorkspaceUiState();
    setIsLoadingProjects(true);
    setLoadError('');
    apiService
      .fetchProjects()
      .then(async (serverProjects) => {
        if (!active) return;
        const list = Array.isArray(serverProjects) ? serverProjects : [];
        const localCached = loadCachedOfflineProjects();
        const merged = mergeProjectsPreservingData(list, localCached);

        // If local cache or protocol vault recovered projects, richer protocol fields, or articles absent from server disk after an update/restart, persist back to disk
        const serverById = new Map(list.map((p) => [p.id, p]));
        for (const mProj of merged) {
          const sProj = serverById.get(mProj.id);
          const protocolChanged =
            sProj &&
            computeProtocolFingerprint(extractProtocolSnapshot(mProj)) !==
              computeProtocolFingerprint(extractProtocolSnapshot(sProj));
          if (!sProj) {
            apiService.createProjectFolder(mProj).catch(() => {});
          } else if (protocolChanged || (mProj.articles?.length || 0) > (sProj.articles?.length || 0)) {
            apiService.updateProjectFolder(mProj).catch(() => {});
            apiService
              .saveProtocolVault(mProj.id, {
                snapshot: extractProtocolSnapshot(mProj),
                reason: 'Recovered protocol & framework state on startup',
                source: 'recovery',
                allowReplace: true,
              })
              .catch(() => {});
            if ((mProj.articles?.length || 0) > (sProj.articles?.length || 0)) {
              apiService.syncProjectArticles(mProj.id, mProj.articles || []).catch(() => {});
            }
          }
        }

        if (!active) return;
        setProjects(merged);
        cacheProjectsOffline(merged);
        if (merged.length > 0) {
          const preferredProjectId = currentProjectId || savedUi.currentProjectId || '';
          const resolvedActive =
            merged.find((p) => p.id === preferredProjectId) || merged[0];
          setCurrentProjectId(resolvedActive.id);
          const preferredArtId = selectedArticleId || savedUi.selectedArticleId || '';
          const validArt =
            preferredArtId && resolvedActive.articles.some((a) => a.id === preferredArtId)
              ? preferredArtId
              : resolvedActive.articles[0]?.id || '';
          setSelectedArticleId(validArt);
        } else {
          setCurrentProjectId('');
          setSelectedArticleId('');
        }
      })
      .catch((err) => {
        if (!active) return;
        const offlineCached = loadCachedOfflineProjects();
        if (offlineCached.length > 0) {
          setProjects(offlineCached);
          const preferredId = currentProjectId || savedUi.currentProjectId || '';
          const resolved = offlineCached.find((p) => p.id === preferredId) || offlineCached[0];
          setCurrentProjectId(resolved.id);
          const preferredArtId = selectedArticleId || savedUi.selectedArticleId || '';
          const validArt =
            preferredArtId && resolved.articles?.some((a) => a.id === preferredArtId)
              ? preferredArtId
              : resolved.articles?.[0]?.id || '';
          setSelectedArticleId(validArt);
          setSyncStatus('Offline');
        } else {
          console.warn('Could not load review folders:', err?.message);
          setLoadError(err?.message || 'Could not reach database server.');
        }
      })
      .finally(() => {
        if (active) setIsLoadingProjects(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Hydrate & reconcile signed-in user's cloud projects across sessions and app updates
  const lastHydratedUidRef = useRef<string>('');
  useEffect(() => {
    if (!idToken || !user?.uid || isLoadingProjects) return;
    const sessionKey = `${user.uid}:${idToken.slice(-12)}`;
    if (lastHydratedUidRef.current === sessionKey) return;
    lastHydratedUidRef.current = sessionKey;

    let cancelled = false;
    (async () => {
      try {
        setSyncStatus('Synchronizing');
        const cloudList = await fetchCloudProjectsWithPayloads(idToken);
        if (cancelled) return;
        const localCached = loadCachedOfflineProjects();
        const baseProjects = projectsRef.current;
        const merged = mergeProjectsPreservingData(baseProjects, localCached, cloudList);

        // Persist any cloud-recovered projects or richer/newer protocol edits onto local disk partition
        const localById = new Map(baseProjects.map((p) => [p.id, p]));
        for (const mProj of merged) {
          const lProj = localById.get(mProj.id);
          const protocolChanged =
            lProj &&
            computeProtocolFingerprint(extractProtocolSnapshot(mProj)) !==
              computeProtocolFingerprint(extractProtocolSnapshot(lProj));
          if (!lProj) {
            apiService.createProjectFolder(mProj).catch(() => {});
          } else if (protocolChanged || (mProj.articles?.length || 0) > (lProj.articles?.length || 0)) {
            apiService.updateProjectFolder(mProj).catch(() => {});
            apiService
              .saveProtocolVault(mProj.id, {
                snapshot: extractProtocolSnapshot(mProj),
                reason: 'Reconciled protocol & framework across cloud/local sync',
                source: 'sync',
                allowReplace: true,
              })
              .catch(() => {});
            if ((mProj.articles?.length || 0) > (lProj.articles?.length || 0)) {
              apiService.syncProjectArticles(mProj.id, mProj.articles || []).catch(() => {});
            }
          }
        }

        if (merged.length > 0) {
          setProjects(merged);
          cacheProjectsOffline(merged);
          setCurrentProjectId((prevId) => {
            if (prevId && merged.some((p) => p.id === prevId)) return prevId;
            return merged[0].id;
          });
        }

        // Flush pending offline ops & push any local-only projects up to user's cloud store
        const cloudIds = new Set(cloudList.map((c) => c.id));
        const flushed = await flushOfflineSyncQueue({
          token: idToken,
          uid: user.uid,
          emailVerified: user.emailVerified,
          projects: merged,
        });
        setPendingOps(flushed.remaining);

        for (const proj of merged) {
          if (!cloudIds.has(proj.id)) {
            await syncProjectToCloudBackend({
              token: idToken,
              uid: user.uid,
              emailVerified: user.emailVerified,
              project: proj,
            }).catch(() => {});
          }
        }
        if (!cancelled) {
          setSyncStatus(flushed.remaining.length === 0 ? 'Synced' : 'Sync Failed');
        }
      } catch {
        if (!cancelled) setSyncStatus('Sync Failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [idToken, user?.uid, user?.emailVerified, isLoadingProjects]);

  const triggerCloudBackgroundSync = async (
    targetProject: ReviewProject,
    opType: OfflineSyncOperation['opType'],
    summary: string
  ) => {
    const queued = enqueueOfflineSyncOp(targetProject.id, opType, summary, 'web');
    setPendingOps(queued);

    if (!navigator.onLine) {
      setSyncStatus('Offline');
      return;
    }
    if (!idToken) return;

    try {
      setSyncStatus('Synchronizing');
      const result = await flushOfflineSyncQueue({
        token: idToken,
        uid: user?.uid,
        emailVerified: user?.emailVerified,
        projects: projects.map((p) => (p.id === targetProject.id ? targetProject : p)),
      });
      setPendingOps(result.remaining);
      setSyncStatus(result.remaining.length === 0 ? 'Synced' : 'Sync Failed');
    } catch {
      setSyncStatus('Sync Failed');
    }
  };

  const handleManualSyncAll = async () => {
    if (!idToken) return;
    if (!navigator.onLine) {
      setSyncStatus('Offline');
      return;
    }
    setSyncStatus('Synchronizing');
    try {
      const flushed = await flushOfflineSyncQueue({
        token: idToken,
        uid: user?.uid,
        emailVerified: user?.emailVerified,
        projects,
      });
      setPendingOps(flushed.remaining);
      for (const proj of projects) {
        await syncProjectToCloudBackend({
          token: idToken,
          uid: user?.uid,
          emailVerified: user?.emailVerified,
          project: proj,
        });
      }
      setSyncStatus('Synced');
    } catch {
      setSyncStatus('Sync Failed');
    }
  };

  // Handlers for updating project cleanly with instant local Protocol Vault protection + serialized debounced disk/cloud sync
  const handleUpdateProject = async (updated: ReviewProject): Promise<ReviewProject | void> => {
    const nowIso = new Date().toISOString();
    const previousProj = projectsRef.current.find((p) => p.id === updated.id);
    const isolatedUpdated: ReviewProject = {
      ...updated,
      protocolSchemaVersion: PROTOCOL_SCHEMA_VERSION,
      protocolUpdatedAt: nowIso,
      updatedAt: nowIso,
      articles: (updated.articles || []).map((a) => ({ ...a, projectId: updated.id })),
    };

    setAutoSaveStatus((prev) => ({ ...prev, state: 'saving', label: 'Protocol & Framework Vault' }));
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === updated.id ? isolatedUpdated : p));
      cacheProjectsOffline(next);
      return next;
    });
    saveProjectProtocolToVault(isolatedUpdated, { authoritative: true });
    appendLocalProtocolRevision(isolatedUpdated, 'Auto-saved protocol & framework edit', 'auto');

    // Clear any stale queued timer and coalesce rapid keystrokes in order without overwriting newer edits
    const existingTimer = projectDebounceRef.current.get(updated.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      projectDebounceRef.current.delete(updated.id);
    }
    pendingProjectPayloadsRef.current.set(updated.id, isolatedUpdated);

    const folderRenamed =
      previousProj && previousProj.databaseFolderName !== isolatedUpdated.databaseFolderName;

    const executePersist = async (): Promise<ReviewProject | void> => {
      const payloadToPersist = pendingProjectPayloadsRef.current.get(updated.id) || isolatedUpdated;
      pendingProjectPayloadsRef.current.delete(updated.id);
      try {
        const saved = await apiService.updateProjectFolder(payloadToPersist);
        const savedIso = new Date().toISOString();
        setAutoSaveStatus({
          state: 'saved',
          lastSavedAt: saved?.updatedAt || savedIso,
          label: 'Protocol & Framework Vault',
        });
        if (saved?.databaseFolderPath) {
          setProjects((prev) => {
            const next = prev.map((p) =>
              p.id === saved.id
                ? {
                    ...p,
                    databaseFolderName: saved.databaseFolderName,
                    databaseFolderPath: saved.databaseFolderPath,
                    updatedAt: saved.updatedAt || p.updatedAt,
                  }
                : p
            );
            cacheProjectsOffline(next);
            return next;
          });
        }
        void triggerCloudBackgroundSync(
          payloadToPersist,
          'update_project',
          `Updated ${payloadToPersist.title} protocol`
        );
        return saved;
      } catch (err: any) {
        console.warn('Folder sync warning:', err?.message);
        if (folderRenamed && previousProj) {
          setProjects((prev) => {
            const next = prev.map((p) =>
              p.id === updated.id
                ? {
                    ...p,
                    databaseFolderName: previousProj.databaseFolderName,
                    databaseFolderPath: previousProj.databaseFolderPath,
                  }
                : p
            );
            cacheProjectsOffline(next);
            return next;
          });
        }
        setAutoSaveStatus((prev) => ({
          ...prev,
          state: 'error',
          error: err?.message || 'Saved in Local Protocol Vault (offline fallback)',
        }));
        if (folderRenamed) throw err;
      }
    };

    if (folderRenamed) {
      return executePersist();
    }

    const timer = setTimeout(() => {
      projectDebounceRef.current.delete(updated.id);
      void executePersist();
    }, 350);
    projectDebounceRef.current.set(updated.id, timer);
  };

  const handleUpdateArticlesForProject = useCallback(
    (targetId: string, newArticles: Article[]) => {
      const isolated = newArticles
        .filter((a) => !a.projectId || a.projectId === targetId)
        .map((a) => ({ ...a, projectId: targetId }));
      const baseProj = projectsRef.current.find((p) => p.id === targetId);
      setAutoSaveStatus((prev) => ({ ...prev, state: 'saving', label: `${isolated.length} Articles` }));
      setProjects((prev) => {
        const next = prev.map((p) => (p.id === targetId ? { ...p, articles: isolated } : p));
        cacheProjectsOffline(next);
        return next;
      });
      apiService
        .syncProjectArticles(targetId, isolated)
        .then((res) => {
          setAutoSaveStatus({
            state: 'saved',
            lastSavedAt: res?.savedAt || new Date().toISOString(),
            label: `${isolated.length} Articles`,
          });
        })
        .catch((err) => {
          console.warn('Sub-library articles sync warning:', err?.message);
          setAutoSaveStatus((prev) => ({
            ...prev,
            state: 'error',
            error: err?.message || 'Cached offline',
          }));
        });
      if (baseProj) {
        void triggerCloudBackgroundSync(
          { ...baseProj, articles: isolated },
          'screen_decision',
          `Updated ${isolated.length} articles`
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idToken, user?.uid, user?.emailVerified]
  );

  const handleUpdateArticles = (newArticles: Article[]) => {
    if (!isolatedCurrentProject) return;
    handleUpdateArticlesForProject(isolatedCurrentProject.id, newArticles);
  };

  // Auto-save WorkbenchState (Fast Batch Screener + all 11 Core SLR Modules)
  const handleUpdateWorkbenchState = useCallback(
    (
      targetProjectId: string,
      updater: Partial<WorkbenchState> | ((prev: WorkbenchState) => WorkbenchState),
      options?: { immediate?: boolean; moduleId?: WorkbenchModuleId; label?: string }
    ) => {
      const nowIso = new Date().toISOString();
      let computedState: WorkbenchState = {};
      setAutoSaveStatus((prev) => ({
        ...prev,
        state: 'saving',
        label: options?.label || options?.moduleId || 'Workbench',
      }));

      setProjects((prev) => {
        const next = prev.map((p) => {
          if (p.id !== targetProjectId) return p;
          const prevWs: WorkbenchState = p.workbenchState || {};
          const merged =
            typeof updater === 'function' ? updater(prevWs) : { ...prevWs, ...updater };
          const nextModuleTimestamps = options?.moduleId
            ? { ...(merged.moduleLastSavedAt || {}), [options.moduleId]: nowIso }
            : merged.moduleLastSavedAt;
          computedState = {
            ...merged,
            lastAutoSavedAt: nowIso,
            lastSavedModule: options?.moduleId || merged.lastSavedModule,
            moduleLastSavedAt: nextModuleTimestamps,
          };
          return { ...p, workbenchState: computedState };
        });
        cacheProjectsOffline(next);
        return next;
      });

      const existingTimer = workbenchDebounceRef.current.get(targetProjectId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        workbenchDebounceRef.current.delete(targetProjectId);
      }
      pendingWorkbenchPayloadsRef.current.set(targetProjectId, computedState);

      const persistNow = () => {
        const payloadToSave = pendingWorkbenchPayloadsRef.current.get(targetProjectId) || computedState;
        pendingWorkbenchPayloadsRef.current.delete(targetProjectId);
        apiService
          .saveWorkbenchState(targetProjectId, payloadToSave)
          .then((res) => {
            setAutoSaveStatus({
              state: 'saved',
              lastSavedAt: res?.savedAt || nowIso,
              label: options?.label || options?.moduleId || 'Workbench',
            });
          })
          .catch((err) => {
            setAutoSaveStatus((prev) => ({
              ...prev,
              state: 'error',
              error: err?.message || 'Cached locally',
            }));
          });
        const targetProj = projectsRef.current.find((p) => p.id === targetProjectId);
        if (targetProj && idToken) {
          void triggerCloudBackgroundSync(
            { ...targetProj, workbenchState: payloadToSave },
            'update_project',
            `Saved ${options?.label || options?.moduleId || 'Workbench'}`
          );
        }
      };

      if (options?.immediate) {
        persistNow();
      } else {
        const timer = setTimeout(() => {
          workbenchDebounceRef.current.delete(targetProjectId);
          persistNow();
        }, 450);
        workbenchDebounceRef.current.set(targetProjectId, timer);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idToken]
  );

  // Reset or delete saved output/articles for Fast Batch Screener or any Core SLR module
  const handleResetWorkbenchModule = useCallback(
    async (
      targetProjectId: string,
      params: {
        target: WorkbenchModuleId;
        resetArticleFields?: boolean;
        deleteArticlesMode?: 'none' | 'excluded' | 'uncertain' | 'unscreened' | 'duplicates' | 'all' | 'ids';
        articleIds?: string[];
      }
    ) => {
      const existingTimer = workbenchDebounceRef.current.get(targetProjectId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        workbenchDebounceRef.current.delete(targetProjectId);
      }
      pendingWorkbenchPayloadsRef.current.delete(targetProjectId);

      setAutoSaveStatus((prev) => ({ ...prev, state: 'saving', label: `Resetting ${params.target}` }));
      const res = await apiService.resetWorkbenchModule(targetProjectId, params);
      const nextArticles = (res.articles || []).map((a) => ({ ...a, projectId: targetProjectId }));

      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === targetProjectId
            ? {
                ...p,
                databaseFolderPath: res.databaseFolderPath || p.databaseFolderPath,
                workbenchState: res.workbenchState,
                articles: nextArticles,
              }
            : p
        );
        cacheProjectsOffline(next);
        return next;
      });

      if (targetProjectId === currentProjectId) {
        setSelectedArticleId((prevSel) => {
          if (prevSel && nextArticles.some((a) => a.id === prevSel)) return prevSel;
          return nextArticles[0]?.id || '';
        });
      }

      setAutoSaveStatus({
        state: 'saved',
        lastSavedAt: res.savedAt || new Date().toISOString(),
        label: `Reset ${params.target}`,
      });
      return res;
    },
    [currentProjectId]
  );

  // Query Q&A Rescan across active non-duplicate articles (auto-saved into workbench_state.json)
  const handleRescanWithQueryQA = useCallback(
    async (
      targetProjectId: string,
      moduleId: WorkbenchModuleId,
      query: string,
      applyScreeningUpdates: boolean = false
    ) => {
      const targetProj = projectsRef.current.find((p) => p.id === targetProjectId);
      if (!targetProj) {
        throw new Error('Active review folder not found');
      }
      setAutoSaveStatus((prev) => ({ ...prev, state: 'saving', label: 'Query Q&A Rescan' }));

      const res = await apiService.rescanWithQueryQA({
        projectId: targetProjectId,
        moduleId,
        query,
        project: targetProj,
        articles: targetProj.articles,
        applyScreeningUpdates,
        persist: true,
      });

      let updatedCount = 0;
      if (applyScreeningUpdates && res.screeningUpdates && res.screeningUpdates.length > 0) {
        const updateMap = new Map(res.screeningUpdates.map((u) => [u.articleId, u]));
        const nextArticles = (targetProj.articles || []).map((art) => {
          const upd = updateMap.get(art.id);
          if (!upd) return art;
          updatedCount++;
          const localEval = evaluateArticleClient(art, targetProj);
          return {
            ...art,
            decision: upd.decision,
            decisionReason: upd.decision === 'exclude' ? upd.primaryReason : undefined,
            aiSuggestedDecision: upd.decision,
            aiConfidence: upd.confidenceScore,
            aiReason: upd.primaryReason,
            screeningStage:
              upd.decision === 'include'
                ? ('final_included' as const)
                : upd.decision === 'exclude'
                ? ('excluded' as const)
                : ('full_text' as const),
            extractedData: mergeScreeningInsightsIntoExtractedData(art.extractedData, localEval),
          };
        });
        handleUpdateArticlesForProject(targetProjectId, nextArticles);
      }

      if (res.workbenchState) {
        setProjects((prev) => {
          const next = prev.map((p) =>
            p.id === targetProjectId ? { ...p, workbenchState: res.workbenchState } : p
          );
          cacheProjectsOffline(next);
          return next;
        });
      }

      setAutoSaveStatus({
        state: 'saved',
        lastSavedAt: res.record?.createdAt || new Date().toISOString(),
        label: 'Query Q&A Saved',
      });
      return { record: res.record, updatedCount };
    },
    [handleUpdateArticlesForProject]
  );

  const handleDeleteQaRescanEntry = useCallback(
    (targetProjectId: string, moduleId: WorkbenchModuleId, recordId: string) => {
      handleUpdateWorkbenchState(
        targetProjectId,
        (prevWs) => {
          const currentList = prevWs.qaRescans?.[moduleId] || [];
          return {
            ...prevWs,
            qaRescans: {
              ...(prevWs.qaRescans || {}),
              [moduleId]: currentList.filter((r) => r.id !== recordId),
            },
          };
        },
        { immediate: true, moduleId, label: 'Deleted Q&A Entry' }
      );
    },
    [handleUpdateWorkbenchState]
  );

  // Permanently remove articles in bulk from a specific review sub-library folder & persist to disk
  const handleBulkRemoveFromFolder = async (
    targetProjectId: string,
    params: {
      articleIds?: string[];
      mode?: 'ids' | 'all' | 'excluded' | 'duplicates' | 'uncertain' | 'unscreened';
    }
  ) => {
    const res = await apiService.bulkRemoveArticlesFromFolder(targetProjectId, params);
    const nextArticles = (res.remainingArticles || []).map((a) => ({
      ...a,
      projectId: targetProjectId,
    }));

    setProjects((prev) => {
      const next = prev.map((p) =>
        p.id === targetProjectId
          ? {
              ...p,
              databaseFolderPath: res.databaseFolderPath || p.databaseFolderPath,
              articles: nextArticles,
            }
          : p
      );
      cacheProjectsOffline(next);
      return next;
    });

    if (targetProjectId === currentProjectId) {
      setSelectedArticleId((prevSel) => {
        if (!prevSel || nextArticles.some((a) => a.id === prevSel)) return prevSel;
        return nextArticles[0]?.id || '';
      });
    }

    return res;
  };

  // Rebuild selectively restored deleted online-database articles back into active library state
  const handleRestoredDeletedOnlineArticles = (
    targetProjectId: string,
    res: {
      restoredCount: number;
      restoredArticles: Article[];
      remainingArticles: Article[];
      remainingDeletedCount: number;
      databaseFolderPath?: string;
    }
  ) => {
    const nextArticles = (res.remainingArticles || []).map((a) => ({
      ...a,
      projectId: targetProjectId,
    }));
    setProjects((prev) => {
      const next = prev.map((p) =>
        p.id === targetProjectId
          ? {
              ...p,
              databaseFolderPath: res.databaseFolderPath || p.databaseFolderPath,
              articles: nextArticles,
            }
          : p
      );
      cacheProjectsOffline(next);
      return next;
    });
    if (targetProjectId === currentProjectId && res.restoredArticles?.length > 0) {
      setSelectedArticleId(res.restoredArticles[0].id);
    }
  };

  // Explicitly save all changes (metadata + articles + manifest) for a review folder to disk
  const handleSaveFolderChanges = async (targetProjectId: string) => {
    flushPendingWorkbenchSaves(targetProjectId);
    await flushPendingProjectSaves(targetProjectId, false);
    const targetProj =
      projectsRef.current.find((p) => p.id === targetProjectId) ||
      projects.find((p) => p.id === targetProjectId);
    if (!targetProj) {
      throw new Error('Target review folder not found');
    }
    const isolatedArticles = (targetProj.articles || [])
      .filter((a) => !a.projectId || a.projectId === targetProjectId)
      .map((a) => ({ ...a, projectId: targetProjectId }));

    saveProjectProtocolToVault(targetProj, { authoritative: true });
    await apiService.updateProjectFolder({ ...targetProj, articles: isolatedArticles });
    const syncRes = await apiService.syncProjectArticles(targetProjectId, isolatedArticles);
    return syncRes;
  };

  // Rename a review's database folder name independently of its Review Title
  const handleRenameProjectFolder = async (targetProjectId: string, folderName: string) => {
    const res = await apiService.renameProjectFolder(targetProjectId, folderName);
    setProjects((prev) => {
      const next = prev.map((p) =>
        p.id === targetProjectId
          ? {
              ...p,
              databaseFolderName: res.databaseFolderName,
              databaseFolderPath: res.databaseFolderPath,
              updatedAt: res.updatedAt || p.updatedAt,
            }
          : p
      );
      cacheProjectsOffline(next);
      return next;
    });
    return {
      databaseFolderName: res.databaseFolderName,
      databaseFolderPath: res.databaseFolderPath,
    };
  };

  // Permanently delete a review folder from disk
  const handleDeleteProjectFolder = async (targetProjectId: string) => {
    const res = await apiService.deleteProjectFolder(targetProjectId);
    try {
      localStorage.removeItem(`slr_search_history_${targetProjectId}`);
    } catch {}
    removeProjectProtocolFromVault(targetProjectId);
    const remainingProjects = projects.filter((p) => p.id !== targetProjectId);
    setProjects(remainingProjects);
    cacheProjectsOffline(remainingProjects);
    if (currentProjectId === targetProjectId) {
      if (remainingProjects.length > 0) {
        setCurrentProjectId(remainingProjects[0].id);
        setSelectedArticleId(remainingProjects[0].articles[0]?.id || '');
      } else {
        setCurrentProjectId('');
        setSelectedArticleId('');
      }
    }
    return res;
  };

  const handleUpdateArticle = (updatedArt: Article) => {
    if (!isolatedCurrentProject) return;
    const targetId = isolatedCurrentProject.id;
    const isolatedArt = { ...updatedArt, projectId: targetId };
    let updatedProjForSync: ReviewProject | null = null;
    setAutoSaveStatus((prev) => ({ ...prev, state: 'saving', label: 'Screening Update' }));
    setProjects((prev) => {
      const next = prev.map((p) => {
        if (p.id !== targetId) return p;
        const nextArticles = p.articles.map((a) => (a.id === isolatedArt.id ? isolatedArt : a));
        apiService
          .syncProjectArticles(targetId, nextArticles)
          .then((res) =>
            setAutoSaveStatus({
              state: 'saved',
              lastSavedAt: res?.savedAt || new Date().toISOString(),
              label: 'Screening Update',
            })
          )
          .catch(() => {});
        updatedProjForSync = { ...p, articles: nextArticles };
        return updatedProjForSync;
      });
      cacheProjectsOffline(next);
      return next;
    });
    if (updatedProjForSync) {
      void triggerCloudBackgroundSync(
        updatedProjForSync,
        'screen_decision',
        `Screened "${isolatedArt.title.slice(0, 48)}" -> ${isolatedArt.decision}`
      );
    }
  };

  const handleToggleStarArticle = (artId: string) => {
    if (!isolatedCurrentProject) return;
    const targetId = isolatedCurrentProject.id;
    let updatedProjForSync: ReviewProject | null = null;
    setProjects((prev) => {
      const next = prev.map((p) => {
        if (p.id !== targetId) return p;
        const nextArticles = p.articles.map((a) =>
          a.id === artId ? { ...a, isStarred: !a.isStarred } : a
        );
        apiService.syncProjectArticles(targetId, nextArticles).catch(() => {});
        updatedProjForSync = { ...p, articles: nextArticles };
        return updatedProjForSync;
      });
      cacheProjectsOffline(next);
      return next;
    });
    if (updatedProjForSync) {
      void triggerCloudBackgroundSync(updatedProjForSync, 'update_project', `Toggled star on ${artId}`);
    }
  };

  const persistOriginalPdfFiles = async (
    targetId: string,
    pdfFilesByArticleId?: Map<string, File>
  ) => {
    if (!pdfFilesByArticleId || pdfFilesByArticleId.size === 0) return;
    const entries = Array.from(pdfFilesByArticleId.entries());
    const updatedMap = new Map<string, Article>();
    const batchSize = 3;
    for (let i = 0; i < entries.length; i += batchSize) {
      const slice = entries.slice(i, i + batchSize);
      await Promise.all(
        slice.map(async ([artId, file]) => {
          try {
            const resp = await apiService.uploadArticleOriginalPdf(targetId, artId, file);
            if (resp?.article) {
              updatedMap.set(artId, resp.article);
            }
          } catch (err: any) {
            console.warn(`Original PDF upload warning (${file.name}):`, err?.message || err);
          }
        })
      );
    }
    if (updatedMap.size > 0) {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id !== targetId
            ? p
            : {
                ...p,
                articles: p.articles.map((a) => updatedMap.get(a.id) || a),
              }
        );
        cacheProjectsOffline(next);
        return next;
      });
    }
  };

  const handleAttachOriginalPdfToArticle = async (
    articleId: string,
    file: File,
    targetProjectId?: string
  ): Promise<Article | null> => {
    const targetId = targetProjectId || isolatedCurrentProject?.id;
    if (!targetId) return null;
    const resp = await apiService.uploadArticleOriginalPdf(targetId, articleId, file);
    if (resp?.article) {
      const updated = resp.article;
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id !== targetId
            ? p
            : {
                ...p,
                articles: p.articles.map((a) => (a.id === articleId ? { ...a, ...updated } : a)),
              }
        );
        cacheProjectsOffline(next);
        return next;
      });
      setAutoSaveStatus({
        state: 'saved',
        lastSavedAt: new Date().toISOString(),
        label: `PDF Saved: ${file.name}`,
      });
      return updated;
    }
    return null;
  };

  const handleAddArticle = (newArt: Article, targetProjectId?: string, pdfFile?: File) => {
    const targetId = targetProjectId || newArt.projectId || isolatedCurrentProject?.id;
    if (!targetId) return;
    const isolatedArt: Article = { ...newArt, projectId: targetId };
    setAutoSaveStatus((prev) => ({ ...prev, state: 'saving', label: 'Add Paper' }));
    setProjects((prev) => {
      const next = prev.map((p) =>
        p.id === targetId ? { ...p, articles: [isolatedArt, ...p.articles] } : p
      );
      cacheProjectsOffline(next);
      return next;
    });
    if (targetId === currentProjectId) {
      setSelectedArticleId(isolatedArt.id);
    }
    apiService
      .uploadArticlesChunk(targetId, [isolatedArt])
      .then(async () => {
        if (pdfFile) {
          const map = new Map<string, File>();
          map.set(isolatedArt.id, pdfFile);
          await persistOriginalPdfFiles(targetId, map);
        }
        setAutoSaveStatus({
          state: 'saved',
          lastSavedAt: new Date().toISOString(),
          label: 'Paper Added',
        });
      })
      .catch((err) => console.warn('Article save warning:', err?.message));
  };

  // Supports continuous streaming chunks during large bulk imports locked to a specific review partition
  // Automatically detects & records cross-database duplicates for PRISMA 2020 reporting
  const handleAddMultipleArticles = (
    newArts: Article[],
    options?: { keepOpen?: boolean; targetProjectId?: string; pdfFilesByArticleId?: Map<string, File> }
  ) => {
    if (!newArts || newArts.length === 0) return;
    const targetId =
      options?.targetProjectId || newArts[0]?.projectId || isolatedCurrentProject?.id;
    if (!targetId) return;
    const isolatedBatch = newArts.map((a) => ({ ...a, projectId: targetId }));

    const targetProj = projects.find((p) => p.id === targetId);
    const existingArticles = [...(targetProj?.articles || [])];

    const normDoi = (d?: string) => (d ? d.toLowerCase().trim() : '');
    const normTitle = (t?: string) => (t ? t.toLowerCase().replace(/[^a-z0-9]/g, '') : '');

    const canonByDoi = new Map<string, Article>();
    const canonByTitle = new Map<string, Article>();
    const seenSameDb = new Set<string>();
    const existingIds = new Set<string>();

    for (const ex of existingArticles) {
      existingIds.add(ex.id);
      const dk = normDoi(ex.doi);
      const tk = normTitle(ex.title);
      const db = (ex.sourceDatabase || 'Other').toLowerCase().trim();
      if (dk) seenSameDb.add(`${db}::doi:${dk}`);
      if (tk.length > 12) seenSameDb.add(`${db}::title:${tk}`);
      if (!ex.isDuplicate) {
        if (dk && !canonByDoi.has(dk)) canonByDoi.set(dk, ex);
        if (tk.length > 12 && !canonByTitle.has(tk)) canonByTitle.set(tk, ex);
      }
    }

    const canonicalUpdates = new Map<string, Partial<Article>>();
    const newRecordsToInsert: Article[] = [];

    for (const art of isolatedBatch) {
      if (existingIds.has(art.id)) continue;
      const dk = normDoi(art.doi);
      const tk = normTitle(art.title);
      const incomingDb = (art.sourceDatabase || 'Other').trim();
      const incomingDbLower = incomingDb.toLowerCase();

      // Prevent accidental double-click re-import of the exact same paper from the exact same database
      if (
        (dk && seenSameDb.has(`${incomingDbLower}::doi:${dk}`)) ||
        (tk.length > 12 && seenSameDb.has(`${incomingDbLower}::title:${tk}`))
      ) {
        continue;
      }

      if (dk) seenSameDb.add(`${incomingDbLower}::doi:${dk}`);
      if (tk.length > 12) seenSameDb.add(`${incomingDbLower}::title:${tk}`);

      const canonical = (dk && canonByDoi.get(dk)) || (tk.length > 12 ? canonByTitle.get(tk) : undefined);

      if (canonical && (canonical.sourceDatabase || 'Other').toLowerCase().trim() !== incomingDbLower) {
        // Cross-database duplicate: KEEP the identified database record AND flag as duplicate for PRISMA!
        const prevMatched =
          canonicalUpdates.get(canonical.id)?.duplicateMatchedDatabases ||
          canonical.duplicateMatchedDatabases ||
          [canonical.sourceDatabase];
        const mergedDatabases = Array.from(new Set([...prevMatched, canonical.sourceDatabase, incomingDb]));

        const canonicalPatch: Partial<Article> = {
          ...(canonicalUpdates.get(canonical.id) || {}),
          duplicateMatchedDatabases: mergedDatabases,
        };
        if (!canonical.pdfUrl && art.pdfUrl) {
          canonicalPatch.pdfUrl = art.pdfUrl;
          canonicalPatch.openAccessUrl = art.openAccessUrl || art.pdfUrl;
          canonicalPatch.accessStatus = 'downloadable';
        }
        canonicalUpdates.set(canonical.id, canonicalPatch);

        newRecordsToInsert.push({
          ...art,
          isDuplicate: true,
          duplicateOfId: canonical.id,
          duplicateMatchedDatabases: mergedDatabases,
          duplicateNote: `Published in multiple databases (${mergedDatabases.join(' & ')})`,
          screeningStage: 'excluded',
          decision: 'exclude',
          decisionReason: `Cross-database duplicate (also indexed in ${canonical.sourceDatabase})`,
        });
      } else {
        if (dk && !canonByDoi.has(dk)) canonByDoi.set(dk, art);
        if (tk.length > 12 && !canonByTitle.has(tk)) canonByTitle.set(tk, art);
        newRecordsToInsert.push(art);
      }
    }

    setProjects((prev) => {
      const next = prev.map((p) => {
        if (p.id !== targetId) return p;
        const currIds = new Set(p.articles.map((a) => a.id));
        const uniqueNew = newRecordsToInsert.filter((a) => !currIds.has(a.id));
        const updatedExisting = p.articles.map((ex) => {
          const patch = canonicalUpdates.get(ex.id);
          return patch ? { ...ex, ...patch } : ex;
        });
        return { ...p, articles: [...uniqueNew, ...updatedExisting] };
      });
      cacheProjectsOffline(next);
      return next;
    });

    if (!options?.keepOpen && newRecordsToInsert.length > 0 && targetId === currentProjectId) {
      setSelectedArticleId(newRecordsToInsert[0].id);
    }

    if (newRecordsToInsert.length > 0) {
      setAutoSaveStatus((prev) => ({
        ...prev,
        state: 'saving',
        label: `Saving ${newRecordsToInsert.length} Added Files`,
      }));
      apiService
        .uploadArticlesChunk(
          targetId,
          newRecordsToInsert,
          newRecordsToInsert.map((a) => a.sourceFileName).filter(Boolean) as string[]
        )
        .then(async (res) => {
          if (options?.pdfFilesByArticleId && options.pdfFilesByArticleId.size > 0) {
            await persistOriginalPdfFiles(targetId, options.pdfFilesByArticleId);
          }
          setAutoSaveStatus({
            state: 'saved',
            lastSavedAt: new Date().toISOString(),
            label: `${newRecordsToInsert.length} Files Saved`,
          });
          if (res?.databaseFolderPath) {
            setProjects((prev) =>
              prev.map((p) =>
                p.id === targetId ? { ...p, databaseFolderPath: res.databaseFolderPath } : p
              )
            );
          }
        })
        .catch((err) => console.warn('Chunk persistence warning:', err?.message));
    }
  };

  // Direct data file importer used inside Fast Batch Screener, Dashboard, and Core SLR Modules
  const handleDirectAddDataFiles = async (
    targetProjectId: string,
    files: FileList,
    options?: { autoScreen?: boolean; rescanQuery?: string; moduleId?: WorkbenchModuleId }
  ): Promise<{ addedCount: number }> => {
    const targetProj = projectsRef.current.find((p) => p.id === targetProjectId);
    if (!targetProj) throw new Error('Target review folder not found');

    setAutoSaveStatus((prev) => ({ ...prev, state: 'saving', label: 'Importing Data Files' }));
    const { articles: parsed, pdfFilesByArticleId } = await parseLocalDataFilesWithOriginals(files, targetProjectId);
    if (parsed.length === 0) {
      setAutoSaveStatus((prev) => ({ ...prev, state: 'idle' }));
      return { addedCount: 0 };
    }

    let finalArticles = parsed;
    if (options?.autoScreen) {
      let inc = 0;
      let exc = 0;
      let unc = 0;
      const start = performance.now();
      finalArticles = parsed.map((art) => {
        const res = evaluateArticleClient(art, targetProj);
        if (res.decision === 'include') inc++;
        else if (res.decision === 'exclude') exc++;
        else unc++;
        return {
          ...art,
          decision: res.decision,
          decisionReason: res.decision === 'exclude' ? res.primaryReason : undefined,
          screeningStage:
            res.decision === 'include'
              ? ('final_included' as const)
              : res.decision === 'exclude'
              ? ('excluded' as const)
              : ('full_text' as const),
          aiSuggestedDecision: res.decision,
          aiConfidence: res.confidenceScore,
          aiReason: res.primaryReason,
          extractedData: mergeScreeningInsightsIntoExtractedData(art.extractedData, res),
        };
      });
      const elapsed = parseFloat(((performance.now() - start) / 1000).toFixed(2));
      const nowIso = new Date().toISOString();
      const runRecord = {
        runId: `run-add-${Date.now()}`,
        completedAt: nowIso,
        mode: 'newly_added_files' as const,
        processed: finalArticles.length,
        total: finalArticles.length,
        included: inc,
        excluded: exc,
        uncertain: unc,
        speed: Math.round(finalArticles.length / Math.max(elapsed, 0.05)),
        elapsedSeconds: elapsed,
      };
      handleUpdateWorkbenchState(
        targetProjectId,
        (prevWs) => ({
          ...prevWs,
          batchScreener: {
            lastStats: runRecord,
            lastRunAt: nowIso,
            history: [runRecord, ...(prevWs.batchScreener?.history || [])].slice(0, 15),
          },
        }),
        { immediate: true, moduleId: 'batch_screener', label: 'Auto-Screened Added Files' }
      );
    }

    handleAddMultipleArticles(finalArticles, {
      targetProjectId,
      keepOpen: true,
      pdfFilesByArticleId,
    });

    if (options?.rescanQuery?.trim()) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      await handleRescanWithQueryQA(
        targetProjectId,
        options.moduleId || 'screening',
        options.rescanQuery.trim(),
        Boolean(options.autoScreen)
      );
    }

    return { addedCount: finalArticles.length };
  };

  const handleOpenQuantSynthesis = useCallback((mode: 'qualitative' | 'quantitative' = 'quantitative') => {
    setQuantSynthesisMode(mode);
    setCurrentTab('quant_synthesis');
  }, []);

  const handleActivateProtocolInProject = useCallback(
    (updatedProject: ReviewProject, protocol: SystematicReviewProtocol) => {
      setProjects((prev) => {
        const next = prev.map((p) => {
          if (p.id !== updatedProject.id) return p;
          const nextWs: WorkbenchState = {
            ...(p.workbenchState || {}),
            ...(updatedProject.workbenchState || {}),
            protocolBuilder: {
              ...(p.workbenchState?.protocolBuilder || {}),
              ...(updatedProject.workbenchState?.protocolBuilder || {}),
              activeProtocol: protocol,
              updatedAt: new Date().toISOString(),
            },
          };
          return {
            ...p,
            ...updatedProject,
            articles: p.articles,
            workbenchState: nextWs,
          };
        });
        cacheProjectsOffline(next);
        return next;
      });
      setAutoSaveStatus({
        state: 'saved',
        lastSavedAt: new Date().toISOString(),
        label: `Protocol v${protocol.versionNumber} Activated`,
      });
    },
    []
  );

  const handleSelectArticleForScreening = (artId: string) => {
    setSelectedArticleId(artId);
    setCurrentTab('screening');
  };

  const handleSelectNext = () => {
    if (hasNext && isolatedCurrentProject) {
      setSelectedArticleId(isolatedCurrentProject.articles[currentIndex + 1].id);
    }
  };

  const handleSelectPrev = () => {
    if (hasPrev && isolatedCurrentProject) {
      setSelectedArticleId(isolatedCurrentProject.articles[currentIndex - 1].id);
    }
  };

  const handleSwitchProject = (newId: string) => {
    flushPendingWorkbenchSaves();
    setCurrentProjectId(newId);
    const proj = projects.find((p) => p.id === newId);
    const isolatedFirst =
      proj?.articles.find((a) => !a.projectId || a.projectId === newId)?.id || '';
    setSelectedArticleId(isolatedFirst);

    // Refresh ONLY this review's partitioned articles.json from disk
    apiService
      .fetchProjectArticlesPartition(newId)
      .then((partition) => {
        if (!partition) return;
        const strictArticles = (partition.articles || []).map((a) => ({
          ...a,
          projectId: newId,
        }));
        setProjects((prev) =>
          prev.map((p) =>
            p.id === newId
              ? {
                  ...p,
                  databaseFolderPath: partition.databaseFolderPath || p.databaseFolderPath,
                  articles: strictArticles,
                }
              : p
          )
        );
        setSelectedArticleId((prevSel) => {
          if (prevSel && strictArticles.some((a) => a.id === prevSel)) return prevSel;
          return strictArticles[0]?.id || '';
        });
      })
      .catch(() => {
        // Keep current in-memory partition if server partition fetch is unavailable
      });
  };

  // Restore Project from Backup JSON (excludes any previously deleted records in that folder)
  const handleRestoreProject = (restoredProject: ReviewProject) => {
    const isolated: ReviewProject = {
      ...restoredProject,
      articles: (restoredProject.articles || []).map((a) => ({
        ...a,
        projectId: restoredProject.id,
      })),
    };
    apiService
      .createProjectFolder(isolated)
      .then((saved) => {
        const cleanSaved: ReviewProject = {
          ...isolated,
          ...saved,
          articles: (saved?.articles || []).map((a: Article) => ({
            ...a,
            projectId: isolated.id,
          })),
        };
        setProjects((prev) => {
          const exists = prev.some((p) => p.id === cleanSaved.id);
          return exists
            ? prev.map((p) => (p.id === cleanSaved.id ? cleanSaved : p))
            : [cleanSaved, ...prev];
        });
        setCurrentProjectId(cleanSaved.id);
        setSelectedArticleId(cleanSaved.articles[0]?.id || '');
        setCurrentTab('dashboard');
      })
      .catch(() => {
        setProjects((prev) => {
          const exists = prev.some((p) => p.id === isolated.id);
          return exists ? prev.map((p) => (p.id === isolated.id ? isolated : p)) : [isolated, ...prev];
        });
        setCurrentProjectId(isolated.id);
        setSelectedArticleId(isolated.articles[0]?.id || '');
        setCurrentTab('dashboard');
      });
  };

  // One-click Backup: persist folder to disk & download complete portable SLR Backup (.json)
  const handleDownloadProjectBackup = () => {
    if (!isolatedCurrentProject) return;
    handleSaveFolderChanges(isolatedCurrentProject.id).catch(() => {});
    const activeOnlyArticles = (isolatedCurrentProject.articles || []).filter(
      (a) => !a.projectId || a.projectId === isolatedCurrentProject.id
    );
    const backupData = {
      format: 'ResearchMate-SLR-Backup',
      version: '1.3',
      exportedAt: new Date().toISOString(),
      project: {
        ...isolatedCurrentProject,
        articles: activeOnlyArticles,
      },
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.download = `${isolatedCurrentProject.id}-complete-slr-backup-${dateStamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Create New Project (Manual Blank — creates dedicated partitioned storing database & empty individual library without touching existing folders)
  const handleCreateNewProject = async (newProject: ReviewProject) => {
    const isolatedProject: ReviewProject = {
      ...newProject,
      articles: [],
    };
    setProjects((prev) => [isolatedProject, ...prev]);
    setCurrentProjectId(isolatedProject.id);
    setSelectedArticleId('');
    setCurrentTab('folders');

    try {
      const saved = await apiService.createProjectFolder(isolatedProject);
      if (saved) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === saved.id
              ? {
                  ...p,
                  databaseFolderName: saved.databaseFolderName,
                  databaseFolderPath: saved.databaseFolderPath,
                  updatedAt: saved.updatedAt,
                  articles: p.articles.length > 0 ? p.articles : saved.articles || [],
                }
              : p
          )
        );
      }
    } catch (err: any) {
      console.warn('Create review folder warning:', err?.message);
    }
  };

  const handleOpenAddModal = (tab: 'manual' | 'bulk_local' | 'online' = 'manual') => {
    setAddModalInitialTab(tab);
    setIsAddModalOpen(true);
  };

  const handleOpenAddFilesForProject = (projectId: string) => {
    handleSwitchProject(projectId);
    setAddModalInitialTab('bulk_local');
    setIsAddModalOpen(true);
  };

  // Auto-Sync Screening against current PICOC & Eligibility Criteria (strictly scoped to active review)
  const handleAutoSyncScreeningCriteria = () => {
    if (!isolatedCurrentProject) return;
    const updated = isolatedCurrentProject.articles.map((art) => {
      if (art.isDuplicate) return art;
      const res = evaluateArticleClient(art, isolatedCurrentProject);
      const preservedManualCitations = (art.evidenceCitations || []).filter(
        (c) =>
          !c.id?.startsWith('ev-') &&
          !c.id?.startsWith('ai-ev-') &&
          !/geographic\s+verification\s+needed|abstract\s*\/\s*eligibility\s+check|title\s*&\s*filename\s+screening/i.test(
            c.section || ''
          )
      );
      const mappedCitations =
        res.pageEvidence && res.pageEvidence.length > 0
          ? [
              ...preservedManualCitations,
              ...res.pageEvidence.map((ev, i) => ({
                id: `ev-${art.id}-${i}-${Date.now()}`,
                pageNumber: ev.pageNumber,
                section: ev.section || ev.sectionName || 'Evidence Finding',
                quote: ev.exactQuote,
                relevance: ev.relevance,
              })),
            ]
          : preservedManualCitations;

      return {
        ...art,
        projectId: isolatedCurrentProject.id,
        decision: res.decision,
        decisionReason: res.primaryReason,
        screeningStage:
          res.decision === 'include'
            ? ('final_included' as const)
            : res.decision === 'exclude'
            ? ('excluded' as const)
            : ('title_abstract' as const),
        aiSuggestedDecision: res.decision,
        aiConfidence: res.confidenceScore,
        aiReason: res.detailedExplanation,
        evidenceCitations: mappedCitations,
        extractedData: mergeScreeningInsightsIntoExtractedData(art.extractedData, res),
      };
    });
    handleUpdateArticles(updated);
  };

  const activeArticles = isolatedCurrentProject?.articles || [];
  const duplicatesCount = activeArticles.filter((a) => a.isDuplicate).length;
  const includedCount = activeArticles.filter((a) => a.decision === 'include').length;
  const starredCount = activeArticles.filter((a) => a.isStarred).length;
  const unscreenedCount = activeArticles.filter(
    (a) => a.decision === 'unscreened' && !a.isDuplicate
  ).length;

  if (surfaceView === 'website') {
    return (
      <LandingWebsite
        initialSection={websiteSection}
        onEnterWorkbench={() => navigateSurface('workbench')}
        onOpenBilling={() => navigateSurface('billing')}
        onOpenAdmin={() => navigateSurface('admin')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-600/30 selection:text-indigo-200">
      {activeAnnouncements.length > 0 && (
        <div className="bg-indigo-950/80 border-b border-indigo-500/30 text-indigo-100 px-4 py-2 text-xs text-center">
          <span className="font-bold">{activeAnnouncements[0].title}: </span>
          <span>{activeAnnouncements[0].message}</span>
        </div>
      )}
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      {/* Top Universal Navbar */}
      <Navbar
        currentTab={currentTab}
        onTabChange={(tab) => {
          setSurfaceView('workbench');
          setCurrentTab(tab);
        }}
        projects={projects}
        currentProjectId={currentProjectId}
        onSwitchProject={handleSwitchProject}
        deviceMode={deviceMode}
        onToggleDeviceMode={() =>
          setDeviceMode(deviceMode === 'desktop' ? 'mobile' : 'desktop')
        }
        articlesCount={activeArticles.length}
        includedCount={includedCount}
        duplicatesCount={duplicatesCount}
        starredCount={starredCount}
        unscreenedCount={unscreenedCount}
        onOpenAddModal={() => handleOpenAddModal('bulk_local')}
        onCreateNewReview={() => setIsCreateReviewOpen(true)}
        onOpenManualPaperModal={() => handleOpenAddModal('manual')}
        onBackupProject={handleDownloadProjectBackup}
        onOpenCloudWorkspace={() => {
          setSuiteInitialTab('cloud');
          setIsResearchSuiteOpen(true);
        }}
        syncStatus={syncStatus}
        pendingOpsCount={pendingOps.length}
        onOpenWebsite={() => navigateSurface('website', 'overview')}
        onOpenBilling={() => navigateSurface('billing')}
        onOpenAdmin={() => navigateSurface('admin')}
      />

      {surfaceView === 'billing' ? (
        <AccountBillingPortal
          projects={projects}
          currentProject={isolatedCurrentProject}
          syncStatus={syncStatus}
          pendingOps={pendingOps}
          onManualSyncAll={handleManualSyncAll}
          onBackToWorkbench={() => navigateSurface('workbench')}
        />
      ) : surfaceView === 'admin' ? (
        <AdminDashboard onBackToWorkbench={() => navigateSurface('workbench')} />
      ) : (
        /* Main Workspace: Empty Database State, Wide Desktop, or Simulated Android Mobile */
        <main className="flex-1 flex flex-col">
        {!isolatedCurrentProject ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-xl">
              <h2 className="text-xl font-bold text-white">
                {isLoadingProjects
                  ? 'Loading Partitioned Databases...'
                  : loadError
                  ? 'Database Connection Interrupted'
                  : 'No Saved Review Folders Yet'}
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                {isLoadingProjects
                  ? 'Reading isolated review partitions from disk...'
                  : loadError
                  ? `${loadError} Your existing review folders on disk were NOT cleared.`
                  : 'Create a new partitioned Review Folder using clean manual placeholders — each new review gets its own separate database folder (articles.json) and existing folders are never auto-cleared.'}
              </p>
              {!isLoadingProjects && (
                <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                  {loadError && (
                    <button
                      type="button"
                      onClick={reloadProjectsFromDisk}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition cursor-pointer"
                    >
                      Retry Loading Saved Folders
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsCreateReviewOpen(true)}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white text-xs font-bold shadow-md transition cursor-pointer"
                  >
                    + Create New Review Partition
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : deviceMode === 'mobile' ? (
          <div className="flex-1 flex items-center justify-center p-2 sm:p-6 bg-slate-950/80">
            {/* Android Mobile Frame */}
            <div className="w-full max-w-[430px] h-[860px] bg-slate-900 border-4 border-slate-700 rounded-[44px] shadow-2xl flex flex-col overflow-hidden relative ring-1 ring-slate-800">
              {/* Android Notch / Speaker */}
              <div className="h-6 bg-slate-950 flex items-center justify-between px-6 text-[11px] text-slate-400 select-none pt-1">
                <span>9:41</span>
                <div className="w-16 h-3.5 bg-black rounded-full" />
                <span>5G 100%</span>
              </div>

              {/* Scrollable Mobile Body */}
              <div className="flex-1 overflow-y-auto">
                <ProjectInfoBanner
                  project={isolatedCurrentProject}
                  onUpdateProject={handleUpdateProject}
                  onSwitchProject={handleSwitchProject}
                  onCreateNewReview={() => setIsCreateReviewOpen(true)}
                />
                <div className="p-3">
                  {currentTab === 'dashboard' && (
                    <DashboardOverview
                      project={isolatedCurrentProject}
                      onNavigateTab={setCurrentTab}
                      onSelectArticleForScreening={handleSelectArticleForScreening}
                      onToggleStarArticle={handleToggleStarArticle}
                      onOpenAddModal={() => handleOpenAddModal('bulk_local')}
                      onCreateNewReview={() => setIsCreateReviewOpen(true)}
                      onOpenManualPaperModal={() => handleOpenAddModal('manual')}
                      onOpenResearchSuite={() => setIsResearchSuiteOpen(true)}
                      onOpenFastBatchScreener={() => {
                        setOpenBatchScreenerOnLibrary(true);
                        setCurrentTab('library');
                      }}
                      onOpenQuantSynthesis={handleOpenQuantSynthesis}
                      onBackupProject={handleDownloadProjectBackup}
                      onRestoreProject={handleRestoreProject}
                      autoSaveStatus={autoSaveStatus}
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                    />
                  )}
                  {currentTab === 'folders' && (
                    <SavedReviewFolders
                      projects={projects}
                      currentProjectId={currentProjectId}
                      onSwitchProject={handleSwitchProject}
                      onOpenProjectLibrary={(projId) => {
                        handleSwitchProject(projId);
                        setCurrentTab('library');
                      }}
                      onCreateNewReview={() => setIsCreateReviewOpen(true)}
                      onSaveFolderChanges={handleSaveFolderChanges}
                      onRenameProjectFolder={handleRenameProjectFolder}
                      onUpdateProject={handleUpdateProject}
                      onDeleteProjectFolder={handleDeleteProjectFolder}
                      onOpenAddFilesForProject={handleOpenAddFilesForProject}
                    />
                  )}
                  {currentTab === 'interesting' && (
                    <ArticleLibrary
                      project={isolatedCurrentProject}
                      allProjects={projects}
                      onSwitchProject={handleSwitchProject}
                      onCreateNewReview={() => setIsCreateReviewOpen(true)}
                      initialStageFilter="starred"
                      onUpdateArticles={handleUpdateArticles}
                      onBulkRemoveFromFolder={handleBulkRemoveFromFolder}
                      onRestoredDeletedArticles={handleRestoredDeletedOnlineArticles}
                      onSaveFolderChanges={handleSaveFolderChanges}
                      onDeleteProjectFolder={handleDeleteProjectFolder}
                      onSelectArticleForScreening={handleSelectArticleForScreening}
                      onOpenCrossrefModal={() => setIsCrossrefOpen(true)}
                      onOpenAddModal={() => handleOpenAddModal('bulk_local')}
                      onOpenManualPaperModal={() => handleOpenAddModal('manual')}
                      onAddMultipleArticles={handleAddMultipleArticles}
                      autoSaveStatus={autoSaveStatus}
                      onUpdateWorkbenchState={(updater, opts) =>
                        handleUpdateWorkbenchState(isolatedCurrentProject.id, updater, opts)
                      }
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onAttachOriginalPdf={handleAttachOriginalPdfToArticle}
                    />
                  )}
                  {currentTab === 'picoc' && (
                    <PicocRulesManager
                      project={isolatedCurrentProject}
                      onUpdateProject={handleUpdateProject}
                      onAutoSyncScreening={handleAutoSyncScreeningCriteria}
                      onOpenProtocolBuilder={() => setCurrentTab('protocol_builder')}
                      autoSaveStatus={autoSaveStatus}
                      isCloudSynced={Boolean(idToken)}
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                    />
                  )}
                  {currentTab === 'library' && (
                    <ArticleLibrary
                      project={isolatedCurrentProject}
                      allProjects={projects}
                      onSwitchProject={handleSwitchProject}
                      onCreateNewReview={() => setIsCreateReviewOpen(true)}
                      onUpdateArticles={handleUpdateArticles}
                      onBulkRemoveFromFolder={handleBulkRemoveFromFolder}
                      onRestoredDeletedArticles={handleRestoredDeletedOnlineArticles}
                      onSaveFolderChanges={handleSaveFolderChanges}
                      onDeleteProjectFolder={handleDeleteProjectFolder}
                      onSelectArticleForScreening={handleSelectArticleForScreening}
                      onOpenCrossrefModal={() => setIsCrossrefOpen(true)}
                      onOpenAddModal={() => handleOpenAddModal('bulk_local')}
                      onOpenManualPaperModal={() => handleOpenAddModal('manual')}
                      onAddMultipleArticles={handleAddMultipleArticles}
                      autoOpenBatchScreener={openBatchScreenerOnLibrary}
                      onBatchScreenerOpened={() => setOpenBatchScreenerOnLibrary(false)}
                      autoSaveStatus={autoSaveStatus}
                      onUpdateWorkbenchState={(updater, opts) =>
                        handleUpdateWorkbenchState(isolatedCurrentProject.id, updater, opts)
                      }
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onAttachOriginalPdf={handleAttachOriginalPdfToArticle}
                    />
                  )}
                  {currentTab === 'duplicates' && (
                    <DuplicateResolver
                      project={isolatedCurrentProject}
                      onUpdateArticles={handleUpdateArticles}
                      onNavigateToScreening={handleSelectArticleForScreening}
                      autoSaveStatus={autoSaveStatus}
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                    />
                  )}
                  {currentTab === 'title_screening' && (
                    <TitleScreeningWorkbench
                      project={isolatedCurrentProject}
                      articles={isolatedCurrentProject.articles}
                      onUpdateArticle={handleUpdateArticle}
                      onNavigateToFullText={handleSelectArticleForScreening}
                      onToggleStarArticle={handleToggleStarArticle}
                      autoSaveStatus={autoSaveStatus}
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                    />
                  )}
                  {currentTab === 'screening' && selectedArticle && (
                    <ScreeningWorkbench
                      project={isolatedCurrentProject}
                      article={selectedArticle}
                      onUpdateArticle={handleUpdateArticle}
                      onSelectNext={handleSelectNext}
                      onSelectPrev={handleSelectPrev}
                      hasPrev={hasPrev}
                      hasNext={hasNext}
                      onBackToLibrary={() => setCurrentTab('library')}
                      autoSaveStatus={autoSaveStatus}
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                      onAttachOriginalPdf={handleAttachOriginalPdfToArticle}
                    />
                  )}
                  {currentTab === 'extraction' && (
                    <EvidenceExtractionMatrix
                      project={isolatedCurrentProject}
                      articles={isolatedCurrentProject.articles}
                      onUpdateArticle={handleUpdateArticle}
                      onBatchUpdateArticles={handleUpdateArticles}
                      onNavigateToScreening={handleSelectArticleForScreening}
                      onOpenQuantSynthesis={() => handleOpenQuantSynthesis('quantitative')}
                      autoSaveStatus={autoSaveStatus}
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                    />
                  )}
                  {currentTab === 'appraisal' && selectedArticle && (
                    <AppraisalWorksheet
                      project={isolatedCurrentProject}
                      article={selectedArticle}
                      onUpdateArticle={handleUpdateArticle}
                      articles={isolatedCurrentProject.articles}
                      onSelectArticle={setSelectedArticleId}
                      autoSaveStatus={autoSaveStatus}
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                    />
                  )}
                  {currentTab === 'prisma' && (
                    <PrismaDiagram
                      project={isolatedCurrentProject}
                      onUpdateArticle={handleUpdateArticle}
                      onUpdateProject={handleUpdateProject}
                      onOpenSynthesis={handleOpenQuantSynthesis}
                      onOpenRecovery={() => setCurrentTab('recovery')}
                      autoSaveStatus={autoSaveStatus}
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                    />
                  )}
                  {currentTab === 'recovery' && (
                    <RecoveryReconciliationWorkspace
                      project={isolatedCurrentProject}
                      onNavigateTab={setCurrentTab}
                      autoSaveStatus={autoSaveStatus}
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onProjectReplaced={(updatedProj) => {
                        const isoProj = {
                          ...updatedProj,
                          articles: (updatedProj.articles || []).map((a) => ({
                            ...a,
                            projectId: updatedProj.id,
                          })),
                        };
                        setProjects((prev) => {
                          const next = prev.map((p) => (p.id === isoProj.id ? isoProj : p));
                          cacheProjectsOffline(next);
                          return next;
                        });
                      }}
                    />
                  )}
                  {currentTab === 'results' && (
                    <IncludedResultsSynthesis
                      project={isolatedCurrentProject}
                      articles={isolatedCurrentProject.articles}
                      onNavigateToBriefing={() => setCurrentTab('briefing')}
                      onNavigateToProposal={() => setCurrentTab('proposal')}
                      onNavigateToSynthesis={handleOpenQuantSynthesis}
                      onSelectArticle={handleSelectArticleForScreening}
                      autoSaveStatus={autoSaveStatus}
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                      onAttachOriginalPdf={handleAttachOriginalPdfToArticle}
                    />
                  )}
                  {currentTab === 'briefing' && (
                    <ResearchBriefingModule
                      project={isolatedCurrentProject}
                      articles={isolatedCurrentProject.articles}
                      onUpdateArticles={handleUpdateArticles}
                      autoSaveStatus={autoSaveStatus}
                      onSaveBriefingState={(briefingState, immediate) =>
                        handleUpdateWorkbenchState(
                          isolatedCurrentProject.id,
                          { briefing: briefingState },
                          { immediate, moduleId: 'briefing', label: 'NotebookLM Studio' }
                        )
                      }
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                    />
                  )}
                  {currentTab === 'proposal' && (
                    <ProposalGenerator
                      project={isolatedCurrentProject}
                      autoSaveStatus={autoSaveStatus}
                      onSaveProposalState={(proposalState, immediate) =>
                        handleUpdateWorkbenchState(
                          isolatedCurrentProject.id,
                          { proposal: proposalState },
                          { immediate, moduleId: 'proposal', label: 'Proposal Generator' }
                        )
                      }
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                    />
                  )}
                  {currentTab === 'export' && (
                    <ExportReportModule
                      project={isolatedCurrentProject}
                      onRestoreProject={handleRestoreProject}
                      autoSaveStatus={autoSaveStatus}
                      onSaveExportState={(exportConfig, immediate) =>
                        handleUpdateWorkbenchState(
                          isolatedCurrentProject.id,
                          { exportConfig },
                          { immediate, moduleId: 'export', label: 'Export Hub Config' }
                        )
                      }
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                    />
                  )}
                  {currentTab === 'protocol_builder' && (
                    <ProtocolBuilderWorkspace
                      project={isolatedCurrentProject}
                      articles={isolatedCurrentProject.articles}
                      onActivateProtocolInProject={handleActivateProtocolInProject}
                      onNavigateToModule={setCurrentTab}
                      autoSaveStatus={autoSaveStatus}
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                    />
                  )}
                  {currentTab === 'quant_synthesis' && (
                    <QuantitativeSynthesisWorkspace
                      project={isolatedCurrentProject}
                      articles={isolatedCurrentProject.articles}
                      initialMode={quantSynthesisMode}
                      onUpdateWorkbenchState={(patch, moduleId) =>
                        handleUpdateWorkbenchState(isolatedCurrentProject.id, patch, {
                          immediate: true,
                          moduleId: moduleId || 'quant_synthesis',
                          label: 'Quantitative Synthesis & Meta-Analysis',
                        })
                      }
                      onSelectArticle={handleSelectArticleForScreening}
                      onNavigateToModule={setCurrentTab}
                      autoSaveStatus={autoSaveStatus}
                      onResetWorkbenchModule={(params) =>
                        handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                      }
                      onDirectAddDataFiles={(files, opts) =>
                        handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                      }
                      onRescanWithQueryQA={(modId, q, apply) =>
                        handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                      }
                      onDeleteQaEntry={(modId, recId) =>
                        handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                      }
                      onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                    />
                  )}
                </div>
              </div>

              {/* Android Bottom Home Bar */}
              <div className="h-5 bg-slate-950 flex items-center justify-center">
                <div className="w-28 h-1 bg-slate-600 rounded-full" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Project Info Banner */}
            <ProjectInfoBanner
              project={isolatedCurrentProject}
              onUpdateProject={handleUpdateProject}
              onSwitchProject={handleSwitchProject}
              onCreateNewReview={() => setIsCreateReviewOpen(true)}
            />

            {/* Desktop Workspace Content Container */}
            <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1">
              {currentTab === 'dashboard' && (
                <DashboardOverview
                  project={isolatedCurrentProject}
                  onNavigateTab={setCurrentTab}
                  onSelectArticleForScreening={handleSelectArticleForScreening}
                  onToggleStarArticle={handleToggleStarArticle}
                  onOpenAddModal={() => handleOpenAddModal('bulk_local')}
                  onCreateNewReview={() => setIsCreateReviewOpen(true)}
                  onOpenManualPaperModal={() => handleOpenAddModal('manual')}
                  onOpenResearchSuite={() => setIsResearchSuiteOpen(true)}
                  onOpenFastBatchScreener={() => {
                    setOpenBatchScreenerOnLibrary(true);
                    setCurrentTab('library');
                  }}
                  onOpenQuantSynthesis={handleOpenQuantSynthesis}
                  onBackupProject={handleDownloadProjectBackup}
                  onRestoreProject={handleRestoreProject}
                  autoSaveStatus={autoSaveStatus}
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                />
              )}

              {currentTab === 'folders' && (
                <SavedReviewFolders
                  projects={projects}
                  currentProjectId={currentProjectId}
                  onSwitchProject={handleSwitchProject}
                  onOpenProjectLibrary={(projId) => {
                    handleSwitchProject(projId);
                    setCurrentTab('library');
                  }}
                  onCreateNewReview={() => setIsCreateReviewOpen(true)}
                  onSaveFolderChanges={handleSaveFolderChanges}
                  onRenameProjectFolder={handleRenameProjectFolder}
                  onUpdateProject={handleUpdateProject}
                  onDeleteProjectFolder={handleDeleteProjectFolder}
                  onOpenAddFilesForProject={handleOpenAddFilesForProject}
                />
              )}

              {currentTab === 'interesting' && (
                <ArticleLibrary
                  project={isolatedCurrentProject}
                  allProjects={projects}
                  onSwitchProject={handleSwitchProject}
                  onCreateNewReview={() => setIsCreateReviewOpen(true)}
                  initialStageFilter="starred"
                  onUpdateArticles={handleUpdateArticles}
                  onBulkRemoveFromFolder={handleBulkRemoveFromFolder}
                  onRestoredDeletedArticles={handleRestoredDeletedOnlineArticles}
                  onSaveFolderChanges={handleSaveFolderChanges}
                  onDeleteProjectFolder={handleDeleteProjectFolder}
                  onSelectArticleForScreening={handleSelectArticleForScreening}
                  onOpenCrossrefModal={() => setIsCrossrefOpen(true)}
                  onOpenAddModal={() => handleOpenAddModal('bulk_local')}
                  onOpenManualPaperModal={() => handleOpenAddModal('manual')}
                  onAddMultipleArticles={handleAddMultipleArticles}
                  onAttachOriginalPdf={handleAttachOriginalPdfToArticle}
                  autoSaveStatus={autoSaveStatus}
                  onUpdateWorkbenchState={(updater, opts) =>
                    handleUpdateWorkbenchState(isolatedCurrentProject.id, updater, opts)
                  }
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                />
              )}

              {currentTab === 'picoc' && (
                <PicocRulesManager
                  project={isolatedCurrentProject}
                  onUpdateProject={handleUpdateProject}
                  onAutoSyncScreening={handleAutoSyncScreeningCriteria}
                  onOpenProtocolBuilder={() => setCurrentTab('protocol_builder')}
                  autoSaveStatus={autoSaveStatus}
                  isCloudSynced={Boolean(idToken)}
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}

              {currentTab === 'library' && (
                <ArticleLibrary
                  project={isolatedCurrentProject}
                  allProjects={projects}
                  onSwitchProject={handleSwitchProject}
                  onCreateNewReview={() => setIsCreateReviewOpen(true)}
                  onUpdateArticles={handleUpdateArticles}
                  onBulkRemoveFromFolder={handleBulkRemoveFromFolder}
                  onRestoredDeletedArticles={handleRestoredDeletedOnlineArticles}
                  onSaveFolderChanges={handleSaveFolderChanges}
                  onDeleteProjectFolder={handleDeleteProjectFolder}
                  onSelectArticleForScreening={handleSelectArticleForScreening}
                  onOpenCrossrefModal={() => setIsCrossrefOpen(true)}
                  onOpenAddModal={() => handleOpenAddModal('bulk_local')}
                  onOpenManualPaperModal={() => handleOpenAddModal('manual')}
                  onAddMultipleArticles={handleAddMultipleArticles}
                  onAttachOriginalPdf={handleAttachOriginalPdfToArticle}
                  autoOpenBatchScreener={openBatchScreenerOnLibrary}
                  onBatchScreenerOpened={() => setOpenBatchScreenerOnLibrary(false)}
                  autoSaveStatus={autoSaveStatus}
                  onUpdateWorkbenchState={(updater, opts) =>
                    handleUpdateWorkbenchState(isolatedCurrentProject.id, updater, opts)
                  }
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                />
              )}

              {currentTab === 'duplicates' && (
                <DuplicateResolver
                  project={isolatedCurrentProject}
                  onUpdateArticles={handleUpdateArticles}
                  onNavigateToScreening={handleSelectArticleForScreening}
                  autoSaveStatus={autoSaveStatus}
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}

              {currentTab === 'title_screening' && (
                <TitleScreeningWorkbench
                  project={isolatedCurrentProject}
                  articles={isolatedCurrentProject.articles}
                  onUpdateArticle={handleUpdateArticle}
                  onNavigateToFullText={handleSelectArticleForScreening}
                  onToggleStarArticle={handleToggleStarArticle}
                  autoSaveStatus={autoSaveStatus}
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}

              {currentTab === 'screening' && selectedArticle && (
                <ScreeningWorkbench
                  project={isolatedCurrentProject}
                  article={selectedArticle}
                  onUpdateArticle={handleUpdateArticle}
                  onAttachOriginalPdf={handleAttachOriginalPdfToArticle}
                  onSelectNext={handleSelectNext}
                  onSelectPrev={handleSelectPrev}
                  hasPrev={hasPrev}
                  hasNext={hasNext}
                  onBackToLibrary={() => setCurrentTab('library')}
                  autoSaveStatus={autoSaveStatus}
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}

              {currentTab === 'extraction' && (
                <EvidenceExtractionMatrix
                  project={isolatedCurrentProject}
                  articles={isolatedCurrentProject.articles}
                  onUpdateArticle={handleUpdateArticle}
                  onBatchUpdateArticles={handleUpdateArticles}
                  onNavigateToScreening={handleSelectArticleForScreening}
                  onOpenQuantSynthesis={() => handleOpenQuantSynthesis('quantitative')}
                  autoSaveStatus={autoSaveStatus}
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}

              {currentTab === 'appraisal' && selectedArticle && (
                <AppraisalWorksheet
                  project={isolatedCurrentProject}
                  article={selectedArticle}
                  onUpdateArticle={handleUpdateArticle}
                  articles={isolatedCurrentProject.articles}
                  onSelectArticle={setSelectedArticleId}
                  autoSaveStatus={autoSaveStatus}
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}

              {currentTab === 'prisma' && (
                <PrismaDiagram
                  project={isolatedCurrentProject}
                  onUpdateArticle={handleUpdateArticle}
                  onUpdateProject={handleUpdateProject}
                  onOpenSynthesis={handleOpenQuantSynthesis}
                  onOpenRecovery={() => setCurrentTab('recovery')}
                  autoSaveStatus={autoSaveStatus}
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}
              {currentTab === 'recovery' && (
                <RecoveryReconciliationWorkspace
                  project={isolatedCurrentProject}
                  onNavigateTab={setCurrentTab}
                  autoSaveStatus={autoSaveStatus}
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onProjectReplaced={(updatedProj) => {
                    const isoProj = {
                      ...updatedProj,
                      articles: (updatedProj.articles || []).map((a) => ({
                        ...a,
                        projectId: updatedProj.id,
                      })),
                    };
                    setProjects((prev) => {
                      const next = prev.map((p) => (p.id === isoProj.id ? isoProj : p));
                      cacheProjectsOffline(next);
                      return next;
                    });
                  }}
                />
              )}

              {currentTab === 'results' && (
                <IncludedResultsSynthesis
                  project={isolatedCurrentProject}
                  articles={isolatedCurrentProject.articles}
                  onNavigateToBriefing={() => setCurrentTab('briefing')}
                  onNavigateToProposal={() => setCurrentTab('proposal')}
                  onNavigateToSynthesis={handleOpenQuantSynthesis}
                  onSelectArticle={handleSelectArticleForScreening}
                  onAttachOriginalPdf={handleAttachOriginalPdfToArticle}
                  autoSaveStatus={autoSaveStatus}
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}

              {currentTab === 'briefing' && (
                <ResearchBriefingModule
                  project={isolatedCurrentProject}
                  articles={isolatedCurrentProject.articles}
                  onUpdateArticles={handleUpdateArticles}
                  autoSaveStatus={autoSaveStatus}
                  onSaveBriefingState={(briefingState, immediate) =>
                    handleUpdateWorkbenchState(
                      isolatedCurrentProject.id,
                      { briefing: briefingState },
                      { immediate, moduleId: 'briefing', label: 'NotebookLM Studio' }
                    )
                  }
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}

              {currentTab === 'proposal' && (
                <ProposalGenerator
                  project={isolatedCurrentProject}
                  autoSaveStatus={autoSaveStatus}
                  onSaveProposalState={(proposalState, immediate) =>
                    handleUpdateWorkbenchState(
                      isolatedCurrentProject.id,
                      { proposal: proposalState },
                      { immediate, moduleId: 'proposal', label: 'Proposal Generator' }
                    )
                  }
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}

              {currentTab === 'export' && (
                <ExportReportModule
                  project={isolatedCurrentProject}
                  onRestoreProject={handleRestoreProject}
                  autoSaveStatus={autoSaveStatus}
                  onSaveExportState={(exportConfig, immediate) =>
                    handleUpdateWorkbenchState(
                      isolatedCurrentProject.id,
                      { exportConfig },
                      { immediate, moduleId: 'export', label: 'Export Hub Config' }
                    )
                  }
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}

              {currentTab === 'protocol_builder' && (
                <ProtocolBuilderWorkspace
                  project={isolatedCurrentProject}
                  articles={isolatedCurrentProject.articles}
                  onActivateProtocolInProject={handleActivateProtocolInProject}
                  onNavigateToModule={setCurrentTab}
                  autoSaveStatus={autoSaveStatus}
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}

              {currentTab === 'quant_synthesis' && (
                <QuantitativeSynthesisWorkspace
                  project={isolatedCurrentProject}
                  articles={isolatedCurrentProject.articles}
                  initialMode={quantSynthesisMode}
                  onUpdateWorkbenchState={(patch, moduleId) =>
                    handleUpdateWorkbenchState(isolatedCurrentProject.id, patch, {
                      immediate: true,
                      moduleId: moduleId || 'quant_synthesis',
                      label: 'Quantitative Synthesis & Meta-Analysis',
                    })
                  }
                  onSelectArticle={handleSelectArticleForScreening}
                  onNavigateToModule={setCurrentTab}
                  autoSaveStatus={autoSaveStatus}
                  onResetWorkbenchModule={(params) =>
                    handleResetWorkbenchModule(isolatedCurrentProject.id, params)
                  }
                  onDirectAddDataFiles={(files, opts) =>
                    handleDirectAddDataFiles(isolatedCurrentProject.id, files, opts)
                  }
                  onRescanWithQueryQA={(modId, q, apply) =>
                    handleRescanWithQueryQA(isolatedCurrentProject.id, modId, q, apply)
                  }
                  onDeleteQaEntry={(modId, recId) =>
                    handleDeleteQaRescanEntry(isolatedCurrentProject.id, modId, recId)
                  }
                  onOpenBulkImporter={() => handleOpenAddModal('bulk_local')}
                />
              )}
            </div>
          </div>
        )}
        </main>
      )}

      {/* Universal Modals */}
      <CreateReviewModal
        isOpen={isCreateReviewOpen}
        onClose={() => setIsCreateReviewOpen(false)}
        onCreateProject={handleCreateNewProject}
        existingFolderNames={
          projects
            .map(
              (p) =>
                p.databaseFolderName ||
                (p.databaseFolderPath ? p.databaseFolderPath.replace(/^database\/reviews\//, '') : '')
            )
            .filter(Boolean) as string[]
        }
      />

      <CrossrefLookupModal
        isOpen={isCrossrefOpen}
        onClose={() => setIsCrossrefOpen(false)}
        onAddArticle={handleAddArticle}
      />

      {isolatedCurrentProject && (
        <AddArticleModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAddArticle={handleAddArticle}
          onAddMultipleArticles={handleAddMultipleArticles}
          onDeleteArticlesByIds={async (ids, targetProjId) => {
            await handleBulkRemoveFromFolder(targetProjId || isolatedCurrentProject.id, {
              articleIds: ids,
              mode: 'ids',
            });
          }}
          onClearFolderArticles={async (targetProjId) => {
            await handleBulkRemoveFromFolder(targetProjId || isolatedCurrentProject.id, {
              mode: 'all',
            });
          }}
          onRestoredDeletedArticles={handleRestoredDeletedOnlineArticles}
          project={isolatedCurrentProject}
          allProjects={projects}
          onSwitchProject={handleSwitchProject}
          onCreateNewReview={() => setIsCreateReviewOpen(true)}
          initialTab={addModalInitialTab}
        />
      )}

      {isolatedCurrentProject && (
        <ResearchSuiteModal
          isOpen={isResearchSuiteOpen}
          onClose={() => setIsResearchSuiteOpen(false)}
          project={isolatedCurrentProject}
          initialTab={suiteInitialTab}
        />
      )}
      {isolatedCurrentProject && surfaceView === 'workbench' && (
        <GeminiChatbotDrawer
          project={isolatedCurrentProject}
          onUpdateWorkbenchState={handleUpdateWorkbenchState}
        />
      )}
      <OfflineIndicator pendingCount={pendingOps.length} />
    </div>
  );
}
