import React, { useState } from 'react';
import { ReviewProject } from '../../types';
import { CloudSyncPanel } from './CloudSyncPanel';
import { GeminiSuiteChatPanel } from './GeminiSuiteChatPanel';
import { AudioVoiceStudioPanel } from './AudioVoiceStudioPanel';
import { GoogleMapsExplorerPanel } from './GoogleMapsExplorerPanel';
import { VisualMediaStudioPanel } from './VisualMediaStudioPanel';
import { ThreeDWorkbenchPanel } from './ThreeDWorkbenchPanel';
import { ResearchGamePanel } from './ResearchGamePanel';
import {
  X,
  Cloud,
  MessageSquare,
  Mic,
  MapPin,
  Image as ImageIcon,
  Box,
  Gamepad2,
  Sparkles,
} from 'lucide-react';

interface ResearchSuiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ReviewProject;
  initialTab?: SuiteTabId;
}

export type SuiteTabId =
  | 'cloud'
  | 'gemini_chat_search'
  | 'audio_voice'
  | 'maps'
  | 'visual_media'
  | 'scene_3d'
  | 'game';

const SUITE_TABS: { id: SuiteTabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'cloud', label: 'Cloud & Account', icon: Cloud },
  { id: 'gemini_chat_search', label: 'Gemini Chat & Search', icon: MessageSquare },
  { id: 'audio_voice', label: 'Audio & Live Voice', icon: Mic },
  { id: 'maps', label: 'Maps & Places', icon: MapPin },
  { id: 'visual_media', label: 'Image & Video Studio', icon: ImageIcon },
  { id: 'scene_3d', label: '3D Field Scene', icon: Box },
  { id: 'game', label: 'Evidence Game', icon: Gamepad2 },
];

export const ResearchSuiteModal: React.FC<ResearchSuiteModalProps> = ({
  isOpen,
  onClose,
  project,
  initialTab = 'cloud',
}) => {
  const [activeTab, setActiveTab] = useState<SuiteTabId>(initialTab);

  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-6xl bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-white truncate">
                Research & AI Integrated Suite
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Active Review: <span className="text-slate-200 font-semibold">{project.title}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            aria-label="Close Research Suite"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Unified Workspace Tab Bar */}
        <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto">
          {SUITE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
                  active
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Tool Panel */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {activeTab === 'cloud' && <CloudSyncPanel project={project} />}
          {activeTab === 'gemini_chat_search' && <GeminiSuiteChatPanel project={project} />}
          {activeTab === 'audio_voice' && <AudioVoiceStudioPanel />}
          {activeTab === 'maps' && <GoogleMapsExplorerPanel />}
          {activeTab === 'visual_media' && <VisualMediaStudioPanel project={project} />}
          {activeTab === 'scene_3d' && <ThreeDWorkbenchPanel project={project} />}
          {activeTab === 'game' && <ResearchGamePanel />}
        </div>
      </div>
    </div>
  );
};
