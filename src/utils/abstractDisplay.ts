import { Article } from '../types';

export interface ResolvedArticleAbstract {
  text: string;
  source: 'original_doc_section' | 'article_abstract' | 'placeholder_pdf' | 'missing';
  isPlaceholder: boolean;
  wordCount: number;
  charCount: number;
}

const RAW_PDF_SYNTAX_REGEX =
  /%PDF-\d|\b\d+\s+\d+\s+obj\b|\/FlateDecode|\/Filter\s*\/|\/Length\s+\d+|endstream|endobj|\/Type\s*\/Page/i;

const GENERIC_PLACEHOLDER_PATTERNS: RegExp[] = [
  /^Imported local file\s*\(/i,
  /^Extracted from local file:/i,
  /^Imported from local drive file:/i,
  /^Extracted from title\/file name query:/i,
  /^Imported via (?:JSON dataset|BibTeX bibliography|RIS reference format)\.?$/i,
  /^Imported bibliographic record\.?$/i,
  /^No abstract available/i,
  /^Abstract was not provided/i,
  /^Abstract verified from Crossref record\.?$/i,
  /^Abstract indexed in scientific repository\.?$/i,
  /^Abstract imported via/i,
  /^Abstract retrieved from online bibliographic database\.?$/i,
  /^Synchronized from online repository\.?$/i,
  /^Manual research paper entry\.?$/i,
  /^Indexed in NCBI PubMed MEDLINE\.?$/i,
];

export function cleanAbstractProse(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw
    // Strip JATS / XML / HTML tags often returned by Crossref or publisher feeds
    .replace(/<\/?(?:jats:)?(?:p|sec|title|italic|bold|sup|sub|list|list-item|br|div|span)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // Fix publisher scrapes that glue "Abstract" directly to the first word (e.g. "AbstractDrought is...")
  text = text.replace(/^Abstract(?=[A-Z])/, '').replace(/^Abstract\s*[:.\-–—]\s*/i, '').trim();
  return text;
}

export function isRawPdfOrPlaceholderAbstract(raw?: string): boolean {
  const trimmed = (raw || '').trim();
  if (!trimmed) return true;
  if (RAW_PDF_SYNTAX_REGEX.test(trimmed)) return true;
  if (GENERIC_PLACEHOLDER_PATTERNS.some((re) => re.test(trimmed))) return true;
  // Uncompressed gibberish check: very low alphabetic ratio
  const alphaChars = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (trimmed.length > 20 && alphaChars / trimmed.length < 0.35) return true;
  return false;
}

/**
 * Extracts the dedicated Abstract section from `fullText` or `pages` of the original document
 * when present and readable.
 */
export function extractAbstractSectionFromDocumentText(docText?: string): string {
  if (!docText || typeof docText !== 'string') return '';
  if (RAW_PDF_SYNTAX_REGEX.test(docText.slice(0, 600))) return '';

  const normalized = docText.replace(/\r\n/g, '\n');
  const match = normalized.match(
    /(?:^|\n)\s*(?:abstract|summary|resumo|r[eé]sum[eé])\s*(?:[:.\-–—]|\n)\s*([\s\S]{60,4000}?)(?=\n\s*(?:keywords?|key\s+words?|index\s+terms?|highlights?|graphical\s+abstract|1\.?\s+introduction|introduction|background|2\.?\s+methods?|materials?\s+and\s+methods?)\b|$)/i
  );
  if (match && match[1]) {
    const cleaned = cleanAbstractProse(match[1]);
    if (cleaned.length >= 60 && !isRawPdfOrPlaceholderAbstract(cleaned)) {
      return cleaned;
    }
  }
  return '';
}

/**
 * Resolves the fullest available readable Abstract for an article card in Article Library,
 * preferring an intact original-document Abstract section or full `article.abstract` without
 * ever clipping it to 2 lines or leaking raw compressed PDF stream syntax.
 */
export function resolveFullArticleAbstract(article: Partial<Article>): ResolvedArticleAbstract {
  const combinedDocText =
    (article.fullText && article.fullText.trim()) ||
    (Array.isArray(article.pages) && article.pages.length > 0
      ? article.pages
          .slice(0, 3)
          .map((p) => p.content || '')
          .join('\n')
      : '');

  const docAbstract = extractAbstractSectionFromDocumentText(combinedDocText);
  const rawAbs = cleanAbstractProse(article.abstract);
  const absIsPlaceholder = isRawPdfOrPlaceholderAbstract(rawAbs);

  if (docAbstract && (absIsPlaceholder || docAbstract.length > rawAbs.length + 40)) {
    const words = docAbstract.split(/\s+/).filter(Boolean).length;
    return {
      text: docAbstract,
      source: 'original_doc_section',
      isPlaceholder: false,
      wordCount: words,
      charCount: docAbstract.length,
    };
  }

  if (rawAbs && !absIsPlaceholder) {
    const words = rawAbs.split(/\s+/).filter(Boolean).length;
    return {
      text: rawAbs,
      source: 'article_abstract',
      isPlaceholder: false,
      wordCount: words,
      charCount: rawAbs.length,
    };
  }

  if (RAW_PDF_SYNTAX_REGEX.test(article.abstract || '') || /^Imported local file/i.test(article.abstract || '')) {
    return {
      text: '',
      source: 'placeholder_pdf',
      isPlaceholder: true,
      wordCount: 0,
      charCount: 0,
    };
  }

  return {
    text: rawAbs,
    source: rawAbs ? 'placeholder_pdf' : 'missing',
    isPlaceholder: true,
    wordCount: 0,
    charCount: 0,
  };
}

/**
 * Extracts readable DOI, Title, and clean Abstract/prose snippet hints from a raw PDF byte slice
 * without ever leaking binary `%PDF-` / `/FlateDecode` stream objects into article.abstract.
 */
export function extractReadablePdfHints(raw: string): {
  titleHint?: string;
  doiHint?: string;
  snippet?: string;
} {
  if (!raw || typeof raw !== 'string') return {};
  const doiMatch = raw.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
  const titleMeta = raw.match(/\/Title\s*\(([^)]{4,220})\)/i);
  const subjectMeta = raw.match(/\/Subject\s*\(([^)]{30,1800})\)/i);

  let snippet: string | undefined;
  if (subjectMeta && subjectMeta[1]) {
    const cleanedSubject = cleanAbstractProse(subjectMeta[1]);
    if (cleanedSubject.length >= 40 && !isRawPdfOrPlaceholderAbstract(cleanedSubject)) {
      snippet = cleanedSubject;
    }
  }

  if (!snippet) {
    // Attempt to pull uncompressed PDF text operators `(text) Tj`
    const tjTokens: string[] = [];
    const tjRegex = /\(([^()\\]{3,160})\)\s*Tj/g;
    let m: RegExpExecArray | null;
    while ((m = tjRegex.exec(raw)) !== null && tjTokens.length < 180) {
      const piece = m[1].replace(/[^\x20-\x7E]/g, ' ').trim();
      if (piece && /[a-zA-Z]{2,}/.test(piece)) {
        tjTokens.push(piece);
      }
    }
    const joined = cleanAbstractProse(tjTokens.join(' '));
    if (joined.length >= 60 && !isRawPdfOrPlaceholderAbstract(joined)) {
      snippet = joined;
    }
  }

  return {
    doiHint: doiMatch ? doiMatch[0].replace(/[)>.,;]+$/, '') : undefined,
    titleHint:
      titleMeta && titleMeta[1] && !RAW_PDF_SYNTAX_REGEX.test(titleMeta[1])
        ? titleMeta[1].trim()
        : undefined,
    snippet,
  };
}

