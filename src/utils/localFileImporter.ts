import { Article } from '../types';
import { apiService } from '../services/apiService';
import { classifyPaperType, detectArticleSourceDatabase } from './slrDetectionEngine';
import { extractReadablePdfHints } from './abstractDisplay';
import {
  isPlaceholderVenue,
  sanitizeAuthorsList,
  validateArticleMetadata,
} from './citationFormatter';

const makeUniqueId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

export function parseLocalBibliographyText(
  raw: string,
  projectId?: string,
  sourceFileName?: string
): Article[] {
  const results: Article[] = [];
  if (!raw || raw.trim().length < 5) return results;

  // 1. JSON array
  if (raw.trim().startsWith('[') && raw.trim().endsWith(']')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.title) {
            const cleanedAuthors = sanitizeAuthorsList(
              Array.isArray(item.authors) ? item.authors : item.authors ? [item.authors] : []
            );
            const cleanedJournal = isPlaceholderVenue(item.journal) ? '' : item.journal || '';
            results.push({
              id: item.id || makeUniqueId('art-json'),
              projectId,
              sourceFileName,
              original_filename: item.original_filename || sourceFileName,
              title: item.title,
              authors: cleanedAuthors,
              year: item.year ? Number(item.year) : undefined,
              journal: cleanedJournal,
              volume: item.volume || undefined,
              issue: item.issue || undefined,
              pagesStr: item.pagesStr || item.pages || undefined,
              publisher: item.publisher || undefined,
              doi: item.doi || undefined,
              abstract: item.abstract || 'Imported via JSON dataset.',
              fullText: item.fullText,
              sourceDatabase: item.sourceDatabase || 'Manual',
              screeningStage: item.screeningStage || 'title_abstract',
              decision: item.decision || 'unscreened',
              evidenceCitations: item.evidenceCitations || [],
            });
          }
        }
        if (results.length > 0) return results;
      }
    } catch {}
  }

  // 2. BibTeX
  if (
    raw.includes('@article') ||
    raw.includes('@inproceedings') ||
    raw.includes('@misc') ||
    raw.includes('@techreport') ||
    raw.includes('@book')
  ) {
    const entries = raw
      .split(/@(?=article|inproceedings|misc|phdthesis|techreport|book|incollection)/i)
      .filter((s) => s.trim().length > 10);
    for (const entry of entries) {
      const titleMatch = entry.match(/title\s*=\s*[{"]([^}"]+)[}"]/i);
      const authorMatch = entry.match(/author\s*=\s*[{"]([^}"]+)[}"]/i);
      const yearMatch = entry.match(/year\s*=\s*[{"]?(\d{4})[}"]?/i);
      const journalMatch = entry.match(/(journal|booktitle)\s*=\s*[{"]([^}"]+)[}"]/i);
      const doiMatch = entry.match(/doi\s*=\s*[{"]([^}"]+)[}"]/i);
      const abstractMatch = entry.match(/abstract\s*=\s*[{"]([^}"]+)[}"]/i);

      if (titleMatch) {
        const auths = authorMatch
          ? sanitizeAuthorsList(authorMatch[1].split(/\s+and\s+/i).map((a) => a.trim()))
          : [];
        const rawJ = journalMatch ? journalMatch[2].trim() : '';
        results.push({
          id: makeUniqueId('art-bib'),
          projectId,
          sourceFileName,
          original_filename: sourceFileName,
          title: titleMatch[1].replace(/[\n\r]+/g, ' ').trim(),
          authors: auths,
          year: yearMatch ? parseInt(yearMatch[1], 10) : undefined,
          journal: isPlaceholderVenue(rawJ) ? '' : rawJ,
          doi: doiMatch ? doiMatch[1].trim() : undefined,
          abstract: abstractMatch
            ? abstractMatch[1].replace(/[\n\r]+/g, ' ').trim()
            : 'Abstract imported via BibTeX bibliography.',
          sourceDatabase: 'Manual',
          screeningStage: 'title_abstract',
          decision: 'unscreened',
          evidenceCitations: [],
        });
      }
    }
    if (results.length > 0) return results;
  }

  // 3. RIS
  if (raw.includes('TY  -') || raw.includes('TI  -')) {
    const records = raw.split(/ER\s+-/i).filter((s) => s.trim().length > 10);
    for (const rec of records) {
      const lines = rec.split('\n');
      let t = '';
      const a: string[] = [];
      let y = new Date().getFullYear();
      let j = '';
      let d = '';
      let ab = '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('TI  -') || trimmed.startsWith('T1  -')) t = trimmed.slice(5).trim();
        if (trimmed.startsWith('AU  -') || trimmed.startsWith('A1  -')) a.push(trimmed.slice(5).trim());
        if (trimmed.startsWith('PY  -') || trimmed.startsWith('Y1  -')) {
          const ym = trimmed.match(/\d{4}/);
          if (ym) y = parseInt(ym[0], 10);
        }
        if (trimmed.startsWith('JO  -') || trimmed.startsWith('JF  -') || trimmed.startsWith('T2  -'))
          j = trimmed.slice(5).trim();
        if (trimmed.startsWith('DO  -')) d = trimmed.slice(5).trim();
        if (trimmed.startsWith('AB  -') || trimmed.startsWith('N2  -')) ab = trimmed.slice(5).trim();
      }

      if (t) {
        const cleanedAuthors = sanitizeAuthorsList(a);
        results.push({
          id: makeUniqueId('art-ris'),
          projectId,
          sourceFileName,
          original_filename: sourceFileName,
          title: t,
          authors: cleanedAuthors,
          year: y,
          journal: isPlaceholderVenue(j) ? '' : j,
          doi: d || undefined,
          abstract: ab || 'Abstract imported via RIS reference format.',
          sourceDatabase: 'Manual',
          screeningStage: 'title_abstract',
          decision: 'unscreened',
          evidenceCitations: [],
        });
      }
    }
    if (results.length > 0) return results;
  }

  // 4. CSV / TSV
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return results;

  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t')
    ? '\t'
    : firstLine.includes(';') && !firstLine.includes(',')
    ? ';'
    : ',';
  const headerColsRaw = splitCsvLine(firstLine, delimiter);
  const headerCols = headerColsRaw.map((h) => h.toLowerCase().trim());
  const looksLikeHeaderCols =
    headerColsRaw.length >= 2 && headerColsRaw.every((col) => col.length > 0 && col.length <= 60);
  const hasTitleHeader = headerCols.some((h) =>
    ['title', 'ti', 'document title', 'article title', 'paper title', 'publication title'].includes(h)
  );
  const hasOtherBibHeader = headerCols.some((h) =>
    ['author', 'authors', 'au', 'year', 'publication year', 'py', 'doi', 'journal', 'source title', 'abstract'].includes(h)
  );
  const hasHeader = lines.length > 1 && looksLikeHeaderCols && (hasTitleHeader || hasOtherBibHeader);
  const isExplicitCsvOrTsv = Boolean(sourceFileName && /\.(csv|tsv)$/i.test(sourceFileName));

  if (!isExplicitCsvOrTsv && !hasHeader) {
    return results;
  }

  const findCol = (names: string[]) => headerCols.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const titleIdx = hasHeader ? Math.max(0, findCol(['title', 'document title', 'article title', 'ti'])) : 0;
  const authorIdx = hasHeader ? findCol(['author', 'authors', 'au']) : 1;
  const yearIdx = hasHeader ? findCol(['year', 'publication year', 'py']) : 2;
  const journalIdx = hasHeader ? findCol(['journal', 'source title', 'venue', 'publication title', 'booktitle']) : 3;
  const doiIdx = hasHeader ? findCol(['doi']) : 4;
  const abstractIdx = hasHeader ? findCol(['abstract', 'summary']) : 5;
  const dbIdx = hasHeader ? findCol(['database', 'source database', 'source']) : -1;

  const startRow = hasHeader ? 1 : 0;
  for (let i = startRow; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i], delimiter);
    const rawTitle = parts[titleIdx] || parts[0] || '';
    if (rawTitle && rawTitle.length > 3 && parts.length >= 2) {
      const authorsRaw = authorIdx >= 0 ? parts[authorIdx] : '';
      const yearRaw = yearIdx >= 0 ? parts[yearIdx] : '';
      const parsedYear = parseInt((yearRaw || '').match(/\d{4}/)?.[0] || '', 10);
      const rawJ = (journalIdx >= 0 && parts[journalIdx]) || '';
      results.push({
        id: makeUniqueId('art-csv'),
        projectId,
        sourceFileName,
        original_filename: sourceFileName,
        title: rawTitle,
        authors: authorsRaw ? sanitizeAuthorsList(authorsRaw.split(/[;|]/).map((s) => s.trim())) : [],
        year: !isNaN(parsedYear) ? parsedYear : undefined,
        journal: isPlaceholderVenue(rawJ) ? '' : rawJ,
        doi: (doiIdx >= 0 && parts[doiIdx]) || undefined,
        abstract: (abstractIdx >= 0 && parts[abstractIdx]) || 'Imported bibliographic record.',
        sourceDatabase: (dbIdx >= 0 && parts[dbIdx]) || 'Manual',
        screeningStage: 'title_abstract',
        decision: 'unscreened',
        evidenceCitations: [],
      });
    }
  }
  return results;
}

async function extractPdfHints(file: File): Promise<{ titleHint?: string; doiHint?: string; snippet?: string }> {
  try {
    const slice = file.slice(0, Math.min(file.size, 262144));
    const raw = await slice.text();
    return extractReadablePdfHints(raw);
  } catch {
    return {};
  }
}

async function extractTextHints(file: File): Promise<{ titleHint?: string; doiHint?: string; snippet?: string; fullText?: string }> {
  try {
    const slice = file.slice(0, Math.min(file.size, 131072));
    const raw = await slice.text();
    const doiMatch = raw.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 10 && l.length <= 180 && !/^https?:\/\//i.test(l));
    const printable = raw.replace(/\s+/g, ' ').trim();
    return {
      doiHint: doiMatch ? doiMatch[0].replace(/[)>.,;]+$/, '') : undefined,
      titleHint: lines[0] || undefined,
      snippet: printable.length > 40 ? printable.slice(0, 600) : undefined,
      fullText: printable.length > 100 ? raw.slice(0, 24000) : undefined,
    };
  } catch {
    return {};
  }
}

export interface LocalImportResult {
  articles: Article[];
  pdfFilesByArticleId: Map<string, File>;
}

export async function parseLocalDataFilesWithOriginals(
  files: FileList | File[],
  projectId: string,
  options?: { enrichFromWeb?: boolean }
): Promise<LocalImportResult> {
  const fileArr = Array.from(files || []);
  const enrichFromWeb = options?.enrichFromWeb ?? true;
  const collected: Article[] = [];
  const pdfFilesByArticleId = new Map<string, File>();

  for (const file of fileArr) {
    const baseMeta = {
      projectId,
      sourceFileName: file.name,
      original_filename: file.name,
    };

    if (file.name.match(/\.(bib|ris|csv|tsv|txt|json|enw|nbib|ciw|xml)$/i)) {
      try {
        const content = await file.text();
        const parsed = parseLocalBibliographyText(content, projectId, file.name);
        if (parsed.length > 0) {
          for (const item of parsed) {
            const pType = classifyPaperType(item);
            const resolvedDb = item.sourceDatabase || detectArticleSourceDatabase(item).database;
            const stamped: Article = {
              ...item,
              ...baseMeta,
              sourceDatabase: resolvedDb || 'Manual',
              paperCategory: item.paperCategory || pType.category,
              paperSubType: item.paperSubType || pType.subType,
              decision: item.decision || 'unscreened',
              screeningStage: item.screeningStage || 'title_abstract',
            };
            stamped.citationVerificationStatus = validateArticleMetadata(stamped).verificationStatus;
            collected.push(stamped);
          }
          continue;
        }
      } catch {}
    }

    let doiHint: string | undefined;
    let titleHint: string | undefined;
    let snippetHint: string | undefined;
    let fullTextHint: string | undefined;
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.pdf')) {
      const hints = await extractPdfHints(file);
      doiHint = hints.doiHint;
      titleHint = hints.titleHint;
      snippetHint = hints.snippet;
    } else if (
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.md') ||
      lowerName.endsWith('.html') ||
      lowerName.endsWith('.htm') ||
      lowerName.endsWith('.rtf') ||
      lowerName.endsWith('.doc') ||
      lowerName.endsWith('.docx')
    ) {
      const hints = await extractTextHints(file);
      doiHint = hints.doiHint;
      titleHint = hints.titleHint;
      snippetHint = hints.snippet;
      fullTextHint = hints.fullText;
    }

    let enrichedArticle: Article | null = null;
    if (enrichFromWeb) {
      try {
        const enriched = await apiService.autoSyncMetadata(
          { filename: file.name, title: titleHint, doi: doiHint },
          3500
        );
        if (enriched && enriched.title) {
          const cleanAuth = sanitizeAuthorsList(enriched.authors || []);
          const cleanJ = isPlaceholderVenue(enriched.journal) ? '' : enriched.journal || '';
          enrichedArticle = {
            ...baseMeta,
            id: makeUniqueId('art-file'),
            title: enriched.title,
            authors: cleanAuth,
            year: enriched.year || undefined,
            journal: cleanJ,
            volume: enriched.volume || undefined,
            issue: enriched.issue || undefined,
            pagesStr: enriched.pagesStr || undefined,
            publisher: enriched.publisher || undefined,
            doi: enriched.doi || doiHint || undefined,
            abstract: enriched.abstract || snippetHint || `Extracted from local file: ${file.name}.`,
            fullText: fullTextHint,
            sourceDatabase: enriched.sourceDatabase || 'Manual',
            url: enriched.url,
            citationsCount: enriched.citationsCount,
            screeningStage: 'title_abstract',
            decision: 'unscreened',
            evidenceCitations: [],
          };
        }
      } catch {}
    }

    if (!enrichedArticle) {
      const cleanTitle =
        titleHint ||
        file.name
          .replace(/\.[a-zA-Z0-9]+$/, '')
          .replace(/[_-]+/g, ' ')
          .replace(/^[\d\s]+/, '')
          .trim();
      const yearMatch = file.name.match(/\b(19\d{2}|20\d{2})\b/);
      enrichedArticle = {
        ...baseMeta,
        id: makeUniqueId('art-local'),
        title: cleanTitle || file.name,
        authors: [],
        year: yearMatch ? parseInt(yearMatch[1], 10) : undefined,
        journal: '',
        doi: doiHint || undefined,
        abstract: snippetHint
          ? `Imported local file (${file.name}). Content excerpt: ${snippetHint}`
          : `Imported from local drive file: ${file.name}. Metadata verification pending.`,
        fullText: fullTextHint,
        sourceDatabase: 'Manual',
        screeningStage: 'title_abstract',
        decision: 'unscreened',
        evidenceCitations: [],
      };
    }

    const pType = classifyPaperType(enrichedArticle);
    const finalArt: Article = {
      ...enrichedArticle,
      paperCategory: pType.category,
      paperSubType: pType.subType,
      citationVerificationStatus: validateArticleMetadata(enrichedArticle).verificationStatus,
    };
    if (lowerName.endsWith('.pdf')) {
      pdfFilesByArticleId.set(finalArt.id, file);
      finalArt.pdfStorage = {
        original_filename: file.name,
        mime_type: file.type || 'application/pdf',
        file_size: file.size,
        storage_status: 'missing_binary',
      };
    }
    collected.push(finalArt);
  }

  return { articles: collected, pdfFilesByArticleId };
}

export async function parseLocalDataFilesToArticles(
  files: FileList | File[],
  projectId: string,
  options?: { enrichFromWeb?: boolean }
): Promise<Article[]> {
  const { articles } = await parseLocalDataFilesWithOriginals(files, projectId, options);
  return articles;
}
