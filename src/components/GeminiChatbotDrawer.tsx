import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GeminiChatbotTurn,
  GeminiChatSavedState,
  ReviewProject,
  WorkbenchModuleId,
  WorkbenchState,
} from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  Bot,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';

interface GeminiChatbotDrawerProps {
  project: ReviewProject;
  onUpdateWorkbenchState: (
    targetProjectId: string,
    updater: Partial<WorkbenchState> | ((prev: WorkbenchState) => WorkbenchState),
    options?: { immediate?: boolean; moduleId?: WorkbenchModuleId; label?: string }
  ) => void;
}

type TaskMode = 'deep_reasoning' | 'complex_interactive' | 'general' | 'fast';

const ROLE_PRESETS: Array<{ id: string; label: string; prompt: string }> = [
  {
    id: 'methodologist',
    label: 'PRISMA 2020 Methodologist',
    prompt:
      'You are an expert PRISMA 2020 systematic review methodologist. Provide rigorous, actionable guidance on eligibility criteria, multi-stage screening, critical appraisal, bias minimization, and evidence synthesis.',
  },
  {
    id: 'spatial',
    label: 'Geographic & Spatial Screener',
    prompt:
      'You are a GIS and spatial systematic-review eligibility specialist. Help verify multi-scale geographic boundaries (continental, country, regional, zonal, woreda, watershed/basin), evaluate out-of-area conflicts, and interpret spatial study coverage.',
  },
  {
    id: 'synthesizer',
    label: 'Synthesis & Meta-Analyst',
    prompt:
      'You are a quantitative and qualitative evidence synthesis analyst. Compare modeling frameworks, covariates, validation metrics (e.g., AUC, RMSE, F1), heterogeneity, and research gaps clearly.',
  },
  {
    id: 'screener',
    label: 'Rapid Screening Assistant',
    prompt:
      'You are a rapid screening triage assistant. Help evaluate titles, abstracts, inclusion/exclusion rules, and non-destructive review iteration rationales concisely.',
  },
  {
    id: 'custom',
    label: 'Custom System Instruction',
    prompt: '',
  },
];

const TASK_MODE_OPTIONS: Array<{
  id: TaskMode;
  label: string;
  sublabel: string;
  model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
}> = [
  {
    id: 'deep_reasoning',
    label: 'Deep Reasoning (Hydrogen High)',
    sublabel: 'gemini-4-hydrogen · Thinking HIGH',
    model: 'gemini-4-hydrogen',
  },
  {
    id: 'complex_interactive',
    label: 'Complex Interactive (Hydrogen High)',
    sublabel: 'gemini-4-hydrogen · Thinking HIGH',
    model: 'gemini-4-hydrogen',
  },
  {
    id: 'general',
    label: 'General Research (Hydrogen)',
    sublabel: 'gemini-4-hydrogen · Balanced',
    model: 'gemini-4-hydrogen',
  },
  {
    id: 'fast',
    label: 'Fast Triage (Flash-Lite Minimal)',
    sublabel: 'gemini-3.1-flash-lite · Thinking MINIMAL',
    model: 'gemini-3.1-flash-lite',
  },
];

export const GeminiChatbotDrawer: React.FC<GeminiChatbotDrawerProps> = ({
  project,
  onUpdateWorkbenchState,
}) => {
  const { idToken } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const savedChat: GeminiChatSavedState | undefined = project.workbenchState?.geminiChat;

  const [rolePresetId, setRolePresetId] = useState<string>(
    savedChat?.activeRole || 'methodologist'
  );
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>(
    savedChat?.customSystemInstruction || ''
  );
  const [taskMode, setTaskMode] = useState<TaskMode>(savedChat?.activeTaskMode || 'general');
  const [attachProtocolContext, setAttachProtocolContext] = useState<boolean>(
    savedChat?.includeProjectContext ?? true
  );

  const defaultWelcomeTurn: GeminiChatbotTurn = useMemo(
    () => ({
      id: 'welcome',
      role: 'model',
      text: `Research Assistant ready for "${project.title}". Ask multi-turn questions about your protocol, geographic study boundaries, screening decisions, or PRISMA synthesis.`,
      timestamp: new Date().toISOString(),
    }),
    [project.id, project.title]
  );

  const turns: GeminiChatbotTurn[] = useMemo(() => {
    if (savedChat?.turns && savedChat.turns.length > 0) return savedChat.turns;
    return [defaultWelcomeTurn];
  }, [savedChat?.turns, defaultWelcomeTurn]);

  useEffect(() => {
    if (savedChat?.activeRole) setRolePresetId(savedChat.activeRole);
    if (savedChat?.customSystemInstruction !== undefined) {
      setCustomSystemPrompt(savedChat.customSystemInstruction);
    }
    if (savedChat?.activeTaskMode) setTaskMode(savedChat.activeTaskMode);
    if (savedChat?.includeProjectContext !== undefined) {
      setAttachProtocolContext(savedChat.includeProjectContext);
    }
  }, [project.id]);

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns.length, isOpen]);

  const persistChatState = (patch: Partial<GeminiChatSavedState>, immediate = true) => {
    onUpdateWorkbenchState(
      project.id,
      (prevWs) => {
        const prevChat = prevWs.geminiChat || {
          turns: [defaultWelcomeTurn],
          activeRole: rolePresetId,
          customSystemInstruction: customSystemPrompt,
          activeTaskMode: taskMode,
          includeProjectContext: attachProtocolContext,
        };
        return {
          ...prevWs,
          geminiChat: {
            ...prevChat,
            ...patch,
            updatedAt: new Date().toISOString(),
          },
        };
      },
      { immediate, label: 'Gemini Research Chat' }
    );
  };

  const buildSystemInstruction = (): string => {
    const presetObj = ROLE_PRESETS.find((p) => p.id === rolePresetId);
    const baseRole =
      rolePresetId === 'custom'
        ? customSystemPrompt.trim() ||
          'You are a helpful systematic literature review research assistant.'
        : presetObj?.prompt || ROLE_PRESETS[0].prompt;

    if (!attachProtocolContext) return baseRole;

    const articles = project.articles || [];
    const included = articles.filter((a) => a.decision === 'include').length;
    const excluded = articles.filter((a) => a.decision === 'exclude').length;
    const iterating = articles.filter(
      (a) => a.prismaProtocolStatus === 'needs_iteration' || a.decision === 'uncertain'
    ).length;

    const geoSummary = [
      project.geographicEligibility,
      project.studyAreaBoundary
        ? `Uploaded boundary (${project.studyAreaBoundary.fileName}): ${project.studyAreaBoundary.placeNames.slice(0, 12).join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join(' | ');

    return `${baseRole}

Active Review Context:
- Title: "${project.title}"
- Discipline: ${project.discipline || 'Interdisciplinary'} | Framework: ${project.frameworkType || 'PICOC'} | Review Type: ${project.reviewType || 'SLR'}
- Scope: ${project.scope || 'Not specified'}
- Geographic Eligibility: ${geoSummary || 'Global / Unspecified'} (Target scale: ${project.geographicTargetScale || 'any'})
- Dataset Status: ${articles.length} total articles (${included} included, ${excluded} excluded, ${iterating} in review iteration)`;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const queryText = input.trim();
    if (!queryText || loading) return;

    setInput('');
    setErrorMsg('');

    const userTurn: GeminiChatbotTurn = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: queryText,
      timestamp: new Date().toISOString(),
    };

    const currentHistoryTurns = turns.filter((t) => t.id !== 'welcome');
    const nextTurns = [...turns, userTurn];
    persistChatState({
      turns: nextTurns,
      activeRole: rolePresetId,
      customSystemInstruction: customSystemPrompt,
      activeTaskMode: taskMode,
      includeProjectContext: attachProtocolContext,
    });

    setLoading(true);
    try {
      const selectedModeMeta =
        TASK_MODE_OPTIONS.find((m) => m.id === taskMode) || TASK_MODE_OPTIONS[2];

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: queryText,
          history: currentHistoryTurns.map((t) => ({ role: t.role, text: t.text })),
          model: selectedModeMeta.model,
          taskMode,
          systemInstruction: buildSystemInstruction(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Gemini chat failed (${res.status})`);
      }

      const modelTurn: GeminiChatbotTurn = {
        id: `m_${Date.now()}`,
        role: 'model',
        text: data.text || '',
        modelUsed: data.model || selectedModeMeta.model,
        taskMode,
        timestamp: new Date().toISOString(),
      };

      persistChatState({
        turns: [...nextTurns, modelTurn],
        activeRole: rolePresetId,
        customSystemInstruction: customSystemPrompt,
        activeTaskMode: taskMode,
        includeProjectContext: attachProtocolContext,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to reach Gemini assistant.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    const resetTurn: GeminiChatbotTurn = {
      id: 'welcome',
      role: 'model',
      text: `Started a fresh thread for "${project.title}".`,
      timestamp: new Date().toISOString(),
    };
    persistChatState({ turns: [resetTurn] });
    setErrorMsg('');
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 px-4 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white shadow-2xl border border-indigo-400/40 inline-flex items-center gap-2.5 text-xs font-bold cursor-pointer transition hover:scale-[1.02]"
        title="Open multi-turn Gemini Research Chatbot"
      >
        <Sparkles className="w-4 h-4 text-amber-300" />
        <span>Research Chat</span>
        {turns.length > 1 && (
          <span className="px-1.5 py-0.5 rounded-md bg-slate-950/60 text-[10px] font-mono text-indigo-200">
            {turns.length - 1}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex flex-col bg-slate-900 border border-indigo-700/70 rounded-2xl shadow-2xl overflow-hidden transition-all ${
        isExpanded
          ? 'w-[min(760px,calc(100vw-2rem))] h-[min(82vh,760px)]'
          : 'w-[min(430px,calc(100vw-2rem))] h-[min(74vh,590px)]'
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate">
              Systematic Review Chat Assistant
            </h3>
            <p className="text-[10px] text-slate-400 truncate">
              {TASK_MODE_OPTIONS.find((m) => m.id === taskMode)?.sublabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className={`p-1.5 rounded-lg border text-xs cursor-pointer transition ${
              showSettings
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Configure system instruction & task mode"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
            title={isExpanded ? 'Restore size' : 'Expand chat drawer'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleClearChat}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 cursor-pointer"
            title="Clear conversation thread"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
            title="Minimize chat"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* System Instruction & Mode Settings Drawer */}
      {showSettings && (
        <div className="p-3 bg-slate-950/90 border-b border-slate-800 space-y-2.5 text-[11px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Role System Instruction
              </label>
              <select
                value={rolePresetId}
                onChange={(e) => {
                  const nextRole = e.target.value;
                  setRolePresetId(nextRole);
                  persistChatState({ activeRole: nextRole });
                }}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {ROLE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Reasoning &amp; Model Mode
              </label>
              <select
                value={taskMode}
                onChange={(e) => {
                  const nextMode = e.target.value as TaskMode;
                  setTaskMode(nextMode);
                  persistChatState({ activeTaskMode: nextMode });
                }}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {TASK_MODE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {rolePresetId === 'custom' && (
            <textarea
              rows={2}
              value={customSystemPrompt}
              onChange={(e) => {
                setCustomSystemPrompt(e.target.value);
                persistChatState({ customSystemInstruction: e.target.value }, false);
              }}
              placeholder="Enter custom system instruction for the assistant..."
              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          )}

          <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={attachProtocolContext}
              onChange={(e) => {
                setAttachProtocolContext(e.target.checked);
                persistChatState({ includeProjectContext: e.target.checked });
              }}
              className="rounded accent-indigo-500"
            />
            <span>Include active review protocol, study area boundary &amp; counts in context</span>
          </label>
        </div>
      )}

      {/* Scrollable Multi-Turn Conversation */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`flex gap-2.5 ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {turn.role === 'model' && (
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}

            <div
              className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                turn.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950 border border-slate-800 text-slate-200'
              }`}
            >
              <div>{turn.text}</div>
              {turn.modelUsed && (
                <div className="mt-1.5 text-[10px] text-slate-500 font-mono">
                  {turn.modelUsed}
                  {turn.taskMode ? ` · ${turn.taskMode}` : ''}
                </div>
              )}
            </div>

            {turn.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Thinking...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {errorMsg && (
        <div className="px-3.5 py-2 bg-rose-950/60 border-t border-rose-500/40 text-[11px] text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Message Input */}
      <form
        onSubmit={handleSend}
        className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask follow-up questions about your review..."
          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer transition"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
