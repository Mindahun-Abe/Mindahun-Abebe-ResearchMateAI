import { StudyAreaBoundaryData } from '../types';
import { extractPlacesFromText } from './geographicSensing';

interface ParsedPartialBoundary {
  format: string;
  featureCount: number;
  bbox?: [number, number, number, number];
  placeNames: string[];
  attributeColumns: string[];
  scaleHints: Partial<Record<'continental' | 'country' | 'regional' | 'zonal' | 'woreda' | 'watershed', string[]>>;
}

const ADMIN_COLUMN_HINTS: Array<{
  regex: RegExp;
  scale?: 'continental' | 'country' | 'regional' | 'zonal' | 'woreda' | 'watershed';
}> = [
  { regex: /\b(continent|macro_?reg)\b/i, scale: 'continental' },
  { regex: /\b(country|nation|adm0|name_0|cntry|sovereignt|admin)\b/i, scale: 'country' },
  { regex: /\b(region|state|province|adm1|name_1|r_?name|reg_?name)\b/i, scale: 'regional' },
  { regex: /\b(zone|zonal|prefecture|adm2|name_2|z_?name|dept)\b/i, scale: 'zonal' },
  { regex: /\b(woreda|wereda|worada|district|kebele|adm3|name_3|w_?name|county|municip)\b/i, scale: 'woreda' },
  { regex: /\b(watershed|catchment|basin|subbasin|sub_?watershed|river|hydro|hybas)\b/i, scale: 'watershed' },
  { regex: /\b(name|place|site|location|study_?area|area_?name|label|title)\b/i },
];

const IGNORE_PLACE_VALUE_REGEX =
  /^(null|none|n\/a|na|nan|undefined|unknown|other|true|false|yes|no|polygon|multipolygon|point|linestring|feature|wgs\s*84|-?\d+(?:\.\d+)?)$/i;

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const clean = String(item || '').trim().replace(/\s+/g, ' ');
    if (!clean || clean.length < 2 || clean.length > 90) continue;
    if (IGNORE_PLACE_VALUE_REGEX.test(clean)) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

function mergeBbox(
  a?: [number, number, number, number],
  b?: [number, number, number, number]
): [number, number, number, number] | undefined {
  if (!a) return b;
  if (!b) return a;
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

function addScaleHint(
  hints: ParsedPartialBoundary['scaleHints'],
  scale: 'continental' | 'country' | 'regional' | 'zonal' | 'woreda' | 'watershed',
  val: string
) {
  const clean = val.trim();
  if (!clean || IGNORE_PLACE_VALUE_REGEX.test(clean)) return;
  const list = hints[scale] || [];
  if (!list.some((x) => x.toLowerCase() === clean.toLowerCase())) {
    list.push(clean);
    hints[scale] = list;
  }
}

function collectGeoJsonCoords(coords: any, acc: { minX: number; minY: number; maxX: number; maxY: number; has: boolean }) {
  if (!Array.isArray(coords)) return;
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const x = coords[0];
    const y = coords[1];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (!acc.has) {
        acc.minX = x;
        acc.maxX = x;
        acc.minY = y;
        acc.maxY = y;
        acc.has = true;
      } else {
        acc.minX = Math.min(acc.minX, x);
        acc.maxX = Math.max(acc.maxX, x);
        acc.minY = Math.min(acc.minY, y);
        acc.maxY = Math.max(acc.maxY, y);
      }
    }
    return;
  }
  for (const child of coords) {
    collectGeoJsonCoords(child, acc);
  }
}

function parseGeoJsonText(text: string): ParsedPartialBoundary {
  const parsed = JSON.parse(text);
  const features = Array.isArray(parsed?.features)
    ? parsed.features
    : parsed?.type === 'Feature'
    ? [parsed]
    : parsed?.coordinates
    ? [{ type: 'Feature', geometry: parsed, properties: {} }]
    : [];

  const placeNames: string[] = [];
  const columns = new Set<string>();
  const scaleHints: ParsedPartialBoundary['scaleHints'] = {};
  const acc = { minX: 0, minY: 0, maxX: 0, maxY: 0, has: false };

  for (const feat of features.slice(0, 5000)) {
    if (feat?.geometry?.coordinates) {
      collectGeoJsonCoords(feat.geometry.coordinates, acc);
    }
    const props = feat?.properties;
    if (props && typeof props === 'object') {
      for (const [key, val] of Object.entries(props)) {
        columns.add(key);
        if (typeof val !== 'string' && typeof val !== 'number') continue;
        const strVal = String(val).trim();
        if (!strVal || IGNORE_PLACE_VALUE_REGEX.test(strVal)) continue;

        const hint = ADMIN_COLUMN_HINTS.find((h) => h.regex.test(key));
        if (hint) {
          placeNames.push(strVal);
          if (hint.scale) addScaleHint(scaleHints, hint.scale, strVal);
        }
      }
    }
  }

  return {
    format: 'GeoJSON',
    featureCount: features.length,
    bbox: acc.has ? [acc.minX, acc.minY, acc.maxX, acc.maxY] : undefined,
    placeNames: dedupeStrings(placeNames),
    attributeColumns: Array.from(columns).slice(0, 40),
    scaleHints,
  };
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsvText(text: string, isTsv = false): ParsedPartialBoundary {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { format: 'CSV', featureCount: 0, placeNames: [], attributeColumns: [], scaleHints: {} };
  }

  const delimiter = isTsv || (!lines[0].includes(',') && lines[0].includes('\t')) ? '\t' : ',';
  const headers = splitDelimitedLine(lines[0], delimiter);
  const placeNames: string[] = [];
  const scaleHints: ParsedPartialBoundary['scaleHints'] = {};

  const lonCol = headers.findIndex((h) => /^(lon|lng|long|longitude|x|minx|maxx|easting)$/i.test(h.trim()));
  const latCol = headers.findIndex((h) => /^(lat|latitude|y|miny|maxy|northing)$/i.test(h.trim()));
  const acc = { minX: 0, minY: 0, maxX: 0, maxY: 0, has: false };

  const dataRows = lines.slice(1, 5001);
  for (const line of dataRows) {
    const cols = splitDelimitedLine(line, delimiter);
    if (lonCol >= 0 && latCol >= 0) {
      const x = parseFloat(cols[lonCol]);
      const y = parseFloat(cols[latCol]);
      if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90) {
        if (!acc.has) {
          acc.minX = x;
          acc.maxX = x;
          acc.minY = y;
          acc.maxY = y;
          acc.has = true;
        } else {
          acc.minX = Math.min(acc.minX, x);
          acc.maxX = Math.max(acc.maxX, x);
          acc.minY = Math.min(acc.minY, y);
          acc.maxY = Math.max(acc.maxY, y);
        }
      }
    }

    headers.forEach((h, idx) => {
      const val = (cols[idx] || '').trim();
      if (!val || IGNORE_PLACE_VALUE_REGEX.test(val)) return;
      const hint = ADMIN_COLUMN_HINTS.find((r) => r.regex.test(h));
      if (hint) {
        placeNames.push(val);
        if (hint.scale) addScaleHint(scaleHints, hint.scale, val);
      }
    });
  }

  return {
    format: delimiter === '\t' ? 'TSV' : 'CSV',
    featureCount: dataRows.length,
    bbox: acc.has ? [acc.minX, acc.minY, acc.maxX, acc.maxY] : undefined,
    placeNames: dedupeStrings(placeNames),
    attributeColumns: headers.slice(0, 40),
    scaleHints,
  };
}

function parseKmlText(text: string): ParsedPartialBoundary {
  const placeNames: string[] = [];
  const columns = new Set<string>();
  const scaleHints: ParsedPartialBoundary['scaleHints'] = {};
  const acc = { minX: 0, minY: 0, maxX: 0, maxY: 0, has: false };

  const placemarkCount = (text.match(/<Placemark\b/gi) || []).length || 1;
  for (const m of text.matchAll(/<name>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/name>/gi)) {
    const val = (m[1] || '').trim();
    if (val && !IGNORE_PLACE_VALUE_REGEX.test(val) && !/\.kml$/i.test(val)) {
      placeNames.push(val);
    }
  }

  for (const m of text.matchAll(/<SimpleData\s+name="([^"]+)">\s*([\s\S]*?)\s*<\/SimpleData>/gi)) {
    const key = m[1];
    const val = (m[2] || '').trim();
    columns.add(key);
    const hint = ADMIN_COLUMN_HINTS.find((h) => h.regex.test(key));
    if (hint && val && !IGNORE_PLACE_VALUE_REGEX.test(val)) {
      placeNames.push(val);
      if (hint.scale) addScaleHint(scaleHints, hint.scale, val);
    }
  }

  for (const m of text.matchAll(/<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/gi)) {
    const tokens = (m[1] || '').trim().split(/\s+/);
    for (const tok of tokens.slice(0, 10000)) {
      const parts = tok.split(',');
      if (parts.length >= 2) {
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          if (!acc.has) {
            acc.minX = x;
            acc.maxX = x;
            acc.minY = y;
            acc.maxY = y;
            acc.has = true;
          } else {
            acc.minX = Math.min(acc.minX, x);
            acc.maxX = Math.max(acc.maxX, x);
            acc.minY = Math.min(acc.minY, y);
            acc.maxY = Math.max(acc.maxY, y);
          }
        }
      }
    }
  }

  return {
    format: 'KML',
    featureCount: placemarkCount,
    bbox: acc.has ? [acc.minX, acc.minY, acc.maxX, acc.maxY] : undefined,
    placeNames: dedupeStrings(placeNames),
    attributeColumns: Array.from(columns).slice(0, 40),
    scaleHints,
  };
}

function parseShpBuffer(buf: Uint8Array): ParsedPartialBoundary {
  if (buf.byteLength < 100) {
    return { format: 'Shapefile (.shp)', featureCount: 0, placeNames: [], attributeColumns: [], scaleHints: {} };
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const fileCode = view.getInt32(0, false);
  const bbox: [number, number, number, number] | undefined =
    fileCode === 9994
      ? [
          Number(view.getFloat64(36, true).toFixed(5)),
          Number(view.getFloat64(44, true).toFixed(5)),
          Number(view.getFloat64(52, true).toFixed(5)),
          Number(view.getFloat64(60, true).toFixed(5)),
        ]
      : undefined;

  // Count shape records cleanly starting at byte 100
  let offset = 100;
  let featureCount = 0;
  while (offset + 8 <= buf.byteLength && featureCount < 50000) {
    const contentLenWords = view.getInt32(offset + 4, false);
    if (contentLenWords <= 0) break;
    featureCount++;
    offset += 8 + contentLenWords * 2;
  }

  return {
    format: 'Shapefile (.shp)',
    featureCount: featureCount || 1,
    bbox,
    placeNames: [],
    attributeColumns: [],
    scaleHints: {},
  };
}

function parseDbfBuffer(buf: Uint8Array): ParsedPartialBoundary {
  if (buf.byteLength < 64) {
    return { format: 'Shapefile Attributes (.dbf)', featureCount: 0, placeNames: [], attributeColumns: [], scaleHints: {} };
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const recordCount = view.getUint32(4, true);
  const headerLen = view.getUint16(8, true);
  const recordLen = view.getUint16(10, true);
  if (headerLen < 33 || recordLen < 1 || headerLen > buf.byteLength) {
    return { format: 'Shapefile Attributes (.dbf)', featureCount: 0, placeNames: [], attributeColumns: [], scaleHints: {} };
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const fields: Array<{ name: string; type: string; len: number; offset: number }> = [];
  let pos = 32;
  let fieldOffset = 1; // first byte of each record is deletion flag

  while (pos + 32 <= headerLen && buf[pos] !== 0x0d) {
    const nameBytes = buf.slice(pos, pos + 11);
    const nullIdx = nameBytes.indexOf(0);
    const fieldName = decoder.decode(nullIdx >= 0 ? nameBytes.slice(0, nullIdx) : nameBytes).trim();
    const fieldType = String.fromCharCode(buf[pos + 11]);
    const fieldLen = buf[pos + 16];
    fields.push({ name: fieldName, type: fieldType, len: fieldLen, offset: fieldOffset });
    fieldOffset += fieldLen;
    pos += 32;
  }

  const placeNames: string[] = [];
  const scaleHints: ParsedPartialBoundary['scaleHints'] = {};
  const maxRows = Math.min(recordCount, 4000);

  for (let r = 0; r < maxRows; r++) {
    const rowStart = headerLen + r * recordLen;
    if (rowStart + recordLen > buf.byteLength) break;
    if (buf[rowStart] === 0x2a) continue; // deleted record

    for (const f of fields) {
      if (f.type !== 'C' && f.type !== 'M') continue;
      const slice = buf.slice(rowStart + f.offset, rowStart + f.offset + f.len);
      const val = decoder.decode(slice).replace(/\0/g, '').trim();
      if (!val || IGNORE_PLACE_VALUE_REGEX.test(val)) continue;
      const hint = ADMIN_COLUMN_HINTS.find((h) => h.regex.test(f.name));
      if (hint) {
        placeNames.push(val);
        if (hint.scale) addScaleHint(scaleHints, hint.scale, val);
      }
    }
  }

  return {
    format: 'Shapefile Attributes (.dbf)',
    featureCount: recordCount,
    placeNames: dedupeStrings(placeNames),
    attributeColumns: fields.map((f) => f.name).filter(Boolean),
    scaleHints,
  };
}

async function inflateRawZipEntry(compressed: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const ds = new DecompressionStream('deflate-raw');
    const copy = new Uint8Array(compressed.byteLength);
    copy.set(compressed);
    const stream = new Blob([copy.buffer]).stream().pipeThrough(ds);
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  } catch {
    return null;
  }
}

async function extractZipEntries(buf: Uint8Array): Promise<Array<{ name: string; data: Uint8Array }>> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Locate End of Central Directory (0x06054b50) from end
  let eocdOffset = -1;
  const minScan = Math.max(0, buf.byteLength - 65558);
  for (let i = buf.byteLength - 22; i >= minScan; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return [];

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const entries: Array<{ name: string; data: Uint8Array }> = [];

  for (let i = 0; i < totalEntries && cdOffset + 46 <= buf.byteLength; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);
    const fileName = decoder.decode(buf.slice(cdOffset + 46, cdOffset + 46 + nameLen));
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (!fileName || fileName.endsWith('/') || localHeaderOffset + 30 > buf.byteLength) continue;
    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;

    const lNameLen = view.getUint16(localHeaderOffset + 26, true);
    const lExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buf.byteLength) continue;

    const rawSlice = buf.slice(dataStart, dataEnd);
    if (compressionMethod === 0) {
      entries.push({ name: fileName, data: rawSlice });
    } else if (compressionMethod === 8) {
      const inflated = await inflateRawZipEntry(rawSlice);
      if (inflated) entries.push({ name: fileName, data: inflated });
    }
  }

  return entries;
}

async function parseSingleEntry(name: string, bytes: Uint8Array): Promise<ParsedPartialBoundary | null> {
  const lower = name.toLowerCase();
  const textDecoder = new TextDecoder('utf-8', { fatal: false });

  if (lower.endsWith('.shp')) {
    return parseShpBuffer(bytes);
  }
  if (lower.endsWith('.dbf')) {
    return parseDbfBuffer(bytes);
  }
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
    return parseGeoJsonText(textDecoder.decode(bytes));
  }
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    return parseCsvText(textDecoder.decode(bytes), lower.endsWith('.tsv'));
  }
  if (lower.endsWith('.kml')) {
    return parseKmlText(textDecoder.decode(bytes));
  }
  return null;
}

export async function parseStudyAreaBoundaryFiles(fileList: FileList | File[]): Promise<StudyAreaBoundaryData> {
  const files = Array.from(fileList || []);
  if (files.length === 0) {
    throw new Error('Please choose at least one study area file (.shp, .dbf, .zip, .geojson, .csv, or .kml).');
  }

  const partials: ParsedPartialBoundary[] = [];
  const fileNames: string[] = [];

  for (const file of files) {
    fileNames.push(file.name);
    const lower = file.name.toLowerCase();
    const ab = await file.arrayBuffer();
    const bytes = new Uint8Array(ab);

    if (lower.endsWith('.zip')) {
      const entries = await extractZipEntries(bytes);
      if (entries.length === 0) {
        throw new Error(`Could not read shapefile/GIS entries inside ${file.name}.`);
      }
      for (const entry of entries) {
        const parsed = await parseSingleEntry(entry.name, entry.data);
        if (parsed) partials.push({ ...parsed, format: `Shapefile ZIP (${parsed.format})` });
      }
    } else {
      const parsed = await parseSingleEntry(file.name, bytes);
      if (parsed) {
        partials.push(parsed);
      } else if (lower.endsWith('.prj')) {
        // Optional projection companion file: acknowledge cleanly
        partials.push({
          format: 'Projection (.prj)',
          featureCount: 0,
          placeNames: [],
          attributeColumns: [],
          scaleHints: {},
        });
      }
    }
  }

  let bbox: [number, number, number, number] | undefined;
  let maxFeatures = 0;
  const allPlaces: string[] = [];
  const allCols = new Set<string>();
  const formats = new Set<string>();
  const mergedScaleHints: NonNullable<StudyAreaBoundaryData['extractedByScale']> = {};

  for (const p of partials) {
    if (p.format && !p.format.includes('Projection')) formats.add(p.format);
    if (p.bbox) bbox = mergeBbox(bbox, p.bbox);
    if (p.featureCount > maxFeatures) maxFeatures = p.featureCount;
    p.placeNames.forEach((n) => allPlaces.push(n));
    p.attributeColumns.forEach((c) => allCols.add(c));
    (['continental', 'country', 'regional', 'zonal', 'woreda', 'watershed'] as const).forEach((scale) => {
      const vals = p.scaleHints[scale] || [];
      if (vals.length > 0) {
        mergedScaleHints[scale] = dedupeStrings([...(mergedScaleHints[scale] || []), ...vals]);
      }
    });
  }

  // Enrich scale classification via geographic gazetteer
  const dedupedPlaces = dedupeStrings(allPlaces);
  if (dedupedPlaces.length > 0) {
    const { hierarchy } = extractPlacesFromText(dedupedPlaces.join(', '), false);
    if (hierarchy.continental?.length) {
      mergedScaleHints.continental = dedupeStrings([...(mergedScaleHints.continental || []), ...hierarchy.continental]);
    }
    if (hierarchy.country?.length) {
      mergedScaleHints.country = dedupeStrings([...(mergedScaleHints.country || []), ...hierarchy.country]);
    }
    if (hierarchy.regional?.length) {
      mergedScaleHints.regional = dedupeStrings([...(mergedScaleHints.regional || []), ...hierarchy.regional]);
    }
    if (hierarchy.zonal?.length) {
      mergedScaleHints.zonal = dedupeStrings([...(mergedScaleHints.zonal || []), ...hierarchy.zonal]);
    }
    if (hierarchy.woreda?.length) {
      mergedScaleHints.woreda = dedupeStrings([...(mergedScaleHints.woreda || []), ...hierarchy.woreda]);
    }
    if (hierarchy.watershed?.length) {
      mergedScaleHints.watershed = dedupeStrings([...(mergedScaleHints.watershed || []), ...hierarchy.watershed]);
    }
  }

  const formatLabel = Array.from(formats).join(' + ') || 'Boundary File';
  const bboxText = bbox
    ? `BBox [${bbox[0].toFixed(3)}, ${bbox[1].toFixed(3)} → ${bbox[2].toFixed(3)}, ${bbox[3].toFixed(3)}]`
    : '';
  const summaryText = [
    `${fileNames.join(' + ')} (${formatLabel})`,
    `${maxFeatures || dedupedPlaces.length || 1} features`,
    bboxText,
    dedupedPlaces.length > 0 ? `Places: ${dedupedPlaces.slice(0, 8).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    fileName: fileNames.join(' + '),
    format: formatLabel,
    featureCount: maxFeatures || (dedupedPlaces.length > 0 ? dedupedPlaces.length : 1),
    bbox,
    placeNames: dedupedPlaces,
    extractedByScale: mergedScaleHints,
    attributeColumns: Array.from(allCols).slice(0, 40),
    uploadedAt: new Date().toISOString(),
    summaryText,
  };
}
