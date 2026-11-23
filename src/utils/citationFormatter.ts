import {
  Article,
  CitationAuditEntry,
  CitationVerificationStatus,
  MetadataFieldProvenance,
  MetadataFieldSource,
  PublicationStatus,
  PublicationType,
} from '../types';

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
  | 'journal_article'
  | 'book'
  | 'book_chapter'
  | 'conference'
  | 'conference_paper'
  | 'website'
  | 'web_publication'
  | 'thesis'
  | 'thesis_dissertation'
  | 'report'
  | 'government_publication'
  | 'preprint'
  | 'unpublished_manuscript';

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
      { label: 'No Author (APA 7)', example: '("Shortened Article Title," 2024)' },
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
    formatExample: 'Author, A. A., & Author, B. B. (Year). Title of article in sentence case. Journal Name, Volume(Issue), pp–pp. https://doi.org/xxxxx',
  },
  {
    sourceType: 'Book',
    formatExample: 'Author, A. A. (Year). Title of work: Capital letter also for subtitle (2nd ed.). Publisher. https://doi.org/xxxxx',
  },
  {
    sourceType: 'Book Chapter',
    formatExample: 'Author, A. A. (Year). Title of chapter in sentence case. In E. E. Editor (Ed.), Title of book (pp. xx–xx). Publisher. https://doi.org/xxxxx',
  },
  {
    sourceType: 'Conference Paper',
    formatExample: 'Author, A. A. (Year). Title of paper in sentence case. Proceedings of Conference Name, pp–pp. Publisher. https://doi.org/xxxxx',
  },
  {
    sourceType: 'Thesis / Dissertation',
    formatExample: 'Author, A. A. (Year). Title of thesis [Doctoral dissertation, University Name]. Repository URL',
  },
  {
    sourceType: 'Technical / Institutional Report',
    formatExample: 'Organization or Author. (Year). Title of report (Report No. 123). Publisher or Agency. https://example.org',
  },
  {
    sourceType: 'Government Publication',
    formatExample: 'Government Agency. (Year). Title of publication (Publication No. 45). U.S. Government Publishing Office or URL',
  },
  {
    sourceType: 'Preprint',
    formatExample: 'Author, A. A. (Year). Title of preprint. Preprint Archive (e.g., arXiv / bioRxiv). https://doi.org/xxxxx',
  },
  {
    sourceType: 'Unpublished Manuscript',
    formatExample: 'Author, A. A. (Year). Title of manuscript [Unpublished manuscript or Manuscript submitted for publication]. Department, University.',
  },
  {
    sourceType: 'Web Publication',
    formatExample: 'Author or Organization. (Year, Month Day). Title of page. Site Name. https://example.org',
  },
];

export function getCitationStyleDefinition(styleId: CitationStyleId): CitationStyleDefinition {
  const normalized = styleId === 'chicago17' ? 'chicago_author' : styleId === 'nature' ? 'ieee' : styleId;
  return (
    CITATION_STYLE_DEFINITIONS.find((s) => s.id === normalized) ||
    CITATION_STYLE_DEFINITIONS[0]
  );
}

// ---------------------------------------------------------------------------
// Strict Placeholder Detection & Sanitization (Zero Fabricated Placeholders)
// ---------------------------------------------------------------------------
const PLACEHOLDER_AUTHOR_PATTERNS = [
  /^unknown$/i,
  /^unknown\s+author$/i,
  /^author\s+unknown$/i,
  /^author\s+pending\s+sync$/i,
  /^pending\s+sync$/i,
  /^authors?\s+not\s+(reported|specified|provided|available)/i,
  /^no\s+author/i,
  /^n\/?a$/i,
  /^none$/i,
  /^anonymous$/i,
  /^arxiv\s+author$/i,
  /^et\s+al\.?$/i,
];

const PLACEHOLDER_VENUE_PATTERNS = [
  /^local\s+source\s+file$/i,
  /^local\s+file$/i,
  /^local\s+drive\s+file$/i,
  /^academic\s+venue$/i,
  /^academic\s+publication$/i,
  /^academic\s+journal$/i,
  /^scientific\s+paper$/i,
  /^scientific\s+journal$/i,
  /^journal\s+article$/i,
  /^research\s+paper$/i,
  /^publication\s+venue\s+not\s+specified$/i,
  /^not\s+specified$/i,
  /^unknown(\s+journal|\s+venue|\s+source)?$/i,
  /^n\/?a$/i,
  /^none$/i,
];

const PLACEHOLDER_TITLE_PATTERNS = [
  /^untitled(\s+study|\s+paper|\s+document)?$/i,
  /^no\s+title$/i,
  /^n\/?a$/i,
  /\.(eps|png|jpg|jpeg|svg|gif)$/i,
];

const CORPORATE_AUTHOR_REGEX =
  /\b(organization|organisation|institute|university|college|department|ministry|agency|commission|authority|committee|consortium|foundation|association|society|center|centre|bureau|survey|laboratory|council|program|programme|board|office|world\s+health|fao|unesco|unep|ipcc|nasa|noaa|usgs|ieee)\b/i;

export function isPlaceholderAuthor(raw?: string | null): boolean {
  const s = (raw || '').trim();
  if (!s || s.length < 2) return true;
  return PLACEHOLDER_AUTHOR_PATTERNS.some((re) => re.test(s));
}

export function isPlaceholderVenue(raw?: string | null): boolean {
  const s = (raw || '').trim();
  if (!s || s.length < 2) return true;
  if (/\.(pdf|docx?|txt|csv|bib|ris)$/i.test(s)) return true;
  return PLACEHOLDER_VENUE_PATTERNS.some((re) => re.test(s));
}

export function isPlaceholderTitle(raw?: string | null): boolean {
  const s = (raw || '').trim();
  if (!s || s.length < 3) return true;
  return PLACEHOLDER_TITLE_PATTERNS.some((re) => re.test(s));
}

export function isCorporateAuthor(raw: string): boolean {
  const s = raw.trim();
  if (!s || s.includes(',')) return CORPORATE_AUTHOR_REGEX.test(s);
  return CORPORATE_AUTHOR_REGEX.test(s);
}

export function sanitizeAuthorsList(authors?: string[] | null): string[] {
  if (!Array.isArray(authors)) return [];
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const a of authors) {
    const t = String(a || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t || isPlaceholderAuthor(t)) continue;
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      cleaned.push(t);
    }
  }
  return cleaned;
}

export function normalizeValidDoi(rawDoi?: string | null): string | null {
  if (!rawDoi) return null;
  let cleaned = String(rawDoi).trim();
  if (!cleaned || /^(n\/?a|none|null|undefined|-)$/i.test(cleaned)) return null;
  cleaned = cleaned
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/[.,;)\]]+$/, '')
    .trim();
  // Genuine DOI syntax per DOI Handbook: 10.<registrant >= 4 digits>/<suffix with at least 1 non-space char>
  if (!/^10\.\d{4,9}\/[^\s<>"']+$/i.test(cleaned)) return null;
  // Reject trailing empty/incomplete paths like 10.1000/ or N/A
  const slashIdx = cleaned.indexOf('/');
  const suffix = cleaned.slice(slashIdx + 1);
  if (!suffix || /^(n\/?a|none|null)$/i.test(suffix)) return null;
  return cleaned;
}

export function formatDoiUrl(doi?: string | null, url?: string | null): string {
  const validDoi = normalizeValidDoi(doi);
  if (validDoi) return `https://doi.org/${validDoi}`;
  const cleanUrl = (url || '').trim();
  if (
    cleanUrl &&
    /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(cleanUrl) &&
    !/^https?:\/\/(dx\.)?doi\.org\/?$/i.test(cleanUrl)
  ) {
    return cleanUrl;
  }
  return '';
}

function normalizeValidUrl(url?: string | null): string | null {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl) return null;
  if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(cleanUrl)) return null;
  if (/^https?:\/\/(dx\.)?doi\.org\/?$/i.test(cleanUrl)) return null;
  return cleanUrl;
}

function sanitizeYear(rawYear?: number | string | null): number | null {
  if (rawYear === null || rawYear === undefined || rawYear === '') return null;
  const num = typeof rawYear === 'number' ? rawYear : parseInt(String(rawYear).trim(), 10);
  const currentMax = new Date().getFullYear() + 2;
  if (!Number.isFinite(num) || num < 1800 || num > currentMax) return null;
  return num;
}

function normalizePageRange(rawPages?: string | null): string {
  const p = (rawPages || '').trim();
  if (!p) return '';
  // Normalize hyphen between page numbers/tokens into APA en-dash
  return p.replace(/([0-9A-Za-z])\s*-\s*([0-9A-Za-z])/g, '$1–$2');
}

// ---------------------------------------------------------------------------
// APA 7th Edition Sentence Case Converter (Preserving Acronyms & Proper Nouns)
// ---------------------------------------------------------------------------
const PRESERVED_PROPER_TERMS = new Map<string, string>([
  ['ethiopia', 'Ethiopia'],
  ['ethiopian', 'Ethiopian'],
  ['amhara', 'Amhara'],
  ['oromia', 'Oromia'],
  ['tigray', 'Tigray'],
  ['gumara', 'Gumara'],
  ['tana', 'Tana'],
  ['nile', 'Nile'],
  ['africa', 'Africa'],
  ['african', 'African'],
  ['europe', 'Europe'],
  ['european', 'European'],
  ['asia', 'Asia'],
  ['asian', 'Asian'],
  ['china', 'China'],
  ['chinese', 'Chinese'],
  ['brazil', 'Brazil'],
  ['brazilian', 'Brazilian'],
  ['iran', 'Iran'],
  ['iranian', 'Iranian'],
  ['india', 'India'],
  ['indian', 'Indian'],
  ['usa', 'USA'],
  ['uk', 'UK'],
  ['python', 'Python'],
  ['matlab', 'MATLAB'],
  ['sentinel', 'Sentinel'],
  ['landsat', 'Landsat'],
  ['modis', 'MODIS'],
  ['earth', 'Earth'],
  ['google', 'Google'],
  ['bayesian', 'Bayesian'],
  ['gaussian', 'Gaussian'],
  ['markov', 'Markov'],
  ['shannon', 'Shannon'],
  ['pearson', 'Pearson'],
  ['spearman', 'Spearman'],
  ['fisher', 'Fisher'],
  ['mann', 'Mann'],
  ['kendall', 'Kendall'],
  ['cochran', 'Cochran'],
  ['prisma', 'PRISMA'],
  ['picoc', 'PICOC'],
  ['monte', 'Monte'],
  ['carlo', 'Carlo'],
  ['resnet', 'ResNet'],
  ['xgboost', 'XGBoost'],
  ['lightgbm', 'LightGBM'],
  ['catboost', 'CatBoost'],
  ['pytorch', 'PyTorch'],
  ['tensorflow', 'TensorFlow'],
  ['arcgis', 'ArcGIS'],
  ['qgis', 'QGIS'],
  ['yolo', 'YOLO'],
  ['yolov8', 'YOLOv8'],
  ['yolov5', 'YOLOv5'],
  ['unet', 'U-Net'],
  ['lidar', 'LiDAR'],
  ['covid', 'COVID'],
]);

function preserveOrLowerWord(word: string, forceCapitalize: boolean): string {
  if (!word) return word;
  // Separate leading/trailing punctuation
  const match = word.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/);
  if (!match) return word;
  const [, leadPunct, core, trailPunct] = match;
  if (!core) return word;

  // Handle hyphenated compound inside word recursively
  if (core.includes('-') && !/^COVID-19$/i.test(core)) {
    const subParts = core.split('-').map((part, idx) =>
      preserveOrLowerWord(part, forceCapitalize && idx === 0)
    );
    return `${leadPunct}${subParts.join('-')}${trailPunct}`;
  }

  const lower = core.toLowerCase();
  const knownProper = PRESERVED_PROPER_TERMS.get(lower);
  if (knownProper) {
    return `${leadPunct}${knownProper}${trailPunct}`;
  }

  // Roman numerals (e.g., II, III, IV) if <= 4 chars all uppercase
  if (/^[IVXLCDM]{2,4}$/.test(core)) {
    return `${leadPunct}${core}${trailPunct}`;
  }

  // Known acronym or alphanumeric model token (UAV, CNN, R2, F1, 1D, 2D, 3D, NDVI, GIS, DEM, SAR, ALOS)
  if (
    /^[A-Z]{2,}[0-9]*$/.test(core) ||
    /^[A-Z][0-9]+[A-Za-z0-9]*$/.test(core) ||
    /^[0-9]+[A-Z][A-Za-z0-9]*$/.test(core)
  ) {
    return `${leadPunct}${core}${trailPunct}`;
  }

  // Intentional inner-caps / camelCase product names (e.g. GeoJSON, AutoML, DeepLab) when title isn't ALL-CAPS
  if (/[a-z][A-Z]/.test(core)) {
    return `${leadPunct}${core}${trailPunct}`;
  }

  if (forceCapitalize) {
    return `${leadPunct}${lower.charAt(0).toUpperCase()}${lower.slice(1)}${trailPunct}`;
  }
  return `${leadPunct}${lower}${trailPunct}`;
}

export function toApaSentenceCase(rawTitle: string): string {
  const clean = (rawTitle || '').replace(/\s+/g, ' ').replace(/\.+$/, '').trim();
  if (!clean) return '';

  // Detect whether title is ALL CAPS (if >= 80% of letters are uppercase, lowercase first)
  const letters = clean.replace(/[^A-Za-z]/g, '');
  const upperCount = (clean.match(/[A-Z]/g) || []).length;
  const isAllCaps = letters.length > 8 && upperCount / letters.length > 0.85;

  const tokens = clean.split(' ');
  let capNext = true;
  const out = tokens.map((tok, index) => {
    const forceCap = index === 0 || capNext;
    const processed = isAllCaps
      ? preserveOrLowerWord(tok.toLowerCase(), forceCap)
      : preserveOrLowerWord(tok, forceCap);

    // Capitalize first word after colon, question mark, exclamation mark, or em/en-dash separator
    capNext = /[:?!—–]$/.test(tok) || tok === '—' || tok === '–' || tok === '-';
    return processed;
  });

  return out.join(' ');
}

// ---------------------------------------------------------------------------
// Author Name Parsing & Formatting Helpers
// ---------------------------------------------------------------------------
const NAME_PARTICLES = new Set([
  'van',
  'von',
  'der',
  'den',
  'de',
  'del',
  'della',
  'di',
  'da',
  'dos',
  'das',
  'la',
  'le',
  'du',
  'al',
  'el',
  'ibn',
  'bin',
]);

export interface ParsedAuthor {
  raw: string;
  isCorporate: boolean;
  family: string;
  initials: string;
  given: string;
}

function buildInitials(givenStr: string): string {
  const tokens = givenStr
    .replace(/\./g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return tokens
    .map((tok) => {
      if (tok.includes('-')) {
        return tok
          .split('-')
          .filter(Boolean)
          .map((sub) => `${sub[0].toUpperCase()}.`)
          .join('-');
      }
      // Handle compact initials like "JM" -> "J. M." unless already multi-letter name
      if (tok.length <= 3 && tok === tok.toUpperCase() && /^[A-Z]+$/.test(tok)) {
        return tok
          .split('')
          .map((ch) => `${ch}.`)
          .join(' ');
      }
      return `${tok[0].toUpperCase()}.`;
    })
    .join(' ');
}

export function parseAuthorName(raw: string): ParsedAuthor {
  const s = (raw || '').replace(/\s+/g, ' ').trim();
  if (!s || isPlaceholderAuthor(s)) {
    return { raw: '', isCorporate: false, family: '', initials: '', given: '' };
  }

  if (isCorporateAuthor(s)) {
    return { raw: s, isCorporate: true, family: s, initials: '', given: '' };
  }

  if (s.includes(',')) {
    const [fam, rest = ''] = s.split(',').map((p) => p.trim());
    const givenClean = rest.trim();
    const initials = givenClean ? buildInitials(givenClean) : '';
    return { raw: s, isCorporate: false, family: fam, initials, given: givenClean };
  }

  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { raw: s, isCorporate: false, family: parts[0], initials: '', given: '' };
  }

  // Handle "LASTNAME FM" or "LASTNAME F. M." style exported by PubMed/Scopus without comma
  if (parts.length === 2 && /^[A-Z]{1,3}$/.test(parts[1])) {
    const initials = buildInitials(parts[1]);
    return { raw: s, isCorporate: false, family: parts[0], initials, given: parts[1] };
  }

  // Detect particles before final surname (e.g., "van der Waals")
  let familyStartIdx = parts.length - 1;
  while (familyStartIdx > 1 && NAME_PARTICLES.has(parts[familyStartIdx - 1].toLowerCase())) {
    familyStartIdx--;
  }
  const family = parts.slice(familyStartIdx).join(' ');
  const givenParts = parts.slice(0, familyStartIdx);
  const given = givenParts.join(' ');
  const initials = buildInitials(given);
  return { raw: s, isCorporate: false, family, initials, given };
}

function getLeadSurname(authors: string[]): string {
  const valid = sanitizeAuthorsList(authors);
  if (valid.length === 0) return '';
  return parseAuthorName(valid[0]).family;
}

function formatApaAuthorToken(a: ParsedAuthor): string {
  if (a.isCorporate) return a.family;
  return a.initials ? `${a.family}, ${a.initials}` : a.family;
}

function formatApaAuthorList(parsed: ParsedAuthor[]): string {
  if (parsed.length === 0) return '';
  if (parsed.length === 1) return formatApaAuthorToken(parsed[0]);
  if (parsed.length === 2) {
    return `${formatApaAuthorToken(parsed[0])}, & ${formatApaAuthorToken(parsed[1])}`;
  }
  if (parsed.length <= 20) {
    const head = parsed.slice(0, -1).map(formatApaAuthorToken);
    const tail = formatApaAuthorToken(parsed[parsed.length - 1]);
    return `${head.join(', ')}, & ${tail}`;
  }
  // APA 7 rule for 21+ authors: list first 19, then ellipsis '...', then final author (no '&')
  const first19 = parsed.slice(0, 19).map(formatApaAuthorToken);
  const last = formatApaAuthorToken(parsed[parsed.length - 1]);
  return `${first19.join(', ')}, ... ${last}`;
}

function formatApaEditors(editors: string[]): string {
  const parsed = sanitizeAuthorsList(editors).map(parseAuthorName);
  if (parsed.length === 0) return '';
  const fmt = (a: ParsedAuthor) =>
    a.isCorporate ? a.family : `${a.initials ? `${a.initials} ` : ''}${a.family}`.trim();
  if (parsed.length === 1) return `${fmt(parsed[0])} (Ed.)`;
  if (parsed.length === 2) return `${fmt(parsed[0])} & ${fmt(parsed[1])} (Eds.)`;
  const head = parsed.slice(0, -1).map(fmt);
  const tail = fmt(parsed[parsed.length - 1]);
  return `${head.join(', ')}, & ${tail} (Eds.)`;
}

// ---------------------------------------------------------------------------
// Source / Publication Type Detection & Metadata Validation + Provenance Engine
// ---------------------------------------------------------------------------
function mapLegacySourceType(sourceType: CitationSourceType): PublicationType {
  switch (sourceType) {
    case 'journal':
    case 'journal_article':
      return 'journal_article';
    case 'book':
      return 'book';
    case 'book_chapter':
      return 'book_chapter';
    case 'conference':
    case 'conference_paper':
      return 'conference_paper';
    case 'website':
    case 'web_publication':
      return 'web_publication';
    case 'thesis':
    case 'thesis_dissertation':
      return 'thesis_dissertation';
    case 'report':
      return 'report';
    case 'government_publication':
      return 'government_publication';
    case 'preprint':
      return 'preprint';
    case 'unpublished_manuscript':
      return 'unpublished_manuscript';
    default:
      return 'auto';
  }
}

export const PUBLICATION_TYPE_LABELS: Record<Exclude<PublicationType, 'auto'>, string> = {
  journal_article: 'Journal Article',
  book: 'Book',
  book_chapter: 'Book Chapter',
  conference_paper: 'Conference Paper',
  thesis_dissertation: 'Thesis / Dissertation',
  report: 'Report',
  government_publication: 'Government Publication',
  preprint: 'Preprint',
  unpublished_manuscript: 'Unpublished Manuscript',
  web_publication: 'Web Publication',
};

export function detectPublicationType(
  article: Article,
  override: CitationSourceType = 'auto'
): {
  type: Exclude<PublicationType, 'auto'>;
  label: string;
} {
  const mappedOverride = mapLegacySourceType(override);
  if (mappedOverride !== 'auto') {
    return { type: mappedOverride, label: PUBLICATION_TYPE_LABELS[mappedOverride] };
  }
  if (article.publicationType && article.publicationType !== 'auto') {
    const t = article.publicationType;
    return { type: t, label: PUBLICATION_TYPE_LABELS[t] };
  }

  if (article.publicationStatus === 'unpublished' || article.publicationStatus === 'submitted') {
    return { type: 'unpublished_manuscript', label: PUBLICATION_TYPE_LABELS.unpublished_manuscript };
  }

  const combined = `${article.journal || ''} ${article.paperSubType || ''} ${article.sourceDatabase || ''} ${article.publisher || ''} ${article.url || ''}`.toLowerCase();

  if (
    article.bookTitle ||
    (article.editors && article.editors.length > 0) ||
    /\b(chapter|incollection|handbook)\b/.test(combined)
  ) {
    return { type: 'book_chapter', label: PUBLICATION_TYPE_LABELS.book_chapter };
  }
  if (/\b(preprint|arxiv|biorxiv|medrxiv|ssrn|osf preprints|chemrxiv|eartharxiv|essoar)\b/.test(combined)) {
    return { type: 'preprint', label: PUBLICATION_TYPE_LABELS.preprint };
  }
  if (/\b(thesis|dissertation|phd|master's|msc|m\.sc)\b/.test(combined)) {
    return { type: 'thesis_dissertation', label: PUBLICATION_TYPE_LABELS.thesis_dissertation };
  }
  if (/\b(unpublished manuscript|manuscript submitted)\b/.test(combined)) {
    return { type: 'unpublished_manuscript', label: PUBLICATION_TYPE_LABELS.unpublished_manuscript };
  }
  if (/\b(government|federal|u\.s\.|ministry|parliament|public law|statute|epa|usda|usgs|who|fao)\b/.test(combined) && !article.volume) {
    return { type: 'government_publication', label: PUBLICATION_TYPE_LABELS.government_publication };
  }
  if (article.reportNumber || /\b(technical report|research report|working paper|policy brief|white paper)\b/.test(combined)) {
    return { type: 'report', label: PUBLICATION_TYPE_LABELS.report };
  }
  if (/\b(proceeding|conference|symposium|workshop|congress|icassp|cvpr|igarss|neurips|icml)\b/.test(combined)) {
    return { type: 'conference_paper', label: PUBLICATION_TYPE_LABELS.conference_paper };
  }
  if (/\bmonograph\b|\bbook\b/.test(combined) && !/\bjournal\b/.test(combined)) {
    return { type: 'book', label: PUBLICATION_TYPE_LABELS.book };
  }
  const cleanVenue = !isPlaceholderVenue(article.journal) ? article.journal.trim() : '';
  const validDoi = normalizeValidDoi(article.doi);
  if (!cleanVenue && article.url && !validDoi && !article.volume) {
    return { type: 'web_publication', label: PUBLICATION_TYPE_LABELS.web_publication };
  }
  if (!cleanVenue && !validDoi && !article.volume && (article.sourceFileName || article.original_filename) && !article.publisher) {
    // Local file without publication metadata yet -> do NOT invent journal name
    return { type: 'unpublished_manuscript', label: 'Local / Pending Publication Venue' };
  }

  return { type: 'journal_article', label: PUBLICATION_TYPE_LABELS.journal_article };
}

export interface SanitizedMetadataSnapshot {
  authors: string[];
  hasAuthors: boolean;
  year: number | null;
  title: string;
  hasValidTitle: boolean;
  isTitleIncomplete: boolean;
  journalOrSource: string | null;
  publisher: string | null;
  volume: string | null;
  issue: string | null;
  pagesOrArticleNo: string | null;
  doi: string | null;
  hasInvalidDoi: boolean;
  doiUrl: string | null;
  url: string | null;
  publicationType: Exclude<PublicationType, 'auto'>;
  publicationTypeLabel: string;
  publicationStatus: PublicationStatus;
}

export interface MetadataValidationReport {
  verificationStatus: CitationVerificationStatus;
  completenessScore: number; // 0-100
  missingFields: string[];
  conflicts: string[];
  fieldProvenance: Record<string, MetadataFieldProvenance>;
  sanitized: SanitizedMetadataSnapshot;
}

function inferFieldSource(article: Article, fieldKey: string): MetadataFieldSource {
  const existing = article.fieldProvenance?.[fieldKey]?.source;
  if (existing && existing !== 'missing') return existing;
  const db = (article.sourceDatabase || '').toLowerCase();
  if (db.includes('crossref')) return 'crossref';
  if (db.includes('openalex') || db.includes('pubmed') || db.includes('europe pmc') || db.includes('arxiv') || db.includes('scopus')) {
    return 'publisher_api';
  }
  if (db === 'manual') {
    return article.sourceFileName || article.original_filename ? 'pdf_metadata' : 'manual_edit';
  }
  return 'system_inferred';
}

export function validateArticleMetadata(
  article: Article,
  overrideType: CitationSourceType = 'auto'
): MetadataValidationReport {
  const nowIso = new Date().toISOString();
  const authors = sanitizeAuthorsList(article.authors);
  const hasAuthors = authors.length > 0;
  const rawHadPlaceholderAuthor =
    Array.isArray(article.authors) && article.authors.some((a) => isPlaceholderAuthor(a));

  const rawTitle = (article.title || '').replace(/\s+/g, ' ').trim();
  const titleLooksLikeFilename = /\.(pdf|eps|docx?|txt)$/i.test(rawTitle) || /^[a-z]+-\d+-\d+-v\d+$/i.test(rawTitle);
  const hasValidTitle = !isPlaceholderTitle(rawTitle) && !titleLooksLikeFilename;
  const isTitleIncomplete = !hasValidTitle || rawTitle.length < 12 || /\.\.\.$/.test(rawTitle);

  const year = sanitizeYear(article.year);
  const rawJournal = (article.journal || '').replace(/\s+/g, ' ').trim();
  const venueIsPlaceholder = Boolean(rawJournal) && isPlaceholderVenue(rawJournal);
  const journalOrSource = !venueIsPlaceholder && rawJournal ? rawJournal : null;

  const publisherRaw = (article.publisher || '').trim();
  const publisher = publisherRaw && !isPlaceholderVenue(publisherRaw) ? publisherRaw : null;

  const volume = (article.volume || '').trim() || null;
  const issue = (article.issue || '').trim() || null;
  const pagesClean = normalizePageRange(article.pagesStr);
  const articleNoClean = (article.articleNumber || '').trim();
  const pagesOrArticleNo = pagesClean || (articleNoClean ? `Article ${articleNoClean}` : null);

  const rawDoi = (article.doi || '').trim();
  const doi = normalizeValidDoi(rawDoi);
  const hasInvalidDoi = Boolean(rawDoi) && !doi && !/^(n\/?a|none|-)$/i.test(rawDoi);
  const doiUrl = doi ? `https://doi.org/${doi}` : null;
  const url = normalizeValidUrl(article.url) || (doiUrl || null);

  const { type: publicationType, label: publicationTypeLabel } = detectPublicationType(article, overrideType);
  const publicationStatus: PublicationStatus =
    article.publicationStatus ||
    (publicationType === 'preprint'
      ? 'preprint'
      : publicationType === 'unpublished_manuscript'
      ? 'unpublished'
      : 'published');

  const missingFields: string[] = [];
  const conflicts: string[] = [];

  if (!hasAuthors) missingFields.push('Authors');
  if (rawHadPlaceholderAuthor) conflicts.push('Author list contained synthetic placeholder (e.g. "Author pending sync" / "Unknown Author")');

  if (!year) missingFields.push('Publication Year');
  if (!rawTitle || isPlaceholderTitle(rawTitle)) missingFields.push('Title');
  if (titleLooksLikeFilename) conflicts.push(`Title "${rawTitle}" appears to be an unparsed filename or graphic asset`);
  else if (isTitleIncomplete) conflicts.push('Article title may be truncated or incomplete');

  if (!journalOrSource && publicationType !== 'book' && publicationType !== 'unpublished_manuscript') {
    missingFields.push('Publication Source / Journal');
  }
  if (venueIsPlaceholder && /^local\s+source\s+file$/i.test(rawJournal)) {
    conflicts.push('Local storage label ("Local Source File") was stored in the journal field instead of a real publication venue');
  } else if (venueIsPlaceholder) {
    conflicts.push(`Synthetic venue placeholder ("${rawJournal}") stripped`);
  }

  if (hasInvalidDoi) {
    conflicts.push(`Invalid DOI syntax "${rawDoi}" omitted from reference`);
  } else if (!doi && (publicationType === 'journal_article' || publicationType === 'conference_paper' || publicationType === 'preprint')) {
    missingFields.push('DOI');
  }

  if (publicationType === 'journal_article' && !volume && !pagesOrArticleNo) {
    missingFields.push('Volume / Pages');
  }

  // Build field-level provenance preserving existing verified provenance when present
  const fieldProvenance: Record<string, MetadataFieldProvenance> = {
    ...(article.fieldProvenance || {}),
    authors: {
      value: authors.join('; '),
      source: hasAuthors ? inferFieldSource(article, 'authors') : 'missing',
      status: rawHadPlaceholderAuthor ? 'conflict' : hasAuthors ? 'verified' : 'missing',
      updatedAt: article.fieldProvenance?.authors?.updatedAt || nowIso,
      ...(rawHadPlaceholderAuthor ? { conflictDetails: 'Placeholder author sanitized' } : {}),
    },
    title: {
      value: rawTitle,
      source: hasValidTitle ? inferFieldSource(article, 'title') : 'missing',
      status: titleLooksLikeFilename || isTitleIncomplete ? 'conflict' : hasValidTitle ? 'verified' : 'missing',
      updatedAt: article.fieldProvenance?.title?.updatedAt || nowIso,
      ...(titleLooksLikeFilename ? { conflictDetails: 'Title matches filename/asset' } : {}),
    },
    year: {
      value: year ? String(year) : '',
      source: year ? inferFieldSource(article, 'year') : 'missing',
      status: year ? 'verified' : 'missing',
      updatedAt: article.fieldProvenance?.year?.updatedAt || nowIso,
    },
    journal: {
      value: journalOrSource || '',
      source: journalOrSource ? inferFieldSource(article, 'journal') : 'missing',
      status: venueIsPlaceholder ? 'conflict' : journalOrSource ? 'verified' : 'missing',
      updatedAt: article.fieldProvenance?.journal?.updatedAt || nowIso,
      ...(venueIsPlaceholder ? { conflictDetails: `Rejected placeholder venue "${rawJournal}"` } : {}),
    },
    doi: {
      value: doi || '',
      source: doi ? inferFieldSource(article, 'doi') : 'missing',
      status: hasInvalidDoi ? 'conflict' : doi ? 'verified' : 'missing',
      updatedAt: article.fieldProvenance?.doi?.updatedAt || nowIso,
      ...(hasInvalidDoi ? { conflictDetails: `Malformed DOI "${rawDoi}"` } : {}),
    },
  };

  // Completeness score
  let score = 0;
  if (hasAuthors) score += 25;
  if (hasValidTitle) score += 25;
  if (year) score += 15;
  if (journalOrSource || (publicationType === 'book' && publisher) || publicationType === 'unpublished_manuscript') score += 20;
  if (doi || url) score += 10;
  if (volume || pagesOrArticleNo) score += 5;

  // Determine Verification Status
  let verificationStatus: CitationVerificationStatus;
  if (!hasValidTitle || (!hasAuthors && !journalOrSource && !doi && !url)) {
    verificationStatus = 'Unresolved';
  } else if (conflicts.length > 0) {
    verificationStatus = 'Needs Manual Review';
  } else if (
    hasAuthors &&
    year !== null &&
    hasValidTitle &&
    (journalOrSource !== null ||
      (publicationType === 'book' && publisher !== null) ||
      (publicationType === 'thesis_dissertation' && Boolean(article.institution || url)) ||
      (publicationType === 'unpublished_manuscript' && publicationStatus === 'unpublished')) &&
    (doi !== null || url !== null || publicationType === 'unpublished_manuscript' || publicationType === 'book')
  ) {
    verificationStatus = 'Verified';
  } else {
    verificationStatus = 'Partially Verified';
  }

  return {
    verificationStatus,
    completenessScore: score,
    missingFields,
    conflicts,
    fieldProvenance,
    sanitized: {
      authors,
      hasAuthors,
      year,
      title: rawTitle,
      hasValidTitle,
      isTitleIncomplete,
      journalOrSource,
      publisher,
      volume,
      issue,
      pagesOrArticleNo,
      doi,
      hasInvalidDoi,
      doiUrl,
      url,
      publicationType,
      publicationTypeLabel,
      publicationStatus,
    },
  };
}

// ---------------------------------------------------------------------------
// Core Formatting Functions (Shared Across Screening, Library, Briefing, Export)
// ---------------------------------------------------------------------------
function shortenTitleForInText(title: string, isStandalone: boolean): string {
  const clean = toApaSentenceCase(title).replace(/[.,;:]+$/, '').trim();
  if (!clean) return 'Untitled Work';
  const words = clean.split(/\s+/).slice(0, 4).join(' ');
  const truncated = clean.split(/\s+/).length > 4 ? `${words}...` : words;
  return isStandalone ? `*${truncated}*` : `"${truncated}"`;
}

function getApaDateString(article: Article, sanitized: SanitizedMetadataSnapshot): string {
  if (sanitized.publicationStatus === 'in_press') return 'in press';
  if (!sanitized.year) return 'n.d.';
  if (
    (sanitized.publicationType === 'web_publication' || sanitized.publicationType === 'report') &&
    article.publishedMonthDay?.trim()
  ) {
    return `${sanitized.year}, ${article.publishedMonthDay.trim()}`;
  }
  return String(sanitized.year);
}

export function formatInlineCitation(
  article: Article,
  style: CitationStyleId,
  indexOneBased: number
): string {
  const report = validateArticleMetadata(article);
  const { authors, year, title, publicationType } = report.sanitized;
  const isStandalone = ['book', 'thesis_dissertation', 'report', 'government_publication', 'web_publication', 'unpublished_manuscript'].includes(publicationType);
  const yearStr = report.sanitized.publicationStatus === 'in_press' ? 'in press' : year ? String(year) : 'n.d.';

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
    case 'mla9': {
      if (authors.length === 0) return `(${shortenTitleForInText(title, isStandalone).replace(/\*/g, '')})`;
      const lead = getLeadSurname(authors);
      const second = authors.length > 1 ? getLeadSurname([authors[1]]) : '';
      if (authors.length === 1) return `(${lead})`;
      if (authors.length === 2) return `(${lead} and ${second})`;
      return `(${lead} et al.)`;
    }
    case 'harvard':
    case 'chicago17':
    case 'chicago_author':
    case 'asa':
    case 'cse': {
      if (authors.length === 0) {
        const shortT = shortenTitleForInText(title, isStandalone).replace(/\*/g, '');
        return `(${shortT} ${yearStr})`;
      }
      const lead = getLeadSurname(authors);
      const second = authors.length > 1 ? getLeadSurname([authors[1]]) : '';
      if (authors.length === 1) return `(${lead} ${yearStr})`;
      if (authors.length === 2) return `(${lead} & ${second} ${yearStr})`;
      return `(${lead} et al. ${yearStr})`;
    }
    case 'apa7':
    default: {
      if (authors.length === 0) {
        const shortTitle = toApaSentenceCase(title)
          .split(/\s+/)
          .slice(0, 4)
          .join(' ')
          .replace(/[.,;:]+$/, '');
        return isStandalone
          ? `(${shortTitle || 'Untitled work'}, ${yearStr})`
          : `("${shortTitle || 'Untitled work'}," ${yearStr})`;
      }
      const lead = getLeadSurname(authors);
      const second = authors.length > 1 ? getLeadSurname([authors[1]]) : '';
      if (authors.length === 1) return `(${lead}, ${yearStr})`;
      if (authors.length === 2) return `(${lead} & ${second}, ${yearStr})`;
      return `(${lead} et al., ${yearStr})`;
    }
  }
}

function formatApa7Reference(
  article: Article,
  report: MetadataValidationReport
): string {
  const s = report.sanitized;
  const parsedAuthors = s.authors.map(parseAuthorName);
  const authStr = formatApaAuthorList(parsedAuthors);
  const dateStr = getApaDateString(article, s);
  const sentenceTitle = toApaSentenceCase(s.title) || 'Untitled work';
  const locLink = s.doiUrl || (s.url && s.publicationType !== 'journal_article' ? s.url : s.url || '');

  const appendLink = (base: string, link: string): string => {
    const cleanBase = base.replace(/\s+$/, '');
    const terminated = /[.?!]$/.test(cleanBase) ? cleanBase : `${cleanBase}.`;
    return link ? `${terminated} ${link}` : terminated;
  };

  switch (s.publicationType) {
    case 'book': {
      const editionNote = s.authors && article.edition?.trim() ? ` (${article.edition.trim()})` : '';
      const italicizedTitle = `*${sentenceTitle}*${editionNote}`;
      const pub = s.publisher || '';
      if (authStr) {
        const body = [italicizedTitle, pub].filter(Boolean).join('. ');
        return appendLink(`${authStr} (${dateStr}). ${body}`, s.doiUrl || s.url || '');
      }
      const body = pub ? `${italicizedTitle}. (${dateStr}). ${pub}` : `${italicizedTitle}. (${dateStr})`;
      return appendLink(body, s.doiUrl || s.url || '');
    }

    case 'book_chapter': {
      const edStr = article.editors && article.editors.length > 0 ? formatApaEditors(article.editors) : '';
      const bookTitle = toApaSentenceCase(article.bookTitle || s.journalOrSource || '');
      const edAndPg = [article.edition?.trim(), s.pagesOrArticleNo ? `pp. ${s.pagesOrArticleNo}` : '']
        .filter(Boolean)
        .join(', ');
      const bookPart = bookTitle
        ? `${edStr ? `In ${edStr}, ` : 'In '}*${bookTitle}*${edAndPg ? ` (${edAndPg})` : ''}`
        : edAndPg
        ? `(${edAndPg})`
        : '';
      const pub = s.publisher || '';
      const parts = [bookPart, pub].filter(Boolean).join('. ');
      if (authStr) {
        return appendLink(`${authStr} (${dateStr}). ${sentenceTitle}${parts ? `. ${parts}` : ''}`, s.doiUrl || s.url || '');
      }
      return appendLink(`${sentenceTitle}. (${dateStr})${parts ? `. ${parts}` : ''}`, s.doiUrl || s.url || '');
    }

    case 'conference_paper': {
      const confName = s.journalOrSource || '';
      const loc = [s.volume ? `*${s.volume}*` : '', s.pagesOrArticleNo || ''].filter(Boolean).join(', ');
      const sourceBlock = confName
        ? `*${confName}*${loc ? `, ${loc}` : ''}`
        : loc;
      const pub = s.publisher && s.publisher !== confName ? s.publisher : '';
      const rest = [sentenceTitle, sourceBlock, pub].filter(Boolean).join('. ');
      if (authStr) {
        return appendLink(`${authStr} (${dateStr}). ${rest}`, locLink);
      }
      return appendLink(`${sentenceTitle}. (${dateStr})${sourceBlock || pub ? `. ${[sourceBlock, pub].filter(Boolean).join('. ')}` : ''}`, locLink);
    }

    case 'thesis_dissertation': {
      const inst = article.institution?.trim() || s.publisher || s.journalOrSource || '';
      const isMasters = /master|msc|m\.sc/i.test(`${article.paperSubType || ''} ${s.journalOrSource || ''}`);
      const kind = isMasters ? "Master's thesis" : 'Doctoral dissertation';
      const bracket = inst
        ? s.url
          ? `[${kind}, ${inst}]`
          : `[Unpublished ${kind.toLowerCase()}, ${inst}]`
        : `[Unpublished ${kind.toLowerCase()}]`;
      if (authStr) {
        return appendLink(`${authStr} (${dateStr}). *${sentenceTitle}* ${bracket}`, s.doiUrl || s.url || '');
      }
      return appendLink(`*${sentenceTitle}* ${bracket}. (${dateStr})`, s.doiUrl || s.url || '');
    }

    case 'report':
    case 'government_publication': {
      const rptNo = article.reportNumber?.trim() ? ` (${article.reportNumber.trim().match(/^report/i) ? article.reportNumber.trim() : `Report No. ${article.reportNumber.trim()}`})` : '';
      const agency = s.publisher || s.journalOrSource || '';
      // Avoid repeating agency if agency === corporate author
      const includeAgency = agency && (!authStr || agency.toLowerCase() !== authStr.toLowerCase());
      if (authStr) {
        return appendLink(
          `${authStr} (${dateStr}). *${sentenceTitle}*${rptNo}${includeAgency ? `. ${agency}` : ''}`,
          s.doiUrl || s.url || ''
        );
      }
      return appendLink(
        `*${sentenceTitle}*${rptNo}. (${dateStr})${includeAgency ? `. ${agency}` : ''}`,
        s.doiUrl || s.url || ''
      );
    }

    case 'preprint': {
      const repo = s.journalOrSource || s.publisher || '';
      const body = repo ? `${sentenceTitle}. *${repo}*` : sentenceTitle;
      if (authStr) {
        return appendLink(`${authStr} (${dateStr}). ${body}`, s.doiUrl || s.url || '');
      }
      return appendLink(`${sentenceTitle}. (${dateStr})${repo ? `. *${repo}*` : ''}`, s.doiUrl || s.url || '');
    }

    case 'unpublished_manuscript': {
      const statusLabel =
        s.publicationStatus === 'submitted'
          ? '[Manuscript submitted for publication]'
          : '[Unpublished manuscript]';
      const inst = article.institution?.trim() || s.publisher || '';
      if (authStr) {
        return appendLink(`${authStr} (${dateStr}). *${sentenceTitle}* ${statusLabel}${inst ? `. ${inst}` : ''}`, '');
      }
      return appendLink(`*${sentenceTitle}* ${statusLabel}. (${dateStr})${inst ? `. ${inst}` : ''}`, '');
    }

    case 'web_publication': {
      const siteName = s.journalOrSource || s.publisher || '';
      const includeSite = siteName && (!authStr || siteName.toLowerCase() !== authStr.toLowerCase());
      if (authStr) {
        return appendLink(
          `${authStr} (${dateStr}). *${sentenceTitle}*${includeSite ? `. ${siteName}` : ''}`,
          s.url || s.doiUrl || ''
        );
      }
      return appendLink(
        `*${sentenceTitle}*. (${dateStr})${includeSite ? `. ${siteName}` : ''}`,
        s.url || s.doiUrl || ''
      );
    }

    case 'journal_article':
    default: {
      const volIssue = s.volume
        ? s.issue
          ? `*${s.volume}*(${s.issue})`
          : `*${s.volume}*`
        : '';
      const loc = [volIssue, s.pagesOrArticleNo || ''].filter(Boolean).join(', ');
      const sourceSegment = s.journalOrSource
        ? `*${s.journalOrSource}*${loc ? `, ${loc}` : ''}`
        : loc;
      if (authStr) {
        const refBody = [sentenceTitle, sourceSegment].filter(Boolean).join('. ');
        return appendLink(`${authStr} (${dateStr}). ${refBody}`, locLink);
      }
      // APA 7 No-Author rule: move title to author position
      return appendLink(
        `${sentenceTitle}. (${dateStr})${sourceSegment ? `. ${sourceSegment}` : ''}`,
        locLink
      );
    }
  }
}

export function formatReferenceString(
  article: Article,
  style: CitationStyleId,
  indexOneBased: number,
  sourceType: CitationSourceType = 'auto'
): string {
  const report = validateArticleMetadata(article, sourceType);
  const s = report.sanitized;

  if (style === 'apa7' || !style) {
    return formatApa7Reference(article, report);
  }

  const parsed = s.authors.map(parseAuthorName);
  const hasAuthors = parsed.length > 0;
  const yearStr = s.publicationStatus === 'in_press' ? 'in press' : s.year ? String(s.year) : 'n.d.';
  const title = s.title ? s.title.replace(/\.+$/, '').trim() : 'Untitled work';
  const journal = s.journalOrSource || s.publisher || '';
  const volIssue = s.volume ? (s.issue ? `${s.volume}(${s.issue})` : s.volume) : '';
  const pages = s.pagesOrArticleNo || '';
  const doiUrl = s.doiUrl || s.url || '';
  const cleanDoi = s.doi || '';

  switch (style) {
    case 'ieee': {
      const ieeeAuthors = parsed
        .slice(0, 6)
        .map((a) => (a.isCorporate ? a.family : `${a.initials ? `${a.initials} ` : ''}${a.family}`.trim()))
        .join(', ');
      const authPrefix = hasAuthors
        ? `${parsed.length > 6 ? `${ieeeAuthors}, et al.` : ieeeAuthors}, `
        : '';
      const loc = [
        journal ? `*${journal}*` : '',
        s.volume ? `vol. ${s.volume}` : '',
        s.issue ? `no. ${s.issue}` : '',
        pages ? `pp. ${pages}` : '',
        yearStr,
      ]
        .filter(Boolean)
        .join(', ');
      return `[${indexOneBased}] ${authPrefix}"${title}," ${loc}.${cleanDoi ? ` doi: ${cleanDoi}.` : doiUrl ? ` Available: ${doiUrl}` : ''}`;
    }

    case 'harvard': {
      const harvAuthors = parsed
        .slice(0, 6)
        .map((a) => (a.isCorporate ? a.family : `${a.family}${a.initials ? `, ${a.initials}` : ''}`))
        .join(', ');
      const authStr = hasAuthors
        ? parsed.length > 6
          ? `${getLeadSurname(s.authors)} et al.`
          : harvAuthors
        : '';
      const loc = [volIssue, pages ? `pp. ${pages}` : ''].filter(Boolean).join(', ');
      const prefix = authStr ? `${authStr} (${yearStr}) '${title}'` : `'${title}' (${yearStr})`;
      const venuePart = journal ? `, *${journal}*` : '';
      return `${prefix}${venuePart}${loc ? `, ${loc}` : ''}.${doiUrl ? ` Available at: ${doiUrl}.` : ''}`;
    }

    case 'mla9': {
      let authStr = '';
      if (hasAuthors) {
        const first = parsed[0];
        const firstStr = first.isCorporate ? first.family : `${first.family}${first.given ? `, ${first.given}` : ''}`;
        authStr = firstStr;
        if (parsed.length === 2) {
          const second = parsed[1];
          const secStr = second.isCorporate ? second.family : `${second.given ? `${second.given} ` : ''}${second.family}`.trim();
          authStr = `${firstStr}, and ${secStr}`;
        } else if (parsed.length >= 3) {
          authStr = `${firstStr}, et al.`;
        }
      }
      const loc = [
        journal ? `*${journal}*` : '',
        s.volume ? `vol. ${s.volume}` : '',
        s.issue ? `no. ${s.issue}` : '',
        yearStr,
        pages ? `pp. ${pages}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      return `${authStr ? `${authStr}. ` : ''}"${title}." ${loc ? `${loc}.` : ''}${doiUrl ? ` ${doiUrl}.` : ''}`.trim();
    }

    case 'chicago17':
    case 'chicago_author':
    case 'chicago_notes':
    case 'asa':
    case 'oscola': {
      let authStr = '';
      if (hasAuthors) {
        const first = parsed[0];
        const firstStr = first.isCorporate ? first.family : `${first.family}${first.given ? `, ${first.given}` : ''}`;
        const restStr = parsed
          .slice(1, 6)
          .map((a) => (a.isCorporate ? a.family : `${a.given ? `${a.given} ` : ''}${a.family}`.trim()));
        authStr = firstStr;
        if (restStr.length === 1) authStr = `${firstStr}, and ${restStr[0]}`;
        else if (restStr.length > 1) {
          const tail = restStr.pop();
          authStr = `${firstStr}, ${restStr.join(', ')}, and ${tail}${parsed.length > 6 ? ', et al.' : ''}`;
        }
      }
      const volStr = volIssue ? ` ${volIssue}` : '';
      const pgStr = pages ? `: ${pages}` : '';
      const venuePart = journal ? ` *${journal}*${volStr}${pgStr}` : '';
      return `${authStr ? `${authStr}. ` : ''}${yearStr}. "${title}."${venuePart}.${doiUrl ? ` ${doiUrl}.` : ''}`.trim();
    }

    case 'vancouver':
    case 'ama':
    case 'cse': {
      const vanAuthors = parsed
        .slice(0, 6)
        .map((a) => (a.isCorporate ? a.family : `${a.family} ${a.initials.replace(/[.\s]/g, '')}`.trim()))
        .join(', ');
      const authStr = hasAuthors ? (parsed.length > 6 ? `${vanAuthors}, et al` : vanAuthors) : '';
      const loc = [yearStr, volIssue ? `;${volIssue}` : '', pages ? `:${pages}` : ''].join('');
      return `${indexOneBased}. ${authStr ? `${authStr}. ` : ''}${title}. ${journal ? `${journal}. ` : ''}${loc}.${cleanDoi ? ` doi:${cleanDoi}` : ''}`.trim();
    }

    case 'nature':
    case 'acs': {
      const natAuthors = parsed
        .slice(0, 5)
        .map((a) => (a.isCorporate ? a.family : `${a.family}, ${a.initials}`.trim()))
        .join(', ');
      const authStr = hasAuthors
        ? parsed.length > 5
          ? `${formatApaAuthorToken(parsed[0])} et al.`
          : natAuthors
        : '';
      return `[${indexOneBased}] ${authStr ? `${authStr} ` : ''}${title}.${journal ? ` *${journal}*` : ''}${s.volume ? ` **${s.volume}**` : ''}${pages ? `, ${pages}` : ''} (${yearStr}).${doiUrl ? ` ${doiUrl}` : ''}`;
    }

    default:
      return formatApa7Reference(article, report);
  }
}

export interface FormattedReferenceResult {
  prefix: string;
  citationText: string;
  htmlText: string;
  doiOrUrl: string;
  sourceTypeLabel: string;
  publicationType: Exclude<PublicationType, 'auto'>;
  inTextParenthetical: string;
  inTextNarrative: string;
  verificationStatus: CitationVerificationStatus;
  completenessScore: number;
  missingFields: string[];
  conflicts: string[];
}

function escapeHtmlBasic(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatReferenceEntry(
  article: Article,
  indexZeroBased: number,
  style: CitationStyleId,
  sourceType: CitationSourceType = 'auto'
): FormattedReferenceResult {
  const idx1 = indexZeroBased + 1;
  const validation = validateArticleMetadata(article, sourceType);
  const rawString = formatReferenceString(article, style, idx1, sourceType);
  const strippedBody = rawString.replace(/^(\[\d+\]\s+|\d+\.\s+)/, '').trim();
  const isNumeric = ['ieee', 'nature', 'vancouver', 'ama', 'acs', 'chicago_notes', 'oscola'].includes(style);
  const prefix = style === 'ieee' || style === 'nature' ? `[${idx1}]` : isNumeric ? `${idx1}.` : `[${idx1}]`;
  const plainText = strippedBody.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');

  // Escape HTML first before converting markdown emphasis safely
  const safeEscaped = escapeHtmlBasic(strippedBody);
  const htmlText = safeEscaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  const { authors, year, title, doiUrl, url, publicationType, publicationTypeLabel, publicationStatus } =
    validation.sanitized;
  const yearStr = publicationStatus === 'in_press' ? 'in press' : year ? String(year) : 'n.d.';
  const paren = formatInlineCitation(article, style, idx1);

  let narrative: string;
  if (authors.length === 0) {
    const shortTitle = toApaSentenceCase(title).split(/\s+/).slice(0, 4).join(' ').replace(/[.,;:]+$/, '');
    narrative = isNumeric ? `${shortTitle || 'This study'} ${paren}` : `"${shortTitle || 'Untitled work'}" (${yearStr})`;
  } else {
    const lead = getLeadSurname(authors);
    const second = authors.length > 1 ? getLeadSurname([authors[1]]) : '';
    const leadPhrase =
      authors.length === 1
        ? lead
        : authors.length === 2
        ? `${lead} and ${second}`
        : `${lead} et al.`;
    narrative = isNumeric ? `${leadPhrase} ${paren}` : `${leadPhrase} (${yearStr})`;
  }

  return {
    prefix,
    citationText: plainText,
    htmlText,
    doiOrUrl: doiUrl || url || '',
    sourceTypeLabel: publicationTypeLabel,
    publicationType,
    inTextParenthetical: paren,
    inTextNarrative: narrative,
    verificationStatus: validation.verificationStatus,
    completenessScore: validation.completenessScore,
    missingFields: validation.missingFields,
    conflicts: validation.conflicts,
  };
}

// ---------------------------------------------------------------------------
// Deduplication, Automatic Metadata-Sync Regeneration & Audit History
// ---------------------------------------------------------------------------
export function deduplicateArticlesForBibliography(articles: Article[]): Article[] {
  const result: Article[] = [];
  const doiToIndex = new Map<string, number>();
  const titleToIndex = new Map<string, number>();
  const scores: number[] = [];

  const scoreArticle = (art: Article): number => {
    const val = validateArticleMetadata(art);
    const hasDiskPdf = art.pdfStorage?.storage_status === 'stored_disk' || art.file_path ? 5 : 0;
    const absBonus = art.abstract && art.abstract.length > 40 ? 2 : 0;
    return val.completenessScore + hasDiskPdf + absBonus;
  };

  for (const art of articles || []) {
    if (!art) continue;
    const validDoi = normalizeValidDoi(art.doi)?.toLowerCase();
    const normTitle = (art.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const titleKey = normTitle.length >= 12 ? `${normTitle}::${sanitizeYear(art.year) || ''}` : '';

    const matchedIdx =
      (validDoi && doiToIndex.has(validDoi) ? doiToIndex.get(validDoi)! : undefined) ??
      (titleKey && titleToIndex.has(titleKey) ? titleToIndex.get(titleKey)! : undefined);

    const candidateScore = scoreArticle(art);

    if (matchedIdx !== undefined) {
      if (candidateScore > scores[matchedIdx]) {
        result[matchedIdx] = art;
        scores[matchedIdx] = candidateScore;
        if (validDoi) doiToIndex.set(validDoi, matchedIdx);
        if (titleKey) titleToIndex.set(titleKey, matchedIdx);
      }
      continue;
    }

    const nextIdx = result.length;
    result.push(art);
    scores.push(candidateScore);
    if (validDoi) doiToIndex.set(validDoi, nextIdx);
    if (titleKey) titleToIndex.set(titleKey, nextIdx);
  }
  return result;
}

export function applyMetadataCorrectionWithCitationSync(
  article: Article,
  patch: Partial<Article>,
  source: MetadataFieldSource,
  reason: string,
  style: CitationStyleId = 'apa7'
): Article {
  const nowIso = new Date().toISOString();
  const prevEntry = formatReferenceEntry(article, 0, style);

  // Protect immutable identifiers and original filename preservation
  const preservedPdfStorage = article.pdfStorage
    ? { ...article.pdfStorage }
    : article.original_filename || article.sourceFileName
    ? {
        original_filename: article.original_filename || article.sourceFileName || '',
        stored_filename: article.stored_filename,
        file_path: article.file_path,
        file_hash: article.file_hash,
        file_size: article.file_size,
        mime_type: article.mime_type,
        storage_status: article.file_path ? ('stored_disk' as const) : ('missing_binary' as const),
      }
    : undefined;

  const merged: Article = {
    ...article,
    ...patch,
    id: article.id, // Never mutate article ID
    sourceFileName: article.sourceFileName, // Never overwrite original uploaded filename
    original_filename: article.original_filename || article.sourceFileName,
    stored_filename: article.stored_filename,
    file_path: article.file_path,
    file_hash: article.file_hash,
    file_size: article.file_size,
    mime_type: article.mime_type,
    pdfStorage: preservedPdfStorage,
  };

  // Update field provenance for touched bibliographic fields
  const prov: Record<string, MetadataFieldProvenance> = { ...(article.fieldProvenance || {}) };
  const trackedKeys: Array<keyof Article> = [
    'title',
    'authors',
    'year',
    'journal',
    'doi',
    'volume',
    'issue',
    'pagesStr',
    'publisher',
    'url',
    'publicationType',
  ];
  const changedFields: string[] = [];
  for (const key of trackedKeys) {
    if (key in patch) {
      const prevVal = JSON.stringify(article[key] ?? '');
      const nextVal = JSON.stringify(merged[key] ?? '');
      if (prevVal !== nextVal) {
        changedFields.push(String(key));
        prov[String(key)] = {
          value: Array.isArray(merged[key]) ? (merged[key] as string[]).join('; ') : String(merged[key] ?? ''),
          source,
          status: 'verified',
          updatedAt: nowIso,
        };
      }
    }
  }

  merged.fieldProvenance = prov;
  const postValidation = validateArticleMetadata(merged);
  merged.fieldProvenance = { ...postValidation.fieldProvenance, ...prov };
  merged.citationVerificationStatus = postValidation.verificationStatus;

  const nextEntry = formatReferenceEntry(merged, 0, style);
  merged.citationCache = {
    style,
    inTextParenthetical: nextEntry.inTextParenthetical,
    inTextNarrative: nextEntry.inTextNarrative,
    referenceText: nextEntry.citationText,
    generatedAt: nowIso,
  };

  const prevHistory = Array.isArray(article.citationAuditHistory) ? article.citationAuditHistory : [];
  if (changedFields.length > 0 || prevEntry.citationText !== nextEntry.citationText) {
    const auditEntry: CitationAuditEntry = {
      id: `caudit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      reason,
      source,
      changedFields,
      previousCitation: prevEntry.citationText,
      newCitation: nextEntry.citationText,
      previousStatus: prevEntry.verificationStatus,
      newStatus: postValidation.verificationStatus,
    };
    merged.citationAuditHistory = [...prevHistory.slice(-24), auditEntry];
  } else {
    merged.citationAuditHistory = prevHistory;
  }

  return merged;
}

// ---------------------------------------------------------------------------
// BibTeX & RIS Exporters Sharing Verified Metadata Engine
// ---------------------------------------------------------------------------
function mapPublicationTypeToBibTex(t: Exclude<PublicationType, 'auto'>): string {
  switch (t) {
    case 'book':
      return 'book';
    case 'book_chapter':
      return 'incollection';
    case 'conference_paper':
      return 'inproceedings';
    case 'thesis_dissertation':
      return 'phdthesis';
    case 'report':
    case 'government_publication':
      return 'techreport';
    case 'preprint':
    case 'unpublished_manuscript':
    case 'web_publication':
      return 'misc';
    default:
      return 'article';
  }
}

function mapPublicationTypeToRis(t: Exclude<PublicationType, 'auto'>): string {
  switch (t) {
    case 'book':
      return 'BOOK';
    case 'book_chapter':
      return 'CHAP';
    case 'conference_paper':
      return 'CONF';
    case 'thesis_dissertation':
      return 'THES';
    case 'report':
    case 'government_publication':
      return 'RPRT';
    case 'web_publication':
      return 'ELEC';
    default:
      return 'JOUR';
  }
}

function sanitizeBibField(v: string): string {
  return String(v || '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

export function formatBibTexEntries(articles: Article[]): string {
  const deduped = deduplicateArticlesForBibliography(articles);
  return deduped
    .map((a, idx) => {
      const validation = validateArticleMetadata(a);
      const s = validation.sanitized;
      const bibType = mapPublicationTypeToBibTex(s.publicationType);
      const lead = getLeadSurname(s.authors).replace(/[^a-zA-Z0-9]/g, '') || 'Study';
      const citeKey = `${lead}${s.year || 'nd'}_${idx + 1}`;
      const fields: string[] = [`  title = {${sanitizeBibField(s.title)}}`];
      if (s.authors.length > 0) {
        fields.push(`  author = {${s.authors.map(sanitizeBibField).join(' and ')}}`);
      }
      if (s.journalOrSource) {
        const venueKey =
          s.publicationType === 'conference_paper' || s.publicationType === 'book_chapter'
            ? 'booktitle'
            : 'journal';
        fields.push(`  ${venueKey} = {${sanitizeBibField(s.journalOrSource)}}`);
      }
      if (s.publisher) fields.push(`  publisher = {${sanitizeBibField(s.publisher)}}`);
      if (s.year) fields.push(`  year = {${s.year}}`);
      if (s.volume) fields.push(`  volume = {${sanitizeBibField(s.volume)}}`);
      if (s.issue) fields.push(`  number = {${sanitizeBibField(s.issue)}}`);
      if (s.pagesOrArticleNo) fields.push(`  pages = {${sanitizeBibField(s.pagesOrArticleNo)}}`);
      if (s.doi) fields.push(`  doi = {${s.doi}}`);
      if (s.url) fields.push(`  url = {${s.url}}`);
      return `@${bibType}{${citeKey},\n${fields.join(',\n')}\n}`;
    })
    .join('\n\n');
}

export function formatRisEntries(articles: Article[]): string {
  const deduped = deduplicateArticlesForBibliography(articles);
  return deduped
    .map((a) => {
      const validation = validateArticleMetadata(a);
      const s = validation.sanitized;
      const lines: string[] = [`TY  - ${mapPublicationTypeToRis(s.publicationType)}`];
      if (s.title) lines.push(`TI  - ${s.title}`);
      s.authors.forEach((au) => lines.push(`AU  - ${au}`));
      if (s.year) lines.push(`PY  - ${s.year}`);
      if (s.journalOrSource) lines.push(`JO  - ${s.journalOrSource}`);
      if (s.publisher) lines.push(`PB  - ${s.publisher}`);
      if (s.volume) lines.push(`VL  - ${s.volume}`);
      if (s.issue) lines.push(`IS  - ${s.issue}`);
      if (s.pagesOrArticleNo) lines.push(`SP  - ${s.pagesOrArticleNo}`);
      if (s.doi) lines.push(`DO  - ${s.doi}`);
      if (s.url) lines.push(`UR  - ${s.url}`);
      if (a.abstract && !/^Imported from local drive file/i.test(a.abstract)) {
        lines.push(`AB  - ${a.abstract.replace(/\r?\n/g, ' ')}`);
      }
      if (a.sourceDatabase) lines.push(`DB  - ${a.sourceDatabase}`);
      lines.push(`N1  - Citation verification status: ${validation.verificationStatus}`);
      lines.push('ER  - ');
      return lines.join('\r\n');
    })
    .join('\r\n\r\n');
}

export function buildGroundedArticleTextSource(
  article: Article,
  style: CitationStyleId,
  indexOneBased: number
): string {
  const validation = validateArticleMetadata(article);
  const s = validation.sanitized;
  const entry = formatReferenceEntry(article, indexOneBased - 1, style);
  const ed = article.extractedData;
  const origName = article.original_filename || article.pdfStorage?.original_filename || article.sourceFileName;
  const lines: string[] = [
    `# Source [${indexOneBased}] ${entry.inTextParenthetical} — ${s.title || article.title}`,
    ``,
    `- **Formatted Citation (${style.toUpperCase()}):** ${entry.citationText}`,
    `- **Verification Status:** ${validation.verificationStatus} (${validation.completenessScore}% metadata completeness)`,
    `- **Authors:** ${s.authors.length > 0 ? s.authors.join(', ') : 'Not available in metadata'}`,
    `- **Year:** ${s.year || 'n.d.'}`,
    `- **Publication Source:** ${s.journalOrSource || s.publisher || 'Publication source not yet verified'}`,
    ...(s.doi ? [`- **DOI:** https://doi.org/${s.doi}`] : []),
    `- **Source Database:** ${article.sourceDatabase || 'Library'}`,
    ...(origName ? [`- **Original File Name:** ${origName}`] : []),
    `- **Screening Decision:** ${article.decision} (${article.screeningStage})`,
  ];

  if (article.paperCategory || article.paperSubType) {
    lines.push(
      `- **Study Classification:** ${article.paperCategory || ''} ${article.paperSubType ? `(${article.paperSubType})` : ''}`.trim()
    );
  }
  if (article.appraisalScore !== undefined || article.riskOfBiasAssessment) {
    lines.push(
      `- **Quality Appraisal / Risk of Bias:** ${article.appraisalScore ?? 'Not scored'}/13 · RoB: ${article.riskOfBiasAssessment || 'Not assessed'}`
    );
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
      [
        'Spatial Leakage Addressed',
        ed.spatialLeakageAddressed !== undefined ? String(ed.spatialLeakageAddressed) : undefined,
      ],
      ['Evaluation Metrics / Accuracy', ed.effectSizeOrAccuracy || ed.metrics],
      ['Sample Size', ed.sampleSize],
      ['Study Region', ed.geographicRegion],
      ['Key Findings', ed.keyFindings],
      ['Limitations', ed.limitations],
      ['Software Tools', ed.softwareTools],
    ];
    const extractedPairs = rawPairs.filter(
      (pair): pair is [string, string] => Boolean(pair[1] && String(pair[1]).trim() !== '')
    );

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
