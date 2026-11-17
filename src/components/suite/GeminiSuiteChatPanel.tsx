import React, { useState, useRef, useEffect } from 'react';
import { ReviewProject } from '../../types';
import {
  Bot,
  ExternalLink,
  Globe,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';

interface GeminiSuiteChatPanelProps {
  project: ReviewProject;
  initialMode?: 'chat' | 'search';
}

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  sources?: { title: string; uri: string }[];
  modelUsed?: string;
}

const PERSONA_PROMPTS: Record<string, string> = {
  methodologist:
    'You are an expert PRISMA 2020 systematic literature review methodologist. Provide rigorous, actionable guidance on screening criteria, critical appraisal, and evidence synthesis.',
  analyst:
    'You are a quantitative and qualitative synthesis analyst. Compare study designs, performance metrics, limitations, and research gaps clearly.',
  screener:
    'You are a rapid screening triage assistant. Help evaluate titles, abstracts, and exclusion rationales concisely against review criteria.',
  editor:
    'You are an academic manuscript editor specializing in clear scientific writing and structured reporting.',
};

export const GeminiSuiteChatPanel: React.FC<GeminiSuiteChatPanelProps> = ({
  project,
  initialMode = 'chat',
}) => {
  const [mode, setMode] = useState<'chat' | 'search'>(initialMode);
  const [model, setModel] = useState<'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'>('gemini-4-hydrogen');
  const [persona, setPersona] = useState<string>('methodologist');
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Ready to assist with "${project.title}". Ask multi-turn methodology questions in Chat mode or switch to Google Search Grounding for live web literature discovery.`,
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const queryText = input.trim();
    if (!queryText || loading) return;

    setInput('');
    setErrorMsg('');
    const userTurn: ChatTurn = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: queryText,
    };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setLoading(true);

    try {
      if (mode === 'search') {
        const res = await fetch('/api/gemini/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryText }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Search grounding request failed');
        setTurns((prev) => [
          ...prev,
          {
            id: `m_${Date.now()}`,
            role: 'model',
            text: data.text || 'No grounded summary returned.',
            sources: Array.isArray(data.sources) ? data.sources : [],
            modelUsed: 'gemini-4-hydrogen + Google Search',
          },
        ]);
      } else {
        const historyPayload = nextTurns
          .filter((t) => t.id !== 'welcome')
          .slice(0, -1)
          .map((t) => ({ role: t.role, text: t.text }));

        const sysPrompt = `${PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.methodologist}\nActive Review Context: "${project.title}" (${project.frameworkType || 'PICOC'} / ${project.reviewType || 'SLR'}). Scope: ${project.scope || 'Systematic literature synthesis'}.`;

        const res = await fetch('/api/gemini/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: queryText,
            history: historyPayload,
            model,
            systemInstruction: sysPrompt,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Chat request failed');
        setTurns((prev) => [
          ...prev,
          {
            id: `m_${Date.now()}`,
            role: 'model',
            text: data.text || '',
            modelUsed: data.model || model,
          },
        ]);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to reach Gemini assistant.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[540px] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="p-3.5 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('chat')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition ${
              mode === 'chat'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Multi-Turn Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('search')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition ${
              mode === 'search'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Google Search Grounding</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'chat' && (
            <>
              <select
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none"
                aria-label="Research Role"
              >
                <option value="methodologist">Role: SLR Methodologist</option>
                <option value="analyst">Role: Synthesis Analyst</option>
                <option value="screener">Role: Rapid Screener</option>
                <option value="editor">Role: Manuscript Editor</option>
              </select>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite')}
                className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none"
                aria-label="Gemini Model"
              >
                <option value="gemini-4-hydrogen">gemini-4-hydrogen (Balanced)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast)</option>
              </select>
            </>
          )}
          <button
            type="button"
            onClick={() =>
              setTurns([
                {
                  id: 'welcome',
                  role: 'model',
                  text: `Started a fresh thread for "${project.title}".`,
                },
              ])
            }
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 cursor-pointer"
            title="Clear chat history"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Conversation Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`flex gap-3 ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {turn.role === 'model' && (
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                turn.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950 border border-slate-800 text-slate-200'
              }`}
            >
              <div>{turn.text}</div>

              {turn.sources && turn.sources.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
                    Grounded Google Search Sources
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {turn.sources.map((src, idx) => (
                      <a
                        key={`${src.uri}_${idx}`}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-900 border border-slate-700 hover:border-teal-500 text-[11px] text-teal-300 transition"
                      >
                        <span className="truncate max-w-[200px]">{src.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {turn.modelUsed && (
                <div className="mt-1.5 text-[10px] text-slate-500 font-mono">{turn.modelUsed}</div>
              )}
            </div>

            {turn.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>{mode === 'search' ? 'Searching live web sources...' : 'Generating response...'}</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {errorMsg && (
        <div className="px-4 py-2 bg-rose-950/60 border-t border-rose-500/40 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleSend} className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            mode === 'search'
              ? 'Search recent 2025/2026 benchmarks, guidelines, or DOI developments via Google Search...'
              : 'Ask follow-up questions about your review protocol, inclusion rules, or findings...'
          }
          className="flex-1 px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
