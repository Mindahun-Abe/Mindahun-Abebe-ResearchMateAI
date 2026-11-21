import {
  Article,
  ArticleGeographicAssessment,
  ArticleGeographicHierarchy,
  GeographicEligibilityVerdict,
  GeographicLocationConnection,
  GeographicScaleTier,
  GeographicSelections,
  ReviewProject,
} from '../types';

export interface GeographicTierMeta {
  tier: GeographicScaleTier;
  label: string;
  shortLabel: string;
  rank: number; // 1 = broadest (global) -> 7 = finest (watershed), 0 = unspecified
  description: string;
  examples: string;
}

export const GEOGRAPHIC_SCALE_TIERS: GeographicTierMeta[] = [
  {
    tier: 'global',
    label: 'Globally (Worldwide / Multi-Country)',
    shortLabel: 'Globally',
    rank: 1,
    description: 'Cross-national, multi-continent, worldwide, or pan-global studies.',
    examples: 'Global, Worldwide, Multi-country, International',
  },
  {
    tier: 'continental',
    label: 'Continental (Continent / Macro-Region)',
    shortLabel: 'Continental',
    rank: 2,
    description: 'Continent or multi-country macro-regions (e.g., East Africa, Europe, Asia).',
    examples: 'Africa, Sub-Saharan Africa, East Africa, Europe, South Asia',
  },
  {
    tier: 'country',
    label: 'Country (National Level)',
    shortLabel: 'Country',
    rank: 3,
    description: 'Country-level or national-scale studies.',
    examples: 'Ethiopia, Kenya, China, India, Spain, Brazil, Iran, USA',
  },
  {
    tier: 'regional',
    label: 'Regional (State / Province / Highlands)',
    shortLabel: 'Regional',
    rank: 4,
    description: 'Administrative regional states, provinces, plateaus, or highland regions.',
    examples: 'Amhara Region, Oromia, Tigray, Loess Plateau, Mato Grosso, Fars',
  },
  {
    tier: 'zonal',
    label: 'Zonal (Administrative Zone / Prefecture)',
    shortLabel: 'Zonal',
    rank: 5,
    description: 'Sub-regional administrative zones, prefectures, or departments.',
    examples: 'North Gondar Zone, East Gojjam Zone, South Wollo Zone, West Shewa',
  },
  {
    tier: 'woreda',
    label: 'Woreda (Woreda / District / Kebele)',
    shortLabel: 'Woreda',
    rank: 6,
    description: 'Local woreda, wereda, kebele, district, county, or municipality study sites.',
    examples: 'Mecha Woreda, Gozamin Woreda, Fogera District, Enebsie Sar Midir',
  },
  {
    tier: 'watershed',
    label: 'Watershed (Watershed / Catchment / Basin)',
    shortLabel: 'Watershed',
    rank: 7,
    description: 'Hydrological basins, micro/sub-watersheds, catchments, or experimental sites.',
    examples: 'Debre Mawi Watershed, Gumara Catchment, Upper Blue Nile Basin, Anjeni',
  },
  {
    tier: 'unspecified',
    label: 'Unspecified Study Area',
    shortLabel: 'Unspecified',
    rank: 0,
    description: 'No explicit geographic study area reported in title, abstract, or metadata.',
    examples: 'Simulation-only or location not stated in screened text',
  },
];

export const GEOGRAPHIC_TIER_META_MAP: Record<GeographicScaleTier, GeographicTierMeta> =
  Object.fromEntries(GEOGRAPHIC_SCALE_TIERS.map((t) => [t.tier, t])) as Record<
    GeographicScaleTier,
    GeographicTierMeta
  >;

const TIER_RANK: Record<GeographicScaleTier, number> = {
  unspecified: 0,
  global: 1,
  continental: 2,
  country: 3,
  regional: 4,
  zonal: 5,
  woreda: 6,
  watershed: 7,
};

// Technical / non-geographic prefixes to ignore when matching "<Name> zone/region/watershed/district"
const NON_PLACE_STOP_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'such', 'each', 'every', 'all', 'any',
  'selected', 'different', 'various', 'several', 'multiple', 'single', 'entire', 'whole',
  'study', 'research', 'target', 'active', 'test', 'training', 'validation', 'sample',
  'root', 'vadose', 'unsaturated', 'saturated', 'buffer', 'riparian', 'flood', 'floodplain',
  'erosion', 'gully', 'headcut', 'channel', 'slope', 'hillslope', 'shear', 'fault', 'seismic',
  'spectral', 'visible', 'infrared', 'thermal', 'optical', 'spatial', 'temporal', 'interest',
  'feature', 'image', 'pixel', 'object', 'confidence', 'critical', 'transition', 'marginal',
  'climatic', 'agroecological', 'agro-ecological', 'ecological', 'bioclimatic', 'agricultural',
  'semi-arid', 'arid', 'humid', 'sub-humid', 'tropical', 'temperate', 'highland', 'lowland',
  'coastal', 'urban', 'rural', 'mountain', 'mountainous', 'local', 'small', 'large', 'micro',
  'macro', 'sub', 'adjacent', 'neighboring', 'surrounding', 'respective', 'observed', 'modeled',
  'predicted', 'simulated', 'experimental', 'field', 'area', 'site', 'plot', 'land', 'soil',
  'water', 'surface', 'runoff', 'sediment', 'time', 'economic', 'free', 'trade', 'protected',
  'exclusion', 'conservation', 'management', 'monitoring', 'drainage', 'hydrological', 'river',
  'catchment', 'watershed', 'basin', 'woreda', 'wereda', 'zone', 'region', 'district', 'in',
  'of', 'and', 'or', 'for', 'from', 'with', 'across', 'within', 'between', 'into', 'over',
  'clinical', 'hospital', 'patient', 'patients', 'control', 'intervention', 'treatment',
  'methods', 'results', 'discussion', 'conclusion', 'introduction', 'abstract', 'table', 'figure',
  'model', 'models', 'algorithm', 'algorithms', 'network', 'networks', 'learning', 'deep',
  'machine', 'random', 'neural', 'regression', 'data', 'dataset', 'datasets', 'evaluation',
  'performance', 'accuracy', 'precision', 'recall', 'cohort', 'cross', 'sectional', 'survey',
  'prospective', 'retrospective', 'randomized', 'systematic', 'meta', 'analysis',
  'studies', 'conducted', 'carried', 'performed', 'undertaken', 'research', 'empirical',
  'trial', 'trials', 'setting', 'settings', 'community', 'primary', 'secondary', 'tertiary',
  'outpatient', 'inpatient', 'academic', 'university', 'only', 'exclusively', 'solely',
  'restricted', 'eligible', 'required', 'countries', 'regions', 'areas', 'sites', 'locations',
  'outside', 'except', 'excluding', 'non',
]);

function isValidPlaceCandidate(raw: string): boolean {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 3 || cleaned.length > 60) return false;
  const words = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  const meaningful = words.filter((w) => !['of', 'and', 'the', 'la', 'el', 'de'].includes(w));
  if (meaningful.length === 0) return false;
  if (meaningful.every((w) => NON_PLACE_STOP_WORDS.has(w))) return false;
  if (NON_PLACE_STOP_WORDS.has(words[0])) return false;
  if (/^\d+$/.test(cleaned)) return false;
  return true;
}

function titleCasePlace(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

// Comprehensive Country Gazetteer + Demonym / Alias Normalization (All Disciplines Worldwide)
const COUNTRY_CANONICAL_PATTERNS: Array<{ canonical: string; regex: RegExp; continent: string[] }> = [
  // East & Horn of Africa
  { canonical: 'Ethiopia', regex: /\b(Ethiopia|Ethiopian|Ethiopians)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Kenya', regex: /\b(Kenya|Kenyan|Kenyans)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Tanzania', regex: /\b(Tanzania|Tanzanian)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Uganda', regex: /\b(Uganda|Ugandan)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Rwanda', regex: /\b(Rwanda|Rwandan)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Burundi', regex: /\b(Burundi|Burundian)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'South Sudan', regex: /\bSouth\s+Sudan(?:ese)?\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Sudan', regex: /\b(?<!South\s)(Sudan|Sudanese)\b/i, continent: ['East Africa', 'Africa'] },
  { canonical: 'Eritrea', regex: /\b(Eritrea|Eritrean)\b/i, continent: ['East Africa', 'Africa'] },
  { canonical: 'Djibouti', regex: /\bDjibouti(?:an)?\b/i, continent: ['East Africa', 'Africa'] },
  { canonical: 'Somalia', regex: /\b(Somalia|Somali|Somaliland)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },

  // North, West, Central & Southern Africa
  { canonical: 'Egypt', regex: /\b(Egypt|Egyptian)\b/i, continent: ['North Africa', 'Africa', 'Middle East'] },
  { canonical: 'Morocco', regex: /\b(Morocco|Moroccan)\b/i, continent: ['North Africa', 'Africa', 'Mediterranean'] },
  { canonical: 'Tunisia', regex: /\b(Tunisia|Tunisian)\b/i, continent: ['North Africa', 'Africa', 'Mediterranean'] },
  { canonical: 'Algeria', regex: /\b(Algeria|Algerian)\b/i, continent: ['North Africa', 'Africa', 'Mediterranean'] },
  { canonical: 'Libya', regex: /\b(Libya|Libyan)\b/i, continent: ['North Africa', 'Africa'] },
  { canonical: 'Nigeria', regex: /\b(Nigeria|Nigerian)\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Niger', regex: /\bNiger(?:ien)?\b(?![ia])/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Ghana', regex: /\b(Ghana|Ghanaian)\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Senegal', regex: /\b(Senegal|Senegalese)\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Mali', regex: /\bMali(?:an)?\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Burkina Faso', regex: /\bBurkina\s+Faso\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Benin', regex: /\bBenin(?:ese)?\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Togo', regex: /\bTogo(?:lese)?\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Ivory Coast', regex: /\b(Ivory\s+Coast|C[oô]te\s+d['’]Ivoire|Ivorian)\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Sierra Leone', regex: /\bSierra\s+Leone(?:an)?\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Liberia', regex: /\bLiberia(?:n)?\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Guinea', regex: /\b(?<!Papua\s+New\s+|Equatorial\s+)Guinea(?:n)?\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Cameroon', regex: /\b(Cameroon|Cameroonian)\b/i, continent: ['Sub-Saharan Africa', 'Africa'] },
  { canonical: 'DR Congo', regex: /\b(Democratic\s+Republic\s+of\s+(?:the\s+)?Congo|DR\s+Congo|DRC|Congolese)\b/i, continent: ['Sub-Saharan Africa', 'Africa'] },
  { canonical: 'South Africa', regex: /\bSouth\s+Africa(?:n)?\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Malawi', regex: /\b(Malawi|Malawian)\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Zambia', regex: /\b(Zambia|Zambian)\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Zimbabwe', regex: /\b(Zimbabwe|Zimbabwean)\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Mozambique', regex: /\b(Mozambique|Mozambican)\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Madagascar', regex: /\b(Madagascar|Malagasy)\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Namibia', regex: /\b(Namibia|Namibian)\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Botswana', regex: /\bBotswana\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Angola', regex: /\b(Angola|Angolan)\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Mauritius', regex: /\bMauritius\b/i, continent: ['Southern Africa', 'Africa'] },

  // Asia & Middle East
  { canonical: 'China', regex: /\b(China|Chinese|P\.?\s*R\.?\s*China|People['’]s\s+Republic\s+of\s+China|Mainland\s+China)\b/i, continent: ['East Asia', 'Asia'] },
  { canonical: 'Taiwan', regex: /\b(Taiwan|Taiwanese)\b/i, continent: ['East Asia', 'Asia'] },
  { canonical: 'Japan', regex: /\b(Japan|Japanese)\b/i, continent: ['East Asia', 'Asia'] },
  { canonical: 'South Korea', regex: /\b(South\s+Korea|Republic\s+of\s+Korea|Korean)\b/i, continent: ['East Asia', 'Asia'] },
  { canonical: 'Mongolia', regex: /\b(Mongolia|Mongolian)\b/i, continent: ['East Asia', 'Asia'] },
  { canonical: 'India', regex: /\b(India|Indian)\b/i, continent: ['South Asia', 'Asia'] },
  { canonical: 'Pakistan', regex: /\b(Pakistan|Pakistani)\b/i, continent: ['South Asia', 'Asia'] },
  { canonical: 'Nepal', regex: /\b(Nepal|Nepalese|Nepali)\b/i, continent: ['South Asia', 'Asia'] },
  { canonical: 'Bangladesh', regex: /\b(Bangladesh|Bangladeshi)\b/i, continent: ['South Asia', 'Asia'] },
  { canonical: 'Sri Lanka', regex: /\b(Sri\s+Lanka|Sri\s+Lankan)\b/i, continent: ['South Asia', 'Asia'] },
  { canonical: 'Afghanistan', regex: /\b(Afghanistan|Afghan)\b/i, continent: ['South Asia', 'Asia'] },
  { canonical: 'Vietnam', regex: /\b(Vietnam|Viet\s+Nam|Vietnamese)\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Indonesia', regex: /\b(Indonesia|Indonesian)\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Thailand', regex: /\b(Thailand|Thai)\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Malaysia', regex: /\b(Malaysia|Malaysian)\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Philippines', regex: /\b(Philippines|Philippine|Filipino)\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Cambodia', regex: /\b(Cambodia|Cambodian)\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Myanmar', regex: /\b(Myanmar|Burma|Burmese)\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Singapore', regex: /\bSingapore(?:an)?\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Laos', regex: /\b(Laos|Lao\s+PDR|Laotian)\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Iran', regex: /\b(Iran|Iranian|Islamic\s+Republic\s+of\s+Iran)\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Iraq', regex: /\b(Iraq|Iraqi)\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Turkey', regex: /\b(Turkey|T[uü]rkiye|Turkish)\b/i, continent: ['Middle East', 'Mediterranean', 'Asia', 'Europe'] },
  { canonical: 'Saudi Arabia', regex: /\bSaudi\s+Arabia(?:n)?\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'United Arab Emirates', regex: /\b(United\s+Arab\s+Emirates|UAE)\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Qatar', regex: /\bQatar(?:i)?\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Kuwait', regex: /\bKuwait(?:i)?\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Oman', regex: /\bOman(?:i)?\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Yemen', regex: /\b(Yemen|Yemeni)\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Syria', regex: /\b(Syria|Syrian)\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Lebanon', regex: /\b(Lebanon|Lebanese)\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Jordan', regex: /\bJordan(?:ian)?\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Israel', regex: /\b(Israel|Israeli)\b/i, continent: ['Middle East', 'Mediterranean'] },
  { canonical: 'Palestine', regex: /\b(Palestine|Palestinian|West\s+Bank|Gaza)\b/i, continent: ['Middle East', 'Mediterranean'] },
  { canonical: 'Kazakhstan', regex: /\b(Kazakhstan|Kazakh)\b/i, continent: ['Central Asia', 'Asia'] },
  { canonical: 'Uzbekistan', regex: /\b(Uzbekistan|Uzbek)\b/i, continent: ['Central Asia', 'Asia'] },

  // Americas
  { canonical: 'USA', regex: /\b(U\.S\.A\.|U\.S\.|United\s+States(?:\s+of\s+America)?|American)\b|\bUSA\b/i, continent: ['North America'] },
  { canonical: 'Canada', regex: /\b(Canada|Canadian)\b/i, continent: ['North America'] },
  { canonical: 'Mexico', regex: /\b(Mexico|Mexican)\b/i, continent: ['North America', 'Latin America'] },
  { canonical: 'Brazil', regex: /\b(Brazil|Brasil|Brazilian)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Argentina', regex: /\b(Argentina|Argentine|Argentinian)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Chile', regex: /\b(Chile|Chilean)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Peru', regex: /\b(Peru|Peruvian)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Colombia', regex: /\b(Colombia|Colombian)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Ecuador', regex: /\b(Ecuador|Ecuadorian)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Bolivia', regex: /\b(Bolivia|Bolivian)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Uruguay', regex: /\b(Uruguay|Uruguayan)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Paraguay', regex: /\b(Paraguay|Paraguayan)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Venezuela', regex: /\b(Venezuela|Venezuelan)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Costa Rica', regex: /\bCosta\s+Rica(?:n)?\b/i, continent: ['North America', 'Latin America'] },
  { canonical: 'Guatemala', regex: /\bGuatemala(?:n)?\b/i, continent: ['North America', 'Latin America'] },
  { canonical: 'Cuba', regex: /\b(Cuba|Cuban)\b/i, continent: ['North America', 'Latin America'] },

  // Europe
  { canonical: 'Spain', regex: /\b(Spain|Spanish)\b/i, continent: ['Europe', 'Mediterranean'] },
  { canonical: 'Italy', regex: /\b(Italy|Italian)\b/i, continent: ['Europe', 'Mediterranean'] },
  { canonical: 'Germany', regex: /\b(Germany|German)\b/i, continent: ['Europe'] },
  { canonical: 'France', regex: /\b(France|French)\b/i, continent: ['Europe'] },
  { canonical: 'United Kingdom', regex: /\b(United\s+Kingdom|U\.K\.|England|Scotland|Wales|Northern\s+Ireland|British)\b|\bUK\b/i, continent: ['Europe'] },
  { canonical: 'Ireland', regex: /\b(Ireland|Irish)\b/i, continent: ['Europe'] },
  { canonical: 'Portugal', regex: /\b(Portugal|Portuguese)\b/i, continent: ['Europe', 'Mediterranean'] },
  { canonical: 'Greece', regex: /\b(Greece|Greek)\b/i, continent: ['Europe', 'Mediterranean'] },
  { canonical: 'Netherlands', regex: /\b(Netherlands|Dutch)\b/i, continent: ['Europe'] },
  { canonical: 'Belgium', regex: /\b(Belgium|Belgian)\b/i, continent: ['Europe'] },
  { canonical: 'Switzerland', regex: /\b(Switzerland|Swiss)\b/i, continent: ['Europe'] },
  { canonical: 'Austria', regex: /\b(Austria|Austrian)\b/i, continent: ['Europe'] },
  { canonical: 'Poland', regex: /\b(Poland|Polish)\b/i, continent: ['Europe'] },
  { canonical: 'Czechia', regex: /\b(Czech\s+Republic|Czechia|Czech)\b/i, continent: ['Europe'] },
  { canonical: 'Slovakia', regex: /\b(Slovakia|Slovak)\b/i, continent: ['Europe'] },
  { canonical: 'Hungary', regex: /\b(Hungary|Hungarian)\b/i, continent: ['Europe'] },
  { canonical: 'Romania', regex: /\b(Romania|Romanian)\b/i, continent: ['Europe'] },
  { canonical: 'Bulgaria', regex: /\b(Bulgaria|Bulgarian)\b/i, continent: ['Europe'] },
  { canonical: 'Serbia', regex: /\b(Serbia|Serbian)\b/i, continent: ['Europe'] },
  { canonical: 'Croatia', regex: /\b(Croatia|Croatian)\b/i, continent: ['Europe', 'Mediterranean'] },
  { canonical: 'Denmark', regex: /\b(Denmark|Danish)\b/i, continent: ['Europe'] },
  { canonical: 'Sweden', regex: /\b(Sweden|Swedish)\b/i, continent: ['Europe'] },
  { canonical: 'Norway', regex: /\b(Norway|Norwegian)\b/i, continent: ['Europe'] },
  { canonical: 'Finland', regex: /\b(Finland|Finnish)\b/i, continent: ['Europe'] },
  { canonical: 'Russia', regex: /\b(Russia|Russian(?:\s+Federation)?)\b/i, continent: ['Europe', 'Asia'] },
  { canonical: 'Ukraine', regex: /\b(Ukraine|Ukrainian)\b/i, continent: ['Europe'] },

  // Oceania
  { canonical: 'Australia', regex: /\b(Australia|Australian)\b/i, continent: ['Oceania'] },
  { canonical: 'New Zealand', regex: /\bNew\s+Zealand\b/i, continent: ['Oceania'] },
];

const CONTINENTAL_PATTERNS: Array<{ canonical: string; regex: RegExp }> = [
  { canonical: 'Sub-Saharan Africa', regex: /\bSub[- ]Saharan\s+Africa\b/i },
  { canonical: 'East Africa', regex: /\b(East(?:ern)?\s+Africa|Horn\s+of\s+Africa)\b/i },
  { canonical: 'West Africa', regex: /\bWest(?:ern)?\s+Africa\b/i },
  { canonical: 'North Africa', regex: /\bNorth(?:ern)?\s+Africa\b/i },
  { canonical: 'Southern Africa', regex: /\bSouthern\s+Africa\b/i },
  { canonical: 'Africa', regex: /\bAfrica(?:n)?\b/i },
  { canonical: 'East Asia', regex: /\bEast(?:ern)?\s+Asia\b/i },
  { canonical: 'South Asia', regex: /\bSouth(?:ern)?\s+Asia\b/i },
  { canonical: 'Southeast Asia', regex: /\bSouth[- ]?East\s+Asia\b/i },
  { canonical: 'Central Asia', regex: /\bCentral\s+Asia\b/i },
  { canonical: 'Asia', regex: /\bAsia(?:n)?\b/i },
  { canonical: 'Middle East', regex: /\bMiddle\s+East\b/i },
  { canonical: 'Mediterranean', regex: /\bMediterranean\b/i },
  { canonical: 'Europe', regex: /\b(Europe|European\s+Union|European)\b/i },
  { canonical: 'North America', regex: /\bNorth\s+America(?:n)?\b/i },
  { canonical: 'South America', regex: /\bSouth\s+America(?:n)?\b/i },
  { canonical: 'Latin America', regex: /\bLatin\s+America\b/i },
  { canonical: 'Oceania', regex: /\b(Oceania|Australasia)\b/i },
];

const GLOBAL_PATTERNS: RegExp[] = [
  /\b(global|globally|worldwide|cross[- ]national|multi[- ]country|multi[- ]national|pan[- ]tropical|pan[- ]global|international\s+(?:meta[- ]?analysis|comparison|survey)|across\s+\d+\s+countries|no\s+geographic\s+restriction|all\s+countries|any\s+region)\b/i,
];

interface CuratedPlaceEntry {
  canonical: string;
  tier: 'regional' | 'zonal' | 'woreda' | 'watershed';
  regex: RegExp;
  parentRegional?: string;
  parentCountry: string;
  parentContinental: string[];
}

const CURATED_PLACES: CuratedPlaceEntry[] = [
  // --- Ethiopian Regions, Cities & Major Highlands ---
  { canonical: 'Addis Ababa', tier: 'regional', regex: /\bAddis\s+Ababa\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Amhara Region', tier: 'regional', regex: /\bAmhara(?:\s+(?:Regional\s+State|Region))?\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Oromia Region', tier: 'regional', regex: /\bOromia(?:\s+(?:Regional\s+State|Region))?\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Tigray Region', tier: 'regional', regex: /\bTigray(?:\s+(?:Regional\s+State|Region))?\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'SNNPR', tier: 'regional', regex: /\b(SNNPR|Southern\s+Nations,?\s+Nationalities)\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Sidama Region', tier: 'regional', regex: /\bSidama(?:\s+(?:Regional\s+State|Region))?\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Benishangul-Gumuz', tier: 'regional', regex: /\bBenishangul[- ]Gumuz\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Afar Region', tier: 'regional', regex: /\bAfar(?:\s+Region)?\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Somali Region', tier: 'regional', regex: /\bSomali\s+Region\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Dire Dawa', tier: 'regional', regex: /\bDire\s+Dawa\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Harari Region', tier: 'regional', regex: /\bHarari(?:\s+Region)?\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Ethiopian Highlands', tier: 'regional', regex: /\b(Ethiopian\s+Highlands|Northern\s+Ethiopian\s+Highlands|Northwestern\s+Ethiopia|Northern\s+Ethiopia|Central\s+Ethiopia|Southern\s+Ethiopia|Eastern\s+Ethiopia|Western\s+Ethiopia)\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },

  // --- Ethiopian Zones & Major Towns ---
  { canonical: 'North Gondar Zone', tier: 'zonal', regex: /\bNorth\s+Gondar(?:\s+Zone)?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'South Gondar Zone', tier: 'zonal', regex: /\bSouth\s+Gondar(?:\s+Zone)?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Central Gondar Zone', tier: 'zonal', regex: /\bCentral\s+Gondar(?:\s+Zone)?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'West Gondar Zone', tier: 'zonal', regex: /\bWest\s+Gondar(?:\s+Zone)?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'East Gojjam Zone', tier: 'zonal', regex: /\bEast\s+Gojjam(?:\s+Zone)?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'West Gojjam Zone', tier: 'zonal', regex: /\bWest\s+Gojjam(?:\s+Zone)?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Awi Zone', tier: 'zonal', regex: /\bAwi\s+Zone\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'North Wollo Zone', tier: 'zonal', regex: /\bNorth\s+Wollo(?:\s+Zone)?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'South Wollo Zone', tier: 'zonal', regex: /\bSouth\s+Wollo(?:\s+Zone)?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'North Shewa Zone', tier: 'zonal', regex: /\bNorth\s+Shewa(?:\s+Zone)?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'West Shewa Zone', tier: 'zonal', regex: /\bWest\s+Shewa(?:\s+Zone)?\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'East Shewa Zone', tier: 'zonal', regex: /\bEast\s+Shewa(?:\s+Zone)?\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Arsi Zone', tier: 'zonal', regex: /\b(?:West\s+)?Arsi(?:\s+Zone)?\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Bale Zone', tier: 'zonal', regex: /\bBale\s+(?:Zone|Highlands|Mountains)\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Jimma Zone', tier: 'zonal', regex: /\bJimma(?:\s+Zone)?\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'East Hararghe Zone', tier: 'zonal', regex: /\b(?:East|West)\s+Hararghe(?:\s+Zone)?\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Wolayta Zone', tier: 'zonal', regex: /\b(Wolayta|Wolaita)(?:\s+Zone)?\b/i, parentRegional: 'SNNPR', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Hadiya Zone', tier: 'zonal', regex: /\bHadiya(?:\s+Zone)?\b/i, parentRegional: 'SNNPR', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Gurage Zone', tier: 'zonal', regex: /\bGurage(?:\s+Zone)?\b/i, parentRegional: 'SNNPR', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Bahir Dar City', tier: 'zonal', regex: /\bBahir\s+Dar\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Gondar City', tier: 'zonal', regex: /\bGondar\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Hawassa City', tier: 'zonal', regex: /\b(Hawassa|Awassa)\b/i, parentRegional: 'Sidama Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Mekelle City', tier: 'zonal', regex: /\bMekell?e\b/i, parentRegional: 'Tigray Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Adama City', tier: 'zonal', regex: /\b(Adama|Nazret)\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },

  // --- Ethiopian Landmark Woredas ---
  { canonical: 'Mecha Woreda', tier: 'woreda', regex: /\b(?:North\s+|South\s+)?Mecha(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Bahir Dar Zuria Woreda', tier: 'woreda', regex: /\bBahir\s+Dar\s+Zuria(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Fogera Woreda', tier: 'woreda', regex: /\bFogera(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Dera Woreda', tier: 'woreda', regex: /\bDera\s+(?:woreda|wereda|district)\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Farta Woreda', tier: 'woreda', regex: /\bFarta(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Libo Kemkem Woreda', tier: 'woreda', regex: /\bLibo\s+Kemkem(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Gondar Zuria Woreda', tier: 'woreda', regex: /\bGondar\s+Zuria(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Gozamin Woreda', tier: 'woreda', regex: /\bGozamin(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Enebsie Sar Midir Woreda', tier: 'woreda', regex: /\bEnebsie\s+Sar\s+Midir(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Machakel Woreda', tier: 'woreda', regex: /\bMachakel(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Sinan Woreda', tier: 'woreda', regex: /\bSinan\s+(?:woreda|wereda|district)\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Sekela Woreda', tier: 'woreda', regex: /\bSekela(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Yilmana Densa Woreda', tier: 'woreda', regex: /\bYilmana\s+Densa(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Dangila Woreda', tier: 'woreda', regex: /\bDangila(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Haramaya Woreda', tier: 'woreda', regex: /\bHaramaya(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Wondo Genet Woreda', tier: 'woreda', regex: /\bWondo\s+Genet(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Sidama Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Degua Tembien Woreda', tier: 'woreda', regex: /\bDegua\s+Tembien(?:\s+(?:woreda|wereda|district))?\b/i, parentRegional: 'Tigray Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },

  // --- Ethiopian Watersheds / Catchments / Basins ---
  { canonical: 'Upper Blue Nile Basin', tier: 'watershed', regex: /\b(?:Upper\s+)?Blue\s+Nile(?:\s+(?:River\s+)?Basin)?\b/i, parentRegional: 'Ethiopian Highlands', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Abay Basin', tier: 'watershed', regex: /\bAbay(?:\s+(?:River\s+)?Basin)?\b/i, parentRegional: 'Ethiopian Highlands', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Lake Tana Basin', tier: 'watershed', regex: /\b(?:Lake\s+)?Tana\s+(?:Basin|Sub-?basin|Watershed|Catchment)\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Gilgel Abay Watershed', tier: 'watershed', regex: /\bGilgel\s+Abay(?:\s+(?:Watershed|Catchment|Sub-?basin|Basin))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Gumara Watershed', tier: 'watershed', regex: /\bGumara(?:\s+(?:Watershed|Catchment|Sub-?basin|Basin))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Debre Mawi Watershed', tier: 'watershed', regex: /\bDebre\s*[- ]?Mawi(?:\s+(?:Micro-?watershed|Watershed|Catchment))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Anjeni Watershed', tier: 'watershed', regex: /\bAnjeni(?:\s+(?:Watershed|Catchment))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Chemoga Watershed', tier: 'watershed', regex: /\bChemoga(?:\s+(?:Watershed|Catchment))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Jedeb Watershed', tier: 'watershed', regex: /\bJedeb(?:\s+(?:Watershed|Catchment))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Koga Watershed', tier: 'watershed', regex: /\bKoga(?:\s+(?:Watershed|Catchment|Basin))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Ribb Watershed', tier: 'watershed', regex: /\bRibb(?:\s+(?:Watershed|Catchment|Basin))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Megech Watershed', tier: 'watershed', regex: /\bMegech(?:\s+(?:Watershed|Catchment|Basin))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Birr Watershed', tier: 'watershed', regex: /\bBirr\s+(?:Watershed|Catchment|Basin)\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Maybar Watershed', tier: 'watershed', regex: /\bMaybar(?:\s+(?:Watershed|Catchment))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Andit Tid Watershed', tier: 'watershed', regex: /\bAndit\s+Tid(?:\s+(?:Watershed|Catchment))?\b/i, parentRegional: 'Amhara Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Awash Basin', tier: 'watershed', regex: /\bAwash(?:\s+(?:River\s+)?(?:Basin|Watershed|Catchment))\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Tekeze Basin', tier: 'watershed', regex: /\bTekez[eé](?:\s+(?:River\s+)?(?:Basin|Watershed|Catchment))?\b/i, parentRegional: 'Tigray Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Omo-Gibe Basin', tier: 'watershed', regex: /\bOmo[- ]Gibe(?:\s+Basin)?\b/i, parentRegional: 'SNNPR', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },

  // --- China Regions / Cities / Basins ---
  { canonical: 'Loess Plateau', tier: 'regional', regex: /\bLoess\s+Plateau\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Qinghai-Tibet Plateau', tier: 'regional', regex: /\b(Tibetan\s+Plateau|Qinghai[- ]Tibet\s+Plateau)\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Sichuan Basin', tier: 'regional', regex: /\bSichuan(?:\s+(?:Province|Basin))?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Yunnan Province', tier: 'regional', regex: /\bYunnan(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Shaanxi Province', tier: 'regional', regex: /\bShaanxi(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Guangdong Province', tier: 'regional', regex: /\bGuangdong(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Shandong Province', tier: 'regional', regex: /\bShandong(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Zhejiang Province', tier: 'regional', regex: /\bZhejiang(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Jiangsu Province', tier: 'regional', regex: /\bJiangsu(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Hubei Province', tier: 'regional', regex: /\bHubei(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Hunan Province', tier: 'regional', regex: /\bHunan(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Xinjiang', tier: 'regional', regex: /\bXinjiang\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Inner Mongolia', tier: 'regional', regex: /\bInner\s+Mongolia\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Heilongjiang', tier: 'regional', regex: /\bHeilongjiang\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Beijing', tier: 'zonal', regex: /\bBeijing\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Shanghai', tier: 'zonal', regex: /\bShanghai\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Wuhan', tier: 'zonal', regex: /\bWuhan\b/i, parentRegional: 'Hubei Province', parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Guangzhou', tier: 'zonal', regex: /\bGuangzhou\b/i, parentRegional: 'Guangdong Province', parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Yellow River Basin', tier: 'watershed', regex: /\bYellow\s+River(?:\s+Basin)?\b/i, parentRegional: 'Loess Plateau', parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Yangtze River Basin', tier: 'watershed', regex: /\bYangtze(?:\s+(?:River\s+)?Basin)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Guizhou Province', tier: 'regional', regex: /\bGuizhou(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Gansu Province', tier: 'regional', regex: /\bGansu(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Qinghai Province', tier: 'regional', regex: /\bQinghai(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Ningxia', tier: 'regional', regex: /\bNingxia\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Shanxi Province', tier: 'regional', regex: /\b(?<!Shaan)Shanxi(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Henan Province', tier: 'regional', regex: /\bHenan(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Hebei Province', tier: 'regional', regex: /\bHebei(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Liaoning Province', tier: 'regional', regex: /\bLiaoning(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Jilin Province', tier: 'regional', regex: /\bJilin(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Fujian Province', tier: 'regional', regex: /\bFujian(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Jiangxi Province', tier: 'regional', regex: /\bJiangxi(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Anhui Province', tier: 'regional', regex: /\bAnhui(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Guangxi', tier: 'regional', regex: /\bGuangxi\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Northeast China Black Soil', tier: 'regional', regex: /\b(?:Northeast|Northeastern)\s+China|Mollisol\s+Region\s+of\s+(?:Northeast\s+)?China\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Chengdu', tier: 'zonal', regex: /\bChengdu\b/i, parentRegional: 'Sichuan Basin', parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Kunming', tier: 'zonal', regex: /\bKunming\b/i, parentRegional: 'Yunnan Province', parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Yuanmou Dry-Hot Valley', tier: 'watershed', regex: /\bYuanmou(?:\s+Dry[- ]Hot\s+Valley)?\b/i, parentRegional: 'Yunnan Province', parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Zhifanggou Watershed', tier: 'watershed', regex: /\bZhifanggou(?:\s+(?:Watershed|Catchment))?\b/i, parentRegional: 'Loess Plateau', parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Yangou Watershed', tier: 'watershed', regex: /\bYangou(?:\s+(?:Watershed|Catchment))?\b/i, parentRegional: 'Loess Plateau', parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Jinsha River Basin', tier: 'watershed', regex: /\bJinsha\s+River(?:\s+Basin)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Shandong Province', tier: 'regional', regex: /\bShandong(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Zaozhuang', tier: 'zonal', regex: /\b(Zaozhuang|Gaozhuang)\b/i, parentRegional: 'Shandong Province', parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Xinjiang', tier: 'regional', regex: /\bXinjiang\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Inner Mongolia', tier: 'regional', regex: /\bInner\s+Mongolia\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Heilongjiang Province', tier: 'regional', regex: /\bHeilongjiang(?:\s+Province)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },

  // --- Brazil Regions / States / Basins ---
  { canonical: 'Sao Paulo', tier: 'regional', regex: /\bS[aã]o\s+Paulo\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Minas Gerais', tier: 'regional', regex: /\bMinas\s+Gerais\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Mato Grosso', tier: 'regional', regex: /\bMato\s+Grosso(?:\s+do\s+Sul)?\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Rio Grande do Sul', tier: 'regional', regex: /\bRio\s+Grande\s+do\s+Sul\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Parana State', tier: 'regional', regex: /\bParan[aá](?:\s+State|\s+Basin)?\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Bahia State', tier: 'regional', regex: /\bBahia(?:\s+State)?\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Goias State', tier: 'regional', regex: /\bGoi[aá]s(?:\s+State)?\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Santa Catarina', tier: 'regional', regex: /\bSanta\s+Catarina\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Pernambuco', tier: 'regional', regex: /\bPernambuco\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Maranhao', tier: 'regional', regex: /\bMaranh[aã]o\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Ceara', tier: 'regional', regex: /\bCear[aá]\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Cerrado Biome', tier: 'regional', regex: /\b(?:Brazilian\s+)?Cerrado\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Caatinga Biome', tier: 'regional', regex: /\bCaatinga\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Botucatu', tier: 'zonal', regex: /\bBotucatu\b/i, parentRegional: 'Sao Paulo', parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Uberlandia', tier: 'zonal', regex: /\bUberl[aâ]ndia\b/i, parentRegional: 'Minas Gerais', parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Rio de Janeiro', tier: 'zonal', regex: /\bRio\s+de\s+Janeiro\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Amazon Basin', tier: 'watershed', regex: /\bAmazon(?:\s+(?:River\s+)?Basin|ia)?\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Sao Francisco Basin', tier: 'watershed', regex: /\bS[aã]o\s+Francisco(?:\s+(?:River\s+)?Basin)?\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },

  // --- Iran Regions / Cities / Basins ---
  { canonical: 'Tehran', tier: 'regional', regex: /\bTehran(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Fars Province', tier: 'regional', regex: /\bFars(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Isfahan Province', tier: 'regional', regex: /\b(Isfahan|Esfahan)(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Khuzestan Province', tier: 'regional', regex: /\bKhuzestan(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Khorasan Province', tier: 'regional', regex: /\b(?:Razavi\s+|North\s+|South\s+)?Khorasan(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Mazandaran Province', tier: 'regional', regex: /\bMazandaran(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Golestan Province', tier: 'regional', regex: /\bGolestan(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Gilan Province', tier: 'regional', regex: /\b(Gilan|Guilan)(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Ardabil Province', tier: 'regional', regex: /\b(Ardabil|Ardebil)(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Kermanshah Province', tier: 'regional', regex: /\bKermanshah(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Lorestan Province', tier: 'regional', regex: /\bLorestan(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Semnan Province', tier: 'regional', regex: /\bSemnan(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Ilam Province', tier: 'regional', regex: /\bIlam(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'East Azerbaijan Province', tier: 'regional', regex: /\b(?:East|West)\s+Azerbaijan(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Kordestan Province', tier: 'regional', regex: /\b(?:Kordestan|Kurdistan)(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Chaharmahal and Bakhtiari', tier: 'regional', regex: /\bChaharmahal(?:\s+and\s+Bakhtiari)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Kohgiluyeh and Boyer-Ahmad', tier: 'regional', regex: /\bKohgiluyeh(?:\s+and\s+Boyer[- ]?Ahmad)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Zanjan Province', tier: 'regional', regex: /\bZanjan(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Qazvin Province', tier: 'regional', regex: /\bQazvin(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Hamadan Province', tier: 'regional', regex: /\b(Hamadan|Hamedan)(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Hormozgan Province', tier: 'regional', regex: /\bHormozgan(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Kerman Province', tier: 'regional', regex: /\bKerman(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Yazd Province', tier: 'regional', regex: /\bYazd(?:\s+Province)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Shiraz', tier: 'zonal', regex: /\bShiraz\b/i, parentRegional: 'Fars Province', parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Mashhad', tier: 'zonal', regex: /\bMashhad\b/i, parentRegional: 'Khorasan Province', parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Tabriz', tier: 'zonal', regex: /\bTabriz\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Yasuj', tier: 'zonal', regex: /\bYasuj\b/i, parentRegional: 'Kohgiluyeh and Boyer-Ahmad', parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Zarandieh Watershed', tier: 'watershed', regex: /\bZarandieh(?:\s+(?:Watershed|Catchment|Basin))?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Taleghan Watershed', tier: 'watershed', regex: /\bTaleghan(?:\s+(?:Watershed|Catchment|Basin))?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Karkheh Basin', tier: 'watershed', regex: /\bKarkheh(?:\s+(?:River\s+)?Basin)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Karun Basin', tier: 'watershed', regex: /\bKarun(?:\s+(?:River\s+)?Basin)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },
  { canonical: 'Lake Urmia Basin', tier: 'watershed', regex: /\b(?:Lake\s+)?Urmia(?:\s+Basin)?\b/i, parentCountry: 'Iran', parentContinental: ['Middle East', 'Asia'] },

  // --- Other Global Regions / Basins (India, Turkey, Morocco, Europe, Americas) ---
  { canonical: 'Maharashtra', tier: 'regional', regex: /\bMaharashtra\b/i, parentCountry: 'India', parentContinental: ['South Asia', 'Asia'] },
  { canonical: 'Uttarakhand', tier: 'regional', regex: /\bUttarakhand\b/i, parentCountry: 'India', parentContinental: ['South Asia', 'Asia'] },
  { canonical: 'Himachal Pradesh', tier: 'regional', regex: /\bHimachal\s+Pradesh\b/i, parentCountry: 'India', parentContinental: ['South Asia', 'Asia'] },
  { canonical: 'West Bengal', tier: 'regional', regex: /\bWest\s+Bengal\b/i, parentCountry: 'India', parentContinental: ['South Asia', 'Asia'] },
  { canonical: 'Tamil Nadu', tier: 'regional', regex: /\bTamil\s+Nadu\b/i, parentCountry: 'India', parentContinental: ['South Asia', 'Asia'] },
  { canonical: 'Kerala', tier: 'regional', regex: /\bKerala\b/i, parentCountry: 'India', parentContinental: ['South Asia', 'Asia'] },
  { canonical: 'Rajasthan', tier: 'regional', regex: /\bRajasthan\b/i, parentCountry: 'India', parentContinental: ['South Asia', 'Asia'] },
  { canonical: 'Middle Ganga Plain', tier: 'regional', regex: /\b(?:Middle\s+)?(?:Ganga|Indo[- ]Gangetic)\s+Plain\b/i, parentCountry: 'India', parentContinental: ['South Asia', 'Asia'] },
  { canonical: 'Babai Basin', tier: 'watershed', regex: /\bBabai\s+(?:Basi[n]?|Watershed|Catchment|River)\b/i, parentCountry: 'Nepal', parentContinental: ['South Asia', 'Asia'] },
  { canonical: 'Karnali Basin', tier: 'watershed', regex: /\bKarnali\s+(?:Basin|Watershed|River)\b/i, parentCountry: 'Nepal', parentContinental: ['South Asia', 'Asia'] },
  { canonical: 'Imo State', tier: 'regional', regex: /\b(?:Imo\s+State|Ihioma|Orlu|Owerri)\b/i, parentCountry: 'Nigeria', parentContinental: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Anatolia', tier: 'regional', regex: /\bAnatolia\b/i, parentCountry: 'Turkey', parentContinental: ['Middle East', 'Mediterranean'] },
  { canonical: 'Trabzon', tier: 'zonal', regex: /\bTrabzon\b/i, parentCountry: 'Turkey', parentContinental: ['Middle East', 'Mediterranean'] },
  { canonical: 'Rif Mountains', tier: 'regional', regex: /\bRif\s+Mountains\b/i, parentCountry: 'Morocco', parentContinental: ['North Africa', 'Africa', 'Mediterranean'] },
  { canonical: 'Andalusia', tier: 'regional', regex: /\b(Andalusia|Andalucia)\b/i, parentCountry: 'Spain', parentContinental: ['Europe', 'Mediterranean'] },
  { canonical: 'Valencia Region', tier: 'regional', regex: /\bValencia\b/i, parentCountry: 'Spain', parentContinental: ['Europe', 'Mediterranean'] },
  { canonical: 'Navarro Valley', tier: 'regional', regex: /\bNavarro\s+Valley\b/i, parentCountry: 'Spain', parentContinental: ['Europe', 'Mediterranean'] },
  { canonical: 'Tuscany', tier: 'regional', regex: /\bTuscany\b/i, parentCountry: 'Italy', parentContinental: ['Europe', 'Mediterranean'] },
  { canonical: 'Bavaria', tier: 'regional', regex: /\bBavaria\b/i, parentCountry: 'Germany', parentContinental: ['Europe'] },
  { canonical: 'Crete', tier: 'regional', regex: /\bCrete\b/i, parentCountry: 'Greece', parentContinental: ['Europe', 'Mediterranean'] },
  { canonical: 'California', tier: 'regional', regex: /\bCalifornia\b/i, parentCountry: 'USA', parentContinental: ['North America'] },
  { canonical: 'Texas', tier: 'regional', regex: /\bTexas\b/i, parentCountry: 'USA', parentContinental: ['North America'] },
  { canonical: 'Cordoba', tier: 'regional', regex: /\bCordoba\b/i, parentCountry: 'Argentina', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Zealand', tier: 'regional', regex: /\bZealand\b/i, parentCountry: 'Denmark', parentContinental: ['Europe'] },
  { canonical: 'Mekong Basin', tier: 'watershed', regex: /\bMekong(?:\s+(?:River\s+)?Basin|Delta)?\b/i, parentCountry: 'Vietnam', parentContinental: ['Southeast Asia', 'Asia'] },
];

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const clean = item.trim().replace(/\s+/g, ' ');
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

export function extractPlacesFromText(
  rawText: string,
  includeInferredParents = true
): {
  hierarchy: ArticleGeographicHierarchy;
  explicitEvidence: string[];
} {
  const text = rawText || '';
  const globalList: string[] = [];
  const continentalList: string[] = [];
  const countryList: string[] = [];
  const regionalList: string[] = [];
  const zonalList: string[] = [];
  const woredaList: string[] = [];
  const watershedList: string[] = [];
  const explicitEvidence: string[] = [];

  if (!text.trim()) {
    return { hierarchy: {}, explicitEvidence: [] };
  }

  // 1. Global mentions
  for (const rgx of GLOBAL_PATTERNS) {
    const m = text.match(rgx);
    if (m) {
      globalList.push(titleCasePlace(m[1] || m[0]));
      explicitEvidence.push(m[0]);
    }
  }

  // 2. Continental mentions
  for (const c of CONTINENTAL_PATTERNS) {
    if (c.regex.test(text)) {
      continentalList.push(c.canonical);
    }
  }

  // 3. Country mentions (+ infer continent)
  for (const country of COUNTRY_CANONICAL_PATTERNS) {
    const m = text.match(country.regex);
    if (m) {
      countryList.push(country.canonical);
      explicitEvidence.push(m[0]);
      if (includeInferredParents) {
        country.continent.forEach((cont) => continentalList.push(cont));
      }
    }
  }

  // 4. Curated hierarchical places (watersheds, woredas, zones, regions, cities)
  for (const entry of CURATED_PLACES) {
    const m = text.match(entry.regex);
    if (m) {
      explicitEvidence.push(m[0]);
      if (entry.tier === 'watershed') watershedList.push(entry.canonical);
      else if (entry.tier === 'woreda') woredaList.push(entry.canonical);
      else if (entry.tier === 'zonal') zonalList.push(entry.canonical);
      else if (entry.tier === 'regional') regionalList.push(entry.canonical);

      if (includeInferredParents) {
        if (entry.parentRegional) regionalList.push(entry.parentRegional);
        if (entry.parentCountry) countryList.push(entry.parentCountry);
        entry.parentContinental.forEach((cont) => continentalList.push(cont));
      }
    }
  }

  // 5. Structural regex sensing for arbitrary / custom local places across ANY country & discipline:
  const watershedSuffixRegex =
    /\b((?:[A-Z][A-Za-z0-9'’-]+|Upper|Lower|Middle)(?:\s+(?:[A-Z][A-Za-z0-9'’-]+|of|and|the)){0,3})\s+(micro-?watershed|sub-?watershed|watershed|sub-?catchment|catchment|sub-?basin|river\s+basin|drainage\s+basin|basin|headwater)\b/g;
  for (const match of text.matchAll(watershedSuffixRegex)) {
    const namePart = (match[1] || '').trim();
    const unitPart = (match[2] || '').trim();
    if (isValidPlaceCandidate(namePart)) {
      watershedList.push(`${titleCasePlace(namePart)} ${titleCasePlace(unitPart)}`);
      explicitEvidence.push(match[0]);
    }
  }
  const watershedPrefixRegex =
    /\b(?:watershed|catchment|sub-?catchment|micro-?watershed|river\s+basin)\s+(?:of\s+)?([A-Z][A-Za-z0-9'’-]+(?:\s+[A-Z][A-Za-z0-9'’-]+){0,2})\b/g;
  for (const match of text.matchAll(watershedPrefixRegex)) {
    const namePart = (match[1] || '').trim();
    if (isValidPlaceCandidate(namePart)) {
      watershedList.push(`${titleCasePlace(namePart)} Watershed`);
      explicitEvidence.push(match[0]);
    }
  }

  const woredaSuffixRegex =
    /\b([A-Z][A-Za-z0-9'’-]+(?:\s+[A-Z][A-Za-z0-9'’-]+){0,3})\s+([Ww]oredas?|[Ww]eredas?|[Ww]oradas?|[Kk]ebeles?|[Pp]easant\s+[Aa]ssociations?|[Ss]ub-?[Dd]istricts?|[Dd]istricts?|[Mm]unicipalit(?:y|ies)|[Cc]ommunes?|[Cc]ount(?:y|ies)|[Pp]arish(?:es)?|[Tt]ownships?|[Tt]ehsils?|[Tt]aluks?)\b/g;
  for (const match of text.matchAll(woredaSuffixRegex)) {
    const namePart = (match[1] || '').trim();
    const unitRaw = (match[2] || '').trim();
    const unitLower = unitRaw.toLowerCase();
    if (isValidPlaceCandidate(namePart)) {
      const normalizedUnit =
        unitLower.startsWith('woreda') || unitLower.startsWith('wereda') || unitLower.startsWith('worada')
          ? 'Woreda'
          : unitLower.startsWith('kebele')
          ? 'Kebele'
          : titleCasePlace(unitRaw.replace(/ies$/i, 'y').replace(/s$/i, ''));
      woredaList.push(`${titleCasePlace(namePart)} ${normalizedUnit}`);
      explicitEvidence.push(match[0]);
      if (
        includeInferredParents &&
        (unitLower.startsWith('woreda') || unitLower.startsWith('wereda') || unitLower.startsWith('worada') || unitLower.startsWith('kebele'))
      ) {
        countryList.push('Ethiopia');
        continentalList.push('East Africa', 'Sub-Saharan Africa', 'Africa');
      }
    }
  }
  const woredaPrefixRegex =
    /\b(?:[Ww]oreda|[Ww]ereda|[Kk]ebele|[Dd]istrict)\s+(?:of\s+)?([A-Z][A-Za-z0-9'’-]+(?:\s+[A-Z][A-Za-z0-9'’-]+){0,2})\b/g;
  for (const match of text.matchAll(woredaPrefixRegex)) {
    const namePart = (match[1] || '').trim();
    if (isValidPlaceCandidate(namePart)) {
      const isKebele = /^kebele/i.test(match[0]);
      const isDistrict = /^district/i.test(match[0]);
      woredaList.push(`${titleCasePlace(namePart)} ${isKebele ? 'Kebele' : isDistrict ? 'District' : 'Woreda'}`);
      explicitEvidence.push(match[0]);
      if (includeInferredParents && !isDistrict) {
        countryList.push('Ethiopia');
        continentalList.push('East Africa', 'Sub-Saharan Africa', 'Africa');
      }
    }
  }

  const zonalSuffixRegex =
    /\b([A-Z][A-Za-z0-9'’-]+(?:\s+[A-Z][A-Za-z0-9'’-]+){0,3})\s+([Zz]one|[Zz]onal\s+[Aa]dministration|[Pp]refecture|[Gg]overnorate)\b/g;
  for (const match of text.matchAll(zonalSuffixRegex)) {
    const namePart = (match[1] || '').trim();
    const unitPart = (match[2] || '').trim();
    if (isValidPlaceCandidate(namePart)) {
      zonalList.push(
        `${titleCasePlace(namePart)} ${
          unitPart.toLowerCase().includes('prefecture')
            ? 'Prefecture'
            : unitPart.toLowerCase().includes('governorate')
            ? 'Governorate'
            : 'Zone'
        }`
      );
      explicitEvidence.push(match[0]);
    }
  }

  const regionalSuffixRegex =
    /\b([A-Z][A-Za-z0-9'’-]+(?:\s+[A-Z][A-Za-z0-9'’-]+){0,2})\s+([Rr]egional\s+[Ss]tate|[Rr]egion|[Pp]rovince|[Hh]ighlands|[Pp]lateau)\b/g;
  for (const match of text.matchAll(regionalSuffixRegex)) {
    const namePart = (match[1] || '').trim();
    const unitPart = (match[2] || '').trim();
    if (isValidPlaceCandidate(namePart)) {
      regionalList.push(`${titleCasePlace(namePart)} ${titleCasePlace(unitPart)}`);
      explicitEvidence.push(match[0]);
    }
  }

  // Universal all-discipline study site / setting / cohort location pattern
  const sitePattern =
    /\b(?:study\s+(?:area|site|location|setting|region|cohort|population)|conducted\s+(?:in|at|across)|carried\s+out\s+(?:in|at)|performed\s+(?:in|at)|undertaken\s+(?:in|at)|located\s+(?:in|at)|sampled\s+(?:from|in)|collected\s+(?:from|in)|recruited\s+(?:from|in)|enrolled\s+(?:from|in)|case\s+study\s+(?:in|of))\s+(?:the\s+)?([A-Z][A-Za-z0-9'’-]+(?:\s+[A-Z][A-Za-z0-9'’-]+){0,3})(?=[,.;:\s)])/g;
  for (const match of text.matchAll(sitePattern)) {
    const candidate = (match[1] || '').trim();
    if (isValidPlaceCandidate(candidate)) {
      const low = candidate.toLowerCase();
      const alreadyCaptured = [
        ...countryList,
        ...regionalList,
        ...zonalList,
        ...woredaList,
        ...watershedList,
      ].some((p) => p.toLowerCase().includes(low) || low.includes(p.toLowerCase()));
      if (!alreadyCaptured) {
        if (/\b(watershed|catchment|basin)\b/i.test(candidate)) {
          watershedList.push(titleCasePlace(candidate));
        } else if (/\b(woreda|wereda|kebele|district)\b/i.test(candidate)) {
          woredaList.push(titleCasePlace(candidate));
        } else if (/\b(zone|prefecture)\b/i.test(candidate)) {
          zonalList.push(titleCasePlace(candidate));
        } else {
          watershedList.push(titleCasePlace(candidate));
        }
        explicitEvidence.push(match[0]);
      }
    }
  }

  const hierarchy: ArticleGeographicHierarchy = {};
  const g = dedupeStrings(globalList);
  const cont = dedupeStrings(continentalList);
  const ctry = dedupeStrings(countryList);
  const reg = dedupeStrings(regionalList);
  const zon = dedupeStrings(zonalList);
  const wor = dedupeStrings(woredaList);
  const wat = dedupeStrings(watershedList);

  if (g.length) hierarchy.global = g;
  if (cont.length) hierarchy.continental = cont;
  if (ctry.length) hierarchy.country = ctry;
  if (reg.length) hierarchy.regional = reg;
  if (zon.length) hierarchy.zonal = zon;
  if (wor.length) hierarchy.woreda = wor;
  if (wat.length) hierarchy.watershed = wat;

  return {
    hierarchy,
    explicitEvidence: dedupeStrings(explicitEvidence),
  };
}

function getFinestScaleTier(h: ArticleGeographicHierarchy): GeographicScaleTier {
  if (h.watershed?.length) return 'watershed';
  if (h.woreda?.length) return 'woreda';
  if (h.zonal?.length) return 'zonal';
  if (h.regional?.length) return 'regional';
  if (h.country?.length) return 'country';
  if (h.continental?.length) return 'continental';
  if (h.global?.length) return 'global';
  return 'unspecified';
}

function normalizePlaceCore(place: string): string {
  return place
    .toLowerCase()
    .replace(
      /\b(micro-?watershed|sub-?watershed|watershed|sub-?catchment|catchment|river\s+basin|drainage\s+basin|sub-?basin|basin|woredas?|weredas?|woradas?|kebeles?|districts?|zonal|zone|regional\s+state|region|province|state|prefecture|governorate|city|biome)\b/gi,
      ''
    )
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPlacesAtTier(h: ArticleGeographicHierarchy, tier: GeographicScaleTier): string[] {
  if (tier === 'unspecified') return [];
  return h[tier] || [];
}

function flattenHierarchyPlaces(h: ArticleGeographicHierarchy): string[] {
  return dedupeStrings([
    ...(h.watershed || []),
    ...(h.woreda || []),
    ...(h.zonal || []),
    ...(h.regional || []),
    ...(h.country || []),
    ...(h.continental || []),
    ...(h.global || []),
  ]);
}

function mergeHierarchies(list: ArticleGeographicHierarchy[]): ArticleGeographicHierarchy {
  const merged: ArticleGeographicHierarchy = {};
  const keys: Array<keyof ArticleGeographicHierarchy> = [
    'global',
    'continental',
    'country',
    'regional',
    'zonal',
    'woreda',
    'watershed',
  ];
  for (const k of keys) {
    const vals = dedupeStrings(list.flatMap((h) => h[k] || []));
    if (vals.length > 0) merged[k] = vals;
  }
  return merged;
}

function buildHierarchyChainLabel(h: ArticleGeographicHierarchy): string {
  const parts: string[] = [];
  if (h.watershed?.length) parts.push(h.watershed[0]);
  if (h.woreda?.length) parts.push(h.woreda[0]);
  if (h.zonal?.length) parts.push(h.zonal[0]);
  if (h.regional?.length) parts.push(h.regional[0]);
  if (h.country?.length) parts.push(h.country[0]);
  if (!parts.length && h.continental?.length) parts.push(h.continental[0]);
  if (!parts.length && h.global?.length) parts.push(h.global[0]);
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Deep Multi-Section Paper Location Sensing (All Disciplines, Every Paper Part)
// ---------------------------------------------------------------------------
const STUDY_SITE_CUE_REGEX =
  /\b(study\s+(?:area|site|location|setting|region|period|cohort|population|watershed|catchment|woreda|zone|hospital|clinic|province)|this\s+study\s+(?:was|is)\s+(?:conducted|carried|performed|undertaken|based)|we\s+(?:conducted|collected|sampled|evaluated|surveyed|enrolled|recruited|investigated|studied|measured|tested)|conducted\s+(?:in|at|across)|carried\s+out\s+(?:in|at|across)|performed\s+(?:in|at|across)|undertaken\s+(?:in|at)|located\s+(?:in|at|near)|situated\s+(?:in|at)|sampled\s+(?:in|from|at)|collected\s+(?:in|from|at)|recruited\s+(?:in|from|at)|enrolled\s+(?:in|from|at)|data\s+(?:from|were\s+collected\s+in)|dataset\s+(?:from|in)|field\s+(?:experiment|trial|survey|campaign|measurements?)\s+(?:in|at)|case\s+study\s+(?:in|of|from)|patients?\s+(?:in|from|at|admitted\s+to)|participants?\s+(?:in|from|at)|farmers?\s+(?:in|from)|households?\s+(?:in|from)|hospitals?\s+in|schools?\s+in|clinics?\s+in)\b/i;

const COMPARISON_MENTION_REGEX =
  /\b(previous\s+stud(?:y|ies)|prior\s+stud(?:y|ies)|earlier\s+stud(?:y|ies)|similar\s+(?:stud(?:y|ies)|findings|results|work)|compared\s+(?:to|with)|in\s+contrast\s+to|consistent\s+with|reported\s+in\s+(?:other|previous)|literature\s+from|et\s+al\.|for\s+example,?\s+in|globally|around\s+the\s+world|worldwide\s+average)\b/i;

const REFERENCES_HEADING_REGEX = /\n\s*(?:references|bibliography|literature\s+cited|acknowledg(?:e)?ments)\s*\n/i;

function stripTrailingReferences(text: string): string {
  if (!text) return '';
  const match = REFERENCES_HEADING_REGEX.exec(text);
  if (match && match.index > 180) {
    return text.slice(0, match.index);
  }
  return text;
}

function detectPageSectionName(pageContent: string, pageIndex: number, totalPages: number): string {
  const sample = (pageContent || '').slice(0, 650);
  if (/\b(?:study\s+area|study\s+site|site\s+description|study\s+setting|geographical\s+location)\b/i.test(sample)) {
    return 'Study Area';
  }
  if (/\b(?:materials?\s+and\s+methods?|methodology|methods?|experimental\s+(?:design|setup)|data\s+and\s+methods|sampling\s+design|study\s+population)\b/i.test(sample)) {
    return 'Methods / Study Setting';
  }
  if (/\b(?:results?(?:\s+and\s+discussion)?|findings)\b/i.test(sample)) {
    return 'Results';
  }
  if (/\b(?:discussion|conclusions?)\b/i.test(sample)) {
    return 'Discussion';
  }
  if (/\b(?:references|bibliography)\b/i.test(sample) && pageIndex >= totalPages - 2) {
    return 'References';
  }
  if (pageIndex === 0) return 'Title / Abstract / Intro';
  return 'Body';
}

interface ScoredSectionSegment {
  sourcePart: string;
  pageNumber?: number;
  text: string;
  baseWeight: number;
  isReferenceSection: boolean;
}

interface DetectedStudySense {
  primaryHierarchy: ArticleGeographicHierarchy;
  allHierarchy: ArticleGeographicHierarchy;
  explicitEvidence: string[];
  studyAreaConnections: GeographicLocationConnection[];
  primaryStudySections: string[];
  primaryPlaceLabel: string;
  primaryStudyLocation: string;
}

function splitCamelCaseForGeo(text: string): string {
  return (text || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function senseArticleStudyLocations(article: Article): DetectedStudySense {
  const segments: ScoredSectionSegment[] = [];

  if (article.title?.trim()) {
    segments.push({ sourcePart: 'Title', pageNumber: 1, text: splitCamelCaseForGeo(article.title), baseWeight: 9, isReferenceSection: false });
  }
  if (article.abstract?.trim()) {
    segments.push({ sourcePart: 'Abstract', pageNumber: 1, text: splitCamelCaseForGeo(article.abstract), baseWeight: 8, isReferenceSection: false });
  }
  // Include non-cached extracted metadata clues (groundTruth/sampleSize/keyFindings),
  // reserving geographicRegion only as a low-weight fallback when primary paper sections lack location data
  const metaPlaceText = [
    article.extractedData?.groundTruth || '',
    article.extractedData?.sampleSize || '',
    article.extractedData?.keyFindings || '',
  ]
    .filter(Boolean)
    .join('. ');
  if (metaPlaceText.trim()) {
    segments.push({
      sourcePart: 'Extracted Metadata',
      pageNumber: 1,
      text: splitCamelCaseForGeo(metaPlaceText),
      baseWeight: 6,
      isReferenceSection: false,
    });
  }
  if (article.sourceFileName?.trim()) {
    segments.push({
      sourcePart: 'Source File Name',
      pageNumber: 1,
      text: splitCamelCaseForGeo(article.sourceFileName.replace(/[-_]+/g, ' ')),
      baseWeight: 6,
      isReferenceSection: false,
    });
  }

  // Only examine verbatim paper quotes from manual citations; ignore synthetic screener messages/relevance
  // so old screening warnings like "verify against protocol geography (Ethiopia)" never pollute location detection.
  if (Array.isArray(article.evidenceCitations) && article.evidenceCitations.length > 0) {
    for (const cit of article.evidenceCitations) {
      const sec = cit.section || '';
      const rawQuote = cit.quote || '';
      if (
        /geographic\s+verification\s+needed|abstract\s*\/\s*eligibility\s+check|title\s*&\s*filename\s+screening/i.test(sec) ||
        /verify\s+full\s+text\s+against\s+protocol|no\s+explicit\s+study\s+location\s+sensed/i.test(rawQuote)
      ) {
        continue;
      }
      const quoteStr = splitCamelCaseForGeo(rawQuote);
      if (quoteStr) {
        segments.push({
          sourcePart: `Citation (${sec || 'Evidence'})`,
          pageNumber: cit.pageNumber || 1,
          text: quoteStr,
          baseWeight: 7,
          isReferenceSection: false,
        });
      }
    }
  }

  const pages = Array.isArray(article.pages) ? article.pages : [];
  if (pages.length > 0) {
    pages.forEach((p, idx) => {
      if (!p.content?.trim()) return;
      const sectionLabel = detectPageSectionName(p.content, idx, pages.length);
      const isRef = sectionLabel === 'References';
      const cleaned = isRef ? p.content : stripTrailingReferences(p.content);
      const boost = sectionLabel === 'Study Area' ? 11 : sectionLabel === 'Methods / Study Setting' ? 9 : isRef ? 1 : 5;
      segments.push({
        sourcePart: `Page ${p.pageNumber} (${sectionLabel})`,
        pageNumber: p.pageNumber,
        text: cleaned,
        baseWeight: boost,
        isReferenceSection: isRef,
      });
    });
  } else if (article.fullText?.trim()) {
    const cleanedFullText = stripTrailingReferences(article.fullText);
    // Split full text into paragraphs / sections to locate Study Area / Methods accurately
    const paragraphs = cleanedFullText.split(/\n{2,}|\r\n\r\n/).filter((p) => p.trim().length > 10);
    if (paragraphs.length > 0) {
      paragraphs.forEach((para, idx) => {
        const isStudyAreaPara = /\b(study\s+(?:area|site|region|setting|location)|materials?\s+and\s+methods?|sampling\s+sites?|study\s+population)\b/i.test(para);
        segments.push({
          sourcePart: isStudyAreaPara ? 'Full Text (Study Area / Methods)' : `Full Text (Section ${idx + 1})`,
          pageNumber: 1,
          text: para,
          baseWeight: isStudyAreaPara ? 10 : 5,
          isReferenceSection: false,
        });
      });
    } else {
      segments.push({
        sourcePart: 'Full Text',
        pageNumber: 1,
        text: cleanedFullText,
        baseWeight: 6,
        isReferenceSection: false,
      });
    }
  }

  // Split each segment into sentences to accurately separate Primary Study Area vs Secondary/Comparison mentions
  const placeScores = new Map<
    string,
    {
      place: string;
      tier: GeographicScaleTier;
      primaryScore: number;
      secondaryScore: number;
      connections: GeographicLocationConnection[];
    }
  >();

  const nonRefHierarchies: ArticleGeographicHierarchy[] = [];
  const allHierarchies: ArticleGeographicHierarchy[] = [];
  const primaryHierarchies: ArticleGeographicHierarchy[] = [];
  const explicitEvidence: string[] = [];

  for (const seg of segments) {
    const sentences = seg.text
      .replace(/\r?\n+/g, '. ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 4);

    const units = sentences.length > 0 ? sentences : [seg.text];

    for (const sentence of units) {
      const { hierarchy: h, explicitEvidence: ev } = extractPlacesFromText(sentence, true);
      const placesInSent = flattenHierarchyPlaces(h);
      if (placesInSent.length === 0) continue;

      allHierarchies.push(h);
      if (!seg.isReferenceSection) nonRefHierarchies.push(h);
      ev.forEach((e) => explicitEvidence.push(e));

      const hasSiteCue = STUDY_SITE_CUE_REGEX.test(sentence);
      const hasComparisonCue = COMPARISON_MENTION_REGEX.test(sentence) && !hasSiteCue;
      const isPrimarySegment =
        !seg.isReferenceSection &&
        (hasSiteCue ||
          seg.sourcePart === 'Title' ||
          seg.sourcePart === 'Extracted Metadata' ||
          seg.sourcePart.includes('Study Area') ||
          seg.sourcePart.includes('Methods') ||
          (seg.sourcePart === 'Abstract' && !hasComparisonCue));

      const effectiveWeight = seg.isReferenceSection
        ? 1
        : hasComparisonCue
        ? 1
        : hasSiteCue
        ? seg.baseWeight + 6
        : seg.baseWeight;

      if (isPrimarySegment) {
        primaryHierarchies.push(h);
      }

      const tiers: Array<Exclude<GeographicScaleTier, 'unspecified'>> = [
        'watershed',
        'woreda',
        'zonal',
        'regional',
        'country',
        'continental',
        'global',
      ];
      for (const tier of tiers) {
        for (const place of h[tier] || []) {
          const key = `${tier}::${place.toLowerCase()}`;
          const existing = placeScores.get(key) || {
            place,
            tier,
            primaryScore: 0,
            secondaryScore: 0,
            connections: [],
          };
          if (isPrimarySegment) existing.primaryScore += effectiveWeight;
          else existing.secondaryScore += effectiveWeight;

          if (existing.connections.length < 3) {
            existing.connections.push({
              place,
              tier,
              sourcePart: seg.sourcePart,
              pageNumber: seg.pageNumber,
              quote: sentence.slice(0, 220),
              role: isPrimarySegment ? 'primary_study_area' : 'secondary_mention',
              alignment: 'neutral',
            });
          }
          placeScores.set(key, existing);
        }
      }
    }
  }

  // Build refined primaryHierarchy from primary study areas when available; otherwise fallback to non-reference mentions
  let primaryHierarchy: ArticleGeographicHierarchy =
    primaryHierarchies.length > 0
      ? mergeHierarchies(primaryHierarchies)
      : nonRefHierarchies.length > 0
      ? mergeHierarchies(nonRefHierarchies)
      : mergeHierarchies(allHierarchies);

  // Filter out weak incidental/comparison countries if a strong primary country already exists
  if (primaryHierarchies.length > 0 && (primaryHierarchy.country?.length || 0) > 1) {
    const countryEntries = Array.from(placeScores.values()).filter((e) => e.tier === 'country');
    const maxPrimaryCountryScore = Math.max(0, ...countryEntries.map((c) => c.primaryScore));
    if (maxPrimaryCountryScore >= 8) {
      const strongCountries = countryEntries
        .filter((c) => c.primaryScore >= Math.max(5, maxPrimaryCountryScore * 0.45))
        .map((c) => c.place);
      if (strongCountries.length > 0) {
        primaryHierarchy = {
          ...primaryHierarchy,
          country: strongCountries,
        };
      }
    }
  }

  const allHierarchy = mergeHierarchies(nonRefHierarchies.length > 0 ? nonRefHierarchies : allHierarchies);
  const allConnections: GeographicLocationConnection[] = [];
  const primarySectionsSet = new Set<string>();

  for (const entry of placeScores.values()) {
    // Prioritize non-continental/global fine connections for readable location tracking
    for (const conn of entry.connections) {
      allConnections.push(conn);
      if (conn.role === 'primary_study_area') {
        primarySectionsSet.add(conn.sourcePart);
      }
    }
  }

  // Sort connections: finest tier first, primary_study_area first
  allConnections.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'primary_study_area' ? -1 : 1;
    return TIER_RANK[b.tier] - TIER_RANK[a.tier];
  });

  const primaryPlaceLabel =
    buildHierarchyChainLabel(primaryHierarchy) ||
    buildHierarchyChainLabel(allHierarchy) ||
    article.extractedData?.geographicRegion ||
    'Unspecified Study Area';

  const primaryStudyLocation =
    primaryHierarchy.watershed?.[0] ||
    primaryHierarchy.woreda?.[0] ||
    primaryHierarchy.zonal?.[0] ||
    primaryHierarchy.regional?.[0] ||
    primaryHierarchy.country?.[0] ||
    primaryHierarchy.continental?.[0] ||
    primaryHierarchy.global?.[0] ||
    article.extractedData?.geographicRegion ||
    'Unspecified Study Area';

  return {
    primaryHierarchy,
    allHierarchy,
    explicitEvidence: dedupeStrings(explicitEvidence),
    studyAreaConnections: allConnections.slice(0, 12),
    primaryStudySections: Array.from(primarySectionsSet).slice(0, 6),
    primaryPlaceLabel,
    primaryStudyLocation,
  };
}

// ---------------------------------------------------------------------------
// Comprehensive Protocol Geographic Policy Synthesis
// (Synthesizes Geographic Eligibility + Inclusion/Exclusion Criteria + Standard
//  Exclusions + PICOC/Framework Context so "Global" default NEVER overrides
//  explicit country/region rules like "Ethiopia" or "Exclude China, Brazil, Iran")
// ---------------------------------------------------------------------------
interface ProtocolGeographicPolicy {
  primaryTargetDisplay: string;
  targetHierarchy: ArticleGeographicHierarchy;
  targetWithParentsHierarchy: ArticleGeographicHierarchy;
  targetPlaceList: string[];
  excludedPlaces: string[];
  targetScale: GeographicScaleTier | 'any';
  isGlobalTarget: boolean;
  isStrictGeographicScope: boolean;
  isOnlySingleAreaConstraint: boolean;
}

const GENERIC_GLOBAL_ONLY_REGEX =
  /^\s*(?:global|globally|worldwide|all\s+countries|all\s+regions|any|any\s+region|international|no\s+geographic\s+restriction|unrestricted)\s*$/i;

const GEO_CRITERION_DIMENSION_REGEX =
  /\b(geo|geography|geographic|geographical|location|region|area|study\s*area|study\s*site|setting|context|country|countries|nation|zonal|zone|woreda|district|watershed|catchment|basin|spatial|place)\b/i;

const OUTSIDE_CLAUSE_REGEX =
  /\b(?:outside(?:\s+of)?|other\s+than|except(?:\s+for)?|not\s+(?:conducted\s+)?in|excluding\s+(?:studies\s+)?(?:outside|not\s+in)|non[- ])\s*(?:the\s+)?([A-Za-z][A-Za-z\s-]{2,45})/gi;

function extractExcludedAndImpliedRequiredPlaces(ruleText: string): {
  impliedRequiredText: string[];
  explicitlyExcludedText: string[];
  hasOnlyOrOutsideConstraint: boolean;
} {
  if (!ruleText?.trim()) {
    return { impliedRequiredText: [], explicitlyExcludedText: [], hasOnlyOrOutsideConstraint: false };
  }
  const impliedRequiredText: string[] = [];
  let remaining = ruleText;
  let hasOnlyOrOutsideConstraint = /\b(outside|only|exclusively|solely|restricted\s+to|other\s+than|non[- ][a-z]+)\b/i.test(ruleText);

  for (const match of ruleText.matchAll(OUTSIDE_CLAUSE_REGEX)) {
    const captured = (match[1] || '').trim();
    if (captured) {
      impliedRequiredText.push(captured);
      remaining = remaining.replace(match[0], ' ');
    }
  }

  // Handle patterns like "non-Ethiopian" -> Ethiopia is implied required
  const nonDemonymRegex = /\bnon[- ]([A-Z][a-z]{3,25})\b/gi;
  for (const m of ruleText.matchAll(nonDemonymRegex)) {
    impliedRequiredText.push(m[1]);
    remaining = remaining.replace(m[0], ' ');
    hasOnlyOrOutsideConstraint = true;
  }

  return {
    impliedRequiredText,
    explicitlyExcludedText: remaining.trim() ? [remaining.trim()] : [],
    hasOnlyOrOutsideConstraint,
  };
}

function getTargetScaleTier(
  project: ReviewProject,
  targetHierarchy: ArticleGeographicHierarchy,
  effectiveGeoText: string,
  hasSpecificTargets: boolean
): GeographicScaleTier | 'any' {
  if (project.geographicTargetScale && project.geographicTargetScale !== 'any') {
    return project.geographicTargetScale;
  }
  const geoRaw = (effectiveGeoText || '').toLowerCase();
  if (!hasSpecificTargets && (!geoRaw.trim() || /\b(global|globally|worldwide|all\s+countries|international|no\s+geographic\s+restriction)\b/i.test(geoRaw))) {
    return 'global';
  }
  const sensed = getFinestScaleTier(targetHierarchy);
  if (sensed !== 'unspecified') return sensed;
  if (/\b(watershed|catchment|micro-?watershed|sub-?basin|basin)\b/i.test(geoRaw)) return 'watershed';
  if (/\b(woreda|wereda|kebele|district|municipality)\b/i.test(geoRaw)) return 'woreda';
  if (/\b(zone|zonal|prefecture)\b/i.test(geoRaw)) return 'zonal';
  if (/\b(region|regional|province|state|highlands)\b/i.test(geoRaw)) return 'regional';
  if (/\b(country|national)\b/i.test(geoRaw)) return 'country';
  if (/\b(continent|continental)\b/i.test(geoRaw)) return 'continental';
  return 'any';
}

function synthesizeProtocolGeographicPolicy(project: ReviewProject): ProtocolGeographicPolicy {
  const rawPrimaryGeo = (project.geographicEligibility || '').trim();
  const isPrimaryPlaceholderGlobal = !rawPrimaryGeo || GENERIC_GLOBAL_ONLY_REGEX.test(rawPrimaryGeo);

  const positiveTargetSegments: string[] = [];
  const negativeExclusionSegments: string[] = [];
  let hasOnlyOrOutsideConstraint = /\b(only|exclusively|solely|restricted\s+to)\b/i.test(rawPrimaryGeo);

  // Check if project.geographicEligibility itself mentions "excluding X"
  if (rawPrimaryGeo && !isPrimaryPlaceholderGlobal) {
    const exclSplit = rawPrimaryGeo.split(/\b(?:excluding|except|not\s+including)\b/i);
    positiveTargetSegments.push(exclSplit[0].trim());
    if (exclSplit.length > 1) {
      negativeExclusionSegments.push(exclSplit.slice(1).join(' '));
    }
  }

  // Incorporate structured multi-scale dropdown/placeholder selections
  const sel = project.geographicSelections;
  if (sel) {
    const selPositive = [
      sel.watershed,
      sel.woreda,
      sel.zone,
      sel.region,
      sel.country,
      sel.continent && !/^global$/i.test(sel.continent.trim()) ? sel.continent : '',
    ]
      .map((s) => (s || '').trim())
      .filter(Boolean);
    if (selPositive.length > 0) {
      positiveTargetSegments.push(...selPositive);
      hasOnlyOrOutsideConstraint = true;
    }
    if (sel.excludedAreas?.trim()) {
      negativeExclusionSegments.push(sel.excludedAreas.trim());
      hasOnlyOrOutsideConstraint = true;
    }
  }

  // Incorporate imported Study Area Map / Boundary file places (.shp, .dbf, .geojson, .csv, .kml)
  if (project.studyAreaBoundary?.placeNames?.length) {
    positiveTargetSegments.push(project.studyAreaBoundary.placeNames.slice(0, 60).join(', '));
    hasOnlyOrOutsideConstraint = true;
  }

  // Inspect ALL inclusionCriteria rules for geographic inclusions AND exclusions
  for (const crit of project.inclusionCriteria || []) {
    const dim = crit.dimension || '';
    const inc = crit.includeRule || '';
    const exc = crit.excludeRule || '';
    const isGeoDim = GEO_CRITERION_DIMENSION_REGEX.test(`${dim} ${inc}`);

    // Extract places from includeRule if dimension is geo OR includeRule names explicit countries/curated places
    if (inc.trim()) {
      const { hierarchy: incH } = extractPlacesFromText(inc, false);
      const hasConcretePlace = flattenHierarchyPlaces(incH).some(
        (p) => !/\b(global|worldwide|international|all)\b/i.test(p)
      );
      if (isGeoDim || hasConcretePlace) {
        positiveTargetSegments.push(inc);
        if (/\b(only|exclusively|solely)\b/i.test(inc)) hasOnlyOrOutsideConstraint = true;
      }
    }

    // Parse excludeRule for "outside <Target>" AND explicitly banned regions (e.g. "China, Brazil, Iran")
    if (exc.trim()) {
      const parsedExc = extractExcludedAndImpliedRequiredPlaces(exc);
      if (parsedExc.hasOnlyOrOutsideConstraint) hasOnlyOrOutsideConstraint = true;
      parsedExc.impliedRequiredText.forEach((t) => positiveTargetSegments.push(t));
      parsedExc.explicitlyExcludedText.forEach((t) => {
        // Only record as excluded geography if it contains actual geographic places
        const { hierarchy: remH } = extractPlacesFromText(t, false);
        const concreteExcluded = flattenHierarchyPlaces(remH).filter(
          (p) => !/\b(global|worldwide|international|all)\b/i.test(p)
        );
        if (concreteExcluded.length > 0) {
          negativeExclusionSegments.push(t);
        }
      });
    }
  }

  // Inspect standardExclusionReasons for geographic rules ("Outside Ethiopia", "Studies in China, Brazil, Iran")
  for (const reason of project.standardExclusionReasons || []) {
    if (!reason?.trim()) continue;
    const parsedReason = extractExcludedAndImpliedRequiredPlaces(reason);
    if (parsedReason.hasOnlyOrOutsideConstraint) hasOnlyOrOutsideConstraint = true;
    parsedReason.impliedRequiredText.forEach((t) => positiveTargetSegments.push(t));
    parsedReason.explicitlyExcludedText.forEach((t) => {
      const { hierarchy: remH } = extractPlacesFromText(t, false);
      if (flattenHierarchyPlaces(remH).some((p) => !/\b(global|worldwide|international|all)\b/i.test(p))) {
        negativeExclusionSegments.push(t);
      }
    });
  }

  // Inspect framework context / setting / population
  const contextCandidates = [
    project.picoc?.context || '',
    project.frameworkFields?.context || '',
    project.frameworkFields?.setting || '',
    project.frameworkFields?.population || '',
  ].filter(Boolean);

  for (const ctxText of contextCandidates) {
    const { hierarchy: ctxH } = extractPlacesFromText(ctxText, false);
    const hasConcreteCtxPlace = flattenHierarchyPlaces(ctxH).some(
      (p) => !/\b(global|worldwide|international|all)\b/i.test(p)
    );
    if (hasConcreteCtxPlace && (isPrimaryPlaceholderGlobal || positiveTargetSegments.length === 0)) {
      positiveTargetSegments.push(ctxText);
    }
  }

  // Fallback to project title/scope if still no concrete places and geographicEligibility is empty/Global
  if (positiveTargetSegments.length === 0 && isPrimaryPlaceholderGlobal) {
    const titleScope = `${project.title || ''} ${project.scope || ''}`.trim();
    const { hierarchy: titleH } = extractPlacesFromText(titleScope, false);
    if (flattenHierarchyPlaces(titleH).some((p) => !/\b(global|worldwide|international|all)\b/i.test(p))) {
      positiveTargetSegments.push(titleScope);
    }
  }

  const combinedPositiveText = positiveTargetSegments.join(' ; ').trim() || rawPrimaryGeo || 'Global';
  const { hierarchy: targetH } = extractPlacesFromText(combinedPositiveText, false);
  const { hierarchy: targetWithParentsH } = extractPlacesFromText(combinedPositiveText, true);

  // Extract custom proper-noun target chunks (for local places not in curated dictionary, e.g. "Kersa", "Guder")
  const explicitTargetSource = [
    !isPrimaryPlaceholderGlobal ? rawPrimaryGeo : '',
    sel?.watershed || '',
    sel?.woreda || '',
    sel?.zone || '',
    sel?.region || '',
    sel?.country || '',
    sel?.continent && !/^global$/i.test(sel.continent.trim()) ? sel.continent : '',
    ...(project.studyAreaBoundary?.placeNames || []).slice(0, 40),
    ...(project.inclusionCriteria || [])
      .filter((c) => GEO_CRITERION_DIMENSION_REGEX.test(`${c.dimension || ''} ${c.includeRule || ''}`))
      .map((c) => c.includeRule || ''),
  ]
    .filter(Boolean)
    .join(',');

  const rawTargetChunks = explicitTargetSource
    .replace(/\([^)]*\)/g, '')
    .split(/[,;/|]+|\band\b|\bor\b/i)
    .map((s) => s.trim())
    .filter((s) => {
      if (!isValidPlaceCandidate(s)) return false;
      const wordCount = s.split(/\s+/).length;
      if (wordCount > 3 && !/\b(watershed|catchment|basin|woreda|wereda|kebele|district|zone|region|province|state|valley|highlands|plateau)\b/i.test(s)) {
        return false;
      }
      return true;
    });

  const rawPositivePlaces = dedupeStrings([...flattenHierarchyPlaces(targetH), ...rawTargetChunks]).filter(
    (tp) => !/\b(global|worldwide|international|all)\b/i.test(tp)
  );

  // Parse explicitly excluded places (removing any that accidentally overlap positive targets)
  const positiveCores = new Set(rawPositivePlaces.map((p) => normalizePlaceCore(p)).filter(Boolean));
  const { hierarchy: excludedH } = extractPlacesFromText(negativeExclusionSegments.join(' ; '), false);
  const excludedPlaces = dedupeStrings(flattenHierarchyPlaces(excludedH)).filter((ep) => {
    const core = normalizePlaceCore(ep);
    return ep && !/\b(global|worldwide|international|all)\b/i.test(ep) && !positiveCores.has(core);
  });

  const hasSpecificPositivePlaces = rawPositivePlaces.length > 0;
  const hasSpecificExclusions = excludedPlaces.length > 0;
  const hasExplicitNonGlobalScale = Boolean(
    project.geographicTargetScale &&
      project.geographicTargetScale !== 'any' &&
      project.geographicTargetScale !== 'global'
  );

  const isGlobalTarget =
    !hasSpecificPositivePlaces &&
    !hasSpecificExclusions &&
    !hasExplicitNonGlobalScale &&
    (isPrimaryPlaceholderGlobal || /\b(global|globally|worldwide|all\s+countries|no\s+geographic\s+restriction)\b/i.test(rawPrimaryGeo));

  const targetScale = getTargetScaleTier(
    project,
    targetH,
    combinedPositiveText,
    hasSpecificPositivePlaces
  );

  const primaryTargetDisplay =
    !isPrimaryPlaceholderGlobal && rawPrimaryGeo
      ? rawPrimaryGeo
      : hasSpecificPositivePlaces
      ? dedupeStrings(flattenHierarchyPlaces(targetH)).slice(0, 4).join(', ') || positiveTargetSegments[0]
      : rawPrimaryGeo || 'Global';

  return {
    primaryTargetDisplay,
    targetHierarchy: targetH,
    targetWithParentsHierarchy: targetWithParentsH,
    targetPlaceList: rawPositivePlaces,
    excludedPlaces,
    targetScale,
    isGlobalTarget,
    isStrictGeographicScope: !isGlobalTarget,
    isOnlySingleAreaConstraint: hasOnlyOrOutsideConstraint || (hasSpecificPositivePlaces && targetScale === 'country'),
  };
}

function placesMatch(a: string, b: string): boolean {
  const ac = normalizePlaceCore(a);
  const bc = normalizePlaceCore(b);
  if (!ac || !bc) return false;
  return ac === bc || (ac.length >= 4 && bc.includes(ac)) || (bc.length >= 4 && ac.includes(bc));
}

export function assessGeographicEligibility(
  article: Article,
  project: ReviewProject
): ArticleGeographicAssessment {
  const sensed = senseArticleStudyLocations(article);
  const artH = sensed.primaryHierarchy;
  const detectedScale = getFinestScaleTier(artH);
  const detectedPlaces = flattenHierarchyPlaces(artH);
  const primaryPlaceLabel = sensed.primaryPlaceLabel;

  const policy = synthesizeProtocolGeographicPolicy(project);
  const {
    primaryTargetDisplay,
    targetHierarchy: targetH,
    targetWithParentsHierarchy: targetWithParentsH,
    targetPlaceList,
    excludedPlaces,
    targetScale,
    isGlobalTarget,
    isStrictGeographicScope,
    isOnlySingleAreaConstraint,
  } = policy;

  const reasonNotesLower = `${article.decisionReason || ''} ${article.screeningNotes || ''} ${article.reviewerNotes || ''}`.toLowerCase();
  const explicitWrongArea = /\b(wrong\s+study\s+area|wrong\s+region|wrong\s+country|outside\s+study\s+area|ineligible\s+region|out\s+of\s+geographic|wrong\s+catchment|wrong\s+woreda|wrong\s+zone|wrong\s+watershed|wrong\s+location)\b/i.test(
    reasonNotesLower
  );

  let verdict: GeographicEligibilityVerdict = 'unspecified_study_area';
  let verdictLabel = 'Unspecified Study Area';
  let isEligible = true;
  let isGeographicConfirmed = false;
  let confidence = 70;
  let interpretiveSummary = '';

  const scaleMeta = GEOGRAPHIC_TIER_META_MAP[detectedScale];
  const targetScaleMeta =
    targetScale !== 'any'
      ? GEOGRAPHIC_TIER_META_MAP[targetScale]
      : {
          tier: 'any',
          shortLabel: 'Any Scale',
          label: 'Any Geographic Scale',
          rank: 0,
        };

  // Identify foreign primary places that conflict with either explicitly excluded regions or positive target places
  const primaryArticleCountriesRegions = dedupeStrings([
    ...(artH.country || []),
    ...(artH.regional || []),
    ...(artH.zonal || []),
    ...(artH.woreda || []),
    ...(artH.watershed || []),
  ]);

  const matchedExplicitlyExcluded = excludedPlaces.filter((ep) =>
    primaryArticleCountriesRegions.some((ap) => placesMatch(ap, ep))
  );

  if (explicitWrongArea) {
    verdict = 'out_of_area_mismatch';
    verdictLabel = 'Out-of-Area Mismatch (Reviewer Flag)';
    isEligible = false;
    isGeographicConfirmed = false;
    confidence = 96;
    interpretiveSummary = `Excluded for wrong study area. Sensed study location: ${primaryPlaceLabel} (${scaleMeta.shortLabel} tier) vs. protocol target (${primaryTargetDisplay || 'Unspecified'}).`;
  } else if (matchedExplicitlyExcluded.length > 0 && !targetPlaceList.some((tp) => primaryArticleCountriesRegions.some((ap) => placesMatch(ap, tp)))) {
    verdict = 'out_of_area_mismatch';
    verdictLabel = `Excluded Region (${matchedExplicitlyExcluded.join(', ')})`;
    isEligible = false;
    isGeographicConfirmed = false;
    confidence = 96;
    interpretiveSummary = `Paper's studied location (${primaryPlaceLabel}) is in explicitly excluded region(s): ${matchedExplicitlyExcluded.join(', ')}, outside eligible target (${primaryTargetDisplay}).`;
  } else if (isGlobalTarget) {
    if (detectedScale === 'unspecified') {
      verdict = 'eligible_global_scope';
      verdictLabel = 'Eligible (Global Scope · Site Unspecified)';
      isEligible = true;
      isGeographicConfirmed = true;
      confidence = 82;
      interpretiveSummary = `Passes Global protocol scope (${primaryTargetDisplay || 'Global'}), though no specific study locality was named in the screened text.`;
    } else {
      verdict = 'eligible_global_scope';
      verdictLabel = `Eligible (Global Scope · ${scaleMeta.shortLabel} Sensed)`;
      isEligible = true;
      isGeographicConfirmed = true;
      confidence = 92;
      interpretiveSummary = `Compatible with Global scope. Sensed ${scaleMeta.shortLabel}-scale study location: ${primaryPlaceLabel}.`;
    }
  } else if (detectedScale === 'unspecified') {
    if (project.geographicTargetScale && project.geographicTargetScale !== 'any') {
      verdict = 'unspecified_study_area';
      verdictLabel = `Unspecified Study Area (Needs ${targetScaleMeta.shortLabel} Verification)`;
      isEligible = true;
      isGeographicConfirmed = false;
      confidence = 65;
      interpretiveSummary = `No global, continental, country, regional, zonal, woreda, or watershed study place detected in paper; verify full text against target "${primaryTargetDisplay || targetScaleMeta.shortLabel}".`;
    } else {
      verdict = 'unspecified_study_area';
      verdictLabel = 'Unspecified Study Area';
      isEligible = true;
      isGeographicConfirmed = false;
      confidence = 68;
      interpretiveSummary = `No explicit study location sensed in title, abstract, or attached sections; verify full text against protocol geography (${primaryTargetDisplay || 'Configured target'}).`;
    }
  } else {
    // Strict non-global protocol target AND non-empty detected primary study geography in the paper!
    const articleCoreTokens = dedupeStrings(
      detectedPlaces.map((p) => normalizePlaceCore(p)).filter((t) => t.length >= 3)
    );
    const primarySpecificTextLower = [
      article.title || '',
      article.abstract || '',
      article.extractedData?.geographicRegion || '',
      ...sensed.studyAreaConnections.filter((c) => c.role === 'primary_study_area').map((c) => `${c.place} ${c.quote}`),
    ]
      .join(' ')
      .toLowerCase();

    const directMatchedTargets = targetPlaceList.filter((tp) => {
      const tpCore = normalizePlaceCore(tp);
      const tpLow = tp.toLowerCase();
      if (tpCore.length >= 3 && detectedPlaces.some((dp) => placesMatch(dp, tp))) {
        return true;
      }
      return (tpCore.length >= 4 && primarySpecificTextLower.includes(tpCore)) || (tpLow.length >= 4 && primarySpecificTextLower.includes(tpLow));
    });

    // Check if the paper also primarily studies explicitly excluded regions alongside or instead of target
    if (matchedExplicitlyExcluded.length > 0 && isOnlySingleAreaConstraint) {
      verdict = 'out_of_area_mismatch';
      verdictLabel = `Out-of-Area Conflict (${matchedExplicitlyExcluded.join(', ')})`;
      isEligible = false;
      isGeographicConfirmed = false;
      confidence = 93;
      interpretiveSummary = `Geographic conflict: Paper primarily studies ${primaryArticleCountriesRegions.join(', ')} including excluded area (${matchedExplicitlyExcluded.join(', ')}), violating strict "${primaryTargetDisplay}" constraint.`;
    } else {
      // Check same-tier conflict when target is regional/zonal/woreda/watershed/country
      const effectiveTargetTier: GeographicScaleTier =
        targetScale === 'any' ? 'country' : targetScale;
      const targetAtTier = getPlacesAtTier(targetH, effectiveTargetTier);
      const articleAtTier = getPlacesAtTier(artH, effectiveTargetTier);

      const sameTierConflict =
        targetAtTier.length > 0 &&
        articleAtTier.length > 0 &&
        !articleAtTier.some((ap) => targetAtTier.some((tp) => placesMatch(ap, tp)));

      // Also check if article has multiple countries (e.g. China AND Kenya) when target is a specific country without global/multi-country scope
      const foreignCountriesAtCountryTier = (artH.country || []).filter(
        (ac) => !targetPlaceList.some((tp) => placesMatch(ac, tp))
      );

      const enforcedScale: GeographicScaleTier | null =
        project.geographicTargetScale && project.geographicTargetScale !== 'any'
          ? project.geographicTargetScale
          : null;
      const userEnforcedScale = Boolean(
        enforcedScale && TIER_RANK[enforcedScale] >= TIER_RANK.regional
      );

      if (sameTierConflict) {
        verdict = 'out_of_area_mismatch';
        verdictLabel = `Out-of-Area Mismatch (${GEOGRAPHIC_TIER_META_MAP[effectiveTargetTier].shortLabel})`;
        isEligible = false;
        isGeographicConfirmed = false;
        confidence = 93;
        interpretiveSummary = `Incompatible ${GEOGRAPHIC_TIER_META_MAP[effectiveTargetTier].shortLabel}-tier geography: Paper studies ${articleAtTier.join(', ')} (${primaryPlaceLabel}), which is outside protocol target (${targetAtTier.join(', ')}).`;
      } else if (directMatchedTargets.length > 0) {
        if (
          userEnforcedScale &&
          enforcedScale &&
          TIER_RANK[detectedScale] < TIER_RANK[enforcedScale]
        ) {
          verdict = 'scale_broader_than_target';
          verdictLabel = `Broader Scale Than Target (${scaleMeta.shortLabel} vs ${targetScaleMeta.shortLabel})`;
          isEligible = false;
          isGeographicConfirmed = false;
          confidence = 85;
          interpretiveSummary = `Paper matches parent area (${directMatchedTargets.join(', ')}) at ${scaleMeta.shortLabel} scale, broader than required ${targetScaleMeta.shortLabel} scale.`;
        } else if (
          targetScale !== 'any' &&
          TIER_RANK[detectedScale] > TIER_RANK[targetScale]
        ) {
          verdict = 'eligible_subscale_contained';
          verdictLabel = `Eligible (${scaleMeta.shortLabel} Contained in ${targetScaleMeta.shortLabel})`;
          isEligible = true;
          isGeographicConfirmed = true;
          confidence = 94;
          interpretiveSummary = `Eligible via hierarchical containment: Sensed ${scaleMeta.shortLabel}-scale study site (${primaryPlaceLabel}), falling within protocol target "${primaryTargetDisplay || directMatchedTargets.join(', ')}".`;
        } else {
          verdict = 'eligible_exact_match';
          verdictLabel = `Eligible (Exact ${scaleMeta.shortLabel} Match)`;
          isEligible = true;
          isGeographicConfirmed = true;
          confidence = 95;
          interpretiveSummary = `Eligible exact match at ${scaleMeta.shortLabel} scale: Paper studies ${primaryPlaceLabel}, directly matching "${primaryTargetDisplay || directMatchedTargets.join(', ')}".`;
        }
      } else if (targetPlaceList.length > 0) {
        const targetParentPlaces = flattenHierarchyPlaces(targetWithParentsH).map((p) =>
          normalizePlaceCore(p)
        );
        const isBroaderParentOfTarget =
          targetScale !== 'any' &&
          TIER_RANK[detectedScale] < TIER_RANK[targetScale] &&
          articleCoreTokens.some((ac) =>
            targetParentPlaces.some((tp) => tp && (ac === tp || ac.includes(tp) || tp.includes(ac)))
          );

        const targetHasCountryOrContinent = Boolean(
          targetWithParentsH.country?.length ||
            targetWithParentsH.continental?.length ||
            targetWithParentsH.regional?.length
        );
        const articleHasCountryOrContinent = Boolean(
          artH.country?.length || artH.continental?.length || artH.regional?.length
        );

        if (isBroaderParentOfTarget) {
          verdict = 'scale_broader_than_target';
          verdictLabel = `Broader ${scaleMeta.shortLabel} Scope vs Target ${targetScaleMeta.shortLabel}`;
          isEligible = false;
          isGeographicConfirmed = false;
          confidence = 86;
          interpretiveSummary = `Broader parent geography (${primaryPlaceLabel} · ${scaleMeta.shortLabel} tier) spans protocol target "${primaryTargetDisplay}", without confirming ${targetScaleMeta.shortLabel}-specific data.`;
        } else if (targetHasCountryOrContinent && !articleHasCountryOrContinent && TIER_RANK[detectedScale] >= TIER_RANK.zonal) {
          verdict = 'unspecified_study_area';
          verdictLabel = `${scaleMeta.shortLabel} Site Detected (Verify Parent ${targetScaleMeta.shortLabel})`;
          isEligible = true;
          isGeographicConfirmed = false;
          confidence = 72;
          interpretiveSummary = `Detected local ${scaleMeta.shortLabel}-scale place (${primaryPlaceLabel}), but parent country/region is omitted; confirm whether this site lies within "${primaryTargetDisplay}".`;
        } else {
          const foreignDetail = foreignCountriesAtCountryTier.length > 0
            ? foreignCountriesAtCountryTier.join(', ')
            : primaryPlaceLabel;
          verdict = 'out_of_area_mismatch';
          verdictLabel = `Out-of-Area Mismatch (${scaleMeta.shortLabel})`;
          isEligible = false;
          isGeographicConfirmed = false;
          confidence = 93;
          interpretiveSummary = `Geographic mismatch: Paper's studied place is ${foreignDetail} (${scaleMeta.shortLabel} tier), outside eligible target "${primaryTargetDisplay || targetPlaceList.join(', ')}".`;
        }
      } else if (
        project.geographicTargetScale &&
        project.geographicTargetScale !== 'any' &&
        TIER_RANK[detectedScale] < TIER_RANK[project.geographicTargetScale]
      ) {
        verdict = 'scale_broader_than_target';
        verdictLabel = `Scale Mismatch (${scaleMeta.shortLabel} < ${targetScaleMeta.shortLabel})`;
        isEligible = false;
        isGeographicConfirmed = false;
        confidence = 84;
        interpretiveSummary = `Scale requirement not met: Paper operates at ${scaleMeta.shortLabel} scale (${primaryPlaceLabel}), whereas protocol enforces ${targetScaleMeta.shortLabel}-level study sites.`;
      } else {
        verdict = 'eligible_exact_match';
        verdictLabel = `Eligible (${scaleMeta.shortLabel})`;
        isEligible = true;
        isGeographicConfirmed = true;
        confidence = 85;
        interpretiveSummary = `Sensed ${scaleMeta.shortLabel}-scale study area (${primaryPlaceLabel}) compatible with protocol geographic configuration.`;
      }
    }
  }

  // Annotate alignment on each traced location connection for UI & traceability
  const taggedConnections: GeographicLocationConnection[] = sensed.studyAreaConnections.map((conn) => {
    const matchesTarget = targetPlaceList.some((tp) => placesMatch(conn.place, tp));
    const matchesExcluded = excludedPlaces.some((ep) => placesMatch(conn.place, ep));
    let alignment: GeographicLocationConnection['alignment'] = 'neutral';
    if (isGlobalTarget) {
      alignment = 'aligned';
    } else if (matchesExcluded) {
      alignment = 'conflict';
    } else if (matchesTarget) {
      alignment = 'aligned';
    } else if (conn.role === 'primary_study_area' && !isEligible) {
      alignment = verdict === 'scale_broader_than_target' ? 'broader' : 'conflict';
    }
    return {
      ...conn,
      alignment,
    };
  });

  const bestEvidenceConn =
    taggedConnections.find((c) => c.role === 'primary_study_area' && c.alignment === 'conflict') ||
    taggedConnections.find((c) => c.role === 'primary_study_area') ||
    taggedConnections[0];

  const evidenceSnippet = bestEvidenceConn
    ? `[${bestEvidenceConn.sourcePart}${bestEvidenceConn.pageNumber ? ` p.${bestEvidenceConn.pageNumber}` : ''}] "${bestEvidenceConn.quote}"`
    : sensed.explicitEvidence.slice(0, 4).join(' · ') ||
      (detectedPlaces.length > 0 ? detectedPlaces.slice(0, 4).join(' · ') : '');

  return {
    detectedScale,
    detectedScaleLabel: scaleMeta.shortLabel,
    detectedPlaces,
    primaryPlaceLabel,
    primaryStudyLocation: sensed.primaryStudyLocation,
    hierarchy: artH,
    targetScale,
    targetTerms: targetPlaceList,
    excludedTargetTerms: excludedPlaces,
    isStrictGeographicScope,
    isGeographicConfirmed,
    verdict,
    verdictLabel,
    isEligible,
    confidence,
    interpretiveSummary,
    evidenceSnippet,
    studyAreaConnections: taggedConnections,
    primaryStudySections: sensed.primaryStudySections,
  };
}

export interface GeographicTierSummaryItem {
  tier: GeographicScaleTier;
  shortLabel: string;
  label: string;
  count: number;
  percentage: number;
  eligibleCount: number;
  mismatchCount: number;
  topPlaces: Array<{ name: string; count: number }>;
}

export interface ProjectGeographicOutcomeSummary {
  totalUnique: number;
  sensedCount: number;
  unspecifiedCount: number;
  eligibleCount: number;
  exactMatchCount: number;
  subscaleContainedCount: number;
  globalScopeCount: number;
  outOfAreaCount: number;
  scaleMismatchCount: number;
  tierBreakdown: GeographicTierSummaryItem[];
  topPlacesByTier: Record<Exclude<GeographicScaleTier, 'unspecified'>, Array<{ name: string; count: number }>>;
  interpretiveHeadline: string;
  interpretiveNarrative: string;
  protocolRecommendations: string[];
  suggestedContextText: string;
  suggestedGeoRuleText: string;
}

export function summarizeProjectGeographicOutcomes(
  project: ReviewProject,
  precomputedAssessments?: Map<string, ArticleGeographicAssessment>
): ProjectGeographicOutcomeSummary {
  const uniqueArticles = (project.articles || []).filter((a) => !a.isDuplicate);
  const totalUnique = uniqueArticles.length;
  const policy = synthesizeProtocolGeographicPolicy(project);

  const tierCounts: Record<GeographicScaleTier, number> = {
    global: 0,
    continental: 0,
    country: 0,
    regional: 0,
    zonal: 0,
    woreda: 0,
    watershed: 0,
    unspecified: 0,
  };
  const tierEligible: Record<GeographicScaleTier, number> = {
    global: 0,
    continental: 0,
    country: 0,
    regional: 0,
    zonal: 0,
    woreda: 0,
    watershed: 0,
    unspecified: 0,
  };
  const tierMismatch: Record<GeographicScaleTier, number> = {
    global: 0,
    continental: 0,
    country: 0,
    regional: 0,
    zonal: 0,
    woreda: 0,
    watershed: 0,
    unspecified: 0,
  };

  const placeCountMaps: Record<Exclude<GeographicScaleTier, 'unspecified'>, Map<string, number>> = {
    global: new Map(),
    continental: new Map(),
    country: new Map(),
    regional: new Map(),
    zonal: new Map(),
    woreda: new Map(),
    watershed: new Map(),
  };

  const tierFinestPlacesMap: Record<GeographicScaleTier, Map<string, number>> = {
    global: new Map(),
    continental: new Map(),
    country: new Map(),
    regional: new Map(),
    zonal: new Map(),
    woreda: new Map(),
    watershed: new Map(),
    unspecified: new Map(),
  };

  let eligibleCount = 0;
  let exactMatchCount = 0;
  let subscaleContainedCount = 0;
  let globalScopeCount = 0;
  let outOfAreaCount = 0;
  let scaleMismatchCount = 0;
  let unspecifiedCount = 0;

  for (const art of uniqueArticles) {
    const assessment =
      precomputedAssessments?.get(art.id) || assessGeographicEligibility(art, project);

    const tier = assessment.detectedScale;
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;

    if (assessment.isEligible) {
      tierEligible[tier] = (tierEligible[tier] || 0) + 1;
      eligibleCount++;
    } else {
      tierMismatch[tier] = (tierMismatch[tier] || 0) + 1;
    }

    if (assessment.verdict === 'eligible_exact_match') exactMatchCount++;
    else if (assessment.verdict === 'eligible_subscale_contained') subscaleContainedCount++;
    else if (assessment.verdict === 'eligible_global_scope') globalScopeCount++;
    else if (assessment.verdict === 'out_of_area_mismatch') outOfAreaCount++;
    else if (assessment.verdict === 'scale_broader_than_target') scaleMismatchCount++;
    else unspecifiedCount++;

    (Object.keys(placeCountMaps) as Array<Exclude<GeographicScaleTier, 'unspecified'>>).forEach((tKey) => {
      const list = assessment.hierarchy[tKey] || [];
      for (const placeName of list) {
        placeCountMaps[tKey].set(placeName, (placeCountMaps[tKey].get(placeName) || 0) + 1);
      }
    });

    if (tier !== 'unspecified') {
      const finestList = assessment.hierarchy[tier] || [];
      for (const p of finestList) {
        tierFinestPlacesMap[tier].set(p, (tierFinestPlacesMap[tier].get(p) || 0) + 1);
      }
    }
  }

  const sortMap = (m: Map<string, number>, limit = 6) =>
    Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, limit);

  const topPlacesByTier: ProjectGeographicOutcomeSummary['topPlacesByTier'] = {
    global: sortMap(placeCountMaps.global),
    continental: sortMap(placeCountMaps.continental),
    country: sortMap(placeCountMaps.country),
    regional: sortMap(placeCountMaps.regional),
    zonal: sortMap(placeCountMaps.zonal),
    woreda: sortMap(placeCountMaps.woreda),
    watershed: sortMap(placeCountMaps.watershed),
  };

  const tierBreakdown: GeographicTierSummaryItem[] = GEOGRAPHIC_SCALE_TIERS.map((meta) => ({
    tier: meta.tier,
    shortLabel: meta.shortLabel,
    label: meta.label,
    count: tierCounts[meta.tier],
    percentage: totalUnique > 0 ? Math.round((tierCounts[meta.tier] / totalUnique) * 100) : 0,
    eligibleCount: tierEligible[meta.tier],
    mismatchCount: tierMismatch[meta.tier],
    topPlaces: sortMap(tierFinestPlacesMap[meta.tier], 5),
  }));

  const sensedCount = Math.max(0, totalUnique - tierCounts.unspecified);
  const sensedPct = totalUnique > 0 ? Math.round((sensedCount / totalUnique) * 100) : 0;

  const activeTiers = tierBreakdown
    .filter((t) => t.tier !== 'unspecified' && t.count > 0)
    .sort((a, b) => b.count - a.count);
  const dominantTier = activeTiers[0];

  const notableLocalPlaces = [
    ...topPlacesByTier.watershed.slice(0, 2).map((p) => `${p.name} (n=${p.count})`),
    ...topPlacesByTier.woreda.slice(0, 2).map((p) => `${p.name} (n=${p.count})`),
    ...topPlacesByTier.zonal.slice(0, 2).map((p) => `${p.name} (n=${p.count})`),
    ...topPlacesByTier.regional.slice(0, 2).map((p) => `${p.name} (n=${p.count})`),
  ].slice(0, 5);

  const topCountriesText = topPlacesByTier.country
    .slice(0, 4)
    .map((p) => `${p.name} (${p.count})`)
    .join(', ');

  let interpretiveHeadline = 'No records in active partition yet.';
  let interpretiveNarrative =
    'Add or import studies to generate multi-scale geographic eligibility diagnostics across Global, Continental, Country, Regional, Zonal, Woreda, and Watershed tiers.';

  if (totalUnique > 0) {
    interpretiveHeadline = `${sensedCount}/${totalUnique} (${sensedPct}%) unique records spatially sensed · ${eligibleCount} eligible · ${outOfAreaCount + scaleMismatchCount} excluded (out-of-area)`;
    const tierSummaryStr = activeTiers
      .map((t) => `${t.shortLabel}: ${t.count}`)
      .join(', ');
    interpretiveNarrative =
      `Geographic sensing across ${totalUnique} unique studies identified ${sensedCount} (${sensedPct}%) records with explicit study locations (${tierSummaryStr || 'none'}). ` +
      (subscaleContainedCount > 0
        ? `${subscaleContainedCount} micro-scale studies (Watershed/Woreda/Zonal/Regional) passed via hierarchical parent containment. `
        : '') +
      (outOfAreaCount > 0
        ? `${outOfAreaCount} record(s) conflict with active target "${policy.primaryTargetDisplay}" and will be excluded under PRISMA Wrong Study Area. `
        : 'Zero out-of-area conflicts detected against the active geographic protocol. ') +
      (notableLocalPlaces.length > 0
        ? `Key local sites: ${notableLocalPlaces.join('; ')}.`
        : topCountriesText
        ? `Detected countries: ${topCountriesText}.`
        : '');
  }

  const protocolRecommendations: string[] = [];
  if (totalUnique > 0) {
    if (tierCounts.watershed + tierCounts.woreda + tierCounts.zonal > 0) {
      protocolRecommendations.push(
        `Detected ${tierCounts.watershed} Watershed, ${tierCounts.woreda} Woreda, and ${tierCounts.zonal} Zonal study sites — ensure Context/Setting explicitly allows nested local-scale sites under ${policy.primaryTargetDisplay}.`
      );
    }
    if (outOfAreaCount > 0) {
      protocolRecommendations.push(
        `${outOfAreaCount} study/studies fall outside "${policy.primaryTargetDisplay}" — excluded under PRISMA "Wrong Study Area".`
      );
    }
    if (tierCounts.unspecified > 0) {
      protocolRecommendations.push(
        `${tierCounts.unspecified} record(s) have unspecified study area in screened text — marked uncertain for full-text verification.`
      );
    }
    if (dominantTier && dominantTier.tier !== 'unspecified') {
      protocolRecommendations.push(
        `Dominant spatial resolution is ${dominantTier.shortLabel} (${dominantTier.count}/${totalUnique}, ${dominantTier.percentage}%) — suitable for ${
          TIER_RANK[dominantTier.tier] >= 5 ? 'site-specific / catchment subgroup synthesis' : 'macro comparative synthesis'
        }.`
      );
    }
  }

  const contextSegments: string[] = [];
  contextSegments.push(`Target Geographic Scope: ${policy.primaryTargetDisplay}`);
  if (policy.excludedPlaces.length > 0) {
    contextSegments.push(`Excluded Areas: ${policy.excludedPlaces.slice(0, 5).join(', ')}`);
  }
  if (topPlacesByTier.continental.length > 0) {
    contextSegments.push(
      `Continental: ${topPlacesByTier.continental.slice(0, 3).map((x) => x.name).join(', ')}`
    );
  }
  if (topPlacesByTier.country.length > 0) {
    contextSegments.push(
      `Countries: ${topPlacesByTier.country.slice(0, 4).map((x) => x.name).join(', ')}`
    );
  }
  if (topPlacesByTier.regional.length > 0) {
    contextSegments.push(
      `Regions: ${topPlacesByTier.regional.slice(0, 4).map((x) => x.name).join(', ')}`
    );
  }
  if (topPlacesByTier.zonal.length > 0) {
    contextSegments.push(
      `Zones: ${topPlacesByTier.zonal.slice(0, 3).map((x) => x.name).join(', ')}`
    );
  }
  if (topPlacesByTier.woreda.length > 0) {
    contextSegments.push(
      `Woredas/Districts: ${topPlacesByTier.woreda.slice(0, 4).map((x) => x.name).join(', ')}`
    );
  }
  if (topPlacesByTier.watershed.length > 0) {
    contextSegments.push(
      `Watersheds/Basins: ${topPlacesByTier.watershed.slice(0, 4).map((x) => x.name).join(', ')}`
    );
  }

  const suggestedContextText =
    contextSegments.join(' | ') ||
    `Geographic Setting: ${policy.primaryTargetDisplay} (supports Global, Continental, Country, Regional, Zonal, Woreda, and Watershed study scales).`;

  const suggestedGeoRuleText = `Include empirical studies conducted within ${
    policy.primaryTargetDisplay
  }${
    project.geographicTargetScale && project.geographicTargetScale !== 'any'
      ? ` (target scale: ${GEOGRAPHIC_TIER_META_MAP[project.geographicTargetScale].shortLabel} or nested sub-scale)`
      : ' (including nested Regional, Zonal, Woreda, and Watershed/Catchment localities)'
  }. Exclude studies conducted outside ${policy.primaryTargetDisplay}.`;

  return {
    totalUnique,
    sensedCount,
    unspecifiedCount: tierCounts.unspecified,
    eligibleCount,
    exactMatchCount,
    subscaleContainedCount,
    globalScopeCount,
    outOfAreaCount,
    scaleMismatchCount,
    tierBreakdown,
    topPlacesByTier,
    interpretiveHeadline,
    interpretiveNarrative,
    protocolRecommendations,
    suggestedContextText,
    suggestedGeoRuleText,
  };
}

// ---------------------------------------------------------------------------
// Cascading Multi-Scale Geographic Dropdown Options (Globally -> Watershed)
// ---------------------------------------------------------------------------
export const CONTINENT_DROPDOWN_OPTIONS: string[] = [
  'Global',
  'Africa',
  'East Africa',
  'Sub-Saharan Africa',
  'West Africa',
  'North Africa',
  'Southern Africa',
  'Asia',
  'South Asia',
  'East Asia',
  'Southeast Asia',
  'Middle East',
  'Europe',
  'North America',
  'South America',
  'Oceania',
];

export const COUNTRY_OPTIONS_BY_CONTINENT: Record<string, string[]> = {
  Africa: ['Ethiopia', 'Kenya', 'Tanzania', 'Uganda', 'Rwanda', 'Nigeria', 'Ghana', 'Egypt', 'Morocco', 'South Africa', 'Sudan', 'Malawi', 'Zambia'],
  'East Africa': ['Ethiopia', 'Kenya', 'Tanzania', 'Uganda', 'Rwanda', 'Burundi', 'Sudan', 'South Sudan', 'Eritrea', 'Somalia'],
  'Sub-Saharan Africa': ['Ethiopia', 'Kenya', 'Tanzania', 'Uganda', 'Rwanda', 'Nigeria', 'Ghana', 'Cameroon', 'South Africa', 'Malawi', 'Zambia'],
  'West Africa': ['Nigeria', 'Ghana', 'Senegal', 'Mali', 'Burkina Faso', 'Benin', 'Cameroon'],
  'North Africa': ['Egypt', 'Morocco', 'Tunisia', 'Algeria', 'Libya'],
  'Southern Africa': ['South Africa', 'Malawi', 'Zambia', 'Zimbabwe', 'Mozambique', 'Botswana', 'Namibia'],
  Asia: ['China', 'India', 'Nepal', 'Pakistan', 'Bangladesh', 'Japan', 'South Korea', 'Vietnam', 'Indonesia', 'Thailand', 'Iran', 'Turkey'],
  'South Asia': ['India', 'Nepal', 'Pakistan', 'Bangladesh', 'Sri Lanka'],
  'East Asia': ['China', 'Japan', 'South Korea', 'Taiwan', 'Mongolia'],
  'Southeast Asia': ['Vietnam', 'Indonesia', 'Thailand', 'Malaysia', 'Philippines', 'Cambodia'],
  'Middle East': ['Iran', 'Turkey', 'Saudi Arabia', 'Jordan', 'Israel', 'Iraq'],
  Europe: ['Spain', 'Italy', 'Germany', 'France', 'United Kingdom', 'Portugal', 'Greece', 'Netherlands', 'Poland', 'Switzerland'],
  'North America': ['United States', 'Canada', 'Mexico'],
  'South America': ['Brazil', 'Colombia', 'Peru', 'Argentina', 'Chile', 'Ecuador'],
  Oceania: ['Australia', 'New Zealand', 'Papua New Guinea'],
};

export const ALL_COUNTRY_DROPDOWN_OPTIONS: string[] = Array.from(
  new Set(Object.values(COUNTRY_OPTIONS_BY_CONTINENT).flat())
).sort();

export const REGIONS_BY_COUNTRY: Record<string, string[]> = {
  Ethiopia: [
    'Amhara Region',
    'Oromia Region',
    'Tigray Region',
    'SNNPR',
    'Sidama Region',
    'Benishangul-Gumuz Region',
    'Afar Region',
    'Somali Region',
    'Gambela Region',
    'Central Ethiopia Region',
    'South Ethiopia Region',
    'Addis Ababa',
  ],
  Kenya: ['Rift Valley', 'Central Highlands', 'Nyanza', 'Western Kenya', 'Coastal Region', 'Eastern Kenya'],
  China: ['Loess Plateau', 'Sichuan Basin', 'Yunnan-Guizhou Plateau', 'Northeast China', 'North China Plain', 'Yangtze River Region'],
  India: ['Western Ghats', 'Himalayan Foothills', 'Deccan Plateau', 'Indo-Gangetic Plain', 'Rajasthan', 'Karnataka', 'Maharashtra'],
  Brazil: ['Mato Grosso', 'Minas Gerais', 'São Paulo', 'Bahia', 'Paraná', 'Amazon Basin'],
  Iran: ['Fars Province', 'Golestan Province', 'Mazandaran', 'Kermanshah', 'Lorestan', 'Khuzestan'],
  Spain: ['Andalusia', 'Murcia', 'Valencia', 'Catalonia', 'Aragon'],
  'United States': ['Midwest', 'Great Plains', 'California', 'Pacific Northwest', 'Southeast US', 'Texas'],
};

export const ZONES_BY_REGION: Record<string, string[]> = {
  'Amhara Region': [
    'East Gojjam Zone',
    'West Gojjam Zone',
    'North Gondar Zone',
    'South Gondar Zone',
    'Central Gondar Zone',
    'South Wollo Zone',
    'North Wollo Zone',
    'North Shewa Zone',
    'Awi Zone',
    'Wag Hemra Zone',
    'Oromia Special Zone',
  ],
  'Oromia Region': ['East Shewa Zone', 'West Shewa Zone', 'North Shewa Zone', 'Jimma Zone', 'East Wollega Zone', 'West Wollega Zone', 'Arsi Zone', 'Bale Zone', 'East Hararghe Zone'],
  'Tigray Region': ['Central Tigray Zone', 'Eastern Tigray Zone', 'Southern Tigray Zone', 'North Western Tigray Zone'],
  'SNNPR': ['Gurage Zone', 'Hadiya Zone', 'Kembata Tembaro Zone', 'Wolayita Zone', 'Gamo Zone'],
};

export const WOREDAS_BY_ZONE: Record<string, string[]> = {
  'West Gojjam Zone': ['Mecha Woreda', 'Yilmana Densa Woreda', 'Bahir Dar Zuria Woreda', 'Jabitehnan Woreda', 'Bure Woreda', 'Sekela Woreda'],
  'East Gojjam Zone': ['Gozamin Woreda', 'Aneded Woreda', 'Machakel Woreda', 'Enebsie Sar Midir Woreda', 'Hulet Eju Enesie Woreda', 'Sinan Woreda', 'Baso Liben Woreda'],
  'South Gondar Zone': ['Fogera Woreda', 'Farta Woreda', 'Libo Kemkem Woreda', 'Ebenat Woreda', 'Este Woreda', 'Lay Gayint Woreda'],
  'North Gondar Zone': ['Dabat Woreda', 'Debark Woreda', 'Wogera Woreda', 'Lay Armachiho Woreda', 'Gondar Zuria Woreda'],
  'Central Gondar Zone': ['Gondar Zuria Woreda', 'Lay Armachiho Woreda', 'Chilga Woreda', 'Takusa Woreda'],
  'South Wollo Zone': ['Dessie Zuria Woreda', 'Kalu Woreda', 'Tehuledere Woreda', 'Kutaber Woreda', 'Legambo Woreda'],
  'Jimma Zone': ['Kersa Woreda', 'Omo Nada Woreda', 'Mana Woreda', 'Deddo Woreda'],
};

export const WATERSHED_DROPDOWN_OPTIONS: string[] = [
  'Upper Blue Nile (Abay) Basin',
  'Debre Mawi Watershed',
  'Gumara Watershed',
  'Ribb Watershed',
  'Jedeb Watershed',
  'Anjeni Watershed',
  'Chemoga Watershed',
  'Gilgel Abay Catchment',
  'Lake Tana Basin',
  'Guder Watershed',
  'Awash River Basin',
  'Tekezé River Basin',
  'Omo-Gibe Basin',
  'Rift Valley Lakes Basin',
  'Koga Watershed',
  'Andit Tid Watershed',
  'Maybar Watershed',
  'Enabered Watershed',
];

export function composeGeographicEligibilityString(
  sel?: GeographicSelections,
  boundaryPlaces?: string[]
): { displayText: string; finestScale: GeographicScaleTier | 'any' } {
  const orderedParts = [
    sel?.watershed?.trim(),
    sel?.woreda?.trim(),
    sel?.zone?.trim(),
    sel?.region?.trim(),
    sel?.country?.trim(),
    sel?.continent?.trim(),
  ].filter((v): v is string => Boolean(v));

  let finestScale: GeographicScaleTier | 'any' = 'any';
  if (sel?.watershed?.trim()) finestScale = 'watershed';
  else if (sel?.woreda?.trim()) finestScale = 'woreda';
  else if (sel?.zone?.trim()) finestScale = 'zonal';
  else if (sel?.region?.trim()) finestScale = 'regional';
  else if (sel?.country?.trim()) finestScale = 'country';
  else if (sel?.continent?.trim()) {
    finestScale = /^global$/i.test(sel.continent.trim()) ? 'global' : 'continental';
  }

  const uniqueParts: string[] = [];
  for (const p of orderedParts) {
    if (!uniqueParts.some((u) => u.toLowerCase() === p.toLowerCase())) {
      uniqueParts.push(p);
    }
  }

  if (boundaryPlaces && boundaryPlaces.length > 0 && uniqueParts.length === 0) {
    uniqueParts.push(...boundaryPlaces.slice(0, 5));
  }

  const base = uniqueParts.join(', ') || 'Global';
  const excl = sel?.excludedAreas?.trim();
  return {
    displayText: excl ? `${base} (excluding ${excl})` : base,
    finestScale,
  };
}

