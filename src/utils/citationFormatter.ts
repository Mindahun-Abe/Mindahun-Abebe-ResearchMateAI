import { Article } from '../types';

export type CitationStyleId =
  | 'apa7'
  | 'harvard'
  | 'mla9'
  | 'chicago_author_date'
  | 'chicago_notes'
  | 'ieee'
  | 'vancouver'
  | 'ama'
  | 'acs'
  | 'turabian'
  | 'oscola'
  | 'cse';

export type CitationSourceType =
  | 'auto'
  | 'journal'
  | 'book'
  | 'book_chapter'
  | 'conference'
  | 'website'
  | 'thesis';

export interface CitationStyleDefinition {
  number: number;
  id: CitationStyleId;
  name: string;
  inTextExample: string;
  commonApplication: string;
  inTextCategory: 'author_date' | 'numerical' | 'footnote';
}

export const CITATION_STYLE_DEFINITIONS: CitationStyleDefinition[] = [
  {
    number: 1,
    id: 'apa7',
    name: 'APA (7th edition)',
    inTextExample: '(Smith, 2022)',
    commonApplication: 'Social sciences, education, environmental studies.',
    inTextCategory: 'author_date',
  },
  {
    number: 2,
    id: 'harvard',
    name: 'Harvard',
    inTextExample: '(Smith, 2022)',
    commonApplication: 'Environmental science, geography, and general academic research.',
    inTextCategory: 'author_date',
  },
  {
    number: 3,
    id: 'mla9',
    name: 'MLA (9th edition)',
    inTextExample: '(Smith 25)',
    commonApplication: 'Humanities, literature, and languages.',
    inTextCategory: 'author_date',
  },
  {
    number: 4,
    id: 'chicago_author_date',
    name: 'Chicago Author-Date',
    inTextExample: '(Smith 2022, 25)',
    commonApplication: 'Social sciences and interdisciplinary research.',
    inTextCategory: 'author_date',
  },
  {
    number: 5,
    id: 'chicago_notes',
    name: 'Chicago Notes and Bibliography',
    inTextExample: 'Superscript footnote number¹',
    commonApplication: 'History, humanities, and arts.',
    inTextCategory: 'footnote',
  },
  {
    number: 6,
    id: 'ieee',
    name: 'IEEE',
    inTextExample: '[1]',
    commonApplication: 'Engineering, computer science, and technology.',
    inTextCategory: 'numerical',
  },
  {
    number: 7,
    id: 'vancouver',
    name: 'Vancouver',
    inTextExample: '(1) or superscript ¹',
    commonApplication: 'Medicine, health sciences, and biomedical research.',
    inTextCategory: 'numerical',
  },
  {
    number: 8,
    id: 'ama',
    name: 'AMA',
    inTextExample: 'Superscript ¹',
    commonApplication: 'Medical and clinical research.',
    inTextCategory: 'numerical',
  },
  {
    number: 9,
    id: 'acs',
    name: 'ACS',
    inTextExample: 'Superscript number or author-date',
    commonApplication: 'Chemistry and chemical sciences.',
    inTextCategory: 'numerical',
  },
  {
    number: 10,
    id: 'turabian',
    name: 'Turabian',
    inTextExample: 'Footnotes or author-date',
    commonApplication: 'Student theses and dissertations.',
    inTextCategory: 'footnote',
  },
  {
    number: 11,
    id: 'oscola',
    name: 'OSCOLA',
    inTextExample: 'Footnotes',
    commonApplication: 'Law and legal research.',
    inTextCategory: 'footnote',
  },
  {
    number: 12,
    id: 'cse',
    name: 'CSE',
    inTextExample: '(Smith 2022) or [1]',
    commonApplication: 'Biological and natural sciences.',
    inTextCategory: 'author_date',
  },
];

export interface InTextCitationGuideGroup {
  code: string;
  title: string;
  description?: string;
  items: { label: string; example: string }[];
}

export const IN_TEXT_CITATION_GUIDE: InTextCitationGuideGroup[] = [
  {
    code: 'A',
    title: 'Author–date citation',
    items: [
      { label: 'Parenthetical', example: '(Smith, 2022).' },
      {
        label: 'Narrative',
        example: 'Smith (2022) reported that vegetation cover influences soil erosion.',
      },
      { label: 'Multiple authors', example: '(Smith & Jones, 2022).' },
      { label: 'Three or more authors in APA 7', example: '(Smith et al., 2022).' },
    ],
  },
  {
    code: 'B',
    title: 'Numerical citation',
    items: [
      {
        label: 'Sequential numbering',
        example: 'Soil erosion susceptibility can be assessed using machine learning [1].',
      },
      {
        label: 'Multiple references',
        example: 'Several studies have investigated this relationship [1–3].',
      },
      {
        label: 'Vancouver-style example',
        example: 'Soil erosion is influenced by several environmental factors (1, 2).',
      },
    ],
  },
  {
    code: 'C',
    title: 'Footnote citation',
    description:
      'A superscript number directs readers to a footnote containing the source information.',
    items: [
      {
        label: 'Superscript marker',
        example: 'Watershed conservation strategies reduced gully headcut retreat.¹',
      },
    ],
  },
  {
    code: 'D',
    title: 'Direct and indirect citation',
    items: [
      {
        label: 'Direct quotation',
        example:
          "Reproduces the original author's exact words, with quotation marks and a page number where applicable.",
      },
      {
        label: 'Paraphrased citation',
        example:
          'Expresses the author\'s ideas in your own words while acknowledging the source.',
      },
    ],
  },
];

export interface Apa7SourceFormatExample {
  sourceType: string;
  formatExample: string;
}

export const APA7_SOURCE_FORMAT_EXAMPLES: Apa7SourceFormatExample[] = [
  {
    sourceType: 'Journal article',
    formatExample:
      'Smith, J. (2022). Soil erosion assessment using machine learning. Journal of Environmental Research, 15(2), 100–115. https://doi.org/xxxxx',
  },
  {
    sourceType: 'Book',
    formatExample:
      'Smith, J. (2022). Environmental modelling and GIS. Academic Press.',
  },
  {
    sourceType: 'Book chapter',
    formatExample:
      'Smith, J. (2022). Soil conservation methods. In A. Jones (Ed.), Environmental management (pp. 20–35). Publisher.',
  },
  {
    sourceType: 'Conference paper',
    formatExample:
      'Smith, J. (2022). Machine learning for erosion mapping. In Proceedings of the International GIS Conference (pp. 10–15).',
  },
  {
    sourceType: 'Website',
    formatExample:
      'Organization Name. (2022). Title of webpage. https://example.org',
  },
  {
    sourceType: 'Thesis/dissertation',
    formatExample:
      "Smith, J. (2022). Machine learning for soil erosion susceptibility mapping [Master's thesis, University Name]. Repository Name.",
  },
];

export function getCitationStyleDefinition(styleId?: CitationStyleId): CitationStyleDefinition {
  return (
    CITATION_STYLE_DEFINITIONS.find((s) => s.id === styleId) ||
    CITATION_STYLE_DEFINITIONS[0]
  );
}

interface ParsedAuthor {
  surname: string;
  givenNames: string;
  initials: string;
  initialsNoDots: string;
}

function parseSingleAuthor(raw: string): ParsedAuthor {
  const cleaned = (raw || '').trim();
  if (!cleaned) {
    return { surname: 'Unknown', givenNames: '', initials: '', initialsNoDots: '' };
  }

  let surname = '';
  let givenNames = '';

  if (cleaned.includes(',')) {
    const [last, first] = cleaned.split(',', 2);
    surname = last.trim();
    givenNames = (first || '').trim();
  } else {
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      surname = parts[0];
    } else {
      surname = parts[parts.length - 1];
      givenNames = parts.slice(0, -1).join(' ');
    }
  }

  const tokens = givenNames
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const initials = tokens.map((t) => `${t[0].toUpperCase()}.`).join(' ');
  const initialsNoDots = tokens.map((t) => t[0].toUpperCase()).join('');

  return { surname, givenNames, initials, initialsNoDots };
}

function formatAuthorsForStyle(authors: string[], styleId: CitationStyleId): string {
  const list = (authors || []).filter((a) => a && a.trim().length > 0);
  if (list.length === 0) return 'Author Unknown';
  const parsed = list.map(parseSingleAuthor);

  switch (styleId) {
    case 'apa7': {
      const formatted = parsed.map((p) => (p.initials ? `${p.surname}, ${p.initials}` : p.surname));
      if (formatted.length === 1) return formatted[0];
      if (formatted.length === 2) return `${formatted[0]}, & ${formatted[1]}`;
      if (formatted.length <= 20) {
        return `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`;
      }
      return `${formatted.slice(0, 19).join(', ')}, ... ${formatted[formatted.length - 1]}`;
    }
    case 'harvard': {
      const formatted = parsed.map((p) => (p.initials ? `${p.surname}, ${p.initials}` : p.surname));
      if (formatted.length === 1) return formatted[0];
      if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
      if (formatted.length === 3) return `${formatted[0]}, ${formatted[1]} and ${formatted[2]}`;
      return `${formatted[0]} et al.`;
    }
    case 'mla9': {
      const first = parsed[0].givenNames
        ? `${parsed[0].surname}, ${parsed[0].givenNames}`
        : parsed[0].surname;
      if (parsed.length === 1) return first;
      if (parsed.length === 2) {
        const second = parsed[1].givenNames
          ? `${parsed[1].givenNames} ${parsed[1].surname}`
          : parsed[1].surname;
        return `${first}, and ${second}`;
      }
      return `${first}, et al.`;
    }
    case 'chicago_author_date': {
      const first = parsed[0].givenNames
        ? `${parsed[0].surname}, ${parsed[0].givenNames}`
        : parsed[0].surname;
      if (parsed.length === 1) return first;
      const others = parsed
        .slice(1)
        .map((p) => (p.givenNames ? `${p.givenNames} ${p.surname}` : p.surname));
      if (parsed.length === 2) return `${first}, and ${others[0]}`;
      if (parsed.length <= 10) {
        return `${first}, ${others.slice(0, -1).join(', ')}, and ${others[others.length - 1]}`;
      }
      return `${first}, ${others.slice(0, 6).join(', ')}, et al.`;
    }
    case 'chicago_notes':
    case 'turabian': {
      const fullNames = parsed.map((p) => (p.givenNames ? `${p.givenNames} ${p.surname}` : p.surname));
      if (fullNames.length === 1) return fullNames[0];
      if (fullNames.length === 2) return `${fullNames[0]} and ${fullNames[1]}`;
      if (fullNames.length === 3) return `${fullNames[0]}, ${fullNames[1]}, and ${fullNames[2]}`;
      return `${fullNames[0]} et al.`;
    }
    case 'oscola': {
      const fullNames = parsed.map((p) => (p.givenNames ? `${p.givenNames} ${p.surname}` : p.surname));
      if (fullNames.length === 1) return fullNames[0];
      if (fullNames.length === 2) return `${fullNames[0]} and ${fullNames[1]}`;
      if (fullNames.length === 3) return `${fullNames[0]}, ${fullNames[1]} and ${fullNames[2]}`;
      return `${fullNames[0]} and others`;
    }
    case 'ieee': {
      const formatted = parsed.map((p) => (p.initials ? `${p.initials} ${p.surname}` : p.surname));
      if (formatted.length === 1) return formatted[0];
      if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
      if (formatted.length <= 6) {
        return `${formatted.slice(0, -1).join(', ')}, and ${formatted[formatted.length - 1]}`;
      }
      return `${formatted[0]} et al.`;
    }
    case 'vancouver':
    case 'ama':
    case 'cse': {
      const formatted = parsed.map((p) =>
        p.initialsNoDots ? `${p.surname} ${p.initialsNoDots}` : p.surname
      );
      if (formatted.length <= 6) return formatted.join(', ');
      return `${formatted.slice(0, 6).join(', ')}, et al.`;
    }
    case 'acs': {
      const formatted = parsed.map((p) => (p.initials ? `${p.surname}, ${p.initials}` : p.surname));
      if (formatted.length <= 10) return formatted.join('; ');
      return `${formatted.slice(0, 10).join('; ')}; et al.`;
    }
    default:
      return list.join(', ');
  }
}

export function inferArticleSourceType(
  article: Article
): Exclude<CitationSourceType, 'auto'> {
  const combined = `${article.paperSubType || ''} ${article.journal || ''} ${article.title || ''} ${article.extractedData?.studyType || ''}`.toLowerCase();
  if (combined.includes('thesis') || combined.includes('dissertation')) return 'thesis';
  if (combined.includes('book chapter')) return 'book_chapter';
  if (combined.includes('proceedings') || combined.includes('conference') || combined.includes('symposium')) return 'conference';
  if (combined.includes('book') && !combined.includes('handbook of')) return 'book';
  if (!article.journal && article.url) return 'website';
  return 'journal';
}

const SOURCE_TYPE_LABELS: Record<Exclude<CitationSourceType, 'auto'>, string> = {
  journal: 'Journal article',
  book: 'Book',
  book_chapter: 'Book chapter',
  conference: 'Conference paper',
  website: 'Website',
  thesis: 'Thesis/dissertation',
};

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

function toSuperscript(num: number): string {
  return String(num)
    .split('')
    .map((d) => SUPERSCRIPT_DIGITS[d] || d)
    .join('');
}

export function formatInTextCitation(
  article: Article,
  index: number,
  styleId: CitationStyleId,
  options?: { narrative?: boolean; page?: string }
): string {
  const num = index + 1;
  const parsed = (article.authors || []).filter(Boolean).map(parseSingleAuthor);
  const firstSurname = parsed[0]?.surname || 'Unknown';
  const secondSurname = parsed[1]?.surname;
  const year = article.year || 'No date';
  const pageSuffix = options?.page ? `, ${options.page}` : '';

  const authorText =
    parsed.length === 1 || !secondSurname
      ? firstSurname
      : parsed.length === 2
      ? `${firstSurname} & ${secondSurname}`
      : `${firstSurname} et al.`;

  const authorTextAnd =
    parsed.length === 1 || !secondSurname
      ? firstSurname
      : parsed.length === 2
      ? `${firstSurname} and ${secondSurname}`
      : `${firstSurname} et al.`;

  switch (styleId) {
    case 'apa7':
      return options?.narrative
        ? `${authorTextAnd} (${year})`
        : `(${authorText}, ${year}${pageSuffix})`;
    case 'harvard':
      return options?.narrative
        ? `${authorTextAnd} (${year})`
        : `(${authorTextAnd}, ${year}${options?.page ? `, p. ${options.page}` : ''})`;
    case 'mla9':
      return options?.narrative
        ? `${authorTextAnd} (${options?.page || '1'})`
        : `(${authorTextAnd} ${options?.page || '1'})`;
    case 'chicago_author_date':
      return options?.narrative
        ? `${authorTextAnd} (${year})`
        : `(${authorTextAnd} ${year}${pageSuffix})`;
    case 'chicago_notes':
    case 'turabian':
    case 'oscola':
    case 'ama':
      return toSuperscript(num);
    case 'ieee':
      return `[${num}]`;
    case 'vancouver':
      return `(${num})`;
    case 'acs':
      return options?.narrative ? `${authorTextAnd} (${year})` : toSuperscript(num);
    case 'cse':
      return options?.narrative ? `${authorTextAnd} (${year})` : `(${authorTextAnd} ${year})`;
    default:
      return `[${num}]`;
  }
}

export interface FormattedReferenceResult {
  prefix: string;
  citationText: string;
  htmlText: string;
  inTextParenthetical: string;
  inTextNarrative: string;
  doiOrUrl: string;
  sourceTypeLabel: string;
}

function escapeHtmlBasic(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatReferenceEntry(
  article: Article,
  index: number,
  styleId: CitationStyleId,
  sourceTypeOverride: CitationSourceType = 'auto'
): FormattedReferenceResult {
  const num = index + 1;
  const resolvedSourceType =
    sourceTypeOverride === 'auto' ? inferArticleSourceType(article) : sourceTypeOverride;
  const sourceTypeLabel = SOURCE_TYPE_LABELS[resolvedSourceType];

  const authorsStr = formatAuthorsForStyle(article.authors || [], styleId);
  const year = article.year ? String(article.year) : 'Year not reported';
  const title = (article.title || 'Untitled research study').replace(/\.+$/, '');
  const venue = (article.journal || article.publisher || 'Journal title not reported').replace(/\.+$/, '');
  const publisher = (article.publisher || 'Academic Publisher').replace(/\.+$/, '');
  const vol = article.volume ? article.volume.trim() : '';
  const issue = article.issue ? article.issue.trim() : '';
  const pages = article.pagesStr ? article.pagesStr.trim() : '';

  const doiClean = article.doi ? article.doi.trim().replace(/^https?:\/\/doi\.org\//i, '') : '';
  const doiUrl = doiClean ? `https://doi.org/${doiClean}` : '';
  const doiOrUrl = doiUrl || article.url || article.openAccessUrl || '';

  const volIssuePagesApa = [
    vol ? (issue ? `${vol}(${issue})` : vol) : '',
    pages,
  ]
    .filter(Boolean)
    .join(', ');

  let citationText = '';
  let htmlText = '';
  let prefix = `[${num}]`;

  const buildVenueAndLink = (plainVenuePart: string, htmlVenuePart: string, linkSuffixPlain: string, linkSuffixHtml: string) => {
    citationText = `${plainVenuePart}${linkSuffixPlain}`.trim();
    htmlText = `${htmlVenuePart}${linkSuffixHtml}`.trim();
  };

  switch (styleId) {
    case 'apa7': {
      prefix = `${num}.`;
      const linkPlain = doiOrUrl ? ` ${doiOrUrl}` : '';
      const linkHtml = doiOrUrl ? ` <a href="${escapeHtmlBasic(doiOrUrl)}">${escapeHtmlBasic(doiOrUrl)}</a>` : '';

      if (resolvedSourceType === 'book') {
        buildVenueAndLink(
          `${authorsStr} (${year}). ${title}. ${publisher}.${linkPlain}`,
          `${escapeHtmlBasic(authorsStr)} (${escapeHtmlBasic(year)}). <em>${escapeHtmlBasic(title)}</em>. ${escapeHtmlBasic(publisher)}.${linkHtml}`,
          '',
          ''
        );
      } else if (resolvedSourceType === 'book_chapter') {
        const pp = pages ? ` (pp. ${pages})` : '';
        buildVenueAndLink(
          `${authorsStr} (${year}). ${title}. In ${venue}${pp}. ${publisher}.${linkPlain}`,
          `${escapeHtmlBasic(authorsStr)} (${escapeHtmlBasic(year)}). ${escapeHtmlBasic(title)}. In <em>${escapeHtmlBasic(venue)}</em>${escapeHtmlBasic(pp)}. ${escapeHtmlBasic(publisher)}.${linkHtml}`,
          '',
          ''
        );
      } else if (resolvedSourceType === 'conference') {
        const pp = pages ? ` (pp. ${pages})` : '';
        buildVenueAndLink(
          `${authorsStr} (${year}). ${title}. In ${venue}${pp}.${linkPlain}`,
          `${escapeHtmlBasic(authorsStr)} (${escapeHtmlBasic(year)}). ${escapeHtmlBasic(title)}. In <em>${escapeHtmlBasic(venue)}</em>${escapeHtmlBasic(pp)}.${linkHtml}`,
          '',
          ''
        );
      } else if (resolvedSourceType === 'website') {
        buildVenueAndLink(
          `${authorsStr} (${year}). ${title}.${linkPlain}`,
          `${escapeHtmlBasic(authorsStr)} (${escapeHtmlBasic(year)}). <em>${escapeHtmlBasic(title)}</em>.${linkHtml}`,
          '',
          ''
        );
      } else if (resolvedSourceType === 'thesis') {
        buildVenueAndLink(
          `${authorsStr} (${year}). ${title} [Thesis/dissertation, ${publisher}]. ${venue}.${linkPlain}`,
          `${escapeHtmlBasic(authorsStr)} (${escapeHtmlBasic(year)}). <em>${escapeHtmlBasic(title)}</em> [Thesis/dissertation, ${escapeHtmlBasic(publisher)}]. ${escapeHtmlBasic(venue)}.${linkHtml}`,
          '',
          ''
        );
      } else {
        const tail = volIssuePagesApa ? `, ${volIssuePagesApa}` : '';
        buildVenueAndLink(
          `${authorsStr} (${year}). ${title}. ${venue}${tail}.${linkPlain}`,
          `${escapeHtmlBasic(authorsStr)} (${escapeHtmlBasic(year)}). ${escapeHtmlBasic(title)}. <em>${escapeHtmlBasic(venue)}${vol ? `, ${escapeHtmlBasic(vol)}` : ''}</em>${issue ? `(${escapeHtmlBasic(issue)})` : ''}${pages ? `, ${escapeHtmlBasic(pages)}` : ''}.${linkHtml}`,
          '',
          ''
        );
      }
      break;
    }

    case 'harvard': {
      prefix = `${num}.`;
      const details = [vol ? `${vol}${issue ? `(${issue})` : ''}` : '', pages ? `pp. ${pages}` : '']
        .filter(Boolean)
        .join(', ');
      const avail = doiOrUrl ? ` Available at: ${doiOrUrl}` : '';
      const availHtml = doiOrUrl
        ? ` Available at: <a href="${escapeHtmlBasic(doiOrUrl)}">${escapeHtmlBasic(doiOrUrl)}</a>`
        : '';
      citationText = `${authorsStr} (${year}) '${title}', ${venue}${details ? `, ${details}` : ''}.${avail}`;
      htmlText = `${escapeHtmlBasic(authorsStr)} (${escapeHtmlBasic(year)}) '${escapeHtmlBasic(title)}', <em>${escapeHtmlBasic(venue)}</em>${details ? `, ${escapeHtmlBasic(details)}` : ''}.${availHtml}`;
      break;
    }

    case 'mla9': {
      prefix = `${num}.`;
      const details = [
        vol ? `vol. ${vol}` : '',
        issue ? `no. ${issue}` : '',
        year,
        pages ? `pp. ${pages}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      const link = doiOrUrl ? ` ${doiOrUrl}.` : '';
      const linkHtml = doiOrUrl ? ` <a href="${escapeHtmlBasic(doiOrUrl)}">${escapeHtmlBasic(doiOrUrl)}</a>.` : '';
      citationText = `${authorsStr}. "${title}." ${venue}, ${details}.${link}`;
      htmlText = `${escapeHtmlBasic(authorsStr)}. "${escapeHtmlBasic(title)}." <em>${escapeHtmlBasic(venue)}</em>, ${escapeHtmlBasic(details)}.${linkHtml}`;
      break;
    }

    case 'chicago_author_date': {
      prefix = `${num}.`;
      const volPart = vol ? ` ${vol}${issue ? ` (${issue})` : ''}` : '';
      const pagePart = pages ? `: ${pages}` : '';
      const link = doiOrUrl ? ` ${doiOrUrl}.` : '';
      const linkHtml = doiOrUrl ? ` <a href="${escapeHtmlBasic(doiOrUrl)}">${escapeHtmlBasic(doiOrUrl)}</a>.` : '';
      citationText = `${authorsStr}. ${year}. "${title}." ${venue}${volPart}${pagePart}.${link}`;
      htmlText = `${escapeHtmlBasic(authorsStr)}. ${escapeHtmlBasic(year)}. "${escapeHtmlBasic(title)}." <em>${escapeHtmlBasic(venue)}</em>${escapeHtmlBasic(volPart)}${escapeHtmlBasic(pagePart)}.${linkHtml}`;
      break;
    }

    case 'chicago_notes':
    case 'turabian': {
      prefix = `${toSuperscript(num)}`;
      const volPart = vol ? ` ${vol}${issue ? `, no. ${issue}` : ''}` : '';
      const pagePart = pages ? `: ${pages}` : '';
      const link = doiOrUrl ? `, ${doiOrUrl}` : '';
      const linkHtml = doiOrUrl ? `, <a href="${escapeHtmlBasic(doiOrUrl)}">${escapeHtmlBasic(doiOrUrl)}</a>` : '';
      citationText = `${authorsStr}, "${title}," ${venue}${volPart} (${year})${pagePart}${link}.`;
      htmlText = `${escapeHtmlBasic(authorsStr)}, "${escapeHtmlBasic(title)}," <em>${escapeHtmlBasic(venue)}</em>${escapeHtmlBasic(volPart)} (${escapeHtmlBasic(year)})${escapeHtmlBasic(pagePart)}${linkHtml}.`;
      break;
    }

    case 'ieee': {
      prefix = `[${num}]`;
      const parts = [
        vol ? `vol. ${vol}` : '',
        issue ? `no. ${issue}` : '',
        pages ? `pp. ${pages}` : '',
        year,
        doiClean ? `doi: ${doiClean}` : doiOrUrl ? `Available: ${doiOrUrl}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      citationText = `${authorsStr}, "${title}," ${venue}, ${parts}.`;
      htmlText = `${escapeHtmlBasic(authorsStr)}, "${escapeHtmlBasic(title)}," <em>${escapeHtmlBasic(venue)}</em>, ${escapeHtmlBasic(parts)}.`;
      break;
    }

    case 'vancouver': {
      prefix = `${num}.`;
      const volStr = `${year}${vol ? `;${vol}` : ''}${issue ? `(${issue})` : ''}${pages ? `:${pages}` : ''}`;
      const doiStr = doiClean ? ` doi:${doiClean}` : doiOrUrl ? ` Available from: ${doiOrUrl}` : '';
      citationText = `${authorsStr}. ${title}. ${venue}. ${volStr}.${doiStr}`;
      htmlText = `${escapeHtmlBasic(authorsStr)}. ${escapeHtmlBasic(title)}. ${escapeHtmlBasic(venue)}. ${escapeHtmlBasic(volStr)}.${escapeHtmlBasic(doiStr)}`;
      break;
    }

    case 'ama': {
      prefix = `${num}.`;
      const volStr = `${year}${vol ? `;${vol}` : ''}${issue ? `(${issue})` : ''}${pages ? `:${pages}` : ''}`;
      const doiStr = doiClean ? ` doi:${doiClean}` : doiOrUrl ? ` ${doiOrUrl}` : '';
      citationText = `${authorsStr}. ${title}. ${venue}. ${volStr}.${doiStr}`;
      htmlText = `${escapeHtmlBasic(authorsStr)}. ${escapeHtmlBasic(title)}. <em>${escapeHtmlBasic(venue)}</em>. ${escapeHtmlBasic(volStr)}.${escapeHtmlBasic(doiStr)}`;
      break;
    }

    case 'acs': {
      prefix = `(${num})`;
      const volStr = `${year}${vol ? `, ${vol}` : ''}${issue ? ` (${issue})` : ''}${pages ? `, ${pages}` : ''}`;
      const doiStr = doiClean ? ` DOI: ${doiClean}` : doiOrUrl ? ` ${doiOrUrl}` : '';
      citationText = `${authorsStr} ${title}. ${venue} ${volStr}.${doiStr}`;
      htmlText = `${escapeHtmlBasic(authorsStr)} ${escapeHtmlBasic(title)}. <em>${escapeHtmlBasic(venue)}</em> <strong>${escapeHtmlBasic(year)}</strong>${vol ? `, <em>${escapeHtmlBasic(vol)}</em>` : ''}${issue ? ` (${escapeHtmlBasic(issue)})` : ''}${pages ? `, ${escapeHtmlBasic(pages)}` : ''}.${escapeHtmlBasic(doiStr)}`;
      break;
    }

    case 'oscola': {
      prefix = `${num}`;
      const citeTail = `${year ? `(${year})` : ''} ${vol ? `${vol} ` : ''}${venue}${pages ? ` ${pages}` : ''}`;
      const link = doiOrUrl ? ` <${doiOrUrl}>` : '';
      const linkHtml = doiOrUrl ? ` &lt;<a href="${escapeHtmlBasic(doiOrUrl)}">${escapeHtmlBasic(doiOrUrl)}</a>&gt;` : '';
      citationText = `${authorsStr}, '${title}' ${citeTail}${link}.`;
      htmlText = `${escapeHtmlBasic(authorsStr)}, '${escapeHtmlBasic(title)}' ${escapeHtmlBasic(citeTail)}${linkHtml}.`;
      break;
    }

    case 'cse': {
      prefix = `${num}.`;
      const volStr = `${vol ? `${vol}` : ''}${issue ? `(${issue})` : ''}${pages ? `:${pages}` : ''}`;
      const doiStr = doiClean ? ` doi:${doiClean}.` : doiOrUrl ? ` ${doiOrUrl}.` : '';
      citationText = `${authorsStr}. ${year}. ${title}. ${venue}. ${volStr ? `${volStr}.` : ''}${doiStr}`;
      htmlText = `${escapeHtmlBasic(authorsStr)}. ${escapeHtmlBasic(year)}. ${escapeHtmlBasic(title)}. ${escapeHtmlBasic(venue)}. ${volStr ? `${escapeHtmlBasic(volStr)}.` : ''}${escapeHtmlBasic(doiStr)}`;
      break;
    }
  }

  return {
    prefix,
    citationText,
    htmlText,
    inTextParenthetical: formatInTextCitation(article, index, styleId, { narrative: false }),
    inTextNarrative: formatInTextCitation(article, index, styleId, { narrative: true }),
    doiOrUrl,
    sourceTypeLabel,
  };
}
