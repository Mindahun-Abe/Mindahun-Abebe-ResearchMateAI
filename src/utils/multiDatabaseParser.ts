import JSZip from 'jszip';
import {
  DatabaseExportFormat,
  DatabaseIdentificationRecord,
  RecoveryStagingBatch,
} from '../types';
import {
  isPlaceholderVenue,
  normalizeValidDoi,
  sanitizeAuthorsList,
} from './citationFormatter';

const makeBatchId = () =>
  `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const makeRecordId = (batchId: string, idx: number) =>
  `db-rec-${batchId}-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`;

function decodeXmlEntities(str: string): string {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectExportFormatFromFilename(
  filename: string,
  textHint?: string
): DatabaseExportFormat {
  const lower = (filename || '').toLowerCase().trim();
  if (lower.endsWith('.ris')) return 'ris';
  if (lower.endsWith('.bib') || lower.endsWith('.bibtex')) return 'bibtex';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.tsv')) return 'tsv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xls')) return 'xls';
  if (lower.endsWith('.enw')) return 'endnote';
  if (lower.endsWith('.nbib')) return 'nbib';
  if (lower.endsWith('.ciw')) return 'ciw';
  if (lower.endsWith('.xml')) return 'xml';
  if (lower.endsWith('.json')) return 'json';

  const trimmed = (textHint || '').trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return 'json';
  if (/^TY\s{2}-/m.test(trimmed)) return 'ris';
  if (/^@(?:article|inproceedings|book|incollection|misc|phdthesis|mastersthesis|techreport)\s*\{/im.test(trimmed)) return 'bibtex';
  if (/^%0\s+/m.test(trimmed) || /^%T\s+/m.test(trimmed)) return 'endnote';
  if (/^PMID-\s+/m.test(trimmed)) return 'nbib';
  if (/^FN\s+Clarivate|^VR\s+\d|^PT\s+[JB]/m.test(trimmed)) return 'ciw';
  if (/^<\?xml|<records>|<Workbook|<table/i.test(trimmed)) return 'xml';
  if (trimmed.includes('\t')) return 'tsv';
  if (trimmed.includes(',')) return 'csv';
  return 'txt';
}

export function normalizeExplicitDatabaseName(raw?: string): {
  name: string;
  verified: boolean;
} {
  const trimmed = String(raw || '').trim();
  if (
    !trimmed ||
    ['auto', 'unknown', 'unspecified', 'other', 'manual', 'none', 'pending'].includes(
      trimmed.toLowerCase()
    )
  ) {
    return {
      name: 'Unspecified Database (Confirmation Required)',
      verified: false,
    };
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'wos' || lower === 'web of science' || lower === 'clarivate') {
    return { name: 'Web of Science', verified: true };
  }
  if (lower === 'scopus') return { name: 'Scopus', verified: true };
  if (lower === 'pubmed' || lower === 'medline') return { name: 'PubMed', verified: true };
  if (lower === 'ieee' || lower === 'ieee xplore') return { name: 'IEEE Xplore', verified: true };
  if (lower === 'sciencedirect' || lower === 'science direct' || lower === 'elsevier') {
    return { name: 'ScienceDirect', verified: true };
  }
  if (lower === 'google scholar' || lower === 'googlescholar') {
    return { name: 'Google Scholar', verified: true };
  }
  if (lower === 'openalex') return { name: 'OpenAlex', verified: true };
  if (lower === 'crossref') return { name: 'Crossref', verified: true };
  if (lower === 'semantic scholar') return { name: 'Semantic Scholar', verified: true };
  if (lower === 'cab abstracts' || lower === 'cababstracts') {
    return { name: 'CAB Abstracts', verified: true };
  }
  if (lower === 'springer' || lower === 'springerlink') return { name: 'Springer', verified: true };
  if (lower === 'wiley') return { name: 'Wiley', verified: true };
  if (lower === 'doaj') return { name: 'DOAJ', verified: true };
  if (lower === 'arxiv') return { name: 'arXiv', verified: true };
  if (lower === 'dimensions') return { name: 'Dimensions', verified: true };
  if (lower === 'ebsco' || lower === 'ebscohost') return { name: 'EBSCOhost', verified: true };
  if (lower === 'proquest') return { name: 'ProQuest', verified: true };
  return { name: trimmed, verified: true };
}

function inferVerifiableDatabaseFromRecord(
  explicitDb: { name: string; verified: boolean },
  recordHints: {
    recordIdentifier?: string;
    rawDbTag?: string;
    url?: string;
  }
): { databaseName: string; databaseVerified: boolean } {
  if (explicitDb.verified) {
    return { databaseName: explicitDb.name, databaseVerified: true };
  }
  const rawTag = (recordHints.rawDbTag || '').trim();
  if (rawTag) {
    const normalized = normalizeExplicitDatabaseName(rawTag);
    if (normalized.verified) {
      return { databaseName: normalized.name, databaseVerified: true };
    }
  }
  const rid = (recordHints.recordIdentifier || '').trim();
  if (/^2-s2\.0-\d+/i.test(rid)) {
    return { databaseName: 'Scopus', databaseVerified: true };
  }
  if (/^WOS:\d+/i.test(rid)) {
    return { databaseName: 'Web of Science', databaseVerified: true };
  }
  if (/^PMID[:\s-]?\d+$/i.test(rid)) {
    return { databaseName: 'PubMed', databaseVerified: true };
  }
  // Strict policy: never invent an unverified database source from URL or publisher DOI
  return { databaseName: explicitDb.name, databaseVerified: false };
}

function parseDelimitedRows(raw: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  const clean = raw.replace(/^\uFEFF/, '');
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '"') {
      if (inQuotes && clean[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(current.trim());
      if (row.some((c) => c.length > 0)) {
        rows.push(row);
      }
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }
  row.push(current.trim());
  if (row.some((c) => c.length > 0)) {
    rows.push(row);
  }
  return rows;
}

function parseAuthorsString(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  if (raw.includes(';') || raw.includes('|')) {
    return sanitizeAuthorsList(raw.split(/[;|]+/).map((s) => s.trim()));
  }
  if (/\s+and\s+/i.test(raw)) {
    return sanitizeAuthorsList(raw.split(/\s+and\s+/i).map((s) => s.trim()));
  }
  // Handle Scopus style "Smith, J., Doe, A." vs single "Smith, J."
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 4 && parts.length % 2 === 0 && parts.every((p, idx) => idx % 2 === 0 || p.length <= 14)) {
    const paired: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
      paired.push(`${parts[i]}, ${parts[i + 1]}`);
    }
    return sanitizeAuthorsList(paired);
  }
  return sanitizeAuthorsList([raw.trim()]);
}

function parseYearInt(raw?: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const m = String(raw).match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
  if (!m) return undefined;
  const y = parseInt(m[1], 10);
  return Number.isFinite(y) && y >= 1800 && y <= new Date().getFullYear() + 2 ? y : undefined;
}

function parseRisRecords(
  raw: string,
  meta: {
    batchId: string;
    explicitDb: { name: string; verified: boolean };
    searchDate?: string;
    exportFilename: string;
    importedAt: string;
  }
): DatabaseIdentificationRecord[] {
  const blocks = raw.split(/\nER\s+-.*(?:\r?\n|$)/i).filter((b) => /\b(?:TY|TI|T1)\s{2}-/i.test(b));
  const out: DatabaseIdentificationRecord[] = [];

  for (let idx = 0; idx < blocks.length; idx++) {
    const lines = blocks[idx].split(/\r?\n/);
    let title = '';
    const authors: string[] = [];
    let year: number | undefined;
    let journal = '';
    let volume = '';
    let issue = '';
    let sp = '';
    let ep = '';
    let publisher = '';
    let doi = '';
    let abstract = '';
    let url = '';
    let recordIdentifier = '';
    let rawDbTag = '';
    let lastTag = '';
    const rawFields: Record<string, string> = {};

    for (const line of lines) {
      const m = line.match(/^([A-Z0-9]{2})\s{2}-\s?(.*)$/);
      if (m) {
        const tag = m[1];
        const val = m[2].trim();
        lastTag = tag;
        rawFields[tag] = rawFields[tag] ? `${rawFields[tag]}; ${val}` : val;
        if ((tag === 'TI' || tag === 'T1') && !title) title = val;
        else if (tag === 'AU' || tag === 'A1') authors.push(val);
        else if ((tag === 'PY' || tag === 'Y1' || tag === 'DA') && !year) year = parseYearInt(val);
        else if ((tag === 'JO' || tag === 'JF' || tag === 'T2' || tag === 'JA') && !journal) journal = val;
        else if (tag === 'VL' && !volume) volume = val;
        else if (tag === 'IS' && !issue) issue = val;
        else if (tag === 'SP' && !sp) sp = val;
        else if (tag === 'EP' && !ep) ep = val;
        else if (tag === 'PB' && !publisher) publisher = val;
        else if (tag === 'DO' && !doi) doi = val;
        else if (tag === 'AB' || tag === 'N2') abstract = abstract ? `${abstract} ${val}` : val;
        else if (tag === 'UR' && !url) url = val;
        else if ((tag === 'AN' || tag === 'ID') && !recordIdentifier) recordIdentifier = val;
        else if ((tag === 'DP' || tag === 'DB') && !rawDbTag) rawDbTag = val;
      } else if (lastTag && line.trim()) {
        const cont = line.trim();
        if (lastTag === 'TI' || lastTag === 'T1') title = `${title} ${cont}`.trim();
        else if (lastTag === 'AB' || lastTag === 'N2') abstract = `${abstract} ${cont}`.trim();
      }
    }

    if (!title) continue;
    const prov = inferVerifiableDatabaseFromRecord(meta.explicitDb, {
      recordIdentifier,
      rawDbTag,
      url,
    });
    const cleanDoi = normalizeValidDoi(doi) || undefined;
    const pagesStr = sp && ep ? `${sp}-${ep}` : sp || undefined;

    out.push({
      id: makeRecordId(meta.batchId, out.length),
      databaseName: prov.databaseName,
      databaseVerified: prov.databaseVerified,
      searchBatchId: meta.batchId,
      searchDate: meta.searchDate,
      exportFilename: meta.exportFilename,
      exportFormat: 'ris',
      recordIdentifier: recordIdentifier || undefined,
      doi: cleanDoi,
      title,
      authors: sanitizeAuthorsList(authors),
      year,
      journal: isPlaceholderVenue(journal) ? '' : journal,
      volume: volume || undefined,
      issue: issue || undefined,
      pagesStr,
      publisher: publisher || undefined,
      abstract,
      url: url || undefined,
      rawMetadata: rawFields,
      importedAt: meta.importedAt,
    });
  }

  return out;
}

function parseBibTexEntries(
  raw: string,
  meta: {
    batchId: string;
    explicitDb: { name: string; verified: boolean };
    searchDate?: string;
    exportFilename: string;
    importedAt: string;
  }
): DatabaseIdentificationRecord[] {
  const out: DatabaseIdentificationRecord[] = [];
  const clean = raw.replace(/\r\n/g, '\n');
  let i = 0;

  while (i < clean.length) {
    const atIdx = clean.indexOf('@', i);
    if (atIdx === -1) break;
    const headerMatch = clean.slice(atIdx).match(/^@([a-zA-Z]+)\s*[{(]\s*([^,\s}]*)\s*,/);
    if (!headerMatch) {
      i = atIdx + 1;
      continue;
    }
    const entryType = headerMatch[1].toLowerCase();
    const citeKey = headerMatch[2].trim();
    if (entryType === 'comment' || entryType === 'preamble' || entryType === 'string') {
      i = atIdx + headerMatch[0].length;
      continue;
    }

    const openChar = clean[atIdx + headerMatch[0].indexOf(clean[atIdx + headerMatch[1].length + 1]) >= 0 ? atIdx : atIdx];
    void openChar;
    const braceStart = clean.indexOf('{', atIdx);
    const parenStart = clean.indexOf('(', atIdx);
    const startDelimPos =
      braceStart !== -1 && (parenStart === -1 || braceStart < parenStart) ? braceStart : parenStart;
    if (startDelimPos === -1) break;
    const openDelim = clean[startDelimPos];
    const closeDelim = openDelim === '{' ? '}' : ')';

    let depth = 1;
    let pos = startDelimPos + 1;
    while (pos < clean.length && depth > 0) {
      if (clean[pos] === openDelim) depth++;
      else if (clean[pos] === closeDelim) depth--;
      pos++;
    }
    const body = clean.slice(atIdx + headerMatch[0].length, Math.max(atIdx + headerMatch[0].length, pos - 1));
    i = pos;

    // Parse balanced key = {value} or "value" or bare digits
    const fields: Record<string, string> = {};
    let fPos = 0;
    while (fPos < body.length) {
      while (fPos < body.length && /[\s,]/.test(body[fPos])) fPos++;
      if (fPos >= body.length) break;
      const eqIdx = body.indexOf('=', fPos);
      if (eqIdx === -1) break;
      const key = body.slice(fPos, eqIdx).trim().toLowerCase();
      fPos = eqIdx + 1;
      while (fPos < body.length && /\s/.test(body[fPos])) fPos++;
      if (fPos >= body.length) break;

      let val = '';
      if (body[fPos] === '{') {
        let d = 1;
        let vStart = fPos + 1;
        fPos++;
        while (fPos < body.length && d > 0) {
          if (body[fPos] === '{') d++;
          else if (body[fPos] === '}') d--;
          fPos++;
        }
        val = body.slice(vStart, Math.max(vStart, fPos - 1));
      } else if (body[fPos] === '"') {
        let vStart = fPos + 1;
        fPos++;
        while (fPos < body.length && !(body[fPos] === '"' && body[fPos - 1] !== '\\')) {
          fPos++;
        }
        val = body.slice(vStart, fPos);
        fPos++;
      } else {
        const commaIdx = body.indexOf(',', fPos);
        const endPos = commaIdx === -1 ? body.length : commaIdx;
        val = body.slice(fPos, endPos).trim();
        fPos = endPos + 1;
      }
      if (key) {
        fields[key] = val.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
      }
    }

    if (!fields.title) continue;
    const rawJournal = fields.journal || fields.booktitle || '';
    const recordId = fields.eid || fields.pmid || fields.wos || citeKey || undefined;
    const prov = inferVerifiableDatabaseFromRecord(meta.explicitDb, {
      recordIdentifier: recordId,
      rawDbTag: fields.source || fields.database,
      url: fields.url,
    });

    out.push({
      id: makeRecordId(meta.batchId, out.length),
      databaseName: prov.databaseName,
      databaseVerified: prov.databaseVerified,
      searchBatchId: meta.batchId,
      searchDate: meta.searchDate,
      exportFilename: meta.exportFilename,
      exportFormat: 'bibtex',
      recordIdentifier: recordId,
      doi: normalizeValidDoi(fields.doi) || undefined,
      title: fields.title,
      authors: fields.author ? parseAuthorsString(fields.author) : [],
      year: parseYearInt(fields.year),
      journal: isPlaceholderVenue(rawJournal) ? '' : rawJournal,
      volume: fields.volume || undefined,
      issue: fields.number || fields.issue || undefined,
      pagesStr: fields.pages || undefined,
      publisher: fields.publisher || undefined,
      abstract: fields.abstract || '',
      url: fields.url || undefined,
      rawMetadata: { entryType, citeKey, ...fields },
      importedAt: meta.importedAt,
    });
  }

  return out;
}

function parseEndNoteTagged(
  raw: string,
  meta: {
    batchId: string;
    explicitDb: { name: string; verified: boolean };
    searchDate?: string;
    exportFilename: string;
    importedAt: string;
  }
): DatabaseIdentificationRecord[] {
  const blocks = raw.split(/\r?\n\s*\r?\n(?=%)/).filter((b) => /%[T0]/.test(b));
  const out: DatabaseIdentificationRecord[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    let title = '';
    const authors: string[] = [];
    let year: number | undefined;
    let journal = '';
    let volume = '';
    let issue = '';
    let pages = '';
    let doi = '';
    let abstract = '';
    let publisher = '';
    let url = '';
    let recordId = '';
    let dbTag = '';
    const rawFields: Record<string, string> = {};

    for (const line of lines) {
      const m = line.match(/^%([A-Z0-9])\s+(.*)$/i);
      if (!m) continue;
      const tag = m[1].toUpperCase();
      const val = m[2].trim();
      rawFields[`%${tag}`] = rawFields[`%${tag}`] ? `${rawFields[`%${tag}`]}; ${val}` : val;
      if (tag === 'T' && !title) title = val;
      else if (tag === 'A' || tag === 'E') authors.push(val);
      else if (tag === 'D' && !year) year = parseYearInt(val);
      else if ((tag === 'J' || tag === 'B') && !journal) journal = val;
      else if (tag === 'V' && !volume) volume = val;
      else if (tag === 'N' && !issue) issue = val;
      else if (tag === 'P' && !pages) pages = val;
      else if (tag === 'R' && !doi) doi = val;
      else if (tag === 'X') abstract = abstract ? `${abstract} ${val}` : val;
      else if (tag === 'I' && !publisher) publisher = val;
      else if (tag === 'U' && !url) url = val;
      else if (tag === 'M' && !recordId) recordId = val;
      else if (tag === '~' && !dbTag) dbTag = val;
    }

    if (!title) continue;
    const prov = inferVerifiableDatabaseFromRecord(meta.explicitDb, {
      recordIdentifier: recordId,
      rawDbTag: dbTag,
      url,
    });
    out.push({
      id: makeRecordId(meta.batchId, out.length),
      databaseName: prov.databaseName,
      databaseVerified: prov.databaseVerified,
      searchBatchId: meta.batchId,
      searchDate: meta.searchDate,
      exportFilename: meta.exportFilename,
      exportFormat: 'endnote',
      recordIdentifier: recordId || undefined,
      doi: normalizeValidDoi(doi) || undefined,
      title,
      authors: sanitizeAuthorsList(authors),
      year,
      journal: isPlaceholderVenue(journal) ? '' : journal,
      volume: volume || undefined,
      issue: issue || undefined,
      pagesStr: pages || undefined,
      publisher: publisher || undefined,
      abstract,
      url: url || undefined,
      rawMetadata: rawFields,
      importedAt: meta.importedAt,
    });
  }
  return out;
}

function parsePubMedNbib(
  raw: string,
  meta: {
    batchId: string;
    explicitDb: { name: string; verified: boolean };
    searchDate?: string;
    exportFilename: string;
    importedAt: string;
  }
): DatabaseIdentificationRecord[] {
  const blocks = raw.split(/\r?\n\s*\r?\n(?=PMID-)/).filter((b) => /PMID-\s*/i.test(b));
  const out: DatabaseIdentificationRecord[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    let pmid = '';
    let title = '';
    const authors: string[] = [];
    let year: number | undefined;
    let journal = '';
    let volume = '';
    let issue = '';
    let pages = '';
    let doi = '';
    let abstract = '';
    let lastTag = '';

    for (const line of lines) {
      const m = line.match(/^([A-Z]{2,4})\s*-\s*(.*)$/);
      if (m) {
        const tag = m[1];
        const val = m[2].trim();
        lastTag = tag;
        if (tag === 'PMID') pmid = `PMID:${val}`;
        else if (tag === 'TI') title = title ? `${title} ${val}` : val;
        else if (tag === 'FAU' || tag === 'AU') {
          if (tag === 'FAU') authors.push(val);
        } else if (tag === 'DP' && !year) year = parseYearInt(val);
        else if ((tag === 'JT' || tag === 'TA') && !journal) journal = val;
        else if (tag === 'VI' && !volume) volume = val;
        else if (tag === 'IP' && !issue) issue = val;
        else if (tag === 'PG' && !pages) pages = val;
        else if ((tag === 'LID' || tag === 'AID') && /\[doi\]/i.test(val) && !doi) {
          doi = val.replace(/\s*\[doi\].*$/i, '').trim();
        } else if (tag === 'AB') abstract = abstract ? `${abstract} ${val}` : val;
      } else if (/^\s{6}/.test(line) && lastTag) {
        const cont = line.trim();
        if (lastTag === 'TI') title = `${title} ${cont}`.trim();
        else if (lastTag === 'AB') abstract = `${abstract} ${cont}`.trim();
      }
    }

    if (!title) continue;
    const prov = meta.explicitDb.verified
      ? { databaseName: meta.explicitDb.name, databaseVerified: true }
      : { databaseName: 'PubMed', databaseVerified: true };

    out.push({
      id: makeRecordId(meta.batchId, out.length),
      databaseName: prov.databaseName,
      databaseVerified: prov.databaseVerified,
      searchBatchId: meta.batchId,
      searchDate: meta.searchDate,
      exportFilename: meta.exportFilename,
      exportFormat: 'nbib',
      recordIdentifier: pmid || undefined,
      doi: normalizeValidDoi(doi) || undefined,
      title,
      authors: sanitizeAuthorsList(authors),
      year,
      journal: isPlaceholderVenue(journal) ? '' : journal,
      volume: volume || undefined,
      issue: issue || undefined,
      pagesStr: pages || undefined,
      abstract,
      rawMetadata: { pmid },
      importedAt: meta.importedAt,
    });
  }
  return out;
}

function parseWosCiw(
  raw: string,
  meta: {
    batchId: string;
    explicitDb: { name: string; verified: boolean };
    searchDate?: string;
    exportFilename: string;
    importedAt: string;
  }
): DatabaseIdentificationRecord[] {
  const blocks = raw.split(/\nER(?:\r?\n|$)/).filter((b) => /\bTI\s+/i.test(b));
  const out: DatabaseIdentificationRecord[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    let title = '';
    const authors: string[] = [];
    let year: number | undefined;
    let journal = '';
    let volume = '';
    let issue = '';
    let bp = '';
    let ep = '';
    let doi = '';
    let abstract = '';
    let ut = '';
    let publisher = '';
    let lastTag = '';

    for (const line of lines) {
      const m = line.match(/^([A-Z0-9]{2})\s+(.*)$/);
      if (m) {
        const tag = m[1];
        const val = m[2].trim();
        lastTag = tag;
        if (tag === 'TI') title = val;
        else if (tag === 'AU' || tag === 'AF') {
          if (tag === 'AF') authors.push(val);
        } else if (tag === 'PY') year = parseYearInt(val);
        else if (tag === 'SO') journal = val;
        else if (tag === 'VL') volume = val;
        else if (tag === 'IS') issue = val;
        else if (tag === 'BP') bp = val;
        else if (tag === 'EP') ep = val;
        else if (tag === 'DI') doi = val;
        else if (tag === 'AB') abstract = val;
        else if (tag === 'UT') ut = val;
        else if (tag === 'PU') publisher = val;
      } else if (/^\s{3}/.test(line) && lastTag) {
        const cont = line.trim();
        if (lastTag === 'TI') title = `${title} ${cont}`.trim();
        else if (lastTag === 'AB') abstract = `${abstract} ${cont}`.trim();
        else if (lastTag === 'AF') authors.push(cont);
      }
    }

    if (!title) continue;
    const prov = meta.explicitDb.verified
      ? { databaseName: meta.explicitDb.name, databaseVerified: true }
      : ut.startsWith('WOS:')
      ? { databaseName: 'Web of Science', databaseVerified: true }
      : { databaseName: meta.explicitDb.name, databaseVerified: false };

    out.push({
      id: makeRecordId(meta.batchId, out.length),
      databaseName: prov.databaseName,
      databaseVerified: prov.databaseVerified,
      searchBatchId: meta.batchId,
      searchDate: meta.searchDate,
      exportFilename: meta.exportFilename,
      exportFormat: 'ciw',
      recordIdentifier: ut || undefined,
      doi: normalizeValidDoi(doi) || undefined,
      title,
      authors: sanitizeAuthorsList(authors),
      year,
      journal: isPlaceholderVenue(journal) ? '' : journal,
      volume: volume || undefined,
      issue: issue || undefined,
      pagesStr: bp && ep ? `${bp}-${ep}` : bp || undefined,
      publisher: publisher || undefined,
      abstract,
      rawMetadata: { ut },
      importedAt: meta.importedAt,
    });
  }
  return out;
}

function parseEndNoteXml(
  raw: string,
  meta: {
    batchId: string;
    explicitDb: { name: string; verified: boolean };
    searchDate?: string;
    exportFilename: string;
    importedAt: string;
  }
): DatabaseIdentificationRecord[] {
  const out: DatabaseIdentificationRecord[] = [];
  const recRegex = /<record\b[^>]*>([\s\S]*?)<\/record>/gi;
  let m: RegExpExecArray | null;
  while ((m = recRegex.exec(raw)) !== null) {
    const block = m[1];
    const getTag = (tag: string) => {
      const tm = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return tm ? decodeXmlEntities(tm[1].replace(/<[^>]+>/g, ' ')) : '';
    };
    const title = getTag('title');
    if (!title) continue;
    const authorMatches = Array.from(block.matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/gi)).map((am) =>
      decodeXmlEntities(am[1].replace(/<[^>]+>/g, ' '))
    );
    const year = parseYearInt(getTag('year'));
    const journal = getTag('secondary-title') || getTag('full-title');
    const volume = getTag('volume') || undefined;
    const issue = getTag('number') || undefined;
    const pagesStr = getTag('pages') || undefined;
    const publisher = getTag('publisher') || undefined;
    const doi = normalizeValidDoi(getTag('electronic-resource-num')) || undefined;
    const abstract = getTag('abstract');
    const url = getTag('url') || undefined;
    const recordIdentifier = getTag('accession-num') || getTag('rec-number') || undefined;
    const dbTag = getTag('remote-database-name') || getTag('remote-database-provider');
    const prov = inferVerifiableDatabaseFromRecord(meta.explicitDb, {
      recordIdentifier,
      rawDbTag: dbTag,
      url,
    });

    out.push({
      id: makeRecordId(meta.batchId, out.length),
      databaseName: prov.databaseName,
      databaseVerified: prov.databaseVerified,
      searchBatchId: meta.batchId,
      searchDate: meta.searchDate,
      exportFilename: meta.exportFilename,
      exportFormat: 'xml',
      recordIdentifier,
      doi,
      title,
      authors: sanitizeAuthorsList(authorMatches),
      year,
      journal: isPlaceholderVenue(journal) ? '' : journal,
      volume,
      issue,
      pagesStr,
      publisher,
      abstract,
      url,
      importedAt: meta.importedAt,
    });
  }
  return out;
}

function rowsToDatabaseRecords(
  rows: string[][],
  format: DatabaseExportFormat,
  meta: {
    batchId: string;
    explicitDb: { name: string; verified: boolean };
    searchDate?: string;
    exportFilename: string;
    importedAt: string;
  }
): DatabaseIdentificationRecord[] {
  if (rows.length < 2) return [];
  const headerRaw = rows[0].map((h) => h.trim());
  const headers = headerRaw.map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim());

  const findCol = (candidates: string[]) => {
    for (const c of candidates) {
      const exact = headers.findIndex((h) => h === c);
      if (exact >= 0) return exact;
    }
    for (const c of candidates) {
      const partial = headers.findIndex((h) => h.includes(c));
      if (partial >= 0) return partial;
    }
    return -1;
  };

  const titleIdx = findCol(['title', 'article title', 'document title', 'paper title', 'ti']);
  const authorsIdx = findCol(['authors', 'author(s)', 'author full names', 'author', 'au']);
  const yearIdx = findCol(['year', 'publication year', 'pub year', 'py']);
  const journalIdx = findCol(['source title', 'journal', 'publication title', 'source', 'booktitle', 'so']);
  const volumeIdx = findCol(['volume', 'vol', 'vl']);
  const issueIdx = findCol(['issue', 'number', 'is']);
  const pageStartIdx = findCol(['page start', 'start page', 'sp', 'bp']);
  const pageEndIdx = findCol(['page end', 'end page', 'ep']);
  const pagesIdx = findCol(['pages', 'page range', 'art. no.']);
  const doiIdx = findCol(['doi', 'di']);
  const abstractIdx = findCol(['abstract', 'summary', 'ab']);
  const publisherIdx = findCol(['publisher', 'pu']);
  const urlIdx = findCol(['url', 'link', 'article link']);
  const idIdx = findCol(['eid', 'ut (unique wos id)', 'pmid', 'record id', 'identifier', 'accession', 'id']);
  const dbIdx = findCol(['database', 'source database', 'db']);

  const effectiveTitleIdx = titleIdx >= 0 ? titleIdx : 0;
  const out: DatabaseIdentificationRecord[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => !c)) continue;
    const title = (row[effectiveTitleIdx] || '').trim();
    if (!title || title.length < 3) continue;

    const rawRecordObj: Record<string, string> = {};
    headerRaw.forEach((h, i) => {
      if (row[i] !== undefined && row[i] !== '') rawRecordObj[h || `col_${i}`] = row[i];
    });

    const pStart = pageStartIdx >= 0 ? row[pageStartIdx] : '';
    const pEnd = pageEndIdx >= 0 ? row[pageEndIdx] : '';
    const pagesStr =
      (pStart && pEnd ? `${pStart}-${pEnd}` : pStart) ||
      (pagesIdx >= 0 ? row[pagesIdx] : '') ||
      undefined;

    const rawJournal = journalIdx >= 0 ? row[journalIdx] || '' : '';
    const recordIdentifier = idIdx >= 0 ? row[idIdx] || undefined : undefined;
    const rawDbTag = dbIdx >= 0 ? row[dbIdx] || undefined : undefined;
    const url = urlIdx >= 0 ? row[urlIdx] || undefined : undefined;
    const prov = inferVerifiableDatabaseFromRecord(meta.explicitDb, {
      recordIdentifier,
      rawDbTag,
      url,
    });

    out.push({
      id: makeRecordId(meta.batchId, out.length),
      databaseName: prov.databaseName,
      databaseVerified: prov.databaseVerified,
      searchBatchId: meta.batchId,
      searchDate: meta.searchDate,
      exportFilename: meta.exportFilename,
      exportFormat: format,
      recordIdentifier,
      doi: doiIdx >= 0 ? normalizeValidDoi(row[doiIdx]) || undefined : undefined,
      title,
      authors: authorsIdx >= 0 ? parseAuthorsString(row[authorsIdx] || '') : [],
      year: yearIdx >= 0 ? parseYearInt(row[yearIdx]) : undefined,
      journal: isPlaceholderVenue(rawJournal) ? '' : rawJournal,
      volume: volumeIdx >= 0 ? row[volumeIdx] || undefined : undefined,
      issue: issueIdx >= 0 ? row[issueIdx] || undefined : undefined,
      pagesStr,
      publisher: publisherIdx >= 0 ? row[publisherIdx] || undefined : undefined,
      abstract: abstractIdx >= 0 ? row[abstractIdx] || '' : '',
      url,
      rawMetadata: rawRecordObj,
      importedAt: meta.importedAt,
    });
  }

  return out;
}

function colRefToZeroIndex(cellRef: string): number {
  const letters = (cellRef.match(/^[A-Z]+/i)?.[0] || '').toUpperCase();
  if (!letters) return -1;
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return col - 1;
}

async function parseXlsxBufferToRows(buf: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buf);
  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  const sharedStrings: string[] = [];

  if (sharedStringsFile) {
    const ssXml = await sharedStringsFile.async('text');
    const siMatches = ssXml.match(/<si\b[^>]*>[\s\S]*?<\/si>/gi) || [];
    for (const si of siMatches) {
      const tMatches = Array.from(si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)).map((m) =>
        decodeXmlEntities(m[1])
      );
      sharedStrings.push(tMatches.join(''));
    }
  }

  const sheetFiles = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort();
  if (sheetFiles.length === 0) return [];

  const sheetXml = await zip.file(sheetFiles[0])!.async('text');
  const rows: string[][] = [];
  const rowMatches = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/gi) || [];

  for (const rowXml of rowMatches) {
    const rowArr: string[] = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRegex.exec(rowXml)) !== null) {
      const attrs = cm[1] || '';
      const cellBody = cm[2] || '';
      const refMatch = attrs.match(/\br="([A-Z]+\d+)"/i);
      const typeMatch = attrs.match(/\bt="([^"]+)"/i);
      const cellType = typeMatch ? typeMatch[1] : '';
      const colIdx = refMatch ? colRefToZeroIndex(refMatch[1]) : rowArr.length;

      let value = '';
      if (cellType === 'inlineStr') {
        const inlineParts = Array.from(cellBody.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)).map((t) =>
          decodeXmlEntities(t[1])
        );
        value = inlineParts.join('');
      } else {
        const vMatch = cellBody.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
        const rawV = vMatch ? vMatch[1].trim() : '';
        if (cellType === 's') {
          const ssIdx = parseInt(rawV, 10);
          value = Number.isFinite(ssIdx) && sharedStrings[ssIdx] !== undefined ? sharedStrings[ssIdx] : '';
        } else {
          value = decodeXmlEntities(rawV);
        }
      }

      if (colIdx >= 0) {
        while (rowArr.length <= colIdx) rowArr.push('');
        rowArr[colIdx] = value;
      }
    }
    if (rowArr.some((c) => c.length > 0)) {
      rows.push(rowArr);
    }
  }

  return rows;
}

function parseSpreadsheetXmlOrHtmlRows(raw: string): string[][] {
  const rows: string[][] = [];
  if (/<Row\b/i.test(raw)) {
    const rowMatches = raw.match(/<Row\b[^>]*>[\s\S]*?<\/Row>/gi) || [];
    for (const r of rowMatches) {
      const cells = Array.from(r.matchAll(/<Data\b[^>]*>([\s\S]*?)<\/Data>/gi)).map((m) =>
        decodeXmlEntities(m[1].replace(/<[^>]+>/g, ' '))
      );
      if (cells.some(Boolean)) rows.push(cells);
    }
    return rows;
  }
  if (/<tr\b/i.test(raw)) {
    const trMatches = raw.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const tr of trMatches) {
      const cells = Array.from(tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((m) =>
        decodeXmlEntities(m[1].replace(/<[^>]+>/g, ' '))
      );
      if (cells.some(Boolean)) rows.push(cells);
    }
  }
  return rows;
}

export async function parseDatabaseExportToStagingBatch(params: {
  exportFilename: string;
  databaseName: string;
  searchBatchId?: string;
  searchDate?: string;
  textContent?: string;
  binaryBuffer?: ArrayBuffer | Uint8Array;
}): Promise<RecoveryStagingBatch> {
  const importedAt = new Date().toISOString();
  const batchId = (params.searchBatchId || '').trim() || makeBatchId();
  const explicitDb = normalizeExplicitDatabaseName(params.databaseName);

  let text = params.textContent || '';
  if (!text && params.binaryBuffer && !/\.xlsx$/i.test(params.exportFilename)) {
    text = new TextDecoder('utf-8').decode(params.binaryBuffer);
  }

  const format = detectExportFormatFromFilename(params.exportFilename, text);
  const meta = {
    batchId,
    explicitDb,
    searchDate: params.searchDate?.trim() || undefined,
    exportFilename: params.exportFilename,
    importedAt,
  };

  let records: DatabaseIdentificationRecord[] = [];

  if (format === 'xlsx') {
    if (!params.binaryBuffer) {
      throw new Error(`Binary workbook buffer is required to parse Excel file "${params.exportFilename}".`);
    }
    const rows = await parseXlsxBufferToRows(params.binaryBuffer);
    records = rowsToDatabaseRecords(rows, 'xlsx', meta);
  } else if (format === 'xls') {
    if (params.binaryBuffer) {
      const bytes = params.binaryBuffer instanceof Uint8Array
        ? params.binaryBuffer
        : new Uint8Array(params.binaryBuffer);
      // Detect if .xls is actually OOXML zip renamed .xls
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        const rows = await parseXlsxBufferToRows(bytes);
        records = rowsToDatabaseRecords(rows, 'xls', meta);
      } else {
        const asText = text || new TextDecoder('utf-8').decode(bytes);
        const xmlRows = parseSpreadsheetXmlOrHtmlRows(asText);
        if (xmlRows.length >= 2) {
          records = rowsToDatabaseRecords(xmlRows, 'xls', meta);
        } else {
          const delim = asText.includes('\t') ? '\t' : ',';
          records = rowsToDatabaseRecords(parseDelimitedRows(asText, delim), 'xls', meta);
        }
      }
    } else if (text) {
      const xmlRows = parseSpreadsheetXmlOrHtmlRows(text);
      if (xmlRows.length >= 2) {
        records = rowsToDatabaseRecords(xmlRows, 'xls', meta);
      } else {
        const delim = text.includes('\t') ? '\t' : ',';
        records = rowsToDatabaseRecords(parseDelimitedRows(text, delim), 'xls', meta);
      }
    }
  } else if (format === 'ris') {
    records = parseRisRecords(text, meta);
  } else if (format === 'bibtex') {
    records = parseBibTexEntries(text, meta);
  } else if (format === 'endnote') {
    records = parseEndNoteTagged(text, meta);
  } else if (format === 'nbib') {
    records = parsePubMedNbib(text, meta);
  } else if (format === 'ciw') {
    records = parseWosCiw(text, meta);
  } else if (format === 'xml') {
    if (/<Row\b|<tr\b/i.test(text) && !/<record\b/i.test(text)) {
      records = rowsToDatabaseRecords(parseSpreadsheetXmlOrHtmlRows(text), 'xml', meta);
    } else {
      records = parseEndNoteXml(text, meta);
    }
  } else if (format === 'json') {
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.records) ? parsed.records : [];
    records = arr
      .filter((item: any) => item && item.title)
      .map((item: any, idx: number) => {
        const prov = inferVerifiableDatabaseFromRecord(explicitDb, {
          recordIdentifier: item.recordIdentifier || item.id,
          rawDbTag: item.databaseName || item.sourceDatabase,
          url: item.url,
        });
        return {
          id: makeRecordId(batchId, idx),
          databaseName: prov.databaseName,
          databaseVerified: prov.databaseVerified,
          searchBatchId: batchId,
          searchDate: meta.searchDate,
          exportFilename: meta.exportFilename,
          exportFormat: 'json' as const,
          recordIdentifier: item.recordIdentifier || item.id || undefined,
          doi: normalizeValidDoi(item.doi) || undefined,
          title: String(item.title).trim(),
          authors: Array.isArray(item.authors)
            ? sanitizeAuthorsList(item.authors)
            : parseAuthorsString(String(item.authors || '')),
          year: parseYearInt(item.year),
          journal: isPlaceholderVenue(item.journal) ? '' : String(item.journal || ''),
          volume: item.volume || undefined,
          issue: item.issue || undefined,
          pagesStr: item.pagesStr || item.pages || undefined,
          publisher: item.publisher || undefined,
          abstract: String(item.abstract || ''),
          url: item.url || undefined,
          rawMetadata: item,
          importedAt,
        };
      });
  } else {
    // CSV / TSV / TXT fallback auto-detect
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delim =
      format === 'tsv' || firstLine.includes('\t')
        ? '\t'
        : firstLine.includes(';') && !firstLine.includes(',')
        ? ';'
        : ',';
    const rows = parseDelimitedRows(text, delim);
    records = rowsToDatabaseRecords(rows, format, meta);
  }

  const allVerified = records.length > 0 ? records.every((r) => r.databaseVerified) : explicitDb.verified;
  const resolvedBatchDb =
    explicitDb.verified
      ? explicitDb.name
      : records.find((r) => r.databaseVerified)?.databaseName || explicitDb.name;

  return {
    batchId,
    databaseName: resolvedBatchDb,
    databaseVerified: allVerified,
    searchDate: meta.searchDate,
    exportFilename: params.exportFilename,
    exportFormat: format,
    recordsCount: records.length,
    importedAt,
    records,
  };
}
