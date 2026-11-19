import { Article } from '../types';

export type CitationStyleId =
  | 'apa7'
  | 'ieee'
  | 'harvard'
  | 'mla9'
  | 'chicago17'
  | 'chicago_author'
  | 'chicago_notes'
  | 'vancouver'
  | 'nature'
  | 'ama'
  | 'acs'
  | 'asa'
  | 'cse'
  | 'oscola';

export type CitationSourceType =
  | 'auto'
  | 'journal'
  | 'book'
  | 'book_chapter'
  | 'conference'
  | 'website'
  | 'thesis';

export interface CitationStyleDefinition {
  id: CitationStyleId;
  number: number;
  name: string;
  inTextExample: string;
  commonApplication: string;
}

export interface CitationStyleMeta {
  id: CitationStyleId;
  label: string;
  shortLabel: string;
  inlineExample: string;
  description: string;
}

export const CITATION_STYLE_DEFINITIONS: CitationStyleDefinition[] = [
  {
    id: 'apa7',
    number: 1,
    name: 'APA 7th Edition',
    inTextExample: '(Smith et al., 2024)',
    commonApplication: 'Psychology, education, social sciences, environmental & agricultural sciences',
  },
  {
    id: 'mla9',
    number: 2,
    name: 'MLA 9th Edition',
    inTextExample: '(Smith et al. 14)',
    commonApplication: 'Literature, arts, humanities, cultural studies',
  },
  {
    id: 'chicago_author',
    number: 3,
    name: 'Chicago 17th (Author-Date)',
    inTextExample: '(Smith et al. 2024)',
    commonApplication: 'Natural & social sciences, interdisciplinary monographs',
  },
  {
    id: 'chicago_notes',
    number: 4,
    name: 'Chicago 17th (Notes & Bibliography)',
    inTextExample: 'Footnote [1]',
    commonApplication: 'History, philosophy, fine arts, archival humanities',
  },
  {
    id: 'harvard',
    number: 5,
    name: 'Harvard Referencing',
    inTextExample: '(Smith et al. 2024)',
    commonApplication: 'UK, Commonwealth, business, management, economics',
  },
  {
    id: 'ieee',
    number: 6,
    name: 'IEEE Standard',
    inTextExample: '[1]',
    commonApplication: 'Engineering, remote sensing, UAV robotics, computer science',
  },
  {
    id: 'vancouver',
    number: 7,
    name: 'Vancouver (ICMJE)',
    inTextExample: '(1)',
    commonApplication: 'Medicine, clinical health, biomedical & life sciences',
  },
  {
    id: 'ama',
    number: 8,
    name: 'AMA 11th Edition',
    inTextExample: 'Superscript 1',
    commonApplication: 'Medical journals, public health, epidemiology',
  },
  {
    id: 'acs',
    number: 9,
    name: 'ACS (American Chemical Society)',
    inTextExample: '(1) or Superscript 1',
    commonApplication: 'Chemistry, biochemistry, materials science',
  },
  {
    id: 'asa',
    number: 10,
    name: 'ASA (American Sociological Assoc.)',
    inTextExample: '(Smith et al. 2024)',
    commonApplication: 'Sociology, policy, demographic research',
  },
  {
    id: 'cse',
    number: 11,
    name: 'CSE (Council of Science Editors)',
    inTextExample: '(Smith et al. 2024)',
    commonApplication: 'Biology, ecology, agronomy, earth sciences',
  },
  {
    id: 'oscola',
    number: 12,
    name: 'OSCOLA (Legal Citation)',
    inTextExample: 'Footnote [1]',
    commonApplication: 'Law, regulatory policy, environmental governance',
  },
];

export const RECOMMENDED_CITATION_STYLES: CitationStyleMeta[] = [
  {
    id: 'apa7',
    label: 'APA 7th Edition',
    shortLabel: 'APA 7th',
    inlineExample: '(Smith et al., 2024)',
    description: 'Author-date standard for interdisciplinary, agricultural, environmental, and computational sciences.',
  },
  {
    id: 'ieee',
    label: 'IEEE Standard',
    shortLabel: 'IEEE',
    inlineExample: '[1]',
    description: 'Numeric bracketed references standard for remote sensing, UAV engineering, and machine learning.',
  },
  {
    id: 'harvard',
    label: 'Harvard Style',
    shortLabel: 'Harvard',
    inlineExample: '(Smith et al. 2024)',
    description: 'Author-year academic referencing common across UK, Commonwealth, and international journals.',
  },
  {
    id: 'mla9',
    label: 'MLA 9th Edition',
    shortLabel: 'MLA 9th',
    inlineExample: '(Smith et al.)',
    description: 'Author-page humanities and qualitative synthesis referencing format.',
  },
  {
    id: 'chicago17',
    label: 'Chicago 17th (Author-Date)',
    shortLabel: 'Chicago 17th',
    inlineExample: '(Smith et al. 2024)',
    description: 'Comprehensive author-date bibliographic style for monographs and multi-disciplinary reviews.',
  },
  {
    id: 'vancouver',
    label: 'Vancouver (ICMJE)',
    shortLabel: 'Vancouver',
    inlineExample: '(1)',
    description: 'Sequential numbered biomedical and life-sciences citation standard.',
  },
  {
    id: 'nature',
    label: 'Nature / Science Concise',
    shortLabel: 'Nature',
    inlineExample: '[1]',
    description: 'Compact numbered referencing with abbreviated volume and DOI links.',
  },
];

export const IN_TEXT_CITATION_GUIDE = [
  {
    code: 'A',
    title: 'Author-Date Styles (APA 7, Harvard, Chicago Author-Date, ASA)',
    description: 'Places author surname and publication year directly inside the sentence.',
    items: [
      { label: 'Parenthetical (1 author)', example: '(Smith, 2024)' },
      { label: 'Parenthetical (2 authors)', example: '(Smith & Lee, 2024)' },
      { label: 'Parenthetical (3+ authors)', example: '(Smith et al., 2024)' },
      { label: 'Narrative', example: 'Smith et al. (2024) demonstrated...' },
      { label: 'Direct Quote w/ Page', example: '(Smith et al., 2024, p. 12)' },
    ],
  },
  {
    code: 'B',
    title: 'Numeric & Bracketed Styles (IEEE, Vancouver, Nature, AMA, ACS)',
    description: 'Uses sequential reference numbers in the order studies first appear.',
    items: [
      { label: 'IEEE / Nature Bracket', example: 'Edge inference achieved 94% F1 [1], [2].' },
      { label: 'Vancouver Parenthetical', example: 'Diagnostic accuracy improved (1,2).' },
      { label: 'AMA / ACS Superscript', example: 'Reported in field trials.¹' },
    ],
  },
  {
    code: 'C',
    title: 'Author-Page Style (MLA 9th)',
    description: 'Focuses on author surname and page location without comma before year.',
    items: [
      { label: 'Single / Dual Authors', example: '(Smith 42) or (Smith and Lee 42)' },
      { label: 'Three+ Authors', example: '(Smith et al. 42)' },
    ],
  },
  {
    code: 'D',
    title: 'Notes & Bibliography Styles (Chicago Notes, OSCOLA)',
    description: 'Attaches numbered footnotes linked to a complete bottom bibliography.',
    items: [
      { label: 'Footnote Marker', example: '...confirmed via multi-site ground truth.¹' },
      { label: 'Full Note Entry', example: '1. John Smith, "Title," Journal 12 (2024): 45.' },
    ],
  },
];

export const APA7_SOURCE_FORMAT_EXAMPLES = [
  {
    sourceType: 'Journal Article',
    formatExample: 'Author, A. A., & Author, B. B. (Year). Title of article. Journal Name, Volume(Issue), pp–pp. https://doi.org/xxxxx',
  },
  {
    sourceType: 'Conference Paper',
    formatExample: 'Author, A. A. (Year). Title of paper. In Proceedings of Conference Name (pp. xx–xx). Publisher. https://doi.org/xxxxx',
  },
  {
    sourceType: 'Book',
    formatExample: 'Author, A. A. (Year). Title of work: Capital letter also for subtitle (2nd ed.). Publisher.',
  },
  {
    sourceType: 'Book Chapter',
    formatExample: 'Author, A. A. (Year). Title of chapter. In E. E. Editor (Ed.), Title of book (pp. xx–xx). Publisher.',
  },
  {
    sourceType: 'Thesis / Dissertation',
    formatExample: 'Author, A. A. (Year). Title of thesis [Doctoral dissertation, University Name]. Institutional Repository URL.',
  },
  {
    sourceType: 'Website / Technical Report',
    formatExample: 'Organization or Author. (Year, Month Day). Page title. Site Name. https://example.org',
  },
];

export function getCitationStyleDefinition(styleId: CitationStyleId): CitationStyleDefinition {
  const normalized = styleId === 'chicago17' ? 'chicago_author' : styleId === 'nature' ? 'ieee' : styleId;
  return (
    CITATION_STYLE_DEFINITIONS.find((s) => s.id === normalized) ||
    CITATION_STYLE_DEFINITIONS[0]
  );
}

function parseAuthorName(raw: string): { family: string; initials: string; given: string } {
  const s = (raw || 'Unknown Author').trim();
  if (s.includes(',')) {
    const [fam, rest = ''] = s.split(',').map((p) => p.trim());
    const initials = rest
      .split(/[\s.-]+/)
      .filter(Boolean)
      .map((p) => `${p[0].toUpperCase()}.`)
      .join(' ');
    return { family: fam || 'Unknown', initials, given: rest };
  }
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { family: parts[0], initials: '', given: '' };
  }
  const family = parts[parts.length - 1];
  const givenParts = parts.slice(0, -1);
  const initials = givenParts.map((p) => `${p[0].toUpperCase()}.`).join(' ');
  return { family, initials, given: givenParts.join(' ') };
}

function getLeadSurname(authors: string[]): string {
  if (!authors || authors.length === 0) return 'Unknown';
  return parseAuthorName(authors[0]).family;
}

function formatDoiUrl(doi?: string, url?: string): string {
  const cleanDoi = (doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (cleanDoi) return `https://doi.org/${cleanDoi}`;
  return (url || '').trim();
}

function detectSourceType(article: Article, override: CitationSourceType = 'auto'): {
  type: Exclude<CitationSourceType, 'auto'>;
  label: string;
} {
  if (override !== 'auto') {
    const labels: Record<Exclude<CitationSourceType, 'auto'>, string> = {
      journal: 'Journal Article',
      book: 'Book',
      book_chapter: 'Book Chapter',
      conference: 'Conference Paper',
      website: 'Web Source',
      thesis: 'Thesis / Dissertation',
    };
    return { type: override, label: labels[override] };
  }
  const j = `${article.journal || ''} ${article.paperSubType || ''}`.toLowerCase();
  if (j.includes('proceeding') || j.includes('conference') || j.includes('symposium') || j.includes('workshop')) {
    return { type: 'conference', label: 'Conference Paper' };
  }
  if (j.includes('thesis') || j.includes('dissertation')) {
    return { type: 'thesis', label: 'Thesis / Dissertation' };
  }
  if (j.includes('chapter') || j.includes('handbook')) {
    return { type: 'book_chapter', label: 'Book Chapter' };
  }
  if (j.includes('book') && !j.includes('journal')) {
    return { type: 'book', label: 'Book' };
  }
  if (!article.journal && article.url && !article.doi) {
    return { type: 'website', label: 'Web Source' };
  }
  return { type: 'journal', label: 'Journal Article' };
}

export function formatInlineCitation(
  article: Article,
  style: CitationStyleId,
  indexOneBased: number
): string {
  const authors = article.authors && article.authors.length > 0 ? article.authors : ['Unknown'];
  const lead = getLeadSurname(authors);
  const second = authors.length > 1 ? getLeadSurname([authors[1]]) : '';
  const year = article.year || 'n.d.';

  switch (style) {
    case 'ieee':
    case 'nature':
    case 'chicago_notes':
    case 'oscola':
      return `[${indexOneBased}]`;
    case 'vancouver':
    case 'ama':
    case 'acs':
      return `(${indexOneBased})`;
    case 'mla9':
      if (authors.length === 1) return `(${lead})`;
      if (authors.length === 2) return `(${lead} and ${second})`;
      return `(${lead} et al.)`;
    case 'harvard':
    case 'chicago17':
    case 'chicago_author':
    case 'asa':
    case 'cse':
      if (authors.length === 1) return `(${lead} ${year})`;
      if (authors.length === 2) return `(${lead} & ${second} ${year})`;
      return `(${lead} et al. ${year})`;
    case 'apa7':
    default:
      if (authors.length === 1) return `(${lead}, ${year})`;
      if (authors.length === 2) return `(${lead} & ${second}, ${year})`;
      return `(${lead} et al., ${year})`;
  }
}

export function formatReferenceString(
  article: Article,
  style: CitationStyleId,
  indexOneBased: number
): string {
  const rawAuthors = article.authors && article.authors.length > 0 ? article.authors : ['Unknown Author'];
  const parsed = rawAuthors.map(parseAuthorName);
  const year = article.year || 'n.d.';
  const title = (article.title || 'Untitled Study').replace(/\.+$/, '').trim();
  const journal = (article.journal || 'Academic Venue').trim();
  const volIssue = article.volume
    ? article.issue
      ? `${article.volume}(${article.issue})`
      : `${article.volume}`
    : '';
  const pages = article.pagesStr ? article.pagesStr.trim() : '';
  const doiUrl = formatDoiUrl(article.doi, article.url);
  const cleanDoi = (article.doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');

  switch (style) {
    case 'ieee': {
      const ieeeAuthors = parsed
        .slice(0, 6)
        .map((a) => `${a.initials ? `${a.initials} ` : ''}${a.family}`.trim())
        .join(', ');
      const suffixAuthors = rawAuthors.length > 6 ? `${ieeeAuthors}, et al.` : ieeeAuthors;
      const loc = [
        article.volume ? `vol. ${article.volume}` : '',
        article.issue ? `no. ${article.issue}` : '',
        pages ? `pp. ${pages}` : '',
        String(year),
      ]
        .filter(Boolean)
        .join(', ');
      return `[${indexOneBased}] ${suffixAuthors}, "${title}," *${journal}*, ${loc}.${cleanDoi ? ` doi: ${cleanDoi}.` : doiUrl ? ` Available: ${doiUrl}` : ''}`;
    }

    case 'harvard': {
      const harvAuthors = parsed
        .slice(0, 6)
        .map((a) => `${a.family}${a.initials ? `, ${a.initials}` : ''}`)
        .join(', ');
      const authStr = rawAuthors.length > 6 ? `${getLeadSurname(rawAuthors)} et al.` : harvAuthors;
      const loc = [volIssue, pages ? `pp. ${pages}` : ''].filter(Boolean).join(', ');
      return `${authStr} (${year}) '${title}', *${journal}*${loc ? `, ${loc}` : ''}.${doiUrl ? ` Available at: ${doiUrl}.` : ''}`;
    }

    case 'mla9': {
      const first = parsed[0];
      const firstStr = `${first.family}${first.given ? `, ${first.given}` : ''}`;
      let authStr = firstStr;
      if (rawAuthors.length === 2) {
        const second = parsed[1];
        authStr = `${firstStr}, and ${second.given ? `${second.given} ` : ''}${second.family}`.trim();
      } else if (rawAuthors.length >= 3) {
        authStr = `${firstStr}, et al.`;
      }
      const loc = [
        article.volume ? `vol. ${article.volume}` : '',
        article.issue ? `no. ${article.issue}` : '',
        String(year),
        pages ? `pp. ${pages}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      return `${authStr}. "${title}." *${journal}*, ${loc}.${doiUrl ? ` ${doiUrl}.` : ''}`;
    }

    case 'chicago17':
    case 'chicago_author':
    case 'chicago_notes':
    case 'asa':
    case 'oscola': {
      const first = parsed[0];
      const firstStr = `${first.family}${first.given ? `, ${first.given}` : ''}`;
      const restStr = parsed
        .slice(1, 6)
        .map((a) => `${a.given ? `${a.given} ` : ''}${a.family}`.trim());
      let authStr = firstStr;
      if (restStr.length === 1) authStr = `${firstStr}, and ${restStr[0]}`;
      else if (restStr.length > 1) {
        const tail = restStr.pop();
        authStr = `${firstStr}, ${restStr.join(', ')}, and ${tail}${rawAuthors.length > 6 ? ', et al.' : ''}`;
      }
      const volStr = volIssue ? ` ${volIssue}` : '';
      const pgStr = pages ? `: ${pages}` : '';
      return `${authStr}. ${year}. "${title}." *${journal}*${volStr}${pgStr}.${doiUrl ? ` ${doiUrl}.` : ''}`;
    }

    case 'vancouver':
    case 'ama':
    case 'cse': {
      const vanAuthors = parsed
        .slice(0, 6)
        .map((a) => `${a.family} ${a.initials.replace(/[.\s]/g, '')}`.trim())
        .join(', ');
      const authStr = rawAuthors.length > 6 ? `${vanAuthors}, et al` : vanAuthors;
      const loc = [
        String(year),
        volIssue ? `;${volIssue}` : '',
        pages ? `:${pages}` : '',
      ].join('');
      return `${indexOneBased}. ${authStr}. ${title}. ${journal}. ${loc}.${cleanDoi ? ` doi:${cleanDoi}` : ''}`;
    }

    case 'nature':
    case 'acs': {
      const natAuthors = parsed
        .slice(0, 5)
        .map((a) => `${a.family}, ${a.initials}`.trim())
        .join(', ');
      const authStr = rawAuthors.length > 5 ? `${parsed[0].family}, ${parsed[0].initials} et al.` : natAuthors;
      return `[${indexOneBased}] ${authStr} ${title}. *${journal}*${article.volume ? ` **${article.volume}**` : ''}${pages ? `, ${pages}` : ''} (${year}).${doiUrl ? ` ${doiUrl}` : ''}`;
    }

    case 'apa7':
    default: {
      const apaList = parsed.slice(0, 19).map((a) => `${a.family}${a.initials ? `, ${a.initials}` : ''}`);
      let authStr = apaList[0];
      if (apaList.length === 2) {
        authStr = `${apaList[0]}, & ${apaList[1]}`;
      } else if (apaList.length > 2 && rawAuthors.length <= 20) {
        const last = apaList.pop();
        authStr = `${apaList.join(', ')}, & ${last}`;
      } else if (rawAuthors.length > 20) {
        authStr = `${apaList.join(', ')}, ... ${parsed[parsed.length - 1].family}, ${parsed[parsed.length - 1].initials}`;
      }
      const loc = [volIssue, pages].filter(Boolean).join(', ');
      return `${authStr} (${year}). ${title}. *${journal}*${loc ? `, ${loc}` : ''}.${doiUrl ? ` ${doiUrl}` : ''}`;
    }
  }
}

export interface FormattedReferenceResult {
  prefix: string;
  citationText: string;
  htmlText: string;
  doiOrUrl: string;
  sourceTypeLabel: string;
  inTextParenthetical: string;
  inTextNarrative: string;
}

export function formatReferenceEntry(
  article: Article,
  indexZeroBased: number,
  style: CitationStyleId,
  sourceType: CitationSourceType = 'auto'
): FormattedReferenceResult {
  const idx1 = indexZeroBased + 1;
  const rawString = formatReferenceString(article, style, idx1);
  // Strip optional leading numeric prefix so prefix & body don't duplicate
  const strippedBody = rawString.replace(/^(\[\d+\]\s+|\d+\.\s+)/, '').trim();
  const isNumeric = ['ieee', 'nature', 'vancouver', 'ama', 'acs', 'chicago_notes', 'oscola'].includes(style);
  const prefix = style === 'ieee' || style === 'nature' ? `[${idx1}]` : isNumeric ? `${idx1}.` : `[${idx1}]`;
  const plainText = strippedBody.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
  const htmlText = strippedBody
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  const authors = article.authors && article.authors.length > 0 ? article.authors : ['Unknown'];
  const lead = getLeadSurname(authors);
  const year = article.year || 'n.d.';
  const paren = formatInlineCitation(article, style, idx1);
  const narrative = isNumeric
    ? `${lead}${authors.length > 2 ? ' et al.' : ''} ${paren}`
    : `${lead}${authors.length > 2 ? ' et al.' : ''} (${year})`;

  const srcMeta = detectSourceType(article, sourceType);
  const doiOrUrl = formatDoiUrl(article.doi, article.url);

  return {
    prefix,
    citationText: plainText,
    htmlText,
    doiOrUrl,
    sourceTypeLabel: srcMeta.label,
    inTextParenthetical: paren,
    inTextNarrative: narrative,
  };
}

export function formatBibTexEntries(articles: Article[]): string {
  return articles
    .map((a, idx) => {
      const lead = getLeadSurname(a.authors).replace(/[^a-zA-Z0-9]/g, '') || 'Study';
      return `@article{${lead}${a.year || '2024'}_${idx + 1},
  title = {${(a.title || '').replace(/[{}]/g, '')}},
  author = {${(a.authors || ['Unknown']).join(' and ')}},
  journal = {${(a.journal || 'Academic Venue').replace(/[{}]/g, '')}},
  year = {${a.year || ''}},
  volume = {${a.volume || ''}},
  number = {${a.issue || ''}},
  pages = {${a.pagesStr || ''}},
  doi = {${(a.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}},
  url = {${a.url || a.pdfUrl || ''}}
}`;
    })
    .join('\n\n');
}

export function buildGroundedArticleTextSource(
  article: Article,
  style: CitationStyleId,
  indexOneBased: number
): string {
  const inline = formatInlineCitation(article, style, indexOneBased);
  const fullRef = formatReferenceString(article, style, indexOneBased);
  const ed = article.extractedData;
  const lines: string[] = [
    `# Source [${indexOneBased}] ${inline} — ${article.title}`,
    ``,
    `- **Formatted Citation (${style.toUpperCase()}):** ${fullRef}`,
    `- **Authors:** ${(article.authors || []).join(', ') || 'Unknown'}`,
    `- **Year:** ${article.year || 'N/A'}`,
    `- **Journal / Venue:** ${article.journal || 'N/A'}`,
    `- **DOI:** ${article.doi || 'N/A'}`,
    `- **Source Database:** ${article.sourceDatabase || 'Library'}`,
    `- **Original File / PDF Link:** ${article.sourceFileName || article.pdfUrl || article.openAccessUrl || article.url || 'Metadata record'}`,
    `- **Screening Decision:** ${article.decision} (${article.screeningStage})`,
  ];

  if (article.paperCategory || article.paperSubType) {
    lines.push(`- **Study Classification:** ${article.paperCategory || ''} ${article.paperSubType ? `(${article.paperSubType})` : ''}`.trim());
  }
  if (article.appraisalScore !== undefined || article.riskOfBiasAssessment) {
    lines.push(`- **Quality Appraisal / Risk of Bias:** ${article.appraisalScore ?? 'N/A'}/13 · RoB: ${article.riskOfBiasAssessment || 'N/A'}`);
  }

  lines.push('', '## Abstract', article.abstract || 'No abstract available.');

  if (ed) {
    const rawPairs: Array<[string, string | undefined]> = [
      ['Study Type', ed.studyType],
      ['Platform', ed.platform],
      ['Sensor', ed.sensor],
      ['Spatial Resolution (GSD)', ed.gsd],
      ['Altitude', ed.altitude],
      ['Spectral Bands', ed.spectralBands],
      ['Algorithms / Models', ed.algorithm],
      ['Latency', ed.latency],
      ['Ground Truth / Validation', ed.groundTruth],
      ['Spatial Leakage Addressed', ed.spatialLeakageAddressed !== undefined ? String(ed.spatialLeakageAddressed) : undefined],
      ['Evaluation Metrics / Accuracy', ed.effectSizeOrAccuracy || ed.metrics],
      ['Sample Size', ed.sampleSize],
      ['Study Region', ed.geographicRegion],
      ['Key Findings', ed.keyFindings],
      ['Limitations', ed.limitations],
      ['Software Tools', ed.softwareTools],
    ];
    const extractedPairs = rawPairs.filter((pair): pair is [string, string] => Boolean(pair[1] && String(pair[1]).trim() !== ''));

    if (extractedPairs.length > 0) {
      lines.push('', '## Extracted Study Parameters');
      extractedPairs.forEach(([k, v]) => lines.push(`- **${k}:** ${v}`));
    }
  }

  if (article.evidenceCitations && article.evidenceCitations.length > 0) {
    lines.push('', '## Pinned Page-Level Evidence Citations');
    article.evidenceCitations.forEach((ev) => {
      lines.push(`- **Page ${ev.pageNumber} (${ev.section}):** "${ev.quote}" — *Relevance:* ${ev.relevance}`);
    });
  }

  if (article.pages && article.pages.length > 0) {
    lines.push('', '## Full-Text Pages');
    article.pages.forEach((p) => {
      lines.push(`### Page ${p.pageNumber}`, p.content || '', '');
    });
  } else if (article.fullText && article.fullText.trim().length > 0) {
    lines.push('', '## Extracted Full Text', article.fullText.trim());
  }

  return lines.join('\n');
}
