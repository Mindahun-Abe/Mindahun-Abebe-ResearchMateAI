import {
  Article,
  ArticleGeographicAssessment,
  ArticleGeographicHierarchy,
  GeographicEligibilityVerdict,
  GeographicScaleTier,
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
    examples: 'Ethiopia, Kenya, China, India, Spain, Brazil, USA',
  },
  {
    tier: 'regional',
    label: 'Regional (State / Province / Highlands)',
    shortLabel: 'Regional',
    rank: 4,
    description: 'Administrative regional states, provinces, plateaus, or highland regions.',
    examples: 'Amhara Region, Oromia, Tigray, Loess Plateau, Andalusia, Bavaria',
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
]);

function isValidPlaceCandidate(raw: string): boolean {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 3 || cleaned.length > 60) return false;
  const words = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  // Reject if every word is a stopword or first/last non-preposition word is a stopword
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

// Curated Country Gazetteer + Demonym / Alias Normalization
const COUNTRY_CANONICAL_PATTERNS: Array<{ canonical: string; regex: RegExp; continent: string[] }> = [
  { canonical: 'Ethiopia', regex: /\b(Ethiopia|Ethiopian)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Kenya', regex: /\b(Kenya|Kenyan)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Tanzania', regex: /\b(Tanzania|Tanzanian)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Uganda', regex: /\b(Uganda|Ugandan)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Rwanda', regex: /\b(Rwanda|Rwandan)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Sudan', regex: /\b(Sudan|Sudanese)\b/i, continent: ['East Africa', 'Africa'] },
  { canonical: 'South Sudan', regex: /\bSouth\s+Sudan\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Eritrea', regex: /\b(Eritrea|Eritrean)\b/i, continent: ['East Africa', 'Africa'] },
  { canonical: 'Somalia', regex: /\b(Somalia|Somali)\b/i, continent: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Egypt', regex: /\b(Egypt|Egyptian)\b/i, continent: ['North Africa', 'Africa', 'Middle East'] },
  { canonical: 'Nigeria', regex: /\b(Nigeria|Nigerian)\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Ghana', regex: /\b(Ghana|Ghanaian)\b/i, continent: ['West Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'South Africa', regex: /\bSouth\s+Africa(?:n)?\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Morocco', regex: /\b(Morocco|Moroccan)\b/i, continent: ['North Africa', 'Africa', 'Mediterranean'] },
  { canonical: 'Tunisia', regex: /\b(Tunisia|Tunisian)\b/i, continent: ['North Africa', 'Africa', 'Mediterranean'] },
  { canonical: 'Algeria', regex: /\b(Algeria|Algerian)\b/i, continent: ['North Africa', 'Africa', 'Mediterranean'] },
  { canonical: 'Malawi', regex: /\b(Malawi|Malawian)\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Zambia', regex: /\b(Zambia|Zambian)\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Zimbabwe', regex: /\b(Zimbabwe|Zimbabwean)\b/i, continent: ['Southern Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Cameroon', regex: /\b(Cameroon|Cameroonian)\b/i, continent: ['Sub-Saharan Africa', 'Africa'] },
  { canonical: 'China', regex: /\b(China|Chinese|P\.?\s*R\.?\s*China)\b/i, continent: ['East Asia', 'Asia'] },
  { canonical: 'India', regex: /\b(India|Indian)\b/i, continent: ['South Asia', 'Asia'] },
  { canonical: 'Iran', regex: /\b(Iran|Iranian)\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Turkey', regex: /\b(Turkey|Türkiye|Turkish)\b/i, continent: ['Middle East', 'Mediterranean', 'Asia', 'Europe'] },
  { canonical: 'Pakistan', regex: /\b(Pakistan|Pakistani)\b/i, continent: ['South Asia', 'Asia'] },
  { canonical: 'Nepal', regex: /\b(Nepal|Nepalese|Nepali)\b/i, continent: ['South Asia', 'Asia'] },
  { canonical: 'Bangladesh', regex: /\b(Bangladesh|Bangladeshi)\b/i, continent: ['South Asia', 'Asia'] },
  { canonical: 'Vietnam', regex: /\b(Vietnam|Viet\s+Nam|Vietnamese)\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Indonesia', regex: /\b(Indonesia|Indonesian)\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Thailand', regex: /\b(Thailand|Thai)\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Malaysia', regex: /\b(Malaysia|Malaysian)\b/i, continent: ['Southeast Asia', 'Asia'] },
  { canonical: 'Japan', regex: /\b(Japan|Japanese)\b/i, continent: ['East Asia', 'Asia'] },
  { canonical: 'South Korea', regex: /\b(South\s+Korea|Republic\s+of\s+Korea|Korean)\b/i, continent: ['East Asia', 'Asia'] },
  { canonical: 'USA', regex: /\b(USA|U\.S\.A\.|U\.S\.|United\s+States(?:\s+of\s+America)?|American)\b/i, continent: ['North America'] },
  { canonical: 'Canada', regex: /\b(Canada|Canadian)\b/i, continent: ['North America'] },
  { canonical: 'Mexico', regex: /\b(Mexico|Mexican)\b/i, continent: ['North America', 'Latin America'] },
  { canonical: 'Brazil', regex: /\b(Brazil|Brazilian)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Argentina', regex: /\b(Argentina|Argentine|Argentinian)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Chile', regex: /\b(Chile|Chilean)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Peru', regex: /\b(Peru|Peruvian)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Colombia', regex: /\b(Colombia|Colombian)\b/i, continent: ['South America', 'Latin America'] },
  { canonical: 'Spain', regex: /\b(Spain|Spanish)\b/i, continent: ['Europe', 'Mediterranean'] },
  { canonical: 'Italy', regex: /\b(Italy|Italian)\b/i, continent: ['Europe', 'Mediterranean'] },
  { canonical: 'Germany', regex: /\b(Germany|German)\b/i, continent: ['Europe'] },
  { canonical: 'France', regex: /\b(France|French)\b/i, continent: ['Europe'] },
  { canonical: 'United Kingdom', regex: /\b(United\s+Kingdom|UK|U\.K\.|England|Scotland|Wales|British)\b/i, continent: ['Europe'] },
  { canonical: 'Portugal', regex: /\b(Portugal|Portuguese)\b/i, continent: ['Europe', 'Mediterranean'] },
  { canonical: 'Greece', regex: /\b(Greece|Greek)\b/i, continent: ['Europe', 'Mediterranean'] },
  { canonical: 'Netherlands', regex: /\b(Netherlands|Dutch)\b/i, continent: ['Europe'] },
  { canonical: 'Belgium', regex: /\b(Belgium|Belgian)\b/i, continent: ['Europe'] },
  { canonical: 'Switzerland', regex: /\b(Switzerland|Swiss)\b/i, continent: ['Europe'] },
  { canonical: 'Austria', regex: /\b(Austria|Austrian)\b/i, continent: ['Europe'] },
  { canonical: 'Poland', regex: /\b(Poland|Polish)\b/i, continent: ['Europe'] },
  { canonical: 'Denmark', regex: /\b(Denmark|Danish)\b/i, continent: ['Europe'] },
  { canonical: 'Sweden', regex: /\b(Sweden|Swedish)\b/i, continent: ['Europe'] },
  { canonical: 'Norway', regex: /\b(Norway|Norwegian)\b/i, continent: ['Europe'] },
  { canonical: 'Australia', regex: /\b(Australia|Australian)\b/i, continent: ['Oceania'] },
  { canonical: 'New Zealand', regex: /\bNew\s+Zealand\b/i, continent: ['Oceania'] },
  { canonical: 'Saudi Arabia', regex: /\bSaudi\s+Arabia\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Jordan', regex: /\bJordan\b/i, continent: ['Middle East', 'Asia'] },
  { canonical: 'Israel', regex: /\b(Israel|Israeli)\b/i, continent: ['Middle East', 'Mediterranean'] },
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

// Curated Regional, Zonal, Woreda, and Watershed Knowledge Links (enables sub-scale -> parent inference)
interface CuratedPlaceEntry {
  canonical: string;
  tier: 'regional' | 'zonal' | 'woreda' | 'watershed';
  regex: RegExp;
  parentRegional?: string;
  parentCountry: string;
  parentContinental: string[];
}

const CURATED_PLACES: CuratedPlaceEntry[] = [
  // --- Ethiopian Regions & Major Highlands ---
  { canonical: 'Amhara Region', tier: 'regional', regex: /\bAmhara(?:\s+(?:Regional\s+State|Region))?\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Oromia Region', tier: 'regional', regex: /\bOromia(?:\s+(?:Regional\s+State|Region))?\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Tigray Region', tier: 'regional', regex: /\bTigray(?:\s+(?:Regional\s+State|Region))?\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'SNNPR', tier: 'regional', regex: /\b(SNNPR|Southern\s+Nations,?\s+Nationalities)\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Sidama Region', tier: 'regional', regex: /\bSidama(?:\s+(?:Regional\s+State|Region))?\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Benishangul-Gumuz', tier: 'regional', regex: /\bBenishangul[- ]Gumuz\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Afar Region', tier: 'regional', regex: /\bAfar(?:\s+Region)?\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Somali Region', tier: 'regional', regex: /\bSomali\s+Region\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Ethiopian Highlands', tier: 'regional', regex: /\b(Ethiopian\s+Highlands|Northern\s+Ethiopian\s+Highlands|Northwestern\s+Ethiopia|Northern\s+Ethiopia|Central\s+Ethiopia|Southern\s+Ethiopia)\b/i, parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },

  // --- Global Major Regions ---
  { canonical: 'Loess Plateau', tier: 'regional', regex: /\bLoess\s+Plateau\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Sichuan Basin', tier: 'regional', regex: /\bSichuan\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Yunnan', tier: 'regional', regex: /\bYunnan\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Andalusia', tier: 'regional', regex: /\b(Andalusia|Andalucia)\b/i, parentCountry: 'Spain', parentContinental: ['Europe', 'Mediterranean'] },
  { canonical: 'Valencia Region', tier: 'regional', regex: /\bValencia\b/i, parentCountry: 'Spain', parentContinental: ['Europe', 'Mediterranean'] },
  { canonical: 'Navarro Valley', tier: 'regional', regex: /\bNavarro\s+Valley\b/i, parentCountry: 'Spain', parentContinental: ['Europe', 'Mediterranean'] },
  { canonical: 'Tuscany', tier: 'regional', regex: /\bTuscany\b/i, parentCountry: 'Italy', parentContinental: ['Europe', 'Mediterranean'] },
  { canonical: 'Bavaria', tier: 'regional', regex: /\bBavaria\b/i, parentCountry: 'Germany', parentContinental: ['Europe'] },
  { canonical: 'Crete', tier: 'regional', regex: /\bCrete\b/i, parentCountry: 'Greece', parentContinental: ['Europe', 'Mediterranean'] },
  { canonical: 'California', tier: 'regional', regex: /\bCalifornia\b/i, parentCountry: 'USA', parentContinental: ['North America'] },
  { canonical: 'Cordoba', tier: 'regional', regex: /\bCordoba\b/i, parentCountry: 'Argentina', parentContinental: ['South America', 'Latin America'] },
  { canonical: 'Zealand', tier: 'regional', regex: /\bZealand\b/i, parentCountry: 'Denmark', parentContinental: ['Europe'] },

  // --- Ethiopian Zones ---
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
  { canonical: 'Arsi Zone', tier: 'zonal', regex: /\b(?:West\s+)?Arsi\s+Zone\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Bale Zone', tier: 'zonal', regex: /\bBale\s+Zone\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Jimma Zone', tier: 'zonal', regex: /\bJimma\s+Zone\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'East Hararghe Zone', tier: 'zonal', regex: /\b(?:East|West)\s+Hararghe(?:\s+Zone)?\b/i, parentRegional: 'Oromia Region', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Wolayta Zone', tier: 'zonal', regex: /\bWolayta(?:\s+Zone)?\b/i, parentRegional: 'SNNPR', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Hadiya Zone', tier: 'zonal', regex: /\bHadiya(?:\s+Zone)?\b/i, parentRegional: 'SNNPR', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },
  { canonical: 'Gurage Zone', tier: 'zonal', regex: /\bGurage(?:\s+Zone)?\b/i, parentRegional: 'SNNPR', parentCountry: 'Ethiopia', parentContinental: ['East Africa', 'Sub-Saharan Africa', 'Africa'] },

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

  // --- Ethiopian & Global Landmark Watersheds / Catchments / Basins ---
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
  { canonical: 'Yellow River Basin', tier: 'watershed', regex: /\bYellow\s+River(?:\s+Basin)?\b/i, parentRegional: 'Loess Plateau', parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Yangtze River Basin', tier: 'watershed', regex: /\bYangtze(?:\s+(?:River\s+)?Basin)?\b/i, parentCountry: 'China', parentContinental: ['East Asia', 'Asia'] },
  { canonical: 'Mekong Basin', tier: 'watershed', regex: /\bMekong(?:\s+(?:River\s+)?Basin|Delta)?\b/i, parentCountry: 'Vietnam', parentContinental: ['Southeast Asia', 'Asia'] },
  { canonical: 'Amazon Basin', tier: 'watershed', regex: /\bAmazon(?:\s+(?:River\s+)?Basin)?\b/i, parentCountry: 'Brazil', parentContinental: ['South America', 'Latin America'] },
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

function extractPlacesFromText(
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
    if (country.regex.test(text)) {
      countryList.push(country.canonical);
      if (includeInferredParents) {
        country.continent.forEach((cont) => continentalList.push(cont));
      }
    }
  }

  // 4. Curated hierarchical places (watersheds, woredas, zones, regions)
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

  // 5. Structural regex sensing for arbitrary / custom local places across ANY country:
  // 5a. Watershed / Catchment / Basin / Micro-watershed / Sub-basin
  const watershedSuffixRegex =
    /\b((?:[A-Z][A-Za-z0-9'’-]+|Upper|Lower|Middle)(?:\s+(?:[A-Z][A-Za-z0-9'’-]+|of|and|the)){0,3})\s+(micro-?watershed|sub-?watershed|watershed|sub-?catchment|catchment|sub-?basin|river\s+basin|drainage\s+basin|basin|headwater)\b/g;
  for (const match of text.matchAll(watershedSuffixRegex)) {
    const namePart = (match[1] || '').trim();
    const unitPart = (match[2] || '').trim();
    if (isValidPlaceCandidate(namePart)) {
      const full = `${titleCasePlace(namePart)} ${titleCasePlace(unitPart)}`;
      watershedList.push(full);
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

  // 5b. Woreda / Wereda / Kebele / District / Municipality / County
  const woredaSuffixRegex =
    /\b([A-Z][A-Za-z0-9'’-]+(?:\s+[A-Z][A-Za-z0-9'’-]+){0,3})\s+([Ww]oredas?|[Ww]eredas?|[Ww]oradas?|[Kk]ebeles?|[Pp]easant\s+[Aa]ssociations?|[Ss]ub-?[Dd]istricts?|[Dd]istricts?|[Mm]unicipalit(?:y|ies)|[Cc]ommunes?|[Cc]ount(?:y|ies)|[Pp]arish(?:es)?|[Tt]ownships?|[Tt]ehsils?|[Tt]aluks?)\b/g;
  for (const match of text.matchAll(woredaSuffixRegex)) {
    const namePart = (match[1] || '').trim();
    const unitRaw = (match[2] || '').trim();
    const unitLower = unitRaw.toLowerCase();
    if (isValidPlaceCandidate(namePart)) {
      const normalizedUnit = unitLower.startsWith('woreda') || unitLower.startsWith('wereda') || unitLower.startsWith('worada')
        ? 'Woreda'
        : unitLower.startsWith('kebele')
        ? 'Kebele'
        : titleCasePlace(unitRaw.replace(/ies$/i, 'y').replace(/s$/i, ''));
      woredaList.push(`${titleCasePlace(namePart)} ${normalizedUnit}`);
      explicitEvidence.push(match[0]);
      // Woreda/Wereda/Kebele are uniquely Ethiopian administrative divisions
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

  // 5c. Zonal (Zone / Prefecture / Department)
  const zonalSuffixRegex =
    /\b([A-Z][A-Za-z0-9'’-]+(?:\s+[A-Z][A-Za-z0-9'’-]+){0,3})\s+([Zz]one|[Zz]onal\s+[Aa]dministration|[Pp]refecture)\b/g;
  for (const match of text.matchAll(zonalSuffixRegex)) {
    const namePart = (match[1] || '').trim();
    const unitPart = (match[2] || '').trim();
    if (isValidPlaceCandidate(namePart)) {
      zonalList.push(`${titleCasePlace(namePart)} ${unitPart.toLowerCase().includes('prefecture') ? 'Prefecture' : 'Zone'}`);
      explicitEvidence.push(match[0]);
    }
  }

  // 5d. Regional (Regional State / Region / Province / State / Highlands / Plateau)
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

  // 5e. Fallback generic "study area / study site / conducted in <ProperName>" sensing
  const sitePattern =
    /\b(?:study\s+(?:area|site|location)|conducted\s+in|located\s+in|carried\s+out\s+in)\s+(?:the\s+)?([A-Z][A-Za-z0-9'’-]+(?:\s+[A-Z][A-Za-z0-9'’-]+){0,3})(?=[,.;:\s)])/g;
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
          // Local site / area without explicit tier word defaults to watershed/site check
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

function getTargetScaleTier(
  project: ReviewProject,
  targetHierarchy: ArticleGeographicHierarchy
): GeographicScaleTier | 'any' {
  if (project.geographicTargetScale && project.geographicTargetScale !== 'any') {
    return project.geographicTargetScale;
  }
  const geoRaw = (project.geographicEligibility || '').toLowerCase();
  if (!geoRaw.trim() || /\b(global|globally|worldwide|all\s+countries|international|no\s+geographic\s+restriction)\b/i.test(geoRaw)) {
    return 'global';
  }
  const sensed = getFinestScaleTier(targetHierarchy);
  if (sensed !== 'unspecified') return sensed;
  // Fallback keyword cues for scale tier when user types e.g. "Woreda level" or "Watershed studies"
  if (/\b(watershed|catchment|micro-?watershed|sub-?basin|basin)\b/i.test(geoRaw)) return 'watershed';
  if (/\b(woreda|wereda|kebele|district|municipality)\b/i.test(geoRaw)) return 'woreda';
  if (/\b(zone|zonal|prefecture)\b/i.test(geoRaw)) return 'zonal';
  if (/\b(region|regional|province|state|highlands)\b/i.test(geoRaw)) return 'regional';
  if (/\b(country|national)\b/i.test(geoRaw)) return 'country';
  if (/\b(continent|continental)\b/i.test(geoRaw)) return 'continental';
  return 'any';
}

// Normalize a place string to core name tokens (stripping generic admin suffixes for flexible matching)
function normalizePlaceCore(place: string): string {
  return place
    .toLowerCase()
    .replace(/\b(micro-?watershed|sub-?watershed|watershed|sub-?catchment|catchment|river\s+basin|drainage\s+basin|sub-?basin|basin|woredas?|weredas?|woradas?|kebeles?|districts?|zonal|zone|regional\s+state|region|province|state|prefecture)\b/gi, '')
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

export function assessGeographicEligibility(
  article: Article,
  project: ReviewProject
): ArticleGeographicAssessment {
  const pagesText = (article.pages || []).map((p) => p.content || '').join(' ');
  const articleText = [
    article.title || '',
    article.abstract || '',
    article.extractedData?.geographicRegion || '',
    article.fullText || '',
    pagesText,
  ]
    .filter(Boolean)
    .join(' ');

  const { hierarchy: artH, explicitEvidence } = extractPlacesFromText(articleText);
  const detectedScale = getFinestScaleTier(artH);
  const detectedPlaces = flattenHierarchyPlaces(artH);
  const primaryPlaceLabel =
    buildHierarchyChainLabel(artH) ||
    article.extractedData?.geographicRegion ||
    'Unspecified Study Area';

  // Target parsing: prioritize project.geographicEligibility, fall back to context/title only if needed
  const primaryTargetText = (project.geographicEligibility || '').trim();
  const contextFallback =
    project.picoc?.context ||
    project.frameworkFields?.context ||
    project.frameworkFields?.setting ||
    '';
  const targetSource = primaryTargetText || contextFallback || project.title || 'Global';
  const { hierarchy: targetH } = extractPlacesFromText(targetSource, false);
  const { hierarchy: targetWithParentsH } = extractPlacesFromText(targetSource, true);
  const targetScale = getTargetScaleTier(project, targetH);

  // Also capture custom non-dictionary location terms from primaryTargetText (e.g. "Kersa", "Guder")
  const rawTargetChunks = primaryTargetText
    .replace(/\([^)]*\)/g, '')
    .split(/[,;/|]+|\band\b|\bor\b/i)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length >= 3 &&
        !/^(global|globally|worldwide|all|any|studies|study|research|scale|only|tier|level|required|eligible|geography|geographic|country|continental|regional|zonal|woreda|watershed)$/i.test(
          s
        )
    );
  const targetPlaceList = dedupeStrings([
    ...flattenHierarchyPlaces(targetH),
    ...rawTargetChunks,
  ]);

  const targetLower = targetSource.toLowerCase();
  const isGlobalTarget =
    (!project.geographicTargetScale ||
      project.geographicTargetScale === 'any' ||
      project.geographicTargetScale === 'global') &&
    (!primaryTargetText ||
      /\b(global|globally|worldwide|any\s+region|international|all\s+countries|no\s+geographic\s+restriction)\b/i.test(
        primaryTargetText.toLowerCase()
      ));

  const reasonNotesLower = `${article.decisionReason || ''} ${article.screeningNotes || ''} ${article.reviewerNotes || ''}`.toLowerCase();
  const explicitWrongArea = /\b(wrong\s+study\s+area|wrong\s+region|wrong\s+country|outside\s+study\s+area|ineligible\s+region|out\s+of\s+geographic|wrong\s+catchment|wrong\s+woreda|wrong\s+zone|wrong\s+watershed|wrong\s+location)\b/i.test(
    reasonNotesLower
  );

  let verdict: GeographicEligibilityVerdict = 'unspecified_study_area';
  let verdictLabel = 'Unspecified Study Area';
  let isEligible = true;
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

  if (explicitWrongArea) {
    verdict = 'out_of_area_mismatch';
    verdictLabel = 'Out-of-Area Mismatch (Reviewer Flag)';
    isEligible = false;
    confidence = 96;
    interpretiveSummary = `Excluded for wrong study area. Detected: ${primaryPlaceLabel} (${scaleMeta.shortLabel} tier) vs. protocol target (${primaryTargetText || 'Unspecified'}).`;
  } else if (isGlobalTarget) {
    // Global target accepts any geographic scale while reporting exact micro/macro place sensing!
    if (detectedScale === 'unspecified') {
      verdict = 'eligible_global_scope';
      verdictLabel = 'Eligible (Global Scope · Site Unspecified)';
      isEligible = true;
      confidence = 82;
      interpretiveSummary = `Passes Global protocol scope (${primaryTargetText || 'Global'}), though no specific study locality was named in the screened text.`;
    } else {
      verdict = 'eligible_global_scope';
      verdictLabel = `Eligible (Global Scope · ${scaleMeta.shortLabel} Sensed)`;
      isEligible = true;
      confidence = 92;
      interpretiveSummary = `Compatible with Global scope. Sensed ${scaleMeta.shortLabel}-scale study location: ${primaryPlaceLabel}.`;
    }
  } else if (detectedScale === 'unspecified') {
    // No geographic cue detected in article when protocol specifies a target region/place
    if (project.geographicTargetScale && project.geographicTargetScale !== 'any') {
      verdict = 'unspecified_study_area';
      verdictLabel = `Unspecified Study Area (Needs ${targetScaleMeta.shortLabel} Verification)`;
      isEligible = true;
      confidence = 65;
      interpretiveSummary = `No global, continental, country, regional, zonal, woreda, or watershed study place detected in screened text; verify full text against target "${primaryTargetText || targetScaleMeta.shortLabel}".`;
    } else {
      verdict = 'unspecified_study_area';
      verdictLabel = 'Unspecified Study Area';
      isEligible = true;
      confidence = 68;
      interpretiveSummary = `No explicit study location sensed in title/abstract; verify full text against protocol geography (${primaryTargetText || 'Configured target'}).`;
    }
  } else {
    // Non-global specific target + non-empty detected geography in article!
    const articleCoreTokens = dedupeStrings(
      detectedPlaces.map((p) => normalizePlaceCore(p)).filter((t) => t.length >= 3)
    );
    const articleTextLower = articleText.toLowerCase();

    // Check place-level matches against target terms
    const targetSpecificPlaces = targetPlaceList.filter(
      (tp) => !/\b(global|worldwide|international|all)\b/i.test(tp)
    );
    const directMatchedTargets = targetSpecificPlaces.filter((tp) => {
      const tpCore = normalizePlaceCore(tp);
      const tpLow = tp.toLowerCase();
      if (tpCore.length >= 3 && articleCoreTokens.some((ac) => ac === tpCore || ac.includes(tpCore) || tpCore.includes(ac))) {
        return true;
      }
      return tpCore.length >= 4 && articleTextLower.includes(tpCore) || articleTextLower.includes(tpLow);
    });

    // Check same-tier conflict when target is regional/zonal/woreda/watershed/country
    // e.g., target = Amhara Region, article = Tigray Region -> same tier (regional) differs!
    const effectiveTargetTier: GeographicScaleTier =
      targetScale === 'any' ? 'country' : targetScale;
    const targetAtTier = getPlacesAtTier(targetH, effectiveTargetTier);
    const articleAtTier = getPlacesAtTier(artH, effectiveTargetTier);

    const sameTierConflict =
      targetAtTier.length > 0 &&
      articleAtTier.length > 0 &&
      !articleAtTier.some((ap) => {
        const apCore = normalizePlaceCore(ap);
        return targetAtTier.some((tp) => {
          const tpCore = normalizePlaceCore(tp);
          return apCore === tpCore || apCore.includes(tpCore) || tpCore.includes(apCore);
        });
      });

    // Case 1: Strict scale-only target when user selected a specific scale tier (e.g. "Woreda" or "Watershed") without naming a single place, OR named a place + scale
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
      confidence = 91;
      interpretiveSummary = `Incompatible ${GEOGRAPHIC_TIER_META_MAP[effectiveTargetTier].shortLabel}-tier geography: Article studies ${articleAtTier.join(', ')} (${primaryPlaceLabel}), which differs from protocol target (${targetAtTier.join(', ')}).`;
    } else if (directMatchedTargets.length > 0) {
      // Target location matched! Now check whether article scale meets target scale if user explicitly constrained scale
      if (
        userEnforcedScale &&
        enforcedScale &&
        TIER_RANK[detectedScale] < TIER_RANK[enforcedScale]
      ) {
        verdict = 'scale_broader_than_target';
        verdictLabel = `Broader Scale Than Target (${scaleMeta.shortLabel} vs ${targetScaleMeta.shortLabel})`;
        isEligible = false;
        confidence = 84;
        interpretiveSummary = `Article matches parent area (${directMatchedTargets.join(', ')}) at ${scaleMeta.shortLabel} scale, which is broader than the required ${targetScaleMeta.shortLabel} study scale.`;
      } else if (
        targetScale !== 'any' &&
        TIER_RANK[detectedScale] > TIER_RANK[targetScale]
      ) {
        verdict = 'eligible_subscale_contained';
        verdictLabel = `Eligible (${scaleMeta.shortLabel} Contained in ${targetScaleMeta.shortLabel})`;
        isEligible = true;
        confidence = 93;
        interpretiveSummary = `Eligible via hierarchical containment: Sensed ${scaleMeta.shortLabel}-scale site (${primaryPlaceLabel}), which falls within protocol target "${primaryTargetText || directMatchedTargets.join(', ')}".`;
      } else {
        verdict = 'eligible_exact_match';
        verdictLabel = `Eligible (Exact ${scaleMeta.shortLabel} Match)`;
        isEligible = true;
        confidence = 94;
        interpretiveSummary = `Eligible exact match at ${scaleMeta.shortLabel} scale: Article studies ${primaryPlaceLabel}, directly matching "${primaryTargetText || directMatchedTargets.join(', ')}".`;
      }
    } else if (targetSpecificPlaces.length > 0) {
      // Check whether article operates at a BROADER parent geography of the target (e.g. East Africa for Ethiopia target, or Ethiopia for Mecha Woreda target)
      const targetParentPlaces = flattenHierarchyPlaces(targetWithParentsH).map((p) =>
        normalizePlaceCore(p)
      );
      const isBroaderParentOfTarget =
        targetScale !== 'any' &&
        TIER_RANK[detectedScale] < TIER_RANK[targetScale] &&
        articleCoreTokens.some((ac) =>
          targetParentPlaces.some((tp) => tp && (ac === tp || ac.includes(tp) || tp.includes(ac)))
        );

      // Target specifies a place (e.g. Ethiopia, Kenya, Europe, Mecha Woreda) and article has a DIFFERENT specific place
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
        confidence = 85;
        interpretiveSummary = `Broader parent geography (${primaryPlaceLabel} · ${scaleMeta.shortLabel} tier) spans protocol target "${primaryTargetText}", without confirming ${targetScaleMeta.shortLabel}-specific locality or disaggregated data.`;
      } else if (targetHasCountryOrContinent && !articleHasCountryOrContinent && TIER_RANK[detectedScale] >= TIER_RANK.zonal) {
        // Article named a local watershed/zone without stating country/region -> flag as needs verification rather than hard foreign mismatch
        verdict = 'unspecified_study_area';
        verdictLabel = `${scaleMeta.shortLabel} Site Detected (Verify Parent ${targetScaleMeta.shortLabel})`;
        isEligible = true;
        confidence = 72;
        interpretiveSummary = `Detected local ${scaleMeta.shortLabel}-scale place (${primaryPlaceLabel}), but parent country/region is omitted; confirm whether this site lies within "${primaryTargetText}".`;
      } else {
        verdict = 'out_of_area_mismatch';
        verdictLabel = `Out-of-Area Mismatch (${scaleMeta.shortLabel})`;
        isEligible = false;
        confidence = 89;
        interpretiveSummary = `Geographic mismatch: Article studies ${primaryPlaceLabel} (${scaleMeta.shortLabel} tier), outside protocol eligibility target (${primaryTargetText || targetSpecificPlaces.join(', ')}).`;
      }
    } else if (
      project.geographicTargetScale &&
      project.geographicTargetScale !== 'any' &&
      TIER_RANK[detectedScale] < TIER_RANK[project.geographicTargetScale]
    ) {
      verdict = 'scale_broader_than_target';
      verdictLabel = `Scale Mismatch (${scaleMeta.shortLabel} < ${targetScaleMeta.shortLabel})`;
      isEligible = false;
      confidence = 83;
      interpretiveSummary = `Scale requirement not met: Article operates at ${scaleMeta.shortLabel} scale (${primaryPlaceLabel}), whereas protocol enforces ${targetScaleMeta.shortLabel}-level study sites.`;
    } else {
      verdict = 'eligible_exact_match';
      verdictLabel = `Eligible (${scaleMeta.shortLabel})`;
      isEligible = true;
      confidence = 85;
      interpretiveSummary = `Sensed ${scaleMeta.shortLabel}-scale study area (${primaryPlaceLabel}) compatible with protocol geographic configuration.`;
    }
  }

  return {
    detectedScale,
    detectedScaleLabel: scaleMeta.shortLabel,
    detectedPlaces,
    primaryPlaceLabel,
    hierarchy: artH,
    targetScale,
    targetTerms: targetPlaceList,
    verdict,
    verdictLabel,
    isEligible,
    confidence,
    interpretiveSummary,
    evidenceSnippet:
      explicitEvidence.slice(0, 4).join(' · ') ||
      (detectedPlaces.length > 0 ? detectedPlaces.slice(0, 4).join(' · ') : ''),
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

    // Track per-tier place mentions across the hierarchy
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

  // Build interpretive outcome headline, narrative, and Protocol & Framework guidance
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
    interpretiveHeadline = `${sensedCount}/${totalUnique} (${sensedPct}%) unique records spatially sensed · ${eligibleCount} eligible · ${outOfAreaCount + scaleMismatchCount} flagged`;
    const tierSummaryStr = activeTiers
      .map((t) => `${t.shortLabel}: ${t.count}`)
      .join(', ');
    interpretiveNarrative =
      `Geographic sensing across ${totalUnique} unique studies identified ${sensedCount} (${sensedPct}%) records with explicit spatial boundaries (${tierSummaryStr || 'none'}). ` +
      (subscaleContainedCount > 0
        ? `${subscaleContainedCount} micro-scale studies (Watershed/Woreda/Zonal/Regional) passed via hierarchical parent containment. `
        : '') +
      (outOfAreaCount > 0
        ? `${outOfAreaCount} record(s) conflict with protocol target "${project.geographicEligibility || 'Global'}" (PRISMA Wrong Study Area). `
        : 'Zero out-of-area conflicts detected against the active geographic protocol. ') +
      (notableLocalPlaces.length > 0
        ? `Key local sites: ${notableLocalPlaces.join('; ')}.`
        : topCountriesText
        ? `Top countries: ${topCountriesText}.`
        : '');
  }

  const protocolRecommendations: string[] = [];
  if (totalUnique > 0) {
    if (tierCounts.watershed + tierCounts.woreda + tierCounts.zonal > 0) {
      protocolRecommendations.push(
        `Detected ${tierCounts.watershed} Watershed, ${tierCounts.woreda} Woreda, and ${tierCounts.zonal} Zonal study sites — ensure Context/Setting explicitly allows nested local-scale sites under ${project.geographicEligibility || 'target geography'}.`
      );
    }
    if (outOfAreaCount > 0) {
      protocolRecommendations.push(
        `${outOfAreaCount} study/studies fall outside "${project.geographicEligibility}" — verify whether to exclude under PRISMA "Wrong Study Area" or broaden scope to Continental/Global.`
      );
    }
    if (tierCounts.unspecified > 0) {
      protocolRecommendations.push(
        `${tierCounts.unspecified} record(s) have unspecified study area in title/abstract — inspect full text or add local site metadata during extraction.`
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
  if (project.geographicEligibility?.trim()) {
    contextSegments.push(`Target Geographic Scope: ${project.geographicEligibility.trim()}`);
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
    `Geographic Setting: ${project.geographicEligibility || 'Global'} (supports Global, Continental, Country, Regional, Zonal, Woreda, and Watershed study scales).`;

  const suggestedGeoRuleText = `Include empirical studies conducted within ${
    project.geographicEligibility || 'eligible study areas'
  }${
    project.geographicTargetScale && project.geographicTargetScale !== 'any'
      ? ` (target scale: ${GEOGRAPHIC_TIER_META_MAP[project.geographicTargetScale].shortLabel} or nested sub-scale)`
      : ' (including nested Regional, Zonal, Woreda, and Watershed/Catchment localities)'
  }.`;

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
