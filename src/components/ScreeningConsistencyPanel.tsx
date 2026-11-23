import React, { useMemo, useState } from 'react';
import {
  Article,
  ReviewProject,
  ScreeningConsistencyReport,
  ScreeningConsistencyStatus,
  ScreeningRunRecord,
} from '../types';
import {
  articleToScreeningDecisionRecord,
  buildScreeningReproducibilityCsv,
  buildScreeningReproducibilityPdf,
  buildScreeningReproducibilityXlsxBlob,
  DETERMINISTIC_PROMPT_VERSION,
  DETERMINISTIC_SCREENING_MODEL_ID,
  DETERMINISTIC_SEED,
  investigateScreeningDiscrepancies,
  sortArticlesDeterministically,
} from '../utils/deterministicScreeningEngine';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  GitCompare,
  History,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Table2,
  Wrench,
  XCircle,
} from 'lucide-react';

interface ScreeningConsistencyPanelProps {
  project: ReviewProject;
  runs?: ScreeningRunRecord[];
  serverReport?: ScreeningConsistencyReport | null;
  onReconcile: () => Promise<void> | void;
  onSelectArticleForScreening?: (articleId: string) => void;
  isBusy?: boolean;
}

export const ScreeningConsistencyPanel: React.FC<ScreeningConsistencyPanelProps> = ({
  project,
  runs: runsProp,
  serverReport,
  onReconcile,
  onSelectArticleForScreening,
  isBusy = false,
}) => {
  const runs = useMemo(
    () => runsProp || project.workbenchState?.batchScreener?.runs || [],
    [runsProp, project.workbenchState?.batchScreener?.runs]
  );

  const report = useMemo(() => {
    if (serverReport) return serverReport;
    return investigateScreeningDiscrepancies(project, runs);
  }, [serverReport, project, runs]);

  const counts = report.authoritativeCounts;
  const [activeView, setActiveView] = useState<'overview' | 'conflicts' | 'compare' | 'history'>('overview');
  const [compareRunA, setCompareRunA] = useState<string>(() => runs[0]?.runId || '');
  const [compareRunB, setCompareRunB] = useState<string>(() => runs[1]?.runId || runs[0]?.runId || '');
  const [historyFilterId, setHistoryFilterId] = useState<string>('');
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const statusMeta: Record<
    ScreeningConsistencyStatus,
    { label: string; badgeClass: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    Consistent: {
      label: 'Consistent (PRISMA Synced)',
      badgeClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/70',
      Icon: CheckCircle2,
    },
    Warning: {
      label: 'Warning (Needs Sync)',
      badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-700/70',
      Icon: AlertTriangle,
    },
    Inconsistent: {
      label: 'Inconsistent (Discrepancy Found)',
      badgeClass: 'bg-rose-950/60 text-rose-300 border-rose-700/70',
      Icon: XCircle,
    },
    Pending: {
      label: 'Pending Unscreened Records',
      badgeClass: 'bg-slate-900 text-slate-300 border-slate-700',
      Icon: Clock,
    },
  };

  const ActiveStatusIcon = statusMeta[report.consistencyStatus].Icon;

  const runComparisonDiffs = useMemo(() => {
    const rA = runs.find((r) => r.runId === compareRunA);
    const rB = runs.find((r) => r.runId === compareRunB);
    if (!rA || !rB) return { rA, rB, diffs: [] as Array<{ id: string; title: string; decA: string; decB: string }> };

    const titleById = new Map((project.articles || []).map((a) => [a.id, a.title]));
    const allIds = Array.from(
      new Set([...Object.keys(rA.decisionSnapshots || {}), ...Object.keys(rB.decisionSnapshots || {})])
    ).sort();

    const diffs: Array<{ id: string; title: string; decA: string; decB: string }> = [];
    for (const id of allIds) {
      const sA = rA.decisionSnapshots?.[id];
      const sB = rB.decisionSnapshots?.[id];
      const dA = sA ? `${sA.decision} (${sA.screeningStage})` : 'not recorded';
      const dB = sB ? `${sB.decision} (${sB.screeningStage})` : 'not recorded';
      if (dA !== dB) {
        diffs.push({
          id,
          title: titleById.get(id) || id,
          decA: dA,
          decB: dB,
        });
      }
    }
    return { rA, rB, diffs };
  }, [runs, compareRunA, compareRunB, project.articles]);

  const recordsWithHistory = useMemo(() => {
    const q = historyFilterId.trim().toLowerCase();
    return sortArticlesDeterministically(project.articles || [])
      .filter((a) => !a.isDuplicate)
      .filter((a) => {
        if (!q) return true;
        return a.id.toLowerCase().includes(q) || a.title.toLowerCase().includes(q);
      })
      .slice(0, 50)
      .map((a) => ({
        article: a,
        record: articleToScreeningDecisionRecord(a, project),
      }));
  }, [project, historyFilterId]);

  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  };

  const handleExportCsv = () => {
    const csv = buildScreeningReproducibilityCsv(project, report, runs);
    triggerDownload(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      `${project.id}-screening-reproducibility-report.csv`
    );
    setExportStatus('Exported CSV Reproducibility Report');
    setTimeout(() => setExportStatus(null), 3000);
  };

  const handleExportXlsx = async () => {
    const blob = await buildScreeningReproducibilityXlsxBlob(project, report, runs);
    triggerDownload(blob, `${project.id}-screening-reproducibility-report.xlsx`);
    setExportStatus('Exported Excel (.xlsx) Reproducibility Report');
    setTimeout(() => setExportStatus(null), 3000);
  };

  const handleExportPdf = () => {
    const doc = buildScreeningReproducibilityPdf(project, report, runs);
    doc.save(`${project.id}-screening-reproducibility-report.pdf`);
    setExportStatus('Exported PDF Reproducibility Report');
    setTimeout(() => setExportStatus(null), 3000);
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4 text-xs">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <h4 className="font-bold text-white text-sm">
              Screening Consistency &amp; PRISMA 2020 Reconciliation Dashboard
            </h4>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px] font-semibold ${
                statusMeta[report.consistencyStatus].badgeClass
              }`}
            >
              <ActiveStatusIcon className="w-3.5 h-3.5" />
              <span>{statusMeta[report.consistencyStatus].label}</span>
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono tabular-nums">
            Protocol {report.protocolVersion} · Criteria SHA-256: {report.criteriaHash.slice(0, 14)} · Engine:{' '}
            {DETERMINISTIC_SCREENING_MODEL_ID} ({DETERMINISTIC_PROMPT_VERSION}, seed={DETERMINISTIC_SEED})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onReconcile()}
            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
            <span>Recalculate &amp; Sync PRISMA</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Table2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportXlsx}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {exportStatus && (
        <div className="px-3 py-1.5 rounded-lg bg-emerald-950/50 border border-emerald-700/60 text-emerald-300 text-[11px] font-medium">
          {exportStatus}
        </div>
      )}

      {/* High-Density KPI Grid (All 14 Required Metrics, Single-Elevation, Tabular Numerals) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">Total Records Uploaded</span>
          <span className="text-sm font-bold text-white font-mono tabular-nums">{counts.totalRecords}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">Duplicates Excluded</span>
          <span className="text-sm font-bold text-amber-300 font-mono tabular-nums">{counts.duplicatesExcluded}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">Unique Records Pool</span>
          <span className="text-sm font-bold text-white font-mono tabular-nums">{counts.uniqueRecords}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">Screened / Pending</span>
          <span className="text-sm font-bold text-teal-300 font-mono tabular-nums">
            {counts.screenedRecords} / {counts.pendingRecords}
          </span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">PRISMA Included Studies</span>
          <span className="text-sm font-bold text-emerald-400 font-mono tabular-nums">
            {counts.includedStudies} (Reports: {counts.reportsOfIncludedStudies})
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">Excluded (Title/Abs · Full)</span>
          <span className="text-sm font-bold text-rose-300 font-mono tabular-nums">
            {counts.excludedAtTitleAbstract} · {counts.excludedAtFullText}
          </span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">Uncertain / Full-Text</span>
          <span className="text-sm font-bold text-amber-300 font-mono tabular-nums">{counts.uncertainRecords}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">Reused (Last Incremental)</span>
          <span className="text-sm font-bold text-indigo-300 font-mono tabular-nums">{counts.reusedDecisionsCount}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">Modified Flagged</span>
          <span className="text-sm font-bold text-amber-400 font-mono tabular-nums">{counts.modifiedFlaggedCount}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
          <span className="text-[10px] text-slate-400 block">Manual Overrides Protected</span>
          <span className="text-sm font-bold text-cyan-300 font-mono tabular-nums">{counts.manualOverridesCount}</span>
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveView('overview')}
            className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
              activeView === 'overview'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
            }`}
          >
            PRISMA Equations &amp; Module Sync
          </button>
          <button
            type="button"
            onClick={() => setActiveView('conflicts')}
            className={`px-3 py-1 rounded-lg font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
              activeView === 'conflicts'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>View Conflicting ({report.discrepancies.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('compare')}
            className={`px-3 py-1 rounded-lg font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
              activeView === 'compare'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5 text-teal-400" />
            <span>Compare Runs ({runs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('history')}
            className={`px-3 py-1 rounded-lg font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
              activeView === 'history'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
            }`}
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            <span>Decision History</span>
          </button>
        </div>

        {report.discrepancies.length > 0 && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onReconcile()}
            className="px-2.5 py-1 rounded-lg bg-amber-600/20 hover:bg-amber-600/35 border border-amber-500/50 text-amber-200 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Reconcile {report.discrepancies.length} Finding(s)</span>
          </button>
        )}
      </div>

      {/* TAB 1: Overview — PRISMA Consistency Equations & 12-Module Sync */}
      {activeView === 'overview' && (
        <div className="space-y-3">
          {report.summaryCauses.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/60 space-y-1">
              <div className="font-bold text-amber-300 text-[11px]">
                Diagnostic Causes Identified ({report.summaryCauses.length}):
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-100/90">
                {report.summaryCauses.map((cause, idx) => (
                  <li key={idx}>{cause}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-900 text-slate-400 border-b border-slate-800">
                  <th className="py-2 px-3 font-semibold">PRISMA 2020 Validation Equation</th>
                  <th className="py-2 px-3 font-semibold text-right">Formula Result</th>
                  <th className="py-2 px-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {counts.equationChecks.map((eq) => (
                  <tr key={eq.id} className="hover:bg-slate-900/60">
                    <td className="py-2 px-3 text-slate-200">{eq.label}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">{eq.detail}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold">
                      {eq.passed ? (
                        <span className="text-emerald-400">PASS</span>
                      ) : (
                        <span className="text-rose-400">MISMATCH</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Conflicting Records Reconciliation Table */}
      {activeView === 'conflicts' && (
        <div className="space-y-2">
          {report.discrepancies.length === 0 ? (
            <div className="p-6 text-center bg-slate-900 border border-slate-800 rounded-lg text-emerald-300">
              Zero conflicting or unsynchronized records detected across all {counts.totalRecords} records.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-64 overflow-y-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-2.5 font-semibold">Record</th>
                    <th className="py-2 px-2.5 font-semibold">Previous</th>
                    <th className="py-2 px-2.5 font-semibold">Current</th>
                    <th className="py-2 px-2.5 font-semibold">PRISMA</th>
                    <th className="py-2 px-2.5 font-semibold">Reason &amp; Resolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {report.discrepancies.slice(0, 100).map((d, idx) => (
                    <tr
                      key={`${d.record_id}-${idx}`}
                      className="hover:bg-slate-900/70 cursor-pointer"
                      onClick={() => {
                        if (d.record_id !== 'BATCH-STATS-AGGREGATE') {
                          onSelectArticleForScreening?.(d.record_id);
                        }
                      }}
                    >
                      <td className="py-2 px-2.5 max-w-[210px]">
                        <div className="font-semibold text-white truncate" title={d.title}>
                          {d.title}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {d.record_id} · {d.decision_source}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 font-mono text-slate-300">{d.previous_decision}</td>
                      <td className="py-2 px-2.5 font-mono text-amber-300">{d.current_decision}</td>
                      <td className="py-2 px-2.5 font-mono text-emerald-300">{d.prisma_decision}</td>
                      <td className="py-2 px-2.5 max-w-[260px]">
                        <div className="text-slate-200">{d.difference_reason}</div>
                        <div className="text-[10px] text-teal-300 mt-0.5">{d.recommended_resolution}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Run Comparison Tool */}
      {activeView === 'compare' && (
        <div className="space-y-3">
          {runs.length === 0 ? (
            <div className="p-6 text-center bg-slate-900 border border-slate-800 rounded-lg text-slate-400">
              No screening runs recorded yet. Execute Mode A (Incremental) or Mode B (New Evaluation) to compare runs.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Run A (Baseline)</label>
                  <select
                    value={compareRunA || runs[0]?.runId}
                    onChange={(e) => setCompareRunA(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-[11px]"
                  >
                    {runs.map((r) => (
                      <option key={r.runId} value={r.runId}>
                        {r.runId} · {r.mode} · {r.includedCount} inc ({new Date(r.timestamp).toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Run B (Comparison)</label>
                  <select
                    value={compareRunB || runs[1]?.runId || runs[0]?.runId}
                    onChange={(e) => setCompareRunB(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-[11px]"
                  >
                    {runs.map((r) => (
                      <option key={r.runId} value={r.runId}>
                        {r.runId} · {r.mode} · {r.includedCount} inc ({new Date(r.timestamp).toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {runComparisonDiffs.diffs.length === 0 ? (
                <div className="p-4 rounded-lg bg-emerald-950/30 border border-emerald-800/50 text-emerald-300 text-center">
                  100% Identical Decisions across both runs (0 record differences).
                </div>
              ) : (
                <div className="overflow-x-auto max-h-52 overflow-y-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-1.5 px-2.5">Record</th>
                        <th className="py-1.5 px-2.5">Run A</th>
                        <th className="py-1.5 px-2.5">Run B</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {runComparisonDiffs.diffs.map((d) => (
                        <tr key={d.id}>
                          <td className="py-1.5 px-2.5 text-white truncate max-w-[260px]">
                            {d.title} <span className="font-mono text-[10px] text-slate-400">({d.id})</span>
                          </td>
                          <td className="py-1.5 px-2.5 font-mono text-amber-300">{d.decA}</td>
                          <td className="py-1.5 px-2.5 font-mono text-emerald-300">{d.decB}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 4: Per-Record Audit History & SHA-256 Fingerprints */}
      {activeView === 'history' && (
        <div className="space-y-2">
          <input
            type="text"
            value={historyFilterId}
            onChange={(e) => setHistoryFilterId(e.target.value)}
            placeholder="Filter by record ID or article title..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-teal-500"
          />
          <div className="overflow-x-auto max-h-60 overflow-y-auto border border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-1.5 px-2.5">Record ID &amp; Title</th>
                  <th className="py-1.5 px-2.5">Decision &amp; Stage</th>
                  <th className="py-1.5 px-2.5">SHA-256 Fingerprint</th>
                  <th className="py-1.5 px-2.5 text-right">Audit Entries</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {recordsWithHistory.map(({ article, record }) => (
                  <tr key={article.id} className="hover:bg-slate-900/70">
                    <td className="py-1.5 px-2.5 max-w-[240px]">
                      <div className="text-white truncate font-medium">{article.title}</div>
                      <div className="font-mono text-[10px] text-slate-400">
                        {article.id} {record.manual_override ? '· MANUAL OVERRIDE' : ''}
                      </div>
                    </td>
                    <td className="py-1.5 px-2.5 font-mono text-slate-200">
                      {record.canonical_status} ({record.screening_stage})
                    </td>
                    <td className="py-1.5 px-2.5 font-mono text-teal-300 tabular-nums">
                      {record.decision_fingerprint.slice(0, 16)}…
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-slate-300">
                      {record.decision_history.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
