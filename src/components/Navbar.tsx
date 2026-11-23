import React from 'react';
import { ReviewProject } from '../types';
import { getFrameworkDefinition, getReviewTypeDefinition } from '../utils/protocolFrameworks';
import { useAuth } from '../contexts/AuthContext';
import {
  Compass,
  BookOpen,
  FileSearch,
  ClipboardCheck,
  GitFork,
  FileText,
  FileDown,
  Smartphone,
  Monitor,
  Sparkles,
  ChevronDown,
  Layers,
  Upload,
  LayoutDashboard,
  Star,
  Eye,
  FileSpreadsheet,
  TrendingUp,
  Radio,
  Plus,
  FolderOpen,
  LogIn,
  UserCheck,
  Globe,
  CreditCard,
  Shield,
  Wifi,
  WifiOff,
  RefreshCw,
  HardDriveDownload,
  Check,
  ArchiveRestore,
} from 'lucide-react';
import { SyncStatus } from '../utils/syncEngine';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  projects: ReviewProject[];
  currentProjectId: string;
  onSwitchProject: (id: string) => void;
  deviceMode: 'desktop' | 'mobile';
  onToggleDeviceMode: () => void;
  articlesCount: number;
  includedCount: number;
  duplicatesCount: number;
  starredCount?: number;
  unscreenedCount?: number;
  onOpenAddModal?: () => void;
  onCreateNewReview?: () => void;
  onOpenManualPaperModal?: () => void;
  onBackupProject?: () => void;
  onOpenCloudWorkspace?: () => void;
  syncStatus?: SyncStatus;
  pendingOpsCount?: number;
  onOpenWebsite?: () => void;
  onOpenBilling?: () => void;
  onOpenAdmin?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  projects,
  currentProjectId,
  onSwitchProject,
  deviceMode,
  onToggleDeviceMode,
  articlesCount,
  includedCount,
  duplicatesCount,
  starredCount = 0,
  unscreenedCount = 0,
  onOpenAddModal,
  onCreateNewReview,
  onOpenManualPaperModal,
  onBackupProject,
  onOpenCloudWorkspace,
  syncStatus = 'Synced',
  pendingOpsCount = 0,
  onOpenWebsite,
  onOpenBilling,
  onOpenAdmin,
}) => {
  const [backupJustSaved, setBackupJustSaved] = React.useState(false);
  const { user, accountOverview, signInWithGoogle } = useAuth();
  const isAdmin = accountOverview?.user.role === 'admin';
  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0];
  const activeFramework = getFrameworkDefinition(currentProject?.frameworkType);
  const activeReviewType = getReviewTypeDefinition(currentProject?.reviewType);

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'folders',
      label: 'Saved Folders',
      icon: FolderOpen,
      badge: projects.length,
      badgeColor: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
    },
    {
      id: 'interesting',
      label: 'Interesting',
      icon: Star,
      badge: starredCount > 0 ? starredCount : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    },
    {
      id: 'picoc',
      label: 'Protocol & Framework',
      icon: Compass,
    },
    {
      id: 'protocol_builder',
      label: '16-Step Protocol',
      icon: Sparkles,
      badge: currentProject?.workbenchState?.protocolBuilder?.activeProtocol?.versionNumber
        ? `v${currentProject.workbenchState.protocolBuilder.activeProtocol.versionNumber}`
        : 'AI',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
    },
    {
      id: 'library',
      label: 'Article Library',
      icon: BookOpen,
      badge: articlesCount,
    },
    {
      id: 'duplicates',
      label: 'Duplicate Detection',
      icon: Layers,
      badge: duplicatesCount > 0 ? duplicatesCount : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    },
    {
      id: 'title_screening',
      label: 'Title Screening',
      icon: Eye,
      badge: unscreenedCount > 0 ? unscreenedCount : undefined,
      badgeColor: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
    },
    {
      id: 'screening',
      label: 'Eligibility & Screening',
      icon: FileSearch,
    },
    {
      id: 'extraction',
      label: 'Record Evidence',
      icon: FileSpreadsheet,
    },
    {
      id: 'appraisal',
      label: 'Quality Appraisal',
      icon: ClipboardCheck,
    },
    {
      id: 'prisma',
      label: 'PRISMA 2020 Flow',
      icon: GitFork,
    },
    {
      id: 'recovery',
      label: 'Recovery & PRISMA',
      icon: ArchiveRestore,
      badge: 'Safe',
      badgeColor: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
    },
    {
      id: 'results',
      label: 'Results for Included',
      icon: TrendingUp,
      badge: includedCount > 0 ? `${includedCount}` : undefined,
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    },
    {
      id: 'quant_synthesis',
      label: 'Quant / Meta-Analysis',
      icon: TrendingUp,
      badge: currentProject?.workbenchState?.quantSynthesis?.lastMetaAnalysis?.pooledAvailable
        ? `k=${currentProject.workbenchState.quantSynthesis.lastMetaAnalysis.k}`
        : 'Stats',
      badgeColor: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
    },
    {
      id: 'briefing',
      label: 'NotebookLM & Audio',
      icon: Radio,
    },
    {
      id: 'proposal',
      label: 'Academic Proposal',
      icon: FileText,
    },
    {
      id: 'export',
      label: 'Export & Backup Hub',
      icon: FileDown,
      badge: 'Full SLR',
      badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    },
  ];

  return (
    <header className="bg-slate-950 border-b border-slate-800 text-slate-100 sticky top-0 z-40 shadow-md">
      {/* Top Header Row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-15 gap-3">
          {/* Logo & App Title */}
          <div
            onClick={() => onTabChange('dashboard')}
            className="flex items-center gap-3 cursor-pointer select-none"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-teal-500 to-emerald-400 flex items-center justify-center shadow-md shadow-indigo-950">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">
                  ResearchMate <span className="text-teal-400">AI</span>
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  SLR Workbench
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block truncate max-w-md">
                {currentProject
                  ? `PRISMA 2020 · ${activeFramework.name} · ${activeReviewType.name} · Screening & Extraction`
                  : 'PRISMA 2020 · Multi-Framework (PICOC / PICO / PECO / PCC / SPIDER / SPICE / PICOS / CIMO)'}
              </p>
            </div>
          </div>

          {/* Project Selector & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative">
              <select
                value={currentProjectId}
                disabled={projects.length === 0}
                onChange={(e) => onSwitchProject(e.target.value)}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-60 text-xs font-semibold text-slate-200 rounded-xl px-3 py-2 pr-8 focus:outline-none appearance-none max-w-[150px] sm:max-w-xs truncate cursor-pointer transition shadow-sm"
              >
                {projects.length === 0 ? (
                  <option value="">No review folders</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title.slice(0, 45)}...
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
            </div>

            {/* + New Review (Manual Blank) */}
            {onCreateNewReview && (
              <button
                onClick={onCreateNewReview}
                className="px-2.5 py-1.5 bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-sm transition inline-flex items-center gap-1 cursor-pointer shrink-0"
                title="Create brand new research review with empty placeholders"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden md:inline">+ New Review</span>
              </button>
            )}

            {/* Desktop / Mobile Toggle */}
            <button
              onClick={onToggleDeviceMode}
              className={`p-2 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 cursor-pointer ${
                deviceMode === 'mobile'
                  ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                  : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={
                deviceMode === 'mobile'
                  ? 'Switch to wide Desktop workspace'
                  : 'Switch to Android simulated mobile frame'
              }
            >
              {deviceMode === 'mobile' ? (
                <>
                  <Smartphone className="w-4 h-4 text-teal-400" />
                  <span className="hidden md:inline text-[11px] font-bold">Android Preview</span>
                </>
              ) : (
                <>
                  <Monitor className="w-4 h-4" />
                  <span className="hidden md:inline text-[11px]">Desktop</span>
                </>
              )}
            </button>

            {/* + Manual Paper Insertion Button */}
            {onOpenManualPaperModal && (
              <button
                onClick={onOpenManualPaperModal}
                disabled={projects.length === 0}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
                title="Manual Research Paper Insertion (Blank Placeholders)"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">+ Manual Paper</span>
              </button>
            )}

            {/* Bulk Upload Articles Button */}
            {onOpenAddModal && (
              <button
                onClick={onOpenAddModal}
                disabled={projects.length === 0}
                className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer"
                title="File Selection & Online Database Search"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Bulk Import</span>
              </button>
            )}

            {/* Instant Workbench Backup Button */}
            {onBackupProject && (
              <button
                type="button"
                disabled={projects.length === 0}
                onClick={() => {
                  onBackupProject();
                  setBackupJustSaved(true);
                  setTimeout(() => setBackupJustSaved(false), 2400);
                }}
                className="px-2.5 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/70 disabled:opacity-40 text-emerald-300 border border-emerald-500/40 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                title="Save folder changes to disk and download a complete portable SLR backup (.json)"
              >
                {backupJustSaved ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <HardDriveDownload className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span className="hidden md:inline">{backupJustSaved ? 'Backed Up' : 'Backup'}</span>
              </button>
            )}

            <PWAInstallButton />

            {/* Sync Status Indicator */}
            <button
              type="button"
              onClick={onOpenBilling}
              title={`Cloud Synchronization Status: ${syncStatus}${
                pendingOpsCount > 0 ? ` (${pendingOpsCount} pending)` : ''
              }`}
              className={`px-2 py-1.5 rounded-xl text-[11px] font-semibold border inline-flex items-center gap-1 cursor-pointer shrink-0 ${
                syncStatus === 'Offline'
                  ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                  : syncStatus === 'Sync Failed'
                  ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                  : syncStatus === 'Synchronizing'
                  ? 'bg-indigo-950/60 border-indigo-500/40 text-indigo-300'
                  : 'bg-slate-900 border-slate-800 text-emerald-400'
              }`}
            >
              {syncStatus === 'Offline' ? (
                <WifiOff className="w-3.5 h-3.5" />
              ) : syncStatus === 'Synchronizing' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wifi className="w-3.5 h-3.5" />
              )}
              <span className="hidden xl:inline">{syncStatus}</span>
            </button>

            {onOpenWebsite && (
              <button
                type="button"
                onClick={onOpenWebsite}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Open ResearchMate AI Commercial Website & Pricing"
              >
                <Globe className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden xl:inline">Website</span>
              </button>
            )}

            {onOpenBilling && (
              <button
                type="button"
                onClick={onOpenBilling}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Subscription Plans, Billing & Cloud Sync"
              >
                <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden xl:inline">Plans</span>
              </button>
            )}

            {isAdmin && onOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="px-2.5 py-1.5 bg-amber-950/50 hover:bg-amber-900/50 text-amber-300 border border-amber-500/30 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1 cursor-pointer shrink-0"
                title="Administrator Governance Dashboard"
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Admin</span>
              </button>
            )}

            {/* Google Account / Cloud Workspace Trigger */}
            {user ? (
              <button
                type="button"
                onClick={onOpenCloudWorkspace}
                className="px-2.5 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                title={`Signed in as ${user.email || user.displayName || 'Researcher'} — Open Cloud Sync`}
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline max-w-[96px] truncate">
                  {user.displayName?.split(' ')[0] || 'Account'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void signInWithGoogle();
                }}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Sign in with Google for Cloud Sync & SQL Persistence"
              >
                <LogIn className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden md:inline">Sign In</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Navigation Bar Tabs with Clear Modules */}
        <nav className="flex space-x-1 overflow-x-auto pb-2 pt-1 scrollbar-none text-xs">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="whitespace-nowrap">{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      item.badgeColor || (isActive ? 'bg-indigo-800 text-white' : 'bg-slate-800 text-slate-300')
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
