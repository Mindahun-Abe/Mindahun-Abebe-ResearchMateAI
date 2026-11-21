import React, { useMemo, useRef, useState } from 'react';
import {
  GeographicScaleTier,
  GeographicSelections,
  StudyAreaBoundaryData,
} from '../types';
import {
  ALL_COUNTRY_DROPDOWN_OPTIONS,
  COUNTRY_OPTIONS_BY_CONTINENT,
  CONTINENT_DROPDOWN_OPTIONS,
  REGIONS_BY_COUNTRY,
  WATERSHED_DROPDOWN_OPTIONS,
  WOREDAS_BY_ZONE,
  ZONES_BY_REGION,
  composeGeographicEligibilityString,
} from '../utils/geographicSensing';
import { parseStudyAreaBoundaryFiles } from '../utils/studyAreaFileParser';
import {
  AlertCircle,
  Check,
  FileUp,
  Globe,
  Layers,
  MapPin,
  Trash2,
} from 'lucide-react';

interface GeographicEligibilitySelectorProps {
  geographicEligibility: string;
  geographicTargetScale?: GeographicScaleTier | 'any';
  geographicSelections?: GeographicSelections;
  studyAreaBoundary?: StudyAreaBoundaryData;
  onChange: (patch: {
    geographicEligibility: string;
    geographicTargetScale: GeographicScaleTier | 'any';
    geographicSelections: GeographicSelections;
    studyAreaBoundary?: StudyAreaBoundaryData;
  }) => void;
  compact?: boolean;
}

export const GeographicEligibilitySelector: React.FC<GeographicEligibilitySelectorProps> = ({
  geographicEligibility,
  geographicTargetScale = 'any',
  geographicSelections = {},
  studyAreaBoundary,
  onChange,
  compact = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsingMap, setIsParsingMap] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapFeedback, setMapFeedback] = useState('');

  const sel = geographicSelections || {};

  const countryOptions = useMemo(() => {
    const cont = (sel.continent || '').trim();
    const list =
      cont && COUNTRY_OPTIONS_BY_CONTINENT[cont]
        ? COUNTRY_OPTIONS_BY_CONTINENT[cont]
        : ALL_COUNTRY_DROPDOWN_OPTIONS;
    const fromBoundary = studyAreaBoundary?.extractedByScale?.country || [];
    return Array.from(new Set([...fromBoundary, ...list]));
  }, [sel.continent, studyAreaBoundary]);

  const regionOptions = useMemo(() => {
    const ctry = (sel.country || '').trim();
    const base =
      ctry && REGIONS_BY_COUNTRY[ctry]
        ? REGIONS_BY_COUNTRY[ctry]
        : Object.values(REGIONS_BY_COUNTRY).flat();
    const fromBoundary = studyAreaBoundary?.extractedByScale?.regional || [];
    return Array.from(new Set([...fromBoundary, ...base]));
  }, [sel.country, studyAreaBoundary]);

  const zoneOptions = useMemo(() => {
    const reg = (sel.region || '').trim();
    const base =
      reg && ZONES_BY_REGION[reg]
        ? ZONES_BY_REGION[reg]
        : Object.values(ZONES_BY_REGION).flat();
    const fromBoundary = studyAreaBoundary?.extractedByScale?.zonal || [];
    return Array.from(new Set([...fromBoundary, ...base]));
  }, [sel.region, studyAreaBoundary]);

  const woredaOptions = useMemo(() => {
    const zon = (sel.zone || '').trim();
    const base =
      zon && WOREDAS_BY_ZONE[zon]
        ? WOREDAS_BY_ZONE[zon]
        : Object.values(WOREDAS_BY_ZONE).flat();
    const fromBoundary = studyAreaBoundary?.extractedByScale?.woreda || [];
    return Array.from(new Set([...fromBoundary, ...base]));
  }, [sel.zone, studyAreaBoundary]);

  const watershedOptions = useMemo(() => {
    const fromBoundary = studyAreaBoundary?.extractedByScale?.watershed || [];
    return Array.from(new Set([...fromBoundary, ...WATERSHED_DROPDOWN_OPTIONS]));
  }, [studyAreaBoundary]);

  const emitSelectionUpdate = (
    nextSel: GeographicSelections,
    nextBoundary: StudyAreaBoundaryData | undefined = studyAreaBoundary
  ) => {
    const { displayText, finestScale } = composeGeographicEligibilityString(
      nextSel,
      nextBoundary?.placeNames
    );
    onChange({
      geographicEligibility: displayText,
      geographicTargetScale: finestScale !== 'any' ? finestScale : geographicTargetScale,
      geographicSelections: nextSel,
      studyAreaBoundary: nextBoundary,
    });
  };

  const updateTier = (key: keyof GeographicSelections, val: string) => {
    const nextSel: GeographicSelections = {
      ...sel,
      [key]: val,
    };
    emitSelectionUpdate(nextSel);
  };

  const handleBoundaryFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsParsingMap(true);
    setMapError('');
    setMapFeedback('');
    try {
      const parsed = await parseStudyAreaBoundaryFiles(files);
      const nextSel: GeographicSelections = {
        continent: sel.continent || parsed.extractedByScale?.continental?.[0] || '',
        country: sel.country || parsed.extractedByScale?.country?.[0] || '',
        region: sel.region || parsed.extractedByScale?.regional?.[0] || '',
        zone: sel.zone || parsed.extractedByScale?.zonal?.[0] || '',
        woreda: sel.woreda || parsed.extractedByScale?.woreda?.[0] || '',
        watershed: sel.watershed || parsed.extractedByScale?.watershed?.[0] || '',
        excludedAreas: sel.excludedAreas || '',
      };
      emitSelectionUpdate(nextSel, parsed);
      setMapFeedback(
        `Loaded ${parsed.format}: ${parsed.featureCount} feature(s), ${parsed.placeNames.length} study place name(s) extracted.`
      );
    } catch (err: any) {
      setMapError(err?.message || 'Unable to parse study area file.');
    } finally {
      setIsParsingMap(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const tierGridCols = compact
    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="space-y-3 text-xs">
      {/* Cascading Dropdowns + Custom User Placeholders */}
      <div className={`grid ${tierGridCols} gap-2.5`}>
        {/* 1. Continent */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-300">
            1. Continent / Macro-Region
          </label>
          <select
            value={CONTINENT_DROPDOWN_OPTIONS.includes(sel.continent || '') ? sel.continent : ''}
            onChange={(e) => updateTier('continent', e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-teal-500 rounded-lg px-2 py-1 text-[11px] text-white cursor-pointer focus:outline-none"
          >
            <option value="">-- Select Continent --</option>
            {CONTINENT_DROPDOWN_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={sel.continent || ''}
            onChange={(e) => updateTier('continent', e.target.value)}
            placeholder="Or type continent (e.g., East Africa)..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-lg px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        {/* 2. Country */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-300">
            2. Country (National)
          </label>
          <select
            value={countryOptions.includes(sel.country || '') ? sel.country : ''}
            onChange={(e) => updateTier('country', e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-teal-500 rounded-lg px-2 py-1 text-[11px] text-white cursor-pointer focus:outline-none"
          >
            <option value="">-- Select Country --</option>
            {countryOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={sel.country || ''}
            onChange={(e) => updateTier('country', e.target.value)}
            placeholder="Or type country (e.g., Ethiopia, Kenya)..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-lg px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        {/* 3. Region / State */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-300">
            3. Region / State / Province
          </label>
          <select
            value={regionOptions.includes(sel.region || '') ? sel.region : ''}
            onChange={(e) => updateTier('region', e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-teal-500 rounded-lg px-2 py-1 text-[11px] text-white cursor-pointer focus:outline-none"
          >
            <option value="">-- Select Region / State --</option>
            {regionOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={sel.region || ''}
            onChange={(e) => updateTier('region', e.target.value)}
            placeholder="Or type region (e.g., Amhara Region)..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-lg px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        {/* 4. Zone */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-300">
            4. Zone / Prefecture
          </label>
          <select
            value={zoneOptions.includes(sel.zone || '') ? sel.zone : ''}
            onChange={(e) => updateTier('zone', e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-lg px-2 py-1 text-[11px] text-white cursor-pointer focus:outline-none"
          >
            <option value="">-- Select Zone --</option>
            {zoneOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={sel.zone || ''}
            onChange={(e) => updateTier('zone', e.target.value)}
            placeholder="Or type zone (e.g., East Gojjam Zone)..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        {/* 5. Woreda / District */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-300">
            5. Woreda / District / Kebele
          </label>
          <select
            value={woredaOptions.includes(sel.woreda || '') ? sel.woreda : ''}
            onChange={(e) => updateTier('woreda', e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-lg px-2 py-1 text-[11px] text-white cursor-pointer focus:outline-none"
          >
            <option value="">-- Select Woreda / District --</option>
            {woredaOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={sel.woreda || ''}
            onChange={(e) => updateTier('woreda', e.target.value)}
            placeholder="Or type woreda/district (e.g., Mecha Woreda)..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        {/* 6. Watershed / Basin */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            6. Watershed / Catchment / Basin
          </label>
          <select
            value={watershedOptions.includes(sel.watershed || '') ? sel.watershed : ''}
            onChange={(e) => updateTier('watershed', e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-lg px-2 py-1 text-[11px] text-white cursor-pointer focus:outline-none"
          >
            <option value="">-- Select Watershed / Basin --</option>
            {watershedOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={sel.watershed || ''}
            onChange={(e) => updateTier('watershed', e.target.value)}
            placeholder="Or type watershed/basin (e.g., Debre Mawi Watershed)..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Excluded Areas & Combined Eligibility String */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
        <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-300">
            Explicitly Excluded Countries / Areas (Optional)
          </label>
          <input
            type="text"
            value={sel.excludedAreas || ''}
            onChange={(e) => updateTier('excludedAreas', e.target.value)}
            placeholder="e.g., China, Brazil, Iran (studies from these areas are auto-excluded)..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-lg px-2.5 py-1.5 text-[11px] text-rose-200 placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-300">
            Active Geographic Eligibility Rule (Editable Summary)
          </label>
          <input
            type="text"
            value={geographicEligibility || ''}
            onChange={(e) =>
              onChange({
                geographicEligibility: e.target.value,
                geographicTargetScale,
                geographicSelections: sel,
                studyAreaBoundary,
              })
            }
            placeholder="e.g., Ethiopia, Amhara Region, Debre Mawi Watershed..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder:text-slate-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Study Area Map / Boundary File Importer (.shp, .dbf, .zip, .geojson, .csv, .kml) */}
      <div className="bg-slate-900/80 border border-dashed border-teal-600/50 rounded-xl p-3 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-300">
              <Layers className="w-3.5 h-3.5 text-teal-400" />
              <span>Study Area Map / Boundary File Import (.shp, .dbf, .zip, .geojson, .csv, .kml)</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Upload your GIS boundary (.shp + .dbf, zipped shapefile .zip, GeoJSON, CSV/TSV with coordinates/places, or KML) to extract study area names and bounding box directly into geographic eligibility.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".shp,.dbf,.prj,.zip,.geojson,.json,.csv,.tsv,.kml"
              onChange={(e) => void handleBoundaryFilesSelected(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              disabled={isParsingMap}
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>{isParsingMap ? 'Parsing Boundary...' : 'Upload Map / CSV File'}</span>
            </button>
            {studyAreaBoundary && (
              <button
                type="button"
                onClick={() => {
                  emitSelectionUpdate(sel, undefined);
                  setMapFeedback('');
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/70 text-slate-300 hover:text-rose-300 border border-slate-700 cursor-pointer"
                title="Clear imported study area map file"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {mapError && (
          <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-700/60 text-rose-200 text-[11px] flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>{mapError}</span>
          </div>
        )}

        {mapFeedback && (
          <div className="p-2 rounded-lg bg-emerald-950/50 border border-emerald-700/50 text-emerald-200 text-[11px] flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{mapFeedback}</span>
          </div>
        )}

        {studyAreaBoundary && (
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
              <span className="font-semibold text-white inline-flex items-center gap-1">
                <Globe className="w-3 h-3 text-teal-400" />
                {studyAreaBoundary.fileName} ({studyAreaBoundary.format})
              </span>
              <span className="font-mono text-teal-300">
                {studyAreaBoundary.featureCount} feature(s)
                {studyAreaBoundary.bbox
                  ? ` · BBox [${studyAreaBoundary.bbox[0]}, ${studyAreaBoundary.bbox[1]} → ${studyAreaBoundary.bbox[2]}, ${studyAreaBoundary.bbox[3]}]`
                  : ''}
              </span>
            </div>

            {studyAreaBoundary.placeNames.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-slate-400 mr-1 inline-flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5 text-teal-400" />
                  Sensed Boundary Places:
                </span>
                {studyAreaBoundary.placeNames.slice(0, 14).map((pl) => (
                  <span
                    key={pl}
                    className="px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 text-[10px] font-mono"
                  >
                    {pl}
                  </span>
                ))}
                {studyAreaBoundary.placeNames.length > 14 && (
                  <span className="text-[10px] text-slate-400">
                    +{studyAreaBoundary.placeNames.length - 14} more
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
