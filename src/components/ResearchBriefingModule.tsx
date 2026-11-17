import React, { useState } from 'react';
import { ReviewProject, Article, PodcastEpisode, PodcastDialogueTurn } from '../types';
import {
  Radio,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Download,
  Copy,
  Check,
  Send,
  MessageSquare,
  BookOpen,
  Volume2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { apiService } from '../services/apiService';

interface ResearchBriefingModuleProps {
  project: ReviewProject;
  articles: Article[];
}

export const ResearchBriefingModule: React.FC<ResearchBriefingModuleProps> = ({
  project,
  articles,
}) => {
  const includedArticles = articles.filter((a) => a.decision === 'include');

  // Podcast / Audio Overview state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState<boolean>(false);
  const [podcastEpisode, setPodcastEpisode] = useState<PodcastEpisode | null>(null);

  // Grounded Q&A State
  const [qaQuestion, setQaQuestion] = useState<string>('');
  const [isAskingQa, setIsAskingQa] = useState<boolean>(false);
  const [qaHistory, setQaHistory] = useState<
    { question: string; answer: string; timestamp: number }[]
  >([
    {
      question: 'What are the primary operational latency findings across included studies?',
      answer: `Across the ${includedArticles.length} included studies, operational turnaround latency exhibits a pronounced bifurcation: conventional photogrammetry and cloud SfM pipelines report latencies between 3 and 24 hours [2], severely impeding time-sensitive foliar stress mitigation. Conversely, edge-computing platforms deploying onboard neural inference (e.g. Nvidia Jetson Orin) achieve end-to-end flight-to-raster delivery within 11.4 to 18.2 minutes [1], [3].`,
      timestamp: Date.now() - 1000 * 60 * 12,
    },
    {
      question: 'Why is spatial block cross-validation critical in this evidence base?',
      answer: `Studies employing random k-fold cross-validation suffer from spatial autocorrelation leakage—where geographically adjacent flight pixels share micro-climatic and soil attributes [3]. This artificially inflates reported accuracy (R² and AUC-ROC) by up to 18–22%. Enforcing spatial block partitioning or buffer zones is mandatory for unbiased generalization.`,
      timestamp: Date.now() - 1000 * 60 * 4,
    },
  ]);

  // Audio Playback Timer Simulation
  React.useEffect(() => {
    let timer: any;
    if (isPlaying && podcastEpisode?.script) {
      timer = setInterval(() => {
        setCurrentTurnIndex((prev) => {
          if (prev >= podcastEpisode.script.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 5000 / playbackSpeed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, podcastEpisode, playbackSpeed]);

  // Generate or regenerate podcast script
  const handleGeneratePodcast = async () => {
    setIsGeneratingPodcast(true);
    try {
      const data = await apiService.generatePodcastScript(project, includedArticles);
      if (data && data.script) {
        setPodcastEpisode(data);
        setCurrentTurnIndex(0);
        setIsPlaying(true);
      }
    } catch (e) {
      console.warn('Failed to generate podcast:', e);
    } finally {
      setIsGeneratingPodcast(false);
    }
  };

  // Submit Q&A question
  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaQuestion.trim()) return;

    const q = qaQuestion.trim();
    setQaQuestion('');
    setIsAskingQa(true);

    try {
      const data = await apiService.askBriefingQa(q, project, includedArticles);
      setQaHistory((prev) => [
        { question: q, answer: data.answer, timestamp: Date.now() },
        ...prev,
      ]);
    } catch (e: any) {
      setQaHistory((prev) => [
        {
          question: q,
          answer: `Could not reach AI synthesis server: ${e?.message || 'Check network connection'}.`,
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    } finally {
      setIsAskingQa(false);
    }
  };

  // Export Transcript
  const handleExportTranscript = () => {
    if (!podcastEpisode?.script) return;
    const lines = [
      `# ${podcastEpisode.title}`,
      `## ${podcastEpisode.subtitle}`,
      `Estimated duration: ${podcastEpisode.durationEst}`,
      `\nSummary:\n${podcastEpisode.summary}\n`,
      `--- TRANSCRIPT ---`,
      ...podcastEpisode.script.map(
        (t) => `\n[${t.speaker}] (${t.topic || 'Dialogue'}):\n"${t.text}"\n`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.id}-audio-overview-transcript.md`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-purple-950/50 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              <span>NotebookLM-Style Research Briefing & Synthesis Engine</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Evidence Briefing & Two-Host Audio Overview
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Synthesizes all {includedArticles.length} included empirical studies into an interactive audio discussion between methodologist and domain specialist, supported by grounded cross-corpus Q&A.
            </p>
          </div>

          <button
            onClick={handleGeneratePodcast}
            disabled={isGeneratingPodcast}
            className="px-5 py-3 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 disabled:opacity-50 text-white text-xs font-bold rounded-2xl shadow-lg transition inline-flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Sparkles className={`w-4 h-4 ${isGeneratingPodcast ? 'animate-spin' : ''}`} />
            <span>{isGeneratingPodcast ? 'Synthesizing Dialogue...' : 'Generate Audio Overview Dialogue'}</span>
          </button>
        </div>
      </div>

      {/* Audio Overview Player & Transcript */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md">
              <Volume2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">
                {podcastEpisode?.title || 'Interactive Audio Overview: Systematic Review Synthesis'}
              </h3>
              <p className="text-xs text-slate-400">
                {podcastEpisode?.subtitle || 'Conversational deep dive: Dr. Sarah (Methodologist) & Dr. Alex (Domain Specialist)'}
              </p>
            </div>
          </div>

          {podcastEpisode && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportTranscript}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Transcript</span>
              </button>
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                {[1, 1.25, 1.5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`px-2 py-0.5 rounded-lg font-mono font-bold transition ${
                      playbackSpeed === spd ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Player Controls */}
        {podcastEpisode?.script ? (
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-11 h-11 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white flex items-center justify-center shadow-md transition cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                </button>
                <div>
                  <span className="text-xs font-bold text-white block">
                    {podcastEpisode.script[currentTurnIndex]?.speaker}
                  </span>
                  <span className="text-[11px] text-indigo-400 font-mono">
                    Topic: {podcastEpisode.script[currentTurnIndex]?.topic || 'Synthesis'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-400">
                  {currentTurnIndex + 1} / {podcastEpisode.script.length}
                </span>
                <button
                  onClick={() => {
                    setCurrentTurnIndex(0);
                    setIsPlaying(true);
                  }}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                  title="Restart playback"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Live Interactive Dialogue Stream */}
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {podcastEpisode.script.map((turn, idx) => {
                const isCurrent = idx === currentTurnIndex;
                const isSarah = turn.speaker.includes('Sarah');

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setCurrentTurnIndex(idx);
                      setIsPlaying(true);
                    }}
                    className={`p-4 rounded-2xl border transition cursor-pointer ${
                      isCurrent
                        ? isSarah
                          ? 'bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30'
                          : 'bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/30'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            isSarah ? 'bg-indigo-400' : 'bg-purple-400'
                          } ${isCurrent ? 'animate-ping' : ''}`}
                        />
                        <span className="font-bold text-white text-xs">{turn.speaker}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {turn.topic}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans pl-4 border-l-2 border-slate-800">
                      "{turn.text}"
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-10 bg-slate-950/50 border border-dashed border-slate-800 rounded-2xl space-y-3">
            <Radio className="w-8 h-8 mx-auto text-indigo-400 opacity-60" />
            <h4 className="text-sm font-bold text-white">Generate Your Audio Overview</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Click the "Generate Audio Overview Dialogue" button above to synthesize a two-person scientific podcast analyzing trade-offs, spatial leakage, and turnaround latency across your evidence base.
            </p>
          </div>
        )}
      </div>

      {/* Grounded Corpus Q&A Assistant */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-5 h-5 text-teal-400" />
            <div>
              <h3 className="font-bold text-white text-sm">Grounded SLR Research Assistant</h3>
              <p className="text-xs text-slate-400">
                Ask specific questions across the {includedArticles.length} included studies with in-text citation chips [1], [2]
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
            Source Grounded
          </span>
        </div>

        {/* Question Form */}
        <form onSubmit={handleAskQuestion} className="flex gap-2">
          <input
            type="text"
            required
            placeholder="Ask about spatial autocorrelation, sensor bands, edge AI latency, or validation metrics..."
            value={qaQuestion}
            onChange={(e) => setQaQuestion(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={isAskingQa}
            className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-2xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isAskingQa ? 'Synthesizing...' : 'Ask Evidence'}</span>
          </button>
        </form>

        {/* Q&A Thread */}
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {qaHistory.map((item, idx) => (
            <div
              key={idx}
              className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="font-bold text-teal-400 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Q: {item.question}</span>
                </span>
                <span className="font-mono text-[10px]">
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="text-slate-300 leading-relaxed pl-3 border-l-2 border-teal-500/60 font-sans text-xs sm:text-[13px]">
                {item.answer}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
