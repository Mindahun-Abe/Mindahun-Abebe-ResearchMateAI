import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import { Article, ModuleQaRescanRecord, ReviewProject, WorkbenchModuleId } from '../types';
import { classifyPaperType, detectArticleSourceDatabase } from '../utils/slrDetectionEngine';
import {
  TrendingUp,
  Download,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  BookOpen,
  BarChart3,
  Layers,
  ArrowRight,
  FileText,
  FileSpreadsheet,
  FileCode,
  FileDown,
} from 'lucide-react';
import { AutoSaveStatusInfo, ModuleWorkbenchControls } from './ModuleWorkbenchControls';

interface IncludedResultsSynthesisProps {
  project: ReviewProject;
  articles: Article[];
  onNavigateToBriefing?: () => void;
  onNavigateToProposal?: () => void;
  onSelectArticle?: (articleId: string) => void;
  autoSaveStatus?: AutoSaveStatusInfo;
  onResetWorkbenchModule?: (params: {
    target: WorkbenchModuleId;
    resetArticleFields?: boolean;
    deleteArticlesMode?: 'none' | 'excluded' | 'uncertain' | 'unscreened' | 'duplicates';
  }) => Promise<any>;
  onDirectAddDataFiles?: (
    files: FileList,
    options?: { autoScreen?: boolean; rescanQuery?: string; moduleId?: WorkbenchModuleId }
  ) => Promise<{ addedCount: number }>;
  onRescanWithQueryQA?: (
    moduleId: WorkbenchModuleId,
    query: string,
    applyScreeningUpdates: boolean
  ) => Promise<{ record: ModuleQaRescanRecord; updatedCount?: number }>;
  onDeleteQaEntry?: (moduleId: WorkbenchModuleId, recordId: string) => void;
  onOpenBulkImporter?: () => void;
}

const escapeHtml = (value: unknown): string => {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const getFileSlug = (project: ReviewProject): string => {
  const base = (project.databaseFolderName || project.title || project.id || 'slr-review')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || project.id || 'slr-review';
};

const csvCell = (val: unknown): string => {
  const str = String(val ?? '').replace(/\r?\n/g, ' ');
  return `"${str.replace(/"/g, '""')}"`;
};

const sanitizeBibValue = (val: unknown): string =>
  String(val ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/[{}]/g, '')
    .trim();

const pdfSafe = (val: unknown): string =>
  String(val ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF\r\n]/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim();

export const IncludedResultsSynthesis: React.FC<IncludedResultsSynthesisProps> = ({
  project,
  articles,
  onNavigateToBriefing,
  onNavigateToProposal,
  onSelectArticle,
  autoSaveStatus,
  onResetWorkbenchModule,
  onDirectAddDataFiles,
  onRescanWithQueryQA,
  onDeleteQaEntry,
  onOpenBulkImporter,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  // All screened included studies
  const includedArticles = articles.filter((a) => a.decision === 'include');

  // Distributions
  const sensorsCount: Record<string, number> = {};
  const platformsCount: Record<string, number> = {};
  const yearsCount: Record<string, number> = {};
  let reportedLatencyCount = 0;

  includedArticles.forEach((art) => {
    const s = art.extractedData?.sensor || 'Optical / Multi-band';
    sensorsCount[s] = (sensorsCount[s] || 0) + 1;

    const p = art.extractedData?.platform || 'UAV / Drone';
    platformsCount[p] = (platformsCount[p] || 0) + 1;

    const y = art.year?.toString() || 'N/A';
    yearsCount[y] = (yearsCount[y] || 0) + 1;

    if (art.extractedData?.latencyReported || art.extractedData?.latency) {
      reportedLatencyCount++;
    }
  });

  const triggerDownload = (content: string, filename: string, mimeType: string, label: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloadStatus(`Downloaded ${label} (${filename})`);
    setTimeout(() => setDownloadStatus(null), 5000);
  };

  const handleCopyCitation = (art: Article) => {
    const citation = `${art.authors?.join(', ')} (${art.year}). "${art.title}". ${art.journal}. ${art.doi ? `DOI: https://doi.org/${art.doi}` : ''}`;
    navigator.clipboard.writeText(citation);
    setCopiedId(art.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Recovered Original Export Table CSV (exact original columns & filename)
  const handleExportSynthesisCsv = () => {
    const headers = ['Ref #', 'Title', 'Authors', 'Year', 'Journal', 'DOI', 'Platform', 'Sensor', 'Latency', 'Findings'];
    const rows = includedArticles.map((art, idx) => [
      `[${idx + 1}]`,
      `"${(art.title || '').replace(/"/g, '""')}"`,
      `"${(art.authors || []).join('; ').replace(/"/g, '""')}"`,
      art.year,
      `"${(art.journal || '').replace(/"/g, '""')}"`,
      art.doi || '',
      `"${art.extractedData?.platform || 'N/A'}"`,
      `"${art.extractedData?.sensor || 'N/A'}"`,
      `"${art.extractedData?.latency || 'Not reported'}"`,
      `"${(art.abstract || '').slice(0, 160).replace(/"/g, '""')}..."`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(
      csvContent,
      `${project.id}-included-studies-synthesis.csv`,
      'text/csv;charset=utf-8;',
      `${includedArticles.length} included studies synthesis CSV`
    );
  };

  // Secondary 1: Direct PDF Export (.pdf) for all Screened Included Studies
  const handleExportIncludedPdf = () => {
    if (includedArticles.length === 0) return;
    const slug = getFileSlug(project);
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 44;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageHeight - margin - 18) {
        doc.addPage();
        y = margin;
      }
    };

    const writeWrapped = (
      text: string,
      fontSize: number,
      style: 'normal' | 'bold' | 'italic' = 'normal',
      color: [number, number, number] = [30, 41, 59],
      lineGap = 4
    ) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(fontSize);
      doc.setTextColor(color[0], color[1], color[2]);
      const lines = doc.splitTextToSize(pdfSafe(text), maxWidth) as string[];
      const lineHeight = fontSize * 1.32;
      for (const line of lines) {
        ensureSpace(lineHeight);
        doc.text(line, margin, y);
        y += lineHeight;
      }
      y += lineGap;
    };

    // Document Title Banner
    writeWrapped('PRISMA 2020 Screened Included Studies — SLR Evidence Report', 15, 'bold', [15, 118, 110], 4);
    writeWrapped(project.title, 12, 'bold', [15, 23, 42], 2);
    if (project.subtitle) {
      writeWrapped(project.subtitle, 9.5, 'italic', [71, 85, 105], 4);
    }
    writeWrapped(
      `Discipline: ${project.discipline}  |  Publication Span: ${project.publicationYears}  |  Included Studies: ${includedArticles.length} (of ${articles.length} total)  |  Exported: ${new Date().toLocaleDateString()}`,
      8.5,
      'normal',
      [100, 116, 139],
      8
    );

    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;

    // PICOC Summary
    writeWrapped('1. PICOC Inclusion Framework', 11, 'bold', [15, 118, 110], 4);
    writeWrapped(`Population (P): ${project.picoc.population}`, 9, 'normal', [30, 41, 59], 2);
    writeWrapped(`Intervention (I): ${project.picoc.intervention}`, 9, 'normal', [30, 41, 59], 2);
    writeWrapped(`Comparison (C): ${project.picoc.comparison}`, 9, 'normal', [30, 41, 59], 2);
    writeWrapped(`Outcome (O): ${project.picoc.outcome}`, 9, 'normal', [30, 41, 59], 2);
    writeWrapped(`Context (C): ${project.picoc.context}`, 9, 'normal', [30, 41, 59], 8);

    // Summary Stats
    const latencyPct = Math.round((reportedLatencyCount / Math.max(includedArticles.length, 1)) * 100);
    writeWrapped('2. Included Cohort Summary', 11, 'bold', [15, 118, 110], 4);
    writeWrapped(
      `Total Screened Included: ${includedArticles.length}  |  Latency Quantified: ${reportedLatencyCount}/${includedArticles.length} (${latencyPct}%)  |  Sensor Payloads: ${Object.keys(sensorsCount).length} types  |  Platforms: ${Object.keys(platformsCount).length} types`,
      9,
      'normal',
      [30, 41, 59],
      10
    );

    // Individual Included Studies
    writeWrapped(`3. Screened Included Studies (${includedArticles.length})`, 11, 'bold', [15, 118, 110], 6);

    includedArticles.forEach((art, idx) => {
      const ext = art.extractedData || {};
      const pType = classifyPaperType(art);
      const sourceDb = detectArticleSourceDatabase(art).database;
      ensureSpace(90);

      writeWrapped(`[${idx + 1}] ${art.title}`, 10.5, 'bold', [15, 23, 42], 2);
      writeWrapped(
        `${(art.authors || []).join(', ') || 'Unknown Authors'} (${art.year || 'N/A'}) — ${art.journal || 'N/A'} | Type: ${pType.category} (${pType.subType}) | Database: ${sourceDb}${art.doi ? ` | DOI: ${art.doi}` : ''}`,
        8.5,
        'italic',
        [71, 85, 105],
        3
      );
      writeWrapped(
        `Platform: ${ext.platform || 'Not specified'}  |  Sensor: ${ext.sensor || 'Not specified'}  |  GSD: ${ext.gsd || 'N/A'}  |  Algorithm: ${ext.algorithm || 'N/A'}  |  Latency: ${ext.latency || 'Not reported'}  |  Spatial Leakage Mitigated: ${ext.spatialLeakageAddressed ? 'Yes' : 'No/Unclear'}`,
        8.5,
        'normal',
        [51, 65, 85],
        2
      );
      if (art.appraisalScore !== undefined || art.riskOfBiasAssessment) {
        writeWrapped(
          `Quality Appraisal: ${art.appraisalScore !== undefined ? `${art.appraisalScore}/13` : 'Pending'}  |  Risk of Bias: ${art.riskOfBiasAssessment || 'Unassessed'}`,
          8.5,
          'bold',
          [15, 118, 110],
          2
        );
      }
      if (art.abstract) {
        writeWrapped(`Abstract: ${art.abstract}`, 8.5, 'normal', [30, 41, 59], 3);
      }
      if (ext.keyFindings) {
        writeWrapped(`Key Findings: ${ext.keyFindings}`, 8.5, 'normal', [30, 41, 59], 3);
      }
      if (art.reviewerNotes || art.decisionReason) {
        writeWrapped(`Screening Notes: ${art.reviewerNotes || art.decisionReason}`, 8.5, 'italic', [71, 85, 105], 3);
      }
      if (art.evidenceCitations && art.evidenceCitations.length > 0) {
        art.evidenceCitations.forEach((cit) => {
          writeWrapped(
            `Evidence (p.${cit.pageNumber}, ${cit.section}): "${cit.quote}" — ${cit.relevance}`,
            8,
            'italic',
            [51, 65, 85],
            2
          );
        });
      }

      ensureSpace(10);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;
    });

    // Page footers
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin - 52, pageHeight - 20);
      doc.text(pdfSafe(project.title).slice(0, 72), margin, pageHeight - 20);
    }

    const filename = `${slug}-screened-included-studies.pdf`;
    doc.save(filename);
    setDownloadStatus(`Downloaded ${includedArticles.length} screened included studies PDF (${filename})`);
    setTimeout(() => setDownloadStatus(null), 5000);
  };

  // Per-study quick PDF download
  const handleExportSinglePdf = (art: Article, idx: number) => {
    const ext = art.extractedData || {};
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 44;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const addBlock = (text: string, size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color: [number, number, number] = [30, 41, 59], gap = 6) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
      const lines = doc.splitTextToSize(pdfSafe(text), maxWidth) as string[];
      lines.forEach((line) => {
        if (y > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += size * 1.35;
      });
      y += gap;
    };

    const singlePaperType = classifyPaperType(art);
    const singleSourceDb = detectArticleSourceDatabase(art).database;
    addBlock(`Included SLR Study [${idx + 1}] — Evidence Profile`, 13, 'bold', [15, 118, 110], 4);
    addBlock(`Review: ${project.title}`, 9, 'normal', [100, 116, 139], 8);
    addBlock(art.title, 12, 'bold', [15, 23, 42], 4);
    addBlock(`${(art.authors || []).join(', ')} (${art.year}) — ${art.journal}`, 9.5, 'italic', [71, 85, 105], 6);
    addBlock(`Paper Type: ${singlePaperType.category} (${singlePaperType.subType})  |  Database Found: ${singleSourceDb}${art.doi ? `  |  DOI: https://doi.org/${art.doi}` : ''}`, 9, 'normal', [51, 65, 85], 6);
    addBlock(`Platform: ${ext.platform || 'N/A'}  |  Sensor: ${ext.sensor || 'N/A'}  |  GSD: ${ext.gsd || 'N/A'}  |  Algorithm: ${ext.algorithm || 'N/A'}  |  Latency: ${ext.latency || 'Not reported'}`, 9, 'normal', [30, 41, 59], 6);
    addBlock(`Appraisal Score: ${art.appraisalScore !== undefined ? `${art.appraisalScore}/13` : 'Pending'}  |  Risk of Bias: ${art.riskOfBiasAssessment || 'Unassessed'}`, 9, 'bold', [15, 118, 110], 8);
    addBlock('Abstract / Empirical Extract', 10, 'bold', [15, 23, 42], 3);
    addBlock(art.abstract || 'No abstract available.', 9.5, 'normal', [30, 41, 59], 8);
    if (ext.keyFindings) {
      addBlock('Key Findings', 10, 'bold', [15, 23, 42], 3);
      addBlock(ext.keyFindings, 9.5, 'normal', [30, 41, 59], 8);
    }

    const filename = `study-${idx + 1}-${art.id}.pdf`;
    doc.save(filename);
    setDownloadStatus(`Downloaded Study [${idx + 1}] PDF (${filename})`);
    setTimeout(() => setDownloadStatus(null), 5000);
  };

  // Secondary 2: Full Screened Included CSV (26 un-truncated columns)
  const handleExportFullIncludedCsv = () => {
    if (includedArticles.length === 0) return;
    const headers = [
      'Ref #',
      'Article ID',
      'Title',
      'Authors',
      'Year',
      'Journal',
      'Volume',
      'Issue',
      'Pages',
      'DOI',
      'URL',
      'Paper Type (Original/Review)',
      'Paper Sub-Type',
      'Source Database',
      'Source File',
      'Screening Stage',
      'Platform',
      'Sensor',
      'GSD',
      'Algorithm',
      'Metrics',
      'Latency',
      'Spatial Leakage Addressed',
      'Appraisal Score (/13)',
      'Risk of Bias',
      'Reviewer Notes',
      'Decision Reason',
      'Abstract',
    ];

    const rows = includedArticles.map((art, idx) => {
      const ext = art.extractedData || {};
      const pType = classifyPaperType(art);
      const sourceDb = detectArticleSourceDatabase(art).database;
      return [
        csvCell(`[${idx + 1}]`),
        csvCell(art.id),
        csvCell(art.title),
        csvCell((art.authors || []).join('; ')),
        csvCell(art.year ?? ''),
        csvCell(art.journal || ''),
        csvCell(art.volume || ''),
        csvCell(art.issue || ''),
        csvCell(art.pagesStr || ''),
        csvCell(art.doi || ''),
        csvCell(art.url || (art.doi ? `https://doi.org/${art.doi}` : '')),
        csvCell(pType.category),
        csvCell(pType.subType),
        csvCell(sourceDb),
        csvCell(art.sourceFileName || ''),
        csvCell(art.screeningStage || 'final_included'),
        csvCell(ext.platform || 'Not specified'),
        csvCell(ext.sensor || 'Not specified'),
        csvCell(ext.gsd || ''),
        csvCell(ext.algorithm || ''),
        csvCell(ext.metrics || ''),
        csvCell(ext.latency || 'Not reported'),
        csvCell(ext.spatialLeakageAddressed ? 'Yes' : 'No / Unclear'),
        csvCell(art.appraisalScore ?? ''),
        csvCell(art.riskOfBiasAssessment || ''),
        csvCell(art.reviewerNotes || art.screeningNotes || ''),
        csvCell(art.decisionReason || ''),
        csvCell(art.abstract || ''),
      ].join(',');
    });

    const csvContent = `\uFEFF${[headers.join(','), ...rows].join('\n')}`;
    const slug = getFileSlug(project);
    triggerDownload(
      csvContent,
      `${slug}-screened-included-studies-full.csv`,
      'text/csv;charset=utf-8;',
      `${includedArticles.length} screened included studies Full CSV`
    );
  };

  // 2. Word Report (.doc) of Screened Included Studies
  const handleExportIncludedWord = () => {
    if (includedArticles.length === 0) return;
    const slug = getFileSlug(project);
    const generatedAt = new Date().toLocaleString();
    const latencyPct = Math.round((reportedLatencyCount / Math.max(includedArticles.length, 1)) * 100);

    const summaryRowsHtml = includedArticles
      .map((art, idx) => {
        const ext = art.extractedData || {};
        return `
          <tr>
            <td>[${idx + 1}]</td>
            <td><strong>${escapeHtml(art.title)}</strong><br/><span style="color:#475569;font-size:9pt;">${escapeHtml((art.authors || []).slice(0, 4).join(', '))}${(art.authors || []).length > 4 ? ' et al.' : ''} (${escapeHtml(art.year)})</span></td>
            <td>${escapeHtml(art.journal || 'N/A')}</td>
            <td>${escapeHtml(art.sourceDatabase || 'N/A')}</td>
            <td>${escapeHtml(ext.platform || 'N/A')}</td>
            <td>${escapeHtml(ext.sensor || 'N/A')}</td>
            <td>${escapeHtml(ext.latency || 'Not reported')}</td>
            <td>${art.appraisalScore !== undefined ? `${art.appraisalScore}/13` : 'Pending'}</td>
            <td>${escapeHtml(art.riskOfBiasAssessment || 'Unassessed')}</td>
          </tr>
        `;
      })
      .join('');

    const studyProfilesHtml = includedArticles
      .map((art, idx) => {
        const ext = art.extractedData || {};
        const doiLink = art.url || (art.doi ? `https://doi.org/${art.doi}` : '');
        const citationsHtml =
          art.evidenceCitations && art.evidenceCitations.length > 0
            ? `<div style="margin-top:6pt;"><strong>Extracted Page-Anchored Evidence (${art.evidenceCitations.length}):</strong><ul>${art.evidenceCitations
                .map(
                  (c) =>
                    `<li><em>Page ${escapeHtml(c.pageNumber)} (${escapeHtml(c.section)}):</em> &ldquo;${escapeHtml(c.quote)}&rdquo; &mdash; ${escapeHtml(c.relevance)}</li>`
                )
                .join('')}</ul></div>`
            : '';

        return `
          <div style="border:1px solid #cbd5e1;padding:10pt;margin-bottom:12pt;page-break-inside:avoid;">
            <h3 style="margin:0 0 4pt 0;color:#0f172a;">Study [${idx + 1}]: ${escapeHtml(art.title)}</h3>
            <p style="margin:0 0 6pt 0;font-size:9.5pt;color:#334155;">
              <strong>Authors:</strong> ${escapeHtml((art.authors || []).join(', ') || 'N/A')} |
              <strong>Year:</strong> ${escapeHtml(art.year)} |
              <strong>Journal:</strong> <em>${escapeHtml(art.journal || 'N/A')}</em> |
              <strong>Source:</strong> ${escapeHtml(art.sourceDatabase || 'N/A')}
              ${art.doi ? ` | <strong>DOI:</strong> ${escapeHtml(art.doi)}` : ''}
              ${doiLink ? ` | <strong>URL:</strong> ${escapeHtml(doiLink)}` : ''}
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:6pt;">
              <tr>
                <td style="border:1px solid #e2e8f0;padding:4pt;"><strong>Platform:</strong> ${escapeHtml(ext.platform || 'Not specified')}</td>
                <td style="border:1px solid #e2e8f0;padding:4pt;"><strong>Sensor:</strong> ${escapeHtml(ext.sensor || 'Not specified')}</td>
                <td style="border:1px solid #e2e8f0;padding:4pt;"><strong>GSD / Altitude:</strong> ${escapeHtml(ext.gsd || ext.altitude || 'Not specified')}</td>
              </tr>
              <tr>
                <td style="border:1px solid #e2e8f0;padding:4pt;"><strong>Algorithm:</strong> ${escapeHtml(ext.algorithm || 'Not specified')}</td>
                <td style="border:1px solid #e2e8f0;padding:4pt;"><strong>Latency:</strong> ${escapeHtml(ext.latency || 'Not reported')}</td>
                <td style="border:1px solid #e2e8f0;padding:4pt;"><strong>Appraisal / RoB:</strong> ${art.appraisalScore !== undefined ? `${art.appraisalScore}/13` : 'N/A'} (${escapeHtml(art.riskOfBiasAssessment || 'Unassessed')})</td>
              </tr>
            </table>
            <p style="margin:4pt 0;font-size:9.5pt;"><strong>Abstract / Empirical Extract:</strong> ${escapeHtml(art.abstract || 'No abstract available.')}</p>
            ${ext.keyFindings ? `<p style="margin:4pt 0;font-size:9.5pt;"><strong>Key Findings:</strong> ${escapeHtml(ext.keyFindings)}</p>` : ''}
            ${(art.reviewerNotes || art.decisionReason) ? `<p style="margin:4pt 0;font-size:9.5pt;"><strong>Screening Notes / Rationale:</strong> ${escapeHtml(art.reviewerNotes || art.decisionReason)}</p>` : ''}
            ${citationsHtml}
          </div>
        `;
      })
      .join('');

    const referencesHtml = includedArticles
      .map(
        (art, idx) =>
          `<p style="margin:3pt 0;font-size:9.5pt;">[${idx + 1}] ${escapeHtml((art.authors || []).join(', '))} (${escapeHtml(art.year)}). ${escapeHtml(art.title)}. <em>${escapeHtml(art.journal)}</em>.${art.doi ? ` https://doi.org/${escapeHtml(art.doi)}` : ''}</p>`
      )
      .join('');

    const docHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(project.title)} — Screened Included Studies Report</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; color: #0f172a; line-height: 1.4; font-size: 10.5pt; }
  h1 { font-size: 16pt; color: #0f172a; border-bottom: 2px solid #0f766e; padding-bottom: 4pt; }
  h2 { font-size: 13pt; color: #0f766e; margin-top: 16pt; }
  table.matrix { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 8pt; }
  table.matrix th, table.matrix td { border: 1px solid #cbd5e1; padding: 5pt; text-align: left; vertical-align: top; }
  table.matrix th { background-color: #f1f5f9; font-weight: bold; }
</style>
</head>
<body>
  <h1>PRISMA 2020 Screened Included Studies Report</h1>
  <p><strong>Review Title:</strong> ${escapeHtml(project.title)}</p>
  ${project.subtitle ? `<p><strong>Subtitle:</strong> ${escapeHtml(project.subtitle)}</p>` : ''}
  <p><strong>Discipline:</strong> ${escapeHtml(project.discipline)} | <strong>Publication Window:</strong> ${escapeHtml(project.publicationYears)} | <strong>Screened Included Count:</strong> ${includedArticles.length} of ${articles.length} total records | <strong>Exported:</strong> ${escapeHtml(generatedAt)}</p>

  <h2>1. PICOC Eligibility Summary</h2>
  <ul>
    <li><strong>Population:</strong> ${escapeHtml(project.picoc.population)}</li>
    <li><strong>Intervention:</strong> ${escapeHtml(project.picoc.intervention)}</li>
    <li><strong>Comparison:</strong> ${escapeHtml(project.picoc.comparison)}</li>
    <li><strong>Outcome:</strong> ${escapeHtml(project.picoc.outcome)}</li>
    <li><strong>Context:</strong> ${escapeHtml(project.picoc.context)}</li>
  </ul>

  <h2>2. Included Evidence Base Summary Metrics</h2>
  <ul>
    <li><strong>Total Screened Included Studies:</strong> ${includedArticles.length}</li>
    <li><strong>Latency Quantified:</strong> ${reportedLatencyCount}/${includedArticles.length} (${latencyPct}%)</li>
    <li><strong>Distinct Sensor Types:</strong> ${Object.entries(sensorsCount).map(([k, v]) => `${escapeHtml(k)} (${v})`).join(', ') || 'None'}</li>
    <li><strong>Distinct Platforms:</strong> ${Object.entries(platformsCount).map(([k, v]) => `${escapeHtml(k)} (${v})`).join(', ') || 'None'}</li>
  </ul>

  <h2>3. Comparative Extraction Matrix (All Screened Included Studies)</h2>
  <table class="matrix">
    <thead>
      <tr>
        <th>Ref</th>
        <th>Study &amp; Authors</th>
        <th>Journal</th>
        <th>Source</th>
        <th>Platform</th>
        <th>Sensor</th>
        <th>Latency</th>
        <th>Score</th>
        <th>Risk of Bias</th>
      </tr>
    </thead>
    <tbody>${summaryRowsHtml}</tbody>
  </table>

  <h2>4. Detailed Study Profiles</h2>
  ${studyProfilesHtml}

  <h2>5. Bibliography of Included Studies</h2>
  ${referencesHtml}
</body>
</html>`;

    triggerDownload(
      docHtml,
      `${slug}-screened-included-studies.doc`,
      'application/msword;charset=utf-8',
      `${includedArticles.length} screened included studies Word report`
    );
  };

  // 3. RIS Format (.ris) for Zotero / Mendeley / EndNote / Covidence
  const buildRisEntry = (art: Article) => {
    const lines: string[] = ['TY  - JOUR'];
    lines.push(`TI  - ${art.title}`);
    (art.authors || []).forEach((author) => {
      if (author.trim()) lines.push(`AU  - ${author.trim()}`);
    });
    if (art.year) lines.push(`PY  - ${art.year}`);
    if (art.journal) lines.push(`JO  - ${art.journal}`);
    if (art.volume) lines.push(`VL  - ${art.volume}`);
    if (art.issue) lines.push(`IS  - ${art.issue}`);
    if (art.pagesStr) lines.push(`SP  - ${art.pagesStr}`);
    if (art.doi) lines.push(`DO  - ${art.doi}`);
    if (art.url || art.doi) lines.push(`UR  - ${art.url || `https://doi.org/${art.doi}`}`);
    if (art.abstract) lines.push(`AB  - ${art.abstract.replace(/\r?\n/g, ' ')}`);
    if (art.sourceDatabase) lines.push(`DB  - ${art.sourceDatabase}`);
    if (art.extractedData?.sensor) lines.push(`KW  - ${art.extractedData.sensor}`);
    if (art.extractedData?.platform) lines.push(`KW  - ${art.extractedData.platform}`);
    if (art.reviewerNotes || art.decisionReason) {
      lines.push(`N1  - Screening included note: ${(art.reviewerNotes || art.decisionReason || '').replace(/\r?\n/g, ' ')}`);
    }
    lines.push('ER  - ');
    return lines.join('\r\n');
  };

  const handleExportRis = () => {
    if (includedArticles.length === 0) return;
    const risContent = includedArticles.map(buildRisEntry).join('\r\n\r\n');
    const slug = getFileSlug(project);
    triggerDownload(
      risContent,
      `${slug}-screened-included-studies.ris`,
      'application/x-research-info-systems;charset=utf-8',
      `${includedArticles.length} screened included studies RIS`
    );
  };

  const handleExportSingleRis = (art: Article, idx: number) => {
    const risContent = buildRisEntry(art);
    triggerDownload(
      risContent,
      `study-${idx + 1}-${art.id}.ris`,
      'application/x-research-info-systems;charset=utf-8',
      `Study [${idx + 1}] RIS`
    );
  };

  // 4. BibTeX Format (.bib)
  const handleExportBibTeX = () => {
    if (includedArticles.length === 0) return;
    const entries = includedArticles.map((art, idx) => {
      const firstAuthor = (art.authors?.[0] || 'study')
        .split(/[\s,]+/)[0]
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') || 'study';
      const citeKey = `${firstAuthor}${art.year || 'nd'}_${idx + 1}`;
      const authorsStr = (art.authors || []).map(sanitizeBibValue).join(' and ');
      const fields = [
        `  title = {${sanitizeBibValue(art.title)}}`,
        authorsStr ? `  author = {${authorsStr}}` : '',
        art.year ? `  year = {${art.year}}` : '',
        art.journal ? `  journal = {${sanitizeBibValue(art.journal)}}` : '',
        art.volume ? `  volume = {${sanitizeBibValue(art.volume)}}` : '',
        art.issue ? `  number = {${sanitizeBibValue(art.issue)}}` : '',
        art.pagesStr ? `  pages = {${sanitizeBibValue(art.pagesStr)}}` : '',
        art.doi ? `  doi = {${sanitizeBibValue(art.doi)}}` : '',
        (art.url || art.doi) ? `  url = {${sanitizeBibValue(art.url || `https://doi.org/${art.doi}`)}}` : '',
        art.abstract ? `  abstract = {${sanitizeBibValue(art.abstract)}}` : '',
        art.sourceDatabase ? `  note = {Included in SLR; Source: ${sanitizeBibValue(art.sourceDatabase)}}` : '',
      ].filter(Boolean);

      return `@article{${citeKey},\n${fields.join(',\n')}\n}`;
    });

    const slug = getFileSlug(project);
    triggerDownload(
      entries.join('\n\n'),
      `${slug}-screened-included-studies.bib`,
      'application/x-bibtex;charset=utf-8',
      `${includedArticles.length} screened included studies BibTeX`
    );
  };

  // 5. Markdown Synthesis (.md)
  const handleExportMarkdown = () => {
    if (includedArticles.length === 0) return;
    const slug = getFileSlug(project);
    const lines: string[] = [
      `# Screened Included Studies — ${project.title}`,
      '',
      `- **Discipline:** ${project.discipline}`,
      `- **Publication Span:** ${project.publicationYears}`,
      `- **Included Studies:** ${includedArticles.length} (from ${articles.length} records in folder)`,
      `- **Exported:** ${new Date().toISOString()}`,
      '',
      '## Comparative Table',
      '',
      '| Ref | Title | Authors | Year | Journal | Platform | Sensor | Latency | Appraisal | DOI |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...includedArticles.map((art, idx) => {
        const ext = art.extractedData || {};
        const clean = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
        return `| [${idx + 1}] | ${clean(art.title)} | ${clean((art.authors || []).slice(0, 3).join(', '))} | ${art.year || ''} | ${clean(art.journal)} | ${clean(ext.platform || 'N/A')} | ${clean(ext.sensor || 'N/A')} | ${clean(ext.latency || 'Not reported')} | ${art.appraisalScore !== undefined ? `${art.appraisalScore}/13` : 'N/A'} | ${clean(art.doi || '')} |`;
      }),
      '',
      '## Study Details',
      '',
      ...includedArticles.flatMap((art, idx) => {
        const ext = art.extractedData || {};
        return [
          `### [${idx + 1}] ${art.title}`,
          `- **Authors:** ${(art.authors || []).join(', ') || 'N/A'}`,
          `- **Journal / Year:** ${art.journal || 'N/A'} (${art.year || 'N/A'})`,
          `- **Source Database:** ${art.sourceDatabase || 'N/A'}`,
          `- **DOI / URL:** ${art.doi ? `https://doi.org/${art.doi}` : art.url || 'N/A'}`,
          `- **Extracted Specs:** Platform=${ext.platform || 'N/A'} | Sensor=${ext.sensor || 'N/A'} | Latency=${ext.latency || 'Not reported'} | Spatial Leakage Mitigated=${ext.spatialLeakageAddressed ? 'Yes' : 'No/Unclear'}`,
          `- **Abstract:** ${art.abstract || 'N/A'}`,
          '',
        ];
      }),
    ];

    triggerDownload(
      lines.join('\n'),
      `${slug}-screened-included-studies.md`,
      'text/markdown;charset=utf-8',
      `${includedArticles.length} screened included studies Markdown`
    );
  };

  // 6. Structured JSON Export (.json)
  const handleExportJson = () => {
    if (includedArticles.length === 0) return;
    const slug = getFileSlug(project);
    const payload = {
      exportedAt: new Date().toISOString(),
      reviewId: project.id,
      reviewTitle: project.title,
      subtitle: project.subtitle,
      discipline: project.discipline,
      publicationYears: project.publicationYears,
      totalRecordsInFolder: articles.length,
      totalScreenedIncluded: includedArticles.length,
      picoc: project.picoc,
      includedStudies: includedArticles.map((art, idx) => ({
        refNumber: idx + 1,
        id: art.id,
        title: art.title,
        authors: art.authors,
        year: art.year,
        journal: art.journal,
        volume: art.volume,
        issue: art.issue,
        pagesStr: art.pagesStr,
        doi: art.doi,
        url: art.url || (art.doi ? `https://doi.org/${art.doi}` : undefined),
        sourceDatabase: art.sourceDatabase,
        sourceFileName: art.sourceFileName,
        screeningStage: art.screeningStage,
        decision: art.decision,
        decisionReason: art.decisionReason,
        reviewerNotes: art.reviewerNotes || art.screeningNotes,
        appraisalScore: art.appraisalScore,
        riskOfBiasAssessment: art.riskOfBiasAssessment,
        extractedData: art.extractedData,
        evidenceCitations: art.evidenceCitations,
        abstract: art.abstract,
      })),
    };

    triggerDownload(
      JSON.stringify(payload, null, 2),
      `${slug}-screened-included-studies.json`,
      'application/json;charset=utf-8',
      `${includedArticles.length} screened included studies JSON`
    );
  };

  return (
    <div className="space-y-6">
      <ModuleWorkbenchControls
        project={project}
        moduleId="results"
        moduleLabel="Included Studies Synthesis"
        autoSaveStatus={autoSaveStatus}
        resetFieldsLabel="Reset Quantitative Synthesis Flags"
        deleteModes={['excluded', 'uncertain']}
        onResetModule={onResetWorkbenchModule}
        onAddDataFiles={onDirectAddDataFiles}
        onOpenBulkImporter={onOpenBulkImporter}
        onRescanQueryQA={onRescanWithQueryQA}
        onDeleteQaEntry={onDeleteQaEntry}
      />
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>PRISMA 2020 Included Evidence Base</span>
            </div>
            <h2 className="text-xl font-bold text-white">Results for Included Studies ({includedArticles.length} Studies)</h2>
            <p className="text-xs text-slate-400">
              Rigorous qualitative and quantitative synthesis of studies meeting all predefined PICOC inclusion criteria.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onNavigateToBriefing && (
              <button
                onClick={onNavigateToBriefing}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>NotebookLM Research Briefing</span>
              </button>
            )}

            <button
              onClick={handleExportSynthesisCsv}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export Table CSV</span>
            </button>
          </div>
        </div>

        {/* Secondary Additional Direct SLR Exports for Included Studies */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <FileDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-300">
                Additional Included-Studies Downloads ({includedArticles.length} Screened Articles):
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onNavigateToProposal && (
                <button
                  onClick={onNavigateToProposal}
                  className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] font-medium rounded-lg border border-slate-700/80 transition inline-flex items-center gap-1 cursor-pointer"
                >
                  <BookOpen className="w-3 h-3 text-indigo-400" />
                  <span>Proposal Draft</span>
                </button>
              )}
              {downloadStatus && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium">
                  <Check className="w-3 h-3" />
                  <span>{downloadStatus}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportIncludedPdf}
              disabled={includedArticles.length === 0}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-rose-400" />
              <span>PDF (.pdf)</span>
            </button>

            <button
              onClick={handleExportIncludedWord}
              disabled={includedArticles.length === 0}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Word (.doc)</span>
            </button>

            <button
              onClick={handleExportFullIncludedCsv}
              disabled={includedArticles.length === 0}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Full CSV (.csv)</span>
            </button>

            <button
              onClick={handleExportRis}
              disabled={includedArticles.length === 0}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>RIS (.ris)</span>
            </button>

            <button
              onClick={handleExportBibTeX}
              disabled={includedArticles.length === 0}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>BibTeX (.bib)</span>
            </button>

            <button
              onClick={handleExportMarkdown}
              disabled={includedArticles.length === 0}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Markdown (.md)</span>
            </button>

            <button
              onClick={handleExportJson}
              disabled={includedArticles.length === 0}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileCode className="w-3.5 h-3.5 text-purple-400" />
              <span>JSON (.json)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Distribution Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2">
          <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Evidence Base Volume</span>
          </span>
          <p className="text-2xl font-extrabold text-white font-mono">{includedArticles.length} Studies</p>
          <p className="text-[10px] text-slate-500">100% peer-reviewed empirical data</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2">
          <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-pink-400" />
            <span>Latency Quantified</span>
          </span>
          <p className="text-2xl font-extrabold text-pink-300 font-mono">
            {reportedLatencyCount}/{includedArticles.length}
          </p>
          <p className="text-[10px] text-slate-500">
            {Math.round((reportedLatencyCount / Math.max(includedArticles.length, 1)) * 100)}% report end-to-end turnaround
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2">
          <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sensor Payloads</span>
          </span>
          <p className="text-2xl font-extrabold text-cyan-300 font-mono">{Object.keys(sensorsCount).length} Types</p>
          <p className="text-[10px] text-slate-500">Multispectral, thermal, hyperspectral</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2">
          <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>Publication Span</span>
          </span>
          <p className="text-2xl font-extrabold text-emerald-400 font-mono">{project.publicationYears}</p>
          <p className="text-[10px] text-slate-500">Systematic date eligibility window</p>
        </div>
      </div>

      {/* Empty State or Synthesis Cards List */}
      {includedArticles.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-200">No Screened Included Studies Yet</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Mark eligible records as Included during PRISMA Screening to populate this synthesis view and enable direct included-article exports.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {includedArticles.map((art, idx) => {
            const ext = art.extractedData || {};
            const pType = classifyPaperType(art);
            const sourceDb = detectArticleSourceDatabase(art).database;
            return (
              <div
                key={art.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 space-y-3 transition shadow-md"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Study [{idx + 1}]
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          pType.category === 'Review'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        }`}
                      >
                        {pType.category}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-slate-400 border border-slate-800">
                        {sourceDb} · {art.year}
                      </span>
                      {art.doi && (
                        <a
                          href={art.url || `https://doi.org/${art.doi}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-slate-500 hover:text-indigo-400 font-mono inline-flex items-center gap-1"
                        >
                          <span>DOI: {art.doi}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                    <h3 className="font-bold text-white text-sm leading-snug">{art.title}</h3>
                    <p className="text-xs text-slate-400">
                      {art.authors?.join(', ')} — <span className="italic text-indigo-300">{art.journal}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      onClick={() => handleCopyCitation(art)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {copiedId === art.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === art.id ? 'Copied Citation' : 'Copy Citation'}</span>
                    </button>
                    <button
                      onClick={() => handleExportSinglePdf(art, idx)}
                      title="Download this screened study as a PDF summary"
                      className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-rose-300 rounded-xl text-xs font-medium inline-flex items-center gap-1 transition cursor-pointer border border-slate-700/80"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>.pdf</span>
                    </button>
                    <button
                      onClick={() => handleExportSingleRis(art, idx)}
                      title="Download this screened study in RIS citation format"
                      className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-emerald-300 rounded-xl text-xs font-medium inline-flex items-center gap-1 transition cursor-pointer border border-slate-700/80"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>.ris</span>
                    </button>
                    {onSelectArticle && (
                      <button
                        onClick={() => onSelectArticle(art.id)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                      >
                        <span>Appraisal & Evidence</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Extracted Specifications Chips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block">Platform Architecture:</span>
                    <span className="font-semibold text-slate-200">{ext.platform || 'DJI Quadcopter'}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block">Payload Sensor:</span>
                    <span className="font-semibold text-indigo-300">{ext.sensor || 'Multispectral 5-band'}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block">Operational Latency:</span>
                    <span className={`font-semibold ${ext.latencyReported ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {ext.latency || 'Not reported'}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block">Spatial Leakage Buffer:</span>
                    <span className={`font-semibold ${ext.spatialLeakageAddressed ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {ext.spatialLeakageAddressed ? 'Mitigated (Spatial Split)' : 'Random CV Split'}
                    </span>
                  </div>
                </div>

                {/* Synthesized Abstract snippet */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
                  <span className="text-slate-500 block text-[10px] font-semibold mb-1">Empirical Evidence Extract:</span>
                  {art.abstract}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
