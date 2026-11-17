import React, { useState, useMemo } from 'react';
import { Article, AppraisalItem, AppraisalRating, ReviewProject } from '../types';
import { defaultAppraisalTemplate } from '../data/sampleProjects';
import {
  CheckCircle2,
  Copy,
  RotateCcw,
  Sparkles,
  ClipboardCheck,
  Check,
  FileDown,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import { apiService } from '../services/apiService';

interface AppraisalWorksheetProps {
  project?: ReviewProject;
  article: Article;
  onUpdateArticle: (updated: Article) => void;
  articles: Article[];
  onSelectArticle: (articleId: string) => void;
}

const escapeHtml = (value: string | number | undefined | null): string => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const getArticleWorksheet = (art: Article): AppraisalItem[] => {
  return art.appraisalWorksheet && art.appraisalWorksheet.length === 13
    ? art.appraisalWorksheet
    : defaultAppraisalTemplate;
};

const computeAppraisalSummary = (art: Article) => {
  const items = getArticleWorksheet(art);
  const yesCount = items.filter((i) => i.rating === 'Yes').length;
  const partialCount = items.filter((i) => i.rating === 'Partial').length;
  const noCount = items.filter((i) => i.rating === 'No').length;
  const unclearCount = items.filter((i) => i.rating === 'Unclear').length;
  const ratedCount = 13 - unclearCount;
  const scorePct = Math.round(((yesCount + partialCount * 0.5) / 13) * 100);

  let riskOfBias = art.riskOfBiasAssessment;
  if (!riskOfBias) {
    if (ratedCount === 0) riskOfBias = 'Moderate';
    else if (yesCount >= 10 || scorePct >= 77) riskOfBias = 'Low';
    else if (yesCount >= 6 || scorePct >= 50) riskOfBias = 'Moderate';
    else riskOfBias = 'High';
  }

  return {
    items,
    yesCount,
    partialCount,
    noCount,
    unclearCount,
    ratedCount,
    scorePct,
    riskOfBias,
  };
};

export const AppraisalWorksheet: React.FC<AppraisalWorksheetProps> = ({
  project,
  article,
  onUpdateArticle,
  articles,
  onSelectArticle,
}) => {
  const [copied, setCopied] = useState(false);
  const [isAiAppraising, setIsAiAppraising] = useState(false);
  const [aiError, setAiError] = useState('');
  const [exportScope, setExportScope] = useState<'included' | 'all'>('included');
  const [exportStatus, setExportStatus] = useState<string>('');

  const includedArticles = useMemo(
    () => articles.filter((a) => a.decision === 'include'),
    [articles]
  );

  const exportArticles = useMemo(() => {
    if (exportScope === 'included' && includedArticles.length > 0) {
      return includedArticles;
    }
    return articles;
  }, [exportScope, includedArticles, articles]);

  // Get current worksheet or initialize from template
  const worksheet: AppraisalItem[] = getArticleWorksheet(article);

  // Count rated items (anything other than 'Unclear' or rated)
  const ratedCount = worksheet.filter((item) => item.rating !== 'Unclear').length;
  const yesCount = worksheet.filter((item) => item.rating === 'Yes').length;

  const handleRatingChange = (id: number, rating: AppraisalRating) => {
    const updated = worksheet.map((item) => (item.id === id ? { ...item, rating } : item));
    const newYesCount = updated.filter((i) => i.rating === 'Yes').length;

    onUpdateArticle({
      ...article,
      appraisalWorksheet: updated,
      appraisalScore: newYesCount,
    });
  };

  const handleNotesChange = (id: number, notes: string) => {
    const updated = worksheet.map((item) => (item.id === id ? { ...item, notes } : item));
    onUpdateArticle({
      ...article,
      appraisalWorksheet: updated,
    });
  };

  const handleReset = () => {
    const reset = defaultAppraisalTemplate.map((item) => ({ ...item, rating: 'Unclear' as const, notes: '' }));
    onUpdateArticle({
      ...article,
      appraisalWorksheet: reset,
      appraisalScore: 0,
    });
  };

  const handleCopyNotes = () => {
    const text = `13-POINT CRITICAL APPRAISAL ASSESSMENT
==================================================
Study: "${article.title}" (${article.year})
DOI: ${article.doi || 'N/A'}
Overall Quality: ${yesCount}/13 Criteria Met (${ratedCount}/13 Rated)

${worksheet
  .map(
    (item) =>
      `[${item.id}] ${item.category} - ${item.item}: ${item.rating.toUpperCase()}
Evidence Note: ${item.notes || 'None recorded'}`
  )
  .join('\n\n')}
==================================================`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleAiAppraise = async () => {
    setIsAiAppraising(true);
    setAiError('');
    try {
      const res = await apiService.appraiseArticle(article);
      if (res.ratings && res.ratings.length > 0) {
        // Merge with existing template
        const updated = worksheet.map((item) => {
          const aiItem = (res.ratings || []).find((r: any) => r.id === item.id) as any;
          if (aiItem) {
            return {
              ...item,
              rating: aiItem.rating,
              notes: aiItem.evidence || aiItem.notes || item.notes,
            };
          }
          return item;
        });

        const newYes = updated.filter((i) => i.rating === 'Yes').length;
        onUpdateArticle({
          ...article,
          appraisalWorksheet: updated,
          appraisalScore: newYes,
          reviewerNotes: article.reviewerNotes
            ? `${article.reviewerNotes}\nAI Appraisal: ${res.overallQualitySummary}`
            : `AI Appraisal: ${res.overallQualitySummary}`,
        });
      }
    } catch (err: any) {
      setAiError(err.message || 'AI Appraisal analysis failed.');
    } finally {
      setIsAiAppraising(false);
    }
  };

  // Group by category
  const categories = [
    'Study design',
    'Sensor and acquisition',
    'Model validation',
    'Operational readiness',
  ] as const;

  const getFileSlug = () => {
    const base = (project?.title || 'slr-review')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return base || 'slr-review';
  };

  const triggerDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Complete SLR Protocol-Compliant Study Appraisal Report (.doc Word Document)
  const handleExportWordDocument = () => {
    const targetList = exportArticles;
    const scopeLabel =
      exportScope === 'included' && includedArticles.length > 0
        ? `All Included Studies (n = ${targetList.length})`
        : `Screened Library Studies (n = ${targetList.length})`;

    const totalIdentified = articles.length;
    const duplicatesCount = articles.filter((a) => a.isDuplicate).length;
    const excludedCount = articles.filter((a) => a.decision === 'exclude' && !a.isDuplicate).length;
    const uncertainCount = articles.filter((a) => a.decision === 'uncertain').length;
    const unscreenedCount = articles.filter((a) => a.decision === 'unscreened' && !a.isDuplicate).length;

    const summaries = targetList.map((art) => ({
      art,
      summary: computeAppraisalSummary(art),
    }));

    const meanYes =
      summaries.length > 0
        ? (summaries.reduce((acc, s) => acc + s.summary.yesCount, 0) / summaries.length).toFixed(1)
        : '0.0';
    const meanPct =
      summaries.length > 0
        ? Math.round(summaries.reduce((acc, s) => acc + s.summary.scorePct, 0) / summaries.length)
        : 0;
    const lowRiskCount = summaries.filter((s) => s.summary.riskOfBias === 'Low').length;
    const modRiskCount = summaries.filter((s) => s.summary.riskOfBias === 'Moderate').length;
    const highRiskCount = summaries.filter((s) => s.summary.riskOfBias === 'High' || s.summary.riskOfBias === 'Critical').length;

    const categoryRowsHtml = categories
      .map((cat) => {
        const catItemIds = defaultAppraisalTemplate.filter((t) => t.category === cat).map((t) => t.id);
        let yesTotal = 0;
        let partialTotal = 0;
        let noTotal = 0;
        let unclearTotal = 0;
        summaries.forEach(({ summary }) => {
          summary.items
            .filter((i) => catItemIds.includes(i.id))
            .forEach((i) => {
              if (i.rating === 'Yes') yesTotal++;
              else if (i.rating === 'Partial') partialTotal++;
              else if (i.rating === 'No') noTotal++;
              else unclearTotal++;
            });
        });
        const totalCells = Math.max(1, summaries.length * catItemIds.length);
        const compliancePct = Math.round(((yesTotal + partialTotal * 0.5) / totalCells) * 100);
        return `<tr>
          <td><strong>${escapeHtml(cat)}</strong> (${catItemIds.length} items)</td>
          <td>${yesTotal}</td>
          <td>${partialTotal}</td>
          <td>${noTotal}</td>
          <td>${unclearTotal}</td>
          <td><strong>${compliancePct}%</strong></td>
        </tr>`;
      })
      .join('');

    const matrixHeaderCols = Array.from({ length: 13 }, (_, idx) => `<th style="text-align:center;">Q${idx + 1}</th>`).join('');
    const matrixRowsHtml = summaries
      .map(({ art, summary }, idx) => {
        const ratingCells = summary.items
          .map((item) => {
            const shortCode = item.rating === 'Yes' ? 'Y' : item.rating === 'Partial' ? 'P' : item.rating === 'No' ? 'N' : 'U';
            const bgColor =
              item.rating === 'Yes'
                ? '#dcfce7;color:#166534'
                : item.rating === 'Partial'
                ? '#fef3c7;color:#92400e'
                : item.rating === 'No'
                ? '#fee2e2;color:#991b1b'
                : '#f1f5f9;color:#475569';
            return `<td style="text-align:center;font-weight:bold;background:${bgColor};">${shortCode}</td>`;
          })
          .join('');
        return `<tr>
          <td>[${idx + 1}]</td>
          <td><strong>${escapeHtml(art.authors?.[0] || 'Unknown')} (${art.year})</strong><br/><span style="font-size:8.5pt;color:#475569;">${escapeHtml(art.title)}</span></td>
          ${ratingCells}
          <td style="text-align:center;"><strong>${summary.yesCount}/13</strong> (${summary.scorePct}%)</td>
          <td style="text-align:center;"><strong>${escapeHtml(summary.riskOfBias)}</strong></td>
        </tr>`;
      })
      .join('');

    const detailedWorksheetsHtml = summaries
      .map(({ art, summary }, idx) => {
        const itemRows = summary.items
          .map(
            (item) => `<tr>
              <td style="width:6%;text-align:center;"><strong>${item.id}</strong></td>
              <td style="width:18%;">${escapeHtml(item.category)}</td>
              <td style="width:36%;">${escapeHtml(item.item)}</td>
              <td style="width:10%;text-align:center;"><strong>${escapeHtml(item.rating)}</strong></td>
              <td style="width:30%;">${escapeHtml(item.notes || 'No working notes recorded.')}</td>
            </tr>`
          )
          .join('');

        return `<div style="margin-top:16pt;page-break-inside:avoid;">
          <h3>Study [${idx + 1}]: ${escapeHtml(art.title)} (${art.year})</h3>
          <p>
            <strong>Authors:</strong> ${escapeHtml((art.authors || []).join(', '))}<br/>
            <strong>Venue / Journal:</strong> <em>${escapeHtml(art.journal)}</em> |
            <strong>DOI:</strong> ${escapeHtml(art.doi || 'N/A')} |
            <strong>Source Database:</strong> ${escapeHtml(art.sourceDatabase)}<br/>
            <strong>Appraisal Score:</strong> ${summary.yesCount}/13 Yes (${summary.ratedCount}/13 Rated, ${summary.scorePct}% Weighted Compliance) |
            <strong>Risk of Bias:</strong> ${escapeHtml(summary.riskOfBias)}
          </p>
          ${art.reviewerNotes ? `<p><strong>Reviewer Notes:</strong> ${escapeHtml(art.reviewerNotes)}</p>` : ''}
          <table>
            <tr>
              <th style="width:6%;text-align:center;">#</th>
              <th style="width:18%;">Domain</th>
              <th style="width:36%;">Appraisal Criterion</th>
              <th style="width:10%;text-align:center;">Rating</th>
              <th style="width:30%;">Evidence &amp; Working Notes</th>
            </tr>
            ${itemRows}
          </table>
        </div>`;
      })
      .join('');

    const referencesHtml = summaries
      .map(
        ({ art }, idx) =>
          `<p class="reference-item">[${idx + 1}] ${escapeHtml((art.authors || []).join(', '))} (${art.year}). "${escapeHtml(art.title)}". <em>${escapeHtml(art.journal)}</em>. ${art.doi ? `DOI: https://doi.org/${escapeHtml(art.doi)}` : ''}</p>`
      )
      .join('');

    const picocSectionHtml = project
      ? `<h2>2. SLR Protocol Alignment: PICOC Scoping &amp; Eligibility (Booth et al., 2016)</h2>
         <table>
           <tr><th style="width:24%;">Protocol Parameter</th><th>Specification</th></tr>
           <tr><td><strong>Review Title</strong></td><td>${escapeHtml(project.title)}</td></tr>
           <tr><td><strong>Focus / Subtitle</strong></td><td>${escapeHtml(project.subtitle)}</td></tr>
           <tr><td><strong>Methodology Focus</strong></td><td>${escapeHtml(project.methodologyFocus)}</td></tr>
           <tr><td><strong>Publication Window</strong></td><td>${escapeHtml(project.publicationYears)}</td></tr>
           <tr><td><strong>Geographic Scope</strong></td><td>${escapeHtml(project.geographicEligibility)}</td></tr>
           <tr><td><strong>Article Types</strong></td><td>${escapeHtml(project.articleTypes)}</td></tr>
           <tr><td><strong>Population (P)</strong></td><td>${escapeHtml(project.picoc?.population)}</td></tr>
           <tr><td><strong>Intervention (I)</strong></td><td>${escapeHtml(project.picoc?.intervention)}</td></tr>
           <tr><td><strong>Comparison (C)</strong></td><td>${escapeHtml(project.picoc?.comparison)}</td></tr>
           <tr><td><strong>Outcome (O)</strong></td><td>${escapeHtml(project.picoc?.outcome)}</td></tr>
           <tr><td><strong>Context (C)</strong></td><td>${escapeHtml(project.picoc?.context)}</td></tr>
           <tr><td><strong>Boolean Search Query</strong></td><td><code>${escapeHtml(project.booleanQuery)}</code></td></tr>
         </table>
         ${
           project.researchQuestions && project.researchQuestions.length > 0
             ? `<h3>Systematic Research Questions</h3>
                <table>
                  <tr><th style="width:10%;">Code</th><th style="width:50%;">Research Question</th><th style="width:40%;">Evidence to Collect</th></tr>
                  ${project.researchQuestions
                    .map(
                      (rq) =>
                        `<tr><td><strong>${escapeHtml(rq.code)}</strong></td><td>${escapeHtml(rq.question)}</td><td>${escapeHtml(rq.mainEvidenceToCollect)}</td></tr>`
                    )
                    .join('')}
                </table>`
             : ''
         }
         ${
           project.inclusionCriteria && project.inclusionCriteria.length > 0
             ? `<h3>Inclusion &amp; Exclusion Eligibility Matrix</h3>
                <table>
                  <tr><th style="width:20%;">Dimension</th><th style="width:40%;">Inclusion Rule</th><th style="width:40%;">Exclusion Rule</th></tr>
                  ${project.inclusionCriteria
                    .map(
                      (c) =>
                        `<tr><td><strong>${escapeHtml(c.dimension)}</strong></td><td>${escapeHtml(c.includeRule)}</td><td>${escapeHtml(c.excludeRule)}</td></tr>`
                    )
                    .join('')}
                </table>`
             : ''
         }`
      : '';

    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${escapeHtml(project?.title || 'SLR Study Quality Appraisal Report')}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 { size: 8.5in 11.0in; margin: 0.75in; }
    div.Section1 { page: Section1; }
    body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #0f172a; }
    h1 { font-size: 18pt; color: #1e1b4b; border-bottom: 2pt solid #4338ca; padding-bottom: 6pt; margin-bottom: 10pt; }
    h2 { font-size: 13pt; color: #1e293b; border-bottom: 1pt solid #cbd5e1; padding-bottom: 3pt; margin-top: 16pt; margin-bottom: 8pt; }
    h3 { font-size: 11pt; color: #334155; margin-top: 12pt; margin-bottom: 4pt; }
    table { border-collapse: collapse; width: 100%; margin: 8pt 0 12pt 0; font-size: 9pt; }
    th, td { border: 1pt solid #cbd5e1; padding: 5pt 6pt; text-align: left; vertical-align: top; }
    th { background-color: #f1f5f9; font-weight: bold; color: #0f172a; }
    .callout { background-color: #f0fdf4; border-left: 4pt solid #16a34a; padding: 8pt 12pt; margin: 10pt 0; }
    .reference-item { margin-bottom: 6pt; padding-left: 20pt; text-indent: -20pt; font-size: 9.5pt; }
  </style>
</head>
<body>
  <div class="Section1">
    <h1>Study Quality Appraisal &amp; Risk-of-Bias Report (PRISMA 2020 SLR Protocol)</h1>
    <p><strong>Review Title:</strong> ${escapeHtml(project?.title || 'Systematic Literature Review')}</p>
    <p><strong>Report Scope:</strong> ${escapeHtml(scopeLabel)} | <strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString())}</p>

    <div class="callout">
      <strong>SLR Protocol Compliance Summary:</strong>
      Identified Records = ${totalIdentified} | Duplicates = ${duplicatesCount} | Excluded = ${excludedCount} | Uncertain = ${uncertainCount} | Unscreened = ${unscreenedCount} | <strong>Included Studies = ${includedArticles.length}</strong><br/>
      <strong>Appraised Cohort (${targetList.length} studies):</strong> Mean Score = ${meanYes}/13 Yes (${meanPct}% compliance) | Risk of Bias: Low = ${lowRiskCount}, Moderate = ${modRiskCount}, High = ${highRiskCount}
    </div>

    <h2>1. Domain-Level Quality Compliance Summary</h2>
    <table>
      <tr>
        <th>Appraisal Domain</th>
        <th>Yes</th>
        <th>Partial</th>
        <th>No</th>
        <th>Unclear</th>
        <th>Compliance %</th>
      </tr>
      ${categoryRowsHtml}
    </table>

    ${picocSectionHtml}

    <h2>3. Cross-Study 13-Point Appraisal Matrix (${escapeHtml(scopeLabel)})</h2>
    <p style="font-size:9pt;color:#475569;">Legend: <strong>Y</strong> = Yes (Criterion Met), <strong>P</strong> = Partial, <strong>N</strong> = No, <strong>U</strong> = Unclear / Pending.</p>
    <table>
      <tr>
        <th>#</th>
        <th>Study &amp; Year</th>
        ${matrixHeaderCols}
        <th>Score</th>
        <th>Risk of Bias</th>
      </tr>
      ${matrixRowsHtml}
    </table>

    <h2>4. Individual Study Appraisal Worksheets &amp; Page Evidence</h2>
    ${detailedWorksheetsHtml}

    <h2>5. Included Studies Reference List</h2>
    ${referencesHtml}
  </div>
</body>
</html>`;

    const filename = `${getFileSlug()}-study-appraisal-slr-report.doc`;
    triggerDownload(html, filename, 'application/msword');
    setExportStatus(`Exported Word report "${filename}" covering ${targetList.length} article(s).`);
    setTimeout(() => setExportStatus(''), 5000);
  };

  const handleExportMarkdownReport = () => {
    const targetList = exportArticles;
    let md = `# Study Quality Appraisal & Risk-of-Bias Report (PRISMA 2020 SLR Protocol)\n\n`;
    md += `**Review Title:** ${project?.title || 'Systematic Literature Review'}\n`;
    md += `**Scope:** ${exportScope === 'included' && includedArticles.length > 0 ? `All Included Studies (n = ${targetList.length})` : `Library Studies (n = ${targetList.length})`}\n`;
    md += `**Generated:** ${new Date().toISOString()}\n\n`;

    if (project) {
      md += `## SLR Protocol Summary (Booth et al., 2016 PICOC)\n\n`;
      md += `- **Discipline:** ${project.discipline} | **Years:** ${project.publicationYears} | **Geography:** ${project.geographicEligibility}\n`;
      md += `- **Population (P):** ${project.picoc?.population}\n`;
      md += `- **Intervention (I):** ${project.picoc?.intervention}\n`;
      md += `- **Comparison (C):** ${project.picoc?.comparison}\n`;
      md += `- **Outcome (O):** ${project.picoc?.outcome}\n`;
      md += `- **Context (C):** ${project.picoc?.context}\n`;
      md += `- **Boolean Query:** \`${project.booleanQuery}\`\n\n`;
    }

    md += `## Cross-Study Appraisal Matrix\n\n`;
    md += `| # | Study (Year) | ${Array.from({ length: 13 }, (_, i) => `Q${i + 1}`).join(' | ')} | Score | Risk of Bias |\n`;
    md += `| :--- | :--- | ${Array.from({ length: 13 }, () => ':---:').join(' | ')} | :---: | :---: |\n`;
    targetList.forEach((art, idx) => {
      const s = computeAppraisalSummary(art);
      const qCols = s.items.map((i) => i.rating[0]).join(' | ');
      md += `| [${idx + 1}] | ${art.authors?.[0] || 'Unknown'} (${art.year}) — ${art.title} | ${qCols} | ${s.yesCount}/13 (${s.scorePct}%) | ${s.riskOfBias} |\n`;
    });

    md += `\n## Detailed Study Worksheets\n\n`;
    targetList.forEach((art, idx) => {
      const s = computeAppraisalSummary(art);
      md += `### [${idx + 1}] ${art.title} (${art.year})\n`;
      md += `- **Authors:** ${(art.authors || []).join(', ')} | **Journal:** *${art.journal}* | **DOI:** ${art.doi || 'N/A'}\n`;
      md += `- **Score:** ${s.yesCount}/13 Yes (${s.scorePct}%) | **Risk of Bias:** ${s.riskOfBias}\n\n`;
      s.items.forEach((item) => {
        md += `- **[Q${item.id} · ${item.category}]** ${item.item}: **${item.rating}**${item.notes ? ` — *${item.notes}*` : ''}\n`;
      });
      md += `\n`;
    });

    const filename = `${getFileSlug()}-study-appraisal-slr-report.md`;
    triggerDownload(md, filename, 'text/markdown;charset=utf-8');
    setExportStatus(`Exported Markdown report "${filename}" covering ${targetList.length} article(s).`);
    setTimeout(() => setExportStatus(''), 5000);
  };

  const handleExportCsvMatrix = () => {
    const targetList = exportArticles;
    const headers = [
      'Study_No',
      'Article_ID',
      'Title',
      'Authors',
      'Year',
      'Journal',
      'DOI',
      'Decision',
      'Yes_Score_Out_Of_13',
      'Compliance_Percent',
      'Risk_Of_Bias',
      ...defaultAppraisalTemplate.map((t) => `Q${t.id}_${t.category.replace(/\s+/g, '_')}`),
      ...defaultAppraisalTemplate.map((t) => `Q${t.id}_Notes`),
    ];

    const esc = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = targetList.map((art, idx) => {
      const s = computeAppraisalSummary(art);
      return [
        idx + 1,
        esc(art.id),
        esc(art.title),
        esc((art.authors || []).join('; ')),
        art.year,
        esc(art.journal),
        esc(art.doi || ''),
        esc(art.decision),
        s.yesCount,
        `${s.scorePct}%`,
        esc(s.riskOfBias),
        ...s.items.map((i) => esc(i.rating)),
        ...s.items.map((i) => esc(i.notes || '')),
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const filename = `${getFileSlug()}-study-appraisal-matrix.csv`;
    triggerDownload(csv, filename, 'text/csv;charset=utf-8');
    setExportStatus(`Exported CSV appraisal matrix "${filename}" covering ${targetList.length} article(s).`);
    setTimeout(() => setExportStatus(''), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base sm:text-lg font-bold text-white">Study Appraisal Worksheet</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-indigo-500/20 text-indigo-300 font-bold">
                {ratedCount}/13 rated
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Predefined critical-appraisal checklist tailored to remote-sensing, geospatial, and empirical machine learning experiments. Ratings are for working notes and risk-of-bias synthesis.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleAiAppraise}
              disabled={isAiAppraising}
              className="px-3.5 py-1.5 text-xs font-semibold bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-lg disabled:opacity-50 transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAiAppraising ? 'Appraising with AI...' : 'AI Auto-Appraisal'}</span>
            </button>

            <button
              onClick={handleCopyNotes}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Notes!' : 'Copy Appraisal Notes'}</span>
            </button>

            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 rounded-lg border border-slate-700 transition inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Ratings</span>
            </button>
          </div>
        </div>

        {/* Export SLR Protocol Appraisal Report Bar (All Included Articles) */}
        <div className="mt-4 p-3.5 rounded-xl bg-indigo-950/25 border border-indigo-800/50 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-white">SLR Protocol Appraisal Report Export</span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-[10px]">
                {includedArticles.length} Included / {articles.length} Total Articles
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Exports a complete PRISMA 2020 &amp; PICOC protocol-compliant quality appraisal report (domain summary, 13-point matrix, risk-of-bias scores, evidence notes &amp; references) across all selected articles.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              value={exportScope}
              onChange={(e) => setExportScope(e.target.value as 'included' | 'all')}
              className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none cursor-pointer"
              title="Choose which articles to include in the exported appraisal report"
            >
              <option value="included">
                {includedArticles.length > 0
                  ? `All Included Articles (${includedArticles.length})`
                  : `All Library Articles (0 Included yet, ${articles.length} total)`}
              </option>
              <option value="all">All Library Articles ({articles.length})</option>
            </select>

            <button
              type="button"
              disabled={exportArticles.length === 0}
              onClick={handleExportWordDocument}
              className="px-3.5 py-1.5 text-xs font-bold bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 disabled:opacity-40 text-white rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Download Word-compatible SLR Study Quality Appraisal Report (.doc)"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Export Report Document (.doc)</span>
            </button>

            <button
              type="button"
              disabled={exportArticles.length === 0}
              onClick={handleExportMarkdownReport}
              className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Download Markdown Appraisal Report (.md)"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>.MD</span>
            </button>

            <button
              type="button"
              disabled={exportArticles.length === 0}
              onClick={handleExportCsvMatrix}
              className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Download 13-Point Appraisal Matrix (.csv)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>.CSV</span>
            </button>
          </div>
        </div>

        {exportStatus && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-emerald-950/50 border border-emerald-700/60 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{exportStatus}</span>
          </div>
        )}

        {/* Article Selector Dropdown */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <span className="text-slate-400 font-medium">Currently Appraising:</span>
            <select
              value={article.id}
              onChange={(e) => onSelectArticle(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs font-semibold flex-1 focus:outline-none"
            >
              {articles.map((art) => (
                <option key={art.id} value={art.id}>
                  {art.title.slice(0, 75)}... ({art.year}) - [{art.decision.toUpperCase()}]
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-400">
              Positive Compliance: <strong className="text-emerald-400">{yesCount} Yes</strong>
            </span>
            <div className="w-32 bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${(ratedCount / 13) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {aiError && (
          <div className="mt-3 text-xs text-rose-300 bg-rose-950/50 p-2.5 rounded-lg border border-rose-900">
            {aiError}
          </div>
        )}
      </div>

      {/* 4 Category Blocks */}
      <div className="space-y-6">
        {categories.map((category) => {
          const items = worksheet.filter((i) => i.category === category);
          return (
            <div
              key={category}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  {category}
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  {items.filter((i) => i.rating !== 'Unclear').length} of {items.length} rated
                </span>
              </div>

              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 text-xs space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1">
                        <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                          {item.id}
                        </span>
                        <p className="font-semibold text-white text-xs leading-snug">{item.item}</p>
                      </div>

                      {/* 4 Radio Option Buttons */}
                      <div className="flex items-center gap-1 shrink-0 self-end md:self-auto">
                        {(['Yes', 'Partial', 'No', 'Unclear'] as AppraisalRating[]).map((r) => (
                          <button
                            key={r}
                            onClick={() => handleRatingChange(item.id, r)}
                            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                              item.rating === r
                                ? r === 'Yes'
                                  ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                                  : r === 'Partial'
                                  ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                                  : r === 'No'
                                  ? 'bg-rose-600 text-white ring-2 ring-rose-400'
                                  : 'bg-slate-700 text-white ring-2 ring-slate-400'
                                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Evidence & Working Notes Input */}
                    <div>
                      <input
                        type="text"
                        placeholder="Add working notes / page evidence (e.g. 'Reported at p.4, section 2.3')..."
                        value={item.notes || ''}
                        onChange={(e) => handleNotesChange(item.id, e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
