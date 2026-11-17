import React, { useState, useEffect, useMemo } from 'react';
import { ReviewProject, Article } from './types';
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
import { CrossrefLookupModal } from './components/CrossrefLookupModal';
import { AddArticleModal } from './components/AddArticleModal';
import { CreateReviewModal } from './components/CreateReviewModal';
import { SavedReviewFolders } from './components/SavedReviewFolders';
import { ResearchSuiteModal } from './components/suite/ResearchSuiteModal';
import { apiService, evaluateArticleClient } from './services/apiService';

export default function App() {
  const [projects, setProjects] = useState<ReviewProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [currentProjectId, setCurrentProjectId] = useState<string>('');
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedArticleId, setSelectedArticleId] = useState<string>('');
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop');

  // Modal states
  const [isCrossrefOpen, setIsCrossrefOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isCreateReviewOpen, setIsCreateReviewOpen] = useState<boolean>(false);
  const [isResearchSuiteOpen, setIsResearchSuiteOpen] = useState<boolean>(false);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState<boolean>(false);
  const [addModalInitialTab, setAddModalInitialTab] = useState<'manual' | 'bulk_local' | 'online'>('manual');

  useEffect(() => {
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

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
    setIsLoadingProjects(true);
    setLoadError('');
    apiService
      .fetchProjects()
      .then((serverProjects) => {
        if (!active) return;
        const list = Array.isArray(serverProjects) ? serverProjects : [];
        const sanitized = list.map((proj) => ({
          ...proj,
          articles: (proj.articles || [])
            .filter((a) => !a.projectId || a.projectId === proj.id)
            .map((a) => ({ ...a, projectId: proj.id })),
        }));
        setProjects(sanitized);
        if (sanitized.length > 0) {
          const resolvedActive =
            sanitized.find((p) => p.id === currentProjectId) || sanitized[0];
          setCurrentProjectId(resolvedActive.id);
          setSelectedArticleId(resolvedActive.articles[0]?.id || '');
        } else {
          setCurrentProjectId('');
          setSelectedArticleId('');
        }
      })
      .catch((err) => {
        if (!active) return;
        console.warn('Could not load review folders:', err?.message);
        setLoadError(err?.message || 'Could not reach database server.');
      })
      .finally(() => {
        if (active) setIsLoadingProjects(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Handlers for updating project cleanly with functional updates & backend folder sync
  const handleUpdateProject = (updated: ReviewProject) => {
    const isolatedUpdated: ReviewProject = {
      ...updated,
      articles: (updated.articles || []).map((a) => ({ ...a, projectId: updated.id })),
    };
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? isolatedUpdated : p)));
    apiService.updateProjectFolder(isolatedUpdated).then((saved) => {
      if (saved?.databaseFolderPath) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === saved.id
              ? {
                  ...p,
                  databaseFolderName: saved.databaseFolderName,
                  databaseFolderPath: saved.databaseFolderPath,
                }
              : p
          )
        );
      }
    }).catch((err) => console.warn('Folder sync warning:', err?.message));
  };

  const handleUpdateArticles = (newArticles: Article[]) => {
    if (!isolatedCurrentProject) return;
    const targetId = isolatedCurrentProject.id;
    const isolated = newArticles
      .filter((a) => !a.projectId || a.projectId === targetId)
      .map((a) => ({ ...a, projectId: targetId }));
    setProjects((prev) =>
      prev.map((p) => (p.id === targetId ? { ...p, articles: isolated } : p))
    );
    apiService.syncProjectArticles(targetId, isolated).catch((err) =>
      console.warn('Sub-library articles sync warning:', err?.message)
    );
  };

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

    setProjects((prev) =>
      prev.map((p) =>
        p.id === targetProjectId
          ? {
              ...p,
              databaseFolderPath: res.databaseFolderPath || p.databaseFolderPath,
              articles: nextArticles,
            }
          : p
      )
    );

    if (targetProjectId === currentProjectId) {
      setSelectedArticleId((prevSel) => {
        if (!prevSel || nextArticles.some((a) => a.id === prevSel)) return prevSel;
        return nextArticles[0]?.id || '';
      });
    }

    return res;
  };

  // Explicitly save all changes (metadata + articles + manifest) for a review folder to disk
  const handleSaveFolderChanges = async (targetProjectId: string) => {
    const targetProj = projects.find((p) => p.id === targetProjectId);
    if (!targetProj) {
      throw new Error('Target review folder not found');
    }
    const isolatedArticles = (targetProj.articles || [])
      .filter((a) => !a.projectId || a.projectId === targetProjectId)
      .map((a) => ({ ...a, projectId: targetProjectId }));

    await apiService.updateProjectFolder({ ...targetProj, articles: isolatedArticles });
    const syncRes = await apiService.syncProjectArticles(targetProjectId, isolatedArticles);
    return syncRes;
  };

  // Permanently delete a review folder from disk
  const handleDeleteProjectFolder = async (targetProjectId: string) => {
    const res = await apiService.deleteProjectFolder(targetProjectId);
    try {
      localStorage.removeItem(`slr_search_history_${targetProjectId}`);
    } catch {}
    const remainingProjects = projects.filter((p) => p.id !== targetProjectId);
    setProjects(remainingProjects);
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
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== targetId) return p;
        const nextArticles = p.articles.map((a) => (a.id === isolatedArt.id ? isolatedArt : a));
        apiService.syncProjectArticles(targetId, nextArticles).catch(() => {});
        return { ...p, articles: nextArticles };
      })
    );
  };

  const handleToggleStarArticle = (artId: string) => {
    if (!isolatedCurrentProject) return;
    const targetId = isolatedCurrentProject.id;
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== targetId) return p;
        const nextArticles = p.articles.map((a) =>
          a.id === artId ? { ...a, isStarred: !a.isStarred } : a
        );
        apiService.syncProjectArticles(targetId, nextArticles).catch(() => {});
        return { ...p, articles: nextArticles };
      })
    );
  };

  const handleAddArticle = (newArt: Article, targetProjectId?: string) => {
    const targetId = targetProjectId || newArt.projectId || isolatedCurrentProject?.id;
    if (!targetId) return;
    const isolatedArt: Article = { ...newArt, projectId: targetId };
    setProjects((prev) =>
      prev.map((p) =>
        p.id === targetId ? { ...p, articles: [isolatedArt, ...p.articles] } : p
      )
    );
    if (targetId === currentProjectId) {
      setSelectedArticleId(isolatedArt.id);
    }
    apiService.uploadArticlesChunk(targetId, [isolatedArt]).catch((err) =>
      console.warn('Article save warning:', err?.message)
    );
  };

  // Supports continuous streaming chunks during large bulk imports locked to a specific review partition
  const handleAddMultipleArticles = (
    newArts: Article[],
    options?: { keepOpen?: boolean; targetProjectId?: string }
  ) => {
    if (!newArts || newArts.length === 0) return;
    const targetId =
      options?.targetProjectId || newArts[0]?.projectId || isolatedCurrentProject?.id;
    if (!targetId) return;
    const isolatedBatch = newArts.map((a) => ({ ...a, projectId: targetId }));

    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== targetId) return p;
        const existingIds = new Set(p.articles.map((a) => a.id));
        const uniqueNew = isolatedBatch.filter((a) => !existingIds.has(a.id));
        return { ...p, articles: [...uniqueNew, ...p.articles] };
      })
    );

    if (!options?.keepOpen && isolatedBatch.length > 0 && targetId === currentProjectId) {
      setSelectedArticleId(isolatedBatch[0].id);
    }

    apiService
      .uploadArticlesChunk(
        targetId,
        isolatedBatch,
        isolatedBatch.map((a) => a.sourceFileName).filter(Boolean) as string[]
      )
      .then((res) => {
        if (res?.databaseFolderPath) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === targetId ? { ...p, databaseFolderPath: res.databaseFolderPath } : p
            )
          );
        }
      })
      .catch((err) => console.warn('Chunk persistence warning:', err?.message));
  };

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
      const mappedCitations =
        res.pageEvidence && res.pageEvidence.length > 0
          ? res.pageEvidence.map((ev, i) => ({
              id: `ev-${art.id}-${i}-${Date.now()}`,
              pageNumber: ev.pageNumber,
              section: ev.section || ev.sectionName || 'Evidence Finding',
              quote: ev.exactQuote,
              relevance: ev.relevance,
            }))
          : art.evidenceCitations;

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
        extractedData: {
          ...art.extractedData,
          latencyReported:
            res.operationalLatencyFound !== undefined
              ? res.operationalLatencyFound
              : art.extractedData?.latencyReported,
        },
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-600/30 selection:text-indigo-200">
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
        onTabChange={setCurrentTab}
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
      />

      {/* Main Workspace: Empty Database State, Wide Desktop, or Simulated Android Mobile */}
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
                      onSaveFolderChanges={handleSaveFolderChanges}
                      onDeleteProjectFolder={handleDeleteProjectFolder}
                      onSelectArticleForScreening={handleSelectArticleForScreening}
                      onOpenCrossrefModal={() => setIsCrossrefOpen(true)}
                      onOpenAddModal={() => handleOpenAddModal('bulk_local')}
                      onOpenManualPaperModal={() => handleOpenAddModal('manual')}
                    />
                  )}
                  {currentTab === 'picoc' && (
                    <PicocRulesManager
                      project={isolatedCurrentProject}
                      onUpdateProject={handleUpdateProject}
                      onAutoSyncScreening={handleAutoSyncScreeningCriteria}
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
                      onSaveFolderChanges={handleSaveFolderChanges}
                      onDeleteProjectFolder={handleDeleteProjectFolder}
                      onSelectArticleForScreening={handleSelectArticleForScreening}
                      onOpenCrossrefModal={() => setIsCrossrefOpen(true)}
                      onOpenAddModal={() => handleOpenAddModal('bulk_local')}
                      onOpenManualPaperModal={() => handleOpenAddModal('manual')}
                    />
                  )}
                  {currentTab === 'duplicates' && (
                    <DuplicateResolver
                      project={isolatedCurrentProject}
                      onUpdateArticles={handleUpdateArticles}
                      onNavigateToScreening={handleSelectArticleForScreening}
                    />
                  )}
                  {currentTab === 'title_screening' && (
                    <TitleScreeningWorkbench
                      project={isolatedCurrentProject}
                      articles={isolatedCurrentProject.articles}
                      onUpdateArticle={handleUpdateArticle}
                      onNavigateToFullText={handleSelectArticleForScreening}
                      onToggleStarArticle={handleToggleStarArticle}
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
                    />
                  )}
                  {currentTab === 'extraction' && (
                    <EvidenceExtractionMatrix
                      project={isolatedCurrentProject}
                      articles={isolatedCurrentProject.articles}
                      onUpdateArticle={handleUpdateArticle}
                      onBatchUpdateArticles={handleUpdateArticles}
                      onNavigateToScreening={handleSelectArticleForScreening}
                    />
                  )}
                  {currentTab === 'appraisal' && selectedArticle && (
                    <AppraisalWorksheet
                      project={isolatedCurrentProject}
                      article={selectedArticle}
                      onUpdateArticle={handleUpdateArticle}
                      articles={isolatedCurrentProject.articles}
                      onSelectArticle={setSelectedArticleId}
                    />
                  )}
                  {currentTab === 'prisma' && (
                    <PrismaDiagram
                      project={isolatedCurrentProject}
                      onUpdateArticle={handleUpdateArticle}
                    />
                  )}
                  {currentTab === 'results' && (
                    <IncludedResultsSynthesis
                      project={isolatedCurrentProject}
                      articles={isolatedCurrentProject.articles}
                      onNavigateToBriefing={() => setCurrentTab('briefing')}
                      onNavigateToProposal={() => setCurrentTab('proposal')}
                      onSelectArticle={handleSelectArticleForScreening}
                    />
                  )}
                  {currentTab === 'briefing' && (
                    <ResearchBriefingModule
                      project={isolatedCurrentProject}
                      articles={isolatedCurrentProject.articles}
                    />
                  )}
                  {currentTab === 'proposal' && <ProposalGenerator project={isolatedCurrentProject} />}
                  {currentTab === 'export' && (
                    <ExportReportModule
                      project={isolatedCurrentProject}
                      onRestoreProject={handleRestoreProject}
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
                  onSaveFolderChanges={handleSaveFolderChanges}
                  onDeleteProjectFolder={handleDeleteProjectFolder}
                  onSelectArticleForScreening={handleSelectArticleForScreening}
                  onOpenCrossrefModal={() => setIsCrossrefOpen(true)}
                  onOpenAddModal={() => handleOpenAddModal('bulk_local')}
                  onOpenManualPaperModal={() => handleOpenAddModal('manual')}
                />
              )}

              {currentTab === 'picoc' && (
                <PicocRulesManager
                  project={isolatedCurrentProject}
                  onUpdateProject={handleUpdateProject}
                  onAutoSyncScreening={handleAutoSyncScreeningCriteria}
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
                  onSaveFolderChanges={handleSaveFolderChanges}
                  onDeleteProjectFolder={handleDeleteProjectFolder}
                  onSelectArticleForScreening={handleSelectArticleForScreening}
                  onOpenCrossrefModal={() => setIsCrossrefOpen(true)}
                  onOpenAddModal={() => handleOpenAddModal('bulk_local')}
                  onOpenManualPaperModal={() => handleOpenAddModal('manual')}
                />
              )}

              {currentTab === 'duplicates' && (
                <DuplicateResolver
                  project={isolatedCurrentProject}
                  onUpdateArticles={handleUpdateArticles}
                  onNavigateToScreening={handleSelectArticleForScreening}
                />
              )}

              {currentTab === 'title_screening' && (
                <TitleScreeningWorkbench
                  project={isolatedCurrentProject}
                  articles={isolatedCurrentProject.articles}
                  onUpdateArticle={handleUpdateArticle}
                  onNavigateToFullText={handleSelectArticleForScreening}
                  onToggleStarArticle={handleToggleStarArticle}
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
                />
              )}

              {currentTab === 'extraction' && (
                <EvidenceExtractionMatrix
                  project={isolatedCurrentProject}
                  articles={isolatedCurrentProject.articles}
                  onUpdateArticle={handleUpdateArticle}
                  onBatchUpdateArticles={handleUpdateArticles}
                  onNavigateToScreening={handleSelectArticleForScreening}
                />
              )}

              {currentTab === 'appraisal' && selectedArticle && (
                <AppraisalWorksheet
                  project={isolatedCurrentProject}
                  article={selectedArticle}
                  onUpdateArticle={handleUpdateArticle}
                  articles={isolatedCurrentProject.articles}
                  onSelectArticle={setSelectedArticleId}
                />
              )}

              {currentTab === 'prisma' && (
                <PrismaDiagram
                  project={isolatedCurrentProject}
                  onUpdateArticle={handleUpdateArticle}
                />
              )}

              {currentTab === 'results' && (
                <IncludedResultsSynthesis
                  project={isolatedCurrentProject}
                  articles={isolatedCurrentProject.articles}
                  onNavigateToBriefing={() => setCurrentTab('briefing')}
                  onNavigateToProposal={() => setCurrentTab('proposal')}
                  onSelectArticle={handleSelectArticleForScreening}
                />
              )}

              {currentTab === 'briefing' && (
                <ResearchBriefingModule
                  project={isolatedCurrentProject}
                  articles={isolatedCurrentProject.articles}
                />
              )}

              {currentTab === 'proposal' && <ProposalGenerator project={isolatedCurrentProject} />}

              {currentTab === 'export' && (
                <ExportReportModule
                  project={isolatedCurrentProject}
                  onRestoreProject={handleRestoreProject}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Universal Modals */}
      <CreateReviewModal
        isOpen={isCreateReviewOpen}
        onClose={() => setIsCreateReviewOpen(false)}
        onCreateProject={handleCreateNewProject}
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
        />
      )}
    </div>
  );
}
